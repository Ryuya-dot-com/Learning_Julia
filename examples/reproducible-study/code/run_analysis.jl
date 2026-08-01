import Pkg

const PROJECT_ROOT = normpath(joinpath(@__DIR__, ".."))
Pkg.activate(PROJECT_ROOT; io = devnull)

using CSV
using DataFrames
using Dates
using SHA
using Statistics
using TOML

const TYPE_MAP = Dict(
    "String" => String,
    "Int" => Int,
    "Float64" => Float64,
    "Bool" => Bool,
)

file_sha256(path) = open(path, "r") do io
    bytes2hex(sha256(io))
end

portable_relpath(path) = replace(relpath(path, PROJECT_ROOT), '\\' => '/')

function project_input_path(relative_path)
    isabspath(relative_path) && throw(ArgumentError(
        "input_pathはproject rootからの相対pathにしてください",
    ))
    normalized = normpath(joinpath(PROJECT_ROOT, split(replace(relative_path, '\\' => '/'), '/')...))
    portable = portable_relpath(normalized)
    (portable == ".." || startswith(portable, "../")) && throw(ArgumentError(
        "input_pathはproject外を参照できません",
    ))
    isfile(normalized) || throw(ArgumentError(
        "study.tomlが指定した入力fileがありません: $portable",
    ))

    resolved = realpath(normalized)
    resolved_portable = replace(relpath(resolved, realpath(PROJECT_ROOT)), '\\' => '/')
    (resolved_portable == ".." || startswith(resolved_portable, "../")) &&
        throw(ArgumentError(
            "input_pathの実体はproject外を参照できません",
        ))
    resolved
end

function read_trials(path, schema)
    spec = schema["trials"]
    types = Dict(
        Symbol(name) => TYPE_MAP[type_name]
        for (name, type_name) in spec["types"]
    )
    CSV.read(
        path,
        DataFrame;
        types,
        missingstring = spec["missing_strings"],
    )
end

function validate_trials(data, schema)
    spec = schema["trials"]
    expected = Symbol.(spec["columns"])
    problems = String[]

    propertynames(data) == expected || push!(
        problems,
        "列名または列順がschemaと一致しません",
    )

    if all(name -> name in propertynames(data), expected)
        allowed = Set(spec["allowed_condition"])
        all(x -> !ismissing(x) && x in allowed, data.condition) || push!(
            problems,
            "conditionに許可されていない値または欠測があります",
        )
        all(x -> !ismissing(x) && x >= 1, data.trial) || push!(
            problems,
            "trialは1以上の整数である必要があります",
        )
        all(
            x -> ismissing(x) || spec["rt_ms_min"] <= x <= spec["rt_ms_max"],
            data.rt_ms,
        ) || push!(problems, "rt_msが許容範囲外です")
        all(x -> !ismissing(x), data.correct) || push!(
            problems,
            "correctに欠測があります",
        )
        all(row -> !row.correct || !ismissing(row.rt_ms), eachrow(data)) || push!(
            problems,
            "correct=trueの行ではrt_msが必要です",
        )

        keys = collect(zip(data.participant_id, data.trial))
        allunique(keys) || push!(
            problems,
            "participant_idとtrialの組が重複しています",
        )
    end

    isempty(problems) || throw(ArgumentError(join(problems, "\n")))
    true
end

function workflow_fingerprint(paths)
    component_hashes = file_sha256.(paths)
    bytes2hex(sha256(codeunits(join(component_hashes, "\n"))))[1:12]
end

function write_immutable(path, payload)
    mkpath(dirname(path))
    if isfile(path)
        read(path) == payload || throw(ArgumentError(
            "同じrun IDの成果物が異なる内容を持っています: $(basename(path))",
        ))
        return :reused
    end

    temporary, io = mktemp(dirname(path))
    try
        write(io, payload)
        close(io)
        mv(temporary, path)
    finally
        isopen(io) && close(io)
        isfile(temporary) && rm(temporary; force = true)
    end
    :created
end

function csv_payload(table)
    io = IOBuffer()
    CSV.write(io, table)
    take!(io)
end

function toml_payload(value)
    io = IOBuffer()
    TOML.print(io, value; sorted = true)
    take!(io)
