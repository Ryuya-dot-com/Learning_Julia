# P2 likelihood feasibility environment

Status: **research only / unlisted participant preview public / not a public lesson API**

P1で区別したcensoringとtruncationを、未知parameterの尤度へ進められるか評価する隔離環境です。本編、公開Notebook、`validation/`本体の依存は変更しません。

初心者向けの説明順序と理解確認は、研究用の[selection-count教材ドラフト](SELECTION_COUNT_TEACHING_DRAFT.md)に分離しました。これは公開レッスンではなく、観測契約と追加stressが揃うまでcatalogへ登録しません。

## 採用した最小経路

- `Distributions.jl`: `logpdf`、`logcdf`、`logccdf`と両側選択確率
- `Optim.jl`: 現行の`ADTypes.AutoForwardDiff()`を使うBFGS最適化
- `ForwardDiff.jl`: observed HessianとWald区間
- `ADTypes.jl`: Optim 2.xの自動微分backend指定

公式資料:

- https://juliastats.org/Distributions.jl/stable/censored/
- https://juliastats.org/Distributions.jl/stable/truncate/
- https://juliastats.org/Distributions.jl/latest/univariate/
- https://julianlsolvers.github.io/Optim.jl/stable/examples/generated/maxlikenlm/
- https://julianlsolvers.github.io/Optim.jl/latest/user/gradientsandhessians/
- https://julianlsolvers.github.io/Optim.jl/stable/user/config/
- https://julianlsolvers.github.io/Optim.jl/v1.10/user/minimization/
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.CensoredData.html
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.truncate.html
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.minimize.html

Turing.jlの`@addlogprob!`でも任意尤度は表現できますが、prior、MCMC、収束診断、事後予測まで責任範囲が広がります。最初の頻度論的parameter回復試験には採用せず、Bayes版を検討するときの別候補として保留します。

## 2026-08-09 feasibility result

真のNormal parameterを`mu = 520`、`sigma = 85`とし、左右打切りと左truncationを各240反復、各220観測で検証しました。

| 観測過程 | mean(mu_hat) | mean(sigma_hat) | 95% coverage: mu | 95% coverage: sigma |
|---|---:|---:|---:|---:|
| 左右打切り | 519.662 | 84.635 | 0.95 | 0.95 |
| 左truncation | 520.038 | 84.844 | 0.95 | 0.95 |

`scripts/p2-likelihood-check.jl`は、次も検証します。

- clamp後のnaive fitより観測尤度の誤差が小さい
- `logcdf`／`logccdf`は40 SDの裾でも有限
- 両側truncationの選択確率が公式切断分布の尤度と一致し、勾配とHessianも有限
- flag長、左右同時flag、境界値不一致、通常観測不足、無変動開始値を拒否
- fit後の観測過程へ戻したreplicate dataが平均、SD、左右境界率を再現
- P2のscopeは公開APIではなくfeasibilityに限定

実行:

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-likelihood-check.jl
```

## 2026-08-09 stress boundary

`scripts/p2-likelihood-contracts.jl`へ検証実装を分離し、標本数40・120・400と、20%・60%・90%の打切り／切断を組み合わせた18条件を各160反復（計2,880試行）で測定しました。truncationの標本数は、選択後に観測できた件数です。加えて4つの固定dataに5種類ずつの`[mu, log_sigma]`開始値を与えました。

代表的な境界は次の通りです。`bounded recovery`は合成真値を使ったstress専用診断で、`|mu_hat - mu| > 5sigma`、`sigma_hat > 5sigma`、`sigma_hat < sigma/5`のいずれかを破局的逸脱として除いた試行率です。実dataへそのまま使う品質判定ではありません。

| 観測過程 | 解析n（truncationは選択後） | 打切り／切断率 | Optim受理 | 破局的逸脱 | bounded recovery | 試行全体で真値を含む95%区間（mu / sigma） |
|---|---:|---:|---:|---:|---:|---:|
| 左右打切り | 400 | 20% | 100% | 0/160 | 100% | 95.00% / 97.50% |
| 左右打切り | 40 | 90% | 93.12% | 0/160 | 93.12% | 93.12% / 91.88% |
| 左truncation | 400 | 20% | 100% | 0/160 | 100% | 96.25% / 95.62% |
| 左truncation | 40 | 90% | 98.12% | 23/160 | 83.75% | 76.25% / 80.62% |

- 40件・90%打切りの11失敗は、通常観測が2件未満となり入力契約が停止させたものです。
- 40件・90%左truncationでは、最適化が受理した157試行にも23件の破局的逸脱がありました。収束flagと正定値Hessianだけでは弱い識別を検出できません。
- 4条件とも5開始値は同じ停留点へ到達しました。開始値への局所的な頑健性は、parameter回復の十分条件ではありません。
- Wald coverageは成功fitだけに条件づけた値に加え、失敗を区間なしとして数える試行全体の値を記録します。

実行:

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-likelihood-stress-check.jl
```

