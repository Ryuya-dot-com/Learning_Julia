const PROJECT_ROOT = realpath(normpath(joinpath(@__DIR__, "..")))
const PROJECT_TOML = joinpath(PROJECT_ROOT, "Project.toml")
const MANIFEST_TOML = joinpath(PROJECT_ROOT, "Manifest.toml")
const ACTIVE_PROJECT = something(Base.active_project(), "")
(!isempty(ACTIVE_PROJECT) && isfile(ACTIVE_PROJECT) &&
 realpath(ACTIVE_PROJECT) == realpath(PROJECT_TOML)) || error(
    "このprojectを指定して実行してください: julia --project=$(PROJECT_ROOT) $(@__FILE__)",
)

const LOCAL_CMDSTAN = joinpath(PROJECT_ROOT, ".cmdstan", "cmdstan-2.39.0")

function find_cmdstan()
    for variable in ("CMDSTAN", "JULIA_CMDSTAN_HOME")
        haskey(ENV, variable) || continue
        home = abspath(expanduser(ENV[variable]))
        isfile(joinpath(home, "makefile")) || error(
            "$variable がCmdStan directoryを指していません: $home",
        )
        return home
    end
    isfile(joinpath(LOCAL_CMDSTAN, "makefile")) && return LOCAL_CMDSTAN
    error("CmdStanがありません。先に julia --project=. code/setup_cmdstan.jl を実行してください")
end

const CMDSTAN_HOME = find_cmdstan()
ENV["CMDSTAN"] = CMDSTAN_HOME

using CSV
using DataFrames
using Dates
using SHA
using StanSample
using Statistics
using TOML

const MODEL_PATH = joinpath(PROJECT_ROOT, "models", "bernoulli.stan")
const SETTINGS = (
    N = 6,
    successes = 5,
    seed = 20260904,
    chains = 4,
    warmups = 250,
    samples = 500,
    max_depth = 10,
)

file_sha256(path) = open(path, "r") do io
    bytes2hex(sha256(io))
end

portable_relpath(path) = replace(relpath(path, PROJECT_ROOT), '\\' => '/')

function project_artifact_path(relative_path)
    isabspath(relative_path) && error("Stan成果物pathはproject内の相対pathにしてください")
    path = normpath(joinpath(
        PROJECT_ROOT,
        split(replace(relative_path, '\\' => '/'), '/')...,
    ))
    portable = portable_relpath(path)
    (portable == ".." || startswith(portable, "../")) && error(
        "Stan成果物pathはproject外を参照できません: $relative_path",
    )
    isfile(path) || error("記録済みのStan成果物がありません: $relative_path")
    resolved = realpath(path)
    resolved_portable = portable_relpath(resolved)
    (resolved_portable == ".." || startswith(resolved_portable, "../")) && error(
        "Stan成果物pathの実体はproject外を参照できません: $relative_path",
    )
    resolved
end

function cmdstan_tool(name)
    suffix = Sys.iswindows() ? ".exe" : ""
    path = joinpath(CMDSTAN_HOME, "bin", name * suffix)
    isfile(path) || error("CmdStan toolがありません: $path")
    path
end

function first_line(command)
    first(split(strip(read(command, String)), '\n'))
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

function verify_fields(actual, expected, section)
    for (key, expected_value) in expected
        get(actual, key, nothing) == expected_value || error(
            "Stan実行記録の$(section).$(key)が現在の実行条件と一致しません",
        )
    end
end

