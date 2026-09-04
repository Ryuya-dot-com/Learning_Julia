# はじめてのJulia — 研究室のためのプログラミング入門

プログラミング未経験の学生のための、日本語のJulia自習教材です。
コードと実行結果を読みながら、クイズで理解をたしかめていきます。インストール不要・スマートフォンでも使えます。

**教材はこちら → https://ryuya-dot-com.github.io/Learning_Julia/**

- 基礎編から測定・混合モデル・研究計画まで、番号付き全37レッスンを公開中
- エラー診断、文字列処理、分布選択・推定・予測診断、観測境界・依存・混合生成、複数CSV入出力、再現可能な研究、Gitなど、番号なし補講も公開中
- RCall、JuliaCall、StanSampleを扱う番号なしのR・Stan連携トラック4本も公開中
- データ操作から外部エンジン連携まで、実際に手を動かすPluto演習ノートブック6本を収録
- 全体像とNow／Next／Later／保留の判断規準は [学習ロードマップ](https://ryuya-dot-com.github.io/Learning_Julia/roadmap.html) を参照
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

## R・Stan配布templateの検査

通常分析と、利用できる場合のR連携は次で確認します。

```bash
julia --project=examples/reproducible-study -e 'using Pkg; Pkg.instantiate()'
julia --project=examples/reproducible-study scripts/reproducible-template-check.jl
```

CmdStanを含む完全検査はC++ toolchainと約51 MBのdownloadを要します。macOS／Linuxでは次を実行します。

```bash
julia --project=examples/reproducible-study examples/reproducible-study/code/setup_cmdstan.jl
RUN_STAN_TEMPLATE_CHECK=1 julia --project=examples/reproducible-study scripts/reproducible-template-check.jl
```

同じ完全検査を`.github/workflows/bridge-smoke.yml`がLinuxで変更時・毎週実行します。Windowsでの実走確認と、第三者による引き継ぎ確認は未実施です。

P2の打切り・切断尤度は、公開教材へ入れる前のresearch検証です。既存環境へ依存を増やさず、`validation/p2-likelihood/`の隔離環境でだけ実行します。実参加者へ共有する静的な[研究UI preview](https://ryuya-dot-com.github.io/Learning_Julia/validation/p2-likelihood/ui-preview.html)だけは、検索非掲載・教材catalog非掲載で公開します。固定合成fixtureだけを使い、入力の送信・保存、telemetry、公開計算APIはありません。

selection-count likelihoodは、[研究用教材ドラフト](validation/p2-likelihood/SELECTION_COUNT_TEACHING_DRAFT.md)で直感、手計算、Julia例、反例、理解確認まで読めます。[実行可能な研究用Pluto Notebook](validation/p2-likelihood/selection-count-teaching-notebook.jl)では、観測契約、人数なし／ありfit、区間status、family誤指定を同じ固定seed例で確認できます。[研究用Web UI設計](validation/p2-likelihood/WEB_UI_PREVIEW_DESIGN.md)と参加者向けpreviewでは、その内容を入力表・結果表・誤答別feedbackへ移しています。[versioned結果I/O契約](validation/p2-likelihood/RESULT_IO_SCHEMA.md)は、Julia生成reportを未解決行つきJSON／CSVへ書き、Web側でschema v1を検査します。[研究用API境界](validation/p2-likelihood/API_BOUNDARY_DESIGN.md)は、loopback限定のsession／CSRF・rate limit・bounded body・killable Julia workerを固定しています。[初学者利用者テストprotocol](validation/p2-likelihood/LEARNER_USABILITY_PROTOCOL.md)は、非誘導task、teach-back rubric、2 round、privacy境界を事前固定しましたが、実参加者記録はまだ0件です。静的previewの公開は、公開レッスンcatalogへの昇格、公開Notebook化、推定serviceの公開を意味しません。

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-likelihood-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-likelihood-stress-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-identification-profile-check.jl
python -m pip install -r validation/p2-scipy/requirements.txt
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-generalization-engine-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-two-sided-identification-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-robustness-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-interval-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-report-io-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-api-boundary-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-local-server-check.jl
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-learner-usability-protocol-check.jl
julia --startup-file=no --project=validation/p2-likelihood validation/p2-likelihood/selection-count-teaching-notebook.jl
julia --startup-file=no --project=validation scripts/p2-selection-count-notebook-exec.jl
npm run test:p2-ui
npm run test:p2-api
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
