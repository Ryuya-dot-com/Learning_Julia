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

レッスン本文は1本につき1ファイルです。`src/data/lessons/<セクション>/` に本文を追加し、`src/data/lessons/catalog.js` に同じ `path`・`id`・`title`・`tag`・`exCount` を登録します。本文だけでは一覧に表示されず、同期検査も失敗します。

```
src/data/
├── sections.js          ← セクション定義(順序・配色)。新セクション時のみ編集
└── lessons/
    ├── catalog.js       ← 一覧用の登録情報。教材の追加・変更時に同期
    ├── index.js         ← カタログから本文を遅延読込。通常は編集不要
    └── 0-basics/
        ├── l01-intro.js ← 1レッスン = 1ファイル
        └── ...
```

- ファイル名は `l01-`, `l02-` とゼロ埋め(名前順がレッスン順になります)
- レッスン番号は自動採番のため、ファイルには書きません
- 公開範囲が変わる場合は `public/roadmap.html`、関連Notebook・検査も同じ変更で更新します
- データの形式を間違えると `npm test` が失敗し、デプロイされません

通常は説明の後に全問題を並べます。問題を途中に置く場合は、各問題に `afterPage: "説明ページのtと同じ文字列"` を指定します。その説明の直後に問題を表示し、問題の下から同じ説明を開けます。参照先は章内で一意である必要があり、見出しを変更するときは `afterPage` も更新してください。問題番号と進捗は引き続き `ex` の配列順なので、読順に合わせて並べます。回帰診断とVIFの章で使用しています。

## 開発

```bash
npm install
npm run dev      # 開発サーバ
npm test         # レッスンデータの検証
npm run build && npm run preview  # 公開と同条件での確認(base パスが効くのは preview のみ)
```

`main` に push すると GitHub Actions がテスト → ビルド → GitHub Pages への公開を自動で行います。

公開条件はWeb検査、本編の数値検証20本、本編と静的P2プレビューのブラウザ検査です。P2研究の数値検証12本とローカルAPIの実行検査は、別の `.github/workflows/p2-research.yml` で変更時・毎週実行し、Pages公開の依存先にはしません。数値検証の対象・準備手順は [validation/README.md](validation/README.md) を参照してください。

### キーボード操作・拡大表示の確認

`npm run test:e2e`には、本文へ移動するリンク、画面切替後の見出しへのフォーカス、3形式の解答と正解・ヒント後の操作、クリア済み問題への再訪を含みます。コードと実行結果の欄はTabで選択でき、横に長いコードは左右キーでスクロールできます。読み上げ用の本文領域・見出し・問題文との関連付け・通知欄も確認します。

代表画面について幅320 CSS px、幅640／320 CSS pxでルート文字サイズ200%の表示を検査します。320 CSS pxは[W3Cのリフローの説明](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)を参考にしていますが、文字サイズ変更はブラウザーのズーム操作そのものではありません。全教材・全達成基準の検査やWCAG適合認定を意味しません。Safari・実機、実際の200%／400%ズーム、VoiceOver／NVDAによる読み上げ順序・通知の重複・コードの読みやすさは別途確認が必要です。

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

同じ完全検査を`.github/workflows/bridge-smoke.yml`がLinux／Windowsで変更時・毎週実行します。2026-09-05に両環境でCmdStanの新規buildからR／Stan成果物の生成・再利用まで確認済みです。第三者による引き継ぎ確認は未実施です。

ここで検査しているR連携は `Rscript --vanilla` によるファイル受け渡しです。RCall・JuliaCallの埋め込み実行は定期CIの対象ではなく、これらの教材例の動作を代わりに保証するものではありません。利用する場合は、対象環境で版と型変換を別に確認してください。

## P2研究の検査

P2の打切り・切断尤度は、公開教材へ入れる前のresearch検証です。既存環境へ依存を増やさず、`validation/p2-likelihood/`の隔離環境でだけ実行します。実参加者へ共有する静的な[研究UI preview](https://ryuya-dot-com.github.io/Learning_Julia/validation/p2-likelihood/ui-preview.html)だけは、検索非掲載・教材catalog非掲載で公開します。固定合成fixtureだけを使い、入力の送信・保存、telemetry、公開計算APIはありません。

selection-count likelihoodは、[研究用教材ドラフト](validation/p2-likelihood/SELECTION_COUNT_TEACHING_DRAFT.md)で直感、手計算、Julia例、反例、理解確認まで読めます。[実行可能な研究用Pluto Notebook](validation/p2-likelihood/selection-count-teaching-notebook.jl)では、観測契約、人数なし／ありfit、区間status、family誤指定を同じ固定seed例で確認できます。[研究用Web UI設計](validation/p2-likelihood/WEB_UI_PREVIEW_DESIGN.md)と参加者向けpreviewでは、その内容を入力表・結果表・誤答別feedbackへ移しています。[versioned結果I/O契約](validation/p2-likelihood/RESULT_IO_SCHEMA.md)は、Julia生成reportを未解決行つきJSON／CSVへ書き、Web側でschema v1を検査します。[研究用API境界](validation/p2-likelihood/API_BOUNDARY_DESIGN.md)は、loopback限定のsession／CSRF・rate limit・bounded body・killable Julia workerを固定しています。[初学者利用者テストprotocol](validation/p2-likelihood/LEARNER_USABILITY_PROTOCOL.md)は、非誘導task、teach-back rubric、2 round、privacy境界を事前固定しましたが、実参加者記録はまだ0件です。静的previewの公開は、公開レッスンcatalogへの昇格、公開Notebook化、推定serviceの公開を意味しません。

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/setup-validation-env.jl
python -m pip install -r validation/p2-scipy/requirements.txt
julia --startup-file=no --project=validation/p2-likelihood scripts/run-numeric-checks.jl --p2
julia --startup-file=no --project=validation/p2-likelihood validation/p2-likelihood/selection-count-teaching-notebook.jl
julia --startup-file=no --project=validation scripts/p2-selection-count-notebook-exec.jl
npm run test:p2-ui
npm run test:p2-api
```

## コード例の方針

教材の数値例は `scripts/` の独立した検証コードで再実行します。ただし、CIは教材中のすべてのコード断片を抽出して実行する仕組みではありません。環境設定例や外部連携例を含め、掲載されていることと継続検証の対象であることを区別します。
公開Notebookの定期検査は未回答状態での実行です。解答後の正解判定までの完全検証は別手順であり、定期実行は未整備です。ブラウザ自動検査はChromiumが対象で、Safari・実機・読み上げでの利用を保証するものではありません。
乱数を使う例は、同じシードでもJuliaのバージョンによって結果がわずかに変わることがあります。

## ライセンス

| 対象 | ライセンス |
|---|---|
| コード(`src/` のUI・ロジック、ビルド設定) | [MIT](LICENSE) |
| レッスン本文・演習問題(`src/data/` のテキスト) | [CC BY 4.0](LICENSE-CONTENT) |

教材テキストを再利用する場合は、クレジットとして `Ryuya-dot-com` を表示してください。
