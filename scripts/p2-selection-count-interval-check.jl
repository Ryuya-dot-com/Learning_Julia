#!/usr/bin/env julia

# P2 research-only interval report for the Normal selection-count likelihood.
# The bootstrap regenerates the complete screened cohort, not only selected rows.
# PASS compares known interval behavior and unresolved states; it does not choose
# a universally preferred interval or promote this API to the public catalog.
# Official references:
# https://juliastats.org/Distributions.jl/stable/univariate/
# https://docs.julialang.org/en/v1/stdlib/Random/
# https://docs.julialang.org/en/v1/stdlib/Statistics/
using Distributions
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
using .P2LikelihoodContracts

const INTERVAL_OUTER_REPETITIONS = 80
const INTERVAL_BOOTSTRAP_REPETITIONS = 199
const MIN_BOOTSTRAP_SUCCESS_RATE = 0.99
const MIN_NONLINEAR_MU_COVERAGE = 0.85
const MIN_PROFILE_SIGMA_COVERAGE = 0.85
const MIN_CENTRAL_BOOTSTRAP_SIGMA_COVERAGE = 0.55
const MAX_CENTRAL_BOOTSTRAP_SIGMA_COVERAGE = 0.85
const MIN_STABLE_BOOTSTRAP_SIGMA_COVERAGE = 0.85
const MAX_CENTRAL_WALD_MU_COVERAGE = 0.70
const MIN_NONLINEAR_IMPROVEMENT = 0.20
const MAX_PROFILE_BOOTSTRAP_COVERAGE_GAP = 0.12
const MIN_BOOTSTRAP_PROFILE_WIDTH_RATIO = 0.70
const MAX_BOOTSTRAP_PROFILE_WIDTH_RATIO = 1.20
const INTERVAL_TRUTH = Normal(37, 1.7)
const INTERVAL_DESIGNS = (
    central10_n40 = (probabilities = (0.45, 0.55), total_screened = 400),
    central10_n120 = (probabilities = (0.45, 0.55), total_screened = 1_200),
    asymmetric50_n40 = (probabilities = (0.1, 0.6), total_screened = 80),
)

function interval_scenario(design, config, seed)
    true_mu, true_sigma = params(INTERVAL_TRUTH)
    lower, upper = quantile.(Ref(INTERVAL_TRUTH), config.probabilities)
    outer_rng = Xoshiro(seed)
    bootstrap_rng = Xoshiro(seed + 10_000)
    fit_failures = 0
    wald_mu_cover = 0
    wald_sigma_cover = 0
    profile_mu_cover = 0
    profile_sigma_cover = 0
    bootstrap_mu_cover = 0
    bootstrap_sigma_cover = 0
    profile_ok = 0
    bootstrap_ok = 0
    automatic_interval_none = 0
    expected_messages = 0
    bootstrap_success_rates = Float64[]
    profile_mu_widths = Float64[]
    bootstrap_mu_widths = Float64[]
    selected_counts = Int[]

    for _ in 1:INTERVAL_OUTER_REPETITIONS
        latent = rand(outer_rng, INTERVAL_TRUTH, config.total_screened)
        observed = filter(value -> lower < value < upper, latent)
        push!(selected_counts, length(observed))
        report = try
            selection_count_interval_report(
                bootstrap_rng,
                observed,
                config.total_screened;
                lower,
                upper,
                bootstrap_repetitions = INTERVAL_BOOTSTRAP_REPETITIONS,
            )
        catch
            fit_failures += 1
            continue
        end

        wald_mu_cover += interval_contains(report.wald.mu, true_mu)
        wald_sigma_cover += interval_contains(report.wald.sigma, true_sigma)
        automatic_interval_none += isnothing(report.automatic_interval)
        expected_messages += all(
            message -> message in report.messages,
            (:wald_is_local_approximation, :compare_profile_and_bootstrap),
        )

        if report.profile.status == :ok
            profile_ok += 1
            profile_mu_cover += interval_contains(report.profile.mu, true_mu)
            profile_sigma_cover += interval_contains(report.profile.sigma, true_sigma)
            push!(profile_mu_widths, report.profile.mu[2] - report.profile.mu[1])
        end
        if report.bootstrap.status == :ok
            bootstrap_ok += 1
            bootstrap_mu_cover += interval_contains(report.bootstrap.mu, true_mu)
            bootstrap_sigma_cover += interval_contains(report.bootstrap.sigma, true_sigma)
            push!(
                bootstrap_mu_widths,
                report.bootstrap.mu[2] - report.bootstrap.mu[1],
            )
        end
        push!(bootstrap_success_rates, report.bootstrap.success_rate)
    end

    attempts = INTERVAL_OUTER_REPETITIONS
    (
        design,
        total_screened = config.total_screened,
        expected_selected = round(
            Int, config.total_screened * diff(collect(config.probabilities))[1],
        ),
        selected_mean = mean(selected_counts),
        attempts,
        fit_failures,
        profile_ok,
        bootstrap_ok,
        automatic_interval_none,
        expected_messages,
        mean_bootstrap_success_rate = mean(bootstrap_success_rates),
        wald_coverage_mu = wald_mu_cover / attempts,
        wald_coverage_sigma = wald_sigma_cover / attempts,
        profile_coverage_mu = profile_mu_cover / attempts,
        profile_coverage_sigma = profile_sigma_cover / attempts,
        bootstrap_coverage_mu = bootstrap_mu_cover / attempts,
        bootstrap_coverage_sigma = bootstrap_sigma_cover / attempts,
        bootstrap_profile_mu_width_ratio =
            mean(bootstrap_mu_widths) / mean(profile_mu_widths),
    )
