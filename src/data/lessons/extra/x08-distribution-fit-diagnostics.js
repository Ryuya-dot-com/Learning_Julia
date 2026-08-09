// 補講: 分布の推定と予測診断 — fitした分布をreplicate dataで反証する
// Julia 1.12.5 / Distributions 0.25.130 / DataFrames 1.8.2で掲載経路を検証。
// Distributions.jl・Julia Randomの公式stable docsを確認(2026-08-09)。
// https://juliastats.org/Distributions.jl/stable/fit/
// https://docs.julialang.org/en/v1/stdlib/Random/
export default {
  id: "distribution-fit-diagnostics",
  title: "分布の推定と予測診断",
  tag: "fitした分布を同じ標本サイズの予測へ戻して点検する",
  pages: [
    {
      t: "fitは結論ではなく、反証できる予測を作る入口",
      b: [
        "「分布のカタログ」ではsupportと生成過程から候補を絞りました。この補講では観測dataからparameterを推定し、その分布から観測と同じ標本サイズのreplicate dataを繰り返し生成します。観測された0、ばらつき、分位点、最大値が予測のどこに位置するかを調べます。",
        "分布を当てはめるだけなら1行です。しかし、推定に成功したこと、尤度が有限であること、dataに十分合うことは別々です。`fit`が値を返しても、平均だけ合い、裾や0の割合を外すmodelは残ります。",
        "ここでの順序は、①入力とsupportを監査する、②parameterを推定する、③parameter不確かさを分ける、④replicate dataを生成する、⑤研究上重要な要約で反証する、です。",
      ],
    },
    {
      t: "fitする観測集合を、欠測処理の後で固定する",
      b: [
        "`fit_mle(D, x)`へ渡す前に、0件、欠測、NaN、Inf、support外の値を検査します。欠測を黙って落とすと、どの観測集合へ分布を当てたのかが変わります。除外規則と除外件数を成果物へ残します。",
        "正の連続分布へ0以下を入れない、Poissonへ負数や非整数を入れない、といった検査は分布名を選ぶ前提です。fit後にも`insupport`と理論量の有限性を確認します。",
      ],
      code: `using Distributions

function audit_positive(x)
    isempty(x) && error("観測が0件です")
    any(ismissing, x) && error("欠測を処理してからfitします")
    y = Float64.(x)
    all(isfinite, y) || error("NaNまたはInfを含みます")
    all(>(0), y) || error("正の分布のsupport外です")
    y
end`,
      a: [
        "0を小さな正数へ機械的に置換しません。真の0、丸め、検出限界、入力ミスでは必要なmodelが違うからです。観測境界そのものをmodel化する方法は次のP1で扱います。",
      ],
    },
    {
      t: "fitは方法をdispatchし、fit_mleはMLEを明示する",
      b: [
        "Distributions.jl公式docsでは`fit(D, x)`が分布型`D`に適した方法を選び、多くの場合は最尤推定です。最尤推定を明示するときは`fit_mle(D, x)`を使います。どちらも、dataの配列からparameterを持つ分布オブジェクトを返します。",
        "NormalやLogNormalなど、現在の公式一覧にある分布で使えます。ただし、すべての分布に自動fitが実装されているわけではありません。constructorがあることと、MLEが提供されることを分けて確認します。",
      ],
      code: `using Statistics, Distributions

rt = [438.0, 452, 470, 481, 495, 502, 509, 517,
      526, 538, 551, 568, 590, 614, 648, 710]

d1 = fit(LogNormal, rt)
d2 = fit_mle(LogNormal, rt)

println(params(d1))
println(params(d1) == params(d2))`,
      out: `(6.279652435034126, 0.13173163362744825)
true`,
      a: [
        "`params(d)`はconstructor尺度のparameterです。LogNormalでは対数尺度のμとσであり、元尺度の平均とSDではありません。解釈には`mean(d)`、`std(d)`、`median(d)`も併記します。",
      ],
    },
    {
      t: "対応APIの一覧を確認し、未実装を推定成功と書かない",
      b: [
        "現行stable docsの`fit_mle`対応一覧にはNormal、LogNormal、Gamma、Exponential、Poissonなどがあります。Binomialは各実験の試行数n、Categoricalはカテゴリ数kを追加で渡す特別なinterfaceです。",
        "一方、NegativeBinomialはこの対応一覧にありません。`NegativeBinomial(r, p)`から生成できても、同じpackageがdataからrとpのMLEを自動計算するとは限りません。別package、独自最適化、回帰modelへ進むなら、その推定法と検証を別契約にします。",
        "`fit`はHistogramにも使われる共通名です。第一引数が`LogNormal`か`Histogram`かによって処理がdispatchされます。関数名だけでなく、型を含む呼出し全体を読みます。",
      ],
    },
    {
      t: "分布オブジェクトは点推定であり、parameter区間ではない",
      b: [
        "`fit_mle(LogNormal, rt)`が返すμとσは、観測dataを固定した点推定です。推定量の標準誤差や信頼区間が自動で付いた結果ではありません。dataを取り直せば推定値は揺れます。",
        "まずconstructor parameterと、元尺度の予測量を分けて保存します。推定表にはparameter名、尺度、estimate、method、nを持たせ、予測表にはmean、SD、分位点などを持たせます。",
      ],
      code: `using DataFrames, Statistics, Distributions

d = fit_mle(LogNormal, rt)
parameter_table = DataFrame(
    parameter = ["log_mu", "log_sigma"],
    estimate = collect(params(d)),
    method = fill("MLE", 2),
    n = fill(length(rt), 2),
)

println(round.((mean(d), std(d), quantile(d, 0.95)); digits = 2))`,
      out: `(538.25, 71.21, 662.71)`,
    },
    {
      t: "bootstrapでparameter推定の揺れを別に見る",
      b: [
        "parameter不確かさの最小例として、観測行を復元抽出し、各bootstrap標本で分布をfitし直します。各回で得た予測平均の分布から区間を作れば、『dataを取り直したときfitがどれくらい動くか』を見られます。",
        "これは後で行うreplicate dataとは役割が違います。bootstrapはparameter推定の揺れ、fit済み分布からのreplicate生成は条件付きの観測値の揺れです。階層構造があるdataでは、行ではなく参加者やclusterを再標本化する必要があります。",
      ],
      code: `using Random, Statistics, Distributions

rng = Xoshiro(2026)
n = length(rt)
boot_mean = [
    mean(fit_mle(LogNormal, rt[rand(rng, eachindex(rt), n)]))
    for _ in 1:2000
]

parameter_interval = quantile(boot_mean, [0.025, 0.5, 0.975])
println(length(boot_mean))
println(all(isfinite, parameter_interval))`,
      out: `2000
true`,
    },
    {
      t: "同じ標本サイズのreplicate dataを複数列として作る",
      b: [
        "予測診断では1本の乱数列に合否を委ねません。fitした分布`d`から、観測と同じn個をR回生成します。`rand(rng, d, n, R)`なら各列を1つのreplicate datasetとして扱えます。",
        "Rを増やすと予測区間のMonte Carlo誤差は小さくなりますが、誤modelは正しくなりません。R、RNG、Julia・package versionを記録し、testは特定の乱数値ではなくsize、support、有限性、診断区間の性質へ置きます。",
      ],
      code: `using Random, Distributions

d = fit_mle(LogNormal, rt)
n, R = length(rt), 2000
replicate_data = rand(Xoshiro(2027), d, n, R)

println(size(replicate_data))
println(all(>(0), replicate_data))
println(all(isfinite, replicate_data))`,
      out: `(16, 2000)
true
true`,
    },
    {
      t: "平均以外の診断量を、行がreplicateの表にする",
      b: [
        "各replicate datasetから、研究上重要な要約を同じ定義で計算します。正の連続値ならSD、下側閾値の割合、中央値、上位分位点、最大値、countなら0の割合、分散、上位分位点、最大値が候補です。",
        "診断量は後から都合よく増やすのではなく、生成過程と意思決定に結び付けて先に選びます。平均だけを検査すると、同じ平均を持つ誤modelを見逃します。",
      ],
      code: `using DataFrames, Statistics

summarize(x) = (
    mean = mean(x),
    sd = std(x; corrected = false),
    below_350 = count(<(350), x) / length(x),
    q50 = quantile(x, 0.50),
    q95 = quantile(x, 0.95),
    maximum = maximum(x),
)

diagnostics = DataFrame([
    summarize(view(replicate_data, :, r)) for r in axes(replicate_data, 2)
])
println(size(diagnostics))`,
      out: `(2000, 6)`,
    },
    {
      t: "観測値を予測分布の中央区間と裾へ戻す",
      b: [
        "各診断列の2.5%、50%、97.5%点を予測区間として、観測dataの同じ要約を重ねます。観測値が中央区間の外なら、その特徴をfit済みmodelが再現しにくいという具体的な不一致です。",
        "95%区間の内外を万能な検定へ変えません。複数の診断を見れば偶然外れるものもあり、parameterを同じdataで推定したplug-in予測はparameter不確かさを十分に含みません。不一致の方向と大きさ、結論への影響を報告します。",
      ],
      code: `interval(x) = (
    lower = quantile(x, 0.025),
    median = quantile(x, 0.50),
    upper = quantile(x, 0.975),
)

observed = summarize(rt)
q95_check = (
    observed = observed.q95,
    predicted = interval(diagnostics.q95),
)

println(q95_check.predicted.lower <= q95_check.observed <= q95_check.predicted.upper)`,
      out: `true`,
    },
    {
      t: "平均が同じExponentialでも、SDと中央値を外す",
      b: [
        "ExponentialのMLEは標本平均をscaleとして推定します。この反応時間dataへfitすると、予測平均は観測平均と一致します。しかしExponentialではSDも平均と同じになり、中央値は平均よりかなり小さくなります。",
        "LogNormal候補とExponential誤modelは平均だけなら区別できません。replicate dataのSD、350未満の割合、中央値、上位分位点を照合すると、どの特徴を外したかを反証できます。",
      ],
      code: `using Statistics, Distributions

wrong = fit_mle(Exponential, rt)
observed = (mean = mean(rt), sd = std(rt; corrected = false), median = median(rt))
predicted = (mean = mean(wrong), sd = std(wrong), median = median(wrong))

println(round.(Tuple(observed); digits = 2))
println(round.(Tuple(predicted); digits = 2))`,
      out: `(538.06, 71.18, 521.5)
(538.06, 538.06, 372.96)`,
      a: [
        "同じ平均を再現できることは必要でも十分ではありません。特に反応時間で大量の極端な短時間と非常に長い裾を予測するなら、平均が合っていても研究上は不適切です。",
      ],
    },
    {
      t: "countではPoissonを0・分散・最大値で点検する",
      b: [
        "PoissonのMLEも観測平均を再現しますが、理論上の分散も同じλです。未観測の異質性やclusterがある過分散dataでは、0と大きなcountを同時に少なく予測することがあります。",
        "この不一致を『Poissonが有意に棄却された』だけで終えず、観測単位、exposure、依存、構造的0を点検します。NegativeBinomialを候補にするときも、現行Distributions.jlがそのMLEを自動提供すると決めつけません。",
      ],
      code: `using Statistics, Distributions

counts = [0, 0, 0, 0, 0, 1, 1, 1, 2,
          2, 3, 3, 4, 5, 7, 9, 12, 15]
d_count = fit_mle(Poisson, counts)

println((
    observed_mean = round(mean(counts), digits = 3),
    observed_var = round(var(counts; corrected = false), digits = 3),
    zero_rate = round(count(iszero, counts) / length(counts), digits = 3),
    poisson_mean = round(mean(d_count), digits = 3),
    poisson_var = round(var(d_count), digits = 3),
))`,
      out: `(observed_mean = 3.611, observed_var = 18.571, zero_rate = 0.278, poisson_mean = 3.611, poisson_var = 3.611)`,
    },
    {
      t: "QQとPITは、ずれが起きる場所を連続的に見る",
      b: [
        "QQ診断では、並べた観測値とfit済み分布の同じ累積確率における理論分位点を比べます。中央は合うが右端だけ上へ逸れるなら、右裾を過小予測している可能性があります。相関係数1つへ縮約せず、どの範囲がずれたかを見ます。",
        "連続分布のPITは`cdf(d, x)`で各観測を0〜1へ写します。modelとparameterが固定され正しければ一様性が基準ですが、同じdataでparameterを推定した場合は厳密な一様性検定として扱いません。図とreplicate診断を補助する位置診断です。離散分布にはrandomized PITなど別の扱いが必要です。",
      ],
      code: `using Distributions

d = fit_mle(LogNormal, rt)
n = length(rt)
probability = ((1:n) .- 0.5) ./ n

qq_table = (
    theoretical = quantile.(Ref(d), probability),
    observed = sort(rt),
)
pit = cdf.(Ref(d), rt)

println(length(qq_table.observed) == length(qq_table.theoretical))
println(all(x -> 0 <= x <= 1, pit))`,
      out: `true
true`,
    },
    {
      t: "候補比較は同じ診断定義と同じ観測設計で行う",
      b: [
        "Normal、LogNormal、Gammaなど複数候補を比べるときは、同じn、同じgroup構造、同じ欠測・丸め過程でreplicate dataを作り、同じ診断量へ戻します。候補ごとに都合のよい図や要約を変えません。",
        "尤度やAICのような相対比較と、予測診断のような絶対的な不一致は役割が違います。候補中で最良でも重要な特徴を全候補が外すことがあります。選択したmodelだけでなく、棄却した候補と不一致の根拠も記録します。",
        "診断dataでmodelを修正し続けた後は、新しいdata、holdout、感度分析で過適合を点検します。予測診断はmodelを証明する儀式ではなく、次に直すべき生成過程を見つける道具です。",
      ],
    },
    {
      t: "推定表・予測診断表・run情報を分けて保存する",
      b: [
        "P0-Bの入出力契約へ戻り、parameter推定表、予測診断表、観測要約表を別CSVへ書き出します。各表にrun ID、model名、sample size、replicate数、RNG seedを持たせれば、図の点がどの計算から来たか追跡できます。",
        "raw dataを上書きせず、書出し後に列名・型・行数・checksumを読み戻して検査します。乱数data全体を常に保存する必要はありませんが、診断表、seed、環境、生成関数、Rは再生成できる形で残します。bit単位の保持が必要ならreplicate data自体を成果物にします。",
      ],
      code: `using CSV, DataFrames

diagnostic_output = DataFrame(
    statistic = ["sd", "q50", "q95", "maximum"],
    observed = [observed.sd, observed.q50, observed.q95, observed.maximum],
    predicted_lower = [interval(diagnostics[!, s]).lower for s in (:sd, :q50, :q95, :maximum)],
    predicted_median = [interval(diagnostics[!, s]).median for s in (:sd, :q50, :q95, :maximum)],
    predicted_upper = [interval(diagnostics[!, s]).upper for s in (:sd, :q50, :q95, :maximum)],
)

CSV.write("output/distribution_diagnostics.csv", diagnostic_output)`,
    },
    {
      t: "完了条件は、推定成功ではなく反例を説明できること",
      b: [
        "完了時には、入力集合と除外、候補分布とparameterization、推定法、点推定と不確かさ、replicateの設計、事前に選んだ診断量、不一致の方向、結論への影響を説明できるようにします。",
        "自動検証では、特定の乱数列ではなく、support、有限性、sample size、replicate数、理論量、診断区間の順序を固定します。さらに、平均が合うExponentialと、平均が合うPoissonの誤modelがSD・0・分位点・最大値で停止する反例を含めます。",
        "続く番号なし補講「観測境界・依存・混合分布」では、0や測定限界を除外せずtruncated／censored modelへ戻すこと、依存をMvNormalへ入れること、異質性をMixtureModelの生成で表すことへ進みます。混合分布の自動推定が同じpackageにあるとは主張しません。",
      ],
    },
  ],
  ex: [
    {
      k: "fill",
      q: "分布型Dをdata xへ最尤推定で当てはめる関数名を入力してください。",
      code: `d = 〔?〕(D, x)`,
      accept: ["fit_mle"],
      show: "fit_mle",
      why: "`fit_mle(D, x)`は対応分布について最尤推定を明示します。対応一覧と特別な引数も公式docsで確認します。",
      hint: "fitとmaximum likelihood estimationをつないだ名前です。",
      placeholder: "関数名",
    },
    {
      k: "choice",
      q: "`fit_mle(LogNormal, x)`が返す分布オブジェクトについて正しい説明はどれですか？",
      opts: [
        "parameterの点推定であり、標準誤差や区間は別に評価する",
        "parameterの95%信頼区間を自動で含む",
        "modelが正しいことまで証明する",
      ],
      ans: 0,
      why: "fit済み分布は点推定です。parameter不確かさとmodel不一致は別の手続きで調べます。",
      hint: "推定値、不確かさ、適合を分けます。",
    },
    {
      k: "fill",
      q: "明示RNG rng、fit済み分布dから、観測と同じn個をR回生成します。関数名を入力してください。",
      code: `replicate_data = 〔?〕(rng, d, n, R)`,
      accept: ["rand"],
      show: "rand",
      why: "`rand(rng, d, n, R)`はn×R行列を返し、各列を同じ標本サイズのreplicate dataとして扱えます。",
      hint: "乱数生成の共通APIです。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "予測診断について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "平均が観測dataと一致すれば分布全体も十分に合う",
          a: false,
          why: "同じ平均でもSD、0の割合、分位点、最大値を大きく外すmodelがあります。",
        },
        {
          s: "replicate dataは観測と同じ標本サイズと設計で生成する",
          a: true,
          why: "標本サイズやgroup構造が違えば、要約統計の予測変動を公平に比較できません。",
        },
        {
          s: "乱数を使うtestでは特定列よりsupport・size・有限性を優先する",
          a: true,
          why: "乱数実装が更新されても、教材で保証したい統計的性質を検査できます。",
        },
      ],
      hint: "平均、観測設計、乱数testの3点を確認します。",
    },
    {
      k: "choice",
      q: "平均だけ合うPoisson modelの不一致を見つける診断として最も適切なのはどれですか？",
      opts: [
        "同じnのreplicateごとに0の割合・分散・上位分位点・最大値を比較する",
        "観測平均をもう一度表示するだけにする",
        "最初に生成された乱数1個と観測1個を一致させる",
      ],
      ans: 0,
      why: "Poissonはfitで平均を再現しても、過分散dataの0と裾を再現できないことがあります。",
      hint: "平均以外の生成上重要な特徴へ戻します。",
    },
    {
      k: "fill",
      q: "replicateのq95列から中央95%予測区間を求めます。空欄に入る関数名を入力してください。",
      code: `bounds = 〔?〕(diagnostics.q95, [0.025, 0.975])`,
      accept: ["quantile"],
      show: "quantile",
      why: "replicateごとの診断量の2.5%点と97.5%点で中央95%区間を作ります。",
      hint: "分位点を返すStatisticsの関数です。",
      placeholder: "関数名",
    },
  ],
};
