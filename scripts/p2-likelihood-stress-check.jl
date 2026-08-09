#!/usr/bin/env julia

# P2 research stress matrix. Wald coverage is reported both conditional on a
# successful fit and unconditionally as the rate of attempts that produced an
# interval containing the truth. The latter keeps optimization/Hessian failure
# visible instead of silently dropping difficult samples.
using Distributions
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
using .P2LikelihoodContracts

const TRUE_DISTRIBUTION = Normal(520, 85)
const TRUE_MU, TRUE_SIGMA = params(TRUE_DISTRIBUTION)
const REPETITIONS = 160

function failure_name(error)
    string(nameof(typeof(error)))
end

function fit_summary(estimates_mu, estimates_sigma, covers_mu, covers_sigma, attempts, failures)
    optimizer_accepts = length(estimates_mu)
    catastrophic_recoveries = count(eachindex(estimates_mu)) do index
        abs(estimates_mu[index] - TRUE_MU) > 5TRUE_SIGMA ||
            estimates_sigma[index] > 5TRUE_SIGMA ||
            estimates_sigma[index] < TRUE_SIGMA / 5
    end
    (
        attempts = attempts,
        optimizer_accepts = optimizer_accepts,
        optimizer_accept_rate = optimizer_accepts / attempts,
        catastrophic_recoveries = catastrophic_recoveries,
        bounded_recovery_rate = (optimizer_accepts - catastrophic_recoveries) / attempts,
        bias_mu = optimizer_accepts == 0 ? missing : mean(estimates_mu) - TRUE_MU,
        bias_sigma = optimizer_accepts == 0 ? missing : mean(estimates_sigma) - TRUE_SIGMA,
        rmse_mu = optimizer_accepts == 0 ? missing : sqrt(mean((estimates_mu .- TRUE_MU) .^ 2)),
        rmse_sigma = optimizer_accepts == 0 ? missing : sqrt(mean((estimates_sigma .- TRUE_SIGMA) .^ 2)),
        conditional_coverage_mu = optimizer_accepts == 0 ? missing : mean(covers_mu),
        conditional_coverage_sigma = optimizer_accepts == 0 ? missing : mean(covers_sigma),
        attempt_coverage_mu = sum(covers_mu) / attempts,
        attempt_coverage_sigma = sum(covers_sigma) / attempts,
        failures = sort(collect(failures)),
    )
end

function censored_stress(sample_size, censor_fraction, repetitions, seed)
    tail_fraction = censor_fraction / 2
    lower = quantile(TRUE_DISTRIBUTION, tail_fraction)
    upper = quantile(TRUE_DISTRIBUTION, 1 - tail_fraction)
    rng = Xoshiro(seed)
    estimates_mu = Float64[]
    estimates_sigma = Float64[]
    covers_mu = Bool[]
    covers_sigma = Bool[]
    realized_censor_fraction = Float64[]
    failures = Dict{String, Int}()

    for _ in 1:repetitions
        observed, left, right = simulate_censored(
            rng, TRUE_DISTRIBUTION, sample_size, lower, upper,
        )
        push!(realized_censor_fraction, mean(left .| right))
        try
            fit = fit_censored_normal(observed, left, right, lower, upper)
            interval = wald_intervals(fit)
            push!(estimates_mu, mean(fit.distribution))
            push!(estimates_sigma, std(fit.distribution))
            push!(covers_mu, interval_contains(interval.mu, TRUE_MU))
            push!(covers_sigma, interval_contains(interval.sigma, TRUE_SIGMA))
        catch error
            name = failure_name(error)
            failures[name] = get(failures, name, 0) + 1
        end
    end

    merge(
        (
            process = :censored,
            sample_size = sample_size,
            severity = censor_fraction,
            realized_fraction = mean(realized_censor_fraction),
        ),
        fit_summary(
            estimates_mu,
            estimates_sigma,
            covers_mu,
            covers_sigma,
            repetitions,
            failures,
        ),
    )
