# 研究用教材ドラフト: 選ばれた値と「選ばれなかった人数」を一緒に使う

> **状態: research only / 公開レッスンではありません**
>
> この文書は、P2の数値検証を初心者向け補講へ移すための教材ドラフトです。ここに出てくる関数は、安定した公開教材APIではありません。実データへ使う前に、観測方法と仮定を確認してください。

## この補講の前提

先に次の内容を学んでいることを想定します。

- 「確率変数と確率分布」: `Normal`、`cdf`、確率
- 「推定と不確かさ」: 点推定、95%区間、coverage
- 「観測境界・依存・混合分布」: truncationとcensoringの違い

この補講の目標は、計算式を暗記することではありません。学習後に、次の4点を説明できることを目指します。

1. 選択後の値だけでは失われる情報を説明できる
2. 選別前総数`N`と選択数`m`を、欠測数と区別できる
3. 人数情報を尤度へ加える理由を、小さな例と式で説明できる
4. 点推定が安定しても、Wald区間をそのまま信頼できない場合を説明できる

## 1. まず、400人をscreeningする場面を考える

ある測定値`X`を400人から得て、事前に決めた範囲`lower < X < upper`へ入った人だけを詳しい解析へ残すとします。実際に残ったのは43人でした。

```text
選別前の400人
├─ 範囲内の43人  →  43個の正確な測定値がある
└─ 範囲外の357人 →  個々の測定値は使わないが、357人いたことは分かる
```

43個の値だけを保存すると、「もともと50人を調べて43人が残った」のか、「400人を調べて43人が残った」のか区別できません。しかし、この2つは母分布についてまったく違う情報を持ちます。

- 50人中43人なら、範囲へ入る確率は高そうです。
- 400人中43人なら、範囲へ入る確率は約10.75%です。

この「何人調べて、何人残ったか」を使うのが、このドラフトで扱うselection-count likelihoodです。

## 2. `N`、`m`、選択後の値を分ける

記録するものは4種類です。

| 記号 | 意味 | 400人の例 |
|---|---|---:|
| `N` | 同じ規則で選別した総数 | 400 |
| `m` | 範囲内へ入り、値を解析する人数 | 43 |
| `N - m` | 範囲外だった人数 | 357 |
| `x₁, …, xₘ` | 選択された人の正確な値 | 43個の値 |

`N - m`は、通常の意味での「欠測数」ではありません。全員が同じscreeningを受け、範囲外だったという結果が分かっている人数です。連絡不能、機器故障、同意撤回などを同じ357人へ混ぜると、別の観測過程になります。

### truncation・censoring・selection countの違い

| 観測過程 | 個々の範囲外の値 | 範囲外の人数 | 行数 |
|---|---|---|---|
| 選択後だけのtruncation | 見えない | 分からないことがある | 減る |
| selection countつきtruncation | 見えない | 分かる | 選択値は減るが総数を別に保持 |
| censoring | 境界以下／以上と分かる | 分かる | 保たれる |
| 通常の欠測 | 欠測理由による | 欠測数だけでは選択確率にならない | 欠測を含む |

## 3. 人数だけの小さな手計算

モデルが「範囲へ入る確率」を`p`と予測するとします。100人中10人が選択された場合、人数部分の対数尤度は、parameterに依存しない組合せ項を除くと次です。

```text
10 log(p) + 90 log(1 - p)
```

候補となる`p`を入れてみます。

| 候補 | 人数部分の対数尤度 | 読み方 |
|---:|---:|---|
| `p = 0.02` | 約 -40.94 | 10人は予測より多い |
| `p = 0.10` | 約 -32.51 | 観測された10/100と合う |
| `p = 0.50` | 約 -69.31 | 10人しか残らないことを説明しにくい |

対数尤度は大きい方、つまり負の値なら0に近い方がdataと整合的です。ただし、これは人数だけを見た説明です。実際には、選択された10個の値が範囲内のどこに並んだかも同時に使います。

## 4. 条件付き密度と人数情報を掛ける

元の分布の密度を`f(x)`、範囲へ入る確率を