end

function rounded_interval_result(result)
    (; (key => value isa AbstractFloat ? round(value; digits = 4) : value
        for (key, value) in pairs(result))...)
end

interval_results = [
    interval_scenario(design, config, 20283000 + 100design_id)
    for (design_id, (design, config)) in enumerate(pairs(INTERVAL_DESIGNS))
]

teaching_lower, teaching_upper = quantile.(
    Ref(INTERVAL_TRUTH), INTERVAL_DESIGNS.central10_n40.probabilities,
)
teaching_observed = filter(
    value -> teaching_lower < value < teaching_upper,
    rand(
        Xoshiro(20271234),
        INTERVAL_TRUTH,
        INTERVAL_DESIGNS.central10_n40.total_screened,
    ),
)
teaching_report = selection_count_interval_report(
    Xoshiro(20279001),
    teaching_observed,
    INTERVAL_DESIGNS.central10_n40.total_screened;
    lower = teaching_lower,
    upper = teaching_upper,
    bootstrap_repetitions = 499,
)
insufficient_bootstrap = parametric_bootstrap_selection_count_intervals(
    Xoshiro(20281199),
    teaching_report.fit,
    10;
    lower = teaching_lower,
    upper = teaching_upper,
    repetitions = 99,
)
forced_profile_search_limit = selection_count_interval_report(
    Xoshiro(20281200),
    teaching_observed,
    INTERVAL_DESIGNS.central10_n40.total_screened;
    lower = teaching_lower,
    upper = teaching_upper,
    bootstrap_repetitions = 99,
    profile_max_expansions = 0,
)

println("P2_SELECTION_COUNT_INTERVAL_CONFIRMATION")
foreach(result -> println(rounded_interval_result(result)), interval_results)
println("P2_SELECTION_COUNT_INTERVAL_TEACHING_EXAMPLE")
println((
    selected = length(teaching_observed),
    status = teaching_report.status,
    automatic_interval = teaching_report.automatic_interval,
    wald = teaching_report.wald,
    profile = teaching_report.profile,
    bootstrap = teaching_report.bootstrap,
))
println("P2_SELECTION_COUNT_INTERVAL_UNRESOLVED_EXAMPLE")
println(insufficient_bootstrap)
println("P2_SELECTION_COUNT_PROFILE_SEARCH_LIMIT_EXAMPLE")
println((
    status = forced_profile_search_limit.status,
    profile = forced_profile_search_limit.profile,
    messages = forced_profile_search_limit.messages,
))

