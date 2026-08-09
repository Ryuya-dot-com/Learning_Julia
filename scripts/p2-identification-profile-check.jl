#!/usr/bin/env julia

# P2 research-only identification and profile-likelihood gate.
# Official API references:
# https://julianlsolvers.github.io/Optim.jl/stable/user/config/
# https://julianlsolvers.github.io/Optim.jl/v1.10/user/minimization/
# https://juliastats.org/Distributions.jl/stable/truncate/
using Distributions
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
using .P2LikelihoodContracts

const PROFILE_TRUE_DISTRIBUTION = Normal(520, 85)
const PROFILE_TRUE_MU, PROFILE_TRUE_SIGMA = params(PROFILE_TRUE_DISTRIBUTION)
const GEOMETRY_REPETITIONS = 160
const PROFILE_REPETITIONS = 80
const MIN_CHALLENGING_CATASTROPHIC_RATE = 0.02
const MAX_CHALLENGING_CATASTROPHIC_RATE = 0.08
const MAX_STABLE_WARNING_RATE = 0.01

function catastrophic_recovery(fit)
    abs(mean(fit.distribution) - PROFILE_TRUE_MU) > 5PROFILE_TRUE_SIGMA ||
        std(fit.distribution) > 5PROFILE_TRUE_SIGMA ||
        std(fit.distribution) < PROFILE_TRUE_SIGMA / 5
end

function geometry_calibration(sample_size, retained_fraction, seed)
    lower = quantile(PROFILE_TRUE_DISTRIBUTION, 1 - retained_fraction)
    rng = Xoshiro(seed)
    optimizer_accepts = 0
    fit_failures = 0
    catastrophic = 0
    warnings = 0
    catastrophic_warnings = 0
    reasons = Dict{Symbol, Int}()

    for _ in 1:GEOMETRY_REPETITIONS
        observed = rand(
            rng,
            truncated(PROFILE_TRUE_DISTRIBUTION; lower),
            sample_size,
        )
        try
            fit = fit_truncated_normal(observed; lower)
            optimizer_accepts += 1
            is_catastrophic = catastrophic_recovery(fit)
            catastrophic += is_catastrophic
            assessment = weak_identification_assessment(
                fit; observation = :truncated, lower,
            )
            is_warning = assessment.status == :warning
            warnings += is_warning
            catastrophic_warnings += is_catastrophic && is_warning
            for reason in assessment.reasons
                reasons[reason] = get(reasons, reason, 0) + 1
            end
        catch
            fit_failures += 1
        end
    end

    (
        sample_size = sample_size,
        retained_fraction = retained_fraction,
        attempts = GEOMETRY_REPETITIONS,
        optimizer_accepts = optimizer_accepts,
        fit_failures = fit_failures,
        catastrophic = catastrophic,
        warnings = warnings,
        catastrophic_warnings = catastrophic_warnings,
        reasons = sort(collect(reasons)),
    )
end

