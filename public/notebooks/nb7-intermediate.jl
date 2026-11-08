### A Pluto.jl notebook ###
# v1.0.3

using Markdown
using InteractiveUtils

# ╔═╡ 7b1d0101-0000-11f1-9a01-000000000001
begin
    using Random
    using Statistics
    using DelimitedFiles
    using LinearAlgebra
end

# ╔═╡ 7b1d0102-0000-11f1-9a01-000000000002
md"""
# NB7: 中級編（高速化・並列化・独自推定）の演習ノート

標準パッケージだけでは扱えない計算負荷や独自の観測過程に対して、**型安定で割当のないループ・再現可能な並列乱数・自動微分による最尤推定とプロファイル尤度・省メモリ分割集計・順序／多項ロジット・カイ二乗／対数線形モデル・予測機械学習とリーク防止CV・多次元／反復データの可視化設計**を自分の手で組み立てます。

先にWeb教材の「型安定性とメモリ割当」「並列モンテカルロと乱数設計」「自作対数尤度と数値最適化」「大規模データの分割読込と省メモリ集計」「順序・多項ロジットの尤度実装と推定」「カイ二乗分析の深化：適合度・正確検定・対数線形モデル」「予測機械学習と検証：Lasso・決定木・リーク防止CV」「多次元・反復データの可視化設計：MakieレイアウトとAlgebraOfGraphics」を読むことを勧めます。標準ライブラリだけでオフライン実行できます。

`# TODO` のセルを書きかえ、下の判定セルが `✅` になることを確認してください。
"""

# ╔═╡ 7b1d0103-0000-11f1-9a01-000000000003
md"""
## 課題1: `@views` で列スライスのヒープ割当をゼロにする

`500 × 40` 行列 `X_mat` について、各列のレンジ `maximum(col) - minimum(col)` の合計を求めます。`col_range_copy_nb7(X_mat)` は毎回 `X[:, j]` をコピーするためヒープ割当が発生します。

`@views` を使ってコピー割当をなくした関数を書き、1回ウォームアップしたうえで、次の NamedTuple を `views_summary` に入れましょう。

```julia
(total = 列レンジ合計,
 bytes = ウォームアップ後の @allocated バイト数)
```
"""

# ╔═╡ 7b1d0104-0000-11f1-9a01-000000000004
begin
    X_mat = reshape(collect(1.0:20_000.0), 500, 40)
    function col_range_copy_nb7(X::Matrix{Float64})
        s = 0.0
        for j in axes(X, 2)
            col = X[:, j]
            s += maximum(col) - minimum(col)
        end
        return s
    end
end

# ╔═╡ 7b1d0105-0000-11f1-9a01-000000000005
views_summary = missing # TODO: @views を使う関数を定義し、ウォームアップ後に (total = ..., bytes = ...) を返す

# ╔═╡ 7b1d0106-0000-11f1-9a01-000000000006
if views_summary === missing
    md"⏳ `@views` で列レンジ合計を求め、ウォームアップ後の `@allocated` と一緒に `(total = ..., bytes = ...)` を返します。"
elseif views_summary isa NamedTuple &&
       all(k -> hasproperty(views_summary, k), (:total, :bytes)) &&
       views_summary.total isa Real && !(views_summary.total isa Bool) && isfinite(views_summary.total) &&
       views_summary.bytes isa Integer && !(views_summary.bytes isa Bool)
    if isapprox(views_summary.total, col_range_copy_nb7(X_mat); atol = 1e-10) && views_summary.bytes == 0
        md"✅ **正解!** 基準実装と完全に同じ合計値 `19960.0` を保ったまま、ヒープ割当を `0` バイトにできました。"
    elseif isapprox(views_summary.total, col_range_copy_nb7(X_mat); atol = 1e-10)
        md"🤔 合計値は一致していますが、`bytes` が `0` になっていません。関数にまとめ、`@views` を付け、1回ウォームアップしてから `@allocated` を測ってください。"
    else
        md"🤔 `total` が `col_range_copy_nb7(X_mat)` と一致していません。各列の `maximum(col) - minimum(col)` を全40列で足し合わせてください。"
    end
else
    md"🤔 `(total = 数値, bytes = 整数)` の NamedTuple を `views_summary` に入れてください。"
end

# ╔═╡ 7b1d0107-0000-11f1-9a01-000000000007
md"""
## 課題2: 反復IDごとの独立RNGで並列モンテカルロを再現可能にする

`trial_rng_nb7(base_seed, sim_id)` は、基準シードと反復番号の組から独立した `Xoshiro` を作ります。下のセルでは逐次実行 `serial_diffs_nb7`（基準シード `2026`、反復数 `400`）を計算しています。

事前確保した `Vector{Float64}(undef, 400)` と `Threads.@threads` を使って同じ400反復を計算し、次の NamedTuple を `parallel_mc` に入れましょう。

```julia
(diffs = 400反復の平均差ベクトル,
 match_serial = (diffs == serial_diffs_nb7),
 mean_diff = mean(diffs))
```
"""

# ╔═╡ 7b1d0108-0000-11f1-9a01-000000000008
begin
    trial_rng_nb7(base_seed::Integer, sim_id::Integer) =
        Xoshiro(UInt64[UInt64(base_seed), UInt64(sim_id)])

    function one_diff_nb7(rng::AbstractRNG)
        a = 500.0 .+ 50.0 .* randn(rng, 30)
        b = 525.0 .+ 50.0 .* randn(rng, 30)
        return mean(b) - mean(a)
    end

    serial_diffs_nb7 = [one_diff_nb7(trial_rng_nb7(2026, i)) for i in 1:400]
end

# ╔═╡ 7b1d0109-0000-11f1-9a01-000000000009
parallel_mc = missing # TODO: Threads.@threads と事前確保配列で計算し、(diffs = ..., match_serial = ..., mean_diff = ...) を返す

