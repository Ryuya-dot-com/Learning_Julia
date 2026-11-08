// 補講10: 研究を加速するJulia実用ツールと開発習慣
// 検証環境: Julia 1.12 / Test / Statistics / Printf (Revise・BenchmarkTools・PrettyTables・Quarto・Unitful併記)
export default {
  id: "daily-workflow-tools",
  title: "研究を加速するJulia実用ツールと開発習慣",
  tag: "Revise再起動ゼロ開発・Test自動検算・BenchmarkTools計測・Quarto論文表・単位と誤差伝播を使いこなす",
  pages: [
    {
      t: "初回実行待ち（TTFX）の正体と、Revise.jl による「再起動ゼロ」開発",
      b: [
        "Juliaを使い始めた人が最初に戸惑いやすいのが、「スクリプトを1行直してターミナルから `julia run.jl` を実行するたびに、パッケージの読み込みと初回コンパイル（Time-To-First-X; TTFX）で十数秒待たされる」という現象です。Juliaは関数を初めて呼んだ瞬間に引数型に合わせて機械語へJITコンパイルするため、**プロセスを毎回終了させる使い方とは相性が悪い** のです。",
        "熟練したJulia利用者は、REPL（またはVS Code内のJuliaセッション）を1つ立ち上げたままにし、定番パッケージ **`Revise.jl`** を使って **`includet(\"src/analysis_fns.jl\")`**（末尾の `t` は track＝追跡）と読み込みます。するとファイルを編集して保存するだけで、変更した関数だけがバックグラウンドで差分更新され、**0.1秒で新しい定義を試せます**。",
        "さらに手元の個人設定 `~/.julia/config/startup.jl` に `try using Revise catch end` と書いておけば対話起動時に自動で有効になります。ただし **論文の最終出力やCI検証では必ず `julia --startup-file=no --project=. run.jl` と新プロセスで実行** し、個人の `startup.jl` に頼らず再現できることを確認するのが鉄則です。",
      ],
      code: `# 1. 一度だけグローバル環境へ Revise を入れておく（プロジェクト環境を汚さない）
# (@v1.12) pkg> add Revise

# 2. ~/.julia/config/startup.jl の安全な定石（未導入環境でもエラーにしない）
try
    using Revise
catch e
    @warn "Revise の読み込みをスキップしました" exception = (e, catch_backtrace())
end

# 3. 対話セッションでの開発手順（REPLを閉じないまま何度も保存→実行）
# julia> includet("src/analysis_fns.jl")  # 初回だけ追跡登録（include ではなく includet）
# julia> run_summary(df)                  # ファイルを書き換えて保存すると即座に新定義で動く!`,
      fig: {
        src: "figures/workflow-revise-test-loop.svg",
        alt: "2パネル図。左は関数を10回修正して試すときの累積待ち時間の比較で、毎回プロセスを再起動する赤破線は約142秒かかるのに対し、常駐REPLとReviseを使う緑実線は初回以降の待ち時間がほぼゼロで約16.7秒に収まる。右は日常のRevise＋@testset高速ループ（上段）と、論文提出前の--startup-file=noクリーン実行・自動表出力（下段）を結ぶ二段ワークフロー図。",
        cap: "左：毎回プロセスを再起動するとパッケージ読込とJITコンパイルが繰り返されますが、`Revise` 常駐なら2回目以降は一瞬です。右：日常の高速試行と最終のクリーンバッチ再現を使い分けます。",
      },
      a: [
        "`Revise` が自動で追跡できるのは **関数（メソッド）の追加・修正** です。`struct` のフィールド定義そのものを変えたときだけはJuliaセッションの再起動が必要です（プロトタイプ中は `NamedTuple` で試し、固まってから `struct` にすると快適です）。また `juliaup status` / `juliaup update` を使えば、Julia本体のマイナー更新やLTS版の切り替えもコマンド1行で管理できます。",
      ],
    },
    {
      t: "研究コードが「いつの間にか壊れる」のを防ぐ標準 Test",
      b: [
        "前処理の関数を少し書き換えた拍子に、「欠損値 `missing` が混じると落ちるようになった」「除外閾値の不等号 `<` と `<=` が入れ替わった」といった静かなバグはどんな研究者にも起こります。目視確認だけに頼らず、Julia本体に最初から同梱されている標準ライブラリ **`Test`（`@testset` / `@test` / `@test_throws`）** で5〜10行の「自動検算」を添えておきましょう。",
        "正常な小規模データで手計算と一致すること（浮動小数点は `isapprox(a, b; atol = ...)`）だけでなく、**「有効試行が0件のときに黙って `NaN` を返さず、意図した例外で止まるか」** まで `@test_throws` で固定しておくと、数か月後にコードを改修しても一瞬で安全性を確かめられます。",
      ],
      code: `using Test, Statistics

function clean_rt_summary(xs; min_ms = 150.0, max_ms = 3000.0)
    valid = [Float64(x) for x in skipmissing(xs) if min_ms <= x <= max_ms]
    isempty(valid) && throw(ArgumentError("有効な試行が0件です"))
    m = mean(valid)
    se = length(valid) > 1 ? std(valid) / sqrt(length(valid)) : 0.0
    return (n = length(valid), mean = m, se = se)
end

raw = [480, missing, 520, 95, 530, 4100, 490]
s = clean_rt_summary(raw)
ts = @testset "RT要約の自動検算" begin
    @test s.n == 4
    @test isapprox(s.mean, 505.0; atol = 1e-10)
    @test isapprox(s.se, std([480.0, 520.0, 530.0, 490.0]) / 2.0; atol = 1e-10)
    @test_throws ArgumentError clean_rt_summary([missing, 80, 5000])
end
println((n = s.n, mean = round(s.mean, digits = 1), se = round(s.se, digits = 2), passed = ts.n_passed))`,
      out: `Test Summary: | Pass  Total  Time
RT要約の自動検算 |    4      4  0.0s
(n = 4, mean = 505.0, se = 11.9, passed = 4)`,
      a: [
        "`95 ms`（早押し）と `4100 ms`（タイムアウト）と `missing` が除かれた4件で検算4項目が `0.0s` で通過しました。さらに一歩進んで「実行する前から関数の型不一致バグを静的に見つけたい」ときは `JET.jl`（`@report_call`）、自作パッケージの品質監査には `Aqua.jl` が広く使われています。",
      ],
    },
    {
      t: "BenchmarkTools.@btime の正しい使い方：$補間と最小値を見る理由",
      b: [
        "「型安定性とメモリ割当」で触れた速度計測を実務で行う定番が **`BenchmarkTools.jl` の `@btime` / `@benchmark`** です。素朴な `@time f(x)` には2つの罠があります。① 初回呼び出しだとコンパイル時間が混ざること、② REPL上のグローバル変数 `x` をそのまま渡すと「`x` の型が実行時まで不明」という動的ディスパッチのオーバーヘッド自体を測ってしまうことです。",
        "`@btime f($x)` のように変数名の前に **`$`（補間）** を付けると、`x` の値と型を計測ループの外で確定させて関数単体の純粋な速さを測れます。また複数回計測した中にOSの割り込みやガベージコレクション（GC）のスパイクが1回混ざったとき、平均値と最小値がどう変わるか確認しましょう。",
      ],
      code: `using Statistics

# 8回の反復計測のうち、5回目だけOSのバックグラウンド処理で 185.0 μs の遅延が混入した例
samples_us = [12.4, 12.3, 12.5, 12.3, 185.0, 12.4, 12.3, 12.4]
println((min_us = minimum(samples_us),
         median_us = median(samples_us),
         mean_us = round(mean(samples_us), digits = 2)))

# 実務での BenchmarkTools.jl の定石（グローバル変数には必ず $ を付ける）
# using BenchmarkTools
# x = randn(10_000)
# @btime sum($x)          # 最小実行時間とメモリ割当 (0 bytes) を自動ウォームアップ後に表示`,
      out: `(min_us = 12.3, median_us = 12.4, mean_us = 33.95)`,
      a: [
        "決定論的な計算の所要時間は「本来の機械語命令の時間 ＋ 外部ノイズ（常に非負）」なので、平均値 `33.95 μs` は1回のスパイクで約3倍に歪みます。そのため `@btime` は **最小値（`12.3 μs`）** を代表値として表示します。ただし大量のメモリ割当を伴う関数ではGC発生頻度も実時間の一部になるため、`@benchmark` で中央値と割当バイト数（`allocs`）を併せて確認します。",
      ],
    },
    {
      t: "転記ミスをゼロにする論文表の自動出力と Quarto レポート",
      b: [
        "論文執筆で最も危険で時間を奪う手作業が、**「コンソールに出た平均・SE・p値を目で見てWordやLaTeXの表へ手打ち・コピペする」** ことです。査読で「外れ値除外基準を2.5 SDに変えて再分析してほしい」と言われた瞬間、すべての表の数字を手で直し、直し忘れの転記ミスが生まれます。",
        "集計結果の `DataFrame` やタプル配列から、標準の `@sprintf` や定番パッケージ **`PrettyTables.jl` / `SummaryTables.jl` / `RegressionTables.jl`** で Markdown 表や LaTeX（`booktabs` 三線表）を直接ファイルへ書き出しましょう。さらにR Markdownの後継である **`Quarto`（`.qmd` で `engine: julia` を指定）** を使えば、本文・Julia集計表・`CairoMakie` ベクター図を1コマンド（`quarto render`）でPDF・HTML・Word原稿へ統合できます。",
      ],
      code: `using Printf

rows = [("統制群", 24, 524.21, 16.64), ("介入群", 24, 506.13, 16.41)]
md_lines = ["| 条件 | n | 平均 (ms) | SE (ms) |", "| :--- | ---: | ---: | ---: |"]
for (cond, n, m, se) in rows
    push!(md_lines, @sprintf("| %s | %d | %.1f | %.2f |", cond, n, m, se))
end
println(join(md_lines, "\n"))

# パッケージを使う実務例:
# using PrettyTables
# open("output/table1.tex", "w") do io
#     pretty_table(io, summary_df; backend = Val(:latex))
# end`,
      out: `| 条件 | n | 平均 (ms) | SE (ms) |
| :--- | ---: | ---: | ---: |
| 統制群 | 24 | 524.2 | 16.64 |
| 介入群 | 24 | 506.1 | 16.41 |`,
      a: [
        "原稿側のLaTeXでは `\\input{output/table1.tex}` と1行読み込むだけにしておけば、データや前処理を更新してスクリプトを走らせるだけで論文内のすべての表と図が同時に最新化されます。Rの `dplyr` に近いパイプ記法で表を作りたい人には **`DataFramesMeta.jl`** や **`TidierData.jl`** も人気です。",
      ],
    },
    {
      t: "多重ディスパッチのご褒美：物理単位（Unitful）と不確かさの自動伝播",
      b: [
        "最後に、「他の言語にはなかなかないJuliaならではの便利さ」を体験しましょう。Juliaの標準関数（`sum` や `mean` など）は特定の数値型に縛られず汎用的に書かれています。そのため、**「値と標準誤差のペア」や「ミリ秒 `ms`・秒 `s` などの物理単位」を表す型** を渡すだけで、既存の関数を1行も書き換えずに単位換算や誤差伝播が自動で動きます。",
        "実務では物理単位の取り違え（例：`500 ms` に誤って `0.2` 秒をそのまま足して `500.2` にしてしまう事故）を型エラーで防ぐ **`Unitful.jl`** や、1次テイラー展開の誤差伝播を自動計算する **`Measurements.jl`** が使われます。その仕組みがたった数行の多重ディスパッチで動くことを確かめましょう！",
      ],
      code: `using Statistics

# 値と標準誤差を持つ最小の不確かさ型（Measurements.jl の基本原理）
struct Uncertain <: Real
    val::Float64
    err::Float64
end
Base.:+(a::Uncertain, b::Uncertain) = Uncertain(a.val + b.val, hypot(a.err, b.err))
Base.:-(a::Uncertain, b::Uncertain) = Uncertain(a.val - b.val, hypot(a.err, b.err))
Base.:/(a::Uncertain, c::Real)      = Uncertain(a.val / c, abs(a.err / c))

pre_u  = Uncertain(524.2, 3.1)
post_u = Uncertain(506.1, 2.9)
diff_u = post_u - pre_u
# Statistics.mean を一切書き換えていないのに、そのまま Uncertain 配列の平均と誤差伝播が動く!
avg_u  = mean([pre_u, post_u])
println((diff = (round(diff_u.val, digits = 1), round(diff_u.err, digits = 2)),
         avg  = (round(avg_u.val, digits = 2),  round(avg_u.err, digits = 2))))

# Unitful.jl なら単位換算と次元不一致の検出も自動:
# using Unitful
# 500u"ms" + 0.25u"s"   # => 750.0 ms (自動で単位を揃えて加算)
# 500u"ms" + 10u"Hz"    # => DimensionError (時間と周波数の誤加算を即座に阻止!)`,
      out: `(diff = (-18.1, 4.24), avg = (515.15, 2.12))`,
      a: [
        "`Statistics.mean` の中身を一度も触っていないのに、`+` と `/` を定義しただけで平均 `515.15` と合成誤差 `√(3.1² + 2.9²) / 2 = 2.12` が自動計算されました（なお相関のある推定量同士では共分散項も考慮します——`Measurements.jl` は同一変数の自己相関まで追跡します）。なお、アプリのヘッダや目次にある **「逆引き・レシピ」** 画面では、R・Pythonからの対訳辞典と目的別スタータースクリプトをいつでも検索・コピーできます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "Juliaで分析関数を何度も修正しながら試すとき、毎回ターミナルから `julia run.jl` を実行し直して初回コンパイル待ち（TTFX）を繰り返すのを避けつつ、論文提出前の再現性も守る運用として最も適切なものはどれでしょう?",
      opts: [
        "すべての変数に `global` を付け、テストもプロジェクト環境も作らずREPL履歴だけを頼りにする",
        "日常の試行錯誤では常駐REPLで `Revise.jl`（`includet`）を使って関数変更を即時反映させ、最終結果の出力や検証では `julia --startup-file=no --project=. run.jl` と新プロセスでクリーン実行する",
        "`startup.jl` の中で毎回乱数シードと作業ディレクトリを固定値に書き換え、共同研究者にも同じ個人設定ファイルを強制する",
        "コンパイル時間を省くため、Juliaでは関数を一切定義せず1万行の直書きスクリプトにする",
      ],
      ans: 1,
      why: "常駐REPL＋`Revise` で日常の試行サイクルをミリ秒単位に短縮しつつ、成果物生成や再現性確認では `--startup-file=no --project=.` で個人設定を遮断して新プロセス実行する二段運用が最も快適かつ安全です。",
      hint: "「普段の試行錯誤の速さ」と「他人の環境でも同じ結果が出る再現性」をどう両立するかを考えます。",
    },
    {
      k: "fill",
      q: "`Revise.jl` を使って、`src/analysis_fns.jl` 内の関数定義を「ファイル保存のたびに自動追跡・更新される」状態で読み込む関数名を入力しましょう（通常の `include` に追跡の1文字が付きます）。",
      code: `using Revise
〔?〕("src/analysis_fns.jl")`,
      accept: ["includet"],
      show: "includet",
      why: "`includet`（include and track）を使うと、指定したファイルを編集・保存するたびに `Revise` が差分を検知してREPL上のメソッド定義を自動更新します。",
      hint: "`include` の末尾に track（追跡）の頭文字 `t` を付けた関数名です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "`Test` 標準ライブラリ、`BenchmarkTools.@btime`、および論文表の自動出力について、正しいか判定しましょう。",
      items: [
        {
          s: "`BenchmarkTools.@btime` でREPL上の変数 `x` を渡して関数 `f` を計測するときは、グローバル変数の型不安定な参照コストが混ざらないよう `@btime f($x)` と `$` で補間する",
          a: true,
          why: "`$x` と補間することで計測ループの外側で `x` の値と具象型が束縛され、関数 `f` 本来の実行時間とメモリ割当を正確に測定できます。",
        },
        {
          s: "浮動小数点数の計算結果を `@test` で検証するときは、丸め誤差を考慮せず常に厳密等価 `==` だけを使うべきであり、`isapprox` は使ってはならない",
          a: false,
          why: "`Float64` の演算順序による微小な丸め差で偽陽性エラーにならないよう、連続量の比較には許容誤差を明示した `isapprox(actual, expected; atol = 1e-8)` を使うのが定石です。",
        },
        {
          s: "コンソールに表示された平均値や標準誤差を手作業でWordやLaTeXの表に打ち直すより、スクリプトから直接 `.md` / `.tex` / `.csv` の表ファイルを書き出すほうが、前処理変更時の転記ミスを防げる",
          a: true,
          why: "集計コードから表ファイルを直接出力すれば、除外基準やモデルの再実行と同時に表の数値も一括更新され、手作業での見落としや桁取り違えを構造的に防げます。",
        },
      ],
      hint: "`@btime` の `$` 補間、`Float64` の丸め誤差、および再分析時の表更新の手順を確認します。",
    },
    {
      k: "choice",
      q: "`Unitful.jl` や `Measurements.jl` のようなパッケージが、`Statistics.mean` などの既存パッケージの関数を書き換えなくてもそのまま単位換算や誤差伝播を実行できる理由として正しいものはどれでしょう?",
      opts: [
        "Juliaの関数が引数を文字列に変換して正規表現で計算しているから",
        "Juliaの汎用関数が特定の `Float64` 型に縛られず書かれており、`+` や `/` などの基本演算を新しい数値型に対して多重ディスパッチで定義すればそのまま合成できるから",
        "Juliaが実行時にインターネット経由で外部サーバへ計算を委託しているから",
        "単位や誤差の情報は最初の1ステップで自動的に捨てられてただの `Int64` になるから",
      ],
      ans: 1,
      why: "汎用的な型制約（ダックタイピング／抽象型 `Real` など）と多重ディスパッチの組み合わせにより、基本演算を定義した独自型を既存アルゴリズムへそのまま流し込めるのがJuliaの大きな強みです。",
      hint: "5ページ目で `Uncertain <: Real` に `+`, `-`, `/` だけを定義したときになぜ `mean` が動いたかを思い出します。",
    },
  ],
};
