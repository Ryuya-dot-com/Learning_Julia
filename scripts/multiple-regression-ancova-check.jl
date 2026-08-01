#!/usr/bin/env julia

# L29「重回帰・交絡・ANCOVA」の掲載値とモデル間の不変性を固定検証する。
# 例:
#   julia --project=/path/to/validation-env scripts/multiple-regression-ancova-check.jl

using Test
using Random
using Statistics
using LinearAlgebra
using Distributions
using DataFrames
using CategoricalArrays
using StatsModels
using GLM

function linear_contrast(model, weights)
    names = coefnames(model)
    unknown = setdiff(collect(keys(weights)), names)
    isempty(unknown) || throw(ArgumentError("unknown coefficient: $(unknown)"))
    L = [get(weights, name, 0.0) for name in names]
    any(!iszero, L) || throw(ArgumentError("at least one nonzero weight is required"))
    estimate = dot(L, coef(model))
    se = sqrt(dot(L, vcov(model) * L))
    df = Int(dof_residual(model))
    t = estimate / se
    p = 2ccdf(TDist(df), abs(t))
    critical = quantile(TDist(df), 0.975)
    return (
        estimate = estimate,
        se = se,
        t = t,
        df = df,
        p = p,
        ci = (estimate - critical * se, estimate + critical * se),
    )
end

function holm_adjust(pvalues)
    order = sortperm(pvalues)
    adjusted = similar(pvalues, Float64)
    running_max = 0.0
    m = length(pvalues)
    for (rank, index) in enumerate(order)
        running_max = max(running_max, (m - rank + 1) * pvalues[index])
        adjusted[index] = min(running_max, 1.0)
    end
    return adjusted
end

@testset "交絡と変数投入" begin
    rng = Xoshiro(2900)
    n = 240
    z = randn(rng, n)
    x = 0.7 .* z .+ randn(rng, n) .* 0.7
    y = 0.5 .* z .+ randn(rng, n) .* 0.7
    df = DataFrame(x = x, y = y, z = z)

    x_only = lm(@formula(y ~ x), df)
    adjusted = lm(@formula(y ~ x + z), df)
    comparison = ftest(x_only.model, adjusted.model)

    @test coef(x_only)[2] > 0.3
    @test abs(coef(adjusted)[2]) < 0.1
    @test coef(adjusted)[3] > 0.4
    @test comparison.fstat[2] > 20
    @test comparison.pval[2] < 1e-5

    println((
        x_only_coef = round.(coef(x_only), digits = 3),
        adjusted_coef = round.(coef(adjusted), digits = 3),
        x_only = round(coef(x_only)[2], digits = 3),
        x_adjusted = round(coef(adjusted)[2], digits = 3),
        z_adjusted = round(coef(adjusted)[3], digits = 3),
        r2 = round.([r2(x_only), r2(adjusted)], digits = 3),
        added_z_f = round(comparison.fstat[2], digits = 3),
        added_z_p = comparison.pval[2],
    ))
end

rng = Xoshiro(2901)
n_per_group = 40
group = categorical(repeat(["control", "training", "combined"], inner = n_per_group))
levels!(group, ["control", "training", "combined"])
pretest = vcat(
    rand(rng, Normal(48, 8), n_per_group),
    rand(rng, Normal(52, 8), n_per_group),
    rand(rng, Normal(55, 8), n_per_group),
)
treatment_effect = Dict("control" => 0.0, "training" => 6.0, "combined" => 12.0)
posttest = 20 .+ 0.65 .* pretest .+
           [treatment_effect[string(g)] for g in group] .+
           rand(rng, Normal(0, 6), length(group))
ancova_df = DataFrame(group = group, pretest = pretest, posttest = posttest)
ancova_df.pre_c = ancova_df.pretest .- mean(ancova_df.pretest)

control_coding = Dict(
    :group => DummyCoding(
        base = "control",
        levels = ["control", "training", "combined"],
    ),
)
training_coding = Dict(
    :group => DummyCoding(
        base = "training",
        levels = ["control", "training", "combined"],
    ),
)

@testset "ANCOVAと参照水準" begin
    unadjusted = lm(@formula(posttest ~ group), ancova_df; contrasts = control_coding)
    control_model = lm(
        @formula(posttest ~ pre_c + group),
        ancova_df;
        contrasts = control_coding,
    )
    training_model = lm(
        @formula(posttest ~ pre_c + group),
        ancova_df;
        contrasts = training_coding,
    )

    @test coefnames(control_model) == [
        "(Intercept)",
        "pre_c",
        "group: training",
        "group: combined",
    ]
    @test coefnames(training_model) == [
        "(Intercept)",
        "pre_c",
        "group: control",
        "group: combined",
    ]
    @test predict(control_model) ≈ predict(training_model)
    @test r2(control_model) ≈ r2(training_model)
    @test deviance(control_model) ≈ deviance(training_model)
    @test coef(control_model)[3] ≈ -coef(training_model)[3]
    @test coef(control_model)[4] - coef(control_model)[3] ≈ coef(training_model)[4]

    println((
        levels = string.(levels(ancova_df.group)),
        pretest_means = round.([
            mean(ancova_df.pretest[ancova_df.group .== level])
            for level in levels(ancova_df.group)
        ], digits = 2),
        unadjusted_names = coefnames(unadjusted),
        unadjusted = round.(coef(unadjusted), digits = 2),
        control_names = coefnames(control_model),
        control_reference = round.(coef(control_model), digits = 2),
        training_names = coefnames(training_model),
        training_reference = round.(coef(training_model), digits = 2),
        same_r2 = round(r2(control_model), digits = 3),
    ))
