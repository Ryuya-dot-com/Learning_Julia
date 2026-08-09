// 補講: 文字列処理 — 記録されたtextを検査可能な列へ変える
// Julia 1.12.5で掲載出力を検証。Unicode・Regex APIはJulia公式docsを確認(2026-08-09)。
export default {
  id: "text-processing",
  title: "文字列処理",
  tag: "分割・正規化・抽出を追跡可能な変換にする",
  pages: [
    {
      t: "文字列を整える前に、意味と原文を分ける",
      b: [
        "装置log、自由記述、file名、参加者codeは文字列として届きます。分析へ使うには分割・変換が必要ですが、空白や大文字小文字を消せば常に同じ意味になるわけではありません。",
        "原文列を上書きせず、正規化した列をcodeから作ります。どの規則で何件変わったかを数え、未知の形式は推測で直さず停止または要確認として分けます。",
        "この補講ではJulia標準の`strip`、`split`、`replace`、`occursin`、`match`、`tryparse`を使い、1行のlogを検査可能な値へ変えます。",
      ],
    },
    {
      t: "strip・lowercase・replaceで表記を正規化する",
      b: [
        "`strip`は前後の空白、`lowercase`は大文字小文字、`replace`は指定したpatternを変換します。正規化は新しい文字列を返し、元の文字列を変更しません。",
        "空白を全部消すと自由記述の単語境界まで壊れます。条件codeのように許可水準が決まった列へ限定し、変換後に許可集合へ入るか検査します。",
      ],
      code: `raw = [" Control ", "TREATMENT", "control "]
normalized = lowercase.(strip.(raw))

println(normalized)
println(all(in(Set(["control", "treatment"])), normalized))`,
      out: `["control", "treatment", "control"]
true`,
    },
    {
      t: "splitで区切り、列数を検査してからparseする",
      b: [
        "区切り文字が明確なlogは、正規表現より先に`split`を使います。分割後すぐに要素数を確認し、列位置のずれをもっともらしい値として通しません。",
        "単位を除いた後は`parse`または`tryparse`で数値型へ変換します。`parse`は不正形式で停止し、`tryparse`は`nothing`を返すため、未知値を収集して報告したいworkflowに向きます。",
      ],
      code: `line = " P012 | CONTROL | 512.4 ms "
parts = strip.(split(line, '|'))
length(parts) == 3 || throw(ArgumentError("logは3列必要です"))

participant_id = parts[1]
condition = lowercase(parts[2])
rt_ms = parse(Float64, replace(parts[3], " ms" => ""))

println((participant_id, condition, rt_ms))`,
      out: `(participant_id = "P012", condition = "control", rt_ms = 512.4)`,
    },
    {
      t: "空文字・missing・nothingを同じにしない",
      b: [
        "`\"\"`は長さ0の観測済み文字列、`missing`は値が得られていないこと、`nothing`は値を返さないAPIや検索失敗で使われることがあります。3つは同じではありません。",
        "`tryparse(Float64, text)`は失敗時に`nothing`を返します。分析表へ入れるときにmissingへ対応づけるなら、その規則と件数を記録します。文字列`\"NA\"`も自動的な欠測ではなく、schemaで欠測codeと定めた場合だけ変換します。",
      ],
      code: `raw_rt = ["510.2", "NA", ""]
parsed = [text == "NA" || isempty(text) ? missing :
          something(tryparse(Float64, text), missing)
          for text in raw_rt]

println(parsed)
println(count(ismissing, parsed))`,
      out: `Union{Missing, Float64}[510.2, missing, missing]
2`,
    },
    {
      t: "Unicode文字列は、byte位置を文字番号と思わない",
      b: [
        "JuliaのStringはUTF-8です。`length`は文字数を数え、`ncodeunits`は保存に使うcode unit数を返します。日本語などは1文字が複数byteなので、1からlengthまでのすべての整数が有効な文字indexとは限りません。",
        "文字を順に処理するなら文字列を直接iterateするか`eachindex`を使います。利用者が見た1文字単位が必要な高度な処理では、結合文字やemojiもあるため`Unicode.graphemes`を検討します。",
      ],
      code: `text = "心理学"

println((characters = length(text), codeunits = ncodeunits(text)))
println(collect(text))
println([text[i] for i in eachindex(text)])`,
      out: `(characters = 3, codeunits = 9)
['心', '理', '学']
['心', '理', '学']`,
      a: [
        "`text[2]`のようなbyte途中のindexは`StringIndexError`になります。`firstindex`、`lastindex`、`nextind`も、文字列の有効indexを扱うためのAPIです。",
      ],
    },
    {
      t: "occursinは有無、matchは抽出に使う",
      b: [
        "特定文字列やpatternが含まれるかだけなら`occursin`がBoolを返します。部分を取り出す必要があるときは`match`を使い、一致しなければ`nothing`になることを先に扱います。",
        "正規表現`r\"...\"`は`Regex`型のpatternを作り、複雑な形式を短く書けます。ただし列区切りが決まっているなら`split`の方が読みやすいことがあります。patternは実在するIDや自由記述を誤って除外しないよう、合格例と失敗例をtestします。",
      ],
      code: `label = "P012_07"
pattern = r"^(?<id>P\\d{3})_(?<trial>\\d+)$"
m = match(pattern, label)
m === nothing && throw(ArgumentError("ID形式が不正です"))

println((id = m[:id], trial = parse(Int, m[:trial])))
println(occursin(r"^P\\d{3}", label))`,
      out: `(id = "P012", trial = 7)
true`,
    },
    {
      t: "replaceは置換結果と件数を監査する",
      b: [
        "表記統一では、変換前後の対応表と変更件数を残します。広すぎるpatternは単語の一部まで置換するため、語全体や許可値を基準にします。",
        "氏名やIDを`replace`で伏字にしても匿名化とは限りません。自由記述には所属、場所、希少な出来事などの間接識別子が残り得ます。privacy処理は検索置換だけで完了させず、access制御と人によるreviewを組み合わせます。",
      ],
      code: `responses = ["no-response", "NO RESPONSE", "ok"]
cleaned = replace.(lowercase.(responses), "no response" => "no-response")
changed = count(identity, responses .!= cleaned)

println(cleaned)
println((changed = changed, total = length(responses)))`,
      out: `["no-response", "no-response", "ok"]
(changed = 1, total = 3)`,
    },
    {
      t: "変換pipelineを小さな関数とtestへする",
      b: [
        "対話的に1行ずつ直した操作は、次のdataで再現できません。1 recordを変換する関数にし、正常例、境界例、未知形式をtestします。複数行では、失敗した行のkeyとruleを安全なlogへ残します。",
        "検査するのは関数が終了したことだけではありません。入力行数、出力行数、未知形式数、変換件数、ID一意性、数値範囲、原文checksumを確認します。変換後の値がもっともらしくても、行の対応がずれていれば分析には使えません。",
      ],
      code: `function parse_log_line(line)
    parts = strip.(split(line, '|'))
    length(parts) == 3 || throw(ArgumentError("logは3列必要です"))
    rt = tryparse(Float64, replace(parts[3], " ms" => ""))
    rt === nothing && throw(ArgumentError("反応時間が数値ではありません"))
    (; id = parts[1], condition = lowercase(parts[2]), rt_ms = rt)
end

record = parse_log_line("P014 | treatment | 488.0 ms")
println(record)`,
      out: `(id = "P014", condition = "treatment", rt_ms = 488.0)`,
    },
    {
      t: "文字列処理のゴールは、検索ではなく意味の保存",
      b: [
        "文字列処理では、原文、変換規則、構造化した列を分けます。`strip`や正規表現を使えたことより、何を同一視し、何を未知として残したかが重要です。",
        "安定した手順は、①原文を保存、②単純な区切りを優先、③列数と許可形式を検査、④型へ変換、⑤変更件数と失敗を記録、⑥合成例でtest、です。自由記述の解釈や匿名化は、この機械的pipelineとは別の判断として扱います。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "`\" P012 | 512.4 \"`の前後空白を除き、`|`で分割する組み合わせはどれですか？",
      opts: [
        "strip.(split(text, '|'))",
        "parse(text, '|')",
        "replace(text, missing)",
      ],
      ans: 0,
      why: "splitで区切った各部分へstripをbroadcastし、前後空白を除きます。",
      hint: "分割と空白除去を順に使います。",
    },
    {
      k: "fill",
      q: "文字列を数値へ変換し、失敗時にnothingを返す関数名を入力してください。",
      code: `value = 〔?〕(Float64, text)`,
      accept: ["tryparse"],
      show: "tryparse",
      why: "`tryparse`は変換できれば値、できなければnothingを返します。",
      hint: "parseの前にtryを付けた名前です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "文字列処理について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "UTF-8文字列では、1:length(text)のすべてが有効な文字indexとは限らない",
          a: true,
          why: "文字が複数code unitを使うため、eachindexや直接iterationを使います。",
        },
        {
          s: "空文字、missing、nothingは常に同じ意味である",
          a: false,
          why: "観測済みの空文字、欠測、APIの値なしを区別します。",
        },
        {
          s: "正規表現による氏名の伏字だけで、自由記述の匿名化は完了する",
          a: false,
          why: "間接識別子が残り得るため、privacy reviewとaccess制御が必要です。",
        },
      ],
      hint: "index、欠測表現、privacyの3つを分けて考えます。",
    },
    {
      k: "choice",
      q: "log変換pipelineとして最も監査しやすい方法はどれですか？",
      opts: [
        "原文を保持し、関数化した規則・失敗件数・合成testを残す",
        "原文列を手作業で上書きし、直した件数は記録しない",
        "未知形式を最も近い既知値へ自動的に割り当てる",
      ],
      ans: 0,
      why: "入力、規則、結果、失敗を追跡でき、次のdataでも同じ処理を再実行できます。",
      hint: "後から誰が同じ変換を再現できるかを考えます。",
    },
  ],
};
