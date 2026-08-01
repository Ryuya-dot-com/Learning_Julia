// レッスン: 標本分布 — データの分布と統計量の分布を分ける
// 乱数の具体列ではなく、理論値との近さと再現すべき性質を検証する。
export default {
  id: "sampling-distributions",
  title: "標本分布",
  tag: "標本を繰り返し、推定値の揺れを見る",
  pages: [
    {
      t: "1つの標本、1つの平均",
      b: [
        "このレッスンで知りたい量は、ある母集団における反応時間の平均です。ここでは母集団分布を `Normal(500, 50)` と置きます。母平均500は推定したい量、そこから抽出した25人分が標本、`mean(x)` が標本から計算する統計量です。",
        "標本を引き直せば、25個の値も標本平均も変わります。1つの標本平均が母平均に近かったことだけでは、その計算方法がどれくらい安定しているか分かりません。そこで、研究全体を何度も繰り返す思考実験をJuliaで実行します。",
      ],
      code: `using Random, Statistics, Distributions

population = Normal(500, 50)
rng = Xoshiro(2026)
x = rand(rng, population, 25)
estimate = mean(x)

println(length(x))
println(estimate isa Float64)
println(mean(population))`,
      out: `25
true
500.0`,
      a: [
        "`population` はデータを生む分布、`x` は今回観測した25個、`estimate` は今回の標本平均です。この3つを同じ「平均」や「分布」と呼ばないことが、推論を理解する第一歩です。",
      ],
    },
    {
      t: "標本平均を1万個集める",
      b: [
        "1回の研究を関数にし、1万回繰り返します。集まるのは生の反応時間ではなく、各研究から1つずつ得た標本平均です。この統計量の反復分布を標本分布と呼びます。",
      ],
      code: `using Random, Statistics, Distributions

function sample_means(rng, d, n; nsim = 10_000)
    return [mean(rand(rng, d, n)) for _ in 1:nsim]
end

d = Normal(500, 50)
means25 = sample_means(Xoshiro(2026), d, 25)

println(length(means25))
println(abs(mean(means25) - mean(d)) < 1.0)
println(std(means25) < std(d))`,
      out: `10000
true
true`,
      a: [
        "`means25` の1要素は1人の反応時間ではなく、25人からなる1研究の平均です。元データのSDと、標本平均の標本分布のSDは、主語が違います。",
        "反復平均の中心は母平均500に近く、ばらつきは元データのSD50より小さくなります。次に、その小さくなり方を測ります。",
      ],
    },
    {
      t: "nを増やすと標準誤差が縮む",
      b: [
        "標本平均の標本分布のSDを標準誤差(SE)と呼びます。独立で同じ分布から抽出した値の平均なら、理論SEは母SDを `sqrt(n)` で割った値です。元データの個人差が消えたのではなく、平均という推定値の揺れが小さくなります。",
      ],
      code: `using Random, Statistics, Distributions

d = Normal(500, 50)
for n in [4, 25, 100]
    sims = sample_means(Xoshiro(2026), d, n)
    empirical_se = std(sims)
    theoretical_se = std(d) / sqrt(n)
    println("n=", n,
            " 理論SE=", round(theoretical_se, digits = 1),
            " ほぼ一致=", isapprox(empirical_se, theoretical_se; rtol = 0.03))
end`,
      out: `n=4 理論SE=25.0 ほぼ一致=true
n=25 理論SE=10.0 ほぼ一致=true
n=100 理論SE=5.0 ほぼ一致=true`,
      a: [
        "nを4から100へ25倍にすると、SEは25から5へ5分の1になります。SEは `1 / sqrt(n)` に比例するので、精度を2倍にするにはおおむね4倍の標本が必要です。",
        "実データでは母SDを知らないため、標本SDで置き換えてSEを推定します。その不確かさを含めて区間にする方法は「推定と不確かさ」で扱います。",
      ],
    },
    {
      t: "大数の法則と中心極限定理を分ける",
      b: [
        "大数の法則は、1つの標本でnを増やすと標本平均が母平均へ近づく、という収束の話です。中心極限定理は、研究を繰り返して標本平均を標準化したとき、その標本分布が条件のもとで正規分布へ近づく、という形の話です。どちらも「生データが正規分布になる」という意味ではありません。",
        "右裾を引く指数分布から抽出しても、nが十分大きければ標本平均の標準化分布は中心0・SD1に近づきます。Juliaなら、非対称な母集団から標本を何度も作って確かめられます。",
      ],
      code: `using Random, Statistics, Distributions

d = Exponential(1)
n = 100
means = sample_means(Xoshiro(2026), d, n)
z = (means .- mean(d)) ./ (std(d) / sqrt(n))

println(abs(mean(z)) < 0.05)
println(abs(std(z) - 1) < 0.05)`,
      out: `true
true`,
      a: [
        "母集団の指数分布は強く右に歪んでいます。それでもn=100の標本平均を標準化した分布は、中心0・SD1に近づきました。近似の速さは母集団の形と統計量によって違います。",
      ],
    },
    {
      t: "nが大きければ万能、ではない",
      b: [
        "よくある『nが30以上なら何でも正規』という固定則は使いません。重い裾では近似が遅く、Cauchy分布のように有限な平均・分散を持たない場合、通常の平均のSEという議論自体が成立しません。",
        "さらに、観測数と独立な情報量は同じとは限りません。同じ人の値を100回複製しても、独立な100人にはなりません。依存を無視すると、見かけ上のnだけが増えてSEを過小評価します。",
      ],
      code: `using Random, Statistics, Distributions

rng = Xoshiro(2026)
independent = [mean(rand(rng, Normal(), 100)) for _ in 1:5000]
duplicated = [mean(fill(rand(rng, Normal()), 100)) for _ in 1:5000]

println(std(independent) < 0.12)
println(std(duplicated) > 0.9)`,
      out: `true
true`,
      a: [
        "どちらも配列の長さは100ですが、独立な100個の平均のSDは約0.1、同じ値を100回複製した平均のSDは約1のままです。`length(x)` だけから有効な標本サイズを判断してはいけません。",
        "参加者内の反復測定は複製ではありませんが、相関を持つため同じ注意が必要です。依存構造は「within／betweenデザインと混合モデル」でモデルへ組み込みます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "母SDが50の集団からn=25を独立抽出して平均を取ります。元データのSDと標本平均の標本分布のSDの組み合わせはどれでしょう?",
      opts: [
        "元データのSDは50、標本平均の標準誤差は約10",
        "元データのSDも標本平均の標準誤差も約50",
        "元データのSDは約10、標本平均の標準誤差は50",
      ],
      ans: 0,
      why: "元データの個人差は50のままですが、n=25の平均のSEは `50 / sqrt(25) = 10` です。主語を分けます。",
      hint: "標本平均のSEは母SDを `sqrt(n)` で割ります。",
    },
    {
      k: "fill",
      q: "1万回の標本平均を入れた配列 `means` から、経験的な標準誤差を求めます。空欄〔?〕に入る関数名を入力しましょう。",
      code: `empirical_se = 〔?〕(means)`,
      accept: ["std"],
      show: "std",
      why: "標本平均を反復して得た配列の標準偏差が、標本平均の経験的な標準誤差です。",
      hint: "「記述統計の深掘り」で標準偏差を計算した関数です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "標本分布について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "大数の法則は、nを増やした1つの標本の平均が母平均へ近づくという収束を扱う",
          a: true,
          why: "大数の法則は推定値の収束の話です。標本を構成する生データの形が正規になるという主張ではありません。",
        },
        {
          s: "中心極限定理は、元の生データがnを増やすと正規分布へ変形するという意味である",
          a: false,
          why: "正規分布へ近づく対象は、条件のもとで標準化した標本平均の標本分布です。元データの分布ではありません。",
        },
        {
          s: "nが30以上なら、依存や極端に重い裾を考えず常に通常のSEを使える",
          a: false,
          why: "固定的なn=30ルールはありません。依存は有効情報量を減らし、有限分散がない分布では通常のSEの前提も崩れます。",
        },
      ],
      hint: "どの分布が近づくのか、独立性と有限分散が必要かを確認しましょう。",
    },
  ],
};