# ╔═╡ 7b1d0110-0000-11f1-9a01-000000000010
if parallel_mc === missing
    md"⏳ `trial_rng_nb7(2026, i)` と事前確保配列で400反復を計算し、逐次実行との一致を確認します。"
elseif parallel_mc isa NamedTuple &&
       all(k -> hasproperty(parallel_mc, k), (:diffs, :match_serial, :mean_diff)) &&
       parallel_mc.diffs isa AbstractVector && length(parallel_mc.diffs) == 400 &&
       all(x -> x isa Real && !(x isa Bool) && isfinite(x), parallel_mc.diffs) &&
       parallel_mc.match_serial isa Bool &&
       parallel_mc.mean_diff isa Real && !(parallel_mc.mean_diff isa Bool) && isfinite(parallel_mc.mean_diff)
    if parallel_mc.match_serial === true &&
       parallel_mc.diffs == serial_diffs_nb7 &&
       isapprox(parallel_mc.mean_diff, mean(serial_diffs_nb7); atol = 1e-12)
        md"✅ **正解!** スレッド数や実行順序に依存せず、逐次実行の400反復と1ビットの狂いもなく一致しました。"
    else
        md"🤔 `out[i] = one_diff_nb7(trial_rng_nb7(2026, i))` で各反復専用のRNGを渡し、共有RNGや `push!` を使わないことを確認してください。"
    end
else
    md"🤔 `(diffs = 長さ400の数値配列, match_serial = Bool, mean_diff = 数値)` の形にしてください。"
end

# ╔═╡ 7b1d0111-0000-11f1-9a01-000000000011
md"""
## 課題3: 二重数（自動微分）による右打切り最尤推定とプロファイル尤度区間

上限 `1200.0` ms で右打切りされた28試行のデータ `obs_rt_nb7`・`cens_rt_nb7` に対して、無制約パラメータ `eta = log(theta)` の対数尤度 `censored_loglik_eta_nb7` と二重数 `Dual_nb7`、二分探索 `bisect_nb7` を用意しました。

1. `Dual_nb7(eta, 1.0)` の微分係数 `.der` と2階微分 `-sum(obs_rt_nb7) / exp(eta)` を用いたNewton法で最尤推定値 `theta_hat = exp(eta)` を求める
2. 逸脱度 `dev(th) = 2 * (ll_max - censored_loglik_eta_nb7(log(th), obs_rt_nb7, cens_rt_nb7))` が `CHISQ1_95_NB7`（`3.8414588...`）と交わる下限 `prof_low`（探索範囲 `100.0..theta_hat`）と上限 `prof_high`（探索範囲 `theta_hat..3000.0`）を求める

結果を `(theta_hat = ..., prof_low = ..., prof_high = ...)` として `censored_mle` に入れましょう（ループで変数を更新するときは関数にするか `let ... end` で囲むとスコープが明快です）。
"""

# ╔═╡ 7b1d0112-0000-11f1-9a01-000000000012
begin
    struct Dual_nb7 <: Real
        val::Float64
        der::Float64
    end
    Base.promote_rule(::Type{Dual_nb7}, ::Type{<:Real}) = Dual_nb7
    Base.convert(::Type{Dual_nb7}, x::Real) = Dual_nb7(Float64(x), 0.0)
    Base.convert(::Type{Dual_nb7}, x::Dual_nb7) = x
    Base.:+(a::Dual_nb7, b::Dual_nb7) = Dual_nb7(a.val + b.val, a.der + b.der)
    Base.:-(a::Dual_nb7, b::Dual_nb7) = Dual_nb7(a.val - b.val, a.der - b.der)
    Base.:-(a::Dual_nb7) = Dual_nb7(-a.val, -a.der)
    Base.:*(a::Dual_nb7, b::Dual_nb7) = Dual_nb7(a.val * b.val, a.der * b.val + a.val * b.der)
    Base.:/(a::Dual_nb7, b::Dual_nb7) = Dual_nb7(a.val / b.val, (a.der * b.val - a.val * b.der) / b.val^2)
    Base.exp(a::Dual_nb7) = (e = exp(a.val); Dual_nb7(e, e * a.der))
    Base.log(a::Dual_nb7) = Dual_nb7(log(a.val), a.der / a.val)

    obs_rt_nb7, cens_rt_nb7 = let rng = Xoshiro(4301)
        # 一様乱数の逆変換 -900 * log(1 - u) による平均900ms指数乱数28件
        raw_t = [-900.0 * log1p(-rand(rng)) for _ in 1:28]
        (min.(raw_t, 1200.0), raw_t .>= 1200.0)
    end

    function censored_loglik_eta_nb7(eta::Real, times, is_censored)
        k = count(!, is_censored)
        return -k * eta - sum(times) / exp(eta)
    end

    CHISQ1_95_NB7 = 3.8414588206941285

    function bisect_nb7(f, a::Float64, b::Float64)
        for _ in 1:60
            m = 0.5 * (a + b)
            (f(a) * f(m) <= 0.0) ? (b = m) : (a = m)
        end
        return 0.5 * (a + b)
    end
end

# ╔═╡ 7b1d0113-0000-11f1-9a01-000000000013
censored_mle = missing # TODO: Newton法とbisect_nb7で (theta_hat = ..., prof_low = ..., prof_high = ...) を計算

# ╔═╡ 7b1d0114-0000-11f1-9a01-000000000014
if censored_mle === missing
    md"⏳ `Dual_nb7` の勾配で `theta_hat` を求め、95%プロファイル尤度区間の下限・上限とまとめます。"
