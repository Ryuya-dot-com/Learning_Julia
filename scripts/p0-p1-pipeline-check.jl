#!/usr/bin/env julia

# P0-A/B/CとP1を、一時directory内の一つの分析経路として結合する。
# 打切りparameterの推定はP2候補であり、ここでは未打切りdataのfitから
# 将来の観測設計をforward simulationするところまでを公開境界とする。
using CSV
using DataFrames
using Distributions
using Random
using SHA
using Statistics
using Test

include(joinpath(@__DIR__, "p0-p1-contracts.jl"))
using .P0P1Contracts

file_sha256(path) = bytes2hex(open(sha256, path))

@testset "P0〜P1 end-to-end pipeline" begin
    mktempdir() do project_dir
        raw_dir = joinpath(project_dir, "data", "raw")
        output_dir = joinpath(project_dir, "output", "tables")
        mkpath(raw_dir)

        true_distribution = LogNormal(log(520), 0.16)
        rt = rand(Xoshiro(20260820), true_distribution, 240)
        fixture = DataFrame(
            participant_id = repeat(["P01", "P02"], inner = 120),
            trial = repeat(1:120, 2),
            condition = repeat(["control", "treatment"], 120),
            rt_ms = rt,
            correct = trues(240),
        )

        # 作成順と読込順を意図的に変え、列挙順の契約を通す。
        CSV.write(joinpath(raw_dir, "trials_02.csv"), fixture[121:240, :])
        CSV.write(joinpath(raw_dir, "trials_01.csv"), fixture[1:120, :])
        write(joinpath(raw_dir, "README.txt"), "raw inputs are immutable\n")

        raw_files = discover_csvs(raw_dir)
        raw_hashes = Dict(basename(path) => file_sha256(path) for path in raw_files)
        data, loaded_files = load_trials(raw_dir)

        @test basename.(loaded_files) == ["trials_01.csv", "trials_02.csv"]
        @test nrow(data) == 240
        @test data.source_file == repeat(["trials_01.csv", "trials_02.csv"], inner = 120)
        @test !any(nonunique(data, [:participant_id, :trial]))
        @test all(!ismissing, data.rt_ms)

        input_audit = combine(
            groupby(data, :source_file),
            nrow => :rows,
            :rt_ms => (x -> count(ismissing, x)) => :missing_rt,
            :participant_id => (x -> length(unique(x))) => :participants,
        )
        @test input_audit.rows == [120, 120]
        @test input_audit.missing_rt == [0, 0]
        @test input_audit.participants == [1, 1]

        censor_flags = falses(nrow(data))
        fitted = fit_uncensored_checked(
            LogNormal, data.rt_ms, censor_flags; support = >(0),
        )
        @test isapprox(params(fitted)[1], params(true_distribution)[1]; atol = 0.04)
        @test isapprox(params(fitted)[2], params(true_distribution)[2]; atol = 0.03)

        censored_copy = copy(censor_flags)
        censored_copy[1] = true
        @test_throws ArgumentError fit_uncensored_checked(
            LogNormal, data.rt_ms, censored_copy; support = >(0),
        )

        observed = data_summary(data.rt_ms; lower_cut = 450.0)
        replicates = replicate_summaries(
            Xoshiro(20260821), fitted, nrow(data), 1_500; lower_cut = 450.0,
        )
        q95_interval = predictive_interval(replicates.q95)
        max_interval = predictive_interval(replicates.maximum)
        sd_interval = predictive_interval(replicates.sd)

        @test inside(observed.q95, q95_interval)
        @test inside(observed.maximum, max_interval)
        @test inside(observed.sd, sd_interval)

        model_diagnostics = DataFrame(
            family = ["LogNormal"],
            n = [nrow(data)],
            observed_mean = [observed.mean],
            fitted_mean = [mean(fitted)],
            observed_q95 = [observed.q95],
            predicted_q95_lower = [q95_interval.lower],
            predicted_q95_upper = [q95_interval.upper],
            observed_maximum = [observed.maximum],
            predicted_maximum_lower = [max_interval.lower],
            predicted_maximum_upper = [max_interval.upper],
        )

        # P1はfit済みlatent分布から観測規則をforward simulationする。
        # 打切り後の値からparameterを再推定する処理はここへ混ぜない。
        lower_limit = 450.0
        selected = truncated(fitted; lower = lower_limit)
        recorded = censored(fitted; lower = lower_limit)
        selected_draws = rand(Xoshiro(20260822), selected, 50_000)
        recorded_draws = rand(Xoshiro(20260823), recorded, 50_000)
        latent_below_probability = cdf(fitted, lower_limit)
        selected_boundary_rate = mean(selected_draws .== lower_limit)
        recorded_boundary_rate = mean(recorded_draws .== lower_limit)

        @test selected_boundary_rate == 0.0
        @test isapprox(recorded_boundary_rate, latent_below_probability; atol = 0.005)
        @test mean(selected_draws) > mean(recorded_draws) > mean(fitted)

        observation_design = DataFrame(
            lower_limit = [lower_limit],
            latent_below_probability = [latent_below_probability],
            selected_boundary_rate = [selected_boundary_rate],
            recorded_boundary_rate = [recorded_boundary_rate],
            selected_mean = [mean(selected_draws)],
            recorded_mean = [mean(recorded_draws)],
            inference_scope = ["forward observation design only; no censored-data estimation"],
        )
        manifest = DataFrame(
            key = [
                "analysis_scope",
                "input_files",
                "data_seed",
                "replicate_seed",
                "julia_version",
                "distributions_version",
            ],
            value = [
                "uncensored fit -> predictive check -> forward observation design",
                join(basename.(loaded_files), ";"),
                "20260820",
                "20260821",
                string(VERSION),
                string(pkgversion(Distributions)),
            ],
        )

        outputs = [
            "input_file_audit.csv" => input_audit,
            "model_diagnostics.csv" => model_diagnostics,
            "observation_design.csv" => observation_design,
            "run_manifest.csv" => manifest,
        ]
        for (name, table) in outputs
            path = joinpath(output_dir, name)
            @test write_new_csv(path, table; missingstring = "NA") == path
            restored = CSV.read(path, DataFrame; missingstring = "NA", strict = true)
            @test nrow(restored) == nrow(table)
            @test propertynames(restored) == propertynames(table)
            @test file_sha256(path) |> length == 64
        end

        @test sort(readdir(output_dir)) == sort(first.(outputs))
        @test_throws ArgumentError write_new_csv(
            joinpath(output_dir, "model_diagnostics.csv"), model_diagnostics,
        )
        @test raw_hashes == Dict(basename(path) => file_sha256(path) for path in raw_files)
        @test all(path -> startswith(path, output_dir), joinpath.(output_dir, first.(outputs)))
        @test observation_design.inference_scope == [
            "forward observation design only; no censored-data estimation",
        ]
    end
end

println((
    julia = string(VERSION),
    distributions = string(pkgversion(Distributions)),
    pipeline = (
        batch_input = true,
        guarded_fit = true,
        predictive_check = true,
        forward_observation_design = true,
        audited_output = true,
    ),
))
println("P0_P1_PIPELINE_CHECK_PASS")
