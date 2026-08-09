#!/usr/bin/env julia

# P2 research-only comparison of conditional truncation likelihood with a
# screened-cohort likelihood that also observes the number not selected.
# Official references:
# https://juliastats.org/Distributions.jl/latest/truncate/
# https://juliastats.org/Distributions.jl/latest/univariate/
# https://julianlsolvers.github.io/Optim.jl/stable/examples/generated/maxlikenlm/
using Distributions
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
using .P2LikelihoodContracts

const SELECTION_COUNT_REPETITIONS = 120
const SELECTION_COUNT_PROFILE_REPETITIONS = 80
const SELECTION_COUNT_CALIBRATION_TRUTHS = (
    Normal(-2, 0.35), Normal(1200, 250),
)
const SELECTION_COUNT_HOLDOUT_TRUTHS = (
    Normal(37, 1.7), Normal(-15_000, 3_200),
)
const SELECTION_COUNT_DESIGNS = (
    central50 = (0.25, 0.75),
    central10 = (0.45, 0.55),
    asymmetric50 = (0.1, 0.6),
)

function count_catastrophic(fit, true_mu, true_sigma)
    abs(mean(fit.distribution) - true_mu) > 5true_sigma ||
        std(fit.distribution) > 5true_sigma ||
        std(fit.distribution) < true_sigma / 5
end

function selection_count_scenario(
    distribution,
    truth_id,
    design,
    probabilities,
    target_selected,
    seed,
)
    true_mu, true_sigma = params(distribution)
    lower, upper = quantile.(Ref(distribution), probabilities)
    retained_fraction = probabilities[2] - probabilities[1]
    total_screened = round(Int, target_selected / retained_fraction)
    rng = Xoshiro(seed)
    selected_counts = Int[]
    conditional_fit_failures = 0
    conditional_catastrophic = 0
    count_fit_failures = 0
    count_catastrophic_recoveries = 0
    count_mu_cover = Bool[]
    count_sigma_cover = Bool[]
    count_mu = Float64[]
    count_sigma = Float64[]

    for _ in 1:SELECTION_COUNT_REPETITIONS
        screened = rand(rng, distribution, total_screened)
        observed = filter(value -> lower < value < upper, screened)
        push!(selected_counts, length(observed))

        try
            conditional_fit = fit_truncated_normal(observed; lower, upper)
            conditional_catastrophic += count_catastrophic(
                conditional_fit, true_mu, true_sigma,
            )
        catch
            conditional_fit_failures += 1
        end

        try
            count_fit = fit_selection_count_normal(
                observed, total_screened; lower, upper,
            )
            count_catastrophic_recoveries += count_catastrophic(
                count_fit, true_mu, true_sigma,
            )
            intervals = wald_intervals(count_fit)
            push!(count_mu_cover, interval_contains(intervals.mu, true_mu))
            push!(count_sigma_cover, interval_contains(intervals.sigma, true_sigma))
            push!(count_mu, mean(count_fit.distribution))
            push!(count_sigma, std(count_fit.distribution))
        catch
            count_fit_failures += 1
        end
    end

    (
        truth_id,
        design,
        target_selected,
        total_screened,
        attempts = SELECTION_COUNT_REPETITIONS,
        selected_mean = mean(selected_counts),
        selected_min = minimum(selected_counts),
        selected_max = maximum(selected_counts),
        conditional_fit_failures,
        conditional_catastrophic,
        count_fit_failures,
        count_catastrophic = count_catastrophic_recoveries,
        count_bias_mu = isempty(count_mu) ? missing : mean(count_mu) - true_mu,
        count_bias_sigma = isempty(count_sigma) ? missing : mean(count_sigma) - true_sigma,
        count_coverage_mu = isempty(count_mu_cover) ? missing : mean(count_mu_cover),
        count_coverage_sigma = isempty(count_sigma_cover) ? missing : mean(count_sigma_cover),
    )
end

function run_selection_count_matrix(truths, seed_base)
    [
        selection_count_scenario(
            distribution,
            truth_id,
            design,
            probabilities,
            target_selected,
            seed_base + 100truth_id + 10design_id + target_id,
        )
        for (truth_id, distribution) in enumerate(truths)
        for (design_id, (design, probabilities)) in
            enumerate(pairs(SELECTION_COUNT_DESIGNS))
        for (target_id, target_selected) in enumerate((40, 120))
    ]
end

