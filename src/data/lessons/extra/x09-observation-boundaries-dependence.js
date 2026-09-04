// 補講: 観測境界・依存・混合分布 — 見え方を生成過程へ戻す
// Julia 1.12.5 / Distributions 0.25.130で掲載経路を検証。
// Distributions.jl公式stable docsを確認(2026-08-09)。
// https://juliastats.org/Distributions.jl/stable/truncate/
// https://juliastats.org/Distributions.jl/stable/censored/
// https://juliastats.org/Distributions.jl/stable/multivariate/
// https://juliastats.org/Distributions.jl/stable/mixture/
export default {
  id: "observation-boundaries-dependence",
  title: "観測境界・依存・混合分布",
  tag: "除外・測定限界・共分散・異質性を生成過程として分ける",
  pages: [
    {
      t: "見えなかった値と、境界に記録された値は違う",
      b: [
        "分布をfitしても、観測の仕組みを誤ると予測は外れます。閾値未満の人が標本へ入らないtruncationと、測定器が閾値未満をすべて同じ限界値として記録するcensoringは、観測dataの形が似ていても別の生成過程です。",
        "さらに、複数変数が同時に動くdependenceと、異なる下位集団が混ざるheterogeneityも、一変量分布を別々にfitするだけでは失われます。この補講では観測境界、共分散、混合componentを明示した分布からdataを生成し、違いを復元します。",
        "扱う順序は、①latentな値、②観測規則、③同時分布、④component混合、⑤replicate dataでの点検です。見えている列だけでなく、列がその形になった過程をmodelへ戻します。",
      ],
    },
    {
      t: "latent値・観測値・観測理由を別の列にする",
      b: [
        "測定限界があるdataでは、`value = 90`だけでは真に90だったのか、90以下を90として記録したのか区別できません。`observed_value`、`is_censored`、`censor_side`、`limit`を分けて保存します。truncationでは標本へ入らなかった件数や母集団の抽出規則が必要です。",
        "欠測、除外、打切りをすべて`missing`へ潰しません。`missing`は値がないことを表せても、その理由と可能な範囲を保持しないからです。raw列を上書きせず、観測規則をmetadataと監査表へ残します。",
      ],
      code: `using DataFrames

observed = DataFrame(
    observed_value = [90.0, 94.2, 103.5, 90.0],
    is_censored = [true, false, false, true],
    censor_side = ["left", "none", "none", "left"],
    limit = [90.0, missing, missing, 90.0],
)

println(count(observed.is_censored))`,
      out: `2`,
    },
    {
      t: "truncatedは、区間外が標本に現れない条件付き分布",
      b: [
        "`truncated(d0; lower=l, upper=u)`は、元の分布`d0`から[l, u]内に入った値だけが観測される条件付き分布です。区間内の密度は、区間へ入る確率で割って合計1になるよう再正規化されます。",
        "閾値未満を分析者が後から削除した場合も見かけ上は同じ範囲になりますが、研究対象が閾値以上へ変わるのか、latentな母集団を推論したいのかを分けます。単に削除して通常のNormalへfitすると、平均とSDの対象が変わります。",
      ],
      code: `using Statistics, Distributions

latent = Normal(100, 15)
selected = truncated(latent; lower = 90)

println(extrema(selected))
println(round(mean(selected), digits = 3))
println(cdf(selected, 90))`,
      out: `(90.0, Inf)
106.41
0.0`,
      a: [
        "genericなtruncated分布ではmeanやvarが常に実装されるとは限りません。公式docsはtruncated Normalではこれらの統計量が使えると明記しています。共通APIの存在を全分布へ一般化しません。",
      ],
    },
    {
      t: "censoredは、区間外を境界値として記録する分布",
      b: [
        "`censored(d0; lower=l, upper=u)`は、元の値を`clamp(value, l, u)`した観測分布です。元が連続分布でも、下限と上限にはそれぞれ区間外の確率が集まり、境界点に正の確率質量を持ちます。",
        "左打切りでは下限以下が下限そのものへ記録されます。観測数は保たれますが、境界に同じ値が積み上がります。この山を外れ値や丸め誤差として削らず、測定器・検出限界・追跡終了の規則へ戻します。",
      ],
      code: `using Statistics, Distributions

latent = Normal(100, 15)
recorded = censored(latent; lower = 90)

println(extrema(recorded))
println(round(mean(recorded), digits = 3))
println(round(pdf(recorded, 90), digits = 3))
println(round(cdf(latent, 90), digits = 3))`,
      out: `(90.0, Inf)
102.267
0.252
0.252`,
      a: [
        "censored分布の境界における`pdf`は、連続部分の密度ではなく境界の確率質量を返します。内側では元分布の密度です。離散成分と連続成分が混ざる点を意識します。",
      ],
    },
    {
      t: "除外とclampを同じlatent dataへ適用して比べる",
      b: [
        "違いを最も直接に確認するには、同じlatent sampleへ2つの観測規則を適用します。truncation相当の除外は行数を減らし、censoring相当のclampは行数を保ったまま境界値を増やします。",
        "平均も異なります。下側を除外した標本平均は大きく上がり、下側を境界へ置換した平均も元平均から動きます。両方を『90以上のdata』として通常のfitへ渡すだけでは、異なる情報を同じものとして扱ってしまいます。",
      ],
      code: `using Random, Statistics, Distributions

rng = Xoshiro(2026)
latent = rand(rng, Normal(100, 15), 100_000)
excluded = latent[latent .>= 90]
limited = max.(latent, 90)

println(length(excluded) < length(latent))
println(length(limited) == length(latent))
println(count(==(90), excluded))
println(count(==(90), limited) > 0)
println(mean(excluded) > mean(limited) > mean(latent))`,
      out: `true
true
0
true
true`,
    },
    {
      t: "constructorは観測過程を表すが、未知parameterの推定まで保証しない",
      b: [
        "`truncated`と`censored`は、既知の元分布と境界から新しい分布オブジェクトを作ります。constructorが使えることと、打切りdataから元分布の未知parameterを`fit_mle`で自動推定できることは別です。",
        "実際の推定では、通常観測の密度、左・右打切りの累積確率、truncationの正規化確率を観測理由ごとに尤度へ入れます。生存時間model、Tobit、専用尤度、Bayes modelなど、問いと観測規則に合う実装を選び、単なるclamp後の通常回帰と区別します。",
        "この補講の範囲は生成・確率計算・予測診断です。未検証の自作optimizerを初心者向けAPIとして配布せず、推定へ進むときは別の検証環境と回復試験を用意します。",
      ],
    },
    {
      t: "MvNormalは複数変数を共分散ごと同時生成する",
      b: [
        "`MvNormal(μ, Σ)`では、μが平均vector、Σが共分散matrixです。対角要素は各変数の分散、対角以外は共分散です。分散が1なら共分散と相関が一致します。",
        "2つのNormalを別々に生成すると独立な同時分布になります。同じ周辺平均・SDでも、Σの非対角要素を0.65にしたMvNormalでは高い値同士、低い値同士が同時に現れやすくなります。",
      ],
      code: `using Statistics, Distributions

mu = [0.0, 0.0]
Sigma = [1.0 0.65; 0.65 1.0]
d = MvNormal(mu, Sigma)

println(mean(d))
println(cov(d))
println(cor(d))`,
      out: `[0.0, 0.0]
[1.0 0.65; 0.65 1.0]
[1.0 0.65; 0.65 1.0]`,
    },
    {
      t: "共分散matrixは対称・次元一致・正定値を入口で検査する",
      b: [
        "Σは平均vectorと次元が一致する正方matrixで、対称かつ正定値でなければなりません。相関を1.2にする、片側だけ値を変える、ほぼ同じ変数を重ねてsingularにする、といった指定は有効な共分散になりません。",
        "constructorの例外だけに任せず、対称性、`isposdef(Symmetric(Σ))`、固有値、単位と変数順を監査します。行列を近い正定値行列へ自動修正する場合はmodelを変えているため、変更量と理由を報告します。",
      ],
      code: `using LinearAlgebra, Distributions

Sigma = [1.0 0.65; 0.65 1.0]
println(issymmetric(Sigma))
println(isposdef(Symmetric(Sigma)))
println(eigvals(Symmetric(Sigma)))

d = MvNormal(zeros(2), Sigma)`,
      out: `true
true
[0.35, 1.65]`,
    },
    {
      t: "多変量sampleは、各列が1観測になる",
      b: [
        "`rand(rng, d, n)`でMvNormalから生成すると、結果は`変数数 × n`のmatrixです。各列が1つの多変量観測で、各行が1変数です。DataFrameへ入れるときは転置してn行にすることがありますが、`logpdf`など分布APIへ渡す向きを勝手に変えません。",
        "testではshape、有限性、経験平均・共分散・相関を確認します。特定の乱数matrixそのものを固定するのではなく、nを増やしたとき指定したΣへ近づく性質を検査します。",
      ],
      code: `using Random, Statistics, Distributions

d = MvNormal(zeros(2), [1.0 0.65; 0.65 1.0])
draws = rand(Xoshiro(2027), d, 50_000)

println(size(draws))
println(all(isfinite, draws))
println(isapprox(cor(draws[1, :], draws[2, :]), 0.65; atol = 0.02))`,
      out: `(2, 50000)
true
true`,
    },
    {
      t: "同じ周辺分布でも、同時事象の確率は依存で変わる",
      b: [
        "相関あり・独立のどちらも、各変数単独では平均0・SD1のNormalにできます。それでも『両方が1を超える』確率は、正の相関がある方で大きくなります。周辺分布を別々に診断するだけでは、このjoint riskを復元できません。",
        "相関はdependence全体を1数へ要約したものです。非線形依存、裾依存、clusterや時系列構造をMvNormalだけで十分と決めません。まず独立生成との反例で、joint構造をmodelへ入れる必要性を確認します。",
      ],
      code: `using Random, Statistics, Distributions

n = 60_000
correlated = rand(Xoshiro(2028),
    MvNormal(zeros(2), [1.0 0.65; 0.65 1.0]), n)
independent = rand(Xoshiro(2029),
    MvNormal(zeros(2), [1.0 0.0; 0.0 1.0]), n)

joint(x) = mean((x[1, :] .> 1) .& (x[2, :] .> 1))
println(joint(correlated) > 2 * joint(independent))`,
      out: `true`,
    },
    {
      t: "MixtureModelはcomponentと混合比を持つ生成器",
      b: [
        "`MixtureModel(components, weights)`は、まずcomponentをweightsの確率で選び、そのcomponentから値を生成します。componentは同じfamilyでなくても構成できますが、ここでは解釈しやすい2つのNormalを使います。",
        "`components(d)`でcomponent一覧、`probs(d)`で混合比、`ncomponents(d)`で個数を取得できます。weightsは非負で合計1です。component順とlabelの意味をmetadataへ残します。",
      ],
      code: `using Statistics, Distributions

components_rt = Normal[Normal(450, 25), Normal(650, 30)]
weights = [0.7, 0.3]
d = MixtureModel(components_rt, weights)

println(ncomponents(d))
println(probs(d))
println(mean(d))
println(var(d))`,
      out: `2
[0.7, 0.3]
510.0
9107.5`,
    },
    {
      t: "混合分散はwithinとbetweenの両方を含む",
      b: [
        "混合平均はcomponent平均の加重平均です。混合分散は各component内の分散だけでなく、component平均が全体平均から離れているbetween成分も含みます。全体SDだけから各componentのSDを逆算できません。",
        "同じ全体平均・分散を持つ単一Normalを作れても、2群の間の谷や両側の山は再現されません。P0-Cと同じく、平均とSDだけで分布全体が合うと判断しません。",
      ],
      code: `using Statistics, Distributions

cs = components(d)
w = probs(d)
mu_mix = sum(w .* mean.(cs))
var_mix = sum(w .* (var.(cs) .+ (mean.(cs) .- mu_mix).^2))

println(mu_mix)
println(var_mix)
println(isapprox(var_mix, var(d)))`,
      out: `510.0
9107.5
true`,
    },
    {
      t: "同じ平均・SDの単一Normalを、component間の谷で反証する",
      b: [
        "混合分布と同じ平均・SDを持つNormalを作り、同じnだけ生成します。520〜580のようなcomponent間の範囲に入る割合を比べると、単一Normalは滑らかに中央を埋めますが、分離したmixtureは谷を予測します。",
        "逆に、山が見えたから直ちにlatent classが実在すると結論しません。丸め、天井効果、共変量を無視した集計、時点差、選択biasでも多峰性は生じます。mixtureは反例を作る生成器として使います。",
      ],
      code: `using Random, Statistics, Distributions

mixture = MixtureModel(
    Normal[Normal(450, 25), Normal(650, 30)], [0.7, 0.3])
matched = Normal(mean(mixture), std(mixture))

mix_draws = rand(Xoshiro(2030), mixture, 80_000)
normal_draws = rand(Xoshiro(2031), matched, 80_000)
gap_rate(x) = mean((520 .< x) .& (x .< 580))

println(gap_rate(mix_draws) < 0.02)
println(gap_rate(normal_draws) > 0.15)`,
      out: `true
true`,
    },
    {
      t: "Distributions.jlのMixtureModelは推定器ではない",
      b: [
        "公式stable docsは、Distributions.jlがmixture modelの推定機能を提供しないと明記しています。`MixtureModel`を構築して`pdf`・`logpdf`・`rand`を使えることと、dataからcomponent数、平均、分散、weightsを推定できることは別です。",
        "この補講では既知parameterからの生成、component・weightsの読解、予測反例までを扱います。GaussianMixtures.jlなど別packageを導入する場合は、初期値、局所解、label switching、component数選択、退化解、holdout予測を含む独立の検証課題にします。",
        "生成したcomponent labelは観測された真の型ではありません。mixture推定結果のclass割当を人の本質的カテゴリへ変換せず、不確かさと代替説明を残します。",
      ],
    },
    {
      t: "完了条件は、見え方の違いをreplicate dataで復元すること",
      b: [
        "truncatedでは行数減少と境界内の再正規化、censoredでは行数保持と境界への確率質量を確認します。MvNormalではshape、共分散の正定値性、経験相関、joint eventを確認します。MixtureModelではcomponent・weights・全体moment・谷や裾を確認します。",
        "成果物には観測規則、境界、共分散matrixと変数順、component parameterとweights、RNG、sample size、replicate数を保存します。raw値や打切りflagを上書きせず、P0-Bのround trip契約で診断表を読み戻します。",
        "これでP0-Aの入力監査、P0-Bの成果物、P0-Cのfitと予測診断、P1の観測境界・依存・異質性が一本につながります。R・Stan連携は公開済みの任意トラックへ進み、専用尤度による推定は研究検証として分離します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "検出限界90未満の値がすべて90として記録され、行数は保たれる観測過程はどれですか？",
      opts: ["censoring", "truncation", "単純な欠測"],
      ans: 0,
      why: "censoringでは限界外の値が境界値へ置換され、連続分布でも境界に確率質量が生じます。",
      hint: "値が消えたか、境界へ記録されたかを見ます。",
    },
    {
      k: "fill",
      q: "Normal分布dから90以上だけが標本へ入る条件付き分布を作る関数名を入力してください。",
      code: `selected = 〔?〕(d; lower = 90)`,
      accept: ["truncated"],
      show: "truncated",
      why: "`truncated`は区間内へ入った値だけの条件付き分布を作ります。",
      hint: "切断分布の英語名です。",
      placeholder: "関数名",
    },
    {
      k: "fill",
      q: "Normal分布dの90未満を90として記録する分布を作る関数名を入力してください。",
      code: `recorded = 〔?〕(d; lower = 90)`,
      accept: ["censored"],
      show: "censored",
      why: "`censored`は範囲外を境界値へclampした観測分布を作ります。",
      hint: "打切り分布の英語名です。",
      placeholder: "関数名",
    },
    {
      k: "choice",
      q: "`rand(rng, MvNormal(zeros(2), Sigma), 5000)`の結果について正しい説明はどれですか？",
      opts: [
        "2×5000のmatrixで、各列が1つの多変量観測",
        "5000×2のmatrixで、各行が必ず1観測",
        "長さ5000のscalar vector",
      ],
      ans: 0,
      why: "多変量分布からn個生成すると、変数次元×nのmatrixになり、各列が1標本です。",
      hint: "公式multivariate interfaceのsample方向を確認します。",
    },
    {
      k: "tf",
      q: "依存と混合分布について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "周辺平均とSDが同じでも、相関によって同時閾値超過の確率は変わる",
          a: true,
          why: "joint eventは周辺分布だけでなくdependenceに依存します。",
        },
        {
          s: "MixtureModelを構築できれば、Distributions.jlだけでcomponent parameterをdataから自動推定できる",
          a: false,
          why: "公式docsは、このpackageがmixture modelの推定機能を提供しないと明記しています。",
        },
        {
          s: "混合分散にはcomponent内分散とcomponent平均間の分散が入る",
          a: true,
          why: "全体の広がりはwithinとbetweenの両方から生じます。",
        },
      ],
      hint: "joint、推定機能、分散分解を分けます。",
    },
    {
      k: "fill",
      q: "mixture dのcomponent混合比を返す関数名を入力してください。",
      code: `weights = 〔?〕(d)`,
      accept: ["probs"],
      show: "probs",
      why: "`probs(d)`はMixtureModelがcomponentを選ぶ事前確率vectorを返します。",
      hint: "probabilitiesの短い名前です。",
      placeholder: "関数名",
    },
  ],
};
