// レッスン: 並列モンテカルロと乱数設計 — 再現性を壊さずにシミュレーションを並列化する
// 公式仕様: https://docs.julialang.org/en/v1/manual/multi-threading/
//           https://docs.julialang.org/en/v1/stdlib/Random/
export default {
  id: "parallel-monte-carlo",
  title: "並列モンテカルロと乱数設計",
  tag: "再現性を壊さずにシミュレーションを並列化する",
  pages: [
    {
      t: "「並列化したら毎回結果が変わる」を防ぐ",
      b: [
        "「デザインの検定力設計」で扱った混合効果モデルの検定力シミュレーションや、数千回のブートストラップは、各反復が互いに独立しているためマルチスレッド並列化と抜群に相性がよい計算です。Juliaを `julia --threads=auto`（短縮形 `-t auto`）で起動すれば、複数コアをそのまま使えます。",
        "ところが、逐次実行のコードを不用意に `Threads.@threads` で囲むと、①同じシードなのに実行のたびに値が変わる、②配列への `push!` でデータが欠落・クラッシュする、という2つの典型的な事故が起きます。",
        "この章では、**スレッド数や実行順序が変わっても1ビットの狂いもなく同じ乱数と結果を再現する並列モンテカルロ設計**を身につけます。",
      ],
    },
    {
      t: "なぜ1つのRNGや push! を複数スレッドで共有してはいけないのか",
      b: [
        "`rng = Xoshiro(2026)` で作った1つの乱数生成器を複数スレッドから同時に `rand(rng, ...)` で引くと、内部状態の読み書きが競合（データ競合）します。OSがどのスレッドを先に動かすかは毎回微妙に揺れるため、どの反復が乱数列の何番目を受け取るかが不定になり、状態そのものも壊れ得ます。",
        "同様に、空の配列 `hits = Bool[]` へ複数スレッドから同時に `push!` すると、メモリの再確保が衝突して要素が消えたりクラッシュしたりします。",
      ],
      code: `# やってはいけない例(データ競合):
# rng = Xoshiro(2026)
# results = Float64[]
# Threads.@threads for i in 1:1000
#     push!(results, mean(rand(rng, 30))) # RNG競合 + push!競合!
# end

# 正しい基本方針:
# 1. 反復 i ごとに独立した専用の RNG を作る
# 2. 長さ nsim の配列を先に確保し、反復 i は out[i] だけに書き込む`,
      a: [
        "並列計算で安全と速さを両立する秘訣は「ロック（排他制御）を頑張る」ことではなく、最初から**スレッド間で書き換え対象を共有しない設計**にすることです。",
      ],
    },
    {
      t: "反復IDから決定論的にRNGを作る：trial_rng(seed, i)",
      b: [
        "Juliaの `Xoshiro` は、`UInt64` の配列をシードとして受け取れます。`Xoshiro(UInt64[base_seed, sim_id])` のように「研究全体の基準シード」と「反復番号 `i`」の組から生成器を作れば、反復 `i` が使う乱数列は他の反復やスレッド割当から完全に独立します。",
      ],
      fig: {
        src: "figures/parallel-rng-streams-speedup.svg",
        alt: "スレッド共有RNGの競合とtrial_rng(seed, i)による独立乱数設計および並列スピードアップ比較図",
        cap: "図: 左は共有RNG・push!の競合（上）と反復IDごとの独立RNG＋事前確保配列（下）の比較。右はヒープ割当・BLAS競合を抑えたときのマルチスレッド加速率。",
      },
      code: `using Random, Statistics, Distributions

trial_rng(base_seed::Integer, sim_id::Integer) =
    Xoshiro(UInt64[UInt64(base_seed), UInt64(sim_id)])

function welch_trial(rng::AbstractRNG, n::Int, delta::Float64)
    a = rand(rng, Normal(500.0, 50.0), n)
    b = rand(rng, Normal(500.0 + delta, 50.0), n)
    diff = mean(b) - mean(a)
    se = sqrt(var(a) / n + var(b) / n)
    df = (var(a) / n + var(b) / n)^2 /
         ((var(a) / n)^2 / (n - 1) + (var(b) / n)^2 / (n - 1))
    p_val = 2 * ccdf(TDist(df), abs(diff) / se)
    return (diff = diff, p_val = p_val, hit = p_val < 0.05)
end

function run_serial_mc(base_seed::Int, nsim::Int)
    out = Vector{NamedTuple{(:diff, :p_val, :hit), Tuple{Float64, Float64, Bool}}}(undef, nsim)
    for i in 1:nsim
        out[i] = welch_trial(trial_rng(base_seed, i), 30, 25.0)
    end
    return out
end

function run_threaded_mc(base_seed::Int, nsim::Int)
    out = Vector{NamedTuple{(:diff, :p_val, :hit), Tuple{Float64, Float64, Bool}}}(undef, nsim)
    Threads.@threads for i in 1:nsim
        out[i] = welch_trial(trial_rng(base_seed, i), 30, 25.0)
    end
    return out
end

s_res = run_serial_mc(2026, 400)
t_res = run_threaded_mc(2026, 400)
p_hat = mean(r.hit for r in t_res)
mcse = sqrt(p_hat * (1 - p_hat) / length(t_res))
println(s_res == t_res)
println((power = round(p_hat, digits = 3), mcse = round(mcse, digits = 3)))`,
      out: `true
(power = 0.482, mcse = 0.025)`,
      a: [
        "`s_res == t_res` が `true` になりました。1スレッドのノートPCで回しても、16スレッドの計算サーバで回しても、400反復すべての効果量・p値・有意判定が完全に一致します。",
        "なお、事前にメインスレッドで `seeds = rand(Xoshiro(2026), UInt64, nsim)` とシード配列を一括生成し、ループ内で `Xoshiro(seeds[i])` とする方法でも同じ独立性が得られます。",
      ],
    },
    {
      t: "副産物：特定の1反復だけを瞬時に再現してデバッグできる",
      b: [
        "反復番号ごとのシード設計には、もう一つ大きな実務上の利点があります。混合モデルや非線形最適化を1万回回したとき、「第317反復だけ未収束や異常値が出た」と記録されていれば、1〜316回目を回さずに第317反復の合成データだけを即座に復元できます。",
      ],
      code: `r317 = welch_trial(trial_rng(2026, 317), 30, 25.0)
println(r317 == s_res[317])
println((diff = round(r317.diff, digits = 2),
         p_val = round(r317.p_val, digits = 4),
         hit = r317.hit))`,
      out: `true
(diff = 15.94, p_val = 0.229, hit = false)`,
      a: [
        "1本の共有RNGを順番に消費する設計では、途中の1反復で乱数の消費個数が変わると後続のすべての反復が玉突きで変わってしまいます。`trial_rng(base_seed, sim_id)` なら反復どうしの結合が切れ、異常ケースの検証や追加反復（401〜1000回目だけの追記）が明快になります。",
      ],
    },
    {
      t: "並列化しても速くならない3つの原因とBLASスレッド競合",
      b: [
        "8コア使えば必ず8倍速くなるわけではありません。実務で並列モンテカルロが遅くなる主な原因は次の3つです。",
        "① **粒度が細かすぎる**：1反復が数マイクロ秒で終わる計算を毎回スレッドに割り振ると、仕事そのものよりスケジューリングの手間が勝ちます。軽い処理はチャンク（塊）にまとめる方が有利です。",
        "② **ヒープ割当過多によるGC停止**：全スレッドが大量の一時配列を作り続けると、ガベージコレクタが動くたびに全スレッドが一斉停止します。「型安定性とメモリ割当」の知識が並列化でこそ効きます。",
        "③ **BLASスレッドの二重並列化（oversubscription）**：回帰や混合モデルの内部で行列演算（OpenBLAS等）自体がマルチスレッドで動いていると、`Threads.@threads` と掛け算でスレッドが溢れて逆に遅くなります。外側を並列化するときは `using LinearAlgebra; BLAS.set_num_threads(1)` で内側の行列スレッドを1本に絞るのが定石です。",
      ],
      code: `using LinearAlgebra

# 外側のモンテカルロ反復を Threads.@threads で回す前の定石:
# BLAS.set_num_threads(1)
println(Threads.nthreads() >= 1)`,
      out: `true`,
      a: [
        "最後に、並列コードを書いたら必ず小さな反復数（例：`nsim = 50`）で「逐次実行の関数と結果が完全一致する（`run_serial_mc == run_threaded_mc`）」という自動テストを1本置いてから本番の1万反復へ進みましょう。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "1つの `rng = Xoshiro(2026)` を `Threads.@threads` ループの外で作り、各スレッドから直接 `rand(rng, ...)` を呼んだときに起きる問題は何でしょう?",
      opts: [
        "スレッド間でRNG内部状態の読み書きが競合し、再現性が壊れるだけでなく状態破損の原因になる",
        "自動的にスレッド数ぶんの独立した `Xoshiro` に複製されるため、問題なく再現できる",
        "Juliaのコンパイラが必ず構文エラーとして実行前に停止してくれる",
      ],
      ans: 0,
      why: "`Xoshiro` の状態更新は複数スレッドからの同時呼び出しに対して安全ではなく、OSのスレッド実行順によっても乱数の割り当てが変わります。反復ごとに独立したRNGを渡します。",
      hint: "複数の人が同じ1冊の乱数表の「現在位置メモ」を同時に書き換えたら何が起きるかを想像してみましょう。",
    },
    {
      k: "fill",
      q: "長さ `nsim` の事前確保配列 `out` に対し、`for` ループをマルチスレッドで並列実行します。空欄〔?〕に入るマクロ名を入力しましょう（`Threads.` を含む）。",
      code: `〔?〕 for i in 1:nsim
    out[i] = welch_trial(trial_rng(2026, i), 30, 25.0)
end`,
      accept: ["threads.@threads"],
      show: "Threads.@threads",
      why: "`Threads.@threads` はループ範囲を複数スレッドへ分配して実行します。各反復が `out[i]` だけに書き込み、独立な `trial_rng(2026, i)` を使うためデータ競合が起きません。",
      hint: "`Threads` モジュールにある `@threads` マクロです。",
      placeholder: "モジュール名.@マクロ名",
    },
    {
      k: "tf",
      q: "並列モンテカルロの設計について、それぞれ正しいか判定しましょう。",
      items: [
        {
          s: "`Xoshiro(UInt64[base_seed, i])` のように反復番号 `i` ごとにRNGを作れば、スレッド数が変わっても `out[i]` の結果は一致する",
          a: true,
          why: "反復 `i` の乱数列が `base_seed` と `i` だけで決まり、他の反復の実行順序やスレッド割当に依存しないためです。",
        },
        {
          s: "空の配列 `out = Float64[]` に複数スレッドから同時に `push!(out, val)` しても安全に全要素が保存される",
          a: false,
          why: "`Vector` への同時 `push!` はデータ競合を起こし、要素の欠落やクラッシュにつながります。先に `Vector{T}(undef, nsim)` を確保して `out[i] = val` と書き込みます。",
        },
        {
          s: "外側を `Threads.@threads` で並列化する際、内部で重い行列計算を行うなら `BLAS.set_num_threads(1)` が有効な場合がある",
          a: true,
          why: "外側と内側の両方でマルチスレッドが動くとCPUコア数を大幅に超えるスレッドが競合（oversubscription）し、かえって遅くなるのを防げます。",
        },
      ],
      hint: "RNGの独立性、配列への同時書き込み、そして二重並列化の3点を振り返りましょう。",
    },
    {
      k: "choice",
      q: "1万回のシミュレーションで「第4812反復だけモデル適合が収束しなかった」と記録されました。`trial_rng(2026, i)` 設計の利点として適切なものはどれでしょう?",
      opts: [
        "1〜4811反復目をやり直さなくても、`trial_rng(2026, 4812)` から第4812反復のデータを単独で完全再現して原因を調べられる",
        "未収束だった第4812反復が自動的に除外され、分母9999回として検定力が再計算される",
        "シードを変えなくても第4812反復だけ自動的に別の乱数で引き直される",
      ],
      ans: 0,
      why: "各反復の乱数列が独立しているため、問題が起きた反復番号だけを取り出して即座に再現・診断できます。未収束の自動除外や都合のよい引き直しは「デザインの検定力設計」で学んだ通りバイアスの原因になります。",
      hint: "共有RNGを先頭から消費する方式と比べたとき、途中の1回だけを調べる手間がどう変わるか考えましょう。",
    },
  ],
};