function selection_count_summary(results)
    successful_count_fits = sum(
        result -> result.attempts - result.count_fit_failures, results,
    )
    (
        scenarios = length(results),
        attempts = sum(result -> result.attempts, results),
        conditional_fit_failures = sum(
            result -> result.conditional_fit_failures, results,
        ),
        conditional_catastrophic = sum(
            result -> result.conditional_catastrophic, results,
        ),
        count_fit_failures = sum(result -> result.count_fit_failures, results),
        count_catastrophic = sum(result -> result.count_catastrophic, results),
        count_coverage_mu = sum(
            result -> (result.attempts - result.count_fit_failures) *
                      result.count_coverage_mu,
            results,
        ) / successful_count_fits,
        count_coverage_sigma = sum(
            result -> (result.attempts - result.count_fit_failures) *
                      result.count_coverage_sigma,
            results,
        ) / successful_count_fits,
    )
end

function selection_count_profile_scenario(
    distribution,
    matrix,
    design,
    probabilities,
    target_selected,
    seed,
)
    true_mu, true_sigma = params(distribution)
    lower, upper = quantile.(Ref(distribution), probabilities)
    retained_fraction = probabilities[2] - probabilities[1]
    total_screened = round(Int, target_selected / retained_fraction)
    rng = Xoshiro(seed)
    fit_failures = 0
    profile_search_limits = 0
    profile_errors = 0
    wald_mu_cover = Bool[]
    wald_sigma_cover = Bool[]
    profile_mu_cover = Bool[]
    profile_sigma_cover = Bool[]

    for _ in 1:SELECTION_COUNT_PROFILE_REPETITIONS
        screened = rand(rng, distribution, total_screened)
        observed = filter(value -> lower < value < upper, screened)
        local fit
        try
            fit = fit_selection_count_normal(
                observed, total_screened; lower, upper,
            )
        catch
            fit_failures += 1
            continue
        end

        objective = raw -> normal_selection_count_nll(
            raw, observed, total_screened, lower, upper,
        )
        local profile
        try
            profile = profile_likelihood_intervals(objective, fit)
        catch
            profile_errors += 1
            continue
        end
        if profile.status == :search_limit
            profile_search_limits += 1
            continue
        end
        profile.status == :ok || error("未知のselection-count profile statusです")

        wald = wald_intervals(fit)
        push!(wald_mu_cover, interval_contains(wald.mu, true_mu))
        push!(wald_sigma_cover, interval_contains(wald.sigma, true_sigma))
        push!(profile_mu_cover, interval_contains(profile.mu, true_mu))
        push!(profile_sigma_cover, interval_contains(profile.sigma, true_sigma))
    end

    profile_ok = length(profile_mu_cover)
    (
        matrix,
        design,
        target_selected,
        total_screened,
        attempts = SELECTION_COUNT_PROFILE_REPETITIONS,
        fit_failures,
        profile_search_limits,
        profile_errors,
        profile_ok,
        resolved_rate = profile_ok / SELECTION_COUNT_PROFILE_REPETITIONS,
        conditional_wald_coverage_mu = isempty(wald_mu_cover) ? missing : mean(wald_mu_cover),
        conditional_wald_coverage_sigma = isempty(wald_sigma_cover) ? missing : mean(wald_sigma_cover),
        conditional_profile_coverage_mu = isempty(profile_mu_cover) ? missing : mean(profile_mu_cover),
        conditional_profile_coverage_sigma = isempty(profile_sigma_cover) ? missing : mean(profile_sigma_cover),
    )
end

function selection_count_profile_matrix(distribution, matrix, seed_base)
    scenarios = (
        (:central10, SELECTION_COUNT_DESIGNS.central10, 40),
        (:central10, SELECTION_COUNT_DESIGNS.central10, 120),
        (:asymmetric50, SELECTION_COUNT_DESIGNS.asymmetric50, 40),
    )
    [
        selection_count_profile_scenario(
            distribution,
            matrix,
            design,
            probabilities,
            target_selected,
            seed_base + scenario_id,
        )
        for (scenario_id, (design, probabilities, target_selected)) in
            enumerate(scenarios)
    ]
end

function rounded_selection_count(result)
    (; (key => value isa AbstractFloat ? round(value; digits = 4) : value
        for (key, value) in pairs(result))...)
end

