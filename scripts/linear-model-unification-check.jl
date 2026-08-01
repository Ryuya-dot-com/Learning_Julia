#!/usr/bin/env julia

# L28「t検定・ANOVA・回帰を一つのモデルで見る」の数値/API検証。
# 実行例:
#   julia --project=/path/to/validation-env scripts/linear-model-unification-check.jl

using Test
using Random
using Statistics
using Distributions
using DataFrames
using GLM
using HypothesisTests

function pooled_sd(x, y)
    nx, ny = length(x), length(y)
    return sqrt(((nx - 1) * var(x) + (ny - 1) * var(y)) / (nx + ny - 2))
end

@testset "独立2群t検定・回帰・ANOVA" begin
    rng = Xoshiro(2801)
    control = rand(rng, Normal(500, 50), 30)
    treatment = rand(rng, Normal(525, 50), 30)
    group = repeat([0, 1], inner = 30)
    y = vcat(control, treatment)
    df = DataFrame(y = y, group = group)

    model = lm(@formula(y ~ group), df)
    equal_t = EqualVarianceTTest(treatment, control)
    mean_difference = mean(treatment) - mean(control)
    regression_t = coef(model)[2] / stderror(model)[2]
    test_t = equal_t.t
    model_f = regression_t^2

    @test isapprox(coef(model)[1], mean(control); atol = 1e-10)
    @test isapprox(coef(model)[2], mean_difference; atol = 1e-10)
    @test isapprox(regression_t, test_t; atol = 1e-10)
    @test isapprox(model_f, test_t^2; atol = 1e-10)
    @test isapprox(r2(model), model_f / (model_f + dof_residual(model)); atol = 1e-10)

    interval = confint(model)[2, :]
    d = mean_difference / pooled_sd(control, treatment)
    @test interval[1] < mean_difference < interval[2]
    @test sign(d) == sign(mean_difference)

    println((;
        control_mean = round(mean(control), digits = 1),
        treatment_mean = round(mean(treatment), digits = 1),
        mean_difference = round(mean_difference, digits = 1),
        t = round(test_t, digits = 3),
        f = round(model_f, digits = 3),
        p = round(pvalue(equal_t), digits = 4),
        ci = round.((interval[1], interval[2]), digits = 1),
        cohen_d = round(d, digits = 3),
        r2 = round(r2(model), digits = 3),
    ))
end

@testset "一元配置ANOVAはカテゴリ説明変数の線形モデル" begin
    rng = Xoshiro(2802)
    group = repeat(["A", "B", "C"], inner = 25)
    y = vcat(
        rand(rng, Normal(500, 45), 25),
        rand(rng, Normal(520, 45), 25),
        rand(rng, Normal(550, 45), 25),
    )
    df = DataFrame(y = y, group = group)
    null_model = lm(@formula(y ~ 1), df)
    group_model = lm(@formula(y ~ group), df)

    df_between = 2
    df_within = dof_residual(group_model)
    ss_between = deviance(null_model) - deviance(group_model)
    ss_within = deviance(group_model)
    f_statistic = (ss_between / df_between) / (ss_within / df_within)
    eta2 = ss_between / (ss_between + ss_within)

    @test length(coef(group_model)) == 3
    @test coefnames(group_model) == ["(Intercept)", "group: B", "group: C"]
    @test isapprox(eta2, r2(group_model); atol = 1e-12)
    @test f_statistic > 3
    @test coef(group_model)[2] ≈ mean(y[group .== "B"]) - mean(y[group .== "A"])
    @test coef(group_model)[3] ≈ mean(y[group .== "C"]) - mean(y[group .== "A"])

    println((;
        coefficients = round.(coef(group_model), digits = 1),
        f = round(f_statistic, digits = 3),
        df = (df_between, df_within),
        eta2 = round(eta2, digits = 3),
    ))
end

@testset "withinデザインは差得点モデル" begin
    rng = Xoshiro(2803)
    n = 30
    subject_effect = rand(rng, Normal(0, 60), n)
    before = 500 .+ subject_effect .+ rand(rng, Normal(0, 25), n)
    after = 520 .+ subject_effect .+ rand(rng, Normal(0, 25), n)
    difference = after .- before

    paired_test = OneSampleTTest(difference)
    difference_model = lm(@formula(difference ~ 1), DataFrame(difference = difference))
    naive_between_model = lm(
        @formula(y ~ condition),
        DataFrame(y = vcat(before, after), condition = repeat([0, 1], inner = n)),
    )

    paired_t = paired_test.t
    regression_t = coef(difference_model)[1] / stderror(difference_model)[1]
    @test coef(difference_model)[1] ≈ mean(difference)
    @test isapprox(paired_t, regression_t; atol = 1e-10)
    @test coef(naive_between_model)[2] ≈ mean(difference)
    @test !isapprox(stderror(naive_between_model)[2], stderror(difference_model)[1])
    @test abs(paired_t) > abs(coef(naive_between_model)[2] / stderror(naive_between_model)[2])

    dz = mean(difference) / std(difference)
    @test dz > 0

    println((;
        mean_difference = round(mean(difference), digits = 1),
        paired_t = round(paired_t, digits = 3),
        paired_se = round(stderror(difference_model)[1], digits = 2),
        naive_se = round(stderror(naive_between_model)[2], digits = 2),
        dz = round(dz, digits = 3),
    ))
end

@testset "連続説明変数の単回帰" begin
    rng = Xoshiro(2804)
    x = randn(rng, 80)
    y = 2.0 .+ 0.8 .* x .+ randn(rng, 80) .* 0.5
    model = lm(@formula(y ~ x), DataFrame(x = x, y = y))
    interval = confint(model)[2, :]

    @test abs(coef(model)[1] - 2.0) < 0.15
    @test abs(coef(model)[2] - 0.8) < 0.15
    @test interval[1] < coef(model)[2] < interval[2]
    @test r2(model) > 0.6

    println((;
        intercept = round(coef(model)[1], digits = 3),
        slope = round(coef(model)[2], digits = 3),
        slope_ci = round.((interval[1], interval[2]), digits = 3),
        r2 = round(r2(model), digits = 3),
    ))
end

println(
    "Julia ", VERSION,
    " / GLM ", pkgversion(GLM),
    " / HypothesisTests ", pkgversion(HypothesisTests),
)
