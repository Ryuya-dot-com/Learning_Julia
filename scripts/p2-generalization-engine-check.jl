#!/usr/bin/env julia

# P2 research-only external validity and independent-engine check.
# Official SciPy references:
# https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.CensoredData.html
# https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.truncate.html
# https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.minimize.html
using Distributions
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
using .P2LikelihoodContracts

const GENERALIZATION_REPETITIONS = 120
const GENERALIZATION_TRUTHS = (Normal(-2, 0.35), Normal(1200, 250))
const GENERALIZATION_DESIGNS = (:left80, :right50, :central50, :left10, :central10)
const MIN_ONE_SIDED_CATASTROPHIC_RATE = 0.03
const MAX_ONE_SIDED_CATASTROPHIC_RATE = 0.06
const MIN_TWO_SIDED_FIT_FAILURE_RATE = 0.10
const MAX_TWO_SIDED_FIT_FAILURE_RATE = 0.15
const MIN_TWO_SIDED_CATASTROPHIC_RATE = 0.40
const MAX_TWO_SIDED_CATASTROPHIC_RATE = 0.55
const MIN_TWO_SIDED_MISS_RATE = 0.30
const MAX_TWO_SIDED_MISS_RATE = 0.45

function truncation_bounds(distribution, design)
    if design == :left80
        (quantile(distribution, 0.2), Inf)
    elseif design == :right50
        (-Inf, quantile(distribution, 0.5))
    elseif design == :central50
        (quantile(distribution, 0.25), quantile(distribution, 0.75))
    elseif design == :left10
        (quantile(distribution, 0.9), Inf)
    elseif design == :central10
        (quantile(distribution, 0.45), quantile(distribution, 0.55))
    else
        throw(ArgumentError("未知のtruncation designです"))
    end
end

function generalization_scenario(distribution, truth_id, design, sample_size, seed)
    true_mu, true_sigma = params(distribution)
    lower, upper = truncation_bounds(distribution, design)
    selected_distribution = truncated(distribution, lower, upper)
    rng = Xoshiro(seed)
    optimizer_accepts = 0
    fit_failures = 0
    catastrophic = 0
    warnings = 0
    catastrophic_warnings = 0

    for _ in 1:GENERALIZATION_REPETITIONS
        observed = rand(rng, selected_distribution, sample_size)
        try
            fit = fit_truncated_normal(observed; lower, upper)
            optimizer_accepts += 1
            is_catastrophic = abs(mean(fit.distribution) - true_mu) > 5true_sigma ||
                std(fit.distribution) > 5true_sigma ||
                std(fit.distribution) < true_sigma / 5
            catastrophic += is_catastrophic
            assessment = weak_identification_assessment(
                fit; observation = :truncated, lower, upper,
            )
            is_warning = assessment.status == :warning
            warnings += is_warning
            catastrophic_warnings += is_catastrophic && is_warning
        catch
            fit_failures += 1
        end
    end

    (
        truth_id = truth_id,
        true_mu = true_mu,
        true_sigma = true_sigma,
        design = design,
        sample_size = sample_size,
        attempts = GENERALIZATION_REPETITIONS,
        optimizer_accepts = optimizer_accepts,
        fit_failures = fit_failures,
        catastrophic = catastrophic,
        warnings = warnings,
        catastrophic_warnings = catastrophic_warnings,
    )
end

function scipy_reference(mode, observed, states, lower, upper)
    length(observed) == length(states) || throw(DimensionMismatch("state長が一致しません"))
    script = joinpath(@__DIR__, "p2-scipy-reference.py")
    mktempdir() do directory
        input_path = joinpath(directory, "observations.csv")
        open(input_path, "w") do io
            println(io, "observed,state")
            for (value, state) in zip(observed, states)
                println(io, value, ",", state)
            end
        end
        output = read(
            `python3 $script --mode=$(String(mode)) --input=$input_path --lower=$lower --upper=$upper`,
            String,
        )
        fields = split(chomp(output), '\t')
        length(fields) == 7 || error("SciPy reference outputの列数が不正です")
        (
            mu = parse(Float64, fields[1]),
            sigma = parse(Float64, fields[2]),
            nll = parse(Float64, fields[3]),
            success = fields[4] == "true",
            scipy = fields[5],
            numpy = fields[6],
            engine = fields[7],
        )
    end
end

function compare_censored(distribution, sample_size, censor_fraction, seed)
    lower = quantile(distribution, censor_fraction / 2)
    upper = quantile(distribution, 1 - censor_fraction / 2)
    observed, left, right = simulate_censored(
        Xoshiro(seed), distribution, sample_size, lower, upper,
    )
    fit = fit_censored_normal(observed, left, right, lower, upper)
    states = [left[i] ? "left" : right[i] ? "right" : "uncensored"
              for i in eachindex(observed)]
    reference = scipy_reference(:censored, observed, states, lower, upper)
    (
        process = :censored,
        true_mu = mean(distribution),
        true_sigma = std(distribution),
        julia_mu = mean(fit.distribution),
        julia_sigma = std(fit.distribution),
        julia_nll = normal_censored_nll(
            fit.raw, observed, left, right, lower, upper,
        ),
        reference = reference,
    )
end

