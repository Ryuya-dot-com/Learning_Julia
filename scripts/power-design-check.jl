#!/usr/bin/env julia

# L37「デザインの検定力設計」の掲載値と感度分析を固定検証する。
# 例:
#   julia --project=/path/to/validation-env scripts/power-design-check.jl

using Test
using Random
using Statistics
using DataFrames
using MixedModels

function wilson_interval(hits, n; level = 0.95)
    n > 0 || return (NaN, NaN)
    z = level == 0.95 ? 1.959963984540054 : error("この教材では95%だけを扱う")
    p = hits / n
    denominator = 1 + z^2 / n
    center = (p + z^2 / (2n)) / denominator
    half = z * sqrt(p * (1 - p) / n + z^2 / (4n^2)) / denominator
    return (max(0.0, center - half), min(1.0, center + half))
end

function crossed_design(n_subj, n_item; missing_rate = 0.0, seed = 1)
    subj = repeat(1:n_subj, inner = 2n_item)
    item = repeat(repeat(1:n_item, inner = 2), outer = n_subj)
    condition_centered = repeat([-0.5, 0.5], outer = n_subj * n_item)
    if missing_rate > 0
        rng = Xoshiro(seed)
        keep = rand(rng, length(subj)) .>= missing_rate
        subj, item = subj[keep], item[keep]
        condition_centered = condition_centered[keep]
    end
    return (; subj, item, condition_centered)
end

function simulate_response(rng, design, n_subj, n_item;
                           effect = 20.0,
                           subj_intercept_sd = 60.0,
                           subj_slope_sd = 25.0,
                           item_intercept_sd = 30.0,
                           item_slope_sd = 15.0,
                           residual_sd = 50.0,
                           reliability = 0.8)
    u0 = subj_intercept_sd .* randn(rng, n_subj)
    u1 = subj_slope_sd .* randn(rng, n_subj)
    v0 = item_intercept_sd .* randn(rng, n_item)
    v1 = item_slope_sd .* randn(rng, n_item)
    measurement_sd = residual_sd * sqrt(1 / reliability - 1)
    cc = design.condition_centered
    return 500 .+ effect .* cc .+
           u0[design.subj] .+ u1[design.subj] .* cc .+
           v0[design.item] .+ v1[design.item] .* cc .+
           residual_sd .* randn(rng, length(cc)) .+
           measurement_sd .* randn(rng, length(cc))
end

function power_lmm(; n_subj = 24, n_item = 12, effect = 20.0,
                   subj_slope_sd = 25.0, item_slope_sd = 15.0,
                   reliability = 0.8, missing_rate = 0.0,
                   nsim = 200, seed = 3601)
    design = crossed_design(n_subj, n_item; missing_rate,
                            seed = seed + 10_000)
    rng = Xoshiro(seed)
    first_y = simulate_response(rng, design, n_subj, n_item;
        effect, subj_slope_sd, item_slope_sd, reliability)
    df = DataFrame(
        subj = string.("S", design.subj),
        item = string.("I", design.item),
        condition_centered = design.condition_centered,
        y = first_y,
    )
    model = fit(
        MixedModel,
        @formula(y ~ 1 + condition_centered +
                     zerocorr(1 + condition_centered | subj) +
                     zerocorr(1 + condition_centered | item)),
        df;
        progress = false,
    )

    hits = 0
    analyzed = 0
    singular = 0
    regular_hits = 0
    regular_analyzed = 0
    for simulation in 1:nsim
        y = simulation == 1 ? first_y :
            simulate_response(rng, design, n_subj, n_item;
                effect, subj_slope_sd, item_slope_sd, reliability)
        try
            refit!(model, y; progress = false)
            analyzed += 1
            rejected = abs(coef(model)[2] / stderror(model)[2]) > 1.96
            hits += rejected
            is_singular = MixedModels.issingular(model)
            singular += is_singular
            if !is_singular
                regular_analyzed += 1
                regular_hits += rejected
            end
        catch
            # 解析不能も計画の失敗。conditional powerとは別に失敗率を返す。
        end
    end
    power = analyzed == 0 ? NaN : hits / analyzed
    mcse = analyzed == 0 ? NaN : sqrt(power * (1 - power) / analyzed)
    interval = wilson_interval(hits, analyzed)
    return (;
        power,
        mcse,
        lower = interval[1],
        upper = interval[2],
        analyzed,
        failure_rate = 1 - analyzed / nsim,
        singular_rate = analyzed == 0 ? NaN : singular / analyzed,
        regular_power = regular_analyzed == 0 ? NaN : regular_hits / regular_analyzed,
        retained_rows = length(design.subj),
    )
end

rounded(result) = (
    power = round(result.power, digits = 3),
    mcse = round(result.mcse, digits = 3),
    interval = round.([result.lower, result.upper], digits = 3),
    failure = round(result.failure_rate, digits = 3),
    singular = round(result.singular_rate, digits = 3),
    regular_power = round(result.regular_power, digits = 3),
    rows = result.retained_rows,
)

baseline = power_lmm()
null_result = power_lmm(effect = 0.0, nsim = 300, seed = 3602)
more_subjects = power_lmm(n_subj = 48, seed = 3603)
more_items = power_lmm(n_item = 24, seed = 3604)
heterogeneous = power_lmm(subj_slope_sd = 45.0, item_slope_sd = 30.0,
                          seed = 3605)
low_reliability = power_lmm(reliability = 0.5, seed = 3606)
missing_rows = power_lmm(missing_rate = 0.2, seed = 3607)
small_effect = power_lmm(effect = 10.0, seed = 3608)

println((baseline = rounded(baseline), null = rounded(null_result)))
println((more_subjects = rounded(more_subjects), more_items = rounded(more_items)))
println((heterogeneous = rounded(heterogeneous),
         low_reliability = rounded(low_reliability),
         missing_rows = rounded(missing_rows),
         small_effect = rounded(small_effect)))

@testset "検定力にはMCSE・区間・解析失敗率を付ける" begin
    @test baseline.analyzed == 200
    @test baseline.failure_rate == 0
    @test baseline.lower < baseline.power < baseline.upper
    @test 0 <= baseline.regular_power <= 1
    @test isapprox(baseline.mcse,
                   sqrt(baseline.power * (1 - baseline.power) / baseline.analyzed))
end

@testset "帰無シミュレーションで判定規則を校正する" begin
    @test null_result.analyzed == 300
    @test 0.015 < null_result.power < 0.09
    @test null_result.lower < 0.05 < null_result.upper
end

@testset "同じ観測数でも一般化軸で検定力が変わる" begin
    @test more_subjects.retained_rows == more_items.retained_rows == 1152
    @test more_subjects.power > baseline.power
    @test more_items.power > baseline.power
end

@testset "都合のよい単一仮定で80%を保証しない" begin
    @test heterogeneous.power < baseline.power
    @test low_reliability.power < baseline.power
    @test missing_rows.retained_rows < baseline.retained_rows
    @test small_effect.power < baseline.power
end

function required_nsim(power, target_mcse)
    return ceil(Int, power * (1 - power) / target_mcse^2)
end

println((at_power_80_half_point = required_nsim(0.8, 0.005),
         worst_case_half_point = required_nsim(0.5, 0.005)))

@testset "必要反復数を数値精度から逆算する" begin
    @test required_nsim(0.8, 0.005) in 6400:6401
    @test required_nsim(0.5, 0.005) == 10_000
end
