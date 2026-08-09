# P2 likelihood feasibility environment

Status: **research only / not a public lesson API**

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

## Dependency budget

- 直接依存: 4
- Manifest entries: 69（stdlibを含む）
- 空の一時depotでのinstantiate＋precompile: 83.4秒、142.5MB
- 計測環境: Julia 1.12.5、macOS arm64。network・machine依存の観測値でありCI thresholdではありません。
- 独立engine: 別の`validation/p2-scipy/requirements.txt`でNumPy 2.4.2・SciPy 1.17.1の2依存を固定し、公開アプリのruntime依存には加えません。

再計測するときは次を実行します。一時depotは終了時に自動削除されます。

```bash
julia --startup-file=no scripts/p2-clean-install-measure.jl
```

## Public promotion blockers

1. selection-count likelihoodが仮定する固定境界、独立なscreening、正確な総数・選択数を、欠測や別理由の除外と区別する入力契約を教材化すること
2. 対称な強選択ではWaldを既定にせず、profileの`search_limit`を未解決として伝えるAPIとbootstrap比較を用意すること
3. Normal以外・境界誤指定・選別人数の記録誤差に対するmodel misspecification stressを追加すること
4. 初心者が「境界値」「flag」「選別前総数」を取り違えたときのfeedback設計
5. clean install costを許容する任意トラックとしての配布方法

これらが揃うまで`data-strategy-status="research"`を維持し、公開レッスン数やNotebook課題数へ含めません。
