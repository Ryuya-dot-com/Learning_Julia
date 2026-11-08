### A Pluto.jl notebook ###
# v1.0.3

using Markdown
using InteractiveUtils

# ╔═╡ 8b1d0101-0000-11f1-9a01-000000000001
begin
    using Random
    using Statistics
    using LinearAlgebra
end

# ╔═╡ 8b1d0102-0000-11f1-9a01-000000000002
md"""
# NB8: 上級編（動的モデル・MCMC・計算統計）の演習ノート

時間に沿って状態が変化する**常微分方程式（RK4）・ドリフト拡散モデル（DDM）・状態空間カルマンフィルタ**、そして勾配を使って事後分布を探索する**ハミルトニアンモンテカルロ（HMC）**や**階層順序・混合ロジットモデル**、**特異値分解によるコレスポンデンス分析（CA・MCA）**、**正則化EMとハイブリッド微分方程式（SciML / UDE）**、**較正曲線・位相平面の診断可視化**を標準ライブラリだけで実装し、解析解や基準実装と照合します。

先にWeb教材の「微分方程式と動的システム」「確率過程と反応時間モデル（DDM）」「状態空間モデルとカルマンフィルタ」「MCMCとハミルトニアンモンテカルロの原理」「階層順序モデルと離散選択・IIA」「コレスポンデンス分析と多重コレスポンデンス分析（MCA）」「潜在クラスタEM・逆伝播と科学機械学習（SciML）」「計算統計・動的モデルの診断可視化：事後予測・較正・位相平面」を読むことを勧めます。

`# TODO` のセルを書きかえ、下の判定セルが `✅` になることを確認してください。
"""

# ╔═╡ 8b1d0103-0000-11f1-9a01-000000000003
md"""
## 課題1: 4次Runge–Kutta法（RK4）の精度を陽的Euler法と比較する

学習曲線 `du/dt = 0.8 * (1.0 - u)`（初期値 `u0 = 0.2`）を `dt = 0.5` で `10` ステップ（`t = 5.0` まで）解きます。下のセルには解析解 `exact_val_nb8` と陽的Euler法の値 `euler_val_nb8` が用意されています。

4次Runge–Kutta法で `t = 5.0` の数値解 `rk4_val` を求め、次の NamedTuple を `rk4_check` に入れましょう（`euler_val_nb8` と同じく `let u = 0.2, t = 0.0, dt = 0.5 ... end` や関数を使うとスコープが明快です）。

```julia
(rk4_val = RK4の数値解,
 euler_err = abs(euler_val_nb8 - exact_val_nb8),
 rk4_err = abs(rk4_val - exact_val_nb8))
```
"""

# ╔═╡ 8b1d0104-0000-11f1-9a01-000000000004
begin
    f_learn_nb8(u, _t) = 0.8 * (1.0 - u)
    exact_val_nb8 = 1.0 - (1.0 - 0.2) * exp(-0.8 * 5.0)
    euler_val_nb8 = let u = 0.2, t = 0.0, dt = 0.5
        for _ in 1:10
            u += dt * f_learn_nb8(u, t)
            t += dt
        end
        u
    end
end

# ╔═╡ 8b1d0105-0000-11f1-9a01-000000000005
rk4_check = missing # TODO: 4次Runge-Kutta法を10ステップ回し、(rk4_val = ..., euler_err = ..., rk4_err = ...) を返す

# ╔═╡ 8b1d0106-0000-11f1-9a01-000000000006
if rk4_check === missing
    md"⏳ `k1, k2, k3, k4` の重み付き平均 `(dt / 6) * (k1 + 2k2 + 2k3 + k4)` で10ステップ進め、誤差を比べます。"
