#!/usr/bin/env julia

# L31「ロジスティック回帰」の掲載値と性質を固定検証する。
# 例:
#   julia --project=/path/to/validation-env scripts/logistic-regression-check.jl

using Test
using Random
using Statistics
using Distributions
using DataFrames
using CategoricalArrays
using StatsModels
using StatsBase
using GLM

logistic(x) = 1 / (1 + exp(-x))

function pairwise_auc(y::AbstractVector{Bool}, score::AbstractVector)
    positive = score[y]
    negative = score[.!y]
    return mean(a > b ? 1.0 : a == b ? 0.5 : 0.0
                for a in positive for b in negative)
end

function equal_count_calibration(y::AbstractVector{Bool}, score::AbstractVector;
                                 bins::Int = 5)
    order = sortperm(score)
    bin = similar(order)
    for (rank, row) in enumerate(order)
        bin[row] = min(bins, cld(rank * bins, length(score)))
    end
    data = DataFrame(observed = Float64.(y), predicted = score, bin = bin)
    return combine(groupby(data, :bin),
        :predicted => mean => :mean_predicted,
        :observed => mean => :observed_rate,
        nrow => :n)
end

function decision_metrics(y::AbstractVector{Bool}, probability::AbstractVector,
                          threshold::Real;
                          false_negative_cost::Real = 5,
                          false_positive_cost::Real = 1)
    positive = probability .>= threshold
    tp = count(positive .& y)
    fp = count(positive .& .!y)
    fn = count(.!positive .& y)
    tn = count(.!positive .& .!y)
    return (;
        threshold,
        actions = sum(positive),
        sensitivity = tp / (tp + fn),
        specificity = tn / (tn + fp),
        ppv = tp / (tp + fp),
        cost_per_person = (false_negative_cost * fn +
                           false_positive_cost * fp) / length(y),
    )
end

@testset "Bernoulli個票・確率・オッズ比" begin
    rng = Xoshiro(3101)
    n = 800
    study = randn(rng, n)
    true_probability = logistic.(-0.4 .+ 1.1 .* study)
    correct = rand(rng, n) .< true_probability
    individual_df = DataFrame(study = study, correct = correct)
    individual_model = glm(
        @formula(correct ~ study), individual_df, Binomial(), LogitLink())

    probability_grid = DataFrame(study = [-2.0, -1.0, 0.0, 1.0, 2.0])
    probability_grid.probability = predict(individual_model, probability_grid)
    probability_grid.next_probability = predict(individual_model,
        DataFrame(study = probability_grid.study .+ 1))
    probability_grid.probability_difference =
        probability_grid.next_probability .- probability_grid.probability
    interval = predict(individual_model,
        DataFrame(study = [-1.0, 0.0, 1.0]); interval = :confidence)
    odds_ratio = exp(coef(individual_model)[2])
    odds_ratio_interval = exp.(coef(individual_model)[2] .+
        [-1, 1] .* 1.96 .* stderror(individual_model)[2])
    average_marginal_effect = mean(coef(individual_model)[2] .*
        predict(individual_model) .* (1 .- predict(individual_model)))

    @test individual_model.model isa GLM.GeneralizedLinearModel
    @test -0.6 < coef(individual_model)[1] < -0.2
    @test 0.9 < coef(individual_model)[2] < 1.3
    @test 2.4 < odds_ratio < 3.7
    @test odds_ratio_interval[1] < odds_ratio < odds_ratio_interval[2]
    @test all(0 .< probability_grid.probability .< 1)
    @test maximum(probability_grid.probability_difference) >
          minimum(probability_grid.probability_difference) + 0.1
    @test all(0 .<= interval.lower .<= interval.prediction .<= interval.upper .<= 1)
    @test 0.15 < average_marginal_effect < 0.25

    println((
        coefficients = round.(coef(individual_model), digits = 3),
        odds_ratio = round(odds_ratio, digits = 3),
        odds_ratio_interval = round.(odds_ratio_interval, digits = 3),
        probabilities = round.(probability_grid.probability, digits = 3),
        probability_differences =
            round.(probability_grid.probability_difference, digits = 3),
        average_marginal_effect = round(average_marginal_effect, digits = 3),
        interval = (
            prediction = round.(interval.prediction, digits = 3),
            lower = round.(interval.lower, digits = 3),
            upper = round.(interval.upper, digits = 3),
        ),
    ))
end

