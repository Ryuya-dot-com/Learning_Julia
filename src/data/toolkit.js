// Julia実用ツールキットのデータ定義:
// 1) ROSETTA_ITEMS: R・Python経験者のための逆引き対訳辞典（注意点・関連レッスン直リンクつき）
// 2) STARTER_RECIPES: 目的別のそのまま動く分析スタータースクリプト雛形（.jl保存対応）

export const ROSETTA_GROUPS = [
  "すべて",
  "配列・基礎",
  "表操作・入出力",
  "統計・回帰・混合モデル",
  "可視化・機械学習・微分方程式",
];

export const ROSETTA_ITEMS = [
  {
    id: "seq-linspace",
    group: "配列・基礎",
    task: "等間隔の数列・グリッドを作る",
    rCode: "seq(0, 1, length.out = 5) / seq(0, 10, by = 2)",
    pyCode: "np.linspace(0.0, 1.0, 5) / np.arange(0, 11, 2)",
    juliaCode: `range(0.0, 1.0; length = 5)   # メモリを消費しない遅延範囲
collect(0:2:10)               # 実配列が必要なら collect (終端10を含む!)`,
    pitfall: "Pythonの `range` / `np.arange` は終端を含みませんが、Juliaの `0:2:10` は R と同じく終端 `10` を含みます。",
    lessonId: "arrays",
    lessonTitle: "配列",
  },
  {
    id: "index-slice-view",
    group: "配列・基礎",
    task: "添字アクセス・末尾要素・コピーなし部分参照",
    rCode: "x[1]; x[length(x)]; X[, j]",
    pyCode: "x[0]; x[-1]; X[:, j]  # NumPyスライスはview",
    juliaCode: `x[1]; x[end]
col_copy = X[:, j]        # 既定のスライスは新しい配列へコピー
col_view = @views X[:, j] # 割当ゼロの参照(書き換えると元の X も変わる)`,
    pitfall: "Juliaは **1始まり・終端含む・列優先（column-major）** です。ループ内の列参照は `@views X[:, j]` で高速化できます。",
    lessonId: "type-stability-allocation",
    lessonTitle: "型安定性とメモリ割当",
  },
  {
    id: "broadcast-ifelse",
    group: "配列・基礎",
    task: "要素ごとの関数適用と条件置換（ベクトル化）",
    rCode: "log(x); ifelse(rt < 200, NA, rt)",
    pyCode: "np.log(x); np.where(rt < 200, np.nan, rt)",
    juliaCode: `log.(x)
ifelse.(rt .< 200, missing, rt)
[r < 200 ? missing : r for r in rt] # 短絡評価したいときは内包表記`,
    pitfall: "Juliaでは任意の自作関数 `f` も `f.(x)` のドット1つで要素ごとに融合実行され、一時配列を作りません。",
    lessonId: "broadcasting",
    lessonTitle: "ドット記法(ブロードキャスト)",
  },
  {
    id: "missing-coalesce",
    group: "配列・基礎",
    task: "欠損値の判定・除外・既定値への置換",
    rCode: "is.na(x); mean(x, na.rm = TRUE); dplyr::coalesce(x, 0)",
    pyCode: "pd.isna(x); np.nanmean(x); s.fillna(0)",
    juliaCode: `ismissing.(x)
mean(skipmissing(x))
coalesce.(x, 0) # missing を 0 に置換 (NaN は isnan で別判定)`,
    pitfall: "`x == missing` は `Bool` ではなく `missing`（三値論理）を返します。欠損判定には必ず `ismissing(x)` を使います。",
    lessonId: "dict-missing",
    lessonTitle: "辞書と欠損値",
  },
  {
    id: "std-ddof",
    group: "配列・基礎",
    task: "標本標準偏差・分散（不偏分散 n-1 と母分散 n）",
    rCode: "sd(x); var(x)  # Rは n-1 割り",
    pyCode: "np.std(x, ddof=1)  # 注意: np.std(x) 既定は ddof=0 (n割り)!",
    juliaCode: `using Statistics
std(x)                    # 既定は corrected = true (n - 1 割り、Rやpandasと同じ)
std(x; corrected = false) # NumPy 既定の n 割りが必要なとき`,
    pitfall: "Python（NumPy / scikit-learn `StandardScaler`）から移植する際、`corrected = false` の有無で標準化スケールが微妙にズレる点に注意します。",
    lessonId: "first-data-analysis",
    lessonTitle: "データ解析に挑戦",
  },
  {
    id: "rng-seed",
    group: "配列・基礎",
    task: "再現可能な乱数シードと独立ストリーム",
    rCode: "set.seed(42); rnorm(10)",
    pyCode: "rng = np.random.default_rng(42); rng.standard_normal(10)",
    juliaCode: `using Random, Distributions
rng = Xoshiro(42)
randn(rng, 10)
rand(rng, Normal(500, 50), 10)`,
    pitfall: "グローバルな `Random.seed!(42)` より、明示的な `rng = Xoshiro(42)` を関数へ渡す設計にすると他パッケージや並列実行で乱数列が壊れません。",
    lessonId: "randomness-reproducibility",
    lessonTitle: "乱数・標本抽出・再現性",
  },
  {
    id: "csv-io",
    group: "表操作・入出力",
    task: "CSVの読み書きと欠損文字列の指定",
    rCode: "readr::read_csv('data.csv', na = c('', 'NA')); write_csv(df, 'out.csv')",
    pyCode: "pd.read_csv('data.csv', na_values=['NA']); df.to_csv('out.csv', index=False)",
    juliaCode: `using CSV, DataFrames
df = CSV.read("data.csv", DataFrame; missingstring = ["", "NA"])
CSV.write("out.csv", df)`,
    pitfall: "Juliaの `CSV.write` はRの `row.names=TRUE` や `pandas` 既定のような余計な行番号列を勝手に書き出しません。大容量中間表には `Arrow.write` も有効です。",
    lessonId: "dataframes-introduction",
    lessonTitle: "CSV.jl & DataFrames.jl 入門",
  },
  {
    id: "filter-subset",
    group: "表操作・入出力",
    task: "条件で行を絞り込む・列を選ぶ",
    rCode: "df |> filter(rt < 1000, cond == 'A') |> select(id, rt)",
    pyCode: "df.query(\"rt < 1000 and cond == 'A'\")[['id', 'rt']]",
    juliaCode: `sub = subset(df, :rt => ByRow(<(1000)), :cond => ByRow(==("A")); skipmissing = true)
select(sub, :id, :rt)`,
    pitfall: "実データに `missing` が混じると比較結果が `missing` になりエラーになるため、`subset(..., skipmissing = true)` を付けるのが安全です。",
    lessonId: "dataframes-introduction",
    lessonTitle: "CSV.jl & DataFrames.jl 入門",
  },
  {
    id: "mutate-transform",
    group: "表操作・入出力",
    task: "新しい列を追加・変換する（mutate / assign）",
    rCode: "df |> mutate(log_rt = log(rt), z = (rt - mean(rt)) / sd(rt))",
    pyCode: "df.assign(log_rt=np.log(df['rt']))",
    juliaCode: `df2 = transform(df,
    :rt => ByRow(log) => :log_rt,
    :rt => (x -> (x .- mean(x)) ./ std(x)) => :z_rt,
)`,
    pitfall: "1行ごとの関数には `ByRow(f)`、列全体（平均との差など）を使う関数には `ByRow` を付けずベクトル関数を渡します。元の `df` を直接書き換えるなら `transform!` です。",
    lessonId: "groupby-join",
    lessonTitle: "グループ集計と結合",
  },
  {
    id: "groupby-combine",
    group: "表操作・入出力",
    task: "グループ別の集計（group_by + summarise / groupby + agg）",
    rCode: "df |> group_by(cond) |> summarise(n = n(), m = mean(rt), sd = sd(rt))",
    pyCode: "df.groupby('cond', as_index=False).agg(n=('rt','size'), m=('rt','mean'))",
    juliaCode: `combine(groupby(df, :cond),
    nrow => :n,
    :rt => mean => :m,
    :rt => std  => :sd,
)`,
    pitfall: "`groupby` からの `combine` は高速で、結果の列名も `:列 => 関数 => :新列名` で一意に固定されます。",
    lessonId: "groupby-join",
    lessonTitle: "グループ集計と結合",
  },
  {
    id: "join-tables",
    group: "表操作・入出力",
    task: "2つの表をキーで結合する（left_join / merge）",
    rCode: "dplyr::left_join(trials, subj_info, by = 'id')",
    pyCode: "trials.merge(subj_info, on='id', how='left')",
    juliaCode: `merged = leftjoin(trials, subj_info; on = :id)
# キーに missing があり得る場合: on = :id, matchmissing = :equal`,
    pitfall: "`leftjoin` は元データの行順序を勝手に変える場合があります。行順を保ちたいときは `leftjoin!` または結合後の `sort!` を使います。",
    lessonId: "groupby-join",
    lessonTitle: "グループ集計と結合",
  },
  {
    id: "pivot-longer-wider",
    group: "表操作・入出力",
    task: "横持ち ⇄ 縦持ちの変換（pivot_longer / melt / stack）",
    rCode: "tidyr::pivot_longer(df, cols = c(pre, post), names_to = 'time', values_to = 'rt')",
    pyCode: "df.melt(id_vars=['id'], value_vars=['pre', 'post'], var_name='time', value_name='rt')",
    juliaCode: `long_df = stack(df, [:pre, :post]; variable_name = :time, value_name = :rt)
wide_df = unstack(long_df, :id, :time, :rt)`,
    pitfall: "`stack(df, 測定列)` の第2引数は残すID列ではなく「縦に積む測定列」（または `Not(:id)`）です。逆向きの `unstack` では `(行キー, 列になる変数, 値)` を明示します。",
    lessonId: "reshape-import",
    lessonTitle: "データの整形・保存・再利用",
  },
  {
    id: "bind-rows-vcat",
    group: "表操作・入出力",
    task: "複数CSV・複数表の縦連結（bind_rows / pd.concat）",
    rCode: "purrr::map_dfr(files, read_csv, .id = 'source')",
    pyCode: "pd.concat([pd.read_csv(f).assign(src=f) for f in files], ignore_index=True)",
    juliaCode: `files = sort(filter(endswith(".csv"), readdir("data/raw"; join = true)))
df_all = DataFrame(CSV.File(files; source = :source_file))
# 既存の DataFrame 配列なら: reduce(vcat, dfs; cols = :setequal)`,
    pitfall: "列の食い違いを黙って `missing` 埋めしないよう、`vcat` では `cols = :setequal` でスキーマ一致を検査するのが事故防止の定石です。",
    lessonId: "batch-csv-io",
    lessonTitle: "複数CSVと分析成果物の入出力",
  },
  {
    id: "ttest-nonparam",
    group: "統計・回帰・混合モデル",
    task: "t検定・Welch検定・ノンパラメトリック検定",
    rCode: "t.test(x, y); t.test(post, pre, paired = TRUE); wilcox.test(x, y)",
    pyCode: "scipy.stats.ttest_ind(x, y, equal_var=False); scipy.stats.wilcoxon(post, pre)",
    juliaCode: `using HypothesisTests
UnequalVarianceTTest(x, y)       # Welch の2群 t 検定 (pvalue(...), confint(...))
OneSampleTTest(post .- pre)      # 対応のある t 検定
MannWhitneyUTest(x, y)           # 順位和検定`,
    pitfall: "Rの `t.test(x, y)` 既定は Welch（不等分散許容）です。Juliaでは等分散 `EqualVarianceTTest` と Welch `UnequalVarianceTTest` が型名で明確に分かれています。",
    lessonId: "hypothesis-testing",
    lessonTitle: "仮説検定入門",
  },
  {
    id: "chisq-fisher",
    group: "統計・回帰・混合モデル",
    task: "クロス集計表のカイ二乗検定・Fisher正確検定",
    rCode: "chisq.test(tab, correct = FALSE); fisher.test(tab)",
    pyCode: "scipy.stats.chi2_contingency(tab, correction=False); scipy.stats.fisher_exact(tab)",
    juliaCode: `using HypothesisTests
ChisqTest(tab)                              # 2次元度数行列の独立性検定
FisherExactTest(tab[1,1], tab[1,2], tab[2,1], tab[2,2])`,
    pitfall: "カイ二乗検定には必ずパーセントではなく **生の度数（件数）整数行列** を渡します。期待度数が小さい R×C 表はモンテカルロ正確検定も有効です。",
    lessonId: "chisq-loglinear-exact",
    lessonTitle: "カイ二乗分析の深化：適合度・正確検定・対数線形モデル",
  },
  {
    id: "ols-regression",
    group: "統計・回帰・混合モデル",
    task: "線形回帰・ANCOVA・交互作用と参照水準指定",
    rCode: "m <- lm(rt ~ cond * age, data = df); summary(m); confint(m)",
    pyCode: "smf.ols('rt ~ C(cond) * age', data=df).fit()",
    juliaCode: `using GLM, StatsModels
m = lm(@formula(rt ~ 1 + cond * age), df;
       contrasts = Dict(:cond => DummyCoding(base = "control")))
coeftable(m); confint(m); r2(m)`,
    pitfall: "数値コード化されたカテゴリ列（`1, 2, 3`）をそのまま入れると連続量として回帰されます。文字列または `contrasts` でカテゴリ扱いを明示します。",
    lessonId: "multiple-regression-ancova",
    lessonTitle: "重回帰・ANCOVA・モデル比較",
  },
  {
    id: "logistic-glm",
    group: "統計・回帰・混合モデル",
    task: "ロジスティック回帰・Poisson回帰（一般化線形モデル）",
    rCode: "glm(acc ~ x, data = df, family = binomial(link = 'logit'))",
    pyCode: "smf.logit('acc ~ x', data=df).fit()",
    juliaCode: `using GLM
m = glm(@formula(acc ~ 1 + x), df, Binomial(), LogitLink())
odds_ratios = exp.(coef(m))
p_hat = predict(m, new_df) # 応答尺度(確率 0..1)で返る`,
    pitfall: "信頼帯を描くときは確率 `p_hat ± 1.96 SE` ではなく、線形予測子（logit）空間で区間を作ってから `logistic` で逆変換すると `[0, 1]` 逸脱を防げます。",
    lessonId: "logistic-regression",
    lessonTitle: "ロジスティック回帰",
  },
  {
    id: "lmm-glmm",
    group: "統計・回帰・混合モデル",
    task: "線形・一般化線形混合効果モデル（lmer / glmer）",
    rCode: "lme4::lmer(rt ~ cond + (1 + cond | subj) + (1 | item), data = df)",
    pyCode: "smf.mixedlm('rt ~ cond', df, groups=df['subj']).fit()",
    juliaCode: `using MixedModels
m = fit(MixedModel,
        @formula(rt ~ 1 + cond + (1 + cond | subj) + (1 | item)), df; REML = false)
issingular(m) # 境界張り付き(特異適合)の点検`,
    pitfall: "`MixedModels.jl` は交差ランダム効果（参加者×刺激）で `lme4` より大幅に高速です。固定効果モデル間の尤度比検定では `REML = false`（ML推定）に揃えます。",
    lessonId: "mixed-models",
    lessonTitle: "within／betweenデザインと混合効果モデル",
  },
  {
    id: "mcmc-bayesian",
    group: "統計・回帰・混合モデル",
    task: "ベイズ推論・MCMCサンプリング（Stan / PyMC / Turing）",
    rCode: "brms::brm(y ~ x, data = df) / cmdstanr",
    pyCode: "with pm.Model(): ... pm.sample(1000, tune=1000)",
    juliaCode: `# Juliaネイティブ確率的プログラミング (Turing.jl):
# @model function linreg(x, y)
#     sigma ~ Exponential(1.0); beta ~ Normal(0, 2)
#     y ~ MvNormal(beta .* x, sigma^2 * I)
# end
# chn = sample(linreg(x, y), NUTS(), MCMCThreads(), 1000, 4)`,
    pitfall: "既存の `.stan` 資産がある場合は無理に書き直さず `StanSample.jl` を呼び、純Julia関数や微分方程式を尤度に入れたい場合は `Turing.jl` を使うのが実務的です。",
    lessonId: "mcmc-metropolis-hmc",
    lessonTitle: "MCMCとハミルトニアンモンテカルロの原理",
  },
  {
    id: "ggplot-aog",
    group: "可視化・機械学習・微分方程式",
    task: "宣言的な多変量・ファセット可視化（ggplot2 / seaborn）",
    rCode: "ggplot(df, aes(x, rt, color = cond)) + geom_point() + geom_smooth(method='lm') + facet_wrap(~sess)",
    pyCode: "sns.lmplot(data=df, x='x', y='rt', hue='cond', col='sess')",
    juliaCode: `using AlgebraOfGraphics, CairoMakie
spec = data(df) *
       mapping(:x, :rt, color = :cond, marker = :cond, col = :sess) *
       (visual(Scatter, alpha = 0.5) + linear())
fg = draw(spec); save("faceted.svg", fg)`,
    pitfall: "`AlgebraOfGraphics.jl` では「データ・列対応・幾何の結合が積 `*`、レイヤの重ね描きが和 `+`」です。色だけでなく `marker` も変えると白黒でも識別できます。",
    lessonId: "makie-aog-multifacet",
    lessonTitle: "多次元・反復データの可視化設計：MakieレイアウトとAlgebraOfGraphics",
  },
  {
    id: "patchwork-makie",
    group: "可視化・機械学習・微分方程式",
    task: "複数パネル結合と論文品質ベクター保存（patchwork / subplots）",
    rCode: "(p1 | p2) / p3 + plot_annotation(tag_levels = 'A'); ggsave('fig1.pdf', width=7, height=5)",
    pyCode: "fig, axes = plt.subplots(1, 2, sharey=True, figsize=(7, 3.5)); fig.savefig('fig1.pdf')",
    juliaCode: `using CairoMakie
fig = Figure(size = (504, 260), fontsize = 11) # 72 pt = 1 inch (幅7 inch)
ax1 = Axis(fig[1, 1], title = "条件A", ylabel = "RT (ms)")
ax2 = Axis(fig[1, 2], title = "条件B")
linkyaxes!(ax1, ax2)
Label(fig[1, 1, TopLeft()], "A", font = :bold, padding = (0, 6, 4, 0))
save("fig1.pdf", fig)`,
    pitfall: "発散カラーマップ（`:RdBu` / `:balance`）で残差や効果量を描くときは、必ず `colorrange = (-m, m)` を対称に固定してゼロを中央色に揃えます。",
    lessonId: "makie-aog-multifacet",
    lessonTitle: "多次元・反復データの可視化設計：MakieレイアウトとAlgebraOfGraphics",
  },
  {
    id: "sklearn-mlj-cv",
    group: "可視化・機械学習・微分方程式",
    task: "機械学習パイプラインとリーク防止交差検証（scikit-learn / MLJ）",
    rCode: "tidymodels::workflow() |> fit_resamples(vfold_cv(df, v = 5))",
    pyCode: "pipe = make_pipeline(StandardScaler(), LassoCV()); cross_val_score(pipe, X, y, cv=5)",
    juliaCode: `# MLJ.jl で前処理と推定器を1つのパイプライン機械に束ねる:
# pipe = Standardizer() |> (@load LassoRegressor pkg=MLJLinearModels)()
# evaluate(pipe, X, y; resampling = CV(nfolds = 5, shuffle = true, rng = 42), measure = rmse)
# 事前学習モデルやUMAP等は PythonCall.jl で scikit-learn を直接呼ぶ分業も有効`,
    pitfall: "データ分割の前に全データで標準化や特徴量選択（相関上位抽出）を行うと情報リークが起きます。必ず各foldの訓練行だけで前処理を当てます。",
    lessonId: "regularization-trees-cv",
    lessonTitle: "予測機械学習と検証：Lasso・決定木・リーク防止CV",
  },
  {
    id: "scipy-ode-sciml",
    group: "可視化・機械学習・微分方程式",
    task: "常微分方程式の数値積分（deSolve / scipy.integrate.solve_ivp）",
    rCode: "deSolve::ode(y = u0, times = tspan, func = rhs, parms = p)",
    pyCode: "scipy.integrate.solve_ivp(rhs, (0.0, 20.0), u0, args=(p,), method='RK45')",
    juliaCode: `using OrdinaryDiffEq
function sir!(du, u, p, t)
    du[1] = -p.beta * u[1] * u[2]
    du[2] =  p.beta * u[1] * u[2] - p.gamma * u[2]
end
prob = ODEProblem(sir!, [0.99, 0.01], (0.0, 20.0), (beta = 0.6, gamma = 0.2))
sol  = solve(prob, Tsit5(); reltol = 1e-8, abstol = 1e-8)`,
    pitfall: "3状態以上のシステムでは `du` を書き換える in-place 形式 `rhs!(du, u, p, t)` にすると、毎ステップの配列割当がゼロになりパラメータ推定や感度解析が劇的に速くなります。",
    lessonId: "ode-dynamical-simulation",
    lessonTitle: "微分方程式と動的システム",
  },
  {
    id: "rmarkdown-quarto-tables",
    group: "表操作・入出力",
    task: "コードから論文表・再現可能レポートを生成する（R Markdown / Quarto）",
    rCode: "quarto render report.qmd / gt::gt(df) / knitr::kable(df, format = 'latex')",
    pyCode: "quarto render report.qmd / df.to_latex(index=False, float_format='%.2f')",
    juliaCode: `# PrettyTables.jl / SummaryTables.jl で DataFrame から直接 LaTeX・Markdown 表を出力:
# using PrettyTables
# pretty_table(summary_df; backend = Val(:latex)) # または Val(:markdown)
# Quarto 原稿 (engine: julia) なら図と表を原稿ビルド時に自動挿入`,
    pitfall: "手作業で数値をWordやLaTeXへコピペすると除外基準変更のたびに取り違えが起きます。集計スクリプトから `.tex` / `.md` / `.csv` を直接書き出します。",
    lessonId: "daily-workflow-tools",
    lessonTitle: "研究を加速するJulia実用ツールと開発習慣",
  },
];

