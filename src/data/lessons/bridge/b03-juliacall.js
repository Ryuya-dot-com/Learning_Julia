// R・Stan連携3: RからJuliaを呼ぶ
// 事実確認(2026-09-04): JuliaCall公式README・julia_setup reference。
export default {
  id: "r-to-julia",
  title: "JuliaCallでRからJuliaを呼ぶ",
  tag: "Rの解析経路から、Juliaの関数だけを利用する",
  pages: [
    {
      t: "入口を使う側の言語に合わせる",
      b: [
        "研究室の正式な解析scriptがRにあり、一部のsimulationやJulia packageだけを使いたい場合は、RからJuliaを呼ぶ方が自然です。R利用者にJuliaのdriver scriptまで管理させず、Rの経路を入口として保てます。",
        "JuliaCallはR processへJuliaを組み込みます。JuliaからRを呼ぶRCallと向きが逆です。一つの処理で両方向の呼び出しを重ねる構成は避け、どちらが全体を進めるdriverか一つに決めます。",
      ],
    },
    {
      t: "R sessionごとにJuliaを初期化する",
      b: [
        "R側でJuliaCallを導入し、`julia_setup()`を実行します。これは自動変換や表示方法を準備するため、新しいR sessionごとに必要です。PATH上のJuliaを使うか、JULIA_HOMEで使用するJuliaの場所を明示します。",
        "JuliaCallの公式資料は、対応対象としてJuliaの安定版・LTSを挙げています。教材の例を研究へ移すときは、実際に検証したR、Julia、JuliaCallの版を固定します。",
      ],
      code: `install.packages("JuliaCall")  # 導入時に一度だけ

library(JuliaCall)
julia <- julia_setup()

julia_eval("VERSION")
R.version.string
packageVersion("JuliaCall")`,
    },
    {
      t: "最初は引数と返り値が単純な関数で試す",
      b: [
        "`julia_call`へJulia関数名と引数を渡すと、結果がRへ変換されます。まず数値Vectorを受け取り、数値や短いNamedTupleを返す純粋な関数で境界を試します。fileを更新したりglobal変数へ依存したりする関数から始めません。",
      ],
      code: `library(JuliaCall)
julia <- julia_setup()

julia_command("range_summary(x) = (minimum = minimum(x), maximum = maximum(x))")
result <- julia_call("range_summary", c(4, 8, 15, 16, 23, 42))

result$minimum
result$maximum`,
      out: `[1] 4
[1] 42`,
    },
    {
      t: "研究用関数はJulia fileに置く",
      b: [
        "長いJulia codeをR文字列へ埋め込まず、Julia側のsrc fileに関数として保存します。R側はprojectを有効化し、そのfileをincludeして、公開した関数だけを呼びます。",
        "project pathを利用者入力から組み立てる場合、Julia code文字列へ直接連結しません。`julia_assign`で値として渡してからPkg.activateへ渡します。Manifest.tomlを共有し、必要なpackage版をR側の都合で変更しないようにします。",
      ],
      code: `project_dir <- normalizePath("julia", mustWork = TRUE)
julia_assign("project_dir", project_dir)
julia_command("using Pkg; Pkg.activate(project_dir); Pkg.instantiate()")
julia_command("include(joinpath(project_dir, \"src\", \"analysis.jl\"))")

result <- julia_call("summarize_trials", trial_vector)`,
      a: [
        "Pkg.instantiateは環境準備の段階で行います。毎回の分析処理へ無条件に混ぜず、準備済み環境ではactivateと版確認だけにできます。",
      ],
    },
    {
      t: "型変換の境界を試験する",
      b: [
        "数値、文字列、真偽値、欠損、日付、カテゴリ、DataFrameは、RとJuliaで型体系が異なります。実データを渡す前に、代表値を含む小さなfixtureで往復を試します。特にRのNA、integerとdouble、factorの水準順序を確認します。",
        "大きな表を引数として繰り返し渡すより、検証済みfileを一度読み込む関数にする方が境界は単純です。返り値も、巨大な内部objectではなく、列名を固定した結果表や保存先pathにします。",
      ],
    },
    {
      t: "一つのR sessionで初期化を繰り返さない",
      b: [
        "`julia_setup()`はR sessionの初めに一度実行し、同じJulia processを使います。行ごとや関数呼び出しごとにJuliaを初期化すると、起動費用が支配的になります。",
        "高速化が目的なら、連携前後を含む実時間を測ります。Julia関数そのものが速くても、起動、変換、compileを含めると小さな処理ではRだけの方が短いことがあります。測定して差がなければ、言語を増やさない方が保守しやすくなります。",
      ],
    },
    {
      t: "失敗時に確認する順序を決める",
      b: [
        "Juliaが見つからない場合は、PATH、JULIA_HOME、julia_setupが選んだ実行fileを確認します。R更新後にRCall関連の初期化で失敗する場合、JuliaCallの`julia_setup(rebuild = TRUE)`が必要になることがあります。",
        "次に、active project、Manifest、includeしたfile、関数名、引数型を確認します。最後に統計結果を点検します。環境の問題とmodelの問題を同時に追わないことが、最短の切り分けです。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "R中心の解析から一部のJulia関数だけを使う場合、全体のdriverとして自然なのはどれでしょう?",
      opts: ["R scriptからJuliaCallで呼ぶ", "JuliaとRが互いを交互に呼ぶ", "結果fileを両言語で上書きする"],
      ans: 0,
      why: "正式な解析経路がRなら、RをdriverとしてJuliaの限定した関数を呼ぶと、入口と責任が一つに定まります。",
      hint: "既存の正式な解析scriptを入口として保つ選択肢です。",
    },
    {
      k: "fill",
      q: "R sessionでJuliaCallの初期化を行う関数名を答えましょう。",
      code: "julia <- 〔?〕()",
      accept: ["julia_setup", "juliacall::julia_setup"],
      show: "julia_setup",
      why: "`julia_setup()`は自動型変換や表示を準備し、新しいR sessionごとに必要です。",
      hint: "Juliaをsetupする、そのままの関数名です。",
      placeholder: "関数名",
    },
    {
      k: "choice",
      q: "project directoryをJuliaへ渡す方法として適切なのはどれでしょう?",
      opts: ["julia_assignで値として渡し、Pkg.activateで使う", "利用者入力をJulia code文字列へ直接連結する", "毎回別のprojectを自動生成する"],
      ans: 0,
      why: "pathをcodeから分けて値として渡すと、引用符や意図しないcode実行の問題を避けられます。",
      hint: "codeと値を分離する方法を選びます。",
    },
    {
      k: "tf",
      q: "RからJuliaを使う運用について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "Julia関数が高速なら、起動と型変換を含めても必ずRだけより速い",
          a: false,
          why: "小さな処理ではJuliaの初期化、compile、型変換の時間が大きくなります。経路全体を測ります。",
        },
        {
          s: "長いJulia codeはR文字列へ埋め込まず、Julia fileの関数として管理する",
          a: true,
          why: "Julia側のProject、Manifest、src fileを独立して管理すると、試験と再利用ができます。",
        },
        {
          s: "NAやfactorを含む小さなfixtureで、型変換を先に確認する",
          a: true,
          why: "言語間で表現が異なる値を先に試すと、実データでの変換事故を切り分けられます。",
        },
      ],
      hint: "起動費用、codeの所有場所、型変換の三点を確認します。",
    },
  ],
};
