# P2 model misspecification robustness gate

作成日: 2026-08-09
状態: research design / 公開教材ではない

## 1. 目的

selection-count likelihood は、固定された有限境界、正確な選別前総数、Normal な潜在分布という観測・モデル契約の下では、選択後の値だけを使う条件付き尤度より点推定を安定させた。しかし、正しい式を実装したことと、実データの生成過程を正しく表したことは同じではない。

次の研究 gate は、既存の成功条件を広げるのではなく、契約を少し外したときに何が壊れるかを分離して記録する。

1. 潜在分布が Normal ではない
2. 選別境界が実際より広く記録される
3. 選別前総数が20%少なく、または多く記録される

この gate の `PASS` は頑健性の証明ではない。既知の誤指定が検出可能な予測差または感度として再現され、公開停止点を維持できたことを表す。

## 2. 公式仕様から置く境界

- Distributions.jl の `truncated(d0, lower, upper)` は、任意の単変量分布 `d0` を切断分布として包む共通APIを持つ。
- `pdf`、`logpdf`、`cdf`、`logcdf`、`ccdf`、`logccdf`、`quantile`、`rand` は、単変量分布の共通interfaceとして提供される。
- 一方、現在の `fit_selection_count_normal` と `normal_selection_count_nll` は名前どおり Normal 専用である。別familyのdataを受け取っても、family誤指定を自動判定するAPIではない。
- Optim の収束flagと正定値Hessianは、与えた目的関数の局所解を評価する。目的関数そのもののfamily・境界・人数が正しいことは保証しない。

公式資料:

- https://juliastats.org/Distributions.jl/stable/truncate/
- https://juliastats.org/Distributions.jl/stable/univariate/
- https://juliastats.org/Distributions.jl/stable/fit/
- https://julianlsolvers.github.io/Optim.jl/stable/user/config/

## 3. 検証行列

共通して中央10%を選別し、選別前4,000件、80反復とする。選択後は平均約400件となるため、少数標本の最適化不安定性よりmodel misspecificationを主に観察できる。乱数の具体値ではなく、広い率・比の範囲をCI契約にする。

### 3.1 分布family

| 真の潜在分布 | Normal fitが入口で合わせられる量 | 観察する破綻 |
|---|---|---|
| `LogNormal(0, 0.8)` | 中央10%の選択率と範囲内の値 | 真には存在しない負値への予測確率、95%分位点の過小予測 |
| `TDist(3)` | 中央10%の選択率と範囲内の値 | 重い裾の99%分位点の過小予測 |

入力dataだけに近い量が合っていても、未観測領域の予測が壊れ得ることを反例の中心にする。Normal fitの選択確率と観測選択率の平均差が2ポイント以内でも、LogNormalに対する負値確率が平均5%以上、または真の上側分位点に対する予測比が70%以下なら、familyを自動的に一般化してはならない。

### 3.2 境界metadata

真の潜在分布を `Normal(37, 1.7)` とし、同じ選択dataへ次の2通りを適用する。

- 正しい中央10%境界
- 中心を保ったまま幅だけ2倍に誤記録した境界

狭すぎる誤境界は、観測値が境界外となるため入力契約で停止できる。広すぎる誤境界は全観測値が内側に残るため、行だけからは停止できない。後者で推定scaleが正しいmetadataの1.7倍以上へ変化することを、感度分析が必要な反例として固定する。

### 3.3 人数metadata

同じ `Normal(37, 1.7)` dataについて、真の `N = 4,000` に対し、記録された総数を3,200、4,000、4,800としてfitする。

- `N < m` の明白な矛盾は入力契約で停止する。
- `N >= m` のもっともらしい誤記録は自動検出できない。
- 同じ選択値でも、少ないNは推定scaleを縮め、多いNは広げる方向に動くことをpaired ratioで確認する。

これは「20%なら安全」という閾値ではない。人数記録の誤差量が不明なら、複数の仮定を置いた感度分析と原記録の監査が必要だと示すための固定反例である。

## 4. calibrationとholdout

設計時の試走seedと、CIに固定する最終seedを分離する。閾値は個々の最終件数へ合わせず、教材上意味のある効果方向と広い比率範囲で定義する。Julia patch releaseやOSによる最適化受理の微小差を許容しながら、次の結論は変えない。

- 観測された選択率が合うだけではfamily適合を保証しない。
- 境界と人数は説明変数ではなく、尤度を定義するdesign metadataである。
- 検出できる矛盾は入口で止め、検出できない誤記録は感度分析として結果へ残す。

## 5. 成果物と公開判断

実装は `scripts/p2-selection-count-robustness-check.jl` に隔離し、このgate自体は当時の4直接依存を増やさない。後続の研究結果I/O gateだけがCSV.jl・JSON3.jlをP2環境へ追加した。CSV.jlは公開Notebook環境でも既存利用だが、JSON3.jlはP2専用である。結果はresearch README、研究用教材ドラフト、公開ロードマップのresearch欄へ同期する。公開catalog、番号付き37レッスン、Pluto本編には追加しない。

このgateを通過しても、公開昇格には次が残る。

1. Normal専用であることを入力・出力名と教材で誤解なく固定するか、別familyを独立に回復検証する
2. profileの未解決状態とbootstrap比較を学習者向けAPIへ落とす
3. 境界・人数の原記録を検査する入力例と、誤りの種類別feedbackを実装する
4. 任意トラックとして依存・実行時間を許容できる配布経路を決める