@testset "P2 selection-count interval report" begin
    @test length(interval_results) == 3
    @test all(result -> result.attempts == INTERVAL_OUTER_REPETITIONS, interval_results)
    @test all(result -> result.fit_failures == 0, interval_results)
    @test all(result -> result.profile_ok == result.attempts, interval_results)
    @test all(result -> result.bootstrap_ok == result.attempts, interval_results)
    @test all(
        result -> result.automatic_interval_none == result.attempts,
        interval_results,
    )
    @test all(result -> result.expected_messages == result.attempts, interval_results)
    @test all(
        result -> result.mean_bootstrap_success_rate >= MIN_BOOTSTRAP_SUCCESS_RATE,
        interval_results,
    )
    @test all(
        result -> abs(result.selected_mean - result.expected_selected) <
                  0.15result.expected_selected,
        interval_results,
    )
    @test all(interval_results) do result
        MIN_BOOTSTRAP_PROFILE_WIDTH_RATIO <=
            result.bootstrap_profile_mu_width_ratio <=
            MAX_BOOTSTRAP_PROFILE_WIDTH_RATIO
    end
    @test all(interval_results) do result
        result.profile_coverage_mu >= MIN_NONLINEAR_MU_COVERAGE &&
            result.bootstrap_coverage_mu >= MIN_NONLINEAR_MU_COVERAGE &&
            result.profile_coverage_sigma >= MIN_PROFILE_SIGMA_COVERAGE
    end
    @test all(interval_results) do result
        abs(result.profile_coverage_mu - result.bootstrap_coverage_mu) <=
            MAX_PROFILE_BOOTSTRAP_COVERAGE_GAP
    end

    central_results = filter(
        result -> startswith(string(result.design), "central10"), interval_results,
    )
    @test all(
        result -> result.wald_coverage_mu <= MAX_CENTRAL_WALD_MU_COVERAGE,
        central_results,
    )
    @test all(central_results) do result
        result.profile_coverage_mu - result.wald_coverage_mu >=
            MIN_NONLINEAR_IMPROVEMENT &&
            result.bootstrap_coverage_mu - result.wald_coverage_mu >=
            MIN_NONLINEAR_IMPROVEMENT
    end
    @test all(central_results) do result
        MIN_CENTRAL_BOOTSTRAP_SIGMA_COVERAGE <=
            result.bootstrap_coverage_sigma <=
            MAX_CENTRAL_BOOTSTRAP_SIGMA_COVERAGE
    end

    stable_result = only(filter(
        result -> result.design == :asymmetric50_n40, interval_results,
    ))
    @test stable_result.bootstrap_coverage_sigma >=
          MIN_STABLE_BOOTSTRAP_SIGMA_COVERAGE

    true_mu, true_sigma = params(INTERVAL_TRUTH)
    @test teaching_report.status == :review_profile_and_bootstrap
    @test isnothing(teaching_report.automatic_interval)
    @test !interval_contains(teaching_report.wald.mu, true_mu)
    @test interval_contains(teaching_report.profile.mu, true_mu)
    @test interval_contains(teaching_report.profile.sigma, true_sigma)
    @test interval_contains(teaching_report.bootstrap.mu, true_mu)
    @test interval_contains(teaching_report.bootstrap.sigma, true_sigma)
    @test teaching_report.bootstrap.repetitions == 499
    @test teaching_report.bootstrap.success_rate >= MIN_BOOTSTRAP_SUCCESS_RATE

    @test insufficient_bootstrap.status == :insufficient_success
    @test insufficient_bootstrap.success_rate <
          insufficient_bootstrap.minimum_success_rate
    @test all(ismissing, insufficient_bootstrap.mu)
    @test all(ismissing, insufficient_bootstrap.sigma)
    @test !isempty(insufficient_bootstrap.failures)

    @test forced_profile_search_limit.status == :unresolved_profile
    @test forced_profile_search_limit.profile.status == :search_limit
    @test :profile_interval_unresolved in forced_profile_search_limit.messages
    @test isnothing(forced_profile_search_limit.automatic_interval)

    @test_throws ArgumentError parametric_bootstrap_selection_count_intervals(
        Xoshiro(1),
        teaching_report.fit,
        400;
        lower = teaching_lower,
        upper = teaching_upper,
        repetitions = 98,
    )
    @test_throws ArgumentError parametric_bootstrap_selection_count_intervals(
        Xoshiro(1),
        teaching_report.fit,
        400;
        lower = teaching_lower,
        upper = teaching_upper,
        repetitions = 99,
        level = 0.9,
    )
    @test_throws ArgumentError parametric_bootstrap_selection_count_intervals(
        Xoshiro(1),
        teaching_report.fit,
        400;
        lower = teaching_lower,
        upper = teaching_upper,
        repetitions = 99,
        minimum_success_rate = 0.0,
    )
    @test_throws ArgumentError profile_likelihood_intervals(
        identity,
        teaching_report.fit;
        max_expansions = -1,
    )
end

println("P2_SELECTION_COUNT_INTERVAL_CHECK_PASS")