export const LEARNING_PATHS = [
  {
    id: "all",
    label: "すべて",
    desc: "全70レッスンをセクション順に表示します。",
    lessonIds: null,
  },
  {
    id: "quickstart",
    label: "最短・実データ入門",
    desc: "Juliaの導入からCSV読込・欠測処理・集計・可視化まで、最短で一通り動かす12本です。",
    lessonIds: [
      "julia-introduction",
      "variables-calculation",
      "arrays",
      "functions",
      "first-data-analysis",
      "local-environment",
      "broadcasting",
      "dict-missing",
      "dataframes-introduction",
      "groupby-join",
      "reshape-import",
      "exploratory-visualization",
    ],
  },
  {
    id: "r-python-model",
    label: "回帰・混合モデル・他言語連携",
    desc: "R・Python経験者がGLM・混合効果モデル・検出力設計・RCall/PythonCall分業へ進む12本です。",
    lessonIds: [
      "why-julia-visualized",
      "dataframes-introduction",
      "groupby-join",
      "reshape-import",
      "linear-model-unification",
      "multiple-regression-ancova",
      "regression-diagnostics",
      "logistic-regression",
      "mixed-models",
      "power-design",
      "julia-to-r",
      "julia-python-ml-bridge",
    ],
  },
  {
    id: "sim-bayes-sciml",
    label: "シミュレーション・MCMC・動的モデル",
    desc: "乱数設計・高速化・自作尤度・微分方程式・DDM・状態空間・HMC・SciMLを体系的に学ぶ12本です。",
    lessonIds: [
      "probability-distributions",
      "randomness-reproducibility",
      "estimation-uncertainty",
      "monte-carlo",
      "type-stability-allocation",
      "parallel-monte-carlo",
      "custom-likelihood-optimization",
      "ode-dynamical-simulation",
      "evidence-accumulation-ddm",
      "state-space-kalman-filter",
      "mcmc-metropolis-hmc",
      "em-neural-sciml",
    ],
  },
  {
    id: "ml-viz-workflow",
    label: "機械学習・論文図・再現可能研究",
    desc: "予測ML・MCA・Makie複合図・診断可視化・再現可能プロジェクト・多重ディスパッチ設計技法を固める12本です。",
    lessonIds: [
      "uncertainty-visualization",
      "makie-aog-multifacet",
      "regularization-trees-cv",
      "correspondence-analysis-mca",
      "diagnostic-phase-visualization",
      "julia-python-ml-bridge",
      "reproducible-research-project",
      "git-research-history",
      "batch-csv-io",
      "daily-workflow-tools",
      "why-julia-visualized",
      "julian-design-patterns",
    ],
  },
  {
    id: "incomplete",
    label: "未クリアのみ",
    desc: "まだ練習問題を全問クリアしていないレッスンのみを絞り込みます。",
    lessonIds: "incomplete",
  },
];