end

function truncated_stress(sample_size, retained_fraction, repetitions, seed)
    lower = quantile(TRUE_DISTRIBUTION, 1 - retained_fraction)
    selected_distribution = truncated(TRUE_DISTRIBUTION; lower)
    rng = Xoshiro(seed)
    estimates_mu = Float64[]
    estimates_sigma = Float64[]
    covers_mu = Bool[]
    covers_sigma = Bool[]
    failures = Dict{String, Int}()

    for _ in 1:repetitions
        observed = rand(rng, selected_distribution, sample_size)
        try
            fit = fit_truncated_normal(observed; lower)
            interval = wald_intervals(fit)
            push!(estimates_mu, mean(fit.distribution))
            push!(estimates_sigma, std(fit.distribution))
            push!(covers_mu, interval_contains(interval.mu, TRUE_MU))
            push!(covers_sigma, interval_contains(interval.sigma, TRUE_SIGMA))
        catch error
            name = failure_name(error)
            failures[name] = get(failures, name, 0) + 1
        end
    end

    merge(
        (
            process = :truncated,
            sample_size = sample_size,
            severity = 1 - retained_fraction,
            retained_fraction = retained_fraction,
        ),
        fit_summary(
            estimates_mu,
            estimates_sigma,
            covers_mu,
            covers_sigma,
            repetitions,
            failures,
        ),
    )
end

function start_sensitivity(process, sample_size, severity, seed)
    rng = Xoshiro(seed)
    starts = [
        [TRUE_MU, log(TRUE_SIGMA)],
        [TRUE_MU - TRUE_SIGMA, log(TRUE_SIGMA / 2)],
        [TRUE_MU + TRUE_SIGMA, log(TRUE_SIGMA * 2)],
        [TRUE_MU - 2TRUE_SIGMA, log(TRUE_SIGMA * 2)],
        [TRUE_MU + 2TRUE_SIGMA, log(TRUE_SIGMA / 2)],
    ]

    fit_one = if process == :censored
        tail_fraction = severity / 2
        lower = quantile(TRUE_DISTRIBUTION, tail_fraction)
        upper = quantile(TRUE_DISTRIBUTION, 1 - tail_fraction)
        observed, left, right = simulate_censored(
            rng, TRUE_DISTRIBUTION, sample_size, lower, upper,
        )
        initial -> fit_censored_normal(
            observed, left, right, lower, upper; initial_raw = initial,
        )
    elseif process == :truncated
        retained_fraction = 1 - severity
        lower = quantile(TRUE_DISTRIBUTION, 1 - retained_fraction)
        observed = rand(rng, truncated(TRUE_DISTRIBUTION; lower), sample_size)
        initial -> fit_truncated_normal(observed; lower, initial_raw = initial)
    else
        throw(ArgumentError("processは:censoredまたは:truncatedで指定してください"))
    end

    estimates = Vector{Vector{Float64}}()
    failures = Dict{String, Int}()
    for initial in starts
        try
            push!(estimates, fit_one(initial).raw)
        catch error
            name = failure_name(error)
            failures[name] = get(failures, name, 0) + 1
        end
    end
    spread = isempty(estimates) ? [Inf, Inf] : [
        maximum(first.(estimates)) - minimum(first.(estimates)),
        maximum(last.(estimates)) - minimum(last.(estimates)),
    ]
    (
        process = process,
        sample_size = sample_size,
        severity = severity,
        attempts = length(starts),
        successes = length(estimates),
        spread_mu = spread[1],
        spread_log_sigma = spread[2],
        reference_mu = isempty(estimates) ? missing : estimates[1][1],
        reference_sigma = isempty(estimates) ? missing : exp(estimates[1][2]),
        catastrophic_recovery = isempty(estimates) ? missing :
            abs(estimates[1][1] - TRUE_MU) > 5TRUE_SIGMA ||
            exp(estimates[1][2]) > 5TRUE_SIGMA ||
            exp(estimates[1][2]) < TRUE_SIGMA / 5,
        failures = sort(collect(failures)),
    )
