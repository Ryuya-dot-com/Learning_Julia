#!/usr/bin/env julia

# L26「相関係数の標本変動」とL27「尺度に応じた関連指標」の数値/API検証。
# 実行例:
#   julia --project=/path/to/validation-env scripts/association-check.jl

using Test
using Random
using Statistics
using Distributions
using StatsBase
using HypothesisTests
using DataFrames
using CategoricalArrays
using StatsModels
using GLM

function cor_once(rng, n, rho)
    d = MvNormal(zeros(2), [1.0 rho; rho 1.0])
    x = rand(rng, d, n)
    return cor(view(x, 1, :), view(x, 2, :))
end

cor_sims(rng, n, rho; nsim = 5000) = [cor_once(rng, n, rho) for _ in 1:nsim]

function fisher_ci(r, n; level = 0.95)
    n > 3 || throw(ArgumentError("Fisher区間には n > 3 が必要です"))
    abs(r) < 1 || throw(ArgumentError("Fisher変換には |r| < 1 が必要です"))
    critical = quantile(Normal(), 1 - (1 - level) / 2)
    z = atanh(r)
    margin = critical / sqrt(n - 3)
    return (; lower = tanh(z - margin), upper = tanh(z + margin))
end

@testset "相関係数の標本変動" begin
    rho = 0.3
    sample_r = cor_once(Xoshiro(2026), 20, rho)
    @test -1 <= sample_r <= 1

    rs20 = cor_sims(Xoshiro(2026), 20, rho)
    rs200 = cor_sims(Xoshiro(2026), 200, rho)
    @test abs(mean(rs20) - rho) < 0.03
    @test abs(mean(rs200) - rho) < 0.02
    @test std(rs200) < std(rs20) / 2
    @test count(<(0), rs20) > 200

    interval20 = fisher_ci(sample_r, 20)
    interval200 = fisher_ci(sample_r, 200)
    @test interval20.lower < sample_r < interval20.upper
    @test interval200.lower < sample_r < interval200.upper
    @test interval200.upper - interval200.lower < interval20.upper - interval20.lower

    coverage_rng = Xoshiro(2600)
    covered = [begin
        r = cor_once(coverage_rng, 50, rho)
        ci = fisher_ci(r, 50)
        ci.lower <= rho <= ci.upper
    end for _ in 1:3000]
    @test 0.93 < mean(covered) < 0.97

    nonlinear_x = collect(range(-2, 2; length = 201))
    nonlinear_y = nonlinear_x .^ 2
    @test abs(cor(nonlinear_x, nonlinear_y)) < 1e-12

    clean_x = collect(1.0:20.0)
    clean_y = clean_x .+ rand(Xoshiro(2601), Normal(0, 2), 20)
    contaminated_x = vcat(clean_x, 100.0)
    contaminated_y = vcat(clean_y, -100.0)
    @test cor(clean_x, clean_y) > 0.9
    @test cor(contaminated_x, contaminated_y) < -0.8

    range_rng = Xoshiro(2602)
    full_x = rand(range_rng, Normal(), 20_000)
    full_y = full_x .+ rand(range_rng, Normal(0, 0.8), 20_000)
    selected = abs.(full_x) .< 0.5
    @test cor(full_x[selected], full_y[selected]) < cor(full_x, full_y) - 0.3

    println((;
        sample_r = round(sample_r, digits = 3),
        rs20_min = round(minimum(rs20), digits = 2),
        rs20_max = round(maximum(rs20), digits = 2),
        rs20_negative = count(<(0), rs20),
        fisher20 = round.((interval20.lower, interval20.upper), digits = 3),
        coverage = round(mean(covered), digits = 3),
        clean_r = round(cor(clean_x, clean_y), digits = 3),
        outlier_r = round(cor(contaminated_x, contaminated_y), digits = 3),
        full_r = round(cor(full_x, full_y), digits = 3),
        restricted_r = round(cor(full_x[selected], full_y[selected]), digits = 3),
    ))
end

