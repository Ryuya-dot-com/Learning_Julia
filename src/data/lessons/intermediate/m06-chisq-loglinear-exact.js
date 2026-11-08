// レッスン: カイ二乗分析の深化：適合度・正確検定・対数線形モデル
// 公式仕様: https://docs.julialang.org/en/v1/stdlib/Random/
//          https://juliastats.org/GLM.jl/stable/
export default {
  id: "chisq-loglinear-exact",
  title: "カイ二乗分析の深化：適合度・正確検定・対数線形モデル",
  tag: "割合入力の罠、R×Cモンテカルロ正確検定、傾向検定、Poisson対数線形・準独立モデルを実装する",
  pages: [
    {
      t: "適合度検定と「割合を度数として渡す罠」：Pearson χ² と尤度比 G²",
      b: [
        "本編の「尺度に応じた関連指標」では2変数の独立性カイ二乗検定を扱いましたが、1つのカテゴリ変数の観測度数 `O` が理論比率 `p₀`（例：`1 : 1 : 2`）に合うかを調べる **適合度検定（goodness-of-fit test）** も同じ構造を持ちます。このとき実務で非常に多い誤りが、**生の人数ではなくパーセント（`%`）をそのままカイ二乗検定へ渡してしまうこと** です。",
        "Pearsonの `χ² = Σ (O - E)² / E` と、対数尤度比統計量（逸脱度）`G² = 2 Σ O log(O / E)` はどちらも標本サイズ `N` に比例して大きくなります。同じ構成比 `[35%, 15%, 50%]` でも、`N = 40` の実度数 `[14, 6, 20]` と、`%` を誤入力した `[35, 15, 50]`（見かけ上 `N = 100`）で何が起きるか比較してみましょう。",
      ],
      code: `using Distributions

function chisq_gof(obs::AbstractVector{<:Real}, probs::AbstractVector{<:Real})
    n = sum(obs)
    exp_cnt = n .* probs
    chi2 = sum((obs .- exp_cnt).^2 ./ exp_cnt)
    g2 = 2.0 * sum(o > 0 ? o * log(o / e) : 0.0 for (o, e) in zip(obs, exp_cnt))
    w = sqrt(chi2 / n) # Cohenの効果量 w (標本サイズ倍に不変)
    df = length(obs) - 1
    return (chi2 = round(chi2, digits = 3), g2 = round(g2, digits = 3),
            w = round(w, digits = 3), p = round(ccdf(Chisq(df), chi2), digits = 4))
end

probs0 = [0.25, 0.25, 0.50]
println("実度数 N=40 : ", chisq_gof([14, 6, 20], probs0))
println("%誤入力(100): ", chisq_gof([35.0, 15.0, 50.0], probs0))
println("実度数 N=400: ", chisq_gof([140, 60, 200], probs0))`,
      out: `実度数 N=40 : (chi2 = 3.2, g2 = 3.291, w = 0.283, p = 0.2019)
%誤入力(100): (chi2 = 8.0, g2 = 8.228, w = 0.283, p = 0.0183)
実度数 N=400: (chi2 = 32.0, g2 = 32.913, w = 0.283, p = 0.0)`,
      a: [
        "構成比からのずれを表す効果量 `w = √(χ² / N) = 0.283` は3つとも完全に同じですが、`N = 40` の実度数では `χ² = 3.2 (p = 0.2019)` なのに対し、`%` をそのまま入れると見かけ上の人数が2.5倍に水増しされて `χ² = 8.0 (p = 0.0183)` という偽の有意差が生まれます。カイ二乗分析の入力は必ず**独立な観測単位の生の度数（整数カウント）**でなければなりません。",
      ],
    },
    {
      t: "疎な R×C 分割表とモンテカルロ正確独立性検定（周辺固定シャッフル）",
      b: [
        "`HypothesisTests.jl` の `FisherExactTest` は `2×2` 表専用であり、`3×3` や `3×4` の分割表を渡すと `MethodError` になります。しかし疎なセル（期待度数 `E < 1`）を含む一般の `R×C` 表で漸近 `Chisq((R-1)(C-1))` 近似をそのまま使うのは危険です。",
        "たとえば `N = 19` の `3×3` 表 `[1 0 0; 0 5 4; 0 4 5]` のように、希少な行1（計1人）と希少な列1（計1人）がたまたま一致したケースを考えます。Juliaなら列ラベルの配列を `shuffle!` で並び替えるだけで、**行周辺度数と列周辺度数を完全に固定した条件付き正確分布**を数ミリ秒で5万回生成できます。",
      ],
      fig: {
        src: "figures/exact-vs-asymptotic-chisq-loglinear.svg",
        alt: "疎な3×3分割表における漸近Chisq(4)近似と周辺固定正確検定のp値比較および3元対数線形モデル階層図",
        cap: "図: 左は期待度数 1/19 の疎な3×3表で漸近 Chisq(4) 近似（p=0.00071）が正確検定（p≈0.052）より極端に小さく出る仕組み。右は3元分割表の対数線形モデル階層。",
      },
      code: `using Random, Distributions

function pearson_chisq_mat(tab::AbstractMatrix{<:Real})
    n = sum(tab)
    r, c = sum(tab; dims = 2), sum(tab; dims = 1)
    return sum((tab[i, j] - r[i] * c[j] / n)^2 / (r[i] * c[j] / n)
               for i in axes(tab, 1), j in axes(tab, 2))
end

function mc_exact_chisq(tab::AbstractMatrix{<:Integer}; B::Int = 50_000, seed::Int = 4601)
    rng = Xoshiro(seed)
    R, C = size(tab)
    row_sums = vec(sum(tab; dims = 2))
    col_pool = reduce(vcat, [fill(j, sum(@view tab[:, j])) for j in 1:C])
    obs_stat = pearson_chisq_mat(tab)
    sim_tab = zeros(Int, R, C)
    hits = 0
    for _ in 1:B
        shuffle!(rng, col_pool)
        fill!(sim_tab, 0)
        idx = 1
        for i in 1:R, _ in 1:row_sums[i]
            sim_tab[i, col_pool[idx]] += 1
            idx += 1
        end
        pearson_chisq_mat(sim_tab) >= obs_stat - 1e-12 && (hits += 1)
    end
    p_exact = (hits + 1) / (B + 1) # Phipson-Smyth の +1 補正
    return (chi2 = round(obs_stat, digits = 3),
            p_asymp = round(ccdf(Chisq((R - 1) * (C - 1)), obs_stat), digits = 5),
            p_exact = round(p_exact, digits = 4))
end

println(mc_exact_chisq([1 0 0; 0 5 4; 0 4 5]))`,
      out: `(chi2 = 19.235, p_asymp = 0.00071, p_exact = 0.0522)`,
      a: [
        "セル `(1, 1)` の期待度数が `1 / 19 ≈ 0.0526` しかないため、`(1 - 0.0526)² / 0.0526 = 17.05` と統計量が爆発し、漸近カイ二乗近似は **`p = 0.00071`（0.1%未満で有意！）** と誤報します。しかし周辺固定の正確検定で見れば、行1の1人が列1へ入る確率は約 `1 / 19 ≈ 0.0526` にすぎず、正確p値は **`0.0522`** と70倍以上も大きいことが分かります。",
      ],
    },
    {
      t: "順序カテゴリ表の傾向検定：無方向 χ² が見逃す単調な用量反応",
      b: [
        "列が「低用量・中用量・高用量・最高用量」のように順序を持つ `2 × 4` 表に対し、通常の `ChisqTest`（自由度 `df = 3`）を当てると、列の並び順を完全に無視して全方向のずれへ検出力を分散してしまいます。",
        "事前に単調な用量反応（傾向）が仮説である場合は、順序スコア `u_i, v_j` に対する加重相関係数 `r` を用いた **線形×線形連関統計量 `M² = (N - 1) r²`（`2 × C` 表では Cochran–Armitage 傾向検定と同系統、自由度 `df = 1`）** を使うことで、全体の `χ²(df = 3)` を「直線的傾向 `M²(df = 1)`」と「直線からの逸脱 `(df = 2)`」へ分解できます。",
      ],
      code: `using LinearAlgebra, Distributions

function trend_chisq(tab::AbstractMatrix{<:Real}, u::AbstractVector{<:Real}, v::AbstractVector{<:Real})
    n = sum(tab)
    p = tab ./ n
    r_m, c_m = vec(sum(p; dims = 2)), vec(sum(p; dims = 1))
    mu_u, mu_v = dot(r_m, u), dot(c_m, v)
    sd_u = sqrt(sum(r_m[i] * (u[i] - mu_u)^2 for i in eachindex(u)))
    sd_v = sqrt(sum(c_m[j] * (v[j] - mu_v)^2 for j in eachindex(v)))
    cov_uv = sum(p[i, j] * (u[i] - mu_u) * (v[j] - mu_v) for i in axes(p, 1), j in axes(p, 2))
    m2 = (n - 1) * (cov_uv / (sd_u * sd_v))^2
    chi2_all = pearson_chisq_mat(tab)
    return (chi2_df3 = round(chi2_all, digits = 3), p_df3 = round(ccdf(Chisq(3), chi2_all), digits = 4),
            m2_df1 = round(m2, digits = 3), p_trend = round(ccdf(Chisq(1), m2), digits = 4),
            depart_df2 = round(chi2_all - m2, digits = 3))
end

# 4段階の用量で反応率が 23.3% → 30.0% → 40.0% → 53.3% と単調増加する 2×4 表 (各群30人)
dose_tab = [23 21 18 14; 7 9 12 16]
println(trend_chisq(dose_tab, [0.0, 1.0], [0.0, 1.0, 2.0, 3.0]))`,
      out: `(chi2_df3 = 6.603, p_df3 = 0.0857, m2_df1 = 6.406, p_trend = 0.0114, depart_df2 = 0.197)`,
      a: [
        "無方向の全体カイ二乗は `χ² = 6.603 (df = 3, p = 0.0857)` で単調増加を見逃しますが、そのうち実に `6.406`（97%！）が自由度1の単調傾向 `M² (p = 0.0114)` に集中しており、直線傾向からの逸脱はわずか `0.197 (df = 2)` です。ただしスコアの間隔（等間隔など）は結果を見る前に研究仮説から固定します。",
      ],
    },
    {
      t: "3元クロス集計と対数線形モデル：条件付き独立と3要因交互作用（IPF・Poisson GLM）",
      b: [
        "変数が3つ以上（`I × J × K` の3元分割表）になると、2元表の独立性検定だけでは「第3変数 `B` で条件づけたときの独立性（`A ⊥ C | B`）」や「層によってオッズ比自体が変わる3要因交互作用」を扱えません。ここで登場するのが、セル度数 `N_ijk` の期待値 `μ_ijk` を対数リンクで表す **対数線形モデル（log-linear model）** です。",
        "実務の `GLM.jl` では `glm(@formula(y ~ A * B + B * C), df, Poisson(), LogLink())` の残差逸脱度（`deviance`）がそのまま尤度比 `G²` になります。また標準ライブラリだけでも、条件付き独立の期待度数 `E_ijk = N_ij+ N_+jk / N_+j+` や、反復比例当てはめ（**IPF**: Iterative Proportional Fitting）で完全に同じ最尤期待度数が求まります。",
      ],
      code: `g2_dev(obs, exp_arr) = sum(o > 0 ? 2.0 * o * log(o / e) : 0.0 for (o, e) in zip(obs, exp_arr))

# (1) Bを潰した周辺表では強い連関に見えるが、各B層内では独立 (A ⊥ C | B) な 2×2×2 表
N3 = Array{Int}(undef, 2, 2, 2)
N3[:, 1, :] = [65 15; 16  4]  # B=1層: A=1で81.2%, A=2で80.0%
N3[:, 2, :] = [ 8 32; 31 129] # B=2層: A=1で20.0%, A=2で19.4%

tab_AC = dropdims(sum(N3; dims = 2); dims = 2)
exp_AC = (sum(tab_AC; dims = 2) * sum(tab_AC; dims = 1)) ./ sum(tab_AC)
N_ij, N_jk, N_j = sum(N3; dims = 3), sum(N3; dims = 1), sum(N3; dims = (1, 3))
E_cond = [N_ij[i, j, 1] * N_jk[1, j, k] / N_j[1, j, 1] for i in 1:2, j in 1:2, k in 1:2]

# (2) 3要因交互作用なし（一様連関 y ~ A*B + B*C + A*C）のIPF推定
function ipf_no_3way(obs::Array{<:Real, 3}; tol = 1e-12, maxiter = 200)
    M_AB, M_BC, M_AC = sum(obs; dims = 3), sum(obs; dims = 1), sum(obs; dims = 2)
    mu = ones(Float64, size(obs))
    for _ in 1:maxiter
        old = copy(mu)
        mu .*= M_AB ./ sum(mu; dims = 3)
        mu .*= M_BC ./ sum(mu; dims = 1)
        mu .*= M_AC ./ sum(mu; dims = 2)
        maximum(abs.(mu .- old)) < tol && break
    end
    return mu
end

N3_inter = Array{Int}(undef, 2, 2, 2)
N3_inter[:, 1, :] = [42 18; 19 41] # B=1層では正の連関
N3_inter[:, 2, :] = [16 44; 40 20] # B=2層では負の連関へ逆転!

println((g2_marginal_AC = round(g2_dev(tab_AC, exp_AC), digits = 3),
         g2_cond_indep  = round(g2_dev(N3, E_cond), digits = 3),
         g2_no_3way     = round(g2_dev(N3_inter, ipf_no_3way(N3_inter)), digits = 3)))`,
      out: `(g2_marginal_AC = 36.412, g2_cond_indep = 0.024, g2_no_3way = 37.932)`,
      a: [
        "`N3` では周辺表の `G²` が `36.412` もあるのに、`B` で条件づけた `A ⊥ C | B` モデルの逸脱度は **`0.024`（自由度2）** となり、見かけの連関がすべて `B` の構成差だったことが分かります。一方 `N3_inter` では一様連関モデルの逸脱度が **`37.932`（自由度1）** と大きく、`GLM.jl` の `Poisson(), LogLink()` の `deviance` と10桁まで一致します。",
      ],
    },
    {
      t: "構造的ゼロ（structural zero）と準独立モデル",
      b: [
        "たとえば「他者指名（自分自身は指名できない）」や「状態変化した試行だけの遷移行列（対角セルが定義上0）」のように、偶然0人だったのではなく**設計上絶対に観測が起こり得ないセル（構造的ゼロ）**を含む表があります。",
        "これを通常の `ChisqTest` へそのまま渡すと、対角の `0` まで「期待度数より極端に少ない！」と計算してしまい、非対角セルが完全に均一でも強烈な偽陽性を出します。構造的ゼロの位置に `0.0`、観測可能セルに `1.0` を置いたマスク行列からIPFを回せば、**準独立モデル（quasi-independence model）**を正しく検定できます。",
      ],
      code: `function ipf_quasi_indep(obs::AbstractMatrix{<:Real}, mask::AbstractMatrix{<:Real}; tol = 1e-12)
    r_tot, c_tot = sum(obs; dims = 2), sum(obs; dims = 1)
    mu = Float64.(mask) # 構造的ゼロのセルは初期値 0.0 のまま更新でも常に 0.0 を保つ!
    for _ in 1:200
        old = copy(mu)
        mu .*= r_tot ./ sum(mu; dims = 2)
        mu .*= c_tot ./ sum(mu; dims = 1)
        maximum(abs.(mu .- old)) < tol && break
    end
    df = (size(obs, 1) - 1) * (size(obs, 2) - 1) - count(==(0.0), mask)
    return (g2 = round(g2_dev(obs, mu), digits = 3), df = df)
end

mask_offdiag = [i != j ? 1.0 : 0.0 for i in 1:4, j in 1:4]
# 非対角がすべて20で完全に偏りのない遷移表（対角は定義上0）
qi_null = [0 20 20 20; 20 0 20 20; 20 20 0 20; 20 20 20 0]
# 特定の遷移先に偏りがある実測表
trans_obs = [0 28 12 5; 26 0 14 5; 10 12 0 23; 4 5 24 0]

println("偏りなし表の素朴χ²: ", round(pearson_chisq_mat(qi_null), digits = 2),
        " vs 準独立: ", ipf_quasi_indep(qi_null, mask_offdiag))
println("実測遷移表の準独立: ", ipf_quasi_indep(trans_obs, mask_offdiag))`,
      out: `偏りなし表の素朴χ²: 80.0 vs 準独立: (g2 = 0.0, df = 5)
実測遷移表の準独立: (g2 = 55.602, df = 5)`,
      a: [
        "非対角が一様に `20` の表でさえ、素朴な独立性カイ二乗は `χ² = 80.0 (df = 9)` と誤報しますが、対角4セルをマスクした準独立モデルなら `g2 = 0.0 (df = 9 - 4 = 5)` となり、そのうえで実測遷移表の真の偏り（`g2 = 55.602, df = 5`）だけを正確に切り出せます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "40人の参加者の選択比率が `[35%, 15%, 50%]`（実度数 `[14, 6, 20]`）だったとき、誤ってパーセント `[35.0, 15.0, 50.0]` を適合度カイ二乗検定へ渡すと何が起きるでしょう?",
      opts: [
        "効果量 `w` は変わらないが、見かけの標本サイズが2.5倍（100人）に水増しされるため `χ²` が2.5倍になり、偽の有意差が生じやすくなる",
        "パーセントでも比率は同じなので、`χ²` も `p` 値も実度数 `[14, 6, 20]` のときと完全に一致する",
        "合計が100になるため、必ず `χ² = 0` になる",
      ],
      ans: 0,
      why: "カイ二乗統計量 `χ² = N * w²` は標本サイズ `N` に比例します。パーセントを渡すと `N = 100` のデータとして扱われるため、本来の `N = 40` より `χ²` が2.5倍に膨らんで誤った `p` 値になります。",
      hint: "1ページ目で `N = 40` の `chi2 = 3.2 (p = 0.2019)` が、`%` 入力では `chi2 = 8.0 (p = 0.0183)` になった結果を確認しましょう。",
    },
    {
      k: "fill",
      q: "周辺度数を固定した `R×C` モンテカルロ正確独立性検定で、列インデックスの配列 `col_pool` を乱数器 `rng` で破壊的にランダム置換する `Random` 標準ライブラリの関数名を入力しましょう。",
      code: `for _ in 1:B
    〔?〕(rng, col_pool)
    # 行ごとの件数ずつ切り出して分割表を再構成する
end`,
      accept: ["shuffle!", "random.shuffle!"],
      show: "shuffle!",
      why: "`shuffle!(rng, col_pool)` は配列 `col_pool` の要素（各列の合計個数ぶん並んだ列番号）をその場でランダムに並び替えるため、行合計と列合計の両方を厳密に保ったランダム分割表を高速に生成できます。",
      hint: "トランプを混ぜる英語 `shuffle` に、配列を直接書き換える `!` が付いた関数です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "分割表の傾向検定・対数線形モデル・構造的ゼロについて、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "順序カテゴリを持つ `2×4` の用量反応表で単調増加が事前仮説のとき、無方向の `χ²(df = 3)` よりも自由度1の傾向検定統計量 `M²` のほうが単調傾向に対する検出力が高い",
          a: true,
          why: "無方向の検定は並び替え可能なあらゆる差へ自由度3を費やすのに対し、傾向検定は事前指定した単調方向に自由度1を集中させます。",
        },
        {
          s: "3元分割表 `N_ijk` に対する条件付き独立モデル `A ⊥ C | B` は、Poisson対数線形モデル `y ~ A * B + B * C` に対応し、その残差逸脱度は尤度比 `G²` と一致する",
          a: true,
          why: "`A * C` 項と `A * B * C` 項を含まない対数線形モデルが「各 `B` 層内で `A` と `C` が独立」を表し、Poisson GLMの残差逸脱度は `2 Σ O log(O / E)` に一致します。",
        },
        {
          s: "設計上絶対に起こり得ない構造的ゼロ（対角セルなど）があっても、通常の `ChisqTest` に0のまま入れれば自動的に除外して自由度を調整してくれる",
          a: false,
          why: "通常の独立性検定は構造的ゼロと偶然の観測ゼロ（sampling zero）を区別できません。構造的ゼロをマスクした準独立モデル（IPFや該当セルを除いたPoisson GLM）と自由度調整が必要です。",
        },
      ],
      hint: "傾向検定の自由度1への集中、Poisson対数線形モデルの式、そして `qi_null` で素朴 `χ²` が `80.0` になった反例を振り返りましょう。",
    },
    {
      k: "choice",
      q: "希少な行（計1人）と希少な列（計1人）が重なった疎な `3×3` 表 `[1 0 0; 0 5 4; 0 4 5]` で起きた現象として正しいものはどれでしょう?",
      opts: [
        "セル `(1,1)` の期待度数が極小（`1/19`）なため `(O - E)² / E` が膨張し、漸近 `Chisq(4)` 近似の `p` 値（`0.00071`）が条件付き正確検定の `p` 値（約 `0.052`）より極端に小さく出た",
        "期待度数が小さいときは常に漸近カイ二乗近似のほうが保守的になり、正確検定より大きな `p` 値を返す",
        "`FisherExactTest` に `3×3` 行列をそのまま渡せば同じ計算ができる",
      ],
      ans: 0,
      why: "極小の期待度数 `E` が分母に入ると1件の観測だけで `χ²` が大きく跳ね上がり、連続なカイ二乗分布の裾確率が実際の離散的な周辺固定確率より何十倍も過小評価されることがあります。",
      hint: "2ページ目の `p_asymp = 0.00071` と `p_exact = 0.0522` の比較を思い出しましょう。",
    },
  ],
};
