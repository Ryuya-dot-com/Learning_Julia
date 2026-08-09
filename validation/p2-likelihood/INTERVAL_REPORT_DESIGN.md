# P2 selection-count interval report gate

作成日: 2026-08-09
状態: research design / 公開教材ではない

## 1. 学習上の問題

selection-count likelihoodでは、人数情報を加えると点推定は安定したが、中央10%選択の`mu`に対するWald 95%区間coverageは38.75%〜50.00%だった。profile likelihoodは93.75%〜95.00%へ改善したものの、別の弱識別条件では`search_limit`や事前screeningによる未解決が残った。

単一の区間だけを返すと、学習者は次を区別できない。

- Hessian近傍だけを見るWald区間
- 尤度の曲がりを追うprofile区間
- fit済みmodelから観測過程全体を再生成するparametric bootstrap区間
- 計算が終わらず、区間を報告できない状態

次のgateは、三方式を同じ結果オブジェクトへ並べ、未解決状態と計算診断を区間の一部として返す。

## 2. bootstrapで再生成する単位

選択後の`m`行だけを再標本化しない。fit済みNormalから選別前`N`件を生成し、固定された`lower < X < upper`をもう一度適用し、選択数と選択値を同時に変動させて再fitする。

```text
fit済み潜在Normal
  → 選別前N件を生成
  → 同じ境界でscreening
  → 新しいm件の選択値
  → selection-count fit
```

これはparametric bootstrapであり、Normal family、境界、総数が正しいという仮定を再利用する。前のmodel misspecification gateで示したfamily・metadata誤指定を修復する方法ではない。

## 3. API契約

`parametric_bootstrap_selection_count_intervals`は次を返す。

- `status`: `ok`または`insufficient_success`
- percentile 95%区間
- 反復数、成功数、成功率、失敗型
- bootstrapごとの選択数の平均・最小・最大
- 確率分解能と片側tailへ期待されるdraw数

反復数は99以上とし、公開候補APIの既定は999とする。CIのcoverage pilotだけは計算時間を抑えるため199反復を明示し、最終解析の推奨反復数とは扱わない。

`selection_count_interval_report`はWald、profile、bootstrapを一つにまとめる。profileが`search_limit`なら`unresolved_profile`、bootstrap成功率が閾値未満なら`unresolved_bootstrap`とする。両方計算できても`automatic_interval = nothing`を維持し、自動選択によって仮定差を隠さない。

## 4. 公式仕様と再現性

- Distributions.jlの単変量分布interfaceは、明示RNGを第1引数に取る`rand(rng, d, n)`、`quantile`、`cdf`などを提供する。
- Julia標準`Random`は`Xoshiro`と明示RNGを提供する一方、version更新で具体的な乱数列が変わり得るため、unit testでは特定列ではなく統計的性質を検証するよう注意している。
- percentile端点はJuliaの`Statistics.quantile`を使う。

公式資料:

- https://juliastats.org/Distributions.jl/stable/univariate/
- https://docs.julialang.org/en/v1/stdlib/Random/
- https://docs.julialang.org/en/v1/stdlib/Statistics/

## 5. coverage holdout

真値`Normal(37, 1.7)`、各80 outer反復、bootstrap 199反復で次を比較する。設計確認に使ったseedとCIへ固定するholdout seedは分離する。

| design | 選別前N | 期待選択数 | 主な比較 |
|---|---:|---:|---|
| 中央10% | 400 | 40 | Waldの過小coverageと非線形区間 |
| 中央10% | 1,200 | 120 | 標本増加後の校正 |
| 非対称50% | 80 | 40 | 比較的安定な基準条件 |

CIは個々の乱数値やcoverage件数の完全一致を要求しない。全fitと区間計算が解決し、bootstrap成功率99%以上、profileとbootstrapの`mu` coverageが広い許容域に入り、中央10%で両者がWaldを明確に上回ることを契約にする。

### holdout結果

| design | Wald coverage（mu / sigma） | profile coverage（mu / sigma） | bootstrap coverage（mu / sigma） |
|---|---:|---:|---:|
| 中央10%、期待選択40 | 41.25% / 88.75% | 97.50% / 92.50% | 98.75% / 67.50% |
| 中央10%、期待選択120 | 46.25% / 91.25% | 93.75% / 92.50% | 92.50% / 77.50% |
| 非対称50%、期待選択40 | 92.50% / 95.00% | 98.75% / 97.50% | 97.50% / 93.75% |

bootstrap成功率は全条件100%だった。中央10%の`mu`はprofileとbootstrapの両方がWaldより改善したが、bootstrapの`sigma`は67.50%・77.50%に留まった。このholdout後に個々の件数へ閾値を合わせず、中央強選択でbootstrap scale undercoverageが55%〜85%の広い範囲に残ること、非対称50%では85%以上へ戻ることをCI契約にした。

この結果は、optimizer成功率と区間coverageが別であること、単純percentile bootstrapをprofileの自動fallbackにできないことを支持する。発見に使ったseedへ判定を後付けしないよう、上の広い範囲を固定した後、未使用の別seed matrixをCI confirmationとして実行する。

### 別seed confirmation

| design | Wald coverage（mu / sigma） | profile coverage（mu / sigma） | bootstrap coverage（mu / sigma） |
|---|---:|---:|---:|
| 中央10%、期待選択40 | 42.50% / 86.25% | 95.00% / 93.75% | 93.75% / 61.25% |
| 中央10%、期待選択120 | 43.75% / 85.00% | 93.75% / 91.25% | 91.25% / 71.25% |
| 非対称50%、期待選択40 | 91.25% / 96.25% | 96.25% / 96.25% | 93.75% / 95.00% |

未使用seedでも、中央10%のbootstrap `sigma` undercoverageと、非対称50%での回復が再現した。CIはこのconfirmation matrixを実行する。

## 6. 公開判断

このgateが通っても、bootstrapはNormal modelが正しいという仮定の下での比較に限る。結果statusの日本語feedback、観測契約の入力例、Notebook課題は[research-only Pluto Notebook](selection-count-teaching-notebook.jl)へ実装し、同じ状態を[参加者向けWeb UI preview](WEB_UI_PREVIEW_DESIGN.md)の入力表・区間表・誤答別feedbackへ移した。Julia-Web schemaと未解決行を保持するJSON／CSVは[Result schema and output contract](RESULT_IO_SCHEMA.md)へ実装した。次の公開教材への昇格条件は利用者テスト、Normal専用scope、自動選択なし、配布境界を維持することである。`PASS`は「bootstrapが常に正しい」ではなく、三方式の役割と未解決状態を同じ形で再現できたことを表す。
