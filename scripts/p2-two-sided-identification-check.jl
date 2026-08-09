#!/usr/bin/env julia

# P2 research-only two-sided truncation identification gate.
# A local Hessian can look regular while a much wider source distribution remains
# likelihood-compatible. Probe fixed scale multiples with profile likelihood and
# keep calibration and external holdout seeds separate.
using Distributions
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
using .P2LikelihoodContracts

const TWO_SIDED_REPETITIONS = 120
const MIN_CHALLENGING_CATASTROPHIC_RATE = 0.20
const MAX_CHALLENGING_CATASTROPHIC_RATE = 0.30
const CALIBRATION_TRUTHS = (Normal(-2, 0.35), Normal(1200, 250))
const HOLDOUT_TRUTHS = (Normal(37, 1.7), Normal(-15_000, 3_200))
const TWO_SIDED_DESIGNS = (
    central99 = (0.005, 0.995),
    central80 = (0.1, 0.9),
    central50 = (0.25, 0.75),
    central10 = (0.45, 0.55),
    asymmetric50 = (0.1, 0.6),
)

function two_sided_scenario(
    distribution,
    truth_id,
    design,
    probabilities,
    sample_size,
    seed,
)
    true_mu, true_sigma = params(distribution)
    lower, upper = quantile.(Ref(distribution), probabilities)
    rng = Xoshiro(seed)
    fit_failures = 0
    optimizer_accepts = 0
    catastrophic = 0
    current_warnings = 0
    current_catastrophic_warnings = 0
    enhanced_warnings = 0
    enhanced_catastrophic_warnings = 0
    enhanced_regular_warnings = 0
    wide_scale_warnings = 0

    for _ in 1:TWO_SIDED_REPETITIONS
        observed = rand(rng, truncated(distribution, lower, upper), sample_size)
        local fit
        try
            fit = fit_truncated_normal(observed; lower, upper)
        catch
            fit_failures += 1
            continue
        end
        optimizer_accepts += 1
        is_catastrophic = abs(mean(fit.distribution) - true_mu) > 5true_sigma ||
            std(fit.distribution) > 5true_sigma ||
            std(fit.distribution) < true_sigma / 5
        current = weak_identification_assessment(
            fit; observation = :truncated, lower, upper,
        )
        enhanced = two_sided_truncation_assessment(
            observed, fit, lower, upper,
        )
        is_current_warning = current.status == :warning
        is_enhanced_warning = enhanced.status == :warning

        catastrophic += is_catastrophic
        current_warnings += is_current_warning
        current_catastrophic_warnings += is_catastrophic && is_current_warning
        enhanced_warnings += is_enhanced_warning
        enhanced_catastrophic_warnings += is_catastrophic && is_enhanced_warning
        enhanced_regular_warnings += !is_catastrophic && is_enhanced_warning
        wide_scale_warnings += :wide_scale_profile_compatible in enhanced.reasons
    end

    (
        truth_id,
        design,
        sample_size,
        attempts = TWO_SIDED_REPETITIONS,
        optimizer_accepts,
        fit_failures,
        catastrophic,
        current_warnings,
        current_catastrophic_warnings,
        enhanced_warnings,
        enhanced_catastrophic_warnings,
        enhanced_regular_warnings,
        wide_scale_warnings,
    )
end

function run_two_sided_matrix(truths, seed_base)
    [
        two_sided_scenario(
            distribution,
            truth_id,
            design,
            probabilities,
            sample_size,
            seed_base + 100truth_id + 10design_id + sample_id,
        )
        for (truth_id, distribution) in enumerate(truths)
        for (design_id, (design, probabilities)) in enumerate(pairs(TWO_SIDED_DESIGNS))
        for (sample_id, sample_size) in enumerate((40, 120))
    ]
end

function matrix_summary(results)
    stable = filter(result -> result.design == :central99, results)
    challenging = filter(result -> result.design != :central99, results)
    summarize(group) = (
        attempts = sum(result -> result.attempts, group),
        optimizer_accepts = sum(result -> result.optimizer_accepts, group),
        fit_failures = sum(result -> result.fit_failures, group),
        catastrophic = sum(result -> result.catastrophic, group),
        current_warnings = sum(result -> result.current_warnings, group),
        current_catastrophic_warnings = sum(
            result -> result.current_catastrophic_warnings, group,
        ),
        enhanced_warnings = sum(result -> result.enhanced_warnings, group),
        enhanced_catastrophic_warnings = sum(
            result -> result.enhanced_catastrophic_warnings, group,
        ),
        enhanced_regular_warnings = sum(
            result -> result.enhanced_regular_warnings, group,
        ),
        wide_scale_warnings = sum(result -> result.wide_scale_warnings, group),
    )
    (stable = summarize(stable), challenging = summarize(challenging))
end

calibration_results = run_two_sided_matrix(CALIBRATION_TRUTHS, 20265000)
holdout_results = run_two_sided_matrix(HOLDOUT_TRUTHS, 20268000)
calibration = matrix_summary(calibration_results)
holdout = matrix_summary(holdout_results)

println("P2_TWO_SIDED_CALIBRATION")
println(calibration)
println("P2_TWO_SIDED_HOLDOUT")
println(holdout)

@testset "P2 two-sided profile-contrast identification" begin
    for results in (calibration_results, holdout_results)
        @test length(results) == 20
        @test all(result -> result.attempts == TWO_SIDED_REPETITIONS, results)
        @test all(
            result -> result.optimizer_accepts + result.fit_failures == result.attempts,
            results,
        )
    end

    for stable in (calibration.stable, holdout.stable)
        @test stable.attempts == 480
        @test stable.fit_failures == 0
        @test stable.catastrophic == 0
        @test stable.enhanced_warnings == 0
    end

    @test calibration.challenging.attempts == 1_920
    @test holdout.challenging.attempts == 1_920

    for challenging in (calibration.challenging, holdout.challenging)
        @test MIN_CHALLENGING_CATASTROPHIC_RATE <=
              challenging.catastrophic / challenging.attempts <=
              MAX_CHALLENGING_CATASTROPHIC_RATE
        @test challenging.enhanced_catastrophic_warnings >
              challenging.current_catastrophic_warnings
        @test challenging.enhanced_catastrophic_warnings /
              challenging.catastrophic > 0.95
        @test challenging.enhanced_catastrophic_warnings < challenging.catastrophic
        @test challenging.wide_scale_warnings > 0
    end
end

println("P2_TWO_SIDED_IDENTIFICATION_CHECK_PASS")