function checked_draw_statistics(chain_files, summary_path)
    length(chain_files) == SETTINGS.chains || error(
        "chain CSVが$(SETTINGS.chains)本そろっていません",
    )
    chains = [CSV.read(path, DataFrame; comment = "#") for path in chain_files]
    all(frame -> nrow(frame) == SETTINGS.samples, chains) || error(
        "chain CSVのdraw数が設定と一致しません",
    )
    all(frame -> all(
        name -> name in propertynames(frame),
        [:theta, :successes_rep, :divergent__, :treedepth__],
    ), chains) || error("chain CSVに必要な列がありません")

    divergences = sum(sum(Int.(frame.divergent__)) for frame in chains)
    treedepth_hits = sum(count(==(SETTINGS.max_depth), frame.treedepth__) for frame in chains)
    divergences == 0 || error("divergent transitionがあります: $divergences")
    treedepth_hits == 0 || error("maximum treedepth到達があります: $treedepth_hits")

    theta_draws = reduce(vcat, [frame.theta for frame in chains])
    predictive_draws = reduce(vcat, [frame.successes_rep for frame in chains])
    expected_draws = SETTINGS.chains * SETTINGS.samples
    length(theta_draws) == expected_draws || error("thetaのdraw数が設定と一致しません")
    length(predictive_draws) == expected_draws || error(
        "successes_repのdraw数が設定と一致しません",
    )
    all(x -> isinteger(x) && 0 <= x <= SETTINGS.N, predictive_draws) || error(
        "successes_repが0〜Nの整数ではありません",
    )

    summary = CSV.read(summary_path, DataFrame; comment = "#")
    theta_rows = summary[summary.name .== "theta", :]
    nrow(theta_rows) == 1 || error("thetaのsummaryが一行ではありません")
    theta = only(eachrow(theta_rows))
    theta_mean = mean(theta_draws)
    0.65 <= theta_mean <= 0.85 || error("thetaの事後平均が基準範囲外です: $theta_mean")
    theta.R_hat <= 1.05 || error("thetaのR-hatが1.05を超えています: $(theta.R_hat)")
    theta.ESS_bulk >= 100 || error("thetaのbulk ESSが100未満です: $(theta.ESS_bulk)")
    theta.ESS_tail >= 100 || error("thetaのtail ESSが100未満です: $(theta.ESS_tail)")
    isapprox(theta_mean, theta.Mean; atol = 1e-5) || error(
        "chain CSVとstansummaryのtheta平均が一致しません",
    )

    analytic_theta_mean = (SETTINGS.successes + 1) / (SETTINGS.N + 2)
    theta_mean_error = abs(theta_mean - analytic_theta_mean)
    theta_mean_error <= 0.03 || error(
        "Stanのtheta平均が解析解から0.03を超えて離れています: $theta_mean_error",
    )
    theta_quantiles = quantile(theta_draws, [0.05, 0.5, 0.95])
    analytic_predictive_mean = SETTINGS.N * analytic_theta_mean
    predictive_mean = mean(predictive_draws)
    predictive_mean_error = abs(predictive_mean - analytic_predictive_mean)
    predictive_mean_error <= 0.15 || error(
        "事後予測平均が解析値から0.15を超えて離れています: $predictive_mean_error",
    )

    (
        theta_mean,
        analytic_theta_mean,
        theta_mean_error,
        theta_mcse = theta.MCSE,
        theta_q05 = theta_quantiles[1],
        theta_median = theta_quantiles[2],
        theta_q95 = theta_quantiles[3],
        posterior_predictive_mean = predictive_mean,
        analytic_predictive_mean,
        predictive_mean_error,
        r_hat = theta.R_hat,
        ess_bulk = theta.ESS_bulk,
        ess_tail = theta.ESS_tail,
        divergences,
        treedepth_hits,
    )
end

