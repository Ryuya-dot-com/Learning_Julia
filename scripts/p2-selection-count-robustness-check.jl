#!/usr/bin/env julia

# P2 research-only misspecification stress for the Normal selection-count fit.
# PASS means that known family and metadata failures remain visible; it does not
# establish robustness or promote this code to a public lesson API.
# Official references:
# https://juliastats.org/Distributions.jl/stable/truncate/
# https://juliastats.org/Distributions.jl/stable/univariate/
# https://juliastats.org/Distributions.jl/stable/fit/
# https://julianlsolvers.github.io/Optim.jl/stable/user/config/
using Distributions
using Random
using Statistics
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
using .P2LikelihoodContracts

const ROBUSTNESS_REPETITIONS = 80
const ROBUSTNESS_TOTAL_SCREENED = 4_000
const ROBUSTNESS_SELECTION_PROBABILITIES = (0.45, 0.55)
const MAX_OBSERVED_SELECTION_RATE_GAP = 0.02
const MIN_LOGNORMAL_NEGATIVE_MASS = 0.05
const MAX_LOGNORMAL_NEGATIVE_MASS = 0.25
const MIN_MISSPECIFIED_UPPER_QUANTILE_RATIO = 0.30
const MAX_MISSPECIFIED_UPPER_QUANTILE_RATIO = 0.70
const MIN_BASELINE_SCALE_RATIO = 0.75
const MAX_BASELINE_SCALE_RATIO = 1.05
const MIN_WIDE_BOUNDARY_SCALE_RATIO = 1.70
const MAX_WIDE_BOUNDARY_SCALE_RATIO = 2.20
const MIN_LOW_COUNT_SCALE_RATIO = 0.75
const MAX_LOW_COUNT_SCALE_RATIO = 0.90
const MIN_HIGH_COUNT_SCALE_RATIO = 1.08
const MAX_HIGH_COUNT_SCALE_RATIO = 1.25

function selected_values(rng, distribution, total_screened, lower, upper)
    screened = rand(rng, distribution, total_screened)
    filter(value -> lower < value < upper, screened)
end

function family_misspecification_scenario(
    distribution,
    family,
    upper_probability,
    seed,
)
    lower, upper = quantile.(Ref(distribution), ROBUSTNESS_SELECTION_PROBABILITIES)
    true_upper_quantile = quantile(distribution, upper_probability)
    rng = Xoshiro(seed)
    fit_failures = 0
    selection_rate_gaps = Float64[]
    negative_masses = Float64[]
    upper_quantile_ratios = Float64[]

    for _ in 1:ROBUSTNESS_REPETITIONS
        observed = selected_values(
            rng, distribution, ROBUSTNESS_TOTAL_SCREENED, lower, upper,
        )
        try
            fit = fit_selection_count_normal(
                observed, ROBUSTNESS_TOTAL_SCREENED; lower, upper,
            )
            fitted = fit.distribution
            fitted_selection_rate = exp(
                log_selection_probability(fitted, lower, upper),
            )
            observed_selection_rate = length(observed) / ROBUSTNESS_TOTAL_SCREENED
            push!(
                selection_rate_gaps,
                abs(fitted_selection_rate - observed_selection_rate),
            )
            push!(negative_masses, cdf(fitted, 0.0))
            push!(
                upper_quantile_ratios,
                quantile(fitted, upper_probability) / true_upper_quantile,
            )
        catch
            fit_failures += 1
        end
    end

    (
        family,
        attempts = ROBUSTNESS_REPETITIONS,
        fit_failures,
        mean_selection_rate_gap = mean(selection_rate_gaps),
        mean_negative_mass = mean(negative_masses),
        upper_probability,
        mean_upper_quantile_ratio = mean(upper_quantile_ratios),
    )
end