function selection_count_teaching_example()
    truth = Normal(37, 1.7)
    true_mu, true_sigma = params(truth)
    lower, upper = quantile.(Ref(truth), (0.45, 0.55))
    total_screened = 400
    screened = rand(Xoshiro(20271234), truth, total_screened)
    observed = filter(value -> lower < value < upper, screened)
    fit = fit_selection_count_normal(
        observed, total_screened; lower, upper,
    )
    objective = raw -> normal_selection_count_nll(
        raw, observed, total_screened, lower, upper,
    )
    (
        true_mu,
        true_sigma,
        lower,
        upper,
        total_screened,
        selected = length(observed),
        excluded = total_screened - length(observed),
        fitted_mu = mean(fit.distribution),
        fitted_sigma = std(fit.distribution),
        wald = wald_intervals(fit),
        profile = profile_likelihood_intervals(objective, fit),
    )
end

calibration_results = run_selection_count_matrix(
    SELECTION_COUNT_CALIBRATION_TRUTHS, 20269000,
)
holdout_results = run_selection_count_matrix(
    SELECTION_COUNT_HOLDOUT_TRUTHS, 20271000,
)
calibration = selection_count_summary(calibration_results)
holdout = selection_count_summary(holdout_results)
profile_results = vcat(
    selection_count_profile_matrix(
        SELECTION_COUNT_CALIBRATION_TRUTHS[1], :calibration, 20273000,
    ),
    selection_count_profile_matrix(
        SELECTION_COUNT_HOLDOUT_TRUTHS[1], :holdout, 20274000,
    ),
)
teaching_example = selection_count_teaching_example()

println("P2_SELECTION_COUNT_CALIBRATION")
println(calibration)
foreach(println, calibration_results)
println("P2_SELECTION_COUNT_HOLDOUT")
println(holdout)
foreach(println, holdout_results)
println("P2_SELECTION_COUNT_PROFILE_PILOT")
foreach(result -> println(rounded_selection_count(result)), profile_results)
println("P2_SELECTION_COUNT_TEACHING_EXAMPLE")
println(teaching_example)

@testset "P2 screened-cohort selection-count likelihood" begin
    for results in (calibration_results, holdout_results)
        @test length(results) == 12
        @test all(result -> result.attempts == SELECTION_COUNT_REPETITIONS, results)
        @test all(result -> result.selected_min >= 2, results)
        @test all(
            result -> abs(result.selected_mean - result.target_selected) <
                      0.15result.target_selected,
            results,
        )
    end
    @test calibration.attempts == holdout.attempts == 1_440
    @test calibration.conditional_fit_failures == 174
    @test calibration.conditional_catastrophic == 463
    @test holdout.conditional_fit_failures == 193
    @test holdout.conditional_catastrophic == 446
    @test calibration.count_fit_failures == holdout.count_fit_failures == 0
    @test calibration.count_catastrophic == holdout.count_catastrophic == 0
    @test calibration.count_coverage_mu < 0.8
    @test holdout.count_coverage_mu < 0.8
    @test 0.9 <= calibration.count_coverage_sigma <= 0.95
    @test 0.9 <= holdout.count_coverage_sigma <= 0.95

    @test length(profile_results) == 6
    @test all(result -> result.attempts == SELECTION_COUNT_PROFILE_REPETITIONS, profile_results)
    @test all(profile_results) do result
        result.fit_failures + result.profile_search_limits +
            result.profile_errors + result.profile_ok == result.attempts
    end
    @test all(result -> result.profile_ok == result.attempts, profile_results)
    @test all(
        result -> 0.9 <= result.conditional_profile_coverage_mu <= 0.99,
        profile_results,
    )
    @test all(
        result -> 0.9 <= result.conditional_profile_coverage_sigma <= 0.99,
        profile_results,
    )
    central10_profiles = filter(result -> result.design == :central10, profile_results)
    @test all(central10_profiles) do result
        result.conditional_profile_coverage_mu -
            result.conditional_wald_coverage_mu > 0.4
    end

    @test teaching_example.total_screened == 400
    @test teaching_example.selected == 43
    @test teaching_example.excluded == 357
    @test !interval_contains(teaching_example.wald.mu, teaching_example.true_mu)
    @test teaching_example.profile.status == :ok
    @test interval_contains(teaching_example.profile.mu, teaching_example.true_mu)
    @test interval_contains(teaching_example.profile.sigma, teaching_example.true_sigma)
end

println("P2_SELECTION_COUNT_CHECK_PASS")