function verify_record(record_path, run_id, stanc_version, package_version, cxx_version)
    record = TOML.parsefile(record_path)
    outputs = record["outputs"]
    paths = outputs["artifact_paths"]
    hashes = outputs["artifact_sha256"]
    length(paths) == length(hashes) || error("Stan成果物のpathとhashの件数が一致しません")
    for (relative_path, expected_hash) in zip(paths, hashes)
        path = project_artifact_path(relative_path)
        file_sha256(path) == expected_hash || error(
            "記録済みのStan成果物が変更されています: $relative_path",
        )
    end
    verify_fields(record["bridge"], Dict(
        "run_id" => run_id,
        "driver" => "Julia / StanSample",
        "engine" => "CmdStan",
        "julia_version" => string(VERSION),
        "stan_sample_version" => package_version,
        "cmdstan_version" => "2.39.0",
        "stanc_version" => stanc_version,
        "compiler" => cxx_version,
        "os" => string(Sys.KERNEL),
        "arch" => string(Sys.ARCH),
    ), "bridge")
    verify_fields(record["commands"], Dict(
        "setup" => "julia --project=. code/setup_cmdstan.jl",
        "driver" => "julia --project=. code/run_stan_bridge.jl",
        "chain_commands" => "see outputs.log_paths",
    ), "commands")
    verify_fields(record["inputs"], Dict(
        "model_path" => "models/bernoulli.stan",
        "model_sha256" => file_sha256(MODEL_PATH),
        "driver_path" => "code/run_stan_bridge.jl",
        "driver_sha256" => file_sha256(@__FILE__),
        "project_path" => "Project.toml",
        "project_sha256" => file_sha256(PROJECT_TOML),
        "manifest_path" => "Manifest.toml",
        "manifest_sha256" => file_sha256(MANIFEST_TOML),
        "N" => SETTINGS.N,
        "successes" => SETTINGS.successes,
        "prior" => "theta ~ Beta(1, 1)",
    ), "inputs")
    verify_fields(record["sampling"], Dict(
        "seed" => SETTINGS.seed,
        "chains" => SETTINGS.chains,
        "warmups_per_chain" => SETTINGS.warmups,
        "samples_per_chain" => SETTINGS.samples,
        "max_depth" => SETTINGS.max_depth,
        "algorithm" => "hmc",
        "engine" => "nuts",
    ), "sampling")

    chain_files = project_artifact_path.(outputs["chain_paths"])
    summary_path = project_artifact_path(outputs["summary_path"])
    values = checked_draw_statistics(chain_files, summary_path)
    diagnostics = record["diagnostics"]
    for key in (
        "theta_mean", "theta_mcse", "theta_q05", "theta_median", "theta_q95",
        "r_hat", "ess_bulk", "ess_tail",
    )
        isapprox(diagnostics[key], getproperty(values, Symbol(key)); atol = 1e-12) || error(
            "Stan実行記録のdiagnostics.$(key)が保存済みCSVと一致しません",
        )
    end
    diagnostics["divergences"] == values.divergences || error(
        "Stan実行記録のdiagnostics.divergencesが保存済みCSVと一致しません",
    )
    diagnostics["treedepth_hits"] == values.treedepth_hits || error(
        "Stan実行記録のdiagnostics.treedepth_hitsが保存済みCSVと一致しません",
    )
    diagnostics["cmdstan_diagnose_passed"] == true || error(
        "Stan実行記録のCmdStan diagnose状態が合格ではありません",
    )
    diagnostic_text = read(project_artifact_path(outputs["diagnostics_path"]), String)
    occursin("Processing complete, no problems detected.", diagnostic_text) || error(
        "保存済みのCmdStan diagnose結果が合格ではありません",
    )
    verify_fields(record["validation"], Dict(
        "analytic_posterior" => "Beta(6, 2)",
        "analytic_theta_mean" => values.analytic_theta_mean,
        "sample_theta_mean" => values.theta_mean,
        "absolute_error" => values.theta_mean_error,
        "tolerance" => 0.03,
        "passed" => true,
    ), "validation")
    verify_fields(record["posterior_predictive"], Dict(
        "quantity" => "successes_rep",
        "draws" => SETTINGS.chains * SETTINGS.samples,
        "support" => "0:$(SETTINGS.N)",
        "analytic_mean" => values.analytic_predictive_mean,
        "sample_mean" => values.posterior_predictive_mean,
        "absolute_error" => values.predictive_mean_error,
        "tolerance" => 0.15,
        "passed" => true,
    ), "posterior_predictive")
    record
end

function compiler_version()
    compiler = something(Sys.which("clang++"), Sys.which("g++"), Sys.which("c++"), nothing)
    isnothing(compiler) && error("C++ compilerが見つかりません")
    first_line(Cmd([compiler, "--version"]))
end

