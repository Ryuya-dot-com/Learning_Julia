// レッスン: グループ集計と結合 — 条件ごとの平均を一撃で
// コード例・出力は Julia 1.12.5 + DataFrames 1.8.2 + Chain 1.0.0 で実測済み(2026-07-31)
export default {
  id: "groupby-join",
  title: "グループ集計と結合",
  tag: "条件ごとの平均を一撃で",
  pages: [
    {
      t: "分析の心臓部へ",
      b: [
        "このレッスンでは、条件ごとの平均(グループ集計)と、別の表との合体(結合)ができるようになります。",
        "その前に、新しい記号をひとつだけ。`@chain` のように `@` で始まる命令はマクロと呼ばれ、「コードを書きかえてから実行する特別な命令」です。しくみの理解は続編にまかせて、いまは「@付きは書き方をそのまま覚えればOK」で大丈夫です。",
      ],
    },
    {
      t: "groupby → combine: 条件ごとの平均",
      b: [
        "「条件ごとにまとめて(groupby)、各グループを1行に要約する(combine)」の2段構えです。`:rt => mean => :rt_mean` は「rt列に mean を適用し、結果を rt_mean 列と名づける」と読みます。",
      ],
      code: `using CSV, DataFrames, Statistics
df = CSV.read("rt_data.csv", DataFrame)
gd = groupby(df, :cond)
println(combine(gd, :rt => mean => :rt_mean))`,
      out: `2×2 DataFrame
 Row │ cond     rt_mean
     │ String7  Float64
─────┼──────────────────
   1 │ cong     507.933
   2 │ incong   590.583
`,
      a: [
        "一致条件は約508ミリ秒、不一致条件は約591ミリ秒——ストループ効果らしい差が見えました。12試行の表が、条件ごとの要約2行になっています。",
      ],
    },
    {
      t: "leftjoin: 参加者情報をつなぐ",
      b: [
        "試行データとは別に、参加者の属性表(participants.csv: id・年齢・グループ)があるとします。`leftjoin` で id を手がかりに合体できます。",
      ],
      code: `info = CSV.read("participants.csv", DataFrame)
joined = leftjoin(df, info, on = :id)
println(first(joined, 3))`,
      out: `3×6 DataFrame
 Row │ id       cond     rt       correct  age     group
     │ String3  String7  Float64  Bool     Int64?  String15?
─────┼───────────────────────────────────────────────────────
   1 │ P01      cong       512.5     true      21  bilingual
   2 │ P01      cong       498.2     true      21  bilingual
   3 │ P01      incong     560.4     true      21  bilingual
`,
      a: [
        "各試行の行に、その参加者の age と group が付きました。`on = :id` が「id列を照合の手がかりにする」という指定です。型の `Int64?` の `?` は「欠損があるかもしれない列」の印——実はこの属性表には年齢が欠損の参加者がいます。「辞書と欠損値」の知識の出番ですね。",
      ],
    },
    {
      t: "@chain: 上から下へ読めるパイプ",
      b: [
        "groupby して combine して……と処理が続くとき、`@chain` マクロを使うと「上から下へ」順に読める形に書けます(`] add Chain` で入るパッケージです)。",
      ],
      code: `using Chain
result = @chain df begin
    groupby(:cond)
    combine(:rt => mean => :rt_mean)
end
println(result)`,
      out: `2×2 DataFrame
 Row │ cond     rt_mean
     │ String7  Float64
─────┼──────────────────
   1 │ cong     507.933
   2 │ incong   590.583
`,
      a: [
        "`df` が最初の行に入り、結果が次の行の先頭に自動で渡されていきます。Rの `|>`(パイプ)に慣れている人には、まさにあの感覚です。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "「条件ごとの平均」を出す正しい組み合わせはどれでしょう?",
      opts: [
        "groupby でまとめて combine で要約する",
        "select でまとめて leftjoin で要約する",
        "mean でまとめて first で要約する",
      ],
      ans: 0,
      why: "groupby(グループ化)→ combine(要約)の2段構えでした。`combine(groupby(df, :cond), :rt => mean => :rt_mean)` と1行にも書けます。",
      hint: "「まとめて、要約する」。本文の見出しになっていた2つの関数です。",
    },
    {
      k: "fill",
      q: "試行データ `df` に参加者属性表 `info` を id で合体します。空欄〔?〕に入る関数名を入力しましょう。",
      code: "〔?〕(df, info, on = :id)",
      accept: ["leftjoin"],
      show: "leftjoin",
      why: "`leftjoin` は左の表(df)の行をすべて残しつつ、右の表の情報を付け足します。",
      hint: "left(左)+ join(つなぐ)。左の表を主役にする結合です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "マクロと @chain について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "`@` で始まる命令はマクロと呼ばれる特別な命令である",
          a: true,
          why: "コードを書きかえてから実行する命令です。いまは「書き方を覚えればOK」で十分です。",
        },
        {
          s: "`@chain` のブロックでは、前の行の結果が次の行に自動で渡される",
          a: true,
          why: "だから「上から下へ」素直に読めるのでした。Rのパイプに近い感覚です。",
        },
        {
          s: "`@chain` はJulia本体に最初から入っている",
          a: false,
          why: "`Chain` というパッケージを `] add Chain` で入れると使えるようになります。",
        },
      ],
      hint: "@chain を使う前に、コード例の1行目で何をしていたか見返しましょう。",
    },
  ],
};
