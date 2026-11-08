// 補講12: Juliaらしい設計技法：多重ディスパッチ・ゼロコスト構造体・マクロ
// 検証環境: Julia 1.12 / LinearAlgebra / Printf (純Julia再現可能な多重ディスパッチ・isbits構造体・ASTマクロ)
export default {
  id: "julian-design-patterns",
  title: "Juliaらしい設計技法：多重ディスパッチ・ゼロコスト構造体・マクロ",
  tag: "未知の型が既存ソルバを無改造で貫通する合成性と、isbits連続メモリ・ASTマクロの仕組みを掴む",
  pages: [
    {
      t: "単一ディスパッチ（クラス所属）と多重ディスパッチ（引数の型の組）の決定的な違い",
      b: [
        "PythonやC++などのオブジェクト指向言語では、メソッドは `x.combine(y)` のように **「第1引数 `x` のクラス」に所有される単一ディスパッチ（Single Dispatch）** が基本です。この方式では、ライブラリAの型とライブラリBの型を組み合わせる対称な演算や、新しい数値型を既存のアルゴリズムへ流し込む場面で、どちらのクラスを書き換えるかという壁（Expression Problem）にぶつかります。",
        "Juliaはクラスにメソッドを閉じ込めず、**関数に与えられるすべての引数の型のタプル `(typeof(x), typeof(y), ...)` 全体を見て、最も具体的なメソッドをコンパイル時に選ぶ「多重ディスパッチ（Multiple Dispatch）」** を中核に据えています。",
        "下の例のように、観測値の型（点観測 `PointObs` と区間観測 `RangeObs`）ごとの合成規則を独立したメソッドとして書き足すだけで、既存のコードを1行も壊さずに新しい組み合わせへ拡張でき、各組み合わせに対して専用の機械語が生成されます。",
      ],
      code: `abstract type AbstractObs end
struct PointObs <: AbstractObs; x::Float64; end
struct RangeObs <: AbstractObs; lo::Float64; hi::Float64; end

# 2つの引数の型のペア (typeof(a), typeof(b)) ごとに最適な規則を定義
overlap_dist(a::PointObs, b::PointObs) = abs(a.x - b.x)
overlap_dist(a::PointObs, b::RangeObs) = max(0.0, max(b.lo - a.x, a.x - b.hi))
overlap_dist(a::RangeObs, b::PointObs) = overlap_dist(b, a) # 対称性を1行で委譲
overlap_dist(a::RangeObs, b::RangeObs) = max(0.0, max(a.lo - b.hi, b.lo - a.hi))

p = PointObs(520.0); r = RangeObs(480.0, 510.0)
println((pt_pt = overlap_dist(p, PointObs(505.0)),
         pt_rg = overlap_dist(p, r),
         rg_pt = overlap_dist(r, p),
         n_methods = length(methods(overlap_dist))))`,
      out: `(pt_pt = 15.0, pt_rg = 10.0, rg_pt = 10.0, n_methods = 4)`,
      a: [
        "`overlap_dist(a::RangeObs, b::PointObs) = overlap_dist(b, a)` のように引数の順序を入れ替えて委譲できるのも、メソッドが特定の1クラスに従属していないからです。`methods(f)` で登録済みメソッド一覧、`@which overlap_dist(p, r)` で実際に選ばれた定義を即座に確認できます。",
      ],
    },
    {
      t: "プロット①：ソルバを1行も変えずに「誤差伝播」と「微分感度」が貫通する合成性",
      b: [
        "多重ディスパッチの最大の醍醐味は、**「Aさんが書いた汎用数値ソルバ」に「Bさんが書いた特殊数値型」を渡すと、双方が互いの存在を一切知らなくてもそのまま合成されて動く** ことです。",
        "実際に試してみましょう。下の `rk4_decay(u0::Real, k::Real, dt::Float64, steps::Int)` は、普通の `Float64` のつもりで書かれた4次Runge–Kutta積分の関数です。ここに、値と標準誤差を持つ自作の **`Uncertain <: Real` 型（1次テイラー誤差伝播）** を渡すと、**ソルバを1文字も書き換えずに全時点の予測値と標準誤差 `se` が同時に求まります！**",
      ],
      code: `using Printf

struct Uncertain <: Real
    v::Float64; se::Float64
end
Base.:+(a::Uncertain, b::Uncertain) = Uncertain(a.v + b.v, hypot(a.se, b.se))
Base.:-(a::Uncertain, b::Uncertain) = Uncertain(a.v - b.v, hypot(a.se, b.se))
Base.:-(a::Uncertain)               = Uncertain(-a.v, a.se)
Base.:*(c::Real, a::Uncertain)      = Uncertain(c * a.v, abs(c) * a.se)
Base.:*(a::Uncertain, c::Real)      = Uncertain(a.v * c, abs(c) * a.se)
Base.:*(a::Uncertain, b::Uncertain) = Uncertain(a.v * b.v, hypot(b.v * a.se, a.v * b.se))

# Float64 のつもりで書かれた汎用RK4ソルバ（Uncertain の存在を一切知らない!）
function rk4_decay(u::Real, k::Real, dt::Float64, steps::Int)
    for _ in 1:steps
        k1 = -k * u
        k2 = -k * (u + 0.5 * dt * k1)
        k3 = -k * (u + 0.5 * dt * k2)
        k4 = -k * (u + dt * k3)
        u  = u + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
    end
    return u
end

u_end = rk4_decay(Uncertain(100.0, 3.0), Uncertain(0.22, 0.025), 0.25, 20)
@printf("t=5.0 での予測値: %.2f ± SE %.2f (95%%区間: [%.2f, %.2f])\n",
        u_end.v, u_end.se, u_end.v - 1.96 * u_end.se, u_end.v + 1.96 * u_end.se)`,
      out: `t=5.0 での予測値: 33.29 ± SE 3.17 (95%区間: [27.08, 39.50])`,
      fig: {
        src: "figures/extra-multiple-dispatch-composability.svg",
        alt: "2パネル図。左は単一ディスパッチ（クラス所属）と多重ディスパッチ（引数の型のタプル特化）の構造比較で、単一ディスパッチでは新数値型と既存ソルバの組合せごとにアダプタが必要になるのに対し、多重ディスパッチでは基本演算だけを定義すれば汎用ソルバrk4_stepがFloat64・Uncertain・DualTagのそれぞれに専用機械語を生成する。右は無改造のRK4ソルバにUncertain(100±3, k=0.22±0.025)とDual(k, 1.0)を流し込んで得た時間発展軌道と95%誤差伝播帯・パラメータ感度曲線。",
        cap: "左：基本演算（`+`, `-`, `*`）だけを多重ディスパッチで定義すれば、既存の汎用ソルバは無改造で新しい数値型を受け入れます。右：同じ8行のRK4関数から誤差伝播帯と微分感度がそのまま得られます。",
      },
      a: [
        "実用パッケージの `Measurements.jl`（誤差伝播）、`ForwardDiff.jl`（自動微分 `Dual`）、`Unitful.jl`（物理単位 `ms`, `Hz`）、`IntervalArithmetic.jl`（厳密区間演算）が `OrdinaryDiffEq.jl` などの微分方程式ソルバとそのまま繋がるのは、まさにこの設計技法のおかげです。",
      ],
    },
    {
      t: "プロット②：isbits不変構造体（struct）の連続メモリ配置と「ゼロコスト抽象化」",
      b: [
        "「でも、自作の `Uncertain` 型を何万個も配列に入れてループを回したら、Pythonの自作クラスのようにポインタ参照だらけになって遅くなるのでは？」と思うかもしれません。ここで第2の固有技術である **`isbits` 不変構造体（Immutable Struct）のインライン配置** が効きます。",
        "Juliaでフィールドに具象数値型（`Float64` や `Int64`）だけを持つ不変 `struct` を定義すると、`isbitstype(Uncertain) == true` となります。すると `Vector{Uncertain}` はヒープ上のオブジェクトへのポインタ配列ではなく、**`[v₁, se₁, v₂, se₂, ...]` と1要素16バイトの数値が隙間なく連続配置されたフラットなメモリ配列** になり、ループ内のヒープ割当 `0 B` でC言語の構造体配列とまったく同じ速度で走ります！",
      ],
      code: `struct UncertainPt
    v::Float64
    se::Float64
end
Base.:+(a::UncertainPt, b::UncertainPt) = UncertainPt(a.v + b.v, hypot(a.se, b.se))

function sum_uncertain(xs::Vector{UncertainPt})
    acc = UncertainPt(0.0, 0.0)
    for x in xs
        acc = acc + x
    end
    return acc
end

pts = [UncertainPt(1.0 * i, 0.1) for i in 1:10_000]
sum_uncertain(pts) # ウォームアップ
println((is_bits = isbitstype(UncertainPt),
         byte_size = sizeof(UncertainPt),
         vec_bytes = sizeof(pts),
         loop_alloc_B = @allocated(sum_uncertain(pts))))`,
      out: `(is_bits = true, byte_size = 16, vec_bytes = 160000, loop_alloc_B = 0)`,
      fig: {
        src: "figures/extra-isbits-memory-macro-ast.svg",
        alt: "2パネル図。左は動的言語のポインタボックス配列（Vector{Any}）とJuliaのisbits不変struct配列（Vector{Uncertain}）のメモリレイアウト比較で、isbits構造体はv₁(8B), se₁(8B), v₂(8B), se₂(8B)...と連続メモリに隙間なく並びポインタ追跡ゼロ・ヒープ割当0Bになる。右はJuliaのコード自身がデータ構造Exprとしてマクロに渡され、コンパイル前に高速コードへ書き換えられる3段階パイプライン。",
        cap: "左：`isbitstype` の不変 `struct` は配列内にインライン展開され、ループ内で新しく `UncertainPt(...)` を作ってもレジスタ上で処理されてヒープ割当は `0 B` です。右：構文木 `Expr` をコンパイル前に書き換えるマクロの仕組みです。",
      },
      a: [
        "⚠️ **注意**: `struct BadPt; v::Real; se::Real; end` のようにフィールドの型を抽象型 `Real` にしてしまうと、`isbitstype` ではなくなりポインタ参照が発生します。複数の数値型に対応させたいときは **`struct GoodPt{T<:Real}; v::T; se::T; end`（パラメトリック型）** と書くのがJuliaの鉄則です。",
      ],
    },
    {
      t: "コード自身がデータになる（同図象性）：構文木（Expr）とマクロによるコンパイル時変換",
      b: [
        "Juliaの3つ目のユニークな特徴は、Lisp言語のように **「Juliaのプログラムコード自身が、Juliaの標準データ構造（`Expr` と `Symbol`）として表現できる」** という性質（同図象性：Homoiconicity）です。",
        "`:(a * x + b)` のようにコロンと括弧で式を囲む（クォートする）と、計算を実行する代わりに **抽象構文木（AST: Abstract Syntax Tree）オブジェクト** が手に入ります。**マクロ（`@` で始まる関数）** は、「値」ではなくこの「構文木 `Expr`」を受け取り、**コンパイル前に別のコードへ書き換えて返す関数** です。",
      ],
      code: `# 1. コードをデータ構造 (Expr) として取り出し、中身を観察する
ex = :(a * x + b)
println((type = typeof(ex), head = ex.head, args = ex.args))

# 2. 式の計算結果と「元の変数名・式そのもの」をペアで返す自作マクロ
macro named_val(expr)
    label = string(expr)
    return :((expr = $label, val = $(esc(expr))))
end

x = 4.0; a = 2.5; b = -1.0
println(@named_val(a * x + b))`,
      out: `(type = Expr, head = :call, args = Any[:+, :(a * x), :b])
(expr = "a * x + b", val = 9.0)`,
      a: [
        "私たちが普段使っている `@.`（式中の全演算子にドットを付与）、`StatsModels.@formula(y ~ 1 + x)`（統計モデル式を計画行列ビルダへ変換）、`Test.@test`（失敗時に計算前の式と左右の値を表示）、`Threads.@threads` はすべてこのマクロ機構で実装されています。実行時コストを一切払わずに、研究分野ごとの読みやすい専用記法（DSL）を作れる秘密がここにあります。",
      ],
    },
    {
      t: "Holy Traits（特性ディスパッチ）と関数障壁：継承ツリーに縛られない設計パターン",
      b: [
        "大規模なパッケージ開発や高速シミュレーションで頻繁に使われる、Julia特有の2つのイディオムを押さえておきましょう。",
        "① **Holy Traits（Tim Holy Trick）**: 単一継承の型階層（`A <: B`）だけでは「正規分布のように解析的なエントロピー公式を持つか」「数値求積が必要か」といった横断的な性質を表現しきれません。そこで **`has_closed_form(::Type{T})` のように「型を入力として特性型を返す関数」を定義し、その戻り値の型で第2段階のディスパッチを行う** のが Holy Traits パターンです。定数畳み込みにより実行時の `if` 分岐コストは完全にゼロになります。",
        "② **関数障壁（Function Barrier）**: 設定ファイルや外部入力から型が実行時まで分からない値を読み込んだときは、そのまま内側ループへ入るのではなく、**核となる計算ループを別の小さな関数 `kernel!(out, x)` として切り出して渡す** だけで、呼び出しの瞬間に具体的な型でコンパイル（特化）が走り、最高速で実行されます。",
      ],
      code: `abstract type NormStyle end
struct AlreadyNormalized <: NormStyle end
struct NeedsSoftmax <: NormStyle end

struct ProbVec; p::Vector{Float64}; end
struct LogitVec; z::Vector{Float64}; end

# 型に対して「どの特性（Trait）を持つか」を割り当てる（コンパイル時に決定!）
norm_style(::Type{ProbVec})  = AlreadyNormalized()
norm_style(::Type{LogitVec}) = NeedsSoftmax()

to_probs(x) = _to_probs(norm_style(typeof(x)), x)
_to_probs(::AlreadyNormalized, x::ProbVec) = x.p
function _to_probs(::NeedsSoftmax, x::LogitVec)
    m = maximum(x.z); w = exp.(x.z .- m)
    return w ./ sum(w)
end

println((from_prob  = round.(to_probs(ProbVec([0.2, 0.8])); digits = 3),
         from_logit = round.(to_probs(LogitVec([0.0, log(4.0)])); digits = 3)))`,
      out: `(from_prob = [0.2, 0.8], from_logit = [0.2, 0.8])`,
      a: [
        "`Base.IndexStyle`（配列が1次元連続インデックス `IndexLinear()` か多次元添字 `IndexCartesian()` か）や `Tables.jl` の表インターフェースも、この Holy Traits パターンで作られています。継承階層を無理に作り直さなくても、あとから任意の型に性質を付与できる非常に柔軟な設計技法です。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      afterPage: "プロット①：ソルバを1行も変えずに「誤差伝播」と「微分感度」が貫通する合成性",
      q: "他人が書いた汎用数値ソルバ `rk4_decay(u::Real, k::Real, dt, steps)` を1文字も書き換えずに、自作の誤差伝播型 `Uncertain <: Real` や自動微分型 `Dual <: Real` を渡してそのまま動かせる理由として **正しい** ものはどれでしょう?",
      opts: [
        "Juliaの関数は特定の1クラスに所有されず、基本演算（`+`, `-`, `*` 等）を新数値型に対して多重ディスパッチで定義すれば、引数型の組み合わせごとに専用の機械語へコンパイルされるから",
        "Juliaがソルバのソースコードを外部サーバーへ毎回送信し、AIが実行時にC言語の別プログラムへ自動で書き換えてダウンロードしているから",
        "すべての数値型を内部で強制的に文字列（`String`）へ変換してから正規表現で足し算や掛け算を近似計算しているから",
        "`Uncertain` 型を渡した瞬間だけ4次Runge–Kutta法の計算式が自動的に無効化され、初期値をそのまま返す仕組みになっているから",
      ],
      ans: 0,
      why: "汎用ソルバが `Real` 抽象型（または型制約なしのダックタイピング）で書かれていれば、内部で呼ばれる `+`, `-`, `*` に対して `Uncertain` 同士や `Real` と `Uncertain` のメソッドを多重ディスパッチで定義しておくだけで、ソルバ全体が `Uncertain` 型に特化した機械語としてコンパイルされます。",
      hint: "1〜2ページ目で見た「単一ディスパッチ（クラス所属）」と「多重ディスパッチ（引数の型のタプル特化）」の違いを思い出しましょう。",
    },
    {
      k: "fill",
      afterPage: "プロット②：isbits不変構造体（struct）の連続メモリ配置と「ゼロコスト抽象化」",
      q: "自作の不変構造体 `UncertainPt` がポインタを含まず、配列内で隙間なく連続メモリ配置される型（isbits型）であるかを真偽値で確かめる標準関数名を入力しましょう。",
      code: `println(〔?〕(UncertainPt))  # => true`,
      accept: ["isbitstype"],
      show: "isbitstype",
      why: "`isbitstype(T)` が `true` を返す不変構造体は、ポインタ参照なしで配列バッファ内やCPUレジスタ上に直接配置され、C言語の構造体と同等の速度・メモリ効率で動作します。",
      hint: "3ページ目のコードで `byte_size = sizeof(UncertainPt)` の直前に呼んだ `isbits...` から始まる10文字の関数名です。",
      placeholder: "関数名を入力",
    },
    {
      k: "tf",
      afterPage: "コード自身がデータになる（同図象性）：構文木（Expr）とマクロによるコンパイル時変換",
      q: "Juliaの `isbits` 不変構造体と構文木マクロ（`@`）の性質について、正しいか判定しましょう。",
      items: [
        {
          s: "`Float64` のフィールド2つだけを持つ不変 `struct` の配列 `Vector{UncertainPt}` は、ヒープ上の個別オブジェクトへのポインタ配列ではなく、1要素16バイトの数値が隙間なく連続配置された配列になる",
          a: true,
          why: "`isbitstype(UncertainPt) == true` となる不変構造体は、C言語の構造体配列と同様に配列バッファ内へ直接インライン配置され、キャッシュ効率が高くループ内のヒープ割当も0バイトになります。",
        },
        {
          s: "`:(a * x + b)` のようにクォートした式は `Expr` 型のデータ構造になり、マクロはこの構文木をコンパイル前に受け取って別のJuliaコードへ変換する",
          a: true,
          why: "マクロは実行時に毎回文字列を解釈するのではなく、コンパイル前に抽象構文木（AST）を書き換えるため、実行時のオーバーヘッドなしに `@.` や `@formula` などの構文を実現できます。",
        },
        {
          s: "構造体のフィールドを `struct Pt; x::Any; y::Any; end` と抽象型 `Any` で宣言した方が、`Float64` や型パラメータ `T<:Real` を使うよりも常にメモリ使用量が少なく高速になる",
          a: false,
          why: "フィールドを `Any` にすると要素ごとに型タグとポインタ追跡が必要になり、`isbits` の連続メモリ配置が失われて大幅に遅くなります。",
        },
      ],
      hint: "3ページ目の左パネル（ポインタ配列 vs `isbits` 連続配列）と右パネル（構文木 `Expr` の変換）を見直しましょう。",
    },
    {
      k: "choice",
      afterPage: "Holy Traits（特性ディスパッチ）と関数障壁：継承ツリーに縛られない設計パターン",
      q: "単一継承の型階層（`A <: B`）に縛られず、「すでに正規化済みか」「線形インデックス可能か」といった横断的な性質をコンパイル時に切り替える **Holy Traits（特性ディスパッチ）** パターンの書き方として **適切な** ものはどれでしょう?",
      opts: [
        "すべての型に100個の真偽値フィールドを手動で追加し、内側ループの毎回で文字列比較の `if-else` チェーンを実行する",
        "型の性質を表す軽量な特性型（`AlreadyNormalized` など）と `norm_style(::Type{T})` を定義し、その戻り値の型で実処理関数 `_to_probs(style, x)` を多重ディスパッチする",
        "実行速度を上げるために関数への引数渡しをすべてやめ、プログラム中の全変数を型注釈なしのグローバル変数 `global` に置き換える",
        "既存のパッケージのソースコードを直接書き換えて、単一の巨大な `abstract type` の下にすべての構造体を強制的に統合する",
      ],
      ans: 1,
      why: "`norm_style(typeof(x))` が返す特性型（Singleton type）はコンパイル時に一意に定まるため、コンパイラは分岐を完全に消去（定数畳み込み・インライン化）し、単一継承の制約を受けずにゼロコストで処理を切り替えます。",
      hint: "5ページ目の `norm_style(::Type{ProbVec}) = AlreadyNormalized()` と `_to_probs` の2段階ディスパッチを確認しましょう。",
    },
  ],
};
