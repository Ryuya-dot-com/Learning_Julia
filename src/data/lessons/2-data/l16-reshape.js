// レッスン: データの整形・保存・再利用 — 表と分析成果を失わない
// コード例・出力は Julia 1.12.6 + DataFrames 1.8.2 + CSV 0.10.16 + Arrow 2.8.1 + JLD2 0.6.5 で実測済み(2026-08-02)
// 保存形式の往復値とmetadata保持は scripts/data-persistence-check.jl で固定検証する。
export default {
  id: "reshape-import",
  title: "データの整形・保存・再利用",
  tag: "縦横変換からCSV・Arrow・JLD2へ",
  pages: [
    {
      t: "「横持ち」と「縦持ち」",
      b: [
        "このレッスンでは、表の形を変える（縦横変換）こと、複数の表を積み重ねること、分析データを目的に応じた形式で保存・再利用することを学びます。",
        "SPSSでよく見る「1行=1人、条件ごとに列が並ぶ」形を横持ち(ワイド)、「1行=1観測」の形を縦持ち(ロング)と呼びます。統計モデルの多くは縦持ちを要求するので、行き来できることが大切です。",
      ],
    },
    {
      t: "stack: 横→縦",
      b: ["1人1行の横持ち表を、`stack` で縦持ちに変換します。縦にしたい列(条件の列)を指定します。"],
      code: `using DataFrames
wide = DataFrame(id = ["P01", "P02"], cong = [520.4, 550.9], incong = [580.9, 610.6])
long = stack(wide, [:cong, :incong])
println(long)`,
      out: `4×3 DataFrame
 Row │ id      variable  value
     │ String  String    Float64
─────┼───────────────────────────
   1 │ P01     cong        520.4
   2 │ P02     cong        550.9
   3 │ P01     incong      580.9
   4 │ P02     incong      610.6
`,
      a: [
        "2人×2条件が4行になりました。列名だった cong / incong が variable 列の中身になり、数値は value 列へ。これが「1行=1観測」の縦持ちです。",
      ],
    },
    {
      t: "unstack: 縦→横",
      b: ["逆方向は `unstack` です。「どの列を行に、どの列を新しい列名に、どの列を中身にするか」を順に指定します。"],
      code: `println(unstack(long, :id, :variable, :value))`,
      out: `2×3 DataFrame
 Row │ id      cong      incong
     │ String  Float64?  Float64?
─────┼────────────────────────────
   1 │ P01        520.4     580.9
   2 │ P02        550.9     610.6
`,
      a: [
        "元の横持ちに戻りました。「stack で縦に、unstack で横に」。行き先の形から関数を選びましょう。型に `?` が付いたのは、unstack が「組み合わせの欠けたセルは missing になるかもしれない」前提で列を作るためです(「グループ集計と結合」で見た印ですね)。",
      ],
    },
    {
      t: "vcat: 表を積み重ねる",
      b: [
        "参加者ごとに別ファイルで記録されたデータは、読みこんでから `vcat`(vertical concatenate: 縦に連結)で1つの表に積み重ねます。",
      ],
      code: `d1 = DataFrame(id = ["P01", "P01"], rt = [512.5, 560.4])
d2 = DataFrame(id = ["P02", "P02"], rt = [530.1, 588.2])
println(vcat(d1, d2))`,
      out: `4×2 DataFrame
 Row │ id      rt
     │ String  Float64
─────┼─────────────────
   1 │ P01       512.5
   2 │ P01       560.4
   3 │ P02       530.1
   4 │ P02       588.2
`,
      a: [
        "実際の研究では、「内包表記」と組み合わせて `dfs = [CSV.read(f, DataFrame) for f in files]` と全ファイルを読み、`vcat(dfs...)` で一気に連結します(`...` は「配列の中身をぜんぶ引数として並べる」記号です)。30人分のログファイルもこの2行で1つの表になります。",
      ],
    },
    {
      t: "変数への代入と、ファイルへの保存は別",
      b: [
        "`analysis_data = DataFrame(...)` は実行中のJuliaプロセスに名前を付けただけです。Juliaを終了しても残すには、目的に合う形式でファイルへ書き出し、別セッションで読み戻せることを確認します。",
        "保存形式を『どれが最強か』で選びません。人が読めるか、RやPythonと交換するか、Julia固有の複数オブジェクトをまとめるか、一時cacheか、10年後も読むかで選択が変わります。",
        "最低限残すのは、生の原記録、分析用に整形した表、変換コード、列の意味と単位、カテゴリ水準、欠測規則、`Project.toml`／`Manifest.toml`です。同じ拡張子でも、これらの意味は自動保存されません。",
      ],
    },
    {
      t: "CSVは共有しやすいが、schemaを持たない",
      b: [
        "CSVは人が確認でき、多くのソフトで読める交換用の基準です。一方、文字列・日付・カテゴリ・欠測をどの型として読むか、カテゴリの順序、列の単位はCSV本文だけでは完全に決まりません。data dictionaryと読み込みコードを一緒に残します。",
      ],
      code: `using CSV, DataFrames, CategoricalArrays, Dates

analysis_data = DataFrame(
    id = ["P01", "P02", "P03"],
    condition = categorical(["control", "treatment", "control"], ordered=true),
    rt = Union{Missing, Float64}[512.5, missing, 488.0],
    collected = Date.(2026, 8, 1:3),
)
levels!(analysis_data.condition, ["control", "treatment"])

CSV.write("analysis.csv", analysis_data)
csv_data = CSV.read("analysis.csv", DataFrame)
println((condition_type = string(eltype(csv_data.condition)),
         missing_restored = ismissing(csv_data.rt[2]),
         collected_type = string(eltype(csv_data.collected))))`,
      out: `(condition_type = "String15", missing_restored = true, collected_type = "Date")`,
      a: [
        "この例では日付とmissingは推定されましたが、conditionは通常の文字列になり、`control < treatment` という順序metadataは消えました。読み込み時の型推定が今回成功したことと、CSVがschemaを保証することは別です。",
        "原データを同じファイル名で上書きせず、`raw/`は読み取り専用、変換後は`derived/`、表や図は`output/`へ分けます。公開時には識別子、自由記述、ファイルmetadataも匿名化対象です。",
      ],
    },
    {
      t: "Arrowは表を他言語へ型つきで渡す",
      b: [
        "Arrowは列指向の共通形式で、Julia・R・Python間の大きな表の交換に向きます。JuliaではTables.jl互換の表を `Arrow.write` で保存し、`Arrow.Table`を`DataFrame`として受け取れます。",
      ],
      code: `using Arrow
Arrow.write("analysis.arrow", analysis_data)
arrow_data = DataFrame(Arrow.Table("analysis.arrow"))

println((condition_type = string(eltype(arrow_data.condition)),
         condition_levels = String.(levels(arrow_data.condition)),
         ordered = isordered(first(arrow_data.condition))))`,
      out: `(condition_type = "CategoricalValue{String, UInt32}", condition_levels = ["control", "treatment"], ordered = false)`,
      a: [
        "検証環境ではカテゴリ値と水準はdictionary encodingとして往復しましたが、順序flagはtrueからfalseへ変わりました。Julia同士でもmetadataがすべて保たれるとは限りません。交換先で列型、水準、順序、欠測数、行数を検査し、既知のschemaから順序を再設定します。",
        "`Arrow.Table`とそこから作るDataFrameの列は、ファイルへmemory mapされた読み取り中心のArrow-backed viewになり得ます。変更が必要なら対象列を`copy`するか、既知のschemaから通常の配列・CategoricalArrayへ作り直します。",
      ],
    },
    {
      t: "JLD2はJuliaの複数オブジェクトを名前つきでまとめる",
      b: [
        "RのRDSに近い『Juliaの値をまとめて戻したい』用途にはJLD2が候補です。表だけでなく、配列、NamedTuple、文字列、分析設定などをdataset名つきで保存できます。",
      ],
      code: `using JLD2
formula_text = "rt ~ condition"
summary_values = (observed = 2, mean_rt = 500.25)

jldsave("analysis.jld2";
    data = analysis_data,
    formula_text,
    summary_values,
    julia_version = string(VERSION))

bundle = load("analysis.jld2")
println((keys = sort!(collect(keys(bundle))),
         levels = String.(levels(bundle["data"].condition))))`,
      out: `(keys = ["data", "formula_text", "julia_version", "summary_values"], levels = ["control", "treatment"])`,
      a: [
        "検証ではDataFrame、missing、日付、カテゴリ順、NamedTupleを往復できました。とはいえpackageのstruct定義が将来変われば、古い複雑なobjectは読み込みに変換が必要になることがあります。",
        "長期保存では、JLD2だけに賭けません。分析用表をArrowまたはCSVでも残し、formula、係数、vcov、予測値、診断量を単純な表として書き出します。JLD2は便利な復帰点、共通形式は独立した避難経路です。",
      ],
    },
    {
      t: "Serializationは高速な一時cacheとして限定する",
      b: [
        "標準libraryのSerializationは、ほぼ任意のJulia値をopaqueなbinaryへ保存できます。追加package不要で簡単ですが、人や他言語は読めず、外部packageの型変更や無名関数に弱いため、長期archiveの第一候補にはしません。",
      ],
      code: `using Serialization
serialize("analysis.jls", (; analysis_data, formula_text, summary_values))
cache = deserialize("analysis.jls")
println((rows = nrow(cache.analysis_data), formula = cache.formula_text))`,
      out: `(rows = 3, formula = "rt ~ condition")`,
      a: [
        "Julia公式documentationは、`deserialize`が入力を検証せず、壊れたdataでprocess終了も起こり得ると注意しています。出所不明の`.jls`を読み込まず、自分の信頼できる一時cacheに限定します。",
        "同じJulia 1.x間の読み戻しを意図していても、保存された外部package型の定義変更は例外です。cacheは再生成できるようにし、元データ・生成コード・環境を本体として残します。",
      ],
    },
    {
      t: "RDataとRDSを同じものとして扱わない",
      b: [
        "`.rda`／`.RData`は複数の名前つきR objectを保存でき、RData.jlの公式READMEはこれらの読み込みとJulia型への変換を説明しています。書き出しや`.rds`の直接対応を同じAPIの機能として仮定しません。",
        "`.rds`はRの単一object保存形式です。RDSそのものを確実に交換する必要があるなら、任意発展としてRCallでRを起動し、`@rput analysis_data`の後にR側の`saveRDS`、読み込みは`readRDS`と`rcopy`／`@rget`を使います。これはJulia native形式ではなく、Rの実行環境を必要とします。",
        "表をRとJuliaで往復するだけなら、RDSへ固定せずArrowまたはCSVを第一候補にします。R固有class、factor contrast、label、timezoneなどが研究上重要なら、両側でclassとmetadataを明示的に照合します。",
      ],
    },
    {
      t: "fitted model objectだけを研究成果にしない",
      b: [
        "model objectをJLD2やSerializationへ保存すると、同じ環境で作業を再開するには便利です。しかし型やpackage APIが変わると読めなくなるため、それだけを唯一の成果物にしません。",
        "最低限、分析用data、formulaまたはStan code、応答levelと参照水準、係数、vcovまたはposterior draws、予測値、診断、除外記録、seed、Juliaとpackageのversionを単純な表・textとしても残します。再適合できる材料と、再適合せず監査できる結果の両方が必要です。",
        "ファイルを保存した直後に終わらず、新しいJulia processを想定して読み戻し、行数、列名、型、水準、欠測数、要約値を検査します。`writeできた`ではなく`意味を保ってreadできた`までがround tripです。",
      ],
    },
    {
      t: "Stan連携ではdrawsより前後も保存する",
      b: [
        "StanSample.jlはJuliaからCmdStanを呼べますが、別途CmdStan、C++ toolchain、path設定が必要で、package repositoryにも保守継続上の注意があります。本編の必須実行にはせず、混合モデルとベイズ推論を学んだ後の任意bridgeとします。",
        "Stanでは`.stan` model、入力data(JSON等)、初期値、seed、chain・warmup設定、CmdStan／interface version、生のdraws CSV（chain別CSV）、summary、divergence・treedepth・R̂・ESS、事後予測を一組で残します。compile済みbinaryだけ、整形済みdrawsだけでは生成過程を復元できません。",
        "この保存原則はTuringでも同じです。推定engineを比較するときは、同じdata・parameterization・prior・乱数設定・診断基準を揃え、結果ファイルの拡張子の違いをmodel差と取り違えません。",
      ],
    },
    {
      t: "保存形式を役割で組み合わせる",
      b: [
        "共同研究・長期保管の表はArrow＋CSV、Juliaで複数の値を再開するcheckpointはJLD2、再生成できる短期cacheだけSerialization、R固有objectが必要な場合だけRCall＋RDS、という役割分担が安全です。",
        "推奨構成は `raw/`、`derived/`、`code/`、`output/`、`metadata/`です。rawは上書きせず、derivedへ変換履歴を残し、metadataへdata dictionary、同意・匿名化方針、software version、必要ならSHA-256等のchecksumを保存します。checksumは同一bytesの確認であり、内容の正しさや匿名性を保証するものではありません。",
        "一つのbinaryへすべて詰めると便利ですが、壊れたときの単一障害点になります。人が読める説明、言語中立の表、言語固有のcheckpointを重ね、どれか一つが読めなくても研究の意味を再構成できるようにします。",
        "保存した各層をProject／Manifest、schema、相対path、実行metadataで一つの生成経路へ結ぶ方法は、補講『再現可能な研究プロジェクト』で実践します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "横持ち(1人1行)の表を、統計モデル用の縦持ち(1行1観測)に変換する関数はどれでしょう?",
      opts: ["stack", "unstack", "vcat"],
      ans: 0,
      why: "`stack` が横→縦です。列名だった条件が variable 列の中身になります。逆方向が `unstack` でした。",
      hint: "積み上げて縦に長くする、という英単語です。",
    },
    {
      k: "fill",
      q: "参加者ごとに分かれた表 d1, d2 を縦に積み重ねます。空欄〔?〕に入る関数名を入力しましょう。",
      code: "〔?〕(d1, d2)",
      accept: ["vcat"],
      show: "vcat",
      why: "`vcat` は vertical concatenate(縦に連結)。同じ列を持つ表を積み重ねます。",
      hint: "vertical(縦)の頭文字 + cat(連結)の4文字です。",
      placeholder: "関数名",
    },
    {
      k: "choice",
      q: "このコードを実行すると、`long` は何行の表になるでしょう?",
      code: `wide = DataFrame(id = ["P01", "P02", "P03"], cong = [1, 2, 3], incong = [4, 5, 6])
long = stack(wide, [:cong, :incong])`,
      opts: ["6行", "3行", "2行"],
      ans: 0,
      why: "3人×2条件で6観測。縦持ちは「1行=1観測」なので6行です。",
      hint: "人数×条件数が観測の数になります。",
    },
    {
      k: "choice",
      q: "Juliaで整形した大きな表をRやPythonの共同研究者へ、型をできるだけ保って渡したいときの第一候補はどれですか？",
      opts: ["Arrow", "Serializationの.jls", "fitted model objectだけをJLD2へ保存"],
      ans: 0,
      why: "Arrowは列指向の共通形式です。交換先でも型・水準・欠測数のround trip検査は必要です。",
      hint: "Julia固有objectではなく、複数言語が共有する表形式を選びます。",
    },
    {
      k: "choice",
      q: "DataFrame、要約値、formula文字列をJuliaで名前つきの一つのcheckpointへまとめたい場合の候補はどれですか？",
      opts: ["JLD2", "PNG", "CSV一枚だけ"],
      ans: 0,
      why: "JLD2は複数のJulia objectをdataset名つきで保存できます。長期保管ではArrow／CSVとコードも併記します。",
      hint: "表以外の複数objectも扱えるJulia向け形式を考えます。",
    },
    {
      k: "tf",
      q: "データ保存について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "CSVへ書けばカテゴリの順序や列の単位も必ず自動保存される",
          a: false,
          why: "CSVはschemaを十分に持たないため、水準順や単位をdata dictionaryと読み込みコードへ残します。",
        },
        {
          s: "出所不明のSerialization fileでも、deserializeは内容を安全に検証してから読む",
          a: false,
          why: "deserializeは入力を検証しません。信頼できる再生成可能なcacheへ用途を限定します。",
        },
        {
          s: "model objectに加え、data・formula・係数やdraws・診断・versionを単純な形式でも残す",
          a: true,
          why: "package型が変わっても、再適合と監査に必要な材料を失わないためです。",
        },
      ],
      hint: "formatが保持する情報、読み込み時の信頼、長期再現性を分けます。",
    },
    {
      k: "choice",
      q: "Rの単一objectを.rdsとして厳密に保存・読込する必要があります。現状の説明として最も適切なのはどれですか？",
      opts: [
        "RCallからRのsaveRDS／readRDSを使う任意bridgeにし、R環境も記録する",
        "RData.loadがJulia nativeに.rdsを書き出すと仮定する",
        "拡張子を.jld2から.rdsへ変えるだけでよい",
      ],
      ans: 0,
      why: "RDSはR固有形式です。表交換だけならArrow／CSVも検討し、RDSが必要ならRの実行環境を含めて再現します。",
      hint: "RDataの文書化された.rda読込と、RのRDS関数を区別します。",
    },
  ],
};
