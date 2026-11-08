// レッスン: 自作対数尤度と数値最適化 — パッケージにない観測過程を最尤推定とプロファイル尤度で解く
// 公式仕様: https://juliastats.org/Distributions.jl/stable/
//           https://docs.julialang.org/en/v1/manual/conversion-and-promotion/
export default {
  id: "custom-likelihood-optimization",
  title: "自作対数尤度と数値最適化",
  tag: "パッケージにない観測過程を最尤推定とプロファイル尤度で解く",
  pages: [
    {
      t: "既製関数がないモデルでも、生成過程が書ければ推定できる",
      b: [
        "補講「観測境界・依存・混合分布」では、測定限界による打切り（censoring）を `clamp` 後の通常データとして扱うと平均や分散が歪むことを見ました。実データの研究では、応答時間の上限（タイムアウト）や検出限界のように、既製の `lm` や単純な `fit_mle` だけではそのまま扱えない観測過程が頻繁に現れます。",
        "Juliaの大きな強みは、自分で書いた `for` ループの対数尤度関数がそのまま高速に動き、さらに自動微分（AD）で正確な勾配と曲率（Hessian）を求めて最適化できることです。",
        "この章では、タイムアウトつきの反応時間モデルを題材に、①打切り対数尤度の組み立て、②制約なし空間（`log` 変換）での最適化、③二重数（Dual数）による自動微分の仕組み、④非対称な不確かさを捉えるプロファイル尤度区間、を一気通貫で学びます。",
      ],
    },
    {
      t: "打切りを無視する2つの素朴な集計がどちらも外れる理由",
      b: [
        "真の平均スケール `θ = 900` ms の指数分布 `Exponential(900.0)` から28試行を生成し、`1200` ms でタイムアウト（右打切り）になった試行は `obs_t = 1200.0`、`cens_flag = true` として記録します（`Distributions.jl` の `Exponential(θ)` は率 `λ` ではなく平均スケール `θ` を引数にとります）。",
        "このとき、①打切り値 `1200.0` をそのまま実測値とみなして平均するのも、②タイムアウトした試行を除外して平均するのも、どちらも真の平均を過小評価します。",
      ],
      code: `using Random, Statistics, Distributions

rng = Xoshiro(4301)
latent_t = rand(rng, Exponential(900.0), 28)
limit = 1200.0
obs_t = min.(latent_t, limit)
cens_flag = latent_t .>= limit

println((censored = count(cens_flag), n = length(obs_t)))
println(round(mean(obs_t), digits = 1))             # ① 1200で頭打ちのまま平均
println(round(mean(obs_t[.!cens_flag]), digits = 1)) # ② 遅い試行を捨てて平均`,
      out: `(censored = 6, n = 28)
638.2
485.0`,
      a: [
        "28試行のうち6試行が1200 msを超えました。①は1200 msより先の裾を切り詰めるため低く出ます。②は「遅かった試行だけを選んで捨てる」選択バイアスを起こすため、`485.0` ms とさらに深刻に低く出ます。",
        "正しく推定するには、「22試行は時刻 `tᵢ` で観測された（密度 `logpdf`）」「6試行は1200 msより先まで続いた（上側確率 `logccdf`）」という2種類の情報をそのまま対数尤度へ足し合わせます。",
      ],
    },
    {
      t: "制約なしパラメータ η = log(θ) と自動微分（Dual数）",
      b: [
        "スケール `θ` は正の値しか取れません。最適化の途中で探索点が `θ <= 0` へ踏み込むと `log(θ)` が `DomainError` になります。そこで `η = log(θ)`（すなわち `θ = exp(η)`）と変換すれば、`η` はマイナス無限大からプラス無限大まで自由に動けます。",
        "さらにJuliaでは、「値 `val` と微分係数 `der` をペアにした二重数 `Dual <: Real`」に四則演算と `exp`・`log` を定義するだけで、書いたそのままのJulia関数から丸め誤差のない正確な1階微分が得られます（実務で広く使われる `ForwardDiff.jl` の基本原理です）。",
      ],
      code: `struct Dual <: Real
    val::Float64
    der::Float64
end
Base.promote_rule(::Type{Dual}, ::Type{<:Real}) = Dual
Base.convert(::Type{Dual}, x::Real) = Dual(Float64(x), 0.0)
Base.convert(::Type{Dual}, x::Dual) = x
Base.:+(a::Dual, b::Dual) = Dual(a.val + b.val, a.der + b.der)
Base.:-(a::Dual, b::Dual) = Dual(a.val - b.val, a.der - b.der)
Base.:-(a::Dual) = Dual(-a.val, -a.der)
Base.:*(a::Dual, b::Dual) = Dual(a.val * b.val, a.der * b.val + a.val * b.der)
Base.:/(a::Dual, b::Dual) = Dual(a.val / b.val, (a.der * b.val - a.val * b.der) / b.val^2)
Base.exp(a::Dual) = (e = exp(a.val); Dual(e, e * a.der))
Base.log(a::Dual) = Dual(log(a.val), a.der / a.val)

# 観測 k 件は -log(θ) - t/θ、右打切りは -t/θ → 合計は -k*η - sum(t)/exp(η)
function censored_exp_loglik_eta(eta::Real, times, is_censored)
    theta = exp(eta)
    k = count(!, is_censored)
    return -k * eta - sum(times) / theta
end`,
      a: [
        "数値微分の差分近似 `(f(x + h) - f(x)) / h` は、`h` が大きすぎれば近似誤差、小さすぎれば「確率変数と確率分布」で扱った桁落ちを起こします。`Dual(eta, 1.0)` を渡す前進型自動微分は、連鎖律を機械精度でそのまま計算するため `h` の調整が不要です。",
      ],
    },
    {
      t: "Newton法による最尤推定と、解析解との検算",
      b: [
        "勾配（1階微分）が0になる点をNewton法で求め、収束点の曲率（負の2階微分＝観測Fisher情報量）の逆数から標準誤差を計算します。右打切り指数分布には解析解 `θ̂ = sum(obs_t) / k` があるため、数値最適化が正しく動いているかを厳密に検算できます。",
      ],
      code: `k = count(!, cens_flag)
eta = log(mean(obs_t))
for _ in 1:30
    grad = censored_exp_loglik_eta(Dual(eta, 1.0), obs_t, cens_flag).der
    hess = -sum(obs_t) / exp(eta)
    step = grad / hess
    eta -= step
    abs(step) < 1e-12 && break
end

theta_hat = exp(eta)
se_eta = sqrt(1 / (sum(obs_t) / theta_hat))
se_theta = theta_hat * se_eta

println(round(theta_hat, digits = 1))
println(round(sum(obs_t) / k, digits = 1)) # 解析解との照合
println(round(se_theta, digits = 1))`,
      out: `812.3
812.3
173.2`,
      a: [
        "数値最適化の推定値 `812.3` ms が解析解と一致しました。素朴な平均（`638.2` や `485.0`）で起きていた大きな下方バイアスが解消されています。",
        "多母数の一般モデルでは、パッケージ `Optim.jl`（準Newton法の `BFGS()` や `Newton()`）と `ForwardDiff.jl` を組み合わせることで、同じ考え方をそのまま2母数・5母数のモデルへ拡張できます。",
      ],
    },
    {
      t: "対称なWald区間と、非対称なプロファイル尤度区間",
      b: [
        "`θ̂ ± 1.96 × SE` で作るWald信頼区間は、対数尤度を左右対称な放物線（2次関数）で近似します。しかし標本数が大きくないときや打切りが多いとき、実際の対数尤度は「大きい `θ` 側へなだらかに裾を引く非対称な形」をしています。",
        "そこで逸脱度 `2(ℓ(θ̂) - ℓ(θ))` がカイ二乗分布の95%点（自由度1なら `3.841`）以下になる範囲を直接探す**プロファイル尤度区間**を使うと、尤度本来の非対称性とパラメータ範囲の制約を自然に反映できます。",
      ],
      code: `ll_max = censored_exp_loglik_eta(eta, obs_t, cens_flag)
z = quantile(Normal(), 0.975)
wald_ci = (theta_hat - z * se_theta, theta_hat + z * se_theta)

# 二分探索で 2*(ll_max - ll(θ)) == quantile(Chisq(1), 0.95) の境界を求める
cutoff = quantile(Chisq(1), 0.95)
dev(th) = 2 * (ll_max - censored_exp_loglik_eta(log(th), obs_t, cens_flag))
function bisect_root(f, a, b)
    for _ in 1:60
        m = 0.5 * (a + b)
        (f(a) * f(m) <= 0) ? (b = m) : (a = m)
    end
    return 0.5 * (a + b)
end
prof_ci = (bisect_root(th -> dev(th) - cutoff, 100.0, theta_hat),
           bisect_root(th -> dev(th) - cutoff, theta_hat, 3000.0))

println(round.(wald_ci, digits = 1))
println(round.(prof_ci, digits = 1))`,
      out: `(472.9, 1151.7)
(549.6, 1272.8)`,
      fig: {
        src: "figures/profile-vs-wald.svg",
        alt: "右打切り指数モデルの逸脱度曲線（実線）と対称なWald二次近似（破線）。点推定812.3 msに対し、95%閾値3.841との交点で決まるプロファイル尤度区間は549.6〜1272.8 msと右に広いのに対し、Wald区間は472.9〜1151.7 msと左右対称になる。",
        cap: "実線が真の逸脱度 `2(ℓ(θ̂) − ℓ(θ))`、破線がWald近似です。プロファイル尤度区間（549.6〜1272.8 ms）は「上限側ほど不確かさが大きい」という非対称性を正確に捉えています。",
      },
      a: [
        "なお、自作尤度の最適化では「収束フラグが true だから安心」とは限りません。①全試行が打切り（`k == 0`）のようにデータから母数を識別できないケースは入口で停止させる、②複数の初期値から同じ最大値へ達するか確かめる、③既知の真値からのシミュレーション回復（parameter recovery）を必ず先に通す、の3つを守りましょう。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "1200 msでタイムアウト（右打切り）がある反応時間データから母集団の平均スケールを推定したいとき、タイムアウト試行の扱いとして適切なものはどれでしょう?",
      opts: [
        "実測試行には `logpdf`、タイムアウト試行には「1200 msを超えた確率」を表す `logccdf` を使って対数尤度を組む",
        "タイムアウト試行は正確な値が分からないので、すべてデータから削除して残りの平均を求める",
        "タイムアウト試行はすべてちょうど 1200.0 ms で反応したとみなして通常の標本平均を求める",
      ],
      ans: 0,
      why: "タイムアウト試行を削除したり 1200 ms に固定して通常平均を取ったりすると、長い反応時間の情報が失われて平均を大きく過小評価します。`logccdf` で上側確率として尤度へ組み込みます。",
      hint: "本文で2つの素朴な平均が真値 900 ms に対してどうずれていたかを確認しましょう。",
    },
    {
      k: "fill",
      q: "正の値しか取らないスケール母数 `θ > 0` を制約なしの最適化アルゴリズムで安全に探索するため、対数スケール `eta` から `theta` へ戻す関数名を入力しましょう。",
      code: `theta = 〔?〕(eta) # eta は -∞ 〜 +∞ を自由に動ける`,
      accept: ["exp"],
      show: "exp",
      why: "`eta = log(theta)` と置き、`theta = exp(eta)` で戻せば、`eta` がどの実数値を取っても `theta > 0` が自動的に保たれ、探索中の `DomainError` を防げます。",
      hint: "自然対数 `log` の逆関数です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "自動微分と尤度に基づく区間推定について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "二重数（Dual数）による前進型自動微分は、極小の差分幅 `h` を手動で調整しなくても機械精度で微分係数を計算できる",
          a: true,
          why: "四則演算や初等関数ごとの連鎖律を値と同時に伝播させるため、差分近似の打ち切り誤差や桁落ちに悩まされません。",
        },
        {
          s: "`θ̂ ± 1.96 × SE` のWald信頼区間は、対数尤度が強く歪んでいても常に非対称な区間を返す",
          a: false,
          why: "そのままの尺度で作るWald区間は点推定の周りで常に左右対称です。非対称な尤度形状を捉えるにはプロファイル尤度区間や適切な変換尺度での区間を使います。",
        },
        {
          s: "すべての試行がタイムアウト（非打切り観測が0件）のデータでも、指数分布の平均スケールを一意に最尤推定できる",
          a: false,
          why: "全件が上限を超えたデータでは、平均がいくら大きくても尤度が単調に増え続けるため有限の最尤推定値は定まりません。識別不能な入力は事前に検査して停止させます。",
        },
      ],
      hint: "Dual数の仕組み、Wald区間の式の形、そして `k = 0` のときに `sum(obs_t) / k` がどうなるかを考えましょう。",
    },
    {
      k: "choice",
      q: "1母数モデルで最尤推定値 `θ̂` の周りから95%プロファイル尤度区間を求めるとき、逸脱度 `2(ℓ(θ̂) - ℓ(θ))` と比較する基準値はどれでしょう?",
      opts: [
        "`quantile(Chisq(1), 0.95)`（約 3.841）",
        "`quantile(Normal(), 0.95)`（約 1.645）",
        "`0.05`",
      ],
      ans: 0,
      why: "尤度比統計量 `2(ℓ(θ̂) - ℓ(θ))` は正則条件のもとで漸近的に自由度1のカイ二乗分布 `Chisq(1)` に従うため、95%区間では `quantile(Chisq(1), 0.95) ≈ 3.841` を閾値にします。",
      hint: "図の赤い水平破線に書かれていた分布と数値を思い出しましょう。",
    },
  ],
};