function metadata_misspecification_scenario(seed)
    truth = Normal(37, 1.7)
    true_mu, true_sigma = params(truth)
    lower, upper = quantile.(Ref(truth), ROBUSTNESS_SELECTION_PROBABILITIES)
    center = (lower + upper) / 2
    half_width = (upper - lower) / 2
    recorded_lower = center - 2half_width
    recorded_upper = center + 2half_width
    low_recorded_total = round(Int, 0.8ROBUSTNESS_TOTAL_SCREENED)
    high_recorded_total = round(Int, 1.2ROBUSTNESS_TOTAL_SCREENED)
    rng = Xoshiro(seed)
    fit_failures = Dict(
        :baseline => 0,
        :wide_boundary => 0,
        :low_count => 0,
        :high_count => 0,
    )
    baseline_mu_biases = Float64[]
    baseline_scale_ratios = Float64[]
    wide_boundary_scale_ratios = Float64[]
    low_count_scale_ratios = Float64[]
    high_count_scale_ratios = Float64[]

    for _ in 1:ROBUSTNESS_REPETITIONS
        observed = selected_values(
            rng, truth, ROBUSTNESS_TOTAL_SCREENED, lower, upper,
        )
        fits = Dict{Symbol, Any}()
        settings = (
            baseline = (ROBUSTNESS_TOTAL_SCREENED, lower, upper),
            wide_boundary = (
                ROBUSTNESS_TOTAL_SCREENED, recorded_lower, recorded_upper,
            ),
            low_count = (low_recorded_total, lower, upper),
            high_count = (high_recorded_total, lower, upper),
        )
        for (label, (recorded_total, fit_lower, fit_upper)) in pairs(settings)
            try
                fits[label] = fit_selection_count_normal(
                    observed, recorded_total; lower = fit_lower, upper = fit_upper,
                )
            catch
                fit_failures[label] += 1
            end
        end
        length(fits) == length(settings) || continue

        baseline_mu = mean(fits[:baseline].distribution)
        baseline_sigma = std(fits[:baseline].distribution)
        push!(baseline_mu_biases, (baseline_mu - true_mu) / true_sigma)
        push!(baseline_scale_ratios, baseline_sigma / true_sigma)
        push!(
            wide_boundary_scale_ratios,
            std(fits[:wide_boundary].distribution) / baseline_sigma,
        )
        push!(
            low_count_scale_ratios,
            std(fits[:low_count].distribution) / baseline_sigma,
        )
        push!(
            high_count_scale_ratios,
            std(fits[:high_count].distribution) / baseline_sigma,
        )
    end

    (
        attempts = ROBUSTNESS_REPETITIONS,
        fit_failures = (; pairs(fit_failures)...),
        mean_baseline_mu_bias_in_sigma = mean(baseline_mu_biases),
        mean_baseline_scale_ratio = mean(baseline_scale_ratios),
        mean_wide_boundary_scale_ratio = mean(wide_boundary_scale_ratios),
        mean_low_count_scale_ratio = mean(low_count_scale_ratios),
        mean_high_count_scale_ratio = mean(high_count_scale_ratios),
    )
end

function rounded_robustness(result)
    (; (key => value isa AbstractFloat ? round(value; digits = 4) : value
        for (key, value) in pairs(result))...)
end

family_results = (
    family_misspecification_scenario(
        LogNormal(0, 0.8), :lognormal, 0.95, 20278001,
    ),
    family_misspecification_scenario(
        TDist(3), :student_t_3, 0.99, 20278002,
    ),
)
metadata_result = metadata_misspecification_scenario(20278003)

truth = Normal(37, 1.7)
lower, upper = quantile.(Ref(truth), ROBUSTNESS_SELECTION_PROBABILITIES)
example_observed = selected_values(
    Xoshiro(20278004), truth, ROBUSTNESS_TOTAL_SCREENED, lower, upper,
)
center = (lower + upper) / 2
half_width = (upper - lower) / 2

println("P2_SELECTION_COUNT_FAMILY_MISSPECIFICATION")
foreach(result -> println(rounded_robustness(result)), family_results)
println("P2_SELECTION_COUNT_METADATA_MISSPECIFICATION")
println(rounded_robustness(metadata_result))

@testset "P2 selection-count model misspecification boundary" begin
    @test all(result -> result.attempts == ROBUSTNESS_REPETITIONS, family_results)
    @test all(result -> result.fit_failures == 0, family_results)
    @test all(
        result -> result.mean_selection_rate_gap <= MAX_OBSERVED_SELECTION_RATE_GAP,
        family_results,
    )

    lognormal_result = only(filter(result -> result.family == :lognormal, family_results))
    student_result = only(filter(result -> result.family == :student_t_3, family_results))
    @test MIN_LOGNORMAL_NEGATIVE_MASS <=
          lognormal_result.mean_negative_mass <=
          MAX_LOGNORMAL_NEGATIVE_MASS
    for result in (lognormal_result, student_result)
        @test MIN_MISSPECIFIED_UPPER_QUANTILE_RATIO <=
              result.mean_upper_quantile_ratio <=
              MAX_MISSPECIFIED_UPPER_QUANTILE_RATIO
    end

    @test all(==(0), values(metadata_result.fit_failures))
    @test abs(metadata_result.mean_baseline_mu_bias_in_sigma) < 0.1
    @test MIN_BASELINE_SCALE_RATIO <=
          metadata_result.mean_baseline_scale_ratio <=
          MAX_BASELINE_SCALE_RATIO
    @test MIN_WIDE_BOUNDARY_SCALE_RATIO <=
          metadata_result.mean_wide_boundary_scale_ratio <=
          MAX_WIDE_BOUNDARY_SCALE_RATIO
    @test MIN_LOW_COUNT_SCALE_RATIO <=
          metadata_result.mean_low_count_scale_ratio <=
          MAX_LOW_COUNT_SCALE_RATIO
    @test MIN_HIGH_COUNT_SCALE_RATIO <=
          metadata_result.mean_high_count_scale_ratio <=
          MAX_HIGH_COUNT_SCALE_RATIO
    @test metadata_result.mean_wide_boundary_scale_ratio >
          metadata_result.mean_high_count_scale_ratio > 1 >
          metadata_result.mean_low_count_scale_ratio

    @test_throws ArgumentError fit_selection_count_normal(
        example_observed,
        length(example_observed) - 1;
        lower,
        upper,
    )
    @test_throws ArgumentError fit_selection_count_normal(
        example_observed,
        ROBUSTNESS_TOTAL_SCREENED;
        lower = center - half_width / 2,
        upper = center + half_width / 2,
    )
end

println("P2_SELECTION_COUNT_ROBUSTNESS_CHECK_PASS")
