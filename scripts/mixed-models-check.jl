#!/usr/bin/env julia

# L35「within／betweenデザインと混合効果モデル」の掲載値と反例を固定検証する。
# 例:
#   julia --project=/path/to/validation-env scripts/mixed-models-check.jl

using Test
using Random
using Statistics
using Distributions
using DataFrames
using GLM
using MixedModels
using RegressionTables
using Effects
using CairoMakie

logistic(x) = inv(1 + exp(-x))

function make_mixed_rt(; n_subj = 60, n_item = 12, seed = 3401,
                        group_effect = 30.0, condition_effect = 40.0,
                        interaction_effect = 20.0, subj_intercept_sd = 80.0,
                        subj_slope_sd = 35.0, item_intercept_sd = 35.0,
                        residual_sd = 50.0)
    rng = Xoshiro(seed)
    group_by_subj = repeat([0, 1], inner = n_subj ÷ 2)
    subj_intercept = randn(rng, n_subj) .* subj_intercept_sd
    subj_slope = randn(rng, n_subj) .* subj_slope_sd
    item_intercept = randn(rng, n_item) .* item_intercept_sd

    subj = Int[]
    item = Int[]
    group = Int[]
    condition = Int[]
    condition_centered = Float64[]
    rt = Float64[]
    for s in 1:n_subj, i in 1:n_item, c in (0, 1)
        cc = c - 0.5
        g = group_by_subj[s]
        μ = 500 + group_effect * g + condition_effect * cc +
            interaction_effect * g * cc + subj_intercept[s] +
            subj_slope[s] * cc + item_intercept[i]
        push!(subj, s)
        push!(item, i)
        push!(group, g)
        push!(condition, c)
        push!(condition_centered, cc)
        push!(rt, μ + randn(rng) * residual_sd)
    end
    return DataFrame(
        subj = string.("S", subj),
        item = string.("I", item),
        group = group,
        condition = condition,
        condition_centered = condition_centered,
        rt = rt,
    )
end

rt = make_mixed_rt()
fixed_formula = @formula(rt ~ 1 + group + condition_centered + group & condition_centered)
naive = lm(fixed_formula, rt)
random_intercept = fit(
    MixedModel,
    @formula(rt ~ 1 + group + condition_centered + group & condition_centered +
                 (1 | subj) + (1 | item)),
    rt;
    progress = false,
)
random_slope = fit(
    MixedModel,
    @formula(rt ~ 1 + group + condition_centered + group & condition_centered +
                 (1 + condition_centered | subj) + (1 | item)),
    rt;
    progress = false,
)

se_comparison = (
    group_naive = stderror(naive)[2],
    group_mixed = stderror(random_slope)[2],
    condition_random_intercept = stderror(random_intercept)[3],
    condition_random_slope = stderror(random_slope)[3],
)
println(round.(collect(se_comparison), digits = 2))
println(round.(coef(random_slope), digits = 2))

@testset "擬似反復とランダム傾き欠落は同じ問題ではない" begin
    @test nrow(rt) == 60 * 12 * 2
    @test length(unique(rt.subj)) == 60
    @test se_comparison.group_mixed > 3 * se_comparison.group_naive
    @test se_comparison.condition_random_slope > 1.5 * se_comparison.condition_random_intercept
    @test isapprox(coef(random_slope)[3], 40; atol = 12)
    @test isapprox(coef(random_slope)[4], 20; atol = 15)
end

function make_contextual_data(; n_subj = 80, n_obs = 10, seed = 3402)
    rng = Xoshiro(seed)
    person_mean = randn(rng, n_subj)
    random_intercept = randn(rng, n_subj) .* 0.8
    subj = repeat(1:n_subj, inner = n_obs)
    x_between = repeat(person_mean, inner = n_obs)
    x_within = randn(rng, n_subj * n_obs)
    x_raw = x_between + x_within
    y = 10 .+ 3 .* x_between .+ 1 .* x_within .+
        repeat(random_intercept, inner = n_obs) .+
        randn(rng, n_subj * n_obs) .* 0.8
    return DataFrame(
        subj = string.("S", subj), x_raw = x_raw,
        x_between = x_between, x_within = x_within, y = y,
    )
end

context = make_contextual_data()
context_naive = fit(MixedModel, @formula(y ~ 1 + x_raw + (1 | subj)), context;
                    progress = false)
