// 中級編7: 予測機械学習と検証 — Lasso・決定木・リーク防止CV
// 検証環境: Julia 1.12 / LinearAlgebra / Statistics / Random
export default {
  id: "regularization-trees-cv",
  title: "予測機械学習と検証：Lasso・決定木・リーク防止CV",
  tag: "軟閾値座標降下・木分割・置換重要度・交差検証リークを純Juliaで解き明かす",
  pages: [
    {
      t: "推論（係数の解釈）と予測（未知データへの汎化）を混同しない",
      b: [
        "「回帰診断とVIF」で触れたとおり、統計モデリングと予測機械学習では最初に見る評価軸が異なります。不偏推定量である最小二乗法（OLS）は「真のモデルが正しく、標本サイズが十分に大きい」ときに係数の偏りをゼロにしますが、説明変数 `P` が標本サイズ `N` に比べて多い場面では、訓練データの偶然のノイズまで追いかけ、**未知データでの予測誤差（分散）が爆発** します。",
        "Pythonでは `scikit-learn` の裏側（C++/Cython）に隠れている正則化や木モデルの学習ループも、Juliaなら素の配列操作だけでC言語並みの速度で動き、数式と1対1で対応づけて検証できます。まずは `N = 55, P = 30`（真に効く変数は3個だけ）のデータで、軟閾値作用素（soft-thresholding）による **Lasso（L1正則化）の座標降下法** を書いてOLSと対比しましょう。",
      ],
      code: `using Random, Statistics, LinearAlgebra

soft_thresh(z::Float64, gamma::Float64) = sign(z) * max(abs(z) - gamma, 0.0)

function fit_lasso_cd(X::Matrix{Float64}, y::Vector{Float64}, lam::Float64; maxiter::Int = 400)
    n, p = size(X)
    ym, xm = mean(y), vec(mean(X; dims = 1))
    xs = vec(std(X; dims = 1, corrected = false))
    Z = (X .- xm') ./ xs'
    b, r = zeros(Float64, p), y .- ym
    for _ in 1:maxiter
        max_diff = 0.0
        @views for j in 1:p
            zj, old_b = Z[:, j], b[j]
            new_b = soft_thresh(dot(zj, r) / n + old_b, lam)
            if new_b != old_b
                r .-= (new_b - old_b) .* zj
                b[j] = new_b
                max_diff = max(max_diff, abs(new_b - old_b))
            end
        end
        max_diff < 1e-9 && break
    end
    beta = b ./ xs
    return (intercept = ym - dot(xm, beta), beta_std = b, beta = beta)
end

rng = Xoshiro(4701)
X_tr = randn(rng, 55, 30)
true_b = vcat([1.6, -1.2, 0.9], zeros(27))
y_tr = 0.5 .+ X_tr * true_b .+ randn(rng, 55)
X_te = randn(rng, 300, 30)
y_te = 0.5 .+ X_te * true_b .+ randn(rng, 300)

b_ols = hcat(ones(55), X_tr) \\ y_tr
las = fit_lasso_cd(X_tr, y_tr, 0.32)
println((ols_train_rmse = round(sqrt(mean((y_tr .- hcat(ones(55), X_tr) * b_ols).^2)), digits = 3),
         ols_test_rmse  = round(sqrt(mean((y_te .- hcat(ones(300), X_te) * b_ols).^2)), digits = 3),
         lasso_test_rmse = round(sqrt(mean((y_te .- (las.intercept .+ X_te * las.beta)).^2)), digits = 3),
         nonzero_idx = findall(!iszero, las.beta_std)))`,
      out: `(ols_train_rmse = 0.582, ols_test_rmse = 1.83, lasso_test_rmse = 1.394, nonzero_idx = [1, 2, 3, 21])`,
      a: [
        "OLSは訓練RMSEこそ `0.582` と小さく見えますが、テストRMSEは **`1.83` へ3倍以上に悪化** しています。一方、軟閾値作用素 `soft_thresh` で `|ρ| ≤ λ` の微小相関を厳密に `0.0` へ切り落とすLassoは、27個の雑音変数のうち26個をゼロにしてテストRMSEを `1.394` に抑えました。内側のループで `@views` と残差ベクトル `r` の差分更新を使うため、ヒープ割当も発生しません。",
      ],
    },
    {
      t: "Lassoの共線性不安定と、分割前の事前スクリーニングが生むリーク",
      b: [
        "Lassoが係数を `0.0` にする性質は予測の軽量化には便利ですが、**「選ばれた変数＝真の因果変数、0になった変数＝無関係」と因果解釈してはいけません**。強い相関（共線性）を持つ2つの原因変数 `x₁, x₂` があると、Lassoは標本が少し揺れただけで片方だけを残してもう片方を `0.0` に落とします。",
        "もう一つの重大な罠が **交差検証（CV）より前に全データで変数選択や標準化を行うデータリーク** です。`N = 60, P = 300` の **完全な乱数ノイズ（真の `R² = 0`）** なのに、先に全60件で目的変数と相関が高い上位8列を選んでから5分割CVへ回すとどうなるか、各foldの訓練データ内部だけで選び直す誠実なCVと比較しましょう。",
      ],
      code: `using Random, Statistics

# 1. 共線性のもとでのLasso変数選択の不安定性 (r = 0.988 の2変数)
let rng_c = Xoshiro(4702), z = randn(rng_c, 80),
    Xc = hcat(z .+ 0.12 .* randn(rng_c, 80), z .+ 0.12 .* randn(rng_c, 80), randn(rng_c, 80, 6)),
    yc = 1.1 .* z .+ 0.7 .* randn(rng_c, 80),
    only1 = 0, only2 = 0, both = 0
    for _ in 1:100
        idx = rand(rng_c, 1:80, 80)
        fb = fit_lasso_cd(Xc[idx, :], yc[idx], 0.42)
        n1, n2 = !iszero(fb.beta_std[1]), !iszero(fb.beta_std[2])
        n1 && !n2 && (only1 += 1); !n1 && n2 && (only2 += 1); n1 && n2 && (both += 1)
    end
    println((cor_x1_x2 = round(cor(Xc[:, 1], Xc[:, 2]), digits = 3),
             only_x1 = only1, only_x2 = only2, both_selected = both))
end

# 2. 純ノイズ (真の R² = 0) での事前スクリーニング・リーク 対 fold内選択
function cv_r2_leak_vs_honest(X::Matrix{Float64}, y::Vector{Float64}; K::Int = 5, topk::Int = 8)
    n, fs = length(y), div(length(y), K)
    sel_leak = partialsortperm([abs(cor(@view(X[:, j]), y)) for j in axes(X, 2)], 1:topk; rev = true)
    p_leak, p_honest = similar(y), similar(y)
    for k in 1:K
        va = ((k - 1) * fs + 1):(k * fs)
        tr = setdiff(1:n, va)
        p_leak[va] = hcat(ones(length(va)), X[va, sel_leak]) * (hcat(ones(length(tr)), X[tr, sel_leak]) \\ y[tr])
        sel_tr = partialsortperm([abs(cor(@view(X[tr, j]), @view(y[tr])) ) for j in axes(X, 2)], 1:topk; rev = true)
        p_honest[va] = hcat(ones(length(va)), X[va, sel_tr]) * (hcat(ones(length(tr)), X[tr, sel_tr]) \\ y[tr])
    end
    sst = sum((y .- mean(y)).^2)
    return (leaked_cv_r2 = round(1 - sum((y .- p_leak).^2) / sst, digits = 3),
            honest_cv_r2 = round(1 - sum((y .- p_honest).^2) / sst, digits = 3))
end

rng_lk = Xoshiro(4704)
println(cv_r2_leak_vs_honest(randn(rng_lk, 60, 300), randn(rng_lk, 60)))`,
      out: `(cor_x1_x2 = 0.988, only_x1 = 14, only_x2 = 42, both_selected = 44)
(leaked_cv_r2 = 0.312, honest_cv_r2 = -0.404)`,
      fig: {
        src: "figures/lasso-path-leakage.svg",
        alt: "2パネル図。左はLassoの正則化パスで、log10(λ)が大きくなるほど27個の雑音係数が0に張り付き、真の3係数(+1.6, -1.2, +0.9)だけが生き残る。右は純ノイズデータ(N=60, P=300)の5分割CV R²比較で、分割前の変数選択リークは+0.312の偽の予測力を出すのに対し、fold内選択は-0.404で正しく棄却する。",
        cap: "左はLassoの係数パス（`Xoshiro(4701)`）。右は真の関連がゼロの乱数データにおける事前変数選択リークの反例です。検証foldの情報を1ミリでも前処理・変数選択に混ぜると、無から `R² = 0.312` が捏造されます。",
      },
      a: [
        "ブートストラップ100回中56回（`14 + 42`）で、同じ潜在要因を測る `x₁, x₂` の片方が `0` に切り捨てられました。さらに深刻なのが2つ目の出力で、完全にデタラメな乱数から **`leaked_cv_r2 = 0.312` という「もっともらしい予測精度」が偽造** されています。標準化・欠測補完・特徴量選択・ハイパーパラメータ調整は、必ず **各foldの訓練集合 `tr` の内側だけ** で完結させなければなりません（反復測定データなら「within／betweenデザインと混合効果モデル」で扱った参加者単位のグループ分割も必須です）。",
      ],
    },
    {
      t: "決定木（CART）の分割探索とランダムフォレスト・外挿の限界",
      b: [
        "説明変数の間に「`x₁ > 0` のときだけ `sin(1.5 x₂)` が効き、`x₁ ≤ 0` では `-1.6 x₃` が効く」といった非線形・条件分岐の交互作用がある場合、式を手で指定しない **決定木（CART）** とそのアンサンブルが威力を発揮します。特徴量ごとに添字をソートして累積和を走査すれば、全分割点の残差平方和（SSE）最小化を純Juliaで高速に書けます。",
        "ただし、深い単一木は葉ごとに少数標本を丸暗記して過学習します。ブートストラップ標本＋特徴量のランダム部分抽出（`mtry`）で木を多様化して平均する **ランダムフォレスト（Random Forest）** で分散を抑えつつ、木モデル最大の弱点である **訓練範囲外への外挿不能性** も実測で確かめましょう。",
      ],
      code: `using Random, Statistics

struct TreeNode
    feat::Int; thresh::Float64; val::Float64
    left::Union{Nothing, TreeNode}; right::Union{Nothing, TreeNode}
end

function fit_reg_tree(X::Matrix{Float64}, y::Vector{Float64}, rows::Vector{Int}, depth::Int;
                      max_depth::Int = 6, min_leaf::Int = 4, mtry::Int = size(X, 2), rng = nothing)
    m, n_r = mean(@view y[rows]), length(rows)
    (depth >= max_depth || n_r < 2 * min_leaf) && return TreeNode(0, 0.0, m, nothing, nothing)
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
    best_f == 0 && return TreeNode(0, 0.0, m, nothing, nothing)
    return TreeNode(best_f, best_th, m,
        fit_reg_tree(X, y, [i for i in rows if X[i, best_f] <= best_th], depth + 1; max_depth, min_leaf, mtry, rng),
        fit_reg_tree(X, y, [i for i in rows if X[i, best_f] > best_th], depth + 1; max_depth, min_leaf, mtry, rng))
end

pred_tree(nd::TreeNode, x) = (while nd.feat != 0; nd = x[nd.feat] <= nd.thresh ? nd.left : nd.right; end; nd.val)

rng_t = Xoshiro(4703)
X_nl = rand(rng_t, 160, 5) .* 4 .- 2
f_nl(X) = [x[1] > 0 ? 2.2 * sin(1.5 * x[2]) : -1.6 * x[3] for x in eachrow(X)]
y_nl = f_nl(X_nl) .+ 0.45 .* randn(rng_t, 160)
X_nl_te = rand(rng_t, 300, 5) .* 4 .- 2
y_nl_te = f_nl(X_nl_te) .+ 0.45 .* randn(rng_t, 300)

b_lin = hcat(ones(160), X_nl) \\ y_nl
deep_tr = fit_reg_tree(X_nl, y_nl, collect(1:160), 0; max_depth = 10, min_leaf = 2)
forest = [fit_reg_tree(X_nl, y_nl, rand(rng_t, 1:160, 160), 0; max_depth = 6, min_leaf = 4, mtry = 3, rng = rng_t) for _ in 1:50]
pred_rf(F, X) = [mean(pred_tree(tr, @view X[i, :]) for tr in F) for i in axes(X, 1)]

println((ols_test_rmse = round(sqrt(mean((y_nl_te .- hcat(ones(300), X_nl_te) * b_lin).^2)), digits = 3),
         tree_train = round(sqrt(mean((y_nl .- [pred_tree(deep_tr, @view X_nl[i, :]) for i in 1:160]).^2)), digits = 3),
         tree_test  = round(sqrt(mean((y_nl_te .- [pred_tree(deep_tr, @view X_nl_te[i, :]) for i in 1:300]).^2)), digits = 3),
         rf_test_rmse = round(sqrt(mean((y_nl_te .- pred_rf(forest, X_nl_te)).^2)), digits = 3),
         extrap_true = -8.0, extrap_rf = round(pred_rf(forest, [-1.0 0.0 5.0 0.0 0.0])[1], digits = 3)))`,
      out: `(ols_test_rmse = 1.426, tree_train = 0.296, tree_test = 1.073, rf_test_rmse = 0.886, extrap_true = -8.0, extrap_rf = -2.233)`,
      a: [
        "線形OLS（`1.426`）や過学習した単一木（訓練 `0.296` → テスト `1.073`）に対し、50本のランダムフォレストはテストRMSEを **`0.886`** まで下げました。しかし同時に、訓練範囲 `[-2, 2]` を外れた `x₃ = 5.0`（真の値は `-8.0`）を入れると、予測値は **`-2.233` で頭打ち** になります。決定木系の予測は訓練データの葉平均の凸結合なので、**訓練データの最小値・最大値の外側へは原理的に外挿できません**。時間トレンドや物理法則の外挿には、構造モデルや「潜在クラスタEM・逆伝播と科学機械学習（SciML）」のハイブリッド手法が必要です。",
      ],
    },
    {
      t: "置換重要度（Permutation Importance）による貢献度点検",
      b: [
        "ランダムフォレストや勾配ブースティングでよく使われる「不純度減少量（Gini / SSE importance）」は、**訓練データ上で評価されるため、連続乱数や水準数の多いID列を『重要』と誤認しやすい** 欠点があります。",
        "モデルの種類を問わず誠実に「その特徴量が予測にどれだけ不可欠か」を測るには、**独立したテストデータ上で列 `j` だけをランダムにシャッフルし、テストMSEがどれだけ悪化するか** を見る **置換重要度（Permutation Importance）** を使います。上の `forest`（真に効くのは `x₁, x₂, x₃`、`x₄, x₅` は完全な無関係ノイズ）で計算しましょう。",
      ],
      code: `base_mse = mean((y_nl_te .- pred_rf(forest, X_nl_te)).^2)
perm_imp = [let Xp = copy(X_nl_te)
    Xp[:, j] = Xp[randperm(rng_t, size(Xp, 1)), j]
    mean((y_nl_te .- pred_rf(forest, Xp)).^2) - base_mse
end for j in 1:5]

println((feature_names = ["x1(分岐)", "x2(sin)", "x3(線形)", "x4(雑音)", "x5(雑音)"],
         mse_increase = round.(perm_imp, digits = 3)))`,
      out: `(feature_names = ["x1(分岐)", "x2(sin)", "x3(線形)", "x4(雑音)", "x5(雑音)"], mse_increase = [1.431, 1.9, 2.146, 0.0, 0.007])`,
      a: [
        "真の生成過程に含まれる `x₁, x₂, x₃` を壊すとテストMSEが `1.43〜2.15` 跳ね上がる一方、無関係な `x₄, x₅` をシャッフルしてもMSE悪化は `0.000` と `0.007` に留まりました。ただし、強い相関を持つ2特徴量がある場合は「片方をシャッフルしてももう片方が肩代わりして重要度が低く見える」ため、相関構造の確認とセットで読みます。",
      ],
    },
    {
      t: "MLJ.jl の統一パイプラインと実務エコシステムの選び分け",
      b: [
        "ここまで素のJuliaで書いた「fold内前処理＋正則化・木モデル＋交差検証」を、実データ分析で型安全に束ねる標準フレームワークが **`MLJ.jl`** です。`Standardizer` と学習器を `Pipeline` として1つの機械（`machine`）にまとめれば、`evaluate!` が各foldの訓練データだけで平均・SDや木分割を学習し、検証リークを構造的に防ぎます。",
        "一方、大規模な勾配ブースティング周辺ツール（`LightGBM` + `SHAP`）や学習済み深層モデルがすでにPython側で固まっている案件では、無理に再実装せず「PythonCallでPythonの機械学習資産と分業する」の方法で呼び出すのが賢明です。",
      ],
      code: `# 実務パッケージ接続イメージ (MLJ.jl: 100種類以上の学習器を同じパイプラインAPIで検証)
# using MLJ
# RidgeRegressor = @load RidgeRegressor pkg=MLJLinearModels
# pipe = Standardizer() |> RidgeRegressor(lambda = 0.5)
# mach = machine(pipe, X_table, y_vec)
# evaluate!(mach, resampling = CV(nfolds = 5, shuffle = true, rng = 4701), measure = rmse)`,
      a: [
        "ブラックボックスとしてAPIを叩く前に「軟閾値がなぜ0を作るか」「なぜ分割前のスクリーニングが偽の `R²` を生むか」「なぜ木モデルは外挿できないか」を自分のコードで確かめておくと、`MLJ.jl` でもPythonでも検証ミスを見抜けるようになります。次は上級編「潜在クラスタEM・逆伝播と科学機械学習（SciML）」へ進みましょう。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "標本サイズ `N = 60`・候補特徴量 `P = 300` のデータで、まず全60件を使って目的変数 `y` との相関が高い上位10特徴量を選び、その10特徴量だけを使って5分割交差検証（CV）を回したところ `CV R² = 0.31` になりました。この評価の最大の問題はどれでしょう?",
      opts: [
        "5分割ではなく10分割CVにしなかったため、過小評価になっている",
        "分割前に検証foldの目的変数 `y` を使って特徴量を選んでおり（データリーク）、純粋な乱数ノイズからでも高い `CV R²` が偽造される",
        "線形回帰ではなくランダムフォレストを使えば、事前選択してもリークは起きない",
        "特徴量を標準化してから全件スクリーニングすれば問題ない",
      ],
      ans: 1,
      why: "検証foldの `y` を1度でも特徴量選択や前処理に使ってしまうと、検証データはもはや「未知データ」ではありません。モデルの種類を問わず、変数選択・標準化・ハイパーパラメータ探索は必ず各foldの訓練データの内側だけで行う必要があります。",
      hint: "検証foldの行が「上位10特徴量を選ぶ計算」に混ざっていないか考えます。",
    },
    {
      k: "fill",
      q: "Lassoの座標降下法で、`z` の大きさが罰則閾値 `gamma` 以下なら厳密に `0.0` にし、超えた分だけ原点側へ縮める軟閾値作用素（soft-thresholding）を書きます。空欄〔?〕に入る関数名を入力しましょう。",
      code: `soft_thresh(z::Float64, gamma::Float64) = sign(z) * 〔?〕(abs(z) - gamma, 0.0)`,
      accept: ["max"],
      show: "max",
      why: "`abs(z) - gamma` が負のときに `0.0` で打ち切る `max(abs(z) - gamma, 0.0)` に符号 `sign(z)` を掛けることで、`[-gamma, gamma]` の区間が厳密な `0.0` になりスパース解が得られます。",
      hint: "2つの値のうち大きい方（0未満なら0.0）を返す標準関数です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "Lasso正則化と決定木・ランダムフォレストの性質について、正しいか判定しましょう。",
      items: [
        {
          s: "強く相関する2つの真の原因変数があるとき、Lassoが片方の係数を `0.0` にしたなら、その変数は目的変数に因果効果を持たないと結論できる",
          a: false,
          why: "共線性がある複数の変数に対してLassoはどれか1つだけを恣意的に残しやすく、標本の揺れで選ばれる変数が入れ替わります。係数が0になったことは無関連や無効果の証明にはなりません。",
        },
        {
          s: "決定木やランダムフォレストの回帰予測は訓練データの葉平均の組み合わせになるため、訓練データの観測範囲を大きく外れた領域へ直線や曲線トレンドを外挿することはできない",
          a: true,
          why: "木モデルは入力空間を矩形に区切って各領域内の訓練 `y` の平均を返すため、予測値は訓練データの最小値〜最大値の範囲内に留まり、範囲外では平坦に頭打ちになります。",
        },
        {
          s: "テストデータ上で特定の特徴量列をランダムにシャッフルしても予測誤差がまったく悪化しない場合、そのモデルはその特徴量の情報にほとんど依存していない（ただし強い相関変数による代替には注意する）",
          a: true,
          why: "置換重要度（Permutation Importance）の基本原理です。未知データ上での実際の予測悪化量を測るため、訓練データ上の不純度重要度より過学習の偏りを受けにくくなります。",
        },
      ],
      hint: "共線性下のL1選択の不安定さ、葉平均の値域、置換重要度の定義を順に確認します。",
    },
    {
      k: "choice",
      q: "1人の参加者から20試行ずつ反復測定したデータ（40人×20試行＝800行）で、「新しい参加者に対する予測精度」を交差検証で評価したいときの適切な分割方法はどれでしょう?",
      opts: [
        "800行をランダムにシャッフルして5分割し、同じ参加者の試行が訓練と検証の両方に入るようにする",
        "参加者ID単位でグループ分け（Grouped CV）し、同一参加者の全20試行が必ず訓練側か検証側のどちらか一方だけに属するように分割する",
        "各参加者の最初の19試行を訓練、最後の1試行を検証に固定すれば個人差のリークは起きない",
        "正則化パラメータを大きくすればランダム行分割でも参加者リークは消える",
      ],
      ans: 1,
      why: "「新しい参加者への汎化」を知りたいのに同じ参加者の試行が訓練と検証に跨がると、モデルが参加者固有のベースラインを記憶して検証精度が不当に高く見えてしまいます。配備・予測の単位に合わせて参加者単位でグループ分割します。",
      hint: "「未知の誰に予測したいのか」という配備単位と分割単位を一致させます。",
    },
  ],
};
