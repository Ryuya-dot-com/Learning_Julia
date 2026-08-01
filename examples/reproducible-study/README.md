# 再現可能で公開境界を明示した研究project template

Julia 1.12で、小さなtrial-level dataを検査・整形・集計し、内容由来のrun IDと実行metadataを残す最小例です。配布データは教材用の合成値で、実在の参加者を表しません。追跡する公開例と、追跡しない機微なraw入力を最初から別directoryにします。

## 実行

展開後、このREADME.mdとProject.tomlがあるdirectoryへ移動します。

```sh
julia --project=. -e "using Pkg; Pkg.instantiate()"
julia --project=. code/run_analysis.jl
```

2つ目のcommandは、project root以外を作業directoryにして絶対pathでscriptを指定しても動きます。script自身の場所を`@__DIR__`で基準にするためです。

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
