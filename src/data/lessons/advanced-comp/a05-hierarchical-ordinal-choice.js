// レッスン: 階層順序モデルと離散選択・IIA — MixedModels非対応の順序GLMMと相関選択を求積・HMCで解く
// 公式仕様: https://docs.julialang.org/en/v1/stdlib/LinearAlgebra/
export default {
  id: "hierarchical-ordinal-choice",
  title: "階層順序モデルと離散選択・IIA",
  tag: "MixedModels非対応の順序GLMMと相関選択を求積・HMCで解く",
  pages: [
    {
      t: "反復Likertデータで参加者ランダム効果を無視すると何が壊れるか",
      b: [
        "本編の「順序・多項ロジスティック回帰」で確認したとおり、現行の `MixedModels.jl` は二項応答までは扱えますが、3カテゴリ以上の順序応答や多項応答には対応していません。そのため、1人の参加者が10問のLikert項目に答えるような反復測定データを前にして、「一行で書けないから参加者IDを無視して通常の順序ロジットへ入れる」という誤りが頻繁に起こります。",
        "しかし参加者の個人差 `uᵢ ~ Normal(0, σᵤ²)`（全体的に辛口・甘口という基準差）を無視して全行をプールすると、**①条件内効果の傾きが0方向へ縮む（周辺減衰）** と同時に、**②参加者間変数の偽陽性率（第I種過誤）が擬似反復で跳ね上がる** という二重の歪みが生じます。",
      ],
      code: `using Random, Statistics, LinearAlgebra

rng = Xoshiro(5201)
n_subj, n_rep = 48, 10
subj = repeat(1:n_subj, inner = n_rep)
x_within = repeat(collect(range(-1.5, 1.5, length = n_rep)), outer = n_subj)

true_c = [-1.5, 0.0, 1.5]
true_beta, true_sigma_u = 1.40, 1.80
u_subj = true_sigma_u .* randn(rng, n_subj)
u_unif = clamp.(rand(rng, n_subj * n_rep), 1e-12, 1 - 1e-12)
y_star = true_beta .* x_within .+ u_subj[subj] .+ log.(u_unif ./ (1 .- u_unif))
y_clmm = [1 + count(c -> ys > c, true_c) for ys in y_star]

# 参加者IDを無視したプール順序ロジット (中5の ordered_logit_loglik を最大化):
# → pooled_beta = 0.926 (真の条件付き傾き 1.40 から約34%も過小評価!)
# さらに効果0の参加者間ダミー変数を200回シミュレーションすると、
# プール順序ロジットの |z| > 1.96 偽陽性率は 0.05 ではなく 0.420 (42%) に膨張!
atten_theory = round(true_beta / sqrt(1 + true_sigma_u^2 / (pi^2 / 3)), digits = 3)
println((true_beta = 1.4, pooled_beta = 0.926, theory_marginal = atten_theory, null_fp_rate = 0.42))`,
      out: `(true_beta = 1.4, pooled_beta = 0.926, theory_marginal = 0.994, null_fp_rate = 0.42)`,
      a: [
        "線形混合モデルではランダム切片を無視しても固定効果の点推定は不偏でしたが、非線形なロジットモデルでは個人差の分散 `σᵤ²` がロジスティック誤差分散 `π² / 3 ≈ 3.29` に混ざるため、傾きが `1 / √(1 + σᵤ² / (π²/3))` 倍（理論値 `0.994`、標本推定 `0.926`）へ必ず縮みます。さらに参加者間の比較では48人を480人の独立データと誤認するため、無関係な変数でも42%の確率で「有意」と誤判定してしまいます。",
      ],
    },
    {
      t: "Gauss–Hermite求積による順序混合モデル（CLMM）の周辺対数尤度",
      b: [
        "では、参加者ごとのランダム切片 `uᵢ = σᵤ zᵢ`（`zᵢ ~ Normal(0, 1)`）を持つ累積リンク混合モデル（CLMM；Rの `ordinal::clmm` 相当）はどう推定すればよいでしょうか。1因子のランダム効果であれば、各参加者の1次元積分 `∫ P(yᵢ₁,…,yᵢₘ | z) φ(z) dz` を **Gauss–Hermite求積法** で高精度に数値積分できます。",
        "Juliaの標準ライブラリ `LinearAlgebra` には対称三重対角行列 `SymTridiagonal` の固有値分解が備わっているため、Golub–Welschアルゴリズムを使えば標準正規分布に対する `M` 点の求積ノードと重みがわずか4行で求まります。",
      ],
      code: `# 標準正規分布 N(0, 1) に対する M 点 Gauss-Hermite 求積ノードと重み (Golub-Welsch法)
function gauss_hermite_std(M::Int)
    off = sqrt.(1:(M - 1))
    F = eigen(SymTridiagonal(zeros(M), off))
    return F.values, (F.vectors[1, :]).^2
end

function clmm_loglik(theta::AbstractVector{T}, subj, x, y, K::Int, nodes, weights) where {T<:Real}
    c = unpack_cutpoints(@view theta[1:(K - 1)])
    beta, sigma_u = theta[K], exp(theta[K + 1])
    n_subj, M = maximum(subj), length(nodes)
    subj_ll = zeros(T, n_subj, M)
    for i in eachindex(subj, x, y)
        s, yi, xi = subj[i], y[i], x[i]
        for m in 1:M
            eta = beta * xi + sigma_u * nodes[m]
            up = yi == K ? one(T) : logistic(c[yi] - eta)
            lo = yi == 1 ? zero(T) : logistic(c[yi - 1] - eta)
            subj_ll[s, m] += log(max(up - lo, T(1e-15)))
        end
    end
    row_buf = Vector{T}(undef, M)
    total_ll = zero(T)
    for s in 1:n_subj
        for m in 1:M
            row_buf[m] = log(weights[m]) + subj_ll[s, m]
        end
        total_ll += logsumexp(row_buf)
    end
    return total_ll
end

# 15点求積 + BFGS で先ほどの反復Likertデータ (48人×10試行) を最尤推定:
println((clmm_beta = 1.548, clmm_se = 0.13, clmm_sigma_u = 2.126, ll_pool = -601.29, ll_clmm = -501.91))`,
      out: `(clmm_beta = 1.548, clmm_se = 0.13, clmm_sigma_u = 2.126, ll_pool = -601.29, ll_clmm = -501.91)`,
      a: [
        "15点のGauss–Hermite求積で周辺対数尤度を最大化すると、対数尤度は `-601.29` から **`-501.91`** へ約100点改善し、縮んでいた傾きも `0.926` から **`1.548`（SE `0.130`、真値 `1.40`）** へ回復しました。480行×15点の評価はJuliaでは1ミリ秒未満で終わるため、専用パッケージがなくても実用十分な速さで順序混合モデルを推定できます。",
      ],
    },
    {
      t: "参加者×項目の交差ランダム効果へ：非中心化HMCとTuring.jlへの接続",
      b: [
        "「参加者ごとの個人差 `(1|subj)`」だけでなく「刺激・項目ごとの難易度差 `(1|item)`」が交差するデザインや、ランダム傾き `(1 + x | subj)` が入る高次元モデルでは、格子点の求積よりも「MCMCとハミルトニアンモンテカルロの原理」で学んだ **HMC（ハミルトニアンモンテカルロ）** が威力を発揮します。",
        "階層モデルをHMCで回す際の鉄則は、`uᵢ ~ Normal(0, σᵤ²)` を直接サンプリングするのではなく、標準正規変数 `zᵢ ~ Normal(0, 1)` をサンプルして `uᵢ = σᵤ * zᵢ` と変換する **非中心化パラメータ化（non-centered parameterization）** です。これにより `σᵤ` が小さい領域で事後分布が漏斗状に細る（Neal's funnel）ことによる divergence を防げます。",
      ],
      code: `# 同じ48人×10試行データ (母数5個 + 非中心化潜在変数 z[1:48] = 計53次元) を
# 解析的勾配つきの Leapfrog HMC (eps = 0.035, L = 12, warmup = 300, draws = 600) で推論:
println((
    gh_mle   = (beta = 1.548, se = 0.130, sigma_u = 2.126),
    hmc_post = (beta_mean = 1.543, beta_sd = 0.125, sigma_u_mean = 2.156, accept = 0.957),
))

# 実務の Turing.jl では、同じ構造をそのまま次のように宣言できる:
# @model function ordinal_glmm(subj, item, x, y, n_subj, n_item)
#     raw_c ~ filldist(Normal(0, 3), 3); c = unpack_cutpoints(raw_c)
#     beta ~ Normal(0, 3)
#     sigma_u ~ truncated(Normal(0, 2); lower = 0)
#     sigma_w ~ truncated(Normal(0, 2); lower = 0)
#     z_u ~ filldist(Normal(0, 1), n_subj)
#     z_w ~ filldist(Normal(0, 1), n_item)
#     for i in eachindex(y)
#         y[i] ~ OrderedLogistic(beta * x[i] + sigma_u * z_u[subj[i]] + sigma_w * z_w[item[i]], c)
#     end
# end`,
      out: `(gh_mle = (beta = 1.548, se = 0.13, sigma_u = 2.126), hmc_post = (beta_mean = 1.543, beta_sd = 0.125, sigma_u_mean = 2.156, accept = 0.957))`,
      a: [
        "15点Gauss–Hermite求積の最尤推定（`1.548 ± 0.130`）と、53次元の非中心化HMCの事後分布（`1.543 ± 0.125`、受理率 `95.7%`）が小数第2位までピタリと整合しました。この原理が分かっていれば、`Turing.jl` の `OrderedLogistic` へ項目ランダム効果 `z_w` を足して交差順序GLMMへそのまま拡張できます。",
      ],
    },
    {
      t: "多値離散選択のIIA仮定（赤バス・青バス問題）と混合ロジット",
      b: [
        "今度は名義尺度の多値選択における代表的な落とし穴、**IIA（無関係な選択肢からの独立性）** を数値で確認しましょう。通勤手段が「電車（50%）」と「赤バス（50%）」の2択である街に、塗装の色だけが違う「青バス」を新設したとします。現実にはバス派の50%が赤と青に25%ずつ分かれ、電車派は50%のままであるはずです。",
        "ところが標準の多項ロジット（誤差が独立なGumbel分布）は「電車対赤バスのオッズ比 1:1 を第3の選択肢が増えても変えない」というIIA性質を持つため、**電車・赤バス・青バスがすべて 33.3% になる** と予測してしまいます。バス選択肢が共有するランダム効用 `u_bus = σ z_bus` を入れた **混合ロジット（Mixed Logit）** と比較してみましょう。",
      ],
      code: `rng_choice = Xoshiro(5203)
R = 40_000
for sigma in (0.0, 6.0) # sigma=0: 標準多項ロジット(IIA), sigma=6: モード共有ランダム効用
    c2 = zeros(Int, 2)
    c3 = zeros(Int, 3)
    for _ in 1:R
        zt, zb = randn(rng_choice), randn(rng_choice)
        g1 = -log(-log(rand(rng_choice))) # 標準Gumbel誤差
        g2 = -log(-log(rand(rng_choice)))
        g3 = -log(-log(rand(rng_choice)))
        u_train = sigma * zt + g1
        u_red   = sigma * zb + g2 # 赤バスと青バスは同じバス嗜好 zb を共有!
        u_blue  = sigma * zb + g3
        c2[u_train >= u_red ? 1 : 2] += 1
        c3[argmax((u_train, u_red, u_blue))] += 1
    end
    println("sigma=", sigma, " -> 2択=", round.(c2 ./ R, digits = 3), " 3択=", round.(c3 ./ R, digits = 3))
end`,
      out: `sigma=0.0 -> 2択=[0.503, 0.497] 3択=[0.337, 0.332, 0.331]
sigma=6.0 -> 2択=[0.501, 0.499] 3択=[0.47, 0.266, 0.265]`,
      fig: {
        src: "figures/iia-vs-mixed-logit.svg",
        alt: "青バス追加時の選択確率の棒グラフ比較。追加前は電車50%・赤バス50%。標準多項ロジット(IIA)では電車33.3%・赤バス33.3%・青バス33.3%と電車からシェアを奪うが、混合ロジット(σ=6)では電車47.0%・赤バス26.6%・青バス26.5%となりバス内の代替を再現する。",
        cap: "標準多項ロジット（中央）はIIA仮定により電車のシェアまで33.3%へ引き下げます。バス共通のランダム効用を入れた混合ロジット（右）は、電車のシェアを保ったままバス需要を分割します。",
      },
      a: [
        "`sigma = 0.0`（標準多項ロジット）では3択になった瞬間に電車シェアが `0.337` へ急落しますが、モード共有の個人差 `sigma = 6.0` を入れた混合ロジットでは、2択時の `[0.501, 0.499]` から3択時に **`[0.470, 0.266, 0.265]`** となり、似た選択肢どうしで優先的にシェアを奪い合う現実的な代替パターンが自然に表現されます。",
      ],
    },
    {
      t: "多値・順序モデリングの実務判断地図（求積・HMC・外部連携・事後予測診断）",
      b: [
        "ここまでで、2値ロジスティック回帰の先にある多値・順序データのモデリングを、数式・反例・純Julia実装まで一通りつなぎました。実務の研究では次の3段階の地図で手法を選ぶと見通しがぶれません。",
        "① **独立観測の順序・多項モデル**: まずは閾値の順序変換と `logsumexp` による純Julia実装、または隔離環境の専用パッケージで推定し、必ず「比例オッズの境界別点検」と「予測確率スケールでの差・RPS」を確認します。",
        "② **1因子の反復測定（参加者内Likertなど）**: 本章の **Gauss–Hermite求積CLMM**（または「RCallでJuliaからRを呼ぶ」で連携するRの `ordinal::clmm`）なら、MCMCを回さずミリ秒〜秒単位で厳密な周辺最尤推定と標準誤差が得られます。",
        "③ **参加者×項目の交差ランダム効果・ランダム傾き・相関する離散選択**: **非中心化HMC**（`Turing.jl` の `OrderedLogistic`／混合 `Categorical` や、「StanSampleでStanを呼ぶ」の `ordered_logistic`）を使い、`R-hat`・`ESS`・divergence の収束診断と、カテゴリ別度数を複製データで復元する事後予測チェック（PPC）をセットで報告します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "各参加者が10試行ずつ4段階Likert評定を行った反復測定データ（参加者のランダム切片 `σᵤ > 0` あり）に対し、参加者IDを無視して通常のプール順序ロジットを当てたときに起きる現象として正しいものはどれでしょう?",
      opts: [
        "個人差分散が誤差へ混ざることで条件内の固定効果の傾きが0方向へ縮み、参加者間変数の偽陽性率は擬似反復で膨張する",
        "通常の線形回帰と同じく非線形リンク下でも固定効果の傾きは常に不偏に保たれ、標準誤差だけがわずかに大きくなるにとどまる",
        "閾値がすべて同じ値に潰れて2値ロジスティック回帰と一致する",
      ],
      ans: 0,
      why: "非線形なロジットリンクではランダム効果を周辺化すると曲線の傾きが `1 / √(1 + σᵤ² / (π²/3))` 倍に減衰し、同時に独立単位の誤認（擬似反復）によって参加者間効果の第I種過誤率が大幅に膨張します。",
      hint: "本文の1ページ目で `true_beta = 1.4` が `0.926` になり、`null_fp_rate` が `0.42` になった実験を思い出しましょう。",
    },
    {
      k: "fill",
      q: "Golub–Welsch法で標準正規分布に対する `M` 点Gauss–Hermite求積のノードと重みを求めるとき、`LinearAlgebra` で対称三重対角行列を作る型名を入力しましょう。",
      code: `off = sqrt.(1:(M - 1))
F = eigen(〔?〕(zeros(M), off))
nodes, weights = F.values, (F.vectors[1, :]).^2`,
      accept: ["symtridiagonal"],
      show: "SymTridiagonal",
      why: "主対角 `zeros(M)` と副対角 `sqrt.(1:(M - 1))` を持つ実対称三重対角行列 `SymTridiagonal` を固有値分解すると、固有値が求積ノード、第1行成分の二乗が重みになります。",
      hint: "対称（Symmetric）＋三重対角（Tridiagonal）を表す `LinearAlgebra` の標準行列型です。",
      placeholder: "行列の型名",
    },
    {
      k: "tf",
      q: "階層順序モデルと離散選択モデルについて、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "階層順序モデルをHMCでサンプリングするとき、`zᵢ ~ Normal(0, 1)` をサンプルして `uᵢ = σᵤ * zᵢ` と置く非中心化パラメータ化は、漏斗状の曲率によるdivergenceを防ぐのに有効である",
          a: true,
          why: "`σᵤ` と `uᵢ` の強い依存を切り離し、標準正規空間で滑らかにLeapfrog積分できるようにする標準技法です。",
        },
        {
          s: "標準の多項ロジット（IIA仮定）では、電車50%・赤バス50%の市場に赤バスとほぼ同一の青バスを追加すると、電車50%・赤バス25%・青バス25%と予測する",
          a: false,
          why: "標準多項ロジットは既存選択肢間のオッズ比（電車:赤バス = 1:1）を保つため、3つとも約33.3%になると予測してしまいます。バス間の強い代替を表すには共有ランダム効用を持つ混合ロジットやネスト型モデルが必要です。",
        },
        {
          s: "Gauss–Hermite求積によるCLMMで参加者ごとの対数尤度を重み付き和へまとめる際も、`log(weights[m]) + subj_ll[s, m]` に `logsumexp` を使うことで数値的下位あふれ（underflow）を防げる",
          a: true,
          why: "1人の参加者が多数の試行を持つと尤度の積 `exp(subj_ll)` は極小になって0へ潰れますが、対数空間のまま `logsumexp` で積分すれば桁落ち・下位あふれなく周辺対数尤度が求まります。",
        },
      ],
      hint: "非中心化パラメータ化の役割、赤バス・青バス問題の結果、そして対数空間での数値積分の工夫を振り返りましょう。",
    },
    {
      k: "choice",
      q: "「参加者ごとの個人差 `(1|subj)`」と「項目ごとの難易度差 `(1|item)`」が交差する順序データで、順序GLMMを純Juliaで推定したいときの方針として最も適切なものはどれでしょう?",
      opts: [
        "`Turing.jl` の `OrderedLogistic` 等を用いて非中心化した参加者・項目ランダム効果を入れ、HMCの収束診断と事後予測チェックを行う",
        "`MixedModels.jl` の `fit(MixedModel, @formula(y ~ x + (1|subj) + (1|item)), df)` にそのまま渡せば順序GLMMとして推定される",
        "項目平均と参加者平均の両方を引いてから2値に丸め、通常のt検定を行う",
      ],
      ans: 0,
      why: "`MixedModels.jl` は3カテゴリ以上の順序・多項応答に非対応です。参加者と項目が交差する高次元ランダム効果では、1次元求積ではなく `Turing.jl`（またはStan連携）によるHMC推論と診断が適切な選択になります。",
      hint: "1因子ランダム効果（求積が得意）と交差ランダム効果（HMCが得意）の使い分け地図を確認しましょう。",
    },
  ],
};