## 2026-08-09 data-only identification gate

真値を使う`bounded recovery`は合成dataの検証にしか使えません。そこで実dataでも計算できる次のscale-free量を`scripts/p2-likelihood-contracts.jl`へ追加しました。

- fitted sigmaで標準化したcovarianceの条件数
- `mu`と`log_sigma`のcovariance相関
- `SE(mu) / fitted sigma`と`SE(log_sigma)`
- fitted distributionが含意するtruncation選択確率

research用warning閾値は、条件数10,000、相関の絶対値0.995、相対SE 5、`SE(log_sigma)` 0.75、選択確率1%です。これは普遍的な合否基準ではなく、追加のprofile診断を要求するscreeningです。単位を変換した同じdataで診断量が不変になることも検証しています。

閾値決定用とはseedを分けたholdout 9条件・各160反復では、Optimが受理した1,436試行中55件が合成真値から破局的に逸脱し、data-only warningは55件すべてを検出しました。20%切断条件のwarningは1/480で、その1件も破局的逸脱でした。90%切断では93/480を警告しており、警告は「推定が誤り」という断定ではなく「通常のWald報告へ進まない」という停止信号です。

上記の件数はJulia 1.12.5で記録した再現結果です。尤度境界に近い最適化の受理判定はJuliaのpatch release間で数件変わり得るため、CIは件数の完全一致ではなく、難条件の破局的逸脱率が2〜8%に留まること、発生した破局的逸脱をwarningがすべて捕捉すること、安定条件のwarning率が1%以下であることを検証します。これにより、研究上の安全契約を保ったまま数値環境の微小差を許容します。

## 2026-08-09 profile likelihood pilot

Optim公式の有界1変数最適化`Brent()`でnuisance parameterをprofileし、`Chisq(1)`のlikelihood-ratio cutoffから95%区間を探索するresearch実装を追加しました。geometry warningがあるfitはprofileを開始せず、探索範囲内で端点を見つけられない場合は`search_limit`として残します。

6条件・各80反復（480試行）の代表結果です。coverageは`profile_ok`になった試行だけに条件づけたpilot値であり、warning・fit失敗・`search_limit`を除外した全体性能ではありません。

| 観測過程 | n | 打切り／切断率 | profile_ok | geometry warning | search_limit | Wald coverage（mu / sigma） | profile coverage（mu / sigma） |
|---|---:|---:|---:|---:|---:|---:|---:|
| 左右打切り | 40 | 20% | 80/80 | 0 | 0 | 95.00% / 93.75% | 95.00% / 95.00% |
| 左truncation | 120 | 20% | 80/80 | 0 | 0 | 95.00% / 96.25% | 96.25% / 95.00% |
| 左truncation | 40 | 90% | 11/80 | 30 | 36 | 0.00% / 18.18% | 81.82% / 81.82% |
| 左truncation | 120 | 90% | 39/80 | 17 | 24 | 61.54% / 74.36% | 97.44% / 97.44% |
| 左truncation | 400 | 90% | 73/80 | 7 | 0 | 91.78% / 91.78% | 97.26% / 97.26% |

高切断ではprofile区間が解けた試行のcoverageはWaldより改善しましたが、40件では69/80がfit失敗・warning・`search_limit`となりました。区間法だけでは弱識別を解決できないため、診断と未解決状態を結果の一部として保持します。

