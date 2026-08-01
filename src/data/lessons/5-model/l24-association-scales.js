// レッスン: 尺度に応じた関連指標 — 観測尺度と潜在モデルを混同しない
// コード例は Julia 1.12.6 + StatsBase + Distributions + HypothesisTests で実測済み(2026-08-01)
export default {
  id: "scale-aware-association",
  title: "尺度に応じた関連指標",
  tag: "連続・2値・順序データとクロス集計を読み分ける",
  pages: [
    {
      t: "係数名より先に、何を観測したかを確認する",
      b: [
        "相関係数は、列が数値なら自動的にPearsonを選べばよいわけではありません。連続量なのか、0/1の2値なのか、順序だけに意味があるカテゴリなのかを確認します。さらに、観測された尺度上の関連を知りたいのか、背後に仮定した潜在連続変数の関連を推定したいのかを分けます。",
        "連続×連続の直線関係ならPearson、単調関係や順位を重視するならSpearman／Kendallが候補です。2値×連続では点双列、2値×2値ではφ係数が観測尺度上のPearson相関に対応します。順序変数ではSpearman／Kendallに加え、潜在正規・閾値モデルを置くpolychoric／polyserialが候補になります。",
        "データ型だけでは決まりません。Likert項目だから必ずpolychoric、外れ値があるから必ずSpearman、という自動選択は避けます。研究上の問い、尺度の生成過程、形、同順位、標本サイズ、推定の安定性を合わせて判断します。",
      ],
    },
    {
      t: "Pearson・Spearman・Kendallは別の問いに答える",
      b: [
        "Pearsonは元の数値尺度での直線的な共変動を測ります。Spearmanは値を順位へ変換したPearson相関で、単調に増える関係を捉えます。Kendallは観測ペアの順序が一致するかを基礎にします。係数の数値を同じ効果量として単純に横並びにはできません。",
        "次の `y = x³` は完全に単調ですが直線ではありません。順位は完全に一致するのでSpearmanとKendallは1、Pearsonは1より小さくなります。どれが正しいかではなく、直線性を問うか単調性を問うかが違います。",
      ],
      code: `using Statistics, StatsBase

x = collect(1.0:10.0)
y = x .^ 3

pearson = cor(x, y)
spearman = corspearman(x, y)
kendall = corkendall(x, y)

println(round.([pearson, spearman, kendall], digits = 3))`,
      out: `[0.928, 1.0, 1.0]`,
      a: [
        "順位相関は外れ値の影響を弱める場合がありますが、非単調なU字型を自動的に発見する係数ではありません。また、同順位が多い粗い尺度では情報量が減り、推定値と不確かさが変わります。散布図、カテゴリ頻度、係数と区間を一緒に確認します。",
        "係数を結果を見て選び、最も大きかったものだけ報告すると分析者自由度が増えます。選択原理を先に決めるか、複数指標を感度分析として並べ、その理由を明記します。",
      ],
    },
    {
      t: "2値×連続: 点双列相関は0/1のPearson相関",
      b: [
        "点双列相関は特別な別計算ではありません。自然な2群を0/1で符号化し、連続変数とのPearson相関を計算したものと同値です。群平均差を、全体の標準偏差と群比率を使って標準化した見方でもあります。",
        "0と1を反転すると符号だけが反転し、絶対値は変わりません。正負を『良い／悪い』と読まず、どちらを1としたかを報告します。連続変数を恣意的に2値化して点双列へ変えると情報を失うため、元から2値の変数と区別します。",
      ],
      code: `using Random, Statistics, Distributions

group = repeat([0, 1], inner = 40)
score = 500 .+ 30 .* group .+
        rand(Xoshiro(2701), Normal(0, 50), 80)

r_pb = cor(group, score)
println(round(r_pb, digits = 3))
println(isapprox(cor(Float64.(group), score), r_pb))
println(isapprox(cor(1 .- group, score), -r_pb))`,
      out: `0.282
true
true`,
      a: [
        "この相関は群の重なりと群比率にも依存します。点双列相関だけでなく、0群と1群の平均、平均差、95%信頼区間、各群のnを示すと、元の尺度で効果を解釈できます。",
        "点双列相関とbiserial相関は同じではありません。biserial相関は観測された2値が潜在連続変数を閾値で切ったものだという追加仮定を置きます。名前が似ていても、自然な2群と人為的な二分を混同しません。",
      ],
    },
    {
      t: "2値×2値: φ係数は2本の0/1列のPearson相関",
      b: [
        "2つの2値変数の観測尺度上の関連にはφ係数を使えます。2×2表のセルを `a, b, c, d` とすると表から直接計算でき、個票を0/1列に戻したPearson相関と一致します。",
      ],
      code: `using Statistics

a, b, c, d = 30, 10, 15, 45
x = vcat(fill(1, a + b), fill(0, c + d))
y = vcat(fill(1, a), fill(0, b), fill(1, c), fill(0, d))

phi_cor = cor(x, y)
phi_table = (a * d - b * c) /
    sqrt((a + b) * (c + d) * (a + c) * (b + d))

println(round(phi_cor, digits = 3))
println(isapprox(phi_cor, phi_table))`,
      out: `0.492
true`,
      a: [
        "φ係数は観測された0/1上の関連です。周辺比率が極端だと取り得る最大値が1より小さくなる場合があり、異なる有病率・通過率の表どうしを機械的に比較しにくくなります。セル度数と比率も併記します。",
        "独立性のカイ二乗検定とは関係しますが、φ係数は因果方向や分類精度を表しません。診断の問いなら感度・特異度・陽性的中率など、予測目的に合った量を別に検討します。",
      ],
    },
    {
      t: "クロス集計は、セル度数と分母を固定してから読む",
      b: [
        "2値変数どうしの関連を推測する前に、クロス集計表の向きを固定します。次の表は行が介入群（training／control）、列が結果（event／no event）です。同じ18という度数でも、行割合ならtraining群25人中の72%、列割合ならevent 27人中の66.7%で、答える問いが違います。",
        "Juliaの行列はラベルを保持しません。個票から度数表を作るときは、行・列レベルの順序をコードと報告の両方で明示します。辞書やカテゴリの偶然の並び順に任せると、参照カテゴリが変わり、φ、リスク差、オッズ比の符号や向きまで変わり得ます。",
      ],
      code: `using StatsBase

group = vcat(fill("training", 25), fill("control", 25))
outcome = vcat(fill("event", 18), fill("no event", 7),
               fill("event", 9), fill("no event", 16))

row_levels = ["training", "control"]
col_levels = ["event", "no event"]
cell_counts = countmap(collect(zip(group, outcome)))
table = [get(cell_counts, (r, c), 0)
         for r in row_levels, c in col_levels]

row_proportions = table ./ sum(table; dims = 2)
println(table)
println(round.(row_proportions, digits = 2))`,
      out: `[18 7; 9 16]
[0.72 0.28; 0.36 0.64]`,
      a: [
        "欠測を無言で除外せず、欠測数と解析分母を示します。観測されなかっただけのsampling zeroと、設計上あり得ないstructural zeroも区別します。後者を通常の0度数として検定へ入れると、独立性モデル自体が研究デザインに合いません。",
        "割合は研究の問いに合わせます。群ごとの発生率なら行割合、発生者がどの群に属するかなら列割合、母集団構成を含む全体像なら総数割合です。最も見栄えのよい分母を結果を見て選びません。",
      ],
    },
    {
      t: "独立な2×2表: 検定と効果量は役割が違う",
      b: [
        "別々の対象からなる2群なら、Pearsonの独立性カイ二乗検定で、行変数と列変数が独立という帰無仮説を調べられます。`ChisqTest(table)` のp値は標本サイズにも依存するため、関連の大きさではありません。2×2表では符号付きφ、リスク差（RD）、リスク比（RR）、標本オッズ比（OR）を、研究上の意味に応じて併記します。",
        "この例ではtraining群のevent率0.72、control群0.36なので、RDは0.36、RRは2.0です。OR 4.57を『確率が4.57倍』とは読めません。eventが稀でないため、ORはRRよりかなり大きく見えます。",
      ],
      code: `using HypothesisTests

table = [18 7; 9 16] # 行=training/control, 列=event/no event
a, b = table[1, 1], table[1, 2]
c, d = table[2, 1], table[2, 2]
n = sum(table)

chi = ChisqTest(table)
phi = (a * d - b * c) /
      sqrt((a + b) * (c + d) * (a + c) * (b + d))
risk_training, risk_control = a / (a + b), c / (c + d)
risk_difference = risk_training - risk_control
risk_ratio = risk_training / risk_control
sample_odds_ratio = (a * d) / (b * c)

fisher = FisherExactTest(a, b, c, d)
println((chisq = round(chi.stat, digits = 3),
         p = round(pvalue(chi), digits = 4)))
println((phi = round(phi, digits = 3),
         RD = round(risk_difference, digits = 3),
         RR = round(risk_ratio, digits = 3),
         OR = round(sample_odds_ratio, digits = 3)))
println((fisher_p = round(pvalue(fisher), digits = 4),
         fisher_ci = round.(confint(fisher), digits = 3)))`,
      out: `(chisq = 6.522, p = 0.0107)
(phi = 0.361, RD = 0.36, RR = 2.0, OR = 4.571)
(fisher_p = 0.0222, fisher_ci = (1.2, 18.027))`,
      a: [
        "行を入れ替えるとRDとφの符号が反転し、RRとORは逆数になります。列を入れ替えても解釈対象がeventからno eventへ変わります。一方、独立性検定のカイ二乗値とp値は変わりません。『どちらを基準にしたか』を結果表の脚注に残します。",
        "`FisherExactTest` の点推定は固定周辺度数の下での条件付き最尤ORで、単純な交差積ORとは少し異なります。この表では標本ORが4.571、Fisher出力の点推定は4.422です。p値だけを一致させようとして推定対象を混ぜません。",
      ],
    },
    {
      t: "疎な2×2表: Fisher正確検定にも選択事項がある",
      b: [
        "Pearsonのカイ二乗検定は漸近近似です。期待度数が小さい表では近似が不安定になり得るので、期待度数、総数、周辺の偏りを確認し、固定周辺度数を条件とするFisher正確検定を候補にします。ただし『期待度数5未満が1セルでもあれば自動的にFisher』という単一規則は、デザインや推定対象を代替しません。",
        "Fisherの両側p値には複数の定義があります。HypothesisTests.jlでは `method=:central` と `method=:minlike` を選べ、この疎な表では結論が境界をまたぎます。方法を結果を見て選ばず、事前に決め、パッケージ・版・methodを記録します。",
      ],
      code: `using HypothesisTests

sparse_table = [1 8; 7 4]
n = sum(sparse_table)
row_p = sum(sparse_table; dims = 2) ./ n
col_p = sum(sparse_table; dims = 1) ./ n
expected = row_p * col_p .* n

chi = ChisqTest(sparse_table)
fisher = FisherExactTest(
    sparse_table[1, 1], sparse_table[1, 2],
    sparse_table[2, 1], sparse_table[2, 2])

println(round.(expected, digits = 1))
println((chisq_p = round(pvalue(chi), digits = 4),
         fisher_central = round(pvalue(fisher; method = :central), digits = 4),
         fisher_minlike = round(pvalue(fisher; method = :minlike), digits = 4)))`,
      out: `[3.6 5.4; 4.4 6.6]
(chisq_p = 0.0171, fisher_central = 0.0498, fisher_minlike = 0.0281)`,
      a: [
        "正確検定は小標本の情報不足を消しません。区間は広く、0セルでは未補正ORが0または∞になります。安易に0.5を足して有限値へ変えると推定対象が変わるため、補正法の根拠、事前指定、感度分析が必要です。",
        "2×2で結果が二値なら、推定したい量を先に決めます。公衆衛生ではRDやRRが意思決定に直結しやすく、症例対照研究では標本からリスクを直接推定できずORが中心になります。同じ表でも標本抽出法が解釈を決めます。",
      ],
    },
    {
      t: "R×C表: 全体の関連と、どのセルが寄与したかを分ける",
      b: [
        "3×3以上の表では、Pearsonの独立性検定が『どこかに関連があるか』をまとめて調べます。効果量にはCramérのVを使えますが、Vだけでは関連の形は分かりません。期待度数と調整済み残差を併記し、どの組合せが独立モデルより多い／少ないかを調べます。",
        "各セルの調整済み残差を標準正規のz値のように読むと9回の探索になります。`|z| > 1.96` のセルだけを無補正で強調せず、事前仮説を明示するか、次のようにHolm補正したセル別p値を示します。全体検定が有意でも、都合のよいセルを自由に選ぶ権利は生まれません。",
      ],
      code: `using HypothesisTests, Distributions

table = [30 12 8; 18 20 12; 10 18 32]
chi = ChisqTest(table)
n, r, c = sum(table), size(table, 1), size(table, 2)
cramers_v = sqrt(chi.stat / (n * min(r - 1, c - 1)))

row_p = sum(table; dims = 2) ./ n
col_p = sum(table; dims = 1) ./ n
expected = row_p * col_p .* n
adjusted_residuals = (table .- expected) ./
    sqrt.(expected .* (1 .- row_p) .* (1 .- col_p))
raw_p = 2 .* ccdf.(Normal(), abs.(adjusted_residuals))

function holm_adjust(pvalues)
    p = vec(pvalues)
    order = sortperm(p)
    adjusted = similar(p)
    running = 0.0
    for (rank, index) in enumerate(order)
        running = max(running, (length(p) - rank + 1) * p[index])
        adjusted[index] = min(running, 1.0)
    end
    reshape(adjusted, size(pvalues))
end

println((chisq_p = round(pvalue(chi), sigdigits = 3),
         cramers_v = round(cramers_v, digits = 3)))
println(round.(adjusted_residuals, digits = 2))
println(round.(holm_adjust(raw_p), digits = 4))`,
      out: `(chisq_p = 6.08e-6, cramers_v = 0.304)
[4.21 -1.33 -3.0; -0.04 1.61 -1.55; -3.99 -0.26 4.36]
[0.0002 0.5467 0.016; 1.0 0.5371 0.5371; 0.0005 1.0 0.0001]`,
      a: [
        "CramérのVは0〜1ですが、同じVでも表の次元や周辺分布が違えば実質的意味は同じとは限りません。カテゴリ名、セル度数、行または列割合、χ²、自由度、p値、Vをセットで報告します。",
        "順序カテゴリを名義カテゴリとしてPearson検定へ入れると順序情報を使いません。方向付きの傾向が仮説なら傾向検定や順序ロジスティックモデルを検討し、データを見てから都合よく名義／順序を切り替えません。",
      ],
    },
    {
      t: "対応あり2値表: 情報は不一致ペアにある",
      b: [
        "同じ80人を介入前後で測った2×2表は、独立な2群の表ではありません。行をbefore、列をafterとすると、変化の情報はoff-diagonalの12人（positive→negative）と3人（negative→positive）にあります。通常の `ChisqTest(table)` やFisher検定は80人を独立セルとして扱うため、この問いには使いません。",
        "McNemar検定は2方向の不一致数が等しいかを調べます。現在のHypothesisTests.jlには名前付きのMcNemar APIがないため、正確版は不一致15人のうち一方向が3人という `BinomialTest(3, 15, 0.5)` として計算できます。何をsuccessにしたかで方向が反転するので、行列の向きを必ず併記します。",
      ],
      code: `using HypothesisTests

paired_table = [35 12; 3 30] # 行=before +/-, 列=after +/-
b = paired_table[1, 2]       # positive -> negative
c = paired_table[2, 1]       # negative -> positive
n = sum(paired_table)

exact_mcnemar = BinomialTest(c, b + c, 0.5)
risk_difference_after_minus_before = (c - b) / n
discordant_odds = c / b

println((p = round(pvalue(exact_mcnemar), digits = 4),
         direction_share = round(c / (b + c), digits = 3),
         binomial_ci = round.(confint(exact_mcnemar), digits = 3)))
println((risk_difference = risk_difference_after_minus_before,
         discordant_odds = discordant_odds))`,
      out: `(p = 0.0352, direction_share = 0.2, binomial_ci = (0.043, 0.481))
(risk_difference = -0.1125, discordant_odds = 0.25)`,
      a: [
        "このbinomial区間は、不一致ペアのうちnegative→positiveが占める割合の区間です。全80人における前後リスク差の区間そのものではありません。効果量と区間の推定対象をラベルで区別します。不一致が0ならMcNemar検定にも方向を識別する情報がありません。",
        "対応が1人2時点を超える、対象が施設内に入れ子、同じ参加者が複数項目へ回答する場合は、2×2表だけでは依存構造を表せません。GEEや一般化線形混合モデルへ進み、独立性を見かけ上の大標本で水増ししません。",
      ],
    },
    {
      t: "Simpsonの反転: 周辺表と層別表は別の比較をする",
      b: [
        "次の合成例では、行がtreatment A／B、列がsuccess／failureです。easy層でもdifficult層でもAの成功率がBより高いのに、層を潰した周辺表ではAの成功率が低くなります。これがSimpsonのパラドックスです。計算ミスではなく、異なる重症度構成を混ぜた比較と、同じ重症度内の比較が別の問いへ答えています。",
        "Aの350人中263人がdifficult、Bの350人中270人がeasyです。重症度は成功率にも治療選択にも関係するため、周辺表では治療差と構成差が混ざります。まず各層の度数・割合・効果量を表示し、反転をp値の有無だけで説明しません。",
      ],
      code: `easy = [81 6; 234 36]
difficult = [192 71; 55 25]
marginal = easy + difficult

odds_ratio(table) =
    (table[1, 1] * table[2, 2]) /
    (table[1, 2] * table[2, 1])
risk_difference(table) =
    table[1, 1] / sum(table[1, :]) -
    table[2, 1] / sum(table[2, :])

println(marginal)
println((marginal_rd = round(risk_difference(marginal), digits = 4),
         marginal_or = round(odds_ratio(marginal), digits = 3)))
println(round.([risk_difference(easy), risk_difference(difficult)], digits = 4))
println(round.([odds_ratio(easy), odds_ratio(difficult)], digits = 3))`,
      out: `[273 77; 289 61]
(marginal_rd = -0.0457, marginal_or = 0.748)
[0.0644, 0.0425]
[2.077, 1.229]`,
      a: [
        "周辺OR 0.748だけならAが不利に見えますが、easy層OR 2.077、difficult層OR 1.229はいずれもAが有利な方向です。層を分ければ必ず真実になるのではなく、重症度が処置前の共通原因で、この層内比較に十分な交換可能性があるという設計上の根拠が必要です。",
        "反転を見つけてから都合のよい第三変数を探索すると、別の分析者自由度が生まれます。層別変数は時間順序と因果仮説から事前指定し、各層にAとBの両方が十分存在するpositivity／overlapも確認します。",
      ],
    },
    {
      t: "層別共通ORとロジスティック回帰を照合する",
      b: [
        "層ごとのORが共通とみなせるなら、Mantel–Haenszel（MH）推定量で層を保った共通ORを作れます。この検証環境のHypothesisTests.jl 0.11.8には名前付きMH APIがないため、定義式を短い関数として実装し、同じ集計度数をロジスティック回帰でも照合します。",
        "集計二項モデルでは成功割合を応答、各行の試行数を `fweights` として渡します。treatmentの参照をB、severityの参照をeasyに固定した加法モデルで、`exp(treatment: A)` は重症度を固定したA対Bの条件付きORです。",
      ],
      code: `using DataFrames, CategoricalArrays, StatsModels
using StatsBase, GLM, Distributions

easy = [81 6; 234 36]
difficult = [192 71; 55 25]
strata = DataFrame(
    treatment = categorical(["A", "B", "A", "B"]),
    severity = categorical(["easy", "easy", "difficult", "difficult"]),
    successes = [81, 234, 192, 55],
    trials = [87, 270, 263, 80])
strata.proportion = strata.successes ./ strata.trials

coding = Dict(
    :treatment => DummyCoding(base = "B", levels = ["B", "A"]),
    :severity => DummyCoding(
        base = "easy", levels = ["easy", "difficult"]))
adjusted_model = glm(
    @formula(proportion ~ treatment + severity), strata,
    Binomial(), LogitLink(); weights = fweights(strata.trials),
    contrasts = coding)
interaction_model = glm(
    @formula(proportion ~ treatment * severity), strata,
    Binomial(), LogitLink(); weights = fweights(strata.trials),
    contrasts = coding)

mh_or(tables) =
    sum(t[1, 1] * t[2, 2] / sum(t) for t in tables) /
    sum(t[1, 2] * t[2, 1] / sum(t) for t in tables)
common_mh_or = mh_or([easy, difficult])
adjusted_or = exp(coef(adjusted_model)[2])
interaction_p = ccdf(
    Chisq(dof(interaction_model) - dof(adjusted_model)),
    deviance(adjusted_model) - deviance(interaction_model))

println(coefnames(adjusted_model))
println((mh_or = round(common_mh_or, digits = 3),
         adjusted_or = round(adjusted_or, digits = 3),
         interaction_p = round(interaction_p, digits = 3)))`,
      out: `["(Intercept)", "treatment: A", "severity: difficult"]
(mh_or = 1.447, adjusted_or = 1.429, interaction_p = 0.315)`,
      a: [
        "MH OR 1.447と調整済みロジスティックOR 1.429は近いですが同一の推定量ではありません。MHは固定層の条件付き共通OR、回帰は指定したロジットモデルの最尤推定です。丸めて一致させず、方法と仮定を報告します。",
        "交互作用の尤度比検定はp=0.315ですが、『2つの層ORが等しいと証明された』とは読めません。層ORは2.077と1.229で、標本情報も有限です。効果修飾が研究上重要なら共通ORへ押し込まず、層別の確率・RD・RRと区間を示します。",
      ],
    },
    {
      t: "調整済み係数を、共通分布での確率へ標準化する",
      b: [
        "条件付きORは意思決定で直読しにくいため、調整済みモデルから全員がAだった場合とBだった場合の確率を予測し、同じ重症度分布で平均します。ここでは全700人を合わせたeasy 357人、difficult 343人の分布を標準化先にします。",
        "観測された周辺成功率はA 0.780、B 0.826でA−Bは−0.0457でした。共通分布へ標準化するとA 0.825、B 0.771、RDは+0.0541へ反転します。『調整済みORが有意か』だけで終えず、誰の分布へ平均したどの確率差かを示します。",
      ],
      code: `grid = DataFrame(
    treatment = categorical(["A", "A", "B", "B"]),
    severity = categorical(["easy", "difficult", "easy", "difficult"]))
grid.probability = predict(adjusted_model, grid)

severity_weights = [357, 343] ./ 700
standardized_a = sum(grid.probability[1:2] .* severity_weights)
standardized_b = sum(grid.probability[3:4] .* severity_weights)
standardized_rd = standardized_a - standardized_b
standardized_rr = standardized_a / standardized_b
standardized_or = (standardized_a / (1 - standardized_a)) /
                  (standardized_b / (1 - standardized_b))

println(round.(grid.probability, digits = 3))
println((p_a = round(standardized_a, digits = 3),
         p_b = round(standardized_b, digits = 3),
         rd = round(standardized_rd, digits = 4),
         rr = round(standardized_rr, digits = 3),
         marginal_or = round(standardized_or, digits = 3),
         conditional_or = round(exp(coef(adjusted_model)[2]), digits = 3)))`,
      out: `[0.908, 0.738, 0.874, 0.663]
(p_a = 0.825, p_b = 0.771, rd = 0.0541, rr = 1.07, marginal_or = 1.401, conditional_or = 1.429)`,
      a: [
        "標準化OR 1.401と条件付きOR 1.429が違うのは誤差ではありません。ロジスティックORは非可縮で、同じモデルからでも条件付きと周辺のestimandは一致しません。係数変化だけを交絡診断に使わない理由でもあります。",
        "この標準化を因果効果と読むには、重症度で条件づければ未測定交絡がない、両治療が各重症度で起こり得る、介入と結果が一貫して定義される、モデルと欠測処理が妥当、といった追加仮定が要ります。媒介変数やcolliderを『調整変数を増やすほど安全』と投入すると、別のバイアスを作り得ます。",
      ],
    },
    {
      t: "クロス集計から層別・回帰へ進む判断地図",
      b: [
        "まず観測単位を確認します。別対象×名義カテゴリなら独立な2×2／R×C、同じ対象の2時点2値ならMcNemar、3水準以上の反復やクラスターなら依存を表すモデルです。次に推定対象を、割合差・RR・OR・全体関連・順序傾向のどれかとして言葉で定義します。検定名から逆算しません。",
        "第三変数で層別すると関連が弱まったり逆転したりするSimpsonのパラドックスがあり、周辺表だけでは交絡を調整できません。事前に重要な層がある2×2表なら層別推定、複数共変量ならロジスティック回帰などへ接続します。ただし回帰へ移しても、参照水準、交互作用、非線形性、分離、クラスター依存の問題は残ります。",
        "最終報告には、観測単位、表の行列ラベル、セル度数、解析分母と欠測、割合の分母、効果量と信頼区間、検定統計量・自由度・p値、exact／漸近と両側法、多重比較、事前に決めた層別を含めます。因果効果を述べるには、クロス集計の関連に加えて割付・交換可能性・測定・欠測への仮定が必要です。",
      ],
      a: [
        "カテゴリをまとめる、連続変数を2値化する、0セルへ補正を加える、層を選ぶ、といった操作は結論を変えます。どれも結果を見た後の応急処置にせず、感度分析では元の表との違いを残します。",
        "長期的には『相関係数のカタログ』ではなく、観測単位→尺度→デザイン→推定対象→モデル→診断→報告という共通フローを身につけるのが目標です。このフローは後続のロジスティック回帰、混合効果モデル、測定論にもそのまま接続します。",
      ],
    },
    {
      t: "tetrachoric・polychoricは潜在閾値モデル",
      b: [
        "tetrachoric相関は、観測された2値の背後に2つの潜在連続変数があり、各変数が閾値を超えたとき1になると仮定して、その潜在相関を推定します。φ係数と同じ対象ではありません。polychoricはこれを3カテゴリ以上の順序変数へ、polyserialは順序×連続へ広げます。",
        "両方の閾値が潜在標準正規の0、つまり周辺比率がおよそ50%という特別な場合には、`ρ = sin(πφ/2)` の関係があります。次のシミュレーションでは潜在相関0.7が、観測φでは約0.493へ縮み、この特例によるtetrachoric推定では約0.699へ戻ります。",
      ],
      code: `using Random, Statistics, Distributions

latent_rho = 0.7
d = MvNormal(zeros(2),
             [1.0 latent_rho; latent_rho 1.0])
latent = rand(Xoshiro(2702), d, 30_000)
x = Int.(latent[1, :] .> 0)
y = Int.(latent[2, :] .> 0)

observed_phi = cor(x, y)
tetra_zero_threshold = sinpi(observed_phi / 2)

println(round(observed_phi, digits = 3))
println(round(tetra_zero_threshold, digits = 3))`,
      out: `0.493
0.699`,
      a: [
        "`sinpi` の式はゼロ閾値の特例です。周辺比率が偏った一般の2×2表へそのまま使えません。一般のtetrachoric／polychoric推定には、各閾値と潜在相関を含む二変量正規の矩形確率を用いた尤度が必要です。空セルや小標本では不安定になることもあります。",
        "2026年8月時点のこのJulia環境では、Generalレジストリに本教材の基準を満たす汎用polychoric推定パッケージを確認できませんでした。Distributions.jlにも多変量正規CDFのメソッドはありません。本編で未検証の自作推定器を配布せず、必要な研究ではRCall経由の `polycor::polychor` などをProject・R版・パッケージ版とともに隔離して検証します。",
      ],
    },
    {
      t: "順序相関から古典的テスト理論・妥当性へ",
      b: [
        "5件法項目を1〜5としてPearson相関する方法は、カテゴリ間隔を等しいとみなします。Spearman／Kendallは順序を使います。polychoricは潜在正規と閾値という強いモデルを置きます。どれも常に正解ではなく、カテゴリ頻度、天井・床効果、サンプルサイズ、想定する生成過程を示します。",
        "古典的テスト理論では、二値項目とテスト得点の関連を点双列相関で調べることがあります。このとき合計点へ当該項目自身を含めると、同じ値を両側に入れるため相関が水増しされます。当該項目を除いた残り得点との修正済み項目–合計相関を使います。",
      ],
      code: `using Random, Statistics, Distributions

rng = Xoshiro(2703)
ability = rand(rng, Normal(), 400)
difficulties = [-0.8, -0.2, 0.3, 0.9]
items = hcat((Int.(rand(rng, 400) .<
                   (1 ./ (1 .+ exp.(-(ability .- b)))))
              for b in difficulties)...)

total = vec(sum(items; dims = 2))
rest = vec(sum(items[:, 2:end]; dims = 2))
uncorrected = cor(items[:, 1], total)
corrected = cor(items[:, 1], rest)

println(round(uncorrected, digits = 3))
println(round(corrected, digits = 3))`,
      out: `0.584
0.216`,
      a: [
        "未修正0.584に対して修正済みは0.216でした。差は項目の質が突然下がったからではなく、自己相関の成分を除いたためです。項目弁別は通過率、内容、次元性、標本と合わせて評価し、固定閾値だけで削除しません。詳しくは「古典的テスト理論と項目分析」で扱います。",
        "収束的妥当性は理論上近い測定との相関が予測どおりか、弁別的妥当性は異なる構成概念とのパターンが区別できるかという証拠の蓄積です。高いpolychoric相関1個や低いPearson相関1個を合否判定にしません。信頼性による減衰、信頼区間、MTMM、代替説明を後続レッスンで統合します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "0/1で記録した群変数と連続得点の観測尺度上の関連を調べます。もっとも直接的な指標はどれでしょう?",
      opts: [
        "点双列相関（0/1と得点のPearson相関）",
        "polychoric相関",
        "φ係数",
      ],
      ans: 0,
      why: "2値×連続の観測尺度上の関連は点双列相関で表せ、0/1列と連続得点のPearson相関と同値です。φ係数は2値×2値、polychoricは順序変数の背後の潜在連続相関を仮定します。",
      hint: "片方は連続、片方は自然な2群です。",
    },
    {
      k: "fill",
      q: "StatsBaseでSpearman順位相関を計算します。空欄〔?〕に入る関数名を入力しましょう。",
      code: `〔?〕(x, y)`,
      accept: ["corspearman"],
      show: "corspearman",
      why: "`corspearman` は値を順位へ変換したうえでの相関を計算します。Pearsonの `cor` と、何を関連として測るかを区別します。",
      hint: "corの後ろに、考案者Spearmanの名前を続けます。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "尺度に応じた関連指標について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "2本の0/1列のPearson相関は、φ係数と一致する",
          a: true,
          why: "2×2表から計算するφ係数と、個票の0/1列から計算するPearson相関は同じ量です。",
        },
        {
          s: "Likert項目なら、標本サイズやカテゴリ頻度にかかわらずpolychoric相関が常に正解である",
          a: false,
          why: "polychoric相関は潜在正規・閾値モデルを仮定し、疎なカテゴリでは不安定になり得ます。研究上の問いとモデル適合性を検討します。",
        },
        {
          s: "高い相関係数が1つあれば、収束的妥当性は証明されたと判断できる",
          a: false,
          why: "妥当性は理論に基づく相関パターン、信頼区間、信頼性、異なる方法、代替説明などを合わせた証拠です。単一係数の合否ではありません。",
        },
      ],
      hint: "観測尺度と潜在尺度、係数と妥当性証拠を分けて考えてください。",
    },
  ],
};
