// レッスン: 重回帰・ANCOVA・モデル比較
// コード例は Julia 1.12.6 + GLM 1.9.5 + StatsModels 0.7.10 + CategoricalArrays 1.1.1 で実測済み(2026-08-01)
export default {
  id: "multiple-regression-ancova",
  title: "重回帰・ANCOVA・モデル比較",
  tag: "投入する変数・参照水準・コントラストを決める",
  pages: [
    {
      t: "変数を足すと、係数が答える問いも変わる",
      b: [
        "`y ~ x` のx係数はxとyの周辺的な関係、`y ~ x + z` のx係数はzを一定とした条件付きの関係です。式へzを足すことは、精度を上げるだけでなく推定対象を変えます。係数が動いたときは『不安定になった』と即断せず、比較している人や状況がどう変わったかを読みます。",
        "投入方法は3つに分けます。強制投入は理論上必要な変数を一度に入れる方法、階層的投入は事前に決めたブロックを順に加えて増分を比較する方法、stepwiseは標本内の基準で自動選択する方法です。この教材では前2つを使い、p値だけの自動stepwiseを既定にしません。選択後の係数・p値・R²は選択に使った同じ標本へ楽観的になるからです。",
        "式の `x + z` と `z + x` は、同じ行・同じ項なら同じ完全モデルです。一方、`m0 → m1 → m2` のどこで何を追加するかは、各モデル比較が答える仮説を変えます。『式の並び』と『比較するモデル列』を混同しません。",
      ],
    },
    {
      t: "交絡は、投入前後の係数で可視化できる",
      b: [
        "zがxとyの両方に関係し、生成式ではxからyへの効果を0にします。zを省いたモデルではxがzの代理を務め、見かけの関係が現れます。zを入れた係数は『zが同じ人どうしでxが1違うとき』の条件付き差です。",
        "ただし、調整すれば常に因果効果になるわけではありません。交絡変数は研究知識と時間順序から選びます。処置後変数やcolliderを機械的に投入すると、かえってバイアスを作れます。",
      ],
      code: `using Random, DataFrames, GLM

rng = Xoshiro(2900)
n = 240
z = randn(rng, n)
x = 0.7 .* z .+ randn(rng, n) .* 0.7
y = 0.5 .* z .+ randn(rng, n) .* 0.7 # 真のx効果は0
df_conf = DataFrame(x = x, y = y, z = z)

x_only = lm(@formula(y ~ x), df_conf)
adjusted = lm(@formula(y ~ x + z), df_conf)
comparison = ftest(x_only.model, adjusted.model)

println(round.(coef(x_only), digits = 3))
println(round.(coef(adjusted), digits = 3))
println(round.([r2(x_only), r2(adjusted)], digits = 3))
println(round(comparison.fstat[2], digits = 3))`,
      out: `[0.039, 0.368]
[0.014, 0.017, 0.502]
[0.17, 0.33]
56.637`,
      a: [
        "zを省くとx係数は0.368ですが、zを入れると0.017へ戻ります。完全モデルではz係数も生成値0.5に近い0.502です。小さなp値でも、交絡を無視した係数を因果効果にはできません。",
        "`ftest(x_only.model, adjusted.model)` は『xを既に含むモデルへzの1自由度を追加すると残差平方和がどれだけ減るか』を検定します。F=56.637、pは約1.1×10⁻¹²です。逆に『zの後でxを追加する価値』を問うなら、`y ~ z` と `y ~ z + x` を比較します。",
      ],
    },
    {
      t: "ANCOVAは、カテゴリ変数と連続共変量の重回帰",
      b: [
        "ANCOVAは別種の計算ではなく、`posttest ~ pre_c + group` という線形モデルです。pretestを平均中心化した `pre_c` を使うと、切片と群係数は平均的なpretestでの調整済み平均・群差になります。中心化は予測を変えず、ゼロ点の意味を変えます。",
        "Juliaでは数値列を連続変数として扱います。群を1・2・3で保存しただけでは、等間隔の直線傾向として入る危険があります。`categorical` でカテゴリと宣言し、`levels!` で水準順を固定し、さらにモデル側でもコントラストを明示します。",
      ],
      code: `using Random, Statistics, Distributions, DataFrames
using CategoricalArrays, StatsModels, GLM

rng = Xoshiro(2901)
n_group = 40
group = categorical(repeat(
    ["control", "training", "combined"], inner = n_group))
levels!(group, ["control", "training", "combined"])
pretest = vcat(rand(rng, Normal(48, 8), n_group),
               rand(rng, Normal(52, 8), n_group),
               rand(rng, Normal(55, 8), n_group))
effect = Dict("control" => 0.0, "training" => 6.0,
              "combined" => 12.0)
posttest = 20 .+ 0.65 .* pretest .+
    [effect[string(g)] for g in group] .+
    rand(rng, Normal(0, 6), length(group))

df = DataFrame(group = group, pretest = pretest,
               posttest = posttest)
df.pre_c = df.pretest .- mean(df.pretest)
println(string.(levels(df.group)))
println(round.([mean(df.pretest[df.group .== level])
                for level in levels(df.group)], digits = 2))`,
      out: `["control", "training", "combined"]
[49.19, 53.08, 56.3]`,
      a: [
        "この生成例は説明用にpretest平均をずらしています。群差を調整しない分析には、処置効果だけでなく開始時点の差も混ざります。実験なら無作為化後にも偶然の不均衡は起こり、観察研究なら群所属とpretestの関係自体に設計上の説明が必要です。",
        "Rの `faux` は要因計画のデータ生成を助けるパッケージです。Juliaではこの例のようにDistributions・Random・DataFramesから生成過程を明示できます。もしRの `afex` を念頭に置いている場合、Juliaに一対一のラッパーはなく、固定効果はStatsModelsのコントラストとGLM、反復測定は後のMixedModelsへ役割を分けます。",
      ],
    },
    {
      t: "参照水準は推測させず、DummyCodingで固定する",
      b: [
        "StatsModelsの既定は `DummyCoding` で、指定しなければ最初の水準がbaseになります。しかし、文字列の並びやデータ前処理へ参照水準を任せると、切片と係数の意味が静かに変わります。`DummyCoding(base = ..., levels = ...)` を `contrasts` へ渡して、基準と順序をコードに残します。",
        "control基準なら `group: training` はtraining−control、training基準なら `group: control` はcontrol−trainingです。参照水準を替えると係数名・符号・切片は変わりますが、同じモデル空間なら各人の予測値、残差、R²、群全体のオムニバス検定は変わりません。変わるのはパラメータ化と各係数が直接検定する仮説です。",
      ],
      code: `control_coding = Dict(:group => DummyCoding(
    base = "control",
    levels = ["control", "training", "combined"]))
training_coding = Dict(:group => DummyCoding(
    base = "training",
    levels = ["control", "training", "combined"]))

m_control = lm(@formula(posttest ~ pre_c + group), df;
               contrasts = control_coding)
m_training = lm(@formula(posttest ~ pre_c + group), df;
                contrasts = training_coding)

println(coefnames(m_control))
println(round.(coef(m_control), digits = 2))
println(coefnames(m_training))
println(round.(coef(m_training), digits = 2))
println(maximum(abs.(predict(m_control) .- predict(m_training))))`,
      out: `["(Intercept)", "pre_c", "group: training", "group: combined"]
[52.7, 0.53, 9.46, 14.09]
["(Intercept)", "pre_c", "group: control", "group: combined"]
[62.16, 0.53, -9.46, 4.63]
2.842170943040401e-14`,
      a: [
        "control基準では平均pretestにおける調整済み差がtraining−control=9.46、combined−control=14.09です。training基準ではcontrol−training=−9.46、combined−training=4.63へ問いが変わりました。",
        "最後の差は浮動小数点誤差の約2.8×10⁻¹⁴だけで、実質的に予測は同一です。参照水準を変えただけで研究結果全体が反転したように見えるなら、個別係数をオムニバス効果と取り違えていないか確認します。",
      ],
    },
    {
      t: "投入ブロックはネストモデルとして比較する",
      b: [
        "階層的投入では、研究上の順序をモデル列として明記します。ここではm0がpretest、m1が群を追加、m2が群ごとの傾きの違いを追加します。`pre_c * group` は `pre_c + group + pre_c & group` へ展開されます。",
        "GLMの `ftest` は隣り合うネストモデルを順に比較し、Δ自由度、残差平方和、ΔR²、F、p値を返します。全モデルは同じ結果変数・同じ観測行で当てる必要があります。欠測で行数が変わりそうなら、比較に必要な列を先に選び、`dropmissing`した共通データを作ります。",
      ],
      code: `m0 = lm(@formula(posttest ~ pre_c), df)
m1 = lm(@formula(posttest ~ pre_c + group), df;
        contrasts = control_coding)
m2 = lm(@formula(posttest ~ pre_c * group), df;
        contrasts = control_coding)
cmp = ftest(m0.model, m1.model, m2.model)

partial_r2_group = (deviance(m0) - deviance(m1)) / deviance(m0)
partial_r2_interaction =
    (deviance(m1) - deviance(m2)) / deviance(m1)

println(cmp.dof)
println(round.(cmp.r2, digits = 3))
println(round.(collect(cmp.fstat[2:3]), digits = 3))
println(cmp.pval[2:3])
println(round.([partial_r2_group, partial_r2_interaction], digits = 3))`,
      out: `(3, 5, 7)
(0.344, 0.6, 0.623)
[37.08, 3.411]
(3.5446474837819775e-13, 0.03641812283209555)
[0.39, 0.056]`,
      a: [
        "m0→m1では群の2自由度を加え、ΔR²=0.256、F=37.080、部分R²=0.390でした。部分R²は、縮小モデルに残った誤差のうち、追加ブロックが減らした割合です。通常のR²は変数を増やせば下がらないため、増分の問いと過学習を分けて考えます。",
        "m1→m2の交互作用はF=3.411、p=.036でしたが、生成時の群別傾きはすべて0.65です。正しい帰無仮説も約5%は棄却されます。『傾きの等質性検定が非有意ならANCOVAを採用』という二段階の自動選択ではなく、傾き差が研究上の問いか、必要な精度があるかを事前に決め、推定値と区間を読むべきです。都合のよいseedへ変えてこの反例を消してはいけません。",
      ],
    },
    {
      t: "交互作用があると、主効果はゼロ点での効果になる",
      b: [
        "`pre_c * group` では、controlのpretest傾きが `pre_c`、他群との傾き差が交互作用係数です。このとき `group: training` はすべてのpretestで一定の群差ではなく、`pre_c = 0`、つまり平均pretestでのtraining−controlです。中心化点を変えれば主効果の数値とp値も変わり得ますが、予測面そのものは変わりません。",
        "交互作用を含むモデルで『groupの主効果』を一つの係数だけから一般化してはいけません。意味のあるpretest値、たとえば平均、平均±1SDで群差を線形コントラストとして推定するか、予測線と区間を描きます。観測範囲外のpretestで群を比べるのは外挿です。",
        "`ftest(m0, m1, m2)` は計画したブロックの逐次比較で、Type II／III平方和を自動的に与える万能ANOVA表ではありません。特に交互作用があるときの『主効果』は参照水準、中心化、コントラストで仮説が変わります。先に科学的な比較を文章で書き、それに対応する縮小・完全モデルまたはコントラストを作ります。",
      ],
    },
    {
      t: "計画比較はHypothesisCodingでモデルへ直接入れる",
      b: [
        "3群のオムニバスFは『少なくとも1群が違う』までしか答えません。事前仮説が『2つの介入群の平均とcontrolの差』『combinedとtrainingの差』なら、その2つを独立な計画コントラストとして符号化できます。係数が研究仮説そのものになるため、基準群との全比較を後から眺めるより解釈が明確です。",
        "`HypothesisCoding` では行が仮説、列が `levels` と同じ群順です。各行の重みは0になる比較にし、何を平均し何を引くかをラベルとともに記録します。StatsModelsはその仮説行列からモデル行列用のコントラストを作ります。",
      ],
      code: `planned = HypothesisCoding(
    [-1.0  0.5  0.5;   # 介入2群の平均 - control
      0.0 -1.0  1.0];  # combined - training
    levels = ["control", "training", "combined"],
    labels = ["interventions-control", "combined-training"])

m_planned = lm(@formula(posttest ~ pre_c + group), df;
    contrasts = Dict(:group => planned))
println(coefnames(m_planned))
println(round.(coef(m_planned), digits = 3))`,
      out: `["(Intercept)", "pre_c", "group: interventions-control", "group: combined-training"]
[60.547, 0.532, 11.771, 4.629]`,
      a: [
        "平均pretestで、2介入群の調整済み平均はcontrolより11.771高く、combinedはtrainingより4.629高いという推定です。係数表のt検定とCIが、そのまま事前に定義した2仮説へ対応します。",
        "`DummyCoding`、`EffectsCoding`、`HelmertCoding`、`SeqDiffCoding`、`HypothesisCoding`は同じ群平均空間を別の座標で表せます。どれが『正しい』かではなく、切片と係数へどの仮説を持たせたいかで選びます。事前仮説が明確なら `HypothesisCoding` が最も監査しやすい選択です。",
      ],
    },
    {
      t: "下位検定は係数の線形結合として作る",
      b: [
        "control基準の加法ANCOVAではtraining−controlとcombined−controlは既存係数ですが、combined−trainingは2係数の差です。推定値だけを引くのでは足りません。係数どうしの共分散を含む `vcov(model)` からSEを計算します。",
        "次の関数は係数名と重みを対応づけ、推定値、SE、t、自由度、p値、95% CIを返します。列番号を直書きするより、参照水準を変えたときの取り違えを発見しやすくなります。実務では関数を十分にテストし、係数名と重みベクトルを出力へ残します。",
      ],
      code: `using LinearAlgebra, Distributions

function linear_contrast(model, weights)
    names = coefnames(model)
    unknown = setdiff(collect(keys(weights)), names)
    isempty(unknown) || throw(ArgumentError(
        "unknown coefficient: $(unknown)"))
    L = [get(weights, name, 0.0) for name in names]
    any(!iszero, L) || throw(ArgumentError(
        "at least one nonzero weight is required"))
    estimate = dot(L, coef(model))
    se = sqrt(dot(L, vcov(model) * L))
    df = Int(dof_residual(model))
    t = estimate / se
    p = 2ccdf(TDist(df), abs(t))
    critical = quantile(TDist(df), 0.975)
    return (estimate = estimate, se = se, t = t, df = df,
            p = p, ci = estimate .+ (-1, 1) .* critical .* se)
end

function holm_adjust(pvalues)
    order = sortperm(pvalues)
    adjusted = similar(pvalues, Float64)
    running_max = 0.0
    m = length(pvalues)
    for (rank, index) in enumerate(order)
        running_max = max(running_max,
                          (m - rank + 1) * pvalues[index])
        adjusted[index] = min(running_max, 1.0)
    end
    return adjusted
end

tc = linear_contrast(m_control,
    Dict("group: training" => 1.0))
cc = linear_contrast(m_control,
    Dict("group: combined" => 1.0))
ct = linear_contrast(m_control,
    Dict("group: training" => -1.0,
         "group: combined" => 1.0))

println(round.([tc.estimate, cc.estimate, ct.estimate], digits = 3))
println([round.(collect(test.ci), digits = 3)
         for test in (tc, cc, ct)])
println(round.(holm_adjust([tc.p, cc.p, ct.p]), sigdigits = 4))`,
      out: `[9.456, 14.085, 4.629]
[[6.311, 12.601], [10.778, 17.392], [1.506, 7.752]]
[5.703e-8, 3.15e-13, 0.004013]`,
      a: [
        "順にtraining−control、combined−control、combined−trainingの調整済み差です。加法モデルなのでpretest値によらず同じ差ですが、交互作用モデルなら比較するpretest値を重みLへ組み込む必要があります。",
        "標本を見てから全ペアを検定するなら、多重性を無視しません。この3比較の生p値は約2.85×10⁻⁸、1.05×10⁻¹³、.0040で、Holm調整後は約5.70×10⁻⁸、3.15×10⁻¹³、.0040です。事前に絞った計画比較と、結果を見て広げた事後比較を同じものとして報告しません。",
      ],
    },
    {
      t: "モデル比較は、優勝モデルを自動決定する装置ではない",
      b: [
        "F検定が比較できるのは、同じ観測行に当てたネスト線形モデルです。非ネストモデルならAIC・BIC、交差検証による予測誤差、外部標本での再現性など別の基準を使います。これらも説明、予測、因果という目的の違いを消しません。",
        "比較の前に、①結果変数、②推定したい係数または予測、③必ず調整する事前変数、④追加ブロック、⑤許す交互作用、⑥カテゴリ水準と参照、⑦計画コントラスト、⑧欠測後の共通分析標本を固定します。p値を見ながらこの順序を組み替えたなら探索として明示します。",
        "Rの `afex` が既定にするType III検定をそのまま再現すること自体を目的にしません。Type IIIという名前だけでは、符号化、参照グリッド、交互作用下の仮説が透明にならないからです。Juliaでは `contrasts`、`ftest`、`vcov` を組み合わせ、どの平均のどの線形結合を検定したかをコードとして残します。次の回では、このモデルが妥当かを残差、影響点、分散不均一、VIFから診断します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "controlを参照水準にした `posttest ~ pre_c + group` の `group: training` 係数は何を表しますか?",
      opts: [
        "pre_c=0でのtraining−controlの調整済み平均差",
        "全群を平均したpretestの傾き",
        "training群だけのposttest平均",
      ],
      ans: 0,
      why: "DummyCodingの非base係数はbaseとの差です。pre_cを平均中心化したので、pre_c=0は標本の平均pretestです。",
      hint: "参照水準と、中心化後の0が何を意味するかを組み合わせてください。",
    },
    {
      k: "fill",
      q: "controlを参照水準として明示します。空欄〔?〕に入る引数名を入力しましょう。",
      code: `DummyCoding(〔?〕 = "control")`,
      accept: ["base"],
      show: "base",
      why: "`base` で基準水準を明示します。再現性のため、必要なら `levels` で水準順も同時に固定します。",
      hint: "基準・土台を意味する英単語です。",
      placeholder: "引数名",
    },
    {
      k: "tf",
      q: "変数投入・参照水準・モデル比較について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "参照水準を替えると個別係数の意味は変わるが、同じモデル空間なら予測値とR²は変わらない",
          a: true,
          why: "参照変更は同じ予測面の座標変換です。どの群差が係数として直接現れるかは変わります。",
        },
        {
          s: "ネストモデルのF比較では、モデルごとに欠測除外後の行数が違っても構わない",
          a: false,
          why: "同じ観測の残差平方和を比較する必要があります。比較用の共通完全ケースを先に確定します。",
        },
        {
          s: "交互作用のp値が5%未満なら、真の群別傾きは必ず異なる",
          a: false,
          why: "この固定例は真の交互作用0でもp=.036でした。誤検出、推定精度、事前仮説を含めて判断します。",
        },
      ],
      hint: "変わるものと不変なもの、比較可能性の条件、p値の長期頻度を区別してください。",
    },
  ],
};
