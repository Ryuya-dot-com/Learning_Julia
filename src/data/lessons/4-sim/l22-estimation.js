// レッスン: 推定と不確かさ — 点ではなく、揺れまで報告する
// 信頼区間は反復標本での被覆として説明し、事後確率とは表現しない。
export default {
  id: "estimation-uncertainty",
  title: "推定と不確かさ",
  tag: "推定対象・SE・信頼区間・ブートストラップ",
  pages: [
    {
      t: "何を推定したいのか",
      b: [
        "この分析で知りたい量は、対象とする母集団の平均反応時間です。この未知量を推定対象(estimand)と呼びます。誰の、どの条件の、どの尺度の平均なのかまで言葉にして初めて、計算する量が決まります。",
        "標本から値を作る規則が推定量(estimator)、今回の標本へ適用して得た具体的な数値が推定値(estimate)です。母平均500、計算規則 `mean`、今回得た512.3は、それぞれ別の役割です。",
      ],
      code: `using Random, Statistics, Distributions

population = Normal(500, 50)
estimand = mean(population)       # 母平均という推定対象
estimator = mean                 # 標本平均という計算規則
x = rand(Xoshiro(2026), population, 25)
estimate = estimator(x)          # 今回の具体的な推定値

println(estimand)
println(length(x))
println(estimate isa Float64)`,
      out: `500.0
25
true`,
      a: [
        "現実の分析では `estimand` を直接知りません。ここではシミュレーションなので真値を置き、推定手続きが反復したときどう振る舞うかを検査できます。",
      ],
    },
    {
      t: "正確さと精密さ",
      b: [
        "推定量の良さは、1回だけ真値に近かったかでは判断しません。反復した推定値の平均が真値からどれだけずれるかがバイアス、推定値が研究ごとにどれだけ散らばるかが精密さに関わります。",
        "真値へ近いが大きく揺れる推定量と、毎回ほぼ同じだが一定方向へずれる推定量は、異なる失敗をします。シミュレーションでは両方を別々に測ります。",
      ],
      code: `using Random, Statistics, Distributions

d = Normal(500, 50)
rng = Xoshiro(2026)
estimates = [mean(rand(rng, d, 25)) for _ in 1:10_000]
shifted = estimates .+ 10

println(abs(mean(estimates) - mean(d)) < 1.0)
println(isapprox(mean(shifted) - mean(estimates), 10; atol = 1e-10))
println(std(estimates) < std(d))`,
      out: `true
true
true`,
      a: [
        "標本平均はこの設定でほぼ不偏ですが、各推定値は真値と一致しません。`shifted` は同じ散らばりのまま10だけ上へずらした反例で、精密でもバイアスを持ち得ることを示します。",
      ],
    },
    {
      t: "SD・SE・MCSEは何のばらつきか",
      b: [
        "SDは、この例では個人の反応時間が母平均の周りにどれだけ散らばるかを表します。SEは、研究を繰り返したとき標本平均がどれだけ散らばるかを表します。MCSEは、有限回のシミュレーションで求めた要約値が、計算をやり直したときどれだけ揺れるかを表します。",
        "3つとも標準偏差に関係しますが、主語が『個人』『研究の推定値』『シミュレーション結果』と違います。SEを個人差と呼んだり、反復数を増やして研究デザインのSEまで小さくなったと考えたりしないようにします。",
      ],
      code: `using Random, Statistics, Distributions

d = Normal(500, 50)
n = 25
nsim = 10_000
study_means = [mean(rand(Xoshiro(i), d, n)) for i in 1:nsim]

data_sd = std(d)
study_se = std(d) / sqrt(n)
mcse_of_simulated_mean = std(study_means) / sqrt(nsim)

println(data_sd)
println(study_se)
println(mcse_of_simulated_mean < 0.2)`,
      out: `50.0
10.0
true`,
      a: [
        "シミュレーション反復数 `nsim` を増やすとMCSEは縮みますが、n=25という研究自体のSEは縮みません。研究参加者数と計算反復数を混同しないことが重要です。",
      ],
    },
    {
      t: "95%信頼区間を反復して確かめる",
      b: [
        "95%信頼区間は、同じ手続きを何度も繰り返したとき、作られた区間のおよそ95%が固定された真値を含むよう設計された区間です。計算済みの1区間について『真値が95%の確率で入る』と読むものではありません。",
        "母SDを標本SDで推定するため、ここでは標準正規分布の1.96ではなく、自由度 `n - 1` のt分布から境界を作ります。Juliaでは `TDist` も分布オブジェクトなので、`quantile` を同じAPIで使えます。",
      ],
      code: `using Random, Statistics, Distributions

function mean_ci(x; level = 0.95)
    n = length(x)
    alpha = 1 - level
    critical = quantile(TDist(n - 1), 1 - alpha / 2)
    estimate = mean(x)
    se = std(x) / sqrt(n)
    return (estimate - critical * se, estimate + critical * se)
end

d = Normal(500, 50)
rng = Xoshiro(2026)
covered = [begin
    interval = mean_ci(rand(rng, d, 25))
    interval[1] <= mean(d) <= interval[2]
end for _ in 1:2000]

coverage = mean(covered)
println(0.93 < coverage < 0.97)`,
      out: `true`,
      a: [
        "2000本の区間のうち、真の母平均500を含んだ割合が95%付近かを性質として検査しています。具体的な割合は乱数列で少し変わるため、教材の正否を1つの固定値へ結びつけません。",
        "被覆率は、無作為抽出、独立性、モデルなど手続きの前提に依存します。偏った標本から精密な区間を計算しても、対象母集団について正しい区間になるとは限りません。",
      ],
    },
    {
      t: "ブートストラップで揺れを近似する",
      b: [
        "推定量の標本分布を数式で求めにくいとき、観測標本から同じ大きさだけ復元抽出し、推定量を何度も再計算する方法がブートストラップです。Juliaでは `rand(rng, x, length(x))` が配列 `x` からの復元抽出になります。",
        "ブートストラップは手元の標本を小さな母集団のように扱います。したがって、欠けている集団を作り出したり、便宜抽出や選択バイアスを解決したりはしません。極小標本、強い依存、極端な統計量では、単純な方法が不安定になることもあります。",
      ],
      code: `using Random, Statistics

x = [480.0, 492.0, 501.0, 505.0, 510.0, 530.0, 610.0]
rng = Xoshiro(2026)
boot_medians = [median(rand(rng, x, length(x))) for _ in 1:5000]
interval = quantile(boot_medians, [0.025, 0.975])

println(length(boot_medians))
println(interval[1] <= median(x) <= interval[2])`,
      out: `5000
true`,
      a: [
        "中央値のように標本分布の式を手で扱いにくい推定量でも、同じ『生成→推定→集計』の型で不確かさを調べられます。ただし、これは最も単純なパーセンタイル区間であり、万能な既定値ではありません。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "母平均、標本平均という計算規則、今回得られた512.3の分類として正しい並びはどれでしょう?",
      opts: [
        "推定対象、推定量、推定値",
        "推定値、推定対象、推定量",
        "推定量、推定値、推定対象",
      ],
      ans: 0,
      why: "知りたい母集団の量が推定対象、標本から値を作る規則が推定量、その適用結果が推定値です。",
      hint: "target、rule、resultの順に対応させます。",
    },
    {
      k: "choice",
      q: "SD・SE・MCSEの主語として正しい組み合わせはどれでしょう?",
      opts: [
        "個人の値、研究ごとの推定値、有限回シミュレーションの要約値",
        "研究ごとの推定値、個人の値、母平均そのもの",
        "有限回シミュレーションの要約値、母平均そのもの、個人の値",
      ],
      ans: 0,
      why: "SDは個人差、SEは研究反復での推定値の揺れ、MCSEは有限回の計算で得た要約値の揺れを表します。",
      hint: "個人→研究→計算という3層に並べます。",
    },
    {
      k: "tf",
      q: "推定と不確かさについて、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "計算済みの95%信頼区間は、真値がその区間内に95%の確率で存在することを意味する",
          a: false,
          why: "頻度論的な95%は、同じ手続きで作る区間の長期的被覆率を指します。固定された真値へ、計算後の区間から確率を割り当てる説明ではありません。",
        },
        {
          s: "推定量は、バイアスが小さくても研究ごとのばらつきが大きいことがある",
          a: true,
          why: "正確さと精密さは別の性質です。平均的には真値へ合っていても、個々の推定値が大きく散らばることがあります。",
        },
        {
          s: "ブートストラップを使えば、元の標本に存在しない集団や選択バイアスも自動的に補える",
          a: false,
          why: "ブートストラップは観測標本を再利用するため、元の標本の代表性や依存構造の問題を引き継ぎます。",
        },
      ],
      hint: "区間手続き、推定量の2軸、再標本化の情報源をそれぞれ確認しましょう。",
    },
  ],
};
