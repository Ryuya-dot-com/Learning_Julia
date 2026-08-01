#!/usr/bin/env julia

# L33「古典的テスト理論と項目分析」の掲載値と反例を固定検証する。
# 例:
#   julia --project=/path/to/validation-env scripts/classical-test-theory-check.jl

using Test
using Random
using Statistics
using LinearAlgebra
using Distributions
using DataFrames

logistic(x) = 1 / (1 + exp(-x))

function simulate_binary_items(rng, theta, difficulty, discrimination)
    probability = logistic.(
        discrimination' .* (theta .- difficulty'))
    return Int.(rand(rng, size(probability)...) .< probability)
end

function corrected_item_total(items)
    total = vec(sum(items, dims = 2))
    return [cor(items[:, j], total .- items[:, j])
            for j in axes(items, 2)]
end

function raw_item_total(items)
    total = vec(sum(items, dims = 2))
    return [cor(items[:, j], total) for j in axes(items, 2)]
end

function coefficient_alpha(items)
    k = size(items, 2)
    total = vec(sum(items, dims = 2))
    return k / (k - 1) *
           (1 - sum(vec(var(items, dims = 1))) / var(total))
end

function alpha_if_deleted(items)
    return [coefficient_alpha(items[:, axes(items, 2) .!= j])
            for j in axes(items, 2)]
end

function wilson_interval(successes, trials; level = 0.95)
    z = quantile(Normal(), 1 - (1 - level) / 2)
    p = successes / trials
    denominator = 1 + z^2 / trials
    center = (p + z^2 / (2trials)) / denominator
    half_width = z * sqrt(p * (1 - p) / trials + z^2 / (4trials^2)) /
                 denominator
    return (center - half_width, center + half_width)
end

function omega_one_factor(loadings, error_variances; factor_variance = 1.0)
    true_variance = sum(loadings)^2 * factor_variance
    return true_variance / (true_variance + sum(error_variances))
end

function cohens_kappa(table)
    n = sum(table)
    observed = tr(table) / n
    row_probability = vec(sum(table, dims = 2)) / n
    column_probability = vec(sum(table, dims = 1)) / n
    expected = sum(row_probability .* column_probability)
    return (observed = observed, expected = expected,
            kappa = (observed - expected) / (1 - expected))
end

@testset "通過率と修正済み項目合計相関" begin
    rng = Xoshiro(3201)
    n = 600
    theta = randn(rng, n)
    difficulty = [-1.5, -1.0, -0.5, 0.0, 0.4, 0.8, 1.2, 0.0]
    discrimination = [1.4, 1.2, 1.1, 1.3, 1.0, 0.9, 1.2, -0.7]
    raw_items = simulate_binary_items(
        rng, theta, difficulty, discrimination)
    pass_rate = vec(mean(raw_items, dims = 1))
    raw_correlation = raw_item_total(raw_items)
    corrected_correlation = corrected_item_total(raw_items)
    interval_item4 = wilson_interval(sum(raw_items[:, 4]), n)

    @test all(0 .< pass_rate .< 1)
    @test pass_rate[1] > pass_rate[7]
    @test all(raw_correlation .> corrected_correlation)
    @test corrected_correlation[8] < 0
    @test interval_item4[1] < pass_rate[4] < interval_item4[2]

    println((
        first_three_rows = raw_items[1:3, :],
        pass_rate = round.(pass_rate, digits = 3),
        raw_item_total = round.(raw_correlation, digits = 3),
        corrected_item_total = round.(corrected_correlation, digits = 3),
        item4_wilson_interval = round.(collect(interval_item4), digits = 3),
    ))

    scored_items = copy(raw_items)
    scored_items[:, 8] .= 1 .- scored_items[:, 8]
    corrected_scored = corrected_item_total(scored_items)
    alpha_raw = coefficient_alpha(raw_items)
    alpha_scored = coefficient_alpha(scored_items)
    alpha_deleted = alpha_if_deleted(raw_items)
    alpha_without_item8 = coefficient_alpha(raw_items[:, 1:7])

    @test corrected_scored[8] > 0
    @test alpha_scored > alpha_raw + 0.1
    @test alpha_without_item8 > alpha_raw
    @test argmax(alpha_deleted) == 8

    println((
        item8_corrected_before_after =
            round.([corrected_correlation[8], corrected_scored[8]], digits = 3),
        alpha_raw = round(alpha_raw, digits = 3),
        alpha_reverse_scored = round(alpha_scored, digits = 3),
        alpha_without_item8 = round(alpha_without_item8, digits = 3),
        alpha_if_deleted = round.(alpha_deleted, digits = 3),
    ))

    score = vec(sum(scored_items, dims = 2))
    sem = std(score) * sqrt(1 - alpha_scored)
    duplicated_items = repeat(scored_items, 1, 2)
    alpha_duplicated = coefficient_alpha(duplicated_items)

    @test 0 < sem < std(score)
    @test alpha_duplicated > alpha_scored
    @test cor(score, vec(sum(duplicated_items, dims = 2))) ≈ 1

    println((
        score_sd = round(std(score), digits = 3),
        sem_using_alpha = round(sem, digits = 3),
        alpha_original = round(alpha_scored, digits = 3),
        alpha_after_exact_duplication = round(alpha_duplicated, digits = 3),
        score_correlation = cor(score, vec(sum(duplicated_items, dims = 2))),
    ))
