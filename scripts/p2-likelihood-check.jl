#!/usr/bin/env julia

# P2 feasibility spike: 左右打切りとtruncationのNormal尤度を、既知parameterを
# 持つ合成dataで検証する。公開教材ではなく、昇格条件を評価する隔離実験。
#
# Official API references:
# https://juliastats.org/Distributions.jl/stable/censored/
# https://juliastats.org/Distributions.jl/stable/truncate/
# https://julianlsolvers.github.io/Optim.jl/stable/examples/generated/maxlikenlm/
# https://julianlsolvers.github.io/Optim.jl/latest/user/gradientsandhessians/
# https://juliaweb.github.io/HTTP.jl/stable/
using Distributions
using ForwardDiff
using HTTP
using Optim
using Random
using Statistics
using Test
using TOML

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
using .P2LikelihoodContracts

@testset "P2 censored/truncated likelihood feasibility" begin
    true_distribution = Normal(520, 85)
    true_mu, true_sigma = params(true_distribution)
    lower, upper = 450.0, 650.0

    @testset "入力契約と数値安定性" begin
        observed, left, right = simulate_censored(
            Xoshiro(20260824), true_distribution, 240, lower, upper,
        )
        @test validate_censored_sample(observed, left, right, lower, upper)
        @test any(left)
        @test any(right)
        @test_throws DimensionMismatch validate_censored_sample(
            observed, left[1:end-1], right, lower, upper,
        )
        both = copy(right)
        both[findfirst(left)] = true
        @test_throws ArgumentError validate_censored_sample(observed, left, both, lower, upper)
        bad_boundary = copy(observed)
        bad_boundary[findfirst(left)] += 1
        @test_throws ArgumentError validate_censored_sample(
            bad_boundary, left, right, lower, upper,
        )
        @test_throws ArgumentError validate_censored_sample(
            fill(lower, 3), trues(3), falses(3), lower, upper,
        )
        @test_throws ArgumentError normal_initial(fill(500.0, 4))

        extreme = normal_censored_nll(
            [0.0, 0.0], [-40.0, 40.0], [true, false], [false, true], -40.0, 40.0,
        )
        naive_extreme = -(log(cdf(Normal(), -40)) + log(1 - cdf(Normal(), 40)))
        @test isfinite(extreme)
        @test isinf(naive_extreme)

        selected = rand(Xoshiro(20260825), truncated(true_distribution; lower), 120)
        @test validate_truncated_sample(selected, lower, Inf)
        @test_throws ArgumentError validate_truncated_sample([lower, 500.0], lower, Inf)
        @test_throws ArgumentError validate_truncated_sample([500.0], lower, Inf)

        two_sided = rand(
            Xoshiro(20260832), truncated(true_distribution, lower, upper), 120,
        )
        @test log_selection_probability(true_distribution, lower, upper) ≈
              log(cdf(true_distribution, upper) - cdf(true_distribution, lower))
        @test normal_truncated_nll(
            [true_mu, log(true_sigma)], two_sided, lower, upper,
        ) ≈ -sum(logpdf(truncated(true_distribution, lower, upper), two_sided))
        finite_objective = raw -> normal_truncated_nll(raw, two_sided, lower, upper)
        @test all(isfinite, ForwardDiff.gradient(
            finite_objective, [true_mu, log(true_sigma)],
        ))
        @test all(isfinite, ForwardDiff.hessian(
            finite_objective, [true_mu, log(true_sigma)],
        ))

        screened = rand(Xoshiro(20260833), true_distribution, 800)
        selected_with_count = filter(value -> lower < value < upper, screened)
        @test validate_selection_count_sample(
            selected_with_count, length(screened), lower, upper,
        )
        @test_throws ArgumentError validate_selection_count_sample(
            selected_with_count, length(selected_with_count) - 1, lower, upper,
        )
        @test_throws ArgumentError validate_selection_count_sample(
            selected_with_count, 800.0, lower, upper,
        )
        @test_throws ArgumentError validate_selection_count_sample(
            selected_with_count, length(screened), lower, Inf,
        )
        log_selection = log_selection_probability(true_distribution, lower, upper)
        count_nll = normal_selection_count_nll(
            [true_mu, log(true_sigma)],
            selected_with_count,
            length(screened),
            lower,
            upper,
        )
        conditional_nll = normal_truncated_nll(
            [true_mu, log(true_sigma)], selected_with_count, lower, upper,
        )
        selection_count_nll = -length(selected_with_count) * log_selection -
            (length(screened) - length(selected_with_count)) *
            log1p(-exp(log_selection))
        @test count_nll ≈ conditional_nll + selection_count_nll
        count_fit = fit_selection_count_normal(
            selected_with_count, length(screened); lower, upper,
        )
        @test abs(mean(count_fit.distribution) - true_mu) < 12
        @test abs(std(count_fit.distribution) - true_sigma) < 12
    end

    @testset "単一dataでnaive解析と観測尤度を分ける" begin
        observed, left, right = simulate_censored(
            Xoshiro(20260826), true_distribution, 400, lower, upper,
        )
        censored_fit = fit_censored_normal(observed, left, right, lower, upper)
        naive_censored = fit_mle(Normal, observed)
        @test Optim.converged(censored_fit.result)
        @test abs(mean(censored_fit.distribution) - true_mu) < 12
        @test abs(std(censored_fit.distribution) - true_sigma) < 12
        @test abs(std(censored_fit.distribution) - true_sigma) <
              abs(std(naive_censored) - true_sigma)

        selected = rand(Xoshiro(20260827), truncated(true_distribution; lower), 400)
        truncated_fit = fit_truncated_normal(selected; lower)
        naive_selected = fit_mle(Normal, selected)
        @test Optim.converged(truncated_fit.result)
        @test abs(mean(truncated_fit.distribution) - true_mu) < 12
        @test abs(std(truncated_fit.distribution) - true_sigma) < 12
        @test abs(mean(truncated_fit.distribution) - true_mu) <
              abs(mean(naive_selected) - true_mu)
    end

    @testset "反復回復と95%区間coverage" begin
        repetitions = 240
        sample_size = 220
        censored_mu = Float64[]
        censored_sigma = Float64[]
        truncated_mu = Float64[]
        truncated_sigma = Float64[]
        naive_censored_mu = Float64[]
        naive_censored_sigma = Float64[]
        naive_truncated_mu = Float64[]
        naive_truncated_sigma = Float64[]
        censored_mu_cover = Bool[]
        censored_sigma_cover = Bool[]
        truncated_mu_cover = Bool[]
        truncated_sigma_cover = Bool[]

        censor_rng = Xoshiro(20260828)
        truncation_rng = Xoshiro(20260829)
        for _ in 1:repetitions
            observed, left, right = simulate_censored(
                censor_rng, true_distribution, sample_size, lower, upper,
            )
            censored_fit = fit_censored_normal(observed, left, right, lower, upper)
            naive_censored = fit_mle(Normal, observed)
            censored_ci = wald_intervals(censored_fit)
            push!(censored_mu, mean(censored_fit.distribution))
            push!(censored_sigma, std(censored_fit.distribution))
            push!(naive_censored_mu, mean(naive_censored))
            push!(naive_censored_sigma, std(naive_censored))
            push!(censored_mu_cover, interval_contains(censored_ci.mu, true_mu))
            push!(censored_sigma_cover, interval_contains(censored_ci.sigma, true_sigma))

            selected = rand(
                truncation_rng, truncated(true_distribution; lower), sample_size,
            )
            truncated_fit = fit_truncated_normal(selected; lower)
            naive_selected = fit_mle(Normal, selected)
            truncated_ci = wald_intervals(truncated_fit)
            push!(truncated_mu, mean(truncated_fit.distribution))
            push!(truncated_sigma, std(truncated_fit.distribution))
            push!(naive_truncated_mu, mean(naive_selected))
            push!(naive_truncated_sigma, std(naive_selected))
            push!(truncated_mu_cover, interval_contains(truncated_ci.mu, true_mu))
            push!(truncated_sigma_cover, interval_contains(truncated_ci.sigma, true_sigma))
        end

        @test length(censored_mu) == repetitions
        @test length(truncated_mu) == repetitions
        @test abs(mean(censored_mu) - true_mu) < 2.5
        @test abs(mean(censored_sigma) - true_sigma) < 2.5
        @test abs(mean(truncated_mu) - true_mu) < 3.0
        @test abs(mean(truncated_sigma) - true_sigma) < 3.0
        @test mean(abs.(censored_mu .- true_mu)) < mean(abs.(naive_censored_mu .- true_mu))
        @test mean(abs.(censored_sigma .- true_sigma)) <
              mean(abs.(naive_censored_sigma .- true_sigma))
        @test mean(abs.(truncated_mu .- true_mu)) < mean(abs.(naive_truncated_mu .- true_mu))
        @test mean(abs.(truncated_sigma .- true_sigma)) <
              mean(abs.(naive_truncated_sigma .- true_sigma))

        coverage = (
            censored_mu = mean(censored_mu_cover),
            censored_sigma = mean(censored_sigma_cover),
            truncated_mu = mean(truncated_mu_cover),
            truncated_sigma = mean(truncated_sigma_cover),
        )
        @test all(rate -> 0.89 <= rate <= 0.99, values(coverage))
        println((
            recovery = (
                censored = (mu = mean(censored_mu), sigma = mean(censored_sigma)),
                truncated = (mu = mean(truncated_mu), sigma = mean(truncated_sigma)),
            ),
            coverage = coverage,
        ))
    end

    @testset "fit後の観測過程へ予測を戻す" begin
        observed, left, right = simulate_censored(
            Xoshiro(20260830), true_distribution, 220, lower, upper,
        )
        fit = fit_censored_normal(observed, left, right, lower, upper)
        replicate_mean = Float64[]
        replicate_sd = Float64[]
        replicate_left = Float64[]
        replicate_right = Float64[]
        rng = Xoshiro(20260831)
        for _ in 1:1_000
            rep, rep_left, rep_right = simulate_censored(
                rng, fit.distribution, length(observed), lower, upper,
            )
            push!(replicate_mean, mean(rep))
            push!(replicate_sd, std(rep; corrected = false))
            push!(replicate_left, mean(rep_left))
            push!(replicate_right, mean(rep_right))
        end
        @test interval_contains(interval95(replicate_mean), mean(observed))
        @test interval_contains(interval95(replicate_sd), std(observed; corrected = false))
        @test interval_contains(interval95(replicate_left), mean(left))
        @test interval_contains(interval95(replicate_right), mean(right))
    end

    @testset "隔離環境と依存budget" begin
        project_dir = normpath(joinpath(@__DIR__, "..", "validation", "p2-likelihood"))
        project = TOML.parsefile(joinpath(project_dir, "Project.toml"))
        manifest = TOML.parsefile(joinpath(project_dir, "Manifest.toml"))
        public_project = TOML.parsefile(joinpath(project_dir, "..", "Project.toml"))
        @test Set(keys(project["deps"])) == Set([
            "ADTypes", "CSV", "Distributions", "ForwardDiff", "HTTP", "JSON3", "Optim",
        ]) && all(
            dependency -> !haskey(public_project["deps"], dependency),
            ("HTTP", "JSON3", "Optim"),
        )
        @test length(manifest["deps"]) <= 96
        @test project["compat"]["julia"] == "1.12"
        @test project["compat"]["Optim"] == "~2.2.1" &&
              project["compat"]["HTTP"] == "~2.0.0" &&
              project["compat"]["CSV"] == "~0.10" &&
              project["compat"]["JSON3"] == "~1.14"
        @test pkgversion(Optim) == v"2.2.1"
        @test pkgversion(ForwardDiff) == v"1.4.5"
        @test pkgversion(HTTP) == v"2.0.0"
    end
end

println((
    julia = string(VERSION),
    distributions = string(pkgversion(Distributions)),
    optim = string(pkgversion(Optim)),
    forwarddiff = string(pkgversion(ForwardDiff)),
    http = string(pkgversion(HTTP)),
    scope = "feasibility-only; not a public censored-data estimation API",
))
println("P2_LIKELIHOOD_CHECK_PASS")