export const STARTER_RECIPES = [
  {
    id: "csv-summary-table",
    title: "1. CSV読込・欠測点検・群別要約とMarkdown表出力",
    subtitle: "生データを壊さず読み込み、除外件数と要約表を同時に出力する最小構成",
    filename: "starter_01_csv_summary.jl",
    pkgCmd: "pkg> add CSV DataFrames",
    lessonId: "daily-workflow-tools",
    lessonTitle: "研究を加速するJulia実用ツールと開発習慣",
    relatedLessonIds: ["first-data-analysis", "dataframes-introduction", "groupby-join", "batch-csv-io"],
    checklist: [
      "`data/raw/` の元CSVは上書きせず、集計表は `output/` へ別名で書き出す",
      "有効範囲外の試行を除外した場合は、除外前後の件数を両方記録する",
      "論文・レポート用の数値表は手打ちせず `@sprintf` や `PrettyTables` で生成する",
    ],
    code: `using CSV, DataFrames, Statistics, Printf

# 1. スキーマと欠損表現を明示して読み込む
raw_path = joinpath(@__DIR__, "data", "raw", "rt_trials.csv")
df = CSV.read(raw_path, DataFrame; missingstring = ["", "NA", "null"])

# 2. 有効試行の抽出と除外件数の監査
valid_df = subset(df, :rt => ByRow(x -> 150.0 <= x <= 3000.0); skipmissing = true)
println("全行数: ", nrow(df), " / 有効行数: ", nrow(valid_df), " / 除外: ", nrow(df) - nrow(valid_df))

# 3. 条件別の記述統計表を作成して CSV と Markdown の両方へ出力
summary_df = combine(groupby(valid_df, :cond),
    nrow => :n,
    :rt => mean => :mean_rt,
    :rt => std  => :sd_rt,
    :rt => (x -> std(x) / sqrt(length(x))) => :se_rt,
)
mkpath(joinpath(@__DIR__, "output"))
CSV.write(joinpath(@__DIR__, "output", "summary_by_cond.csv"), summary_df)

for row in eachrow(summary_df)
    @printf("| %s | %d | %.1f | %.2f |\n", row.cond, row.n, row.mean_rt, row.se_rt)
end`,
  },
  {
    id: "paired-comparison-ci",
    title: "2. 対応のある前後比較・個人内SEと効果量・信頼区間",
    subtitle: "群間エラーバーの罠を避け、差分CIとCousineau–Morey個人内SEを同時算出",
    filename: "starter_02_paired_ci.jl",
    pkgCmd: "pkg> add Distributions HypothesisTests",
    lessonId: "makie-aog-multifacet",
    lessonTitle: "多次元・反復データの可視化設計：MakieレイアウトとAlgebraOfGraphics",
    relatedLessonIds: ["hypothesis-testing", "estimation-uncertainty", "linear-model-unification"],
    checklist: [
      "対応デザインでは独立2群t検定ではなく、参加者ごとの差分 `post .- pre` を主対象にする",
      "図にエラーバーを添える場合は「群間SE」か「Morey個人内SE」かをキャプションに明記する",
      "平均だけでなく改善した人数比率やSpaghetti線で逆行者の有無を確認する",
    ],
    code: `using Statistics, Distributions, HypothesisTests

function paired_report(pre::AbstractVector{<:Real}, post::AbstractVector{<:Real})
    @assert length(pre) == length(post) >= 2 "pre と post の長さを揃えてください"
    n = length(pre)
    diffs = Float64.(post .- pre)
    m_diff = mean(diffs)
    se_diff = std(diffs) / sqrt(n)
    tcrit = quantile(TDist(n - 1), 0.975)

    # Cousineau-Morey の個人内正規化SE (2条件 K=2 の補正係数 √2)
    grand_m = 0.5 * (mean(pre) + mean(post))
    subj_m  = 0.5 .* (pre .+ post)
    ws_morey_se = std(pre .- subj_m .+ grand_m) / sqrt(n) * sqrt(2.0)

    return (
        n = n,
        mean_diff = m_diff,
        ci95 = (m_diff - tcrit * se_diff, m_diff + tcrit * se_diff),
        cohens_dz = m_diff / std(diffs),
        ws_morey_se = ws_morey_se,
        p_value = pvalue(OneSampleTTest(diffs)),
        improved_count = count(<(0.0), diffs),
    )
end`,
  },
  {
    id: "glm-link-band",
    title: "3. ロジスティック回帰・オッズ比・リンク尺度95%予測帯",
    subtitle: "確率 0 未満や 1 超えへの逸脱を防ぐ、ロジット空間逆変換リボンの定石コード",
    filename: "starter_03_logistic_glm.jl",
    pkgCmd: "pkg> add DataFrames GLM StatsModels",
    lessonId: "logistic-regression",
    lessonTitle: "ロジスティック回帰",
    relatedLessonIds: ["multiple-regression-ancova", "categorical-outcomes", "ordinal-multinomial-mle"],
    checklist: [
      "参照カテゴリは `DummyCoding(base = ...)` で明示し、辞書順任せにしない",
      "予測確率の95%信頼帯は線形予測子 `η̂ ± 1.96 SE(η̂)` を `logistic` で逆変換して作る",
      "ROC-AUCだけでなく、予測確率ビンごとの実測陽性率（較正）も併せて確認する",
    ],
    code: `using DataFrames, GLM, LinearAlgebra, Statistics

logistic(z::Real) = z >= 0 ? 1.0 / (1.0 + exp(-z)) : exp(z) / (1.0 + exp(z))

# 二項ロジットモデルの当てはめ
m = glm(@formula(hit ~ 1 + x + cond), df, Binomial(), LogitLink();
        contrasts = Dict(:cond => DummyCoding(base = "control")))
println(coeftable(m))
println("オッズ比: ", round.(exp.(coef(m)); digits = 3))

# 新しいグリッド new_df に対するリンク尺度95%予測帯
X_new = modelmatrix(m.mf, new_df)
eta_hat = X_new * coef(m)
se_eta  = [sqrt(dot(@view(X_new[i, :]), vcov(m) * @view(X_new[i, :]))) for i in axes(X_new, 1)]
pred_band = DataFrame(
    p_hat  = logistic.(eta_hat),
    p_low  = logistic.(eta_hat .- 1.96 .* se_eta),
    p_high = logistic.(eta_hat .+ 1.96 .* se_eta),
)`,
  },
  {
    id: "lmm-crossed-effects",
    title: "4. 混合効果モデル（LMM / GLMM）と特異適合・尤度比比較",
    subtitle: "参加者×刺激の交差ランダム効果と issingular 診断を含む再現テンプレート",
    filename: "starter_04_mixed_models.jl",
    pkgCmd: "pkg> add DataFrames MixedModels",
    lessonId: "mixed-models",
    lessonTitle: "within／betweenデザインと混合効果モデル",
    relatedLessonIds: ["hierarchical-ordinal-choice", "measurement-error"],
    checklist: [
      "参加者内要因の傾きはランダム傾き候補に入れ、`issingular(m)` で境界張り付きを確認する",
      "固定効果構造を尤度比検定 `MixedModels.likelihoodratiotest` で比べる際は `REML = false` に統一する",
      "固定効果の係数だけでなく `VarCorr(m)` の分散成分・相関も論文へ報告する",
    ],
    code: `using DataFrames, MixedModels

# 1. 最大ランダム構造と縮約モデルの当てはめ (固定効果比較のため ML: REML = false)
f_max = @formula(log_rt ~ 1 + cond + (1 + cond | subj) + (1 | item))
f_red = @formula(log_rt ~ 1 + cond + (1 | subj) + (1 | item))

m_max = fit(MixedModel, f_max, df; REML = false)
m_red = fit(MixedModel, f_red, df; REML = false)

println("最大モデルの特異適合(singular): ", issingular(m_max))
println(VarCorr(m_max))
println(MixedModels.likelihoodratiotest(m_red, m_max))`,
  },
  {
    id: "makie-multipanel-pub",
    title: "5. CairoMakie 複合パネル論文図（軸連動・発散配色・PDF保存）",
    subtitle: "学術誌2段組幅（7 inch = 504 pt）に合わせたベクター図の組版テンプレート",
    filename: "starter_05_publication_figure.jl",
    pkgCmd: "pkg> add CairoMakie AlgebraOfGraphics",
    lessonId: "makie-aog-multifacet",
    lessonTitle: "多次元・反復データの可視化設計：MakieレイアウトとAlgebraOfGraphics",
    relatedLessonIds: ["exploratory-visualization", "uncertainty-visualization"],
    checklist: [
      "比較するパネル同士は `linkyaxes!` / `linkxaxes!` で軸範囲を連動させる",
      "正負の残差・効果量ヒートマップでは `m = maximum(abs, Z)` として `colorrange = (-m, m)` を固定する",
      "図と同じ集計値を `.csv` としても保存し、本文中の数値と完全一致させる",
    ],
    code: `using CairoMakie, Statistics

# 1 pt = 1/72 inch: 504 × 250 pt は約 7.0 × 3.5 inch の2段組論文図サイズ
fig = Figure(size = (504, 250), fontsize = 10.5)
ax_a = Axis(fig[1, 1], xlabel = "条件", ylabel = "反応時間 (ms)", title = "個人別変化と平均")
ax_b = Axis(fig[1, 2], xlabel = "列カテゴリ", ylabel = "行カテゴリ", title = "標準化残差マップ")

# パネルA: 生データ + 区間 (例: x_pos, y_est, y_lo, y_hi)
rangebars!(ax_a, [1, 2], [492.0, 474.0], [516.0, 498.0]; color = :black, linewidth = 2)
scatter!(ax_a, [1, 2], [504.0, 486.0]; color = :steelblue, markersize = 9)
ax_a.xticks = ([1, 2], ["統制", "介入"])

# パネルB: ゼロ中心を保証した発散ヒートマップ
Z = [-1.8 0.2 2.4; 0.4 -0.5 -1.1]
m = maximum(abs, Z)
hm = heatmap!(ax_b, Z; colormap = :RdBu, colorrange = (-m, m))
Colorbar(fig[1, 3], hm; label = "標準化残差")

Label(fig[1, 1, TopLeft()], "A", fontsize = 13, font = :bold, padding = (0, 6, 4, 0))
Label(fig[1, 2, TopLeft()], "B", fontsize = 13, font = :bold, padding = (0, 6, 4, 0))
save("fig1_publication.pdf", fig)`,
  },
  {
    id: "parallel-power-sim",
    title: "6. スレッド並列モンテカルロ検出力シミュレーション",
    subtitle: "スレッド数が変わっても結果が1ビットもズレない試行別シード設計",
    filename: "starter_06_parallel_power.jl",
    pkgCmd: "julia --threads=auto --project=. starter_06_parallel_power.jl",
    lessonId: "parallel-monte-carlo",
    lessonTitle: "並列モンテカルロと乱数設計",
    relatedLessonIds: ["randomness-reproducibility", "monte-carlo", "power-design", "type-stability-allocation"],
    checklist: [
      "共有RNGを複数スレッドから呼ばず、試行番号 `i` から `Xoshiro(seed, i)` を決定論的に作る",
      "`push!` ではなく事前確保配列 `pvals = Vector{Float64}(undef, n_sims)` の `pvals[i]` へ書き込む",
      "検出力の推定値には必ずモンテカルロ標準誤差 `MCSE = sqrt(p * (1 - p) / n_sims)` を添える",
    ],
    code: `using Random, Statistics, Distributions, LinearAlgebra
BLAS.set_num_threads(1) # 外側を Threads.@threads で回すときは BLAS 過剰スレッドを防ぐ

function simulate_power(; n_per_group = 36, effect_d = 0.5, n_sims = 5000, master_seed = 2026)
    pvals = Vector{Float64}(undef, n_sims)
    t_dist = TDist(2 * n_per_group - 2)
    Threads.@threads for i in 1:n_sims
        rng = Xoshiro(master_seed, i) # スレッド数に依存しない試行固有RNG
        g1 = randn(rng, n_per_group)
        g2 = effect_d .+ randn(rng, n_per_group)
        sp = sqrt(0.5 * (var(g1) + var(g2)))
        t_stat = abs(mean(g2) - mean(g1)) / (sp * sqrt(2.0 / n_per_group))
        pvals[i] = 2.0 * ccdf(t_dist, t_stat)
    end
    pow = mean(<(0.05), pvals)
    mcse = sqrt(pow * (1.0 - pow) / n_sims)
    return (power = round(pow; digits = 4), mcse = round(mcse; digits = 4), threads = Threads.nthreads())
end

println(simulate_power())`,
  },
  {
    id: "ode-phase-sweep",
    title: "7. 2次元非線形微分方程式のRK4積分とパラメータ感度走査",
    subtitle: "外部パッケージなしでもすぐ試せ、OrdinaryDiffEq.jl へそのまま移行できる骨格",
    filename: "starter_07_ode_phase.jl",
    pkgCmd: "pkg> add OrdinaryDiffEq CairoMakie  # 本格解析・描画に進む場合",
    lessonId: "diagnostic-phase-visualization",
    lessonTitle: "計算統計・動的モデルの診断可視化：事後予測・較正・位相平面",
    relatedLessonIds: ["ode-dynamical-simulation", "evidence-accumulation-ddm", "em-neural-sciml"],
    checklist: [
      "まず平衡点でのヤコビ行列の固有値 `eigvals(J)` を見て、安定ノードか鞍点かを確認する",
      "時間波形だけでなく2状態の位相平面上でセパラトリクス（吸引域境界）を確認する",
      "硬い（stiff）方程式や適応刻み幅が必要な場合は `OrdinaryDiffEq.jl`（`Tsit5()` / `Rodas5P()`）を使う",
    ],
    code: `using LinearAlgebra

# 相互抑制型2状態モデル: in-place 形式にしておくと OrdinaryDiffEq.jl へそのまま渡せる
function mutual_inhib!(du, u, p, _t)
    du[1] = -u[1] + p.w_self * tanh(u[1]) - p.w_inh * tanh(u[2]) + p.input1
    du[2] = -u[2] + p.w_self * tanh(u[2]) - p.w_inh * tanh(u[1]) + p.input2
    return nothing
end

function integrate_rk4(rhs!, u0::Vector{Float64}, p, dt::Float64, steps::Int)
    u = copy(u0)
    k1, k2, k3, k4, tmp = similar(u), similar(u), similar(u), similar(u), similar(u)
    for s in 1:steps
        t = (s - 1) * dt
        rhs!(k1, u, p, t)
        @. tmp = u + 0.5 * dt * k1; rhs!(k2, tmp, p, t + 0.5 * dt)
        @. tmp = u + 0.5 * dt * k2; rhs!(k3, tmp, p, t + 0.5 * dt)
        @. tmp = u + dt * k3;       rhs!(k4, tmp, p, t + dt)
        @. u += (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
    end
    return u
end

p = (w_self = 1.6, w_inh = 0.9, input1 = 0.0, input2 = 0.0)
println("初期値 (0.12, 0.08) の収束先: ", round.(integrate_rk4(mutual_inhib!, [0.12, 0.08], p, 0.05, 400); digits = 3))
println("初期値 (0.08, 0.12) の収束先: ", round.(integrate_rk4(mutual_inhib!, [0.08, 0.12], p, 0.05, 400); digits = 3))`,
  },
  {
    id: "revise-test-project",
    title: "8. Revise常駐開発と標準 Test による研究関数の自動検算",
    subtitle: "前処理・集計関数のバグ混入を0.1秒で検知する test/runtests.jl の最小骨格",
    filename: "starter_08_runtests.jl",
    pkgCmd: "julia --startup-file=no --project=. starter_08_runtests.jl",
    lessonId: "daily-workflow-tools",
    lessonTitle: "研究を加速するJulia実用ツールと開発習慣",
    relatedLessonIds: ["functions", "reproducible-research-project", "reading-error-messages", "julian-design-patterns"],
    checklist: [
      "日常の試行錯誤では REPL で `using Revise; includet(\"src/analysis_fns.jl\")` を使い再起動待ちをなくす",
      "浮動小数点の検算は `==` ではなく `isapprox(actual, expected; atol = 1e-8)` を使う",
      "論文提出前は `julia --startup-file=no --project=.` で個人環境の影響がないことを確認する",
    ],
    code: `using Test, Statistics

# 本来は src/analysis_fns.jl に置いて include / includet する研究用関数
function clean_rt_summary(xs; min_ms = 150.0, max_ms = 3000.0)
    valid = [Float64(x) for x in skipmissing(xs) if min_ms <= x <= max_ms]
    isempty(valid) && throw(ArgumentError("有効な試行が0件です"))
    m = mean(valid)
    se = length(valid) > 1 ? std(valid) / sqrt(length(valid)) : 0.0
    return (n = length(valid), mean = m, se = se)
end

@testset "反応時間クリーニングと要約の境界検査" begin
    res = clean_rt_summary([480, missing, 520, 95, 530, 4100, 490])
    @test res.n == 4
    @test isapprox(res.mean, 505.0; atol = 1e-10)
    @test isapprox(res.se, std([480.0, 520.0, 530.0, 490.0]) / 2.0; atol = 1e-10)
    # 異常入力で黙って NaN を返さず、意図した例外で止まることも検査する
    @test_throws ArgumentError clean_rt_summary([missing, 80, 5000])
end`,
  },
  {
    id: "leaky-vs-clean-cv",
    title: "9. リークのない K-Fold 交差検証と リッジ／Lasso 正則化比較",
    subtitle: "標準化・変数選択を各foldの訓練データ内だけに閉じ込める純Julia検証テンプレート",
    filename: "starter_09_leaky_vs_clean_cv.jl",
    pkgCmd: "julia --startup-file=no --project=. starter_09_leaky_vs_clean_cv.jl",
    lessonId: "regularization-trees-cv",
    lessonTitle: "予測機械学習と検証：Lasso・決定木・リーク防止CV",
    relatedLessonIds: ["regression-diagnostics", "correspondence-analysis-mca"],
    checklist: [
      "平均・標準偏差によるZ標準化や欠測補完は、必ず各foldの訓練添字 `tr_idx` だけで推定する",
      "強い共線性がある特徴量群では Lasso が片方を恣意的に0にしやすいため リッジ回帰とも比較する",
      "ハイパーパラメータ `λ` を選んだのと同じ検証データで最終汎化性能を主張せず、外側テストを分ける",
    ],
    code: `using Random, Statistics, LinearAlgebra

function kfold_ridge_rmse(X::Matrix{Float64}, y::Vector{Float64}; k = 5, lambda = 1.0, seed = 42)
    n, p = size(X)
    perm = randperm(Xoshiro(seed), n)
    fold_sizes = [div(n, k) + (f <= mod(n, k) ? 1 : 0) for f in 1:k]
    rmses = zeros(Float64, k)
    offset = 0
    for f in 1:k
        val_idx = perm[(offset + 1):(offset + fold_sizes[f])]
        tr_idx  = setdiff(perm, val_idx)
        offset += fold_sizes[f]

        # 訓練データのみの統計量で標準化する（検証データの情報を漏らさない）
        mu_x = mean(@view(X[tr_idx, :]); dims = 1)
        sd_x = max.(std(@view(X[tr_idx, :]); dims = 1), 1e-8)
        mu_y = mean(@view(y[tr_idx]))

        Z_tr  = (@view(X[tr_idx, :])  .- mu_x) ./ sd_x
        Z_val = (@view(X[val_idx, :]) .- mu_x) ./ sd_x
        y_tr  = @view(y[tr_idx]) .- mu_y

        beta = (Z_tr' * Z_tr + lambda * I(p)) \\ (Z_tr' * y_tr)
        pred = mu_y .+ Z_val * beta
        rmses[f] = sqrt(mean((@view(y[val_idx]) .- pred) .^ 2))
    end
    return (mean_rmse = mean(rmses), se_rmse = std(rmses) / sqrt(k))
end`,
  },
  {
    id: "bridge-contract-audit",
    title: "10. R・Stan・Python 連携前のデータ契約・SHA-256 往復監査",
    subtitle: "言語をまたぐ前に列型・欠損・有限値・ハッシュを固定し、静かな型崩れを止める",
    filename: "starter_10_bridge_contract.jl",
    pkgCmd: "pkg> add CSV DataFrames SHA",
    lessonId: "cross-language-contract",
    lessonTitle: "R・Stanへ渡すデータの契約",
    relatedLessonIds: ["julia-to-r", "r-to-julia", "julia-to-stan", "julia-python-ml-bridge", "reshape-import"],
    checklist: [
      "R・Stan・Pythonへ渡す表は、`NaN` や `Inf` が紛れ込んでいないか `all(isfinite, ...)` で検査する",
      "受け渡し用CSVのSHA-256ハッシュと行数・列名を記録し、相手言語の読込結果と照合する",
      "2次元配列をPython（NumPy）と共有する際は Julia（列優先）と Python（行優先）の軸順に注意する",
    ],
    code: `using CSV, DataFrames, SHA

function write_verified_contract(path::AbstractString, df::DataFrame; required_cols::Vector{Symbol})
    # 1. 必須列の存在と欠測・非有限値の検査
    for col in required_cols
        hasproperty(df, col) || throw(ArgumentError("必須列が不足しています: $(col)"))
        vals = df[!, col]
        any(ismissing, vals) && throw(ArgumentError("列 $(col) に missing が残っています"))
        if eltype(vals) <: AbstractFloat && !all(isfinite, vals)
            throw(ArgumentError("列 $(col) に NaN または Inf が含まれています"))
        end
    end

    # 2. CSV書き出しと SHA-256 ハッシュ計算
    CSV.write(path, df)
    digest = bytes2hex(open(sha256, path))

    # 3. 再読込して行数・列名が一致することを往復確認
    roundtrip = CSV.read(path, DataFrame)
    @assert size(roundtrip) == size(df) "往復読込で行数・列数が変化しました"
    return (path = path, nrow = nrow(df), ncol = ncol(df), sha256 = digest)
end`,
  },
];