context_split = fit(
    MixedModel,
    @formula(y ~ 1 + x_between + x_within + (1 | subj)),
    context;
    progress = false,
)
println((
    conflated_slope = round(coef(context_naive)[2], digits = 2),
    between = round(coef(context_split)[2], digits = 2),
    within = round(coef(context_split)[3], digits = 2),
))

@testset "時変共変量はwithinとbetweenへ分解する" begin
    @test 1.0 < coef(context_naive)[2] < 2.0
    @test isapprox(coef(context_split)[2], 3; atol = 0.25)
    @test isapprox(coef(context_split)[3], 1; atol = 0.12)
end

function make_panel_data(; n_subj = 100, n_time = 12, seed = 3420)
    rng = Xoshiro(seed)
    treatment_by_subj = repeat([0, 1], inner = div(n_subj, 2))
    x_mean_by_subj = randn(rng, n_subj)
    subj_intercept = 3 .* randn(rng, n_subj)
    subj_time_slope = 0.6 .* randn(rng, n_subj)
    subj_index = Int[]
    time_since_baseline = Float64[]
    treatment = Int[]
    x_between = Float64[]
    x_within = Float64[]
    outcome = Float64[]
    for s in 1:n_subj
        previous_error = 0.0
        for time in 0:(n_time - 1)
            within = randn(rng)
            error = 0.7 * previous_error + 2 * randn(rng)
            y = 50 + 2 * time + 5 * treatment_by_subj[s] +
                1.5 * time * treatment_by_subj[s] + 3 * x_mean_by_subj[s] +
                within + subj_intercept[s] + subj_time_slope[s] * time + error
            push!(subj_index, s)
            push!(time_since_baseline, time)
            push!(treatment, treatment_by_subj[s])
            push!(x_between, x_mean_by_subj[s])
            push!(x_within, within)
            push!(outcome, y)
            previous_error = error
        end
    end
    return DataFrame(
        subj_index = subj_index, subj = string.("S", subj_index),
        time_since_baseline = time_since_baseline, treatment = treatment,
        x_between = x_between, x_within = x_within, outcome = outcome,
    )
end

function panel_lag1_residual_correlation(model, data, n_time)
    residual = data.outcome .- fitted(model)
    previous = Float64[]
    following = Float64[]
    for s in 1:(nrow(data) ÷ n_time)
        index = ((s - 1) * n_time + 1):(s * n_time)
        append!(previous, residual[index[1:(end - 1)]])
        append!(following, residual[index[2:end]])
    end
    return cor(previous, following)
end

panel = make_panel_data()
panel_random_intercept = fit(
    MixedModel,
    @formula(outcome ~ 1 + time_since_baseline + treatment +
                       time_since_baseline & treatment + x_between + x_within +
                       (1 | subj)),
    panel;
    progress = false,
)
panel_random_slope = fit(
    MixedModel,
    @formula(outcome ~ 1 + time_since_baseline + treatment +
                       time_since_baseline & treatment + x_between + x_within +
                       (1 + time_since_baseline | subj)),
    panel;
    progress = false,
)
panel_lag1 = panel_lag1_residual_correlation(panel_random_slope, panel, 12)
println((
    time = round(coef(panel_random_slope)[2], digits = 3),
    treatment = round(coef(panel_random_slope)[3], digits = 3),
    time_by_treatment = round(coef(panel_random_slope)[6], digits = 3),
    x_between = round(coef(panel_random_slope)[4], digits = 3),
    x_within = round(coef(panel_random_slope)[5], digits = 3),
    time_se = (
        random_intercept = round(stderror(panel_random_intercept)[2], digits = 3),
        random_slope = round(stderror(panel_random_slope)[2], digits = 3),
    ),
    lag1_conditional_residual = round(panel_lag1, digits = 3),
    singular = MixedModels.issingular(panel_random_slope),
))

@testset "パネルの個人別時間傾きと残差自己相関を分ける" begin
    @test nrow(panel) == 100 * 12
    @test length(panel_random_slope.σs.subj) == 2
    @test stderror(panel_random_slope)[2] >
          2 * stderror(panel_random_intercept)[2]
    @test isapprox(coef(panel_random_slope)[2], 2; atol = 0.2)
    @test isapprox(coef(panel_random_slope)[5], 1; atol = 0.15)
    @test isapprox(coef(panel_random_slope)[6], 1.5; atol = 0.2)
    @test 0.25 < panel_lag1 < 0.40
    @test !MixedModels.issingular(panel_random_slope)
