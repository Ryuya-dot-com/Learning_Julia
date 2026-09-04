const PROJECT_ROOT = realpath(normpath(joinpath(@__DIR__, "..")))
const PROJECT_TOML = joinpath(PROJECT_ROOT, "Project.toml")
const MANIFEST_TOML = joinpath(PROJECT_ROOT, "Manifest.toml")
const ACTIVE_PROJECT = something(Base.active_project(), "")
(!isempty(ACTIVE_PROJECT) && isfile(ACTIVE_PROJECT) &&
 realpath(ACTIVE_PROJECT) == realpath(PROJECT_TOML)) || error(
    "このprojectを指定して実行してください: julia --project=$(PROJECT_ROOT) $(@__FILE__)",
)

using CSV
using DataFrames
using Dates
using SHA
using TOML

const INPUT_PATH = joinpath(PROJECT_ROOT, "data", "example", "trials_synthetic.csv")
const R_SCRIPT_PATH = joinpath(PROJECT_ROOT, "code", "summarize_trials.R")

file_sha256(path) = open(path, "r") do io
    bytes2hex(sha256(io))
end

function write_immutable(path, payload)
    mkpath(dirname(path))
    if isfile(path)
        read(path) == payload || error("既存の同名成果物と内容が異なります: $path")
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

portable_relpath(path) = replace(relpath(path, PROJECT_ROOT), '\\' => '/')

function project_artifact_path(relative_path)
    isabspath(relative_path) && error("R成果物pathはproject内の相対pathにしてください")
    path = normpath(joinpath(
        PROJECT_ROOT,
        split(replace(relative_path, '\\' => '/'), '/')...,
    ))
    portable = portable_relpath(path)
    (portable == ".." || startswith(portable, "../")) && error(
        "R成果物pathはproject外を参照できません: $relative_path",
    )
    isfile(path) || error("記録済みのR成果物がありません: $relative_path")
    resolved = realpath(path)
    resolved_portable = portable_relpath(resolved)
    (resolved_portable == ".." || startswith(resolved_portable, "../")) && error(
        "R成果物pathの実体はproject外を参照できません: $relative_path",
    )
    resolved
end

function validated_summary(path)
    summary = CSV.read(
        path,
        DataFrame;
        types = Dict(
            :condition => String,
            :n => Int,
            :mean_rt_ms => Float64,
            :sd_rt_ms => Float64,
        ),
        strict = true,
    )
    names(summary) == ["condition", "n", "mean_rt_ms", "sd_rt_ms"] ||
        error("R出力の列が契約と一致しません")
    summary.condition == ["control", "treatment"] ||
        error("R出力のconditionが契約と一致しません")
    summary.n == [3, 2] || error("R出力の件数が契約と一致しません")
    summary.mean_rt_ms == [510.0, 550.0] ||
        error("R出力の平均が基準値と一致しません")
    summary
end

function verify_fields(actual, expected, section)
    for (key, expected_value) in expected
        get(actual, key, nothing) == expected_value || error(
            "R実行記録の$(section).$(key)が現在の実行条件と一致しません",
        )
    end
end

function verify_record(record_path, run_id, r_version, r_platform)
    record = TOML.parsefile(record_path)
    paths = record["outputs"]["artifact_paths"]
    hashes = record["outputs"]["artifact_sha256"]
    length(paths) == length(hashes) || error("R成果物のpathとhashの件数が一致しません")
    for (relative_path, expected_hash) in zip(paths, hashes)
        path = project_artifact_path(relative_path)
        file_sha256(path) == expected_hash || error(
            "記録済みのR成果物が変更されています: $relative_path",
        )
    end
    verify_fields(record["bridge"], Dict(
        "run_id" => run_id,
        "driver" => "Julia",
        "engine" => "Rscript --vanilla",
        "julia_version" => string(VERSION),
        "r_version" => r_version,
        "r_platform" => r_platform,
        "os" => string(Sys.KERNEL),
        "arch" => string(Sys.ARCH),
    ), "bridge")
    verify_fields(record["commands"], Dict(
        "driver" => "julia --project=. code/run_r_bridge.jl",
        "external" => "Rscript --vanilla code/summarize_trials.R data/example/trials_synthetic.csv output/r/$run_id/condition-summary.csv",
    ), "commands")
    verify_fields(record["inputs"], Dict(
        "data_path" => "data/example/trials_synthetic.csv",
        "data_sha256" => file_sha256(INPUT_PATH),
        "r_script_path" => "code/summarize_trials.R",
        "r_script_sha256" => file_sha256(R_SCRIPT_PATH),
        "driver_path" => "code/run_r_bridge.jl",
        "driver_sha256" => file_sha256(@__FILE__),
        "project_path" => "Project.toml",
        "project_sha256" => file_sha256(PROJECT_TOML),
        "manifest_path" => "Manifest.toml",
        "manifest_sha256" => file_sha256(MANIFEST_TOML),
    ), "inputs")
    record
end