elseif censored_mle isa NamedTuple &&
       all(k -> hasproperty(censored_mle, k), (:theta_hat, :prof_low, :prof_high)) &&
       all(k -> (v = getproperty(censored_mle, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:theta_hat, :prof_low, :prof_high))
    let exact_th = sum(obs_rt_nb7) / count(!, cens_rt_nb7),
        ll_max = censored_loglik_eta_nb7(log(exact_th), obs_rt_nb7, cens_rt_nb7),
        th = Float64(censored_mle.theta_hat),
        lo = Float64(censored_mle.prof_low),
        hi = Float64(censored_mle.prof_high)
        if lo > 0.0 && lo < th < hi &&
           isapprox(th, exact_th; rtol = 1e-6) &&
           isapprox(2.0 * (ll_max - censored_loglik_eta_nb7(log(lo), obs_rt_nb7, cens_rt_nb7)), CHISQ1_95_NB7; atol = 1e-4) &&
           isapprox(2.0 * (ll_max - censored_loglik_eta_nb7(log(hi), obs_rt_nb7, cens_rt_nb7)), CHISQ1_95_NB7; atol = 1e-4)
            md"✅ **正解!** 解析解と一致する最尤推定値と、右裾へ非対称に広がる95%プロファイル尤度区間が求まりました。"
        else
            md"🤔 `theta_hat` が `sum(obs_rt_nb7) / count(!, cens_rt_nb7)` と一致しているか、逸脱度 `2 * (ll_max - ll(th))` と `CHISQ1_95_NB7` の差を二分探索しているか確認してください。"
        end
    end
else
    md"🤔 `(theta_hat = 数値, prof_low = 数値, prof_high = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 7b1d0115-0000-11f1-9a01-000000000015
md"""
## 課題4: 分割CSVを `RunningStats` で省メモリ結合し、中央値の反例を確認する

一時ディレクトリ内の3つの分割CSV `chunk_paths_nb7`（1列の数値データ、不均等サイズ）を順に読み、全件を1つの配列へ結合せずに `RunningStats_nb7`（Chan–Welford法）で全体の件数・平均・不偏分散を求めます。あわせて、各チャンクの中央値を単純平均した値と真の全体中央値 `median(all_stream_ref_nb7)` の差（絶対値）も確認しましょう。

```julia
(n = 総件数,
 mean = 結合後の平均,
 var = 結合後の不偏分散,
 chunk_median_gap = abs(mean(チャンク別中央値) - median(all_stream_ref_nb7)))
```
"""

# ╔═╡ 7b1d0116-0000-11f1-9a01-000000000016
begin
    struct RunningStats_nb7
        n::Int
        mean::Float64
        m2::Float64
    end
    RunningStats_nb7() = RunningStats_nb7(0, 0.0, 0.0)

    function push_val_nb7(s::RunningStats_nb7, x::Real)
        n1 = s.n + 1
        d = Float64(x) - s.mean
        m1 = s.mean + d / n1
        return RunningStats_nb7(n1, m1, s.m2 + d * (Float64(x) - m1))
    end

    function merge_stats_nb7(a::RunningStats_nb7, b::RunningStats_nb7)
        a.n == 0 && return b
        b.n == 0 && return a
        n = a.n + b.n
        d = b.mean - a.mean
        return RunningStats_nb7(n, a.mean + d * (b.n / n), a.m2 + b.m2 + d^2 * (a.n * b.n / n))
    end

    sample_var_nb7(s::RunningStats_nb7) = s.m2 / (s.n - 1)

    stream_dir_nb7 = mktempdir()
    raw_chunks_nb7 = [
        1.0e8 .+ [410.0, 420.0, 430.0, 890.0, 920.0],
        1.0e8 .+ [435.0, 445.0, 950.0],
        1.0e8 .+ [980.0],
    ]
    chunk_paths_nb7 = [
        begin
            p = joinpath(stream_dir_nb7, "part_$(idx).csv")
            writedlm(p, vals, ',')
            p
        end
        for (idx, vals) in enumerate(raw_chunks_nb7)
    ]
    all_stream_ref_nb7 = reduce(vcat, raw_chunks_nb7)
end

# ╔═╡ 7b1d0117-0000-11f1-9a01-000000000017
chunk_summary = missing # TODO: chunk_paths_nb7 を順に読んで RunningStats_nb7 を結合し、(n = ..., mean = ..., var = ..., chunk_median_gap = ...) を返す

# ╔═╡ 7b1d0118-0000-11f1-9a01-000000000018
if chunk_summary === missing
    md"⏳ 3つの分割CSVを `RunningStats_nb7` で集計・結合し、全体基準値およびチャンク中央値平均のずれを確認します。"
elseif chunk_summary isa NamedTuple &&
       all(k -> hasproperty(chunk_summary, k), (:n, :mean, :var, :chunk_median_gap)) &&
       chunk_summary.n isa Integer && !(chunk_summary.n isa Bool) &&
       all(k -> (v = getproperty(chunk_summary, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:mean, :var, :chunk_median_gap))
    let expected_gap = abs(mean(median.(raw_chunks_nb7)) - median(all_stream_ref_nb7))
        if chunk_summary.n == length(all_stream_ref_nb7) &&
           isapprox(chunk_summary.mean, mean(all_stream_ref_nb7); rtol = 1e-13) &&
           isapprox(chunk_summary.var, var(all_stream_ref_nb7); rtol = 1e-10) &&
           isapprox(chunk_summary.chunk_median_gap, expected_gap; atol = 1e-9)
            md"✅ **正解!** `10^8` の大きなオフセットがあっても桁落ちせず平均・不偏分散が一致し、チャンク別中央値の単純平均が全体中央値から大きくずれることも確認できました。"
        else
            md"🤔 `vec(readdlm(p, ',', Float64))` で各チャンクを読み、`merge_stats_nb7` と `sample_var_nb7` を使っているか確認してください。"
        end
    end
else
    md"🤔 `(n = 整数, mean = 数値, var = 数値, chunk_median_gap = 数値)` の形にしてください。"
end

# ╔═╡ 7b1d011a-0000-11f1-9a01-00000000001a
md"""
## 課題5: 順序閾値の無制約変換・安定 `softmax`・RPS を実装する

順序・多項データの尤度実装で土台になる3つの部品を確かめます。

1. 無制約ベクトル `raw_cut_nb7 = [-0.4, 0.5, 0.2]` から単調増加閾値 `cutpoints`（`c[1] = raw[1]`, `k >= 2` は `c[k] = c[k - 1] + exp(raw[k])`）を作る
2. 素朴な `exp` では `Inf / Inf = NaN` になる `extreme_logits_nb7 = [1000.0, 1001.0, 999.0]` に対し、最大値引き `logsumexp` を使った安定な `probs`（`softmax`）を計算する
3. 真の順序カテゴリ `true_ord_nb7 = 4`（全4段階）に対して、`forecast_near_nb7 = [0.05, 0.05, 0.70, 0.20]` と `forecast_far_nb7 = [0.70, 0.05, 0.05, 0.20]` の **Ranked Probability Score（RPS）** `sum_{k=1}^{K-1} (F_k - I(y <= k))^2 / (K - 1)` をそれぞれ求める

次の NamedTuple を `categorical_check` に入れましょう。

```julia
(cutpoints = 長さ3の単調増加閾値ベクトル,
 probs = extreme_logits_nb7 の安定 softmax ベクトル,
 rps_near = forecast_near_nb7 の RPS,
 rps_far = forecast_far_nb7 の RPS)
```
"""

# ╔═╡ 7b1d011b-0000-11f1-9a01-00000000001b
begin
    raw_cut_nb7 = [-0.4, 0.5, 0.2]
    extreme_logits_nb7 = [1000.0, 1001.0, 999.0]
    true_ord_nb7 = 4
    forecast_near_nb7 = [0.05, 0.05, 0.70, 0.20]
    forecast_far_nb7 = [0.70, 0.05, 0.05, 0.20]
end

# ╔═╡ 7b1d011c-0000-11f1-9a01-00000000001c
categorical_check = missing # TODO: 無制約閾値変換・安定softmax・RPSを計算し、(cutpoints = ..., probs = ..., rps_near = ..., rps_far = ...) を返す

# ╔═╡ 7b1d011d-0000-11f1-9a01-00000000001d
if categorical_check === missing
    md"⏳ `c[k] = c[k - 1] + exp(raw[k])`、最大値引き `logsumexp`、累積予測確率の二乗誤差平均 RPS をまとめて確認します。"
elseif categorical_check isa NamedTuple &&
       all(k -> hasproperty(categorical_check, k), (:cutpoints, :probs, :rps_near, :rps_far)) &&
       categorical_check.cutpoints isa AbstractVector && length(categorical_check.cutpoints) == 3 &&
       all(x -> x isa Real && !(x isa Bool) && isfinite(x), categorical_check.cutpoints) &&
       categorical_check.probs isa AbstractVector && length(categorical_check.probs) == 3 &&
       all(x -> x isa Real && !(x isa Bool) && isfinite(x), categorical_check.probs) &&
       all(k -> (v = getproperty(categorical_check, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:rps_near, :rps_far))
    let ref_c = [raw_cut_nb7[1], raw_cut_nb7[1] + exp(raw_cut_nb7[2]), raw_cut_nb7[1] + exp(raw_cut_nb7[2]) + exp(raw_cut_nb7[3])],
        ref_lse = 1001.0 + log(exp(-1.0) + 1.0 + exp(-2.0)),
        ref_p = exp.(extreme_logits_nb7 .- ref_lse),
        rps_ref(p, y) = begin
            K = length(p)
            F = 0.0
            s = 0.0
            for k in 1:(K - 1)
                F += p[k]
                s += (F - (y <= k ? 1.0 : 0.0))^2
            end
            s / (K - 1)
        end,
        rn = rps_ref(forecast_near_nb7, true_ord_nb7),
        rf = rps_ref(forecast_far_nb7, true_ord_nb7)
        if issorted(categorical_check.cutpoints; lt = <) &&
           isapprox(categorical_check.cutpoints, ref_c; atol = 1e-12) &&
           isapprox(categorical_check.probs, ref_p; atol = 1e-12) &&
           isapprox(categorical_check.rps_near, rn; atol = 1e-12) &&
           isapprox(categorical_check.rps_far, rf; atol = 1e-12) &&
           categorical_check.rps_near < categorical_check.rps_far
            md"✅ **正解!** 閾値の単調増加性を保ち、`1000` 超のロジットでも桁あふれせず確率へ変換し、さらに同じ正解確率 `0.20` でも順序的に近い予測のほうがRPSで小さく評価されることを確認できました。"
        else
            md"🤔 `c[1] = raw[1]` と `exp(raw[k])` の累積、`maximum(z)` を引いた `logsumexp`、および `k = 1..(K-1)` にわたる累積確率 `F_k` と `I(y <= k)` の二乗差平均（分母 `K - 1`）を確認してください。"
        end
    end
else
    md"🤔 `(cutpoints = 長さ3の数値ベクトル, probs = 長さ3の数値ベクトル, rps_near = 数値, rps_far = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 7b1d011e-0000-11f1-9a01-00000000001e
md"""
## 課題6: 適合度カイ二乗の割合入力罠・3元表の条件付き独立 `G²`・準独立モデルを検証する

カイ二乗分析と対数線形モデルの3つの核心性質を確かめます。

1. 理論比率 `probs_gof_nb7 = [0.25, 0.25, 0.50]` に対し、実度数 `obs_n40_nb7 = [14, 6, 20]` の `chi2_n40` と効果量 `w_n40 = sqrt(chi2_n40 / 40)`、およびパーセント `[35.0, 15.0, 50.0]` を誤入力したときの `chi2_pct` を求める
2. 3元分割表 `N3_nb7`（`2 × 2 × 2`）について、`B`（第2次元）を潰した周辺 `A × C` 表の独立性尤度比 `g2_marginal` と、条件付き独立 `A ⊥ C | B`（期待度数 `E[i, j, k] = N_ij[i, j, 1] * N_jk[1, j, k] / N_j[1, j, 1]`）の尤度比 `g2_cond` を `g2_dev_nb7` で求める

次の NamedTuple を `chisq_loglinear_check` に入れましょう。

```julia
(chi2_n40 = 実度数N=40のPearson χ²,
 chi2_pct = パーセント誤入力時のPearson χ²,
 w_n40 = 実度数N=40のCohenのw,
 g2_marginal = 周辺A×C表のG²,
 g2_cond = 条件付き独立 A⊥C|B のG²)
```
"""

# ╔═╡ 7b1d011f-0000-11f1-9a01-00000000001f
begin
    probs_gof_nb7 = [0.25, 0.25, 0.50]
    obs_n40_nb7 = [14, 6, 20]
    obs_pct_nb7 = [35.0, 15.0, 50.0]
    g2_dev_nb7(obs, exp_arr) = sum(o > 0 ? 2.0 * o * log(o / e) : 0.0 for (o, e) in zip(obs, exp_arr))

    N3_nb7 = Array{Int}(undef, 2, 2, 2)
    N3_nb7[:, 1, :] = [65 15; 16 4]
    N3_nb7[:, 2, :] = [8 32; 31 129]
end

# ╔═╡ 7b1d0120-0000-11f1-9a01-000000000020
chisq_loglinear_check = missing # TODO: (chi2_n40 = ..., chi2_pct = ..., w_n40 = ..., g2_marginal = ..., g2_cond = ...) を計算

# ╔═╡ 7b1d0121-0000-11f1-9a01-000000000021
if chisq_loglinear_check === missing
    md"⏳ 適合度 `χ²` の標本サイズ依存性と効果量 `w`、および3元表の周辺連関 `G²` 対 条件付き独立 `G²` を比較します。"
elseif chisq_loglinear_check isa NamedTuple &&
       all(k -> hasproperty(chisq_loglinear_check, k), (:chi2_n40, :chi2_pct, :w_n40, :g2_marginal, :g2_cond)) &&
       all(k -> (v = getproperty(chisq_loglinear_check, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:chi2_n40, :chi2_pct, :w_n40, :g2_marginal, :g2_cond))
    let c40 = sum((obs_n40_nb7 .- 40.0 .* probs_gof_nb7).^2 ./ (40.0 .* probs_gof_nb7)),
        cpct = sum((obs_pct_nb7 .- 100.0 .* probs_gof_nb7).^2 ./ (100.0 .* probs_gof_nb7)),
        tab_ac = dropdims(sum(N3_nb7; dims = 2); dims = 2),
        exp_ac = (sum(tab_ac; dims = 2) * sum(tab_ac; dims = 1)) ./ sum(tab_ac),
        nij = sum(N3_nb7; dims = 3),
        njk = sum(N3_nb7; dims = 1),
        nj = sum(N3_nb7; dims = (1, 3)),
        e_cond = [nij[i, j, 1] * njk[1, j, k] / nj[1, j, 1] for i in 1:2, j in 1:2, k in 1:2]
        if isapprox(chisq_loglinear_check.chi2_n40, c40; atol = 1e-12) &&
           isapprox(chisq_loglinear_check.chi2_pct, cpct; atol = 1e-12) &&
           isapprox(chisq_loglinear_check.w_n40, sqrt(c40 / 40.0); atol = 1e-12) &&
           isapprox(chisq_loglinear_check.g2_marginal, g2_dev_nb7(tab_ac, exp_ac); atol = 1e-10) &&
           isapprox(chisq_loglinear_check.g2_cond, g2_dev_nb7(N3_nb7, e_cond); atol = 1e-10)
            md"✅ **正解!** パーセント誤入力で `χ²` が `3.2 → 8.0` に膨らむ一方、3元表では見かけの周辺連関 `G² = 36.41` が `B` の条件づけで `0.024` へ消えることを確認できました。"
        else
            md"🤔 期待度数 `sum(obs) .* probs_gof_nb7`、周辺表 `dropdims(sum(N3_nb7; dims = 2); dims = 2)`、および条件付き独立の期待度数 `N_ij * N_jk / N_j` を確認してください。"
        end
    end
else
    md"🤔 `(chi2_n40 = 数値, chi2_pct = 数値, w_n40 = 数値, g2_marginal = 数値, g2_cond = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 7b1d0122-0000-11f1-9a01-000000000022
md"""
## 課題7: 軟閾値座標降下法（Lasso）と交差検証の事前変数選択リークを検証する

予測機械学習の2つの核心——スパース正則化と交差検証のリーク防止——を純Juliaで確かめます。

1. `X_las_tr_nb7`（`55 × 30`）を平均 `xm`・母標準偏差 `xs = vec(std(X_las_tr_nb7; dims = 1, corrected = false))` で標準化した `Z` と中心化応答 `yc = y_las_tr_nb7 .- mean(y_las_tr_nb7)` に対し、軟閾値 `soft_thresh_nb7(z, 0.32)` を使う座標降下法（最大400反復、収束閾値 `1e-9`）でLasso係数 `b_std` を求め、非ゼロ係数個数 `nnz_lasso` とテストデータ `(X_las_te_nb7, y_las_te_nb7)` 上の予測RMSE `lasso_rmse` を計算する
2. 純ノイズデータ `(X_noise_nb7, y_noise_nb7)`（`60 × 300`、真の `R² = 0`）に対し、全60行で `|cor(X[:, j], y)|` 上位8列を先に選んでから5分割CV（12行ずつ順分割）した `leaked_r2` と、各foldの訓練48行の内部だけで上位8列を選び直した `honest_r2` を計算する

次の NamedTuple を `lasso_cv_check` に入れましょう。

```julia
(lasso_rmse = LassoのテストRMSE,
 nnz_lasso = 非ゼロ標準化係数の個数,
 leaked_r2 = 事前選択リーク時の5分割CV R²,
 honest_r2 = 各fold内で選択した誠実な5分割CV R²)
```
"""

# ╔═╡ 7b1d0123-0000-11f1-9a01-000000000023
begin
    soft_thresh_nb7(z::Float64, g::Float64) = sign(z) * max(abs(z) - g, 0.0)
    let rng = Xoshiro(4701)
        global X_las_tr_nb7 = randn(rng, 55, 30)
        tb = vcat([1.6, -1.2, 0.9], zeros(27))
        global y_las_tr_nb7 = 0.5 .+ X_las_tr_nb7 * tb .+ randn(rng, 55)
        global X_las_te_nb7 = randn(rng, 300, 30)
        global y_las_te_nb7 = 0.5 .+ X_las_te_nb7 * tb .+ randn(rng, 300)
    end
    let rng_lk = Xoshiro(4704)
        global X_noise_nb7 = randn(rng_lk, 60, 300)
        global y_noise_nb7 = randn(rng_lk, 60)
    end
end

# ╔═╡ 7b1d0124-0000-11f1-9a01-000000000024
lasso_cv_check = missing # TODO: (lasso_rmse = ..., nnz_lasso = ..., leaked_r2 = ..., honest_r2 = ...) を計算

# ╔═╡ 7b1d0125-0000-11f1-9a01-000000000025
if lasso_cv_check === missing
    md"⏳ 軟閾値座標降下によるLassoテストRMSEと、純ノイズでの事前スクリーニング・リーク対fold内選択の `CV R²` を比較します。"
elseif lasso_cv_check isa NamedTuple &&
       all(k -> hasproperty(lasso_cv_check, k), (:lasso_rmse, :nnz_lasso, :leaked_r2, :honest_r2)) &&
       all(k -> (v = getproperty(lasso_cv_check, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:lasso_rmse, :nnz_lasso, :leaked_r2, :honest_r2))
    let ref = let n = size(X_las_tr_nb7, 1),
            p = size(X_las_tr_nb7, 2),
            ym = mean(y_las_tr_nb7),
            xm = vec(mean(X_las_tr_nb7; dims = 1)),
            xs = vec(std(X_las_tr_nb7; dims = 1, corrected = false)),
            Z = (X_las_tr_nb7 .- xm') ./ xs',
            b = zeros(Float64, p),
            r = y_las_tr_nb7 .- ym
            for _ in 1:400
                md = 0.0
                @views for j in 1:p
                    zj, ob = Z[:, j], b[j]
                    nb = soft_thresh_nb7(dot(zj, r) / n + ob, 0.32)
                    if nb != ob
                        r .-= (nb - ob) .* zj
                        b[j] = nb
                        md = max(md, abs(nb - ob))
                    end
                end
                md < 1e-9 && break
            end
            beta = b ./ xs
            ic = ym - dot(xm, beta)
            l_rmse = sqrt(mean((y_las_te_nb7 .- (ic .+ X_las_te_nb7 * beta)).^2))
            sel_lk = partialsortperm([abs(cor(@view(X_noise_nb7[:, j]), y_noise_nb7)) for j in 1:300], 1:8; rev = true)
            pl, ph = similar(y_noise_nb7), similar(y_noise_nb7)
            for k in 1:5
                va = ((k - 1) * 12 + 1):(k * 12)
                tr = setdiff(1:60, va)
                pl[va] = hcat(ones(12), X_noise_nb7[va, sel_lk]) * (hcat(ones(48), X_noise_nb7[tr, sel_lk]) \ y_noise_nb7[tr])
                sel_tr = partialsortperm([abs(cor(@view(X_noise_nb7[tr, j]), @view(y_noise_nb7[tr]))) for j in 1:300], 1:8; rev = true)
                ph[va] = hcat(ones(12), X_noise_nb7[va, sel_tr]) * (hcat(ones(48), X_noise_nb7[tr, sel_tr]) \ y_noise_nb7[tr])
            end
            sst = sum((y_noise_nb7 .- mean(y_noise_nb7)).^2)
            (rmse = l_rmse, nnz = count(!iszero, b),
             lk = 1.0 - sum((y_noise_nb7 .- pl).^2) / sst,
             ho = 1.0 - sum((y_noise_nb7 .- ph).^2) / sst)
        end
        if isapprox(lasso_cv_check.lasso_rmse, ref.rmse; atol = 1e-8) &&
           lasso_cv_check.nnz_lasso == ref.nnz &&
           isapprox(lasso_cv_check.leaked_r2, ref.lk; atol = 1e-9) &&
           isapprox(lasso_cv_check.honest_r2, ref.ho; atol = 1e-9)
            md"✅ **正解!** Lassoで30変数中4個だけを残してテストRMSEを `1.394`（OLSは `1.83`）へ抑え、また分割前の変数選択が純ノイズから `R² = 0.312` を捏造する一方、fold内選択なら `-0.404` で正しく棄却できることを確認しました。"
        else
            md"🤔 `corrected = false` の標準化 `Z` に対する `dot(zj, r) / n + old_b` の軟閾値更新と、各fold `va = ((k-1)*12+1):(k*12)` における訓練行 `tr` 限定の相関上位8列選択を確認してください。"
        end
    end
else
    md"🤔 `(lasso_rmse = 数値, nnz_lasso = 整数, leaked_r2 = 数値, honest_r2 = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 7b1d0126-0000-11f1-9a01-000000000026
md"""
## 課題8: 反復測定の個人内SE・リンク尺度リボン・発散パレットのゼロ中心計算

図を描く前の「誤差構造と尺度変換の数値設計」を検算します。

1. 対応データ `(pre_vis_nb7, post_vis_nb7)`（`n = 24`）に対し、全体平均 `grand_m = 0.5 * (mean(pre_vis_nb7) + mean(post_vis_nb7))` と参加者平均 `subj_m = 0.5 .* (pre_vis_nb7 .+ post_vis_nb7)` を用いた正規化値 `pre_norm = pre_vis_nb7 .- subj_m .+ grand_m` から、Cousineau–Morey の個人内標準誤差 `ws_morey_se = std(pre_norm) / sqrt(24) * sqrt(2.0)` を求める
2. ロジスティック回帰の線形予測子 `eta_vis_nb7 = -3.35, se_eta_vis_nb7 = 0.68`（`p_hat = logistic_vis_nb7(eta_vis_nb7)`）に対し、確率尺度での素朴な下端 `naive_prob_lo = p_hat - 1.96 * p_hat * (1 - p_hat) * se_eta_vis_nb7`（負値へ突き抜ける反例）と、logit空間で引いてから逆変換した下端 `link_prob_lo = logistic_vis_nb7(eta_vis_nb7 - 1.96 * se_eta_vis_nb7)` を求める
3. 残差配列 `res_div_nb7 = [-0.8, -0.2, 0.0, 1.1, 2.4]` を自動範囲 `[vmin, vmax]` で正規化したときに `0.0` が置かれる位置 `auto_zero_pos = (0.0 - vmin) / (vmax - vmin)` を確認する（対称 `colorrange = (-m, m)` なら `0.5`）

次の NamedTuple を `vis_scale_summary` に入れましょう。

```julia
(ws_morey_se = Morey補正つきの個人内SE,
 naive_prob_lo = 確率尺度±1.96SEの下端,
 link_prob_lo = リンク尺度から逆変換した下端,
 auto_zero_pos = 自動範囲[-0.8, 2.4]における0.0の正規化位置)
```
"""

# ╔═╡ 7b1d0127-0000-11f1-9a01-000000000027
begin
    logistic_vis_nb7(z) = 1.0 / (1.0 + exp(-z))
    eta_vis_nb7 = -3.35
    se_eta_vis_nb7 = 0.68
    res_div_nb7 = [-0.8, -0.2, 0.0, 1.1, 2.4]
    let rng = Xoshiro(4801)
        global pre_vis_nb7 = 520.0 .+ 85.0 .* randn(rng, 24)
        global post_vis_nb7 = pre_vis_nb7 .+ (-18.5 .+ 11.0 .* randn(rng, 24))
    end
end

# ╔═╡ 7b1d0128-0000-11f1-9a01-000000000028
vis_scale_summary = missing # TODO: (ws_morey_se = ..., naive_prob_lo = ..., link_prob_lo = ..., auto_zero_pos = ...) を計算

# ╔═╡ 7b1d0129-0000-11f1-9a01-000000000029
if vis_scale_summary === missing
    md"⏳ 対応データの個人内SE、ロジット空間リボンの下端、発散パレットの自動範囲でのゼロ位置を計算します。"
elseif vis_scale_summary isa NamedTuple &&
       all(k -> hasproperty(vis_scale_summary, k), (:ws_morey_se, :naive_prob_lo, :link_prob_lo, :auto_zero_pos)) &&
       all(k -> (v = getproperty(vis_scale_summary, k); v isa Real && !(v isa Bool) && isfinite(v)),
           (:ws_morey_se, :naive_prob_lo, :link_prob_lo, :auto_zero_pos))
    let gm = 0.5 * (mean(pre_vis_nb7) + mean(post_vis_nb7)),
        sm = 0.5 .* (pre_vis_nb7 .+ post_vis_nb7),
        ref_ws = std(pre_vis_nb7 .- sm .+ gm) / sqrt(24.0) * sqrt(2.0),
        ph = logistic_vis_nb7(eta_vis_nb7),
        ref_nlo = ph - 1.96 * ph * (1.0 - ph) * se_eta_vis_nb7,
        ref_llo = logistic_vis_nb7(eta_vis_nb7 - 1.96 * se_eta_vis_nb7),
        vmin = minimum(res_div_nb7),
        vmax = maximum(res_div_nb7),
        ref_az = (0.0 - vmin) / (vmax - vmin)
        if isapprox(vis_scale_summary.ws_morey_se, ref_ws; atol = 1e-9) &&
           isapprox(vis_scale_summary.naive_prob_lo, ref_nlo; atol = 1e-9) &&
           isapprox(vis_scale_summary.link_prob_lo, ref_llo; atol = 1e-9) &&
           isapprox(vis_scale_summary.auto_zero_pos, ref_az; atol = 1e-12) &&
           vis_scale_summary.naive_prob_lo < 0.0 && vis_scale_summary.link_prob_lo > 0.0
            md"✅ **正解!** 群間SE（`16.64`）に対して個人内SEが `1.57` まで縮むこと、リンク尺度リボンなら下端が `+0.0092` と負値突破（`-0.0097`）を防げること、非対称範囲のままではゼロが `0.25` にズレることを確認しました。"
        else
            md"🤔 Morey補正係数 `sqrt(2.0)`、デルタ法 `ph * (1 - ph) * se_eta_vis_nb7`、および `(0.0 - minimum(res_div_nb7)) / (maximum(res_div_nb7) - minimum(res_div_nb7))` を確認してください。"
        end
    end
else
    md"🤔 `(ws_morey_se = 数値, naive_prob_lo = 数値, link_prob_lo = 数値, auto_zero_pos = 数値)` の NamedTuple を返してください。"
end

# ╔═╡ 7b1d0119-0000-11f1-9a01-000000000019
md"""
## おつかれさまでした

8つの課題を通して、Juliaで本格的なシミュレーション・独自モデルの推定・予測検証・論文品質の可視化設計を行うための土台を確認しました。

1. `@views` とウォームアップ後の `@allocated` で不要な配列コピーをなくす
2. `trial_rng(seed, i)` と事前確保配列で、スレッド数に依存しない並列モンテカルロを作る
3. 二重数による自動微分とプロファイル尤度で、打切りを含む独自対数尤度を推定する
4. Chan–Welford法で分割データを定数メモリのまま正確に結合し、非加法的な分位点との違いを区別する
5. 単調閾値変換・安定 `logsumexp`・RPS で順序データと多値データの予測分布を安全に扱う
6. カイ二乗統計量の度数スケーリングと、3元対数線形モデルの条件付き独立 `G²` を検算する
7. 軟閾値座標降下法でLassoを実装し、交差検証における事前スクリーニング・リークを検証する
8. 対応データの個人内SE・リンク尺度リボン・発散配色のゼロ中心化を数値で設計する

次は **上級編 / 動的モデル・MCMC・計算統計** で、微分方程式・反応時間DDM・状態空間カルマンフィルタ・HMCサンプラ・階層順序／離散選択・コレスポンデンス分析（CA／MCA）・科学機械学習（SciML）・モデル診断図／位相平面の実装へ進みましょう。
"""

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
DelimitedFiles = "8bb1440f-4735-579b-a4ab-409b98df4dab"
LinearAlgebra = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"
Random = "9a3f8284-a2c9-5f02-9a11-845980a1fd5c"
Statistics = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"

[compat]
julia = "1.12"
"""

# ╔═╡ 00000000-0000-0000-0000-000000000002
PLUTO_MANIFEST_TOML_CONTENTS = """
# This file is machine-generated - editing it directly is not advised

julia_version = "1.12.3"
manifest_format = "2.0"
project_hash = "7356e211cf2c45dc8f74b98608e4b9554eab96ff"

[[deps.Artifacts]]
uuid = "56f22d72-fd6d-98f1-02f0-08ddc0907c33"
version = "1.11.0"

[[deps.CompilerSupportLibraries_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "e66e0078-7015-5450-92f7-15fbd957f2ae"
version = "1.3.0+1"

[[deps.DelimitedFiles]]
deps = ["Mmap"]
git-tree-sha1 = "9e2f36d3c96a820c678f2f1f1782582fcf685bae"
uuid = "8bb1440f-4735-579b-a4ab-409b98df4dab"
version = "1.9.1"

[[deps.Libdl]]
uuid = "8f399da3-3557-5675-b5ff-fb832c97cbdb"
version = "1.11.0"

[[deps.LinearAlgebra]]
deps = ["Libdl", "OpenBLAS_jll", "libblastrampoline_jll"]
uuid = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"
version = "1.12.0"

[[deps.Mmap]]
uuid = "a63ad114-7e13-5084-954f-fe012c677804"
version = "1.11.0"

[[deps.OpenBLAS_jll]]
deps = ["Artifacts", "CompilerSupportLibraries_jll", "Libdl"]
uuid = "4536629a-c528-5b80-bd46-f80d51c5b363"
version = "0.3.29+0"

[[deps.Random]]
deps = ["SHA"]
uuid = "9a3f8284-a2c9-5f02-9a11-845980a1fd5c"
version = "1.11.0"

[[deps.SHA]]
uuid = "ea8e919c-243c-51af-8825-aaa63cd721ce"
version = "0.7.0"

[[deps.Statistics]]
deps = ["LinearAlgebra"]
git-tree-sha1 = "e2b53ce13a53367e96601081e33d34746b571bad"
uuid = "10745b16-79ce-11e8-11f9-7d13ad32a3b2"
version = "1.11.5"

    [deps.Statistics.extensions]
    SparseArraysExt = ["SparseArrays"]

    [deps.Statistics.weakdeps]
    SparseArrays = "2f01184e-e22b-5df5-ae63-d93ebab69eaf"

[[deps.libblastrampoline_jll]]
deps = ["Artifacts", "Libdl"]
uuid = "8e850b90-86db-534c-a0d3-1478176c7d93"
version = "5.15.0+0"
"""

# ╔═╡ Cell order:
# ╠═7b1d0101-0000-11f1-9a01-000000000001
# ╟─7b1d0102-0000-11f1-9a01-000000000002
# ╟─7b1d0103-0000-11f1-9a01-000000000003
# ╠═7b1d0104-0000-11f1-9a01-000000000004
# ╠═7b1d0105-0000-11f1-9a01-000000000005
# ╠═7b1d0106-0000-11f1-9a01-000000000006
# ╟─7b1d0107-0000-11f1-9a01-000000000007
# ╠═7b1d0108-0000-11f1-9a01-000000000008
# ╠═7b1d0109-0000-11f1-9a01-000000000009
# ╠═7b1d0110-0000-11f1-9a01-000000000010
# ╟─7b1d0111-0000-11f1-9a01-000000000011
# ╠═7b1d0112-0000-11f1-9a01-000000000012
# ╠═7b1d0113-0000-11f1-9a01-000000000013
# ╠═7b1d0114-0000-11f1-9a01-000000000014
# ╟─7b1d0115-0000-11f1-9a01-000000000015
# ╠═7b1d0116-0000-11f1-9a01-000000000016
# ╠═7b1d0117-0000-11f1-9a01-000000000017
# ╠═7b1d0118-0000-11f1-9a01-000000000018
# ╟─7b1d011a-0000-11f1-9a01-00000000001a
# ╠═7b1d011b-0000-11f1-9a01-00000000001b
# ╠═7b1d011c-0000-11f1-9a01-00000000001c
# ╠═7b1d011d-0000-11f1-9a01-00000000001d
# ╟─7b1d011e-0000-11f1-9a01-00000000001e
# ╠═7b1d011f-0000-11f1-9a01-00000000001f
# ╠═7b1d0120-0000-11f1-9a01-000000000020
# ╠═7b1d0121-0000-11f1-9a01-000000000021
# ╟─7b1d0122-0000-11f1-9a01-000000000022
# ╠═7b1d0123-0000-11f1-9a01-000000000023
# ╠═7b1d0124-0000-11f1-9a01-000000000024
# ╠═7b1d0125-0000-11f1-9a01-000000000025
# ╟─7b1d0126-0000-11f1-9a01-000000000026
# ╠═7b1d0127-0000-11f1-9a01-000000000027
# ╠═7b1d0128-0000-11f1-9a01-000000000028
# ╠═7b1d0129-0000-11f1-9a01-000000000029
# ╟─7b1d0119-0000-11f1-9a01-000000000019
# ╟─00000000-0000-0000-0000-000000000001
# ╟─00000000-0000-0000-0000-000000000002
