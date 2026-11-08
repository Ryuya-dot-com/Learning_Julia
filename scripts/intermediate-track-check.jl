#!/usr/bin/env julia
# 中級編4レッスン(m01〜m04)の数値例・反例・不変量を検証する回帰スクリプト。
# 公開CI (scripts/run-numeric-checks.jl --public) から実行される。

using Arrow
using CSV
using DataFrames
using Distributions
using LinearAlgebra
using Printf
using Random
using Statistics
using Test

# ============================================================
# 1. m01: 型安定性とメモリ割当・@views・バッファ参照共有の罠・多重ディスパッチ
# ============================================================

# 型不安定な累積(total = 0 が Int64 で始まり、0.5 * x で Float64 に変わる)
function unstable_weighted_sum(xs::Vector{Int})
    total = 0
    for x in xs
        if x > 0
            total += 0.5 * x
        end
    end
    return total
end

# 型安定な累積(zero(0.5 * first(xs)) または 0.0 で最初から Float64 に固定)
function stable_weighted_sum(xs::Vector{Int})
    total = 0.0
    for x in xs
        if x > 0
            total += 0.5 * x
        end
    end
    return total
end

function col_range_copy(X::Matrix{Float64})
    s = 0.0
    for j in axes(X, 2)
        col = X[:, j]
        s += maximum(col) - minimum(col)
    end
    return s
end

function col_range_views(X::Matrix{Float64})
    s = 0.0
    @views for j in axes(X, 2)
        col = X[:, j]
        s += maximum(col) - minimum(col)
    end
    return s
end

abstract type LocationEstimator end
struct SampleMean <: LocationEstimator end
struct SampleMedian <: LocationEstimator end
struct TrimmedMean <: LocationEstimator
    prop::Float64
    function TrimmedMean(prop::Real)
        0.0 <= prop < 0.5 || throw(ArgumentError("prop must be in [0, 0.5)"))
        return new(Float64(prop))
    end
end

estimate(::SampleMean, x::AbstractVector{<:Real}) = mean(x)
estimate(::SampleMedian, x::AbstractVector{<:Real}) = median(x)
function estimate(est::TrimmedMean, x::AbstractVector{<:Real})
    s = sort(x)
    k = floor(Int, est.prop * length(s))
    return @views mean(s[(k + 1):(end - k)])
end

function bootstrap_se(rng::AbstractRNG, est::LocationEstimator, x::AbstractVector{<:Real}; B::Int = 500)
    n = length(x)
    buf = Vector{Float64}(undef, n)
    stats = Vector{Float64}(undef, B)
    for b in 1:B
        for i in 1:n
            buf[i] = x[rand(rng, 1:n)]
        end
        stats[b] = estimate(est, buf)
    end
    return (value = estimate(est, x), se = std(stats))
end

# ============================================================
# 2. m02: 並列モンテカルロと反復ID別の独立RNG設計
# ============================================================

trial_rng(base_seed::Integer, sim_id::Integer) = Xoshiro(UInt64[UInt64(base_seed), UInt64(sim_id)])

function welch_trial(rng::AbstractRNG, n::Int, delta::Float64)
    a = rand(rng, Normal(500.0, 50.0), n)
    b = rand(rng, Normal(500.0 + delta, 50.0), n)
    diff = mean(b) - mean(a)
    se = sqrt(var(a) / n + var(b) / n)
    df_num = (var(a) / n + var(b) / n)^2
    df_den = (var(a) / n)^2 / (n - 1) + (var(b) / n)^2 / (n - 1)
    t_stat = abs(diff) / se
    p_val = 2 * ccdf(TDist(df_num / df_den), t_stat)
    return (diff = diff, p_val = p_val, hit = p_val < 0.05)
end

function run_serial_mc(base_seed::Int, nsim::Int; n::Int = 30, delta::Float64 = 25.0)
    out = Vector{NamedTuple{(:diff, :p_val, :hit), Tuple{Float64, Float64, Bool}}}(undef, nsim)
    for i in 1:nsim
        out[i] = welch_trial(trial_rng(base_seed, i), n, delta)
    end
    return out
end

function run_threaded_mc(base_seed::Int, nsim::Int; n::Int = 30, delta::Float64 = 25.0)
    out = Vector{NamedTuple{(:diff, :p_val, :hit), Tuple{Float64, Float64, Bool}}}(undef, nsim)
    Threads.@threads for i in 1:nsim
        out[i] = welch_trial(trial_rng(base_seed, i), n, delta)
    end
    return out
end

# 逆順で実行しても同じ結果になる(スレッド割当順に依存しない証明)
function run_reversed_mc(base_seed::Int, nsim::Int; n::Int = 30, delta::Float64 = 25.0)
    out = Vector{NamedTuple{(:diff, :p_val, :hit), Tuple{Float64, Float64, Bool}}}(undef, nsim)
    for i in nsim:-1:1
        out[i] = welch_trial(trial_rng(base_seed, i), n, delta)
    end
    return out
end

# ============================================================
# 3. m03: 自作対数尤度・自動微分の原理(Dual数)・Hessian・プロファイル尤度
# ============================================================

struct Dual <: Real
    val::Float64
    der::Float64
end
Dual(x::Real) = Dual(Float64(x), 0.0)
Base.promote_rule(::Type{Dual}, ::Type{<:Real}) = Dual
Base.convert(::Type{Dual}, x::Real) = Dual(Float64(x), 0.0)
Base.convert(::Type{Dual}, x::Dual) = x
Base.:+(a::Dual, b::Dual) = Dual(a.val + b.val, a.der + b.der)
Base.:-(a::Dual, b::Dual) = Dual(a.val - b.val, a.der - b.der)
Base.:-(a::Dual) = Dual(-a.val, -a.der)
Base.:*(a::Dual, b::Dual) = Dual(a.val * b.val, a.der * b.val + a.val * b.der)
Base.:/(a::Dual, b::Dual) = Dual(a.val / b.val, (a.der * b.val - a.val * b.der) / (b.val^2))
Base.exp(a::Dual) = (e = exp(a.val); Dual(e, e * a.der))
Base.log(a::Dual) = Dual(log(a.val), a.der / a.val)
Base.isless(a::Dual, b::Dual) = isless(a.val, b.val)
Base.:<(a::Dual, b::Dual) = a.val < b.val
Base.:<=(a::Dual, b::Dual) = a.val <= b.val
Base.:(==)(a::Dual, b::Dual) = a.val == b.val
Base.isfinite(a::Dual) = isfinite(a.val)