実行:

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-identification-profile-check.jl
```

## 2026-08-09 external generalization and independent engine

閾値調整に使っていない別seedで、真値`Normal(-2, 0.35)`と`Normal(1200, 250)`、解析n=40・120、片側の80%・50%・10%保持と両側中央50%・10%保持を組み合わせた20条件を各120反復（計2,400試行）で外部検証しました。

| 範囲 | 試行 | fit失敗 | 破局的逸脱 | warningが検出 | warning見逃し |
|---|---:|---:|---:|---:|---:|
| 左80%保持（安定基準） | 480 | 0 | 0 | 0 | 0 |
| 片側全体 | 1,440 | 6 | 62 | 62 | 0 |
| 両側全体 | 960 | 116 | 396 | 253 | 143 |

現行のdata-only warningは、大きく異なるlocation・scaleでも片側truncationの破局的逸脱62件をすべて検出しました。しかし両側truncationでは、fitが受理された844試行のうち396件が破局的で、143件を見逃しました。したがって、片側の結果を両側へ外挿せず、両側は明示的な公開blockerとします。

表の集計値はJulia 1.12.5で記録した結果です。CIでは、片側の破局的逸脱率3〜6%かつ全件捕捉、両側のfit失敗率10〜15%、受理fit中の破局的逸脱率40〜55%、その未捕捉率30〜45%を契約とします。件数が数件変わっても、片側で成立した診断を両側へ外挿できないという公開blockerを検証し続けます。

独立engine照合は、SciPy公式の`CensoredData + norm.fit`を2データ、`truncate + optimize.minimize(method="Nelder-Mead")`を片側2・両側1データに使いました。Julia BFGSとSciPy Nelder–Meadの負の対数尤度差は5比較の最大2.1×10⁻⁶、推定parameter差は真のsigmaの10⁻⁴未満でした。これは尤度実装の独立一致を支持しますが、両側の識別問題は解決しません。`P2_GENERALIZATION_ENGINE_CHECK_PASS`はこの成功と失敗の境界を再現できたことを表し、公開昇格を意味しません。

両側選択確率は、裾の位置に応じて`logcdf`・`logccdf`・`log1p`を切り替えます。これにより、`logdiffcdf`で見つかった二階ForwardDiffの型曖昧性を回避し、関数値だけでなくHessianまで検証します。

実行:

```bash
python -m pip install -r validation/p2-scipy/requirements.txt
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-generalization-engine-check.jl
```

## 2026-08-09 two-sided global profile screen

局所Hessianが正則でも広い母分布がほぼ同じ尤度を持つ場合を止めるため、有限区間幅の1・2・4倍のsource sigmaを事前固定し、それぞれでlocationをprofileする診断を追加しました。最も尤度が近い広域解が`Chisq(1)`の95%尤度比域内に残るとき、`wide_scale_profile_compatible`として停止します。係数とcutoffはholdoutを見る前に固定しました。

| matrix | 難条件試行 | fit失敗 | 破局的逸脱 | 局所診断の検出 | 広域profile併用の検出 | 未検出 | 安定条件 |
|---|---:|---:|---:|---:|---:|---:|---:|
| calibration | 1,920 | 160 | 490 | 356 | 484 | 6 | 480試行でwarning 0 |
| 完全未使用holdout | 1,920 | 192 | 446 | 307 | 436 | 10 | 480試行でwarning 0 |

異なる母数とseedのholdoutで、破局的逸脱の検出は307/446から436/446（97.8%）へ改善し、中央99%保持の安定条件480試行で誤warning 0でした。一方、難条件では破局的逸脱に該当しないfitも1,010件停止しました。これらを直ちに誤warningとは呼びません。広いsource scaleが95%尤度比域に残るため、通常の狭いWald報告へ進めないという意味です。

この表もJulia 1.12.5の再現記録です。CIは難条件1,920試行という設計を固定し、破局的逸脱率20〜30%、広域profile併用による検出改善、95%超の破綻捕捉、なお未検出が残ること、安定条件でfit失敗・破綻・warningが0であることを検証します。

残る10件は、選択後dataが「母分布自体が境界内に狭く集中していた」という解を95%尤度比で支持したケースです。選択後の値だけから、この解と「広い母分布のまれな選択標本」を常に区別することはできません。100%検出に合わせてcutoffを後付けせず、次は選別前総数・選択数または事前に既知の保持率をdesign metadataとして尤度へ入れる経路を比較します。

`P2_TWO_SIDED_IDENTIFICATION_CHECK_PASS`は、安定条件、感度改善、残存限界の3つが固定seedで再現したことを表し、公開昇格を意味しません。

実行:

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-two-sided-identification-check.jl
```

