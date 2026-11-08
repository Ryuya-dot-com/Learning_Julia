// レッスン: MCMCとハミルトニアンモンテカルロの原理 — ベイズ推論エンジンの心臓部をJuliaで書いて理解する
// 公式仕様: https://mc-stan.org/docs/reference-manual/mcmc.html
export default {
  id: "mcmc-metropolis-hmc",
  title: "MCMCとハミルトニアンモンテカルロの原理",
  tag: "ベイズ推論エンジンの心臓部をJuliaで書いて理解する",
  pages: [
    {
      t: "ブラックボックスとして使うMCMCから、仕組みが分かるMCMCへ",
      b: [
        "連携トラック「StanSampleでStanを呼ぶ」では、ベイズ推論の実行後に `R̂`・有効サンプルサイズ（`ESS`）・`divergence`（発散遷移）を必ず点検しました。では、サンプラの内部では一体何が起きており、なぜ `divergence` が出ると推定を信じてはいけないのでしょうか?",
        "Juliaなら、マルコフ連鎖モンテカルロ（MCMC）の原点である**ランダムウォークMetropolis–Hastings法（RWMH）**も、現代のStanや `Turing.jl` の中核である**ハミルトニアンモンテカルロ法（HMC）**も、数十行の明快なコードで直接書いて比較できます。",
      ],
    },
    {
      t: "Metropolis–Hastings法と「強い相関の尾根」での停滞",
      b: [
        "事後密度そのものの正規化定数が分からなくても、対数事後密度（定数差を除く）`logp(θ)` さえ計算できれば、提案点 `θ_prop` を受理確率 `min(1, exp(logp(θ_prop) - logp(θ)))` で受け入れることで目標分布からサンプリングできます。アンダーフローを防ぐため、実装では必ず **`log(rand(rng)) < logp_prop - logp_curr`** と対数のまま比較します。",
        "ところが、切片と傾きや階層モデルのパラメータのように強い相関（例：`ρ = 0.92`）がある細長い尾根では、等方的なランダムウォーク提案は尾根の横壁にぶつかって棄却されるか、ごく小さな歩幅でジグザグ進むことしかできません。",
      ],
      code: `using Random, Statistics, LinearAlgebra

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
        p1, p2 = q1 + step_sd * randn(rng), q2 + step_sd * randn(rng)
        lp_prop = corr_norm_logp_grad(p1, p2, rho).logp
        if log(rand(rng)) < lp_prop - lp
            q1, q2, lp = p1, p2, lp_prop
            acc += 1
        end
        draws[i, 1], draws[i, 2] = q1, q2
    end
    return (draws = draws, acc_rate = acc / ndraws)
end`,
      a: [
        "`acc_rate`（受理率）が60%近くあっても、「よく動けている」とは限りません。小刻みに同じ場所を往復しているだけだと自己相関が高止まりし、独立サンプル何個分の情報があるかを表す `ESS` が極端に小さくなります。",
      ],
    },
    {
      t: "HMCとLeapfrog積分：対数事後密度の勾配に沿って遠くまで滑走する",
      b: [
        "ハミルトニアンモンテカルロ（HMC）は、位置 `q`（パラメータ）に仮想の運動量 `r ~ Normal(0, I)` を与え、位置エネルギー `U(q) = -logp(q)` の谷地形に沿って物理シミュレーション（**Leapfrog積分**）で `L` ステップ滑走させて提案点を作ります。",
        "勾配 `∇logp(q)`（実務では中級編で学んだ自動微分から計算）が「尾根の向き」を教えてくれるため、強い相関があっても高い受理率のまま一気に反対側まで移動できます。",
      ],
      code: `function run_hmc_2d(seed::Int, ndraws::Int; rho = 0.92, eps = 0.18, L = 12)
    rng = Xoshiro(seed)
    draws = Matrix{Float64}(undef, ndraws, 2)
    q1, q2 = -1.5, 1.5
    cur = corr_norm_logp_grad(q1, q2, rho)
    acc, divergent = 0, 0
    for i in 1:ndraws
        r1, r2 = randn(rng), randn(rng)
        H_old = -cur.logp + 0.5 * (r1^2 + r2^2)
        p_q1, p_q2 = q1, q2
        p_r1, p_r2 = r1 + 0.5 * eps * cur.g1, r2 + 0.5 * eps * cur.g2
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
        delta_H = (-st.logp + 0.5 * (p_r1^2 + p_r2^2)) - H_old
        if !isfinite(delta_H) || delta_H > 100.0
            divergent += 1
        elseif log(rand(rng)) < -delta_H
            q1, q2, cur = p_q1, p_q2, st
            acc += 1
        end
        draws[i, 1], draws[i, 2] = q1, q2
    end
    return (draws = draws, acc_rate = acc / ndraws, divergent = divergent)
end`,
      fig: {
        src: "figures/rwmh-vs-hmc.svg",
        alt: "相関0.92の2次元正規事後分布における最初の45サンプルの比較。左のRandom-Walk MHは左上の局所に留まりESS=26.7、右のLeapfrog HMCは楕円の尾根全体を横断しESS=1423.2。",
        cap: "同じ開始点 (-1.5, 1.5) からの最初の45サンプル。ランダムウォークMH（左）が局所で足踏みする間に、HMC（右）は勾配を利用して95%等高線の尾根全体を往復します。",
      },
      a: [
        "Leapfrog法は「運動量を半歩 → 位置を1歩 → 運動量を半歩」と対称に更新するため、体積保存と時間可逆性を満たし、滑らかな領域では全エネルギー `H` がほぼ保存されて受理率が1に近づきます。",
      ],
    },
    {
      t: "実測比較：ESSが50倍違い、刻み幅過大で divergence が起きる",
      b: [
        "実際に2000回（前半500回をウォームアップとして除外した残り1500回）の有効サンプルサイズ `ESS`、4本の独立チェーンによる `split-R̂`、そして曲率に対して刻み幅 `eps` を大きくしすぎたときの `divergence` を比べてみましょう。",
      ],
      code: `function ess_1d(x::AbstractVector{<:Real}; max_lag = 80)
    n = length(x)
    xc = x .- mean(x)
    v = dot(xc, xc) / n
    rho_sum = 0.0
    for k in 1:min(max_lag, n - 2)
        rk = @views dot(xc[1:(n - k)], xc[(1 + k):n]) / (n * v)
        rk <= 0.0 && break
        rho_sum += rk
    end
    return n / (1.0 + 2.0 * rho_sum)
end

rw = run_rwmh_2d(5401, 2000; rho = 0.92, step_sd = 0.35)
hm = run_hmc_2d(5401, 2000; rho = 0.92, eps = 0.18, L = 12)
println((acc = round(rw.acc_rate, digits = 3),
         ess = round(ess_1d(@view rw.draws[501:end, 1]), digits = 1)))
println((acc = round(hm.acc_rate, digits = 3),
         ess = round(ess_1d(@view hm.draws[501:end, 1]), digits = 1),
         div = hm.divergent))

# 反例: 狭い谷 (rho = 0.96) で leapfrog 刻み幅 eps = 0.72 が大きすぎる場合
hm_bad = run_hmc_2d(5499, 400; rho = 0.96, eps = 0.72, L = 12)
println((acc = round(hm_bad.acc_rate, digits = 3), div = hm_bad.divergent))`,
      out: `(acc = 0.626, ess = 26.7)
(acc = 0.972, ess = 1423.2, div = 0)
(acc = 0.0, div = 400)`,
      a: [
        "同じ1500サンプルから、ランダムウォークMHは `ess = 26.7` しか得られないのに対し、HMCは `ess = 1423.2`（50倍以上）を達成しました。4本の独立HMCチェーンの `split-R̂` も `1.002` となり、異なる初期値から同じ分布へ混合していることが確認できます。",
        "一方、下の反例（`eps = 0.72`）では400回すべてでエネルギー誤差 `delta_H` が爆発し、`div = 400` となりました。「微分方程式と動的システム」で見た陽的積分の破綻とまったく同じ現象が、急峻な事後分布の谷（階層モデルのfunnelなど）で起きたものが **divergent transition** の正体です。",
      ],
    },
    {
      t: "Juliaの確率的プログラミング（Turing.jl）とStanへの接続",
      b: [
        "これで、StanやJuliaネイティブの確率的プログラミング言語 `Turing.jl`（内部で `AdvancedHMC.jl` のNUTS：ステップ数 `L` と刻み幅 `eps` を自動調整するHMCを使用）が何をしているかが完全に一本の線でつながりました。",
        "①生成過程から対数同時密度を書く → ②自動微分で正確な勾配を得る → ③Leapfrog軌道で高効率にサンプルする → ④`divergence == 0`・`R̂`・`ESS`・事後予測チェックで計算とモデルの両方を監査する。Juliaを学ぶ最大の醍醐味は、この全階層をブラックボックスなしに自分の手で読み書きし、必要に応じて自在に拡張できることにあります。",
      ],
    },
  ],
  ex: [
    {
      k: "fill",
      q: "Metropolis–Hastings法で現在の対数事後密度 `lp` と提案点の対数事後密度 `lp_prop` を比較し、アンダーフローを起こさずに受理判定する条件式の空欄を埋めましょう。",
      code: `if 〔?〕(rand(rng)) < lp_prop - lp
    q = q_prop
end`,
      accept: ["log"],
      show: "log",
      why: "`rand(rng) < exp(lp_prop - lp)` と書くと数値的なアンダーフロー／オーバーフローの原因になるため、両辺の自然対数をとった `log(rand(rng)) < lp_prop - lp` を使います。",
      hint: "一様乱数 `rand(rng)` を対数スケールへ移す標準関数（3文字）です。",
      placeholder: "3文字の関数名",
    },
    {
      k: "choice",
      q: "強い相関を持つ細長い事後分布において、ランダムウォークMetropolis–Hastings法よりHMCの有効サンプルサイズ（ESS）が劇的に大きくなる主な理由は何でしょう?",
      opts: [
        "対数事後密度の勾配を使って尾根の向きに沿った長いLeapfrog軌道を進むため、高い受理率のまま自己相関の低い離れた点へ移動できるから",
        "事後分布の相関を強制的に0へ書き換えて独立な正規分布に近似してから乱数を引いているから",
        "棄却判定を一切行わず、提案された点を100%無条件に採用するアルゴリズムだから",
      ],
      ans: 0,
      why: "HMCは近似分布への置き換えではなく、勾配情報を利用したハミルトン力学の軌道提案とMetropolis受理判定を組み合わせることで、正確な目標分布を保ったまま遠くまで効率よく探索します。",
      hint: "HMCが `logp` だけでなくその微分（勾配）を計算している理由に注目しましょう。",
    },
    {
      k: "tf",
      q: "MCMCの診断指標（受理率・ESS・divergence）について、正しいか判定しましょう。",
      items: [
        {
          s: "ランダムウォークMHの受理率が60%を超えていれば、歩幅が小さくても自己相関は低く十分なESSが得られていると判断できる",
          a: false,
          why: "歩幅が小さすぎると受理率は高くなりますが、ほとんど同じ場所から動けないため自己相関が極めて高くなり、ESSは小さくなります。",
        },
        {
          s: "HMCやNUTSで報告される `divergence`（発散遷移）は、事後分布の曲率が急な領域でLeapfrog数値積分が破綻し、エネルギー保存が大きく崩れたことを示す警告である",
          a: true,
          why: "発散が起きている領域へサンプラが正しく入り込めていないため、わずかな件数でも放置せず、刻み幅調整（`adapt_delta`）やモデルの再パラメータ化（非中心化など）を行います。",
        },
        {
          s: "複数本の独立チェーンを異なる初期値から走らせて `split-R̂` と `ESS` の両方を確認するのは、局所停滞や混合不良を見抜くためである",
          a: true,
          why: "1本のチェーンだけでは別の峰や遅いドリフトに気づけないことがあるため、複数チェーン間の分散とチェーン内分散を比較する `split-R̂` と `ESS` を併用します。",
        },
      ],
      hint: "小刻み提案の罠、Leapfrog積分の破綻、複数チェーン診断の役割をそれぞれ振り返りましょう。",
    },
    {
      k: "choice",
      q: "HMCで `divergence`（発散遷移）が検出されたときの対処として適切なものはどれでしょう?",
      opts: [
        "発散したサンプルだけを配列から削除して残りで平均や信用区間を計算するのではなく、Leapfrogの刻み幅を小さくするかモデルの再パラメータ化を行って発散ゼロを確認する",
        "発散した行だけCSVから取り除けば残りのサンプルは不偏なので、そのまま論文に報告する",
        "ウォームアップ期間を0にして初期値を事後平均の近くに固定し、谷へ近づかないようにする",
      ],
      ans: 0,
      why: "発散は「曲率の強い領域を正しく探索できなかった」ことを意味するため、発散点だけ捨てると事後分布の特定の領域を系統的に欠落させた偏った推定になります。",
      hint: "連携トラックのStan診断でも学んだ「発散が1件以上あるときの原則」を思い出しましょう。",
    },
  ],
};
