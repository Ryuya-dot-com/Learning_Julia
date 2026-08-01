#!/usr/bin/env julia

# L36「測定誤差と希薄化」の掲載値と反例を固定検証する。
# 例:
#   julia --project=/path/to/validation-env scripts/measurement-error-check.jl

using Test
using Random
using Statistics
using Distributions
using DataFrames
using GLM
using CairoMakie

function parallel_measurements(; n = 50_000, reliability = 0.8, seed = 3501)
    rng = Xoshiro(seed)
    true_score = randn(rng, n)
    error_sd = sqrt((1 - reliability) / reliability)
    first = true_score .+ error_sd .* randn(rng, n)
    second = true_score .+ error_sd .* randn(rng, n)
    return (; true_score, first, second)
end

parallel = parallel_measurements()
parallel_r = cor(parallel.first, parallel.second)
println((parallel_correlation = round(parallel_r, digits = 3),))

@testset "再検査相関が信頼性になるには平行測定の仮定が要る" begin
    @test isapprox(parallel_r, 0.8; atol = 0.015)
    @test cor(parallel.true_score, parallel.first)^2 ≈ 0.8 atol = 0.015
end

function attenuated_correlation(; n = 50_000, true_r = 0.7,
                                reliability_x = 0.8,
                                reliability_y = 0.5, seed = 3502)
    rng = Xoshiro(seed)
    latent = rand(rng, MvNormal([0.0, 0.0], [1.0 true_r; true_r 1.0]), n)
    x = latent[1, :] .+ sqrt(1 / reliability_x - 1) .* randn(rng, n)
    y = latent[2, :] .+ sqrt(1 / reliability_y - 1) .* randn(rng, n)
    observed = cor(x, y)
    theoretical = true_r * sqrt(reliability_x * reliability_y)
    corrected = observed / sqrt(reliability_x * reliability_y)
    return (; observed, theoretical, corrected)
end

attenuation = attenuated_correlation()
impossible_correction = 0.80 / sqrt(0.50 * 0.50)
println((observed = round(attenuation.observed, digits = 3),
         theoretical = round(attenuation.theoretical, digits = 3),
         corrected = round(attenuation.corrected, digits = 3),
         incompatible = round(impossible_correction, digits = 2)))

@testset "希薄化の公式は古典的独立誤差の下でだけ戻る" begin
    @test isapprox(attenuation.observed, attenuation.theoretical; atol = 0.015)
    @test isapprox(attenuation.corrected, 0.7; atol = 0.025)
    @test impossible_correction > 1
end

function regression_asymmetry(; n = 50_000, reliability = 0.6, seed = 3503)
    rng = Xoshiro(seed)
    x_true = randn(rng, n)
    structural_error = randn(rng, n)
    y_true = 2 .+ 1.5 .* x_true .+ structural_error

    x_observed = x_true .+ sqrt(1 / reliability - 1) .* randn(rng, n)
    y_error_sd = std(y_true) * sqrt(1 / reliability - 1)
    y_observed = y_true .+ y_error_sd .* randn(rng, n)
    df = DataFrame(x_true = x_true, x_observed = x_observed,
                   y_true = y_true, y_observed = y_observed)

    benchmark = lm(@formula(y_true ~ 1 + x_true), df)
    error_in_y = lm(@formula(y_observed ~ 1 + x_true), df)
    error_in_x = lm(@formula(y_true ~ 1 + x_observed), df)
    return (; benchmark, error_in_y, error_in_x)
end

asymmetry = regression_asymmetry()
asymmetry_summary = (
    benchmark_slope = round(coef(asymmetry.benchmark)[2], digits = 3),
    outcome_error_slope = round(coef(asymmetry.error_in_y)[2], digits = 3),
    predictor_error_slope = round(coef(asymmetry.error_in_x)[2], digits = 3),
    benchmark_se = round(stderror(asymmetry.benchmark)[2], digits = 3),
    outcome_error_se = round(stderror(asymmetry.error_in_y)[2], digits = 3),
)
println(asymmetry_summary)

@testset "結果誤差と説明変数誤差は回帰で非対称になる" begin
    @test isapprox(coef(asymmetry.benchmark)[2], 1.5; atol = 0.03)
    @test isapprox(coef(asymmetry.error_in_y)[2], 1.5; atol = 0.04)
    @test isapprox(coef(asymmetry.error_in_x)[2], 1.5 * 0.6; atol = 0.04)
    @test stderror(asymmetry.error_in_y)[2] > stderror(asymmetry.benchmark)[2]
