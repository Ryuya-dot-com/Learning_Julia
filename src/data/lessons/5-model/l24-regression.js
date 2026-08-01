// レッスン: t検定・ANOVA・回帰を一つのモデルで見る
// コード例は Julia 1.12.6 + GLM 1.9.5 + HypothesisTests 0.11.8 で実測済み(2026-08-01)
export default {
  id: "linear-model-unification",
  title: "t検定・ANOVA・回帰を一つのモデルで見る",
  tag: "検定名ではなく、係数と誤差構造で統一する",
  pages: [
    {
      t: "検定名が違っても、中心にある式は同じ",
      b: [
        "独立2群t検定、一元配置ANOVA、単回帰は別々の道具に見えます。しかし、結果変数 `y` を説明変数の線形結合と誤差で表す、同じ一般線形モデルの仲間です。説明変数が0/1なら平均差、3群以上のカテゴリならANOVA、連続量なら傾きを推定します。",
        "基本形は `yᵢ = β₀ + β₁xᵢ + εᵢ` です。`β₀` は基準となる平均、`β₁` はxが1変わるときの平均変化です。検定は係数が0と整合するかを調べますが、研究上の中心は係数の大きさ、単位、95%信頼区間です。",
        "ただし、同じ式を使えることと、同じ誤差構造でよいことは別です。別々の人からなるbetween-subjectデザインと、同じ人を繰り返すwithin-subjectデザインでは観測の依存性が違います。ここを無視して検定名だけを置き換えてはいけません。",
      ],
    },
    {
      t: "独立2群の平均差は0/1回帰の係数",
      b: [
        "統制群を0、介入群を1と符号化して `y ~ group` を当てはめます。切片は0群の平均、group係数は1群−0群の平均差になります。符号化を反転すれば差の符号も反転します。",
        "この同値性は、別々の参加者からなる独立2群を想定します。ここではt検定との厳密な対応を見るため、通常の最小二乗法と同じ等分散を仮定する `EqualVarianceTTest` を使います。実務で分散が等しい根拠が乏しい場合、Welch検定を単に同値性のためだけに等分散検定へ戻しません。",
      ],
      code: `using Random, Statistics, Distributions, DataFrames
using GLM, HypothesisTests

rng = Xoshiro(2801)
control = rand(rng, Normal(500, 50), 30)
treatment = rand(rng, Normal(525, 50), 30)
group = repeat([0, 1], inner = 30)
df = DataFrame(y = vcat(control, treatment), group = group)

model = lm(@formula(y ~ group), df)
t_test = EqualVarianceTTest(treatment, control)
difference = mean(treatment) - mean(control)
t_regression = coef(model)[2] / stderror(model)[2]

println(round.(coef(model), digits = 1))
println(round(difference, digits = 1))
println(round.([t_test.t, t_regression], digits = 3))
println(round.(confint(model)[2, :], digits = 1))`,
      out: `[505.7, 25.9]
25.9
[2.402, 2.402]
[4.3, 47.4]`,
      a: [
        "切片505.7は統制群平均、group係数25.9は介入群平均との差です。t値も2.402で一致しました。回帰表なら生の平均差と95% CI 4.3〜47.4を直接読めます。",
        "p値はこの等分散t検定で0.0195ですが、『差がある／ない』だけで終わらせません。25.9msが研究上どれほど重要か、区間の下端4.3msから上端47.4msまでで結論がどう変わるかを検討します。",
      ],
    },
    {
      t: "2群では t² = F、d・η²・R²もつながる",
      b: [
        "1自由度の群効果を検定する等分散一元配置ANOVAでは、F統計量はt統計量の二乗です。同じデータ、同じモデル、同じ誤差仮定なら、検定名を変えてもp値は同じになります。",
        "効果量は問いに応じて選びます。平均差25.9msは元の単位、Cohenのdは群内SDで標準化した差、η²／R²はモデルが説明した分散割合です。標準化量は尺度をまたぐ比較に便利ですが、対象集団のばらつきへ依存します。固定された『小・中・大』だけで重要性を決めません。",
      ],
      code: `function pooled_sd(x, y)
    nx, ny = length(x), length(y)
    return sqrt(((nx - 1) * var(x) + (ny - 1) * var(y)) /
                (nx + ny - 2))
end

t_value = coef(model)[2] / stderror(model)[2]
f_value = t_value^2
cohen_d = difference / pooled_sd(control, treatment)
eta2 = r2(model)

println(round(f_value, digits = 3))
println(round(t_test.t^2, digits = 3))
println(round(cohen_d, digits = 3))
println(round(eta2, digits = 3))`,
      out: `5.77
5.77
0.62
0.09`,
      a: [
        "`t² = F` は、2群・1自由度・同じ等分散誤差モデルという条件付きの同値性です。Welch検定、対応あり検定、ロバスト標準誤差へ条件を変えれば、通常のANOVAのFと同じとは限りません。",
        "この2群モデルではη²とR²はともに0.090です。これは個人の得点を90%予測できるという意味ではなく、この標本の総変動の約9%が群平均の違いで説明されたという要約です。",
      ],
    },
    {
      t: "3群以上のANOVAはカテゴリ説明変数の回帰",
      b: [
        "A・B・Cの3群を `y ~ group` に入れると、Juliaはカテゴリ変数をコントラストへ変換します。既定の処理ではAが基準となり、切片がA平均、B係数がB−A、C係数がC−Aになります。係数はカテゴリ名の並びとコントラスト指定に依存するため、基準群を確認します。",
        "ANOVAのFは、切片だけのモデルと群を含むモデルで残差平方和がどれだけ減ったかを、残差分散と比べたものです。オムニバスFが大きくても、どの群対が異なるかは自動的には決まりません。研究仮説に対応する事前コントラストと区間を使い、多数の比較を探索した場合は多重性を扱います。",
      ],
      code: `using Random, Distributions, DataFrames, GLM

rng = Xoshiro(2802)
group3 = repeat(["A", "B", "C"], inner = 25)
y3 = vcat(rand(rng, Normal(500, 45), 25),
          rand(rng, Normal(520, 45), 25),
          rand(rng, Normal(550, 45), 25))
df3 = DataFrame(y = y3, group = group3)

null_model = lm(@formula(y ~ 1), df3)
group_model = lm(@formula(y ~ group), df3)
ss_group = deviance(null_model) - deviance(group_model)
ss_error = deviance(group_model)
f_value = (ss_group / 2) / (ss_error / dof_residual(group_model))
eta2 = ss_group / (ss_group + ss_error)

println(coefnames(group_model))
println(round.(coef(group_model), digits = 1))
println(round(f_value, digits = 3))
println(round(eta2, digits = 3))`,
      out: `["(Intercept)", "group: B", "group: C"]
[492.3, 27.2, 60.8]
11.033
0.235`,
      a: [
        "推定されたA平均は492.3、B−Aは27.2、C−Aは60.8です。係数を足せば推定B平均519.5、C平均553.1になります。元の単位で群差を読めるのが回帰表現の利点です。",
        "η²は0.235でした。ただし標本から計算したη²は上方に偏り得て、研究デザインや群の構成にも依存します。係数・CI・各群の生データを主にし、単一の効果量ラベルへ結論を縮約しません。",
      ],
    },
    {
      t: "within-subjectは差得点モデル、betweenとは誤差が違う",
      b: [
        "同じ30人をbefore／afterで測ると、2列は参加者固有の速さを共有します。2条件だけなら、各参加者の `after - before` を1個作り、その平均が0かを調べる対応ありt検定は、差得点に切片だけを置く回帰 `difference ~ 1` と同じです。",
        "長形式にして通常の `y ~ condition` を当て、60行を別々の人として扱うと、平均差は同じでもSEが変わります。SEが必ず小さくなる／大きくなるという単純な方向ではなく、参加者内共分散を無視した誤差モデルが問いと合っていないことが問題です。3条件以上や試行レベルでは混合モデルへ進みます。",
      ],
      code: `using Random, Statistics, Distributions, DataFrames
using GLM, HypothesisTests

rng = Xoshiro(2803)
n = 30
subject_effect = rand(rng, Normal(0, 60), n)
before = 500 .+ subject_effect .+ rand(rng, Normal(0, 25), n)
after = 520 .+ subject_effect .+ rand(rng, Normal(0, 25), n)
difference = after .- before

paired = OneSampleTTest(difference)
diff_model = lm(@formula(difference ~ 1),
                DataFrame(difference = difference))
naive_model = lm(@formula(y ~ condition),
    DataFrame(y = vcat(before, after),
              condition = repeat([0, 1], inner = n)))

println(round(mean(difference), digits = 1))
println(round.([paired.t,
                coef(diff_model)[1] / stderror(diff_model)[1]], digits = 3))
println(round.([stderror(diff_model)[1],
                stderror(naive_model)[2]], digits = 2))
println(round(mean(difference) / std(difference), digits = 3))`,
      out: `22.3
[4.055, 4.055]
[5.5, 18.57]
0.74`,
      a: [
        "差得点モデルと対応ありt検定のt値は4.055で一致します。通常の長形式回帰も平均差22.3は復元しましたが、SEは5.50ではなく18.57でした。同じ係数でも、不確かさは依存構造の扱いで変わります。",
        "最後の0.740は差得点の平均を差得点SDで割った `d_z` です。独立2群のpooled-SDによるdとは分母が違うため、同じ名前のdとして無条件に比較しません。生の平均変化とCIも併記します。",
      ],
    },
    {
      t: "連続xなら傾き、正規誤差なら最小二乗と最尤がつながる",
      b: [
        "説明変数xが連続量なら、`y ~ x` の係数はxが1単位増えたときの条件付き平均yの変化です。切片はx=0での平均なので、0が観測範囲外なら中心化すると解釈しやすくなります。xとyを逆にすれば別の問いです。",
        "通常の線形モデルは、独立な誤差、条件付き平均の線形性、一定の誤差分散などを仮定します。係数のt／F推論では条件付き誤差の分布も関係します。生のy全体が正規分布であることを要求しているのではありません。詳しい残差・影響点・VIFは「回帰診断とVIF」で扱います。",
      ],
      code: `using Random, DataFrames, GLM

rng = Xoshiro(2804)
x = randn(rng, 80)
y = 2.0 .+ 0.8 .* x .+ randn(rng, 80) .* 0.5
model_x = lm(@formula(y ~ x), DataFrame(x = x, y = y))

println(round.(coef(model_x), digits = 3))
println(round.(confint(model_x)[2, :], digits = 3))
println(round(r2(model_x), digits = 3))`,
      out: `[1.872, 0.928]
[0.828, 1.029]
0.813`,
      a: [
        "推定傾きは0.928、95% CIは0.828〜1.029でした。生成時の真の傾き0.8は今回の区間から外れています。正しい手続きでも、95%区間は反復の約5%で真値を外します。都合のよい乱数種へ選び直さないことが、シミュレーション教材でも重要です。",
        "`εᵢ ~ Normal(0, σ)` を追加すると、`yᵢ ~ Normal(β₀ + β₁xᵢ, σ)` という確率モデルになります。この条件では残差平方和を最小にする係数は正規尤度を最大にする係数と一致し、最小二乗から最尤法への入口になります。",
        "R²=0.813はこの生成例で線形予測が説明した標本分散の割合です。高いR²だけでは因果性、外部妥当性、測定妥当性を保証しません。係数、区間、残差、デザイン、予測性能を役割ごとに評価します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "別々の参加者からなる2群を0/1符号化し、等分散線形モデル `y ~ group` を当てました。group係数は何を表しますか?",
      opts: [
        "1群の平均 − 0群の平均",
        "2群を合わせた標準偏差",
        "各参加者のbefore−after差",
      ],
      ans: 0,
      why: "0/1符号化では切片が0群平均、group係数が1群と0群の平均差です。符号を反転すると係数の符号も反転します。",
      hint: "xが0のときと1のときの予測値 `β₀ + β₁x` を比べてください。",
    },
    {
      k: "fill",
      q: "モデル式とDataFrameから線形モデルを当てはめます。空欄〔?〕に入る関数名を入力しましょう。",
      code: `model = 〔?〕(@formula(y ~ group), df)`,
      accept: ["lm"],
      show: "lm",
      why: "`lm` はlinear modelの略です。説明変数が2値、カテゴリ、連続のいずれでも、モデル式の右辺を変えて同じ関数を使えます。",
      hint: "linear modelの頭文字2つです。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "t検定・ANOVA・回帰の関係について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "同じ2群・同じ等分散モデルなら、群係数のt検定と1自由度ANOVAで t² = F になる",
          a: true,
          why: "同じ残差分散と1自由度の群効果を検定しているため、Fはtの二乗になります。Welchや対応ありへ条件を変えた場合の一般則ではありません。",
        },
        {
          s: "within-subjectとbetween-subjectは平均差さえ同じなら、同じSEを使ってよい",
          a: false,
          why: "withinでは同じ参加者内の測定が関連します。平均差が同じでも、そのSEは参加者内共分散をどう扱うかで変わります。",
        },
        {
          s: "線形モデルを使うには、説明変数を無視した生のy全体が正規分布でなければならない",
          a: false,
          why: "推論仮定で問題になるのは説明変数で条件づけた誤差です。群平均や傾向を無視したy全体の形とは区別します。",
        },
      ],
      hint: "同値性が成立する条件、観測の依存性、正規性の対象を確認してください。",
    },
  ],
};
