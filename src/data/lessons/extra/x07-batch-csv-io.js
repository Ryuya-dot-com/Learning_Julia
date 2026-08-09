// 補講: 複数CSVと分析成果物の入出力 — 入力契約からround tripまで
// Julia 1.12.6 / CSV 0.10.16 / DataFrames 1.8.2で掲載コードを検証。
// CSV.jl・DataFrames.jl・Julia Filesystemの公式stable docsを確認(2026-08-09)。
export default {
  id: "batch-csv-io",
  title: "複数CSVと分析成果物の入出力",
  tag: "列挙・schema・入力元・結果表を一つの検証経路にする",
  pages: [
    {
      t: "一括読込は、ファイルを多く開くことではない",
      b: [
        "参加者別、日別、装置別にCSVが分かれているとき、内包表記と`vcat`だけでも一つの表は作れます。しかし、余計なCSVを拾う、順序が変わる、列が欠ける、型違反がmissingへ置き換わる、同じ試行を二重に読む、といった事故は完成した表だけでは見つけにくくなります。",
        "この補講では、①対象ファイルの確定、②schemaつき読込、③入力元を残した連結、④行・key・値の検査、⑤成果物の書出し、⑥別processでの読戻しを一つの経路にします。途中で違反があれば、もっともらしい集計へ進む前に停止します。",
        "例では`data/raw/`に`trials_01.csv`と`trials_02.csv`があり、各行はparticipant_id、trial、condition、rt_ms、correctを持つとします。rawは上書きせず、結果は`output/`へ分けます。",
      ],
    },
    {
      t: "readdirで対象を列挙し、順序と0件を検査する",
      b: [
        "`readdir(input_dir; join=true, sort=true)`は、directory内の名前をpathへ結合し、名前順で返します。さらに`isfile`と拡張子で絞り、directoryやREADMEを除外します。OSが返した偶然の順序に依存しません。",
        "0件を空のDataFrameとして通すと、後続処理が『観測0件の正しい結果』に見えることがあります。入力directoryがない場合とCSVが0件の場合を、別のエラーとして入口で止めます。",
      ],
      code: `function discover_csvs(input_dir)
    isdir(input_dir) ||
        throw(ArgumentError("input directoryがありません: $input_dir"))

    files = filter(
        path -> isfile(path) && endswith(lowercase(path), ".csv"),
        readdir(input_dir; join = true, sort = true),
    )
    isempty(files) &&
        throw(ArgumentError("CSV fileがありません: $input_dir"))
    files
end

files = discover_csvs("data/raw")
println(basename.(files))`,
      out: `["trials_01.csv", "trials_02.csv"]`,
    },
    {
      t: "CSV.Fileは複数入力とsource列を直接扱える",
      b: [
        "CSV.jlは、入力pathのVectorを`CSV.File`へ渡して縦方向に読み込めます。`source=:source_file`を指定すると、各行がどの入力から来たかを示す列が加わります。読み込み後に参加者IDだけから元ファイルを推測しません。",
        "これは各ファイルのschemaが同じと確認済みの場合の短い経路です。研究用pipelineでは、次のページのように1ファイルずつ検査してから連結すると、違反したファイル名を明確に報告できます。",
      ],
      code: `using CSV, DataFrames

trial_types = Dict(
    :participant_id => String,
    :trial => Int,
    :condition => String,
    :rt_ms => Float64,
    :correct => Bool,
)

data = DataFrame(CSV.File(
    files;
    source = :source_file,
    types = trial_types,
    missingstring = ["", "NA"],
    strict = true,
))

println((rows = nrow(data),
         files = basename.(unique(data.source_file))))`,
      out: `(rows = 4, files = ["trials_01.csv", "trials_02.csv"])`,
      a: [
        "`source_file`は監査用のprovenanceです。分析上の参加者・条件・時点の代わりにはせず、どの入力を再確認すべきか特定するために残します。",
      ],
    },
    {
      t: "型推測を入口の契約に置き換える",
      b: [
        "`types`を指定しなければ、CSV.jlは各列の型を推測します。小さな先頭fileでは整数に見えた列が、後のfileで小数や文字列を含むこともあります。列名と型をdata dictionaryから決め、`missingstring`も収集規則と一致させます。",
        "`strict=true`なら、指定型へ変換できない値を警告とmissingで流さずエラーにします。`validate=true`は、`types`などで指定した列名が入力に存在するか検査します。ただし、余計な列や未指定の必須列まで研究固有のschemaとして判断するのは自分の検査関数です。",
      ],
      code: `const REQUIRED_COLUMNS = [
    :participant_id, :trial, :condition, :rt_ms, :correct,
]

part = CSV.read(
    files[1], DataFrame;
    types = trial_types,
    missingstring = ["", "NA"],
    strict = true,
    validate = true,
)

println(propertynames(part) == REQUIRED_COLUMNS)`,
      out: `true`,
    },
    {
      t: "ファイル単位で列集合を検査してから連結する",
      b: [
        "必須列が欠けたfileと、予定外の列が増えたfileを区別して報告します。列順だけが違う場合は同じ列集合として受け入れ、`select!`でcanonicalな順序へそろえます。列を黙って捨てたり、`missing`で補ったりしません。",
        "列追加が正当なschema改訂なら、古いfileとの互換規則、適用開始version、再計算範囲を決めてから契約を更新します。`:union`でとりあえず通すことはschema設計の代わりになりません。",
      ],
      code: `function read_trial_part(path)
    part = CSV.read(path, DataFrame;
        types = trial_types,
        missingstring = ["", "NA"],
        strict = true,
        validate = true)

    actual = propertynames(part)
    absent = setdiff(REQUIRED_COLUMNS, actual)
    unexpected = setdiff(actual, REQUIRED_COLUMNS)
    if !isempty(absent) || !isempty(unexpected)
        throw(ArgumentError(
            "$(basename(path)): schema不一致 " *
            "absent=$(absent) unexpected=$(unexpected)"))
    end

    select!(part, REQUIRED_COLUMNS)
    part
end`,
    },
    {
      t: "vcatの列契約とsourceを明示する",
      b: [
        "検査済みの表を`vcat`で積みます。`cols=:setequal`は、列順を無視して全表が同じ列名を持つことを要求します。`:union`は一部の表にない列をmissingで埋めるため、schema差を意図した場合だけ使います。",
        "DataFrames.jlの`source`には、追加する列名と各表の識別子をPairで渡せます。ここでは各入力のbasenameを使い、連結後もfile別の行数や欠測数を集計できるようにします。",
      ],
      code: `parts = read_trial_part.(files)
data = vcat(
    parts...;
    cols = :setequal,
    source = (:source_file => basename.(files)),
)

println((rows = nrow(data), sources = unique(data.source_file)))`,
      out: `(rows = 4, sources = ["trials_01.csv", "trials_02.csv"])`,
    },
    {
      t: "連結後に主キーと意味上の範囲を検査する",
      b: [
        "各file内で一意でも、fileをまたいで同じparticipant_id×trialが重複することがあります。`nonunique(data, key_cols)`で連結後の重複を検査します。ファイル名が違うことは、観測が別物である証拠ではありません。",
        "型が正しくても、未知条件、範囲外の反応時間、correctの欠測は残り得ます。問題を一つ見つけるたびに停止するのではなく、検出した規則違反をまとめて報告すると修正往復を減らせます。ただしrawを自動修正しません。",
      ],
      code: `function validate_trials(data)
    problems = String[]

    any(nonunique(data, [:participant_id, :trial])) &&
        push!(problems, "participant_idとtrialの組が重複しています")

    allowed = Set(["control", "treatment"])
    all(x -> !ismissing(x) && x in allowed, data.condition) ||
        push!(problems, "conditionに未知の値または欠測があります")
    all(x -> ismissing(x) || 100 <= x <= 3000, data.rt_ms) ||
        push!(problems, "rt_msが許容範囲外です")
    all(!ismissing, data.correct) ||
        push!(problems, "correctに欠測があります")

    isempty(problems) ||
        throw(ArgumentError(join(problems, "\\n")))
    true
end

println(validate_trials(data))`,
      out: `true`,
    },
    {
      t: "入力file別の監査表を最初の成果物にする",
      b: [
        "一括読込に成功したことだけでなく、file数、file別行数、欠測数を表にします。期待が参加者ごとに2試行なら、2行以外のfileを見つけられます。0行fileや一部だけ読み飛ばされたfileも、全体の平均だけでは見えません。",
        "実務では、最小・最大trial、ID数、未知水準数、除外候補数も追加します。監査表自体を結果と同じrun IDで保存すると、どの入力集合を解析したか確認できます。",
      ],
      code: `file_audit = combine(
    groupby(data, :source_file),
    nrow => :rows,
    :rt_ms => (x -> count(ismissing, x)) => :missing_rt,
)

for row in eachrow(file_audit)
    println((source_file = String(row.source_file),
             rows = row.rows, missing_rt = row.missing_rt))
end`,
      out: `(source_file = "trials_01.csv", rows = 2, missing_rt = 0)
(source_file = "trials_02.csv", rows = 2, missing_rt = 1)`,
    },
    {
      t: "joinでは右表の一意性と未対応行を検査する",
      b: [
        "試行表にはparticipant_idが繰り返されますが、参加者属性表では1人1行を期待します。`validate=(false, true)`は左の重複を許し、右のkeyだけ一意か検査します。右表に重複があると、join後の行数が増える事故を入口で止められます。",
        "`source=:participant_match`を加えると、参加者属性が見つからなかった行を`left_only`として発見できます。行順が必要なら`order=:left`を明示します。join後は行数と対応状況の両方を検査します。",
      ],
      code: `participants = DataFrame(
    participant_id = ["P01", "P02"],
    group = ["A", "B"],
)

joined = leftjoin(
    data, participants;
    on = :participant_id,
    validate = (false, true),
    order = :left,
    source = :participant_match,
)

println((rows = nrow(joined),
         unchanged = nrow(joined) == nrow(data),
         all_matched = all(==("both"), joined.participant_match)))`,
      out: `(rows = 4, unchanged = true, all_matched = true)`,
    },
    {
      t: "結果は一枚のfinal.csvではなく、役割別の表にする",
      b: [
        "分析用data、入力監査、記述要約、model係数、区間、予測、診断、除外記録は更新単位と列の意味が違います。一枚の巨大なCSVへ押し込まず、単純な表へ分けます。図はSVG／PNG、実行条件はTOMLなどへ保存し、同じrun IDで結びます。",
        "model objectだけを保存すると、package versionが変わったとき読めないことがあります。係数名、推定値、SE、区間、予測値、診断量を言語中立の表でも残します。型つきの大きな表はArrow、確認・交換用にはCSVという役割分担を使えます。",
      ],
      code: `observed = dropmissing(data, :rt_ms)
condition_summary = combine(
    groupby(observed, :condition),
    nrow => :n,
    :rt_ms => mean => :mean_rt_ms,
)
sort!(condition_summary, :condition)

for row in eachrow(condition_summary)
    println((condition = String(row.condition),
             n = row.n, mean_rt_ms = row.mean_rt_ms))
end`,
      out: `(condition = "control", n = 2, mean_rt_ms = 510.0)
(condition = "treatment", n = 1, mean_rt_ms = 620.0)`,
      a: [
        "欠測行を除いた理由と件数は、condition_summaryだけからは復元できません。input_file_auditと除外記録を同じ成果物集合に含めます。",
      ],
    },
    {
      t: "出力directoryを作り、既存成果物を黙って上書きしない",
      b: [
        "`CSV.write`はTables.jl互換の表を書き出します。出力directoryは`mkpath`で作り、`joinpath`でpathを組み立てます。`missingstring`と`dateformat`は、読み戻す側のschemaと対になる設定です。",
        "対話作業で`final2.csv`を増やす代わりに、再現可能な研究プロジェクト補講のrun IDを使います。同じpathが存在したら、この小さな関数は上書きせず停止します。同一bytesなら再利用する高度な運用でも、同名異内容を黙って置換しない原則は同じです。",
      ],
      code: `function write_new_csv(path, table; kwargs...)
    mkpath(dirname(path))
    ispath(path) &&
        throw(ArgumentError("既存の出力を上書きしません: $path"))
    CSV.write(path, table; kwargs...)
end

output_dir = "output/tables"
summary_path = joinpath(output_dir, "condition_summary.csv")
written = write_new_csv(
    summary_path, condition_summary;
    missingstring = "NA",
)
println(written)`,
      out: `output/tables/condition_summary.csv`,
    },
    {
      t: "書けたかではなく、別の読込でround tripを検査する",
      b: [
        "fileが存在するだけでは成功ではありません。結果用schemaを明示して読み戻し、行数、列名、型、欠測、重要な値が元の表と一致するか確認します。表示用に丸めた値を再計算へ使わないよう、保存値と報告表示も分けます。",
        "SHA-256は同じbytesかを確認する識別子です。内容の科学的妥当性や匿名性は保証しません。checksum、相対path、入力一覧、Julia・package version、seed、除外数をrun metadataへ記録します。",
      ],
      code: `using SHA

restored = CSV.read(
    summary_path, DataFrame;
    types = Dict(
        :condition => String,
        :n => Int,
        :mean_rt_ms => Float64,
    ),
    missingstring = "NA",
    strict = true,
)

checksum = bytes2hex(open(sha256, summary_path))
println((same = isequal(restored, condition_summary),
         rows = nrow(restored), hash_chars = length(checksum)))`,
      out: `(same = true, rows = 2, hash_chars = 64)`,
    },
    {
      t: "append・圧縮・partitionは目的を限定して使う",
      b: [
        "CSV.jlの`append=true`は既存fileの末尾へ追加し、通常はheaderを書きません。列順やschemaを確認せず分析結果を追記すると、二重実行や異なるrunが一つのfileへ混ざります。appendは追記型logなど、重複防止と回復手順を設計した用途に限定します。",
        "`compress=true`はgzip圧縮、`partition=true`はTables.partitionsに対応する入力を複数fileへ書く機能です。大規模入力では`CSV.Rows`が低memoryの行iterator、`CSV.Chunks`がchunk処理の候補になりますが、型推論やchunkをまたぐ検査、部分失敗からの再開を別に設計する必要があります。",
        "まずは全体をmemoryへ載せられるsizeで、入力契約・成果物集合・round tripを正しく作ります。大規模化は同じ契約を保ったまま処理単位を変える発展であり、検査を省く理由ではありません。",
      ],
    },
    {
      t: "一括入出力の完了条件をpipelineの順に固定する",
      b: [
        "①directoryと対象pattern、②file数と順序、③列名・型・欠測表現、④source_file、⑤全体とfile別の行数、⑥主キー・水準・範囲、⑦joinのcardinality、⑧役割別の結果表、⑨上書き規則、⑩round tripとrun metadataを順に確認します。",
        "成功例だけでなく、CSV 0件、必須列欠落、数値列の文字列、file間のkey重複、右表のkey重複、既存出力への再書込をtestします。止まるべき入力で止まれることが、再現可能なpipelineの機能です。",
        "ここまでできれば、30個のCSVを一つにできたことより、どの30個をどの契約で読み、どの成果物へ変えたかを第三者が追跡できます。次は分布の推定と予測診断で、この整ったdataをmodelへ渡します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "data/rawから複数CSVを列挙するとき、最も再現しやすい手順はどれですか？",
      opts: [
        "join=true・sort=trueでpathを取得し、isfileと拡張子で絞って0件を停止する",
        "OSが返した順の全entryをCSVとして読む",
        "見つからなければ空のDataFrameを解析へ渡す",
      ],
      ans: 0,
      why: "対象、path、順序、0件時の挙動を明示すると、余計なfileや空入力を早く検出できます。",
      hint: "対象集合が同じになる条件を考えます。",
    },
    {
      k: "fill",
      q: "directory内の名前をpathへ結合し、並べ替えて取得する関数名を入力してください。",
      code: `files = 〔?〕(input_dir; join = true, sort = true)`,
      accept: ["readdir"],
      show: "readdir",
      why: "`readdir`のjoinとsortで、後続処理へ渡す安定したpath一覧を作れます。",
      hint: "directoryを読むJulia Baseの関数です。",
      placeholder: "関数名",
    },
    {
      k: "fill",
      q: "複数入力の各行へ入力元を示す列を加えるCSV.Fileのkeywordを入力してください。",
      code: `table = CSV.File(files; 〔?〕 = :source_file)`,
      accept: ["source"],
      show: "source",
      why: "`source`はvector inputで入力元を示す列を追加します。",
      hint: "出所を表す英単語です。",
      placeholder: "keyword",
    },
    {
      k: "choice",
      q: "rt_msにnot-a-numberが入っていた場合の入口として適切なのはどれですか？",
      opts: [
        "typesでFloat64を指定し、strict=trueでfile名とともに停止する",
        "警告を消してmissingへ置換し、そのまま平均を出す",
        "すべてStringとして読み、数値かどうかは確認しない",
      ],
      ans: 0,
      why: "型違反を欠測と同一視せず、原因となった入力を修正・再生成できる状態で停止します。",
      hint: "変換不能値を黙って後段へ流さない選択です。",
    },
    {
      k: "fill",
      q: "全DataFrameが同じ列集合を持つことを要求するvcatのcols指定を入力してください。",
      code: `data = vcat(parts...; cols = 〔?〕)`,
      accept: [":setequal", "setequal"],
      show: ":setequal",
      why: "`:setequal`は列順を問わず同じ列名集合を要求します。`:union`は欠けた列をmissingで補います。",
      hint: "集合が等しいことを表すSymbolです。",
      placeholder: ":...",
    },
    {
      k: "tf",
      q: "一括入出力について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "参加者属性表が1人1行なら、leftjoinの右側だけ一意性をvalidateできる",
          a: true,
          why: "`validate=(false, true)`で、試行表の反復を許しつつ属性表の重複keyを停止できます。",
        },
        {
          s: "CSV.writeが終了してfileが存在すれば、列型や行数の読戻し検査は不要である",
          a: false,
          why: "別の読込でschema・行数・重要値を照合して初めてround tripを確認できます。",
        },
        {
          s: "append=trueは通常の分析結果を何度実行しても安全にする設定である",
          a: false,
          why: "二重実行やschema違いを混ぜ得るため、重複防止を設計した限定用途で使います。",
        },
      ],
      hint: "joinの行数、読戻し、二重実行を考えます。",
    },
  ],
};
