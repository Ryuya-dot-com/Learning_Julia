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
      fig: {
        src: "figures/wide-to-long-reshape.svg",
        alt: "1人1行の横持ち表と1観測1行の縦持ち表をstackとunstackで行き来する対応図",
        cap: "図: 横持ち（1人1行・条件ごと別列）を stack で縦持ち（1行1観測）へ畳み、unstack で元へ戻す。N人×K条件の横持ちを stack すると N×K 行になる。",
      },
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
        "ただし実際の研究では、「対象ファイルが0件でないか」「列名や型がそろっているか」「どのファイル由来の行か」「ファイルをまたいで同じ試行ID(キー)が重複していないか」まで点検すると安心です。書き出しと読み戻し確認(round trip)まで含めた手順は、補講「複数CSVと分析成果物の入出力」で実習します。",
      ],
    },
    {
      t: "変数への代入と、ファイルへの保存は別",
      b: [
        "`analysis_data = DataFrame(...)` と変数に入れても、データは実行中のJuliaのメモリ上にあるだけです。Juliaを終了しても残すには、目的に合う形式でファイルへ書き出し、あとで別のセッションから読み戻せることを確認します。",
        "保存形式は「どれが一番すぐれているか」では選びません。人間がそのまま読めるか、RやPythonと受け渡すか、Juliaの複数のデータ(表や設定値など)をひとまとめにするか、一時的な計算メモ(キャッシュ)か、10年後も読みたいかで選び方が変わります。",
        "研究データとして最低限残したいのは、手を加える前の生データ、分析用に整えた表、変換コード、各列の意味と単位、条件などの区分(カテゴリ水準)、欠損の扱いルール、そして使ったパッケージの記録(`Project.toml`／`Manifest.toml`)です。どの形式で保存しても、列の意味までは自動で記録されません。",
      ],
    },
    {
      t: "CSVは共有しやすいが、型や順序の設計図(schema)を持たない",
      b: [
        "CSVは人間がそのまま読めて、ほぼすべてのソフトで開ける共有の基本形式です。一方で、文字列・日付・条件区分(カテゴリ)・欠損をどの型として読むか、条件の並び順や単位まではCSV自体に記録されません。列の説明表(data dictionary)と読みこみコードをセットで残しましょう(下の例で使う `CategoricalArrays` は `] add CategoricalArrays` で入ります)。",
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
        "列の要素の型を調べる `eltype` で確認すると、日付と `missing` はうまく推定されましたが、順序つきカテゴリとして作った `condition` 列はふつうの文字列(`String15`)に戻り、`control < treatment` という順序情報(metadata)は消えました。「たまたま型を推定できたこと」と「ファイル形式が型情報(schema)を保証すること」は別です。",
        "生データを同じファイル名で上書きせず、生データは読み取り専用の `raw/`、整形後の表は `derived/`、集計表や図は `output/` へ分けます。データを公開するときは、参加者IDや自由記述だけでなく、ファイルの作成者情報(metadata)に個人情報が残っていないかも確認しましょう。",
      ],
    },
    {
      t: "Arrowは表を他言語へ型つきで渡す",
      b: [
        "Arrow(アロー)は列単位で型情報を保持できる共通形式で、Julia・R・Pythonの間で大きな表を受け渡すのに向いています(`] add Arrow` で入ります)。`Arrow.write` で保存し、`DataFrame(Arrow.Table(...))` で表として読み戻せます。",
      ],
      code: `using Arrow
Arrow.write("analysis.arrow", analysis_data)
arrow_data = DataFrame(Arrow.Table("analysis.arrow"))

println((condition_type = string(eltype(arrow_data.condition)),
         condition_levels = String.(levels(arrow_data.condition)),
         ordered = isordered(first(arrow_data.condition))))`,
      out: `(condition_type = "CategoricalValue{String, UInt32}", condition_levels = ["control", "treatment"], ordered = false)`,
      a: [
        "この実行結果では、カテゴリ型と水準一覧(`control`, `treatment`)は保たれましたが、順序ありの設定(`ordered`)は `true` から `false` に変わりました。Juliaどうしでも細かな付帯情報(metadata)まですべて保たれるとは限りません。受け取った側で列の型・水準・順序・欠損数・行数を確かめ、必要なら順序を再設定します。",
        "`Arrow.Table` から作った `DataFrame` の列は、ファイルを直接参照する「読み取り専用」の状態になっていることがあります。値を書きかえたいときは、`copy(arrow_data.rt)` のように通常の配列へコピーするか、`DataFrame(Arrow.Table(\"analysis.arrow\"), copycols = true)` として読みこみます。",
      ],
    },
    {
      t: "JLD2はJuliaの複数オブジェクトを名前つきでまとめる",
      b: [
        "Rの `.RData` のように「Juliaの複数のデータをまとめて保存し、そのまま戻したい」ときは `JLD2` パッケージ(`] add JLD2`)が便利です。表(`DataFrame`)だけでなく、配列、名前つきタプル `(a = 1, b = 2)`、文字列、分析設定などを名前つきで1ファイルにまとめられます。",
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
        "この例では `DataFrame`、`missing`、日付、カテゴリの順序までそのまま読み戻せました。ただし、将来パッケージのバージョンが上がって内部の型定義が変わると、複雑なデータはそのまま読めなくなることがあります。",
        "長期保存では `JLD2` だけに頼らないのが鉄則です。分析用の表は Arrow や CSV でも残し、後のSTEPで学ぶモデルの式や推定結果(係数・誤差・予測値など)もシンプルな表として書き出しておきます。`JLD2` は作業再開用の便利な保存先、CSVやArrowはいつでも読める避難経路として使い分けます。",
      ],
    },
    {
      t: "Serializationは高速な一時キャッシュに限定する",
      b: [
        "標準ライブラリの `Serialization` を使うと、追加パッケージなしでJuliaのほぼどんな値でも高速にバイナリファイル(人間や他の言語からは直接読めない形式)へ保存できます。手軽ですが、Juliaやパッケージの更新に弱いため、長期保管には向きません。",
      ],
      code: `using Serialization
serialize("analysis.jls", (; analysis_data, formula_text, summary_values))
cache = deserialize("analysis.jls")
println((rows = nrow(cache.analysis_data), formula = cache.formula_text))`,
      out: `(rows = 3, formula = "rt ~ condition")`,
      a: [
        "Juliaの公式ドキュメントでは、`deserialize` はファイルの中身を安全検査せずに読みこむため、壊れたデータでJuliaが強制終了したり危険な動作をしたりする可能性があると注意されています。出所不明の `.jls` ファイルは開かず、自分の手元の一時キャッシュ(計算の途中メモ)だけに限定しましょう。",
        "同じJulia 1.xどうしでも、外部パッケージのバージョンが変わると読み戻せなくなることがあります。キャッシュは「消えても元データとコードから作り直せるもの」と割り切り、元データ・変換コード・環境設定を本体として残します。",
      ],
    },
    {
      t: "RDataとRDSを同じものとして扱わない",
      b: [
        "Rのデータ形式には、複数のデータに名前をつけてまとめる `.rda`／`.RData` と、1つのデータだけを保存する `.rds` の2種類があります。Juliaの `RData.jl` パッケージが案内しているのは `.rda`／`.RData` の読みこみで、書き出しや `.rds` の直接の読み書きにはそのまま使えません。",
        "どうしても `.rds` 形式でやり取りしたい場合は、R本体をJuliaから呼び出す `RCall.jl` を使い、R側の `saveRDS`／`readRDS` 関数で保存・読みこみを行います(パソコンにRが入っている必要があります)。くわしい手順は、応用セクション「R・Stanとの連携」の「RCallでJuliaからRを呼ぶ」で扱います。",
        "表データをRとJuliaで行き来させるだけなら、無理にRDSを使わず Arrow や CSV を第一候補にするのがシンプルです。R特有の因子(factor)の設定やラベル、タイムゾーンなどが分析に響く場合は、受け渡し後に両方の言語で中身を突き合わせましょう。",
      ],
    },
    {
      t: "推定済みモデルだけを唯一の研究成果にしない",
      b: [
        "後のSTEPで統計モデルを当てはめたとき、その分析結果オブジェクト(モデル全体)を `JLD2` や `Serialization` で丸ごと保存すると作業の再開には便利です。しかしパッケージの仕様が変わると開けなくなることがあるため、それだけを唯一の記録にはしません。",
        "将来どんな環境からでも確認できるよう、分析用の表データ、モデル式(やStanコード)、条件の基準(参照水準)、推定された係数や誤差・乱数サンプル、予測値、除外したデータの記録、乱数シード、Juliaとパッケージのバージョンを、CSVやテキストのような単純な形式でも残します。「もう一度分析を回せる材料」と「回さなくても結果を確認できる表」の両方をそろえるイメージです。",
        "また、ファイルを書き出しただけで安心せず、別のJuliaセッションから実際に読み戻して、行数・列名・型・カテゴリ水準・欠損数・要約値が変わっていないか確かめましょう。「書き出せた」ではなく「意味を保ったまま読み戻せた」ところまでが往復確認(round trip)です。",
      ],
    },
    {
      t: "【先取り】ベイズ統計(Stanなど)では結果の前後もセットで残す",
      b: [
        "ここは、将来ベイズ統計ソフトの Stan や `Turing.jl` を使う方への先取りメモです。`StanSample.jl` を使うとJuliaからCmdStanを呼び出せますが、別途 CmdStan 本体やC++開発ツールの設定が必要で、パッケージの更新状況にも注意が要ります。そのため、この基本コースでは手元での実行を必須とせず、応用セクション「R・Stanとの連携」の「StanSampleでStanを呼ぶ」でくわしく扱います。",
        "Stanで分析するときは、結果の要約表だけでなく、モデルのコード(`.stan`)、入力データ(JSONなど)、初期値・乱数シード・反復回数の設定、ソフトのバージョン、出力された生の乱数サンプル(`draws CSV`：チェイン別のCSV)、収束診断の指標までを一組で保存します。コンパイル済みの実行ファイルや整形後の表だけでは、どんな設定で得た結果か後からたどれません。",
        "この原則はJulia製のベイズ用パッケージ `Turing.jl` でも同じです。複数の推定ツールを比べるときは、データ・モデルの式・事前分布・乱数設定・診断基準をそろえて比較しましょう。",
      ],
    },
    {
      t: "保存形式を役割で組み合わせる",
      b: [
        "共同研究・長期保管の表は Arrow＋CSV、Juliaで複数の値を再開する保存点は `JLD2`、再生成できる短期キャッシュだけ `Serialization`、R固有のデータが必要な場合だけ `RCall`＋RDS、という役割分担が安全です。",
        "おすすめのフォルダ構成は `raw/`、`derived/`、`code/`、`output/`、`metadata/` です。`raw` は上書きせず、`derived` へ変換後の表を残し、`metadata` へ列の説明表(data dictionary)、同意・匿名化方針、ソフトのバージョン、必要なら SHA-256 などのハッシュ値(checksum)を保存します。なおハッシュ値は「ファイルが1バイトも同じか」を確かめる仕組みであり、内容の正しさや匿名性を保証するものではありません。",
        "1つのバイナリファイルにすべて詰めこむと手軽ですが、壊れたり読めなくなったりしたときに全滅してしまいます。人間が読める説明、言語を問わない表、作業再開用のファイルを重ねておき、どれか1つが読めなくても研究を復元できるようにします。",
        "保存した各ファイルを `Project.toml`／`Manifest.toml`、スキーマ、相対パス、実行記録で1本の再現手順へ結ぶ方法は、補講『再現可能な研究プロジェクト』で実践します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      afterPage: "stack: 横→縦",
      q: "横持ち(1人1行)の表を、統計モデル用の縦持ち(1行1観測)に変換する関数はどれでしょう?",
      opts: ["stack", "unstack", "vcat"],
      ans: 0,
      why: "`stack` が横→縦です。列名だった条件が variable 列の中身になります。逆方向が `unstack` でした。",
      hint: "積み上げて縦に長くする、という英単語です。",
    },
    {
      k: "fill",
      afterPage: "vcat: 表を積み重ねる",
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
      afterPage: "vcat: 表を積み重ねる",
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
      afterPage: "Arrowは表を他言語へ型つきで渡す",
      q: "Juliaで整形した大きな表を、RやPythonを使う共同研究者へ型をできるだけ保って渡したいとき、第一候補になる形式はどれでしょう?",
      opts: ["Arrow", "Serializationの.jls", "推定済みモデルだけをJLD2に保存"],
      ans: 0,
      why: "Arrowは列ごとに型情報を持てる言語共通の表形式です。受け渡し後には型・水準・欠損数の読み戻し確認(round trip)も行いましょう。",
      hint: "Julia専用の形式ではなく、複数の言語で共通して読める表形式を選びます。",
    },
    {
      k: "choice",
      afterPage: "JLD2はJuliaの複数オブジェクトを名前つきでまとめる",
      q: "DataFrame、要約値、モデル式の文字列など、複数のデータをJuliaで名前つきの1ファイルにまとめて保存したいときの候補はどれでしょう?",
      opts: ["JLD2", "PNG", "CSVファイル1枚だけ"],
      ans: 0,
      why: "`JLD2` は表以外の複数のデータも名前つきで1ファイルに保存できます。長期保管では Arrow や CSV、変換コードもあわせて残しましょう。",
      hint: "表だけでなく複数の種類のデータをまとめられる、Julia向けの保存形式です。",
    },
    {
      k: "tf",
      afterPage: "推定済みモデルだけを唯一の研究成果にしない",
      q: "データ保存について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "CSVへ書けばカテゴリの順序や列の単位も必ず自動保存される",
          a: false,
          why: "CSVには型や順序の設計情報(schema)がないため、水準の順序や単位は列の説明表(data dictionary)と読みこみコードに残します。",
        },
        {
          s: "出所不明の `.jls` ファイルでも、`deserialize` は中身を安全に検査してから読みこむ",
          a: false,
          why: "`deserialize` は安全検査を行いません。自分で作った作り直し可能な一時キャッシュだけに使いましょう。",
        },
        {
          s: "推定済みモデルだけでなく、表データ・モデル式・係数や乱数サンプル・診断指標・バージョンも単純な形式で残す",
          a: true,
          why: "将来パッケージの仕様が変わっても、再分析や結果の確認に必要な材料を失わないためです。",
        },
      ],
      hint: "形式ごとに保たれる情報、読みこむときの安全性、長期の再現性を思い返しましょう。",
    },
    {
      k: "choice",
      afterPage: "保存形式を役割で組み合わせる",
      q: "Rの単一データを `.rds` 形式で確実に保存・読みこみしたいとき、適切なやり方はどれでしょう?",
      opts: [
        "RCall経由でRの saveRDS／readRDS を使い、使用したRの環境も記録する",
        "RData.jl 単体の標準関数だけで `.rds` の読み書きと型変換がすべて完結するとみなす",
        "ファイル名の拡張子を `.jld2` から `.rds` に書きかえる",
      ],
      ans: 0,
      why: "RDSはR固有の保存形式です。表データの受け渡しだけなら Arrow や CSV を優先し、どうしても RDS が必要なときは `RCall` からRの関数を呼び出してRのバージョンも記録します。",
      hint: "`RData.jl` が対応している `.rda` 読みこみと、R本体の `saveRDS`／`readRDS` を区別しましょう。",
    },
  ],
};
