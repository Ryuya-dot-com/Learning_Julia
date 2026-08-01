// レッスン: CSV.jl & DataFrames.jl 入門 — 実データを表として読みこむ
// コード例・出力は Julia 1.12.5 + CSV 0.10.16 + DataFrames 1.8.2 で実測済み(2026-07-31)
// サンプルデータ: public/data/rt_data.csv (12行×4列・欠損なし)
export default {
  id: "dataframes-introduction",
  title: "CSV.jl & DataFrames.jl 入門",
  tag: "実データを表として読みこむ",
  pages: [
    {
      t: "ついに実データへ",
      b: [
        "このレッスンでは、CSVファイルを読みこんで、列を選び、行を絞りこめるようになります。",
        "使うパッケージは `CSV.jl` と `DataFrames.jl` の2つ。「Juliaを手元に入れる」の手順で `] add CSV DataFrames` と入れておきましょう(Excelファイルは `XLSX.jl` という別パッケージで読めます)。",
        "練習用のデータは、ストループ課題ふうの反応時間データ rt_data.csv です。このサイトの data/rt_data.csv からダウンロードできます(ホームの「演習ノート」を開くと、自動で読みこまれます)。",
      ],
    },
    {
      t: "CSV.read で表になる",
      b: ["CSVファイルを読みこむと、DataFrame(データフレーム)という「表」になります。`first(df, 3)` は先頭3行の取り出しです。"],
      code: `using CSV, DataFrames
df = CSV.read("rt_data.csv", DataFrame)
println(first(df, 3))`,
      out: `3×4 DataFrame
 Row │ id       cond     rt       correct
     │ String3  String7  Float64  Bool
─────┼────────────────────────────────────
   1 │ P01      cong       512.5     true
   2 │ P01      cong       498.2     true
   3 │ P01      incong     560.4     true`,
      a: [
        "参加者ID、条件、反応時間、正誤の4列が読みこまれました。2行目に出ている `String3` や `Float64` は各列の型です——「データの型」の知識がここで生きています。`size(df)` と打てば `(12, 4)`(12行4列)が返ります。",
      ],
    },
    {
      t: "列を選ぶ: select と「:列名」",
      b: [
        "列の名前は `:id` のようにコロンを付けて書きます。この `:名前` は「列を指す名札」の記号(シンボルと呼びます)で、DataFrames ではこの書き方が標準です。",
      ],
      code: `println(first(select(df, :id, :rt), 3))`,
      out: `3×2 DataFrame
 Row │ id       rt
     │ String3  Float64
─────┼──────────────────
   1 │ P01        512.5
   2 │ P01        498.2
   3 │ P01        560.4`,
      a: [
        "`select(df, :id, :rt)` で id と rt の2列だけの表になりました。1列だけを配列として取り出すなら `df.rt` とも書けます。",
      ],
    },
    {
      t: "行を絞りこむ",
      b: [
        "「600ミリ秒をこえた試行だけ」のような行の絞りこみは、「ドット記法(ブロードキャスト)」と組み合わせて書けます。",
      ],
      code: `slow = df[df.rt .> 600, :]
println(slow)`,
      out: `2×4 DataFrame
 Row │ id       cond     rt       correct
     │ String3  String7  Float64  Bool
─────┼────────────────────────────────────
   1 │ P01      incong     601.3    false
   2 │ P02      incong     624.9     true`,
      a: [
        "読み方は「df のうち、rt が600をこえる行の、すべての列(`:`)」。`df.rt .> 600` が各行の true/false を作り、true の行だけが残ります。同じことは `subset(df, :rt => ByRow(>(600)))` というDataFrames流の書き方でもできます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "CSVファイルを読みこんで表にする関数はどれでしょう?",
      opts: ["CSV.read", "CSV.open", "read_csv"],
      ans: 0,
      why: "`CSV.read(\"ファイル名\", DataFrame)` です。第2引数の DataFrame が「表として受け取る」という指定でした。",
      hint: "パッケージ名のうしろに、英語の「読む」が続きます。",
    },
    {
      k: "fill",
      q: "読みこんだデータを「表」として受け取ります。空欄〔?〕に入る型の名前を入力しましょう。",
      code: `df = CSV.read("rt_data.csv", 〔?〕)`,
      accept: ["dataframe"],
      show: "DataFrame",
      why: "`DataFrame` を渡すと表形式で受け取れます。パッケージ名は DataFrames(複数形)、型の名前は DataFrame(単数形)です。",
      hint: "データフレーム、を英語のまま書きます。大文字の位置に注意。",
      placeholder: "型の名前",
    },
    {
      k: "tf",
      q: "列の指定について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "`:rt` のコロンつきの書き方は、列の名前を指す記号である",
          a: true,
          why: "「rtという列」を指す名札(シンボル)です。select や、次のレッスンの groupby でも使います。",
        },
        {
          s: "`select(df, :id, :rt)` は行を絞りこむ関数である",
          a: false,
          why: "select は「列」を選ぶ関数です。行の絞りこみは `df[条件, :]` で行います。",
        },
        {
          s: "`df.rt` と書くと rt 列を配列として取り出せる",
          a: true,
          why: "1列だけ欲しいときの近道です。だから `df.rt .> 600` のようにドット記法が使えるのでした。",
        },
      ],
      hint: "select は列、`df[条件, :]` は行。どちらを選ぶ道具だったか思い出しましょう。",
    },
    {
      k: "choice",
      q: "本文のデータで `df[df.rt .> 600, :]` を実行すると、何行の表になったでしょう?",
      opts: ["2行", "12行", "0行"],
      ans: 0,
      why: "601.3 と 624.9 の2試行だけが600ミリ秒をこえていました。条件に合う行だけが残ります。",
      hint: "本文の「行を絞りこむ」の実行結果を見返しましょう。",
    },
  ],
};
