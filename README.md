# はじめてのJulia — 研究室のためのプログラミング入門

プログラミング未経験の学生のための、日本語のJulia自習教材です。
コードと実行結果を読みながら、クイズで理解をたしかめていきます。インストール不要・スマートフォンでも使えます。

**教材はこちら → https://ryuya-dot-com.github.io/Learning_Julia/**

- 基礎編から測定・混合モデル・研究計画まで、番号付き全37レッスンを公開中
- エラー診断、文字列処理、分布選択・推定・予測診断、観測境界・依存・混合生成、複数CSV入出力、再現可能な研究、Gitなど、番号なし補講も公開中
- データ操作から発展編まで、実際に手を動かすPluto演習ノートブック5本を収録
- 全体像、Now／Next／Later／保留の判断規準、今後のR・Stan連携構想は [学習ロードマップ](https://ryuya-dot-com.github.io/Learning_Julia/roadmap.html) を参照
- 進みぐあいはページを開いているあいだだけ記録されます(サーバには何も送信しません)

## レッスンの追加方法

レッスンは 1本 = 1ファイルです。`src/data/lessons/<セクション>/` にファイルを置くだけで追加されます。

```
src/data/
├── sections.js          ← セクション定義(順序・配色)。新セクション時のみ編集
└── lessons/
    ├── index.js         ← 自動収集。編集不要
    └── 0-basics/
        ├── l01-intro.js ← 1レッスン = 1ファイル
        └── ...
```

- ファイル名は `l01-`, `l02-` とゼロ埋め(名前順がレッスン順になります)
- レッスン番号は自動採番のため、ファイルには書きません
- データの形式を間違えると `npm test` が失敗し、デプロイされません

## 開発

```bash
npm install
npm run dev      # 開発サーバ
npm test         # レッスンデータの検証
npm run build && npm run preview  # 公開と同条件での確認(base パスが効くのは preview のみ)
```

`main` に push すると GitHub Actions がテスト → ビルド → GitHub Pages への公開を自動で行います。

P2の打切り・切断尤度は、公開教材へ入れる前のresearch検証です。既存環境へ依存を増やさず、`validation/p2-likelihood/`の隔離環境でだけ実行します。

selection-count likelihoodは、[研究用教材ドラフト](validation/p2-likelihood/SELECTION_COUNT_TEACHING_DRAFT.md)で直感、手計算、Julia例、反例、理解確認まで読めます。観測契約と追加stressが揃うまでは公開レッスンcatalogへ登録しません。

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-likelihood-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-likelihood-stress-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-identification-profile-check.jl
python -m pip install -r validation/p2-scipy/requirements.txt
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-generalization-engine-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-two-sided-identification-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-check.jl
```

## コード例の方針

教材に載せるJuliaコードと出力は、すべて実際に実行して確認したものです(モンテカルロ例は Julia 1.12 で実測)。
乱数を使う例は、同じシードでもJuliaのバージョンによって結果がわずかに変わることがあります。

## ライセンス

| 対象 | ライセンス |
|---|---|
| コード(`src/` のUI・ロジック、ビルド設定) | [MIT](LICENSE) |
| レッスン本文・演習問題(`src/data/` のテキスト) | [CC BY 4.0](LICENSE-CONTENT) |

教材テキストを再利用する場合は、クレジットとして `Ryuya-dot-com` を表示してください。
