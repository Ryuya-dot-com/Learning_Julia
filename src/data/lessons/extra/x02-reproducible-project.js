// 補講: 再現可能な研究プロジェクト — 環境・データ・コード・成果物を結ぶ
// Julia 1.12.6 / CSV 0.10.16 / DataFrames 1.8.2 で検証。
// schema・相対path・fingerprint・raw不変性は scripts/reproducible-workflow-check.jl で固定する。
export default {
  id: "reproducible-research-project",
  title: "再現可能な研究プロジェクト",
  tag: "環境・schema・経路・実行記録を一つにつなぐ",
  pages: [
    {
      t: "再現性は、同じ数字が出たことだけではない",
      b: [
        "再現可能な分析とは、第三者が『どの入力を、どの環境とコードで、どの検査を通して、どの成果物へ変えたか』を追跡できる分析です。同じp値を手で再入力した資料は、計算結果が同じでも再現可能なworkflowではありません。",
        "この補講では、データ保存回で分けたraw・derived・code・output・metadataを一本の実行経路へ結びます。新しいpackageは増やさず、Julia標準機能とCSV.jl・DataFrames.jlで小さな研究projectを組み立てます。",
        "目標は『自分のPCでもう一度動いた』より厳しく、別の作業directory、新しいJulia process、既知のenvironmentから再実行しても、入力と成果物の対応を監査できる状態です。",
      ],
    },
    {
      t: "一つの研究に、一つのenvironmentを置く",
      b: [
        "`Project.toml`は直接依存packageとcompatなど、projectの意図を記述します。`Manifest.toml`は直接・間接依存を含む解決済みの状態です。研究分析はapplicationとして両方をversion管理し、ManifestはPkgに生成・更新させて手編集しません。",
        "共同研究者はproject rootでenvironmentをinstantiateしてから分析を実行します。`activate`だけでは未導入packageを取得しないため、初回準備と通常実行を区別します。package更新は分析途中に無意識に行わず、別branchで数値検証後に反映します。",
      ],
      code: `# 初回準備: Julia REPLのpackage mode
(@v1.12) pkg> activate .
(MyStudy) pkg> instantiate

# 通常実行: project rootから新しいprocessで
julia --project=. code/run_analysis.jl`,
      a: [
        "`--project=.`の`.`はcommandを起動したdirectoryです。公開手順には『project rootへ移動して実行』まで書きます。自動実行では、より堅牢な`--project=@.`で親directoryのProject.tomlを探索する方法もあります。",
      ],
    },
    {
      t: "役割でdirectoryを分け、入口を一つにする",
      b: [
        "同じCSVでも、原記録と分析用中間表では変更可能性が違います。役割をdirectory名へ出し、`code/run_analysis.jl`を全工程の入口にします。Notebookだけで試行錯誤した場合も、最終的な変換と推定は上から実行できるscriptまたは再実行可能なNotebookへ戻します。",
      ],
      code: `MyStudy/
├─ Project.toml
├─ Manifest.toml
├─ code/
│  └─ run_analysis.jl
├─ data/
│  ├─ raw/          # 上書きしない原記録
│  └─ derived/      # codeから再生成できる表
├─ metadata/
│  ├─ data_dictionary.csv
│  ├─ schema.toml
│  └─ runs/         # 実行ごとのprovenance
└─ output/
   ├─ tables/
   └─ figures/`,
      a: [
        "大容量・機微データをGitへ入れるという意味ではありません。version管理する対象と、安全な保管場所・access権・取得手順を分けます。rawを置けない場合は、取得元、version、checksum、access条件をmetadataへ残します。",
      ],
    },
    {
      t: "pwdではなく、scriptの場所からpathを作る",
      b: [
        "`CSV.read(\"data/example/trials_synthetic.csv\", ...)`は、Juliaを起動した作業directoryが変わると別の場所を探します。`@__DIR__`はscript fileのdirectoryを基準にできるので、入口scriptが`code/`にあるなら一つ上をproject rootとして固定できます。",
      ],
      code: `const PROJECT_ROOT = normpath(joinpath(@__DIR__, ".."))

raw_path = joinpath(PROJECT_ROOT, "data", "raw", "trials.csv")
schema_path = joinpath(PROJECT_ROOT, "metadata", "schema.toml")

println((root_is_absolute = isabspath(PROJECT_ROOT),
         input_file = basename(raw_path)))`,
      out: `(root_is_absolute = true, input_file = "trials.csv")`,
      a: [
        "`@__DIR__`をREPLや`julia -e`で評価すると現在の作業directoryになるため、この方法は保存したscript内で使います。個人の`C:\\Users\\...`や`/Users/...`をcode・表・metadataへ書き込まないことも、移動可能性とprivacyの両面で重要です。",
      ],
    },
    {
      t: "data dictionaryとschemaは別の問いに答える",
      b: [
        "data dictionaryは、人が変数の意味を解釈するための文書です。列名、定義、単位、符号化、水準、欠測規則、測定時点、導出方法、識別可能性を記録します。`rt_ms`がFloat64だと分かっても、それだけでは刺激提示から反応までの時間か、音声開始までの時間かは分かりません。",
        "schemaは、機械が入力の構造を拒否または受理するための契約です。必須列と順序、型、許可水準、範囲、primary key、欠測表現を持たせます。dictionaryだけでは誤入力を止められず、schemaだけでは科学的意味を説明できません。両方をcodeと一緒にversion管理します。",
      ],
      code: `# metadata/data_dictionary.csv の例
variable,meaning,unit,role
participant_id,匿名参加者ID,none,key
trial,参加者内試行番号,count,key
condition,実験条件,category,predictor
rt_ms,反応時間,ms,outcome
correct,正答,boolean,quality`,
    },
    {
      t: "schemaを機械可読な契約として保存する",
      b: [
        "schemaをTOMLのような機械可読形式で保存し、CSV.readの`types`と`missingstring`へ接続します。読み込み後に型を眺めるだけでは、先頭行の偶然や新しい欠測表現によって推測結果が変わる危険を残します。",
      ],
      code: `# metadata/schema.toml の要点
[trials]
columns = ["participant_id", "trial", "condition", "rt_ms", "correct"]
allowed_condition = ["control", "treatment"]
missing_strings = ["", "NA"]
primary_key = ["participant_id", "trial"]
rt_ms_min = 100.0
rt_ms_max = 3000.0

[trials.types]
participant_id = "String"
trial = "Int"
condition = "String"
rt_ms = "Float64"
correct = "Bool"`,
      a: [
        "schema変更は単なる文書修正ではありません。列名や範囲を変えた理由、適用開始data version、既存結果を再計算するかをreview対象にします。",
      ],
    },
    {
      t: "schemaの型指定をCSV.readへ実際に渡す",
      b: [
        "TOMLに型名を書くだけでは検査になりません。許可した型名だけをJuliaの型へ対応づけ、`CSV.read`の`types`と`missingstring`へ渡します。知らない型名なら対応表の検索時点で停止するため、黙って型推測へ戻りません。",
      ],
      code: `using CSV, DataFrames, TOML

type_map = Dict(
    "String" => String, "Int" => Int,
    "Float64" => Float64, "Bool" => Bool,
)
spec = TOML.parsefile(schema_path)["trials"]
csv_types = Dict(Symbol(name) => type_map[type_name]
                 for (name, type_name) in spec["types"])

data = CSV.read(raw_path, DataFrame;
    types = csv_types,
    missingstring = spec["missing_strings"])

println((participant_id = string(eltype(data.participant_id)),
         trial = string(eltype(data.trial)),
         rt_ms = string(eltype(data.rt_ms)),
         correct = string(eltype(data.correct))))`,
      out: `(participant_id = "String", trial = "Int64", rt_ms = "Union{Missing, Float64}", correct = "Bool")`,
      a: [
        "明示したFloat64列に欠測があれば、読み込み後の要素型は`Union{Missing, Float64}`になります。欠測を許可する列と許可しない列もschemaと検査関数で区別します。",
      ],
    },
    {
      t: "期待違反を黙って修復せず、入口で止める",
      b: [
        "入力検査は『たぶんcontrolの綴り間違いだから直す』と推測する場所ではありません。未知の水準、範囲外、key重複を一度集め、具体的な`ArgumentError`として止めます。修正するならrawを上書きせず、根拠のある変換codeからderived dataを作ります。",
      ],
      code: `function validate_trials(data)
    problems = String[]
    allowed = Set(["control", "treatment"])

    all(x -> !ismissing(x) && x in allowed, data.condition) ||
        push!(problems, "conditionに未知の値または欠測があります")
    all(x -> ismissing(x) || 100 <= x <= 3000, data.rt_ms) ||
        push!(problems, "rt_msが許容範囲外です")
    allunique(collect(zip(data.participant_id, data.trial))) ||
        push!(problems, "participant_idとtrialの組が重複しています")

    isempty(problems) || throw(ArgumentError(join(problems, "\\n")))
    true
end

println((rows = 6, valid = validate_trials(data)))`,
      out: `(rows = 6, valid = true)`,
      a: [
        "実務では、この前に必須列と列順、schema指定後の型も検査します。検査に合格したことは、参加者除外や測定定義が妥当だという証明ではありません。構造検査と科学的判断を混同しません。",
      ],
    },
    {
      t: "失敗例も、再現可能な出力である",
      b: [
        "schema違反を警告だけで流すと、後続の集計がもっともらしい数字を作ることがあります。入口で停止し、どのruleが破られたかを残すほうが安全です。次の例は未知水準を意図的に作り、検査が止められること自体を確認しています。",
      ],
      code: `bad = copy(data)
bad.condition[1] = "unknown"

try
    validate_trials(bad)
catch error
    println(sprint(showerror, error))
end`,
      out: `ArgumentError: conditionに未知の値または欠測があります`,
      a: [
        "自動修正を行う場合は、元の値、変更後の値、rule、対象行keyを除外・修正logへ残します。ただし機微情報をそのままlogへ複製しないよう、IDや自由記述の扱いを先に設計します。",
      ],
    },
    {
      t: "run IDを内容から作り、同名異内容を拒否する",
      b: [
        "`final.csv`、`final2.csv`、`final_revised.csv`では、どの入力と環境からできたか分かりません。raw、schema、dictionary、Project、Manifest、分析codeのSHA-256を組み合わせ、短いfingerprintをrun IDにします。同じ材料なら同じID、どれかが変われば別IDになります。",
        "同じrun IDの成果物がすでにありbytesも同じなら再利用できます。内容が違うなら上書きせず停止します。これにより、同じ名前が二つの意味を持つ事故を隠しません。次は検証用projectで実行した完全なpath集合です。",
      ],
      code: `using SHA

file_sha256(path) = open(path, "r") do io
    bytes2hex(sha256(io))
end

components = [
    raw_path,
    schema_path,
    joinpath(PROJECT_ROOT, "metadata", "data_dictionary.csv"),
    joinpath(PROJECT_ROOT, "Project.toml"),
    joinpath(PROJECT_ROOT, "Manifest.toml"),
    joinpath(PROJECT_ROOT, "code", "run_analysis.jl"),
]
component_hashes = file_sha256.(components)
run_id = bytes2hex(sha256(codeunits(join(component_hashes, "\\n"))))[1:12]

output_file = "condition_summary--$(run_id).csv"
println((run_id, output_file))`,
      out: `(run_id = "d27e87e8c878", output_file = "condition_summary--d27e87e8c878.csv")`,
      a: [
        "12文字への短縮は教材用です。大規模な成果物registryでは衝突方針を別途決めます。またchecksumは同じbytesかを示すだけで、内容の正しさ、匿名化、悪意ある改変への署名を保証しません。",
      ],
    },
    {
      t: "実行metadataには相対pathと入出力checksumを残す",
      b: [
        "成果物と同じrun IDを持つTOMLへ、実行時刻、Julia version、入力と出力の相対path・checksum、ProjectとManifestのchecksumを残します。seed、command-line引数、thread数、外部engine、Git commit、除外数など、結果を変え得る設定も分析に応じて追加します。",
        "実行時刻は監査情報なので、同じ分析を再実行してもmetadata fileのbytesは変わり得ます。『成果データが同じ』と『実行記録までbyte単位で同じ』を別の判定にします。絶対path、利用者名、access token、参加者情報は記録しません。",
      ],
      code: `[run]
id = "d27e87e8c878"
started_utc = "2026-08-02T00:00:00Z"
julia_version = "1.12.6"

[inputs]
trials_path = "data/example/trials_synthetic.csv"
trials_sha256 = "..."
schema_path = "metadata/schema.toml"

[outputs]
summary_path = "output/tables/condition_summary--d27e87e8c878.csv"
summary_sha256 = "..."`,
    },
    {
      t: "clean runで、移動可能性と結論の同等性を検査する",
      b: [
        "再現テストは、長く使ったREPLの変数を残したままセルを押し直すことではありません。新しいprocessでenvironmentをinstantiateし、入口scriptを先頭から実行します。可能なら別directoryやCIでも実行し、隠れたpwd依存、手作業、未記録fileを見つけます。",
        "確認するのは終了codeだけではありません。raw checksumが変わっていない、schema検査が通る、行数・列・key・欠測数が期待範囲、成果物とmetadataが対応する、主要推定値が事前に決めた許容誤差内、警告と除外数が説明可能、という契約をtestにします。欠測を含む表の構造比較には、`missing == missing`が`missing`になるため`isequal`を使います。",
      ],
      code: `# project root以外を作業directoryにしても入口scriptが動くか確認
cd(mktempdir()) do
    include(joinpath(PROJECT_ROOT, "code", "run_analysis.jl"))
end

@test raw_sha_before == raw_sha_after
@test isequal(readback_table, expected_table)
@test isapprox(recomputed_mean, 510.0; atol = 1e-10)`,
      a: [
        "実際のCIでは、すでに読み込まれたMainへ`include`するより、新しいJulia processを起動するほうが強い検査です。このcodeは検査観点の短い見本です。",
      ],
    },
    {
      t: "環境固定は必要だが、研究の正しさを保証しない",
      b: [
        "Manifestがあっても、OS・CPU・BLAS・thread数・外部command・network resource・environment variableまで完全には固定しません。乱数を使うならRNGとseed、並列処理なら非決定性と許容誤差、RやStanを呼ぶならそのversionと設定も実行記録へ加えます。必要に応じてcontainerを使いますが、container imageだけを残してcodeとdata dictionaryを失ってはいけません。",
        "schema合格、同じchecksum、同じ推定値でも、設計の偏り、誤った除外規則、測定妥当性、privacy侵害は検出できません。再現性は妥当性の代用品ではなく、誤りを発見・訂正・議論できる基盤です。",
        "最小構成は、Project＋Manifest、rawの取得記録、data dictionary＋schema、唯一の入口script、相対path、入出力checksum、run metadata、clean run testです。これらが一つの生成経路としてつながっているかを最後に点検します。",
      ],
    },
    {
      t: "実行可能templateを展開し、clean runする",
      b: [
        "ここまでの構成を、教材用の公開合成data、最初からignoreされるprivate raw directory、固定済みManifest、schema、dictionary、入口scriptを含む小型projectとして配布します。archiveを展開すると`reproducible-study/`ができるので、そのrootで初回準備と分析を実行します。",
        "入口scriptは`study.toml`で選んだ入力を上書きせず、検査済みdata、条件別summary、run metadataを内容由来IDつきで生成します。もう一度実行すると同じderived dataとsummaryを再利用し、別の実行時刻を持つmetadataを追加します。",
      ],
      code: `tar -xf reproducible-study-template.tar
cd reproducible-study

julia --project=. -e "using Pkg; Pkg.instantiate()"
julia --project=. code/run_analysis.jl`,
      lang: "ターミナル",
      download: {
        path: "templates/reproducible-study-template.tar",
        label: "研究project templateをdownload (.tar)",
      },
      a: [
        "展開機能つきfile managerを使っても構いません。公開合成例を実データで上書きせず、READMEに従って`data/raw/`へ別fileとして置きます。schema、dictionary、study.toml、primary key、欠測・除外規則、privacy方針も研究固有の定義へ変更してください。",
        "配布archiveも最終成果物ではなくsource templateから再生成できる派生物です。CIはarchiveを一時directoryへ展開し、sourceとのchecksum一致、新しいJulia processでの2回実行、未知水準での停止を検査します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "研究projectのProject.tomlとManifest.tomlの説明として最も適切なのはどれですか？",
      opts: [
        "Projectは直接依存とcompatなどを表し、Manifestは解決済みの直接・間接依存を記録する",
        "Projectはraw dataを、Manifestは分析結果を保存する",
        "Manifestだけを手編集し、Projectは毎回削除する",
      ],
      ans: 0,
      why: "両方をversion管理し、ManifestはPkgに生成・更新させます。environment固定とdata保存は別の層です。",
      hint: "projectの意図と、解決された依存graphを分けます。",
    },
    {
      k: "fill",
      q: "code/run_analysis.jlの場所を基準にproject rootを作ります。空欄へ入るmacroを入力してください。",
      code: `const PROJECT_ROOT = normpath(joinpath(〔?〕, ".."))`,
      accept: ["@__dir__", "@__dir__()"],
      show: "@__DIR__",
      why: "保存されたscript内の`@__DIR__`は、そのfileが置かれたdirectoryを基準にします。",
      hint: "現在の作業directoryを返すpwdではなく、source fileの場所を使います。",
      placeholder: "macro",
    },
    {
      k: "choice",
      q: "rt_ms列が何を測り、単位がmsであることと、100〜3000の範囲だけを許すことを残したい場合、最もよい構成はどれですか？",
      opts: [
        "意味と単位をdata dictionaryへ、機械検査する型と範囲をschemaへ置く",
        "どちらもCSVの型推測だけに任せる",
        "Manifest.tomlへ参加者ごとのrt_msを書く",
      ],
      ans: 0,
      why: "dictionaryは人の解釈、schemaは機械的な受理・拒否を担当し、互いを補完します。",
      hint: "科学的意味と構造的制約は、同じ問いではありません。",
    },
    {
      k: "tf",
      q: "再現可能性について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "checksumが一致すれば、分析設計と匿名化も正しいと証明できる",
          a: false,
          why: "checksumが確認するのはbytesの一致です。科学的妥当性やprivacyは別に監査します。",
        },
        {
          s: "schema検査に合格しても、変数の測定妥当性が保証されたとは限らない",
          a: true,
          why: "型・範囲・keyが正しくても、測りたい構成概念を測れているとは限りません。",
        },
        {
          s: "個人PCの絶対pathをcodeへ埋め込むと、別環境への移動可能性を損なう",
          a: true,
          why: "scriptの場所を基準にjoinpathで組み立て、metadataには相対pathを残します。",
        },
      ],
      hint: "bytes、構造、意味、実行履歴の四つを分けて考えます。",
    },
    {
      k: "choice",
      q: "同じrun IDのCSVがすでに存在しますが、再計算した内容は異なっていました。最も安全な処理はどれですか？",
      opts: [
        "上書きせず停止し、fingerprintの材料と非決定性を調査する",
        "古いCSVを黙って上書きする",
        "final_revised2.csvへ名前だけ変えて保存する",
      ],
      ans: 0,
      why: "同じIDが異なる内容を指す状態はprovenanceの破綻です。原因を解決してから別IDまたは同一bytesとして保存します。",
      hint: "run IDは入力・schema・環境・codeの同一性を表す契約です。",
    },
    {
      k: "choice",
      q: "共同研究者が分析を再実行する手順として最も監査しやすいのはどれですか？",
      opts: [
        "projectを取得→environmentをinstantiate→新processで入口script→schema・checksum・主要結果を検査",
        "著者のREPL historyを推測→見た目が似るまでセルを任意順に実行",
        "保存済みp値だけを新しい文書へ転記",
      ],
      ans: 0,
      why: "環境、実行順、入力、成果物を一つの検査可能な経路として再現します。",
      hint: "準備、入口、入力契約、結果契約の順に確認します。",
    },
  ],
};