## 2026-08-09 selection-count likelihood

選択後の値だけでは区別できなかった「境界内に狭く集中した母分布」と「広い母分布からのまれな選択」を、選別前総数`N`と選択数`m`をdesign metadataとして加えて比較しました。Distributions.jl公式の切断密度`f(x) / p`とBinomialの確率質量を掛けると、parameterに依存しない組合せ項を除くselection-count likelihoodは次になります。

式を直感、100人中10人の手計算、固定seedのJulia例、誤解例、用語集、ヒント付き問題へ展開した版は[研究用教材ドラフト](SELECTION_COUNT_TEACHING_DRAFT.md)にあります。

```text
sum(log f(x_selected)) + (N - m) * log(1 - p)
```

ここで`p = P(lower < X < upper)`です。`p^m`は条件付き切断密度の`p^-m`と相殺されます。実装は有限な上下境界、整数の`N >= m`、境界内の有限値2件以上を入力契約とし、`p`が1に近い場合も`log1p`／`expm1`で補確率を計算します。

選択後目標件数40・120、中央50%・中央10%・非対称50%、各2母数・各120反復の校正matrixと完全未使用holdoutを合わせ、2,880試行を比較しました。

| matrix | 条件付きfit失敗 | 条件付き破局的逸脱 | count fit失敗 | count破局的逸脱 | count Wald coverage（mu / sigma） |
|---|---:|---:|---:|---:|---:|
| calibration | 174 | 463 | 0 | 0 | 73.96% / 92.92% |
| holdout | 193 | 446 | 0 | 0 | 73.54% / 91.25% |

人数情報は点推定の破局的逸脱を463件・446件からともに0へ減らしました。しかし局所HessianのWald区間は、とくに対称な中央10%選択で`mu`の不確かさを大幅に過小評価しました。点推定の回復だけを根拠に公開昇格させません。

表の集計値はJulia 1.12.5で記録した結果です。CIでは、人数を捨てた条件付き尤度のfit失敗率10〜15%・破局的逸脱率28〜35%を反例として再現し、selection-count likelihoodのfit失敗と破局的逸脱がともに0であることを検証します。境界付近のoptimizer acceptanceが数件変わっても、「人数情報で点推定は回復するがWald区間だけでは不十分」という教材上の結論を維持します。

そこで校正・holdoutの中央10%（目標40・120件）と非対称50%（目標40件）を各80反復profileしました。全480試行でprofile_okとなり、fit失敗、`search_limit`、profile例外はいずれも0でした。

| matrix / design | 目標選択数 | Wald coverage（mu / sigma） | profile coverage（mu / sigma） |
|---|---:|---:|---:|
| calibration / 中央10% | 40 | 38.75% / 86.25% | 93.75% / 91.25% |
| calibration / 中央10% | 120 | 50.00% / 92.50% | 93.75% / 91.25% |
| calibration / 非対称50% | 40 | 93.75% / 95.00% | 95.00% / 97.50% |
| holdout / 中央10% | 40 | 45.00% / 88.75% | 95.00% / 93.75% |
| holdout / 中央10% | 120 | 48.75% / 92.50% | 93.75% / 92.50% |
| holdout / 非対称50% | 40 | 85.00% / 92.50% | 92.50% / 95.00% |

中央10%でWaldの`mu` coverageは38.75%〜50.00%でしたが、profileでは93.75%〜95.00%へ回復しました。これは、正しい選別人数情報が両側truncationの同定に有効であることと、対称で強い選択では通常のWald近似が依然不適切であることを同時に示します。`P2_SELECTION_COUNT_CHECK_PASS`は「人数情報＋profile」という経路とWaldの失敗境界を再現した意味であり、一般的な公開APIの完成を意味しません。