end

reduced_ml = fit(
    MixedModel,
    @formula(rt ~ 1 + group + condition_centered +
                 (1 + condition_centered | subj) + (1 | item)),
    rt;
    progress = false,
)
full_ml = random_slope
lr = deviance(reduced_ml) - deviance(full_ml)
p_lr = ccdf(Chisq(1), lr)
full_reml = fit(
    MixedModel,
    @formula(rt ~ 1 + group + condition_centered + group & condition_centered +
                 (1 + condition_centered | subj) + (1 | item)),
    rt;
    REML = true,
    progress = false,
)
println((lr = round(lr, digits = 2), p = round(p_lr, digits = 4),
         ml_subj_sd = round(first(full_ml.σs.subj), digits = 2),
         reml_subj_sd = round(first(full_reml.σs.subj), digits = 2)))

@testset "固定効果のネスト比較は同じランダム構造のMLで行う" begin
    @test lr > 3
    @test p_lr < 0.1
    @test full_ml.optsum.REML == false
    @test full_reml.optsum.REML == true
end

function make_binary_crossed(; n_subj = 80, n_item = 16, seed = 3403)
    rng = Xoshiro(seed)
    subj_effect = randn(rng, n_subj) .* 0.7
    item_effect = randn(rng, n_item) .* 0.5
    subj = Int[]
    item = Int[]
    condition = Int[]
    response = Int[]
    for s in 1:n_subj, i in 1:n_item
        c = isodd(s + i) ? 1 : 0
        η = -0.5 + 0.9 * c + subj_effect[s] + item_effect[i]
        push!(subj, s)
        push!(item, i)
        push!(condition, c)
        push!(response, rand(rng) < logistic(η))
    end
    return DataFrame(
        subj = string.("S", subj), item = string.("I", item),
        condition = condition, response = response,
    )
end

binary = make_binary_crossed()
binary_glmm = fit(
    MixedModel,
    @formula(response ~ 1 + condition + (1 | subj) + (1 | item)),
    binary,
    Bernoulli();
    progress = false,
)
println((log_odds = round(coef(binary_glmm)[2], digits = 2),
         odds_ratio = round(exp(coef(binary_glmm)[2]), digits = 2)))

binary_beta = coef(binary_glmm)
binary_subj_sd = first(binary_glmm.σs.subj)
binary_item_sd = first(binary_glmm.σs.item)
binary_random_sd = hypot(binary_subj_sd, binary_item_sd)
normal_grid = quantile.(Normal(), ((1:20_000) .- 0.5) ./ 20_000)
fixed_zero_probability = [
    logistic(binary_beta[1] + binary_beta[2] * c) for c in (0, 1)
]
marginal_probability = [
    mean(logistic.(binary_beta[1] + binary_beta[2] * c .+
                   binary_random_sd .* normal_grid)) for c in (0, 1)
]
probability_to_odds(p) = p / (1 - p)
conditional_or = exp(binary_beta[2])
marginal_or = probability_to_odds(marginal_probability[2]) /
              probability_to_odds(marginal_probability[1])
latent_logistic_variance = π^2 / 3
binary_variance_total = binary_subj_sd^2 + binary_item_sd^2 +
                        latent_logistic_variance
latent_icc = (
    subj = binary_subj_sd^2 / binary_variance_total,
    item = binary_item_sd^2 / binary_variance_total,
    combined = (binary_subj_sd^2 + binary_item_sd^2) /
               binary_variance_total,
)
println((
    fixed_zero = round.(fixed_zero_probability, digits = 3),
    marginal = round.(marginal_probability, digits = 3),
    conditional_or = round(conditional_or, digits = 3),
    marginal_or = round(marginal_or, digits = 3),
    fixed_zero_difference = round(diff(fixed_zero_probability)[1], digits = 3),
    marginal_difference = round(diff(marginal_probability)[1], digits = 3),
    latent_icc = (subj = round(latent_icc.subj, digits = 3),
                  item = round(latent_icc.item, digits = 3),
                  combined = round(latent_icc.combined, digits = 3)),
))