end


@testset "KR-20は二値項目のalphaと同じ分散分解" begin
    rng = Xoshiro(3201)
    n = 600
    theta = randn(rng, n)
    difficulty = [-1.5, -1.0, -0.5, 0.0, 0.4, 0.8, 1.2, 0.0]
    discrimination = [1.4, 1.2, 1.1, 1.3, 1.0, 0.9, 1.2, -0.7]
    items = simulate_binary_items(rng, theta, difficulty, discrimination)
    items[:, 8] .= 1 .- items[:, 8]
    k = size(items, 2)
    p = vec(mean(items, dims = 1))
    total = vec(sum(items, dims = 2))
    kr20 = k / (k - 1) *
           (1 - sum(p .* (1 .- p)) * n / (n - 1) / var(total))
    alpha = coefficient_alpha(items)

    @test kr20 ≈ alpha atol = 1e-12
    @test 0 < kr20 < 1
    println((alpha = round(alpha, digits = 3),
             kr20_same_variance_convention = round(kr20, digits = 3)))
end

@testset "tau等価ならalphaとomegaが一致しcongenericなら離れる" begin
    tau_loadings = fill(0.8, 6)
    tau_errors = fill(1.0, 6)
    congeneric_loadings = [0.2, 0.3, 0.4, 0.8, 1.2, 1.5]
    congeneric_errors = fill(1.0, 6)
    omega_tau = omega_one_factor(tau_loadings, tau_errors)
    omega_congeneric = omega_one_factor(
        congeneric_loadings, congeneric_errors)

    rng_tau = Xoshiro(3205)
    factor_tau = randn(rng_tau, 20_000)
    tau_items = factor_tau .* tau_loadings' .+
        randn(rng_tau, 20_000, 6) .* sqrt.(tau_errors)'
    rng_congeneric = Xoshiro(3206)
    factor_congeneric = randn(rng_congeneric, 20_000)
    congeneric_items = factor_congeneric .* congeneric_loadings' .+
        randn(rng_congeneric, 20_000, 6) .* sqrt.(congeneric_errors)'
    alpha_tau = coefficient_alpha(tau_items)
    alpha_congeneric = coefficient_alpha(congeneric_items)

    @test abs(alpha_tau - omega_tau) < 0.01
    @test omega_congeneric - alpha_congeneric > 0.05
    @test 0 < alpha_congeneric < omega_congeneric < 1

    println((
        tau_equivalent = (
            alpha = round(alpha_tau, digits = 3),
            omega = round(omega_tau, digits = 3)),
        congeneric = (
            alpha = round(alpha_congeneric, digits = 3),
            omega = round(omega_congeneric, digits = 3)),
    ))
end

@testset "Cohenのkappaは偶然一致を差し引く" begin
    balanced = cohens_kappa([45 5; 15 35])
    prevalent = cohens_kappa([90 5; 4 1])

    @test balanced.observed == 0.8
    @test balanced.expected == 0.5
    @test balanced.kappa ≈ 0.6
    @test prevalent.observed == 0.91
    @test prevalent.kappa < 0.2

    println((
        balanced = round.(collect(values(balanced)), digits = 3),
        prevalence_example = round.(collect(values(prevalent)), digits = 3),
    ))
end

