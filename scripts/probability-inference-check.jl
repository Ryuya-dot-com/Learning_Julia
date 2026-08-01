#!/usr/bin/env julia

# 確率分布・乱数・標本分布・推定レッスンの数値/API検証。
# 実行例:
#   julia --project=/path/to/validation-env scripts/probability-inference-check.jl

using Test
using Random
using Statistics
using Distributions
using HypothesisTests
using StatsBase
using CairoMakie

@testset "確率変数と確率分布" begin
    correct = Bernoulli(0.8)
    score = Binomial(20, 0.8)
    rt = LogNormal(log(500), 0.25)
    @test insupport(correct, 1)
    @test !insupport(score, 21)
    @test !insupport(rt, -10)

    d = Normal(500, 50)
    x = rand(Xoshiro(2026), d, 5)
    @test mean(d) == 500
    @test std(d) == 50
    @test length(x) == 5
    @test all(isfinite, x)
    @test round(cdf(d, 550), digits = 3) == 0.841
    @test round(ccdf(d, 550), digits = 3) == 0.159
    @test round(quantile(d, 0.95), digits = 1) == 582.2

    z = Normal()
    @test isapprox(cdf(z, 1.96) - cdf(z, -1.96), 0.95; atol = 1e-4)
end

@testset "浮動小数点と確率計算の数値安定性" begin
    binary_sum = 0.1 + 0.2
    @test binary_sum != 0.3
    @test isapprox(binary_sum, 0.3)
    @test eps(1.0) == 2.220446049250313e-16
    @test nextfloat(0.0) == 5.0e-324

    probability = 0.01
    repetitions = 200
    naive_log_probability = log(probability^repetitions)
    stable_log_probability = repetitions * log(probability)
    audited_log_probability = setprecision(BigFloat, 256) do
        log(big"0.01"^200)
    end
    @test probability^repetitions == 0.0
    @test naive_log_probability == -Inf
    @test isapprox(stable_log_probability, -921.0340371976183; atol = 1e-12)
    @test isapprox(Float64(audited_log_probability), stable_log_probability;
                   atol = 1e-12)
    @test BigFloat(0.01) != big"0.01"

    standard_normal = Normal()
    @test pdf(standard_normal, 40.0) == 0.0
    @test log(pdf(standard_normal, 40.0)) == -Inf
    @test isapprox(logpdf(standard_normal, 40.0),
                   -800.9189385332047; atol = 1e-12)
    @test 1 - cdf(standard_normal, 10.0) == 0.0
    @test isapprox(ccdf(standard_normal, 10.0),
                   7.619853024160498e-24; rtol = 1e-14)
    @test isapprox(logccdf(standard_normal, 10.0),
                   -53.23128515051247; atol = 1e-12)

    small = 1e-16
    @test log(1 + small) == 0.0
    @test log1p(small) == small
    @test exp(small) - 1 == 0.0
    @test expm1(small) == small
    large = 1e16
    naive_difference = sqrt(large + 1) - sqrt(large)
    stable_difference = 1 / (sqrt(large + 1) + sqrt(large))
    @test naive_difference == 0.0
    @test stable_difference == 5e-9

    logaddexp(a, b) = max(a, b) + log1p(exp(-abs(a - b)))
    log_a, log_b = -1000.0, -1001.0
    @test log(exp(log_a) + exp(log_b)) == -Inf
    @test isapprox(logaddexp(log_a, log_b),
                   -999.6867383124818; atol = 1e-12)
    softplus(x) = max(x, 0) + log1p(exp(-abs(x)))
    eta = 1000.0
    rounded_probability = 1 / (1 + exp(-eta))
    @test rounded_probability == 1.0
    @test log(1 - rounded_probability) == -Inf
    @test -softplus(eta) == -1000.0

    boundary_p = 0.04996
    @test boundary_p < 0.05
    @test !(round(boundary_p; digits = 3) < 0.05)
    @test (1e16 + 1.0) - 1e16 == 0.0
    @test (1e16 - 1e16) + 1.0 == 1.0

    println((;
        binary_sum,
        naive_log_probability,
        stable_log_probability = round(stable_log_probability, digits = 3),
        naive_tail = 1 - cdf(standard_normal, 10.0),
        stable_tail = ccdf(standard_normal, 10.0),
        naive_logpdf = log(pdf(standard_normal, 40.0)),
        stable_logpdf = round(logpdf(standard_normal, 40.0), digits = 3),
        naive_difference,
        stable_difference,
        naive_logsum = log(exp(log_a) + exp(log_b)),
        stable_logsum = logaddexp(log_a, log_b),
        raw_boundary_decision = boundary_p < 0.05,
        rounded_boundary_decision = round(boundary_p; digits = 3) < 0.05,
    ))