@testset "二値反応はBernoulli GLMMで交差ランダム効果を保つ" begin
    @test binary_glmm isa GeneralizedLinearMixedModel
    @test isapprox(coef(binary_glmm)[2], 0.9; atol = 0.3)
    @test exp(coef(binary_glmm)[2]) > 1.7
    @test marginal_probability[2] > marginal_probability[1]
    @test 1 < marginal_or < conditional_or
    @test diff(marginal_probability)[1] < diff(fixed_zero_probability)[1]
    @test isapprox(marginal_or, 2.682; atol = 0.002)
    @test isapprox(latent_icc.combined, 0.196; atol = 0.002)
end

function make_binary_slope_data(; n_subj = 100, n_item = 20, seed = 3405)
    rng = Xoshiro(seed)
    subj_intercept = 0.7 .* randn(rng, n_subj)
    subj_slope = randn(rng, n_subj)
    item_intercept = 0.4 .* randn(rng, n_item)
    subj = Int[]
    item = Int[]
    condition_centered = Float64[]
    response = Int[]
    for s in 1:n_subj, i in 1:n_item
        cc = isodd(s + i) ? 0.5 : -0.5
        η = -0.6 + 0.8 * cc + subj_intercept[s] +
            subj_slope[s] * cc + item_intercept[i]
        push!(subj, s)
        push!(item, i)
        push!(condition_centered, cc)
        push!(response, rand(rng) < logistic(η))
    end
    return DataFrame(
        subj = string.("S", subj), item = string.("I", item),
        condition_centered = condition_centered, response = response,
    )
end

binary_slope = make_binary_slope_data()
binary_intercept_only = fit(
    MixedModel,
    @formula(response ~ 1 + condition_centered + (1 | subj) + (1 | item)),
    binary_slope,
    Bernoulli();
    progress = false,
)
binary_random_slope = fit(
    MixedModel,
    @formula(response ~ 1 + condition_centered +
                        (1 + condition_centered | subj) + (1 | item)),
    binary_slope,
    Bernoulli();
    progress = false,
)
binary_slope_lrt = MixedModels.likelihoodratiotest(
    binary_intercept_only, binary_random_slope,
)
binary_slope_deviance_difference = 2 * (
    loglikelihood(binary_random_slope) - loglikelihood(binary_intercept_only)
)
println((
    intercept_only = (
        estimate = round(coef(binary_intercept_only)[2], digits = 3),
        se = round(stderror(binary_intercept_only)[2], digits = 3),
    ),
    random_slope = (
        estimate = round(coef(binary_random_slope)[2], digits = 3),
        se = round(stderror(binary_random_slope)[2], digits = 3),
    ),
    deviance_difference = round(binary_slope_deviance_difference, digits = 3),
    optimizer = binary_random_slope.LMM.optsum.returnvalue,
    nAGQ = binary_random_slope.LMM.optsum.nAGQ,
    singular = MixedModels.issingular(binary_random_slope),
))

@testset "Bernoulli GLMMでもデザインが支えるランダム傾きを比較する" begin
    @test binary_slope_lrt.nobs == nrow(binary_slope)
    @test binary_slope_deviance_difference > 15
    @test stderror(binary_random_slope)[2] > 1.2 * stderror(binary_intercept_only)[2]
    @test 0.6 < last(binary_random_slope.σs.subj) < 1.3
    @test binary_random_slope.LMM.optsum.nAGQ == 1
    @test !MixedModels.issingular(binary_random_slope)
end

function make_binary_deployment_data(; n_subj = 120, n_item = 20, seed = 3410)
    rng = Xoshiro(seed)
    subj_intercept = 1.3 .* randn(rng, n_subj)
    item_intercept = 0.8 .* randn(rng, n_item)
    subj_index = Int[]
    item_index = Int[]
    condition = Int[]
    response = Int[]
    for s in 1:n_subj, i in 1:n_item
        c = isodd(s + i) ? 1 : 0
        η = -0.8 + 0.9 * c + subj_intercept[s] + item_intercept[i]
        push!(subj_index, s)
        push!(item_index, i)
        push!(condition, c)
        push!(response, rand(rng) < logistic(η))
    end
    return DataFrame(
        subj_index = subj_index, item_index = item_index,
        subj = string.("S", subj_index), item = string.("I", item_index),
        condition = condition, response = response,
    )
end

binary_brier(y, p) = mean((y .- p) .^ 2)
function binary_log_loss(y, p)
    probability = clamp.(p, eps(Float64), 1 - eps(Float64))
    return mean(-y .* log.(probability) .-
                (1 .- y) .* log1p.(-probability))