// 「なぜJulia？」対話プロット用の所要時間・割当モデル定義
// ※ 特定言語を貶める極端な数値ではなく、C/BLAS同等ケースやTTFXの逆転現象も正直に再現する構造モデル:
//    累積時間 T(k) = 初回起動・JITコンパイル定数 + k × 1実行あたり計算時間
export const WHY_JULIA_SCALES = [
  { label: "小規模 (1千)", factor: 1, elements: 1000 },
  { label: "中規模 (5千)", factor: 5, elements: 5000 },
  { label: "大規模 (2万)", factor: 20, elements: 20000 },
  { label: "特大 (5万)", factor: 50, elements: 50000 },
];

export const WHY_JULIA_WORKLOADS = [
  {
    id: "sequential",
    label: "① 独自モデルの逐次反復（DDM・MCMC・検出力計算）",
    shortLabel: "独自モデルの逐次ループ",
    summary:
      "前の時点の状態に次が依存する手書きループは単純な行列積にまとめられません。動的ループは規模に比例して急増しますが、Juliaは機械語へコンパイルされるため、常駐REPL（Revise）なら2回目以降は一瞬で終わります。",
    verdictKind: "julia-win",
    dynInit: 0.2,
    dynPerUnit: 0.42,
    jlJit: 3.4,
    jlReviseOverhead: 0.05,
    jlPerUnit: 0.008,
    unfusedBytesPerElem: 48, // 動的ボクシング相当 (48 B / step)
    fusedBytesPerElem: 0,
  },
  {
    id: "fusion",
    label: "② 5段階の数式配列変換（ガウス重み・対数尤度チェイン）",
    shortLabel: "数式チェインとドット融合",
    summary:
      "非融合のベクトル演算は演算子のたびに巨大な一時配列を確保してメモリ帯域を消費します。Juliaの `@.` ドット融合は式全体を1回のループにまとめるため、事前確保配列への書き込みなら一時割当 0 B で高速に回ります。",
    verdictKind: "fusion-win",
    dynInit: 0.2,
    dynPerUnit: 0.09,
    jlJit: 2.6,
    jlReviseOverhead: 0.04,
    jlPerUnit: 0.012,
    unfusedBytesPerElem: 40, // Float64 (8 B) × 一時配列 5本 = 40 B / elem
    fusedBytesPerElem: 0,
  },
  {
    id: "blas",
    label: "③ 既存C/BLAS関数の1回呼び出し（行列積・標準回帰）",
    shortLabel: "既存C/BLAS呼び出し（同等）",
    summary:
      "【誠実な比較】既存の行列積や標準GLMを呼ぶだけなら、RもPython（NumPy）もJuliaも裏側で同じC/Fortran製BLASを呼ぶため1回あたりの計算速度はほぼ同じです。無理に書き直さず慣れた資産やRCall・PythonCall連携を活かせる場面です。",
    verdictKind: "parity",
    dynInit: 0.2,
    dynPerUnit: 0.025,
    jlJit: 2.4,
    jlReviseOverhead: 0.04,
    jlPerUnit: 0.022,
    unfusedBytesPerElem: 8,
    fusedBytesPerElem: 8,
  },
];

