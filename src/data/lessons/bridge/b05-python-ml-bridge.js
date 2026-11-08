// R・Stan・Python連携5: PythonCallでPythonの機械学習資産と分業する
// 事実確認: PythonCall.jl / CondaPkg.jl 公式ドキュメントおよび Julia 列優先・NumPy 行優先のメモリ配置仕様。
export default {
  id: "julia-python-ml-bridge",
  title: "PythonCallでPythonの機械学習資産と分業する",
  tag: "基盤モデルやscikit-learnはPythonに任せ、高速シミュレーション・SciMLと安全につなぐ",
  pages: [
    {
      t: "無理に1言語で完結させず、Pythonの学習済み資産とJuliaの計算力を分業する",
      b: [
        "機械学習の領域では、テキスト・画像の事前学習済み基盤モデル（`PyTorch` / `HuggingFace`）や定型テーブルデータ周辺の診断ツール群（`scikit-learn` / `LightGBM` / `SHAP`）はPythonが圧倒的な蓄積を持っています。これらを無理にJuliaへ再実装するのは得策ではありません。",
        "逆に、Python側で遅くなりやすい「試行ごとの認知シミュレーション（DDM・強化学習）」「自作尤度・微分方程式（SciML）」はJuliaで書き、Pythonの学習済みエンコーダや `scikit-learn` と必要な配列・特徴量だけを受け渡すのが最も生産的な分業です。そのための現代的な標準ブリッジが **`PythonCall.jl`** です。",
        "この章の `PythonCall.jl` 埋め込みコード例は、教材の自動検証である定期CIの実行対象ではありません。配布テンプレートで自動検証しているRscript経由の連携とは別です。手元で試す際は、Python・パッケージの版固定と配列の軸順序・型変換を必ず確認してください。",
      ],
    },
    {
      t: "PythonCall.jl と CondaPkg.toml でPython環境をプロジェクト単位に固定する",
      b: [
        "旧来の `PyCall.jl` はマシン全体で1つのPython環境を共有しがちでしたが、`PythonCall.jl` は `CondaPkg.jl` と連携し、Juliaの `Project.toml` と同じディレクトリに **`CondaPkg.toml` を置いてPythonバージョンとパッケージ版をプロジェクトごとに隔離・固定** できます。",
        "すでに手元で管理している `.venv` や `uv` 環境を使いたい場合も、`JULIA_CONDAPKG_BACKEND=\"Null\"` と `JULIA_PYTHONCALL_EXE` で明示指定できます。「RCallでJuliaからRを呼ぶ」と同様、解析の最初に `sys.version` と主要ライブラリの `__version__` を記録します。",
      ],
      code: `# Project.toml と並べて CondaPkg.toml で Python 依存を固定する例
# [deps]
# python = ">=3.11,<3.13"
# scikit-learn = "=1.6.1"
# numpy = ">=2.0,<2.3"

using PythonCall

sys = pyimport("sys")
np  = pyimport("numpy")
skl = pyimport("sklearn")

println("Python: ", pyconvert(String, sys.version))
println("NumPy: ", pyconvert(String, np.__version__),
        " / sklearn: ", pyconvert(String, skl.__version__))`,
      a: [
        "解析スクリプトの途中で `CondaPkg.add` を動的実行すると、実行のたびに環境が変わり再現性が壊れます。環境構築と本解析を分け、ロックされた版をログに残す原則はR・Stan連携とまったく同じです。",
      ],
    },
    {
      t: "最大の落とし穴：Juliaの列優先（Column-Major）とNumPyの行優先（Row-Major）",
      b: [
        "JuliaとPythonで2次元配列（`N` サンプル × `P` 特徴量）をやり取りするとき、必ず理解しておくべきなのが **メモリ上の並び順（stride）の違い** です。Juliaの `Matrix` は **列優先（column-major: 縦方向に連続、Fortran順序）** なのに対し、NumPyやPyTorchの標準配列は **行優先（row-major: 横方向に連続、C順序）** です。",
        "`PythonCall` の `Py(X).to_numpy()`（または `PyArray`）はストライド情報 `(8, 8N)` ごと渡すため、コピーなしで正しい `(N, P)` 形状として共有されます。しかし **生バイト列や1次元バッファをそのままC順序の `(N, P)` として読み直すと、行と列のデータが混ざって破壊される** こと、またゼロコピー共有ではPython側の書き換えがJulia側の元配列も書き換えることを、純Juliaのメモリ実験で確認しましょう。",
      ],
      code: `# 2サンプル × 3特徴量の行列（1行目=[10, 20, 30], 2行目=[40, 50, 60]）
X_jl = [10.0 20.0 30.0;
        40.0 50.0 60.0]

# Juliaの線形メモリ順 (column-major): 列1→列2→列3 の順に並ぶ
raw_buf = vec(X_jl)

# 反例: この1次元メモリを「C順序(横方向に3要素ずつ並ぶ)」と誤認して 2×3 に復元した場合
wrong_c_matrix = permutedims(reshape(raw_buf, 3, 2))

# 正解: C順序の連続バッファが必須なAPIへ渡すときは、先に permutedims で転置してから平坦化する
c_contig_buf = vec(permutedims(X_jl))
right_c_matrix = permutedims(reshape(c_contig_buf, 3, 2))

println((jl_strides = strides(X_jl),
         jl_linear_mem = Int.(raw_buf),
         wrong_row1 = Int.(wrong_c_matrix[1, :]),
         right_matches = (right_c_matrix == X_jl)))`,
      out: `(jl_strides = (1, 2), jl_linear_mem = [10, 40, 20, 50, 30, 60], wrong_row1 = [10, 40, 20], right_matches = true)`,
      fig: {
        src: "figures/column-major-vs-row-major-bridge.svg",
        alt: "Juliaの列優先（Column-Major）とNumPyの行優先（Row-Major）のメモリ配置差と安全な分業設計の図解",
        cap: "左：Juliaの2×3行列は縦方向（列優先 [10, 40, 20, 50, 30, 60]）、NumPyは横方向（行優先）に並ぶため、生バッファをそのままC順序として読むと行と列が混ざる。右：Pythonの学習済み資産とJuliaの高速推定をつなぐ安全な分業構成。",
      },
      a: [
        "元の1行目は `[10, 20, 30]` だったのに、列優先メモリをC順序と取り違えると1行目が **`[10, 40, 20]`（別サンプルの値が混入！）** に化けました。形状が偶然一致したりエラーが出なかったりするため非常に危険です。`PythonCall` で `Py(X).to_numpy()` を使えば `F_CONTIGUOUS` として正しく参照されますが、PyTorchなど **C連続（`C_CONTIGUOUS`）を要求する関数へ渡すときは Python側で `np.ascontiguousarray(...)` を呼ぶか、コピー境界を明示** し、必ず小行列で1行目・1列目の値一致をテストします。",
      ],
    },
    {
      t: "scikit-learn 学習器の呼び出しと pyconvert による型安全な受け取り",
      b: [
        "`PythonCall` では、Pythonのあらゆるオブジェクトは **`Py` 型** として返ります。Julia側の後続計算や検証へ持ち込むときは、暗黙変換に頼らず **`pyconvert(Vector{Float64}, ...)` のように期待するJulia型を指定して明示変換** し、長さ・有限値・確率の範囲 `[0, 1]` を入口で検査します。",
      ],
      code: `using PythonCall

ens = pyimport("sklearn.ensemble")
clf = ens.HistGradientBoostingClassifier(max_iter = 100, random_state = 42)

# X_train (N_tr × P), y_train (N_tr), X_test (N_te × P) を渡して学習・予測確率を取得
clf.fit(Py(X_train).to_numpy(), Py(y_train).to_numpy())
prob_py = clf.predict_proba(Py(X_test).to_numpy())

# 2列目（陽性クラス確率、Pythonは0始まりなので index 1）だけを Vector{Float64} へ変換
pos_prob = pyconvert(Vector{Float64}, prob_py[pyslice(nothing), 1])

@assert length(pos_prob) == size(X_test, 1)
@assert all(p -> isfinite(p) && 0.0 <= p <= 1.0, pos_prob)`,
      a: [
        "**Pythonは `0` 始まり、Juliaは `1` 始まり** である点にも注意してください。上の `prob_py[:, 1]`（`pyslice(nothing), 1`）はPythonの2列目（陽性クラス `class 1`）を指します。PythonオブジェクトをそのままJuliaのループ内で何万回もインデックス参照すると言語境界のオーバーヘッドがかかるため、必要な配列だけを一度 `pyconvert` でJuliaの `Vector{Float64}` / `Matrix{Float64}` に戻してから集計します。",
      ],
    },
    {
      t: "インプロセス連携を避け、Arrow・ONNXのファイル／推論契約へ切り替える基準",
      b: [
        "`PythonCall` による同一プロセス内連携は手軽ですが、万能ではありません。次の3場面ではインプロセス埋め込みを避け、「R・Stanへ渡すデータの契約」と同じ **プロセス分離＋言語中立ファイル契約** を選びます。",
        "① **マルチスレッド競合**: Juliaの `Threads.@threads` から同時にPython関数を呼ぶと、Pythonの **GIL（Global Interpreter Lock）** で直列化されるかクラッシュの原因になります。② **GPUメモリの取り合い**: `PyTorch` とJuliaの `CUDA.jl` を同一プロセスで同時に動かすとVRAMアロケータが競合しやすくなります。③ **長時間バッチ・学習済みテキスト埋め込み**: Python側で事前学習モデルの特徴量抽出だけを済ませて **`Arrow.write`（Parquet / Arrow IPC）＋ `schema.toml` ＋ SHA-256** で書き出し、Julia側がメモリマップで読んで独自推定やSciMLを回す方が、環境が壊れにくく監査も容易です（推論だけなら `ONNX` 形式で受け渡す手もあります）。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "テキストの事前学習済み大規模言語モデル（HuggingFace / PyTorch）から文ごとの埋め込みベクトルを取り出し、それを使って参加者の反応時間と選択をドリフト拡散モデル（DDM）の自作尤度で階層推定したいとします。最も堅牢で保守しやすい分業設計はどれでしょう?",
      opts: [
        "Transformerの事前学習モデル自体をゼロから素のJuliaで書き直して再学習する",
        "DDMの試行ごと乱数シミュレーションと自作尤度のループをすべて純Pythonのfor文で書く",
        "Pythonスクリプトで学習済みモデルから埋め込み表を抽出してスキーマ・SHA-256つきのArrow/CSVに保存し、Juliaで読み込んで高速なDDM推定を回す（小規模ならPythonCallで境界型検査つき連携）",
        "配列の形状さえ合っていれば、版記録や列・行順序の確認なしにバイナリメモリを直接共有する",
      ],
      ans: 2,
      why: "事前学習済み基盤モデルはPythonの資産を活かし、計算集約的な独自シミュレーション・尤度推定はJuliaで担うのが適材適所の分業です。特にGPUモデルと長時間推定を組み合わせる場合は、Arrow/CSVとチェックサムによるプロセス分離がVRAM競合や環境破損を防ぎます。",
      hint: "それぞれの言語が最も得意な工程と、GPU・再現性の境界を考えます。",
    },
    {
      k: "fill",
      q: "`PythonCall.jl` でPython側から返ってきた `Py` オブジェクト `py_vec` を、Juliaの `Vector{Float64}` 型へ明示的に変換します。空欄〔?〕に入る関数名を入力しましょう。",
      code: `jl_vec = 〔?〕(Vector{Float64}, py_vec)`,
      accept: ["pyconvert"],
      show: "pyconvert",
      why: "`PythonCall.jl` では `pyconvert(T, x)` で変換先のJulia型 `T` を明示して受け取ります（`RCall.jl` の `rcopy` に相当する境界変換です）。",
      hint: "`py` で始まり、「変換する（convert）」を意味する関数名です。",
      placeholder: "関数名",
    },
    {
      k: "tf",
      q: "JuliaとPython（NumPy / scikit-learn / PyTorch）の連携におけるメモリ・添字・並列化の注意点について、正しいか判定しましょう。",
      items: [
        {
          s: "Juliaの標準 `Matrix` は列優先（column-major）でメモリに並ぶため、生メモリバッファをそのままC順序（row-major）の同形状配列として解釈すると別サンプル・別特徴量の値が混ざる",
          a: true,
          why: "列優先と行優先ではメモリ上の要素の並び順が異なります。ストライド情報を保つ `Py(X).to_numpy()` を使うか、C連続配列が必要な場合は明示的な変換と小行列での値照合を行います。",
        },
        {
          s: "Pythonの2列確率配列 `prob_py` から2列目（陽性クラス）を取り出すときの添字は、Juliaと同じ `1` 始まりなので `prob_py[:, 2]` である",
          a: false,
          why: "Python側の添字は `0` 始まりなので、2列目はインデックス `1` です（`2` を指定すると範囲外エラーになるか3列目を読んでしまいます）。",
        },
        {
          s: "Juliaの `Threads.@threads` ループの中から同一プロセス内のPythonオブジェクトを複数スレッドで同時に呼び出せば、GILの制約なしに常に線形スピードアップする",
          a: false,
          why: "通常のPythonランタイムにはGIL（Global Interpreter Lock）があるため、Juliaのマルチスレッドから無防備に同時呼び出しを行うと競合・クラッシュや直列化の原因になります。",
        },
      ],
      hint: "列優先対行優先、`0` 始まり対 `1` 始まり、そしてPythonのGILを思い出します。",
    },
    {
      k: "choice",
      q: "`PyArray` や `Py(X).to_numpy()` のようにコピーなし（zero-copy）でJuliaの配列 `X` をPython側とメモリ共有しているとき、Pythonの関数が受け取った配列をインプレース（`arr *= 0` など）で書き換えるとどうなるでしょう?",
      opts: [
        "言語境界を越える際に常に自動でディープコピーされるため、Julia側の `X` は一切変化しない",
        "同じメモリ領域を指しているため、Julia側の元の配列 `X` の中身も書き換わる",
        "型が自動的に `String` に変わる",
        "Julia側からは二度と `X` を読めなくなる",
      ],
      ans: 1,
      why: "ゼロコピー共有は大規模配列の転送コストを省ける反面、Python側のインプレース変更（`copy=False` の前処理など）がJulia側の元データも直接破壊します。元データを保護したい場合は `copy(X)` を渡すか不変契約を確認します。",
      hint: "「コピーを作らず同じメモリアドレスを共有する」ことの裏返しを考えます。",
    },
  ],
};
