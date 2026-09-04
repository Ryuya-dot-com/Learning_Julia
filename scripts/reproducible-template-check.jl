using CSV
using DataFrames
using SHA
using TOML
using Tar
using Test

const ROOT = normpath(joinpath(@__DIR__, ".."))
const SOURCE = joinpath(ROOT, "examples", "reproducible-study")
const ARCHIVE = joinpath(ROOT, "public", "templates", "reproducible-study-template.tar")
const EXPECTED_FILES = sort([
    ".gitignore",
    ".gitattributes",
    "README.md",
    "Project.toml",
    "Manifest.toml",
    "code/run_analysis.jl",
    "code/run_r_bridge.jl",
    "code/run_stan_bridge.jl",
    "code/setup_cmdstan.jl",
    "code/summarize_trials.R",
    "data/example/trials_synthetic.csv",
    "data/raw/README.md",
    "metadata/data_dictionary.csv",
    "metadata/schema.toml",
    "metadata/study.toml",
    "metadata/DATA_LICENSE.txt",
    "models/README.md",
    "models/bernoulli.stan",
])
const RUN_STAN_CHECK = get(ENV, "RUN_STAN_TEMPLATE_CHECK", "0") == "1"
const RUNTIME_DIRECTORIES = Set([".cmdstan", "data/derived", "metadata/runs", "output"])

file_sha256(path) = open(path, "r") do io
    bytes2hex(sha256(io))
end

function portable_files(root)
    paths = String[]
    for (directory, subdirectories, files) in walkdir(root)
        filter!(subdirectories) do subdirectory
            relative = replace(relpath(joinpath(directory, subdirectory), root), '\\' => '/')
            relative ∉ RUNTIME_DIRECTORIES
        end
        append!(
            paths,
            replace(relpath(joinpath(directory, file), root), '\\' => '/')
            for file in files
        )
    end
    sort(paths)
end

