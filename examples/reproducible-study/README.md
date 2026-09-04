# 再現可能で公開境界を明示した研究project template

Julia 1.12で、小さなtrial-level dataを検査・整形・集計し、内容由来のrun IDと実行metadataを残す最小例です。配布データは教材用の合成値で、実在の参加者を表しません。追跡する公開例と、追跡しない機微なraw入力を最初から別directoryにします。

## 実行

展開後、このREADME.mdとProject.tomlがあるdirectoryへ移動します。

```sh
julia --project=. -e "using Pkg; Pkg.instantiate()"
julia --project=. code/run_analysis.jl
```

2つ目のcommandは、project root以外を作業directoryにして絶対pathでscriptを指定しても動きます。script自身の場所を`@__DIR__`で基準にするためです。

## R・Stanとの任意連携

Rが導入済みなら、同じ合成入力をRへ渡し、条件別集計をJuliaへ読み戻せます。

```sh
julia --project=. code/run_r_bridge.jl
```

`run_r_bridge.jl`はRscriptの場所を確認し、`--vanilla`で`code/summarize_trials.R`を実行します。Rの出力をJuliaで型つき読込し、列、件数、基準平均を照合してから`output/r/<run ID>/`へ保存します。標準出力・標準エラーもlogに残し、実行コマンド、OS・architecture・R platform、入力・driver・R script・Project・Manifest・全成果物のSHA-256を`metadata/runs/`へ記録します。再実行時はhashを検査して成果物を再利用します。失敗時は途中成果物、log、`failure.toml`を残し、確認前の上書きを止めます。

R・Stanの再利用処理は、記録された成果物pathがproject内にあり、symbolic linkの実体もproject外へ出ていないことを確認します。さらに、run ID、入力・driver・Project・Manifestのhash、環境、実行設定を現在の条件と照合します。Stanの事後要約と診断値は保存済みdraws CSV・summary・diagnose結果から再検査します。成果物と説明用metadataのどちらが変わっても再利用しません。

Stan連携は初回だけCmdStanをbuildしてから実行します。C++ toolchain、約51 MBのdownload、build時間が必要なので、通常分析とは分けています。

```sh
julia --project=. code/setup_cmdstan.jl
julia --project=. code/run_stan_bridge.jl
```

`setup_cmdstan.jl`はCmdStan 2.39.0の公式archiveを取得し、SHA-256と展開後の構成を一時directoryで確認してから`.cmdstan/`へ移し、最終pathでbuildします。downloadや展開の中断による不完全なinstallを最終directoryへ残しません。このdirectoryはversion管理と配布archiveの対象外です。`run_stan_bridge.jl`はStanSample 7.10.3から4 chainを実行し、Beta(6, 2)の解析解と事後予測平均で実装を検算します。chain別draws CSV、入力JSON、実行log、model複製、実行file、stansummary、CmdStan diagnoseと各fileのSHA-256を保存します。同じrun IDの再実行では、記録済み成果物のhashを確認して再利用します。失敗時は途中成果物と`failure.toml`を残し、同じrun IDへの再実行を止めます。内容を確認してから、そのdirectoryを移動または削除してください。詳細は`models/README.md`を参照してください。

## 第三者へ渡す前の確認

まず自分以外の1人に、このREADMEだけを渡して次を順に行ってもらいます。操作方法は教えず、止まった場所、表示されたerrorから次の行動を判断できたか、成果物を自分の言葉で説明できたかを記録します。

1. archiveを展開し、通常分析を実行して、入力、加工済みdata、集計表、実行記録の場所を示す。
2. Rがある環境でR連携を2回実行し、`created`と`reused`の違い、Rが作った成果物とJuliaが検査した内容を説明する。Rがない場合は、どの確認で停止したかを説明する。
3. C++ toolchainを使える環境でCmdStanを準備し、Stan連携を2回実行する。model、入力JSON、chain別draws、summary、diagnose、解析解との照合を区別して説明する。

記録するのは、最初に止まった手順、自己回復できたか、説明できなかった区別、所要時間だけです。氏名、連絡先、端末名、local path、生のlogはこのrepositoryへ保存しません。現在確認済みなのは自動検証と開発環境でのclean runであり、第三者による引き継ぎ確認は未実施です。1人の結果は説明や導線の修正にだけ使い、理解率や教育効果の根拠にはしません。

## 入力の選択と公開境界

- `data/example/trials_synthetic.csv`: version管理する公開可能な合成例。
- `data/raw/`: 実データをlocalに置く、`.gitignore`対象のdirectory。
- `metadata/study.toml`: 実行する入力の相対path・study ID・情報分類。
- `metadata/data_dictionary.csv`: 人が読む変数定義。
- `metadata/schema.toml`: 型・水準・範囲・keyの機械可読契約。
- `code/run_analysis.jl`: 唯一の実行入口。
- `data/derived/analysis_trials--<run ID>.csv`: 検査を通った分析用data。
- `output/tables/condition_summary--<run ID>.csv`: 条件別集計。
- `metadata/runs/run--<UTC時刻>--<run ID>.toml`: 入出力checksumと実行環境。

初期設定では`metadata/study.toml`が合成例を指します。期待される条件別平均はcontrolが510.0 ms、treatmentが550.0 msです。出力済みの同じrun IDへ異なるbytesを書こうとすると停止します。

実データを使うときは、たとえば`data/raw/trials_private.csv`へ保存し、`metadata/study.toml`の`input_path`をその相対pathへ変更します。入力pathはproject内だけを許し、絶対pathや`..`によるproject外参照は拒否します。`input_classification`は公開許可ではなく実行記録なので、組織の情報分類に合わせます。

実データを置いた直後とcommit前には、次を確認します。

```sh
git check-ignore -v data/raw/trials_private.csv
git ls-files data/raw
git status --short
```

2つ目の出力には`data/raw/README.md`だけが現れる状態が期待です。`.gitignore`が保護するのは意図的に未追跡のfileです。すでに追跡されたfileを後からignoreしても、追跡や過去の履歴は消えません。

## 自分の研究へ置き換える前に

1. 合成例を上書きせず、実データを`data/raw/`へ置いて`study.toml`から選ぶ。
2. 入力だけを差し替えず、dictionaryとschemaも研究定義に合わせて変更する。
3. primary key、許可水準、範囲、欠測規則、除外規則を研究計画から定義する。
4. 識別子、自由記述、file metadata、checksumの公開可能性を倫理・privacy面から点検する。
5. 主要推定値、除外数、警告、図表にも研究固有のtestを追加する。
6. package更新時は別branchでclean runし、数値差を確認してからProject／Manifestを更新する。

schema合格やchecksum一致は、測定妥当性、分析設計、匿名化の正しさを保証しません。このtemplateは監査可能な生成経路の出発点です。