実行:

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-check.jl
```

## 2026-08-09 model misspecification robustness gate

selection-count likelihoodの式が正しくても、潜在分布family、選別境界、選別前総数という入力契約が誤っていれば、推定対象そのものが変わります。そこで中央10%選択、選別前4,000件、各80反復の未使用seed holdoutで、Normal専用fitの失敗境界を分離しました。設計と事前に固定した判定範囲は[研究設計](ROBUSTNESS_GATE_DESIGN.md)に記録しています。以下はJulia 1.12.6で再現した結果です。

### 潜在分布family

| 真の潜在分布 | fit失敗 | fitted選択率と観測率の平均差 | 未観測領域の反例 |
|---|---:|---:|---|
| `LogNormal(0, 0.8)` | 0/80 | 0.0000 | 負値への平均確率15.56%、fitted 95%分位点／真値 = 0.4706 |
| `TDist(3)` | 0/80 | 0.0000 | fitted 99%分位点／真値 = 0.5207 |

4桁丸めで選択率の差が0でも、supportと裾の予測は大きく外れました。収束flag、正定値Hessian、選択数の再現だけでは、Normal familyの妥当性を検証できません。

### 境界・人数metadata

真値`Normal(37, 1.7)`の同じ選択dataを、正しいmetadataと誤ったmetadataでpaired fitしました。

| 記録条件 | 正しいmetadataの推定scaleに対する平均比 |
|---|---:|
| 境界幅を2倍に誤記録 | 1.9745 |
| 選別前総数を20%少なく記録 | 0.8288 |
| 選別前総数を20%多く記録 | 1.1589 |

観測値より狭い誤境界と`N < m`は入力検査で停止しました。一方、全観測値を含む広すぎる境界や、`N >= m`のもっともらしい人数誤差は自動検出できず、fitは全条件0失敗でした。したがって、境界と人数を原記録から監査し、誤差が疑われる場合は複数値による感度分析を必須とします。

この結果により「Normal以外・境界誤指定・人数記録誤差のstressを追加する」という作業項目は完了しましたが、公開blockerは解消しませんでした。むしろ、Normal専用scope、support／tail予測診断、metadata感度を公開APIと教材へどう表すかが次の設計課題です。`P2_SELECTION_COUNT_ROBUSTNESS_CHECK_PASS`は既知の誤指定が見えることを表し、方法が誤指定へ頑健であることを意味しません。

実行:

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-robustness-check.jl
```

## 2026-08-09 profile and parametric bootstrap interval report

Waldを既定にせず、profileの未解決状態とparametric bootstrapの計算状態を同じ結果へ残すresearch APIを追加しました。設計は[interval report gate](INTERVAL_REPORT_DESIGN.md)に分離しています。

`parametric_bootstrap_selection_count_intervals`は、選択後の行だけを再標本化しません。fit済みNormalから選別前`N`件を生成し、同じ境界でscreeningし、新しい選択数と選択値を一緒に再fitします。反復数、成功数、失敗型、選択数範囲、確率分解能も返し、成功率90%未満なら区間を`missing`にして`insufficient_success`とします。既定999反復に対し、次のCI pilotは計算時間を抑えるため199反復を明示しています。

`selection_count_interval_report`はWald・profile・bootstrapを並べ、`profile_interval_unresolved`や`bootstrap_success_rate_too_low`をmessage codeとして保持します。両方計算できても`automatic_interval = nothing`であり、方法を自動選択しません。

真値`Normal(37, 1.7)`、各80 outer反復のholdout結果です。

| design | Wald coverage（mu / sigma） | profile coverage（mu / sigma） | bootstrap coverage（mu / sigma） | bootstrap成功率 |
|---|---:|---:|---:|---:|
| 中央10%、期待選択40 | 42.50% / 86.25% | 95.00% / 93.75% | 93.75% / 61.25% | 100% |
| 中央10%、期待選択120 | 43.75% / 85.00% | 93.75% / 91.25% | 91.25% / 71.25% | 100% |
| 非対称50%、期待選択40 | 91.25% / 96.25% | 96.25% / 96.25% | 93.75% / 95.00% | 100% |

中央10%ではprofileとbootstrapの`mu`区間がWaldより大きく改善しました。しかし、単純なpercentile bootstrapの`sigma` coverageは61.25%・71.25%に留まりました。bootstrap fitが全件成功しても区間校正が保証されない反例です。したがって、bootstrapをprofileの自動fallbackにはせず、scaleについては引き続きprofileを含む反復coverageで評価します。

