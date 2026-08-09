# P2 selection-count research Web UI preview

状態: unlisted participant preview公開 / loopback research endpoint検証済み / 公開教材未登録

## 1. 目的

研究Notebookで実行したselection-count教材を、実参加者へ共有できる静的React UIへ移す。ここで検証するのは公開推定serviceではなく、入力契約、結果status、API transport境界、誤指定警告、誤答別feedbackの表現である。

このpreviewは次を行わない。

- 公開レッスンcatalogへ登録しない
- `src/main.jsx`からimportしない
- 公開アプリとlesson catalogからpreviewへ導線を置かない
- 検索indexへ登録しない（`noindex,nofollow`）
- browser内でJulia fitを再実装しない
- 通常の観測契約入力や実データをserverへ送信・保存しない。API境界の確認はJulia生成の固定合成requestだけに限定する
- 固定合成fixtureを実データ結果として表示しない

## 2. 6つの画面契約

1. **観測契約**: 募集総数、screening総数`N`、選択数`m`、確認済み範囲外、未測定を分離する
2. **fit比較**: 固定合成例だけで、選択後43件の条件付きfitとselection-count fitを並べる
3. **区間status**: Wald・profile・bootstrapを並べ、`automaticInterval = null`を維持する
4. **API boundary**: 合成requestだけで未構成fallback、mock応答、loopback実計算を分ける
5. **model scope**: LogNormalをNormal専用fitへ渡したsupport／tail破綻を表示する
6. **誤答feedback**: 選択肢ごとに誤りcode、理由、次の行動を返す

任意入力に対してブラウザ内でfitは行わない。観測契約が固定例と一致するときだけ、Julia 1.12.6で検証済みのfixture表を表示する。別の`N`や`m`では「実行しない」と明示する。

## 3. Notebookと共通の誤り分類

| code | 停止理由 | 次のmodel／行動 |
|---|---|---|
| `missingness_confusion` | 範囲外と未測定を混ぜた | 除外理由を分け、確認済み範囲外だけを`N-m`へ入れる |
| `boundary_posthoc` | dataを見てから境界を決めた | 事前規則を復元するか、選択手順を別modelにする |
| `heterogeneous_boundary` | 施設・時点で境界が違う | 境界ごとの`N`、`m`、選択値へ層別する |
| `dependent_rows` | 反復測定を独立人数として数えた | ID・時点を復元し依存構造をmodel化する |
| `censoring_confusion` | 正確な値でなく境界値へ置換した | censoring flagと尤度へ切り替える |

人数の型、負数、募集総数の加法、screening総数の加法、選択2件未満も別codeにする。すべてを「invalid input」へ潰さない。

## 4. 区間status

表示する状態は次の3つである。

- `review_profile_and_bootstrap`: 三方式を比較するが自動採用しない
- `unresolved_profile`: profile端点未確定のため「区間なし」
- `unresolved_bootstrap`: 有効fit率不足のため「区間なし」

すべて`automaticInterval = null`である。`missing`や未解決を効果0へ変換しない。bootstrapの数値成功率100%と、中央10%における`sigma` coverage 61.25%／71.25%を別情報として表示する。

## 5. accessibility

- すべての入力に可視`label`と一意な`id`を対応づける
- 人数と観測規則を`fieldset`／`legend`でまとめる
- 入力中は警告を連発せず、利用者が「観測契約を監査」を実行した後に通知する
- 通過や再監査待ちは`role="status"`、fit停止や区間なしは`role="alert"`とする
- alertは自動消去せず、理由と修正行動を同じ場所へ残す
- mobile幅でも横スクロールが必要なのは結果表だけに限定する