end

deployment = make_binary_deployment_data()
row_test = [mod(3s + 2i, 5) == 0 for
            (s, i) in zip(deployment.subj_index, deployment.item_index)]
row_model = fit(
    MixedModel,
    @formula(response ~ 1 + condition + (1 | subj) + (1 | item)),
    deployment[.!row_test, :],
    Bernoulli();
    progress = false,
)
row_conditional_probability = predict(row_model, deployment[row_test, :])
row_population_probability = logistic.(
    coef(row_model)[1] .+ coef(row_model)[2] .* deployment.condition[row_test]
)

group_train = (deployment.subj_index .<= 96) .&
              (deployment.item_index .<= 16)
both_new_test = (deployment.subj_index .> 96) .&
                (deployment.item_index .> 16)
group_model = fit(
    MixedModel,
    @formula(response ~ 1 + condition + (1 | subj) + (1 | item)),
    deployment[group_train, :],
    Bernoulli();
    progress = false,
)
both_new_probability = predict(
    group_model, deployment[both_new_test, :]; new_re_levels = :population,
)

deployment_validation = (
    row_conditional = (
        brier = binary_brier(deployment.response[row_test],
                             row_conditional_probability),
        log_loss = binary_log_loss(deployment.response[row_test],
                                   row_conditional_probability),
    ),
    row_population = (
        brier = binary_brier(deployment.response[row_test],
                             row_population_probability),
        log_loss = binary_log_loss(deployment.response[row_test],
                                   row_population_probability),
    ),
    both_new = (
        brier = binary_brier(deployment.response[both_new_test],
                             both_new_probability),
        log_loss = binary_log_loss(deployment.response[both_new_test],
                                   both_new_probability),
        calibration_in_the_large = mean(deployment.response[both_new_test]) -
                                   mean(both_new_probability),
    ),
)
println((
    row_conditional = round.(collect(deployment_validation.row_conditional), digits = 3),
    row_population = round.(collect(deployment_validation.row_population), digits = 3),
    both_new = round.(collect(deployment_validation.both_new), digits = 3),
))

@testset "行分割と未知参加者・項目への配備を分離する" begin
    @test sum(row_test) == 480
    @test sum(both_new_test) == 96
    @test deployment_validation.row_conditional.brier <
          deployment_validation.row_population.brier
    @test deployment_validation.row_conditional.log_loss <
          deployment_validation.row_population.log_loss
    @test deployment_validation.both_new.brier >
          deployment_validation.row_conditional.brier
    @test deployment_validation.both_new.log_loss >
          deployment_validation.row_conditional.log_loss
    @test isapprox(deployment_validation.both_new.calibration_in_the_large,
                   0.103; atol = 0.002)
end

function make_no_slope_data(; n_subj = 18, n_pair = 4, seed = 3404)
    rng = Xoshiro(seed)
    subj_intercept = randn(rng, n_subj) .* 30
    pair_error = randn(rng, n_subj, n_pair) .* 50
    subj = Int[]
    condition_centered = Float64[]
    y = Float64[]
    for s in 1:n_subj, p in 1:n_pair, cc in (-0.5, 0.5)
        push!(subj, s)
        push!(condition_centered, cc)
        # 同じpair errorを両条件へ加えるので、各ペアの条件差は必ず40になる。
        push!(y, 500 + 40 * cc + subj_intercept[s] + pair_error[s, p])
    end
    return DataFrame(subj = string.("S", subj),
                     condition_centered = condition_centered, y = y)
end

no_slope = make_no_slope_data()
too_complex = fit(
    MixedModel,
    @formula(y ~ 1 + condition_centered +
                 (1 + condition_centered | subj)),
    no_slope;
    progress = false,
)
println((singular = MixedModels.issingular(too_complex),
         theta = round.(too_complex.θ, digits = 3)))

@testset "設計より複雑なランダム効果は境界推定になりうる" begin
    @test MixedModels.issingular(too_complex)
    @test any(iszero, too_complex.θ)
end