function profile_pilot(process, sample_size, severity, seed)
    rng = Xoshiro(seed)
    fit_failures = 0
    geometry_warnings = 0
    profile_search_limits = 0
    profile_errors = 0
    wald_mu_cover = Bool[]
    wald_sigma_cover = Bool[]
    profile_mu_cover = Bool[]
    profile_sigma_cover = Bool[]

    lower = process == :censored ?
        quantile(PROFILE_TRUE_DISTRIBUTION, severity / 2) :
        quantile(PROFILE_TRUE_DISTRIBUTION, severity)
    upper = process == :censored ?
        quantile(PROFILE_TRUE_DISTRIBUTION, 1 - severity / 2) : Inf

    for _ in 1:PROFILE_REPETITIONS
        local fit, objective, assessment
        try
            if process == :censored
                observed, left, right = simulate_censored(
                    rng,
                    PROFILE_TRUE_DISTRIBUTION,
                    sample_size,
                    lower,
                    upper,
                )
                fit = fit_censored_normal(observed, left, right, lower, upper)
                objective = raw -> normal_censored_nll(
                    raw, observed, left, right, lower, upper,
                )
                assessment = weak_identification_assessment(
                    fit; observation = :censored, lower, upper,
                )
            elseif process == :truncated
                observed = rand(
                    rng,
                    truncated(PROFILE_TRUE_DISTRIBUTION; lower),
                    sample_size,
                )
                fit = fit_truncated_normal(observed; lower)
                objective = raw -> normal_truncated_nll(raw, observed, lower, Inf)
                assessment = weak_identification_assessment(
                    fit; observation = :truncated, lower,
                )
            else
                throw(ArgumentError("processは:censoredまたは:truncatedにしてください"))
            end
        catch
            fit_failures += 1
            continue
        end

        if assessment.status == :warning
            geometry_warnings += 1
            skipped = profile_likelihood_intervals(
                objective, fit; assessment,
            )
            skipped.status == :skipped_weak_identification ||
                error("geometry warning後にprofileが停止しませんでした")
            continue
        end

        local profile
        try
            profile = profile_likelihood_intervals(objective, fit; assessment)
        catch
            profile_errors += 1
            continue
        end
        if profile.status == :search_limit
            profile_search_limits += 1
            continue
        end
        profile.status == :ok || error("未知のprofile statusです")

        wald = wald_intervals(fit)
        push!(wald_mu_cover, interval_contains(wald.mu, PROFILE_TRUE_MU))
        push!(wald_sigma_cover, interval_contains(wald.sigma, PROFILE_TRUE_SIGMA))
        push!(profile_mu_cover, interval_contains(profile.mu, PROFILE_TRUE_MU))
        push!(profile_sigma_cover, interval_contains(profile.sigma, PROFILE_TRUE_SIGMA))
    end

    profile_ok = length(profile_mu_cover)
    (
        process = process,
        sample_size = sample_size,
        severity = severity,
        attempts = PROFILE_REPETITIONS,
        fit_failures = fit_failures,
        geometry_warnings = geometry_warnings,
        profile_search_limits = profile_search_limits,
        profile_errors = profile_errors,
        profile_ok = profile_ok,
        resolved_rate = profile_ok / PROFILE_REPETITIONS,
        conditional_wald_coverage_mu = isempty(wald_mu_cover) ? missing : mean(wald_mu_cover),
        conditional_wald_coverage_sigma = isempty(wald_sigma_cover) ? missing : mean(wald_sigma_cover),
        conditional_profile_coverage_mu = isempty(profile_mu_cover) ? missing : mean(profile_mu_cover),
        conditional_profile_coverage_sigma = isempty(profile_sigma_cover) ? missing : mean(profile_sigma_cover),
    )
end

function rounded_profile(result)
    (; (key => value isa AbstractFloat ? round(value; digits = 4) : value
        for (key, value) in pairs(result))...)
end

function geometry_gate_summary(results)
    challenging = filter(result -> result.retained_fraction < 0.8, results)
    stable = filter(result -> result.retained_fraction == 0.8, results)
    catastrophic = sum(result -> result.catastrophic, results)
    catastrophic_warnings = sum(result -> result.catastrophic_warnings, results)
    challenging_catastrophic = sum(result -> result.catastrophic, challenging)
    challenging_accepts = sum(result -> result.optimizer_accepts, challenging)
    stable_warnings = sum(result -> result.warnings, stable)
    stable_attempts = sum(result -> result.attempts, stable)

    (
        catastrophic,
        catastrophic_warnings,
        challenging_catastrophic_rate = challenging_catastrophic /
            challenging_accepts,
        stable_warnings,
        stable_warning_rate = stable_warnings / stable_attempts,
    )
end

geometry_calibration_results = [
    geometry_calibration(sample_size, retained_fraction, 20261000 + 10i + j)
    for (i, sample_size) in enumerate((40, 120, 400))
    for (j, retained_fraction) in enumerate((0.8, 0.5, 0.1))
]
geometry_holdout_results = [
    geometry_calibration(sample_size, retained_fraction, 20262400 + 10i + j)
    for (i, sample_size) in enumerate((40, 120, 400))
    for (j, retained_fraction) in enumerate((0.8, 0.5, 0.1))
]

profile_results = [
    profile_pilot(:censored, 40, 0.2, 20262101),
    profile_pilot(:truncated, 40, 0.2, 20262102),
    profile_pilot(:truncated, 120, 0.2, 20262203),
    profile_pilot(:truncated, 40, 0.9, 20262103),
    profile_pilot(:truncated, 120, 0.9, 20262201),
    profile_pilot(:truncated, 400, 0.9, 20262202),
]

