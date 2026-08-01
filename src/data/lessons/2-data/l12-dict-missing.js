// レッスン: 辞書と欠損値 — 対応表と「値がない」の扱い
// コード例・出力は Julia 1.12.5 で実測済み(2026-07-31)
export default {
  id: "dict-missing",
  title: "辞書と欠損値",
  tag: "対応表と「値がない」の扱い",
  pages: [
    {
      t: "実データにつきものの2つの道具",
      b: [
        "このレッスンでは、名前と値の対応表(辞書)と、実データにかならず現れる欠損値(missing)を扱えるようになります。",
        "「条件コード cong は『一致』のこと」のような対応表と、「この試行は記録もれ」のような欠損。どちらも実験データの分析で最初にぶつかる現実です。先に道具をそろえておきましょう。",
      ],
    },
    {
      t: "辞書(Dict): 名前で引く対応表",
      b: [
        "辞書は「キー => 値」のペアを集めた対応表です。配列が「何番目」で取り出すのに対し、辞書は「名前」で取り出します。",
      ],
      code: `cond_name = Dict("cong" => "一致", "incong" => "不一致")
println(cond_name["incong"])`,
      out: "不一致",
      a: [
        "条件コードを日本語ラベルに変換するときや、参加者IDごとの設定を持つときに便利です。`=>` は「対応づける」の記号です。",
      ],
    },
    {
      t: "欠損値 missing は伝染する",
      b: [
        "Juliaでは「値がない」ことを `missing` と書きます。だいじな性質がひとつ——missingを含む計算の結果は missing になります。",
      ],
      code: `using Statistics
x = [500.0, missing, 540.0]
println(mean(x))`,
      out: "missing",
      a: [
        "「わからない値を含む平均は、わからない」——Juliaは黙ってごまかさず、正直に missing と答えます。エラーではありません。",
      ],
    },
    {
      t: "skipmissing で欠損を飛ばす",
      b: ["欠損を除いて計算したいときは、`skipmissing` で包んでから渡します。"],
      code: `using Statistics
x = [500.0, missing, 540.0]
println(mean(skipmissing(x)))`,
      out: "520.0",
      a: [
        "(500 + 540) ÷ 2 = 520。欠損を除いた、2つの値の平均が出ました。「missingが伝染する → skipmissingで飛ばす」はワンセットで覚えましょう。",
        "REPLで確かめよう: `sum([1, missing, 3])` と `sum(skipmissing([1, missing, 3]))` を打ちくらべてみましょう。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "このコードを実行すると何が表示されるでしょう?",
      code: `d = Dict("a" => 10, "b" => 20)
println(d["b"])`,
      opts: ["20", "10", "b"],
      ans: 0,
      why: "辞書はキーで値を引きます。`d[\"b\"]` はキー \"b\" に対応づけられた 20 を返します。",
      hint: "`=>` の左がキー(引くための名前)、右が値です。",
    },
    {
      k: "tf",
      q: "欠損値について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "`missing` は 0 と同じ意味である",
          a: false,
          why: "0 は「値がゼロ」、missing は「値がない」。まったく別物です。0として扱うと平均がゆがみます。",
        },
        {
          s: "`skipmissing` は欠損を飛ばして計算するための道具である",
          a: true,
          why: "`mean(skipmissing(x))` のように包んで使い、欠損以外だけで計算します。",
        },
        {
          s: "欠損を含む配列の `mean` は missing を返す",
          a: true,
          why: "missingは計算に伝染します。だからこそ skipmissing が必要になるのでした。",
        },
      ],
      hint: "「わからない値を含む計算の結果は、わからない」がJuliaの立場でした。",
    },
    {
      k: "fill",
      q: "欠損を除いて平均を出します。空欄〔?〕に入る関数名を入力しましょう。",
      code: "mean(〔?〕(x))",
      accept: ["skipmissing"],
      show: "skipmissing",
      why: "`skipmissing(x)` が欠損を飛ばした中身を渡してくれるので、`mean` が計算できます。",
      hint: "skip(飛ばす)+ missing(欠損)をつなげた名前です。",
      placeholder: "関数名",
    },
  ],
};
