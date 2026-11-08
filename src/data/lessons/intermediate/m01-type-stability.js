// レッスン: 型安定性とメモリ割当 — なぜJuliaは速いのかを計測と型から解剖する
// 公式仕様: https://docs.julialang.org/en/v1/manual/performance-tips/
export default {
  id: "type-stability-allocation",
  title: "型安定性とメモリ割当",
  tag: "なぜJuliaは速いのかを計測と型から解剖する",
  pages: [
    {
      t: "「ループが遅い」のではなく「型が揺れると遅い」",
      b: [
        "RやPythonでは「`for` ループを避けてベクトル化せよ」とよく言われます。一方Juliaでは、手書きの `for` ループがC言語やFortranに匹敵する速さで動きます。パッケージの中身も大半はJulia自身で書かれており、計算の核だけを別言語で書き直す「二言語問題」を避けられます。",
        "ただし、どんな書き方でも自動的に速くなるわけではありません。Juliaのコンパイラが機械語を最適化できるのは、「入力の型が決まれば、途中の変数と返り値の型も一意に決まる（型安定である）」ときです。",
        "この章では、①初回コンパイルと2回目以降の計測を分ける、②型不安定とヒープ割当（メモリ確保）を見抜く、③`@views` と事前確保を安全に使い、参照共有バグを避ける、④多重ディスパッチで拡張しやすい解析コードを書く、の4点を押さえます。",
      ],
    },
    {
      t: "計測の鉄則：初回はコンパイル、2回目以降が実力",
      b: [
        "Juliaは関数が初めてその引数の型で呼ばれた瞬間に、専用の機械語へJIT（実行時）コンパイルします。そのため1回目の `@time` にはコンパイル時間とコンパイル用のメモリ割当が混ざります。",
        "純粋な計算コストやメモリ割当を見るには、同じ型の引数で一度ウォームアップしてから2回目を測ります。精密な比較にはパッケージ `BenchmarkTools.jl` の `@btime`（変数は `$x` と補間してグローバル参照を避ける）を使います。",
      ],
      code: `function stable_weighted_sum(xs::Vector{Int})
    total = 0.0
    for x in xs
        if x > 0
            total += 0.5 * x
        end
    end
    return total
end

xs = collect(-50:200)
stable_weighted_sum(xs) # 1回目: ウォームアップ
println(stable_weighted_sum(xs))
println(@allocated stable_weighted_sum(xs))`,
      out: `10050.0
0`,
      a: [
        "ウォームアップ後の `@allocated` は `0` バイトです。251個の要素を走査しても、新しい配列や型情報の箱（ボクシング）をヒープ領域に一切作っていません。",
        "もう一つの鉄則は、計測したい処理をトップレベルのグローバル変数ではなく関数の中に入れることです。型注釈のないグローバル変数はいつ別の型の値が代入されるか分からず、コンパイラが型を固定できないからです（定数なら `const THRESHOLD = 0.05` と書きます）。",
      ],
    },
    {
      t: "ループの途中で変数の型が変わる罠と @code_warntype",
      b: [
        "先ほどの関数で、もし最初の行を整数の `total = 0` と書いていたらどうなるでしょうか。`xs` がすべて負なら `Int64` のまま返り、正の要素が1つでもあれば `total += 0.5 * x` の瞬間に `Float64` へ変わります。",
        "このように実行時の値しだいで変数の型が `Union{Int64, Float64}` や `Any` に揺れる状態を「型不安定」と呼びます。標準ライブラリ `InteractiveUtils`（REPLでは最初から利用可能）の `@code_warntype` で即座に診断できます。",
      ],
      code: `function unstable_weighted_sum(xs::Vector{Int})
    total = 0          # Int64 で初期化してしまう
    for x in xs
        if x > 0
            total += 0.5 * x  # ここで Float64 に変化!
        end
    end
    return total
end

# REPLでの診断:
# @code_warntype unstable_weighted_sum(xs)
# → total::Union{Float64, Int64} と Body::Union{Float64, Int64} が警告表示される`,
      a: [
        "解決策はシンプルで、`total = 0.0` や `total = zero(0.5 * first(xs))`（あるいは `zero(float(eltype(xs)))`）のように、加算後の型と最初から揃えて初期化することです。",
        "同じ理由で、`results = []` は `Vector{Any}`（何でも入る代わりに毎回型タグを追跡する遅い配列）になります。入れる型が決まっているなら `Float64[]` や `Vector{Float64}(undef, n)` を使います。",
      ],
    },
    {
      t: "列スライスの隠れたコピーを @views でゼロにする",
      b: [
        "シミュレーションやブートストラップで何度も呼ばれる内側のループでは、計算そのものより「一時配列の確保とガベージコレクション（GC）」が時間を食うことがよくあります。",
        "Juliaの `X[:, j]` は安全のため新しい配列をコピーして返します。読み取るだけなら `@views` を付けると、元の行列のメモリ領域を指す軽量な `SubArray`（ビュー）になり、コピーの割当が消えます。",
      ],
      code: `function col_range_copy(X::Matrix{Float64})
    s = 0.0
    for j in axes(X, 2)
        col = X[:, j]
        s += maximum(col) - minimum(col)
    end
    return s
end

function col_range_views(X::Matrix{Float64})
    s = 0.0
    @views for j in axes(X, 2)
        col = X[:, j]
        s += maximum(col) - minimum(col)
    end
    return s
end

X = reshape(collect(1.0:20_000.0), 500, 40)
col_range_copy(X); col_range_views(X)
println(@allocated col_range_copy(X))
println(@allocated col_range_views(X))`,
      out: `166400
0`,
      fig: {
        src: "figures/allocation-views.svg",
        alt: "500×40行列の列集約におけるヒープ割当量の比較棒グラフ。抽象型 Vector{Any} が約312.5 KiB、列コピー X[:, j] が162.5 KiB、@views X[:, j] が0 B。",
        cap: "500×40行列を1回走査するだけでも、スライスコピーは 166,400 B（162.5 KiB）を確保します。1万回反復すれば約1.6 GBの不要な割当になりますが、`@views` なら 0 B です。",
      },
      a: [
        "`axes(X, 2)` は列インデックスの範囲（`1:size(X, 2)`）を返します。1万回繰り返すモンテカルロの内側で162.5 KiBずつ捨て続けると、計算ではなくメモリ掃除（GC）を待つ時間が増えていきます。",
      ],
    },
    {
      t: "反例：事前確保バッファの使い回しで過去データを壊す事故",
      b: [
        "`rand!(rng, buf)` のように末尾に `!` がつく破壊的（in-place）関数で作業用配列 `buf` を使い回すと、乱数生成の割当も減らせます。しかし、その `buf` をそのまま `push!(history, buf)` で記録すると深刻なバグになります。",
      ],
      code: `buf = [0.0, 0.0]
bad_history = Vector{Vector{Float64}}()
for step in 1:3
    buf .= step
    push!(bad_history, buf) # 同じ配列への参照を3回入れている!
end

println(bad_history)
println(bad_history[1] === bad_history[3])`,
      out: `[[3.0, 3.0], [3.0, 3.0], [3.0, 3.0]]
true`,
      a: [
        "`push!(bad_history, buf)` は配列の中身を複製せず、「`buf` という同じ箱への参照」を追加します。そのため3回目の書き換えで1回目・2回目の記録まで `[3.0, 3.0]` に上書きされてしまいました。`@views` で作ったビューを書き換えると元の行列 `X` まで変わるのも同じ仕組みです。",
        "履歴を残すなら①集計値（平均やSEなどの不変な数値・`NamedTuple`）に変換してから保存する、または②配列ごと残す必要があるときだけ `copy(buf)` を保存します。「速いが間違った結果」は研究でもっとも危険です。最適化の前後で必ず単純な基準実装と値が一致するかテストします。",
      ],
    },
    {
      t: "多重ディスパッチで「速さと拡張性」を両立する",
      b: [
        "Juliaの関数は、引数の型の組み合わせに応じて最適なメソッドを選び分けます（多重ディスパッチ）。`if kind == \"trimmed\" ...` と分岐を書く代わりに、推定手法そのものを小さな構造体（`struct`）として表すと、型安定性を保ったまま新しい手法を後から足せます。",
      ],
      code: `using Random, Statistics

abstract type LocationEstimator end
struct SampleMean <: LocationEstimator end
struct SampleMedian <: LocationEstimator end
struct TrimmedMean <: LocationEstimator
    prop::Float64
end

estimate(::SampleMean, x) = mean(x)
estimate(::SampleMedian, x) = median(x)
function estimate(est::TrimmedMean, x)
    s = sort(x)
    k = floor(Int, est.prop * length(s))
    return @views mean(s[(k + 1):(end - k)])
end

function bootstrap_se(rng, est::LocationEstimator, x; B = 1000)
    n = length(x)
    buf = Vector{Float64}(undef, n)
    stats = Vector{Float64}(undef, B)
    for b in 1:B
        for i in 1:n
            buf[i] = x[rand(rng, 1:n)]
        end
        stats[b] = estimate(est, buf)
    end
    return (value = round(estimate(est, x), digits = 1),
            se = round(std(stats), digits = 1))
end

skew_rt = [480.0, 495.0, 502.0, 510.0, 515.0, 522.0, 530.0, 540.0, 555.0, 1850.0]
for est in (SampleMean(), TrimmedMean(0.2), SampleMedian())
    println(bootstrap_se(Xoshiro(4101), est, skew_rt))
end`,
      out: `(value = 649.9, se = 127.4)
(value = 519.8, se = 79.4)
(value = 518.5, se = 38.2)`,
      a: [
        "`bootstrap_se` を1つ書くだけで、`SampleMean`・20%刈り込み平均 `TrimmedMean(0.2)`・`SampleMedian` のどれを渡してもその型専用の高速な機械語が生成されます。しかも `buf` からは毎回スカラー値 `estimate(est, buf)` だけを取り出して `stats[b]` に格納しているため、先ほどの参照共有バグも起きません。",
        "なお、数値的安定性を犠牲にするマイクロ最適化は禁物です。「確率変数と確率分布」で学んだ `log1p`・`logpdf`・Welford型の分散計算は、数ナノ秒を惜しんで単純な式へ戻してはいけません。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "`xs::Vector{Int}` を受け取る関数で、先頭を `total = 0` とし、ループ内で `if x > 0; total += 0.5 * x; end` と書いたときに起きる問題は何でしょう?",
      opts: [
        "`total` の型が実行時に `Int64` と `Float64` の間で揺れ、型不安定になる",
        "Juliaでは整数型と浮動小数点型は自動変換されず足せないため、`MethodError` で必ず停止する",
        "負の要素が自動的に削除され、配列 `xs` が書き換わる",
      ],
      ans: 0,
      why: "`0` は `Int64`、`0.5 * x` は `Float64` なので、条件分岐を通るかどうかで `total` の型が `Union{Int64, Float64}` になります。最初から `total = 0.0` と型を揃えることで型安定になります。",
      hint: "すべての要素が0以下のときと、正の要素があるときで、`total` の型がどうなるか比べてみましょう。",
    },
    {
      k: "fill",
      q: "行列 `X` の列スライス `X[:, j]` をコピーせず、元のメモリを参照して読み取るために付けるマクロ名を入力しましょう（`@` を含む）。",
      code: `〔?〕 for j in axes(X, 2)
    s += mean(X[:, j])
end`,
      accept: ["@views"],
      show: "@views",
      why: "`@views` を付けると範囲スライスが新しい配列を複製せず `SubArray` として参照するため、不要なヒープ割当を防げます。",
      hint: "英語の view（参照窓）の複数形に `@` が付いたマクロです。",
      placeholder: "@から始まるマクロ名",
    },
    {
      k: "tf",
      q: "Juliaの計測とメモリ管理について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "関数を定義した直後の1回目の `@time` には、JITコンパイルの時間と割当が含まれる",
          a: true,
          why: "初回呼び出し時に引数型に合わせた機械語へのコンパイルが走るため、純粋な実行コストはウォームアップ後や `BenchmarkTools.@btime` で確認します。",
        },
        {
          s: "作業用配列 `buf` をループ内で書き換えながら `push!(history, buf)` すると、各時点の独立したコピーが保存される",
          a: false,
          why: "`push!` は同じ配列への参照を追加するため、後から `buf` を書き換えると過去の要素もすべて同じ内容に変わってしまいます。スカラー要約を保存するか `copy(buf)` を使います。",
        },
        {
          s: "`@views` で作った部分配列 `v = @view X[:, 1]` の要素を書き換えても、元の行列 `X` は変化しない",
          a: false,
          why: "ビューは元の配列 `X` のメモリを共有しているため、`v[1] = 99.0` のように書き換えると `X[1, 1]` も書き換わります。",
        },
      ],
      hint: "1回目の実行で何が起きるか、そして「コピーしない参照」を書き換えたとき元データはどうなるかを考えましょう。",
    },
    {
      k: "choice",
      q: "研究コードの高速化を進める順序として、もっとも適切なものはどれでしょう?",
      opts: [
        "まず数値的に正しく読みやすい基準実装とテストを作り、計測でボトルネックを特定してから型安定性や割当を改善する",
        "最初からすべての配列を1つのグローバルなバッファにまとめ、`logpdf` も手書きの `log(pdf(...))` に置き換える",
        "コンパイル時間を省くため、関数を作らずすべてトップレベルのグローバル変数だけでループを書く",
      ],
      ans: 0,
      why: "速くても結果が変わったり桁落ちしたりしては意味がありません。基準実装との一致テストを置いたうえで、関数化・型安定化・ホットループの割当削減を計測に基づいて行います。",
      hint: "グローバル変数のループや数値安定性を壊す書き換えがどうなるかを思い出しましょう。",
    },
  ],
};