@testset "尺度に応じた関連指標" begin
    monotonic_x = collect(1.0:10.0)
    monotonic_y = monotonic_x .^ 3
    pearson = cor(monotonic_x, monotonic_y)
    spearman = corspearman(monotonic_x, monotonic_y)
    kendall = corkendall(monotonic_x, monotonic_y)
    @test pearson < 0.95
    @test spearman == 1
    @test kendall == 1

    group = repeat([0, 1], inner = 40)
    score = 500 .+ 30 .* group .+ rand(Xoshiro(2701), Normal(0, 50), 80)
    point_biserial = cor(group, score)
    @test isapprox(cor(1 .- group, score), -point_biserial; atol = 1e-12)
    @test isapprox(point_biserial, cor(Float64.(group), score); atol = 1e-12)

    a, b, c, d = 30, 10, 15, 45
    binary_x = vcat(fill(1, a + b), fill(0, c + d))
    binary_y = vcat(fill(1, a), fill(0, b), fill(1, c), fill(0, d))
    phi_from_cor = cor(binary_x, binary_y)
    phi_from_table = (a * d - b * c) /
        sqrt((a + b) * (c + d) * (a + c) * (b + d))
    @test isapprox(phi_from_cor, phi_from_table; atol = 1e-12)

    latent_rho = 0.7
    latent = rand(Xoshiro(2702),
                  MvNormal(zeros(2), [1.0 latent_rho; latent_rho 1.0]),
                  30_000)
    threshold_x = Int.(latent[1, :] .> 0)
    threshold_y = Int.(latent[2, :] .> 0)
    observed_phi = cor(threshold_x, threshold_y)
    symmetric_tetrachoric = sinpi(observed_phi / 2)
    @test abs(symmetric_tetrachoric - latent_rho) < 0.03
    @test observed_phi < symmetric_tetrachoric

    cuts = [-1.0, -0.25, 0.25, 1.0]
    ordinalize(values) = [searchsortedlast(cuts, value) + 1 for value in values]
    ordinal_x = ordinalize(latent[1, :])
    ordinal_y = ordinalize(latent[2, :])
    @test all(1 .<= ordinal_x .<= 5)
    @test all(1 .<= ordinal_y .<= 5)
    @test abs(corspearman(ordinal_x, ordinal_y) - latent_rho) < 0.1

    item_rng = Xoshiro(2703)
    ability = rand(item_rng, Normal(), 400)
    difficulties = [-0.8, -0.2, 0.3, 0.9]
    items = hcat((Int.(rand(item_rng, 400) .<
                       (1 ./ (1 .+ exp.(-(ability .- difficulty)))))
                  for difficulty in difficulties)...)
    total = vec(sum(items; dims = 2))
    rest_score = vec(sum(items[:, 2:end]; dims = 2))
    uncorrected_item_total = cor(items[:, 1], total)
    corrected_item_total = cor(items[:, 1], rest_score)
    @test uncorrected_item_total > corrected_item_total
    @test corrected_item_total > 0.1

    println((;
        pearson = round(pearson, digits = 3),
        spearman = round(spearman, digits = 3),
        kendall = round(kendall, digits = 3),
        point_biserial = round(point_biserial, digits = 3),
        phi = round(phi_from_cor, digits = 3),
        observed_phi = round(observed_phi, digits = 3),
        symmetric_tetrachoric = round(symmetric_tetrachoric, digits = 3),
        ordinal_pearson = round(cor(ordinal_x, ordinal_y), digits = 3),
        ordinal_spearman = round(corspearman(ordinal_x, ordinal_y), digits = 3),
        uncorrected_item_total = round(uncorrected_item_total, digits = 3),
        corrected_item_total = round(corrected_item_total, digits = 3),
    ))
end

function holm_adjust(pvalues)
    p = vec(pvalues)
    order = sortperm(p)
    adjusted = similar(p)
    running = 0.0
    for (rank, index) in enumerate(order)
        running = max(running, (length(p) - rank + 1) * p[index])
        adjusted[index] = min(running, 1.0)
    end
    return reshape(adjusted, size(pvalues))
end

