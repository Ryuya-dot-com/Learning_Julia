// 補講: エラーメッセージの読み方 — 停止理由を再現可能に切り分ける
// Julia 1.12.5で掲載出力を検証。例外・stacktraceの説明はJulia公式manualを確認(2026-08-09)。
export default {
  id: "reading-error-messages",
  title: "エラーメッセージの読み方",
  tag: "型・場所・入力を手がかりに原因を切り分ける",
  pages: [
    {
      t: "エラーは、止まった理由を返す観測データ",
      b: [
        "赤い表示は失敗の判定ではなく、Juliaが処理を続けられなかった理由の記録です。まずコードを書き直し始めず、例外の種類、短い説明、自分のコードの場所、入力の型と形を順に読みます。",
        "長いstacktraceを最初から全部理解する必要はありません。最初のエラー行で何が起きたかをつかみ、stacktraceから自分が書いたfile名と行番号を探します。package内部の行は、呼び出し経路を詳しく調べる段階まで保留できます。",
        "この補講の到達点は、エラーを消すことではなく、同じ症状を最小の入力で再現し、期待と実際の違いを一文で説明できることです。",
      ],
    },
    {
      t: "MethodErrorは、関数名と引数の型を読む",
      b: [
        "`MethodError: no method matching`は、その関数へ渡した引数の型の組み合わせを処理するmethodが見つからない、という意味です。関数が存在しないとは限りません。",
        "次の例では、`+`へStringとInt64を渡しています。直す前に、意図が数値の加算なのか、表示用文字列の連結なのかを決めます。数値なら`parse`、文字列なら`string`や文字列補間を使い、理由なく型を変換しません。",
      ],
      code: `value = "3"
increment = 2

println(typeof(value))
println(typeof(increment))
println(value + increment)`,
      out: `String
Int64
ERROR: MethodError: no method matching +(::String, ::Int64)`,
      err: true,
      a: [
        "この例の数値としての修正は`parse(Int, value) + increment`で5です。表示として連結したいなら`\"$(value)$(increment)\"`で`\"32\"`です。同じエラーでも研究上の意図によって正しい修正は変わります。",
      ],
    },
    {
      t: "UndefVarErrorは、名前・実行順・scopeを確認する",
      b: [
        "`UndefVarError`は、その場所から名前を参照できないことを示します。綴りや大文字小文字の違い、定義cellの未実行、関数の外にしかないlocal変数、必要なpackageの未読込を確認します。",
        "似た名前を見つけて機械的に置換する前に、どこで定義されるはずかを探します。Notebookでは上から順にclean runし、古いsessionにだけ残る変数へ依存していないか確認します。",
      ],
      code: `reaction_time = [510, 530, 490]
println(mean(reaction_times))`,
      out: `ERROR: UndefVarError: \`mean\` not defined in \`Main\`
Suggestion: check for spelling errors or missing imports.`,
      err: true,
      a: [
        "このコードには2段階の問題があります。まず`using Statistics`がないため`mean`で止まります。それを直すと、次は単数形で定義した`reaction_time`と複数形の`reaction_times`の不一致が見つかります。一度に見えるのは、最初に到達した停止理由だけです。",
      ],
    },
    {
      t: "BoundsError・KeyErrorは、存在する範囲を先に見る",
      b: [
        "`BoundsError`は配列などの範囲外を参照したとき、`KeyError`は辞書にないkeyを`d[key]`で参照したときに起こります。配列なら`axes`・`eachindex`、辞書なら`keys`・`haskey`で、実際に存在する範囲を確認します。",
        "存在しない値が正常に起こり得るなら、例外を握りつぶすのではなくAPIで表現します。辞書の`get(d, key, default)`は既定値を返しますが、欠測と真の既定値を区別したい場面では`missing`など意味の合う値を選びます。",
      ],
      code: `scores = [72, 81, 90]
labels = Dict("ctrl" => "統制", "treat" => "介入")

println((indices = collect(eachindex(scores)), last = scores[end]))
println((known = get(labels, "ctrl", missing),
         unknown = get(labels, "followup", missing)))`,
      out: `(indices = [1, 2, 3], last = 90)
(known = "統制", unknown = missing)`,
    },
    {
      t: "DimensionMismatchは、長さと行列の向きを表示する",
      b: [
        "`DimensionMismatch`は、配列や行列の形が演算の契約と合わないときに起こります。値を眺める前に`size`、`length`、必要なら列名とgroup数を表示します。",
        "観測数が違うvectorを短い方へ切り詰めるとエラーは消えますが、参加者と測定値の対応が壊れるかもしれません。join、filter、欠測除外のどの段階で行数が変わったかを調べ、IDを使って対応を検証します。",
      ],
      code: `participant_id = ["P01", "P02", "P03"]
rt_ms = [510.0, 525.0]

println((id_size = size(participant_id), rt_size = size(rt_ms)))
length(participant_id) == length(rt_ms) ||
    throw(DimensionMismatch("participant_idとrt_msの行数が一致しません"))`,
      out: `(id_size = (3,), rt_size = (2,))
ERROR: DimensionMismatch: participant_idとrt_msの行数が一致しません`,
      err: true,
    },
    {
      t: "stacktraceでは、自分のfileと最初の呼び出しを探す",
      b: [
        "stacktraceは、エラーへ至る関数呼び出しの経路です。通常は例外の直後に、`[1]`から原因に近い順でframeが並びます。まず自分の関数名、`.jl` file、行番号を探し、その行へ渡った入力を確認します。",
        "`try`／`catch`の中で元の場所を記録する必要があるとき、Juliaは`catch_backtrace()`を提供します。ただし初心者の解析では、まず未処理のエラーをそのまま再現し、表示されたstacktraceを保存する方が単純です。",
      ],
      code: `function standardized(x)
    (x .- mean(x)) ./ std(x)
end

# scriptで失敗したら、まず次を記録する
println((input_type = typeof(data), input_size = size(data)))
z = standardized(data)`,
      a: [
        "質問やissueには、エラー直前の数行、完全な最初のエラー、Juliaとpackageのversion、最小の合成入力を添えます。実データ、利用者名、token、絶対pathなどの機微情報は除きます。画像だけより検索可能なtextが役立ちます。",
      ],
    },
    {
      t: "try／catchは、予想した例外だけを値へ変える",
      b: [
        "例外が通常の入力として予想される場合だけ、狭い範囲で捕捉します。`tryparse`のように失敗を値で返す既存APIがあれば、まずそれを使います。",
        "すべての例外を`catch`して`missing`へ変えると、入力不良だけでなくcodeのtypoや環境破損まで欠測に見えてしまいます。捕捉する型を確認し、想定外は`rethrow()`してstacktraceを保ちます。",
      ],
      code: `function parse_rt(text)
    value = tryparse(Float64, text)
    value === nothing && return missing
    value >= 0 || throw(DomainError(value, "反応時間は0以上です"))
    value
end

println(parse_rt("512.4"))
println(parse_rt("NA"))`,
      out: `512.4
missing`,
      a: [
        "`NA`をmissingへ変える規則が研究上妥当かは、data dictionaryとschemaで決めます。便利だからという理由だけで、すべてのparse失敗を欠測へ分類しません。",
      ],
    },
    {
      t: "最小再現例を作り、仮説を一つずつ検証する",
      b: [
        "元fileをcopyして行を無計画に消すのではなく、失敗を保つ最小の合成入力を別に作ります。入力、期待した結果、実際の結果を固定し、一度に一つだけ変えます。",
        "確認順は、①最初のエラー行、②自分のfileと行、③`typeof`・`size`・`keys`、④最小入力、⑤直前に変えたcodeやenvironmentです。修正後は、その例だけでなく元のclean runと関連testも再実行します。",
        "エラーが消えたことは、分析が正しくなった証明ではありません。行の対応、単位、欠測規則、参照水準、推定対象といった科学的契約も別に検証します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "`MethodError: no method matching +(::String, ::Int64)`で最初に確認することはどれですか？",
      opts: [
        "+へ渡した値の型と、加算・連結のどちらを意図したか",
        "stacktraceの全package内部行を暗記する",
        "エラーが消えるまで値を無条件にStringへ変える",
      ],
      ans: 0,
      why: "MethodErrorは引数型の組み合わせを示します。期待する操作を決めてから変換方法を選びます。",
      hint: "エラー文に表示されている`String`と`Int64`を手がかりにします。",
    },
    {
      k: "fill",
      q: "配列を安全に走査できる実在indexを取得します。空欄を入力してください。",
      code: `for i in 〔?〕(values)
    println(values[i])
end`,
      accept: ["eachindex"],
      show: "eachindex",
      why: "`eachindex(values)`は、そのcollectionを走査するための適切なindexを返します。",
      hint: "eachとindexをつないだ関数名です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "エラー対応について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "長いstacktraceでは、まず自分のfile名と行番号を探す",
          a: true,
          why: "原因に近い自分の呼び出しと、その入力を先に確認します。",
        },
        {
          s: "catchで全例外をmissingへ変えれば、解析は安全になる",
          a: false,
          why: "codeや環境の不具合まで欠測へ隠す危険があります。予想した失敗だけを扱います。",
        },
        {
          s: "エラーが消えた後も、元のclean runと関連testを再実行する",
          a: true,
          why: "局所的な修正が別の入力や分析契約を壊していないか確認します。",
        },
      ],
      hint: "診断、例外処理、修正後の検証を分けて考えます。",
    },
    {
      k: "choice",
      q: "共同研究者へエラーを共有する方法として最も適切なのはどれですか？",
      opts: [
        "最小の合成入力、最初のエラー全文、version、期待した結果をtextで共有する",
        "機微な実データとtokenを含む画面全体をそのまま公開する",
        "『動きません』だけを書き、codeと入力型を伏せる",
      ],
      ans: 0,
      why: "再現に必要な情報を揃えつつ、実データや秘密情報は合成入力へ置き換えます。",
      hint: "再現可能性とprivacyの両方を満たす方法を選びます。",
    },
  ],
};
