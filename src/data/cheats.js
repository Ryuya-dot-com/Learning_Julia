// チートシートのデータ（カリキュラム全域対応）
export const CHEAT_GROUPS = [
  "すべて",
  "基礎",
  "データ操作・保存",
  "可視化・統計・モデル",
  "高速化・並列・独自推定",
];

export const CHEATS = [
  {
    title: "表示",
    group: "基礎",
    rows: [
      ["println(x)", "表示して改行する"],
      ["print(x)", "改行なしで表示する"],
      ["# メモ", "コメント(実行されない)"],
    ],
  },
  {
    title: "計算",
    group: "基礎",
    rows: [
      ["+ - * /", "四則演算(/ は小数になる)"],
      ["2 ^ 3", "べき乗(→ 8)"],
      ["7 ÷ 2  /  7 % 2", "整数の商(3)/ 余り(1)"],
      ["x += 1", "x = x + 1 の省略形"],
    ],
  },
  {
    title: "型と数値精度",
    group: "基礎",
    rows: [
      ["typeof(x)", "型を調べる"],
      ["Int64 / Float64", "整数 / 倍精度小数"],
      ["String / Bool", "文字列 / 真偽値"],
      ["isapprox(a, b)", "丸め誤差を考慮して比べる"],
    ],
  },
  {
    title: "文字列",
    group: "基礎",
    rows: [
      ["\"あいう\"", "ダブルクォートで囲む"],
      ["\"A\" * \"B\"", "連結(→ \"AB\")"],
      ["\"$(x) 点\"", "変数の埋めこみ"],
      ["length(s) / strip(s)", "文字数 / 前後空白の除去"],
    ],
  },
  {
    title: "配列",
    group: "基礎",
    rows: [
      ["x = [1, 2, 3]", "配列を作る"],
      ["x[1] / x[end]", "最初 / 最後の要素(1始まり)"],
      ["push!(x, 9)", "末尾に追加する"],
      ["sum(x) / length(x)", "合計 / 要素数"],
    ],
  },
  {
    title: "条件分岐",
    group: "基礎",
    rows: [
      ["if 条件 ... end", "もし〜なら"],
      ["elseif / else", "条件の追加 / それ以外"],
      ["== != > >= < <=", "比較演算子(= は代入)"],
      ["&& / ||", "かつ / または"],
    ],
  },
  {
    title: "くり返し",
    group: "基礎",
    rows: [
      ["for i in 1:5 ... end", "1〜5 でくり返す"],
      ["for d in 配列 ... end", "要素を順に処理する"],
    ],
  },
  {
    title: "関数",
    group: "基礎",
    rows: [
      ["function f(x) ... end", "関数を定義する"],
      ["return 値", "値を返す"],
      ["f(x) = x^2", "1行の短縮形"],
    ],
  },
  {
    title: "パッケージ(REPLで ] を押す)",
    group: "基礎",
    rows: [
      ["] add CSV", "パッケージを追加する(初回のみ)"],
      ["using CSV", "入れたパッケージを読みこむ"],
      ["Backspace", "パッケージモードから julia> に戻る"],
    ],
  },
  {
    title: "基本統計(using Statistics)",
    group: "基礎",
    rows: [
      ["mean(x) / std(x)", "平均 / 標本標準偏差"],
      ["median(x) / quantile(x, p)", "中央値 / 分位点"],
      ["maximum(x) / minimum(x)", "最大 / 最小"],
      ["round(x, digits=2)", "小数第2位に丸める(表示用)"],
    ],
  },
  {
    title: "ドット記法・内包表記・欠損値",
    group: "データ操作・保存",
    rows: [
      ["f.(x) / x .+ 1", "全要素に関数・演算を適用"],
      ["[x^2 for x in xs if x > 0]", "条件つきの配列内包表記"],
      ["Dict(\"cong\" => 1)", "キーと値の辞書を作る"],
      ["ismissing(x) / skipmissing(v)", "欠損判定 / 欠損を除いて集計"],
    ],
  },
  {
    title: "表の読み書き・保存(CSV / Arrow / JLD2)",
    group: "データ操作・保存",
    rows: [
      ["CSV.read(\"d.csv\", DataFrame)", "CSVを表として読みこむ"],
      ["CSV.write(\"out.csv\", df)", "DataFrameをCSVで書き出す"],
      ["Arrow.write(\"out.arrow\", df)", "型を保って高速・省容量保存"],
      ["jldsave(\"out.jld2\"; res)", "Julia構造体や結果を保存"],
    ],
  },
  {
    title: "DataFramesの加工・集計・結合",
    group: "データ操作・保存",
    rows: [
      ["select(df, :id, :rt)", "必要な列だけを選ぶ"],
      ["subset(df, :rt => ByRow(<(800)))", "条件に合う行を残す"],
      ["combine(groupby(df, :cond), :rt => mean)", "条件ごとに集計する"],
      ["leftjoin(a, b, on = :id)", "キー列で2つの表を結合"],
      ["stack(df, Not(:id)) / unstack", "縦長(long) ⇄ 横広(wide)変換"],
    ],
  },
  {
    title: "再現環境・プロジェクト管理",
    group: "データ操作・保存",
    rows: [
      ["] activate .", "そのフォルダ専用環境を有効化"],
      ["] instantiate", "Manifest通りに版を完全復元"],
      ["julia --project=. run.jl", "スクリプトを非対話で再現実行"],
      ["joinpath(@__DIR__, \"data\")", "OSに依存しない相対パス結合"],
    ],
  },
  {
    title: "探索と論文図(StatsPlots / CairoMakie)",
    group: "可視化・統計・モデル",
    rows: [
      ["histogram(df.rt, bins = 6)", "分布のかたちを素早く確認"],
      ["@df df boxplot(:cond, :rt)", "条件別の四分位数と中央値"],
      ["fig = Figure(); ax = Axis(fig[1, 1])", "Makieの図と軸を組み立てる"],
      ["scatter!(ax, x, y) / rangebars!(...)", "生データと信頼区間を重ね描き"],
    ],
  },
  {
    title: "確率分布と明示RNG(Random / Distributions)",
    group: "可視化・統計・モデル",
    rows: [
      ["rng = Xoshiro(2026)", "再現可能な乱数生成器を作る"],
      ["d = Normal(500, 50)", "分布を1つの値として作る"],
      ["rand(rng, d, 100)", "明示RNGから乱数を引く"],
      ["cdf(d, x) / ccdf(d, x) / logpdf(d, x)", "累積確率・上側確率・対数密度"],
    ],
  },
  {
    title: "仮説検定と区間(HypothesisTests)",
    group: "可視化・統計・モデル",
    rows: [
      ["UnequalVarianceTTest(a, b)", "Welchの2標本t検定"],
      ["MannWhitneyUTest(a, b)", "順位に基づく2群比較"],
      ["pvalue(t) / confint(t)", "p値 / 信頼区間を取り出す"],
    ],
  },
  {
    title: "回帰・GLM・混合効果モデル",
    group: "可視化・統計・モデル",
    rows: [
      ["lm(@formula(y ~ x + z), df)", "線形回帰(OLS)を当てはめる"],
      ["glm(@formula(y ~ x), df, Binomial(), LogitLink())", "ロジスティック回帰(二値応答)"],
      ["fit(MixedModel, @formula(y ~ 1 + x + (1 | id)), df)", "参加者変量効果を含む混合モデル"],
      ["coef(m) / stderror(m) / confint(m)", "推定係数・標準誤差・95%区間"],
    ],
  },
  {
    title: "型安定性とメモリ割当(中級)",
    group: "高速化・並列・独自推定",
    rows: [
      ["@code_warntype f(x)", "型不安定な変数(Any / Union)を診断"],
      ["@views X[:, j]", "列スライスをコピーせず参照する"],
      ["rand!(rng, buf) / copy(buf)", "事前確保配列の再利用 / 履歴保存"],
      ["@allocated f(x)", "2回目以降のヒープ割当バイト数"],
    ],
  },
  {
    title: "並列乱数・自作尤度・分割集計(中級)",
    group: "高速化・並列・独自推定",
    rows: [
      ["Xoshiro(UInt64[seed, i])", "反復IDごとに独立な再現可能RNG"],
      ["Threads.@threads for i in 1:R", "事前に確保した配列へ並列書込"],
      ["2 * (ll_max - ll(θ)) <= 3.841", "1母数の95%プロファイル尤度区間"],
      ["CSV.Chunks(path; ntasks = 4)", "巨大CSVを分割して逐次・省メモリ処理"],
    ],
  },
  {
    title: "微分方程式・確率過程・状態空間(上級)",
    group: "高速化・並列・独自推定",
    rows: [
      ["rhs!(du, u, p, t) / @. tmp = ...", "割当ゼロのin-place右辺関数と融合更新"],
      ["x += v * dt + sqrt(dt) * randn(rng)", "Euler–Maruyama法の√dtノイズ更新"],
      ["K = P_pred / (P_pred + r^2)", "1次元カルマンフィルタのゲイン"],
      ["-0.5 * (log(2π * F) + innov^2 / F)", "予測誤差分解による周辺対数尤度"],
    ],
  },
  {
    title: "MCMC・HMCと収束診断(上級)",
    group: "高速化・並列・独自推定",
    rows: [
      ["log(rand(rng)) < lp_prop - lp", "対数空間でのMetropolis受理判定"],
      ["r += 0.5 * eps * grad; q += eps * r", "HMCのLeapfrogシンプレクティック更新"],
      ["delta_H = H_new - H_old", "エネルギー保存誤差(急増はdivergence)"],
      ["ess_1d(draws) / split_rhat(chains)", "有効サンプル数とチェーン間混合診断"],
    ],
  },
  {
    title: "順序・多項・離散選択(中級・上級)",
    group: "高速化・並列・独自推定",
    rows: [
      ["c[k] = c[k - 1] + exp(raw[k])", "順序ロジット閾値の昇順制約を無制約化"],
      ["m = maximum(z); m + log(sum(exp.(z .- m)))", "桁あふれしない logsumexp と softmax"],
      ["eigen(SymTridiagonal(zeros(M), sqrt.(1:M-1)))", "順序混合モデル(CLMM)のGauss–Hermite求積"],
      ["u_i = sigma_u * z_i; y ~ OrderedLogistic(...)", "非中心化パラメータ化による階層順序HMC"],
    ],
  },
  {
    title: "カイ二乗・対数線形・コレスポンデンス分析(中級・上級)",
    group: "可視化・統計・モデル",
    rows: [
      ["g2 = 2 * sum(o * log(o / e))", "尤度比統計量 G² (Poisson対数線形モデルの残差逸脱度)"],
      ["shuffle!(rng, col_pool)", "周辺度数を固定した R×C モンテカルロ正確独立性検定"],
      ["S = Dr_inv * (P .- r * c') * Dc_inv; svd(S)", "χ²/n を直交分解するコレスポンデンス分析(CA・MCA)"],
      ["Fp = svd(Y_b' * Y_ref); Y_b * (Fp.U * Fp.Vt)", "SVDの符号反転・回転を揃える直交Procrustes整列"],
    ],
  },
  {
    title: "機械学習・SciML・Python連携(中級・上級・橋)",
    group: "高速化・並列・独自推定",
    rows: [
      ["sign(z) * max(abs(z) - lam, 0.0)", "Lasso座標降下法の軟閾値作用素(スパース解)"],
      ["pipe = Standardizer() |> model", "MLJ.jl で前処理を各fold内へ閉じ込めリークを防ぐ"],
      ["du = f_known(u, t) + nn(u, ps, st)", "既知微分方程式とNNを融合するハイブリッドSciML(UDE)"],
      ["pyimport(\"sklearn\") / pyconvert(Vector{Float64}, x)", "PythonCall.jl によるPython学習器呼び出しと型安全変換"],
    ],
  },
  {
    title: "多次元可視化・AoG・モデル診断図(中級・上級)",
    group: "可視化・統計・モデル",
    rows: [
      ["linkxaxes!(ax1, ax2) / Label(fig[1, 1, TopLeft()], \"A\")", "Makieの複合パネル軸同期と論文パネル記号"],
      ["data(df) * mapping(:x, :y, col = :g) * (visual(Scatter) + linear())", "AlgebraOfGraphics.jl のファセット＋重ね描き"],
      ["band!(ax, xs, logistic.(lo), logistic.(hi)) / colorrange = (-m, m)", "定義域を守るリンク尺度リボンとゼロ中心発散配色"],
      ["streamplot!(ax, f, -3..3, -3..3) / @lift($(slider.value) .* ts)", "2次元位相平面のベクトル場とObservable対話更新"],
    ],
  },
  {
    title: "開発快適化・テスト・論文表出力(実用ツール)",
    group: "データ操作・保存",
    rows: [
      ["using Revise; includet(\"src/fns.jl\")", "再起動ゼロで関数保存を即時反映(TTFX回避)"],
      ["@testset \"...\" begin @test isapprox(a, b; atol=1e-8) end", "標準Testで前処理・集計の自動検算を固定"],
      ["@test_throws ArgumentError f(bad)", "異常入力で黙って壊れず意図した例外で止まるか検証"],
      ["@btime f($x)", "グローバル変数を$補間しウォームアップ後の最小時間を計測"],
      ["julia --startup-file=no --project=. run.jl", "個人設定を遮断した論文提出前のクリーン再現実行"],
      ["pretty_table(io, df; backend = Val(:latex))", "集計表からLaTeX三線表やMarkdown表を直出力"],
      ["500u\"ms\" + 0.25u\"s\"  (Unitful.jl)", "物理単位の自動換算と次元不一致エラー検出"],
      ["methods(f) / @which f(x, y)", "多重ディスパッチの一覧と引数型ペアで選ばれた定義を確認"],
      ["isbitstype(T) / sizeof(T)", "不変structがポインタなしの連続メモリ配置か検証"],
      [":(a * x + b) / @macroexpand @. y = f(x)", "構文木Exprの取得とマクロ展開後のコードを確認"],
    ],
  },
];
