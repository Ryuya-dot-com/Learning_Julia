// R・Stan連携1: ファイルと実行記録の受け渡し契約
// 事実確認(2026-09-04): CmdStan User's Guide 2.39(JSON/RDump入力、CSV出力、seed・chain ID) / R base read.csv・write.csv。
export default {
  id: "cross-language-contract",
  title: "R・Stanへ渡すデータの契約",
  tag: "言語をつなぐ前に、列・欠損・版を決める",
  pages: [
    {
      t: "連携の第一歩は、packageを入れることではない",
      b: [
        "Julia、R、Stanを一つの解析で使うとき、最初に決めるのは『どちらからどちらを呼ぶか』ではありません。受け渡すデータの一行が何を表し、各列が何を意味し、どの処理がどの結果を所有するかを決めます。",
        "外部engineは、Juliaだけでは得にくい推定法や、研究室で検証済みの既存手順があるときに使います。同じ処理を二言語で重複させると、どちらが正式な結果か分からなくなります。前処理はJulia、確認的因子分析はR、事後推論はStan、というように責任を分けます。",
        "このトラックは任意です。先に『データの整形・保存・再利用』を終え、Project.tomlとManifest.tomlの役割を理解してから進むと安全です。",
      ],
    },
    {
      t: "まずはCSVで、小さく確かめる",
      b: [
        "数値・文字列・欠損からなる長方形の表なら、CSVは両言語から読みやすく、内容を目で確認できます。Julia固有の型やRのfactorをそのまま保存する形式ではないため、列の意味を別のschemaとして残します。",
        "書き出した直後に、別の読込処理で行数、列名、主key、欠損数、水準を照合します。『fileができた』だけではround tripの確認になりません。",
      ],
      code: `using CSV, DataFrames

trials = DataFrame(
    participant_id = ["P01", "P01", "P02", "P02"],
    condition = ["control", "treatment", "control", "treatment"],
    rt_ms = [510.0, 472.0, 604.0, 551.0],
)

CSV.write("bridge/trials.csv", trials)
restored = CSV.read("bridge/trials.csv", DataFrame;
    types = Dict(:participant_id => String,
                 :condition => String,
                 :rt_ms => Float64),
    strict = true)

@assert names(restored) == names(trials)
@assert nrow(restored) == nrow(trials)`,
      a: [
        "R側でも列名、行数、ID×条件の一意性、欠損数を検査します。型推測が両言語で同じになるとは仮定しません。",
      ],
    },
    {
      t: "schemaは、列名の一覧より詳しく書く",
      b: [
        "最低限必要なのは、列名、型、単位、許容する欠損表現、カテゴリ水準、主key、一行の観測単位です。反応時間が秒かミリ秒か、空文字が欠損か有効値かは、fileだけから確定できません。",
        "RのfactorとJuliaのCategoricalValueでは、内部表現や未使用水準の扱いが異なります。受け渡し時は文字列と水準一覧に分け、読み込み後に各言語でfactor／categoricalへ戻します。",
      ],
      code: `# bridge/schema.toml
schema_version = "1"
row_unit = "one participant-condition trial"
primary_key = ["participant_id", "condition"]

[columns.participant_id]
type = "string"
missing = false

[columns.condition]
type = "string"
levels = ["control", "treatment"]
missing = false

[columns.rt_ms]
type = "float64"
unit = "millisecond"
missing = false`,
    },
    {
      t: "欠損値と日付は、黙って推測させない",
      b: [
        "Juliaのmissing、RのNA、CSVの空欄は同じ表現ではありません。収集時に空文字が有効になり得る列では、空欄を一律に欠損へ変換できません。欠損をNAと書くなら、その文字列を有効値として使わない契約も必要です。",
        "日付時刻にはtimezoneを含めます。ローカル時刻だけを渡すと、夏時間や実行環境のtimezoneで別の瞬間として解釈されます。ISO 8601形式とtimezone列を使い、変換前後の代表値を照合します。",
      ],
    },
    {
      t: "用途に合わせて形式を選ぶ",
      b: [
        "CSVは確認しやすい反面、型・カテゴリ水準・timezoneを単独では十分に保存しません。大きな表や型を保った交換にはArrowが候補になります。どちらの場合も、受け手が使う版でround tripを検証します。",
        "RDSはRの単一object、.RDataは複数objectを保存するR固有形式です。RDSはRCallからsaveRDS／readRDSを使えます。.RDataの読込にはRData.jlという選択肢がありますが、書出しまで同じpackageで完結するとは仮定しません。Julia固有のJLD2やSerializationは、R・Stanとの共通交換形式にはしません。",
      ],
    },
    {
      t: "fileごとに所有者を一つ決める",
      b: [
        "raw dataは上書きせず、Juliaが作る中間表、Rが作る推定結果、Stanが作るchain別drawsを別directoryへ出します。同じresults.csvをJuliaとRの両方が更新する構成は避けます。",
        "受け渡し先は、入力fileを変更しません。訂正が必要なら、新しい入力版を作り、何を直したか記録します。これにより、R側の都合でJuliaの前処理結果が変わるような逆流を防げます。",
      ],
      code: `project/
├── data/raw/                 # 収集した原本・上書きしない
├── bridge/input/             # Juliaが作る受け渡し表
├── bridge/r-output/          # Rが作る結果
├── bridge/stan-output/       # chain別drawsと診断
├── julia/Project.toml
├── julia/Manifest.toml
├── r/renv.lock
└── models/model.stan`,
    },
    {
      t: "実行記録を結果と一緒に残す",
      b: [
        "再現に必要なのはcodeだけではありません。入力fileのhash、schema版、Julia・R・package・CmdStanの版、seed、chain数、warmup、実行時刻、実行コマンドを一組で保存します。",
        "Stanではmodel.stan、入力data、初期値、seed、chain設定、生のdraws CSV、要約、divergence・treedepth・R̂・ESS、engine版を残します。整形済みの係数表だけでは、診断や再要約ができません。",
        "記録から成果物を再利用するときはhashだけでなくpathも検査します。絶対path、`..`によるproject外参照、project外を指すsymbolic linkを拒否し、別のfileを正規成果物として読み込まないようにします。",
        "記録fileの内容も検査対象です。run ID、入力・code・環境・sampling設定が現在の条件と一致するか確かめ、Stanの診断値と事後要約は保存済みdraws CSVから再計算します。成果物のbytesが正しくても、説明するmetadataが違えば再利用しません。",
      ],
    },
    {
      t: "埋め込み連携とfile連携を使い分ける",
      b: [
        "RCallやJuliaCallは、対話的に小さな値を往復し、その場で結果を確認する用途に向きます。一方、長時間のfit、大きなデータ、計算機cluster、共同研究者との受け渡しでは、独立processとfile境界の方が障害を切り分けやすくなります。",
        "最初はCSVと独立scriptで一往復を通し、それから埋め込み連携へ進みます。packageを増やす前に境界を確かめる方が、問題がJulia、R、変換、modelのどこにあるか判断できます。",
        "配布templateには、合成入力、Juliaのdriver、base Rの集計script、Stanの最小modelを収録しています。通常のJulia分析、Rscriptとの往復、Stanの任意実行を別々に試せます。",
      ],
      download: {
        path: "templates/reproducible-study-template.tar",
        label: "R・Stan bridge入り研究projectをdownload (.tar)",
      },
    },
  ],
  ex: [
    {
      k: "choice",
      q: "JuliaからRへ試行表を渡す前に、最初に決めるものはどれでしょう?",
      opts: ["一行の観測単位・列型・主key", "グラフの配色", "Rの作業履歴を保存する設定"],
      ans: 0,
      why: "観測単位、列型、欠損、水準、主keyが受け渡し契約です。packageや作図の前に、何を渡すかを固定します。",
      hint: "受け手がfileを正しく読めるために必要な情報です。",
    },
    {
      k: "choice",
      q: "CSVを書き出した後のround trip確認として十分なのはどれでしょう?",
      opts: ["別の読込処理で列名・行数・key・欠損を照合する", "fileが存在することだけ確認する", "先頭行を目で見る"],
      ans: 0,
      why: "fileの存在だけでは、型の変化、行の欠落、重複、欠損表現のずれを見つけられません。読戻し後の構造と意味を照合します。",
      hint: "『書けた』ではなく『同じ意味で戻った』ことを確かめます。",
    },
    {
      k: "tf",
      q: "言語間の受け渡しについて、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "Rのfactor列は、CSVだけで水準順序まで必ず復元できる",
          a: false,
          why: "CSVはfactorの水準順序を保存しません。文字列と水準一覧を分けて渡し、読込後に復元します。",
        },
        {
          s: "同じ結果fileをJuliaとRの両方が上書きすると、正式な生成元が分かりにくくなる",
          a: true,
          why: "fileごとに一つの生成処理を所有者として決めると、再計算経路を追跡できます。",
        },
        {
          s: "Stanの結果は、最終的な係数表だけ保存すれば診断を再確認できる",
          a: false,
          why: "chain別draws、実行設定、診断情報がなければ、R̂・ESSやdivergenceを再確認できません。",
        },
      ],
      hint: "形式が保存する情報と、解析経路の所有者を分けて考えましょう。",
    },
    {
      k: "fill",
      q: "内容が同じ入力fileか照合するために保存する値を答えましょう。",
      code: "input_sha256 = bytes2hex(〔?〕(read(input_path)))",
      accept: ["sha256", "sha.sha256"],
      show: "sha256",
      why: "SHA-256 hashを残すと、同名fileが後から差し替わっていないか検出できます。hashだけでは内容の妥当性は分からないため、schema検査と併用します。",
      hint: "SHA標準ライブラリにある、256 bitのhash関数です。",
      placeholder: "関数名",
    },
  ],
};
