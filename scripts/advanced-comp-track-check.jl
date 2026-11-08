#!/usr/bin/env julia
# 上級編トラック（微分方程式・DDM確率過程・状態空間カルマンフィルタ・MCMC/HMC）の数値検証

using Test, Random, Statistics, LinearAlgebra, Distributions

# --- 上1: 微分方程式と動的システム (Euler vs RK4・in-place SIR・安定性限界) ---
exact_learning(t; u0 = 0.2, K = 1.0, r = 0.8) = K - (K - u0) * exp(-r * t)

function solve_euler_scalar(f, u0::Float64, dt::Float64, nsteps::Int)
    u = u0
    t = 0.0
    for _ in 1:nsteps
        u += dt * f(u, t)
        t += dt
    end
    return u
end

function solve_rk4_scalar(f, u0::Float64, dt::Float64, nsteps::Int)
    u = u0
    t = 0.0
    for _ in 1:nsteps
        k1 = f(u, t)
        k2 = f(u + 0.5 * dt * k1, t + 0.5 * dt)
        k3 = f(u + 0.5 * dt * k2, t + 0.5 * dt)
        k4 = f(u + dt * k3, t + dt)
        u += (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
        t += dt
    end
    return u
end

function sir_rhs!(du::Vector{Float64}, u::Vector{Float64}, p::NamedTuple, _t::Float64)
    S, I, _R = u[1], u[2], u[3]
    inf_flow = p.beta * S * I / p.N
    rec_flow = p.gamma * I
    du[1] = -inf_flow
    du[2] = inf_flow - rec_flow
    du[3] = rec_flow
    return nothing
end

function rk4_step!(u::Vector{Float64}, rhs!, p, t::Float64, dt::Float64,
                   k1::Vector{Float64}, k2::Vector{Float64},
                   k3::Vector{Float64}, k4::Vector{Float64}, tmp::Vector{Float64})
    rhs!(k1, u, p, t)
    @. tmp = u + 0.5 * dt * k1
    rhs!(k2, tmp, p, t + 0.5 * dt)
    @. tmp = u + 0.5 * dt * k2
    rhs!(k3, tmp, p, t + 0.5 * dt)
    @. tmp = u + dt * k3
    rhs!(k4, tmp, p, t + dt)
    @. u = u + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
    return nothing
end

function run_sir_rk4(p; dt = 0.25, nsteps = 160)
    u = [p.N - 5.0, 5.0, 0.0]
    k1, k2, k3, k4, tmp = zeros(3), zeros(3), zeros(3), zeros(3), zeros(3)
    peak_I = u[2]
    for step in 0:(nsteps - 1)
        rk4_step!(u, sir_rhs!, p, step * dt, dt, k1, k2, k3, k4, tmp)
        u[2] > peak_I && (peak_I = u[2])
    end
    return (final = u, peak_I = peak_I)
end

# --- 上2: 確率過程と反応時間モデル (Euler–Maruyama √dt スケーリングとDDM) ---
function brownian_endpoint_var(seed::Int; dt = 0.01, nsteps = 100, nsim = 4000, wrong_scale = false)
    rng = Xoshiro(seed)
    endpoints = Vector{Float64}(undef, nsim)
    scale = wrong_scale ? dt : sqrt(dt)
    for i in 1:nsim
        x = 0.0
        for _ in 1:nsteps
            x += scale * randn(rng)
        end
        endpoints[i] = x
    end
    return var(endpoints)
end

ddm_analytic_acc(v::Float64, a::Float64; z_rel = 0.5) =
    abs(v) < 1e-12 ? z_rel : (1.0 - exp(-2.0 * v * a * (1.0 - z_rel))) / (1.0 - exp(-2.0 * v * a))
# 注: 下境界0・上境界a・開始点 z = a*z_rel・ドリフト +v・拡散 σ=1 のとき
# P(hit a | x0 = z) = (exp(-2*v*0) - exp(-2*v*z)) / (exp(-2*v*0) - exp(-2*v*a))
#                   = (1 - exp(-2*v*z)) / (1 - exp(-2*v*a))
ddm_upper_prob(v::Float64, a::Float64; z_rel = 0.5) =
    abs(v) < 1e-12 ? z_rel : (1.0 - exp(-2.0 * v * a * z_rel)) / (1.0 - exp(-2.0 * v * a))

function simulate_ddm(seed::Int, ntrials::Int; v = 0.9, a = 1.2, z_rel = 0.5, ter = 0.28, dt = 0.001)
    rng = Xoshiro(seed)
    rts = Vector{Float64}(undef, ntrials)
    correct = Vector{Bool}(undef, ntrials)
    sd = sqrt(dt)
    for i in 1:ntrials
        x = a * z_rel
        steps = 0
        while 0.0 < x < a && steps < 20_000
            x += v * dt + sd * randn(rng)
            steps += 1
        end
        rts[i] = ter + steps * dt
        correct[i] = x >= a
    end
    return (acc = mean(correct), mean_rt_ms = 1000.0 * mean(rts),
            q50_ms = 1000.0 * median(rts), q90_ms = 1000.0 * quantile(rts, 0.9))
end

# --- 上3: 状態空間モデルと1次元カルマンフィルタ + 周辺対数尤度 ---
function kalman_filter_1d(y::Vector{Float64}, phi::Float64, q::Float64, r::Float64;
                          x0 = 0.0, P0 = 10.0)
    T = length(y)
    x_filt = Vector{Float64}(undef, T)
    P_filt = Vector{Float64}(undef, T)
    q2, r2 = q^2, r^2
    x_prev, P_prev = x0, P0
    loglik = 0.0
    for t in 1:T
        x_pred = phi * x_prev
        P_pred = phi^2 * P_prev + q2
        innov = y[t] - x_pred
        F = P_pred + r2
        K = P_pred / F
        x_curr = x_pred + K * innov
        P_curr = (1.0 - K) * P_pred
        loglik += -0.5 * (log(2.0 * pi * F) + innov^2 / F)
        x_filt[t] = x_curr
        P_filt[t] = P_curr
        x_prev, P_prev = x_curr, P_curr
    end
    return (x_filt = x_filt, P_filt = P_filt, loglik = loglik)
end

# --- 上4: 相関2変量正規に対する Random-Walk MH vs Leapfrog HMC + ESS / split-Rhat ---
function corr_norm_logp_grad(q1::Float64, q2::Float64, rho::Float64)
     denom = 1.0 - rho^2
     logp = -0.5 * (q1^2 - 2.0 * rho * q1 * q2 + q2^2) / denom
     g1 = -(q1 - rho * q2) / denom
     g2 = -(q2 - rho * q1) / denom
     return (logp = logp, g1 = g1, g2 = g2)
end

function run_rwmh_2d(seed::Int, ndraws::Int; rho = 0.92, step_sd = 0.35)
    rng = Xoshiro(seed)
    draws = Matrix{Float64}(undef, ndraws, 2)
    q1, q2 = -1.5, 1.5
    lp = corr_norm_logp_grad(q1, q2, rho).logp
    acc = 0
    for i in 1:ndraws
        p1 = q1 + step_sd * randn(rng)
        p2 = q2 + step_sd * randn(rng)
        lp_prop = corr_norm_logp_grad(p1, p2, rho).logp
        if log(rand(rng)) < lp_prop - lp
            q1, q2, lp = p1, p2, lp_prop
            acc += 1
        end
        draws[i, 1] = q1
        draws[i, 2] = q2
    end
    return (draws = draws, acc_rate = acc / ndraws)
end

function run_hmc_2d(seed::Int, ndraws::Int; rho = 0.92, eps = 0.18, L = 12)
    rng = Xoshiro(seed)
    draws = Matrix{Float64}(undef, ndraws, 2)
    q1, q2 = -1.5, 1.5
    cur = corr_norm_logp_grad(q1, q2, rho)
    acc = 0
    divergent = 0
    for i in 1:ndraws
        r1, r2 = randn(rng), randn(rng)
        H_old = -cur.logp + 0.5 * (r1^2 + r2^2)
        p_q1, p_q2 = q1, q2
        p_r1 = r1 + 0.5 * eps * cur.g1
        p_r2 = r2 + 0.5 * eps * cur.g2
        st = cur
        for step in 1:L
            p_q1 += eps * p_r1
            p_q2 += eps * p_r2
            st = corr_norm_logp_grad(p_q1, p_q2, rho)
            if step < L
                p_r1 += eps * st.g1
                p_r2 += eps * st.g2
            end
        end
        p_r1 += 0.5 * eps * st.g1
        p_r2 += 0.5 * eps * st.g2
        H_new = -st.logp + 0.5 * (p_r1^2 + p_r2^2)
        delta_H = H_new - H_old
        if !isfinite(delta_H) || delta_H > 100.0
            divergent += 1
        elseif log(rand(rng)) < -delta_H
            q1, q2, cur = p_q1, p_q2, st
            acc += 1
        end
        draws[i, 1] = q1
        draws[i, 2] = q2
    end
    return (draws = draws, acc_rate = acc / ndraws, divergent = divergent)
end

function ess_1d(x::AbstractVector{<:Real}; max_lag = 80)
    n = length(x)
    xc = x .- mean(x)
    v = dot(xc, xc) / n
    v <= 0 && return 0.0
    rho_sum = 0.0
    for k in 1:min(max_lag, n - 2)
        rk = @views dot(xc[1:(n - k)], xc[(1 + k):n]) / (n * v)
        rk <= 0.0 && break
        rho_sum += rk
    end
    return n / (1.0 + 2.0 * rho_sum)
end

function split_rhat(chains::Vector{Vector{Float64}})
    halves = Vector{Float64}[]
    for c in chains
        h = length(c) ÷ 2
        push!(halves, c[1:h])
        push!(halves, c[(h + 1):(2 * h)])
    end
    m = length(halves)
    n = length(halves[1])
    means = mean.(halves)
    vars = var.(halves)
    W = mean(vars)
    B = n * var(means)
    var_hat = ((n - 1) / n) * W + B / n
    return sqrt(var_hat / W)
end

@testset "上級編トラックの数値検証" begin
    # 1. ODE: Euler vs RK4 精度と安定性・SIR in-place割当ゼロ
    f_learn(u, _t) = 0.8 * (1.0 - u)
    u_ex = exact_learning(5.0)
    u_eu = solve_euler_scalar(f_learn, 0.2, 0.5, 10)
    u_rk = solve_rk4_scalar(f_learn, 0.2, 0.5, 10)
    err_eu = abs(u_eu - u_ex)
    err_rk = abs(u_rk - u_ex)
    @test err_eu > 4e-3
    @test err_rk < 2.5e-5
    @test err_eu / err_rk > 250

    # 安定性限界を超えた陽的Eulerの振動反例: r = 3.0, dt = 0.8 => r*dt = 2.4 > 2
    f_stiff(u, _t) = 3.0 * (1.0 - u)
    u_osc1 = solve_euler_scalar(f_stiff, 0.0, 0.8, 1) # 2.4 (> 1.0!)
    u_osc2 = solve_euler_scalar(f_stiff, 0.0, 0.8, 2) # -0.96 (< 0.0!)
    @test u_osc1 ≈ 2.4
    @test u_osc2 ≈ -0.96

    # SIR in-place RK4: 割当ゼロと総人口保存
    p_sir = (beta = 0.45, gamma = 0.15, N = 1000.0)
    du_buf, u_buf = zeros(3), [995.0, 5.0, 0.0]
    sir_rhs!(du_buf, u_buf, p_sir, 0.0)
    @test (@allocated sir_rhs!(du_buf, u_buf, p_sir, 0.0)) == 0
    sir_out = run_sir_rk4(p_sir)
    @test isapprox(sum(sir_out.final), 1000.0; atol = 1e-10)
    @test sir_out.peak_I > 250.0

    # 2. DDM: Euler–Maruyama √dt スケーリングと速さ・正確さトレードオフ
    v_ok = brownian_endpoint_var(5101; wrong_scale = false)
    v_bad = brownian_endpoint_var(5101; wrong_scale = true)
    @test 0.90 < v_ok < 1.10
    @test v_bad < 0.02

    fast_ddm = simulate_ddm(5201, 3000; v = 0.9, a = 0.9, z_rel = 0.5, ter = 0.28, dt = 0.001)
    cautious_ddm = simulate_ddm(5201, 3000; v = 0.9, a = 1.6, z_rel = 0.5, ter = 0.28, dt = 0.001)
    @test cautious_ddm.acc > fast_ddm.acc
    @test cautious_ddm.mean_rt_ms > fast_ddm.mean_rt_ms
    @test isapprox(fast_ddm.acc, ddm_upper_prob(0.9, 0.9); atol = 0.025)
    @test isapprox(cautious_ddm.acc, ddm_upper_prob(0.9, 1.6); atol = 0.025)

    # 3. 状態空間モデルとカルマンフィルタ
    rng_ss = Xoshiro(5301)
    T = 80
    phi_true, q_true, r_true = 0.95, 0.35, 1.10
    x_true = Vector{Float64}(undef, T)
    y_obs = Vector{Float64}(undef, T)
    x_prev = 0.0
    for t in 1:T
        x_curr = phi_true * x_prev + q_true * randn(rng_ss)
        x_true[t] = x_curr
        y_obs[t] = x_curr + r_true * randn(rng_ss)
        x_prev = x_curr
    end
    kf = kalman_filter_1d(y_obs, phi_true, q_true, r_true)
    rmse_obs = sqrt(mean((y_obs .- x_true) .^ 2))
    rmse_filt = sqrt(mean((kf.x_filt .- x_true) .^ 2))
    @test rmse_filt < 0.6 * rmse_obs
    # 真の (q, r) 周辺対数尤度が過小/過大ノイズ指定より高い
    kf_under = kalman_filter_1d(y_obs, phi_true, 0.05, 0.20)
    kf_over  = kalman_filter_1d(y_obs, phi_true, 2.00, 3.00)
    @test kf.loglik > kf_under.loglik
    @test kf.loglik > kf_over.loglik
    # 反例: 観測差分の分散は状態変化分散より測定誤差2r^2分だけ膨張する
    @test var(diff(y_obs)) > 2.5 * var(diff(x_true))

    # 4. MCMC: RWMH vs HMC の ESS 比較・split-Rhat・大きすぎる eps での divergence
    rw = run_rwmh_2d(5401, 2000; rho = 0.92, step_sd = 0.35)
    hm = run_hmc_2d(5401, 2000; rho = 0.92, eps = 0.18, L = 12)
    ess_rw = ess_1d(@view rw.draws[501:end, 1])
    ess_hm = ess_1d(@view hm.draws[501:end, 1])
    @test hm.divergent == 0
    @test ess_hm > 4.0 * ess_rw
    @test isapprox(cor(@view(hm.draws[501:end, 1]), @view(hm.draws[501:end, 2])), 0.92; atol = 0.05)

    hmc_chains = [run_hmc_2d(5410 + c, 1200; rho = 0.92, eps = 0.18, L = 12).draws[201:end, 1] for c in 1:4]
    rhat_good = split_rhat(hmc_chains)
    @test rhat_good < 1.03

    # 大きすぎる leapfrog 刻み幅 (eps = 0.72, rho = 0.96) でエネルギー発散が発生する反例
    hm_bad = run_hmc_2d(5499, 400; rho = 0.96, eps = 0.72, L = 12)
    @test hm_bad.divergent > 50

    # 5. a05: 階層順序モデル (Gauss-Hermite CLMM / 非中心化HMC) と離散選択 IIA vs 混合ロジット
    logistic_a5(z::Real) = z >= 0 ? 1.0 / (1.0 + exp(-z)) : (ez = exp(z); ez / (1.0 + ez))
    function unpack_cut_a5(raw)
        c = Vector{Float64}(undef, length(raw))
        c[1] = raw[1]
        for k in 2:length(raw); c[k] = c[k - 1] + exp(raw[k]); end
        return c
    end
    function logsumexp_a5(z)
        m = maximum(z)
        return m + log(sum(exp.(z .- m)))
    end
    function gauss_hermite_std(M::Int)
        off = sqrt.(1:(M - 1))
        F = eigen(SymTridiagonal(zeros(M), off))
        return F.values, (F.vectors[1, :]).^2
    end
    nodes15, weights15 = gauss_hermite_std(15)
    @test isapprox(sum(weights15), 1.0; atol = 1e-13)
    @test isapprox(sum(weights15 .* (nodes15 .^ 2)), 1.0; atol = 1e-12)
    @test isapprox(sum(weights15 .* (nodes15 .^ 4)), 3.0; atol = 1e-11) # 標準正規の4次モーメント = 3

    function clmm_loglik_a5(theta::Vector{Float64}, subj::Vector{Int}, x::Vector{Float64}, y::Vector{Int}, K::Int)
        c = unpack_cut_a5(@view theta[1:(K - 1)])
        beta, sigma_u = theta[K], exp(theta[K + 1])
        n_subj, M = maximum(subj), length(nodes15)
        subj_ll = zeros(n_subj, M)
        for i in eachindex(subj, x, y)
            s, yi, xi = subj[i], y[i], x[i]
            for m in 1:M
                eta = beta * xi + sigma_u * nodes15[m]
                up = yi == K ? 1.0 : logistic_a5(c[yi] - eta)
                lo = yi == 1 ? 0.0 : logistic_a5(c[yi - 1] - eta)
                subj_ll[s, m] += log(max(up - lo, 1e-15))
            end
        end
        return sum(logsumexp_a5(log.(weights15) .+ @view(subj_ll[s, :])) for s in 1:n_subj)
    end

    rng_a5 = Xoshiro(5201)
    n_subj_a5, n_rep_a5 = 48, 10
    subj_a5 = repeat(1:n_subj_a5, inner = n_rep_a5)
    x_a5 = repeat(collect(range(-1.5, 1.5, length = n_rep_a5)), outer = n_subj_a5)
    u_subj_a5 = 1.80 .* randn(rng_a5, n_subj_a5)
    u_unif_a5 = clamp.(rand(rng_a5, n_subj_a5 * n_rep_a5), 1e-12, 1 - 1e-12)
    y_star_a5 = 1.40 .* x_a5 .+ u_subj_a5[subj_a5] .+ log.(u_unif_a5 ./ (1 .- u_unif_a5))
    y_a5 = [1 + count(c -> ys > c, [-1.5, 0.0, 1.5]) for ys in y_star_a5]

    # 掲載最尤推定値での周辺対数尤度がプール順序モデルより90点以上高いことを確認
    th_clmm_opt = [-1.128, log(0.524 - (-1.128)), log(2.023 - 0.524), 1.548, log(2.126)]
    ll_clmm_val = clmm_loglik_a5(th_clmm_opt, subj_a5, x_a5, y_a5, 4)
    ll_pool_val = clmm_loglik_a5([-0.79, log(0.35 + 0.79), log(1.40 - 0.35), 0.926, -30.0], subj_a5, x_a5, y_a5, 4)
    @test isapprox(ll_clmm_val, -501.91; atol = 0.05)
    @test ll_clmm_val - ll_pool_val > 95.0

    # 赤バス・青バス問題: 標準MNL(IIA, sigma=0) vs 混合ロジット(sigma=6)
    rng_choice = Xoshiro(5203)
    R_ch = 40_000
    shares_mnl = let c3 = zeros(Int, 3)
        for _ in 1:R_ch
            zt, zb = randn(rng_choice), randn(rng_choice)
            g1, g2, g3 = -log(-log(rand(rng_choice))), -log(-log(rand(rng_choice))), -log(-log(rand(rng_choice)))
            c3[argmax((g1, g2, g3))] += 1
        end
        c3 ./ R_ch
    end
    shares_mix = let c3 = zeros(Int, 3)
        for _ in 1:R_ch
            zt, zb = randn(rng_choice), randn(rng_choice)
            g1, g2, g3 = -log(-log(rand(rng_choice))), -log(-log(rand(rng_choice))), -log(-log(rand(rng_choice)))
            c3[argmax((6.0 * zt + g1, 6.0 * zb + g2, 6.0 * zb + g3))] += 1
        end
        c3 ./ R_ch
    end
    @test isapprox(shares_mnl[1], 1 / 3; atol = 0.01)
    @test shares_mix[1] > 0.45
    @test isapprox(shares_mix[2], shares_mix[3]; atol = 0.01)
end

# ============================================================
# 6. a06: コレスポンデンス分析(CA)と多重コレスポンデンス分析(MCA)
# ============================================================
@testset "a06: コレスポンデンス分析とMCA・馬蹄形反例・Procrustes整列" begin
    function simple_ca_a6(N::AbstractMatrix{<:Real})
        n = sum(N); P = N ./ n
        r, c = vec(sum(P; dims = 2)), vec(sum(P; dims = 1))
        Dr_inv, Dc_inv = Diagonal(1.0 ./ sqrt.(r)), Diagonal(1.0 ./ sqrt.(c))
        F = svd(Dr_inv * (P .- r * c') * Dc_inv)
        K = min(size(N, 1), size(N, 2)) - 1
        sv = F.S[1:K]; eig = sv .^ 2
        row_coord = Dr_inv * F.U[:, 1:K] * Diagonal(sv)
        col_coord = Dc_inv * F.V[:, 1:K] * Diagonal(sv)
        row_cos2 = (row_coord .^ 2) ./ sum(row_coord .^ 2; dims = 2)
        return (; inertia = sum(eig), chi2 = n * sum(eig), eig,
                  share = eig ./ sum(eig), row_coord, col_coord, row_cos2)
    end

    ca_tab = [48 14 8 10; 12 44 16 8; 8 18 46 18; 12 4 10 44]
    res_ca = simple_ca_a6(ca_tab)
    n_ca = sum(ca_tab); r_ca = sum(ca_tab; dims = 2); c_ca = sum(ca_tab; dims = 1)
    exact_chi2 = sum((ca_tab[i, j] - r_ca[i] * c_ca[j] / n_ca)^2 / (r_ca[i] * c_ca[j] / n_ca) for i in 1:4, j in 1:4)
    @test isapprox(res_ca.chi2, exact_chi2; atol = 1e-10)
    @test round(res_ca.inertia; digits = 4) == 0.5762
    @test round(sum(res_ca.share[1:2]); digits = 3) == 0.847

    # MCA: 指示行列 Z と Burt 行列 B = Z'Z の固有値2乗一致 & Benzécri 補正
    rng_m = Xoshiro(5601)
    f1_m, f2_m = randn(rng_m, 180), randn(rng_m, 180)
    Z_mca = zeros(Float64, 180, 15)
    for i in 1:180, q in 1:5
        v = 1.35 * (q <= 3 ? f1_m[i] : f2_m[i]) + 0.65 * randn(rng_m)
        lv = v < -0.6 ? 1 : (v < 0.6 ? 2 : 3)
        Z_mca[i, (q - 1) * 3 + lv] = 1.0
    end
    ca_Z = simple_ca_a6(Z_mca)
    ca_B = simple_ca_a6(Z_mca' * Z_mca)
    eig_z = ca_Z.eig[1:10]
    @test isapprox(sum(eig_z), 2.0; atol = 1e-12)
    @test maximum(abs.(ca_B.eig[1:10] .- (eig_z .^ 2))) < 1e-12
    benz = [lam > 0.2 ? ((5 / 4) * (lam - 0.2))^2 : 0.0 for lam in eig_z]
    @test round(sum(eig_z[1:2]) / sum(eig_z); digits = 3) == 0.412
    @test round(sum(benz[1:2]) / sum(benz); digits = 3) == 0.895

    # 1次元順序データの馬蹄形効果 (Guttman arch)
    rng_a = Xoshiro(5602)
    th_a = collect(range(-2.2, 2.2, length = 240)) .+ 0.20 .* randn(rng_a, 240)
    Z_arch = zeros(Float64, 240, 20)
    for q in 1:5, i in 1:240
        v = th_a[i] + 0.35 * randn(rng_a)
        lv = 1 + count(c -> v > c, [-1.1, 0.0, 1.1])
        Z_arch[i, (q - 1) * 4 + lv] = 1.0
    end
    ca_arch = simple_ca_a6(Z_arch)
    ax1, ax2 = ca_arch.row_coord[:, 1], ca_arch.row_coord[:, 2]
    @test round(abs(cor(th_a, ax1)); digits = 3) == 0.973
    @test round(abs(cor(ax1 .^ 2, ax2)); digits = 3) == 0.947

    # 直交 Procrustes 整列による符号反転の解消
    Y_ref = ca_Z.col_coord[:, 1:2]
    rng_b = Xoshiro(5603)
    naive_sum, aligned_sum = zeros(size(Y_ref)), zeros(size(Y_ref))
    for _ in 1:200
        Z_b = Z_mca[rand(rng_b, 1:180, 180), :]
        any(==(0.0), sum(Z_b; dims = 1)) && continue
        Y_b = simple_ca_a6(Z_b).col_coord[:, 1:2]
        naive_sum .+= Y_b
        Fp = svd(Y_b' * Y_ref)
        aligned_sum .+= Y_b * (Fp.U * Fp.Vt)
    end
    @test norm(naive_sum ./ 200 - Y_ref) / norm(Y_ref) > 0.80
    @test norm(aligned_sum ./ 200 - Y_ref) / norm(Y_ref) < 0.12
end

@testset "a07: 正則化ガウス混合EM・手動逆伝播MLP・ハイブリッドSciML/UDE" begin
    # 1. 異分散クラスタでの k-means 対 正則化EM
    rng_em = Xoshiro(5701)
    x_mix = [i <= 140 ? 0.35 * randn(rng_em) : 2.2 + 1.35 * randn(rng_em) for i in 1:400]
    c1, c2 = -0.5, 3.0
    for _ in 1:50
        c1 = mean(v for v in x_mix if abs(v - c1) <= abs(v - c2))
        c2 = mean(v for v in x_mix if abs(v - c1) > abs(v - c2))
    end
    @test round(count(v -> abs(v - c1) <= abs(v - c2), x_mix) / 400; digits = 3) == 0.585

    pk, mu, s2 = [0.5, 0.5], [-0.5, 3.0], fill(var(x_mix) / 2, 2)
    resp, ll_steps, ll_p = zeros(400, 2), Float64[], -Inf
    for _ in 1:120
        ll = 0.0
        for i in 1:400
            lps = [log(pk[k]) - 0.5 * (log(2 * pi * s2[k]) + (x_mix[i] - mu[k])^2 / s2[k]) for k in 1:2]
            m = maximum(lps); lse = m + log(sum(exp.(lps .- m))); ll += lse
            for k in 1:2; resp[i, k] = exp(lps[k] - lse); end
        end
        push!(ll_steps, ll)
        abs(ll - ll_p) < 1e-9 && break; ll_p = ll
        for k in 1:2
            nk = sum(@view resp[:, k])
            pk[k] = nk / 400; mu[k] = dot(@view(resp[:, k]), x_mix) / nk
            s2[k] = max(sum(resp[i, k] * (x_mix[i] - mu[k])^2 for i in 1:400) / nk, 1e-2)
        end
    end
    ord = sortperm(mu)
    @test all(diff(ll_steps) .>= -1e-10)
    @test round(pk[ord[1]]; digits = 3) == 0.376
    @test round.(sqrt.(s2[ord]); digits = 3) == [0.361, 1.377]

    # 2. 2層MLP手動逆伝播
    rng_nn = Xoshiro(5702)
    X_nn = randn(rng_nn, 2, 200)
    y_nn = Float64.(vec(sqrt.(sum(X_nn .^ 2; dims = 1))) .< 1.15)
    rng_w = Xoshiro(5703)
    W1, b1, w2, b2 = 0.8 .* randn(rng_w, 8, 2), zeros(8), 0.8 .* randn(rng_w, 8), 0.0
    logistic_a7(z) = z >= 0 ? 1.0 / (1.0 + exp(-z)) : exp(z) / (1.0 + exp(z))
    for _ in 1:600
        A1 = tanh.(W1 * X_nn .+ b1)
        probs = logistic_a7.(vec(w2' * A1) .+ b2)
        dz2 = (probs .- y_nn) ./ 200
        dw2, db2 = A1 * dz2, sum(dz2)
        dZ1 = (w2 * dz2') .* (1.0 .- A1 .^ 2)
        W1 .-= 0.12 .* (dZ1 * X_nn'); b1 .-= 0.12 .* vec(sum(dZ1; dims = 2))
        w2 .-= 0.12 .* dw2;           b2 -= 0.12 * db2
    end
    @test round(mean((logistic_a7.(vec(w2' * tanh.(W1 * X_nn .+ b1)) .+ b2) .>= 0.5) .== (y_nn .== 1.0)); digits = 3) == 0.97

    # 3. ハイブリッド UDE 対 純ブラックボックスNNの外挿と法則復元
    function rk4_a7(rhs, u0::Float64, ts::Vector{Float64})
        us = Vector{Float64}(undef, length(ts)); us[1] = u0
        for i in 1:(length(ts) - 1)
            t, dt, u = ts[i], ts[i + 1] - ts[i], us[i]
            k1 = rhs(u, t); k2 = rhs(u + 0.5 * dt * k1, t + 0.5 * dt)
            k3 = rhs(u + 0.5 * dt * k2, t + 0.5 * dt); k4 = rhs(u + dt * k3, t + dt)
            us[i + 1] = u + (dt / 6.0) * (k1 + 2k2 + 2k3 + k4)
        end
        return us
    end
    rng_u = Xoshiro(5704)
    ts_all = collect(0.0:0.1:12.0)
    u_ex = rk4_a7((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u - 0.45 * u^3, 1.3, ts_all)
    ts_tr = ts_all[1:61]
    u_ob = u_ex[1:61] .+ 0.03 .* randn(rng_u, 61)
    W_bb, b_bb = 1.2 .* randn(rng_u, 12), collect(range(-3.0, 3.0, length = 12))
    H_tr = tanh.(W_bb .* ts_tr' .+ b_bb)
    u_bb = vec((tanh.(W_bb .* ts_all' .+ b_bb))' * ((H_tr * H_tr' + 1e-4 * I) \ (H_tr * u_ob)))

    nn_g(u, th) = sum(th[12 + m] * tanh(th[m] * u + th[6 + m]) for m in 1:6)
    ude_res(th) = rk4_a7((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + nn_g(u, th), 1.3, ts_tr) .- u_ob
    th = vcat([0.7, -0.7, 1.1, -1.1, 1.5, -1.5], [-0.8, -0.8, 0.0, 0.0, 0.8, 0.8], zeros(6))
    for _ in 1:25
        r0 = ude_res(th); J = Matrix{Float64}(undef, 61, 18)
        for j in 1:18; tp = copy(th); tp[j] += 1e-6; J[:, j] = (ude_res(tp) .- r0) ./ 1e-6; end
        st = (J' * J + 1e-3 * I) \ (J' * r0); th .-= st; norm(st) < 1e-7 && break
    end
    u_ude = rk4_a7((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + nn_g(u, th), 1.3, ts_all)
    ug = collect(-1.2:0.1:1.3)
    @test round(sqrt(mean((u_bb[62:end] .- u_ex[62:end]).^2)); digits = 3) == 0.735
    @test round(sqrt(mean((u_ude[62:end] .- u_ex[62:end]).^2)); digits = 3) == 0.014
    @test round(sqrt(mean((nn_g.(ug, Ref(th)) .- (-0.45 .* ug .^ 3)).^2)); digits = 3) == 0.036
end

mutable struct MiniObsA08{T}
    val::T
    listeners::Vector{Function}
end
MiniObsA08(v::T) where {T} = MiniObsA08{T}(v, Function[])
function set_obs_a08!(o::MiniObsA08{T}, v::T) where {T}
    o.val = v
    for f in o.listeners
        f(v)
    end
    return v
end

@testset "a08: PPCエンベロープ・SBCランク図・較正曲線ECE・2次元位相平面・Observable" begin
    # 1. PPC エンベロープと SBC ランクヒストグラム
    let rng = Xoshiro(5801),
        y_obs = 420.0 .+ 65.0 .* exp.(0.65 .* randn(rng, 120)),
        mu_hat = mean(y_obs), sd_hat = std(y_obs),
        rep_q95 = [quantile(mu_hat .+ sd_hat .* randn(rng, 120), 0.95) for _ in 1:300],
        rep_min = [minimum(mu_hat .+ sd_hat .* randn(rng, 120)) for _ in 1:300]
        @test round(minimum(y_obs); digits = 1) == 430.9
        @test round.(quantile(rep_min, [0.025, 0.975]); digits = 1) == [256.5, 377.5]
        @test round(quantile(y_obs, 0.95); digits = 1) == 621.6
        @test round.(quantile(rep_q95, [0.025, 0.975]); digits = 1) == [588.2, 634.2]
    end

    let rng = Xoshiro(5801), R = 1000, S = 19
        ranks_cal, ranks_narrow = Int[], Int[]
        for _ in 1:R
            th = randn(rng)
            y = th + randn(rng)
            push!(ranks_cal, count(<(th), 0.5 * y .+ sqrt(0.5) .* randn(rng, S)))
            push!(ranks_narrow, count(<(th), 0.5 * y .+ (0.45 * sqrt(0.5)) .* randn(rng, S)))
        end
        @test round(count(r -> r <= 1 || r >= S - 1, ranks_cal) / R; digits = 3) == 0.211
        @test round(count(r -> r <= 1 || r >= S - 1, ranks_narrow) / R; digits = 3) == 0.562
    end

    # 2. ROC-AUC の単調変換不変性 対 較正曲線 (ECE・Brier)
    let rng = Xoshiro(5802), n = 1200, x = randn(rng, n),
        logistic(z) = 1.0 / (1.0 + exp(-z)),
        eta = -0.4 .+ 1.25 .* x,
        p_cal = logistic.(eta),
        y = Float64.(rand(rng, n) .< p_cal),
        p_over = logistic.(2.8 .* eta .+ 0.55)
        function exact_auc(yb, sc)
            pos, neg = sc[yb .== 1.0], sc[yb .== 0.0]
            return sum(vp > vn ? 1.0 : (vp == vn ? 0.5 : 0.0) for vp in pos, vn in neg) / (length(pos) * length(neg))
        end
        function calc_ece(yb, pr; K = 10)
            ord, bs = sortperm(pr), div(length(yb), K)
            return sum(let idx = ord[((b - 1) * bs + 1):(b == K ? length(yb) : b * bs)]
                (length(idx) / length(yb)) * abs(mean(pr[idx]) - mean(yb[idx]))
            end for b in 1:K)
        end
        @test round(exact_auc(y, p_cal); digits = 4) == 0.7912
        @test abs(exact_auc(y, p_cal) - exact_auc(y, p_over)) == 0.0
        @test round(mean((p_cal .- y).^2); digits = 4) == 0.184
        @test round(mean((p_over .- y).^2); digits = 4) == 0.2056
        @test round(calc_ece(y, p_cal); digits = 4) == 0.0357
        @test round(calc_ece(y, p_over); digits = 4) == 0.14
    end

    # 3. 2次元双安定力学系の位相平面・鞍点固有値・セパラトリクス分岐
    let rhs2d(u1, u2) = (-u1 + 1.6 * tanh(u1) - 0.9 * tanh(u2),
                         -u2 + 1.6 * tanh(u2) - 0.9 * tanh(u1))
        function rk4_2d(u0::Tuple{Float64, Float64}, dt::Float64, steps::Int)
            u1, u2 = u0
            for _ in 1:steps
                k1_1, k1_2 = rhs2d(u1, u2)
                k2_1, k2_2 = rhs2d(u1 + 0.5 * dt * k1_1, u2 + 0.5 * dt * k1_2)
                k3_1, k3_2 = rhs2d(u1 + 0.5 * dt * k2_1, u2 + 0.5 * dt * k2_2)
                k4_1, k4_2 = rhs2d(u1 + dt * k3_1, u2 + dt * k3_2)
                u1 += (dt / 6.0) * (k1_1 + 2k2_1 + 2k3_1 + k4_1)
                u2 += (dt / 6.0) * (k1_2 + 2k2_2 + 2k3_2 + k4_2)
            end
            return (u1, u2)
        end
        J0 = [0.6 -0.9; -0.9 0.6]
        end_a = rk4_2d((0.12, 0.08), 0.05, 400)
        end_b = rk4_2d((0.08, 0.12), 0.05, 400)
        s1, s2 = 1.0 - tanh(end_a[1])^2, 1.0 - tanh(end_a[2])^2
        Ja = [-1.0 + 1.6 * s1  -0.9 * s2; -0.9 * s1  -1.0 + 1.6 * s2]
        @test round.(sort(eigvals(J0)); digits = 3) == [-0.3, 1.5]
        @test round.(end_a; digits = 3) == (2.464, -2.464)
        @test round.(end_b; digits = 3) == (-2.464, 2.464)
        @test round.(sort(real.(eigvals(Ja))); digits = 3) == [-0.98, -0.929]
    end

    # 4. Observable push 型リスナー伝播と事前確保バッファ更新
    let drift = MiniObsA08(0.4), ts = collect(0.0:0.5:4.0),
        traj_buf = similar(ts), updates = Ref(0)
        on_change = v -> (updates[] += 1; @. traj_buf = v * ts)
        push!(drift.listeners, on_change)
        on_change(drift.val)
        alloc_bytes = @allocated set_obs_a08!(drift, 1.25)
        @test updates[] == 2
        @test traj_buf[end] == 5.0
        @test alloc_bytes <= 64
    end
end

println("ADVANCED_COMP_TRACK_CHECK_PASS")
