// レッスン: 大規模データの分割読込と省メモリ集計 — 全件をメモリに載せず、正確な要約と検証を保つ
// 公式仕様: https://csv.juliadata.org/stable/reading.html
//           https://arrow.apache.org/julia/dev/manual/
export default {
  id: "streaming-chunked-aggregation",
  title: "大規模データの分割読込と省メモリ集計",
  tag: "全件をメモリに載せず、正確な要約と検証を保つ",
  pages: [
    {
      t: "全件 DataFrame 読込が詰まる場面と、分割処理の原則",
      b: [
        "1000 Hzの視線計測、脳波・生理指標の連続記録、大規模オンライン実験の行動ログでは、CSVが数ギガバイト・数千万行に達することがあります。これを一度に `CSV.read(path, DataFrame)` で読み込むと、PCのメモリを使い切って停止したり極端に遅くなったりします。",
        "対策はシンプルで、①ファイルを一定行数ずつの塊（チャンク）または行ストリームとして順に読む、②各チャンクを小さな十分統計量へ圧縮してから結合する、または③最初から必要な列だけをゼロコピーで参照できる列指向形式（`Arrow`）へ変換する、の3段階です。",
        "ただし、どんな統計量でもチャンクごとの結果を単純平均してよいわけではありません。この章では「正確に結合できる要約」と「単純結合すると誤る要約」を明確に分けます。",
      ],
    },
    {
      t: "Chan–Welford法：チャンクごとの平均・分散を桁落ちなく結合する",
      b: [
        "「確率変数と確率分布」で学んだとおり、`sum(x.^2) - n * mean(x)^2` による1パス分散計算は、大きな基準値の周りで微小に揺れるデータ（タイムスタンプや高精度センサー値など）で深刻な桁落ちを起こします。",
        "チャンクごとに「件数 `n`・平均 `mean`・平均からの偏差二乗和 `m2`」の3つだけを保持する **RunningStats（Welfordの逐次更新＋Chanの並列・分割結合公式）** を使えば、メモリ使用量は常に定数のまま、全件一括計算と一致する平均と不偏分散が得られます。",
      ],
      code: `struct RunningStats
    n::Int
    mean::Float64
    m2::Float64
end
RunningStats() = RunningStats(0, 0.0, 0.0)

function push_value(s::RunningStats, x::Real)
    isfinite(x) || throw(ArgumentError("非有限値が含まれています"))
    n1 = s.n + 1
    delta = Float64(x) - s.mean
    mean1 = s.mean + delta / n1
    return RunningStats(n1, mean1, s.m2 + delta * (Float64(x) - mean1))
end

function merge_stats(a::RunningStats, b::RunningStats)
    a.n == 0 && return b
    b.n == 0 && return a
    n = a.n + b.n
    delta = b.mean - a.mean
    return RunningStats(
        n,
        a.mean + delta * (b.n / n),
        a.m2 + b.m2 + delta^2 * (a.n * b.n / n),
    )
end
sample_var(s::RunningStats) = s.m2 / (s.n - 1)`,
      fig: {
        src: "figures/welford-chunk-streaming-arrow.svg",
        alt: "CSV.Chunks と Chan–Welford 法による定数メモリ厳密結合と、チャンク中央値平均の反例・Arrow省メモリ比較図",
        cap: "左：RunningStats（件数・平均・偏差二乗和 M2）はチャンクごとに分割集計しても全件一括と厳密一致するが、中央値の単純平均は不一致になる。右：全件CSV展開に対する CSV.Chunks と Arrow mmap の省メモリ効果。",
      },
      a: [
        "`merge_stats(a, b)` はチャンクのサイズ `a.n` と `b.n` が不均等でも成り立ち、さらに前章のマルチスレッド並列集計（スレッドごとに `RunningStats` を作って最後に結合する）にもそのまま使えます。",
      ],
    },
    {
      t: "CSV.Chunks で分割読込し、全件読込と一致するか検証する",
      b: [
        "`CSV.Chunks(path; ntasks = 4, types = ...)` はファイルをチャンク単位で順に読み出すイテレータを返します。補講「複数CSVと分析成果物の入出力」と同じく、分割読込でも `types` を明示して途中のチャンクで列型が変わる事故を防ぎます。",
      ],
      code: `using Random, Statistics, Distributions, CSV, DataFrames

# 10^8 の大きなオフセットを持つ 1000 行の検証用データ
rng = Xoshiro(4401)
rt_shifted = 1.0e8 .+ round.(rand(rng, LogNormal(log(520.0), 0.25), 1000), digits = 3)
df_ref = DataFrame(trial = 1:1000, cond = repeat(["cong", "incong"], 500), rt = rt_shifted)

mktempdir() do dir
    path = joinpath(dir, "stream.csv")
    CSV.write(path, df_ref)

    merged = RunningStats()
    for chunk in CSV.Chunks(path; ntasks = 4,
                            types = Dict(:trial => Int, :cond => String, :rt => Float64))
        local_s = RunningStats()
        for v in chunk.rt
            local_s = push_value(local_s, v)
        end
        merged = merge_stats(merged, local_s)
    end

    println(merged.n)
    println(isapprox(merged.mean, mean(df_ref.rt); rtol = 1e-14))
    println(isapprox(sample_var(merged), var(df_ref.rt); rtol = 1e-11))
end`,
      out: `1000
true
true`,
      a: [
        "1行ずつ最小メモリで走査したい場合は `CSV.Rows(path; types = ...)` も使えます。いずれの方法でも、本番の巨大ファイルへかける前に「小さな標本ファイルで `CSV.read` 全件集計と結果が一致すること」を必ずテストします。",
      ],
    },
    {
      t: "反例：チャンクごとの中央値や分位点は平均してはいけない",
      b: [
        "合計・件数・平均・偏差二乗和・最小値・最大値は、チャンクごとの要約から全体の厳密値を復元できます。しかし**中央値（median）や分位点（quantile）は加法的な十分統計量ではない**ため、チャンク別の中央値を平均すると間違った値になります。",
      ],
      code: `using Statistics

chunk1 = [1.0, 2.0, 3.0, 100.0, 110.0] # 中央値は 3.0
chunk2 = [120.0]                        # 中央値は 120.0

wrong_median = mean([median(chunk1), median(chunk2)])
true_median  = median(vcat(chunk1, chunk2))

println(wrong_median)
println(true_median)`,
      out: `61.5
51.5`,
      a: [
        "同じ間違いは「参加者ごとの平均のSD」と「全試行のSD」を混同するときや、チャンクごとの相関係数を単純平均するときにも起きます。",
        "大規模データで全体の正確な分位点が必要な場合は、対象となる1列だけを `Arrow` から読み出すか、値域が既知の離散・整数単位なら細かな度数表（ヒストグラム）を結合して求めます。",
      ],
    },
    {
      t: "何度も分析する大規模データは一度CSVからArrowへ変換する",
      b: [
        "生ログが巨大なCSVで届いたとき、分析スクリプトを回すたびに何十秒もテキスト解析を繰り返すのは非効率です。最初に一度だけ入力監査つきの変換スクリプトで `Arrow` 形式へ書き出しておけば、以降はメモリマップ（mmap）によって必要な列だけを瞬時に参照できます。",
      ],
      code: `using Arrow, DataFrames, Statistics

mktempdir() do dir
    arrow_path = joinpath(dir, "trials.arrow")
    df = DataFrame(id = 1:4, cond = ["c", "i", "c", "i"], rt = [501.0, 588.0, 492.0, 610.0])
    Arrow.write(arrow_path, df)

    # 全列を DataFrame へ複製せず、列テーブルとして参照する
    tbl = Arrow.Table(read(arrow_path))
    println(round(mean(tbl.rt), digits = 2))
end`,
      out: `547.75`,
      a: [
        "通常の分析では `Arrow.Table(arrow_path)` とファイルパスを直接渡せばOSのメモリマップが効き、たとえば50列ある表から `tbl.rt` の1列だけを読むコストが劇的に下がります（上の例では一時ディレクトリ削除時にWindowsでファイルハンドルが残らないよう `read(arrow_path)` 経由で渡しています）。",
        "「生データのCSVは読み取り専用で保全し、検証済みの型つき `Arrow` を派生データとして作って高速に分析する」——これが大規模研究データの堅実な運用パターンです。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "チャンクごとの要約だけから、データ全体の「厳密な値」を常に復元できる組み合わせはどれでしょう?",
      opts: [
        "件数 `n`・平均 `mean`・偏差二乗和 `m2`・最小値・最大値",
        "チャンク別に計算した標本中央値 `median` と四分位範囲 `IQR`",
        "チャンク別のスピアマン順位相関係数",
      ],
      ans: 0,
      why: "件数・平均・偏差二乗和はChan–Welfordの結合公式で全体の平均・分散へ厳密に統合でき、最小・最大も `min` / `max` で結合できます。一方、中央値や順位相関はチャンク要約だけでは全体の順序を復元できません。",
      hint: "本文の反例で、チャンク1とチャンク2を合わせたときに値がずれた統計量はどれだったでしょうか。",
    },
    {
      k: "fill",
      q: "巨大なCSVファイルを一度に全件メモリへ展開せず、分割されたチャンクのイテレータとして順に読み込む `CSV.jl` の機能名を入力しましょう（`CSV.` を含む）。",
      code: `for chunk in 〔?〕("huge_log.csv"; ntasks = 4, types = schema)
    # チャンクごとに集計する
end`,
      accept: ["csv.chunks"],
      show: "CSV.Chunks",
      why: "`CSV.Chunks` はCSVを複数の塊に分けて読み出すイテレータを返します。`types` でスキーマを固定すれば、途中のチャンクでの型推論の揺れも防げます。",
      hint: "塊（chunk）の複数形が `CSV.` の後ろに続きます（先頭大文字）。",
      placeholder: "CSV.機能名",
    },
    {
      k: "tf",
      q: "大規模データの分割集計と保存形式について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "`merge_stats`（Chanの結合公式）は、2つのチャンクの行数 `a.n` と `b.n` が異なっていても全体の平均と偏差二乗和を正確に結合できる",
          a: true,
          why: "各チャンクの件数 `a.n` と `b.n` で重みづけし、チャンク間平均差の寄与 `delta^2 * (a.n * b.n / n)` を加えるため、端数チャンクがあっても厳密に一致します。",
        },
        {
          s: "各チャンクの中央値を求めてから平均すれば、必ず全データを並べたときの中央値と一致する",
          a: false,
          why: "本文の反例のとおり、`[1, 2, 3, 100, 110]`（中央値3）と `[120]`（中央値120）ではチャンク中央値の平均は `61.5` になり、真の中央値 `51.5` と一致しません。",
        },
        {
          s: "何度も繰り返し列単位で集計する大規模データは、生のCSVを保護したうえで検証済みの `Arrow` 形式に変換しておくと効率よく参照できる",
          a: true,
          why: "`Arrow` は列指向のバイナリ形式で型情報も保持するため、毎回のテキスト解析を避けて必要な列だけを高速に扱えます。",
        },
      ],
      hint: "不均等なチャンクサイズでの結合式、中央値の反例、列指向フォーマットの特徴を確認しましょう。",
    },
    {
      k: "choice",
      q: "分割読込・省メモリ集計パイプラインを本番の数千万行データへ適用する前の検証手順として、もっとも適切なものはどれでしょう?",
      opts: [
        "まず数千行の小規模テストデータで通常の `CSV.read` 全件集計と結果が一致することと、非有限値や型違反で意図通り停止することをテストする",
        "データが大きいので小規模テストは省略し、最初から本番データだけを流してエラーが出なければ正しいとみなす",
        "途中で数値に変換できない壊れた行があっても止まらないよう、すべての例外を握りつぶして0に置き換える",
      ],
      ans: 0,
      why: "チャンク境界での結合ミスや型の不一致は、エラーを出さずに集計値だけを狂わせることがあります。全件読込できる小規模データでの同値性テストと異常系テストを先に通すのが鉄則です。",
      hint: "エラーなく終了したことと、計算結果が全件集計と一致することは同じでしょうか?",
    },
  ],
};
