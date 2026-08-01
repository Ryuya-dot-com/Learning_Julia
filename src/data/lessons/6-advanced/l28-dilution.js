// レッスン: 測定誤差と希薄化
// 掲載値は scripts/measurement-error-check.jl で固定検証する。
export default {
  id: "measurement-error",
  title: "測定誤差と希薄化",
  tag: "方向理解必須・simulation任意：測定過程も生成モデルへ入れる",
  pages: [
    {
      t: "補正式より、誤差が結論を動かす方向を学ぶ",
      b: [
        "`必須理解` は、結果変数と説明変数の測定誤差が回帰へ非対称に作用し、古典的誤差、共有誤差、差別的誤分類、Berkson誤差で影響の方向が変わると説明できることです。",
        "`出力読解` では、観測相関の希薄化、重回帰係数の汚染、感度分析の範囲を読みます。補正後の一点を新しい真値と呼ばない判断を優先し、数式や関数の暗記は求めません。",
        "`任意実装` は、真値と誤差からデータを生成し、仮定を一つずつ壊すsimulationです。まず因果方向と誤差源を図にし、Juliaコードは必要な研究課題が生じたときに実行します。",
      ],
    },
    {
      t: "測定誤差は前処理ではなくモデルの一部",
      b: [
        "混合モデルで参加者・項目の依存を表しても、入力した得点が誤差なく測られたとは限りません。このレッスンでは、観測値Xを対象X*と誤差Uへ分けるX = X* + Uから始め、相関、単回帰、重回帰、群比較への影響を区別します。",
        "古典的テスト理論の真値は、人格の奥にある不変な実体ではなく、定めた測定手続を無限に反復した得点の期待値です。項目、評定者、時点、対象集団、得点用途を変えれば、何を誤差と数えるかも変わります。",
        "回帰の残差と測定誤差も同じではありません。残差は指定した結果モデルが説明しない変動、測定誤差は観測変数と測りたい対象のずれです。残差診断、cluster SE、ランダム効果を追加しても、説明変数の測定誤差は自動補正されません。",
      ],
    },
    {
      t: "再検査相関が信頼性になる条件を言う",
      b: [
        "信頼性は、指定した得点解釈における観測分散のうち対象の分散が占める割合です。再検査相関がその比になるのは、2回が平行測定で、対象が変化せず、誤差が時点間で独立という強い条件の下です。練習効果、記憶、成長、共通状況誤差があれば一致しません。",
        "α、ω、再検査相関、評定者間一致、G係数は、それぞれ異なる誤差源と測定モデルを置きます。数値が同じでも交換可能ではなく、『何に対する信頼性か』を係数名と設計で報告します。",
      ],
      code: `using Random, Statistics
rng_parallel = Xoshiro(3501)
n_parallel, reliability = 50_000, 0.8
true_score = randn(rng_parallel, n_parallel)
error_sd = sqrt((1 - reliability) / reliability)
first = true_score .+ error_sd .* randn(rng_parallel, n_parallel)
second = true_score .+ error_sd .* randn(rng_parallel, n_parallel)
println((parallel_correlation = round(cor(first, second), digits = 3),))`,
      out: `(parallel_correlation = 0.8,)`,
      a: [
        "この生成過程では2回が同じ真値、同じ誤差分散、独立な誤差を持つため、再検査相関0.800が信頼性0.8を復元します。実データで0.8が出ても、これらの仮定が検証されたことにはなりません。",
        "error_sd² = (1 − reliability) / reliabilityは、真値分散を1としたときにVar(X*) / Var(X) = reliabilityとなるよう逆算した値です。尺度変換ではなく分散比の指定です。",
      ],
    },
    {
      t: "古典的測定誤差の仮定を展開する",
      b: [
        "古典的な加法誤差X = X* + Uでは、少なくともE[U]=0、Cov(U, X*)=0を置きます。相関の希薄化公式には、XとYの測定誤差が互いに独立で、相手の真値とも独立という仮定も必要です。回帰の説明変数なら、Uが結果や構造誤差から独立であることも要ります。",
        "平均0は『個々の誤差が小さい』という意味ではなく、繰り返し平均すれば正負が相殺するという条件です。床・天井効果、丸め、社会的望ましさ、機器ドリフト、同じ評定者による共通method誤差は、加法的・独立・平均0を破りえます。",
        "古典的誤差は便利な基準モデルです。しかし、都合のよい結論を得るための既定値ではありません。誤差源を項目、時点、評定者、装置、コーディング、データ結合へ分解し、どれが独立と期待できるかを設計から判断します。",
      ],
    },
    {
      t: "相関の希薄化を不等な信頼性で確かめる",
      b: [
        "XとYの真の相関を0.7、信頼性をX=.8、Y=.5として古典的な独立誤差を加えます。この条件では観測相関の理論値はρobs = ρtrue√(relX relY)です。両尺度の信頼性が同じとは限らない例で確認します。",
      ],
      code: `using Distributions
rng_attenuation = Xoshiro(3502)
n = 50_000
true_r, rel_x, rel_y = 0.7, 0.8, 0.5
latent = rand(rng_attenuation,
    MvNormal([0.0, 0.0], [1.0 true_r; true_r 1.0]), n)
x = latent[1, :] .+ sqrt(1 / rel_x - 1) .* randn(rng_attenuation, n)
y = latent[2, :] .+ sqrt(1 / rel_y - 1) .* randn(rng_attenuation, n)
r_observed = cor(x, y)
r_theoretical = true_r * sqrt(rel_x * rel_y)
println((observed = round(r_observed, digits = 3),
         theoretical = round(r_theoretical, digits = 3)))`,
      out: `(observed = 0.442, theoretical = 0.443)`,
      a: [
        "観測0.442は理論0.443に近くなりました。ここで『誤差は相関を弱める』と言えるのは、生成時に古典的独立誤差を入れたからです。共有項目や同じ評定者による相関した誤差は、相関を水増しすることもあります。",
        "信頼性は標本や用途に依存する推定値です。別論文のαをそのままrelXへ代入する前に、同じ得点化、対象集団、項目範囲、測定時点かを確認します。",
      ],
    },
    {
      t: "希薄化修正を真値復元と呼ばない",
      b: [
        "古典的仮定が正しければ、観測相関を√(relX relY)で割ると潜在的な相関へ戻せます。しかしこれは、観測データだけから情報が増えたのではなく、信頼性と誤差独立性という仮定を追加した推定です。",
      ],
      code: `r_corrected = r_observed / sqrt(rel_x * rel_y)
incompatible = 0.80 / sqrt(0.50 * 0.50)
println((corrected = round(r_corrected, digits = 3),
         incompatible = round(incompatible, digits = 2)))`,
      out: `(corrected = 0.699, incompatible = 1.6)`,
      a: [
        "同じ生成過程では0.699へ戻りました。一方、観測相関0.80と両信頼性0.50を組み合わせると1.60です。1へ切り詰めたり『真の相関は完全』と解釈したりせず、信頼性の対象不一致、共有誤差、標本変動、モデル誤指定を知らせる矛盾診断とします。",
        "観測相関と信頼性推定値の双方に標本誤差があります。点推定値を式へ一度代入するだけでは修正値の不確かさを伝播できません。bootstrap、信頼性の感度範囲、潜在変数モデルを候補にします。",
      ],
    },
    {
      t: "結果と説明変数の誤差は回帰で非対称",
      b: [
        "真のモデルY* = 2 + 1.5X* + εを作ります。独立な古典的誤差を結果Yへ加えた場合と、説明変数Xへ加えた場合を分けます。信頼性はどちらも0.6です。",
      ],
      code: `using DataFrames, GLM
rng_regression = Xoshiro(3503)
n_regression, rel = 50_000, 0.6
x_true = randn(rng_regression, n_regression)
y_true = 2 .+ 1.5 .* x_true .+ randn(rng_regression, n_regression)
x_observed = x_true .+ sqrt(1 / rel - 1) .* randn(rng_regression, n_regression)
y_error_sd = std(y_true) * sqrt(1 / rel - 1)
y_observed = y_true .+ y_error_sd .* randn(rng_regression, n_regression)
df = DataFrame(x_true = x_true, x_observed = x_observed,
               y_true = y_true, y_observed = y_observed)

m_benchmark = lm(@formula(y_true ~ 1 + x_true), df)
m_error_y = lm(@formula(y_observed ~ 1 + x_true), df)
m_error_x = lm(@formula(y_true ~ 1 + x_observed), df)
println((benchmark_slope = round(coef(m_benchmark)[2], digits = 3),
         outcome_error_slope = round(coef(m_error_y)[2], digits = 3),
         predictor_error_slope = round(coef(m_error_x)[2], digits = 3),
         benchmark_se = round(stderror(m_benchmark)[2], digits = 3),
         outcome_error_se = round(stderror(m_error_y)[2], digits = 3)))`,
      out: `(benchmark_slope = 1.506, outcome_error_slope = 1.506, predictor_error_slope = 0.896, benchmark_se = 0.005, outcome_error_se = 0.008)`,
      a: [
        "独立な結果誤差では生単位の傾きは1.506のままですがSEが0.005から0.008へ増えます。説明変数誤差では傾きが0.896へ縮み、理論的な1.5×0.6=.9に近くなりました。これがregression dilutionです。",
        "結果誤差でも相関、R²、標準化係数、検定力は低下しえます。『Yの誤差は問題ない』のではなく、この単純線形モデルの生単位傾きに対するバイアスと精度を分けています。誤差が結果や群に依存すれば、傾きも偏ります。",
      ],
    },
    {
      t: "効果量と検定は同じ方向に壊れない",
      b: [
        "説明変数の古典的誤差は、単回帰の生傾きを信頼性倍へ縮めます。結果変数の独立誤差は生傾きを保っても残差分散を増やし、SEを広げ、t値と検定力を下げます。相関や標準化係数は両方の誤差で希薄化します。",
        "2群比較でも、連続結果の独立な測定誤差は平均差自体を平均的には保てても、群内分散を増やしてCohen's dを小さくします。群によって誤差平均・分散が違う、床天井が違う、項目が異なるなら、平均差にもバイアスが入ります。",
        "効果量を一つだけ見て『測定誤差で0方向』と結論しません。生単位の推定対象、標準化の分母、SE、区間、予測性能を分け、どの観測過程がどの量へ入るかを書きます。",
      ],
    },
    {
      t: "重回帰では誤差が別の係数へ移る",
      b: [
        "X1とX2の相関を0.7、真のモデルをY = X1 + εとして、X2の真の係数を0にします。X1だけを信頼性0.5で測ると、X2がX1の失われた情報を代理し、係数の汚染が他変数へ移ります。",
      ],
      code: `rng_multiple = Xoshiro(3504)
n_multiple, rho = 50_000, 0.7
p = rand(rng_multiple, MvNormal([0.0, 0.0], [1.0 rho; rho 1.0]), n_multiple)
x1, x2 = p[1, :], p[2, :]
y_multiple = x1 .+ 0.5 .* randn(rng_multiple, n_multiple)
x1_observed = x1 .+ randn(rng_multiple, n_multiple) # reliability=.5
multiple_df = DataFrame(x1 = x1, x2 = x2,
                        x1_observed = x1_observed, y = y_multiple)
m_true = lm(@formula(y ~ 1 + x1 + x2), multiple_df)
m_noisy = lm(@formula(y ~ 1 + x1_observed + x2), multiple_df)
println((true_beta1 = round(coef(m_true)[2], digits = 3),
         true_beta2 = round(coef(m_true)[3], digits = 3),
         noisy_beta1 = round(coef(m_noisy)[2], digits = 3),
         noisy_beta2 = round(coef(m_noisy)[3], digits = 3)))`,
      out: `(true_beta1 = 1.0, true_beta2 = -0.001, noisy_beta1 = 0.337, noisy_beta2 = 0.465)`,
      a: [
        "X1の係数は1.000から0.337へ縮み、真にはほぼ0だったX2が0.465になりました。重回帰では『誤差のある変数の係数だけが0へ寄る』とは言えません。係数の方向・交絡調整・交互作用も変わりえます。",
        "VIFは説明変数間の線形依存を診断しますが、どの変数がどれほど誤って測られたかは診断しません。低VIFでも測定誤差バイアスは残り、高VIFを下げても真値は復元されません。",
      ],
    },
    {
      t: "結果に依存する誤差は関連を作れる",
      b: [
        "古典的独立性を破る最小反例です。真のXとYは独立ですが、自己報告XにYの状態が0.8倍混ざるとします。たとえば現在の気分が、過去の曝露の想起にも回答にも影響する状況です。",
      ],
      code: `rng_differential = Xoshiro(3505)
n_differential = 50_000
x_true_diff = randn(rng_differential, n_differential)
y_diff = randn(rng_differential, n_differential)
x_reported = x_true_diff .+ 0.8 .* y_diff .+
             0.5 .* randn(rng_differential, n_differential)
diff_df = DataFrame(x_true = x_true_diff,
                    x_reported = x_reported, y = y_diff)
m_true_diff = lm(@formula(y ~ 1 + x_true), diff_df)
m_reported = lm(@formula(y ~ 1 + x_reported), diff_df)
println((true_slope = round(coef(m_true_diff)[2], digits = 3),
         reported_slope = round(coef(m_reported)[2], digits = 3)))`,
      out: `(true_slope = -0.005, reported_slope = 0.423)`,
      a: [
        "真の傾き−0.005に対し、報告値では0.423の関連が生まれました。差別的誤分類、共通method、逆因果的な想起、結果を知った評価者の判定は、0方向への希薄化ではなく任意方向のバイアスを作れます。",
        "誤差モデルはデータだけから常に識別できません。blind評価、異なるmethod、時間順序、validation subsample、陰性対照など、誤差依存を断つ設計上の情報が重要です。",
      ],
    },
    {
      t: "Berkson誤差を古典的誤差と混ぜない",
      b: [
        "古典的誤差は観測W = 真値X* + Uです。Berkson誤差は実際の曝露X* = 割当W + Uで、実験室の設定値、地域平均、処方量などから個人の実曝露が散る状況に現れます。誤差の矢印が逆です。",
      ],
      code: `rng_berkson = Xoshiro(3506)
n_berkson = 50_000
assigned = randn(rng_berkson, n_berkson)
actual = assigned .+ 0.8 .* randn(rng_berkson, n_berkson)
y_berkson = 1 .+ 1.5 .* actual .+ randn(rng_berkson, n_berkson)
m_berkson = lm(@formula(y ~ 1 + assigned),
    DataFrame(assigned = assigned, y = y_berkson))
println((berkson_slope = round(coef(m_berkson)[2], digits = 3),))`,
      out: `(berkson_slope = 1.505,)`,
      a: [
        "この線形・独立・等分散の例では傾き1.505が保たれ、古典的説明変数誤差と同じ希薄化は起きません。ただし結果の変動は増え、非線形モデル、閾値、異分散、相関誤差では別のバイアスが生じます。",
        "『測定誤差あり』というラベルだけで補正式を選びません。どちらが割当・観測・実現値かを因果図または生成式で書き、古典型、Berkson型、両者の混合を区別します。",
      ],
    },
    {
      t: "カテゴリ変数では誤分類をモデル化する",
      b: [
        "0/1の診断、曝露、正誤反応では加法誤差より、感度P(W=1|X*=1)と特異度P(W=0|X*=0)を使う誤分類モデルが自然です。順序尺度ではカテゴリ間の遷移確率や潜在閾値を考えます。",
        "非差別的な二値誤分類は多くの単純条件で関連を弱めますが、症例対照抽出、多変量調整、3水準以上、低い有病率では単純な0方向則に頼れません。結果・群・共変量に依存する差別的誤分類は任意方向へ偏ります。",
        "一致率やCohen's κは評定者一致を要約しますが、gold standardに対する感度・特異度ではありません。κが高くても両評定者が同じ系統誤りを共有できます。目的に合う誤差指標を選びます。",
      ],
    },
    {
      t: "反復測定とvalidation dataで誤差を識別する",
      b: [
        "同じ対象の独立な反復測定はwithin対象分散を、複数項目・評定者・時点の交差デザインは各facetの分散を識別する情報になります。ただし同じ誤差を共有する複製は、精密そうに見えても真値を識別しません。",
        "より正確な基準測定を一部の標本だけに取るvalidation subsample、既知濃度の標準試料、blind二重評定、異なるmethodの測定は、誤差モデルを外部情報で支えます。validation対象の選び方が本標本と異なる場合は移送可能性も検討します。",
        "欠測や除外も測定過程です。測れなかった値、範囲外として切った値、反応時間の試行除外が真値や結果に依存すれば、残ったデータの測定誤差構造も変わります。",
      ],
    },
    {
      t: "補正法は誤差モデルと一緒に選ぶ",
      b: [
        "単純な古典的説明変数誤差で信頼性が既知なら、回帰傾きを信頼性で割るregression calibrationの最小形が使えます。多変量、非線形、GLMMでは同じ一行補正にならず、validation modelと本体モデルを共同で扱います。補正後SEにも信頼性推定の不確かさを入れます。",
        "SIMEXは既知・推定した誤差をさらに加え、バイアス曲線を誤差0へ外挿します。結果は追加誤差の分布と外挿式に依存するので、複数仕様を比較します。測定誤差尤度、ベイズ階層モデル、潜在変数SEMは、観測モデルと構造モデルを同時に推定する選択肢です。",
        "Juliaでは生成モデル、尤度、ベイズモデルを構成できますが、確認的因子分析・SEMの成熟した定型ワークフローはRのlavaan等も有力です。RCall連携を使う場合も、Julia側で再現可能なデータ辞書とsimulationを残します。",
      ],
    },
    {
      t: "信頼性を感度軸として可視化する",
      b: [
        "観測相関0.45、Yの信頼性0.8とし、Xの信頼性を0.5〜0.9で動かします。一つのαを真値として代入する代わりに、妥当な範囲で結論がどれだけ変わるかを表と図にします。",
      ],
      code: `using CairoMakie
reliability_grid = collect(0.5:0.1:0.9)
sensitivity = DataFrame(
    reliability_x = reliability_grid,
    reliability_y = fill(0.8, length(reliability_grid)),
    corrected_r = round.(0.45 ./ sqrt.(reliability_grid .* 0.8), digits = 3))
println(sensitivity)

fig = Figure(size = (640, 400))
ax = Axis(fig[1, 1], xlabel = "assumed reliability of X",
          ylabel = "corrected correlation")
lines!(ax, sensitivity.reliability_x, sensitivity.corrected_r;
       color = :steelblue)
scatter!(ax, sensitivity.reliability_x, sensitivity.corrected_r;
         color = :steelblue)
fig`,
      out: `5×3 DataFrame
 Row │ reliability_x  reliability_y  corrected_r
─────┼───────────────────────────────────────────
   1 │           0.5            0.8        0.712
   2 │           0.6            0.8        0.65
   3 │           0.7            0.8        0.601
   4 │           0.8            0.8        0.562
   5 │           0.9            0.8        0.53`,
      a: [
        "仮定するXの信頼性だけで修正値は0.530〜0.712へ動きます。低い信頼性を仮定するほど補正は大きくなりますが、証拠が強くなるわけではありません。補正幅の大きさ自体が測定設計の弱さを示します。",
        "横軸には一点ではなく、同じ集団・得点用途から支持される範囲を置きます。観測相関、relX、relYを同時にbootstrapまたは事後分布から引けば、不確かさを共同で伝播できます。",
      ],
    },
    {
      t: "群・時点で測定モデルが変わらないか調べる",
      b: [
        "群間比較では、同じ得点が同じ構成概念・同じ単位を表す測定不変性が必要です。DIF、翻訳、回答スタイル、床天井、装置変更により項目切片や負荷、誤差分散が群・時点で変われば、観測平均差を真値差だけには帰属できません。",
        "縦断研究では、日内の測定誤差と人間の安定差を分けます。person-mean centeringをしても、日々のXに誤差があればwithin傾きは希薄化し、個人平均の誤差はbetween傾きにも残ります。ランダム切片・傾きはこの測定モデルを自動的に追加しません。",
        "公平性は群別αを並べるだけでは評価できません。項目水準のDIF、測定不変性、予測誤差、使用結果を妥当性論証へ戻し、異なる群で同じ意思決定を正当化できるかを調べます。",
      ],
    },
    {
      t: "測定誤差を監査可能に報告する",
      b: [
        "実務フローは、推定対象と得点用途を定義する→観測・対象・誤差の生成式を描く→連続誤差か誤分類かを選ぶ→誤差源と依存を列挙する→反復・validation・外部研究から誤差パラメータを得る→未補正分析を示す→複数の誤差仮定で補正・感度分析する→不確かさを伝播する→結論が変わる境界を報告する、です。",
        "最低限、測定器・項目・得点化、対象集団、測定時点、信頼性または感度・特異度とその区間、誤差モデル、共有誤差の扱い、補正法、validation標本、未補正／補正結果、ソフトウェアと版を残します。修正値だけを主結果として置きません。",
        "次の検定力設計では、効果量だけでなく信頼性、誤分類、参加者数、項目数、試行数、ランダム傾き、欠測を生成モデルへ入れます。測定を改善することと標本を増やすことのどちらが推定精度を上げるかを、同じsimulationで比較します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "真の回帰傾きが1.5で、古典的な独立測定誤差による説明変数Xの信頼性が0.6です。単回帰で期待される観測傾きに最も近いのはどれですか？",
      opts: ["0.9", "1.5", "2.5"],
      ans: 0,
      why: "単純な古典的説明変数誤差では傾きが信頼性倍へ希薄化し、1.5×0.6=0.9です。結果変数側の独立誤差とは影響が異なります。",
      hint: "説明変数誤差のregression dilutionでは、真の傾きに信頼性を掛けます。",
    },
    {
      k: "fill",
      q: "古典的独立誤差を仮定した相関の希薄化修正です。空欄〔?〕に入る関数名を入力しましょう。",
      code: `r_corrected = r_observed / 〔?〕(rel_x * rel_y)`,
      accept: ["sqrt"],
      show: "sqrt",
      why: "観測相関を信頼性の積の平方根で割ります。ただし仮定つき感度分析であり、自動的な真値復元ではありません。",
      hint: "平方根(square root)を計算するJulia関数です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "測定誤差について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "再検査相関は、真値が変化しても常に信頼性そのものになる",
          a: false,
          why: "平行測定、真値の安定、時点間で独立な誤差などが必要です。練習・成長・共通状況誤差があれば一致しません。",
        },
        {
          s: "重回帰では、一つの説明変数の測定誤差が別の説明変数の係数も偏らせうる",
          a: true,
          why: "相関した共変量が失われた情報を代理し、真の係数0が0.465になった反例を確認しました。",
        },
        {
          s: "希薄化修正が1を超えたら、1へ切り詰めて完全相関と報告する",
          a: false,
          why: "信頼性の対象不一致、共有誤差、標本変動、モデル誤指定を示す矛盾診断として扱います。",
        },
      ],
      hint: "再検査の仮定、重回帰の係数汚染、1を超える修正値の三点を分けます。",
    },
    {
      k: "choice",
      q: "真のXとYは独立なのに、Xの報告誤差がYの状態へ依存しています。最も適切な判断はどれですか？",
      opts: [
        "0方向への希薄化とは限らず、関連を新しく作る可能性もある",
        "非差別的誤差なので、必ず弱い負の関連になる",
        "VIFを下げれば測定誤差バイアスは消える",
      ],
      ans: 0,
      why: "結果へ依存する差別的誤差は古典的独立性を破り、無関連から正負どちらの関連も作りえます。",
      hint: "誤差が結果と独立かどうかを確認します。",
    },
  ],
};
