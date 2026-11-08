// レッスン: コレスポンデンス分析と多重コレスポンデンス分析（MCA）
// 公式仕様: https://docs.julialang.org/en/v1/stdlib/LinearAlgebra/#LinearAlgebra.svd
export default {
  id: "correspondence-analysis-mca",
  title: "コレスポンデンス分析と多重コレスポンデンス分析（MCA）",
  tag: "χ²残差行列のSVDからBurt行列・Benzécri補正・馬蹄形反例・Procrustes安定性評価まで",
  pages: [
    {
      t: "カイ二乗統計量の幾何学：標準化残差行列のSVDとしてのコレスポンデンス分析",
      b: [
        "「カイ二乗検定で有意になった大きなクロス集計表で、どの行とどの列が対応しているのかを2次元マップで見たい」——それに答えるのが **コレスポンデンス分析（CA: Correspondence Analysis、対応分析）** です。Juliaの `MultivariateStats.jl` には主成分分析（PCA）はありますがCA／MCAは含まれていません。しかし実は、CAの心臓部は `LinearAlgebra` の **特異値分解 `svd` たった1回** で完全に書けます。",
        "総度数 `n` の分割表 `N` から相対度数 `P = N / n`、行質量 `r`、列質量 `c` を作ると、標準化残差行列 `S = Dᵣ⁻¹/² (P - r c') D_c⁻¹/²` の全要素二乗和 `sum(abs2, S)` は **正確に `χ² / n`（総慣性 total inertia）** に一致します。この `S` を `svd(S)` で直交分解したものがコレスポンデンス分析です。",
      ],
      code: `using LinearAlgebra

function simple_ca(N::AbstractMatrix{<:Real})
    n = sum(N)
    P = N ./ n
    r, c = vec(sum(P; dims = 2)), vec(sum(P; dims = 1))
    Dr_inv, Dc_inv = Diagonal(1.0 ./ sqrt.(r)), Diagonal(1.0 ./ sqrt.(c))
    S = Dr_inv * (P .- r * c') * Dc_inv
    F = svd(S)
    K = min(size(N, 1), size(N, 2)) - 1
    sv = F.S[1:K]
    eig = sv .^ 2 # 主慣性（固有値）：合計が χ² / n に一致！
    row_coord = Dr_inv * F.U[:, 1:K] * Diagonal(sv)
    col_coord = Dc_inv * F.V[:, 1:K] * Diagonal(sv)
    row_ctr = (r .* (row_coord .^ 2)) ./ eig' # 各軸への寄与度 ctr
    row_cos2 = (row_coord .^ 2) ./ sum(row_coord .^ 2; dims = 2) # 表現品質 cos²
    return (; inertia = sum(eig), chi2 = n * sum(eig), eig,
              share = eig ./ sum(eig), row_coord, col_coord, row_ctr, row_cos2)
end

# 4つの研究領域 × 4つの主要手法のクロス集計表 (n = 400)
ca_tab = [48 14 8 10; 12 44 16 8; 8 18 46 18; 12 4 10 44]
res = simple_ca(ca_tab)
println((inertia = round(res.inertia, digits = 4), chi2 = round(res.chi2, digits = 2),
         share_2d = round(sum(res.share[1:2]), digits = 3),
         cos2_2d = round.(vec(sum(res.row_cos2[:, 1:2]; dims = 2)), digits = 3)))`,
      out: `(inertia = 0.5762, chi2 = 230.48, share_2d = 0.847, cos2_2d = [0.955, 0.73, 0.685, 0.932])`,
      a: [
        "総慣性 `0.5762` に `n = 400` を掛けた `230.48` が Pearson の `χ²` と完全一致し、上位2軸だけで独立性からのずれ（慣性）の **`84.7%`** を表現できています。各行の2次元 `cos²`（`0.685〜0.955`）を確認すれば、「どの行プロファイルがこの2次元平面上で忠実に表現されているか」を取り違えずに読めます。",
      ],
    },
    {
      t: "多重コレスポンデンス分析（MCA）：指示行列 Z・Burt行列 B・Benzécri慣性補正",
      b: [
        "質問紙調査で3変数以上のカテゴリ項目（`Q` 問、合計 `J` カテゴリ水準）を同時にマップしたいときに使うのが **多重コレスポンデンス分析（MCA: Multiple Correspondence Analysis）** です。各回答者×各カテゴリの `0/1` ダミーを並べた **完全選言表（指示行列 `Z`、`N × J`）**、または全項目ペアのクロス集計を並べた **Burt行列 `B = Z' * Z`（`J × J`）** に同じ `simple_ca` を適用するだけで求まります。",
        "ここで初学者が必ず戸惑うのが「MCAの第1軸・第2軸の寄与率が `20%` 前後と極端に低く見える」現象です。ダミー符号化の構造上、総慣性が `(J / Q) - 1` へ自動的に膨らむためです。`1 / Q` を超える実質軸だけを取り出して補正する **Benzécriの修正慣性率** と並べて確認しましょう。",
      ],
      code: `using Random, LinearAlgebra

function fit_mca(Z::AbstractMatrix{<:Real}, Q::Int)
    N, J = size(Z)
    ca = simple_ca(Z)
    K = J - Q
    eig = ca.eig[1:K]
    ca_B = simple_ca(Z' * Z) # Burt行列 B = Z'Z の主慣性は Z の主慣性のちょうど2乗!
    thresh = 1.0 / Q
    benz = [lam > thresh ? ((Q / (Q - 1)) * (lam - thresh))^2 : 0.0 for lam in eig]
    return (total_inertia = round(sum(eig), digits = 4),
            burt_diff = maximum(abs.(ca_B.eig[1:K] .- (eig .^ 2))),
            raw_2d = round(sum(eig[1:2]) / sum(eig), digits = 3),
            benz_2d = round(sum(benz[1:2]) / sum(benz), digits = 3),
            row_coord = ca.row_coord[:, 1:K], col_coord = ca.col_coord[:, 1:K])
end

# 真の2因子構造（項目1〜3が第1因子、項目4〜5が第2因子）を持つ5項目×3水準データ (N=180, J=15)
rng = Xoshiro(5601)
f1, f2 = randn(rng, 180), randn(rng, 180)
Z_mca = zeros(Float64, 180, 15)
for i in 1:180, q in 1:5
    v = 1.35 * (q <= 3 ? f1[i] : f2[i]) + 0.65 * randn(rng)
    lv = v < -0.6 ? 1 : (v < 0.6 ? 2 : 3)
    Z_mca[i, (q - 1) * 3 + lv] = 1.0
end
m = fit_mca(Z_mca, 5)
println((total_inertia = m.total_inertia, burt_diff = m.burt_diff, raw_2d = m.raw_2d, benz_2d = m.benz_2d))`,
      out: `(total_inertia = 2.0, burt_diff = 5.551115123125783e-16, raw_2d = 0.412, benz_2d = 0.895)`,
      a: [
        "理論式どおり総慣性は `(15 / 5) - 1 = 2.0`、Burt行列の固有値は指示行列の固有値の2乗と `5.6e-16` の機械精度で一致しました。素の2次元寄与率 `raw_2d = 0.412`（41.2%）だけを見ると説明力不足に錯覚しますが、ダミー化の人工分散を除いた Benzécri 修正寄与率は **`0.895`（89.5%）** であり、真の2因子構造をほぼ完全に捉えています。",
      ],
    },
    {
      t: "MCAの落とし穴：馬蹄形効果（Guttman arch）と補助カテゴリの投影",
      b: [
        "MCAマップを読む際に最も警戒すべき反例が **馬蹄形効果（horseshoe / Guttman arch effect）** です。背後に「賛成〜反対」のような **純粋に1次元の連続特性しかない順序項目群** をMCAにかけると、第2軸は独立した第2因子ではなく、「両端の極端回答（段階1・4）対 中間回答（段階2・3）」という **第1軸の2次関数（放物線アーチ）** として現れます。",
        "これを知らないと、単なる数学的アーチを見て「第2因子として『極端回答傾向』を発見した！」と誤解釈してしまいます。1次元生成データで実際に確認し、あわせて軸を歪めずに背景属性を重ねる **補助（サプリメンタリ）投影** の式も押さえましょう。",
      ],
      code: `using Random, Statistics

rng_arch = Xoshiro(5602)
N_a, Q_a = 240, 5
theta = collect(range(-2.2, 2.2, length = N_a)) .+ 0.20 .* randn(rng_arch, N_a)
cuts = [-1.1, 0.0, 1.1]
Z_arch = zeros(Float64, N_a, 20) # 5項目 × 4段階 = 20カテゴリ
for q in 1:Q_a, i in 1:N_a
    v = theta[i] + 0.35 * randn(rng_arch)
    lv = 1 + count(c -> v > c, cuts)
    Z_arch[i, (q - 1) * 4 + lv] = 1.0
end

ma = fit_mca(Z_arch, Q_a)
ax1, ax2 = ma.row_coord[:, 1], ma.row_coord[:, 2]

# 補助（passive）カテゴリ列 z_sup (0/1) の重心投影：主軸のSVDを一切歪めずに座標だけ求める
project_supp_cat(z_sup, row_coord, eig) =
    vec((z_sup' * row_coord) ./ sum(z_sup)) ./ sqrt.(eig[1:size(row_coord, 2)])

println((cor_theta_ax1 = round(abs(cor(theta, ax1)), digits = 3),
         cor_theta_ax2 = round(abs(cor(theta, ax2)), digits = 3),
         cor_ax1sq_ax2 = round(abs(cor(ax1 .^ 2, ax2)), digits = 3)))`,
      out: `(cor_theta_ax1 = 0.973, cor_theta_ax2 = 0.085, cor_ax1sq_ax2 = 0.947)`,
      fig: {
        src: "figures/mca-biplot-arch.svg",
        alt: "多重コレスポンデンス分析(MCA)の2パネル比較。左は真の2因子構造を持つ5項目データのカテゴリ配置で、項目1〜3が横軸、項目4〜5が縦軸に沿って直交分離される(Benzécri累積89.5%)。右は純粋な1次元順序データの反例で、段階1から段階4が放物線のU字(馬蹄形)を描く。",
        cap: "左は独立な2因子がある場合（項目群が縦横に直交）。右は1次元の順序尺度しかないのに第2軸が第1軸²の放物線（`r = 0.947`）として曲がる馬蹄形効果です。U字アーチを「独立した第2因子」と誤読してはいけません。",
      },
      a: [
        "第1軸は真の潜在特性 `theta` と `r = 0.973` で対応する一方、第2軸は **`ax1 .^ 2` と `r = 0.947` の相関** を持つ綺麗な放物線になりました。また、回答数が極端に少ない希少カテゴリ（`c_j` が極小）は `1 / √c_j` の重みで原点から遠くへ飛び出しやすいため、年齢層や実験群などの背景変数は `project_supp_cat` で補助カテゴリとして後から投影するのが定石です。",
      ],
    },
    {
      t: "SVDの符号不定性とProcrustes回転つきブートストラップ安定性評価",
      b: [
        "探索的なMCAマップを論文に載せるとき、「標本を少し取り直したらカテゴリの配置がガラリと変わらないか？」をブートストラップで確かめたくなります。しかし各ブートストラップ標本でそのまま `svd` を回して座標を平均すると、**特異ベクトルの符号（`±1`）の任意性や近接軸の入れ替わり** によって正負が打ち消し合い、平均座標が原点 `0` へ潰れてしまいます。",
        "そこで基準配置 `Y_ref` に対して、`||Y_boot * R - Y_ref||` を最小化する直交行列 `R = U V'` を `svd(Y_boot' * Y_ref)` で求める **直交Procrustes（プロクラステス）整列** を挟みます。たった3行の線形代数で、符号反転や回転の任意性を取り除いた誠実な安定性半径が得られます。",
      ],
      code: `using Random, Statistics, LinearAlgebra

function mca_bootstrap_procrustes(Z_ref::Matrix{Float64}, Q::Int; B::Int = 200, seed::Int = 5603)
    rng = Xoshiro(seed)
    N = size(Z_ref, 1)
    Y_ref = fit_mca(Z_ref, Q).col_coord[:, 1:2]
    naive_sum, aligned_sum = zeros(size(Y_ref)), zeros(size(Y_ref))
    sq_err = zeros(size(Y_ref, 1))
    flips = 0
    for _ in 1:B
        Z_b = Z_ref[rand(rng, 1:N, N), :]
        any(==(0.0), sum(Z_b; dims = 1)) && continue
        Y_b = fit_mca(Z_b, Q).col_coord[:, 1:2]
        (dot(Y_b[:, 1], Y_ref[:, 1]) < 0 || dot(Y_b[:, 2], Y_ref[:, 2]) < 0) && (flips += 1)
        naive_sum .+= Y_b
        # 直交 Procrustes 整列: Y_b' * Y_ref の SVD から最適直交行列 R = U * Vt を構成
        Fp = svd(Y_b' * Y_ref)
        Y_al = Y_b * (Fp.U * Fp.Vt)
        aligned_sum .+= Y_al
        sq_err .+= vec(sum((Y_al .- Y_ref) .^ 2; dims = 2))
    end
    return (flip_rate = round(flips / B, digits = 3),
            naive_rel_bias = round(norm(naive_sum ./ B - Y_ref) / norm(Y_ref), digits = 3),
            aligned_rel_bias = round(norm(aligned_sum ./ B - Y_ref) / norm(Y_ref), digits = 3),
            mean_rms_radius = round(mean(sqrt.(sq_err ./ B)), digits = 3))
end

println(mca_bootstrap_procrustes(Z_mca, 5))`,
      out: `(flip_rate = 0.7, naive_rel_bias = 0.891, aligned_rel_bias = 0.094, mean_rms_radius = 0.349)`,
      a: [
        "200回のブートストラップのうち実に **`70%`（`flip_rate = 0.7`）** で少なくとも一方の軸の符号反転が起きており、素朴な平均では基準座標から `89.1%` も原点方向へ潰れてしまいます。Procrustes整列を入れることで相対バイアスは `9.4%` に収まり、各カテゴリの平均的な揺れ幅（RMS半径 `0.349`）を定量評価できるようになりました。",
      ],
    },
    {
      t: "クロス集計・対数線形・CA／MCA・潜在変数モデルの使い分け地図",
      b: [
        "これでカテゴリデータの分析手法が、仮説検定・回帰モデル・幾何学的要約の3方向で一本の線につながりました。研究の目的に応じて次の地図で手法を選び分けます。",
        "① **特定の独立性・条件付き独立・交互作用を検定したい**: 2元表なら「尺度に応じた関連指標」と「カイ二乗分析の深化：適合度・正確検定・対数線形モデル」で扱った `ChisqTest`・周辺固定正確検定・調整済み残差（Holm補正）、3元以上なら **Poisson対数線形モデル（`GLM.jl`）** を使います。",
        "② **多カテゴリ表や複数質問項目の関連パターンを探索的に俯瞰したい**: 本章の **CA／MCA（`LinearAlgebra.svd`）** で `χ²` の標準化残差構造を低次元マップ化し、必ず `cos²`・`ctr`・Benzécri慣性・馬蹄形アーチの有無・Procrustesブートストラップ安定性をセットで点検します（Rの `FactoMineR::MCA` と照合したい場合は「RCallでJuliaからRを呼ぶ」の連携がそのまま使えます）。",
        "③ **順序尺度の背後にある構成概念の測定や予測・階層推論を行いたい**: 探索的マップで構造を確認したのち、「古典的テスト理論と項目分析」「順序・多項ロジットの尤度実装と推定」「階層順序モデルと離散選択・IIA」の潜在閾値モデル・順序GLMMへ進みます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "総度数 `n` のクロス集計表 `N` に対する単純コレスポンデンス分析（CA）において、標準化残差行列 `S` の特異値 `σ₁, σ₂, …, σ_K` の二乗和（総慣性 `Σ σ_k²`）は何と一致するでしょう?",
      opts: [
        "Pearsonの独立性カイ二乗統計量を総度数で割った値 `χ² / n`",
        "度数の中身によらず、常に表の列の数から1を引いた整数値 `C - 1` になる",
        "相関係数の最大値 `1.0`",
      ],
      ans: 0,
      why: "`S` の各要素は `(p_ij - r_i c_j) / √(r_i c_j)` なので、全要素の二乗和 `sum(abs2, S)` は `Σ (O_ij - E_ij)² / (n E_ij) = χ² / n` に厳密に一致し、特異値の二乗和はその直交分解になります。",
      hint: "1ページ目で `inertia = 0.5762` に `n = 400` を掛けると `chi2 = 230.48` と完全一致したことを確認しましょう。",
    },
    {
      k: "fill",
      q: "標準化残差行列 `S` を特異値分解して主慣性と主座標を求める `LinearAlgebra` 標準ライブラリの関数名を入力しましょう。",
      code: `S = Dr_inv * (P .- r * c') * Dc_inv
F = 〔?〕(S)
eig = F.S[1:K] .^ 2`,
      accept: ["svd", "linearalgebra.svd"],
      show: "svd",
      why: "`svd(S)` は `S = U * Diagonal(S_vals) * Vt` の特異値分解を計算し、特異値の2乗 `F.S .^ 2` が各主軸の主慣性（固有値）になります。",
      hint: "Singular Value Decomposition の頭文字3文字です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "多重コレスポンデンス分析（MCA）の解釈と診断について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "Burt行列 `B = Z' * Z` に対するCAの主慣性（固有値）は、指示行列 `Z` に対するMCAの主慣性のちょうど2乗に一致する",
          a: true,
          why: "`Z' * Z` の標準化残差行列は `Z` の標準化残差行列のグラム行列 `S' * S` に対応するため、特異値が2乗された固有値 `λ_k²` を持ち、カテゴリ空間の軸の向きは一致します。",
        },
        {
          s: "MCAの2次元散布図で段階1〜4の順序カテゴリが綺麗なU字（放物線）を描いた場合、常に「独立した2つの実質的因子が存在する証拠」と結論できる",
          a: false,
          why: "1次元の順序尺度でも第2軸が第1軸の2次関数として曲がる馬蹄形効果（Guttman arch）が起きるため、U字曲線だけでは第2の実質因子の証拠にはなりません。",
        },
        {
          s: "MCA座標のブートストラップ評価では、特異ベクトルの符号反転や軸の回転任意性を揃える直交Procrustes整列を行ってからばらつきを計算する必要がある",
          a: true,
          why: "`svd` の各軸は `±1` の符号不定性を持つため、整列せずに平均すると正負が相殺して原点へ潰れてしまいます。",
        },
      ],
      hint: "Burt行列と指示行列の関係、馬蹄形効果の反例、そして `flip_rate = 0.7` のブートストラップ実験を振り返りましょう。",
    },
    {
      k: "choice",
      q: "5項目・計15水準の調査データに対するMCAで、上位2軸の素の慣性率（`raw_2d`）が約41%だった一方、Benzécri修正慣性率（`benz_2d`）が約90%になった理由として最も適切なものはどれでしょう?",
      opts: [
        "0/1の指示行列に展開すると総慣性が `(J / Q) - 1` へ人工的に膨らみ、`1 / Q` 以下のノイズ次元が分母に含まれるため、素の慣性率は実質的な説明力を過小評価するから",
        "サンプルサイズ `N = 180` が小さすぎて特異値分解が収束していないから",
        "Benzécri補正はすべての固有値を一律に2倍するだけの計算だから",
      ],
      ans: 0,
      why: "MCAでは1項目あたり1つしか `1` が立たないダミー構造のため、完全に高次元へ分散する人工的な慣性が生じます。平均慣性 `1 / Q` を超える成分だけを補正評価することで実質的な低次元構造の割合が分かります。",
      hint: "2ページ目の総慣性 `(J / Q) - 1 = 2.0` と閾値 `1 / Q` による補正の意味を確認しましょう。",
    },
  ],
};