400人から43人を選ぶ教材例では、499反復bootstrapの`mu`区間35.864〜38.039、`sigma`区間0.421〜1.721となり、この1試行では真値37・1.7を含みました。一方、同じfitから選別前10人だけを再生成する意図的失敗例では、有効fitの成功率が90%を下回り、区間を返さず`insufficient_success`にしました。1試行の成功と方法全体のcoverage、計算成功と区間校正を分けます。

`P2_SELECTION_COUNT_INTERVAL_CHECK_PASS`は、三方式の役割、中央10%でのbootstrap scale未校正、未解決statusが再現できたことを表します。bootstrapが常にprofileを代替できるという意味ではありません。

実行:

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-interval-check.jl
```

## Research Pluto notebook

[selection-count teaching notebook](selection-count-teaching-notebook.jl)は、公開前の日本語UI表現を31セルで試すresearch-only Notebookです。通常の公開Notebook環境へP2依存を追加せず、このdirectoryの共有Project／Manifestを明示的にactivateします。これはPluto公式の[共有環境パターン](https://plutojl.org/en/docs/packages-advanced/)に沿ったrepository内研究Notebookであり、単独配布用Notebookではありません。Plutoは依存関係からセルを再計算するため、観測契約の入力を変更するとfit以降も更新されます（[reactivity公式資料](https://plutojl.org/en/docs/reactivity/)）。

Notebookでは次を一つの固定seed経路へ接続しました。

1. 募集総数、screening総数、選択数、範囲外人数、未測定人数を分離し、誤りを`missingness_confusion`、`boundary_posthoc`、`heterogeneous_boundary`、`dependent_rows`、`censoring_confusion`へ分類する
2. 同じ43件で選択後だけのfitとselection-count fitを比較する
3. Wald・profile・199反復bootstrapを並べ、`automatic_interval = nothing`を日本語で表示する
4. `insufficient_success`と`search_limit`を「区間なし」として保持する
5. LogNormal dataへNormal専用fitを誤用し、選択率一致とsupport／tail破綻を同時に表示する

Notebookは有効なJulia `.jl` fileでもあるため、通常実行とPluto本体の両方で検証します。Pluto検証はProject、Manifest、契約module、Notebookだけを一時directoryへコピーし、31セル、error 0、実行時markerを確認します。

```bash
julia --startup-file=no --project=validation/p2-likelihood \
  validation/p2-likelihood/selection-count-teaching-notebook.jl
julia --startup-file=no --project=validation \
  scripts/p2-selection-count-notebook-exec.jl
```

`P2_SELECTION_COUNT_NOTEBOOK_EXEC_PASS`は、教材の成功例だけでなく、未解決statusとfamily誤指定の停止理由までPlutoの反応実行で再現できたことを表します。公開catalogへの登録や実データ利用許可を意味しません。

## Research Web UI preview

[Web UI preview design](WEB_UI_PREVIEW_DESIGN.md)に従い、Notebookの観測契約、結果status、誤指定反例、誤答別feedbackをReact previewへ移しました。HTMLは`validation/p2-likelihood/ui-preview.html`、実装は`src/research/`に置き、`src/main.jsx`と公開lesson catalogからは参照しません。参加者へ同じ検証済みartifactを共有するため、Viteの独立したproduction entryとしてGitHub Pagesへ出力します。`noindex,nofollow`で検索非掲載とし、公開アプリからの導線も置きません。

参加者への共有URL:

<https://ryuya-dot-com.github.io/Learning_Julia/validation/p2-likelihood/ui-preview.html>

```bash
npm run dev
# http://127.0.0.1:5173/Learning_Julia/validation/p2-likelihood/ui-preview.html
```

previewはbrowserで推定を実行しません。任意入力は観測契約だけを監査し、Julia 1.12.6で検証したN=400・m=43のfixtureと一致するときだけ、人数なし／ありfitと区間表を表示します。別入力に固定結果を流用しないため、実計算backendへ接続したような誤解を避けます。

誤りはNotebookと同じ`missingness_confusion`、`boundary_posthoc`、`heterogeneous_boundary`、`dependent_rows`、`censoring_confusion`へ分類します。各誤答にもcode、理由、次の行動を持たせました。正常な監査は`role="status"`、fit停止や区間なしは`role="alert"`とし、入力変更中はalertを連発せず明示的な再監査後に通知します。

```bash
npm test -- --run
npm run test:p2-ui
```

専用Playwrightはdesktop操作、same-origin API応答、mobile幅の3件で、入力label、fieldset、停止理由、fit表の表示境界、profile未解決、API未配備fallback、request ID・SHA照合、誤答別feedback、browser error 0を検証します。本番同条件のPlaywrightは、公開entry、検索非掲載、JSON／CSV download、外部origin通信0、lesson catalog非掲載も検査します。build後の`P2_PARTICIPANT_PREVIEW_BUILD_PASS`は、private観察記録0と合成download 2件を生成物から再検査します。`P2_SELECTION_COUNT_UI_PREVIEW_PASS`は研究preview契約の通過を表し、公開教材への昇格や実データ利用を意味しません。

## Versioned Julia-Web schema and result output

[Result schema and output contract](RESULT_IO_SCHEMA.md)として、`learning-julia.p2.selection-count-report` version `1.0.0`を追加しました。JuliaのreportをJSON3で階層JSONへ、CSV.jlでlong形式CSVへ書き出し、別の読込でround tripします。Web previewはJulia生成JSONをimportし、JavaScript側でもversion、method構成、status整合、未解決端点の`null`、`automatic_interval = null`を検査してから表へ変換します。

CSV fixtureは3状態×3方法×2parameterの18行です。profile未解決2行とbootstrap未解決2行を削除せず、端点を`NA`として保存します。fit時N=400と、成功率不足を再現するbootstrap再生成N=10も別列です。既存の同名JSON／CSVは上書きせず、両fileのSHA-256を返します。

```bash
julia --startup-file=no --project=validation/p2-likelihood \
  scripts/p2-selection-count-report-io-check.jl