```text
p = P(lower < X < upper)
```

とします。

選択後の値だけを条件付き分布として扱うと、1個の値の密度は`f(x) / p`です。`m`個なら次になります。

```text
条件付き部分 = ∏ f(xᵢ) / pᵐ
```

一方、`N`人中`m`人が選択される人数部分はBinomialで、組合せ項も書くと次です。

```text
人数部分 = choose(N, m) pᵐ (1 - p)^(N - m)
```

2つを掛けると、`pᵐ`と`p⁻ᵐ`が相殺されます。

```text
選択値 × 人数
= [∏ f(xᵢ) / pᵐ] × [choose(N, m) pᵐ (1 - p)^(N - m)]
= choose(N, m) × ∏ f(xᵢ) × (1 - p)^(N - m)
```

`choose(N, m)`は推定するNormalのparameterによって変わらないため、最適化では省略できます。実装する対数尤度は次です。

```text
Σ log f(xᵢ) + (N - m) log(1 - p)
```

直感的には、選択された人の正確な値を`log f(xᵢ)`で使い、範囲外だった人については「範囲外だった」という1 bitの情報を`log(1-p)`で使っています。

## 5. 確率はlogのまま計算する

人数が多いと、`(1-p)^(N-m)`は非常に小さくなります。先に通常の確率として掛けてから`log`を取ると、浮動小数点では0へ丸められることがあります。

研究実装では次の原則を使います。

- 密度は`logpdf`
- 範囲内確率は`logcdf`、`logccdf`、`log1p`を位置に応じて使用
- `log(1-p)`は、`p`が1に近いとき`expm1`を使って桁落ちを避ける
- scaleは正になるよう`log_sigma`を最適化し、最後に`exp`で戻す

これは結果を都合よく変える工夫ではなく、同じ数式を有限精度のコンピュータで壊さず計算する工夫です。

## 6. Juliaで1回のscreeningを再現する

次は、真の分布が分かるsimulationです。実データでは真値は見えませんが、実装が既知の真値を回復できるか調べるためにsimulationを使います。

repository rootで次のコードを実行します。

```julia
include("scripts/p2-likelihood-contracts.jl")
using .P2LikelihoodContracts
using Distributions, Random, Statistics

truth = Normal(37, 1.7)
true_mu, true_sigma = params(truth)
lower, upper = quantile.(Ref(truth), (0.45, 0.55))

total_screened = 400
screened = rand(Xoshiro(20271234), truth, total_screened)
observed = filter(x -> lower < x < upper, screened)

fit = fit_selection_count_normal(
    observed, total_screened; lower, upper,
)

wald = wald_intervals(fit)
objective = raw -> normal_selection_count_nll(
    raw, observed, total_screened, lower, upper,
)
profile = profile_likelihood_intervals(objective, fit)

println((total = total_screened,
         selected = length(observed),
         excluded = total_screened - length(observed)))
println((mu = mean(fit.distribution), sigma = std(fit.distribution)))
println(wald)
println(profile)
```

検証環境では、概ね次の結果になります。

```text
(total = 400, selected = 43, excluded = 357)
(mu = 36.038, sigma = 0.928)
Wald mu:    35.768 -- 36.307
profile mu: 35.705 -- 38.145
profile sigma: 0.448 -- 2.061
```

この1回では、点推定の`mu = 36.038`は真値37からずれています。推定値が真値と完全一致しないこと自体は、標本変動があるため失敗ではありません。

重要なのは区間です。

- Waldの`mu`区間は真値37を含みません。
- profileの`mu`区間は真値37を含みます。
- profileの`sigma`区間も真値1.7を含みます。

ただし、1回うまくいった例だけで方法を評価してはいけません。後の反復simulationで、区間が真値を含む割合を調べます。

## 7. なぜWald区間が狭くなりすぎるのか

Wald区間は、最適値のすぐ近くで尤度曲面を二次関数として近似します。十分なdataがあり、尤度が左右対称な山に近ければ便利です。

