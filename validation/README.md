# Julia validation environment

教材コードの数値回帰とPluto smoke test専用の環境です。アプリ本体や配布Notebookの埋め込み環境とは分離します。

## 本編の数値検証

```sh
julia --project=validation scripts/setup-validation-env.jl
julia --project=validation/categorical scripts/setup-categorical-validation-env.jl
julia --project=validation scripts/run-numeric-checks.jl --public
```

`--public` は本編・補講・配布テンプレートの20本を実行し、GitHub Pages公開前の必須条件です。RとCmdStanを含む実行確認は、別のR・Stan定期CIで行います。

## P2研究の数値検証

```sh
julia --startup-file=no --project=validation/p2-likelihood scripts/setup-validation-env.jl
python -m pip install -r validation/p2-scipy/requirements.txt
julia --startup-file=no --project=validation/p2-likelihood scripts/run-numeric-checks.jl --p2
```

`--p2` は研究用の12本を実行します。`p2-research.yml` でローカルAPIのブラウザ検査とともに変更時・毎週実行し、Pages公開の成否とは分けます。静的P2プレビューの配布・通信・画面の検査は公開条件に残します。

引数なしの `run-numeric-checks.jl` は従来どおり全32本を実行します。本編・多カテゴリ・P2のJulia環境とSciPyの準備が必要です。対象だけを見る場合は、環境準備前でも `julia --startup-file=no scripts/run-numeric-checks.jl --public --list`（研究用は `--p2 --list`）で確認できます。

## Notebookの検証範囲

- `julia --project=validation scripts/run-notebook-smoke.jl`: NB1–NB6の未回答状態をPlutoで実行。変更時・毎週実行します。
- `julia --project=validation scripts/nb-exec-check.jl NOTEBOOK ANSWERS`: ローカルの非公開模範解答を差し込み、全✅まで確認する完全検証。定期CIでは実行していません。
- `julia --startup-file=no --project=validation scripts/nb5-grading-test.jl`: NB5課題6の判定セル・反復記録・集計を検査。200反復の実適合、評価回数上限による未収束、定数応答による例外、無効な推定値、全失敗時の分母、同じseedの再現も確認します。7条件の少数反復でCSV往復・再集計・欠測と空文字の区別・既存出力の保護も検査します。模範解答やPlutoの起動は不要ですが、MixedModelsやCSVなどのvalidation環境を使います。Plutoの定期CIでも実行し、ほかの課題の解答検査とは分けます。
- `julia --startup-file=no --project=validation scripts/notebook-input-test.jl`: NB1–NB6の51判定セル（NB5課題6以外）と、NB3の表作成・NB4の予測／損失計算・NB5の確率採点を直接実行します。未回答、型違い、要素の欠測、表の列不足、NamedTuple・辞書のキー不足、CSV読込失敗、値やhashの不一致、異なるモデル・作図内容を検査します。配布済みのデータと公開の基準値を使い、非公開解答は読みません。Rのcommandを組み立てる検査はしますが、R・Stanの実行はしません。Plutoの定期CIで実行します。図の検査にも実際のPlotsを使うため、Notebookと同じStatsPlotsを検証用環境にも登録しています。上のNB5専用検査と合わせて全52判定を対象にします。

未回答状態の成功は、学習者の解答が正しく採点されることまで保証しません。模範解答は `docs/nb-answers/` にローカル管理され、Gitには含まれません。NB6は外部ソフトなしでも取り組める境界設計の演習で、RCall・JuliaCallの埋め込み実行やStanのコンパイルを定期検証するものではありません。P2研究Notebookは `pluto-smoke.yml` 内で別途実行します。

NB1は秒への変換を全要素、絞り込みを元の行、条件平均を条件名との対応、CSVを保存前後の値まで照合します。NB6はStanの整数データ契約と、実際の入力・モデルのSHA-256、Julia版・Rscriptの記録を確認します。読込境界で想定するCSV・ファイルのエラーだけを案内へ変え、割り込み・メモリ不足や想定外の例外は再送出します。判定セルの入力検査であり、学習者が書いた式自体の構文・実行エラーを隠す仕組みではありません。