end

function multivariable_contamination(; n = 50_000, reliability_x1 = 0.5,
                                     rho = 0.7, seed = 3504)
    rng = Xoshiro(seed)
    predictors = rand(rng, MvNormal([0.0, 0.0], [1.0 rho; rho 1.0]), n)
    x1, x2 = predictors[1, :], predictors[2, :]
    y = x1 .+ 0.5 .* randn(rng, n)
    x1_observed = x1 .+ sqrt(1 / reliability_x1 - 1) .* randn(rng, n)
    df = DataFrame(x1 = x1, x2 = x2, x1_observed = x1_observed, y = y)
    true_model = lm(@formula(y ~ 1 + x1 + x2), df)
    noisy_model = lm(@formula(y ~ 1 + x1_observed + x2), df)
    return (; true_model, noisy_model)
end

contamination = multivariable_contamination()
println((true_beta1 = round(coef(contamination.true_model)[2], digits = 3),
         true_beta2 = round(coef(contamination.true_model)[3], digits = 3),
         noisy_beta1 = round(coef(contamination.noisy_model)[2], digits = 3),
         noisy_beta2 = round(coef(contamination.noisy_model)[3], digits = 3)))

@testset "重回帰では一変数の誤差が他係数へ移る" begin
    @test isapprox(coef(contamination.true_model)[2], 1.0; atol = 0.025)
    @test abs(coef(contamination.true_model)[3]) < 0.025
    @test 0.30 < coef(contamination.noisy_model)[2] < 0.38
    @test 0.42 < coef(contamination.noisy_model)[3] < 0.51
end

function differential_error(; n = 50_000, seed = 3505)
    rng = Xoshiro(seed)
    x_true = randn(rng, n)
    y = randn(rng, n)
    x_reported = x_true .+ 0.8 .* y .+ 0.5 .* randn(rng, n)
    df = DataFrame(x_true = x_true, x_reported = x_reported, y = y)
    true_model = lm(@formula(y ~ 1 + x_true), df)
    reported_model = lm(@formula(y ~ 1 + x_reported), df)
    return (; true_model, reported_model)
end

differential = differential_error()
println((true_slope = round(coef(differential.true_model)[2], digits = 3),
         reported_slope = round(coef(differential.reported_model)[2], digits = 3)))

@testset "結果に依存する誤差は無関係を関連へ変えうる" begin
    @test abs(coef(differential.true_model)[2]) < 0.025
    @test 0.39 < coef(differential.reported_model)[2] < 0.46
end

function berkson_example(; n = 50_000, seed = 3506)
    rng = Xoshiro(seed)
    assigned = randn(rng, n)
    actual = assigned .+ 0.8 .* randn(rng, n)
    y = 1 .+ 1.5 .* actual .+ randn(rng, n)
    model = lm(@formula(y ~ 1 + assigned),
               DataFrame(assigned = assigned, y = y))
    return model
end

berkson_model = berkson_example()
println((berkson_slope = round(coef(berkson_model)[2], digits = 3),))

@testset "Berkson誤差は単純線形回帰の傾きを同じ形で希薄化しない" begin
    @test isapprox(coef(berkson_model)[2], 1.5; atol = 0.035)
end

reliability_grid = collect(0.5:0.1:0.9)
sensitivity = DataFrame(
    reliability_x = reliability_grid,
    reliability_y = fill(0.8, length(reliability_grid)),
    corrected_r = 0.45 ./ sqrt.(reliability_grid .* 0.8),
)
sensitivity.corrected_r = round.(sensitivity.corrected_r, digits = 3)
println(sensitivity)

sensitivity_figure = Figure(size = (640, 400))
ax = Axis(sensitivity_figure[1, 1], xlabel = "assumed reliability of X",
          ylabel = "corrected correlation")
lines!(ax, sensitivity.reliability_x, sensitivity.corrected_r;
       color = :steelblue)
scatter!(ax, sensitivity.reliability_x, sensitivity.corrected_r;
         color = :steelblue)

@testset "信頼性は固定真値でなく感度軸にする" begin
    @test sensitivity.corrected_r == [0.712, 0.65, 0.601, 0.562, 0.53]
    @test issorted(sensitivity.corrected_r; rev = true)
    mktempdir() do dir
        output_path = joinpath(dir, "l35-reliability-sensitivity.png")
        save(output_path, sensitivity_figure)
        @test filesize(output_path) > 0
    end
end
