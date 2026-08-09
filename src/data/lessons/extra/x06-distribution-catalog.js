// 補講: 分布のカタログ — supportと生成過程から候補を比較する
// Julia 1.12.5 / Distributions 0.25.130で掲載出力を検証。
// 分布のparameterizationはDistributions.jl公式docsを確認(2026-08-09)。
export default {
  id: "distribution-catalog",
  title: "分布のカタログ",
  tag: "取りうる値・生成過程・仮定から候補を選ぶ",
  pages: [
    {
      t: "分布名の暗記ではなく、候補を絞る地図を作る",
      b: [
        "確率分布編ではBernoulli、Binomial、Poisson、Normal、LogNormalを使いました。この補講では、研究でよく出会う分布を『取りうる値』『データの生まれ方』『平均と分散の関係』で比較します。",
        "最初の問いは離散か連続か、値の範囲は何かです。次に、1回の結果か、決まった回数の合計か、一定区間の発生数か、正の量か、0から1の割合かを考えます。最後に仮定がdataと目的に十分かを予測で確認します。",
        "分布は観測されたhistogramへ名前を貼る分類器ではなく、未知のdataを生成するmodelです。同じ形に見えても生成過程が違えば、外挿や不確かさは変わります。",
      ],
    },
    {
      t: "0／1と成功数: Bernoulli・Binomial",
      b: [
        "1試行の成功・失敗は`Bernoulli(p)`、同じ成功確率を持つ独立試行を決まった回数nだけ行った成功数は`Binomial(n, p)`が候補です。Binomialは0からnまでしか取りません。",
        "試行ごとに成功確率が違う、試行が依存する、nが個体ごとに違う場合は、単純なBinomialの仮定を見直します。集計率だけでなく分母nも保存します。10人中5人と1000人中500人は同じ50%でも不確かさが違います。",
      ],
      code: `using Statistics, Distributions

one_trial = Bernoulli(0.7)
twenty_trials = Binomial(20, 0.7)

println((bernoulli_mean = mean(one_trial),
         binomial_mean = mean(twenty_trials)))
println((support_20 = insupport(twenty_trials, 20),
         support_21 = insupport(twenty_trials, 21)))`,
      out: `(bernoulli_mean = 0.7, binomial_mean = 14.0)
(support_20 = true, support_21 = false)`,
    },
    {
      t: "発生回数: PoissonとNegativeBinomial",
      b: [
        "一定の時間・面積・機会あたりの発生数には`Poisson(λ)`が出発点です。Poissonでは平均と分散がともにλです。観測間の機会量が違うなら、回数だけでなく観察時間などのexposureをmodelへ入れます。",
        "分散が平均より大きいoverdispersionではNegativeBinomialが候補になります。ただしparameterizationに注意します。Distributions.jlの`NegativeBinomial(r, p)`はr回目の成功までの失敗数で、平均はr(1-p)/pです。回帰packageの平均・dispersion表現と同じ引数だと決めつけません。",
      ],
      code: `using Statistics, Distributions

pois = Poisson(2.5)
nb = NegativeBinomial(5, 2 / 3)

println((poisson_mean = mean(pois), poisson_var = var(pois)))
println((nb_mean = mean(nb), nb_var = var(nb)))`,
      out: `(poisson_mean = 2.5, poisson_var = 2.5)
(nb_mean = 2.5000000000000004, nb_var = 3.750000000000001)`,
      a: [
        "0が多いだけで直ちにzero-inflated modelへ進みません。sampling unit、観察時間、構造的に発生不能な群、未観測の異質性を先に確認します。",
      ],
    },
    {
      t: "実数全体: NormalとTDist",
      b: [
        "左右対称で、平均の周りに加法的な誤差が集まる連続値には`Normal(μ, σ)`が基本候補です。正規分布は負の値も生成するため、反応時間や濃度のように負にならない量では、観測範囲と目的を確認します。",
        "`TDist(ν)`は標準化されたt分布で、正規分布より裾が厚くなります。小さな自由度では極端値を相対的に生成しやすい一方、ν≤1では平均、ν≤2では分散が有限でないため、parameterの意味を確認します。単に外れ値を無視する道具ではありません。",
      ],
      code: `using Statistics, Distributions

normal = Normal()
t5 = TDist(5)

println((normal_q975 = round(quantile(normal, 0.975), digits = 3),
         t5_q975 = round(quantile(t5, 0.975), digits = 3)))
println(round(std(t5), digits = 3))`,
      out: `(normal_q975 = 1.96, t5_q975 = 2.571)
1.291`,
    },
    {
      t: "正の連続値: LogNormal・Gamma・Exponential",
      b: [
        "0より大きく右裾を引く量には`LogNormal(μ, σ)`や`Gamma(α, θ)`が候補です。LogNormalのμとσは対数尺度、Gammaのαはshape、θはscaleです。引数を元尺度の平均とSDだと思わないようにします。",
        "`Exponential(θ)`はGammaのshape=1に相当し、平均とSDがともにθです。待ち時間modelではmemorylessという強い性質を持つため、右裾だからという理由だけで選びません。0を含む測定値では、丸め、検出限界、真の0を区別します。",
      ],
      code: `using Statistics, Distributions

lognormal = LogNormal(log(500), 0.25)
gamma = Gamma(2, 3)
waiting = Exponential(4)

println((lognormal_median = median(lognormal),
         gamma_mean = mean(gamma), gamma_var = var(gamma)))
println((exponential_mean = mean(waiting), exponential_std = std(waiting)))`,
      out: `(lognormal_median = 499.99999999999983, gamma_mean = 6.0, gamma_var = 18.0)
(exponential_mean = 4.0, exponential_std = 4.0)`,
    },
    {
      t: "0から1の連続値: Beta",
      b: [
        "`Beta(α, β)`は0と1の間の連続値を表します。確率や潜在的な割合のmodelに使えますが、観測された成功数そのものはBinomialです。分母を持つ割合をBetaへ直接入れると、試行数の違いを失うことがあります。",
        "Distributions.jlではBeta分布のsupportを0から1として扱いますが、連続分布なので個々の一点へ正の確率質量を置きません。dataに厳密な0や1が繰り返し現れる場合、測定・丸めの仕組み、成功数／試行数としてのmodel、端点に質量を持つ別の生成過程を検討します。小さな定数を無条件に足して押し込めません。",
      ],
      code: `using Statistics, Distributions

prior_probability = Beta(2, 5)
println((mean = round(mean(prior_probability), digits = 3),
         q10 = round(quantile(prior_probability, 0.10), digits = 3),
         q90 = round(quantile(prior_probability, 0.90), digits = 3)))
println((zero = insupport(prior_probability, 0.0),
         half = insupport(prior_probability, 0.5)))`,
      out: `(mean = 0.286, q10 = 0.093, q90 = 0.51)
(zero = true, half = true)`,
    },
    {
      t: "カテゴリ値と順序は、数値codeの距離を仮定しない",
      b: [
        "赤・緑・青のような名義カテゴリは、整数codeを付けても連続量にはなりません。`Categorical([p1, p2, ...])`は1からKのカテゴリindexを生成しますが、1と2の距離に量的意味はありません。labelとの対応をmetadataへ残します。",
        "低・中・高の順序カテゴリには順序がありますが、隣接差が等しいとは限りません。平均codeを計算する前に、順序logitなど順序を使うmodelと、名義カテゴリmodelを研究の問いに合わせて選びます。",
      ],
      code: `using Statistics, Distributions

labels = ["control", "treatment", "followup"]
d = Categorical([0.5, 0.3, 0.2])

println((categories = length(probs(d)), probabilities = probs(d)))
println(labels[argmax(probs(d))])`,
      out: `(categories = 3, probabilities = [0.5, 0.3, 0.2])
control`,
    },
    {
      t: "共通APIで、候補の予測を同じ問いで比較する",
      b: [
        "Distributions.jlでは`mean`、`var`、`quantile`、`cdf`、`logpdf`、`rand`などを多くの分布へ共通して使えます。分布名を変えても、予測範囲や裾確率を同じ問いで比較できます。",
        "乱数による確認では明示的なRNGを渡し、具体的な乱数列より、support、標本size、有限性、理論値への近さといった性質をtestします。乱数seedを固定しても、誤った生成過程は正しくなりません。",
      ],
      code: `using Random, Statistics, Distributions

rng = Xoshiro(2026)
d = Gamma(2, 3)
draws = rand(rng, d, 20_000)

println((n = length(draws), positive = all(>(0), draws)))
println(isapprox(mean(draws), mean(d); atol = 0.15))`,
      out: `(n = 20000, positive = true)
true`,
    },
    {
      t: "選択後は、生成した予測と反例をdataへ戻す",
      b: [
        "候補分布から、観測と同じsize・group構造・欠測過程を持つreplicate dataを生成し、0の割合、分位点、group差、最大値など研究上重要な特徴を比較します。平均だけ合っていても、裾や分散が合わないことがあります。",
        "モデル選択に同じdataを使い続けると、偶然の特徴へ合わせすぎます。目的が説明か予測かを明示し、必要に応じて事前予測、posterior predictive check、holdout、感度分析を使い分けます。",
        "分布選択の順序は、①support、②生成過程、③parameterization、④予測される特徴、⑤反例、⑥推論・意思決定への影響です。『有名だから正規分布』と『histogramが似たから採用』の間に、この検査可能な根拠を置きます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "20問中の正答数を表す出発点として最も自然な分布はどれですか？",
      opts: ["Binomial", "Beta", "Normal"],
      ans: 0,
      why: "決まった20試行における成功数で、0から20までを取るためBinomialが出発点です。",
      hint: "1回の正誤を決まった回数だけ合計します。",
    },
    {
      k: "fill",
      q: "分布dが値xを取りうるか確認する関数名を入力してください。",
      code: `possible = 〔?〕(d, x)`,
      accept: ["insupport"],
      show: "insupport",
      why: "`insupport(d, x)`はxが分布dのsupportに含まれるかをBoolで返します。",
      hint: "inとsupportをつないだ名前です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "分布選択について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "Distributions.jlのNegativeBinomial(r, p)では引数の意味を公式docsで確認する",
          a: true,
          why: "packageや文献によってparameterizationが異なるため、名前だけで引数を移しません。",
        },
        {
          s: "0から1の観測割合なら、分母に関係なく必ずBeta分布へ入れる",
          a: false,
          why: "成功数と試行数がある場合、Binomial構造を保つ必要があります。",
        },
        {
          s: "supportと平均が合えば、生成過程や裾の予測を確認しなくてよい",
          a: false,
          why: "同じsupportと平均を持つ分布でも、分散・裾・外挿は異なります。",
        },
      ],
      hint: "parameter、分母、予測の3点を確認します。",
    },
    {
      k: "choice",
      q: "候補分布を選んだ後の確認として最も適切なのはどれですか？",
      opts: [
        "観測と同じ設計でreplicate dataを生成し、重要な分位点や0の割合を比較する",
        "分布名が有名ならdataとの比較を省略する",
        "histogramの見た目だけでparameterizationも決める",
      ],
      ans: 0,
      why: "分布が研究上重要な特徴をどのように予測するか、観測dataへ戻して確認します。",
      hint: "modelを生成器として使います。",
    },
  ],
};
