# P2 selection-count research API boundary

状態: **loopback endpoint verified / public endpoint not deployed / synthetic fixture only / research only**

## 1. なぜreport schemaだけでは足りないか

結果schema v1は、Wald・profile・bootstrapと未解決状態を保存できる。しかしnetwork経由では、さらに次を区別する必要がある。

- どのrequestに対するresponseか
- request本文が途中で変わっていないか
- どのJulia・Manifestで計算したか
- browserが要求したAPI版とreport版をserverが本当に返したか
- timeout、認証失敗、版不一致、計算失敗のどこで止まったか

この情報を既存reportへ後付けすると、ファイル保存とtransportの関心が混ざる。そのためreport v1は変更せず、request schemaとresponse envelopeを独立させる。

## 2. 三つのversioned schema

| 役割 | schema ID | version |
|---|---|---|
| 計算要求 | `learning-julia.p2.selection-count-api-request` | `1.0.0` |
| transport応答 | `learning-julia.p2.selection-count-api-response` | `1.0.0` |
| 分析結果 | `learning-julia.p2.selection-count-report` | `1.0.0` |

構造定義は[request JSON Schema](selection-count-api-request-v1.schema.json)、[response JSON Schema](selection-count-api-response-v1.schema.json)、既存の[report JSON Schema](selection-count-report-v1.schema.json)に分けた。いずれもJSON Schema Draft 2020-12で、未知fieldを黙って受け入れない。

API responseはreport bundleを一つだけ包み、次のprovenanceを追加する。

- `request_id`
- exact request bytesの`request_sha256`
- `julia_version`
- `project_environment`
- `Manifest.toml`のSHA-256
- report schema version
- UTC生成時刻

## 3. requestは人数だけでは実行できない

現行previewの入力表だけでは、実計算に必要な選択値がない。API requestは次を一緒に要求する。

- 選別前総数`N`
- 選択数`m`
- 事前に固定した有限境界
- 選択された正確な値`selected_values`
- `m == length(selected_values)`
- すべての選択値がstrict open intervalの内側であること
- 境界の事前固定、同一境界、同一集団、独立行、正確な値、範囲外確認の6仮定
- seed、bootstrap反復数・最低成功率、profile探索上限

人数だけを送って固定結果を返す実装は、実計算backendのように見えても推定に必要なdataを持たないため採用しない。研究fixtureは固定seedで生成した43件の合成値だけを含む。実データを送信可能にしたという意味ではない。

## 4. browser transport contract

