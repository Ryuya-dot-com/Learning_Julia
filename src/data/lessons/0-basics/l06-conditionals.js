// レッスン: 条件分岐 — 「もし〜なら」を書く
// num は書かない（セクション順+ファイル名順から自動採番される）
export default {
  id: "conditionals",
  title: "条件分岐",
  tag: "「もし〜なら」を書く",
  pages: [
    {
      t: "もし〜なら(if)",
      b: [
        "条件によって処理を変えるには `if` を使います。ブロックの最後には、必ず `end` を書きます。",
      ],
      code: `score = 75
if score >= 60
    println("合格")
end`,
      out: "合格",
    },
    {
      t: "それ以外なら(else / elseif)",
      b: [
        "条件が成り立たないときは `else`、条件を追加したいときは `elseif` を使います。上から順に判定されます。",
      ],
      code: `score = 75
if score >= 80
    println("A")
elseif score >= 60
    println("B")
else
    println("C")
end`,
      out: "B",
    },
    {
      t: "比較の記号",
      b: [
        "条件には比較演算子を使います。`==`(等しい)、`!=`(等しくない)、`>` `<` `>=` `<=` の6つです。",
        "注意:`=` は「入れる」、`==` が「比べる」。プログラミングで最もまちがえやすいポイントのひとつです。",
        "複数の条件は `&&`(かつ)、`||`(または)で組み合わせられます。",
      ],
      code: `age = 20
println(age == 20)
println(age >= 18 && age < 65)`,
      out: `true
true`,
    },
  ],
  ex: [
    {
      k: "choice",
      q: "「x が 10 と等しいか」を調べる書き方はどれでしょう?",
      opts: [
        "x == 10",
        "x = 10",
        "x => 10",
      ],
      ans: 0,
      why: "比べるときは `==`。`x = 10` と書くと「x に 10 を入れる」代入になってしまいます。",
      hint: "「入れる」と「比べる」で記号がちがうのでした。",
    },
    {
      k: "choice",
      q: "このコードを実行すると何が表示されるでしょう?",
      code: `score = 65
if score >= 80
    println("A")
elseif score >= 60
    println("B")
else
    println("C")
end`,
      opts: [
        "B",
        "A",
        "C",
      ],
      ans: 0,
      why: "65 は「80以上」ではないので次へ。「60以上」には当てはまるので B が表示されます。",
      hint: "上の条件から順に、65 を当てはめてみましょう。",
    },
    {
      k: "fill",
      q: "`if` ブロックの最後に必ず書くキーワードを入力しましょう。",
      accept: [
        "end",
      ],
      show: "end",
      why: "`if`・`for`・`function` などのブロックは、すべて `end` で閉じます。書き忘れはエラーの定番です。",
      hint: "英語で「終わり」を意味する3文字です。",
      placeholder: "キーワード",
    },
  ],
};
