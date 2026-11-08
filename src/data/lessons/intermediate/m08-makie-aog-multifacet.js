// 中級編8: 多次元・反復データの可視化設計 — MakieレイアウトとAlgebraOfGraphics
// 検証環境: Julia 1.12 / Statistics / Random / LinearAlgebra (CairoMakie・AlgebraOfGraphics構文併記)
export default {
  id: "makie-aog-multifacet",
  title: "多次元・反復データの可視化設計：MakieレイアウトとAlgebraOfGraphics",
  tag: "複合パネルGridLayout・対応Spaghettiと個人内CI・リンク尺度リボン・知覚均等配色・AoG文法を設計する",
  pages: [
    {
      t: "Makie 3バックエンドの統一設計と GridLayout による複合論文図",
      b: [
        "「探索の可視化」と「不確かさを論文品質で可視化」では1〜2枚の単一図を描きましたが、実際の論文では **Figure 1A・1B・1C を軸スケールや余白まで揃えて1枚に組む複合図（multi-panel figure）** が求められます。手作業で画像編集ソフトに貼り合わせると、データを差し替えるたびにズレや転記ミスが起きます。",
        "Juliaの `Makie.jl` エコシステムは、**同じ作図コードのまま出力先（バックエンド）だけを切り替えられる** のが大きな強みです。論文投稿用のベクター出力（SVG / PDF）と日本語フォントには **`CairoMakie`**、手元での60fps対話ズームや3D回転にはGPU駆動の **`GLMakie`**、Plutoノートブックやブラウザ共有にはWebGL駆動の **`WGLMakie`** を使います。",
        "さらに格子制約エンジン `GridLayout` を使うと、散布図の上と右に周辺密度を添え、`linkxaxes!` / `linkyaxes!` で軸範囲を連動させ、`Label(fig[1, 1, TopLeft()], \"A\")` でパネル記号を自動配置できます。物理サイズも `1 pt = 1/72 inch` で管理できるため、学術誌の2段組幅（例：幅 `504 pt = 7 inch`）に最初から合わせた文字サイズで組版できます。",
      ],
      code: `# CairoMakie による複合パネル図（散布図 + 上・右の周辺分布 + パネルラベル）の構成例
# using CairoMakie
#
# fig = Figure(size = (504, 380), fontsize = 11)          # 7.0 × 5.3 inch 相当
# ax_main = Axis(fig[2, 1], xlabel = "刺激強度 x", ylabel = "反応時間 (ms)")
# ax_top  = Axis(fig[1, 1])                               # 上段：x の周辺密度
# ax_side = Axis(fig[2, 2])                               # 右列：y の周辺密度
#
# density!(ax_top, x_vec; color = (:steelblue, 0.35))
# density!(ax_side, y_vec; direction = :y, color = (:steelblue, 0.35))
# scatter!(ax_main, x_vec, y_vec; color = (:black, 0.45), markersize = 6)
#
# linkxaxes!(ax_main, ax_top);  hidexdecorations!(ax_top, grid = false)
# linkyaxes!(ax_main, ax_side); hideydecorations!(ax_side, grid = false)
# rowsize!(fig.layout, 1, Relative(0.24)); colsize!(fig.layout, 2, Relative(0.24))
# colgap!(fig.layout, 8); rowgap!(fig.layout, 8)
# Label(fig[1, 1, TopLeft()], "A", fontsize = 14, font = :bold, padding = (0, 6, 4, 0))
# save("fig1_joint.pdf", fig)`,
      a: [
        "`linkxaxes!` と `linkyaxes!` を掛けておくと、片方の表示範囲を変えたときにもう片方も自動で追随するため、「散布図と周辺ヒストグラムの目盛りが密かにズレていた」という事故が構造的に起きません。まずこのレイアウト骨格を押さえたうえで、次ページから **「何を描かないと読者を誤誘導するか」** を数値で検証します。",
      ],
    },
    {
      t: "反復測定・対応データの可視化：群間エラーバーが隠す個人内変化",
      b: [
        "同一参加者の `Pre`（介入前）と `Post`（介入後）を比べる対応デザインで、最も頻繁に見かける誤りが **「各時点の平均に、参加者間ばらつきを含む通常の標準誤差（群間SE）のエラーバーを付けて並べる」** 図です。ベースラインの個人差（`SD = 85 ms`）が大きいと、ほぼ全員が確実に速くなっていても群間CIは大きく重なり、変化がないように見えてしまいます。",
        "対応データでは ① **参加者ごとの変化線（Spaghetti plot）** を薄く重ねて逆行者の有無を見せるとともに、② 参加者ごとの平均差を取り除いて条件内変動だけを取り出す **Cousineau–Morey の個人内標準誤差（within-subject SE）** または **差分 `Post - Pre` 自体の95%信頼区間** を併記します。24人中23人が改善したデータで両者の差を計算しましょう。",
      ],
      code: `using Random, Statistics

let rng = Xoshiro(4801), n = 24, tcrit = 2.0686576104190486, # quantile(TDist(23), 0.975)
    subj_base = 520.0 .+ 85.0 .* randn(rng, n),
    delta = -18.5 .+ 11.0 .* randn(rng, n),
    pre = subj_base, post = subj_base .+ delta
    # 1. 群間SE（個人差 SD≈85 がそのまま混入する）
    btw_se = std(pre) / sqrt(n)
    # 2. Cousineau-Morey の個人内正規化SE（条件数 K = 2 の補正係数 √(K/(K-1)) = √2）
    grand_m = 0.5 * (mean(pre) + mean(post))
    subj_m  = 0.5 .* (pre .+ post)
    pre_norm = pre .- subj_m .+ grand_m
    ws_morey_se = std(pre_norm) / sqrt(n) * sqrt(2.0 / (2.0 - 1.0))
    # 3. 対応差 (post - pre) のSEと95%信頼区間
    diff_se = std(post .- pre) / sqrt(n)
    println((mean_pre = round(mean(pre), digits = 1),
             mean_post = round(mean(post), digits = 1),
             btw_se = round(btw_se, digits = 2),
             ws_morey_se = round(ws_morey_se, digits = 2),
             diff_se = round(diff_se, digits = 2),
             improved = "$(count(post .< pre))/$n",
             paired_ci = round.([mean(post .- pre) - tcrit * diff_se,
                                 mean(post .- pre) + tcrit * diff_se], digits = 2)))
end`,
      out: `(mean_pre = 524.2, mean_post = 506.1, btw_se = 16.64, ws_morey_se = 1.57, diff_se = 2.22, improved = "23/24", paired_ci = [-22.68, -13.48])`,
      fig: {
        src: "figures/paired-spaghetti-linkband.svg",
        alt: "2パネル図。左は24人のPre/Post反復測定のSpaghetti図で、23本が右下がり（短縮）しており、群間CI（±34ms、灰色）は大きく重なるがMorey個人内CI（±3.2ms、緑色）は明確に分離している。右はロジスティック回帰の予測帯比較で、確率スケールの単純な±1.96 SE（赤破線）は0未満の不可能領域へ突き抜けるが、logit空間で計算して逆変換した緑リボンは(0,1)内に収まる。",
        cap: "左：個人差が大きい反復測定では群間CI（灰）は重なりますが、Spaghetti線と個人内CI（緑）は23/24人の一貫した短縮を正しく伝えます。右（次ページ参照）：ロジット空間で作った `band!` は確率 `0` 未満への逸脱を防ぎます。",
      },
      a: [
        "群間SEは `16.64 ms` もあるのに、個人差を差し引いた Morey 個人内SEは **`1.57 ms`（10分の1以下）** であり、`√2 × 1.57 ≈ 2.22` が対応差のSE `diff_se` と数学的に一致します。逆に「平均は同じ500 msだが、半数が `-30 ms` 短縮し半数が `+30 ms` 悪化した」ような交互作用・サブグループ分裂も、Spaghetti線を描けば一目で発見できます。",
      ],
    },
    {
      t: "過密散布図の飽和対策と、リンク尺度（logit / log）で作る不確かさリボン",
      b: [
        "標本サイズが数千〜数万件になると、`scatter!` に透明度 `alpha = 0.20` を設定しても、同じ画素に `k = 25` 点が重なった時点で実効不透明度は `1 - (1 - 0.20)^25 = 0.9962`（99.6%真っ黒）に飽和します。大規模データでは点描に固執せず、2次元ビン集計（`hexbin!` / `heatmap!`）や等高線（`contour!`）、Raincloud表示で密度の峰を見せます。",
        "もう一つ、回帰曲線の信頼帯 `band!(ax, xs, lower, upper)` を描くときの鉄則が **「計算はリンク尺度（線形予測子 `η`）で行い、上下端を逆リンク関数で応答尺度へ戻す」** ことです。「ロジスティック回帰」で学んだ確率予測で、確率 `p̂` に直接 `± 1.96 SE(p̂)` を足し引きすると何が起きるか確認しましょう（上の図の右パネル）。",
      ],
      code: `let alpha = 0.20, k_overlap = 25,
    eff_opac = 1.0 - (1.0 - alpha)^k_overlap,
    logistic(z) = 1.0 / (1.0 + exp(-z)),
    eta_hat = -3.35, se_eta = 0.68,
    p_hat = logistic(eta_hat),
    # デルタ法による確率尺度の近似SE: p̂(1 - p̂) * SE(η̂)
    se_p = p_hat * (1.0 - p_hat) * se_eta,
    naive_band = [p_hat - 1.96 * se_p, p_hat + 1.96 * se_p],
    link_band  = [logistic(eta_hat - 1.96 * se_eta), logistic(eta_hat + 1.96 * se_eta)]
    println((overlap25_opacity = round(eff_opac, digits = 4),
             p_hat = round(p_hat, digits = 4),
             naive_band = round.(naive_band, digits = 4),
             link_band = round.(link_band, digits = 4)))
end`,
      out: `(overlap25_opacity = 0.9962, p_hat = 0.0339, naive_band = [-0.0097, 0.0775], link_band = [0.0092, 0.1174])`,
      a: [
        "`p̂ = 0.0339`（3.4%）の付近で単純な `p̂ ± 1.96 SE` を描くと、下端が **`-0.0097`（マイナスの確率！）** に突き抜けます。対して線形予測子 `η̂ ± 1.96 SE(η̂)` の両端を `logistic` で写した `[0.0092, 0.1174]` は厳密に `(0, 1)` に収まり、確率 `0.5` 側へ長い非対称な不確かさも自然に表現できます。Poisson回帰や対数変換モデルの `exp.(lo_eta)` でもまったく同じ原則が成り立ちます。",
      ],
    },
    {
      t: "知覚均等カラースケールと発散パレットのゼロ中心固定",
      b: [
        "ヒートマップや空間マップで旧来の虹色パレット（`jet` / `rainbow`）を避けるべき理由は、単なる好みではなく **人間の視覚の輝度（明るさ）知覚が非単調に折れ曲がる** からです。数値が一定ペースで増えているだけなのに、シアン・黄色の帯だけ輝度が急上昇して「そこに急激な境界がある」と錯覚させ、白黒印刷や色覚多様性では順序すら失われます。",
        "連続量には輝度が単調に変化する知覚均等パレット（`:viridis` / `:cividis`）、正負の残差・効果量には **発散パレット（`:balance` / `:RdBu`）に必ず対称な `colorrange = (-m, m)` を指定** します。`[-0.8, +2.4]` の残差に自動スケールを許すと、`0.0`（効果ゼロ）がパレットのどこに塗られてしまうか計算しましょう。",
      ],
      code: `let ts = collect(range(0.0, 1.0, length = 9)),
    jet_rgb(t) = (clamp(1.5 - abs(4t - 3), 0.0, 1.0),
                  clamp(1.5 - abs(4t - 2), 0.0, 1.0),
                  clamp(1.5 - abs(4t - 1), 0.0, 1.0)),
    vir_rgb(t) = (clamp(0.27 + 0.72 * t^1.6, 0.0, 1.0),
                  clamp(0.01 + 0.89 * t^0.95, 0.0, 1.0),
                  clamp(0.33 + 0.25 * sin(pi * t) - 0.42 * t^1.4, 0.0, 1.0)),
    rel_lum((r, g, b)) = 0.2126 * r + 0.7152 * g + 0.0722 * b,
    jet_lums = [rel_lum(jet_rgb(t)) for t in ts],
    vir_lums = [rel_lum(vir_rgb(t)) for t in ts],
    vmin = -0.8, vmax = 2.4, m = max(abs(vmin), abs(vmax))
    println((jet_lums = round.(jet_lums, digits = 2),
             jet_monotone = all(diff(jet_lums) .> 0),
             vir_monotone = all(diff(vir_lums) .> 0),
             zero_pos_auto = round((0.0 - vmin) / (vmax - vmin), digits = 3),
             zero_pos_sym  = round((0.0 - (-m)) / (m - (-m)), digits = 3)))
end`,
      out: `(jet_lums = [0.04, 0.07, 0.43, 0.79, 0.86, 0.93, 0.57, 0.21, 0.11], jet_monotone = false, vir_monotone = true, zero_pos_auto = 0.25, zero_pos_sym = 0.5)`,
      a: [
        "`jet` の相対輝度は途中で `0.93` まで上がったあと `0.11` へ急落しており（`jet_monotone = false`）、存在しない縞模様を作ります。また `[-0.8, 2.4]` を自動範囲のまま青—白—赤の発散パレットで塗ると、`0.0` が **`0.25`（青みのある負の色！）** にズレて無効果のセルまで負に見えます。`m = maximum(abs, vals)` を取って `heatmap!(ax, Z; colormap = :RdBu, colorrange = (-m, m))` と書けば、`0.0` は必ず中立色（`0.5`）に固定されます。",
      ],
    },
    {
      t: "AlgebraOfGraphics.jl の宣言的文法と R・ggplot2 との分業",
      b: [
        "Rの `ggplot2` のように「データフレームの列を色・形・小パネル（facet）へ宣言的に割り当てたい」ときに使うMakie公式パッケージが **`AlgebraOfGraphics.jl`（AoG）** です。AoGの文法は代数的で、**データ・列対応・描画幾何の結合には掛け算 `*`、複数レイヤ（生データ点＋回帰直線など）の重ね合わせには足し算 `+`** を使います。",
        "返り値を `draw(spec)` で描画すると通常のMakieの `FigureGrid` が手に入るため、仕上げの軸調整や注釈は `CairoMakie` の関数でそのまま追記できます。すでに研究室に完成された `ggplot2` テーマ資産がある場合は、「RCallでJuliaからRを呼ぶ」やCSV契約で作図だけRに任せるのも立派な実務判断です。",
      ],
      code: `# AlgebraOfGraphics.jl + CairoMakie による多変量ファセット図の構成パターン
# using AlgebraOfGraphics, CairoMakie, DataFrames
#
# set_aog_theme!()
# spec = data(df) *
#        mapping(:stimulus => "刺激強度", :rt => "反応時間 (ms)",
#                color = :cond => "条件", marker = :cond => "条件",
#                col = :session => "セッション") *
#        (visual(Scatter, alpha = 0.45, markersize = 7) + linear())
#
# fg = draw(spec; figure = (; size = (720, 320)),
#                 palettes = (; color = [:steelblue, :firebrick]))
# save("aog_faceted_rt.svg", fg)`,
      a: [
        "`color` と `marker` に同じ `:cond` を割り当てている点に注目してください。色だけに意味を負わせずマーカー形状や線種も同時に変えることで、白黒印刷でも色覚多様性でも条件を一意に識別できます。次は上級編「計算統計・動的モデルの診断可視化：事後予測・較正・位相平面」へ進み、MCMC・分類確率・微分方程式の診断図を実装しましょう。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "同一参加者24人の介入前後（`Pre` と `Post`）の反応時間を比較したところ、ベースラインの個人差が大きく（`SD = 85 ms`）、一方で24人中23人が平均 `18 ms` 短縮していました。このデータの構造と変化の精度を最も誠実に伝える図はどれでしょう?",
      opts: [
        "`Pre` と `Post` の群平均の棒グラフに、参加者間SDから計算した独立2群用のエラーバーだけを添える",
        "参加者ごとの `Pre → Post` を結ぶ薄い対応線（Spaghetti plot）に平均変化を重ね、個人内変動に基づく区間または差分の95%信頼区間を明記して示す",
        "軸の下限を500 msに切り詰めた3D棒グラフだけを示し、個人データやエラーバーは省く",
        "参加者IDを横軸にして48本の棒をランダム順に並べる",
      ],
      ans: 1,
      why: "対応データに独立群用の群間エラーバーだけを付けると、大きなベースライン個人差に個人内の安定した変化が埋もれてしまいます。対応線で逆行者の有無を見せつつ、差分または個人内正規化SEの区間を定義つきで示すのが適切です。",
      hint: "「参加者間の初期値の散らばり」と「各参加者の中での前後変化」を視覚的に分離できる方法を選びます。",
    },
    {
      k: "fill",
      q: "CairoMakieで、同じ横軸を持つ上段の周辺密度 `ax_top` と下段の散布図 `ax_main` のx軸表示範囲を連動させます。空欄〔?〕に入る関数名を入力しましょう。",
      code: `〔?〕(ax_main, ax_top)`,
      accept: ["linkxaxes!"],
      show: "linkxaxes!",
      why: "`linkxaxes!(ax1, ax2)` は複数の `Axis` のx軸範囲を双方向に同期させます（y軸は `linkyaxes!`、両軸同時なら `linkaxes!` を使います）。",
      hint: "x軸（`xaxes`）を連結（`link`）し、軸オブジェクトを変更する `!` つきの関数です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "不確かさリボン・カラースケール・点群密度の設計について、正しいか判定しましょう。",
      items: [
        {
          s: "ロジスティック回帰の95%信頼帯を確率軸に描くときは、線形予測子（logit）空間で `η̂ ± 1.96 SE(η̂)` を求めてから両端を `logistic` で確率へ変換すると、`0` 未満や `1` 超えの不可能領域への逸脱を防げる",
          a: true,
          why: "リンク尺度で区間を構成してから単調な逆リンク関数で写すことで、定義域 `(0, 1)` が自動的に守られ、境界付近の非対称な不確かさも正しく表現されます。",
        },
        {
          s: "残差や対数オッズ比が `[-0.8, +2.4]` の範囲にあるヒートマップで、青—白—赤の発散パレットを自動スケーリングのまま使うと、値 `0.0` がちょうど中央の白に塗られる",
          a: false,
          why: "自動範囲 `[-0.8, +2.4]` では `0.0` は下から `25%` の位置になるため青系の色が付いてしまいます。`m = maximum(abs, Z)` として `colorrange = (-m, m)` を対称に指定する必要があります。",
        },
        {
          s: "虹色パレット（`jet`）は赤から青まで色相が一巡するため、知覚的な明るさ（輝度）も最小値から最大値へ常に一定の傾きで単調増加する",
          a: false,
          why: "`jet` は途中のシアン・黄色付近で輝度がピークに達してから再び暗くなる非単調な輝度プロファイルを持ち、実在しない境界の錯覚や白黒・色覚多様性での順序逆転を引き起こします。",
        },
      ],
      hint: "logit逆変換の値域、非対称区間での中央位置、および虹色パレットの黄色帯の明るさを確認します。",
    },
    {
      k: "choice",
      q: "`AlgebraOfGraphics.jl` で「データ `df` と列対応 `mapping(:x, :y, color = :cond)` に対し、散布図 `visual(Scatter)` と線形回帰線 `linear()` の2レイヤを重ねる」ときの演算子の組み合わせとして正しいものはどれでしょう?",
      opts: [
        "`data(df) + mapping(:x, :y, color = :cond) + (visual(Scatter) * linear())`",
        "`data(df) * mapping(:x, :y, color = :cond) * (visual(Scatter) + linear())`",
        "`data(df) |> mapping(:x, :y) - visual(Scatter)`",
        "`data(df) / mapping(:x, :y) / visual(Scatter)`",
      ],
      ans: 1,
      why: "`AlgebraOfGraphics.jl` では、データ・マッピング・視覚要素の指定を結合する操作が積 `*`、同じ座標系に複数のレイヤを重ね合わせる操作が和 `+` として定義されています（分配法則もそのまま成り立ちます）。",
      hint: "「仕様の掛け合わせが `*`、レイヤの重ね描きが `+`」という代数規則を思い出します。",
    },
  ],
};