println("P2_IDENTIFICATION_GEOMETRY_CALIBRATION")
foreach(result -> println(rounded_profile(result)), geometry_calibration_results)
println("P2_IDENTIFICATION_GEOMETRY_HOLDOUT")
foreach(result -> println(rounded_profile(result)), geometry_holdout_results)
println("P2_PROFILE_PILOT")
foreach(result -> println(rounded_profile(result)), profile_results)
println("P2_IDENTIFICATION_GATE_SUMMARY")
calibration_gate = geometry_gate_summary(geometry_calibration_results)
holdout_gate = geometry_gate_summary(geometry_holdout_results)
println((matrix = :calibration, rounded_profile(calibration_gate)...))
println((matrix = :holdout, rounded_profile(holdout_gate)...))

@testset "P2 data-only identification and profile likelihood" begin
    for results in (geometry_calibration_results, geometry_holdout_results)
        @test length(results) == 9
        @test all(result -> result.attempts == GEOMETRY_REPETITIONS, results)
        @test all(
            result -> result.optimizer_accepts + result.fit_failures == result.attempts,
            results,
        )
        @test all(
            result -> result.warnings > 0,
            filter(result -> result.retained_fraction == 0.1, results),
        )
    end

    # Optimizer acceptance at the likelihood boundary can differ by a few fits
    # across Julia patch releases. Gate the scientific contract rather than an
    # incidental exact count: the difficult conditions must still reproduce a
    # meaningful failure rate, every catastrophic fit must be stopped, and the
    # stable conditions must keep a low warning rate.
    for gate in (calibration_gate, holdout_gate)
        @test MIN_CHALLENGING_CATASTROPHIC_RATE <=
              gate.challenging_catastrophic_rate <=
              MAX_CHALLENGING_CATASTROPHIC_RATE
        @test gate.catastrophic_warnings == gate.catastrophic
        @test gate.stable_warning_rate <= MAX_STABLE_WARNING_RATE
    end

    @test length(profile_results) == 6
    @test all(result -> result.attempts == PROFILE_REPETITIONS, profile_results)
    @test all(profile_results) do result
        result.fit_failures + result.geometry_warnings +
            result.profile_search_limits + result.profile_errors + result.profile_ok ==
            result.attempts
    end

    stable_censored = profile_results[1]
    stable_truncated = profile_results[3]
    @test stable_censored.profile_ok == PROFILE_REPETITIONS
    @test stable_truncated.profile_ok == PROFILE_REPETITIONS
    @test all(
        coverage -> 0.88 <= coverage <= 1,
        (
            stable_censored.conditional_profile_coverage_mu,
            stable_censored.conditional_profile_coverage_sigma,
            stable_truncated.conditional_profile_coverage_mu,
            stable_truncated.conditional_profile_coverage_sigma,
        ),
    )

    hard_truncated = profile_results[4:6]
    @test hard_truncated[1].resolved_rate < hard_truncated[2].resolved_rate <
          hard_truncated[3].resolved_rate
    @test hard_truncated[1].resolved_rate < 0.25
    @test hard_truncated[3].resolved_rate > 0.75
    for result in hard_truncated[2:3]
        @test result.conditional_profile_coverage_mu > result.conditional_wald_coverage_mu
        @test result.conditional_profile_coverage_sigma >
              result.conditional_wald_coverage_sigma
    end

    sample = rand(
        Xoshiro(20262301),
        truncated(PROFILE_TRUE_DISTRIBUTION; lower = 450.0),
        120,
    )
    fit = fit_truncated_normal(sample; lower = 450.0)
    geometry = likelihood_geometry(fit; observation = :truncated, lower = 450.0)
    normalized = (sample .- PROFILE_TRUE_MU) ./ PROFILE_TRUE_SIGMA
    normalized_lower = (450.0 - PROFILE_TRUE_MU) / PROFILE_TRUE_SIGMA
    normalized_fit = fit_truncated_normal(normalized; lower = normalized_lower)
    normalized_geometry = likelihood_geometry(
        normalized_fit; observation = :truncated, lower = normalized_lower,
    )
    @test geometry.scaled_condition_number ≈
          normalized_geometry.scaled_condition_number rtol = 1e-5
    @test geometry.covariance_correlation ≈
          normalized_geometry.covariance_correlation rtol = 1e-5
    @test geometry.relative_se_mu ≈ normalized_geometry.relative_se_mu rtol = 1e-5
    @test geometry.se_log_sigma ≈ normalized_geometry.se_log_sigma rtol = 1e-5
    @test_throws ArgumentError likelihood_geometry(fit; observation = :unknown)
    @test_throws ArgumentError profile_likelihood_intervals(identity, fit; level = 1.0)
end

println("P2_IDENTIFICATION_PROFILE_CHECK_PASS")