function compare_truncated(distribution, sample_size, lower, upper, seed)
    observed = rand(
        Xoshiro(seed), truncated(distribution, lower, upper), sample_size,
    )
    fit = fit_truncated_normal(observed; lower, upper)
    reference = scipy_reference(
        :truncated, observed, fill("selected", sample_size), lower, upper,
    )
    (
        process = :truncated,
        true_mu = mean(distribution),
        true_sigma = std(distribution),
        julia_mu = mean(fit.distribution),
        julia_sigma = std(fit.distribution),
        julia_nll = normal_truncated_nll(fit.raw, observed, lower, upper),
        reference = reference,
    )
end

generalization_results = [
    generalization_scenario(
        distribution,
        truth_id,
        design,
        sample_size,
        20263000 + 100truth_id + 10design_id + sample_id,
    )
    for (truth_id, distribution) in enumerate(GENERALIZATION_TRUTHS)
    for (design_id, design) in enumerate(GENERALIZATION_DESIGNS)
    for (sample_id, sample_size) in enumerate((40, 120))
]

engine_results = [
    compare_censored(Normal(-2, 0.35), 600, 0.4, 20264001),
    compare_censored(Normal(1200, 250), 600, 0.2, 20264002),
    compare_truncated(
        Normal(-2, 0.35), 600, quantile(Normal(-2, 0.35), 0.2), Inf, 20264003,
    ),
    compare_truncated(
        Normal(1200, 250), 600, -Inf, quantile(Normal(1200, 250), 0.8), 20264004,
    ),
    compare_truncated(
        Normal(520, 85),
        600,
        quantile(Normal(520, 85), 0.1),
        quantile(Normal(520, 85), 0.9),
        20264005,
    ),
]

println("P2_GENERALIZATION_MATRIX")
foreach(println, generalization_results)
println("P2_INDEPENDENT_ENGINE")
foreach(println, engine_results)

function generalization_gate_summary(results)
    attempts = sum(result -> result.attempts, results)
    optimizer_accepts = sum(result -> result.optimizer_accepts, results)
    fit_failures = sum(result -> result.fit_failures, results)
    catastrophic = sum(result -> result.catastrophic, results)
    catastrophic_warnings = sum(
        result -> result.catastrophic_warnings, results,
    )
    missed_catastrophic = catastrophic - catastrophic_warnings
    (
        attempts,
        optimizer_accepts,
        fit_failures,
        fit_failure_rate = fit_failures / attempts,
        catastrophic,
        catastrophic_rate = catastrophic / optimizer_accepts,
        catastrophic_warnings,
        missed_catastrophic,
        miss_rate = missed_catastrophic / catastrophic,
    )
end

stable_one_sided = filter(
    result -> result.design == :left80,
    generalization_results,
)
one_sided = filter(
    result -> result.design in (:left80, :right50, :left10),
    generalization_results,
)
two_sided = filter(
    result -> result.design in (:central50, :central10),
    generalization_results,
)
one_sided_gate = generalization_gate_summary(one_sided)
two_sided_gate = generalization_gate_summary(two_sided)
println("P2_GENERALIZATION_GATE_SUMMARY")
println((scope = :one_sided, one_sided_gate...))
println((scope = :two_sided, two_sided_gate...))

@testset "P2 generalization and independent engine" begin
    @test length(generalization_results) == 20
    @test all(result -> result.attempts == GENERALIZATION_REPETITIONS, generalization_results)
    @test all(
        result -> result.optimizer_accepts + result.fit_failures == result.attempts,
        generalization_results,
    )

    @test sum(result -> result.fit_failures, stable_one_sided) == 0
    @test sum(result -> result.catastrophic, stable_one_sided) == 0
    @test sum(result -> result.warnings, stable_one_sided) == 0

    @test MIN_ONE_SIDED_CATASTROPHIC_RATE <=
          one_sided_gate.catastrophic_rate <=
          MAX_ONE_SIDED_CATASTROPHIC_RATE
    @test one_sided_gate.catastrophic_warnings == one_sided_gate.catastrophic

    @test MIN_TWO_SIDED_FIT_FAILURE_RATE <=
          two_sided_gate.fit_failure_rate <=
          MAX_TWO_SIDED_FIT_FAILURE_RATE
    @test MIN_TWO_SIDED_CATASTROPHIC_RATE <=
          two_sided_gate.catastrophic_rate <=
          MAX_TWO_SIDED_CATASTROPHIC_RATE
    @test MIN_TWO_SIDED_MISS_RATE <= two_sided_gate.miss_rate <=
          MAX_TWO_SIDED_MISS_RATE

    @test length(engine_results) == 5
    for result in engine_results
        @test result.reference.success
        @test result.reference.scipy == "1.17.1"
        @test result.reference.numpy == "2.4.2"
        @test abs(result.julia_mu - result.reference.mu) / result.true_sigma < 1e-4
        @test abs(result.julia_sigma - result.reference.sigma) / result.true_sigma < 1e-4
        @test abs(result.julia_nll - result.reference.nll) < 1e-5
    end
    @test count(
        result -> result.reference.engine == "scipy.stats.CensoredData+norm.fit",
        engine_results,
    ) == 2
    @test count(
        result -> result.reference.engine ==
                  "scipy.stats.truncate+scipy.optimize.Nelder-Mead",
        engine_results,
    ) == 3
end

println("P2_GENERALIZATION_ENGINE_CHECK_PASS")
