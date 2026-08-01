// レッスン: 不確かさを論文品質で可視化 — 生データ・推定値・区間を同じ図で伝える
// 数値例は Julia 1.12.6 + Distributions 0.25.130 で検証する。
// CairoMakie の描画例は scripts/probability-inference-check.jl から再検証できる。
export default {
  id: "uncertainty-visualization",
  title: "不確かさを論文品質で可視化",
  tag: "生データ・推定値・区間を同じ図で伝える",
  pages: [
    {
      t: "図は飾りではなく、推論の一部",
      b: [
        "平均値の点だけを描くと、観測値がどれほど散らばっていたか、標本が何人だったか、推定がどれほど不確かかが消えます。図を整える前に、読者へ何を判断してほしいのかを決めます。",
        "連続量を2群で比べるなら、生データ、群ごとの点推定、点推定の区間を同じ図に置くのが基本形です。生データは個体差と外れ値を、点推定は問いへの答えを、信頼区間は推定の精度を担当します。3つは別の情報です。",
        "95%信頼区間は個々の観測値の95%が入る範囲ではありません。また、計算後の特定の区間に母数が95%の確率で入るという意味でもありません。前のレッスンで学んだ区間手続きの長期的な被覆率を、図でも取り違えないようにします。",
      ],
    },
    {
      t: "生データ・平均・95%信頼区間を重ねる",
      b: [
        "まずデータを生成し、各群の平均とt分布に基づく95%信頼区間を計算します。解析用の乱数列と、点の重なりをほぐす表示用の乱数列は分けます。表示を調整しても推定値が変わらない設計にするためです。",
        "CairoMakieでは `scatter!` で生データ、`rangebars!` で区間、もう一つの `scatter!` で平均を描きます。エラーバーが何を表すかは見た目から判別できないため、軸ラベルかキャプションに「95% CI」と明記します。",
      ],
      code: `using Random, Statistics, Distributions, CairoMakie

function mean_ci_summary(x; level = 0.95)
    n = length(x)
    critical = quantile(TDist(n - 1), 1 - (1 - level) / 2)
    estimate = mean(x)
    se = std(x) / sqrt(n)
    return (; estimate,
            lower = estimate - critical * se,
            upper = estimate + critical * se,
            n)
end

analysis_rng = Xoshiro(2026)
control = rand(analysis_rng, Normal(500, 50), 30)
treatment = rand(analysis_rng, Normal(525, 50), 30)
y = vcat(control, treatment)
group = repeat([1, 2], inner = 30)
summaries = mean_ci_summary.([control, treatment])

display_rng = Xoshiro(99)
x = Float64.(group) .+ 0.28 .* (rand(display_rng, length(y)) .- 0.5)
positions = [1, 2]
estimates = [s.estimate for s in summaries]
lowers = [s.lower for s in summaries]
uppers = [s.upper for s in summaries]

fig = Figure(size = (760, 480))
ax = Axis(fig[1, 1], ylabel = "反応時間 (ms)")
scatter!(ax, x, y; color = (:gray35, 0.45), markersize = 9)
rangebars!(ax, positions, lowers, uppers;
           color = :black, linewidth = 3, whiskerwidth = 16)
scatter!(ax, positions, estimates;
         color = :black, marker = :diamond, markersize = 16)
ax.xticks = (positions, ["統制 (n=30)", "介入 (n=30)"])
save("raw_mean_ci.svg", fig)

println(round.(estimates, digits = 1))`,
      out: `[503.8, 523.0]`,
      a: [
        "灰色の点は観測値、黒いひし形は標本平均、縦線は平均の95%信頼区間です。個体差を表すSDと、平均の不確かさを表すSE／CIを同じものとして描いてはいけません。",
        "横方向のずらしには `display_rng` しか使っていません。`analysis_rng` を描画の都合で余計に消費すると、後続のシミュレーション結果まで変わり、再現性の追跡が難しくなります。",
        "点をずらすこと自体に統計的な意味はありません。横位置を群内の連続量として読ませないよう、ずらす幅を小さくし、カテゴリの目盛りを明示します。",
      ],
    },
    {
      t: "1本の区間ではなく、区間を作る手続きを見る",
      b: [
        "信頼区間の意味は、同じ標本抽出と計算を何度も繰り返した図で見えやすくなります。下の図では60回の研究を縦に並べ、真の平均500を含まなかった区間だけ赤くします。",
        "赤い区間があるのは計算ミスではありません。95%信頼区間は、前提が満たされた反復の長期的な約95%で真値を覆う手続きです。都合のよい区間だけを選んだり、同じデータで分析を選び直したりすれば、この性質は維持されません。",
      ],
      code: `using Random, Statistics, Distributions, CairoMakie

truth = 500.0
coverage_rng = Xoshiro(2500)
intervals = [mean_ci_summary(rand(coverage_rng, Normal(truth, 50), 25))
             for _ in 1:60]
covered = [s.lower <= truth <= s.upper for s in intervals]

fig = Figure(size = (760, 540))
ax = Axis(fig[1, 1],
          xlabel = "平均反応時間と95% CI (ms)",
          ylabel = "反復した研究")
for (i, s) in enumerate(intervals)
    color = covered[i] ? :steelblue : :firebrick
    lines!(ax, [s.lower, s.upper], [i, i]; color, linewidth = 2)
    scatter!(ax, [s.estimate], [i]; color, markersize = 7)
end
vlines!(ax, [truth]; color = :black, linestyle = :dash)
save("ci_coverage.svg", fig)

println(count(identity, covered))`,
      out: `56`,
      a: [
        "この乱数列では60本中56本が真値を含みました。95%は60本なら必ず57本という割当ではなく、反復に伴って揺れる長期的性質です。",
        "この図は教育用なので真値を描けます。実データでは真値は未知です。赤い線を見つけることではなく、抽出法・独立性・モデル・分析選択を含む手続きが妥当かを検討します。",
      ],
    },
    {
      t: "同じ平均とSEでも、データは同じではない",
      b: [
        "棒の高さを平均、短い線をSEとして描くだけでは、分布の形をほとんど失います。次の2群は標本平均、標本SD、標本サイズが同じになるよう変換していますが、一方は単峰、もう一方は二峰性です。平均±SEの棒グラフなら同じ図になります。",
        "生データを重ねれば、床・天井効果、外れ値、二峰性、群内の偏りを読者が確認できます。ただし点が数千個ある場合は、全点を濃く重ねると黒い塊になります。透明度、ビン、hexbin、ランダムに依存しない代表標本など、目的に応じて情報量を管理します。",
      ],
      code: `using Random, Statistics, Distributions

function match_summary(x; target_mean = 500.0, target_sd = 50.0)
    z = (x .- mean(x)) ./ std(x)
    return target_mean .+ target_sd .* z
end

unimodal = match_summary(rand(Xoshiro(11), Normal(), 40))
bimodal_raw = vcat(
    rand(Xoshiro(12), Normal(-2, 0.25), 20),
    rand(Xoshiro(13), Normal(2, 0.25), 20),
)
bimodal = match_summary(bimodal_raw)

println(isapprox(mean(unimodal), mean(bimodal); atol = 1e-10))
println(isapprox(std(unimodal), std(bimodal); atol = 1e-10))
println(length(unimodal) == length(bimodal))`,
      out: `true
true
true`,
      a: [
        "平均、SD、nが一致するので、SEも95%信頼区間の幅も一致します。それでもデータ生成過程は同じではありません。要約統計量はデータを圧縮した結果であり、元データの代用品ではないことが分かります。",
        "二峰性を見た後で、都合よく群を分割して検定するのは別問題です。図はモデルの再検討を促しますが、探索後の仮説を最初から決めていた仮説として扱う根拠にはなりません。",
      ],
    },
    {
      t: "軸切断・平滑化・重なりを敵対的に点検する",
      b: [
        "軸を狭くすると小さな差が大きく見えます。ただし軸切断が常に不正というわけではありません。差の精密な比較には拡大図が役立ちます。ゼロが比率として意味を持つ量で棒の長さを比較させる場合はゼロを含め、拡大するなら全範囲の図を併記するか、軸範囲を明示します。",
        "密度曲線は帯域幅、ヒストグラムはビンの幅と開始位置で形が変わります。複数の妥当な設定で結論が変わらないかを確認し、最も劇的に見える設定だけを採用しません。平滑な線は観測したデータそのものではありません。",
        "点の重なりも情報を消します。`alpha`、小さなマーカー、jitter、hexbinを使い分けますが、jitterで作った位置や平滑線の細かな凹凸を実測値として読ませないよう、キャプションで変換を説明します。",
      ],
      code: `fig = Figure(size = (900, 420))
ax_full = Axis(fig[1, 1], title = "全範囲", ylabel = "反応時間 (ms)")
ax_zoom = Axis(fig[1, 2], title = "拡大表示")

for ax in (ax_full, ax_zoom)
    rangebars!(ax, positions, lowers, uppers; color = :black)
    scatter!(ax, positions, estimates; color = :black, marker = :diamond)
    ax.xticks = (positions, ["統制", "介入"])
end
ylims!(ax_full, 0, 650)
ylims!(ax_zoom, 450, 600)
save("axis_sensitivity.svg", fig)`,
      a: [
        "左右は同じ推定値と区間です。差の数値は変わりませんが、視覚的な印象は変わります。図を一枚だけ見る読者が、どの基準からどれほど違うと判断するかを点検します。",
        "図の選択も分析者自由度の一部です。結果を見てから軸、除外、平滑化を調整したなら、その判断過程を保存し、必要に応じて感度分析を示します。",
      ],
    },
    {
      t: "論文品質は解像度より、読み手が検証できること",
      b: [
        "提出前に、単位、群名、n、点と線の意味、区間の種類、変換、除外規則を図またはキャプションだけで追えるか確認します。色だけに意味を担わせず、形・線種・直接ラベルも併用します。白黒印刷と色覚多様性でも区別できるかを確かめます。",
        "線と文字が中心の図はSVGやPDFのベクター形式、非常に多い点や画像は高解像度PNGが向きます。日本語フォントは環境依存なので、Windowsなら `Yu Gothic` など実在するフォントを明示し、最終ファイルを必ず開いて確認します。",
        "最終チェックは『美しいか』だけではありません。別の軸範囲、別の平滑化、外れ値を含む図でも主張が維持されるか。点推定だけでなく不確かさが見えるか。読者が過大解釈しにくいかを、敵対的に問い直します。",
      ],
      code: `JPFONT = "Yu Gothic"
fig = Figure(size = (760, 480),
             fontsize = 18,
             fonts = (; regular = JPFONT, bold = JPFONT))
# Axis とプロットを追加した後に保存する
save("figure1.svg", fig)                 # 線・文字向け
save("figure1.png", fig; px_per_unit = 2) # ラスター画像向け`,
      a: [
        "`px_per_unit = 2` は図の論理サイズに対して2倍の画素数でPNGを書き出します。倍率を上げても、欠けたラベル、曖昧な区間、隠れた生データは改善しません。内容の監査を先に行います。",
        "コード、Project.toml、Manifest.toml、生成データ、最終図を一緒に保存します。図だけが残り、どのデータとコードから作られたか分からない状態を避けます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "各30人の2群で連続量を比較します。読者が個体差と平均差の精度をともに確認しやすい図はどれでしょう?",
      opts: [
        "生データ、群平均、平均の95%信頼区間、各群のnを示す",
        "群平均の棒だけを示し、棒を立体的に装飾する",
        "平均±SEだけを示し、エラーバーの定義は省略する",
      ],
      ans: 0,
      why: "生データは分布と個体差、平均は効果の向きと大きさ、95%信頼区間は平均推定の精度を伝えます。nと区間の定義も明記すれば、読者が図だけから過不足なく判断しやすくなります。",
      hint: "点推定だけでなく、元の観測値と推定の精度を同時に見せる選択肢を探してください。",
    },
    {
      k: "fill",
      q: "CairoMakieで、下端 `lowers` から上端 `uppers` までの区間を直接描きます。空欄〔?〕に入る関数名を入力しましょう。",
      code: `〔?〕(ax, positions, lowers, uppers; color = :black)`,
      accept: ["rangebars!"],
      show: "rangebars!",
      why: "`rangebars!` は各位置について下端と上端を受け取り、範囲を描きます。平均は別の `scatter!` で重ねると、点推定と区間の役割を分けて読めます。",
      hint: "range（範囲）と bars を組み合わせ、既存のAxisへ描き足す `!` が付く関数です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "不確かさの可視化について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "平均の95%信頼区間は、個々の観測値のおよそ95%が入る範囲である",
          a: false,
          why: "平均の信頼区間は平均という母数を推定する手続きの不確かさを表します。個々の観測値の散らばりを示す範囲ではありません。",
        },
        {
          s: "同じ平均・SD・nを持つ2群でも、分布の形は大きく異なることがある",
          a: true,
          why: "要約統計量はデータを圧縮します。単峰性、二峰性、外れ値などは平均・SD・nだけでは復元できないため、生データや分布表示が必要です。",
        },
        {
          s: "軸を拡大表示した場合は、軸範囲を隠したほうが先入観を与えない",
          a: false,
          why: "拡大自体が有用な場合はありますが、範囲を隠すと差の印象を検証できません。目盛りを明示し、必要なら全範囲の図を併記します。",
        },
      ],
      hint: "CIの対象、要約による情報損失、読者が表示条件を検証できるかの3点を確認してください。",
    },
  ],
};