@testset "G理論のD-studyは項目数と決定目的を変える" begin
    person_variance = 1.0
    item_variance = 0.4
    person_item_error = 1.2
    item_counts = [5, 10, 20]
    relative_g = [person_variance /
        (person_variance + person_item_error / n_item)
        for n_item in item_counts]
    absolute_phi = [person_variance /
        (person_variance + (item_variance + person_item_error) / n_item)
        for n_item in item_counts]

    @test issorted(relative_g)
    @test issorted(absolute_phi)
    @test all(relative_g .> absolute_phi)
    @test relative_g[end] > 0.9

    println((
        item_counts = item_counts,
        relative_G = round.(relative_g, digits = 3),
        absolute_Phi = round.(absolute_phi, digits = 3),
    ))
end

@testset "IRTの情報量はthetaごとに変わる" begin
    theta = collect(-2.0:1.0:2.0)
    discrimination = 1.5
    difficulty = 0.0
    probability = logistic.(discrimination .* (theta .- difficulty))
    information = discrimination^2 .* probability .* (1 .- probability)

    @test argmax(information) == 3
    @test information[1] ≈ information[end]
    @test probability[3] == 0.5
    @test information[3] == discrimination^2 / 4

    println((
        theta = theta,
        probability = round.(probability, digits = 3),
        item_information = round.(information, digits = 3),
    ))
end

@testset "同じ項目でも標本の範囲でalphaは変わる" begin
    difficulty = [-1.2, -0.8, -0.4, 0.0, 0.4, 0.8, 1.2, 0.2]
    discrimination = fill(1.3, 8)
    wide_rng = Xoshiro(3202)
    narrow_rng = Xoshiro(3202)
    wide_items = simulate_binary_items(
        wide_rng, randn(wide_rng, 1000), difficulty, discrimination)
    narrow_items = simulate_binary_items(
        narrow_rng, 0.3 .* randn(narrow_rng, 1000), difficulty, discrimination)
    alpha_wide = coefficient_alpha(wide_items)
    alpha_narrow = coefficient_alpha(narrow_items)

    @test alpha_wide > alpha_narrow + 0.15
    @test 0 < alpha_narrow < alpha_wide < 1

    println((
        alpha_wide_ability_range = round(alpha_wide, digits = 3),
        alpha_narrow_ability_range = round(alpha_narrow, digits = 3),
    ))
end

@testset "高alphaでも二次元になりうる" begin
    rng = Xoshiro(3203)
    n = 1200
    latent = rand(rng, MvNormal([0.0, 0.0], [1.0 0.35; 0.35 1.0]), n)'
    twofactor_items = hcat(
        simulate_binary_items(rng, latent[:, 1],
            collect(range(-0.8, 0.8, length = 8)), fill(1.8, 8)),
        simulate_binary_items(rng, latent[:, 2],
            collect(range(-0.8, 0.8, length = 8)), fill(1.8, 8)),
    )
    item_correlation = cor(twofactor_items)
    within_1 = mean(item_correlation[i, j] for i in 1:8 for j in 1:8 if i < j)
    within_2 = mean(item_correlation[i, j] for i in 9:16 for j in 9:16 if i < j)
    between = mean(item_correlation[i, j] for i in 1:8 for j in 9:16)
    alpha_twofactor = coefficient_alpha(twofactor_items)

    @test alpha_twofactor > 0.8
    @test min(within_1, within_2) > between + 0.15

    println((
        alpha = round(alpha_twofactor, digits = 3),
        within_factor_correlations = round.([within_1, within_2], digits = 3),
        between_factor_correlation = round(between, digits = 3),
    ))
end

@testset "安定性と評定者一致を相関だけで済ませない" begin
    rng = Xoshiro(3204)
    stable_trait = randn(rng, 400)
    time1 = stable_trait .+ rand(rng, Normal(0, 0.7), 400)
    time2 = stable_trait .+ 0.3 .+ rand(rng, Normal(0, 0.7), 400)
    retest_correlation = cor(time1, time2)
    mean_change = mean(time2 - time1)

    rater1 = collect(1.0:100.0)
    rater2 = rater1 .+ 1
    rater_correlation = cor(rater1, rater2)
    exact_agreement = mean(rater1 .== rater2)

    @test 0.6 < retest_correlation < 0.8
    @test 0.2 < mean_change < 0.4
    @test rater_correlation ≈ 1
    @test exact_agreement == 0

    println((
        test_retest_correlation = round(retest_correlation, digits = 3),
        mean_change = round(mean_change, digits = 3),
        rater_correlation = rater_correlation,
        exact_agreement = exact_agreement,
    ))
end