end

function main()
    project_path = joinpath(PROJECT_ROOT, "Project.toml")
    manifest_path = joinpath(PROJECT_ROOT, "Manifest.toml")
    dictionary_path = joinpath(PROJECT_ROOT, "metadata", "data_dictionary.csv")
    schema_path = joinpath(PROJECT_ROOT, "metadata", "schema.toml")
    study_path = joinpath(PROJECT_ROOT, "metadata", "study.toml")
    code_path = @__FILE__

    normpath(Base.active_project()) == normpath(project_path) || error(
        "templateのProject.tomlがactiveではありません",
    )
    isfile(manifest_path) || error(
        "Manifest.tomlがありません。READMEの初回準備を実行してください",
    )

    study = TOML.parsefile(study_path)["study"]
    input_path = project_input_path(study["input_path"])
    input_before = file_sha256(input_path)
    schema = TOML.parsefile(schema_path)
    data = read_trials(input_path, schema)
    validate_trials(data, schema)

    observed = dropmissing(data, :rt_ms)
    summary = combine(
        groupby(observed, :condition),
        nrow => :n,
        :rt_ms => mean => :mean_rt_ms,
        :rt_ms => std => :sd_rt_ms,
    )
    sort!(summary, :condition)

    run_id = workflow_fingerprint([
        input_path,
        study_path,
        schema_path,
        dictionary_path,
        project_path,
        manifest_path,
        code_path,
    ])
    derived_path = joinpath(
        PROJECT_ROOT,
        "data",
        "derived",
        "analysis_trials--$(run_id).csv",
    )
    summary_path = joinpath(
        PROJECT_ROOT,
        "output",
        "tables",
        "condition_summary--$(run_id).csv",
    )
    derived_status = write_immutable(derived_path, csv_payload(data))
    summary_status = write_immutable(summary_path, csv_payload(summary))

    input_after = file_sha256(input_path)
    input_before == input_after || error("入力fileが実行中に変更されました")

    started = now(UTC)
    started_utc = string(started, "Z")
    stamp = replace(
        started_utc,
        "-" => "",
        ":" => "",
        "." => "",
        "T" => "",
        "Z" => "",
    )
    metadata_path = joinpath(
        PROJECT_ROOT,
        "metadata",
        "runs",
        "run--$(stamp)--$(run_id).toml",
    )
    metadata = Dict(
        "run" => Dict(
            "id" => run_id,
            "started_utc" => started_utc,
            "julia_version" => string(VERSION),
            "threads" => Threads.nthreads(),
        ),
        "inputs" => Dict(
            "study_id" => study["id"],
            "input_classification" => study["input_classification"],
            "trials_path" => portable_relpath(input_path),
            "trials_sha256" => input_before,
            "study_path" => portable_relpath(study_path),
            "study_sha256" => file_sha256(study_path),
            "schema_path" => portable_relpath(schema_path),
            "schema_sha256" => file_sha256(schema_path),
            "dictionary_path" => portable_relpath(dictionary_path),
            "dictionary_sha256" => file_sha256(dictionary_path),
        ),
        "environment" => Dict(
            "project_sha256" => file_sha256(project_path),
            "manifest_sha256" => file_sha256(manifest_path),
            "analysis_code_sha256" => file_sha256(code_path),
        ),
        "outputs" => Dict(
            "derived_path" => portable_relpath(derived_path),
            "derived_sha256" => file_sha256(derived_path),
            "summary_path" => portable_relpath(summary_path),
            "summary_sha256" => file_sha256(summary_path),
        ),
        "quality" => Dict(
            "input_rows" => nrow(data),
            "missing_rt_ms" => count(ismissing, data.rt_ms),
            "schema_valid" => true,
            "input_unchanged" => true,
        ),
    )
    metadata_status = write_immutable(metadata_path, toml_payload(metadata))

    println(summary)
    println((
        run_id,
        derived = portable_relpath(derived_path),
        summary = portable_relpath(summary_path),
        metadata = portable_relpath(metadata_path),
        status = (derived_status, summary_status, metadata_status),
    ))
    nothing
end

main()
