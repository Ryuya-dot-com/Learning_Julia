// レッスン: 縦横変換と一括読み込み — 表のかたちを自在に
// コード例・出力は Julia 1.12.5 + DataFrames 1.8.2 で実測済み(2026-07-31)
export default {
  id: "l16",
  title: "縦横変換と一括読み込み",
  tag: "表のかたちを自在に",
  pages: [
    {
      t: "「横持ち」と「縦持ち」",
      b: [
        "このレッスンでは、表の形を変える(縦横変換)ことと、複数の表を積み重ねることができるようになります。",
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
        "元の横持ちに戻りました。「stack で縦に、unstack で横に」。行き先の形から関数を選びましょう。型に `?` が付いたのは、unstack が「組み合わせの欠けたセルは missing になるかもしれない」前提で列を作るためです(レッスン15で見た印ですね)。",
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
        "実際の研究では、レッスン13の内包表記と組み合わせて `dfs = [CSV.read(f, DataFrame) for f in files]` と全ファイルを読み、`vcat(dfs...)` で一気に連結します(`...` は「配列の中身をぜんぶ引数として並べる」記号です)。30人分のログファイルもこの2行で1つの表になります。",
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
  ],
};
