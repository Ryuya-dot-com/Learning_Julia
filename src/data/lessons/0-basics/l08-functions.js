// レッスン: 関数 — 処理に名前をつける
// num は書かない（セクション順+ファイル名順から自動採番される）
export default {
  id: "functions",
  title: "関数",
  tag: "処理に名前をつける",
  pages: [
    {
      t: "処理をまとめて名前をつける",
      b: [
        "よく使う処理は関数(かんすう)としてまとめ、名前をつけて何度でも呼び出せます。`function` で始めて `end` で閉じます。",
      ],
      code: `function greet(name)
    println("こんにちは、$(name)さん!")
end

greet("田中")
greet("伊藤")`,
      out: `こんにちは、田中さん!
こんにちは、伊藤さん!`,
    },
    {
      t: "値を返す(return)",
      b: [
        "計算結果を呼び出し元に返すには `return` を使います。返ってきた値は、変数に入れたり表示したりできます。",
      ],
      code: `function double(x)
    return 2 * x
end

println(double(5))`,
      out: "10",
    },
    {
      t: "1行で書ける短縮形",
      b: [
        "短い関数は、数学の式のように1行で書けます。Juliaらしいスッキリした書き方です。",
      ],
      code: `f(x) = x^2 + 1
println(f(3))`,
      out: "10",
    },
  ],
  ex: [
    {
      k: "fill",
      q: "関数の定義を始めるキーワードを入力しましょう。",
      code: `〔?〕 greet(name)
    println(name)
end`,
      accept: [
        "function",
      ],
      show: "function",
      why: "`function 名前(引数)` で始めて、`end` で閉じるのが基本の形です。",
      hint: "英語で「関数」を意味する単語、そのままです。",
      placeholder: "キーワード",
    },
    {
      k: "choice",
      q: "このコードを実行すると何が表示されるでしょう?",
      code: `f(x) = x + 3
println(f(7))`,
      opts: [
        "10",
        "73",
        "x + 3",
      ],
      ans: 0,
      why: "`f(7)` は x に 7 を入れて計算するので、7 + 3 = 10 です。",
      hint: "x のところに 7 を当てはめてみましょう。",
    },
    {
      k: "choice",
      q: "`double(x) = 2 * x` のとき、`double(double(3))` の結果はどれでしょう?",
      opts: [
        "12",
        "6",
        "9",
      ],
      ans: 0,
      why: "内側から計算します。`double(3)` が 6、その 6 を使って `double(6)` が 12 です。",
      hint: "まずカッコの内側の `double(3)` から計算してみましょう。",
    },
  ],
};