中央の狭い範囲だけを選ぶと、location`mu`とscale`sigma`が一緒に動ける曲がった経路ができます。例えば、少し左へずれた狭い分布と、中央付近にある広い分布が、選択された値へ似た説明を与える場合があります。最適値の近くだけを見るWald近似は、この曲がりを短く切ってしまうことがあります。

profile likelihoodは、`mu`をある値へ固定するたびに、残りの`sigma`を最適化し直します。遠回りの経路も調べるため計算量は増えますが、局所的な楕円では表しにくい不確かさを追跡できます。

したがって、次の2つを分けます。

- **点推定の安定**: 極端に離れたparameterへ飛ばないか
- **区間の校正**: 95%区間が反復simulationの約95%で真値を含むか

点推定が安定しただけで、区間まで正しいとは限りません。

## 8. 反復simulationで分かったこと

選択後目標件数40・120、中央50%・中央10%・非対称50%、複数の真のNormal分布を使い、校正用と未使用holdoutを合わせて2,880回fitしました。

| 結果 | 選択後の値だけ | 人数情報も使用 |
|---|---:|---:|
| calibrationのfit失敗 | 174 | 0 |
| calibrationの破局的逸脱 | 463 | 0 |
| holdoutのfit失敗 | 193 | 0 |
| holdoutの破局的逸脱 | 446 | 0 |

人数情報は点推定を大きく安定させました。しかし、人数情報を使ったWaldの`mu` coverageは全体で約74%でした。中央10%だけを見ると38.75%〜50.00%まで低下しました。

同じ中央10%条件と安定比較条件をprofileした480試行では、すべての端点が解け、`mu` coverageは92.5%〜95.0%、`sigma` coverageは91.25%〜97.5%でした。

この結果から、「人数情報を加えれば全部解決」とは結論しません。現在支持されるのは、次の限定的な結論です。

> 固定された有限区間で正しくscreeningされ、総数と選択数が正確に分かるNormal simulationでは、人数情報が点推定の同定を改善した。対称で強い選択では、Wald区間ではなくprofileのような非線形な区間法が必要だった。

## 9. 実データへ進む前の観測契約

次の問いへすべて答えられない場合、`N`と`m`をそのままこの尤度へ入れません。

1. `N`人全員が同じ母集団の解析対象か
2. `lower`と`upper`はdataを見る前に固定されたか
3. `N`人全員が同じ境界と測定方法でscreeningされたか
4. 選択された`m`人には正確な値があるか
5. 残り`N-m`人は、欠測ではなく範囲外だったと分かるか
6. 同じ人を二重に数えていないか
7. group、施設、時点によって境界が違うなら、層別の総数と選択数があるか

### このモデルへ直ちに入れてはいけない例

- 400人のうち100人は測定しておらず、測定した300人中43人が範囲内だった
- 範囲外357人の中に、機器故障や同意撤回が混ざっている
- histogramを見た後で、都合のよい`lower`と`upper`を決めた
- 複数施設で境界が違うのに、総数だけを合計した
- 同じ参加者の複数時点を、独立な400人として数えた

これらは「入力を少し修正すればよい」問題ではなく、尤度で表す観測過程を変更する問題です。

## 10. 分析の順序

実務では次の順に進めます。

1. **designを記録する**: 対象母集団、境界、screening手順を固定する
2. **人数を監査する**: `N = m + excluded`、重複、施設別集計を確認する
3. **値を監査する**: 選択値がすべて境界内か、NaN・Infがないか確認する
4. **条件付き解析を基準に残す**: 人数情報なしで何が不安定か比較する
5. **selection-count fitを行う**: 人数情報で結論がどう変わるか確認する
6. **Waldだけで終えない**: 強い対称選択ではprofileを確認する
7. **状態を保存する**: fit失敗、`search_limit`、区間未解決を結果として残す
8. **観測過程へ戻す**: 推定分布からscreening全体を再生成し、選択数と選択値を同時に点検する

## 11. 用語集

