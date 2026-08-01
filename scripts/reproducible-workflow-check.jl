using CSV
using DataFrames
using Dates
using SHA
using Statistics
using TOML
using Test

file_sha256(path) = open(path, "r") do io
    bytes2hex(sha256(io))
end

portable_relpath(path, root) = replace(relpath(path, root), '\\' => '/')

const SCHEMA_TYPES = Dict(
    "String" => String,
    "Int" => Int,
    "Float64" => Float64,
    "Bool" => Bool,
)

function read_trials(path, schema)
    trial_schema = schema["trials"]
    types = Dict(
        Symbol(name) => SCHEMA_TYPES[type_name]
        for (name, type_name) in trial_schema["types"]
    )
    CSV.read(
        path,
        DataFrame;
        types,
        missingstring = trial_schema["missing_strings"],
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

        keys = collect(zip(data.participant_id, data.trial))
        allunique(keys) || push!(problems, "participant_idとtrialの組が重複しています")
    end

    isempty(problems) || throw(ArgumentError(join(problems, "\n")))
    true
end

function workflow_fingerprint(paths)
    component_hashes = file_sha256.(paths)
    bytes2hex(sha256(codeunits(join(component_hashes, "\n"))))[1:12]
end

function write_immutable_csv(path, table)
    io = IOBuffer()
    CSV.write(io, table)
    payload = take!(io)

    if isfile(path)
        read(path) == payload || throw(ArgumentError(
            "同じrun IDの成果物が異なる内容を持っています: $(basename(path))",
        ))
        return :reused
    end

    open(path, "w") do output
        write(output, payload)
    end
    :created
end

function run_workflow(root; started_utc = "2026-08-02T00:00:00Z")
    raw_path = joinpath(root, "data", "raw", "trials.csv")
    schema_path = joinpath(root, "metadata", "schema.toml")
    dictionary_path = joinpath(root, "metadata", "data_dictionary.csv")
    project_path = joinpath(root, "Project.toml")
    manifest_path = joinpath(root, "Manifest.toml")
    code_path = joinpath(root, "code", "run_analysis.jl")

    schema = TOML.parsefile(schema_path)
    raw_before = file_sha256(raw_path)
    data = read_trials(raw_path, schema)
    validate_trials(data, schema)

    observed = dropmissing(data, :rt_ms)
    summary = combine(
        groupby(observed, :condition),
        nrow => :n,
        :rt_ms => mean => :mean_rt_ms,
    )
    sort!(summary, :condition)

    run_id = workflow_fingerprint([
        raw_path,
        schema_path,
        dictionary_path,
        project_path,
        manifest_path,
        code_path,
    ])
    output_dir = joinpath(root, "output", "tables")
    run_dir = joinpath(root, "metadata", "runs")
    mkpath(output_dir)
    mkpath(run_dir)

    output_path = joinpath(output_dir, "condition_summary--$(run_id).csv")
    output_status = write_immutable_csv(output_path, summary)
    raw_after = file_sha256(raw_path)

    stamp = replace(started_utc, r"[-:]" => "")
    metadata_path = joinpath(run_dir, "run--$(stamp)--$(run_id).toml")
    metadata = Dict(
        "run" => Dict(
            "id" => run_id,
            "started_utc" => started_utc,
            "julia_version" => string(VERSION),
        ),
        "inputs" => Dict(
            "trials_path" => portable_relpath(raw_path, root),
            "trials_sha256" => raw_before,
            "schema_path" => portable_relpath(schema_path, root),
        ),
        "environment" => Dict(
            "project_sha256" => file_sha256(project_path),
            "manifest_sha256" => file_sha256(manifest_path),
        ),
        "outputs" => Dict(
            "summary_path" => portable_relpath(output_path, root),
            "summary_sha256" => file_sha256(output_path),
        ),
    )
    open(metadata_path, "w") do io
        TOML.print(io, metadata; sorted = true)
    end

    (; data, summary, run_id, output_path, output_status, metadata_path,
       raw_unchanged = raw_before == raw_after)
end

function build_fixture(root)
    for directory in [
        joinpath(root, "code"),
        joinpath(root, "data", "raw"),
        joinpath(root, "metadata"),
    ]
        mkpath(directory)
    end

    trials = DataFrame(
        participant_id = ["P01", "P01", "P02", "P02", "P03", "P03"],
        trial = [1, 2, 1, 2, 1, 2],
        condition = ["control", "treatment", "control", "treatment", "control", "treatment"],
        rt_ms = Union{Missing, Float64}[500, 540, 520, missing, 510, 560],
        correct = [true, true, true, false, true, true],
    )
    CSV.write(joinpath(root, "data", "raw", "trials.csv"), trials)

    dictionary = DataFrame(
        variable = ["participant_id", "trial", "condition", "rt_ms", "correct"],
        meaning = ["匿名参加者ID", "参加者内試行番号", "実験条件", "反応時間", "正答"],
        unit = ["none", "count", "category", "ms", "boolean"],
        role = ["key", "key", "predictor", "outcome", "quality"],
    )
    CSV.write(joinpath(root, "metadata", "data_dictionary.csv"), dictionary)

    schema = Dict(
        "trials" => Dict(
            "columns" => ["participant_id", "trial", "condition", "rt_ms", "correct"],
            "types" => Dict(
                "participant_id" => "String",
                "trial" => "Int",
                "condition" => "String",
                "rt_ms" => "Float64",
                "correct" => "Bool",
            ),
            "missing_strings" => ["", "NA"],
            "allowed_condition" => ["control", "treatment"],
            "rt_ms_min" => 100.0,
            "rt_ms_max" => 3000.0,
            "primary_key" => ["participant_id", "trial"],
        ),
    )
    open(joinpath(root, "metadata", "schema.toml"), "w") do io
        TOML.print(io, schema; sorted = true)
    end

    write(
        joinpath(root, "Project.toml"),
        "[deps]\nCSV = \"336ed68f-0bac-5ca0-87d4-7b16caf5d00b\"\n",
    )
    write(
        joinpath(root, "Manifest.toml"),
        "julia_version = \"1.12.6\"\nmanifest_format = \"2.0\"\nproject_hash = \"fixture\"\n",
    )
    write(
        joinpath(root, "code", "run_analysis.jl"),
        "const ROOT = normpath(joinpath(@__DIR__, \"..\"))\n",
    )
    trials
end

mktempdir() do root
    source = build_fixture(root)
    schema = TOML.parsefile(joinpath(root, "metadata", "schema.toml"))

    @testset "再現可能な研究workflow" begin
        data = read_trials(joinpath(root, "data", "raw", "trials.csv"), schema)
        @test validate_trials(data, schema)
        @test propertynames(data) == [:participant_id, :trial, :condition, :rt_ms, :correct]
        @test eltype(data.participant_id) <: AbstractString
        @test eltype(data.trial) <: Integer
        @test eltype(data.rt_ms) <: Union{Missing, Float64}
        @test eltype(data.correct) <: Bool

        bad_level = copy(data)
        bad_level.condition[1] = "unknown"
        @test_throws ArgumentError validate_trials(bad_level, schema)

        duplicate_key = vcat(data, data[1:1, :])
        @test_throws ArgumentError validate_trials(duplicate_key, schema)

        bad_range = copy(data)
        bad_range.rt_ms[1] = 10.0
        @test_throws ArgumentError validate_trials(bad_range, schema)

        elsewhere = mktempdir()
        try
            first_run = cd(elsewhere) do
                run_workflow(root)
            end
            second_run = cd(elsewhere) do
                run_workflow(root)
            end

            @test first_run.output_status == :created
            @test second_run.output_status == :reused
            @test first_run.run_id == second_run.run_id
            @test first_run.raw_unchanged && second_run.raw_unchanged
            @test first_run.summary.condition == ["control", "treatment"]
            @test first_run.summary.n == [3, 2]
            @test first_run.summary.mean_rt_ms == [510.0, 550.0]
            @test basename(first_run.output_path) == "condition_summary--$(first_run.run_id).csv"

            run_metadata = TOML.parsefile(first_run.metadata_path)
            @test run_metadata["inputs"]["trials_path"] == "data/raw/trials.csv"
            @test run_metadata["outputs"]["summary_path"] ==
                  "output/tables/condition_summary--$(first_run.run_id).csv"
            @test run_metadata["inputs"]["trials_sha256"] ==
                  file_sha256(joinpath(root, "data", "raw", "trials.csv"))
            @test !occursin(root, read(first_run.metadata_path, String))
            @test !occursin(elsewhere, read(first_run.metadata_path, String))
        finally
            rm(elsewhere; recursive = true, force = true)
        end

        @test isequal(
            source,
            CSV.read(joinpath(root, "data", "raw", "trials.csv"), DataFrame),
        )
    end

    result = run_workflow(root)
    println((
        root_anchor = "@__DIR__",
        run_id = result.run_id,
        types = (
            participant_id = string(eltype(result.data.participant_id)),
            trial = string(eltype(result.data.trial)),
            rt_ms = string(eltype(result.data.rt_ms)),
            correct = string(eltype(result.data.correct)),
        ),
        means = result.summary.mean_rt_ms,
        raw_unchanged = result.raw_unchanged,
        output_status = result.output_status,
    ))
end

println("reproducible workflow checks passed")
