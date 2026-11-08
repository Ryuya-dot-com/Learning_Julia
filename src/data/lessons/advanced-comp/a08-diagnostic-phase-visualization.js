// 上級編8: 計算統計・動的モデルの診断可視化 — 事後予測・較正・位相平面
// 検証環境: Julia 1.12 / LinearAlgebra / Statistics / Random
export default {
  id: "diagnostic-phase-visualization",
  title: "計算統計・動的モデルの診断可視化：事後予測・較正・位相平面",
  tag: "事後予測エンベロープ・SBCランク図・較正曲線とAUCの盲点・2次元位相平面とObservableを実装する",
  pages: [
    {
      t: "事後予測チェック（PPC）エンベロープとランクヒストグラム（SBC診断）",
      b: [
        "複雑なベイズモデルや最尤モデルを当てはめたあと、係数表やトレースプロットだけを眺めても「モデルが現実のデータの形を再現できているか」「推論アルゴリズムの区間幅が過信していないか」は分かりません。現代の計算統計では、**シミュレーションから診断用の要約配列を作り、視覚的に反証する2つの図** が標準になっています。",
        "1つ目は「分布の推定と予測診断」を発展させた **事後予測チェック（Posterior Predictive Check; PPC）エンベロープ**（モデルから複製データ `y_rep` を何百組も生成し、最小値や分位点の95%予測帯に実測が入るかを見る図）、2つ目は真の母数 `θ` が事後ドローの中で何番目に位置するかを数える **ランクヒストグラム（Simulation-Based Calibration; SBC）** です。推論が正しければランクは一様分布になりますが、事後分布の幅が狭すぎる（過信）と両端に山が立つ **U字型** が現れます。",
      ],
      code: `using Random, Statistics

let rng = Xoshiro(5801),
    # 1. PPC反例: 右裾の重い反応時間 (下限420ms) に正規分布を当てたときの最小値予測帯
    y_obs = 420.0 .+ 65.0 .* exp.(0.65 .* randn(rng, 120)),
    mu_hat = mean(y_obs), sd_hat = std(y_obs),
    rep_q95 = [quantile(mu_hat .+ sd_hat .* randn(rng, 120), 0.95) for _ in 1:300],
    rep_min = [minimum(mu_hat .+ sd_hat .* randn(rng, 120)) for _ in 1:300]
    println((obs_min = round(minimum(y_obs), digits = 1),
             ppc_min_band = round.(quantile(rep_min, [0.025, 0.975]), digits = 1),
             obs_q95 = round(quantile(y_obs, 0.95), digits = 1),
             ppc_q95_band = round.(quantile(rep_q95, [0.025, 0.975]), digits = 1)))
end

let rng = Xoshiro(5801), R = 1000, S = 19 # 0..19 の20ビン（両端2ビンずつの理論比率は 4/20 = 0.20）
    ranks_cal, ranks_narrow = Int[], Int[]
    for _ in 1:R
        th = randn(rng); y = th + randn(rng) # 真の事後分布は Normal(0.5y, √0.5)
        push!(ranks_cal,    count(<(th), 0.5 * y .+ sqrt(0.5) .* randn(rng, S)))
        push!(ranks_narrow, count(<(th), 0.5 * y .+ (0.45 * sqrt(0.5)) .* randn(rng, S)))
    end
    println((nominal_edge = 0.2,
             cal_edge_share = round(count(r -> r <= 1 || r >= S - 1, ranks_cal) / R, digits = 3),
             narrow_edge_share = round(count(r -> r <= 1 || r >= S - 1, ranks_narrow) / R, digits = 3)))
end`,
      out: `(obs_min = 430.9, ppc_min_band = [256.5, 377.5], obs_q95 = 621.6, ppc_q95_band = [588.2, 634.2])
(nominal_edge = 0.2, cal_edge_share = 0.211, narrow_edge_share = 0.562)`,
      a: [
        "正規モデルは95%点こそ `[588.2, 634.2]` で実測 `621.6 ms` を覆いますが、右裾に引っ張られて `sd_hat` が膨らんだせいで最小値の予測帯が **`[256.5, 377.5] ms` へ崩れ、実測の生理的下限 `430.9 ms` を完全に外しています**。またSBCランクでは、正しい事後分布なら両端比率が `0.211`（理論値 `0.20`）と平坦なのに対し、幅が狭すぎる近似では **`0.562`（56.2%が両端に集中するU字型）** となり、実装バグや変分近似の過信を即座に検出できます。",
      ],
    },
    {
      t: "ROC-AUCの盲点と、較正曲線（Calibration Curve / Reliability Diagram）",
      b: [
        "「ロジスティック回帰」や機械学習の2値予測で、`ROC-AUC`（陽性個体のスコアが陰性個体より高くなる順位確率）だけを見て「精度が高い」と報告するのは危険です。**`AUC` は予測値の単調増加変換に対して完全に不変** だからです。",
        "たとえば真のロジットを `2.8` 倍に引き伸ばして切片をずらした「極端な過信モデル」を作ると、「予測確率95%と出ているのに実際は70%しか起きない」という重大な意思決定ミスを起こしますが、**`AUC` は小数点以下まで1ミリも変わりません**。予測確率を10分位ビンに分けて「平均予測確率 対 実測陽性率」を45度線と比べる **較正曲線** と期待較正誤差（ECE）を計算しましょう。",
      ],
      code: `using Random, Statistics

let rng = Xoshiro(5802), n = 1200, x = randn(rng, n),
    logistic(z) = 1.0 / (1.0 + exp(-z)),
    eta = -0.4 .+ 1.25 .* x,
    p_cal = logistic.(eta),
    y = Float64.(rand(rng, n) .< p_cal),
    p_over = logistic.(2.8 .* eta .+ 0.55) # 順位を保ったまま極端に0/1側へ押し出した過信予測
    function exact_auc(yb, sc)
        pos, neg = sc[yb .== 1.0], sc[yb .== 0.0]
        return sum(vp > vn ? 1.0 : (vp == vn ? 0.5 : 0.0) for vp in pos, vn in neg) / (length(pos) * length(neg))
    end
    function calc_ece(yb, pr; K = 10)
        ord, bs = sortperm(pr), div(length(yb), K)
        return sum(let idx = ord[((b - 1) * bs + 1):(b == K ? length(yb) : b * bs)]
            (length(idx) / length(yb)) * abs(mean(pr[idx]) - mean(yb[idx]))
        end for b in 1:K)
    end
    println((auc_cal = round(exact_auc(y, p_cal), digits = 4),
             auc_over = round(exact_auc(y, p_over), digits = 4),
             auc_diff = abs(exact_auc(y, p_cal) - exact_auc(y, p_over)),
             brier_cal = round(mean((p_cal .- y).^2), digits = 4),
             brier_over = round(mean((p_over .- y).^2), digits = 4),
             ece_cal = round(calc_ece(y, p_cal), digits = 4),
             ece_over = round(calc_ece(y, p_over), digits = 4)))
end`,
      out: `(auc_cal = 0.7912, auc_over = 0.7912, auc_diff = 0.0, brier_cal = 0.184, brier_over = 0.2056, ece_cal = 0.0357, ece_over = 0.14)`,
      a: [
        "`auc_cal` と `auc_over` は **`0.7912` で差が厳密に `0.0`** ですが、較正誤差 `ECE` は `0.0357 → 0.14`（約4倍悪化）、Brierスコアも `0.184 → 0.2056` へ悪化しています。確率を使って閾値判断やコスト計算を行う場面では、必ず較正曲線（次ページの図・右パネル）で45度対角線からの乖離を点検します。",
      ],
    },
    {
      t: "動的システムの位相平面（Phase Portrait）・ヌルクライン・セパラトリクス",
      b: [
        "「微分方程式と動的システム」や「潜在クラスタEM・逆伝播と科学機械学習（SciML）」のような非線形モデルでは、1本の時間波形 `u(t)` だけを描いても「なぜ初期値がほんの少し違っただけで逆の結論へ収束したのか」が見えません。2つの状態 `(u₁, u₂)` を縦横軸にとり、速度ベクトル場（Makieの `streamplot!` / `arrows2d!`）と **ヌルクライン（`du₁/dt = 0`, `du₂/dt = 0` の曲線）** を重ねた **位相平面図** が決定的な見通しを与えます。",
        "2つの神経集団（または選択肢）が互いに抑制し合う双安定意思決定モデル `du₁ = -u₁ + 1.6 tanh(u₁) - 0.9 tanh(u₂)`（`u₂` も対称）で、原点 `(0, 0)` のヤコビ行列の固有値（鞍点）と、わずか `0.04` だけ違う初期値 `(0.12, 0.08)` と `(0.08, 0.12)` の分岐を確認しましょう。",
      ],
      code: `using LinearAlgebra

let rhs2d(u1, u2) = (-u1 + 1.6 * tanh(u1) - 0.9 * tanh(u2),
                     -u2 + 1.6 * tanh(u2) - 0.9 * tanh(u1))
    function rk4_2d(u0::Tuple{Float64, Float64}, dt::Float64, steps::Int)
        u1, u2 = u0
        for _ in 1:steps
            k1_1, k1_2 = rhs2d(u1, u2)
            k2_1, k2_2 = rhs2d(u1 + 0.5 * dt * k1_1, u2 + 0.5 * dt * k1_2)
            k3_1, k3_2 = rhs2d(u1 + 0.5 * dt * k2_1, u2 + 0.5 * dt * k2_2)
            k4_1, k4_2 = rhs2d(u1 + dt * k3_1, u2 + dt * k3_2)
            u1 += (dt / 6.0) * (k1_1 + 2k2_1 + 2k3_1 + k4_1)
            u2 += (dt / 6.0) * (k1_2 + 2k2_2 + 2k3_2 + k4_2)
        end
        return (u1, u2)
    end
    J0 = [0.6 -0.9; -0.9 0.6] # 原点 (0, 0) でのヤコビ行列
    end_a = rk4_2d((0.12, 0.08), 0.05, 400)
    end_b = rk4_2d((0.08, 0.12), 0.05, 400)
    s1, s2 = 1.0 - tanh(end_a[1])^2, 1.0 - tanh(end_a[2])^2
    Ja = [-1.0 + 1.6 * s1  -0.9 * s2; -0.9 * s1  -1.0 + 1.6 * s2]
    println((saddle_eigs = round.(sort(eigvals(J0)), digits = 3),
             traj_a_end = round.(end_a, digits = 3),
             traj_b_end = round.(end_b, digits = 3),
             attractor_eigs = round.(sort(real.(eigvals(Ja))), digits = 3)))
end`,
      out: `(saddle_eigs = [-0.3, 1.5], traj_a_end = (2.464, -2.464), traj_b_end = (-2.464, 2.464), attractor_eigs = [-0.98, -0.929])`,
      fig: {
        src: "figures/phase-portrait-calibration.svg",
        alt: "2パネル図。左は2次元双安定系の位相平面で、du1=0（青破線）とdu2=0（紫破線）のヌルクラインが交わる原点(0,0)が鞍点となり、対角セパラトリクス u1=u2 を挟んで近接初期値(0.12,0.08)と(0.08,0.12)が正反対の安定アトラクタ(2.46,-2.46)と(-2.46,2.46)へ分岐する。右は較正曲線で、AUC=0.791で全く同じ2モデルのうち青線は45度対角線に沿う(ECE=0.036)が、赤の過信モデルはS字に大きく乖離する(ECE=0.140)。",
        cap: "左：ヌルクラインの交点3つのうち中央 `(0, 0)` は不安定な鞍点（固有値 `-0.3, +1.5`）であり、対角線の境界（セパラトリクス）を跨ぐと到達先が正反対に分岐します。右：前ページで計算した2モデルの較正曲線比較です。",
      },
      a: [
        "ヌルクラインの交点（平衡点）は「変化速度がゼロになる点」ですが、**交点だからといって安定とは限りません**。原点 `(0, 0)` は固有値に正の値 `+1.5` を持つ **鞍点（saddle point）** であり、対角線 `u₁ = u₂`（セパラトリクス）から少しでも外れると、全固有値が負（`-0.98, -0.929`）である2つの安定アトラクタ `(±2.464, ∓2.464)` のどちらかへ一気に吸い込まれます。CairoMakie / GLMakie では `streamplot!(ax, (x, y) -> Point2f(rhs2d(x, y)...), -3..3, -3..3)` の1行でこの流れ場を描けます。",
      ],
    },
    {
      t: "Observable によるリアクティブ可視化：Figureを作り直さずデータだけを更新する",
      b: [
        "微分方程式の結合強度やDDMのドリフト率をスライダーで動かして軌道の変化を観察するとき、Pythonの `matplotlib` 等でありがちな「スライダーが動くたびに `Figure` と `Axis` を丸ごと破棄して再描画する」書き方をすると、レイアウト計算が毎回走ってカクつきます。",
        "Makieの対話可視化（`GLMakie` / `WGLMakie`）の心臓部は **リアクティブ変数 `Observable`** です。パラメータを `Observable(0.4)` として包み、座標配列だけをリスナー（`@lift` / `on`）で更新すれば、既存の `Axis` とGPU頂点バッファだけを書き換えて滑らかに60fpsで動きます。その依存伝播と事前確保バッファ更新の仕組みを純Juliaで確かめましょう。",
      ],
      code: `# Observable の最小原理モデル（Makie / Observables.jl と同じ push 型リスナー伝播）
mutable struct MiniObs{T}
    val::T
    listeners::Vector{Function}
end
MiniObs(v::T) where {T} = MiniObs{T}(v, Function[])
function set_obs!(o::MiniObs{T}, v::T) where {T}
    o.val = v
    for f in o.listeners; f(v); end
    return v
end

let drift = MiniObs(0.4), ts = collect(0.0:0.5:4.0),
    traj_buf = similar(ts), updates = Ref(0)
    on_change = v -> (updates[] += 1; @. traj_buf = v * ts)
    push!(drift.listeners, on_change)
    on_change(drift.val)                       # 初期描画
    alloc_bytes = @allocated set_obs!(drift, 1.25) # パラメータ更新（Figure再生成なし）
    println((updates = updates[], end_pos = traj_buf[end], alloc_bytes = alloc_bytes))
end

# 実務の GLMakie スライダー連携パターン（Axis は1回だけ作り、Observable の中身だけ差し替える）
# using GLMakie
# fig = Figure(); ax = Axis(fig[1, 1], limits = (0, 4, -1, 6))
# sg = SliderGrid(fig[2, 1], (label = "ドリフト率 v", range = 0.0:0.05:1.5, startvalue = 0.4))
# ys_obs = @lift($(sg.sliders[1].value) .* ts)
# lines!(ax, ts, ys_obs; linewidth = 3) # スライダー操作で頂点座標だけが即時更新される`,
      out: `(updates = 2, end_pos = 5.0, alloc_bytes = 16)`,
      a: [
        "**絶対に避けるべきアンチパターンは、`@lift` や `on` コールバックの内部で `Figure()`・`Axis()`・`lines!(ax, ...)` 自体を毎回呼び出してレイヤを無限増殖させること** です。`Axis` と `lines!` は最初に1度だけ登録し、渡した `Observable{Vector{Point2f}}`（または `ys_obs`）の値だけを更新します。また数秒かかるMCMC再サンプリングはスライダーの連続イベントに直結せず、実行ボタンや事前計算グリッドと組み合わせます。",
      ],
    },
    {
      t: "科学的可視化の再現性監査とツール選択の最終整理",
      b: [
        "論文やレポートの図を「後から検証可能な科学的証拠」として残すには、「再現可能な研究プロジェクト」や「複数CSVと分析成果物の入出力」と同じ原則を図にも適用します。",
        "① **図と要約数値表のペア保存**: `fig2_calibration.svg` を書き出すスクリプトでは、その図が描いている10ビンの予測平均・実測率・件数を `fig2_calibration_bins.csv` として同じ実行IDで保存し、図の目視と数値監査が一致するようにします。② **ベクターとラスターの適切な使い分け**: 折れ線・区間・文字だけの図は `CairoMakie` の `.svg` / `.pdf` が最適ですが、10万点の散布図や細密ヒートマップをすべてSVG要素で出すと数十MBに肥大化してブラウザや組版ソフトが固まるため、高解像度PNG（`px_per_unit = 3`）やPDF内ラスター化を選びます。",
        "③ **Julia可視化ツールの選び分け**: 5秒で分布を見るなら `StatsPlots`、データフレームの多変量ファセットなら `AlgebraOfGraphics` + `CairoMakie`、複合パネル論文図・位相平面・カスタム診断図なら `CairoMakie` 直書き、パラメータ探索GUIなら `GLMakie`（`Observable`）——この4段構えで、探索から論文出版・対話シミュレータまで一貫してカバーできます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "2つの2値分類モデルA・Bを同じテストデータで比較したところ、`ROC-AUC` はどちらも `0.7912` で完全に一致していましたが、モデルBは予測確率 `0.95` と出した群の実際の陽性率が `0.70` しかありませんでした。なぜ `ROC-AUC` はこの過信を見抜けず、どの図で点検すべきでしょう?",
      opts: [
        "`ROC-AUC` はスコアの大小順位だけを見る指標で単調増加変換に不変なため確率の絶対値のズレを検出できない。予測確率ビンごとの平均予測値と実測陽性率を45度線と比べる較正曲線（Calibration Curve）で点検する",
        "`ROC-AUC` は標本サイズが1万件未満だと常に一致するため、箱ひげ図だけで点検すればよい",
        "`ROC-AUC` が同じならBrierスコアも期待較正誤差（ECE）も必ず一致するため、図を描く必要はない",
        "過信モデルは必ず `ROC-AUC = 0.5` になるはずなので計算バグである",
      ],
      ans: 0,
      why: "ロジットを正の定数倍して切片をずらすような狭義単調増加変換を施しても、全ペアのスコアの大小関係は一切変わらないため `ROC-AUC` は完全に同一になります。確率としての信頼性（較正）は較正曲線とECE・Brierスコアで別途監査する必要があります。",
      hint: "順位（どちらが大きいか）だけを見る指標と、確率の値そのものが実測頻度と合っているかを見る図の違いを考えます。",
    },
    {
      k: "fill",
      q: "`GLMakie` や `WGLMakie` で、スライダーの値 `sg.sliders[1].value`（`Observable`）が変わるたびに `Axis` を作り直さず曲線データ `ys_obs` だけをリアクティブに再計算させるマクロを書きます。空欄〔?〕に入るマクロ名（`@` つき）を入力しましょう。",
      code: `ys_obs = 〔?〕($(sg.sliders[1].value) .* ts)`,
      accept: ["@lift"],
      show: "@lift",
      why: "`@lift` マクロは内部で `$obs` として参照された `Observable` が更新されるたびに式を再評価し、派生した新しい `Observable` を自動更新します。",
      hint: "関数や演算を `Observable` の上へ「持ち上げる（lift）」マクロです。",
      placeholder: "@マクロ名",
    },
    {
      k: "tf",
      q: "事後予測チェック（PPC）・SBCランクヒストグラム・2次元位相平面の読解について、正しいか判定しましょう。",
      items: [
        {
          s: "真の母数を既知の事前分布から引いてデータを生成し事後サンプルと比較するSBC診断で、ランクヒストグラムが両端だけ高い『U字型』になった場合、事後分布の区間幅が狭すぎる（過信・過小分散）ことを示す",
          a: true,
          why: "事後分布の幅が真の不確かさより狭すぎると、真の母数が事後サンプルの最小値未満または最大値超えに頻繁にはみ出すため、ランクの両端ビンに過剰な件数が積み上がります。",
        },
        {
          s: "2次元微分方程式の位相平面で、`du₁/dt = 0` のヌルクラインと `du₂/dt = 0` のヌルクラインが交わる平衡点は、ヤコビ行列の固有値を調べなくても常に安定な収束先（アトラクタ）である",
          a: false,
          why: "ヌルクラインの交点は微分がゼロになる平衡点ですが、ヤコビ行列の固有値の実部に正の値が1つでもあれば不安定点（鞍点や不安定ノード）であり、わずかな摂動で別の領域へ離れていきます。",
        },
        {
          s: "`GLMakie` でスライダーを動かす対話図を作るときは、コールバック関数の中で毎回 `Axis(fig[1, 1])` と `lines!(ax, ...)` を新しく呼び出して重ね続けるのが高速化の定石である",
          a: false,
          why: "コールバックのたびに `Axis` やプロットオブジェクトを追加するとメモリリークと描画低下を招きます。`Axis` と `lines!` は最初に1回だけ作り、渡した `Observable` の中身だけを更新します。",
        },
      ],
      hint: "狭すぎる区間で真値がどこへ落ちるか、鞍点の固有値符号、および `Observable` の設計目的を順に確認します。",
    },
    {
      k: "choice",
      q: "双安定な2次元力学系で、2つの安定アトラクタの吸引域（basin of attraction）を隔てており、その境界をわずかに跨ぐだけで最終的な収束先が正反対へ分かれる曲線を何と呼ぶでしょう?",
      opts: [
        "最小二乗回帰直線（OLS Regression line）",
        "セパラトリクス（Separatrix / 分離多様体）",
        "信頼帯（Confidence band）",
        "バート行列（Burt matrix）",
      ],
      ans: 1,
      why: "鞍点（saddle point）の安定多様体などが作る吸引域の境界線をセパラトリクス（separatrix）と呼びます。位相平面上にベクトル場・ヌルクラインと一緒に描くことで、初期値鋭敏性や二択意思決定の分岐構造が明確になります。",
      hint: "2つの吸引領域を「分離する（separate）」境界線を表す力学系用語です。",
    },
  ],
};
