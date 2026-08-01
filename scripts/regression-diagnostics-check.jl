#!/usr/bin/env julia

# L30「回帰診断とVIF」の掲載値と診断量を固定検証する。
# 例:
#   julia --project=/path/to/validation-env scripts/regression-diagnostics-check.jl

using Test
using Random
using Statistics
using LinearAlgebra
using Distributions
using DataFrames
using GLM
using CairoMakie
using HypothesisTests

function hc3_vcov(model)
    X = modelmatrix(model)
    residual = residuals(model)
    bread = inv(Symmetric(X' * X))
    leverage = vec(sum((X * bread) .* X, dims = 2))
    adjusted_residual = residual ./ (1 .- leverage)
    meat = X' * Diagonal(adjusted_residual .^ 2) * X
    return bread * meat * bread
end

function numeric_vif(data)
    x1_aux = lm(@formula(x1 ~ x2 + x3), data)
    x2_aux = lm(@formula(x2 ~ x1 + x3), data)
    x3_aux = lm(@formula(x3 ~ x1 + x2), data)
    return collect(1 ./ (1 .- r2.((x1_aux, x2_aux, x3_aux))))
end

function column_vif(model)
    X = modelmatrix(model)
    predictor_correlation = cor(X[:, 2:end])
    return diag(inv(predictor_correlation))
end

@testset "非線形性は残差に残る" begin
    rng = Xoshiro(3001)
    n = 160
    x = rand(rng, Uniform(-3, 3), n)
    y = 2 .+ 0.8 .* x .+ 1.1 .* x .^ 2 .+ rand(rng, Normal(0, 1), n)
    curve_df = DataFrame(x = x, x2 = x .^ 2, y = y)
    linear_model = lm(@formula(y ~ x), curve_df)
    quadratic_model = lm(@formula(y ~ x + x2), curve_df)
    comparison = ftest(linear_model.model, quadratic_model.model)
    residual_curve = cor(residuals(linear_model), curve_df.x2)

    @test r2(linear_model) < 0.2
    @test r2(quadratic_model) > 0.9
    @test residual_curve > 0.85
    @test abs(cor(residuals(quadratic_model), curve_df.x2)) < 1e-12
    @test comparison.pval[2] < 1e-50

    figure = Figure(size = (700, 300))
    axis = Axis(figure[1, 1], xlabel = "fitted", ylabel = "residual")
    scatter!(axis, fitted(linear_model), residuals(linear_model))
    hlines!(axis, [0], color = :black, linestyle = :dash)
    standardized_residual = (
        residuals(linear_model) .- mean(residuals(linear_model))
    ) ./ std(residuals(linear_model))
    probability = ((1:n) .- 0.5) ./ n
    normal_quantile = quantile.(Normal(), probability)
    qq_axis = Axis(figure[1, 2], xlabel = "normal", ylabel = "residual")
    scatter!(qq_axis, normal_quantile, sort(standardized_residual))
    lines!(qq_axis, [-3, 3], [-3, 3], color = :black, linestyle = :dash)
    @test figure isa Figure
    @test all(isfinite, normal_quantile)

    println((
        r2 = round.([r2(linear_model), r2(quadratic_model)], digits = 3),
        residual_x2_correlation = round(residual_curve, digits = 3),
        added_curve_f = round(comparison.fstat[2], digits = 3),
        added_curve_p = comparison.pval[2],
    ))
end

@testset "正規性・非線形性・分散不均一を分ける" begin
    rng = Xoshiro(3006)
    n = 240
    x = collect(range(-2, 2; length = n))
    x2 = x .^ 2
    outcomes = (
        normal = 1 .+ 2 .* x .+ rand(rng, Normal(), n),
        heavy = 1 .+ 2 .* x .+ rand(rng, TDist(3), n) ./ sqrt(3),
        curve = 1 .+ 2 .* x .+ 1.2 .* x2 .+ rand(rng, Normal(), n),
        hetero = 1 .+ 2 .* x .+
                 randn(rng, n) .* (0.4 .+ 0.8 .* abs.(x)),
    )

    diagnostics = map(keys(outcomes)) do name
        data = DataFrame(x = x, x2 = x2, y = outcomes[name])
        linear = lm(@formula(y ~ x), data)
        quadratic = lm(@formula(y ~ x + x2), data)
        residual = residuals(linear)
        return (
            name = name,
            shapiro_p = pvalue(ShapiroWilkTest(residual)),
            curve_signal = cor(residual, x2),
            spread_signal = cor(abs.(residual), abs.(x)),
            quadratic_gain = r2(quadratic) - r2(linear),
        )
    end
    by_name = Dict(item.name => item for item in diagnostics)

    @test by_name[:normal].shapiro_p > 0.05
    @test by_name[:normal].quadratic_gain < 0.01
    @test by_name[:heavy].shapiro_p < 1e-10
    @test by_name[:heavy].quadratic_gain < 0.01
    @test by_name[:curve].shapiro_p > 0.05
    @test by_name[:curve].curve_signal > 0.8
    @test by_name[:curve].quadratic_gain > 0.25
    @test by_name[:hetero].shapiro_p < 0.05
    @test by_name[:hetero].spread_signal > 0.4
    @test by_name[:hetero].quadratic_gain < 0.01

    for item in diagnostics
        println((
            name = item.name,
            shapiro_p = round(item.shapiro_p; sigdigits = 4),
            curve_signal = round(item.curve_signal; digits = 3),
            spread_signal = round(item.spread_signal; digits = 3),
            quadratic_gain = round(item.quadratic_gain; digits = 3),
        ))
    end
end

@testset "分散不均一とHC3標準誤差" begin
    rng = Xoshiro(3002)
    n = 220
    x = rand(rng, Uniform(0, 4), n)
    sigma = 0.4 .+ 0.8 .* x
    y = 1 .+ 1.5 .* x .+ randn(rng, n) .* sigma
    hetero_df = DataFrame(x = x, y = y)
    hetero_model = lm(@formula(y ~ x), hetero_df)
    classical_se = stderror(hetero_model)
    hc3_se = sqrt.(diag(hc3_vcov(hetero_model)))
    spread_relation = cor(abs.(residuals(hetero_model)), fitted(hetero_model))

    @test 1.2 < coef(hetero_model)[2] < 1.8
    @test spread_relation > 0.35
    @test hc3_se[2] > classical_se[2]
    @test all(isfinite, hc3_se)

    println((
        coefficients = round.(coef(hetero_model), digits = 3),
        classical_se = round.(classical_se, digits = 3),
        hc3_se = round.(hc3_se, digits = 3),
        abs_residual_fitted_correlation = round(spread_relation, digits = 3),
    ))
end

@testset "外れ値・レバレッジ・Cook距離" begin
    rng = Xoshiro(3003)
    n_regular = 80
    x = rand(rng, Normal(), n_regular)
    y = 1 .+ 2 .* x .+ rand(rng, Normal(0, 0.5), n_regular)
    influence_df = DataFrame(
        x = vcat(x, 5.5),
        y = vcat(y, -5.0),
    )
    full_model = lm(@formula(y ~ x), influence_df)
    regular_model = lm(@formula(y ~ x), influence_df[1:n_regular, :])

    X = modelmatrix(full_model)
    bread = inv(Symmetric(X' * X))
    leverage = vec(sum((X * bread) .* X, dims = 2))
    mse = deviance(full_model) / dof_residual(full_model)
    cook_manual = residuals(full_model) .^ 2 ./ (size(X, 2) * mse) .*
                  leverage ./ (1 .- leverage) .^ 2
    cook_glm = cooksdistance(full_model)
    influential_index = argmax(cook_glm)

    @test cook_manual ≈ cook_glm
    @test influential_index == n_regular + 1
    @test leverage[end] == maximum(leverage)
    @test cook_glm[end] > 1
    @test abs(coef(full_model)[2] - coef(regular_model)[2]) > 0.8

    println((
        influential_index = influential_index,
        leverage = round(leverage[end], digits = 3),
        cook_distance = round(cook_glm[end], digits = 3),
        heuristic_4_over_n = round(4 / nrow(influence_df), digits = 3),
        slopes = round.([coef(full_model)[2], coef(regular_model)[2]], digits = 3),
    ))
end

@testset "VIFは補助回帰のR2から作る" begin
    rng = Xoshiro(3004)
    n = 240
    x1 = randn(rng, n)
    x2 = 0.98 .* x1 .+ 0.2 .* randn(rng, n)
    x3 = randn(rng, n)
    y = 1 .+ x1 .+ x2 .+ 0.5 .* x3 .+ rand(rng, Normal(0, 0.7), n)
    vif_df = DataFrame(x1 = x1, x2 = x2, x3 = x3, y = y)
    model = lm(@formula(y ~ x1 + x2 + x3), vif_df)
    vif = numeric_vif(vif_df)
    correlation_vif = diag(inv(cor(Matrix(vif_df[:, [:x1, :x2, :x3]]))))

    L_sum = [0.0, 1.0, 1.0, 0.0]
    sum_estimate = dot(L_sum, coef(model))
    sum_se = sqrt(dot(L_sum, vcov(model) * L_sum))

    @test vif ≈ correlation_vif
    @test vif[1] > 20
    @test vif[2] > 20
    @test vif[3] < 1.1
    @test abs(sum_estimate - 2) < 0.15
    @test sum_se < minimum(stderror(model)[2:3])

    println((
        predictor_correlation = round(cor(x1, x2), digits = 3),
        vif = round.(vif, digits = 2),
        coefficients = round.(coef(model), digits = 3),
        coefficient_se = round.(stderror(model), digits = 3),
        x1_plus_x2 = round(sum_estimate, digits = 3),
        sum_se = round(sum_se, digits = 3),
        r2 = round(r2(model), digits = 3),
    ))
end

@testset "中心化は交互作用モデルを再パラメータ化する" begin
    rng = Xoshiro(3005)
    n = 220
    age = rand(rng, Normal(50, 8), n)
    stress = rand(rng, Normal(30, 5), n)
    y = 10 .+ 0.2 .* age .- 0.3 .* stress .+
        0.05 .* age .* stress .+ rand(rng, Normal(0, 4), n)
    center_df = DataFrame(age = age, stress = stress, y = y)
    center_df.age_stress = center_df.age .* center_df.stress
    center_df.age_c = center_df.age .- mean(center_df.age)
    center_df.stress_c = center_df.stress .- mean(center_df.stress)
    center_df.agec_stressc = center_df.age_c .* center_df.stress_c

    raw_model = lm(@formula(y ~ age + stress + age_stress), center_df)
    centered_model = lm(
        @formula(y ~ age_c + stress_c + agec_stressc),
        center_df,
    )
    raw_vif = column_vif(raw_model)
    centered_vif = column_vif(centered_model)

    @test predict(raw_model) ≈ predict(centered_model)
    @test deviance(raw_model) ≈ deviance(centered_model)
    @test maximum(raw_vif) > 30
    @test maximum(centered_vif) < 1.1
    @test coef(raw_model)[4] ≈ coef(centered_model)[4]

    println((
        raw_vif = round.(raw_vif, digits = 2),
        centered_vif = round.(centered_vif, digits = 2),
        raw_coefficients = round.(coef(raw_model), digits = 3),
        centered_coefficients = round.(coef(centered_model), digits = 3),
        max_prediction_difference = maximum(abs.(
            predict(raw_model) .- predict(centered_model)
        )),
    ))
end

@testset "条件数は単位と原点に依存する" begin
    n = 200
    timestamp = collect(range(1_000_000.0, 1_000_001.0; length = n))
    timestamp_c = timestamp .- mean(timestamp)
    timestamp_z = timestamp_c ./ std(timestamp_c)
    y = 5 .+ 3 .* timestamp_c .+
        0.01 .* sin.(range(0, 8pi; length = n))

    X_raw = hcat(ones(n), timestamp)
    X_centered = hcat(ones(n), timestamp_c)
    X_standardized = hcat(ones(n), timestamp_z)
    beta_raw = X_raw \ y
    beta_centered = X_centered \ y
    beta_standardized = X_standardized \ y
    raw_condition = cond(X_raw)
    centered_condition = cond(X_centered)
    standardized_condition = cond(X_standardized)
    prediction_difference = maximum(abs.(
        X_raw * beta_raw - X_centered * beta_centered))

    @test raw_condition > 1e12
    @test centered_condition < 3.5
    @test standardized_condition < 1.01
    @test prediction_difference < 2e-9
    @test isapprox(beta_raw[2], beta_centered[2]; atol = 1e-8)
    @test isapprox(beta_standardized[2],
                   beta_centered[2] * std(timestamp_c); atol = 1e-10)

    println((;
        condition_numbers = round.([
            raw_condition, centered_condition, standardized_condition,
        ]; sigdigits = 4),
        raw_coefficients = round.(beta_raw, digits = 3),
        centered_coefficients = round.(beta_centered, digits = 3),
        standardized_coefficients = round.(beta_standardized, digits = 3),
        prediction_difference,
    ))
end

@testset "VIF・条件数・係数感度を分ける" begin
    n = 200
    x1_vif = collect(range(-1, 1; length = n))
    x2_vif = x1_vif .+ 1e-3 .* sin.(range(0, 6pi; length = n))
    standardize(x) = (x .- mean(x)) ./ std(x)
    r_original = cor(x1_vif, x2_vif)
    r_rescaled = cor(1000 .* x1_vif, x2_vif)
    vif_original = 1 / (1 - r_original^2)
    vif_rescaled = 1 / (1 - r_rescaled^2)
    X_original = hcat(ones(n), x1_vif, x2_vif)
    X_rescaled = hcat(ones(n), 1000 .* x1_vif, x2_vif)
    X_z = hcat(ones(n), standardize(x1_vif), standardize(x2_vif))

    @test isapprox(vif_original, vif_rescaled; rtol = 2e-10)
    @test cond(X_rescaled) > 400 * cond(X_original)
    @test cond(X_z) > 1000

    x1 = collect(range(-1, 1; length = n))
    x2 = x1 .+ 1e-7 .* sin.(range(0, 6pi; length = n))
    X = hcat(ones(n), x1, x2)
    y = 1 .+ 2 .* x1 .- 2 .* x2 .+
        0.01 .* cos.(range(0, 4pi; length = n))
    beta_qr = X \ y
    beta_normal_equation = (X' * X) \ (X' * y)
    condition_x = cond(X)
    condition_crossproduct = cond(X' * X)

    @test 2e7 < condition_x < 2.1e7
    @test condition_crossproduct > 4e14
    @test condition_crossproduct > condition_x^1.9
    @test maximum(abs.(beta_qr - beta_normal_equation)) > 0.01
    @test norm(y - X * beta_qr) <= norm(y - X * beta_normal_equation) + 1e-12

    y_perturbed = y .+ 1e-6 .* sin.(range(0, 10pi; length = n))
    beta_perturbed = X \ y_perturbed
    response_change = maximum(abs.(y_perturbed - y))
    coefficient_change = maximum(abs.(beta_perturbed - beta_qr))
    prediction_change = maximum(abs.(X * beta_perturbed - X * beta_qr))
    @test response_change <= 1e-6
    @test coefficient_change > 0.4
    @test prediction_change < 3e-7

    println((;
        vif = round.([vif_original, vif_rescaled], digits = 2),
        rescaling_condition_numbers = round.([
            cond(X_original), cond(X_rescaled), cond(X_z),
        ]; sigdigits = 4),
        near_condition_numbers = round.([
            condition_x, condition_crossproduct,
        ]; sigdigits = 4),
        qr_coefficients = round.(beta_qr, digits = 6),
        normal_equation_coefficients =
            round.(beta_normal_equation, digits = 6),
        response_change,
        coefficient_change,
        prediction_change,
    ))
end

@testset "完全ランク落ちでは係数が一意でない" begin
    n = 60
    x1 = collect(range(-1, 1; length = n))
    x2 = sin.(range(0, 2pi; length = n))
    x3 = x1 .+ x2
    X = hcat(ones(n), x1, x2, x3)
    y = 2 .+ 3 .* x1 .- x2 .+
        0.05 .* cos.(range(0, 4pi; length = n))

    beta_minimum_norm = X \ y
    null_direction = [0.0, -1, -1, 1]
    beta_alternative = beta_minimum_norm .+ 10 .* null_direction
    prediction_gap = maximum(abs.(
        X * beta_minimum_norm - X * beta_alternative))

    @test rank(X) == 3
    @test svdvals(X)[end] < 1e-14
    @test norm(X * null_direction) < 1e-14
    @test prediction_gap < 2e-14
    @test norm(beta_minimum_norm - beta_alternative) > 15
    @test isapprox(beta_minimum_norm[2] + beta_minimum_norm[4], 3;
                   atol = 1e-12)
    @test isapprox(beta_minimum_norm[3] + beta_minimum_norm[4], -1;
                   atol = 1e-12)

    lambda = 1.0
    penalty = Diagonal([0.0, 1, 1, 1])
    beta_ridge = (X' * X + lambda * penalty) \ (X' * y)
    ols_mse = mean((y - X * beta_minimum_norm) .^ 2)
    ridge_mse = mean((y - X * beta_ridge) .^ 2)

    @test norm(beta_ridge[2:end]) < norm(beta_minimum_norm[2:end])
    @test ridge_mse > ols_mse
    @test isapprox(beta_ridge,
                   [2.000833, 2.251992, -1.642080, 0.609912];
                   atol = 5e-7)

    println((;
        matrix_rank = rank(X),
        singular_values = round.(svdvals(X); sigdigits = 5),
        minimum_norm_coefficients =
            round.(beta_minimum_norm; digits = 6),
        alternative_coefficients = round.(beta_alternative; digits = 6),
        prediction_gap,
        ridge_coefficients = round.(beta_ridge; digits = 6),
        coefficient_norms = round.([
            norm(beta_minimum_norm[2:end]), norm(beta_ridge[2:end]),
        ]; digits = 6),
        training_mse = round.([ols_mse, ridge_mse]; digits = 6),
    ))
end

@testset "リッジのlambdaを訓練内交差検証で選ぶ" begin
    rng = Xoshiro(3011)
    n, p = 100, 40
    latent = randn(rng, n)
    X = hcat([latent .+ 0.15 .* randn(rng, n) for _ in 1:p]...)
    y = 1 .+ 3 .* latent .+ 1.5 .* randn(rng, n)
    order = randperm(rng, n)
    train_rows, test_rows = order[1:70], order[71:end]
    X_train, y_train = X[train_rows, :], y[train_rows]
    X_test, y_test = X[test_rows, :], y[test_rows]

    function fit_ridge(X, y, lambda)
        mu = vec(mean(X; dims = 1))
        sigma = vec(std(X; dims = 1))
        Z = (X .- mu') ./ sigma'
        A = hcat(ones(size(Z, 1)), Z)
        penalty = Diagonal(vcat(0.0, ones(size(Z, 2))))
        beta = lambda == 0 ? A \ y :
            (A' * A + lambda * penalty) \ (A' * y)
        return (; beta, mu, sigma)
    end
    predict_ridge(fit, X) =
        hcat(ones(size(X, 1)),
             (X .- fit.mu') ./ fit.sigma') * fit.beta

    lambda_grid = [0.0, 0.1, 1.0, 10.0, 100.0, 1000.0]
    fold_id = repeat(1:5; inner = 14)
    cv_mse = [mean([
        let
            validation = findall(==(fold), fold_id)
            training = findall(!=(fold), fold_id)
            fit = fit_ridge(
                X_train[training, :], y_train[training], lambda)
            mean((y_train[validation] - predict_ridge(
                fit, X_train[validation, :])) .^ 2)
        end for fold in 1:5
    ]) for lambda in lambda_grid]

    selected_lambda = lambda_grid[argmin(cv_mse)]
    ols_fit = fit_ridge(X_train, y_train, 0.0)
    ridge_fit = fit_ridge(X_train, y_train, selected_lambda)
    test_mse = [
        mean((y_test - predict_ridge(ols_fit, X_test)) .^ 2),
        mean((y_test - predict_ridge(ridge_fit, X_test)) .^ 2),
    ]

    @test length(test_rows) == 30
    @test all(count(==(fold), fold_id) == 14 for fold in 1:5)
    @test selected_lambda == 100.0
    @test argmin(cv_mse) ∉ (firstindex(cv_mse), lastindex(cv_mse))
    @test cv_mse[5] < cv_mse[4] < cv_mse[3]
    @test cv_mse[5] < cv_mse[6]
    @test test_mse[2] < test_mse[1] / 4
    @test norm(ridge_fit.beta[2:end]) < norm(ols_fit.beta[2:end]) / 30
    @test isapprox(mean((X_train .- ols_fit.mu') ./ ols_fit.sigma';
                        dims = 1), zeros(1, p); atol = 1e-14)

    println((;
        lambda_grid,
        cv_mse = round.(cv_mse; digits = 3),
        selected_lambda,
        test_mse = round.(test_mse; digits = 3),
        coefficient_norms = round.([
            norm(ols_fit.beta[2:end]), norm(ridge_fit.beta[2:end]),
        ]; digits = 3),
    ))
end

@testset "LassoとElastic Netの選択安定性を分ける" begin
    soft_threshold(z, gamma) = sign(z) * max(abs(z) - gamma, 0.0)

    function elastic_net_fit(X, y, lambda, alpha;
                             maxiter = 50_000, tol = 1e-8)
        mu = vec(mean(X; dims = 1))
        sigma = vec(std(X; dims = 1))
        Z = (X .- mu') ./ sigma'
        y_centered = y .- mean(y)
        beta_z = zeros(size(X, 2))
        residual = copy(y_centered)
        column_scale = vec(sum(abs2, Z; dims = 1)) ./ size(X, 1)
        converged = false
        iterations = maxiter

        for iteration in 1:maxiter
            maximum_change = 0.0
            for j in eachindex(beta_z)
                old_beta = beta_z[j]
                residual .+= Z[:, j] .* old_beta
                score = dot(Z[:, j], residual) / size(X, 1)
                beta_z[j] = soft_threshold(score, lambda * alpha) /
                    (column_scale[j] + lambda * (1 - alpha))
                residual .-= Z[:, j] .* beta_z[j]
                maximum_change = max(
                    maximum_change, abs(beta_z[j] - old_beta))
            end
            if maximum_change < tol
                converged = true
                iterations = iteration
                break
            end
        end
        converged || error("coordinate descent did not converge")
        beta = beta_z ./ sigma
        intercept = mean(y) - dot(mu, beta)
        return (; intercept, beta, beta_z, mu, sigma, iterations)
    end

    rng = Xoshiro(3012)
    n = 120
    latent = randn(rng, n)
    X = hcat(
        latent .+ 0.03 .* randn(rng, n),
        latent .+ 0.03 .* randn(rng, n),
        randn(rng, n),
        randn(rng, n),
    )
    y = 2 .+ 2 .* latent .+ 0.4 .* X[:, 3] .+ randn(rng, n)
    lasso = elastic_net_fit(X, y, 0.2, 1.0)
    elastic_net = elastic_net_fit(X, y, 0.2, 0.8)

    @test cor(X[:, 1], X[:, 2]) > 0.998
    @test round.(lasso.beta_z; digits = 3) == [0.0, 1.485, 0.185, 0.0]
    @test round.(elastic_net.beta_z; digits = 3) ==
          [0.725, 0.770, 0.217, 0.0]
    @test count(x -> !iszero(x), lasso.beta_z) == 2
    @test count(x -> !iszero(x), elastic_net.beta_z) == 3

    selection_count_lasso = zeros(Int, 4)
    selection_count_enet = zeros(Int, 4)
    rng_bootstrap = Xoshiro(3013)
    for _ in 1:100
        rows = rand(rng_bootstrap, 1:n, n)
        bootstrap_lasso =
            elastic_net_fit(X[rows, :], y[rows], 0.2, 1.0)
        bootstrap_enet =
            elastic_net_fit(X[rows, :], y[rows], 0.2, 0.8)
        selection_count_lasso .+= abs.(bootstrap_lasso.beta_z) .> 1e-6
        selection_count_enet .+= abs.(bootstrap_enet.beta_z) .> 1e-6
    end

    @test selection_count_lasso == [49, 80, 99, 20]
    @test selection_count_enet == [100, 100, 100, 29]
    @test selection_count_lasso[1] < selection_count_lasso[2]
    @test all(selection_count_enet[1:2] .== 100)
    @test selection_count_enet[4] > selection_count_lasso[4]

    println((;
        predictor_correlation = round(cor(X[:, 1], X[:, 2]); digits = 4),
        lasso_standardized_coefficients =
            round.(lasso.beta_z; digits = 3),
        elastic_net_standardized_coefficients =
            round.(elastic_net.beta_z; digits = 3),
        selection_count_lasso,
        selection_count_enet,
    ))
end

@testset "選択と推論で同じデータを二重使用しない" begin
    function correlation_pvalue(x, y)
        r = cor(x, y)
        t = r * sqrt((length(x) - 2) / (1 - r^2))
        return 2 * ccdf(TDist(length(x) - 2), abs(t))
    end

    rng = Xoshiro(3014)
    repetitions, n, p = 2000, 80, 20
    same_data_rejections = 0
    split_data_rejections = 0
    same_data_p = Float64[]
    split_data_p = Float64[]
    for _ in 1:repetitions
        X = randn(rng, n, p)
        y = randn(rng, n)
        all_p = [correlation_pvalue(X[:, j], y) for j in 1:p]
        chosen_same = argmin(all_p)
        p_same = correlation_pvalue(X[:, chosen_same], y)

        selection_p = [correlation_pvalue(X[1:40, j], y[1:40])
                       for j in 1:p]
        chosen_split = argmin(selection_p)
        p_split = correlation_pvalue(
            X[41:80, chosen_split], y[41:80])

        same_data_rejections += p_same < 0.05
        split_data_rejections += p_split < 0.05
        push!(same_data_p, p_same)
        push!(split_data_p, p_split)
    end
    rejection_rates = [same_data_rejections,
                       split_data_rejections] ./ repetitions
    median_p = [median(same_data_p), median(split_data_p)]

    @test same_data_rejections == 1285
    @test split_data_rejections == 109
    @test rejection_rates[1] > 0.6
    @test 0.04 < rejection_rates[2] < 0.07
    @test rejection_rates[1] > 10 * rejection_rates[2]
    @test round.(median_p; digits = 3) == [0.035, 0.483]

    println((;
        rejection_rates,
        median_p = round.(median_p; digits = 3),
    ))
end

println(
    "Julia ", VERSION,
    " / GLM ", pkgversion(GLM),
    " / CairoMakie ", pkgversion(CairoMakie),
)