NB6の`readdlm`は引用符の解析エラーに専用の例外型がないため、未閉鎖の引用符・閉じ引用符後の不正文字という2つの既知メッセージだけを案内へ変えます。それ以外の`ErrorException`は再送出します。DelimitedFilesの更新時は、この2ケースも再検査してください。

NB2は配列・行列の要素を確認してから数値を比較し、予測区間は上流のreplicate行列が正の有限値を持つ所定の形か確認します。数値安定性の課題で意図した`log_product = -Inf`は受け付けます。切断・打ち切り分布は、課題で指定した正規分布と境界から作られていることも確認します。

NB3は参加者1〜5すべての返り値・再現性・順序の違いを確認し、確認した同じ配列から表を作ります。一部の参加者だけの欠測・異なる条件名、共有配列の使い回しも検査します。不正な返り値なら表は未作成のままにしますが、関数本体の例外は隠しません。CSVは40行というだけでなく、列・値・行順を保存前の表と照合します。

NB2–NB4の4つの作図判定は、単一パネルの描画系列と軸の対応を確認します。NB2のヒストグラムは`bins = 6`の標準の区間・度数、箱ひげ図は標準設定の箱・中央値・ひげと条件ラベルを照合します。整数の`bins`は目安なので、配布データでは4区間になります（[Plots公式説明](https://docs.juliaplots.org/dev/series_types/histogram/)）。NB4は指定したビン設定で`cor_sims(20)`から基準図を作り、区間と度数を照合します。ビンは正の整数・対応する自動設定・全観測を含む境界列を受け付け、最大1万区間としています。どちらも縦向きの度数表示を対象とし、密度への正規化や箱・棒の幅の変更、追加系列・複数パネルは課題の判定範囲外です。色・タイトル・凡例・軸ラベルは採点しません。

NB3は課題3と同じ関数で`ses`の妥当性を確認し、折れ線のxが`ns`、yが現在の`ses`に一致すること、円マーカー、縦軸ラベル`SE of mean`、通常の線形軸を確認します。上流が未回答なら待機、不正な値なら案内へ戻します。NB2/NB4の基準図の作成後は元の`Plots.current()`を復元し、次の`plot!`の描画先を変えません。Plots 1.41.6・StatsPlots 0.15.8の`series_list`・軸属性を使うため、package更新時には実際の図を使った検査も再実行してください。

NB4は数値の型・有限性・長さに加え、p値と最大予測差が負でないことを確認します。ANCOVAは式付きのLinearModel、ロジスティック回帰は式付きのBinomial・LogitLinkモデルに限定し、用意した表の行順・観測値・設計行列と照合します。ロジスティック回帰でoffsetや非単位の重みを指定したモデルは受け付けません。GLM 1.9の応答構造の`offset`・`wts`を参照するため、GLM更新時にこれらの検査も再実行してください。

NB4の課題7の判定と後続の予測は同じモデル確認関数を使います。不正なモデルでは予測確率と損失を`missing`にし、欠測を全員陰性として集計しません。閾値は0以上1以下の有限な実数に限定します。正しいモデルへ戻したときに、元の予測・損失へ戻ることも確認します。モデルを作る式自体のエラーは隠しません。

NB5の項目分析は全8項目の通過率・修正済み相関を照合します。標準偏差は有限かつ非負に限定し、測定誤差の傾き・配備指標の入れ子の項目も確認します。確率採点は観測と同じ長さの0以上1以下の有限値を受け付け、Brier scoreには元の確率を使います。log lossの0・1だけは機械精度の内側へ制限するため、厳密な無限損失を返す規則とは異なります。

NB5の2つのモデル課題はGaussian LMMに限定し、元の行順・応答・固定効果の設計行列・参加者の対応・ランダム傾き・共分散構造を、未適合の基準モデルと照合します。非単位の重み、固定した残差SD、未適合や正常停止以外のコードは受け付けません。課題6と同じ4つの停止コードを使います。MixedModels 5.8の`ReMat`（`cnames`・`inds`・`levels`・`refs`・`z`）と`optsum`を参照するため、package更新時には実際のモデルを用いた検査も再実行してください。パネルのlag-1相関は、用意した同じ行順の100人×12時点に対する計算で、任意の不均衡・並べ替え済みパネルへの一般化は検査しません。

全52判定に未回答・不正入力・正常な返り値の検査があっても、任意の誤答を見分けられる保証ではありません。数値範囲だけで確認する課題も残ります。作図の照合は描画後の座標・度数・要約統計に対するもので、同じ図になる別データや作図コードの来歴は区別できません。文字の読みやすさ、色の識別、表示範囲の切り取りなどの見た目は自動採点しません。研究判断の妥当性も、この検査の対象外です。

NB5課題6の✅は基準条件の値域・200反復のMCSE・集計数の整合の確認です。卒業制作はNotebook末尾の6観点（研究質問・生成と解析・感度分析・数値精度・失敗記録・再現と結論）を人が読み、すべて2で達成とします。合計点や検定力80%だけでは決めません。

`power_lmm_nb`は各反復を独立に適合し、`trials`に`status`・`return_code`・係数／SE・目的関数値・特異適合・例外を残します。`power`の分母は解析可能数`analyzed`、`detection_rate_all`は全反復数`attempted`です。後者は失敗を非検出とする運用上の割合で、それぞれ別のMCSE・区間を返します。全失敗なら前者は`missing`、後者は0で上限が正のWilson区間になります。特異適合は自動除外せず、`singular_rate`は解析可能数を分母にします。

NLoptの4停止コード（SUCCESS・STOPVAL_REACHED・FTOL_REACHED・XTOL_REACHED）と有限の係数・正の有限SE・有限の目的関数／検定統計量を本課題の解析可能条件にしています。回数上限などでの停止は未収束として記録し、割り込み・メモリ不足は中止します。警告文の自動分類や研究上の妥当性の判定は行いません。入力・RNG・seed・版・最適化設定は`settings`に残ります。Notebookはファイルを自動保存しません。

### NB5の設計比較を保存する

```sh
julia --startup-file=no --project=validation scripts/nb5-design-comparison.jl nb5-run-01
```

配布Notebookの計算セルを読み込み、基準・効果0・参加者2倍・項目2倍・傾きSD増大・信頼性0.5・効果10msを比較します。帰無条件300、ほか各200の合計1500反復です。CIは少数反復のI/O検査までで、この1500反復の比較は明示的に実行します。

出力先は親ディレクトリが存在し、出力先自体は未作成である必要があります。`settings.csv`・`summary.csv`・`trials.csv`を保存し、型を指定して読み戻し、保存前の値と全試行からの再集計に一致することを確認します。`scenario`と`simulation`で反復を対応づけます。欠測記号`__NB5_MISSING__`は空の例外文と区別し、同名の文字列を含む表は保存前に拒否します。

実行スクリプト・Notebook・使用したProject／Manifestも保存します。保存先のREADMEに再読込・再計算のコマンドを記載しています。既存の出力先は空でも上書きせず、途中失敗でも削除しません。最後の`NB5_DESIGN_COMPARISON_PASS`とREADMEがない場合は未完了です。照合するのはその実行の保存前後で、任意に編集されたCSVの妥当性を後日認証する機能ではありません。

条件別の点推定はMCSE・区間と併記し、参加者数と項目数の増加に伴う費用・一般化軸も検討します。欠測・除外・不均衡は未対応です。帰無条件で0.05を含む区間が得られても、第I種過誤の制御が証明されたとは解釈しません。

反復数を変える場合は、`julia --startup-file=no --project=validation`で起動したREPLから明示的に指定します。たとえば次の例は各2000・帰無3000反復です。元の実行と結果を合算せず、別の比較として扱います。

```julia
include("scripts/nb5-design-comparison.jl")
tables = NB5DesignComparison.comparison_tables(nsim = 2000, null_nsim = 3000)
NB5DesignComparison.save_comparison("nb5-run-02", tables)
```

`Project.toml` のcompatは現在実測済みのminor系列に制限し、`Manifest.toml` で解決結果を固定しています。更新時は数値検証とNotebook検証を両方実行してください。