@testset "Bernoulli個票とBinomial集計は同じ尤度を表せる" begin
    x = [-1.5, -0.5, 0.5, 1.5]
    trials = [100, 120, 110, 90]
    rng = Xoshiro(3102)
    probability = logistic.(-0.3 .+ 0.9 .* x)
    successes = rand.(Ref(rng), Binomial.(trials, probability))

    grouped_df = DataFrame(
        x = x,
        successes = successes,
        trials = trials,
        proportion = successes ./ trials,
    )
    grouped_model = glm(@formula(proportion ~ x), grouped_df,
        Binomial(), LogitLink(); weights = fweights(grouped_df.trials))

    expanded_df = DataFrame(
        x = reduce(vcat, [fill(x[i], trials[i]) for i in eachindex(x)]),
        success = reduce(vcat, [vcat(fill(true, successes[i]),
            fill(false, trials[i] - successes[i])) for i in eachindex(x)]),
    )
    individual_model = glm(
        @formula(success ~ x), expanded_df, Binomial(), LogitLink())

    @test nobs(grouped_model) == sum(trials)
    @test coef(grouped_model) ≈ coef(individual_model) atol = 1e-10
    @test predict(grouped_model) ≈ predict(individual_model,
        DataFrame(x = x)) atol = 1e-10

    println((
        successes = successes,
        proportions = round.(grouped_df.proportion, digits = 3),
        grouped_coef = round.(coef(grouped_model), digits = 3),
        individual_coef = round.(coef(individual_model), digits = 3),
        nobs = nobs(grouped_model),
    ))
end

@testset "参照水準・交互作用・ネストモデル比較" begin
    rng = Xoshiro(3103)
    n_per_group = 400
    group = categorical(repeat(["control", "training"], inner = n_per_group))
    levels!(group, ["control", "training"])
    severity = randn(rng, 2 * n_per_group)
    training = group .== "training"
    eta = -0.7 .+ 0.8 .* severity .+ 0.6 .* training .-
          0.5 .* severity .* training
    improved = rand(rng, 2 * n_per_group) .< logistic.(eta)
    interaction_df = DataFrame(
        group = group, severity = severity, improved = improved)

    control_coding = Dict(:group => DummyCoding(
        base = "control", levels = ["control", "training"]))
    training_coding = Dict(:group => DummyCoding(
        base = "training", levels = ["control", "training"]))
    reduced_model = glm(@formula(improved ~ severity + group), interaction_df,
        Binomial(), LogitLink(); contrasts = control_coding)
    control_model = glm(@formula(improved ~ severity * group), interaction_df,
        Binomial(), LogitLink(); contrasts = control_coding)
    training_model = glm(@formula(improved ~ severity * group), interaction_df,
        Binomial(), LogitLink(); contrasts = training_coding)

    grid = DataFrame(
        severity = repeat([-1.0, 0.0, 1.0], 2),
        group = categorical(repeat(["control", "training"], inner = 3)),
    )
    levels!(grid.group, ["control", "training"])
    grid.probability = predict(control_model, grid)
    likelihood_ratio = deviance(reduced_model) - deviance(control_model)
    delta_df = dof(control_model) - dof(reduced_model)
    likelihood_ratio_p = ccdf(Chisq(delta_df), likelihood_ratio)

    @test maximum(abs.(predict(control_model) .- predict(training_model))) < 1e-10
    @test coefnames(control_model) == ["(Intercept)", "severity",
        "group: training", "severity & group: training"]
    @test likelihood_ratio > 3
    @test delta_df == 1
    @test likelihood_ratio_p < 0.05
    @test all(0 .< grid.probability .< 1)

    println((
        control_base_coef = round.(coef(control_model), digits = 3),
        training_base_coef = round.(coef(training_model), digits = 3),
        max_prediction_change =
            maximum(abs.(predict(control_model) .- predict(training_model))),
        grid_probabilities = round.(grid.probability, digits = 3),
        likelihood_ratio = round(likelihood_ratio, digits = 3),
        delta_df = delta_df,
        p = likelihood_ratio_p,
    ))
end

@testset "分離は有限な通常推定を壊す" begin
    separated_df = DataFrame(
        x = collect(-20.0:20.0),
        outcome = collect(-20.0:20.0) .> 0,
    )
    separated_result = try
        model = glm(@formula(outcome ~ x), separated_df,
            Binomial(), LogitLink(); maxiter = 100)
        (status = :fit, coefficient = coef(model)[2],
         fitted_min = minimum(predict(model)), fitted_max = maximum(predict(model)))
    catch error
        (status = :error, error_type = nameof(typeof(error)))
    end

    @test separated_result.status == :error ||
          abs(separated_result.coefficient) > 10 ||
          separated_result.fitted_min < 1e-8 || separated_result.fitted_max > 1 - 1e-8
    println(separated_result)