function make_notebook_rt(n_subj, n_trial, effect;
                          subj_sd = 30, slope_sd = 20, seed = 2026)
    rng = Xoshiro(seed)
    subj = repeat(1:n_subj, inner = n_trial)
    condition_centered = repeat([-0.5, 0.5], outer = n_subj * n_trial ÷ 2)
    u0 = randn(rng, n_subj) .* subj_sd
    u1 = randn(rng, n_subj) .* slope_sd
    rt = 500 .+ effect .* condition_centered .+ u0[subj] .+
        u1[subj] .* condition_centered .+ randn(rng, n_subj * n_trial) .* 50
    return DataFrame(subj = string.("S", subj),
                     condition_centered = condition_centered, rt = rt)
end

notebook_model = fit(
    MixedModel,
    @formula(rt ~ 1 + condition_centered +
                 (1 + condition_centered | subj)),
    make_notebook_rt(20, 10, 40);
    progress = false,
)
notebook_sds = [
    first(fit(MixedModel,
              @formula(rt ~ 1 + condition_centered +
                           (1 + condition_centered | subj)),
              make_notebook_rt(20, 10, 40; subj_sd = s);
              progress = false).σs.subj)
    for s in [10, 30, 60]
]
println((fixed = round.(coef(notebook_model), digits = 2),
         random_sd = round.(collect(values(notebook_model.σs.subj)), digits = 2),
         intercept_sensitivity = round.(notebook_sds, digits = 2)))

@testset "Notebook 5でもランダム傾きを復元する" begin
    @test isapprox(coef(notebook_model)[2], 40; atol = 15)
    @test length(notebook_model.σs.subj) > 1
    @test issorted(notebook_sds)
    @test notebook_sds[3] > 40
end

table_text = String(regtable(
    random_intercept,
    random_slope;
    renderSettings = asciiOutput(),
    below_statistic = :se,
    regression_statistics = [:nobs],
    print_estimator_section = false,
    print_result = false,
))
fixed_table = DataFrame(coeftable(random_slope))
random_table = DataFrame(
    term = ["intercept", "condition_centered"],
    sd = collect(values(random_slope.σs.subj)),
)
println((fixed_columns = names(fixed_table), fixed = fixed_table,
         random = transform(random_table, :sd => ByRow(x -> round(x, digits = 2)) => :sd)))
effect_grid = effects(
    Dict(:group => [0, 1], :condition_centered => [-0.5, 0.5]),
    random_slope,
)
em_grid = emmeans(
    random_slope;
    levels = Dict(:group => [0, 1], :condition_centered => [-0.5, 0.5]),
    ci_level = 0.95,
)
pair_grid = empairs(
    random_slope;
    levels = Dict(:group => [0, 1], :condition_centered => [-0.5, 0.5]),
    dof = Inf,
    ci_level = 0.95,
)
println(select(effect_grid, :group, :condition_centered,
               :rt => ByRow(x -> round(x, digits = 2)) => :predicted_rt))

effect_figure = Figure(size = (640, 400))
effect_axis = Axis(effect_figure[1, 1], xlabel = "condition (centered)",
                   ylabel = "fixed-effect prediction (ms)")
for (g, label, color) in [(0, "group 0", :steelblue),
                          (1, "group 1", :darkorange)]
    d = filter(:group => ==(g), effect_grid)
    band!(effect_axis, d.condition_centered, d.lower, d.upper;
          color = (color, 0.18))
    lines!(effect_axis, d.condition_centered, d.rt; color, label)
    scatter!(effect_axis, d.condition_centered, d.rt; color)
end
axislegend(effect_axis; position = :lt)

@testset "sjPlot相当の表と効果予測を組み合わせる" begin
    @test occursin("condition_centered", table_text)
    # MixedModels 5.8と共存できるRegressionTables 0.5.10は
    # ランダム効果を表示しないため、固定効果表としてのみ使う。
    @test !occursin("subj | condition_centered", table_text)
    @test nrow(fixed_table) == 4
    @test nrow(random_table) == 2
    @test nrow(effect_grid) == 4
    @test all([:rt, :err, :lower, :upper] .∈ Ref(propertynames(effect_grid)))
    @test all((effect_grid.lower .< effect_grid.rt) .&
              (effect_grid.rt .< effect_grid.upper))
    @test round.(effect_grid.rt, digits = 2) == [451.47, 487.25, 498.69, 561.56]
    @test nrow(em_grid) == 4
    @test nrow(pair_grid) == 6
    mktempdir() do dir
        output_path = joinpath(dir, "l34-effects.png")
        save(output_path, effect_figure)
        @test filesize(output_path) > 0
    end
end
