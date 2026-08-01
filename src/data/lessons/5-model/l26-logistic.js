// レッスン: ロジスティック回帰 — 二値結果を確率としてモデル化する
// コード例・出力は Julia 1.12.6 + GLM 1.9.5 + StatsBase 0.34.12 で実測済み(2026-08-01)
// 掲載値と性質は scripts/logistic-regression-check.jl で固定検証する
export default {
  id: "logistic-regression",
  title: "ロジスティック回帰",
  tag: "二項ロジットGLMを確率へ戻し、判断規則と分けて読む",
  pages: [
    {
      t: "最初に決めるのは、0と1の意味と観測単位",
      b: [
        "このレッスンでは、正答・誤答、改善・非改善のような二値結果をロジスティック回帰で分析し、係数をオッズ比だけでなく予測確率と確率差へ戻して解釈できるようになります。",
        "ここで扱うのは `GLM.glm` による二項ロジットGLMです。参加者・項目・施設ごとのランダム効果は含みません。同じ単位から反復観測があるロジスティックGLMMとは、尤度、独立性、係数が条件づける対象、確率予測の意味が異なります。",
        "個人ごとに1回の0/1があるならBernoulli個票です。同じ条件で複数回試した成功数があるならBinomial集計です。どちらもGLM.jlでは `Binomial()` familyで扱えますが、応答の形と重みが違います。先に『1は何か』『1行は誰の何回の観測か』をデータ辞書へ残しましょう。",
        "同じ人の試行を独立な個票として並べただけなら、通常のロジスティック回帰の独立性仮定に反します。参加者内の依存は、参加者ごとに集計して消えるとは限りません。研究上必要な試行差を保つなら「within／betweenデザインと混合効果モデル」へ進みます。",
        "線形確率モデル `lm` は平均差の近似として役立つ場合もありますが、分散が確率に依存し、予測が0〜1を出る保証もありません。ここでは二項分布とロジットリンクを明示したモデルを主役にします。",
      ],
    },
    {
      t: "この章はGLM。ランダム効果を加えたものがロジスティックGLMM",
      b: [
        "GLMでは `logit(pᵢ) = xᵢ'β` とし、式に入れた観測共変量Xで条件づけた後の行を独立と扱います。Juliaでは `glm(@formula(y ~ x), df, Binomial(), LogitLink())`です。βは固定効果だけで、`exp(βⱼ)`は他の式項を固定した条件付きオッズ比です。",
        "GLMMでは `logit(pᵢⱼ) = xᵢⱼ'β + zᵢⱼ'bⱼ` のように、参加者・項目などのランダム効果bを追加します。MixedModels.jlなら式に `(1 | subj)`などを含めてBernoulli応答を適合します。`exp(βⱼ)`はランダム効果が同じ値という条件付きのsubject-specific ORで、ランダム効果を積分したpopulation-average ORや確率差とは一致しません。",
        "反復データへ通常のGLMを使い、標準誤差だけを行数で小さくしてはいけません。逆に独立な個票へ理由なくGLMMを使う必要もありません。GLMかGLMMかは結果が0/1だからではなく、観測の依存構造と一般化したい単位から決めます。",
      ],
    },
    {
      t: "直線、ログオッズ、確率を往復する",
      b: [
        "ロジスティック回帰は、説明変数の直線 `η = β₀ + β₁x` をまず作ります。これが線形予測子です。`η = log(p / (1-p))` は確率のロジット、逆変換 `p = 1 / (1 + exp(-η))` は0〜1の確率です。",
        "確率 `p` に対するオッズは `p / (1-p)` です。p=0.5ならオッズ1、p=0.8ならオッズ4です。確率とオッズは同じ数ではありません。",
      ],
      code: `logistic(x) = 1 / (1 + exp(-x))
eta = [-2.0, 0.0, 2.0]
p = logistic.(eta)
odds = p ./ (1 .- p)
println(round.(p, digits = 3))
println(round.(odds, digits = 3))`,
      out: `[0.119, 0.5, 0.881]
[0.135, 1.0, 7.389]`,
      a: [
        "ηが2増えるたびに確率が同じ幅だけ増えるわけではありません。S字曲線の中央は急で、0や1に近い端は平らです。だからロジット尺度で一定の係数でも、確率差は出発点によって変わります。",
        "`exp(η)` はオッズです。η=2ならオッズは約7.389ですが、確率は約0.881です。この往復を混同しないことが、過大な主張を防ぐ第一歩です。",
      ],
    },
    {
      t: "Bernoulli個票を明示RNGで作る",
      b: [
        "学習量 `study` が1標準偏差増えるとログオッズが1.1増える世界を作ります。各人の確率を計算し、その確率で一度ずつ成功・失敗を抽選します。RNGを変数として渡すので再現できます。",
      ],
      code: `using Random, Statistics, Distributions, DataFrames, GLM

logistic(x) = 1 / (1 + exp(-x))
rng = Xoshiro(3101)
n = 800
study = randn(rng, n)
true_probability = logistic.(-0.4 .+ 1.1 .* study)
correct = rand(rng, n) .< true_probability
individual_df = DataFrame(study = study, correct = correct)
println((n = n, observed_rate = round(mean(correct), digits = 3)))`,
      out: `(n = 800, observed_rate = 0.419)`,
      a: [
        "`rand(rng, n) .< true_probability` は、人ごとに異なる確率のBernoulli抽選です。`correct` は `Bool` のままで `glm` へ渡せます。",
        "全体の正答率0.419だけでは、学習量ごとの確率曲線は分かりません。生成した真の確率は分析には渡さず、観測された `study` と `correct` だけから復元します。",
      ],
    },
    {
      t: "glmで当てはめ、確率と区間へ戻る",
      b: [
        "`glm(式, データ, Binomial(), LogitLink())` で二項ロジットモデルを当てはめます。`LogitLink()` は二項familyの既定なので省略できますが、学習中は意図を明示します。",
      ],
      code: `individual_model = glm(
    @formula(correct ~ study), individual_df, Binomial(), LogitLink())
println(round.(coef(individual_model), digits = 3))

new_people = DataFrame(study = [-1.0, 0.0, 1.0])
pred = predict(individual_model, new_people; interval = :confidence)
println(round.(pred.prediction, digits = 3))
println(round.(pred.lower, digits = 3))
println(round.(pred.upper, digits = 3))`,
      out: `[-0.421, 1.102]
[0.179, 0.396, 0.664]
[0.142, 0.359, 0.611]
[0.223, 0.435, 0.713]`,
      a: [
        "切片−0.421はstudy=0でのログオッズ、傾き1.102はstudyが1増えたときのログオッズ差です。真値−0.4と1.1に近い値を復元しました。",
        "`predict(model, newdata)` は応答尺度、つまり確率を返します。`interval = :confidence` は平均成功確率の不確かさです。次の1人の0/1結果を0.142〜0.223の連続値として予測する区間ではありません。",
        "区間はロジット尺度で作って逆変換されるため、0〜1の範囲に収まります。外挿した値では区間が広がりやすいので、予測先が学習データの範囲内かも確認します。",
      ],
    },
    {
      t: "オッズ比だけで終わらず、確率差も示す",
      b: [
        "傾きの指数 `exp(β₁)` は、studyが1増えたときのオッズ比です。95% CIも係数の区間を指数変換します。ただしオッズ比3を『確率が3倍』とは読めません。",
      ],
      code: `beta = coef(individual_model)[2]
se = stderror(individual_model)[2]
odds_ratio = exp(beta)
or_interval = exp.(beta .+ [-1, 1] .* 1.96 .* se)

grid = DataFrame(study = collect(-2.0:2.0))
p0 = predict(individual_model, grid)
p1 = predict(individual_model, DataFrame(study = grid.study .+ 1))
probability_difference = p1 .- p0
ame = mean(beta .* predict(individual_model) .*
           (1 .- predict(individual_model)))
println((OR = round(odds_ratio, digits = 3),
         CI = round.(or_interval, digits = 3)))
println(round.(probability_difference, digits = 3))
println(round(ame, digits = 3))`,
      out: `(OR = 3.009, CI = [2.473, 3.661])
[0.111, 0.217, 0.268, 0.192, 0.091]
0.219`,
      a: [
        "オッズ比はどのstudyでも3.009ですが、1単位増加の予測確率差は0.091〜0.268と変わります。研究上の問いが『何ポイント改善するか』なら、意味のある値での予測確率と差を主に示しましょう。",
        "`ame` は各人の曲線の傾き `βp(1-p)` を平均した平均限界効果です。今回の0.219は『局所的な1単位あたりの確率変化の平均』で、全員の確率が必ず21.9ポイント増えるという個人因果効果ではありません。",
        "オッズ比、代表値での確率差、AMEは異なる効果量です。どれを選んだかではなく、どの母集団・どの共変量分布・どの変化を要約したかまで書きます。",
      ],
    },
    {
      t: "成功数の集計は、割合と試行数を一緒に渡す",
      b: [
        "同じxを持つ試行をまとめたなら、応答は `successes / trials`、`FrequencyWeights` は試行数です。割合だけを渡すと、2/4と200/400を同じ情報量として扱ってしまいます。",
      ],
      code: `using StatsBase
rng2 = Xoshiro(3102)
x = [-1.5, -0.5, 0.5, 1.5]
trials = [100, 120, 110, 90]
p = logistic.(-0.3 .+ 0.9 .* x)
successes = rand.(Ref(rng2), Binomial.(trials, p))
grouped_df = DataFrame(
    x = x, successes = successes, trials = trials,
    proportion = successes ./ trials)

grouped_model = glm(@formula(proportion ~ x), grouped_df,
    Binomial(), LogitLink(); weights = fweights(grouped_df.trials))
println(successes)
println(round.(coef(grouped_model), digits = 3))
println(nobs(grouped_model))`,
      out: `[24, 51, 60, 71]
[-0.005, 0.768]
420.0`,
      a: [
        "`rand(rng2, Binomial(trials, p))` は、試行数が決まった成功数を生成します。ベクトルごとに分布が違うため、`rand.(Ref(rng2), Binomial.(trials, p))` とbroadcastしています。",
        "検証スクリプトでは、成功数と失敗数を420行へ展開したBernoulli個票モデルと係数・予測が数値誤差内で一致しました。`nobs(grouped_model)` も重みの合計420です。",
        "ここでの `fweights` は本当に同じ設計行を反復した回数です。標本抽出の逆確率重みや重要度重みと同じものではありません。重みの意味を確認せず流用しないでください。",
      ],
    },
    {
      t: "参照水準と交互作用は確率尺度まで追う",
      b: [
        "カテゴリ変数はL29と同じく、`DummyCoding(base=..., levels=...)` で参照水準を固定します。交互作用モデルでの群主効果は、連続変数が0の地点での群差です。0が意味を持つよう中心化するか、研究上重要な値で予測しましょう。",
      ],
      code: `using CategoricalArrays, StatsModels
rng3 = Xoshiro(3103)
n_group = 400
group = categorical(repeat(["control", "training"], inner = n_group))
levels!(group, ["control", "training"])
severity = randn(rng3, 2n_group)
training = group .== "training"
eta = -0.7 .+ 0.8 .* severity .+ 0.6 .* training .-
      0.5 .* severity .* training
improved = rand(rng3, 2n_group) .< logistic.(eta)
interaction_df = DataFrame(group = group, severity = severity, improved = improved)

control_coding = Dict(:group => DummyCoding(
    base = "control", levels = ["control", "training"]))
control_model = glm(@formula(improved ~ severity * group), interaction_df,
    Binomial(), LogitLink(); contrasts = control_coding)
println(coefnames(control_model))
println(round.(coef(control_model), digits = 3))`,
      out: `["(Intercept)", "severity", "group: training", "severity & group: training"]
[-0.556, 0.963, 0.534, -0.803]`,
      a: [
        "control基準では、severityの0.963がcontrol群の傾き、群係数0.534がseverity=0でのtraining−control差、交互作用−0.803が傾きの群差です。training群の傾きは0.963−0.803=0.160です。",
        "severity=xでの条件付き群オッズ比は `exp(0.534 - 0.803x)` です。交互作用があるのに群係数だけを『trainingの効果』と一般化してはいけません。群ごとの確率曲線や事前に決めた地点の確率差を併記します。",
        "training基準へ変えると係数は `[-0.022, 0.160, -0.534, 0.803]` に変わりますが、全800行の予測確率の最大差は約2.2e−16でした。参照水準はモデルの予測内容ではなく、係数が直接答える比較を変えます。",
      ],
    },
    {
      t: "モデル比較は逸脱度差で、問いを一つずつ検証する",
      b: [
        "線形モデルの `ftest` を二項GLMへそのまま使いません。交互作用なしの縮約モデルと、交互作用ありの完全モデルがネストしているなら、逸脱度の減少を自由度差のχ²分布と比べる尤度比検定を構成できます。",
      ],
      code: `reduced_model = glm(@formula(improved ~ severity + group), interaction_df,
    Binomial(), LogitLink(); contrasts = control_coding)
delta_deviance = deviance(reduced_model) - deviance(control_model)
delta_df = dof(control_model) - dof(reduced_model)
p_lr = ccdf(Chisq(delta_df), delta_deviance)
println((delta_deviance = round(delta_deviance, digits = 3),
         delta_df = delta_df, p = p_lr))`,
      out: `(delta_deviance = 25.269, delta_df = 1, p = 4.985700529479981e-7)`,
      a: [
        "この比較は『交互作用1項を加えると適合が改善するか』に答えます。モデルは同じ応答・同じ行・同じfamilyとlinkで、縮約モデルが完全モデルに含まれていなければなりません。",
        "χ²近似は漸近的です。小標本、疎なセル、境界上のパラメータでは当てにしすぎません。AICなど別の目的の指標を、p値の代用品にもしません。",
        "データを見ながら大量の候補を追加・削除するstepwise探索は、通常のp値やCIへ探索の不確かさを反映しません。理論と研究デザインに基づく少数の候補を事前に定め、予測目的なら未使用データで比較します。",
      ],
    },
    {
      t: "完全分離と疎なセルを、巨大な効果と誤読しない",
      b: [
        "説明変数が結果を完全に分けると、有限の最尤推定値が存在しません。GLMが停止するとは限らず、巨大な係数と0/1へ張り付いた予測を返すこともあります。",
      ],
      code: `separated_df = DataFrame(
    x = collect(-20.0:20.0),
    outcome = collect(-20.0:20.0) .> 0)
separated_model = glm(@formula(outcome ~ x), separated_df,
    Binomial(), LogitLink(); maxiter = 100)
println(round(coef(separated_model)[2], digits = 3))
println((minimum(predict(separated_model)), maximum(predict(separated_model))))`,
      out: `31.731
(3.1383332522731936e-283, 1.0)`,
      a: [
        "31.731を『非常に強い効果が精密に分かった』とは読みません。係数を大きくするほど尤度が改善し続け、通常のWald標準誤差・p値・オッズ比が不安定になる症状です。",
        "最初に結果×カテゴリのセル数、連続予測子ごとの重なり、反復時の警告、係数・標準誤差、予測の端への張り付きを確認します。完全でなくても準分離や希少イベントは同じ方向の不安定さを生みます。",
        "対応は、符号ミスやデータ漏洩を直す、設計上妥当ならカテゴリを統合する、データを増やす、罰則付き・Firth・弱情報事前分布を使う、などです。都合の悪いセルだけを削除することは対応ではありません。方法を変えた理由と感度分析を報告します。",
      ],
    },
    {
      t: "較正、識別、閾値を別々に評価する",
      b: [
        "説明・推論と予測評価を混同しません。予測目的なら訓練データと未使用の検証データを分けます。Brier scoreは確率誤差、calibration tableは予測確率と観測率の一致、AUCは陽性を陰性より上に順位づける能力を見ます。",
      ],
      code: `train_rng, test_rng = Xoshiro(3104), Xoshiro(3105)
train_x, test_x = randn(train_rng, 800), randn(test_rng, 1200)
train_p = logistic.(-0.8 .+ 1.2 .* train_x)
test_p = logistic.(-0.8 .+ 1.2 .* test_x)
train_df = DataFrame(x = train_x,
    outcome = rand(train_rng, 800) .< train_p)
test_df = DataFrame(x = test_x,
    outcome = rand(test_rng, 1200) .< test_p)
model = glm(@formula(outcome ~ x), train_df, Binomial(), LogitLink())

pairwise_auc(y, score) = mean(
    a > b ? 1.0 : a == b ? 0.5 : 0.0
    for a in score[y] for b in score[.!y])

test_prediction = predict(model, test_df)
brier = mean((Float64.(test_df.outcome) .- test_prediction) .^ 2)
auc = pairwise_auc(test_df.outcome, test_prediction)
overconfident = logistic.(2.5 .* log.(test_prediction ./ (1 .- test_prediction)))
println((brier = round(brier, digits = 3),
         overconfident_brier = round(mean((Float64.(test_df.outcome) .-
             overconfident) .^ 2), digits = 3),
         auc = round(auc, digits = 3),
         overconfident_auc = round(pairwise_auc(test_df.outcome,
             overconfident), digits = 3)))`,
      out: `(brier = 0.185, overconfident_brier = 0.216, auc = 0.761, overconfident_auc = 0.761)`,
      a: [
        "過信させた予測は順位を変えないのでAUCは同じ0.761ですが、Brier scoreは0.185から0.216へ悪化しました。AUCが同じだから確率として同品質、とは言えません。較正曲線や等人数binの予測率対観測率も見ます。",
        "陽性率5%のデータを全員陰性と予測すればaccuracyは95%でもsensitivityは0%です。accuracyだけでモデルを選ばず、陽性・陰性それぞれの誤りと母集団の有病率・ベースレートを示します。",
        "0.5は自然法則ではなく判断閾値です。偽陰性と偽陽性の損失、介入資源、対象母集団で決めます。予測モデルが因果的に介入効果を示すわけでもありません。",
      ],
    },
    {
      t: "確率を行動へ変える閾値は、モデル係数とは別の決定問題",
      b: [
        "係数が正、OR>1、p<.05であることは、『誰へ介入するか』を決めません。確率へ戻した後に、偽陰性・偽陽性の損失、介入の利益と害、資源制約、代替行動を定義します。ここでは説明のため偽陰性コスト5、偽陽性コスト1と置きますが、この比はデータから自動推定される医学的・倫理的価値ではありません。",
        "同じ未使用検証標本で、事前に候補とした閾値の感度、特異度、PPV、行動人数、1人あたり損失を並べます。閾値を下げれば見逃しは減りますが、介入対象と偽陽性は増えます。単一指標だけを最大化しません。",
      ],
      code: `function decision_metrics(y, probability, threshold;
                          false_negative_cost = 5,
                          false_positive_cost = 1)
    positive = probability .>= threshold
    tp = count(positive .& y)
    fp = count(positive .& .!y)
    fn = count(.!positive .& y)
    tn = count(.!positive .& .!y)
    return (;
        threshold,
        actions = sum(positive),
        sensitivity = tp / (tp + fn),
        specificity = tn / (tn + fp),
        ppv = tp / (tp + fp),
        cost_per_person = (false_negative_cost * fn +
                           false_positive_cost * fp) / length(y),
    )
end

decision_thresholds = [0.1, 1 / 6, 0.2, 0.5, 0.8]
decision_results = [decision_metrics(
    test_df.outcome, test_prediction, threshold)
    for threshold in decision_thresholds]

for result in decision_results
    println((
        threshold = round(result.threshold; digits = 3),
        actions = result.actions,
        sensitivity = round(result.sensitivity; digits = 3),
        specificity = round(result.specificity; digits = 3),
        ppv = round(result.ppv; digits = 3),
        cost = round(result.cost_per_person; digits = 3),
    ))
end`,
      out: `(threshold = 0.1, actions = 992, sensitivity = 0.964, specificity = 0.246, ppv = 0.404, cost = 0.555)
(threshold = 0.167, actions = 839, sensitivity = 0.887, specificity = 0.401, ppv = 0.44, cost = 0.588)
(threshold = 0.2, actions = 767, sensitivity = 0.853, specificity = 0.474, ppv = 0.463, cost = 0.598)
(threshold = 0.5, actions = 327, sensitivity = 0.476, specificity = 0.835, ppv = 0.606, cost = 1.016)
(threshold = 0.8, actions = 67, sensitivity = 0.13, specificity = 0.983, ppv = 0.806, cost = 1.519)`,
      a: [
        "0.5は損失1.016で、コスト比から導く1/6は0.588でした。0.1はこの有限検証標本では0.555ですが、テスト標本で最小値を探して0.1を選んだなら、この標本はもう最終性能の未使用評価には使えません。閾値選択を内側へ含め、別の外側検証またはnested resamplingで全手順を評価します。",
        "閾値0.8ではPPVが0.806でも感度は0.130で、362件の陽性を見逃しています。閾値0.1では感度0.964でも591件が偽陽性です。PPV、感度、行動人数のどれを優先するかは、利用場面の損失と制約を明示して初めて決められます。",
      ],
    },
    {
      t: "コスト比からの理論閾値も、較正と母集団に条件づく",
      b: [
        "予測確率が真のリスクとして較正され、行動の選択肢が二つ、偽陰性コストC_FNと偽陽性コストC_FPだけなら、陽性行動の閾値は `C_FP / (C_FP + C_FN)`です。5対1なら1/6です。較正不良、介入効果の異質性、資源上限、遅延、複数行動があれば、この単純式だけでは決められません。",
        "検証標本で観測結果を予測logitへ再回帰した切片0・傾き1が理想です。傾きが1より小さいと予測が極端すぎる傾向を示します。ただし同じ検証標本で再較正した後の性能を、そのまま外部性能として報告しません。",
      ],
      code: `predicted_logit = log.(test_prediction ./ (1 .- test_prediction))
calibration_df = DataFrame(
    outcome = test_df.outcome, predicted_logit = predicted_logit)
calibration_model = glm(
    @formula(outcome ~ predicted_logit), calibration_df,
    Binomial(), LogitLink())

overconfident_logit = 2.5 .* predicted_logit
overconfident_calibration_df = DataFrame(
    outcome = test_df.outcome,
    predicted_logit = overconfident_logit)
overconfident_calibration_model = glm(
    @formula(outcome ~ predicted_logit),
    overconfident_calibration_df, Binomial(), LogitLink())

sensitivity_fixed, specificity_fixed = 0.8, 0.8
prevalence = [0.05, 0.2, 0.5]
ppv_by_prevalence = sensitivity_fixed .* prevalence ./
    (sensitivity_fixed .* prevalence .+
     (1 - specificity_fixed) .* (1 .- prevalence))

println(round.(coef(calibration_model); digits = 3))
println(round.(coef(overconfident_calibration_model); digits = 3))
println(round.(ppv_by_prevalence; digits = 3))`,
      out: `[-0.098, 0.786]
[-0.098, 0.314]
[0.174, 0.5, 0.8]`,
      a: [
        "元の予測でも較正傾きは0.786で理想の1からずれ、過信変換後は0.314です。AUCが同じでも、意思決定に使う確率の意味は大きく違います。較正切片・傾きには標本誤差があり、外部母集団、時期、装置、診療経路が変われば再評価が必要です。",
        "感度・特異度をともに0.8へ固定しても、PPVは有病率5%、20%、50%で0.174、0.500、0.800へ変わります。開発標本のPPVや閾値を、ベースレートの違う母集団へそのまま移植しません。",
      ],
    },
    {
      t: "高リスク者を選ぶことと、介入で利益を得る人を選ぶことは別",
      b: [
        "ロジスティックGLM／GLMMが推定する通常のリスク `P(Y=1 | X)` は、行動した場合としなかった場合の差ではありません。高リスク者でも介入効果が小さい、低リスク者でも害が大きいことがあります。意思決定に必要なのが個別介入効果なら、反実仮想、治療×共変量相互作用、試験デザイン、因果推論の仮定が別途必要です。",
        "閾値を決める前に、行動の対象、利益、害、費用、容量、保留・追加検査という第三の選択肢を定義します。treat-all／treat-none／現行規則とも比較し、decision curveや期待効用を使う場合も効用の仮定を開示します。予測モデル単体のAUC最大化を意思決定最適化と呼びません。",
        "不確かな確率を一点で切らず、信頼区間・bootstrap・外部検証・subgroup別の較正と誤りも調べます。ただし集団ごとに機械的に異なる閾値を置けば公平になるわけではありません。アクセス、測定誤差、ラベル生成、介入後の影響を含め、利用者と当事者が監査できる形で判断規則を文書化します。",
      ],
    },
    {
      t: "条件付きと周辺、関連と因果を分けて報告する",
      b: [
        "多変量ロジスティック回帰の係数は、式に入れた他の変数を固定した条件付きオッズ比です。ロジスティック回帰のオッズ比は非可縮なので、共変量が交絡因子でなくても、追加前後で値が変わることがあります。『調整後に係数が変わった=交絡が除去された』とは自動的に言えません。",
        "因果効果を主張するには、時間順序、介入・曝露の定義、交絡構造、選択、測定誤差、欠測を研究デザインから検討します。予測精度や有意な係数だけでは因果になりません。",
        "最低限の報告は、観測単位と1の定義、nとイベント数、family/link、式と変数の投入根拠、カテゴリの全水準と参照水準、係数またはORとCI、代表値での予測確率・確率差とCI、モデル比較の方法、分離・疎セル・依存の診断、予測なら検証方法・較正・識別・閾値です。",
        "長期的には『一つの係数を出す手順』ではなく、生成過程→観測単位→estimand→符号化→適合→診断→確率尺度での解釈→外部検証という再利用可能な流れを身につけます。次は測定の質そのものを扱う古典的テスト理論へ進みます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "studyが1増えたときのオッズ比が常に3であるモデルについて、正しい説明はどれでしょう?",
      opts: [
        "オッズ比は一定でも、予測確率差は出発点によって変わる",
        "どのstudyでも成功確率が必ず3倍になる",
        "どのstudyでも成功確率が同じポイント数だけ増える",
      ],
      ans: 0,
      why: "ロジットは非線形なので、一定なのはログオッズ差とオッズ比です。確率差はS字曲線上の出発点によって変わります。",
      hint: "本文の確率差 `[0.111, 0.217, 0.268, 0.192, 0.091]` を見直しましょう。",
    },
    {
      k: "fill",
      q: "成功割合を応答、trialsを反復回数として集計二項モデルを当てます。空欄に入る関数名を入力しましょう。",
      code: `glm(@formula(proportion ~ x), grouped_df, Binomial(), LogitLink(); weights = 〔?〕(grouped_df.trials))`,
      accept: ["fweights"],
      show: "fweights",
      why: "StatsBaseの `fweights` で試行数をFrequencyWeightsとして渡します。割合だけでは各行の情報量が失われます。",
      hint: "frequency weightsを短くした関数名です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "ロジスティック回帰について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "同じ設計行を集計した成功割合は、試行数をfrequency weightsとして渡せば個票モデルと同じ尤度を表せる",
          a: true,
          why: "本文の例では、420行へ展開したBernoulli個票と、割合+試行数のBinomial集計で係数と予測が一致しました。",
        },
        {
          s: "カテゴリの参照水準を替えると、同じデータに対する予測確率も変わる",
          a: false,
          why: "同じモデル空間なら係数の意味と符号は変わっても予測は変わりません。本文では最大差が約2.2e−16でした。",
        },
        {
          s: "AUCが同じ2モデルは、予測確率の較正も同じである",
          a: false,
          why: "順位が同じならAUCは同じでも、確率を過信方向へ変えるとBrier scoreや較正は悪化します。識別と較正は別の性質です。",
        },
      ],
      hint: "個票と集計の同値性、参照水準変更の不変量、AUCが測るものを一つずつ分けましょう。",
    },
  ],
};