end

@testset "乱数・標本抽出・再現性" begin
    rng = Xoshiro(2026)
    u = rand(rng)
    die = rand(rng, 1:6)
    rt = rand(rng, Normal(500, 50), 20)
    correct = rand(rng, Bernoulli(0.8), 20)
    @test 0 <= u < 1
    @test die in 1:6
    @test length(rt) == 20
    @test all(x -> x in (0, 1), correct)

    allocation_rng = Xoshiro(7)
    population = collect(1001:1100)
    sample_ids = shuffle(allocation_rng, population)[1:10]
    labels = repeat(["control", "treatment"], 5)
    assignment = shuffle(allocation_rng, labels)
    @test length(unique(sample_ids)) == 10
    @test count(==("control"), assignment) == 5

    order_for(participant, trials) = shuffle(Xoshiro(10_000 + participant), trials)
    trials = repeat(["cong", "incong"], 4)
    @test order_for(2, trials) == order_for(2, trials)
    @test trials == repeat(["cong", "incong"], 4)
    @test rand(Xoshiro(2026), 5) == rand(Xoshiro(2026), 5)
end

function sample_means(rng, d, n; nsim = 10_000)
    return [mean(rand(rng, d, n)) for _ in 1:nsim]
end

@testset "標本分布" begin
    d = Normal(500, 50)
    means25 = sample_means(Xoshiro(2026), d, 25)
    @test length(means25) == 10_000
    @test abs(mean(means25) - mean(d)) < 1.0
    @test std(means25) < std(d)

    for n in [4, 25, 100]
        empirical_se = std(sample_means(Xoshiro(2026), d, n))
        theoretical_se = std(d) / sqrt(n)
        @test isapprox(empirical_se, theoretical_se; rtol = 0.03)
    end

    skewed = Exponential(1)
    n = 100
    means = sample_means(Xoshiro(2026), skewed, n)
    standardized = (means .- mean(skewed)) ./ (std(skewed) / sqrt(n))
    @test abs(mean(standardized)) < 0.05
    @test abs(std(standardized) - 1) < 0.05

    dependence_rng = Xoshiro(2026)
    independent = [mean(rand(dependence_rng, Normal(), 100)) for _ in 1:5000]
    duplicated = [mean(fill(rand(dependence_rng, Normal()), 100)) for _ in 1:5000]
    @test std(independent) < 0.12
    @test std(duplicated) > 0.9
end

function mean_ci(x; level = 0.95)
    n = length(x)
    alpha = 1 - level
    critical = quantile(TDist(n - 1), 1 - alpha / 2)
    estimate = mean(x)
    se = std(x) / sqrt(n)
    return (estimate - critical * se, estimate + critical * se)
end

@testset "推定と不確かさ" begin
    d = Normal(500, 50)
    rng = Xoshiro(2026)
    estimates = [mean(rand(rng, d, 25)) for _ in 1:10_000]
    shifted = estimates .+ 10
    @test abs(mean(estimates) - mean(d)) < 1.0
    @test isapprox(mean(shifted) - mean(estimates), 10; atol = 1e-10)
    @test std(estimates) < std(d)

    study_means = [mean(rand(Xoshiro(i), d, 25)) for i in 1:10_000]
    mcse_of_simulated_mean = std(study_means) / sqrt(length(study_means))
    @test std(d) == 50
    @test std(d) / sqrt(25) == 10
    @test mcse_of_simulated_mean < 0.2

    coverage_rng = Xoshiro(2026)
    covered = [begin
        interval = mean_ci(rand(coverage_rng, d, 25))
        interval[1] <= mean(d) <= interval[2]
    end for _ in 1:2000]
    coverage = mean(covered)
    @test 0.93 < coverage < 0.97

    observed = [480.0, 492.0, 501.0, 505.0, 510.0, 530.0, 610.0]
    bootstrap_rng = Xoshiro(2026)
    boot_medians = [median(rand(bootstrap_rng, observed, length(observed))) for _ in 1:5000]
    interval = quantile(boot_medians, [0.025, 0.975])
    @test length(boot_medians) == 5000
    @test interval[1] <= median(observed) <= interval[2]
end