export function computeWhyJuliaSeries(workloadId, scaleIdx, runs) {
  const wl = WHY_JULIA_WORKLOADS.find((w) => w.id === workloadId) || WHY_JULIA_WORKLOADS[0];
  const sc = WHY_JULIA_SCALES[Math.min(Math.max(0, scaleIdx), WHY_JULIA_SCALES.length - 1)];
  const kMax = Math.min(Math.max(1, Number(runs) || 1), 15);

  const dynSingle = wl.dynPerUnit * sc.factor;
  const jlNativeSingle = wl.jlPerUnit * sc.factor;

  const points = [];
  for (let k = 1; k <= kMax; k += 1) {
    // 1) 動的インタープリタ / 非融合 (起動1回 + k回実行)
    const dynamicCum = wl.dynInit + k * dynSingle;
    // 2) Julia アンチパターン: 毎回ターミナルからプロセス再起動 (毎回 JIT が発生)
    const juliaRestartCum = k * (wl.jlJit + jlNativeSingle);
    // 3) Julia 推奨: 常駐REPL + Revise.jl (初回だけ JIT、2回目以降は差分更新 + ネイティブ実行)
    const juliaReviseCum = wl.jlJit + jlNativeSingle + (k - 1) * (wl.jlReviseOverhead + jlNativeSingle);
    points.push({
      k,
      dynamicCum: Number(dynamicCum.toFixed(2)),
      juliaRestartCum: Number(juliaRestartCum.toFixed(2)),
      juliaReviseCum: Number(juliaReviseCum.toFixed(2)),
    });
  }

  const last = points[points.length - 1];
  const unfusedKiB = Number(((wl.unfusedBytesPerElem * sc.elements) / 1024).toFixed(1));
  const fusedKiB = Number(((wl.fusedBytesPerElem * sc.elements) / 1024).toFixed(1));

  return {
    workload: wl,
    scale: sc,
    runs: kMax,
    dynSingleSec: Number(dynSingle.toFixed(2)),
    jlWarmSingleSec: Number((wl.jlReviseOverhead + jlNativeSingle).toFixed(2)),
    unfusedKiB,
    fusedKiB,
    points,
    finalDynamicSec: last.dynamicCum,
    finalRestartSec: last.juliaRestartCum,
    finalReviseSec: last.juliaReviseCum,
  };
}
