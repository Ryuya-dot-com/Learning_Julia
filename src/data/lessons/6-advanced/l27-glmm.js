// レッスン: within／betweenデザインと混合効果モデル
// 掲載値は scripts/mixed-models-check.jl で固定検証する。
export default {
  id: "mixed-models",
  title: "within／betweenデザインと混合効果モデル",
  tag: "formula読解必須・fit任意：依存をデザインどおりに表す",
  pages: [
    {
      t: "formulaを読めたら初回は止めてよい",
      b: [
        "`必須理解` は、独立な単位、within／between、交差／入れ子を見分け、研究デザインからランダム切片・傾きのformula候補を説明できることです。初回はモデルを適合できなくても構いません。",
        "`出力読解` では、固定効果、分散成分、特異適合、条件付き／周辺予測がどの母集団への推論かを読みます。係数表だけでなく、一般化単位と診断を言葉にできることを優先します。",
        "`任意実装` は、`MixedModels.jl` によるLMM／GLMMの適合、モデル比較、bootstrap、grouped validationです。通常の検証環境にpackageが準備された後に実行し、この章の途中で環境を変更しません。",
      ],
    },
    {
      t: "行数より、独立な単位を数える",
      b: [
        "同じ参加者から何試行も、同じ項目を何人にも測ると、行は独立ではありません。このレッスンでは、参加者内(within-subject)と参加者間(between-subject)のデザインを混合効果モデルで表し、固定効果と分散成分を推定します。",
        "60人から24行ずつ得ても、参加者間の群効果を支える独立な単位は1440行ではなく主に60人です。一方、条件差が参加者内で操作されるなら、各人の条件差とその個人差が情報になります。『何行あるか』ではなく『どの単位を越えて一般化するか』からモデルを決めます。",
        "全行を通常の回帰へ入れる擬似反復、参加者ごとに平均して試行・項目情報を捨てる集約、どちらも常に安全ではありません。混合モデルは階層・交差構造を保持したまま部分プーリングします。",
      ],
    },
    {
      t: "反復測定ANOVAから混合モデルへ",
      b: [
        "2条件・完全に均衡・欠測なしの単純な参加者内デザインでは、対応のあるt検定、反復測定ANOVA、適切な混合モデルが同じ問いへ近い答えを返すことがあります。混合モデルは別の宇宙ではなく、線形モデルの誤差構造を拡張したものです。",
        "3水準以上では反復測定ANOVAが球面性などの共分散制約を伴います。ランダム切片だけのLMMも、参加者内相関をすべて同じとする強い構造です。混合モデルという名前だけで依存を解決したことにはなりません。",
        "混合モデルは、不均衡な試行数、欠測、連続共変量、参加者と項目の交差、個人ごとの条件効果を一つのモデルに表せます。ただし、欠測機構やモデル誤指定が自動的に解消されるわけではありません。",
      ],
    },
    {
      t: "長形式で生成過程を作る",
      b: [
        "60人×12項目×2条件の長形式データを作ります。groupは参加者間、conditionは参加者内です。条件を−0.5／+0.5に中心化すると、切片とgroup主効果は条件平均における値になります。",
      ],
      code: `using MixedModels, GLM, DataFrames, Distributions, Random, Statistics
rng = Xoshiro(3401)
n_subj, n_item = 60, 12
subj_id = repeat(1:n_subj, inner = n_item * 2)
item_id = repeat(repeat(1:n_item, inner = 2), outer = n_subj)
condition = repeat([0, 1], outer = n_subj * n_item)
condition_centered = condition .- 0.5
group_by_subj = repeat([0, 1], inner = n_subj ÷ 2)
group = group_by_subj[subj_id]

subj_intercept = randn(rng, n_subj) .* 80
subj_slope = randn(rng, n_subj) .* 35
item_intercept = randn(rng, n_item) .* 35
rt = 500 .+ 30 .* group .+ 40 .* condition_centered .+
     20 .* group .* condition_centered .+
     subj_intercept[subj_id] .+ subj_slope[subj_id] .* condition_centered .+
     item_intercept[item_id] .+ randn(rng, length(subj_id)) .* 50

rt_df = DataFrame(subj = string.("S", subj_id), item = string.("I", item_id),
    group = group, condition = condition,
    condition_centered = condition_centered, rt = rt)
println((observations = nrow(rt_df), subjects = length(unique(rt_df.subj)),
         items = length(unique(rt_df.item))))`,
      out: `(observations = 1440, subjects = 60, items = 12)`,
      a: [
        "真の固定効果はgroup 30ms、condition 40ms、交互作用20msです。参加者切片SD80、参加者条件傾きSD35、項目切片SD35、試行残差SD50も生成過程へ入れました。",
        "`Xoshiro(3401)`を関数へ明示的に渡す流れと同じで、他のセルやライブラリが乱数を使っても、この例の系列を汚しません。",
      ],
    },
    {
      t: "固定効果とランダム効果を式で読む",
      b: [
        "`rt ~ 1 + group + condition_centered + group & condition_centered` が母集団平均として説明する固定効果です。Juliaの式では`&`が交互作用を作ります。group=0における条件差がcondition係数、群によって条件差がどれだけ変わるかが交互作用です。",
        "`(1 | subj)`は参加者ごとの切片、`(1 + condition_centered | subj)`は切片と条件傾きの両方を参加者ごとに変えます。`(1 | item)`は項目ごとの基準差です。縦棒の右が一般化単位、左がその単位で変動を許す係数です。",
      ],
      code: `m_slope = fit(MixedModel,
    @formula(rt ~ 1 + group + condition_centered + group & condition_centered +
                 (1 + condition_centered | subj) + (1 | item)),
    rt_df; progress = false)
println(round.(coef(m_slope), digits = 2))`,
      out: `[475.08, 49.32, 47.22, 27.08]`,
      a: [
        "係数は順に切片、group、condition、交互作用です。真値30に対してgroup推定49.32が離れているのは、参加者間効果が60人の個人差の影響を受けるためです。1440行あることは、参加者数を1440人へ増やしたことを意味しません。",
        "ランダム効果は観測された水準一つずつの固定係数を増やすのではなく、水準間の分布を推定して部分プーリングします。個々の条件付きモードを母集団の独立な固定値と混同しません。",
      ],
    },
    {
      t: "擬似反復は特にbetween効果を壊す",
      b: [
        "同じ固定効果式を通常の`lm`へ入れると、各参加者の24行を独立な24人のように数えます。参加者ごとに一つしかないgroupのSEがどれほど変わるか比べます。",
      ],
      code: `fixed = @formula(rt ~ 1 + group + condition_centered +
                             group & condition_centered)
m_naive = lm(fixed, rt_df)
println((naive = round(stderror(m_naive)[2], digits = 2),
         mixed = round(stderror(m_slope)[2], digits = 2)))`,
      out: `(naive = 5.47, mixed = 22.0)`,
      a: [
        "groupのSEは通常回帰5.47に対し混合モデル22.00です。行を増やしただけの擬似的な精密さが消えました。cluster-robust SEも選択肢ですが、項目との交差やランダム傾き、分散成分自体を研究対象にするならモデル構造を明示する価値があります。",
        "『依存を無視するとSEは必ず小さくなる』とも一般化しません。効果がwithinかbetweenか、相関の符号、均衡性、どのランダム効果を落としたかで方向は変わりえます。この反例が示すのはbetween効果に対する擬似反復です。",
      ],
    },
    {
      t: "ランダム効果は水準を母集団へつなぐ",
      b: [
        "『参加者をランダムな順番で集めたからランダム効果』という意味ではありません。参加者ごとの係数を、平均0・推定する共分散を持つ母集団分布からのずれとして扱い、未観測の参加者へ一般化するモデル上の選択です。項目や施設も同様です。",
        "`ranef(m_slope)`で得る各水準の条件付きモードは、データの少ない・不確かな水準ほど母平均へ縮むpartial poolingを受けます。生の水準平均でも、互いに独立な固定効果推定値でもありません。個人診断や順位づけへ二次利用するなら、その不確かさを無視しません。",
        "固定かランダムかは変数に生得的な属性ではありません。特定の少数施設そのものを比較したい固定効果と、施設母集団へ一般化したいランダム効果では推定対象が違います。水準が極端に少ない場合、分散推定は不安定なので固定効果・ベイズ階層モデル・研究範囲の限定も比較します。",
      ],
    },
    {
      t: "ランダム切片だけでは条件差の個人差を表せない",
      b: [
        "ランダム切片モデルは、速い人・遅い人を表しますが、条件効果が大きい人・小さい人を表せません。操作が参加者内で変化し、同じ参加者内に各水準の反復があるなら、デザインが許す条件傾きを検討します。",
      ],
      code: `m_intercept = fit(MixedModel,
    @formula(rt ~ 1 + group + condition_centered + group & condition_centered +
                 (1 | subj) + (1 | item)), rt_df; progress = false)
println((random_intercept = round(stderror(m_intercept)[3], digits = 2),
         random_slope = round(stderror(m_slope)[3], digits = 2)))`,
      out: `(random_intercept = 3.93, random_slope = 6.89)`,
      a: [
        "condition係数のSEはランダム切片だけなら3.93、ランダム傾き込みでは6.89です。条件差の個人差を0と固定したモデルは、この例では確信過剰でした。",
        "`(1 + condition_centered | subj)`は切片SD、傾きSD、両者の相関も推定します。相関パラメータまで支えられない場合は`zerocorr(1 + condition_centered | subj)`で相関だけを0にできますが、結果を見た無制限な簡略化は避け、設計・収束・予測性能を併記します。",
      ],
    },
    {
      t: "mixed designは主効果と交互作用で表す",
      b: [
        "groupがbetween、conditionがwithinのmixed designは、固定効果`group + condition + group & condition`と、参加者内操作に対応する参加者ランダム効果で表せます。groupは各参加者内で変化しないため、groupのランダム傾きを参加者内から推定することはできません。",
        "−0.5／+0.5のconditionと0／1のgroupでは、切片はgroup=0の条件平均、group主効果は条件平均での群差、condition主効果はgroup=0の条件差、交互作用は群間のdifference-in-differencesです。符号化と参照群を報告しないと、同じモデルでも係数の文章が変わります。",
        "交互作用があるとき、主効果だけで『conditionの効果』を総括しません。事前に定めた群別条件差や条件別群差をモデルから予測し、多重性を考慮した下位比較へ接続します。",
      ],
    },
    {
      t: "時変共変量をwithinとbetweenへ分解する",
      b: [
        "日々のストレス`x_raw`のような時変共変量には、『普段ストレスが高い人ほど高い』between関係と、『同じ人が普段より高い日に高い』within関係が混ざります。生の一係数へ押し込むと、二つの問いが識別できません。",
        "参加者平均`x_between`と、各観測から参加者平均を引いた`x_within`へ分けます。これは単なるVIF対策ではなく、研究上異なる効果をモデル化するperson-mean centeringです。",
      ],
      code: `rng_context = Xoshiro(3402)
n_context, n_obs = 80, 10
person_mean = randn(rng_context, n_context)
u_context = randn(rng_context, n_context) .* 0.8
subj_context = repeat(1:n_context, inner = n_obs)
x_between = repeat(person_mean, inner = n_obs)
x_within = randn(rng_context, n_context * n_obs)
x_raw = x_between + x_within
y = 10 .+ 3 .* x_between .+ x_within .+
    repeat(u_context, inner = n_obs) .+ randn(rng_context, n_context * n_obs) .* 0.8
context = DataFrame(subj = string.("S", subj_context), x_raw = x_raw,
    x_between = x_between, x_within = x_within, y = y)

m_raw = fit(MixedModel, @formula(y ~ 1 + x_raw + (1 | subj)), context;
    progress = false)
m_split = fit(MixedModel,
    @formula(y ~ 1 + x_between + x_within + (1 | subj)), context;
    progress = false)
println((conflated = round(coef(m_raw)[2], digits = 2),
         between = round(coef(m_split)[2], digits = 2),
         within = round(coef(m_split)[3], digits = 2)))`,
      out: `(conflated = 1.03, between = 3.02, within = 1.0)`,
      a: [
        "生成時のbetween効果3、within効果1を分解モデルは3.02と1.00に復元しました。生の`x_raw`だけでは1.03となり、between関係をほぼ見失っています。",
        "実データでは時間順序、未測定交絡、測定誤差も残ります。within化したから因果効果になった、参加者固定効果と同じ問題をすべて解いた、とは主張しません。",
      ],
    },
    {
      t: "パネルでは時間の原点・単位・変化率を先に決める",
      b: [
        "同じ人を追跡するパネルでは、`time_since_baseline=0`を初回測定にすると切片はbaselineの期待値、time係数は参照群の1時間・1日・1か月あたり変化になります。wave番号ではなく実経過時間を使えば不規則な測定間隔を反映できます。時間の単位を変えると係数とランダム傾きSDの単位も変わります。",
        "一度だけ群間割付された`treatment`と反復するtimeを組み合わせる基本形は、`outcome ~ 1 + time_since_baseline + treatment + time_since_baseline & treatment + (1 + time_since_baseline | subj)`です。交互作用は群間の変化率差、ランダム時間傾きは個人ごとの自然経過の違いです。",
        "treatmentが各人で一つの値しか持たないなら、`(1 + treatment | subj)`のtreatment傾きを同一人物内から推定できません。反対に、日ごとに介入が再割付されるmicro-randomized designなら、十分な個人内変動を確認して`(1 + treatment | subj)`が候補になります。",
        "ランダム切片と時間傾きの相関は、time=0における初期値と変化率の相関です。timeを中央時点へ中心化すると相関の意味と数値は変わります。中心化は収束の道具だけでなく、どの時点の個人差を切片と呼ぶかという推定対象の選択です。",
      ],
    },
    {
      t: "個人別軌跡を生成し、ランダム時間傾きを復元する",
      b: [
        "100人をbaselineから11か月後まで追跡します。treatmentは参加者間、timeと`x_within`は参加者内、`x_between`は参加者平均です。生成過程には個人別切片・時間傾きと、lag-1係数0.7の時系列誤差を入れます。",
      ],
      code: `rng_panel = Xoshiro(3420)
n_panel_subj, n_panel_time = 100, 12
treatment_by_subj = repeat([0, 1], inner = div(n_panel_subj, 2))
x_mean_by_subj = randn(rng_panel, n_panel_subj)
panel_u0 = randn(rng_panel, n_panel_subj) .* 3
panel_u1 = randn(rng_panel, n_panel_subj) .* 0.6
panel_subj, panel_treatment = Int[], Int[]
panel_time, panel_between, panel_within, panel_outcome =
    Float64[], Float64[], Float64[], Float64[]
for s in 1:n_panel_subj
    previous_error = 0.0
    for time in 0:(n_panel_time - 1)
        within = randn(rng_panel)
        error = 0.7 * previous_error + 2 * randn(rng_panel)
        outcome = 50 + 2 * time + 5 * treatment_by_subj[s] +
            1.5 * time * treatment_by_subj[s] + 3 * x_mean_by_subj[s] +
            within + panel_u0[s] + panel_u1[s] * time + error
        push!(panel_subj, s); push!(panel_time, time)
        push!(panel_treatment, treatment_by_subj[s])
        push!(panel_between, x_mean_by_subj[s]); push!(panel_within, within)
        push!(panel_outcome, outcome)
        previous_error = error
    end
end
panel_df = DataFrame(
    subj = string.("S", panel_subj), time_since_baseline = panel_time,
    treatment = panel_treatment, x_between = panel_between,
    x_within = panel_within, outcome = panel_outcome)

panel_intercept = fit(MixedModel,
    @formula(outcome ~ 1 + time_since_baseline + treatment +
        time_since_baseline & treatment + x_between + x_within + (1 | subj)),
    panel_df; progress = false)
panel_slope = fit(MixedModel,
    @formula(outcome ~ 1 + time_since_baseline + treatment +
        time_since_baseline & treatment + x_between + x_within +
        (1 + time_since_baseline | subj)), panel_df; progress = false)

panel_residual = panel_df.outcome .- fitted(panel_slope)
previous_residual, following_residual = Float64[], Float64[]
for s in 1:n_panel_subj
    index = ((s - 1) * n_panel_time + 1):(s * n_panel_time)
    append!(previous_residual, panel_residual[index[1:(end - 1)]])
    append!(following_residual, panel_residual[index[2:end]])
end
panel_lag1 = cor(previous_residual, following_residual)
println((
    time = round(coef(panel_slope)[2], digits = 3),
    treatment = round(coef(panel_slope)[3], digits = 3),
    time_by_treatment = round(coef(panel_slope)[6], digits = 3),
    x_between = round(coef(panel_slope)[4], digits = 3),
    x_within = round(coef(panel_slope)[5], digits = 3),
    time_se = (random_intercept = round(stderror(panel_intercept)[2], digits = 3),
               random_slope = round(stderror(panel_slope)[2], digits = 3)),
    lag1_conditional_residual = round(panel_lag1, digits = 3),
    singular = MixedModels.issingular(panel_slope),
))`,
      out: `(time = 2.061, treatment = 4.718, time_by_treatment = 1.465, x_between = 2.537, x_within = 1.005, time_se = (random_intercept = 0.034, random_slope = 0.086), lag1_conditional_residual = 0.316, singular = false)`,
      a: [
        "真の参照群時間効果2、群間変化率差1.5、within効果1を、それぞれ2.061、1.465、1.005と復元しました。ランダム切片だけではtimeのSEが0.034、ランダム時間傾き込みでは0.086となり、個人ごとの変化率を同一と固定した確信過剰が見えます。",
        "treatment係数4.718はbaselineでの群差です。交互作用があるため、6か月時点の群差は`4.718 + 6 × 1.465`のように時点を指定して予測します。係数一つを全追跡期間の普遍的な処置効果と呼びません。",
      ],
    },
    {
      t: "ランダム時間傾きはAR(1)残差ではない",
      b: [
        "ランダム切片・時間傾きは、同じ人の全時点が共有する滑らかな軌跡差を表します。AR(1)は、軌跡を条件づけた後でも隣接時点ほど残差が似る構造です。片方を入れればもう片方が自動的に消えるわけではありません。この例でも条件付き残差のlag-1相関は0.316残りました。",
        "lag相関を計算するときは参加者内で時刻順に並べ、参加者境界をまたぐペアを除きます。不規則間隔では『一つ前のwave』だけでなく実際の時間差を見る必要があります。同じAR係数でも1日差と6か月差を同一視しません。",
        "残差相関が残るとき、非線形軌跡の欠落ならpiecewise timeやspline、個人差の欠落なら追加ランダム傾き、短期依存なら明示的な相関・状態空間・GEE等、原因と推定対象に合う方法を選びます。ランダム効果を際限なく追加してAR構造の代用品にしません。",
        "lagged outcomeを説明変数へ足すと、単なる残差修正ではなく『直前値を条件づけた短期変化』へ推定対象が変わります。固定効果、測定誤差、時間依存交絡との組合せでdynamic panel biasも生じるため、自動的な対処にしません。",
      ],
    },
    {
      t: "時変曝露・非線形成長・脱落を生成過程へ戻す",
      b: [
        "時変曝露`x_it`は個人平均`x_between`と偏差`x_within`へ分けます。同時点のwithin効果、前時点の`lag(x_within)`、累積曝露は別の問いです。曝露効果にも個人差を想定するなら、十分な個人内変動と反復数がある範囲で`(1 + time_since_baseline + x_within | subj)`を検討します。",
        "成長が直線でないなら、時間の二次項、piecewise slope、splineを固定効果へ入れ、どの形の個人差をランダム効果にするかを設計とデータ量から決めます。高次多項式とその全ランダム傾きを機械的に足すと、境界推定と外挿の不安定性を招きます。",
        "観測時点数が人ごとに違ってもLMMは不均衡データを扱えますが、脱落が未観測の将来値に依存する問題は自動的に解決しません。脱落時点・理由・直前アウトカムを可視化し、MAR仮定、pattern-mixtureやjoint model等への感度分析を検討します。",
        "予測評価も時間軸に合わせます。既知人物の将来なら過去→未来のforward split、未知人物の将来なら人物を外側で保留してその内側を時間分割します。未来の個人平均、再較正、閾値を訓練時点へ漏らさないよう、特徴量生成をfold内でやり直します。",
      ],
    },
    {
      t: "参加者と項目は交差する",
      b: [
        "同じ参加者が複数項目へ答え、同じ項目が複数参加者へ提示されるなら、参加者と項目はcrossedです。`(1 | subj) + (1 | item)`で両方の母集団へ一般化します。参加者だけを入れると、たまたま選んだ項目集合を固定した結論になりえます。",
        "項目が教材セット内だけに属し、別セットには決して現れないなど、ある水準が別の一水準の中だけに存在するならnestedです。Juliaでは`subj_session = string.(subj, '_', session)`のように一意な入れ子IDを作り、`(1 | subj) + (1 | subj_session)`と明示できます。",
        "crossedかnestedかはデータの並びやソフトウェアの都合ではなく、サンプリングと一般化の設計で決まります。水準名が全体で一意かも確認します。",
      ],
    },
    {
      t: "G理論のfacetを分散成分として推定する",
      b: [
        "前レッスンの一般化可能性理論で区別したperson・item・rater・occasionは、混合モデルのgrouping factorとして分散成分を推定できます。たとえば`score ~ 1 + (1 | person) + (1 | item) + (1 | rater)`は三つの基準差を分けます。",
        "ただし、この式だけで完全なG-studyになるわけではありません。person×item、person×raterなどの交互作用が識別できる交差デザインと反復が必要で、識別できない交互作用は残差へ混ざります。D-studyでは推定した成分を新しい項目数・評定者数へ再配分します。",
        "G係数と混合モデルをつなぐ核心は、信頼性を一つの普遍定数ではなく、設計・facet・決定目的に依存する分散比として扱うことです。",
      ],
    },
    {
      t: "固定効果の比較は同じランダム構造・MLで行う",
      b: [
        "交互作用を追加した価値を調べるなら、同じデータ、同じ応答変換、同じランダム効果を保ち、固定効果だけが入れ子になった二モデルを最尤法(ML)で比較します。デフォルトの`fit(MixedModel, ...)`はMLです。",
      ],
      code: `m_reduced = fit(MixedModel,
    @formula(rt ~ 1 + group + condition_centered +
                 (1 + condition_centered | subj) + (1 | item)), rt_df)
lr = deviance(m_reduced) - deviance(m_slope)
p_lr = ccdf(Chisq(1), lr)
println((lr = round(lr, digits = 2), p = round(p_lr, digits = 4)))`,
      out: `(lr = 7.27, p = 0.007)`,
      a: [
        "尤度比統計量7.27、χ²近似p=0.007です。`MixedModels.likelihoodratiotest(m_reduced, m_slope)`でもネストモデルを比較できます。AIC・BIC・予測性能と、交互作用を入れる科学的理由も別々に読みます。",
        "固定効果の異なるREML適合は、異なる固定効果空間を積分しているため尤度を直接比較しません。最終的なGaussian LMMの分散成分推定には`REML=true`も候補です。GLMMは通常MLで、同じREMLの選択はありません。",
        "ランダム効果の分散0はパラメータ空間の境界なので、通常のχ²近似がそのまま正確とは限りません。ランダム構造比較では設計上の根拠、parametric bootstrap、感度分析を検討します。",
      ],
    },
    {
      t: "変数投入順を自動stepwiseにしない",
      b: [
        "固定効果は、研究質問に必要な主効果・交互作用・事前共変量をブロックとして定義します。標本内p値が最小になるまで出し入れすると、係数・SE・p値・ランダム構造の選択不確かさが報告へ反映されません。",
        "ランダム効果は『有意なものだけ』ではなく、どの単位で操作・抽出・反復したかから始めます。一方、データが支えない最大構造へ盲目的に固執もしません。相関を外す`zerocorr`、傾きを減らす、変数を再符号化する判断は、収束・特異性・推定精度と研究上の一般化範囲を記録して行います。",
        "比較表には式、ML/REML、観測数、grouping factorの水準数、固定効果数、分散・相関パラメータ数、logLik/AIC/BIC、特異適合の有無を残します。モデル名だけの`m1`対`m2`では判断過程が監査できません。",
      ],
    },
    {
      t: "特異適合はデータとモデルの境界信号",
      b: [
        "ランダム効果SDが0、または相関が±1の境界へ達すると共分散行列がsingularになります。MixedModels.jlでは`MixedModels.issingular(model)`で確認します。optimizerが停止したことと、統計モデルが識別できることは別の診断です。",
      ],
      code: `rng_singular = Xoshiro(3404)
n_singular, n_pair = 18, 4
u_singular = randn(rng_singular, n_singular) .* 30
pair_error = randn(rng_singular, n_singular, n_pair) .* 50
subj_singular, cc_singular, y_singular = Int[], Float64[], Float64[]
for s in 1:n_singular, p in 1:n_pair, cc in (-0.5, 0.5)
    push!(subj_singular, s); push!(cc_singular, cc)
    push!(y_singular, 500 + 40 * cc + u_singular[s] + pair_error[s, p])
end
singular_df = DataFrame(subj = string.("S", subj_singular),
    condition_centered = cc_singular, y = y_singular)
too_complex = fit(MixedModel,
    @formula(y ~ 1 + condition_centered +
                 (1 + condition_centered | subj)), singular_df;
    progress = false)
println((singular = MixedModels.issingular(too_complex),
         theta = round.(too_complex.θ, digits = 3)))`,
      out: `(singular = true, theta = [0.887, -0.0, 0.0])`,
      a: [
        "この構成例では全参加者のペア条件差を厳密に40へ固定したのにランダム傾きを要求したため、傾き分散が境界0になりました。真の分散が0でも有限標本では必ずsingularになるわけではない点にも注意します。",
        "singularを『モデルが壊れた』の一言で終えず、各ランダム効果を支える水準数とwithin変動、符号化、分散推定、相関、別seed・bootstrapでの安定性を調べます。簡略化したモデルでは一般化範囲がどう変わるかを明記します。",
      ],
    },
    {
      t: "LMMとGLMMは応答分布で分ける",
      b: [
        "連続反応時間を正規残差で表すのがLMM、0/1反応をBernoulli分布とlogit linkで表すのがロジスティックGLMMです。ランダム効果を入れたからすべてGLMMなのではなく、応答分布が正規線形モデルを越えるかで『generalized』を区別します。",
        "L31の `glm(..., Binomial(), LogitLink())` は固定効果だけのロジスティックGLMです。ここでは `(1 | subj) + (1 | item)` を加えるためGLMMです。固定効果の指数変換は、ランダム効果が同じ値という条件付きORであり、母集団平均確率や意思決定上のリスク差へ直接置き換えません。",
      ],
      code: `rng_binary = Xoshiro(3403)
n_binary_subj, n_binary_item = 80, 16
u_binary = randn(rng_binary, n_binary_subj) .* 0.7
v_binary = randn(rng_binary, n_binary_item) .* 0.5
binary_subj, binary_item, binary_condition, response = Int[], Int[], Int[], Int[]
for s in 1:n_binary_subj, i in 1:n_binary_item
    c = isodd(s + i) ? 1 : 0
    probability = 1 / (1 + exp(-(-0.5 + 0.9 * c + u_binary[s] + v_binary[i])))
    push!(binary_subj, s); push!(binary_item, i); push!(binary_condition, c)
    push!(response, rand(rng_binary) < probability)
end
binary_df = DataFrame(subj = string.("S", binary_subj),
    item = string.("I", binary_item), condition = binary_condition,
    response = response)

m_binary = fit(MixedModel,
    @formula(response ~ 1 + condition + (1 | subj) + (1 | item)),
    binary_df, Bernoulli(); progress = false)
println((log_odds = round(coef(m_binary)[2], digits = 2),
         odds_ratio = round(exp(coef(m_binary)[2]), digits = 2)))`,
      out: `(log_odds = 1.15, odds_ratio = 3.17)`,
      a: [
        "condition係数1.15は、ランダム効果が同じという条件付きlog odds差で、ORは3.17です。集団平均の確率差やmarginal ORとは同じではありません。確率スケールの予測を代表的な共変量値で併記します。",
        "意思決定では、ランダム効果を0へ固定した新規水準の予測、既知水準の条件付き予測、ランダム効果分布を積分した周辺予測を区別します。どの予測でも、確率から行動への閾値は誤分類コスト・介入利益・較正を別途定義して決めます。",
        "0/1の一試行は`Bernoulli()`です。成功数／試行数へ集約した比率を`Binomial()`で扱う場合は試行数の情報が必要です。カウントならPoisson等を検討し、過分散やゼロ過剰を診断します。",
      ],
    },
    {
      t: "Bernoulliでもランダム傾きをデザインから入れる",
      b: [
        "0/1反応でも、条件効果が参加者ごとに異なる設計ならランダム傾きを検討します。ランダム切片だけでは、参加者ごとの基準成功率は変えられても条件差は全員同じに固定されます。各参加者が両条件を経験して初めて、その傾き分散をデータが支えます。",
        "この例ではランダム切片だけの条件係数SEは0.099、ランダム傾きを入れると0.136です。条件差の個人差を0へ固定したモデルは確信過剰でした。平均条件効果の符号だけでなく、誰・どの項目を越えて一般化するかをランダム構造へ反映します。",
      ],
      code: `rng_binary_slope = Xoshiro(3405)
n_slope_subj, n_slope_item = 100, 20
u0_slope = randn(rng_binary_slope, n_slope_subj) .* 0.7
u1_slope = randn(rng_binary_slope, n_slope_subj)
v0_slope = randn(rng_binary_slope, n_slope_item) .* 0.4
slope_subj, slope_item = Int[], Int[]
slope_condition, slope_response = Float64[], Int[]
for s in 1:n_slope_subj, i in 1:n_slope_item
    cc = isodd(s + i) ? 0.5 : -0.5
    eta = -0.6 + 0.8 * cc + u0_slope[s] + u1_slope[s] * cc + v0_slope[i]
    push!(slope_subj, s); push!(slope_item, i); push!(slope_condition, cc)
    push!(slope_response, rand(rng_binary_slope) < logistic_glmm(eta))
end
binary_slope_df = DataFrame(
    subj = string.("S", slope_subj), item = string.("I", slope_item),
    condition_centered = slope_condition, response = slope_response)

binary_intercept_only = fit(MixedModel,
    @formula(response ~ 1 + condition_centered + (1 | subj) + (1 | item)),
    binary_slope_df, Bernoulli(); progress = false)
binary_random_slope = fit(MixedModel,
    @formula(response ~ 1 + condition_centered +
                        (1 + condition_centered | subj) + (1 | item)),
    binary_slope_df, Bernoulli(); progress = false)
binary_slope_lrt = MixedModels.likelihoodratiotest(
    binary_intercept_only, binary_random_slope)
delta_deviance = 2 * (loglikelihood(binary_random_slope) -
                      loglikelihood(binary_intercept_only))
println((
    intercept_only = (estimate = round(coef(binary_intercept_only)[2], digits = 3),
                      se = round(stderror(binary_intercept_only)[2], digits = 3)),
    random_slope = (estimate = round(coef(binary_random_slope)[2], digits = 3),
                    se = round(stderror(binary_random_slope)[2], digits = 3)),
    deviance_difference = round(delta_deviance, digits = 3),
    optimizer = binary_random_slope.LMM.optsum.returnvalue,
    nAGQ = binary_random_slope.LMM.optsum.nAGQ,
    singular = MixedModels.issingular(binary_random_slope),
))`,
      out: `(intercept_only = (estimate = 0.757, se = 0.099), random_slope = (estimate = 0.808, se = 0.136), deviance_difference = 19.772, optimizer = :FTOL_REACHED, nAGQ = 1, singular = false)`,
      a: [
        "尤度差はランダム傾きを支持しますが、分散0という帰無仮説はパラメータ空間の境界です。通常のχ²分布による尤度比p値を最終判定にせず、parametric bootstrapや生成過程に対応したシミュレーションで選択の安定性を調べます。",
        "固定効果だけを変える比較とランダム構造を変える比較を混同しません。同じ観測、応答分布、link、固定効果、尤度近似を保ち、設計が支える候補を比較します。AICが小さいというだけで、未知水準への一般化が改善したとは限りません。",
      ],
    },
    {
      t: "収束コード・積分近似・統計的識別を分ける",
      b: [
        "`:FTOL_REACHED`はoptimizerが目的関数の変化量基準で停止したことを表すだけで、モデルが正しい、分散成分が識別できる、予測が較正されるという合格証ではありません。`m.LMM.optsum`のreturn code・評価回数・設定、`MixedModels.issingular(m)`、係数・SE・分散成分の極端さを別々に記録します。",
        "この教材で固定したMixedModels 5.8.0の`nAGQ=1`はLaplace近似です。`nAGQ>1`のadaptive Gauss–Hermite quadratureは単一の単純なscalar random-effects termに限られるため、参加者×項目やランダム傾きを持つこの例へ機械的には増やせません。モデル間で異なる近似設定のlogLik・AICを混ぜません。",
        "希少事象や完全・準完全分離では係数やSEが極端になり、ランダム効果を足すだけで必ず直るわけではありません。結果×カテゴリのクロス表、各水準の事象数、推定値の安定性を先に確認し、必要なら設計変更、正則化・事前分布を持つモデル、感度分析を検討します。",
        "過分散は単一のPearson比だけで合否判定しません。未指定のランダム傾き、serial dependence、混合分布、誤ったlinkも原因になり得ます。適合モデルからデザインどおりに反復生成し、cluster別事象率、連続成功列、極端な合計数、較正曲線が観測値を再現するかを確認します。",
      ],
    },
    {
      t: "条件付きORと周辺ORを同じ数だと思わない",
      b: [
        "logitの逆変換は非線形なので、ランダム効果を0にしてから確率へ戻すことと、確率へ戻してからランダム効果分布上で平均することは一致しません。前者はzero-random-effectの条件付き予測、後者は新しい参加者・新しい項目に対するplug-in周辺予測です。",
        "このモデルでは条件付きORが3.171なのに対し、参加者・項目の正規ランダム切片を積分した周辺ORは2.682です。確率差も0.280から0.241へ変わります。ORの指数変換だけを意思決定へ渡すと、対象集団の絶対リスクを取り違えます。",
        "下の積分は推定した分散成分を固定した数値近似で、固定効果・分散成分の推定不確かさは含みません。推論用の区間にはparametric bootstrap等、意思決定には外部標本での較正と効用・害の評価を別途加えます。",
      ],
      code: `binary_beta = coef(m_binary)
binary_subj_sd = first(m_binary.σs.subj)
binary_item_sd = first(m_binary.σs.item)
binary_random_sd = hypot(binary_subj_sd, binary_item_sd)
normal_grid = quantile.(Normal(), ((1:20_000) .- 0.5) ./ 20_000)
logistic_glmm(x) = inv(1 + exp(-x))
probability_to_odds(p) = p / (1 - p)

fixed_zero_probability = [
    logistic_glmm(binary_beta[1] + binary_beta[2] * c) for c in (0, 1)
]
marginal_probability = [
    mean(logistic_glmm.(binary_beta[1] + binary_beta[2] * c .+
                        binary_random_sd .* normal_grid)) for c in (0, 1)
]
conditional_or = exp(binary_beta[2])
marginal_or = probability_to_odds(marginal_probability[2]) /
              probability_to_odds(marginal_probability[1])
println((
    fixed_zero = round.(fixed_zero_probability, digits = 3),
    marginal = round.(marginal_probability, digits = 3),
    conditional_or = round(conditional_or, digits = 3),
    marginal_or = round(marginal_or, digits = 3),
    fixed_zero_difference = round(diff(fixed_zero_probability)[1], digits = 3),
    marginal_difference = round(diff(marginal_probability)[1], digits = 3),
))`,
      out: `(fixed_zero = [0.383, 0.663], marginal = [0.399, 0.641], conditional_or = 3.171, marginal_or = 2.682, fixed_zero_difference = 0.28, marginal_difference = 0.241)`,
      a: [
        "積分する対象も固定します。新しい参加者×新しい項目なら両分散を足した正規分布を積分します。既知参加者×新規項目なら参加者効果へ条件づけて項目効果だけを積分するため、この結果とは別の予測です。",
        "条件付きORと周辺ORは別のestimandです。値が近い方を選ぶのではなく、研究質問が『同じ参加者・項目内の比較』か『将来の母集団平均』かで選び、確率・確率差も併記します。",
      ],
    },
    {
      t: "既知／新規クラスターで予測対象を四分する",
      b: [
        "既知参加者×既知項目では、推定された両方のランダム効果へ条件づけた予測が使えます。既知参加者×新規項目では参加者へ条件づけて項目分布を積分し、新規参加者×既知項目ではその逆、新規参加者×新規項目では両方を積分します。『母集団レベル予測』という一語では、この四つを区別できません。",
        "既知水準の条件付き予測に使うランダム効果は、部分プーリングされた推定値であり既知の個人特性ではありません。観測数の少ない水準ほど不確かで、同じ人の再測定と未知の人への配備では予測性能も変わります。個人の順位づけや処遇へ無批判に流用しません。",
        "意思決定表には、予測対象、既知／新規のgrouping factor、条件づけた効果、積分した分布、予測時点で利用可能な情報を明記します。閾値はこの対象ごとに、偽陽性・偽陰性の害、介入の利益、資源制約を置いて検証します。",
      ],
    },
    {
      t: "ICCは潜在尺度、検証分割は配備単位で読む",
      b: [
        "logit GLMMでは観測0/1に通常の残差分散を直接推定しないため、ロジスティック分布の潜在残差分散π²/3を置いたICC近似がよく使われます。この例の参加者ICCは0.168、項目ICCは0.028、合計0.196です。これは潜在logit尺度の分散比で、観測された二値反応の相関そのものではありません。",
        "予測検証は配備先へ合わせます。同じ参加者・項目の将来試行なら時点を分け、未知参加者なら参加者単位、未知項目なら項目単位、両方未知なら二軸を保留します。行を無作為分割すると同じIDが学習・評価の双方へ入り、ランダム効果を覚えた性能を新規水準性能と誤認します。",
        "感度・特異度・PPV・較正・意思決定曲線は、目的の保留単位ごとに再計算します。平均性能だけでなくgrouping factor間のばらつき、未知水準での劣化、閾値を変えた損失も報告します。",
      ],
      code: `latent_logistic_variance = π^2 / 3
binary_variance_total = binary_subj_sd^2 + binary_item_sd^2 +
                        latent_logistic_variance
latent_icc = (
    subj = binary_subj_sd^2 / binary_variance_total,
    item = binary_item_sd^2 / binary_variance_total,
    combined = (binary_subj_sd^2 + binary_item_sd^2) /
               binary_variance_total,
)
println((subj = round(latent_icc.subj, digits = 3),
         item = round(latent_icc.item, digits = 3),
         combined = round(latent_icc.combined, digits = 3)))`,
      out: `(subj = 0.168, item = 0.028, combined = 0.196)`,
      a: [
        "ICCが小さいことは行の独立性を証明しません。試行数が多ければ小さな依存でも標準誤差や配備性能へ影響し、交差した参加者・項目を片方だけ無視する問題も残ります。",
        "条件付きAUCが高くても未知参加者での較正が悪ければ、その配備判断には使えません。モデル選択・性能評価・閾値選択を同じデータで完結させず、可能なら外部検証まで分離します。",
      ],
    },
    {
      t: "行分割は既知IDへの再予測を高く見せる",
      b: [
        "行を5分割すると、同じ参加者・項目の別の行が訓練側へ残り、テスト予測は推定済みランダム効果を利用できます。この既知IDへの条件付きBrier scoreは0.205ですが、同じテスト行をランダム効果0で予測すると0.255です。前者を未知参加者・未知項目の性能として報告すればID漏洩です。",
        "参加者96人×項目16個だけで再適合し、残る24人×4項目の交差部分へ配備すると、Brier scoreは0.272、log lossは0.739でした。テスト平均から予測平均を引くcalibration-in-the-largeは+0.103で、平均的に過小予測しています。",
      ],
      code: `rng_deployment = Xoshiro(3410)
n_deploy_subj, n_deploy_item = 120, 20
u_deploy = randn(rng_deployment, n_deploy_subj) .* 1.3
v_deploy = randn(rng_deployment, n_deploy_item) .* 0.8
deploy_s, deploy_i, deploy_c, deploy_y = Int[], Int[], Int[], Int[]
for s in 1:n_deploy_subj, i in 1:n_deploy_item
    c = isodd(s + i) ? 1 : 0
    p = logistic_glmm(-0.8 + 0.9 * c + u_deploy[s] + v_deploy[i])
    push!(deploy_s, s); push!(deploy_i, i); push!(deploy_c, c)
    push!(deploy_y, rand(rng_deployment) < p)
end
deployment_df = DataFrame(
    subj_index = deploy_s, item_index = deploy_i,
    subj = string.("S", deploy_s), item = string.("I", deploy_i),
    condition = deploy_c, response = deploy_y)

row_test = [mod(3 * s + 2 * i, 5) == 0 for
            (s, i) in zip(deployment_df.subj_index, deployment_df.item_index)]
row_model = fit(MixedModel,
    @formula(response ~ 1 + condition + (1 | subj) + (1 | item)),
    deployment_df[.!row_test, :], Bernoulli(); progress = false)
row_conditional = predict(row_model, deployment_df[row_test, :])
row_population = logistic_glmm.(coef(row_model)[1] .+
    coef(row_model)[2] .* deployment_df.condition[row_test])

group_train = (deployment_df.subj_index .<= 96) .&
              (deployment_df.item_index .<= 16)
both_new_test = (deployment_df.subj_index .> 96) .&
                (deployment_df.item_index .> 16)
group_model = fit(MixedModel,
    @formula(response ~ 1 + condition + (1 | subj) + (1 | item)),
    deployment_df[group_train, :], Bernoulli(); progress = false)
both_new = predict(group_model, deployment_df[both_new_test, :];
                   new_re_levels = :population)

brier_glmm(y, p) = mean((y .- p) .^ 2)
function log_loss_glmm(y, p)
    q = clamp.(p, eps(Float64), 1 - eps(Float64))
    mean(-y .* log.(q) .- (1 .- y) .* log1p.(-q))
end
println((
    row_conditional = (brier = round(brier_glmm(deployment_df.response[row_test], row_conditional), digits = 3),
                       log_loss = round(log_loss_glmm(deployment_df.response[row_test], row_conditional), digits = 3)),
    row_population = (brier = round(brier_glmm(deployment_df.response[row_test], row_population), digits = 3),
                      log_loss = round(log_loss_glmm(deployment_df.response[row_test], row_population), digits = 3)),
    both_new = (brier = round(brier_glmm(deployment_df.response[both_new_test], both_new), digits = 3),
                log_loss = round(log_loss_glmm(deployment_df.response[both_new_test], both_new), digits = 3),
                calibration_in_the_large = round(mean(deployment_df.response[both_new_test]) - mean(both_new), digits = 3)),
))`,
      out: `(row_conditional = (brier = 0.205, log_loss = 0.594), row_population = (brier = 0.255, log_loss = 0.704), both_new = (brier = 0.272, log_loss = 0.739, calibration_in_the_large = 0.103))`,
      a: [
        "`predict(...; new_re_levels=:population)`は未知水準のランダム効果を0にする予測で、前に計算したランダム効果分布を積分する周辺予測ではありません。response列も数値でnewdataへ残す必要があります。APIの既定値を推定対象の定義として扱いません。",
        "この二つのテスト集合は大きさも構成も異なるため、0.205対0.272をアルゴリズムだけの因果効果とは読みません。重要なのは、行分割・参加者保留・項目保留・両方保留が別の配備質問であり、予定する配備先と同じ分割を事前に選ぶことです。",
      ],
    },
    {
      t: "較正・閾値選択まで分割の外へ漏らさない",
      b: [
        "Brier scoreは確率誤差の二乗平均、log lossは自信を持った誤りを強く罰するproper scoring ruleです。AUCは順位、calibration-in-the-largeは平均のずれ、calibration slopeは確信の強さを見ます。一つの指標が良くても他を代用しません。",
        "leave-subject-outは未知参加者、leave-item-outは未知項目、二軸保留は両方未知への性能を問います。同じ人の将来試行が目的なら時間順に分けます。各foldで前処理、変数選択、モデル比較、再較正を訓練側だけからやり直し、テスト側のID・結果を使いません。",
        "閾値もテスト集合で最適化しません。内側の訓練／検証で偽陽性・偽陰性、介入利益・害、資源制約から選び、外側foldで固定して評価します。全体平均に加え、参加者・項目・重要な下位集団ごとの較正と損失分布を示します。",
        "未知水準で性能が落ちることは、必ずしもモデルの失敗ではありません。利用可能な情報が減るという配備問題です。既知ID性能と未知ID性能を同じラベルで平均せず、対象を狭める、追加測定して更新する、周辺予測を使う、配備を見送る、という選択肢を比較します。",
      ],
    },
    {
      t: "sjPlot相当は一つではなく役割で組み合わせる",
      b: [
        "Juliaにも便利な部品はありますが、RのsjPlotにあるtab_modelとplot_modelを一つで置き換える定番パッケージは、現状ありません。モデル表はcoeftable／RegressionTables.jl、固定効果に基づく予測・EM平均はEffects.jl、描画はCairoMakie.jl、ランダム効果の専門図はMixedModelsMakie.jl、という組合せが実務的です。",
        "最も堅い既定経路は、DataFrame(coeftable(model))で固定効果を表にし、VarCorr(model)でランダム効果と残差を別に確認することです。係数フォレスト図も、この係数表の推定値と区間をCairoMakieへ渡せば作れます。表の体裁より先に、固定効果・分散成分・条件付き予測のどれを示す図かを決めます。",
        "この教材のMixedModels 5.8.0では、最新のRegressionTables 0.7.9と依存関係が衝突するため、共存できる0.5.10を検証用に固定しました。ただし0.5.10の混合モデル表はランダム効果を表示せず、既定の推定法・R²欄も誤解を招くため、固定効果の横並び比較だけに限定します。現行ドキュメントのrender=AsciiTable()ではなく、旧APIのrenderSettings=asciiOutput()を使う点にも注意します。",
      ],
      code: `using DataFrames, RegressionTables
fixed_table = DataFrame(coeftable(m_slope))
comparison_text = String(regtable(
    m_intercept, m_slope;
    renderSettings = asciiOutput(),
    below_statistic = :se,
    regression_statistics = [:nobs],
    print_estimator_section = false,
    print_result = false,
))
println((fixed_rows = nrow(fixed_table),
         has_condition = occursin("condition_centered", comparison_text),
         random_structure_in_table = occursin("subj | condition_centered",
                                              comparison_text)))`,
      out: `(fixed_rows = 4, has_condition = true, random_structure_in_table = false)`,
      a: [
        "falseはバグを隠すための成功条件ではなく、互換版の限界を固定した監査結果です。論文表ではcomparison_textの上に『固定効果』と明記し、完全な式、VarCorr(m_slope)、ML／REML、singular判定を別欄へ併記します。",
        "RegressionTablesの新旧APIを混ぜると、そのままでは動きません。Project.tomlとManifest.tomlを保存し、教材・論文・共同研究ごとに環境を分けます。将来compatが解消したら、最新APIとランダム効果欄を再検証して更新します。",
      ],
    },
    {
      t: "plot_model(type=\"pred\")にはEffectsを使う",
      b: [
        "Effects.effectsは、指定した参照グリッドで固定効果に基づく予測、標準誤差、区間を返します。ここではランダム効果を0とした母集団レベルの線形予測であり、個人別予測でも、ランダム効果分布を積分したGLMMの完全なmarginal probabilityでもありません。何を平均した予測かをキャプションへ書きます。",
        "groupを0／1の数値で入れたモデルでは、emmeans(m_slope)へ任せると連続変数として平均0.5が参照値になります。0と1の両群を比べたいなら、effectsまたはemmeansのlevelsへ明示します。参照グリッドは作図上の飾りではなく、推定対象そのものです。",
      ],
      code: `using Effects
design = Dict(:group => [0, 1],
              :condition_centered => [-0.5, 0.5])
effect_grid = effects(design, m_slope)
println(select(effect_grid, :group, :condition_centered,
    :rt => ByRow(x -> round(x, digits = 2)) => :predicted_rt))

em = emmeans(m_slope; levels = design, ci_level = 0.95)
all_pairs = empairs(m_slope; levels = design,
                    dof = Inf, ci_level = 0.95)
println((means = nrow(em), all_pairwise_comparisons = nrow(all_pairs)))`,
      out: `4×3 DataFrame
 Row │ group  condition_centered  predicted_rt
─────┼─────────────────────────────────────────
   1 │     0                -0.5        451.47
   2 │     1                -0.5        487.25
   3 │     0                 0.5        498.69
   4 │     1                 0.5        561.56
(means = 4, all_pairwise_comparisons = 6)`,
      a: [
        "2×2の4セルからは6通りの全ペアが生じますが、すべてが研究質問ではありません。群ごとの条件差、条件ごとの群差、difference-in-differencesのどれを検定するかを先に定め、不要な比較を『下位検定』の名で自動生成しません。",
        "empairsのdof=Infは漸近z近似です。混合モデルの分母自由度には一意な定義がなく、padjustにはMultipleTesting.jl等の補正関数を渡せますが、CIは自動では同時区間になりません。小標本・境界推定・多数比較ではbootstrapや事前コントラストも検討します。",
      ],
    },
    {
      t: "効果図は予測値と区間から明示的に作る",
      b: [
        "plot_modelの予測図に近い図は、effect_gridをCairoMakieへ渡して作ります。生データ図、条件付き個人軌跡、固定効果予測図は別の図です。ここでは点と線が固定効果予測、帯が点ごとのWald 95%区間であることを軸とキャプションで明示します。",
      ],
      code: `using CairoMakie
fig = Figure(size = (640, 400))
ax = Axis(fig[1, 1], xlabel = "condition (centered)",
          ylabel = "fixed-effect prediction (ms)")

for (g, label, color) in [(0, "group 0", :steelblue),
                          (1, "group 1", :darkorange)]
    d = filter(:group => ==(g), effect_grid)
    band!(ax, d.condition_centered, d.lower, d.upper;
          color = (color, 0.18))
    lines!(ax, d.condition_centered, d.rt; color, label)
    scatter!(ax, d.condition_centered, d.rt; color)
end
axislegend(ax; position = :lt)
fig`,
      a: [
        "係数図ならDataFrame(coeftable(m_slope))から推定値とCIを作り、rangebars!とscatter!へ渡します。ランダム効果の縮約値・分散診断を可視化したい場合はMixedModelsMakie.jlが候補ですが、固定効果の効果図とは目的が異なります。",
        "便利な関数が作った美しい図でも、参照群、連続共変量の固定値、カテゴリ水準の重み、link／responseスケール、ランダム効果を条件づけたか積分したかが不明なら再現不能です。図を出力の終点ではなく、推定対象を監査する表面として使います。",
      ],
    },
    {
      t: "前提と不確かさを二階建てで診断する",
      b: [
        "Gaussian LMMでは、固定効果の線形性、条件付き残差の分散・形、groupを条件づけた後の独立性、ランダム効果分布、影響の大きい参加者・項目を調べます。GLMMでは応答分布、link、過分散、分離、予測確率の校正も加わります。",
        "欠測行を落とせても、欠測が未観測の反応に依存する問題は消えません。試行除外、参加者除外、項目除外が推定対象をどう変えたかをフローチャートと感度分析で示します。",
        "出力の固定効果p値は漸近z近似です。grouping factorの水準が少ない、分散が境界に近い、GLMMが疎な場合は過信せず、profile likelihood、parametric bootstrap、研究デザインに対応したシミュレーションを検討します。",
        "効果量は固定効果の生単位とCI、予測差、分散成分を中心に報告します。標準化係数やmarginal／conditional R²は分母・定義を明記します。『混合モデルのd』を一つの普遍値として扱いません。",
      ],
    },
    {
      t: "混合モデルの監査可能な実務フロー",
      b: [
        "実務フローは、推定対象と一般化範囲を定義する→long形式とIDの一意性を確認する→within／between、crossed／nestedを図にする→固定効果の符号化と参照値を固定する→デザインが支えるランダム切片・傾きを指定する→ML/REMLと応答分布を選ぶ→収束・特異性・残差・影響・予測を診断する→事前コントラストと不確かさを報告する→別標本・別項目で再評価する、です。",
        "最低限、完全な式、変数符号化、ソフトウェアと版、ML/REML、最適化設定、観測数と各grouping factorの水準数、固定効果とCI、分散成分と相関、singular判定、除外・欠測規則、モデル比較方法を残します。",
        "次の測定誤差では、説明変数・結果変数の信頼性が固定効果をどう希薄化させるかを扱います。その後の検定力設計では、参加者数だけでなく項目数、試行数、ランダム傾き、欠測を生成モデルへ戻します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "60人が各24試行を行う研究で、参加者ごとに一つだけ割り当てたgroupの効果を推定します。通常の回帰で1440行を独立とみなす主な問題はどれですか？",
      opts: [
        "group効果を支える独立単位を1440個のように数える擬似反復になる",
        "group変数が自動的に連続変数へ変わる",
        "条件効果が必ず0になる",
      ],
      ans: 0,
      why: "groupは参加者間でしか変化しません。同じ参加者の24行は独立な24人ではなく、参加者クラスタをモデル化する必要があります。",
      hint: "groupは一人の中で変化するかを考えます。",
    },
    {
      k: "fill",
      q: "参加者ごとに切片とcondition傾きが変わる項を入力しましょう。",
      code: `@formula(rt ~ 1 + condition + 〔?〕)`,
      accept: ["(1+condition|subj)", "(1 + condition | subj)"],
      show: "(1 + condition | subj)",
      why: "縦棒の右が参加者、左の1とconditionが参加者ごとに変動する切片と傾きです。",
      hint: "ランダム切片の1にconditionを足します。",
      placeholder: "ランダム効果項",
    },
    {
      k: "choice",
      q: "全参加者が複数の共通項目へ回答したとき、参加者と項目の構造を表す式はどれですか？",
      opts: [
        "(1 | subj) + (1 | item)",
        "(1 | subj)だけ",
        "(1 | item)だけ",
      ],
      ans: 0,
      why: "参加者と項目は互いに交差し、両方が抽出・一般化の単位です。",
      hint: "同じ項目を複数人が、同じ人が複数項目を経験します。",
    },
    {
      k: "tf",
      q: "混合効果モデルについて、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "固定効果の異なるGaussian LMMを尤度比で比べるなら、同じランダム構造を保ってMLで適合する",
          a: true,
          why: "異なる固定効果を持つREML尤度は直接比較せず、MLでネスト比較します。",
        },
        {
          s: "ランダム切片を入れれば、参加者ごとの条件効果の違いも自動的に表現される",
          a: false,
          why: "条件効果の個人差にはランダム傾きが必要です。ランダム切片は基準差だけを表します。",
        },
        {
          s: "singular fitは、ランダム効果SDが0や相関が±1の境界に達した可能性を示す",
          a: true,
          why: "データが要求した共分散構造を支えない信号なので、設計・符号化・分散成分を点検します。",
        },
      ],
      hint: "固定効果、ランダム効果、応答分布、推定法を分けて考えます。",
    },
    {
      k: "choice",
      q: "0／1で数値符号化したgroupを持つ混合モデルから、sjPlot風の表と両群の効果図を再現可能に作る手順はどれですか？",
      opts: [
        "完全な式・VarCorrを保存し、Effectsの参照グリッドへgroup=[0, 1]を明示する",
        "RegressionTables 0.5.10の既定表だけ保存し、Effectsではgroupの値を指定しない",
        "ランダム効果を固定効果へ変換し、観測行を独立として通常回帰する",
      ],
      ans: 0,
      why: "互換版の固定効果表にはランダム構造が出ず、数値groupは典型値へ固定されうるため、モデル構造の別保存と明示的な参照グリッドが必要です。",
      hint: "表が省略する情報と、予測時に固定される値を別々に考えます。",
    },
    {
      k: "fill",
      q: "【発展】患者は一つのclinicに属し、baselineから毎月追跡されます。treatmentは患者ごとに一度だけ割付。clinicごとの基準差と、患者ごとの基準値・時間傾きを表すランダム効果項を入力してください。patient IDは全clinicで一意です。",
      code: `@formula(outcome ~ 1 + time_since_baseline + treatment +
    time_since_baseline & treatment + 〔?〕)`,
      accept: [
        "(1+time_since_baseline|patient)+(1|clinic)",
        "(1 + time_since_baseline | patient) + (1 | clinic)",
        "(1|clinic)+(1+time_since_baseline|patient)",
        "(1 | clinic) + (1 + time_since_baseline | patient)",
      ],
      show: "(1 + time_since_baseline | patient) + (1 | clinic)",
      why: "timeは患者内で反復するため患者別傾きを推定でき、clinicには基準差を置きます。treatmentは患者内で変わらないので、患者別treatment傾きではありません。",
      hint: "どの変数がpatient内で変化し、どのIDが上位のクラスタかを分けます。",
      placeholder: "二つのランダム効果項",
    },
    {
      k: "choice",
      q: "【発展】12校で学校単位のprogramを割り付け、各校のclassに属する生徒を6時点追跡します。school_classは全体で一意です。学校・classの基準差と、生徒ごとの時間傾きを表す式はどれですか？",
      opts: [
        "score ~ 1 + time + program + time & program + (1 | school) + (1 | school_class) + (1 + time | student)",
        "score ~ 1 + time + program + time & program + (1 + program | student)",
        "score ~ 1 + time + program + time & program + (1 + time | school)だけ",
      ],
      ans: 0,
      why: "programは学校間、timeは生徒内です。指定された一般化範囲にはschool・classの切片とstudentの切片・time傾きが必要です。ただしprogram効果の独立な支持単位は主に12校なので、小標本推論には追加注意が要ります。",
      hint: "割付単位、入れ子の基準差、反復単位の時間傾きを一つずつ対応させます。",
    },
    {
      k: "choice",
      q: "【発展】毎日promptを参加者内で再割付し、共通itemへの0／1反応を測ります。prompt効果の個人差とitem差へ一般化する最小のランダム構造はどれですか？",
      opts: [
        "(1 + prompt | subj) + (1 | item)",
        "(1 | subj) + (1 + prompt | item)だけ",
        "(1 + subj | prompt) + (1 | item)",
      ],
      ans: 0,
      why: "promptが各参加者内で変化するので参加者別prompt傾きを置けます。共通itemは交差した抽出単位なのでitem切片も必要です。item別prompt差も一般化対象なら、設計が支える範囲でitem傾きを追加検討します。",
      hint: "promptの傾きが誰について変わるのか、itemは誰と交差するのかを考えます。",
    },
    {
      k: "tf",
      q: "【発展】パネルデータの式設計について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "個人別time傾きを入れれば、条件付き残差のAR(1)型依存も自動的に0になる",
          a: false,
          why: "ランダム傾きは共有軌跡、AR(1)は軌跡後の短期依存であり、別の共分散構造です。",
        },
        {
          s: "treatmentが参加者ごとに一度だけ割り付けられるなら、参加者別treatment傾きは同一人物内の情報から識別できない",
          a: true,
          why: "参加者内でtreatmentが変化しないためです。異質性はtimeとの交互作用や上位単位など、設計が支える形で表します。",
        },
        {
          s: "timeの原点をbaselineから中央時点へ変えると、切片と切片–傾き相関の意味は変わるが、同じモデル空間なら適合軌跡は変わらない",
          a: true,
          why: "再中心化はパラメータ表示を変えますが、対応する固定・ランダム項を保てば予測する軌跡は同じです。",
        },
      ],
      hint: "個人差、短期依存、時間の参照点、検証時点を別々に考えます。",
    },
  ],
};