@testset "明示RNGを使う仮説検定とモンテカルロ" begin
    d = Normal(500, 50)
    rng = Xoshiro(2026)
    a = rand(rng, d, 20)
    b = rand(rng, d, 20)
    @test round(mean(a), digits = 1) == 502.2
    @test round(mean(b), digits = 1) == 507.4
    @test round(pvalue(EqualVarianceTTest(a, b)), digits = 3) == 0.746

    diff_once(rng, d) = mean(rand(rng, d, 20)) - mean(rand(rng, d, 20))
    diff_rng = Xoshiro(2026)
    diffs = [diff_once(diff_rng, d) for _ in 1:1000]
    @test round(maximum(abs.(diffs)), digits = 1) == 61.8
    @test count(value -> abs(value) > 30, diffs) == 65

    pvalue_once(rng, d) = pvalue(EqualVarianceTTest(rand(rng, d, 20), rand(rng, d, 20)))
    pvalue_rng = Xoshiro(2026)
    ps = [pvalue_once(pvalue_rng, d) for _ in 1:1000]
    @test count(p -> p < 0.05, ps) == 58

    experiment_once(rng, n, effect) = pvalue(EqualVarianceTTest(
        rand(rng, Normal(), n),
        rand(rng, Normal(effect, 1), n),
    ))

    function power_sim(rng, n, effect; nsim = 10_000)
        hits = count(_ -> experiment_once(rng, n, effect) < 0.05, 1:nsim)
        power = hits / nsim
        mcse = sqrt(power * (1 - power) / nsim)
        return (; power, mcse)
    end

    result = power_sim(Xoshiro(2026), 20, 0.5)
    @test result.power == 0.3293
    @test round(100 * result.mcse, digits = 2) == 0.47
    @test [power_sim(Xoshiro(2026), n, 0.5).power for n in [10, 20, 40, 80]] ==
          [0.1863, 0.3293, 0.6068, 0.8785]
end

@testset "デザイン別の順位検定と置換検定" begin
    control = [1.0, 2, 2, 3, 3, 3, 4, 4, 5, 5]
    training = [3.0, 4, 4, 5, 5, 5, 6, 6, 6, 7]
    mann_whitney = MannWhitneyUTest(training, control)
    mann_whitney_exact = ExactMannWhitneyUTest(training, control)
    pair_score(x, y) = x > y ? 1.0 : x == y ? 0.5 : 0.0
    superiority = mean([
        pair_score(x, y) for x in training, y in control
    ])
    rank_biserial = 2 * superiority - 1

    @test mann_whitney isa ApproximateMannWhitneyUTest
    @test round(pvalue(mann_whitney), digits = 6) == 0.007109
    @test round(pvalue(mann_whitney_exact), digits = 6) == 0.006744
    @test superiority == 0.855
    @test rank_biserial == 0.71
    @test median.((training, control)) == (5.0, 3.0)

    differences = [3.0, 2, 1, 1, 4, -1, 2, 3, 1, 1, 5, 2]
    sign_test = SignTest(differences)
    signed_rank = SignedRankTest(differences)
    nonzero = differences[differences .!= 0]
    ranks = tiedrank(abs.(nonzero))
    paired_rank_biserial = sum(sign.(nonzero) .* ranks) / sum(ranks)

    @test round(pvalue(sign_test), digits = 6) == 0.006348
    @test round(pvalue(signed_rank), digits = 6) == 0.002930
    @test confint(signed_rank) == (1.0, 3.0)
    @test median(differences) == 2.0
    @test round(paired_rank_biserial, digits = 3) == 0.923

    g1 = [1.0, 2, 2, 3, 3, 4, 4, 5]
    g2 = [2.0, 3, 3, 4, 4, 5, 5, 6]
    g3 = [4.0, 5, 5, 6, 6, 7, 7, 8]
    groups = (g1, g2, g3)
    kruskal_wallis = KruskalWallisTest(groups...)
    epsilon2 = (
        kruskal_wallis.H - length(groups) + 1
    ) / (sum(length, groups) - length(groups))

    function holm_adjust(ps)
        order = sortperm(ps)
        adjusted = similar(ps)
        running = 0.0
        for (rank, index) in enumerate(order)
            running = max(running, (length(ps) - rank + 1) * ps[index])
            adjusted[index] = min(running, 1.0)
        end
        return adjusted
    end

    pairs = [(1, 2), (1, 3), (2, 3)]
    raw_ps = [pvalue(MannWhitneyUTest(groups[i], groups[j]))
              for (i, j) in pairs]
    adjusted_ps = holm_adjust(raw_ps)

    @test round(kruskal_wallis.H, digits = 3) == 11.721
    @test round(pvalue(kruskal_wallis), digits = 4) == 0.0029
    @test round(epsilon2, digits = 3) == 0.463
    @test round.(adjusted_ps, digits = 4) == [0.18, 0.0076, 0.0329]

    permutation = ApproximatePermutationTest(
        Xoshiro(2301), training, control, mean, 50_000
    )
    permutation_p = pvalue(permutation)
    permutation_mcse = sqrt(
        permutation_p * (1 - permutation_p) / 50_000
    )

    @test isapprox(mean(training) - mean(control), 1.9; atol = 1e-12)
    @test permutation_p == 0.00658
    @test round(permutation_mcse, digits = 5) == 0.00036

    println((
        mann_whitney_p = round(pvalue(mann_whitney), digits = 6),
        mann_whitney_exact_p = round(pvalue(mann_whitney_exact), digits = 6),
        superiority = superiority,
        rank_biserial = rank_biserial,
    ))
    println((
        sign_p = round(pvalue(sign_test), digits = 6),
        signed_rank_p = round(pvalue(signed_rank), digits = 6),
        signed_rank_ci = confint(signed_rank),
        paired_rank_biserial = round(paired_rank_biserial, digits = 3),
    ))
    println((
        kruskal_wallis_p = round(pvalue(kruskal_wallis), digits = 4),
        epsilon2 = round(epsilon2, digits = 3),
        holm_adjusted = round.(adjusted_ps, digits = 4),
        permutation_p = permutation_p,
        permutation_mcse = round(permutation_mcse, digits = 5),
    ))