end

function rounded(result)
    (; (key => value isa AbstractFloat ? round(value; digits = 4) : value
        for (key, value) in pairs(result))...)
end

censored_results = [
    censored_stress(sample_size, censor_fraction, REPETITIONS, 20260900 + 10i + j)
    for (i, sample_size) in enumerate((40, 120, 400))
    for (j, censor_fraction) in enumerate((0.2, 0.6, 0.9))
]
truncated_results = [
    truncated_stress(sample_size, retained_fraction, REPETITIONS, 20261000 + 10i + j)
    for (i, sample_size) in enumerate((40, 120, 400))
    for (j, retained_fraction) in enumerate((0.8, 0.5, 0.1))
]
start_results = [
    start_sensitivity(:censored, 240, 0.6, 20261101),
    start_sensitivity(:truncated, 240, 0.5, 20261102),
    start_sensitivity(:censored, 40, 0.9, 20261103),
    start_sensitivity(:truncated, 40, 0.9, 20261104),
]

println("P2_STRESS_CENSORED")
foreach(result -> println(rounded(result)), censored_results)
println("P2_STRESS_TRUNCATED")
foreach(result -> println(rounded(result)), truncated_results)
println("P2_STRESS_STARTS")
foreach(result -> println(rounded(result)), start_results)

@testset "P2 likelihood stress boundary" begin
    @test length(censored_results) == 9
    @test length(truncated_results) == 9
    @test all(result -> result.attempts == REPETITIONS, censored_results)
    @test all(result -> result.attempts == REPETITIONS, truncated_results)

    stable_censored = only(filter(
        result -> result.sample_size == 400 && result.severity == 0.2,
        censored_results,
    ))
    stable_truncated = only(filter(
        result -> result.sample_size == 400 && result.retained_fraction == 0.8,
        truncated_results,
    ))
    @test stable_censored.optimizer_accept_rate >= 0.98
    @test stable_censored.bounded_recovery_rate >= 0.98
    @test abs(stable_censored.bias_mu) < 3
    @test abs(stable_censored.bias_sigma) < 3
    @test 0.88 <= stable_censored.conditional_coverage_mu <= 1
    @test 0.88 <= stable_censored.conditional_coverage_sigma <= 1
    @test stable_truncated.optimizer_accept_rate >= 0.98
    @test stable_truncated.bounded_recovery_rate >= 0.98
    @test abs(stable_truncated.bias_mu) < 3
    @test abs(stable_truncated.bias_sigma) < 3
    @test 0.88 <= stable_truncated.conditional_coverage_mu <= 1
    @test 0.88 <= stable_truncated.conditional_coverage_sigma <= 1

    hard_results = filter(
        result -> result.sample_size == 40 && result.severity == 0.9,
        vcat(censored_results, truncated_results),
    )
    @test length(hard_results) == 2
    @test any(
        result -> result.optimizer_accept_rate < 0.95 ||
                  result.bounded_recovery_rate < 0.90 ||
                  min(result.attempt_coverage_mu, result.attempt_coverage_sigma) < 0.88,
        hard_results,
    )

    @test all(result -> result.attempts == 5, start_results)
    @test all(result -> result.successes + sum(last, result.failures; init = 0) == 5, start_results)
    for result in start_results[1:2]
        @test result.successes == 5
        @test result.spread_mu < 1e-3
        @test result.spread_log_sigma < 1e-5
    end

    @test_throws ArgumentError fit_censored_normal(
        [460.0, 500.0, 650.0],
        [true, false, false],
        [false, false, true],
        460.0,
        650.0;
        initial_raw = [520.0],
    )
    @test_throws ArgumentError fit_truncated_normal(
        [500.0, 550.0]; lower = 450.0, initial_raw = [520.0, Inf],
    )
end

println("P2_LIKELIHOOD_STRESS_CHECK_PASS")