```

`P2_SELECTION_COUNT_REPORT_IO_CHECK_PASS`は、既知のschema v1と固定fixtureのJulia／Web往復を保証します。将来の任意versionを自動移行できることや、実計算server APIが公開可能であることは保証しません。

## Research API boundary

[API boundary design](API_BOUNDARY_DESIGN.md)として、requestとtransport response envelopeをそれぞれversion `1.0.0`で追加しました。requestは人数だけでなく、選択された正確な値、事前境界、6つの観測仮定、seed、profile／bootstrap計算上限を要求します。responseは既存report v1を壊さず、request ID、exact body SHA-256、Julia version、Manifest SHA-256、UTC生成時刻を外側へ保持します。

browser clientは同一origin pathだけへPOSTし、120秒timeout、1 MiB response上限、media type、API/report版header、request ID、本文SHA、入力echoを検査します。401、403、406／426、429、5xx、timeout、cancelを別codeにし、Bearer secretをbrowserへ置きません。APIが使えない場合も、checked-in合成requestと完全一致するときだけ、理由を表示してJulia生成fixtureへ切り替えます。

HTTP.jl 2.0.0をこの隔離環境だけへ追加し、`127.0.0.1`へしかbindできない実動serverも用意しました。15分のHttpOnly・SameSite=Strict local session、CSRF、exact Origin、3回/60秒、request 1 MiB、header 32 KiB、同時計算1件をfit前に検査します。さらにchecked-in合成requestのexact SHA-256以外は`422 synthetic_fixture_only`で止め、実データや任意入力を受け付けません。

計算はHTTP process内ではなく、requestごとに別Julia processへ渡します。親processは120秒で打ち切り、終了しなければkillし、responseをschemaとrequest SHAで再照合します。requestはmode 0700の一時directory・mode 0600のfileへ置いて処理後に削除し、worker stderrとserver出力へ選択値を書きません。時間・同時数・入出力sizeは制限しましたが、production用のOS/container CPU・memory quotaではありません。

```bash
julia --startup-file=no --project=validation/p2-likelihood \
  scripts/p2-selection-count-api-boundary-check.jl
julia --startup-file=no --project=validation/p2-likelihood \
  scripts/p2-selection-count-local-server-check.jl