end

@testset "較正・識別・意思決定を分ける" begin
    train_rng = Xoshiro(3104)
    test_rng = Xoshiro(3105)
    n_train = 800
    n_test = 1200
    train_x = randn(train_rng, n_train)
    train_probability = logistic.(-0.8 .+ 1.2 .* train_x)
    train_y = rand(train_rng, n_train) .< train_probability
    test_x = randn(test_rng, n_test)
    test_probability = logistic.(-0.8 .+ 1.2 .* test_x)
    test_y = rand(test_rng, n_test) .< test_probability
    train_df = DataFrame(x = train_x, outcome = train_y)
    test_df = DataFrame(x = test_x, outcome = test_y)
    model = glm(@formula(outcome ~ x), train_df, Binomial(), LogitLink())
    predicted = predict(model, test_df)
    overconfident = logistic.(2.5 .* log.(predicted ./ (1 .- predicted)))

    brier = mean((Float64.(test_y) .- predicted) .^ 2)
    overconfident_brier = mean((Float64.(test_y) .- overconfident) .^ 2)
    auc = pairwise_auc(test_y, predicted)
    overconfident_auc = pairwise_auc(test_y, overconfident)
    calibration = equal_count_calibration(test_y, predicted; bins = 5)
    rare_y = vcat(fill(true, 5), fill(false, 95))
    always_negative = fill(false, 100)
    rare_accuracy = mean(always_negative .== rare_y)
    rare_sensitivity = mean(always_negative[rare_y])
    decision_thresholds = [0.1, 1 / 6, 0.2, 0.5, 0.8]
    decision_results = [decision_metrics(test_y, predicted, threshold)
                        for threshold in decision_thresholds]

    predicted_logit = log.(predicted ./ (1 .- predicted))
    calibration_model = glm(
        @formula(outcome ~ predicted_logit),
        DataFrame(outcome = test_y, predicted_logit = predicted_logit),
        Binomial(), LogitLink())
    overconfident_logit = 2.5 .* predicted_logit
    overconfident_calibration_model = glm(
        @formula(outcome ~ predicted_logit),
        DataFrame(outcome = test_y,
                  predicted_logit = overconfident_logit),
        Binomial(), LogitLink())

    sensitivity_fixed, specificity_fixed = 0.8, 0.8
    prevalence = [0.05, 0.2, 0.5]
    ppv_by_prevalence = sensitivity_fixed .* prevalence ./
        (sensitivity_fixed .* prevalence .+
         (1 - specificity_fixed) .* (1 .- prevalence))

    @test 0.15 < brier < 0.23
    @test overconfident_brier > brier
    @test 0.7 < auc < 0.85
    @test auc == overconfident_auc
    @test sum(calibration.n) == n_test
    @test rare_accuracy == 0.95
    @test rare_sensitivity == 0.0
    @test getproperty.(decision_results, :actions) == [992, 839, 767, 327, 67]
    @test round.(getproperty.(decision_results, :cost_per_person); digits = 3) ==
          [0.555, 0.588, 0.598, 1.016, 1.519]
    @test decision_results[2].cost_per_person <
          decision_results[4].cost_per_person / 1.7
    @test round.(coef(calibration_model); digits = 3) == [-0.098, 0.786]
    @test round.(coef(overconfident_calibration_model); digits = 3) ==
          [-0.098, 0.314]
    @test round.(ppv_by_prevalence; digits = 3) == [0.174, 0.5, 0.8]

    println((
        coefficients = round.(coef(model), digits = 3),
        brier = round(brier, digits = 3),
        overconfident_brier = round(overconfident_brier, digits = 3),
        auc = round(auc, digits = 3),
        overconfident_auc = round(overconfident_auc, digits = 3),
        calibration = calibration,
        rare_accuracy = rare_accuracy,
        rare_sensitivity = rare_sensitivity,
        decisions = [(
            threshold = round(result.threshold; digits = 3),
            actions = result.actions,
            sensitivity = round(result.sensitivity; digits = 3),
            specificity = round(result.specificity; digits = 3),
            ppv = round(result.ppv; digits = 3),
            cost = round(result.cost_per_person; digits = 3),
        ) for result in decision_results],
        calibration_coefficients =
            round.(coef(calibration_model); digits = 3),
        overconfident_calibration_coefficients =
            round.(coef(overconfident_calibration_model); digits = 3),
        ppv_by_prevalence = round.(ppv_by_prevalence; digits = 3),
    ))
end
