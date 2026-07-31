// 補講: エディタと開発環境 — RStudioに慣れた人のための見取り図
// 事実確認(2026-07-31): julia-vscode.org(機能・コマンド名) / IJulia README(notebook()と初回Conda導入) /
// Wikipedia(Jupyterの名前の由来) / Plutoの環境埋め込みは公式ドキュメント確認済み
export default {
  id: "x1",
  title: "エディタと開発環境",
  tag: "JuliaのRStudioはどれ?",
  pages: [
    {
      t: "JuliaのRStudioはどれ?",
      b: [
        "この補講では、Juliaを書くための道具(エディタ・ノートブック)の全体像がわかり、自分に合ったものを選べるようになります。",
        "Rには RStudio という「みんなが使う専用エディタ」がありますが、Juliaには公式の専用エディタはありません。そのかわり、目的別の定番がいくつかあります。どれを選んでも動くJulia本体は同じで、あとから乗り換えるのも自由です。",
        "レッスン10でJuliaをインストールしてあれば、この補講の内容はその場で試せます。まだの方は、読むだけでも大丈夫です。",
      ],
    },
    {
      t: "VS Code + Julia拡張 — RStudioにいちばん近い",
      b: [
        "本格的に分析スクリプトを書くなら、定番は VS Code(code.visualstudio.com)に拡張機能「Julia」を足す組み合わせです。VS Code の拡張機能検索で Julia と入力して追加するだけで準備完了。",
        "スクリプトを書きながら、選んだ行をその場でREPLに送って実行できます(「Julia: Execute Code in REPL」)。入力補完、エラーの表示、デバッガ(まちがい探しを助ける道具)もそろっていて、RStudioの「スクリプトを書きつつコンソールで1行ずつ確かめる」感覚にいちばん近い環境です。",
      ],
      a: [
        "研究室で長い分析スクリプトを書くようになったら、これを入れるのがおすすめです。続編のスクリプト開発が始まるころで間に合います。",
      ],
    },
    {
      t: "Jupyter Notebook — JuはJuliaのJu",
      b: [
        "Pythonでおなじみの Jupyter Notebook でもJuliaが動きます。じつは Jupyter という名前は Julia・Python・R の3つの言語に由来しています。先頭の Ju は、JuliaのJuというわけです。",
        "使うには `IJulia` というパッケージを入れて、REPLからノートブックを起動します。`]` でパッケージモードに入り、`add` が終わったら Backspace で `julia>` に戻る——レッスン10の `Pluto` のときと同じ手順です。",
      ],
      code: `pkg> add IJulia
julia> using IJulia
julia> notebook()`,
      a: [
        "初回は「Jupyter本体を入れますか?」と聞かれることがあります。そのまま Enter で進めば、Julia専用のJupyter一式が自動で入ります(すでにJupyterが入っているPCでは、聞かれずにそのまま開きます)。Pythonの授業などでJupyterを使ったことがある人には、いちばん親しみやすい選択肢です。",
      ],
    },
    {
      t: "使い分けの地図",
      b: [
        "ここまでに登場した道具を、目的別に並べるとこうなります。",
        "`REPL` — ちょっと試す・パッケージを入れる(レッスン10)。すべての土台です。",
        "`Pluto.jl` — この教材の続編で使うノートブック。使ったパッケージの情報がファイルの中に保存されるので、他の人が開いても同じ環境が再現されます。",
        "VS Code — 本格的な分析スクリプトの開発。RStudioにいちばん近い使い心地。",
        "Jupyter — Pythonと共通のノートブック環境。Python経験者や、Pythonと行き来する研究室に。",
      ],
      a: [
        "迷ったら、いまはこの教材とPlutoだけで十分です。道具はあとからいつでも足せます。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "RStudioの使い心地にいちばん近いのはどれでしょう?",
      opts: ["VS Code + Julia拡張", "メモ帳 + REPL", "Pluto + Jupyter"],
      ans: 0,
      why: "VS Code + Julia拡張なら、スクリプトを書きながら選んだ行をREPLに送って実行でき、補完・エラー表示・デバッガもそろいます。RStudioの感覚にいちばん近い環境です。",
      hint: "「スクリプトを書きつつ、1行ずつ実行して確かめる」ができる組み合わせです。",
    },
    {
      k: "fill",
      q: "JupyterでJuliaを使うためのパッケージを追加します。空欄〔?〕に入るパッケージ名を入力しましょう。",
      code: "pkg> add 〔?〕",
      accept: ["ijulia"],
      show: "IJulia",
      why: "`IJulia` を入れると、JupyterにJuliaのカーネル(実行エンジン)が登録されます。`using IJulia` して `notebook()` で起動でしたね。",
      hint: "JupyterのJuはJuliaのJu。本文のコード例を見返してみましょう。",
      placeholder: "パッケージ名",
    },
    {
      k: "choice",
      q: "この教材の続編(STEPごとの演習ノートブック)で使う環境はどれでしょう?",
      opts: ["Pluto.jl", "Jupyter Notebook", "VS Code"],
      ans: 0,
      why: "続編の演習ノートブックは `Pluto.jl` で配布します。レッスン10で起動したあの環境です。パッケージ情報がファイルに埋めこまれるので、開くだけで同じ環境が再現されます。",
      hint: "レッスン10の最後に起動した、あのノートブックです。",
    },
  ],
};