npm run test:p2-api
```

API coreのJulia 32検査、loopback serverの55検査、Vitestのtransport/session検査、Playwrightのmock/fallback経路とbrowser→Vite proxy→Julia server→別Julia workerの実経路を通します。machine-readable registryはendpointを`local_research_only`、v1を`research`、public availabilityを`available = false`とし、公開後に後継版を出す場合だけ旧版を最低180日重複提供する方針です。`P2_SELECTION_COUNT_LOCAL_SERVER_CHECK_PASS`は合成fixture限定のlocal endpointを検証した意味であり、public endpoint、production identity、TLS、実データ運用、監視、SLAの完成を意味しません。

## Dependency budget

- 直接依存: 7（数値4＋研究結果I/OのCSV.jl・JSON3.jl＋loopback serverのHTTP.jl）。CSV.jlは公開Notebook環境でも既存利用、JSON3.jl・HTTP.jlはP2専用
- Manifest entries: 96（stdlibを含む）
- 空の一時depotでのinstantiate＋precompile: 98.8秒、250.1MB（HTTP追加前の記録から+2.4秒、+44.1MB）
- 計測環境: Julia 1.12.5、macOS arm64。network・machine依存の観測値でありCI thresholdではありません。
- 独立engine: 別の`validation/p2-scipy/requirements.txt`でNumPy 2.4.2・SciPy 1.17.1の2依存を固定し、公開アプリのruntime依存には加えません。

再計測するときは次を実行します。一時depotは終了時に自動削除されます。

```bash
julia --startup-file=no scripts/p2-clean-install-measure.jl
```

## Learner usability protocol

[Learner usability protocol](LEARNER_USABILITY_PROTOCOL.md)として、初学者評価を実施する前のresearch question、非誘導task、0／1／2 teach-back rubric、formative／confirmation round、事前固定した判定、privacy境界をversion 1.0.0で固定しました。

固定taskは`denominator`、`missingness`、`conditional_vs_count`、`unresolved_interval`、`family_scope`の5つです。formativeとconfirmationは別参加者4〜8人ずつ、confirmation時点で累計8人以上を要求します。特に`missingness`と`unresolved_interval`はscore 2が100%でなければ改訂・再testとし、その他taskも独立完了・score 2が75%未満なら進めません。これは小人数roundを教育効果の母集団推定へ読み替える基準ではありません。

private observationとrepository-safe aggregateを別schemaにし、checked-in fileは`record_kind = synthetic_example`の2例だけです。既定は録音・録画なし、実データ入力なし、telemetryなしで、氏名・連絡先・診断・署名・逐語録を観察JSONへ持たせません。実観察票はこのrepositoryやDropbox同期directoryへ保存しない契約です。

```bash
julia --startup-file=no --project=validation/p2-likelihood \
  scripts/p2-learner-usability-protocol-check.jl
```

59検査の`P2_LEARNER_USABILITY_PROTOCOL_CHECK_PASS`はprotocol readinessだけを表します。現在の実参加者記録は0件であり、利用者理解blockerは未完了です。

## Public promotion blockers

研究Notebookと参加者向けWeb UI previewでは、観測契約、未解決status、Normal誤指定時のsupport／tail反例、誤り分類、入力・結果表現まで実装しました。静的previewは共有可能ですが、公開教材・公開推定serviceへの昇格blockerは次です。

1. protocol、5 task、rubric、個票／集約schema、privacy境界は固定済み。practice後、別参加者によるformative／confirmation roundを実施し、`N`、`m`、未測定、区間未解決、family scopeのteach-backを確認すること。実参加者0件の現状を完了扱いしない
2. 中央10%で残るbootstrap scale未校正を隠さず、区間を自動選択しない表示を公開UIでも維持すること
3. Normal専用scopeと境界・人数metadata感度を公開入力・出力へ固定すること。別familyへ広げる場合はfamilyごとのparameter回復試験を独立に通すこと
4. request/response schema、120秒timeout、error分類、公開後180日の互換version方針に加え、loopback合成fixture限定でsession／CSRF、rate limit、bounded stream read、非記録server出力、killable workerを検証済み。public化するならproduction identity、TLS＋Secure cookie、OS/containerのCPU・memory quota、監査済み非記録log、監視、実データの利用目的・保持・削除・同意を配備環境で検証すること
5. 98.8秒・250.1MBのclean install costを許容する任意トラックとしての配布方法を決め、単独配布ならembedded environmentまたはpackage化を再設計すること

これらが揃うまで`data-strategy-status="research"`を維持し、公開レッスン数やNotebook課題数へ含めません。