# 右打切り指数分布の対数尤度(η = log(θ)、θは平均スケール)
# 観測試行(is_censored == false): logpdf(Exponential(θ), t) = -log(θ) - t / θ
# 打切り試行(is_censored == true, t == limit): logccdf(Exponential(θ), t) = -t / θ
function censored_exp_loglik_eta(eta::Real, times::AbstractVector{<:Real}, is_censored::AbstractVector{Bool})
    length(times) == length(is_censored) || throw(ArgumentError("length mismatch"))
    any(t -> !(isfinite(t) && t > 0), times) && throw(ArgumentError("times must be positive finite"))
    theta = exp(eta)
    k = count(!, is_censored)
    total_time = sum(times)
    return -k * eta - total_time / theta
end

function fit_censored_exp_newton(times::AbstractVector{<:Real}, is_censored::AbstractVector{Bool}; eta0::Float64 = log(mean(times)))
    k = count(!, is_censored)
    k > 0 || throw(ArgumentError("少なくとも1件の非打切り観測が必要です"))
    eta = eta0
    for _ in 1:30
        g_dual = censored_exp_loglik_eta(Dual(eta, 1.0), times, is_censored)
        grad = g_dual.der
        # η に関する2階微分: d²ℓ/dη² = -total_time / exp(eta)
        hess = -sum(times) / exp(eta)
        step = grad / hess
        eta -= step
        if abs(step) < 1e-12
            break
        end
    end
    ll_max = censored_exp_loglik_eta(eta, times, is_censored)
    hess = -sum(times) / exp(eta)
    se_eta = sqrt(-1.0 / hess)
    theta_hat = exp(eta)
    se_theta = theta_hat * se_eta # デルタ法
    z = quantile(Normal(), 0.975)
    wald_theta = (lower = theta_hat - z * se_theta, upper = theta_hat + z * se_theta)
    wald_log = (lower = exp(eta - z * se_eta), upper = exp(eta + z * se_eta))
    return (; eta, theta_hat, se_eta, se_theta, ll_max, wald_theta, wald_log)
end

function profile_ci_censored_exp(times::AbstractVector{<:Real}, is_censored::AbstractVector{Bool}; level::Float64 = 0.95)
    fit = fit_censored_exp_newton(times, is_censored)
    cutoff = quantile(Chisq(1), level)
    dev(theta) = 2.0 * (fit.ll_max - censored_exp_loglik_eta(log(theta), times, is_censored))

    # 左側二分探索
    lo_a, lo_b = fit.theta_hat * 0.05, fit.theta_hat
    while dev(lo_a) < cutoff
        lo_a *= 0.5
    end
    for _ in 1:60
        mid = 0.5 * (lo_a + lo_b)
        if dev(mid) > cutoff
            lo_a = mid
        else
            lo_b = mid
        end
    end

    # 右側二分探索
    hi_a, hi_b = fit.theta_hat, fit.theta_hat * 5.0
    while dev(hi_b) < cutoff
        hi_b *= 2.0
    end
    for _ in 1:60
        mid = 0.5 * (hi_a + hi_b)
        if dev(mid) < cutoff
            hi_a = mid
        else
            hi_b = mid
        end
    end
    return (lower = 0.5 * (lo_a + lo_b), upper = 0.5 * (hi_a + hi_b))
end

# ============================================================
# 4. m04: チャンク集計(Chan–Welford結合)・中央値併合の反例・Arrow列射影
# ============================================================

struct RunningStats
    n::Int
    mean::Float64
    m2::Float64
end
RunningStats() = RunningStats(0, 0.0, 0.0)

function push_value(s::RunningStats, x::Real)
    isfinite(x) || throw(ArgumentError("non-finite value"))
    n1 = s.n + 1
    delta = Float64(x) - s.mean
    mean1 = s.mean + delta / n1
    delta2 = Float64(x) - mean1
    return RunningStats(n1, mean1, s.m2 + delta * delta2)
end

function summarize_chunk(xs)
    s = RunningStats()
    for x in xs
        s = push_value(s, x)
    end
    return s
end

function merge_stats(a::RunningStats, b::RunningStats)
    a.n == 0 && return b
    b.n == 0 && return a
    n = a.n + b.n
    delta = b.mean - a.mean
    mean_ab = a.mean + delta * (b.n / n)
    m2_ab = a.m2 + b.m2 + delta^2 * (a.n * b.n / n)
    return RunningStats(n, mean_ab, m2_ab)
end

sample_var(s::RunningStats) = s.n > 1 ? s.m2 / (s.n - 1) : NaN