function main()
    rscript = Sys.which("Rscript")
    isnothing(rscript) && error(
        "Rscriptが見つかりません。Rを導入し、新しいterminalで再実行してください",
    )
    isfile(INPUT_PATH) || error("入力CSVがありません: $INPUT_PATH")
    isfile(R_SCRIPT_PATH) || error("R scriptがありません: $R_SCRIPT_PATH")

    r_details = strip.(split(strip(read(
        Cmd([
            rscript,
            "--vanilla",
            "-e",
            raw"cat(R.version.string, '\n', R.version$platform, sep = '')",
        ]),
        String,
    )), '\n'))
    length(r_details) == 2 || error("Rのversionとplatformを取得できませんでした")
    r_version, r_platform = r_details
    fingerprints = [
        file_sha256(INPUT_PATH),
        file_sha256(R_SCRIPT_PATH),
        file_sha256(@__FILE__),
        file_sha256(PROJECT_TOML),
        file_sha256(MANIFEST_TOML),
        r_version,
        r_platform,
        string(VERSION),
        string(Sys.KERNEL),
        string(Sys.ARCH),
    ]
    run_id = bytes2hex(sha256(codeunits(join(fingerprints, "\n"))))[1:12]
    run_directory = joinpath(PROJECT_ROOT, "output", "r", run_id)
    output_path = joinpath(run_directory, "condition-summary.csv")
    stdout_path = joinpath(run_directory, "r-stdout.log")
    stderr_path = joinpath(run_directory, "r-stderr.log")
    record_path = joinpath(
        PROJECT_ROOT,
        "metadata",
        "runs",
        "r-bridge--$run_id.toml",
    )

    if isfile(record_path)
        record = verify_record(record_path, run_id, r_version, r_platform)
        summary_path = project_artifact_path(record["outputs"]["summary_path"])
        println(validated_summary(summary_path))
        println((run_id, output_status = :reused, record_status = :reused))
        return
    end
    ispath(run_directory) && error(
        "実行記録のないR出力directoryがあります。内容を確認してから移動または削除してください: $run_directory",
    )

    mkpath(run_directory)
    summary = try
        command = Cmd([
            rscript,
            "--vanilla",
            R_SCRIPT_PATH,
            INPUT_PATH,
            output_path,
        ])
        process = open(stdout_path, "w") do stdout
            open(stderr_path, "w") do stderr
                run(pipeline(ignorestatus(command); stdout, stderr))
            end
        end
        success(process) || error("Rscriptが失敗しました。r-stderr.logを確認してください")
        isfile(output_path) || error("Rscriptが出力CSVを作成しませんでした")
        validated_summary(output_path)
    catch exception
        failure = Dict(
            "failure" => Dict(
                "status" => "failed",
                "run_id" => run_id,
                "failed_utc" => string(now(UTC), "Z"),
                "error_type" => string(typeof(exception)),
                "message" => sprint(showerror, exception),
                "stacktrace" => sprint(showerror, exception, catch_backtrace()),
            ),
            "available_log_paths" => [
                portable_relpath(path)
                for path in (stdout_path, stderr_path) if isfile(path)
            ],
        )
        failure_io = IOBuffer()
        TOML.print(failure_io, failure; sorted = true)
        failure_path = joinpath(run_directory, "failure.toml")
        try
            write_immutable(failure_path, take!(failure_io))
        catch record_exception
            @error "R失敗記録を保存できませんでした" failure_path exception = record_exception
        end
        @error "R実行に失敗しました。途中成果物、log、failure.tomlを確認してください" run_directory
        rethrow()
    end

    artifacts = [output_path, stdout_path, stderr_path]

    record = Dict(
        "bridge" => Dict(
            "run_id" => run_id,
            "driver" => "Julia",
            "engine" => "Rscript --vanilla",
            "julia_version" => string(VERSION),
            "r_version" => r_version,
            "r_platform" => r_platform,
            "os" => string(Sys.KERNEL),
            "arch" => string(Sys.ARCH),
            "completed_utc" => string(now(UTC), "Z"),
        ),
        "commands" => Dict(
            "driver" => "julia --project=. code/run_r_bridge.jl",
            "external" => "Rscript --vanilla code/summarize_trials.R data/example/trials_synthetic.csv output/r/$run_id/condition-summary.csv",
        ),
        "inputs" => Dict(
            "data_path" => "data/example/trials_synthetic.csv",
            "data_sha256" => file_sha256(INPUT_PATH),
            "r_script_path" => "code/summarize_trials.R",
            "r_script_sha256" => file_sha256(R_SCRIPT_PATH),
            "driver_path" => "code/run_r_bridge.jl",
            "driver_sha256" => file_sha256(@__FILE__),
            "project_path" => "Project.toml",
            "project_sha256" => file_sha256(PROJECT_TOML),
            "manifest_path" => "Manifest.toml",
            "manifest_sha256" => file_sha256(MANIFEST_TOML),
        ),
        "outputs" => Dict(
            "artifact_paths" => portable_relpath.(artifacts),
            "artifact_sha256" => file_sha256.(artifacts),
            "summary_path" => portable_relpath(output_path),
            "summary_sha256" => file_sha256(output_path),
            "stdout_path" => portable_relpath(stdout_path),
            "stderr_path" => portable_relpath(stderr_path),
            "stderr_empty" => filesize(stderr_path) == 0,
        ),
    )
    record_io = IOBuffer()
    TOML.print(record_io, record; sorted = true)
    record_status = write_immutable(record_path, take!(record_io))

    println(summary)
    println((run_id, output_status = :created, record_status))
end

main()