@testset "配布用の再現可能研究project" begin
    @test isfile(ARCHIVE)
    @test portable_files(SOURCE) == EXPECTED_FILES

    mktempdir() do extraction
        Tar.extract(ARCHIVE, extraction)
        template = joinpath(extraction, "reproducible-study")
        @test isdir(template)
        @test portable_files(template) == EXPECTED_FILES
        for relative_path in EXPECTED_FILES
            @test file_sha256(joinpath(template, relative_path)) ==
                  file_sha256(joinpath(SOURCE, relative_path))
        end

        input_path = joinpath(template, "data", "example", "trials_synthetic.csv")
        manifest_path = joinpath(template, "Manifest.toml")
        input_before = file_sha256(input_path)
        manifest_before = file_sha256(manifest_path)
        entrypoint = joinpath(template, "code", "run_analysis.jl")
        instantiate_command = `$(Base.julia_cmd()) --project=$template -e 'using Pkg; Pkg.instantiate()'`
        command = `$(Base.julia_cmd()) --project=$template $entrypoint`

        elsewhere = mktempdir()
        try
            cd(elsewhere) do
                run(instantiate_command)
            end
            first_output = cd(elsewhere) do
                read(command, String)
            end
            second_output = cd(elsewhere) do
                read(command, String)
            end

            @test occursin("mean_rt_ms", first_output)
            @test occursin("510.0", first_output)
            @test occursin("550.0", first_output)
            @test occursin("(:created, :created, :created)", first_output)
            @test occursin("(:reused, :reused, :created)", second_output)
            @test file_sha256(input_path) == input_before
            @test file_sha256(manifest_path) == manifest_before

            derived = filter(endswith(".csv"), readdir(joinpath(template, "data", "derived")))
            summaries = filter(endswith(".csv"), readdir(joinpath(template, "output", "tables")))
            run_records = filter(endswith(".toml"), readdir(joinpath(template, "metadata", "runs")))
            @test length(derived) == 1
            @test length(summaries) == 1
            @test length(run_records) == 2

            summary = CSV.read(joinpath(template, "output", "tables", only(summaries)), DataFrame)
            @test summary.condition == ["control", "treatment"]
            @test summary.n == [3, 2]
            @test summary.mean_rt_ms == [510.0, 550.0]

            record_path = joinpath(template, "metadata", "runs", first(run_records))
            record = TOML.parsefile(record_path)
            @test record["inputs"]["trials_path"] == "data/example/trials_synthetic.csv"
            @test record["inputs"]["study_path"] == "metadata/study.toml"
            @test record["inputs"]["study_id"] == "synthetic-rt-demo"
            @test record["inputs"]["input_classification"] == "synthetic-public"
            @test record["quality"]["input_unchanged"] == true
            @test startswith(record["outputs"]["summary_path"], "output/tables/")
            record_text = read(record_path, String)
            @test !occursin(template, record_text)
            @test !occursin(extraction, record_text)
            @test !occursin(elsewhere, record_text)

            r_bridge = joinpath(template, "code", "run_r_bridge.jl")
            rscript = Sys.which("Rscript")
            if isnothing(rscript)
                @test occursin("Rscriptが見つかりません", read(r_bridge, String))
            else
                r_command = `$(Base.julia_cmd()) --project=$template $r_bridge`
                first_r_output = cd(elsewhere) do
                    read(r_command, String)
                end
                second_r_output = cd(elsewhere) do
                    read(r_command, String)
                end

                @test occursin("510.0", first_r_output)
                @test occursin("550.0", first_r_output)
                @test occursin("output_status = :created", first_r_output)
                @test occursin("record_status = :created", first_r_output)
                @test occursin("output_status = :reused", second_r_output)
                @test occursin("record_status = :reused", second_r_output)

                r_records = filter(
                    name -> startswith(name, "r-bridge--") && endswith(name, ".toml"),
                    readdir(joinpath(template, "metadata", "runs")),
                )
                @test length(r_records) == 1

                r_record = TOML.parsefile(
                    joinpath(template, "metadata", "runs", only(r_records)),
                )
                @test r_record["bridge"]["driver"] == "Julia"
                @test r_record["bridge"]["engine"] == "Rscript --vanilla"
                @test !isempty(r_record["bridge"]["r_platform"])
                @test r_record["bridge"]["os"] == string(Sys.KERNEL)
                @test r_record["bridge"]["arch"] == string(Sys.ARCH)
                @test r_record["commands"]["driver"] ==
                      "julia --project=. code/run_r_bridge.jl"
                @test r_record["inputs"]["data_sha256"] == file_sha256(input_path)
                @test r_record["inputs"]["driver_sha256"] == file_sha256(r_bridge)
                @test r_record["inputs"]["project_sha256"] == file_sha256(
                    joinpath(template, "Project.toml"),
                )
                @test r_record["inputs"]["manifest_sha256"] == file_sha256(
                    joinpath(template, "Manifest.toml"),
                )
                @test r_record["outputs"]["stderr_empty"] == true
                @test length(r_record["outputs"]["artifact_paths"]) == 3
                @test length(r_record["outputs"]["artifact_paths"]) ==
                      length(r_record["outputs"]["artifact_sha256"])
                for (relative_path, expected_hash) in zip(
                    r_record["outputs"]["artifact_paths"],
                    r_record["outputs"]["artifact_sha256"],
                )
                    artifact_path = joinpath(template, split(relative_path, '/')...)
                    @test file_sha256(artifact_path) == expected_hash
                end
                r_summary_path = joinpath(
                    template,
                    split(r_record["outputs"]["summary_path"], '/')...,
                )
                r_summary = CSV.read(r_summary_path, DataFrame)
                @test r_summary.condition == ["control", "treatment"]
                @test r_summary.n == [3, 2]
                @test r_summary.mean_rt_ms == [510.0, 550.0]

                r_record_path = joinpath(template, "metadata", "runs", only(r_records))
                original_r_record = read(r_record_path)
                tampered_r_record = deepcopy(r_record)
                tampered_r_record["outputs"]["artifact_paths"][1] =
                    "../outside-r-artifact.txt"
                open(r_record_path, "w") do io
                    TOML.print(io, tampered_r_record; sorted = true)
                end
                r_boundary_error = joinpath(elsewhere, "r-boundary-error.txt")
                blocked_r_boundary = cd(elsewhere) do
                    open(r_boundary_error, "w") do error_log
                        run(pipeline(
                            ignorestatus(r_command);
                            stdout = devnull,
                            stderr = error_log,
                        ))
                    end
                end
                @test !success(blocked_r_boundary)
                @test occursin("R成果物pathはproject外", read(r_boundary_error, String))
                write(r_record_path, original_r_record)

                tampered_r_record = deepcopy(r_record)
                tampered_r_record["inputs"]["driver_sha256"] = repeat("0", 64)
                open(r_record_path, "w") do io
                    TOML.print(io, tampered_r_record; sorted = true)
                end
                r_semantic_error = joinpath(elsewhere, "r-semantic-error.txt")
                blocked_r_semantics = cd(elsewhere) do
                    open(r_semantic_error, "w") do error_log
                        run(pipeline(
                            ignorestatus(r_command);
                            stdout = devnull,
                            stderr = error_log,
                        ))
                    end
                end
                @test !success(blocked_r_semantics)
                @test occursin(
                    "inputs.driver_sha256が現在の実行条件と一致しません",
                    read(r_semantic_error, String),
                )
                write(r_record_path, original_r_record)

                open(joinpath(template, "code", "summarize_trials.R"), "a") do io
                    write(io, "\nstop(\"intentional R failure\")\n")
                end
                failed_r = cd(elsewhere) do
                    run(pipeline(ignorestatus(r_command); stdout = devnull, stderr = devnull))
                end
                @test !success(failed_r)
                r_output_root = joinpath(template, "output", "r")
                failed_r_directories = filter(readdir(r_output_root)) do directory
                    isfile(joinpath(r_output_root, directory, "failure.toml"))
                end
                @test length(failed_r_directories) == 1
                r_failure_path = joinpath(
                    r_output_root,
                    only(failed_r_directories),
                    "failure.toml",
                )
                r_failure = TOML.parsefile(r_failure_path)
                @test r_failure["failure"]["status"] == "failed"
                r_stderr_path = only(filter(
                    endswith("r-stderr.log"),
                    r_failure["available_log_paths"],
                ))
                @test occursin(
                    "intentional R failure",
                    read(joinpath(template, split(r_stderr_path, '/')...), String),
                )
                r_failure_hash = file_sha256(r_failure_path)
                blocked_r_retry = cd(elsewhere) do
                    run(pipeline(ignorestatus(r_command); stdout = devnull, stderr = devnull))
                end
                @test !success(blocked_r_retry)
                @test file_sha256(r_failure_path) == r_failure_hash
            end

            setup_cmdstan = read(joinpath(template, "code", "setup_cmdstan.jl"), String)
            stan_bridge = joinpath(template, "code", "run_stan_bridge.jl")
            @test occursin("CMDSTAN_VERSION = \"2.39.0\"", setup_cmdstan)
            @test occursin(
                "ffe03c29c9f139d77deeb156a2a0911ebf0742ae38311c739f4fcea3bc4f8909",
                setup_cmdstan,
            )
            @test occursin(
                "mv(staged_home, CMDSTAN_HOME)",
                setup_cmdstan,
            )
            @test !occursin(
                "archive, \"-C\", INSTALL_ROOT",
                setup_cmdstan,
            )
            @test occursin("CmdStanがありません", read(stan_bridge, String))

            if RUN_STAN_CHECK
                local_cmdstan = joinpath(SOURCE, ".cmdstan", "cmdstan-2.39.0")
                cmdstan = get(
                    ENV,
                    "CMDSTAN",
                    get(ENV, "JULIA_CMDSTAN_HOME", local_cmdstan),
                )
                isfile(joinpath(cmdstan, "bin", "stanc")) || error(
                    "RUN_STAN_TEMPLATE_CHECK=1ですがCmdStanがありません: $cmdstan",
                )
                stan_command = addenv(
                    `$(Base.julia_cmd()) --project=$template $stan_bridge`,
                    "CMDSTAN" => cmdstan,
                )
                first_stan_output = cd(elsewhere) do
                    read(stan_command, String)
                end
                second_stan_output = cd(elsewhere) do
                    read(stan_command, String)
                end
                @test occursin("status = :created", first_stan_output)
                @test occursin("status = :reused", second_stan_output)
                @test occursin("analytic_theta_mean = 0.75", first_stan_output)
                @test occursin("posterior_predictive_mean", first_stan_output)
                @test occursin("divergences = 0", first_stan_output)

                stan_records = filter(
                    name -> startswith(name, "stan-bridge--") && endswith(name, ".toml"),
                    readdir(joinpath(template, "metadata", "runs")),
                )
                @test length(stan_records) == 1
                stan_record = TOML.parsefile(
                    joinpath(template, "metadata", "runs", only(stan_records)),
                )
                @test stan_record["bridge"]["cmdstan_version"] == "2.39.0"
                @test stan_record["bridge"]["stan_sample_version"] == "7.10.3"
                @test stan_record["commands"]["driver"] ==
                      "julia --project=. code/run_stan_bridge.jl"
                @test stan_record["inputs"]["driver_sha256"] == file_sha256(stan_bridge)
                @test stan_record["inputs"]["project_sha256"] == file_sha256(
                    joinpath(template, "Project.toml"),
                )
                @test stan_record["inputs"]["manifest_sha256"] == file_sha256(
                    joinpath(template, "Manifest.toml"),
                )
                @test stan_record["diagnostics"]["cmdstan_diagnose_passed"] == true
                @test stan_record["diagnostics"]["divergences"] == 0
                @test stan_record["diagnostics"]["treedepth_hits"] == 0
                @test stan_record["validation"]["analytic_posterior"] == "Beta(6, 2)"
                @test stan_record["validation"]["analytic_theta_mean"] == 0.75
                @test stan_record["validation"]["passed"] == true
                @test stan_record["posterior_predictive"]["analytic_mean"] == 4.5
                @test stan_record["posterior_predictive"]["draws"] == 2_000
                @test stan_record["posterior_predictive"]["passed"] == true
                @test length(stan_record["outputs"]["chain_paths"]) == 4
                @test length(stan_record["outputs"]["data_paths"]) == 4
                @test !isempty(stan_record["outputs"]["log_paths"])
                @test length(stan_record["outputs"]["artifact_paths"]) ==
                      length(stan_record["outputs"]["artifact_sha256"])
                for (relative_path, expected_hash) in zip(
                    stan_record["outputs"]["artifact_paths"],
                    stan_record["outputs"]["artifact_sha256"],
                )
                    output_path = joinpath(template, split(relative_path, '/')...)
                    @test file_sha256(output_path) == expected_hash
                end

                stan_record_path = joinpath(
                    template,
                    "metadata",
                    "runs",
                    only(stan_records),
                )
                original_stan_record = read(stan_record_path)
                tampered_stan_record = deepcopy(stan_record)
                tampered_stan_record["outputs"]["artifact_paths"][1] =
                    "../outside-stan-artifact.txt"
                open(stan_record_path, "w") do io
                    TOML.print(io, tampered_stan_record; sorted = true)
                end
                stan_boundary_error = joinpath(elsewhere, "stan-boundary-error.txt")
                blocked_stan_boundary = cd(elsewhere) do
                    open(stan_boundary_error, "w") do error_log
                        run(pipeline(
                            ignorestatus(stan_command);
                            stdout = devnull,
                            stderr = error_log,
                        ))
                    end
                end
                @test !success(blocked_stan_boundary)
                @test occursin(
                    "Stan成果物pathはproject外",
                    read(stan_boundary_error, String),
                )
                write(stan_record_path, original_stan_record)

                tampered_stan_record = deepcopy(stan_record)
                tampered_stan_record["diagnostics"]["theta_mean"] = 0.5
                open(stan_record_path, "w") do io
                    TOML.print(io, tampered_stan_record; sorted = true)
                end
                stan_semantic_error = joinpath(elsewhere, "stan-semantic-error.txt")
                blocked_stan_semantics = cd(elsewhere) do
                    open(stan_semantic_error, "w") do error_log
                        run(pipeline(
                            ignorestatus(stan_command);
                            stdout = devnull,
                            stderr = error_log,
                        ))
                    end
                end
                @test !success(blocked_stan_semantics)
                @test occursin(
                    "diagnostics.theta_meanが保存済みCSVと一致しません",
                    read(stan_semantic_error, String),
                )
                write(stan_record_path, original_stan_record)

                open(joinpath(template, "models", "bernoulli.stan"), "a") do io
                    write(io, "\ninvalid stan syntax\n")
                end
                failed_stan = cd(elsewhere) do
                    run(pipeline(ignorestatus(stan_command); stdout = devnull, stderr = devnull))
                end
                @test !success(failed_stan)
                stan_output_root = joinpath(template, "output", "stan")
                failed_directories = filter(readdir(stan_output_root)) do directory
                    isfile(joinpath(stan_output_root, directory, "failure.toml"))
                end
                @test length(failed_directories) == 1
                failure_path = joinpath(
                    stan_output_root,
                    only(failed_directories),
                    "failure.toml",
                )
                failure = TOML.parsefile(failure_path)
                @test failure["failure"]["status"] == "failed"
                @test !isempty(failure["failure"]["message"])
                failure_hash = file_sha256(failure_path)
                blocked_retry = cd(elsewhere) do
                    run(pipeline(ignorestatus(stan_command); stdout = devnull, stderr = devnull))
                end
                @test !success(blocked_retry)
                @test file_sha256(failure_path) == failure_hash
            end

            invalid = CSV.read(input_path, DataFrame)
            invalid.condition[1] = "unknown"
            CSV.write(input_path, invalid)
            expected_error_path = joinpath(elsewhere, "expected-schema-error.txt")
            failed = cd(elsewhere) do
                open(expected_error_path, "w") do error_log
                    run(pipeline(
                        ignorestatus(command);
                        stdout = devnull,
                        stderr = error_log,
                    ); wait = true)
                end
            end
            @test !success(failed)
            @test occursin(
                "conditionに許可されていない値または欠測があります",
                read(expected_error_path, String),
            )
        finally
            rm(elsewhere; recursive = true, force = true)
        end
    end
end

println((
    archive_sha256 = file_sha256(ARCHIVE),
    source_files = length(EXPECTED_FILES),
    julia_clean_process_runs = 2,
    r_bridge_runs = isnothing(Sys.which("Rscript")) ? 0 : 2,
    stan_bridge_runs = RUN_STAN_CHECK ? 2 : 0,
))
println("reproducible study template checks passed")
