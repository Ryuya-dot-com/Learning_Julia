// レッスン: 回帰診断とVIF
// コード例は Julia 1.12.6 + GLM 1.9.5 + CairoMakie 0.15.13 で実測済み(2026-08-01)
export default {
  id: "regression-diagnostics",
  title: "回帰診断とVIF",
  tag: "仮定を合否判定せず、壊れ方と結論への影響を調べる",
  pages: [
    {
      t: "仮定は生データではなく、モデルと生成過程の関係にある",
      b: [
        "通常の線形回帰で確認する中心は、①条件付き平均の形、②観測の独立性、③推論に使う誤差分散、④影響の強い観測、⑤係数を分離できる説明変数の情報です。『xもyも正規分布であること』や『残差検定が非有意であること』が一括した合格条件ではありません。",
        "線形性とは、説明変数で条件づけた平均 `E(y | X)` を式が十分に表していることです。等分散性は主に通常のOLS標準誤差へ関係し、独立性は標準誤差と有効標本サイズへ関係します。正規性が必要になる場面でも対象は生のyではなく条件付き誤差で、特に小標本のt／F推論や区間の精度に関係します。",
        "診断はモデルを『採用／棄却』する儀式ではありません。どこで、どの程度、どの結論が変わるかを調べます。残差図、代替仕様、ロバストSE、影響点を除かない感度分析、研究デザインを組み合わせて判断します。",
      ],
    },
    {
      t: "曲線を当てることと、残差の分布を変えることは別",
      b: [
        "`y = β₀ + β₁x + ε` で正規性が問題になるとき、対象は生のxやyではなく、指定した平均からの条件付き誤差 `ε | X` です。一方、非線形性は平均 `E(y | X)` の式が直線では足りないという問題です。非正規性、平均の非線形性、分散不均一を分け、Q–Q図の逸脱だけを理由に曲線を足しません。重い裾や外れ値は、曲線を足しても自動では直りません。",
        "`x2 = x .^ 2` を作った `lm(@formula(y ~ x + x2), df)` はxに対して曲線ですが、係数βには線形なので線形モデルです。未知係数が指数関数の内部などへ入る狭義の非線形回帰も、残差へ正規・独立・等分散を仮定することがあります。『曲線である』ことと『正規誤差を仮定しない』ことを同義にしません。",
        "二項・カウント・正の連続量のように応答の範囲と分散が生成過程から決まるなら、Binomial、Poisson、GammaなどのGLMを検討します。重い裾なら推定値への影響、ロバスト推論、bootstrap、変換を比較します。どの方法も、原因と推定したい量を確認してから選びます。",
      ],
    },
    {
      t: "高いR²でも、残差に曲線が残れば平均構造が違う",
      b: [
        "真の平均に二次曲線を入れ、最初は `y ~ x` だけを当てます。OLS残差は式に入れた切片とxには直交するため、`cor(residual, x) ≈ 0`だけでは線形性の証拠になりません。残差対予測値やxの平滑化パターン、研究上あり得る変換・曲線項を調べます。",
      ],
      code: `using Random, Statistics, Distributions, DataFrames, GLM

rng = Xoshiro(3001)
n = 160
x = rand(rng, Uniform(-3, 3), n)
y = 2 .+ 0.8 .* x .+ 1.1 .* x .^ 2 .+
    rand(rng, Normal(0, 1), n)
df_curve = DataFrame(x = x, x2 = x .^ 2, y = y)

m_linear = lm(@formula(y ~ x), df_curve)
m_quadratic = lm(@formula(y ~ x + x2), df_curve)
curve_cmp = ftest(m_linear.model, m_quadratic.model)

println(round.([r2(m_linear), r2(m_quadratic)], digits = 3))
println(round(cor(residuals(m_linear), df_curve.x2), digits = 3))
println(round(curve_cmp.fstat[2], digits = 3))`,
      out: `[0.162, 0.921]
0.95
1511.401`,
      a: [
        "直線モデルのR²は0.162で、残差とx²の相関が0.950も残りました。x²を加えるとR²は0.921になり、追加項のFは1511.401です。これはp値だけで曲線を発見したのではなく、生成知識と残差パターンに対応する平均構造を比較した結果です。",
        "二次項を入れれば常に正解でもありません。次数を標本内R²だけで増やし続ければ過学習します。理論、可視化、外部範囲での挙動、交差検証を使い、観測範囲外へ曲線を外挿しないようにします。",
      ],
    },
    {
      t: "残差図とQ–Q図をJuliaで組み立てる",
      b: [
        "残差対予測値では、中心が0付近にあり、系統的な曲線や漏斗形がないかを見ます。Q–Q図では標準化残差の順序統計量を正規分布の理論分位点と比べ、裾や歪みを調べます。どちらも『目視で完全な雲なら合格』ではなく、逸脱の形から次のモデル候補を考える道具です。",
      ],
      code: `using CairoMakie, Distributions

res = residuals(m_linear)
standardized_res = (res .- mean(res)) ./ std(res)
probability = ((1:length(res)) .- 0.5) ./ length(res)
normal_quantile = quantile.(Normal(), probability)

fig = Figure(size = (760, 320))
ax1 = Axis(fig[1, 1], xlabel = "予測値", ylabel = "残差")
scatter!(ax1, fitted(m_linear), res)
hlines!(ax1, [0], color = :black, linestyle = :dash)

ax2 = Axis(fig[1, 2], xlabel = "正規理論分位点",
           ylabel = "標準化残差")
scatter!(ax2, normal_quantile, sort(standardized_res))
lines!(ax2, [-3, 3], [-3, 3], color = :black,
       linestyle = :dash)
fig`,
      a: [
        "この例の左図にはU字形が現れます。点をランダムな雲に見せるために軸を狭めたり、平滑線を省いたりしません。右図の逸脱だけを直すためにyを変換すると、平均構造の曲線を見落とすことがあります。まず各図が別の仮定を診断していると理解します。",
        "正規性検定は大標本で実質的に小さな逸脱まで検出し、小標本では重要な逸脱を見逃し得ます。Q–Q図、残差の大きさ、推論方法の頑健性を一緒に評価します。",
      ],
    },
    {
      t: "一つの正規性p値から処方箋を決めない",
      b: [
        "同じxとほぼ同じ直線傾きを使い、①正規・等分散、②重い裾、③曲線の見落とし、④分散不均一という4世界を作ります。各世界へ同じ `y ~ x` を当て、Shapiro–Wilkのp値、残差とx²の相関、絶対残差と|x|の相関、x²を追加したR²増分を並べます。検定p値は残差分布からの逸脱を要約しますが、その原因や処方箋までは識別しません。",
      ],
      code: `using HypothesisTests

rng = Xoshiro(3006)
n_diag = 240
x_diag = collect(range(-2, 2; length = n_diag))
x2_diag = x_diag .^ 2

outcomes = (
    normal = 1 .+ 2 .* x_diag .+ rand(rng, Normal(), n_diag),
    heavy = 1 .+ 2 .* x_diag .+
            rand(rng, TDist(3), n_diag) ./ sqrt(3),
    curve = 1 .+ 2 .* x_diag .+ 1.2 .* x2_diag .+
            rand(rng, Normal(), n_diag),
    hetero = 1 .+ 2 .* x_diag .+
             randn(rng, n_diag) .* (0.4 .+ 0.8 .* abs.(x_diag)),
)

for name in keys(outcomes)
    df = DataFrame(x = x_diag, x2 = x2_diag, y = outcomes[name])
    linear = lm(@formula(y ~ x), df)
    quadratic = lm(@formula(y ~ x + x2), df)
    res = residuals(linear)
    println((
        name = name,
        shapiro_p = round(pvalue(ShapiroWilkTest(res)); sigdigits = 4),
        curve_signal = round(cor(res, x2_diag); digits = 3),
        spread_signal = round(cor(abs.(res), abs.(x_diag)); digits = 3),
        quadratic_gain = round(r2(quadratic) - r2(linear); digits = 3),
    ))
end`,
      out: `(name = :normal, shapiro_p = 0.247, curve_signal = -0.094, spread_signal = 0.086, quadratic_gain = 0.001)
(name = :heavy, shapiro_p = 4.646e-15, curve_signal = 0.117, spread_signal = 0.127, quadratic_gain = 0.002)
(name = :curve, shapiro_p = 0.05504, curve_signal = 0.822, spread_signal = 0.183, quadratic_gain = 0.269)
(name = :hetero, shapiro_p = 0.009004, curve_signal = 0.043, spread_signal = 0.434, quadratic_gain = 0.0)`,
      a: [
        "重い裾ではp値が約4.6×10⁻¹⁵でも、二次項によるR²増分は0.002だけです。非線形化は原因へ対応していません。反対に曲線世界ではp=.055と5%基準を超えていますが、残差とx²の相関は0.822、二次項のR²増分は0.269です。『正規性検定が非有意だから直線でよい』とも言えません。",
        "分散不均一世界では絶対残差と|x|の相関が0.434で、二次項を足してもR²はほぼ増えません。ここでは平均の曲線より分散の変化を疑います。数値の閾値で自動分類せず、残差図、デザイン、応答尺度、係数と区間の感度を合わせて判断します。",
      ],
    },
    {
      t: "漏斗形なら、平均構造と標準誤差を分けて考える",
      b: [
        "xが大きいほど誤差SDが増えるデータを作ります。平均式が正しければOLS係数は条件付き平均を推定できますが、通常の等分散SEは不適切になり得ます。HC3は各観測の残差をレバレッジで補正して、分散不均一に頑健なサンドイッチ共分散を作る方法です。",
      ],
      code: `using LinearAlgebra

function hc3_vcov(model)
    X = modelmatrix(model)
    e = residuals(model)
    bread = inv(Symmetric(X' * X))
    h = vec(sum((X * bread) .* X, dims = 2))
    adjusted_e = e ./ (1 .- h)
    meat = X' * Diagonal(adjusted_e .^ 2) * X
    return bread * meat * bread
end

rng = Xoshiro(3002)
x_h = rand(rng, Uniform(0, 4), 220)
sigma = 0.4 .+ 0.8 .* x_h
y_h = 1 .+ 1.5 .* x_h .+ randn(rng, 220) .* sigma
m_h = lm(@formula(y ~ x), DataFrame(x = x_h, y = y_h))

classical_se = stderror(m_h)
hc3_se = sqrt.(diag(hc3_vcov(m_h)))
println(round.(coef(m_h), digits = 3))
println(round.(classical_se, digits = 3))
println(round.(hc3_se, digits = 3))
println(round(cor(abs.(residuals(m_h)), fitted(m_h)), digits = 3))`,
      out: `[1.057, 1.359]
[0.301, 0.129]
[0.214, 0.152]
0.534`,
      a: [
        "絶対残差と予測値の相関は0.534で、散らばりが増える漏斗形です。傾きSEは通常法0.129からHC3で0.152へ広がりました。切片SEは逆に小さくなっており、ロバストSEが常に全係数を大きくするわけではありません。",
        "ここでは式を見せるため `inv(X'X)` を使いましたが、実務の数値計算では直接逆行列よりQR分解や線形方程式のsolve、検証済みの頑健共分散実装を優先します。HC3が直すのはこの独立観測下の分散不均一に対する共分散推定です。曲線、欠落変数、測定誤差、参加者内依存、外挿は直しません。",
      ],
    },
    {
      t: "外れ値・レバレッジ・影響力を分ける",
      b: [
        "外れ値はy方向の残差が大きい点、レバレッジは説明変数空間で中心から遠い点、影響点はその観測を動かすと係数や予測が大きく変わる点です。Cook距離は `Dᵢ = eᵢ²/(p·MSE) × hᵢ/(1-hᵢ)²` と残差・レバレッジを組み合わせます。GLMでは線形モデルに `cooksdistance` が用意されています。",
      ],
      code: `rng = Xoshiro(3003)
x_i = rand(rng, Normal(), 80)
y_i = 1 .+ 2 .* x_i .+ rand(rng, Normal(0, 0.5), 80)
df_i = DataFrame(x = vcat(x_i, 5.5), y = vcat(y_i, -5.0))

m_all = lm(@formula(y ~ x), df_i)
m_regular = lm(@formula(y ~ x), df_i[1:80, :])
X = modelmatrix(m_all)
bread = inv(Symmetric(X' * X))
leverage = vec(sum((X * bread) .* X, dims = 2))
cook = cooksdistance(m_all)
index = argmax(cook)

println(index)
println(round.([leverage[index], cook[index], 4 / nrow(df_i)],
               digits = 3))
println(round.([coef(m_all)[2], coef(m_regular)[2]], digits = 3))`,
      out: `81
[0.289, 14.728, 0.049]
[1.166, 2.047]`,
      a: [
        "81番目はレバレッジ0.289、Cook距離14.728で、傾きを2.047から1.166へ動かしました。`4/n=0.049`は探索用の目安であり、超えた点を自動削除する規則ではありません。",
        "入力ミスなら訂正し、正当な観測なら対象集団と生成過程を問い直します。全データの結果と、事前に正当化した感度分析を並べます。『有意になるまで影響点を消す』操作は研究者自由度を増やします。",
      ],
    },
    {
      t: "VIFは、ある説明変数を他の説明変数で予測して作る",
      b: [
        "説明変数jを残りの説明変数で回帰し、そのR²を `Rⱼ²` とすると、`VIFⱼ = 1 / (1 - Rⱼ²)` です。他の変数からほぼ再現できるほど、j固有の変化が少なくなり、その個別係数の分散が膨らみます。yはVIFの計算に使いません。",
      ],
      code: `rng = Xoshiro(3004)
x1 = randn(rng, 240)
x2 = 0.98 .* x1 .+ 0.2 .* randn(rng, 240)
x3 = randn(rng, 240)
y_v = 1 .+ x1 .+ x2 .+ 0.5 .* x3 .+
      rand(rng, Normal(0, 0.7), 240)
df_v = DataFrame(x1 = x1, x2 = x2, x3 = x3, y = y_v)

aux_x1 = lm(@formula(x1 ~ x2 + x3), df_v)
aux_x2 = lm(@formula(x2 ~ x1 + x3), df_v)
aux_x3 = lm(@formula(x3 ~ x1 + x2), df_v)
vif = collect(1 ./ (1 .- r2.((aux_x1, aux_x2, aux_x3))))
m_v = lm(@formula(y ~ x1 + x2 + x3), df_v)

println(round(cor(x1, x2), digits = 3))
println(round.(vif, digits = 2))
println(round.(coef(m_v), digits = 3))
println(round.(stderror(m_v), digits = 3))`,
      out: `0.978
[23.2, 23.2, 1.0]
[1.046, 0.896, 1.117, 0.454]
[0.047, 0.232, 0.226, 0.05]`,
      a: [
        "x1とx2の相関は0.978で、VIFはともに約23.2です。個別係数のSEは0.232、0.226まで膨らみましたが、係数はバイアスを受けると決まったわけではありません。問題は、この標本がx1だけ、x2だけの変化をほとんど持たないことです。",
        "VIF=5や10は警告の慣習的目安にすぎません。標本サイズ、必要な精度、係数の用途で影響は変わります。低いVIFも、非線形性、交絡、影響点、分散不均一、測定妥当性を保証しません。",
      ],
    },
    {
      t: "高VIFでも、研究上必要な組合せは安定することがある",
      b: [
        "x1とx2を別々に操作できないデータでも、2つが一緒に増える方向は豊富に観測されています。したがって個別係数は不精確でも、`β₁ + β₂`のような線形結合や予測は精確な場合があります。VIFだけを見て片方を機械的に削除すると、科学的な意味や交絡調整を壊すことがあります。",
      ],
      code: `L_sum = [0.0, 1.0, 1.0, 0.0]
sum_estimate = dot(L_sum, coef(m_v))
sum_se = sqrt(dot(L_sum, vcov(m_v) * L_sum))

println(round(sum_estimate, digits = 3))
println(round(sum_se, digits = 3))
println(round(r2(m_v), digits = 3))`,
      out: `2.013
0.048
0.887`,
      a: [
        "個別係数SEが約0.23でも、合計効果は2.013、SEは0.048でした。予測R²も0.887です。『高VIFだからモデル全体が使えない』ではなく、どの係数または線形結合を解釈したいかを先に決めます。",
        "カテゴリ因子はk−1列で表されるため、各ダミー列の通常VIFは参照水準とコントラストに依存します。因子全体ならネストモデルのブロック比較や、多自由度を考慮するGVIFなどを検討し、最大の列VIFだけで因子を削除しません。",
      ],
    },
    {
      t: "中心化は交互作用の座標を変えるが、真の重複は消さない",
      b: [
        "平均が0でないageとstressの積を入れると、主効果列と積列の間に『非本質的』な共線性が生まれます。両方を中心化してから積を作れば、平均付近をゼロ点にし、主効果を平均的な相手変数での効果として読めます。完全な階層モデルなら予測面は同じです。",
      ],
      code: `rng = Xoshiro(3005)
age = rand(rng, Normal(50, 8), 220)
stress = rand(rng, Normal(30, 5), 220)
y_c = 10 .+ 0.2 .* age .- 0.3 .* stress .+
      0.05 .* age .* stress .+ rand(rng, Normal(0, 4), 220)
df_c = DataFrame(age = age, stress = stress, y = y_c)
df_c.age_stress = df_c.age .* df_c.stress
df_c.age_c = df_c.age .- mean(df_c.age)
df_c.stress_c = df_c.stress .- mean(df_c.stress)
df_c.agec_stressc = df_c.age_c .* df_c.stress_c

m_raw = lm(@formula(y ~ age + stress + age_stress), df_c)
m_center = lm(@formula(y ~ age_c + stress_c + agec_stressc), df_c)
column_vif(model) = diag(inv(cor(modelmatrix(model)[:, 2:end])))

println(round.(column_vif(m_raw), digits = 2))
println(round.(column_vif(m_center), digits = 2))
println(maximum(abs.(predict(m_raw) .- predict(m_center))))`,
      out: `[35.75, 36.41, 68.96]
[1.0, 1.0, 1.0]
3.666400516522117e-12`,
      a: [
        "中心化で列VIFは大きく下がりましたが、予測値の最大差は約3.7×10⁻¹²だけです。交互作用係数も同じで、切片と主効果の意味が変わりました。これは問題を隠したのではなく、同じモデルを解釈しやすい座標へ移した結果です。",
        "一方、ほぼ同じ構成概念を測るx1とx2のような重複は、平均を引いても相関が残ります。中心化・標準化は単位やゼロ点を変えますが、説明変数に新しい独立情報を作りません。",
      ],
    },
    {
      t: "条件数は、設計行列が誤差を増幅しやすい方向を測る",
      b: [
        "設計行列Xの2ノルム条件数 `cond(X)` は、最大特異値を最小特異値で割った量です。大きいほど、入力や丸めの小さな変化が係数解へ増幅され得ます。ただし条件数は列の単位、原点、切片を含めるかで変わるため、VIFと同じ固定閾値で判定しません。",
        "次の例には説明変数が1本しかないので、他の説明変数との重複を表すVIFは1です。それでも時刻のゼロ点が観測範囲から遠いため、生の切片列と時刻列を含むXは数値的に悪条件です。中心化・標準化した同じモデル空間と比較します。",
      ],
      code: `using LinearAlgebra, Statistics

n_condition = 200
timestamp = collect(range(1_000_000.0, 1_000_001.0;
                          length = n_condition))
timestamp_c = timestamp .- mean(timestamp)
timestamp_z = timestamp_c ./ std(timestamp_c)
y_condition = 5 .+ 3 .* timestamp_c .+
    0.01 .* sin.(range(0, 8pi; length = n_condition))

X_raw = hcat(ones(n_condition), timestamp)
X_centered = hcat(ones(n_condition), timestamp_c)
X_standardized = hcat(ones(n_condition), timestamp_z)
beta_raw = X_raw \\ y_condition
beta_centered = X_centered \\ y_condition
beta_standardized = X_standardized \\ y_condition

println(round.([cond(X_raw), cond(X_centered), cond(X_standardized)];
               sigdigits = 4))
println(round.(beta_raw, digits = 3))
println(round.(beta_centered, digits = 3))
println(round.(beta_standardized, digits = 3))
println(maximum(abs.(X_raw * beta_raw -
                     X_centered * beta_centered)))`,
      out: `[3.447e12, 3.447, 1.003]
[-2.995299247e6, 2.995]
[5.0, 2.995]
[5.0, 0.871]
1.4812044923928624e-9`,
      a: [
        "中心化で条件数は約3.4兆から3.447へ下がりましたが、傾き2.995と観測範囲内の予測は変わりません。生の切片−2,995,299はtimestamp=0という観測範囲外での外挿です。条件数の大きさだけで説明変数を削除せず、どの座標系のどの行列を測ったかを記録します。",
        "標準化後の傾き0.871は、timestampが1 SD増えたときの変化です。係数の単位は変わりますが予測面は同じです。中心化・標準化はこの種の数値スケールを改善しますが、ほぼ同じ2変数から独立情報を作ることはできません。",
      ],
    },
    {
      t: "VIFと条件数は、違う問いへ答える",
      b: [
        "VIFは各説明変数を残りの説明変数で回帰したR²から作り、個別係数の統計的分散膨張を列ごとに要約します。数値変数の平行移動や非ゼロ定数倍では相関が変わらないため、主効果だけならVIFもほぼ変わりません。",
        "条件数は行列全体の特異値比で、列を1000倍すれば大きく変わります。比較するときは、切片をどう扱ったか、連続列を中心化・標準化したか、カテゴリのコントラストは何かを固定します。標準化後も大きいなら、単位だけでなく列空間の実質的な重複を疑います。",
      ],
      code: `x1_condition = collect(range(-1, 1; length = 200))
x2_condition = x1_condition .+
    1e-3 .* sin.(range(0, 6pi; length = 200))
standardize(x) = (x .- mean(x)) ./ std(x)

r_original = cor(x1_condition, x2_condition)
r_rescaled = cor(1000 .* x1_condition, x2_condition)
vif_original = 1 / (1 - r_original^2)
vif_rescaled = 1 / (1 - r_rescaled^2)

X_original = hcat(ones(200), x1_condition, x2_condition)
X_rescaled = hcat(ones(200), 1000 .* x1_condition, x2_condition)
X_z = hcat(ones(200), standardize(x1_condition),
           standardize(x2_condition))

println(round.([vif_original, vif_rescaled], digits = 2))
println(round.([cond(X_original), cond(X_rescaled), cond(X_z)];
               sigdigits = 4))`,
      out: `[724461.81, 724461.81]
[2075.0, 851400.0, 1702.0]`,
      a: [
        "x1を1000倍してもVIFは約724,462のままですが、条件数は約2,075から851,400へ変わりました。標準化後の条件数も約1,702なので、単位を揃えた後にもx1とx2の重複が残っています。",
        "VIFも条件数もyを使わない設計行列の診断です。高い値は交絡、因果バイアス、平均の非線形性を直接示しません。逆に低い値もそれらを否定しません。推定したい係数・線形結合・予測と結びつけて解釈します。",
      ],
    },
    {
      t: "正規方程式は条件数を二乗する: QR・SVDで解く",
      b: [
        "最小二乗係数を数式どおり `β = (X'X)⁻¹X'y` と計算すると、X'Xの条件数は概ねXの条件数の二乗になります。直接 `inv(X'X)` を作る方法は、丸め誤差と計算量の両面で不利です。",
        "Juliaの長方形行列に対する `X \\ y` は適切な行列分解を使って最小二乗問題を直接解きます。この例ではQR系の解と、X'Xを作った正規方程式の解を比較します。式を短く書くためではなく、悪条件をさらに悪化させないためのAPI選択です。",
      ],
      code: `n_near = 200
x1_near = collect(range(-1, 1; length = n_near))
x2_near = x1_near .+
    1e-7 .* sin.(range(0, 6pi; length = n_near))
X_near = hcat(ones(n_near), x1_near, x2_near)
y_near = 1 .+ 2 .* x1_near .- 2 .* x2_near .+
    0.01 .* cos.(range(0, 4pi; length = n_near))

beta_qr = X_near \\ y_near
beta_normal_equation = (X_near' * X_near) \\
                       (X_near' * y_near)

println(round.([cond(X_near), cond(X_near' * X_near)];
               sigdigits = 4))
println(round.(beta_qr, digits = 6))
println(round.(beta_normal_equation, digits = 6))
println(maximum(abs.(beta_qr - beta_normal_equation)))`,
      out: `[2.075e7, 4.315e14]
[1.00005, 1.999994, -1.999994]
[1.00005, 1.983556, -1.983556]
0.01643806878237042`,
      a: [
        "Xの条件数約2.1×10⁷に対し、X'Xは約4.3×10¹⁴です。正規方程式の2つの傾きはQR系の解から約0.016ずれました。残差平方和が似ていても、個別係数の下位桁は信用できません。",
        "QRやSVDは数値的な余計な損失を抑えますが、観測デザインにx1だけ、x2だけの変化がないという統計的識別問題は直しません。高精度型へ替えて計算を正確にしても、データにない情報は復元できません。",
      ],
    },
    {
      t: "係数の感度と予測の感度を別々に測る",
      b: [
        "悪条件では、ほとんど同じ予測を作る多数の係数组合せが存在します。次の例ではyを最大約10⁻⁶だけ動かすと、2つの個別係数は約0.426動きますが、予測値の最大変化は約2×10⁻⁷です。『予測できる』と『各係数を解釈できる』は同じではありません。",
      ],
      code: `y_perturbed = y_near .+
    1e-6 .* sin.(range(0, 10pi; length = n_near))
beta_perturbed = X_near \\ y_perturbed

response_change = maximum(abs.(y_perturbed - y_near))
coefficient_change = maximum(abs.(beta_perturbed - beta_qr))
prediction_change = maximum(abs.(
    X_near * beta_perturbed - X_near * beta_qr))

println(round.(beta_qr, digits = 6))
println(round.(beta_perturbed, digits = 6))
println(round.([response_change, coefficient_change, prediction_change];
               sigdigits = 4))`,
      out: `[1.00005, 1.999994, -1.999994]
[1.00005, 2.426446, -2.426446]
[1.0e-6, 0.4265, 2.011e-7]`,
      a: [
        "対処は目的から選びます。個別因果効果が必要なら、x1とx2を独立に動かす研究デザインや追加データが本筋です。理論的な合成得点、事前に定めた線形結合、次元削減、正則化は候補ですが、それぞれ推定対象やバイアスを変えるため感度分析として明示します。",
        "完全または数値的なrank deficiencyでソフトウェアが列をdropしても、残った列が『真に重要』なのではありません。列順やコントラストで代表が変わり得ます。中心化・尺度調整、特異値、VIF、係数共分散、摂動後の係数と予測をまとめて報告し、単一閾値で自動削除しません。",
      ],
    },
    {
      t: "完全ランク落ちでは、係数そのものが一意でない",
      b: [
        "x3 = x1 + x2なら、切片を含む設計行列Xは4列あってもrank 3です。`X * v = 0`となる非ゼロベクトルvが存在し、ある解βに任意のcについて `β + c v` を足しても予測は変わりません。これは丸め誤差ではなく、データと符号化から個別係数を識別できない問題です。",
        "`X \\ y`はこの場合にも残差を最小化する解を返せますが、その係数を唯一の科学的答えとは読めません。Juliaでは `rank(X)`、`svdvals(X)`、`nullspace(X)`で列空間と零空間を直接調べられます。rank判定は数値許容誤差にも依存するため、最小特異値と列の構成も併記します。",
      ],
      code: `n_rank = 60
x1_rank = collect(range(-1, 1; length = n_rank))
x2_rank = sin.(range(0, 2pi; length = n_rank))
x3_rank = x1_rank .+ x2_rank
X_rank = hcat(ones(n_rank), x1_rank, x2_rank, x3_rank)
y_rank = 2 .+ 3 .* x1_rank .- x2_rank .+
    0.05 .* cos.(range(0, 4pi; length = n_rank))

beta_minimum_norm = X_rank \\ y_rank
null_direction = [0.0, -1, -1, 1]
beta_alternative = beta_minimum_norm .+ 10 .* null_direction

println(rank(X_rank))
println(round.(svdvals(X_rank); sigdigits = 5))
println(round.(beta_minimum_norm; digits = 6))
println(round.(beta_alternative; digits = 6))
println(maximum(abs.(X_rank * beta_minimum_norm -
                     X_rank * beta_alternative)))`,
      out: `3
[7.746, 6.7831, 4.1012, 7.1221e-16]
[2.000833, 2.333333, -1.666667, 0.666667]
[2.000833, -7.666667, -11.666667, 10.666667]
1.7763568394002505e-15`,
      a: [
        "係数は大きく違うのに予測差は約1.8×10⁻¹⁵です。識別できるのはx1方向の合計 `β₁ + β₃ = 3` とx2方向の合計 `β₂ + β₃ = -1`であり、3本それぞれの寄与ではありません。列をdropした結果も、この同じ予測面の一つの座標表示です。",
        "完全ランク落ちは、カテゴリ因子の全水準ダミーと切片、合計得点と全下位尺度、固定効果の過剰な組合せなどでも起きます。まず冗長な符号化を直します。科学的に別々の効果が必要なのにデータが分離していないなら、再符号化ではなく研究デザインまたは追加情報が必要です。",
      ],
    },
    {
      t: "リッジは一意な予測則を作るが、失われた識別情報は戻さない",
      b: [
        "リッジ回帰は残差平方和に `λ Σβⱼ²` を加えます。λ>0なら、完全ランク落ちでも罰則を含む目的関数に一意の最小解を作れます。次のPは切片だけを罰しません。通常は連続説明変数を標準化し、単位の大きな列だけが過度に縮まないようにします。",
        "これは分散を下げる代わりにバイアスを導入する予測上の選択です。リッジ係数が個別因果効果を識別したわけではなく、同じように予測する解の中からL2ノルムの小さいものを好んだだけです。λ、標準化、切片の罰則、列の符号化を変えれば係数も変わります。",
      ],
      code: `lambda_rank = 1.0
penalty_rank = Diagonal([0.0, 1, 1, 1])
beta_ridge_rank =
    (X_rank' * X_rank + lambda_rank * penalty_rank) \\
    (X_rank' * y_rank)

println(round.(beta_ridge_rank; digits = 6))
println(round.([
    norm(beta_minimum_norm[2:end]),
    norm(beta_ridge_rank[2:end]),
    mean((y_rank - X_rank * beta_minimum_norm) .^ 2),
    mean((y_rank - X_rank * beta_ridge_rank) .^ 2),
]; digits = 6))`,
      out: `[2.000833, 2.251992, -1.64208, 0.609912]
[2.94392, 2.853049, 0.00127, 0.005573]`,
      a: [
        "傾きのL2ノルムは2.944から2.853へ縮み、訓練MSEは0.00127から0.005573へ増えました。訓練誤差が悪化したこと自体は失敗ではありません。未知データでの誤差を下げるため、訓練データへの適合を少し譲るのが正則化です。",
        "この式は仕組みを見せる教材用です。`inv`は作らず線形方程式として解いていますが、大規模・疎行列・多くのλを扱う実務では専用実装を使います。パッケージごとに目的関数をnで割るか、λをn倍するかが異なるため、同じ数値のλをそのまま比較しません。",
      ],
    },
    {
      t: "λは訓練内で選び、最後のテスト標本は一度だけ使う",
      b: [
        "λ=0を含む候補を5-fold交差検証で比較します。最初に70件を訓練・選択用、30件を最終テスト用へ分けます。各foldの平均とSDはそのfoldの訓練行だけから求め、検証行へ適用します。全データで先に標準化すると、検証側の情報が訓練へ漏れます。",
        "この例は仕組みを見せるためfoldを明示的に回します。`fit_ridge`はλ=0だけ `A \\ y`、λ>0では切片を罰しないリッジ方程式を使います。テストMSEはλ選択に使わず、選択後の性能確認に一度だけ開きます。",
      ],
      code: `rng_cv = Xoshiro(3011)
n_cv, p_cv = 100, 40
latent_cv = randn(rng_cv, n_cv)
X_cv = hcat([latent_cv .+ 0.15 .* randn(rng_cv, n_cv)
             for _ in 1:p_cv]...)
y_cv = 1 .+ 3 .* latent_cv .+ 1.5 .* randn(rng_cv, n_cv)
order_cv = randperm(rng_cv, n_cv)
train_rows, test_rows = order_cv[1:70], order_cv[71:end]
X_train, y_train = X_cv[train_rows, :], y_cv[train_rows]
X_test, y_test = X_cv[test_rows, :], y_cv[test_rows]

function fit_ridge(X, y, lambda)
    mu = vec(mean(X; dims = 1))
    sigma = vec(std(X; dims = 1))
    Z = (X .- mu') ./ sigma'
    A = hcat(ones(size(Z, 1)), Z)
    P = Diagonal(vcat(0.0, ones(size(Z, 2))))
    beta = lambda == 0 ? A \\ y :
        (A' * A + lambda * P) \\ (A' * y)
    return (; beta, mu, sigma)
end

predict_ridge(fit, X) =
    hcat(ones(size(X, 1)),
         (X .- fit.mu') ./ fit.sigma') * fit.beta

lambda_grid = [0.0, 0.1, 1.0, 10.0, 100.0, 1000.0]
fold_id = repeat(1:5; inner = 14)
cv_mse = [mean([
    let
        validation = findall(==(fold), fold_id)
        training = findall(!=(fold), fold_id)
        fit = fit_ridge(X_train[training, :], y_train[training], lambda)
        mean((y_train[validation] -
              predict_ridge(fit, X_train[validation, :])) .^ 2)
    end for fold in 1:5
]) for lambda in lambda_grid]

selected_lambda = lambda_grid[argmin(cv_mse)]
ols_fit = fit_ridge(X_train, y_train, 0.0)
ridge_fit = fit_ridge(X_train, y_train, selected_lambda)
test_mse = [
    mean((y_test - predict_ridge(ols_fit, X_test)) .^ 2),
    mean((y_test - predict_ridge(ridge_fit, X_test)) .^ 2),
]

println(round.(cv_mse; digits = 3))
println(selected_lambda)
println(round.(test_mse; digits = 3))
println(round.([norm(ols_fit.beta[2:end]),
                norm(ridge_fit.beta[2:end])]; digits = 3))`,
      out: `[10.55, 6.108, 3.886, 3.054, 2.918, 3.734]
100.0
[10.204, 2.514]
[18.195, 0.474]`,
      a: [
        "訓練内CVはλ=100を選び、未使用テストMSEはOLSの10.204から2.514へ下がりました。傾きベクトルのノルムも18.195から0.474へ縮みました。これはこの固定したシミュレーションでの結果であり、リッジが常にOLSを上回る証明ではありません。",
        "λ=100が候補の端ではなく、両隣よりCV誤差が小さいことも確認します。グリッド端が最良なら探索範囲を広げます。最小値付近が平坦なら、fold間の不確実性や、より単純で強く縮小する候補を選ぶ1-SE規則も検討します。",
      ],
    },
    {
      t: "交差検証の分割は、将来の利用場面を模倣する",
      b: [
        "ランダムk-foldが妥当なのは、行が交換可能で、新しい独立な行への予測を評価したいときです。同じ参加者・学校・施設の行はgroup単位で分け、未来予測なら過去で訓練して未来で検証します。系列やclusterをまたいでランダム分割すると、近縁な情報が両側へ入り性能を過大評価します。",
        "欠測補完、標準化、特徴選択、PCA、カテゴリ符号化もfold内で学習します。λを選んだ同じCV値を最終性能として強く解釈せず、独立テスト集合または外側CVで評価します。小標本では分割による揺れも大きいため、反復・nested CVやbootstrapを目的に応じて使います。",
        "Juliaでは、行列演算を学ぶ段階では上の手実装が透明です。実務では `MLJLinearModels.RidgeRegressor`などのモデルと、MLJのpipeline・tuning・resamplingを組み合わせられます。ただしライブラリを使っても、分割単位、評価指標、λ範囲、前処理の漏洩は分析者が設計します。正則化後の係数へ通常のOLSのSE・p値をそのまま付けることもできません。",
      ],
    },
    {
      t: "Lassoのゼロ係数は、真の不要変数という判定ではない",
      b: [
        "Elastic Netは標準化後の係数βについて、`RSS/(2n) + λ[αΣ|βⱼ| + (1-α)Σβⱼ²/2]`を最小化します。α=1がLasso、α=0がリッジです。L1罰則のsoft-thresholdingは係数をちょうど0にできますが、0は指定したλ・尺度・符号化・標本における最適化結果です。母集団効果が厳密に0だと証明したわけではありません。",
        "以下は座標降下法を学習用に実装します。各列を標準化し、切片は罰しません。実務では収束判定、疎行列、λ経路、warm startを備えた専用実装を使いますが、目的関数のλ・α・nによるスケーリング規約を必ず確認します。",
      ],
      code: `soft_threshold(z, gamma) =
    sign(z) * max(abs(z) - gamma, 0.0)

function elastic_net_fit(X, y, lambda, alpha;
                         maxiter = 50_000, tol = 1e-8)
    mu = vec(mean(X; dims = 1))
    sigma = vec(std(X; dims = 1))
    Z = (X .- mu') ./ sigma'
    y_centered = y .- mean(y)
    beta_z = zeros(size(X, 2))
    residual = copy(y_centered)
    column_scale = vec(sum(abs2, Z; dims = 1)) ./ size(X, 1)
    converged = false
    iterations = maxiter

    for iteration in 1:maxiter
        maximum_change = 0.0
        for j in eachindex(beta_z)
            old_beta = beta_z[j]
            residual .+= Z[:, j] .* old_beta
            score = dot(Z[:, j], residual) / size(X, 1)
            beta_z[j] = soft_threshold(score, lambda * alpha) /
                (column_scale[j] + lambda * (1 - alpha))
            residual .-= Z[:, j] .* beta_z[j]
            maximum_change = max(
                maximum_change, abs(beta_z[j] - old_beta))
        end
        if maximum_change < tol
            converged = true
            iterations = iteration
            break
        end
    end
    converged || error("coordinate descent did not converge")
    beta = beta_z ./ sigma
    intercept = mean(y) - dot(mu, beta)
    return (; intercept, beta, beta_z, mu, sigma, iterations)
end

rng_penalty = Xoshiro(3012)
n_penalty = 120
latent_penalty = randn(rng_penalty, n_penalty)
X_penalty = hcat(
    latent_penalty .+ 0.03 .* randn(rng_penalty, n_penalty),
    latent_penalty .+ 0.03 .* randn(rng_penalty, n_penalty),
    randn(rng_penalty, n_penalty),
    randn(rng_penalty, n_penalty),
)
y_penalty = 2 .+ 2 .* latent_penalty .+
    0.4 .* X_penalty[:, 3] .+ randn(rng_penalty, n_penalty)

lasso_fit = elastic_net_fit(X_penalty, y_penalty, 0.2, 1.0)
enet_fit = elastic_net_fit(X_penalty, y_penalty, 0.2, 0.8)
println(round.(lasso_fit.beta_z; digits = 3))
println(round.(enet_fit.beta_z; digits = 3))`,
      out: `[0.0, 1.485, 0.185, 0.0]
[0.725, 0.77, 0.217, 0.0]`,
      a: [
        "Lassoはほぼ同じ情報を持つ1列目を0、2列目を1.485にしました。Elastic NetはL2成分により両方を0.725、0.770として残しました。どちらも潜在変数の効果をx1とx2へ科学的に分解したわけではありません。予測則を作るため、異なる規準で代表または組を選んでいます。",
        "標準化しなければ、測定単位を1000倍した列は同じ予測寄与を小さな係数で表せるため、L1罰則が相対的に軽くなります。カテゴリ因子のダミーを個別罰則に入れると水準単位で選ばれ、参照水準・コントラストにも依存します。因子全体や階層的交互作用を選びたい場合はgroup penaltyや階層制約など、推定単位に合う方法が必要です。",
      ],
    },
    {
      t: "選択頻度を見れば、一本のLasso解の脆さが見える",
      b: [
        "同じλで100個のbootstrap標本を作り、各係数が非ゼロになった回数を数えます。これは正式な信頼確率ではなく、観測標本を少し変えたときに選択集合がどれだけ揺れるかを見る感度分析です。選択回数の閾値を後から調整して、望む変数だけを残してはいけません。",
      ],
      code: `selection_count_lasso = zeros(Int, 4)
selection_count_enet = zeros(Int, 4)
rng_bootstrap = Xoshiro(3013)

for _ in 1:100
    rows = rand(rng_bootstrap, 1:n_penalty, n_penalty)
    bootstrap_X = X_penalty[rows, :]
    bootstrap_y = y_penalty[rows]
    bootstrap_lasso =
        elastic_net_fit(bootstrap_X, bootstrap_y, 0.2, 1.0)
    bootstrap_enet =
        elastic_net_fit(bootstrap_X, bootstrap_y, 0.2, 0.8)
    selection_count_lasso .+= abs.(bootstrap_lasso.beta_z) .> 1e-6
    selection_count_enet .+= abs.(bootstrap_enet.beta_z) .> 1e-6
end

println(selection_count_lasso)
println(selection_count_enet)`,
      out: `[49, 80, 99, 20]
[100, 100, 100, 29]`,
      a: [
        "相関したx1とx2は、Lassoでは100回中49回と80回だけ選ばれました。両方が選ばれる標本も、片方だけの標本もあります。Elastic Netでは両方が100回選ばれ、grouping傾向が見えますが、真に係数0のx4も29回残りました。Elastic Netも真偽判定器ではありません。",
        "選択安定性、予測誤差、係数バイアスは別の評価軸です。安定して誤った変数を選ぶことも、不安定でも予測平均が安定することもあります。データ生成上必要な交絡変数を、選択頻度や予測寄与だけで除外しません。",
      ],
    },
    {
      t: "選んだデータで通常のp値を計算すると、二重使用になる",
      b: [
        "真の効果がすべて0の20変数から、yとの相関p値が最小の1本を選びます。その同じデータで選ばれたp値を5%基準へかける方法と、前半40件で選択して後半40件だけで検定する方法を2000回比較します。単回帰の傾きt検定は相関t検定と同値なので、これは典型的な選択後推論の反例です。",
      ],
      code: `function correlation_pvalue(x, y)
    r = cor(x, y)
    t = r * sqrt((length(x) - 2) / (1 - r^2))
    return 2 * ccdf(TDist(length(x) - 2), abs(t))
end

post_selection = let
    rng = Xoshiro(3014)
    repetitions, n, p = 2000, 80, 20
    same_data_rejections = 0
    split_data_rejections = 0
    same_data_p = Float64[]
    split_data_p = Float64[]

    for _ in 1:repetitions
        X = randn(rng, n, p)
        y = randn(rng, n)

        all_p = [correlation_pvalue(X[:, j], y) for j in 1:p]
        chosen_same = argmin(all_p)
        p_same = correlation_pvalue(X[:, chosen_same], y)

        selection_p = [correlation_pvalue(X[1:40, j], y[1:40])
                       for j in 1:p]
        chosen_split = argmin(selection_p)
        p_split = correlation_pvalue(
            X[41:80, chosen_split], y[41:80])

        same_data_rejections += p_same < 0.05
        split_data_rejections += p_split < 0.05
        push!(same_data_p, p_same)
        push!(split_data_p, p_split)
    end
    (;
        rejection_rates = [same_data_rejections,
                           split_data_rejections] ./ repetitions,
        median_p = [median(same_data_p), median(split_data_p)],
    )
end

println(post_selection.rejection_rates)
println(round.(post_selection.median_p; digits = 3))`,
      out: `[0.6425, 0.0545]
[0.035, 0.483]`,
      a: [
        "すべて帰無なのに、同じデータで最良変数を選んだ方法は64.25%を『有意』としました。通常のp値は、変数が事前に固定されていたという選択を無視しています。独立な後半で検定した方法は5.45%でしたが、標本を半分にするため検出力を失います。",
        "Lassoで選んだ変数だけを同じデータへOLS再適合しても、この問題は自動では消えません。選択を含む全手順を外側resamplingで評価し、確認的推論が目的なら事前指定、独立確認標本、sample splitting、選択後推論などを検討します。どの母数への保証か、仮定とともに明記します。",
      ],
    },
    {
      t: "正則化の結果は、予測・探索・説明の目的別に報告する",
      b: [
        "予測目的なら、前処理とλ・α選択を含むpipeline全体をnested CVまたは独立テストで評価し、平均損失だけでなくfold間の分布、基準モデルとの差、予測対象範囲を示します。選ばれた変数一覧を、予測性能の根拠以上の因果説明へ昇格させません。",
        "探索目的なら、λ経路、相関構造、bootstrap選択頻度、LassoとElastic Netでの差を開示します。係数0を『効果なし』、非ゼロを『重要』と断定せず、次の独立研究で確認する候補と位置づけます。推論目的なら推定対象を先に定め、交絡調整変数を予測選択へ委ねません。",
        "Juliaの実務実装では `MLJLinearModels.LassoRegressor`、`ElasticNetRegressor`とMLJのtuning・resamplingを利用できます。手実装とパッケージのλが一致しないときは、バグと決めつける前に、損失を2nで割るか、罰則をn倍するか、切片を罰するか、標準化をどこで行うかを比較します。",
      ],
    },
    {
      t: "最後に、残差をデザインへ戻す",
      b: [
        "独立性は残差ヒストグラムから確認できません。収集順、時点、参加者、項目、施設などに沿って残差を描き、同じ単位内で似ていないかを見ます。同一参加者の反復測定を通常のlmへ入れた場合、HC3やVIFでは依存を解決できません。研究デザインに対応するクラスタ頑健推論や混合モデルへ進みます。",
        "診断の実務順序は、①分析単位と時間順序、②残差対予測値、③説明変数ごとの部分的な形、④Q–Q図と裾、⑤レバレッジ・Cook距離、⑥VIFと係数共分散、⑦代替仕様・感度分析、⑧外部または交差検証です。診断量を大量に計算して都合のよい結果だけ報告しません。",
        "報告では、何を見て、どの問題を疑い、どの対応を行い、主要係数・CI・予測がどれだけ変わったかを残します。『すべての仮定を満たした』ではなく、『どの逸脱に対して結論がどの程度頑健だったか』を書きます。次は二値結果へ進み、同じ診断思考をロジスティック回帰へ拡張します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "残差対予測値に漏斗形があり、平均の線形性は妥当そうです。まず何を検討しますか?",
      opts: [
        "分散モデルとHC3など分散不均一に頑健なSE",
        "VIFが高いと決めつけて説明変数を削除",
        "生のyが正規になるまで外れ値を削除",
      ],
      ans: 0,
      why: "漏斗形は条件付き分散が一定でない可能性を示します。平均構造とSEの問題を分け、HC3などを感度分析に使います。",
      hint: "漏斗の幅が表しているのは、中心ではなく散らばりです。",
    },
    {
      k: "fill",
      q: "説明変数x1を他の説明変数で回帰した補助モデル `aux` からVIFを計算します。空欄〔?〕へ式を入力しましょう。",
      code: `vif_x1 = 1 / (1 - 〔?〕)`,
      accept: ["r2(aux)"],
      show: "r2(aux)",
      why: "VIFは補助回帰のR²を使う `1 / (1 - R²)` です。R²が1へ近づくほどVIFは大きくなります。",
      hint: "補助モデルの決定係数を取り出すGLMの関数です。",
      placeholder: "R²を取り出す式",
    },
    {
      k: "tf",
      q: "回帰診断とVIFについて、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "VIFが10を超えた説明変数は、研究目的にかかわらず必ず削除する",
          a: false,
          why: "閾値は目安です。交絡調整、線形結合、予測など目的を確認し、係数の精度と感度を評価します。",
        },
        {
          s: "残差が正規的でも、観測の独立性は収集デザインに沿って別に確認する",
          a: true,
          why: "正規性と独立性は別です。収集順、参加者、項目などデザイン上のまとまりに沿って確認します。",
        },
        {
          s: "残差のShapiro–Wilk検定が有意なら、まず非線形回帰へ切り替える",
          a: false,
          why: "正規性からの逸脱は、重い裾、外れ値、分散不均一、平均構造の見落としなど複数の原因で生じます。残差パターンと生成過程を分けて調べます。",
        },
      ],
      hint: "閾値、再パラメータ化、異なる仮定を一つずつ分けて考えてください。",
    },
  ],
};