function main()
    isfile(MODEL_PATH) || error("Stan modelがありません: $MODEL_PATH")
    stanc_version = first_line(Cmd([cmdstan_tool("stanc"), "--version"]))
    occursin("2.39.0", stanc_version) || error(
        "このtemplateで検証したCmdStan 2.39.0ではありません: $stanc_version",
    )
    package_version = string(pkgversion(StanSample))
    cxx_version = compiler_version()
    fingerprints = [
        file_sha256(MODEL_PATH),
        file_sha256(PROJECT_TOML),
        file_sha256(MANIFEST_TOML),
        file_sha256(@__FILE__),
        stanc_version,
        package_version,
        cxx_version,
        repr(SETTINGS),
    ]
    run_id = bytes2hex(sha256(codeunits(join(fingerprints, "\n"))))[1:12]
    run_directory = joinpath(PROJECT_ROOT, "output", "stan", run_id)
    record_path = joinpath(PROJECT_ROOT, "metadata", "runs", "stan-bridge--$run_id.toml")

    if isfile(record_path)
        record = verify_record(
            record_path,
            run_id,
            stanc_version,
            package_version,
            cxx_version,
        )
        diagnostics = record["diagnostics"]
        println((
            run_id,
            status = :reused,
            theta_mean = diagnostics["theta_mean"],
            analytic_theta_mean = record["validation"]["analytic_theta_mean"],
            posterior_predictive_mean = record["posterior_predictive"]["sample_mean"],
            r_hat = diagnostics["r_hat"],
            ess_bulk = diagnostics["ess_bulk"],
            ess_tail = diagnostics["ess_tail"],
            divergences = diagnostics["divergences"],
        ))
        return
    end
    ispath(run_directory) && error(
        "実行記録のないStan出力directoryがあります。内容を確認してから移動または削除してください: $run_directory",
    )

    output_root = dirname(run_directory)
    mkpath(output_root)
    mkpath(run_directory)
    result = try
        staging = run_directory
        model = SampleModel("bernoulli", read(MODEL_PATH, String), staging)
        rc = stan_sample(
            model;
            data = Dict("N" => SETTINGS.N, "successes" => SETTINGS.successes),
            seed = SETTINGS.seed,
            num_chains = SETTINGS.chains,
            num_warmups = SETTINGS.warmups,
            num_samples = SETTINGS.samples,
            engine = :nuts,
            max_depth = SETTINGS.max_depth,
            refresh = 0,
            sig_figs = 18,
        )
        success(rc) || error("Stan sampling failed: $rc")

        chain_files = sort(unique(filter(isfile, model.sample_file)))
        data_files = sort(unique(filter(isfile, model.data_file)))
        length(data_files) == SETTINGS.chains || error(
            "入力JSONが$(SETTINGS.chains)本そろっていません",
        )
        log_files = sort(unique(filter(isfile, model.log_file)))
        isempty(log_files) && error("Stan実行logがありません")

        read_summary(model)
        summary_path = "$(model.output_base)_summary.csv"
        isfile(summary_path) || error("stansummary CSVがありません")
        values = checked_draw_statistics(chain_files, summary_path)

        diagnostic_text = read(
            Cmd(vcat([cmdstan_tool("diagnose")], chain_files)),
            String,
        )
        occursin("Processing complete, no problems detected.", diagnostic_text) || error(
            "CmdStan diagnoseが問題を報告しました:\n$diagnostic_text",
        )
        diagnostics_path = joinpath(staging, "diagnostics.txt")
        write(diagnostics_path, diagnostic_text)
        model_copy_path = "$(model.output_base).stan"
        executable_path = model.exec_path
        isfile(model_copy_path) || error("実行時のStan model複製がありません")
        isfile(executable_path) || error("compile済みStan modelがありません")

        basenames = basename.(chain_files)
        data_names = basename.(data_files)
        log_names = basename.(log_files)
        summary_name = basename(summary_path)
        diagnostics_name = basename(diagnostics_path)
        model_copy_name = basename(model_copy_path)
        executable_name = basename(executable_path)
        chain_hashes = file_sha256.(chain_files)
        summary_hash = file_sha256(summary_path)
        diagnostics_hash = file_sha256(diagnostics_path)
        artifacts = vcat(
            chain_files,
            data_files,
            log_files,
            [model_copy_path, executable_path, summary_path, diagnostics_path],
        )
        artifact_names = basename.(artifacts)
        allunique(artifact_names) || error("Stan成果物のfile名が重複しています")
        (
            chain_names = basenames,
            chain_hashes,
            data_names,
            log_names,
            summary_name,
            summary_hash,
            diagnostics_name,
            diagnostics_hash,
            model_copy_name,
            executable_name,
            artifact_names,
            artifact_hashes = file_sha256.(artifacts),
            values,
        )
    catch exception
        log_names = isdir(run_directory) ? sort(filter(endswith(".log"), readdir(run_directory))) : String[]
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
                portable_relpath(joinpath(run_directory, name)) for name in log_names
            ],
        )
        failure_io = IOBuffer()
        TOML.print(failure_io, failure; sorted = true)
        failure_path = joinpath(run_directory, "failure.toml")
        try
            write_immutable(failure_path, take!(failure_io))
        catch record_exception
            @error "Stan失敗記録を保存できませんでした" failure_path exception = record_exception
        end
        @error "Stan実行に失敗しました。途中成果物とfailure.tomlを確認してください" run_directory
        rethrow()
    end

    record = Dict(
        "bridge" => Dict(
            "run_id" => run_id,
            "driver" => "Julia / StanSample",
            "engine" => "CmdStan",
            "julia_version" => string(VERSION),
            "stan_sample_version" => package_version,
            "cmdstan_version" => "2.39.0",
            "stanc_version" => stanc_version,
            "compiler" => cxx_version,
            "os" => string(Sys.KERNEL),
            "arch" => string(Sys.ARCH),
            "completed_utc" => string(now(UTC), "Z"),
        ),
        "commands" => Dict(
            "setup" => "julia --project=. code/setup_cmdstan.jl",
            "driver" => "julia --project=. code/run_stan_bridge.jl",
            "chain_commands" => "see outputs.log_paths",
        ),
        "inputs" => Dict(
            "model_path" => "models/bernoulli.stan",
            "model_sha256" => file_sha256(MODEL_PATH),
            "driver_path" => "code/run_stan_bridge.jl",
            "driver_sha256" => file_sha256(@__FILE__),
            "project_path" => "Project.toml",
            "project_sha256" => file_sha256(PROJECT_TOML),
            "manifest_path" => "Manifest.toml",
            "manifest_sha256" => file_sha256(MANIFEST_TOML),
            "N" => SETTINGS.N,
            "successes" => SETTINGS.successes,
            "prior" => "theta ~ Beta(1, 1)",
        ),
        "sampling" => Dict(
            "seed" => SETTINGS.seed,
            "chains" => SETTINGS.chains,
            "warmups_per_chain" => SETTINGS.warmups,
            "samples_per_chain" => SETTINGS.samples,
            "max_depth" => SETTINGS.max_depth,
            "algorithm" => "hmc",
            "engine" => "nuts",
        ),
        "diagnostics" => Dict(
            "theta_mean" => result.values.theta_mean,
            "theta_mcse" => result.values.theta_mcse,
            "theta_q05" => result.values.theta_q05,
            "theta_median" => result.values.theta_median,
            "theta_q95" => result.values.theta_q95,
            "r_hat" => result.values.r_hat,
            "ess_bulk" => result.values.ess_bulk,
            "ess_tail" => result.values.ess_tail,
            "divergences" => result.values.divergences,
            "treedepth_hits" => result.values.treedepth_hits,
            "cmdstan_diagnose_passed" => true,
        ),
        "validation" => Dict(
            "analytic_posterior" => "Beta(6, 2)",
            "analytic_theta_mean" => result.values.analytic_theta_mean,
            "sample_theta_mean" => result.values.theta_mean,
            "absolute_error" => result.values.theta_mean_error,
            "tolerance" => 0.03,
            "passed" => true,
        ),
        "posterior_predictive" => Dict(
            "quantity" => "successes_rep",
            "draws" => SETTINGS.chains * SETTINGS.samples,
            "support" => "0:$(SETTINGS.N)",
            "analytic_mean" => result.values.analytic_predictive_mean,
            "sample_mean" => result.values.posterior_predictive_mean,
            "absolute_error" => result.values.predictive_mean_error,
            "tolerance" => 0.15,
            "passed" => true,
        ),
        "outputs" => Dict(
            "artifact_paths" => [
                portable_relpath(joinpath(run_directory, name))
                for name in result.artifact_names
            ],
            "artifact_sha256" => result.artifact_hashes,
            "chain_paths" => [
                portable_relpath(joinpath(run_directory, name))
                for name in result.chain_names
            ],
            "chain_sha256" => result.chain_hashes,
            "data_paths" => [
                portable_relpath(joinpath(run_directory, name))
                for name in result.data_names
            ],
            "log_paths" => [
                portable_relpath(joinpath(run_directory, name))
                for name in result.log_names
            ],
            "model_copy_path" => portable_relpath(
                joinpath(run_directory, result.model_copy_name),
            ),
            "executable_path" => portable_relpath(
                joinpath(run_directory, result.executable_name),
            ),
            "summary_path" => portable_relpath(joinpath(run_directory, result.summary_name)),
            "summary_sha256" => result.summary_hash,
            "diagnostics_path" => portable_relpath(
                joinpath(run_directory, result.diagnostics_name),
            ),
            "diagnostics_sha256" => result.diagnostics_hash,
        ),
    )
    record_io = IOBuffer()
    TOML.print(record_io, record; sorted = true)
    record_status = write_immutable(record_path, take!(record_io))
    println((run_id, status = :created, record_status, result.values...))
end

main()
