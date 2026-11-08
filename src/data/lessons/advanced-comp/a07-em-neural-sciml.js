// 上級編7: 潜在クラスタEM・逆伝播と科学機械学習（SciML）
// 検証環境: Julia 1.12 / LinearAlgebra / Statistics / Random
export default {
  id: "em-neural-sciml",
  title: "潜在クラスタEM・逆伝播と科学機械学習（SciML）",
  tag: "正則化混合正規EM・手動逆伝播・微分方程式×ニューラルネットのUDEを純Juliaで実装する",
  pages: [
    {
      t: "k-meansの等分散仮定の限界と、正則化ガウス混合EMアルゴリズム",
      b: [
        "「観測境界・依存・混合分布」で確認したとおり、`Distributions.jl` の `MixtureModel` は生成と密度計算を提供しますが、`fit_mle` による自動推定は提供しません。これは欠陥ではなく、混合分布の尤度には **ラベル入れ替わり（label switching）** や **1点への分散崩壊（`σ_k → 0` で尤度が `+∞` に発散する特異点）** があるため、仮定と制約を明示して扱う必要があるからです。",
        "クラスタごとに広がり（分散）が大きく異なるデータでは、重心までのユークリッド距離だけで硬く割り当てる **k-means法** は広いクラスタの裾を狭いクラスタへ誤って吸収してしまいます。`logsumexp` による負担率（Eステップ）と分散下限 `var_floor` つき重み付き更新（Mステップ）からなる **正則化EMアルゴリズム** を書き、混合比率・平均・SDの回復と対数尤度の単調増加を確認しましょう。",
      ],
      code: `using Random, Statistics, LinearAlgebra

function fit_gmm1d_em(x::Vector{Float64}, mu_init::Vector{Float64}; maxiter::Int = 120, var_floor::Float64 = 1e-2)
    n, K = length(x), length(mu_init)
    pi_k, mu, sig2 = fill(1.0 / K, K), copy(mu_init), fill(var(x) / K, K)
    resp, ll_steps, ll_prev = zeros(Float64, n, K), Float64[], -Inf
    for _ in 1:maxiter
        ll = 0.0
        for i in 1:n
            lps = [log(pi_k[k]) - 0.5 * (log(2 * pi * sig2[k]) + (x[i] - mu[k])^2 / sig2[k]) for k in 1:K]
            m = maximum(lps); lse = m + log(sum(exp.(lps .- m))); ll += lse
            for k in 1:K; resp[i, k] = exp(lps[k] - lse); end
        end
        push!(ll_steps, ll)
        abs(ll - ll_prev) < 1e-9 && break; ll_prev = ll
        for k in 1:K
            nk = sum(@view resp[:, k])
            pi_k[k] = nk / n
            mu[k] = dot(@view(resp[:, k]), x) / nk
            sig2[k] = max(sum(resp[i, k] * (x[i] - mu[k])^2 for i in 1:n) / nk, var_floor)
        end
    end
    ord = sortperm(mu) # 平均の昇順に並べてラベルの任意性を固定
    return (weights = pi_k[ord], means = mu[ord], sds = sqrt.(sig2[ord]),
            monotone = all(diff(ll_steps) .>= -1e-10))
end

let rng = Xoshiro(5701),
    x_mix = [i <= 140 ? 0.35 * randn(rng) : 2.2 + 1.35 * randn(rng) for i in 1:400],
    c1 = -0.5, c2 = 3.0
    for _ in 1:50
        c1 = mean(v for v in x_mix if abs(v - c1) <= abs(v - c2))
        c2 = mean(v for v in x_mix if abs(v - c1) > abs(v - c2))
    end
    km_share1 = count(v -> abs(v - c1) <= abs(v - c2), x_mix) / length(x_mix)
    em = fit_gmm1d_em(x_mix, [-0.5, 3.0])
    println((true_share1 = 0.35, kmeans_share1 = round(km_share1, digits = 3),
             em_share1 = round(em.weights[1], digits = 3), em_means = round.(em.means, digits = 3),
             em_sds = round.(em.sds, digits = 3), monotone = em.monotone))
end`,
      out: `(true_share1 = 0.35, kmeans_share1 = 0.585, em_share1 = 0.376, em_means = [-0.011, 2.282], em_sds = [0.361, 1.377], monotone = true)`,
      a: [
        "真の第1クラスタ比率は `0.35`（平均 `0.0, SD 0.35` 対 平均 `2.2, SD 1.35`）ですが、等半径で区切るk-meansは `0.585`（58.5%）と大きく歪みました。一方、分散も同時推定するEM法は比率 `0.376`・平均 `[-0.011, 2.282]`・SD `[0.361, 1.377]` を対数尤度の単調増加（`monotone = true`）とともに回復しています。ただし局所解依存やクラスタ数 `K` の識別限界は残るため、複数初期値の比較と予測分布診断が不可欠です。",
      ],
    },
    {
      t: "手動逆伝播（Backpropagation）で2層ニューラルネットの心臓部を書く",
      b: [
        "ニューラルネットワークの学習も、中身は **合成関数の連鎖律（chain rule）を行列積にまとめたもの** です。同心円の内側（`r < 1.15`）と外側を分ける2次元分類課題では、直線境界しか引けない通常のロジスティック回帰は無力ですが、`tanh` 隠れ層を1枚挟むだけで空間を折り曲げて分離できます。",
        "フレームワークを呼ぶ前に、`LinearAlgebra` の行列演算だけで順伝播（forward）と逆伝播（backward）の勾配を書き下し、線形ロジスティック回帰と正答率を比較しましょう。",
      ],
      code: `using Random, Statistics, LinearAlgebra

let rng = Xoshiro(5702), X = randn(rng, 2, 200),
    y = Float64.(vec(sqrt.(sum(X .^ 2; dims = 1))) .< 1.15),
    rng_w = Xoshiro(5703), H = 8, n = length(y), lr = 0.12
    W1, b1, w2, b2 = 0.8 .* randn(rng_w, H, 2), zeros(H), 0.8 .* randn(rng_w, H), 0.0
    logistic(z) = z >= 0 ? 1.0 / (1.0 + exp(-z)) : exp(z) / (1.0 + exp(z))
    loss_init, loss_final = 0.0, 0.0
    for ep in 1:600
        A1 = tanh.(W1 * X .+ b1)                  # H × N: 隠れ層出力
        probs = logistic.(vec(w2' * A1) .+ b2)    # N: 予測確率
        loss = -mean(y .* log.(probs .+ 1e-12) .+ (1 .- y) .* log.(1 .- probs .+ 1e-12))
        ep == 1 && (loss_init = loss); ep == 600 && (loss_final = loss)
        # 交差エントロピー + ロジスティックの合成微分は (probs - y) / n に簡約される
        dz2 = (probs .- y) ./ n
        dw2, db2 = A1 * dz2, sum(dz2)
        dZ1 = (w2 * dz2') .* (1.0 .- A1 .^ 2)     # tanh'(z) = 1 - tanh(z)^2
        W1 .-= lr .* (dZ1 * X'); b1 .-= lr .* vec(sum(dZ1; dims = 2))
        w2 .-= lr .* dw2;        b2 -= lr * db2
    end
    mlp_acc = mean((logistic.(vec(w2' * tanh.(W1 * X .+ b1)) .+ b2) .>= 0.5) .== (y .== 1.0))
    wl, bl = zeros(2), 0.0
    for _ in 1:300
        pl = logistic.(vec(wl' * X) .+ bl); wl .-= 0.2 .* (X * (pl .- y) ./ n); bl -= 0.2 * mean(pl .- y)
    end
    lin_acc = mean((logistic.(vec(wl' * X) .+ bl) .>= 0.5) .== (y .== 1.0))
    println((loss_init = round(loss_init, digits = 3), loss_final = round(loss_final, digits = 3),
             lin_acc = round(lin_acc, digits = 3), mlp_acc = round(mlp_acc, digits = 3)))
end`,
      out: `(loss_init = 0.699, loss_final = 0.284, lin_acc = 0.46, mlp_acc = 0.97)`,
      a: [
        "線形ロジスティック回帰の正答率は `0.46`（当て推量以下）にとどまるのに対し、隠れ素子8個の2層MLPは逆伝播だけで損失 `0.699 → 0.284`・正答率 **`0.97`（97%）** に到達しました。`dz2 = (probs .- y) ./ n` と `1 .- A1 .^ 2` のわずか数行が、あらゆる深層学習フレームワークの自動微分グラフが内部で実行している計算の原型です。",
      ],
    },
    {
      t: "Juliaの独壇場：科学機械学習（SciML）とハイブリッド微分方程式（UDE）",
      b: [
        "ここからがPythonエコシステムに対する **Julia最大の強みである科学機械学習（SciML）** です。薬物動態・神経活動・生態系・認知過程では、「線形な外力や自然減衰 `0.9 cos(0.8t) - 0.30 u` は理論から既知だが、飽和や非線形減衰 `g(u)` の正確な関数形だけが未知」という状況が頻繁に現れます。",
        "時刻 `t` から `u(t)` を直接当てる純ブラックボックスNNは、学習区間 `t ∈ [0, 6]` の外へ出た途端に物理法則を破って発散します。対して「微分方程式と動的システム」の4次Runge–Kutta（RK4）ソルバの **右辺の未知項 `g_θ(u)` だけに小さなニューラルネットを埋め込み、ソルバを通して誤差逆伝播／感度最小二乗を行う Universal Differential Equation（UDE）** を実装して外挿精度と未知法則 `g(u) = -0.45 u³` の復元を確かめましょう。",
      ],
      code: `using Random, Statistics, LinearAlgebra

g_true_ude(u) = -0.45 * u^3
function sim_rk4_1d(rhs, u0::Float64, ts::Vector{Float64})
    us = Vector{Float64}(undef, length(ts)); us[1] = u0
    for i in 1:(length(ts) - 1)
        t, dt, u = ts[i], ts[i + 1] - ts[i], us[i]
        k1 = rhs(u, t); k2 = rhs(u + 0.5 * dt * k1, t + 0.5 * dt)
        k3 = rhs(u + 0.5 * dt * k2, t + 0.5 * dt); k4 = rhs(u + dt * k3, t + dt)
        us[i + 1] = u + (dt / 6.0) * (k1 + 2k2 + 2k3 + k4)
    end
    return us
end

let rng = Xoshiro(5704), ts_all = collect(0.0:0.1:12.0),
    u_exact = sim_rk4_1d((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + g_true_ude(u), 1.3, ts_all),
    ts_tr = ts_all[1:61], u_obs = u_exact[1:61] .+ 0.03 .* randn(rng, 61)
    # 1. 時刻 t -> u(t) を直接当てる純ブラックボックスNN特徴量回帰
    W_bb, b_bb = 1.2 .* randn(rng, 12), collect(range(-3.0, 3.0, length = 12))
    H_tr = tanh.(W_bb .* ts_tr' .+ b_bb)
    u_bb = vec((tanh.(W_bb .* ts_all' .+ b_bb))' * ((H_tr * H_tr' + 1e-4 * I) \\ (H_tr * u_obs)))
    # 2. ハイブリッド UDE: 既知の線形ダイナミクス + 未知非線形項 nn_g(u, θ) をRK4に通して学習
    nn_g(u, th) = sum(th[12 + m] * tanh(th[m] * u + th[6 + m]) for m in 1:6)
    ude_res(th) = sim_rk4_1d((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + nn_g(u, th), 1.3, ts_tr) .- u_obs
    th = vcat([0.7, -0.7, 1.1, -1.1, 1.5, -1.5], [-0.8, -0.8, 0.0, 0.0, 0.8, 0.8], zeros(6))
    for _ in 1:25
        r0 = ude_res(th); J = Matrix{Float64}(undef, 61, 18)
        for j in 1:18; tp = copy(th); tp[j] += 1e-6; J[:, j] = (ude_res(tp) .- r0) ./ 1e-6; end
        st = (J' * J + 1e-3 * I) \\ (J' * r0); th .-= st; norm(st) < 1e-7 && break
    end
    u_ude = sim_rk4_1d((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + nn_g(u, th), 1.3, ts_all)
    ug = collect(-1.2:0.1:1.3)
    println((bb_train_rmse = round(sqrt(mean((u_bb[1:61] .- u_exact[1:61]).^2)), digits = 3),
             bb_extrap_rmse = round(sqrt(mean((u_bb[62:end] .- u_exact[62:end]).^2)), digits = 3),
             ude_extrap_rmse = round(sqrt(mean((u_ude[62:end] .- u_exact[62:end]).^2)), digits = 3),
             g_recovery_rmse = round(sqrt(mean((nn_g.(ug, Ref(th)) .- g_true_ude.(ug)).^2)), digits = 3)))
end`,
      out: `(bb_train_rmse = 0.022, bb_extrap_rmse = 0.735, ude_extrap_rmse = 0.014, g_recovery_rmse = 0.036)`,
      fig: {
        src: "figures/sciml-hybrid-ude.svg",
        alt: "2パネル図。左は時刻t=0〜6で学習しt=6〜12を外挿した軌道比較で、純ブラックボックスNNは外挿区間で大きく外れる(RMSE=0.735)のに対し、ハイブリッドUDEは真の軌道にほぼ完全に重なる(外挿RMSE=0.014)。右はUDE内部のニューラルネットが未知の非線形法則 g(u)=-0.45u³ をRMSE=0.036で復元している様子。",
        cap: "左：純ブラックボックスNNは学習区間 `t ≤ 6` では `RMSE = 0.022` なのに `t > 6` で破綻します。右：微分方程式の構造を守ったUDEは外挿 `RMSE = 0.014` を保ち、未知の `-0.45 u³` 法則まで内部から取り出せます。",
      },
      a: [
        "純ブラックボックスNNは学習区間こそ `0.022` で当てますが、未知の時間領域 `t > 6` に出た瞬間に誤差が **`0.735`（33倍悪化）** へ崩壊しました。一方、既知の駆動・減衰項を残して未知部分だけをRK4の中で学んだ **UDEは外挿RMSE `0.014`（50倍以上高精度）** を維持し、さらにブラックボックスのまま終わらず **未知の非線形項 `-0.45 u³` を `RMSE = 0.036` で関数として発見** できています。微分方程式ソルバとニューラルネットが同じ言語で書かれているJuliaだからこそ、両者を縫い目なく結合できます。",
      ],
    },
    {
      t: "Lux.jl・OrdinaryDiffEq.jl・自動微分エンジンの実務接続",
      b: [
        "上のUDEを多変量・硬い（stiff）微分方程式へスケールさせるのが、Juliaの **`Lux.jl` + `OrdinaryDiffEq.jl` + `SciMLSensitivity.jl`** エコシステムです。特に `Lux.jl` は、層の重みパラメータ `ps` と状態 `st` をモデルの内部に隠さず **明示的な引数として外に出す純粋関数設計** を採っているため、ODEソルバや自動微分（`ForwardDiff.jl` / `Zygote.jl` / `Enzyme.jl`）と衝突しません。",
        "実務上の重要な指針として、UDEの未知パラメータ数がおよそ100個未満の小〜中規模モデルでは、随伴法（adjoint）よりも **前進自動微分（`ForwardDiffSensitivity`）でODEソルバを直接微分する方が高速かつ数値的に安定** です。",
      ],
      code: `# Lux.jl + OrdinaryDiffEq.jl による本格 SciML / UDE の構成パターン
# using Lux, OrdinaryDiffEq, SciMLSensitivity, Optimization, OptimizationOptimisers, Random
# nn = Lux.Chain(Lux.Dense(1 => 8, tanh), Lux.Dense(8 => 1))
# ps, st = Lux.setup(Xoshiro(5704), nn)
# ude_rhs(u, p, t) = [0.9 * cos(0.8 * t) - 0.30 * u[1] + first(nn(u, p, st))[1]]
# prob = ODEProblem(ude_rhs, [1.3], (0.0, 6.0), ps)
# pred_sol(p) = Array(solve(prob, Tsit5(); p = p, saveat = 0.1))`,
      a: [
        "ただし、UDEが復元した `nn(u)` も「訓練軌道で状態 `u` が実際に通過した値域 `[-1.2, 1.3]`」の外側（たとえば `u = 5.0` の未経験状態）では保証されません。「時間 `t` の外挿」に強いのは既知の周期外力と構造のおかげであり、**状態空間 `u` 自体の未到達領域ではやはり不確かさが増す** という限界を常に意識してください。",
      ],
    },
    {
      t: "統計モデル・ブラックボックス機械学習・SciML・Python連携の判断地図",
      b: [
        "これで本教材のモデリング・機械学習・連携の地図がすべて揃いました。研究の目的に応じて次の4択で選び分けます。",
        "① **仮説検定・効果量と不確かさの推論が主目的**: 本編と中級編の `GLM.jl`・`MixedModels.jl`・順序GLMM・`Turing.jl` を使い、識別条件と区間推定を正面から報告します。",
        "② **説明変数間の複雑な交互作用からの予測が主目的**: 「予測機械学習と検証：Lasso・決定木・リーク防止CV」の `MLJ.jl` パイプラインと置換重要度を使い、fold内前処理とグループ分割を徹底します。",
        "③ **既知の微分方程式・認知過程の一部だけが未知**: 本章の **SciML / UDE（`Lux.jl` + `OrdinaryDiffEq.jl`）** で構造知識と柔軟な関数近似を融合します。④ **画像・テキストの事前学習基盤モデルが必要**: 「PythonCallでPythonの機械学習資産と分業する」の方法でPython資産と安全に分業します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "1次元の2成分ガウス混合分布をEMアルゴリズムで最尤推定するとき、分散の下限（`var_floor`）や事前分布を一切置かずに自由推定すると起き得る「尤度の発散（特異点）」とは何でしょう?",
      opts: [
        "2つのクラスタの平均が必ず0に一致してしまう",
        "1つのクラスタの平均がどれか1つの観測点 `x_i` に重なり、そのクラスタの分散 `σ_k² → 0` となることで密度が無限大へ発散してしまう",
        "負担率の和が1を超え続けて無限ループになる",
        "対数尤度が反復のたびに必ず減少する",
      ],
      ans: 1,
      why: "ガウス混合モデルの無制約尤度では、1成分が単一データ点に張り付いて `σ_k → 0` になると正規密度の山が無限に高くなり、尤度が `+∞` へ発散します。そのため分散の下限（正則化）や事前分布、複数初期値の点検が欠かせません。",
      hint: "正規分布の密度 `1 / (√(2π) σ)` で、`(x_i - μ) = 0` のまま `σ → 0` にすると何が起きるか考えます。",
    },
    {
      k: "fill",
      q: "2層ニューラルネットで隠れ層の活性化に `A1 = tanh.(Z1)` を使ったとき、逆伝播で使う `tanh` の導関数 `d(tanh(z))/dz` を `A1` で表します。空欄〔?〕に入る数値を入力しましょう。",
      code: `dZ1 = dA1 .* (〔?〕 .- A1 .^ 2)`,
      accept: ["1", "1.0"],
      show: "1.0",
      why: "`tanh'(z) = sech²(z) = 1 - tanh²(z)` なので、順伝播ですでに計算済みの `A1 = tanh.(Z1)` を使って `1.0 .- A1 .^ 2` と無駄なく逆伝播できます。",
      hint: "`z = 0` のとき `tanh(0) = 0` であり、原点での接線の傾き `tanh'(0)` がいくつになるか考えます。",
      placeholder: "数値",
    },
    {
      k: "tf",
      q: "科学機械学習（SciML / UDE）と純ブラックボックス機械学習の違いについて、正しいか判定しましょう。",
      items: [
        {
          s: "時刻 `t` を直接入力して `u(t)` を予測する純ニューラルネットは、学習区間で誤差が小さくても、学習区間外の時刻 `t` では物理的な減衰や保存則を破って発散しやすい",
          a: true,
          why: "時刻 `t` 自体が訓練範囲 `[0, 6]` を出て未経験の値になるため、微分方程式の構造を持たない純NNは容易に破綻します。",
        },
        {
          s: "既知の微分方程式の右辺に未知項 `g_θ(u)` として小さなニューラルネットを組み込むUDEでは、学習後に `g_θ(u)` をプロットして未知の非線形法則の形を点検できる",
          a: true,
          why: "既知項と未知項を分離しているため、学習された `g_θ(u)` 自体を取り出して物理的・認知的な解釈や記号回帰へつなげられます。",
        },
        {
          s: "UDEを使えば、訓練中に一度も通過しなかった極端な状態領域 `u`（例：訓練では `|u| ≤ 1.3` だったのに `u = 10`）でも `g_θ(u)` の精度が自動的に保証される",
          a: false,
          why: "時間 `t` の進行構造はODEソルバが担いますが、`g_θ(u)` 自体は訓練軌道が訪れた状態 `u` の範囲でしかデータを見ていません。未到達の状態領域ではやはり外挿の不確かさが生じます。",
        },
      ],
      hint: "「時刻 `t` の構造外挿」と「状態 `u` 自体の未経験領域」を分けて考えます。",
    },
    {
      k: "choice",
      q: "`OrdinaryDiffEq.jl` の微分方程式ソルバとニューラルネット層を組み合わせて自動微分する際、`Lux.jl` のように「重みパラメータ `ps` と状態 `st` を層の内部に隠さず明示的な引数として受け渡す設計」が好まれる主な理由はどれでしょう?",
      opts: [
        "パラメータを隠さないとCPUで実行できないため",
        "ODEソルバの感度計算や自動微分エンジンがパラメータベクトル `p` を陽に摂動・追跡でき、暗黙のグローバル／可変状態による副作用バグを防げるため",
        "活性化関数にReLUを使えなくするため",
        "乱数シードを指定しなくてよくなるため",
      ],
      ans: 1,
      why: "微分方程式ソルバ（`solve(prob; p = ps)`）や前進・逆伝播の自動微分では、パラメータ `p` に二重数（`Dual`）や試行値を代入して純粋関数として評価できることが極めて重要です。`Lux.jl` の明示的パラメータ設計はこの要件にそのまま合致します。",
      hint: "「自作対数尤度と数値最適化」で `Dual` 数を関数へ通したとき、関数内部がどう書かれている必要があったかを思い出します。",
    },
  ],
};