@testset "中級編トラックの数値検証" begin
    # --- m01 ---
    xs_int = collect(-50:200)
    @test unstable_weighted_sum(xs_int) == stable_weighted_sum(xs_int) == 10050.0
    # ウォームアップ後の型安定関数はヒープ割当0バイト
    stable_weighted_sum(xs_int)
    @test (@allocated stable_weighted_sum(xs_int)) == 0

    X_mat = reshape(collect(1.0:20_000.0), 500, 40)
    @test col_range_copy(X_mat) == col_range_views(X_mat)
    col_range_copy(X_mat)
    col_range_views(X_mat)
    alloc_copy = @allocated col_range_copy(X_mat)
    alloc_views = @allocated col_range_views(X_mat)
    @test alloc_copy > 100_000
    @test alloc_views == 0

    # バッファ共有バグの反例
    shared_buf = [1.0, 2.0]
    bad_history = Vector{Vector{Float64}}()
    for step in 1:3
        shared_buf .= step
        push!(bad_history, shared_buf)
    end
    @test bad_history[1] === bad_history[3]
    @test bad_history[1] == [3.0, 3.0]

    # 多重ディスパッチによるロバスト推定量比較
    skew_x = [480.0, 495.0, 502.0, 510.0, 515.0, 522.0, 530.0, 540.0, 555.0, 1850.0]
    b_mean = bootstrap_se(Xoshiro(4101), SampleMean(), skew_x; B = 1000)
    b_trim = bootstrap_se(Xoshiro(4101), TrimmedMean(0.2), skew_x; B = 1000)
    b_med = bootstrap_se(Xoshiro(4101), SampleMedian(), skew_x; B = 1000)
    @test round(b_mean.value; digits = 1) == 649.9
    @test round(b_trim.value; digits = 1) == 519.8
    @test round(b_med.value; digits = 1) == 518.5
    @test b_trim.se < b_mean.se
    @test_throws ArgumentError TrimmedMean(0.5)

    # --- m02 ---
    serial_res = run_serial_mc(2026, 400; n = 30, delta = 25.0)
    threaded_res = run_threaded_mc(2026, 400; n = 30, delta = 25.0)
    reversed_res = run_reversed_mc(2026, 400; n = 30, delta = 25.0)
    @test serial_res == threaded_res
    @test serial_res == reversed_res

    # 単一試行だけを再現できる(例: 第317反復)
    single_317 = welch_trial(trial_rng(2026, 317), 30, 25.0)
    @test single_317 == serial_res[317]
    power_400 = mean(r.hit for r in serial_res)
    @test 0.35 < power_400 < 0.65

    # --- m03 ---
    rng_m03 = Xoshiro(4301)
    true_theta = 900.0
    limit = 1200.0
    latent_t = rand(rng_m03, Exponential(true_theta), 28)
    obs_t = min.(latent_t, limit)
    cens_flag = latent_t .>= limit

    naive_all = mean(obs_t)
    naive_uncens = mean(obs_t[.!cens_flag])
    closed_form_mle = sum(obs_t) / count(!, cens_flag)
    fit_m03 = fit_censored_exp_newton(obs_t, cens_flag)
    prof_ci = profile_ci_censored_exp(obs_t, cens_flag)

    @test count(cens_flag) > 0
    @test naive_all < closed_form_mle
    @test naive_uncens < closed_form_mle
    @test isapprox(fit_m03.theta_hat, closed_form_mle; rtol = 1e-10)
    # Distributions.logpdf / logccdf との一致
    d_hat = Exponential(fit_m03.theta_hat)
    ll_dist = sum(
        cens_flag[i] ? logccdf(d_hat, obs_t[i]) : logpdf(d_hat, obs_t[i])
        for i in eachindex(obs_t)
    )
    @test isapprox(fit_m03.ll_max, ll_dist; rtol = 1e-12)
    # プロファイル尤度区間は右裾の非対称性を反映する
    @test (prof_ci.upper - fit_m03.theta_hat) > (fit_m03.theta_hat - prof_ci.lower)
    @test_throws ArgumentError fit_censored_exp_newton([1200.0, 1200.0], [true, true])

    # --- m04 ---
    mktempdir() do dir
        csv_path = joinpath(dir, "large_trials.csv")
        arrow_path = joinpath(dir, "large_trials.arrow")
        rng_m04 = Xoshiro(4401)
        # 大きな定数シフトを加えても Chan–Welford なら桁落ちしない
        raw_rt = 1.0e8 .+ round.(rand(rng_m04, LogNormal(log(520.0), 0.25), 1000); digits = 3)
        df_full = DataFrame(
            trial = 1:1000,
            cond = repeat(["cong", "incong"], 500),
            rt = raw_rt,
        )
        CSV.write(csv_path, df_full)
        Arrow.write(arrow_path, df_full)

        # CSV.Chunks で250行ずつストリーミング集計
        merged = RunningStats()
        chunk_count = 0
        for chunk in CSV.Chunks(csv_path; ntasks = 4, types = Dict(:trial => Int, :cond => String, :rt => Float64))
            chunk_count += 1
            merged = merge_stats(merged, summarize_chunk(chunk.rt))
        end
        @test chunk_count >= 2
        @test merged.n == 1000
        @test isapprox(merged.mean, mean(df_full.rt); rtol = 1e-14)
        @test isapprox(sample_var(merged), var(df_full.rt); rtol = 1e-11)

        # チャンク別中央値の平均は全体の中央値と一致しない(反例)
        c1 = [1.0, 2.0, 3.0, 100.0, 110.0]
        c2 = [120.0]
        @test mean([median(c1), median(c2)]) != median(vcat(c1, c2))

        # Arrowのバイト読込による列アクセス(Windowsでもファイルロックを残さない)
        tbl = Arrow.Table(read(arrow_path))
        @test length(tbl.rt) == 1000
        @test isapprox(mean(tbl.rt), mean(df_full.rt); rtol = 1e-14)
        GC.gc(true)
    end

    # --- m05: 順序・多項ロジットの純Julia実装・比例オッズ違反LRT・logsumexp・RPS ---
    logistic_fn(z::Real) = z >= 0 ? 1 / (1 + exp(-z)) : (ez = exp(z); ez / (1 + ez))
    function unpack_cutpoints(raw::AbstractVector{T}) where {T<:Real}
        c = Vector{T}(undef, length(raw))
        c[1] = raw[1]
        for k in 2:length(raw)
            c[k] = c[k - 1] + exp(raw[k])
        end
        return c
    end
    function ordered_logit_loglik(theta::AbstractVector{T}, x, y, K::Int) where {T<:Real}
        c = unpack_cutpoints(@view theta[1:(K - 1)])
        beta = theta[K]
        ll = zero(T)
        for i in eachindex(x, y)
            eta = beta * x[i]
            yi = y[i]
            up = yi == K ? one(T) : logistic_fn(c[yi] - eta)
            lo = yi == 1 ? zero(T) : logistic_fn(c[yi - 1] - eta)
            ll += log(max(up - lo, T(1e-15)))
        end
        return ll
    end
    function logsumexp_fn(z::AbstractVector{T}) where {T<:Real}
        m = maximum(z)
        isfinite(m) || return m
        s = zero(T)
        for v in z; s += exp(v - m); end
        return m + log(s)
    end
    stable_softmax(z::AbstractVector{<:Real}) = exp.(z .- logsumexp_fn(z))
    function dual_grad!(g::Vector{Float64}, f, x::Vector{Float64})
        xd = Dual.(x, 0.0)
        val = 0.0
        for j in eachindex(x)
            xd[j] = Dual(x[j], 1.0)
            r = f(xd); val = r.val; g[j] = r.der
            xd[j] = Dual(x[j], 0.0)
        end
        return val
    end
    function bfgs_max(f, x0::Vector{Float64}; maxiter::Int = 120)
        x = copy(x0); d = length(x)
        B_inv = Matrix{Float64}(I, d, d)
        g = zeros(d); g_new = zeros(d)
        fx = dual_grad!(g, f, x)
        for _ in 1:maxiter
            norm(g) < 1e-9 && break
            dir = B_inv * g
            dot(dir, g) <= 0 && (B_inv .= Matrix{Float64}(I, d, d); dir = copy(g))
            alpha = 1.0; x_try = similar(x); f_try = -Inf
            while alpha > 1e-10
                @. x_try = x + alpha * dir
                f_try = f(x_try)
                (isfinite(f_try) && f_try >= fx + 1e-4 * alpha * dot(g, dir)) && break
                alpha *= 0.5
            end
            dual_grad!(g_new, f, x_try)
            s = x_try .- x; yv = g .- g_new; sy = dot(s, yv)
            if sy > 1e-12
                rho = 1.0 / sy; Im = Matrix{Float64}(I, d, d)
                B_inv = (Im - rho .* (s * yv')) * B_inv * (Im - rho .* (yv * s')) + rho .* (s * s')
            end
            x .= x_try; g .= g_new; fx = f_try
        end
        return x, fx, norm(g)
    end

    # 1) OLSの範囲外予測反例と順序ロジットMLE
    rng_m05 = Xoshiro(5101)
    x_ord = collect(range(-3.0, 3.0, length = 240))
    u_ord = clamp.(rand(rng_m05, 240), 1e-12, 1 - 1e-12)
    y_star = 1.35 .* x_ord .+ log.(u_ord ./ (1 .- u_ord))
    y_ord = [1 + count(c -> ys > c, [-0.4, 1.4, 2.6]) for ys in y_star]
    b_ols = hcat(ones(240), x_ord) \ Float64.(y_ord)
    @test round(b_ols[1] + b_ols[2] * (-3.0); digits = 2) == 0.57 # < 1.0 の範囲外予測!
    th_ord, ll_ord, gnorm_ord = bfgs_max(th -> ordered_logit_loglik(th, x_ord, y_ord, 4), [-0.5, 0.0, 0.0, 0.5])
    c_ord = unpack_cutpoints(th_ord[1:3])
    @test issorted(c_ord; lt = <)
    @test round.(c_ord; digits = 3) == [-0.274, 1.651, 2.721]
    @test round(th_ord[4]; digits = 3) == 1.244
    @test round(ll_ord; digits = 2) == -212.78
    @test gnorm_ord < 1e-8

    # 2) 比例オッズ違反の尤度比検出
    rng_np = Xoshiro(5102)
    z_np = repeat([0.0, 1.0], inner = 200)
    sample_cat(rng, probs) = (r = rand(rng); acc = 0.0; for k in eachindex(probs); acc += probs[k]; r <= acc && return k; end; length(probs))
    y_np = [zi == 0.0 ? sample_cat(rng_np, [0.35, 0.25, 0.20, 0.20]) : sample_cat(rng_np, [0.10, 0.50, 0.28, 0.12]) for zi in z_np]
    th_np, ll_po_np, _ = bfgs_max(th -> ordered_logit_loglik(th, z_np, y_np, 4), [-0.5, 0.0, 0.0, 0.0])
    ll_free_np = sum(let idx = findall(==(g), z_np), ni = length(idx)
        sum(let nk = count(==(k), y_np[idx]); nk > 0 ? nk * log(nk / ni) : 0.0; end for k in 1:4)
    end for g in (0.0, 1.0))
    @test round(th_np[4]; digits = 3) == 0.339
    @test round(2 * (ll_free_np - ll_po_np); digits = 2) == 56.32

    # 3) logsumexp の桁あふれ防止・参照カテゴリ不変性・RPS
    @test all(isnan, exp.([1000.0, 1001.0, 999.0]) ./ sum(exp.([1000.0, 1001.0, 999.0])))
    @test round.(stable_softmax([1000.0, 1001.0, 999.0]); digits = 4) == [0.2447, 0.6652, 0.09]

    function mnl_ll(theta::AbstractVector{T}, X::Matrix{Float64}, y::Vector{Int}, K::Int, ref::Int) where {T<:Real}
        n, p = size(X)
        nonref = [k for k in 1:K if k != ref]
        B = zeros(T, p, K); B[:, nonref] .= reshape(theta, p, K - 1)
        ll = zero(T); eta_row = Vector{T}(undef, K)
        for i in 1:n
            for k in 1:K; eta_row[k] = X[i, 1] * B[1, k] + X[i, 2] * B[2, k]; end
            ll += eta_row[y[i]] - logsumexp_fn(eta_row)
        end
        return ll
    end
    rng_mnl = Xoshiro(5103)
    X_mnl = hcat(ones(180), randn(rng_mnl, 180))
    B_true = [0.0 0.4 -0.3; 0.0 1.3 -1.1]
    y_mnl = [sample_cat(rng_mnl, stable_softmax(vec(X_mnl[i:i, :] * B_true))) for i in 1:180]
    th_r1, ll_r1, _ = bfgs_max(t -> mnl_ll(t, X_mnl, y_mnl, 3, 1), zeros(4))
    th_r3, ll_r3, _ = bfgs_max(t -> mnl_ll(t, X_mnl, y_mnl, 3, 3), zeros(4))
    B1 = zeros(2, 3); B1[:, [2, 3]] .= reshape(th_r1, 2, 2)
    B3 = zeros(2, 3); B3[:, [1, 2]] .= reshape(th_r3, 2, 2)
    P1 = reduce(vcat, [stable_softmax(vec(X_mnl[i:i, :] * B1))' for i in 1:180])
    P3 = reduce(vcat, [stable_softmax(vec(X_mnl[i:i, :] * B3))' for i in 1:180])
    @test isapprox(ll_r1, ll_r3; atol = 1e-9)
    @test maximum(abs.(P1 .- P3)) < 1e-8
    Y_oh = [y_mnl[i] == k ? 1.0 : 0.0 for i in 1:180, k in 1:3]
    @test norm((X_mnl' * (Y_oh .- P1))[:, [2, 3]]) < 1e-7

    rps_1obs(pr, y) = sum((sum(pr[1:k]) - (y <= k ? 1.0 : 0.0))^2 for k in 1:(length(pr) - 1)) / (length(pr) - 1)
    @test round(rps_1obs([0.05, 0.05, 0.70, 0.20], 4); digits = 4) == 0.2175
    @test round(rps_1obs([0.70, 0.05, 0.05, 0.20], 4); digits = 4) == 0.5642
end

# ============================================================
# 6. m06: カイ二乗分析の深化（適合度・割合の罠・正確検定・傾向検定・対数線形・構造的ゼロ）
# ============================================================
@testset "m06: カイ二乗分析・正確検定・対数線形モデル" begin
    function chisq_gof_m6(obs, probs)
        n = sum(obs)
        e = n .* probs
        chi2 = sum((obs .- e).^2 ./ e)
        g2 = 2.0 * sum(o > 0 ? o * log(o / ex) : 0.0 for (o, ex) in zip(obs, e))
        return (chi2 = chi2, g2 = g2, w = sqrt(chi2 / n), p = ccdf(Chisq(length(obs) - 1), chi2))
    end
    r40 = chisq_gof_m6([14, 6, 20], [0.25, 0.25, 0.50])
    rpct = chisq_gof_m6([35.0, 15.0, 50.0], [0.25, 0.25, 0.50])
    @test round(r40.chi2; digits = 3) == 3.2
    @test round(r40.p; digits = 4) == 0.2019
    @test round(rpct.chi2; digits = 3) == 8.0
    @test round(rpct.p; digits = 4) == 0.0183
    @test isapprox(r40.w, rpct.w; atol = 1e-12)

    pearson_mat(tab) = (n = sum(tab); r = sum(tab; dims = 2); c = sum(tab; dims = 1);
        sum((tab[i, j] - r[i] * c[j] / n)^2 / (r[i] * c[j] / n) for i in axes(tab, 1), j in axes(tab, 2)))

    # 疎な 3×3 表: 漸近 p = 0.00071 に対し周辺固定正確 p ≈ 0.0522
    tab_sp = [1 0 0; 0 5 4; 0 4 5]
    obs_sp = pearson_mat(tab_sp)
    @test round(obs_sp; digits = 3) == 19.235
    @test round(ccdf(Chisq(4), obs_sp); digits = 5) == 0.00071
    p_ex_sp = let rng = Xoshiro(4601), B = 50_000, rsum = vec(sum(tab_sp; dims = 2)),
                  cpool = reduce(vcat, [fill(j, sum(@view tab_sp[:, j])) for j in 1:3]),
                  sim = zeros(Int, 3, 3), hits = 0
        for _ in 1:B
            shuffle!(rng, cpool); fill!(sim, 0); idx = 1
            for i in 1:3, _ in 1:rsum[i]; sim[i, cpool[idx]] += 1; idx += 1; end
            pearson_mat(sim) >= obs_sp - 1e-12 && (hits += 1)
        end
        (hits + 1) / (B + 1)
    end
    @test round(p_ex_sp; digits = 4) == 0.0522

    # 2×4 用量反応表の傾向検定 M^2
    dose_tab = [23 21 18 14; 7 9 12 16]
    n_d = sum(dose_tab); p_d = dose_tab ./ n_d
    rm_d, cm_d = vec(sum(p_d; dims = 2)), vec(sum(p_d; dims = 1))
    u_d, v_d = [0.0, 1.0], [0.0, 1.0, 2.0, 3.0]
    mu_u, mu_v = dot(rm_d, u_d), dot(cm_d, v_d)
    sd_u = sqrt(sum(rm_d[i] * (u_d[i] - mu_u)^2 for i in 1:2))
    sd_v = sqrt(sum(cm_d[j] * (v_d[j] - mu_v)^2 for j in 1:4))
    cov_uv = sum(p_d[i, j] * (u_d[i] - mu_u) * (v_d[j] - mu_v) for i in 1:2, j in 1:4)
    m2_d = (n_d - 1) * (cov_uv / (sd_u * sd_v))^2
    @test round(pearson_mat(dose_tab); digits = 3) == 6.603
    @test round(m2_d; digits = 3) == 6.406
    @test ccdf(Chisq(3), pearson_mat(dose_tab)) > 0.05
    @test ccdf(Chisq(1), m2_d) < 0.02

    # 3元対数線形 (条件付き独立 A ⊥ C | B と IPF 3要因交互作用) & 準独立モデル
    g2_dev(obs, ex) = sum(o > 0 ? 2.0 * o * log(o / e) : 0.0 for (o, e) in zip(obs, ex))
    N3 = Array{Int}(undef, 2, 2, 2)
    N3[:, 1, :] = [65 15; 16 4]; N3[:, 2, :] = [8 32; 31 129]
    tab_AC = dropdims(sum(N3; dims = 2); dims = 2)
    exp_AC = (sum(tab_AC; dims = 2) * sum(tab_AC; dims = 1)) ./ sum(tab_AC)
    N_ij, N_jk, N_j = sum(N3; dims = 3), sum(N3; dims = 1), sum(N3; dims = (1, 3))
    E_cond = [N_ij[i, j, 1] * N_jk[1, j, k] / N_j[1, j, 1] for i in 1:2, j in 1:2, k in 1:2]
    @test round(g2_dev(tab_AC, exp_AC); digits = 3) == 36.412
    @test round(g2_dev(N3, E_cond); digits = 3) == 0.024

    mask_od = [i != j ? 1.0 : 0.0 for i in 1:4, j in 1:4]
    qi_null = [0 20 20 20; 20 0 20 20; 20 20 0 20; 20 20 20 0]
    @test round(pearson_mat(qi_null); digits = 2) == 80.0
    mu_qi = copy(mask_od)
    for _ in 1:200
        mu_qi .*= sum(qi_null; dims = 2) ./ sum(mu_qi; dims = 2)
        mu_qi .*= sum(qi_null; dims = 1) ./ sum(mu_qi; dims = 1)
    end
    @test isapprox(g2_dev(qi_null, mu_qi), 0.0; atol = 1e-12)
end

@testset "m07 & b05: Lasso座標降下・決定木RF・事前選択リーク・列優先メモリ" begin
    soft_th(z::Float64, g::Float64) = sign(z) * max(abs(z) - g, 0.0)
    function fit_las(X::Matrix{Float64}, y::Vector{Float64}, lam::Float64)
        n, p = size(X)
        ym, xm = mean(y), vec(mean(X; dims = 1))
        xs = vec(std(X; dims = 1, corrected = false))
        Z = (X .- xm') ./ xs'
        b, r = zeros(Float64, p), y .- ym
        for _ in 1:400
            md = 0.0
            @views for j in 1:p
                zj, ob = Z[:, j], b[j]
                nb = soft_th(dot(zj, r) / n + ob, lam)
                if nb != ob
                    r .-= (nb - ob) .* zj
                    b[j] = nb
                    md = max(md, abs(nb - ob))
                end
            end
            md < 1e-9 && break
        end
        beta = b ./ xs
        return (intercept = ym - dot(xm, beta), beta_std = b, beta = beta)
    end

    rng = Xoshiro(4701)
    X_tr = randn(rng, 55, 30)
    tb = vcat([1.6, -1.2, 0.9], zeros(27))
    y_tr = 0.5 .+ X_tr * tb .+ randn(rng, 55)
    X_te = randn(rng, 300, 30)
    y_te = 0.5 .+ X_te * tb .+ randn(rng, 300)
    b_ols = hcat(ones(55), X_tr) \ y_tr
    las = fit_las(X_tr, y_tr, 0.32)
    @test round(sqrt(mean((y_tr .- hcat(ones(55), X_tr) * b_ols).^2)); digits = 3) == 0.582
    @test round(sqrt(mean((y_te .- hcat(ones(300), X_te) * b_ols).^2)); digits = 3) == 1.83
    @test round(sqrt(mean((y_te .- (las.intercept .+ X_te * las.beta)).^2)); digits = 3) == 1.394
    @test findall(!iszero, las.beta_std) == [1, 2, 3, 21]

    # 共線性下でのLasso選択の不安定性 (4702)
    let rng_c = Xoshiro(4702), z = randn(rng_c, 80),
        Xc = hcat(z .+ 0.12 .* randn(rng_c, 80), z .+ 0.12 .* randn(rng_c, 80), randn(rng_c, 80, 6)),
        yc = 1.1 .* z .+ 0.7 .* randn(rng_c, 80),
        only1 = 0, only2 = 0, both = 0
        for _ in 1:100
            idx = rand(rng_c, 1:80, 80)
            fb = fit_las(Xc[idx, :], yc[idx], 0.42)
            n1, n2 = !iszero(fb.beta_std[1]), !iszero(fb.beta_std[2])
            n1 && !n2 && (only1 += 1); !n1 && n2 && (only2 += 1); n1 && n2 && (both += 1)
        end
        @test (round(cor(Xc[:, 1], Xc[:, 2]), digits = 3), only1, only2, both) == (0.988, 14, 42, 44)
    end

    # 決定木・ランダムフォレスト・外挿不能・置換重要度 (4703)
    let rng_t = Xoshiro(4703),
        X_nl = rand(rng_t, 160, 5) .* 4 .- 2,
        f_nl = X -> [x[1] > 0 ? 2.2 * sin(1.5 * x[2]) : -1.6 * x[3] for x in eachrow(X)],
        y_nl = f_nl(X_nl) .+ 0.45 .* randn(rng_t, 160),
        X_nl_te = rand(rng_t, 300, 5) .* 4 .- 2,
        y_nl_te = f_nl(X_nl_te) .+ 0.45 .* randn(rng_t, 300)
        function fit_tr(X, y, rows, depth; max_depth = 6, min_leaf = 4, mtry = size(X, 2), rng = nothing)
            m, n_r = mean(@view y[rows]), length(rows)
            (depth >= max_depth || n_r < 2 * min_leaf) && return (feat = 0, thresh = 0.0, val = m, left = nothing, right = nothing)
            feats = rng === nothing || mtry >= size(X, 2) ? (1:size(X, 2)) : sort!(randperm(rng, size(X, 2))[1:mtry])
            best_sse, best_f, best_th = Inf, 0, 0.0
            tot_s, tot_q = sum(@view y[rows]), sum(v^2 for v in @view y[rows])
            for f in feats
                ord = sort(rows; by = i -> X[i, f]); ls = 0.0
                for k in 1:(n_r - 1)
                    ls += y[ord[k]]
                    (k < min_leaf || n_r - k < min_leaf || X[ord[k], f] == X[ord[k + 1], f]) && continue
                    sse = tot_q - (ls^2 / k + (tot_s - ls)^2 / (n_r - k))
                    if sse < best_sse; best_sse, best_f, best_th = sse, f, 0.5 * (X[ord[k], f] + X[ord[k + 1], f]); end
                end
            end
            best_f == 0 && return (feat = 0, thresh = 0.0, val = m, left = nothing, right = nothing)
            return (feat = best_f, thresh = best_th, val = m,
                left = fit_tr(X, y, [i for i in rows if X[i, best_f] <= best_th], depth + 1; max_depth, min_leaf, mtry, rng),
                right = fit_tr(X, y, [i for i in rows if X[i, best_f] > best_th], depth + 1; max_depth, min_leaf, mtry, rng))
        end
        pred_tr(nd, x) = (while nd.feat != 0; nd = x[nd.feat] <= nd.thresh ? nd.left : nd.right; end; nd.val)
        b_lin = hcat(ones(160), X_nl) \ y_nl
        deep_tr = fit_tr(X_nl, y_nl, collect(1:160), 0; max_depth = 10, min_leaf = 2)
        forest = [fit_tr(X_nl, y_nl, rand(rng_t, 1:160, 160), 0; max_depth = 6, min_leaf = 4, mtry = 3, rng = rng_t) for _ in 1:50]
        pred_rf(F, X) = [mean(pred_tr(tr, @view X[i, :]) for tr in F) for i in axes(X, 1)]
        @test round(sqrt(mean((y_nl_te .- hcat(ones(300), X_nl_te) * b_lin).^2)); digits = 3) == 1.426
        @test round(sqrt(mean((y_nl .- [pred_tr(deep_tr, @view X_nl[i, :]) for i in 1:160]).^2)); digits = 3) == 0.296
        @test round(sqrt(mean((y_nl_te .- [pred_tr(deep_tr, @view X_nl_te[i, :]) for i in 1:300]).^2)); digits = 3) == 1.073
        @test round(sqrt(mean((y_nl_te .- pred_rf(forest, X_nl_te)).^2)); digits = 3) == 0.886
        @test round(pred_rf(forest, [-1.0 0.0 5.0 0.0 0.0])[1]; digits = 3) == -2.233
        base_mse = mean((y_nl_te .- pred_rf(forest, X_nl_te)).^2)
        perm_imp = [let Xp = copy(X_nl_te); Xp[:, j] = Xp[randperm(rng_t, size(Xp, 1)), j]; mean((y_nl_te .- pred_rf(forest, Xp)).^2) - base_mse end for j in 1:5]
        @test round.(perm_imp, digits = 3) == [1.431, 1.9, 2.146, 0.0, 0.007]
    end

    # 純ノイズでの事前スクリーニング・リーク対fold内選択
    rng_lk = Xoshiro(4704)
    X_lk, y_lk = randn(rng_lk, 60, 300), randn(rng_lk, 60)
    sel_lk = partialsortperm([abs(cor(@view(X_lk[:, j]), y_lk)) for j in 1:300], 1:8; rev = true)
    pl, ph = similar(y_lk), similar(y_lk)
    for k in 1:5
        va = ((k - 1) * 12 + 1):(k * 12)
        tr = setdiff(1:60, va)
        pl[va] = hcat(ones(12), X_lk[va, sel_lk]) * (hcat(ones(48), X_lk[tr, sel_lk]) \ y_lk[tr])
        sel_tr = partialsortperm([abs(cor(@view(X_lk[tr, j]), @view(y_lk[tr]))) for j in 1:300], 1:8; rev = true)
        ph[va] = hcat(ones(12), X_lk[va, sel_tr]) * (hcat(ones(48), X_lk[tr, sel_tr]) \ y_lk[tr])
    end
    sst = sum((y_lk .- mean(y_lk)).^2)
    @test round(1.0 - sum((y_lk .- pl).^2) / sst; digits = 3) == 0.312
    @test round(1.0 - sum((y_lk .- ph).^2) / sst; digits = 3) == -0.404

    # B05 列優先対行優先バッファ照合
    X_jl = [10.0 20.0 30.0; 40.0 50.0 60.0]
    @test strides(X_jl) == (1, 2)
    @test Int.(permutedims(reshape(vec(X_jl), 3, 2))[1, :]) == [10, 40, 20]
    @test permutedims(reshape(vec(permutedims(X_jl)), 3, 2)) == X_jl
end

# ============================================================
# 8. m08: 反復測定の個人内SE・リンク尺度リボン・知覚均等輝度と発散配色・L25単峰対二峰
# ============================================================

@testset "m08: 反復測定の個人内SE・リンク尺度リボン・知覚均等輝度と発散配色" begin
    # L25 Page 4: 平均・SD・nが完全一致する単峰対二峰データ
    match_summary_l25(x; target_mean = 500.0, target_sd = 50.0) =
        target_mean .+ target_sd .* ((x .- mean(x)) ./ std(x))
    unimodal_l25 = match_summary_l25(rand(Xoshiro(11), Normal(), 40))
    bimodal_l25 = match_summary_l25(vcat(
        rand(Xoshiro(12), Normal(-2, 0.25), 20),
        rand(Xoshiro(13), Normal(2, 0.25), 20),
    ))
    @test isapprox(mean(unimodal_l25), mean(bimodal_l25); atol = 1e-10)
    @test isapprox(std(unimodal_l25), std(bimodal_l25); atol = 1e-10)
    @test length(unimodal_l25) == length(bimodal_l25) == 40
    @test count(x -> 475.0 <= x <= 525.0, bimodal_l25) == 0

    # m08 Page 2: 反復測定 Pre/Post の群間SE 対 Cousineau-Morey 個人内SE
    rng_v = Xoshiro(4801)
    n_v = 24
    tcrit_v = quantile(TDist(23), 0.975)
    pre_v = 520.0 .+ 85.0 .* randn(rng_v, n_v)
    post_v = pre_v .+ (-18.5 .+ 11.0 .* randn(rng_v, n_v))
    btw_se = std(pre_v) / sqrt(n_v)
    grand_m = 0.5 * (mean(pre_v) + mean(post_v))
    subj_m = 0.5 .* (pre_v .+ post_v)
    ws_morey_se = std(pre_v .- subj_m .+ grand_m) / sqrt(n_v) * sqrt(2.0)
    diff_se = std(post_v .- pre_v) / sqrt(n_v)
    @test round(mean(pre_v); digits = 1) == 524.2
    @test round(mean(post_v); digits = 1) == 506.1
    @test round(btw_se; digits = 2) == 16.64
    @test round(ws_morey_se; digits = 2) == 1.57
    @test round(diff_se; digits = 2) == 2.22
    @test isapprox(sqrt(2.0) * ws_morey_se, diff_se; atol = 1e-12)
    @test count(post_v .< pre_v) == 23
    @test round.([mean(post_v .- pre_v) - tcrit_v * diff_se,
                  mean(post_v .- pre_v) + tcrit_v * diff_se]; digits = 2) == [-22.68, -13.48]

    # m08 Page 3: alpha飽和とロジット空間リボン対確率尺度リボン
    @test round(1.0 - (1.0 - 0.20)^25; digits = 4) == 0.9962
    logistic_m8(z) = 1.0 / (1.0 + exp(-z))
    eta_h, se_e = -3.35, 0.68
    p_h = logistic_m8(eta_h)
    se_p = p_h * (1.0 - p_h) * se_e
    @test round(p_h; digits = 4) == 0.0339
    @test round.([p_h - 1.96 * se_p, p_h + 1.96 * se_p]; digits = 4) == [-0.0097, 0.0775]
    @test round.([logistic_m8(eta_h - 1.96 * se_e), logistic_m8(eta_h + 1.96 * se_e)]; digits = 4) == [0.0092, 0.1174]

    # m08 Page 4: jet対viridisの相対輝度単調性と発散パレットのゼロ位置
    ts_c = collect(range(0.0, 1.0, length = 9))
    jet_rgb(t) = (clamp(1.5 - abs(4t - 3), 0.0, 1.0),
                  clamp(1.5 - abs(4t - 2), 0.0, 1.0),
                  clamp(1.5 - abs(4t - 1), 0.0, 1.0))
    vir_rgb(t) = (clamp(0.27 + 0.72 * t^1.6, 0.0, 1.0),
                  clamp(0.01 + 0.89 * t^0.95, 0.0, 1.0),
                  clamp(0.33 + 0.25 * sin(pi * t) - 0.42 * t^1.4, 0.0, 1.0))
    rel_lum((r, g, b)) = 0.2126 * r + 0.7152 * g + 0.0722 * b
    jet_lums = [rel_lum(jet_rgb(t)) for t in ts_c]
    vir_lums = [rel_lum(vir_rgb(t)) for t in ts_c]
    @test round.(jet_lums; digits = 2) == [0.04, 0.07, 0.43, 0.79, 0.86, 0.93, 0.57, 0.21, 0.11]
    @test all(diff(jet_lums) .> 0) == false
    @test all(diff(vir_lums) .> 0) == true
    vmin_c, vmax_c = -0.8, 2.4
    m_c = max(abs(vmin_c), abs(vmax_c))
    @test round((0.0 - vmin_c) / (vmax_c - vmin_c); digits = 3) == 0.25
    @test round((0.0 - (-m_c)) / (m_c - (-m_c)); digits = 3) == 0.5
end

struct UncertainX10 <: Real
    val::Float64
    err::Float64
end
Base.:+(a::UncertainX10, b::UncertainX10) = UncertainX10(a.val + b.val, hypot(a.err, b.err))
Base.:-(a::UncertainX10, b::UncertainX10) = UncertainX10(a.val - b.val, hypot(a.err, b.err))
Base.:/(a::UncertainX10, c::Real) = UncertainX10(a.val / c, abs(a.err / c))

@testset "x10: 研究を加速するJulia実用ツールと開発習慣" begin
    # Page 2: 標準 Test による自動検算と異常入力の例外固定
    function clean_rt_summary_x10(xs; min_ms = 150.0, max_ms = 3000.0)
        valid = [Float64(x) for x in skipmissing(xs) if min_ms <= x <= max_ms]
        isempty(valid) && throw(ArgumentError("有効な試行が0件です"))
        m = mean(valid)
        se = length(valid) > 1 ? std(valid) / sqrt(length(valid)) : 0.0
        return (n = length(valid), mean = m, se = se)
    end
    raw_x10 = [480, missing, 520, 95, 530, 4100, 490]
    s_x10 = clean_rt_summary_x10(raw_x10)
    @test s_x10.n == 4
    @test isapprox(s_x10.mean, 505.0; atol = 1e-10)
    @test round(s_x10.se; digits = 2) == 11.9
    @test_throws ArgumentError clean_rt_summary_x10([missing, 80, 5000])

    # Page 3: @btime が最小値を重視する理由（OS/GC非負スパイクによる平均の歪み）
    samples_us = [12.4, 12.3, 12.5, 12.3, 185.0, 12.4, 12.3, 12.4]
    @test minimum(samples_us) == 12.3
    @test median(samples_us) == 12.4
    @test round(mean(samples_us); digits = 2) == 33.95

    # Page 4: @sprintf による Markdown 表の決定論的自動生成
    rows_x10 = [("統制群", 24, 524.21, 16.64), ("介入群", 24, 506.13, 16.41)]
    md_lines = ["| 条件 | n | 平均 (ms) | SE (ms) |", "| :--- | ---: | ---: | ---: |"]
    for (cond, n, m, se) in rows_x10
        push!(md_lines, @sprintf("| %s | %d | %.1f | %.2f |", cond, n, m, se))
    end
    @test md_lines[3] == "| 統制群 | 24 | 524.2 | 16.64 |"
    @test md_lines[4] == "| 介入群 | 24 | 506.1 | 16.41 |"

    # Page 5: 多重ディスパッチによる誤差伝播の自動合成（Statistics.mean 無変更）
    pre_u = UncertainX10(524.2, 3.1)
    post_u = UncertainX10(506.1, 2.9)
    diff_u = post_u - pre_u
    avg_u = mean([pre_u, post_u])
    @test (round(diff_u.val; digits = 1), round(diff_u.err; digits = 2)) == (-18.1, 4.24)
    @test (round(avg_u.val; digits = 2), round(avg_u.err; digits = 2)) == (515.15, 2.12)
end

struct DualCheckX11 <: Real
    val::Float64
    der::Float64
end
Base.:+(a::DualCheckX11, b::DualCheckX11) = DualCheckX11(a.val + b.val, a.der + b.der)
Base.:+(c::Real, a::DualCheckX11)         = DualCheckX11(c + a.val, a.der)
Base.:-(a::DualCheckX11, b::DualCheckX11) = DualCheckX11(a.val - b.val, a.der - b.der)
Base.:*(a::DualCheckX11, b::DualCheckX11) = DualCheckX11(a.val * b.val, a.der * b.val + a.val * b.der)
Base.:*(c::Real, a::DualCheckX11)         = DualCheckX11(c * a.val, c * a.der)
Base.:/(a::DualCheckX11, b::DualCheckX11) = DualCheckX11(a.val / b.val, (a.der * b.val - a.val * b.der) / b.val^2)
Base.exp(a::DualCheckX11) = (ea = exp(a.val); DualCheckX11(ea, ea * a.der))
Base.sin(a::DualCheckX11) = DualCheckX11(sin(a.val), cos(a.val) * a.der)

@testset "x11: プロットで見るJuliaの強みと適材適所" begin
    # Page 2: 逐次ループの型安定 0B 割当と @. ドット融合の一時配列消滅
    unfused_gauss_x11(x::Vector{Float64}, mu::Float64, sd::Float64) = begin
        z1 = x .- mu; z2 = z1 ./ sd; z3 = z2 .^ 2; z4 = -0.5 .* z3
        return exp.(z4)
    end
    fused_gauss_x11!(out::Vector{Float64}, x::Vector{Float64}, mu::Float64, sd::Float64) =
        (@. out = exp(-0.5 * ((x - mu) / sd)^2))
    function step_loop_x11(xs, a::Float64)
        s = 0.0
        for v in xs; s = a * s + v; end
        return s
    end

    x50k = collect(range(-3.0, 3.0, length = 50_000))
    out50k = similar(x50k)
    ref50k = unfused_gauss_x11(x50k, 0.0, 1.2)
    fused_gauss_x11!(out50k, x50k, 0.0, 1.2)
    @test isapprox(ref50k, out50k; atol = 1e-15)
    @test @allocated(unfused_gauss_x11(x50k, 0.0, 1.2)) >= 5 * 50_000 * sizeof(Float64)
    @test @allocated(fused_gauss_x11!(out50k, x50k, 0.0, 1.2)) == 0

    xs_f64 = collect(range(0.001, 1.0, length = 10_000))
    xs_any = Any[v for v in xs_f64]
    step_loop_x11(xs_any, 0.98)
    step_loop_x11(xs_f64, 0.98)
    @test @allocated(step_loop_x11(xs_any, 0.98)) > 100_000
    @test @allocated(step_loop_x11(xs_f64, 0.98)) == 0

    # Page 3: 有限差分の V字誤差曲線（打切り誤差 vs 桁落ち誤差）と Dual 自動微分の機械精度
    f_nl_x11(theta::Real) = exp(-0.5 * theta) * sin(2 * theta) / (1 + theta * theta)
    t0 = 0.8
    u = exp(-0.5 * t0) * sin(2 * t0)
    du = exp(-0.5 * t0) * (-0.5 * sin(2 * t0) + 2.0 * cos(2 * t0))
    v = 1.0 + t0^2
    exact = (du * v - u * (2.0 * t0)) / (v^2)
    err_big   = abs((f_nl_x11(t0 + 1e-2)  - f_nl_x11(t0)) / 1e-2  - exact)
    err_best  = abs((f_nl_x11(t0 + 1e-8)  - f_nl_x11(t0)) / 1e-8  - exact)
    err_small = abs((f_nl_x11(t0 + 1e-15) - f_nl_x11(t0)) / 1e-15 - exact)
    err_dual  = abs(f_nl_x11(DualCheckX11(t0, 1.0)).der - exact)

    @test err_big > 1e-3
    @test err_best < 1e-8
    @test err_small > 1e-3 # h を小さくしすぎると桁落ちで再び悪化する (V字曲線)
    @test err_dual < 1e-15 # Dual 数自動微分は機械精度に到達
end

struct UncertainX12 <: Real
    v::Float64
    se::Float64
end
Base.:+(a::UncertainX12, b::UncertainX12) = UncertainX12(a.v + b.v, hypot(a.se, b.se))
Base.:-(a::UncertainX12, b::UncertainX12) = UncertainX12(a.v - b.v, hypot(a.se, b.se))
Base.:-(a::UncertainX12)                  = UncertainX12(-a.v, a.se)
Base.:*(c::Real, a::UncertainX12)         = UncertainX12(c * a.v, abs(c) * a.se)
Base.:*(a::UncertainX12, c::Real)         = UncertainX12(a.v * c, abs(c) * a.se)
Base.:*(a::UncertainX12, b::UncertainX12) = UncertainX12(a.v * b.v, hypot(b.v * a.se, a.v * b.se))

function rk4_decay_x12(u::Real, k::Real, dt::Float64, steps::Int)
    for _ in 1:steps
        k1 = -k * u
        k2 = -k * (u + 0.5 * dt * k1)
        k3 = -k * (u + 0.5 * dt * k2)
        k4 = -k * (u + dt * k3)
        u  = u + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
    end
    return u
end

function sum_uncertain_x12(xs::Vector{UncertainX12})
    acc = UncertainX12(0.0, 0.0)
    for x in xs
        acc = acc + x
    end
    return acc
end

@testset "x12: Juliaらしい設計技法（多重ディスパッチ・isbits・ASTマクロ・Holy Traits）" begin
    u_end = rk4_decay_x12(UncertainX12(100.0, 3.0), UncertainX12(0.22, 0.025), 0.25, 20)
    @test isapprox(u_end.v, 33.29; atol = 0.01)
    @test isapprox(u_end.se, 3.17; atol = 0.01)
    @test isapprox(u_end.v - 1.96 * u_end.se, 27.08; atol = 0.01)
    @test isapprox(u_end.v + 1.96 * u_end.se, 39.50; atol = 0.01)

    pts = [UncertainX12(1.0 * i, 0.1) for i in 1:10_000]
    sum_uncertain_x12(pts)
    @test isbitstype(UncertainX12)
    @test sizeof(UncertainX12) == 16
    @test sizeof(pts) == 160_000
    @test @allocated(sum_uncertain_x12(pts)) == 0

    ex = :(a * x + b)
    @test ex isa Expr
    @test ex.head == :call
    @test ex.args == Any[:+, :(a * x), :b]
end

println("INTERMEDIATE_TRACK_CHECK_PASS")