end

@testset "ネストしたモデル比較" begin
    covariate_model = lm(@formula(posttest ~ pre_c), ancova_df)
    additive_model = lm(
        @formula(posttest ~ pre_c + group),
        ancova_df;
        contrasts = control_coding,
    )
    interaction_model = lm(
        @formula(posttest ~ pre_c * group),
        ancova_df;
        contrasts = control_coding,
    )
    comparison = ftest(
        covariate_model.model,
        additive_model.model,
        interaction_model.model,
    )
    partial_r2_group = (
        deviance(covariate_model) - deviance(additive_model)
    ) / deviance(covariate_model)
    partial_r2_interaction = (
        deviance(additive_model) - deviance(interaction_model)
    ) / deviance(additive_model)

    @test comparison.dof == (3, 5, 7)
    @test comparison.fstat[2] > 20
    @test comparison.pval[2] < 1e-8
    # 真の交互作用は0だが、この標本では5%水準を偶然下回る。
    # 都合のよいseedへ変えず、モデル選択をp値へ丸投げする反例として固定する。
    @test comparison.fstat[3] ≈ 3.4108433381985783
    @test comparison.pval[3] ≈ 0.03641812283209555
    @test 0.2 < partial_r2_group < 0.5
    @test partial_r2_interaction ≈ 0.05646078004744318

    println((
        dof = comparison.dof,
        r2 = round.(comparison.r2, digits = 3),
        delta_r2 = round.([
            comparison.r2[2] - comparison.r2[1],
            comparison.r2[3] - comparison.r2[2],
        ], digits = 3),
        f = round.(collect(comparison.fstat[2:3]), digits = 3),
        p = collect(comparison.pval[2:3]),
        partial_r2 = round.([partial_r2_group, partial_r2_interaction], digits = 3),
    ))
end

@testset "計画コントラストと事後比較" begin
    planned = HypothesisCoding(
        [-1.0 0.5 0.5; 0.0 -1.0 1.0];
        levels = ["control", "training", "combined"],
        labels = ["interventions-control", "combined-training"],
    )
    planned_model = lm(
        @formula(posttest ~ pre_c + group),
        ancova_df;
        contrasts = Dict(:group => planned),
    )
    dummy_model = lm(
        @formula(posttest ~ pre_c + group),
        ancova_df;
        contrasts = control_coding,
    )

    training_control = linear_contrast(
        dummy_model,
        Dict("group: training" => 1.0),
    )
    combined_control = linear_contrast(
        dummy_model,
        Dict("group: combined" => 1.0),
    )
    combined_training = linear_contrast(
        dummy_model,
        Dict("group: training" => -1.0, "group: combined" => 1.0),
    )
    raw_p = [training_control.p, combined_control.p, combined_training.p]
    adjusted_p = holm_adjust(raw_p)

    @test predict(planned_model) ≈ predict(dummy_model)
    @test coefnames(planned_model)[3:4] == [
        "group: interventions-control",
        "group: combined-training",
    ]
    @test coef(planned_model)[3] ≈ (
        coef(dummy_model)[3] + coef(dummy_model)[4]
    ) / 2
    @test coef(planned_model)[4] ≈ coef(dummy_model)[4] - coef(dummy_model)[3]
    @test all(adjusted_p .>= raw_p)
    @test issorted(raw_p[sortperm(raw_p)])
    @test_throws ArgumentError linear_contrast(
        dummy_model,
        Dict("group: typo" => 1.0),
    )

    println((
        planned_names = coefnames(planned_model),
        planned = round.(coef(planned_model), digits = 3),
        pairwise_estimates = round.([
            training_control.estimate,
            combined_control.estimate,
            combined_training.estimate,
        ], digits = 3),
        pairwise_ci = [round.(collect(test.ci), digits = 3) for test in (
            training_control,
            combined_control,
            combined_training,
        )],
        raw_p = raw_p,
        holm_p = adjusted_p,
        holm_display = round.(adjusted_p, sigdigits = 4),
    ))
end

println(
    "Julia ", VERSION,
    " / GLM ", pkgversion(GLM),
    " / StatsModels ", pkgversion(StatsModels),
    " / CategoricalArrays ", pkgversion(CategoricalArrays),
)