想定endpointは同一originの`POST` pathである。外部origin、protocol-relative URL、query、fragmentをclient側で拒否する。実装はWHATWGの[Fetch Standard](https://fetch.spec.whatwg.org/)に沿い、`credentials: "same-origin"`、`mode: "same-origin"`、`cache: "no-store"`、`redirect: "error"`を指定する。処理中止はDOM Standardの[AbortController](https://dom.spec.whatwg.org/#interface-abortcontroller)を使う。

request header:

```text
Accept: application/vnd.learning-julia.p2.selection-count-api-response+json; version=1.0.0
Content-Type: application/vnd.learning-julia.p2.selection-count-api-request+json; version=1.0.0; charset=utf-8
X-Learning-Julia-API-Version: 1.0.0
X-Learning-Julia-Report-Version: 1.0.0
X-Request-ID: teaching-example-v1
```

responseはmedia type、二つのversion header、`X-Request-ID`、1 MiB上限を本文parse前に検査する。その後、本文SHA-256、envelope、report schema、`N`・`m`・境界のechoを照合する。HTTPの表現・status semanticsは[HTTP Semantics RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)を参照する。

既定timeoutは120秒で、1〜300秒の範囲だけを許す。selection-count bootstrapは通常の画面APIより重いため、短すぎる既定値にしない。一方、無期限待機もしない。timeoutは計算結果の`unresolved_*`ではなくtransportの`timeout`として分離する。

## 5. 認証と機密情報の境界

browser bundle、query、localStorageへBearer tokenやserver secretを置かない。将来配備する場合は、同一originのbackend-for-frontendがHttpOnly session cookieを検証し、状態変更保護が必要ならCSRF tokenを別headerで受け取る。clientは`Authorization` headerを生成するAPIを持たない。

server配備前に、さらに次を運用要件として満たす必要がある。

1. HTTPS以外で実データを受けない
2. request bodyと選択値をaccess log・error logへ書かない
3. 認証、CSRF、rate limit、最大body sizeを推定開始前に検査する
4. 計算workerのCPU・memory・実行時間を制限する
5. 保存しないことを既定とし、保存する場合は目的・保持期間・削除方法・同意を別途定める
6. 401、403、429、5xxを同じ「接続失敗」へ潰さない

このrepositoryはproductionのidentity providerや認証serverを配備していない。後述のlocal sessionは、同じloopback browserだけへ合成計算の短期capabilityを渡す仕組みであり、利用者本人を識別するproduction認証ではない。

## 6. 実動loopback server

HTTP.jl 2.0.0をP2隔離環境だけへ追加し、[HTTP.jl公式資料](https://juliaweb.github.io/HTTP.jl/stable/)と[server guide](https://juliaweb.github.io/HTTP.jl/stable/guides/server/)に沿ってlocal serverを実装した。高水準handlerへ渡る前に本文上限を保証するため、`HTTP.listen!`のstream handlerで16 KiBずつ読み、合計1 MiBを超えた時点で蓄積を止める。headerは32 KiB、read 10秒、write 10秒、idle 15秒、listen backlog 16に制限する。

公開routeではなく、`127.0.0.1`だけへbindする次のresearch routeである。`0.0.0.0`やLAN addressは起動時に拒否する。

| method | path | 役割 |
|---|---|---|
| `GET` | `/Learning_Julia/api/research/p2/health` | local scopeとversionの確認 |
| `POST` | `/Learning_Julia/api/research/p2/session` | 15分のlocal capabilityとCSRF tokenを発行 |
| `DELETE` | `/Learning_Julia/api/research/p2/session` | local sessionを破棄 |
| `POST` | `/Learning_Julia/api/research/p2/selection-count-report` | checked-in合成requestを実行 |

計算前に、exact Origin、`Sec-Fetch-Site: same-origin`、media type、API/report version、HttpOnly・SameSite=Strict cookie、CSRF token、request ID、JSON意味契約、checked-in request bytesのSHA-256、session単位の3回/60秒上限を順に検査する。serverはCORS許可headerを返さず、`Cache-Control: no-store`、`Cross-Origin-Resource-Policy: same-origin`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`を返す。local HTTPなのでcookieへ`Secure`は付けないが、production候補はHTTPSと`Secure` cookieなしでは受け入れない。

任意の入力や実データは実行しない。bodyがversioned schemaを満たしても、checked-in合成fixtureのexact SHA-256と違えば`422 synthetic_fixture_only`で停止する。request bodyや選択値は標準出力・標準errorへ記録せず、server runnerが表示するのは起動originとscopeだけである。

## 7. killable workerと過負荷境界

HTTP process内でfitを直接実行しない。1 requestにつきJulia子processを1つ起動し、mode 0700の一時directoryにmode 0600のrequest fileを置き、stdinからworkerへ渡す。workerのstderrは`devnull`、stdoutは1 MiB以下のresponse fileだけに限定し、親processがresponse schemaとrequest SHAを再検査する。一時directoryは処理後に自動削除される。

親はJulia Baseの[`timedwait`](https://docs.julialang.org/en/v1/base/parallel/)で最大120秒待ち、超過時は終了signal、その後も残ればSIGKILLを送る。同時計算は1つに固定し、別計算中は`429 server_busy`、期限超過は`504 worker_timeout`、workerの不正responseは`502`として分離する。この境界は時間・同時数・入出力sizeを制限するが、OS/container単位のCPU・memory quotaではない。production候補では別途必要である。

## 8. fallbackは入力の一致を証明できる場合だけ

serverが未構成または失敗したとき、任意入力へ固定fixtureを黙って表示してはいけない。fallbackを許す条件は次のすべてである。

1. 呼出側が`allowFixtureFallback`を明示した
2. request全体がchecked-in合成request fixtureと完全一致する
3. Julia生成response fixtureのrequest ID・SHA-256・report入力が一致する
4. UIが`source = fixture`とtransport error codeを表示する

合成fixtureと一致しない入力は停止する。これにより、API停止中に古い結果を新しい実データの結果として表示する事故を防ぐ。

## 9. version提供期間

[machine-readable version registry](p2-api-version-registry.json)では、endpointを`local_research_only`、v1を`research`、public availabilityを`available = false`、`sunset_at = null`と記録する。local検証済みとpublic提供中を同じ状態にしない。

公開配備後に後継版を出す場合は、次をgateとする。

- 後継版の提供開始後、旧版を最低180日重複提供する
- 終了日時をRFC 8594の[`Sunset` header](https://www.rfc-editor.org/rfc/rfc8594.html)とversion registryへ記録する
- 旧fixture readerとexportを重複期間中維持する
- major変更を旧version headerのまま返さない
- 利用者が旧版fixtureで本編を完了できるfallbackを残す

180日は公開後の最低重複期間であり、現在のendpoint提供を表す日付ではない。

## 10. 実装と検証

- Julia request検証・実行・response生成: `scripts/p2-selection-count-api-core.jl`
- Julia回帰検査: `scripts/p2-selection-count-api-boundary-check.jl`
- loopback HTTP server: `scripts/p2-selection-count-local-server.jl`
- one-shot worker: `scripts/p2-selection-count-api-worker.jl`
- actual HTTP回帰検査: `scripts/p2-selection-count-local-server-check.jl`
- local server runner: `scripts/run-p2-selection-count-local-server.jl`
- browser client: `src/research/p2-selection-count-api.js`
- browser単体検査: `src/research/p2-selection-count-api.test.js`
- Julia生成request/response: `fixtures/selection-count-api-v1-*.json`
- local UI E2E: `e2e-research/p2-selection-count-preview.spec.js`
- browser→proxy→server→worker E2E: `e2e-research/p2-local-api.spec.js`

```bash
julia --startup-file=no --project=validation/p2-likelihood \
  scripts/p2-selection-count-api-boundary-check.jl
julia --startup-file=no --project=validation/p2-likelihood \
  scripts/p2-selection-count-local-server-check.jl
npm test -- --run
npm run test:p2-ui
npm run test:p2-api
```

API coreはJulia 32検査で、正常実行、request/response往復、本文SHA、Manifest provenance、境界外値、人数不一致、未確認仮定、計算上限、改変responseを確認する。loopback serverは55検査で、実worker、強制timeout、Origin、Fetch Metadata header必須、session、CSRF、version、SHA限定、rate limit、session削除、1 MiB超過、同時計算、504変換を通す。JavaScript側はsession発行、成功、timeout、cancel、401、403、406、426、429、5xx、media type、版header、size、SHA、入力echo、fallback条件を分離する。Playwrightはmock/fallbackに加え、browser→Vite same-origin proxy→Julia server→別Julia workerの実往復を通し、session cookieがJavaScriptから見えないことも確認する。

`P2_SELECTION_COUNT_API_BOUNDARY_CHECK_PASS`はtransport契約とJulia実行core、`P2_SELECTION_COUNT_LOCAL_SERVER_CHECK_PASS`はloopback HTTPの防御・実行境界が既知の合成requestで一致した意味である。public endpoint、production identity、TLS終端、OS単位のCPU・memory quota、実データ送信・保持、監査済み運用log、監視、SLAが完成した意味ではない。