end

function mean_ci_summary(x; level = 0.95)
    n = length(x)
    critical = quantile(TDist(n - 1), 1 - (1 - level) / 2)
    estimate = mean(x)
    se = std(x) / sqrt(n)
    return (; estimate,
            lower = estimate - critical * se,
            upper = estimate + critical * se,
            n)
end

function match_summary(x; target_mean = 500.0, target_sd = 50.0)
    z = (x .- mean(x)) ./ std(x)
    return target_mean .+ target_sd .* z
end

@testset "不確かさを論文品質で可視化" begin
    analysis_rng = Xoshiro(2026)
    control = rand(analysis_rng, Normal(500, 50), 30)
    treatment = rand(analysis_rng, Normal(525, 50), 30)
    y = vcat(control, treatment)
    group = repeat([1, 2], inner = 30)
    summaries = mean_ci_summary.([control, treatment])
    estimates = [s.estimate for s in summaries]
    lowers = [s.lower for s in summaries]
    uppers = [s.upper for s in summaries]
    @test round.(estimates, digits = 1) == [503.8, 523.0]
    @test all(s -> s.lower < s.estimate < s.upper, summaries)

    display_rng = Xoshiro(99)
    x = Float64.(group) .+ 0.28 .* (rand(display_rng, length(y)) .- 0.5)
    @test length(x) == length(y) == 60
    @test all(abs.(x .- group) .<= 0.14)

    mktempdir() do output_dir
        fig = Figure(size = (520, 320))
        ax = Axis(fig[1, 1], xlabel = "group", ylabel = "response")
        scatter!(ax, x, y; color = (:gray35, 0.45), markersize = 7)
        rangebars!(ax, [1, 2], lowers, uppers;
                   color = :black, linewidth = 2, whiskerwidth = 10)
        scatter!(ax, [1, 2], estimates;
                 color = :black, marker = :diamond, markersize = 12)
        output_path = joinpath(output_dir, "raw_mean_ci.svg")
        save(output_path, fig)
        @test isfile(output_path)
        @test filesize(output_path) > 1000
    end

    truth = 500.0
    coverage_rng = Xoshiro(2500)
    intervals = [mean_ci_summary(rand(coverage_rng, Normal(truth, 50), 25))
                 for _ in 1:60]
    covered = [s.lower <= truth <= s.upper for s in intervals]
    @test count(identity, covered) == 56

    unimodal = match_summary(rand(Xoshiro(11), Normal(), 40))
    bimodal_raw = vcat(
        rand(Xoshiro(12), Normal(-2, 0.25), 20),
        rand(Xoshiro(13), Normal(2, 0.25), 20),
    )
    bimodal = match_summary(bimodal_raw)
    @test isapprox(mean(unimodal), mean(bimodal); atol = 1e-10)
    @test isapprox(std(unimodal), std(bimodal); atol = 1e-10)
    @test length(unimodal) == length(bimodal)
end

println(
    "Julia ", VERSION,
    " / Distributions ", pkgversion(Distributions),
    " / CairoMakie ", pkgversion(CairoMakie),
)