根拠はW3C WAIの[form labels](https://www.w3.org/WAI/tutorials/forms/labels/)、[input validation](https://www.w3.org/WAI/tutorials/forms/validation/)、[alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)である。Reactのcontrolled inputは[公式input reference](https://react.dev/reference/react-dom/components/input)に従う。

## 6. 実装・検証境界

- 純粋な監査・status変換: `src/research/p2-selection-count-model.js`
- Julia生成JSONのversion・意味検査: `src/research/p2-selection-count-report.js`
- React preview: `src/research/p2-selection-count-preview.jsx`
- research専用CSS entry: `src/research/p2-preview.css`
- unlisted participant entry HTML: `validation/p2-likelihood/ui-preview.html`
- 専用browser config: `playwright.p2.config.js`
- browser test: `e2e-research/p2-selection-count-preview.spec.js`

教材entryの`src/index.css`はTailwind 4.1の`@source not`で`src/research/`を候補から外す。研究previewは専用CSS entryを使うため、教材側bundleへ研究用utility classを混ぜない。Viteのmulti-page inputはpreviewを別HTML・JS・CSSとして出力し、教材catalogとの実装境界を維持する。指定方法はTailwind公式の[`@source not`](https://tailwindcss.com/blog/tailwindcss-v4-1)に従う。

参加者への共有URL:

<https://ryuya-dot-com.github.io/Learning_Julia/validation/p2-likelihood/ui-preview.html>

local preview:

```bash
npm run dev
# http://127.0.0.1:5173/Learning_Julia/validation/p2-likelihood/ui-preview.html
```

検証:

```bash
npm test -- --run
npm run test:p2-ui
npm run test:p2-api
npm run build
```

`P2_SELECTION_COUNT_UI_PREVIEW_PASS`は、固定fixtureの成功・未解決・誤指定と、誤り別feedbackがChromiumで操作できたことを表す。本番同条件E2Eでは、`noindex,nofollow`、合成JSON／CSVの取得、外部origin通信0、教材catalog非掲載も検査する。`npm run build`後の`P2_PARTICIPANT_PREVIEW_BUILD_PASS`は、参加者HTMLの存在、検索・referrer境界、教材entryからの非導線、実観察記録0、合成download 2件を成果物そのものから検査する。さらに`test:p2-api`はbrowser→opt-in Vite same-origin proxy→loopback Julia server→期限付き別Julia workerを実際に往復し、HttpOnly session cookieがJavaScriptから見えないことを検査する。静的previewを共有可能にしただけであり、任意入力可能な公開APIや実データ利用を意味しない。

## 7. schema／書出し／API境界と残る公開blocker

Julia-Web schema v1と、未解決行を落とさないJSON／CSV書出しは[Result schema and output contract](RESULT_IO_SCHEMA.md)へ実装した。previewはJulia生成JSONだけを読み、version不一致、自動区間の混入、未解決端点の0埋め、method欠落を拒否する。参加者が同じ結果を確認できるよう、合成fixtureのJSON／CSVだけをproduction assetとして出力する。利用者テストの実個票・同意記録・連絡先はbuild inputに含めない。

[API boundary design](API_BOUNDARY_DESIGN.md)では、人数だけでなく43件の合成選択値を含むrequest v1、既存reportを包むresponse envelope v1、120秒timeout、同一origin限定、session／CSRF境界、版header、本文SHA-256、Manifest provenance、1 MiB上限を固定した。未構成時は合成requestが完全一致する場合だけfixtureへ切り替え、`api_not_configured`を表示する。same-origin mockに加え、`127.0.0.1`限定serverでexact合成SHAだけを別Julia workerへ渡す実経路もPlaywrightでrequest ID・SHAまで照合した。production identity、TLS、任意入力、実データ用endpointを配備した意味ではない。

[Learner usability protocol](LEARNER_USABILITY_PROTOCOL.md)では、このpreviewを実参加者へ見せる前に5つの非誘導task、teach-back rubric、formative／confirmationの2 round、個票／集約schema、録音・telemetryなしのdata境界を固定した。protocol checkは実参加者0件を明記するため、利用者テスト完了の代用品にはならない。

1. 固定済みprotocolでpractice、formative、confirmationを順に実施し、初学者が`N`、`m`、未測定、censoringを説明できるか確認する。現在の実参加者記録は0件
2. 誤りcodeと日本語文言が責める表現や曖昧な修正指示になっていないか確認する
3. request、timeout、browser境界、公開後のversion重複期間と、loopback限定のsession／CSRF、rate limit、bounded body、killable workerは検証済み。public化するならproduction identity、TLS、OS/container資源上限、監査済み非記録log、data利用目的・保持・削除を配備環境で検証する
4. Normal専用scope、package依存、配布方法を固定してからcatalog登録を判断する