| 用語 | この補講での意味 |
|---|---|
| latent distribution | screening前の見えない母分布 |
| selection probability `p` | モデルが予測する`lower < X < upper`の確率 |
| conditional likelihood | 選択されたことを条件に、選択値だけを使う尤度 |
| selection-count likelihood | 選択値に加え、総数と選択数を使う尤度 |
| point estimate | 最も尤度が高い1組のparameter |
| Wald interval | 最適値近傍のHessianによる局所二次近似区間 |
| profile interval | 片方のparameterを固定し、他方を最適化し直して作る区間 |
| coverage | 反復simulationで区間が真値を含んだ割合 |
| holdout | 閾値や判定規則の調整に使わなかった検証条件 |
| search limit | 探索範囲内でprofile区間の端点を確定できなかった状態 |

## 12. 理解チェック

### 問1: 人数を分ける

500人全員を同じ境界でscreeningし、50人が範囲内でした。`N`、`m`、`N-m`はいくつですか。

<details><summary>ヒント</summary>

`N`はscreeningした総数、`m`は選択値を持つ人数です。

</details>

<details><summary>答えと理由</summary>

`N = 500`、`m = 50`、`N-m = 450`です。450人の正確な値は使いませんが、全員が範囲外だったという人数情報を使います。

</details>

### 問2: 欠測と区別する

500人を募集しましたが、100人は測定に来ませんでした。測定できた400人中43人が範囲内でした。何も考えず`N = 500`としてよいでしょうか。

<details><summary>ヒント</summary>

来なかった100人が、境界の外だったと確認できるでしょうか。

</details>

<details><summary>答えと理由</summary>

そのまま`N = 500`にはできません。未測定100人は範囲外と判定されたのではなく、選択状態が不明です。少なくとも現在説明している観測過程では、screeningできた400人を対象にするか、未測定過程を別にmodel化します。

</details>

### 問3: `pᵐ`が消える理由

条件付き密度の分母`pᵐ`と、Binomial人数部分の`pᵐ`を掛けるとどうなりますか。

<details><summary>ヒント</summary>

`pᵐ / pᵐ`を考えます。

</details>

<details><summary>答えと理由</summary>

相殺されて1になります。残るparameter依存部分は、選択値の`∏f(xᵢ)`と、範囲外人数の`(1-p)^(N-m)`です。

</details>

### 問4: 区間を読む

真値が37のsimulationで、Wald区間が35.77〜36.31、profile区間が35.70〜38.15でした。この1試行について正しい説明はどれですか。

1. Waldだけが真値を含む
2. profileだけが真値を含む
3. profileが含んだので、すべてのdataでprofileが正しいと証明された

<details><summary>ヒント</summary>

37が各区間の下限と上限の間にあるかを確認し、1試行と反復性能を分けます。

</details>

<details><summary>答えと理由</summary>

2です。この試行ではprofileだけが真値37を含みます。ただし、方法の性能は1試行ではなく反復simulationのcoverageで評価します。

</details>

### 問5: 結論の強さ

今回の検証から「selection-count likelihoodはどんな分布、どんな欠測、どんな境界でも安全」と結論してよいでしょうか。

<details><summary>ヒント</summary>

今回のsimulationで固定していた分布familyと観測規則を確認します。

</details>

<details><summary>答えと理由</summary>

結論できません。現在の回復結果はNormal、有限で既知の境界、正確な総数・選択数、指定したscreening過程に限定されます。Normal以外、境界誤指定、人数記録誤差、依存した反復測定は次のstress課題です。

</details>

## 13. このドラフトを公開補講へ昇格させる条件

- Normal以外、境界誤指定、人数記録誤差のstress結果を加える
- `profile.status == :search_limit`を画面上で「区間なし」と明示する
- 観測契約を入力フォームまたは表から検査する例を加える
- 誤答を「計算ミス」「truncation/censoring混同」「欠測との混同」に分けて返す
- Notebookで、選択後だけのfitと人数情報つきfitを同じdataで比較する
- 公開する最小APIとpackage依存を改めて固定する

数値検証は次で再実行できます。

```bash
julia --startup-file=no --project=validation/p2-likelihood scripts/p2-selection-count-check.jl
```

詳細な研究判断と全simulation結果は[README](README.md)を参照してください。
