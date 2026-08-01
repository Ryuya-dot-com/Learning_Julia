#!/usr/bin/env julia

# L34「収束的・弁別的妥当性」の掲載値と反例を固定検証する。
# 例:
#   julia --project=/path/to/validation-env scripts/validity-evidence-check.jl

using Test
using Random
using Statistics
using Distributions
using DataFrames

function fisher_interval(r, n; level = 0.95)
    z = atanh(r)
    critical = quantile(Normal(), 1 - (1 - level) / 2)
    half_width = critical / sqrt(n - 3)
    return tanh.((z - half_width, z + half_width))
end

function mtmm_data(rng; n = 1000)
    trait_correlation = [1.0 0.30 0.10;
                         0.30 1.0 0.20;
                         0.10 0.20 1.0]
    trait = rand(rng, MvNormal(zeros(3), trait_correlation), n)'
    method = randn(rng, n, 2)
    score = Matrix{Float64}(undef, n, 6)
    for m in 1:2, t in 1:3
        column = (m - 1) * 3 + t
        score[:, column] = 0.75 .* trait[:, t] .+
            0.35 .* method[:, m] .+ 0.40 .* randn(rng, n)
    end
    names = ["A_self", "B_self", "C_self",
             "A_observer", "B_observer", "C_observer"]
    return DataFrame(score, names), trait
end

@testset "MTMMで収束と弁別をパターンとして読む" begin
    rng = Xoshiro(3301)
    data, trait = mtmm_data(rng)
    matrix = cor(Matrix(data))
    convergent = [matrix[1, 4], matrix[2, 5], matrix[3, 6]]
    same_method_heterotrait = [
        matrix[i, j]
        for block in (1:3, 4:6)
        for i in block for j in block if i < j
    ]
    cross_method_heterotrait = [
        matrix[i, j]
        for i in 1:3 for j in 4:6 if j - 3 != i
    ]
    interval_a = fisher_interval(convergent[1], nrow(data))

    @test all(0.55 .< convergent .< 0.75)
    @test mean(convergent) > mean(same_method_heterotrait) + 0.2
    @test mean(same_method_heterotrait) > mean(cross_method_heterotrait)
    @test interval_a[1] < convergent[1] < interval_a[2]
    @test all(isfinite, matrix)

    println((
        convergent = round.(convergent, digits = 3),
        same_method_heterotrait =
            round.(same_method_heterotrait, digits = 3),
        cross_method_heterotrait =
            round.(cross_method_heterotrait, digits = 3),
        mean_pattern = round.([
            mean(convergent), mean(same_method_heterotrait),
            mean(cross_method_heterotrait)], digits = 3),
        trait_a_fisher_interval = round.(collect(interval_a), digits = 3),
    ))

    @test matrix[1, 2] > matrix[1, 5]
    @test matrix[1, 2] > cor(trait[:, 1], trait[:, 2])
    println((
        a_b_same_self_method = round(matrix[1, 2], digits = 3),
        a_self_b_observer = round(matrix[1, 5], digits = 3),
        true_trait_a_b = round(cor(trait[:, 1], trait[:, 2]), digits = 3),
    ))
end

@testset "希薄化修正は仮定を追加する" begin
    observed_r = 0.55
    reliability_x, reliability_y = 0.72, 0.68
    corrected_r = observed_r / sqrt(reliability_x * reliability_y)
    inconsistent_correction = 0.80 / sqrt(0.50 * 0.50)

    @test 0.75 < corrected_r < 0.85
    @test inconsistent_correction > 1

    println((
        observed = observed_r,
        corrected_under_assumptions = round(corrected_r, digits = 3),
        impossible_example = round(inconsistent_correction, digits = 3),
    ))
end

@testset "共有項目は収束を水増しする" begin
    rng = Xoshiro(3302)
    n = 700
    trait_a = randn(rng, n)
    trait_b = randn(rng, n)
    shared = trait_a .+ rand(rng, Normal(0, 0.5), n)
    independent_measure = trait_a .+ rand(rng, Normal(0, 1.0), n)
    overlapping_measure = 0.7 .* shared .+ 0.3 .* trait_b .+
                          rand(rng, Normal(0, 0.3), n)
    shared_score = 0.7 .* shared .+ 0.3 .* trait_b

    independent_convergence = cor(shared, independent_measure)
    overlapping_correlation = cor(shared, overlapping_measure)
    exact_part_whole = cor(shared, shared_score)

    @test overlapping_correlation > independent_convergence
    @test exact_part_whole > 0.85
    @test independent_convergence > 0.6

    println((
        independent_method_convergence =
            round(independent_convergence, digits = 3),
        overlapping_measure_correlation =
            round(overlapping_correlation, digits = 3),
        part_whole_correlation = round(exact_part_whole, digits = 3),
    ))
end

@testset "外的基準は目的と時間順序を持つ" begin
    rng = Xoshiro(3303)
    n = 900
    baseline_trait = randn(rng, n)
    baseline_score = baseline_trait .+ rand(rng, Normal(0, 0.8), n)
    future_outcome = 0.45 .* baseline_trait .+
                     rand(rng, Normal(0, 1.0), n)
    concurrent_proxy = baseline_score .+
                       rand(rng, Normal(0, 0.2), n)
    predictive = cor(baseline_score, future_outcome)
    concurrent = cor(baseline_score, concurrent_proxy)

    @test 0.2 < predictive < 0.5
    @test concurrent > 0.95

    println((
        future_outcome_correlation = round(predictive, digits = 3),
        near_duplicate_concurrent_correlation = round(concurrent, digits = 3),
    ))
end