@testset "クロス集計とカテゴリカルデータ分析" begin
    group = vcat(fill("training", 25), fill("control", 25))
    outcome = vcat(fill("event", 18), fill("no event", 7),
                   fill("event", 9), fill("no event", 16))
    row_levels = ["training", "control"]
    col_levels = ["event", "no event"]
    cell_counts = countmap(collect(zip(group, outcome)))
    table_2x2 = [get(cell_counts, (row, col), 0)
                 for row in row_levels, col in col_levels]
    @test table_2x2 == [18 7; 9 16]
    @test table_2x2 ./ sum(table_2x2; dims = 2) == [0.72 0.28; 0.36 0.64]

    a, b = table_2x2[1, 1], table_2x2[1, 2]
    c, d = table_2x2[2, 1], table_2x2[2, 2]
    chi_2x2 = ChisqTest(table_2x2)
    phi = (a * d - b * c) /
          sqrt((a + b) * (c + d) * (a + c) * (b + d))
    risk_training = a / (a + b)
    risk_control = c / (c + d)
    risk_difference = risk_training - risk_control
    risk_ratio = risk_training / risk_control
    sample_odds_ratio = (a * d) / (b * c)
    fisher_2x2 = FisherExactTest(a, b, c, d)
    @test isapprox(chi_2x2.stat, sum(table_2x2) * phi^2; atol = 1e-12)
    @test isapprox(pvalue(chi_2x2), 0.010656374721291453; atol = 1e-14)
    @test isapprox(phi, 0.36115755925730764; atol = 1e-14)
    @test risk_difference == 0.36
    @test risk_ratio == 2.0
    @test isapprox(sample_odds_ratio, 4.571428571428571; atol = 1e-14)
    @test isapprox(pvalue(fisher_2x2), 0.022241295691722517; atol = 1e-14)
    @test all(isapprox.(confint(fisher_2x2),
                        (1.2001279547251862, 18.026777985373503);
                        atol = 1e-12))

    # 参照水準を反転しても独立性検定は同じだが、方向付き効果量は反転する。
    reversed = reverse(table_2x2; dims = 1)
    @test isapprox(pvalue(ChisqTest(reversed)), pvalue(chi_2x2); atol = 1e-14)
    @test isapprox((c * b) / (d * a), inv(sample_odds_ratio); atol = 1e-14)
    @test risk_control - risk_training == -risk_difference

    sparse_table = [1 8; 7 4]
    sparse_chi = ChisqTest(sparse_table)
    sparse_fisher = FisherExactTest(
        sparse_table[1, 1], sparse_table[1, 2],
        sparse_table[2, 1], sparse_table[2, 2])
    sparse_n = sum(sparse_table)
    sparse_expected = (sum(sparse_table; dims = 2) ./ sparse_n) *
                      (sum(sparse_table; dims = 1) ./ sparse_n) .* sparse_n
    @test minimum(sparse_expected) < 5
    @test isapprox(pvalue(sparse_chi), 0.017059563200794253; atol = 1e-14)
    @test isapprox(pvalue(sparse_fisher; method = :central),
                   0.04977375565610857; atol = 1e-14)
    @test isapprox(pvalue(sparse_fisher; method = :minlike),
                   0.028101929030721597; atol = 1e-14)

    table_3x3 = [30 12 8; 18 20 12; 10 18 32]
    chi_3x3 = ChisqTest(table_3x3)
    n_3x3 = sum(table_3x3)
    row_p = sum(table_3x3; dims = 2) ./ n_3x3
    col_p = sum(table_3x3; dims = 1) ./ n_3x3
    expected = row_p * col_p .* n_3x3
    adjusted_residuals = (table_3x3 .- expected) ./
        sqrt.(expected .* (1 .- row_p) .* (1 .- col_p))
    raw_p = 2 .* ccdf.(Normal(), abs.(adjusted_residuals))
    adjusted_p = holm_adjust(raw_p)
    cramers_v = sqrt(chi_3x3.stat /
                     (n_3x3 * min(size(table_3x3, 1) - 1,
                                  size(table_3x3, 2) - 1)))
    @test isapprox(pvalue(chi_3x3), 6.078539170683689e-6; atol = 1e-16)
    @test isapprox(cramers_v, 0.30381715381646707; atol = 1e-14)
    @test isapprox(adjusted_residuals[1, 1], 4.213259074810247; atol = 1e-12)
    @test isapprox(adjusted_p[1, 1], 0.00020136964854891576; atol = 1e-15)
    @test adjusted_p[2, 1] == 1.0

    paired_table = [35 12; 3 30]
    discordant_decrease = paired_table[1, 2]
    discordant_increase = paired_table[2, 1]
    exact_mcnemar = BinomialTest(
        discordant_increase,
        discordant_decrease + discordant_increase,
        0.5,
    )
    paired_risk_difference =
        (discordant_increase - discordant_decrease) / sum(paired_table)
    @test isapprox(pvalue(exact_mcnemar), 0.03515625000000002; atol = 1e-15)
    @test paired_risk_difference == -0.1125
    @test discordant_increase / discordant_decrease == 0.25
    # 独立表として誤解析すると、対応を無視して極端に小さいp値になる反例。
    @test pvalue(ChisqTest(paired_table)) < 1e-8

    easy = [81 6; 234 36]
    difficult = [192 71; 55 25]
    marginal = easy + difficult
    table_or = table ->
        (table[1, 1] * table[2, 2]) /
        (table[1, 2] * table[2, 1])
    table_rd = table ->
        table[1, 1] / sum(table[1, :]) -
        table[2, 1] / sum(table[2, :])
    marginal_or = table_or(marginal)
    easy_or = table_or(easy)
    difficult_or = table_or(difficult)
    @test marginal == [273 77; 289 61]
    @test marginal_or < 1 < easy_or
    @test difficult_or > 1
    @test table_rd(marginal) < 0
    @test table_rd(easy) > 0
    @test table_rd(difficult) > 0

    strata = DataFrame(
        treatment = categorical(["A", "B", "A", "B"]),
        severity = categorical(["easy", "easy", "difficult", "difficult"]),
        successes = [81, 234, 192, 55],
        trials = [87, 270, 263, 80],
    )
    strata.proportion = strata.successes ./ strata.trials
    coding = Dict(
        :treatment => DummyCoding(base = "B", levels = ["B", "A"]),
        :severity => DummyCoding(
            base = "easy", levels = ["easy", "difficult"]),
    )
    marginal_model = glm(
        @formula(proportion ~ treatment), strata,
        Binomial(), LogitLink(); weights = fweights(strata.trials),
        contrasts = coding,
    )
    adjusted_model = glm(
        @formula(proportion ~ treatment + severity), strata,
        Binomial(), LogitLink(); weights = fweights(strata.trials),
        contrasts = coding,
    )
    interaction_model = glm(
        @formula(proportion ~ treatment * severity), strata,
        Binomial(), LogitLink(); weights = fweights(strata.trials),
        contrasts = coding,
    )
    mh_or = tables ->
        sum(table[1, 1] * table[2, 2] / sum(table) for table in tables) /
        sum(table[1, 2] * table[2, 1] / sum(table) for table in tables)
    common_mh_or = mh_or([easy, difficult])
    adjusted_or = exp(coef(adjusted_model)[2])
    interaction_p = ccdf(
        Chisq(dof(interaction_model) - dof(adjusted_model)),
        deviance(adjusted_model) - deviance(interaction_model),
    )
    @test coefnames(adjusted_model) ==
          ["(Intercept)", "treatment: A", "severity: difficult"]
    @test isapprox(exp(coef(marginal_model)[2]), marginal_or; atol = 2e-12)
    @test isapprox(common_mh_or, 1.44684662494262; atol = 1e-14)
    @test isapprox(adjusted_or, 1.4293626746970092; atol = 1e-12)
    @test isapprox(interaction_p, 0.31534299311413316; atol = 1e-12)

    standard_grid = DataFrame(
        treatment = categorical(["A", "A", "B", "B"]),
        severity = categorical(["easy", "difficult", "easy", "difficult"]),
    )
    standard_grid.probability = predict(adjusted_model, standard_grid)
    severity_weights = [357, 343] ./ 700
    standardized_a = sum(standard_grid.probability[1:2] .* severity_weights)
    standardized_b = sum(standard_grid.probability[3:4] .* severity_weights)
    standardized_rd = standardized_a - standardized_b
    standardized_or = (standardized_a / (1 - standardized_a)) /
                      (standardized_b / (1 - standardized_b))
    @test isapprox(standardized_a, 0.824657753986763; atol = 1e-12)
    @test isapprox(standardized_b, 0.7705187069026196; atol = 1e-12)
    @test isapprox(standardized_rd, 0.05413904708414341; atol = 1e-12)
    @test isapprox(standardized_or, 1.4007198489514014; atol = 1e-12)
    @test !isapprox(standardized_or, adjusted_or; atol = 1e-3)

    println((;
        chisq_p = round(pvalue(chi_2x2), digits = 4),
        phi = round(phi, digits = 3),
        risk_difference,
        risk_ratio,
        sample_odds_ratio = round(sample_odds_ratio, digits = 3),
        fisher_p = round(pvalue(fisher_2x2), digits = 4),
        sparse_chisq_p = round(pvalue(sparse_chi), digits = 4),
        sparse_fisher_central = round(
            pvalue(sparse_fisher; method = :central), digits = 4),
        sparse_fisher_minlike = round(
            pvalue(sparse_fisher; method = :minlike), digits = 4),
        cramers_v = round(cramers_v, digits = 3),
        exact_mcnemar_p = round(pvalue(exact_mcnemar), digits = 4),
        paired_risk_difference,
        simpson_marginal_or = round(marginal_or, digits = 3),
        simpson_easy_or = round(easy_or, digits = 3),
        simpson_difficult_or = round(difficult_or, digits = 3),
        common_mh_or = round(common_mh_or, digits = 3),
        adjusted_or = round(adjusted_or, digits = 3),
        standardized_rd = round(standardized_rd, digits = 4),
    ))
end

println(
    "Julia ", VERSION,
    " / Distributions ", pkgversion(Distributions),
    " / StatsBase ", pkgversion(StatsBase),
    " / HypothesisTests ", pkgversion(HypothesisTests),
)
