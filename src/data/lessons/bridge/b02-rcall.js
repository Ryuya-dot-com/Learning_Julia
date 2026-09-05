// R・Stan連携2: JuliaからRを呼ぶ
// 事実確認(2026-09-04): RCall.jl公式latest docs(installation / getting started / supported conversions)。
export default {
  id: "julia-to-r",
  title: "RCallでJuliaからRを呼ぶ",
  tag: "値を明示して渡し、Rの結果をJuliaへ戻す",
  pages: [
    {
      t: "RCallを使う場面を限定する",
      b: [
        "RCall.jlはJulia processの中でRを初期化し、Rの式を評価します。Juliaに置き換えること自体を目的にせず、Rで検証済みのpackageや、Julia側に安定した実装がない手法を一部だけ呼ぶために使います。",
        "前処理から報告までを無計画に両言語へ分散すると、object変換と環境管理が増えます。呼び出すR関数、渡す値、返す最小結果を先に決めます。長時間処理や大きな成果物は、独立したRscriptとfile受け渡しも検討します。",
        "この章のRCall例は定期CIの実行対象ではありません。配布templateで検証しているRscript経由の連携とは別です。手元で試す際は、R・Julia・RCallの版と、渡した値が意図した型で戻ることを確認してください。",
      ],
    },
    {
      t: "RとRCallを研究projectへ固定する",
      b: [
        "RCallを使うにはRが必要です。RCallはR_HOME、PATH上のR、Windows registryなどからRを探します。特定のRを使う場合はR_HOMEを指定してRCallをbuildします。Rを更新した後に読込エラーが出た場合も、使用するRを確認してbuildし直します。",
        "RCallは解析用のJulia projectへ追加します。全教材や別projectへ暗黙に追加しません。R側で使うpackageの版はrenv.lockやsessionInfo()で別に記録します。",
      ],
      code: `pkg> activate path/to/analysis
pkg> add RCall

julia> ENV["R_HOME"] = "/path/reported/by/R/RHOME"
julia> using Pkg
julia> Pkg.build("RCall")`,
      a: [
        "R_HOMEはRの実行fileそのものではなく、R HOMEが返すdirectoryです。通常のRがPATHから見つかる環境では、手動指定は不要です。",
      ],
    },
    {
      t: "using RCallでR processを初期化する",
      b: [
        "`using RCall`でRが初期化されます。Julia REPLで`$`を押すとR modeへ入り、BackspaceでJuliaへ戻れます。R modeは対話的な確認に便利ですが、再現する処理はscript内のR文字列か関数呼び出しとして残します。",
        "最初にR.version.string、必要なpackageのpackageVersion、JuliaのBase.active_project()を記録し、想定した環境が選ばれたか確かめます。",
      ],
      code: `using RCall

println(rcopy(R"R.version.string"))
println(Base.active_project())
R"sessionInfo()"`,
    },
    {
      t: "値は@rputで渡し、@rgetで戻す",
      b: [
        "`@rput x group`は、Juliaの変数を同じ名前でRへコピーします。Rで作った単純な係数配列を`@rget`でJuliaへ戻せます。R object全体を境界の外へ持ち出すより、後続処理に必要な数値と名前だけを返す方が契約を確認しやすくなります。",
        "次の例では、R側でfactorの参照水準を明示してから線形modelを当てます。文字列の並び順に参照水準を任せません。",
      ],
      code: `using RCall

rt_ms = [510.0, 520.0, 470.0, 480.0]
condition = ["control", "control", "treatment", "treatment"]
@rput rt_ms condition

R"""
condition <- factor(condition, levels = c("control", "treatment"))
fit <- lm(rt_ms ~ condition)
coef_values <- unname(coef(fit))
coef_names <- names(coef(fit))
"""

@rget coef_values coef_names
println((names = coef_names, estimates = coef_values))`,
      out: `(names = ["(Intercept)", "conditiontreatment"], estimates = [515.0, -40.0])`,
    },
    {
      t: "R\"...\"の返り値はRObjectである",
      b: [
        "`R\"mean($rt_ms)\"`の返り値は、JuliaのFloat64ではなくRObjectです。Julia側の通常の値として扱うときは`rcopy`で変換します。変換後の型、長さ、名前、欠損を検査します。",
        "大きなDataFrameを何度も往復すると、変換とcopyが繰り返されます。R側へ一度渡して複数処理をまとめるか、file境界へ切り替えます。",
      ],
      code: `r_mean = R"mean($rt_ms)"
julia_mean = rcopy(r_mean)

@assert julia_mean isa Float64
@assert julia_mean == 495.0`,
    },
    {
      t: "codeではなく値を補間する",
      b: [
        "利用者が入力した列名や式を文字列連結してR codeへ埋め込むと、意図しない式まで実行される危険があります。数値や配列は`@rput`またはR文字列の値補間で渡し、実行するR code自体はrepositoryで管理します。",
        "列名を選ばせる場合は、許可した列名の集合と照合してから使います。自由記述をそのままformulaやsystem commandへ入れません。連携境界は入力検証の境界でもあります。",
      ],
    },
    {
      t: "R packageの有無を入口で止める",
      b: [
        "lavaanなどを呼ぶ前に、R側でpackageが利用可能か確認します。自動installを解析scriptへ混ぜると、実行ごとに環境が変わり得ます。導入手順と解析手順を分け、packageがなければ明確なerrorで停止します。",
      ],
      code: `R"""
if (!requireNamespace("lavaan", quietly = TRUE)) {
    stop("R package 'lavaan' がありません。renv環境を復元してください。")
}
message("lavaan version: ", as.character(packageVersion("lavaan")))
"""`,
    },
    {
      t: "RDSはR固有objectが必要なときだけ使う",
      b: [
        "Rのmodel objectをRで再利用するなら、RCallからsaveRDSとreadRDSを呼べます。Juliaで表として利用したい結果は、係数・区間・診断を平坦な表へ取り出してCSVやArrowでも残します。",
        "RDSだけを正式成果物にすると、R環境なしでは内容を検査しにくくなります。RDS、平坦な結果表、R script、renv.lockを一組にし、R objectの内部構造だけへ依存しないようにします。",
      ],
      code: `@rput fit_path
R"saveRDS(fit, file = fit_path)"

R"restored_fit <- readRDS($fit_path)"
restored_coef = rcopy(R"unname(coef(restored_fit))")`,
    },
    {
      t: "失敗をJuliaの値で覆い隠さない",
      b: [
        "Rでwarningやerrorが出たとき、古い結果や仮の値へ置き換えて解析を続けません。呼び出した関数、入力schema版、Rとpackageの版を記録し、最小例で再現します。",
        "R更新後の読込失敗、R_HOMEの不一致、R package不足、factor水準の変化、NA変換を順に切り分けます。RCallが動いたことと、統計modelが問いに合っていることは別の検証です。",
        "配布templateのRscript例は標準出力・標準エラーをrun別のlogへ保存します。失敗時には途中成果物とfailure.tomlも残し、確認するまで同じrun IDを上書きしません。logにはlocal pathや入力由来のmessageが入り得るため、公開前に内容を確認します。",
      ],
    },
  ],
  ex: [
    {
      k: "fill",
      q: "Juliaの変数xを同じ名前でRへ渡します。空欄を埋めましょう。",
      code: "〔?〕 x",
      accept: ["@rput"],
      show: "@rput",
      why: "`@rput x`はJuliaのxをR環境へコピーします。Rから同じ名前で戻すときは`@rget x`です。",
      hint: "putは渡す、getは受け取る、先頭はマクロを示す@です。",
      placeholder: "マクロ名",
    },
    {
      k: "choice",
      q: "R\"mean($x)\"の結果をJuliaの通常の値へ変換する関数はどれでしょう?",
      opts: ["rcopy", "copy", "convertR"],
      ans: 0,
      why: "R文字列の結果はRObjectです。`rcopy`で対応するJuliaの値へ変換します。",
      hint: "RCallのgetting startedにある、Rからcopyする関数です。",
    },
    {
      k: "choice",
      q: "利用者が選んだ列名をRへ渡す方法として安全なのはどれでしょう?",
      opts: ["許可した列名と照合し、値として渡す", "R codeの文字列へそのまま連結する", "入力をsystem commandへ渡して判定する"],
      ans: 0,
      why: "実行するcodeと入力値を分けます。自由入力をR codeやcommandへ連結すると、意図しない処理を実行させる境界になります。",
      hint: "codeとdataを分離できている選択肢を選びます。",
    },
    {
      k: "tf",
      q: "RCallの運用について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "Rを更新した後は、使用するR_HOMEを確認してRCallの再buildが必要になることがある",
          a: true,
          why: "RCallはbuild時に使うRを記録します。R更新後の問題では、R_HOMEと再buildを確認します。",
        },
        {
          s: "解析scriptの冒頭で、足りないR packageを毎回自動installするのが再現性に最もよい",
          a: false,
          why: "導入と解析を分け、renvなどで版を固定します。解析中の自動installは環境を変化させます。",
        },
        {
          s: "RCallがerrorなく動けば、選んだ統計modelも妥当だと確認できる",
          a: false,
          why: "連携の動作確認と、model・仮定・推定対象の妥当性は別の検証です。",
        },
      ],
      hint: "環境の再現と、統計的な妥当性を分けて考えましょう。",
    },
  ],
};
