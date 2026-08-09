# P2 selection-count result schema and output contract

状態: research contract v1 / production未登録

## 1. なぜ結果形式にも契約が必要か

推定値だけを書き出すと、`search_limit`でprofile区間が求まらなかったのか、単に行を保存し忘れたのかを後から区別できない。また、bootstrap fit成功率100%は95%区間coverage 95%を意味しない。そこでJuliaの計算結果とWeb表示の間に、`learning-julia.p2.selection-count-report` version `1.0.0`を置く。

この契約では次を禁止する。

- 未解決区間を`[0, 0]`へ置き換える
- 未解決methodまたはparameterの行をCSVから落とす
- Wald、profile、bootstrapのどれかを`automatic_interval`へ自動記入する
- fit時の`total_screened`とbootstrap再生成時の`total_screened`を同じ欄へ潰す
- 既存の同名成果物を黙って上書きする
- versionの違うJSONをWeb側で推測して読む

## 2. versionとmodel scope

schema IDは`learning-julia.p2.selection-count-report`、versionは`1.0.0`である。v1 readerはID・versionの完全一致を要求する。将来、必須fieldの削除・改名、statusの意味変更、nullの意味変更を行う場合はmajor versionを上げ、旧readerへ黙って渡さない。

`model_scope.family = "Normal"`、`selection_rule = "strict_open_interval"`を必須にする。別familyや閉区間を同じversionへ混ぜない。`automatic_interval_selection`は常に`false`である。

構造定義は[JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/draft-bhutton-json-schema-00)の[selection-count-report-v1.schema.json](selection-count-report-v1.schema.json)に置く。JuliaとJavaScriptのreaderはさらに、report statusとmethod status、bootstrap成功数と成功率、未解決端点のnullを相互検査する。JSON Schemaだけ通れば分析上妥当、という意味ではない。

## 3. JSONとCSVの役割

JSONは一つのreportを階層のまま保存する。

```text
bundle
└─ reports[]
   ├─ input_contract
   ├─ methods[]
   │  └─ intervals[mu, sigma]
   └─ messages[]
```

CSVは1行を`report × method × parameter`とするlong形式である。fixtureは3 report × 3 method × 2 parameter = 18行になる。列にはschema ID/version、入力境界、fit時のN・m、method status、区間端点、bootstrap再生成N・反復数・成功数・成功率・最低成功率、message codeを含める。

| 状態 | JSON端点 | CSV端点 | 行を残すか |
|---|---|---|---|
| `ok` | 有限数 | 有限数 | 残す |
| `search_limit`等 | `null` | `NA` | 残す |
| `insufficient_success` | `null` | `NA` | 残す |

JSON3の公式APIでは`JSON3.read`／`JSON3.write`がJSONの`null`をJuliaの`nothing`へ対応づける。[JSON3.jl公式資料](https://quinnj.github.io/JSON3.jl/dev/)に従い、ファイルを読み戻してから独自の意味検査を行う。CSVは[CSV.jl公式writing API](https://csv.juliadata.org/dev/writing.html)の`CSV.write`と、[reading API](https://csv.juliadata.org/stable/reading.html)の`missingstring="NA"`、`strict=true`を組み合わせる。

## 4. provenanceを失わない

通常のfixtureはfit時もbootstrap再生成時もN=400である。bootstrap未解決の意図的失敗fixtureでは、fit時のN=400に対して再生成Nを10へ縮小している。v1はこれを次の別fieldへ保存する。

- `input_contract.total_screened = 400`
- `methods[bootstrap].diagnostics.total_screened = 10`

両者を一つのNへ潰すと「同じdesignで成功率が28/99だった」という誤読を生む。Web previewも差があるときはalertで表示する。

## 5. 実装とround trip

- Julia変換・検査・書出し: `scripts/p2-selection-count-report-io.jl`
- Julia回帰検査: `scripts/p2-selection-count-report-io-check.jl`
- JSON Schema: `selection-count-report-v1.schema.json`
- Julia生成fixture: `fixtures/selection-count-report-v1.json`と`.csv`
- JavaScript検査・変換: `src/research/p2-selection-count-report.js`

実行:

```bash
julia --startup-file=no --project=validation/p2-likelihood \
  scripts/p2-selection-count-report-io-check.jl
```

検査は一時directoryへJSONとCSVを書き、別の読込で次を照合する。

1. schema ID/versionとNormal専用scope
2. 3 report、JSON 3件、CSV 18行
3. 各reportにWald・profile・bootstrap、各methodにmu・sigmaが一度ずつあること
4. 未解決4行が残り、端点が`NA`であること
5. `automatic_interval`が全行で`NA`であること
6. bootstrap再生成N=10がfit時N=400と別に残ること
7. JSON/CSVのSHA-256が計算できること
8. 同名成果物の再書込みを拒否すること

`P2_SELECTION_COUNT_REPORT_IO_CHECK_PASS`はJulia→JSON/CSV→Julia、およびJulia生成JSON→JavaScriptの既知v1契約を通った意味である。network固有のrequest ID、本文SHA、engine provenanceはreportへ混ぜず、後続の[API boundary](API_BOUNDARY_DESIGN.md)のresponse envelopeへ分離した。server APIの安定提供、別family対応、公開レッスン昇格を意味しない。