elseif rk4_check isa NamedTuple &&
       all(k -> hasproperty(rk4_check, k), (:rk4_val, :euler_err, :rk4_err)) &&
       all(k -> (v = getproperty(rk4_check, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:rk4_val, :euler_err, :rk4_err))
    let expected_rk4 = let u = 0.2, t = 0.0, dt = 0.5
            for _ in 1:10
                k1 = f_learn_nb8(u, t)
                k2 = f_learn_nb8(u + 0.5 * dt * k1, t + 0.5 * dt)
                k3 = f_learn_nb8(u + 0.5 * dt * k2, t + 0.5 * dt)
                k4 = f_learn_nb8(u + dt * k3, t + dt)
                u += (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
                t += dt
            end
            u
        end
        if isapprox(rk4_check.rk4_val, expected_rk4; atol = 1e-12) &&
           isapprox(rk4_check.euler_err, abs(euler_val_nb8 - exact_val_nb8); atol = 1e-12) &&
           isapprox(rk4_check.rk4_err, abs(expected_rk4 - exact_val_nb8); atol = 1e-12)
            md"✅ **正解!** 同じ `dt = 0.5` でも、RK4の誤差はEuler法の500分の1以下に縮小しました。"
        else
            md"🤔 `k1, k2, k3, k4` の係数（`1, 2, 2, 1` を `6` で割る）と、`u0 = 0.2, dt = 0.5, 10ステップ` を確認してください。"
        end
    end
else
    md"🤔 `(rk4_val = 数値, euler_err = 数値, rk4_err = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 8b1d0107-0000-11f1-9a01-000000000007
md"""
## 課題2: Euler–Maruyama法でDDMの「速さと正確さのトレードオフ」を再現する

ドリフト率 `v = 0.9`、相対開始点 `z_rel = 0.5`、非決定時間 `ter = 0.28` 秒、刻み幅 `dt = 0.001` 秒（最大 `20_000` ステップ）で、各条件 `2000` 試行を `Xoshiro(5201)` からシミュレーションします。

1ステップの更新は `x += v * dt + sqrt(dt) * randn(rng)` とし、`0.0 < x < a` の間ループして `x >= a` なら正答、反応時間は `(ter + steps * dt) * 1000.0`（ms）とします。境界 `a = 0.9`（速度重視）と `a = 1.6`（慎重さ重視）をそれぞれシード `5201` から走らせ、次の NamedTuple を `ddm_tradeoff` に入れましょう。

```julia
(fast_acc = a=0.9の正答率,
 cautious_acc = a=1.6の正答率,
 fast_rt_ms = a=0.9の平均反応時間ms,
 cautious_rt_ms = a=1.6の平均反応時間ms)
```
"""

# ╔═╡ 8b1d0108-0000-11f1-9a01-000000000008
begin
    ddm_upper_prob_nb8(v::Float64, a::Float64; z_rel = 0.5) =
        abs(v) < 1e-12 ? z_rel : (1.0 - exp(-2.0 * v * a * z_rel)) / (1.0 - exp(-2.0 * v * a))

    function ref_ddm_nb8(seed::Int, a::Float64)
        rng = Xoshiro(seed)
        v, z_rel, ter, dt = 0.9, 0.5, 0.28, 0.001
        sd = sqrt(dt)
        acc_cnt = 0
        rt_sum = 0.0
        for _ in 1:2000
            x = a * z_rel
            steps = 0
            while 0.0 < x < a && steps < 20_000
                x += v * dt + sd * randn(rng)
                steps += 1
            end
            acc_cnt += (x >= a)
            rt_sum += 1000.0 * (ter + steps * dt)
        end
        return (acc = acc_cnt / 2000, rt_ms = rt_sum / 2000)
    end
end

# ╔═╡ 8b1d0109-0000-11f1-9a01-000000000009
ddm_tradeoff = missing # TODO: a = 0.9 と a = 1.6 をそれぞれ Xoshiro(5201) で 2000 試行生成し、4要素の NamedTuple を返す

# ╔═╡ 8b1d0110-0000-11f1-9a01-000000000010
if ddm_tradeoff === missing
    md"⏳ `sqrt(dt) * randn(rng)` のスケーリングに注意して `a = 0.9` と `a = 1.6` を比較します。"
elseif ddm_tradeoff isa NamedTuple &&
       all(k -> hasproperty(ddm_tradeoff, k), (:fast_acc, :cautious_acc, :fast_rt_ms, :cautious_rt_ms)) &&
       all(k -> (v = getproperty(ddm_tradeoff, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:fast_acc, :cautious_acc, :fast_rt_ms, :cautious_rt_ms))
    let r_fast = ref_ddm_nb8(5201, 0.9),
        r_caut = ref_ddm_nb8(5201, 1.6)
        if isapprox(ddm_tradeoff.fast_acc, r_fast.acc; atol = 1e-12) &&
           isapprox(ddm_tradeoff.cautious_acc, r_caut.acc; atol = 1e-12) &&
           isapprox(ddm_tradeoff.fast_rt_ms, r_fast.rt_ms; atol = 1e-9) &&
           isapprox(ddm_tradeoff.cautious_rt_ms, r_caut.rt_ms; atol = 1e-9)
            md"✅ **正解!** 同じドリフト率 `v = 0.9` のまま境界 `a` を広げるだけで、正答率が上がり平均反応時間が伸びるトレードオフを再現できました。"
        elseif ddm_tradeoff.fast_acc > 0.98 && ddm_tradeoff.cautious_acc > 0.98
            md"🤔 正答率が1.0近くに張り付いています。`randn(rng)` に `dt` ではなく `sqrt(dt)` を掛けているか確認してください。"
        else
            md"🤔 両条件とも `Xoshiro(5201)` から `2000` 試行を回し、反応時間をミリ秒（`* 1000.0`）で表しているか確認してください。"
        end
    end
else
    md"🤔 `(fast_acc = ..., cautious_acc = ..., fast_rt_ms = ..., cautious_rt_ms = ...)` の形にしてください。"
end

# ╔═╡ 8b1d0111-0000-11f1-9a01-000000000011
md"""
## 課題3: 1次元カルマンフィルタで潜在状態の追跡と周辺対数尤度を計算する

80時点の真の潜在状態 `x_true_nb8` とノイズ付き観測 `y_obs_nb8`（`phi = 0.95, q = 0.35, r = 1.10`）を用意しました。初期状態 `x0 = 0.0, P0 = 10.0` から1次元カルマンフィルタを回し、次の NamedTuple を `kalman_summary` に入れましょう。

```julia
(obs_rmse = sqrt(mean((y_obs_nb8 .- x_true_nb8) .^ 2)),
 filt_rmse = sqrt(mean((x_filt .- x_true_nb8) .^ 2)),
 loglik = 予測誤差分解による周辺対数尤度)
```
"""

# ╔═╡ 8b1d0112-0000-11f1-9a01-000000000012
begin
    x_true_nb8, y_obs_nb8 = let rng = Xoshiro(5301), T = 80
        xt = Vector{Float64}(undef, T)
        yo = Vector{Float64}(undef, T)
        xp = 0.0
        for t in 1:T
            xc = 0.95 * xp + 0.35 * randn(rng)
            xt[t] = xc
            yo[t] = xc + 1.10 * randn(rng)
            xp = xc
        end
        (xt, yo)
    end
end

# ╔═╡ 8b1d0113-0000-11f1-9a01-000000000013
kalman_summary = missing # TODO: phi=0.95, q=0.35, r=1.10, x0=0.0, P0=10.0 でフィルタを回し、(obs_rmse = ..., filt_rmse = ..., loglik = ...) を返す

# ╔═╡ 8b1d0114-0000-11f1-9a01-000000000014
if kalman_summary === missing
    md"⏳ カルマンゲイン `K = P_pred / F` による状態更新と、`-0.5 * (log(2π * F) + innov^2 / F)` の対数尤度和を計算します。"
elseif kalman_summary isa NamedTuple &&
       all(k -> hasproperty(kalman_summary, k), (:obs_rmse, :filt_rmse, :loglik)) &&
       all(k -> (v = getproperty(kalman_summary, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:obs_rmse, :filt_rmse, :loglik))
    let ref_kf = let xp = 0.0, Pp = 10.0, q2 = 0.35^2, r2 = 1.10^2, ll = 0.0
            xf = similar(y_obs_nb8)
            for t in eachindex(y_obs_nb8)
                x_pred = 0.95 * xp
                P_pred = 0.95^2 * Pp + q2
                innov = y_obs_nb8[t] - x_pred
                F = P_pred + r2
                K = P_pred / F
                xp = x_pred + K * innov
                Pp = (1.0 - K) * P_pred
                ll += -0.5 * (log(2.0 * pi * F) + innov^2 / F)
                xf[t] = xp
            end
            (obs_rmse = sqrt(mean((y_obs_nb8 .- x_true_nb8) .^ 2)),
             filt_rmse = sqrt(mean((xf .- x_true_nb8) .^ 2)),
             loglik = ll)
        end
        if isapprox(kalman_summary.obs_rmse, ref_kf.obs_rmse; atol = 1e-10) &&
           isapprox(kalman_summary.filt_rmse, ref_kf.filt_rmse; atol = 1e-10) &&
           isapprox(kalman_summary.loglik, ref_kf.loglik; atol = 1e-9)
            md"✅ **正解!** 測定誤差をフィルタリングで抑えてRMSEをほぼ半減させ、周辺対数尤度も正確に求まりました。"
        else
            md"🤔 初期値 `x0 = 0.0, P0 = 10.0`、`phi = 0.95, q = 0.35, r = 1.10`、対数尤度の `2π * F` 項を確認してください。"
        end
    end
else
    md"🤔 `(obs_rmse = 数値, filt_rmse = 数値, loglik = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 8b1d0115-0000-11f1-9a01-000000000015
md"""
## 課題4: 強い相関を持つ2次元事後分布で Leapfrog HMC と RWMH の ESS を比較する

相関係数 `rho = 0.92` の2次元正規対数密度と勾配 `corr_norm_nb8(q1, q2, rho)`、有効サンプルサイズ `ess_1d_nb8(x)`、そしてランダムウォークMHの結果 `rwmh_res_nb8`（`Xoshiro(5401)`、`1200` サンプル、前半 `300` ウォームアップ除外後のESS）を用意しました。

同じ初期点 `(-1.5, 1.5)`・シード `Xoshiro(5401)`・`1200` サンプル・`eps = 0.18`・`L = 12` で Leapfrog HMC を実装し、後半 `301:1200` の第1成分 `draws[301:1200, 1]` のESSを求めて次の NamedTuple を `hmc_comparison` に入れましょう。

```julia
(hmc_acc = HMC全体の受理率,
 rwmh_ess = rwmh_res_nb8.ess,
 hmc_ess = ess_1d_nb8(@view hmc_draws[301:1200, 1]),
 divergent = 発散件数)
```
"""

# ╔═╡ 8b1d0116-0000-11f1-9a01-000000000016
begin
    function corr_norm_nb8(q1::Float64, q2::Float64, rho::Float64)
        denom = 1.0 - rho^2
        logp = -0.5 * (q1^2 - 2.0 * rho * q1 * q2 + q2^2) / denom
        g1 = -(q1 - rho * q2) / denom
        g2 = -(q2 - rho * q1) / denom
        return (logp = logp, g1 = g1, g2 = g2)
    end

    function ess_1d_nb8(x::AbstractVector{<:Real}; max_lag = 80)
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

    rwmh_res_nb8 = let rng = Xoshiro(5401), ndraws = 1200, rho = 0.92, step_sd = 0.35
        draws = Matrix{Float64}(undef, ndraws, 2)
        q1, q2 = -1.5, 1.5
        lp = corr_norm_nb8(q1, q2, rho).logp
        acc = 0
        for i in 1:ndraws
            p1, p2 = q1 + step_sd * randn(rng), q2 + step_sd * randn(rng)
            lp_p = corr_norm_nb8(p1, p2, rho).logp
            if log(rand(rng)) < lp_p - lp
                q1, q2, lp = p1, p2, lp_p
                acc += 1
            end
            draws[i, 1], draws[i, 2] = q1, q2
        end
        (acc = acc / ndraws, ess = ess_1d_nb8(@view draws[301:1200, 1]))
    end
end

# ╔═╡ 8b1d0117-0000-11f1-9a01-000000000017
hmc_comparison = missing # TODO: Xoshiro(5401), ndraws=1200, rho=0.92, eps=0.18, L=12 で Leapfrog HMC を実行

# ╔═╡ 8b1d0118-0000-11f1-9a01-000000000018
if hmc_comparison === missing
    md"⏳ Leapfrog積分（運動量半歩 → 位置1歩 → 運動量半歩）でHMCを走らせ、RWMHとESSを比較します。"
elseif hmc_comparison isa NamedTuple &&
       all(k -> hasproperty(hmc_comparison, k), (:hmc_acc, :rwmh_ess, :hmc_ess, :divergent)) &&
       all(k -> (v = getproperty(hmc_comparison, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:hmc_acc, :rwmh_ess, :hmc_ess)) &&
       hmc_comparison.divergent isa Integer && !(hmc_comparison.divergent isa Bool)
    let ref_hmc = let rng = Xoshiro(5401), ndraws = 1200, rho = 0.92, eps = 0.18, L = 12
            draws = Matrix{Float64}(undef, ndraws, 2)
            q1, q2 = -1.5, 1.5
            cur = corr_norm_nb8(q1, q2, rho)
            acc, div = 0, 0
            for i in 1:ndraws
                r1, r2 = randn(rng), randn(rng)
                H0 = -cur.logp + 0.5 * (r1^2 + r2^2)
                pq1, pq2 = q1, q2
                pr1, pr2 = r1 + 0.5 * eps * cur.g1, r2 + 0.5 * eps * cur.g2
                st = cur
                for s in 1:L
                    pq1 += eps * pr1
                    pq2 += eps * pr2
                    st = corr_norm_nb8(pq1, pq2, rho)
                    if s < L
                        pr1 += eps * st.g1
                        pr2 += eps * st.g2
                    end
                end
                pr1 += 0.5 * eps * st.g1
                pr2 += 0.5 * eps * st.g2
                dH = (-st.logp + 0.5 * (pr1^2 + pr2^2)) - H0
                if !isfinite(dH) || dH > 100.0
                    div += 1
                elseif log(rand(rng)) < -dH
                    q1, q2, cur = pq1, pq2, st
                    acc += 1
                end
                draws[i, 1], draws[i, 2] = q1, q2
            end
            (acc = acc / ndraws, ess = ess_1d_nb8(@view draws[301:1200, 1]), div = div)
        end
        if hmc_comparison.divergent == 0 &&
           isapprox(hmc_comparison.rwmh_ess, rwmh_res_nb8.ess; atol = 1e-9) &&
           isapprox(hmc_comparison.hmc_acc, ref_hmc.acc; atol = 1e-12) &&
           isapprox(hmc_comparison.hmc_ess, ref_hmc.ess; atol = 1e-9)
            md"✅ **正解!** 発散ゼロのまま高い受理率を保ち、RWMHより桁違いに大きい有効サンプルサイズ（ESS）が得られることを確認できました。"
        else
            md"🤔 運動量乱数 `r1, r2 = randn(rng), randn(rng)`、Leapfrogの半ステップ・全ステップの順序、および `log(rand(rng)) < -delta_H` の受理条件を確認してください。"
        end
    end
else
    md"🤔 `(hmc_acc = 数値, rwmh_ess = 数値, hmc_ess = 数値, divergent = 整数)` の NamedTuple を返してください。"
end

# ╔═╡ 8b1d011a-0000-11f1-9a01-00000000001a
md"""
## 課題5: Gauss–Hermite求積による順序混合モデル（CLMM）周辺対数尤度と混合ロジットの選択確率

`MixedModels.jl` が対応していない反復Likertデータ（48人×10試行、4段階順序応答 `y_ord_nb8`）と、赤バス・青バス問題の混合ロジットを **15点Gauss–Hermite求積法** で計算します。

1. Golub–Welsch法 `F = eigen(SymTridiagonal(zeros(15), sqrt.(1:14)))` で標準正規分布に対するノード `nodes = F.values` と重み `weights = (F.vectors[1, :]).^2` を求め、2次モーメント `gh_var = sum(weights .* (nodes .^ 2))` が `1.0` になることを確かめる
2. パラメータ `c_clmm_nb8, beta_clmm_nb8, sigma_clmm_nb8` において、各参加者 `s`・各ノード `m` の対数尤度和 `subj_ll[s, m]` を集計し、各参加者の `logsumexp_nb8(log.(weights) .+ subj_ll[s, :])` を全48人分足し合わせた周辺対数尤度 `clmm_ll` を求める（1試行の条件付き確率は `eta = beta * x + sigma * nodes[m]` として `up = (y == 4 ? 1.0 : logistic_nb8(c[y] - eta))`, `lo = (y == 1 ? 0.0 : logistic_nb8(c[y - 1] - eta))` の差 `max(up - lo, 1e-15)`）
3. 電車・赤バス・青バスの3択において、Gumbel誤差を積分消去した条件付き電車選択確率は `P(train | zt, zb) = 1 / (1 + 2 * exp(sigma * (zb - zt)))` です。`sigma = 0.0`（標準多項ロジット・IIA）での電車シェア `iia_train = 1 / 3` と、`sigma = 6.0` で `(zt, zb)` を `15 × 15` 点の重み `weights[a] * weights[b]` で数値積分した混合ロジットの電車シェア `mixed_train` を求める

次の NamedTuple を `clmm_choice_summary` に入れましょう。

```julia
(gh_var = 求積による標準正規の分散,
 clmm_ll = 48人全体のCLMM周辺対数尤度,
 iia_train = IIAでの電車選択確率,
 mixed_train = 混合ロジット(sigma=6.0)での電車選択確率)
```
"""

# ╔═╡ 8b1d011b-0000-11f1-9a01-00000000001b
begin
    logistic_nb8(z::Real) = z >= 0 ? 1.0 / (1.0 + exp(-z)) : (ez = exp(z); ez / (1.0 + ez))
    function logsumexp_nb8(v::AbstractVector{<:Real})
        m = maximum(v)
        s = 0.0
        for x in v
            s += exp(x - m)
        end
        return m + log(s)
    end

    subj_nb8, x_ord_nb8, y_ord_nb8 = let rng = Xoshiro(5201), n_subj = 48, n_rep = 10
        sb = repeat(1:n_subj, inner = n_rep)
        xw = repeat(collect(range(-1.5, 1.5, length = n_rep)), outer = n_subj)
        tc = [-1.5, 0.0, 1.5]
        us = 1.80 .* randn(rng, n_subj)
        uu = clamp.(rand(rng, n_subj * n_rep), 1e-12, 1.0 - 1e-12)
        ys = 1.40 .* xw .+ us[sb] .+ log.(uu ./ (1.0 .- uu))
        yo = [1 + count(c -> v > c, tc) for v in ys]
        (sb, xw, yo)
    end

    c_clmm_nb8 = [-1.128, 0.524, 2.023]
    beta_clmm_nb8 = 1.548
    sigma_clmm_nb8 = 2.126
end

# ╔═╡ 8b1d011c-0000-11f1-9a01-00000000001c
clmm_choice_summary = missing # TODO: 15点Gauss-Hermite求積で (gh_var = ..., clmm_ll = ..., iia_train = ..., mixed_train = ...) を計算

# ╔═╡ 8b1d011d-0000-11f1-9a01-00000000001d
if clmm_choice_summary === missing
    md"⏳ `SymTridiagonal(zeros(15), sqrt.(1:14))` の固有値分解から求積ノード・重みを作り、CLMM周辺対数尤度と混合ロジット選択確率を求めます。"
elseif clmm_choice_summary isa NamedTuple &&
       all(k -> hasproperty(clmm_choice_summary, k), (:gh_var, :clmm_ll, :iia_train, :mixed_train)) &&
       all(k -> (v = getproperty(clmm_choice_summary, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:gh_var, :clmm_ll, :iia_train, :mixed_train))
    let F_ref = eigen(SymTridiagonal(zeros(15), sqrt.(1:14))),
        nd_ref = F_ref.values,
        wt_ref = (F_ref.vectors[1, :]).^2,
        ref_ll = let sll = zeros(48, 15)
            for i in eachindex(subj_nb8, x_ord_nb8, y_ord_nb8)
                s, xi, yi = subj_nb8[i], x_ord_nb8[i], y_ord_nb8[i]
                for m in 1:15
                    eta = beta_clmm_nb8 * xi + sigma_clmm_nb8 * nd_ref[m]
                    up = yi == 4 ? 1.0 : logistic_nb8(c_clmm_nb8[yi] - eta)
                    lo = yi == 1 ? 0.0 : logistic_nb8(c_clmm_nb8[yi - 1] - eta)
                    sll[s, m] += log(max(up - lo, 1e-15))
                end
            end
            sum(logsumexp_nb8(log.(wt_ref) .+ @view sll[s, :]) for s in 1:48)
        end,
        ref_mix = sum(wt_ref[a] * wt_ref[b] / (1.0 + 2.0 * exp(6.0 * (nd_ref[b] - nd_ref[a])))
                      for a in 1:15, b in 1:15)
        if isapprox(clmm_choice_summary.gh_var, 1.0; atol = 1e-12) &&
           isapprox(clmm_choice_summary.clmm_ll, ref_ll; atol = 1e-9) &&
           isapprox(clmm_choice_summary.iia_train, 1.0 / 3.0; atol = 1e-12) &&
           isapprox(clmm_choice_summary.mixed_train, ref_mix; atol = 1e-9) &&
           clmm_choice_summary.mixed_train > 0.45
            md"✅ **正解!** 15点Gauss–Hermite求積で反復順序データの周辺対数尤度 `-501.91` を高速・厳密に評価し、さらにバス共有のランダム効用を入れることで電車シェアが `0.333`（IIA）から約 `0.47` へ保たれることも確認できました。"
        else
            md"🤔 `weights = (F.vectors[1, :]).^2`、参加者ごとの `log.(weights) .+ subj_ll[s, :]` に対する `logsumexp_nb8`、および `15 × 15` 格子での `weights[a] * weights[b] / (1 + 2 * exp(6.0 * (nodes[b] - nodes[a])))` の和を確認してください。"
        end
    end
else
    md"🤔 `(gh_var = 数値, clmm_ll = 数値, iia_train = 数値, mixed_train = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 8b1d011e-0000-11f1-9a01-00000000001e
md"""
## 課題6: 特異値分解（`svd`）によるコレスポンデンス分析（CA）と多重コレスポンデンス分析（MCA）

`LinearAlgebra` の `svd` を使って、「総慣性 `Σ σ_k²` が `χ² / n` に一致する」ことと、MCAのBurt行列・Benzécri慣性補正を確認します。

1. `4 × 4` 分割表 `ca_tab_nb8`（総度数 `n = 400`）に対して、標準化残差行列 `S = Diagonal(1 ./ sqrt.(r)) * (P .- r * c') * Diagonal(1 ./ sqrt.(c))` の `svd(S)` から総慣性 `ca_inertia = sum(F.S[1:3] .^ 2)` と `ca_chi2 = n * ca_inertia` を求める
2. `180 × 15` の指示行列 `Z_mca_nb8`（`Q = 5` 項目×各3水準）に対して、同じ手順で `K = 15 - 5 = 10` 個の主慣性 `eig` を求め、Burt行列 `B = Z_mca_nb8' * Z_mca_nb8` の上位10主慣性との最大絶対差 `burt_eig_gap = maximum(abs.(eig_B[1:10] .- eig .^ 2))` を確認する
3. `eig` の上位2軸の素の寄与率 `raw_2d = sum(eig[1:2]) / sum(eig)` と、閾値 `1 / Q = 0.2` を超える固有値に対する Benzécri 修正固有値 `benz[k] = ((Q / (Q - 1)) * (eig[k] - 1 / Q))^2` の上位2軸寄与率 `benz_2d = sum(benz[1:2]) / sum(benz)` を求める

次の NamedTuple を `ca_mca_summary` に入れましょう。

```julia
(ca_chi2 = CAの総慣性×nから復元したχ²,
 burt_eig_gap = Burt固有値と指示行列固有値2乗の最大差,
 raw_2d = MCA上位2軸の素の慣性率,
 benz_2d = MCA上位2軸のBenzécri修正慣性率)
```
"""

# ╔═╡ 8b1d011f-0000-11f1-9a01-00000000001f
begin
    ca_tab_nb8 = [48 14 8 10; 12 44 16 8; 8 18 46 18; 12 4 10 44]
    Z_mca_nb8 = let rng = Xoshiro(5601), f1 = randn(rng, 180), f2 = randn(rng, 180)
        Z = zeros(Float64, 180, 15)
        for i in 1:180, q in 1:5
            v = 1.35 * (q <= 3 ? f1[i] : f2[i]) + 0.65 * randn(rng)
            lv = v < -0.6 ? 1 : (v < 0.6 ? 2 : 3)
            Z[i, (q - 1) * 3 + lv] = 1.0
        end
        Z
    end
end

# ╔═╡ 8b1d0120-0000-11f1-9a01-000000000020
ca_mca_summary = missing # TODO: svd による CA・MCA を実装し、(ca_chi2 = ..., burt_eig_gap = ..., raw_2d = ..., benz_2d = ...) を返す

# ╔═╡ 8b1d0121-0000-11f1-9a01-000000000021
if ca_mca_summary === missing
    md"⏳ 標準化残差行列の `svd` から `χ²` の復元、Burt行列の固有値2乗関係、Benzécri修正慣性率を計算します。"
elseif ca_mca_summary isa NamedTuple &&
       all(k -> hasproperty(ca_mca_summary, k), (:ca_chi2, :burt_eig_gap, :raw_2d, :benz_2d)) &&
       all(k -> (v = getproperty(ca_mca_summary, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:ca_chi2, :burt_eig_gap, :raw_2d, :benz_2d))
    let ca_eig_fn(M) = begin
            P = M ./ sum(M)
            r, c = vec(sum(P; dims = 2)), vec(sum(P; dims = 1))
            S = Diagonal(1.0 ./ sqrt.(r)) * (P .- r * c') * Diagonal(1.0 ./ sqrt.(c))
            svd(S).S .^ 2
        end,
        ref_chi2 = sum(ca_tab_nb8) * sum(ca_eig_fn(ca_tab_nb8)[1:3]),
        ez = ca_eig_fn(Z_mca_nb8)[1:10],
        eb = ca_eig_fn(Z_mca_nb8' * Z_mca_nb8)[1:10],
        benz = [lam > 0.2 ? ((5.0 / 4.0) * (lam - 0.2))^2 : 0.0 for lam in ez]
        if isapprox(ca_mca_summary.ca_chi2, ref_chi2; atol = 1e-9) &&
           ca_mca_summary.burt_eig_gap >= 0.0 && ca_mca_summary.burt_eig_gap < 1e-12 &&
           isapprox(ca_mca_summary.raw_2d, sum(ez[1:2]) / sum(ez); atol = 1e-10) &&
           isapprox(ca_mca_summary.benz_2d, sum(benz[1:2]) / sum(benz); atol = 1e-10)
            md"✅ **正解!** `svd` 1回で `χ² = 230.48` が完全に直交分解され、MCAでは素の2軸寄与率 `41.2%` が Benzécri 補正で `89.5%` の実質2因子構造を表すことも確認できました。"
        else
            md"🤔 `P = M ./ sum(M)` の標準化残差 `Diagonal(1 ./ sqrt.(r)) * (P .- r * c') * Diagonal(1 ./ sqrt.(c))` と、`lam > 1/5` に対する `((5/4) * (lam - 0.2))^2` を確認してください。"
        end
    end
else
    md"🤔 `(ca_chi2 = 数値, burt_eig_gap = 数値, raw_2d = 数値, benz_2d = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 8b1d0122-0000-11f1-9a01-000000000022
md"""
## 課題7: 正則化ガウス混合EMと科学機械学習（SciML / UDE）の外挿・法則復元

異分散クラスタのEM推定と、既知の微分方程式にニューラルネット項を埋め込むハイブリッドUDEを検証します。

1. 異分散混合データ `x_mix_nb8`（真の第1クラスタ比率 `0.35`）に対し、初期平均 `[-0.5, 3.0]`・等重み `[0.5, 0.5]`・初期分散 `fill(var(x_mix_nb8)/2, 2)`・分散下限 `var_floor = 1e-2` の正則化EMアルゴリズム（最大120反復、対数尤度変化 `< 1e-9` で停止）を回し、平均が小さい側のクラスタ比率 `em_share1` を求める
2. 時刻列 `ts_ude_nb8`（`0.0:0.1:12.0`、前半 `1:61` が訓練区間、後半 `62:121` が未知の外挿区間）において、純ブラックボックス予測 `u_bb_nb8` の外挿RMSE `bb_extrap_rmse` と、既知線形項 `0.9 * cos(0.8 * t) - 0.30 * u` に学習済みNN項 `nn_g_nb8(u, th_ude_nb8)` を足して `sim_rk4_nb8` で積分したUDE軌道の外挿RMSE `ude_extrap_rmse`、および状態格子 `u_grid_nb8 = collect(-1.2:0.1:1.3)` 上での真の非線形法則 `-0.45 .* (u_grid_nb8 .^ 3)` との復元RMSE `g_rmse` を計算する

次の NamedTuple を `ude_em_summary` に入れましょう。

```julia
(em_share1 = EM法が推定した狭分散クラスタの混合比率,
 bb_extrap_rmse = 純ブラックボックスNNの外挿区間RMSE,
 ude_extrap_rmse = ハイブリッドUDEの外挿区間RMSE,
 g_rmse = 未知非線形項 g(u) = -0.45u³ の復元RMSE)
```
"""

# ╔═╡ 8b1d0123-0000-11f1-9a01-000000000023
begin
    x_mix_nb8 = let rng = Xoshiro(5701)
        [i <= 140 ? 0.35 * randn(rng) : 2.2 + 1.35 * randn(rng) for i in 1:400]
    end
    function sim_rk4_nb8(rhs, u0::Float64, ts::Vector{Float64})
        us = Vector{Float64}(undef, length(ts))
        us[1] = u0
        for i in 1:(length(ts) - 1)
            t, dt, u = ts[i], ts[i + 1] - ts[i], us[i]
            k1 = rhs(u, t)
            k2 = rhs(u + 0.5 * dt * k1, t + 0.5 * dt)
            k3 = rhs(u + 0.5 * dt * k2, t + 0.5 * dt)
            k4 = rhs(u + dt * k3, t + dt)
            us[i + 1] = u + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
        end
        return us
    end
    nn_g_nb8(u, th) = sum(th[12 + m] * tanh(th[m] * u + th[6 + m]) for m in 1:6)
    ts_ude_nb8 = collect(0.0:0.1:12.0)
    u_exact_ude_nb8 = sim_rk4_nb8((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u - 0.45 * u^3, 1.3, ts_ude_nb8)
    u_grid_nb8 = collect(-1.2:0.1:1.3)
    let rng = Xoshiro(5704),
        ts_tr = ts_ude_nb8[1:61],
        u_obs = u_exact_ude_nb8[1:61] .+ 0.03 .* randn(rng, 61),
        W_bb = 1.2 .* randn(rng, 12),
        b_bb = collect(range(-3.0, 3.0, length = 12)),
        H_tr = tanh.(W_bb .* ts_tr' .+ b_bb),
        w_out = (H_tr * H_tr' + 1e-4 * I) \ (H_tr * u_obs)
        global u_bb_nb8 = vec((tanh.(W_bb .* ts_ude_nb8' .+ b_bb))' * w_out)
        th = vcat([0.7, -0.7, 1.1, -1.1, 1.5, -1.5], [-0.8, -0.8, 0.0, 0.0, 0.8, 0.8], zeros(6))
        ude_res(p) = sim_rk4_nb8((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + nn_g_nb8(u, p), 1.3, ts_tr) .- u_obs
        for _ in 1:25
            r0 = ude_res(th)
            J = Matrix{Float64}(undef, 61, 18)
            for j in 1:18
                tp = copy(th); tp[j] += 1e-6
                J[:, j] = (ude_res(tp) .- r0) ./ 1e-6
            end
            st = (J' * J + 1e-3 * I) \ (J' * r0)
            th .-= st
            norm(st) < 1e-7 && break
        end
        global th_ude_nb8 = th
    end
end

# ╔═╡ 8b1d0124-0000-11f1-9a01-000000000024
ude_em_summary = missing # TODO: 正則化EMとUDE軌道積分を実装し、(em_share1 = ..., bb_extrap_rmse = ..., ude_extrap_rmse = ..., g_rmse = ...) を返す

# ╔═╡ 8b1d0125-0000-11f1-9a01-000000000025
if ude_em_summary === missing
    md"⏳ 正則化ガウス混合EMの比率推定と、ハイブリッドUDE対ブラックボックスNNの外挿・法則復元精度を比較します。"
elseif ude_em_summary isa NamedTuple &&
       all(k -> hasproperty(ude_em_summary, k), (:em_share1, :bb_extrap_rmse, :ude_extrap_rmse, :g_rmse)) &&
       all(k -> (v = getproperty(ude_em_summary, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:em_share1, :bb_extrap_rmse, :ude_extrap_rmse, :g_rmse))
    let ref_em = let n = length(x_mix_nb8),
            pk = [0.5, 0.5],
            mu = [-0.5, 3.0],
            s2 = fill(var(x_mix_nb8) / 2, 2),
            resp = zeros(n, 2),
            ll_p = -Inf
            for _ in 1:120
                ll = 0.0
                for i in 1:n
                    l1 = log(pk[1]) - 0.5 * (log(2 * pi * s2[1]) + (x_mix_nb8[i] - mu[1])^2 / s2[1])
                    l2 = log(pk[2]) - 0.5 * (log(2 * pi * s2[2]) + (x_mix_nb8[i] - mu[2])^2 / s2[2])
                    m = max(l1, l2)
                    lse = m + log(exp(l1 - m) + exp(l2 - m))
                    ll += lse
                    resp[i, 1] = exp(l1 - lse)
                    resp[i, 2] = exp(l2 - lse)
                end
                abs(ll - ll_p) < 1e-9 && break
                ll_p = ll
                for k in 1:2
                    nk = sum(@view resp[:, k])
                    pk[k] = nk / n
                    mu[k] = dot(@view(resp[:, k]), x_mix_nb8) / nk
                    s2[k] = max(sum(resp[i, k] * (x_mix_nb8[i] - mu[k])^2 for i in 1:n) / nk, 1e-2)
                end
            end
            pk[argmin(mu)]
        end,
        u_ude_ref = sim_rk4_nb8((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + nn_g_nb8(u, th_ude_nb8), 1.3, ts_ude_nb8),
        ref_bb = sqrt(mean((u_bb_nb8[62:end] .- u_exact_ude_nb8[62:end]).^2)),
        ref_ud = sqrt(mean((u_ude_ref[62:end] .- u_exact_ude_nb8[62:end]).^2)),
        ref_g = sqrt(mean((nn_g_nb8.(u_grid_nb8, Ref(th_ude_nb8)) .- (-0.45 .* (u_grid_nb8 .^ 3))).^2))
        if isapprox(ude_em_summary.em_share1, ref_em; atol = 1e-8) &&
           isapprox(ude_em_summary.bb_extrap_rmse, ref_bb; atol = 1e-9) &&
           isapprox(ude_em_summary.ude_extrap_rmse, ref_ud; atol = 1e-9) &&
           isapprox(ude_em_summary.g_rmse, ref_g; atol = 1e-9)
            md"✅ **正解!** 異分散クラスタの比率を `0.376`（k-meansでは `0.585` に歪む）と回復し、さらにハイブリッドUDEが外挿RMSEを `0.735 → 0.014` へ劇的に抑えつつ未知法則 `-0.45u³` を `RMSE = 0.036` で復元できることを確認しました。"
        else
            md"🤔 EM法の `var_floor = 1e-2` つき分散更新と、外挿添字 `62:121`（`t > 6.0`）および `u_grid_nb8` での `nn_g_nb8.(u_grid_nb8, Ref(th_ude_nb8))` を確認してください。"
        end
    end
else
    md"🤔 `(em_share1 = 数値, bb_extrap_rmse = 数値, ude_extrap_rmse = 数値, g_rmse = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 8b1d0126-0000-11f1-9a01-000000000026
md"""
## 課題8: 確率較正曲線（ECE対AUCの盲点）と2次元双安定位相平面の分岐検算

モデル診断図と位相平面図の背後にある指標・固有値・セパラトリクス分岐を検算します。

1. 2値観測 `y_cal_nb8`（`n = 1200`）に対する較正良好な予測確率 `p_cal_nb8` と、ロジットを単調拡大した過信予測 `p_over_nb8` について、`exact_auc_nb8` による `AUC` の絶対差 `auc_gap`（順位不変性より `0.0`）と、予測確率の昇順10等分ビン（各120件）における期待較正誤差 `ece_cal`・`ece_over`（各ビンの `(120/1200) * abs(mean(p_bin) - mean(y_bin))` の和）を求める
2. 2次元相互抑制系 `rhs2d_nb8(u1, u2)` について、対角セパラトリクス `u1 = u2` をわずかに挟む2つの初期値 `(0.12, 0.08)` と `(0.08, 0.12)` から `dt = 0.05` で `400` ステップの4次Runge–Kutta積分（`rk4_2d_nb8`）を進め、到達した2つの安定アトラクタ間のユークリッド距離 `sep_dist = hypot(end_a[1] - end_b[1], end_a[2] - end_b[2])` を求める

次の NamedTuple を `diag_phase_summary` に入れましょう。

```julia
(auc_gap = 較正モデルと過信モデルのAUC絶対差,
 ece_cal = 較正モデルの10分位ECE,
 ece_over = 過信モデルの10分位ECE,
 sep_dist = 近接初期値(0.12,0.08)と(0.08,0.12)の終端アトラクタ間距離)
```
"""

# ╔═╡ 8b1d0127-0000-11f1-9a01-000000000027
begin
    function exact_auc_nb8(yb::Vector{Float64}, sc::Vector{Float64})
        pos = sc[yb .== 1.0]
        neg = sc[yb .== 0.0]
        s = 0.0
        for vp in pos, vn in neg
            s += vp > vn ? 1.0 : (vp == vn ? 0.5 : 0.0)
        end
        return s / (length(pos) * length(neg))
    end
    rhs2d_nb8(u1, u2) = (-u1 + 1.6 * tanh(u1) - 0.9 * tanh(u2),
                         -u2 + 1.6 * tanh(u2) - 0.9 * tanh(u1))
    function rk4_2d_nb8(u0::Tuple{Float64, Float64}, dt::Float64, steps::Int)
        u1, u2 = u0
        for _ in 1:steps
            k1_1, k1_2 = rhs2d_nb8(u1, u2)
            k2_1, k2_2 = rhs2d_nb8(u1 + 0.5 * dt * k1_1, u2 + 0.5 * dt * k1_2)
            k3_1, k3_2 = rhs2d_nb8(u1 + 0.5 * dt * k2_1, u2 + 0.5 * dt * k2_2)
            k4_1, k4_2 = rhs2d_nb8(u1 + dt * k3_1, u2 + dt * k3_2)
            u1 += (dt / 6.0) * (k1_1 + 2.0 * k2_1 + 2.0 * k3_1 + k4_1)
            u2 += (dt / 6.0) * (k1_2 + 2.0 * k2_2 + 2.0 * k3_2 + k4_2)
        end
        return (u1, u2)
    end
    let rng = Xoshiro(5802), x = randn(rng, 1200), eta = -0.4 .+ 1.25 .* x
        global p_cal_nb8 = 1.0 ./ (1.0 .+ exp.(-eta))
        global y_cal_nb8 = Float64.(rand(rng, 1200) .< p_cal_nb8)
        global p_over_nb8 = 1.0 ./ (1.0 .+ exp.(-(2.8 .* eta .+ 0.55)))
    end
end

# ╔═╡ 8b1d0128-0000-11f1-9a01-000000000028
diag_phase_summary = missing # TODO: (auc_gap = ..., ece_cal = ..., ece_over = ..., sep_dist = ...) を計算

# ╔═╡ 8b1d0129-0000-11f1-9a01-000000000029
if diag_phase_summary === missing
    md"⏳ `AUC` の単調変換不変性と10分位ECEの差、および鞍点セパラトリクスを挟む2軌道の分岐距離を計算します。"
elseif diag_phase_summary isa NamedTuple &&
       all(k -> hasproperty(diag_phase_summary, k), (:auc_gap, :ece_cal, :ece_over, :sep_dist)) &&
       all(k -> (v = getproperty(diag_phase_summary, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:auc_gap, :ece_cal, :ece_over, :sep_dist))
    let ece_fn(yb, pr) = let ord = sortperm(pr)
            sum(let idx = ord[((b - 1) * 120 + 1):(b * 120)]
                0.1 * abs(mean(pr[idx]) - mean(yb[idx]))
            end for b in 1:10)
        end,
        ref_ec = ece_fn(y_cal_nb8, p_cal_nb8),
        ref_eo = ece_fn(y_cal_nb8, p_over_nb8),
        ea = rk4_2d_nb8((0.12, 0.08), 0.05, 400),
        eb = rk4_2d_nb8((0.08, 0.12), 0.05, 400),
        ref_sep = hypot(ea[1] - eb[1], ea[2] - eb[2])
        if diag_phase_summary.auc_gap >= 0.0 && diag_phase_summary.auc_gap < 1e-12 &&
           isapprox(diag_phase_summary.ece_cal, ref_ec; atol = 1e-9) &&
           isapprox(diag_phase_summary.ece_over, ref_eo; atol = 1e-9) &&
           isapprox(diag_phase_summary.sep_dist, ref_sep; atol = 1e-8) &&
           diag_phase_summary.ece_over > 3.0 * diag_phase_summary.ece_cal
            md"✅ **正解!** `AUC` 差が `0.0` なのに較正誤差が `0.0357 → 0.1400` へ約4倍悪化すること、また初期距離わずか `0.057` の2点がセパラトリクスを挟んで距離 `6.97` の正反対のアトラクタへ分岐することを確認しました。"
        else
            md"🤔 `sortperm(pr)` を120件ずつ10分割した各ビンの `0.1 * abs(mean(pr[idx]) - mean(yb[idx]))` の和と、`rk4_2d_nb8` の終端距離 `hypot` を確認してください。"
        end
    end
else
    md"🤔 `(auc_gap = 数値, ece_cal = 数値, ece_over = 数値, sep_dist = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 8b1d0119-0000-11f1-9a01-000000000019
md"""
## おつかれさまでした

8つの課題を通して、Juliaが得意とする動的システムと計算統計・多変量解析・科学機械学習（SciML）・診断可視化のアルゴリズムを自分の手で実装しました。

1. 4次Runge–Kutta法で離散化誤差を制御して常微分方程式を解く
2. Euler–Maruyama法の `sqrt(dt)` スケーリングを守り、DDMの反応時間と選択確率を同時生成する
3. カルマンフィルタで測定誤差を分離しながら周辺対数尤度を同時に計算する
4. 対数事後密度の勾配を使ったLeapfrog HMCで相関の強い事後分布を効率よく探索し、`ESS` と `divergence` を診断する
5. Gauss–Hermite求積で順序混合モデル（CLMM）の周辺対数尤度と混合ロジットの選択確率を厳密に数値積分する
6. 標準化残差行列の特異値分解（`svd`）でコレスポンデンス分析とMCAの主慣性・Burt行列・Benzécri補正を統一的に計算する
7. 正則化ガウス混合EMと、微分方程式・ニューラルネットを融合するUDEで外挿と未知法則復元を行う
8. 確率較正曲線（ECE）で `ROC-AUC` の盲点を補い、2次元位相平面のセパラトリクス分岐を検算する

ここから先は、実データの研究課題に合わせて `OrdinaryDiffEq.jl`・`Lux.jl`・`CairoMakie.jl`・`AlgebraOfGraphics.jl`・`Turing.jl`・`StanSample.jl`・`RCall.jl`・`PythonCall.jl` へ自由に進んでください。
"""

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
LinearAlgebra = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"
Random = "9a3f8284-a2c9-5f02-9a11-845980a1fd5c"
Statistics = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"

[compat]
julia = "1.12"
"""

# ╔═╡ 00000000-0000-0000-0000-000000000002
PLUTO_MANIFEST_TOML_CONTENTS = """
# This file is machine-generated - editing it directly is not advised

julia_version = "1.12.3"
manifest_format = "2.0"
project_hash = "2df0d4945e08106319621d2d9460e8d4df87ee88"

[[deps.Artifacts]]
uuid = "56f22d72-fd6d-98f1-02f0-08ddc0907c33"
version = "1.11.0"

[[deps.CompilerSupportLibraries_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "e66e0078-7015-5450-92f7-15fbd957f2ae"
version = "1.3.0+1"

[[deps.Libdl]]
uuid = "8f399da3-3557-5675-b5ff-fb832c97cbdb"
version = "1.11.0"

[[deps.LinearAlgebra]]
deps = ["Libdl", "OpenBLAS_jll", "libblastrampoline_jll"]
uuid = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"
version = "1.12.0"

[[deps.OpenBLAS_jll]]
deps = ["Artifacts", "CompilerSupportLibraries_jll", "Libdl"]
uuid = "4536629a-c528-5b80-bd46-f80d51c5b363"
version = "0.3.29+0"

[[deps.Random]]
deps = ["SHA"]
uuid = "9a3f8284-a2c9-5f02-9a11-845980a1fd5c"
version = "1.11.0"

[[deps.SHA]]
uuid = "ea8e919c-243c-51af-8825-aaa63cd721ce"
version = "0.7.0"

[[deps.Statistics]]
deps = ["LinearAlgebra"]
git-tree-sha1 = "e2b53ce13a53367e96601081e33d34746b571bad"
uuid = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"
version = "1.11.5"

    [deps.Statistics.extensions]
    SparseArraysExt = ["SparseArrays"]

    [deps.Statistics.weakdeps]
    SparseArrays = "2f01184e-e22b-5df5-ae63-d93ebab69eaf"

[[deps.libblastrampoline_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "8e850b90-86db-534c-a0d3-1478176c7d93"
version = "5.15.0+0"
"""

# ╔═╡ Cell order:
# ╠═8b1d0101-0000-11f1-9a01-000000000001
# ╟─8b1d0102-0000-11f1-9a01-000000000002
# ╟─8b1d0103-0000-11f1-9a01-000000000003
# ╠═8b1d0104-0000-11f1-9a01-000000000004
# ╠═8b1d0105-0000-11f1-9a01-000000000005
# ╠═8b1d0106-0000-11f1-9a01-000000000006
# ╟─8b1d0107-0000-11f1-9a01-000000000007
# ╠═8b1d0108-0000-11f1-9a01-000000000008
# ╠═8b1d0109-0000-11f1-9a01-000000000009
# ╠═8b1d0110-0000-11f1-9a01-000000000010
# ╟─8b1d0111-0000-11f1-9a01-000000000011
# ╠═8b1d0112-0000-11f1-9a01-000000000012
# ╠═8b1d0113-0000-11f1-9a01-000000000013
# ╠═8b1d0114-0000-11f1-9a01-000000000014
# ╟─8b1d0115-0000-11f1-9a01-000000000015
# ╠═8b1d0116-0000-11f1-9a01-000000000016
# ╠═8b1d0117-0000-11f1-9a01-000000000017
# ╠═8b1d0118-0000-11f1-9a01-000000000018
# ╟─8b1d011a-0000-11f1-9a01-00000000001a
# ╠═8b1d011b-0000-11f1-9a01-00000000001b
# ╠═8b1d011c-0000-11f1-9a01-00000000001c
# ╠═8b1d011d-0000-11f1-9a01-00000000001d
# ╟─8b1d011e-0000-11f1-9a01-00000000001e
# ╠═8b1d011f-0000-11f1-9a01-00000000001f
# ╠═8b1d0120-0000-11f1-9a01-000000000020
# ╠═8b1d0121-0000-11f1-9a01-000000000021
# ╟─8b1d0122-0000-11f1-9a01-000000000022
# ╠═8b1d0123-0000-11f1-9a01-000000000023
# ╠═8b1d0124-0000-11f1-9a01-000000000024
# ╠═8b1d0125-0000-11f1-9a01-000000000025
# ╟─8b1d0126-0000-11f1-9a01-000000000026
# ╠═8b1d0127-0000-11f1-9a01-000000000027
# ╠═8b1d0128-0000-11f1-9a01-000000000028
# ╠═8b1d0129-0000-11f1-9a01-000000000029
# ╟─8b1d0119-0000-11f1-9a01-000000000019
# ╟─00000000-0000-0000-0000-000000000001
# ╟─00000000-0000-0000-0000-000000000002
