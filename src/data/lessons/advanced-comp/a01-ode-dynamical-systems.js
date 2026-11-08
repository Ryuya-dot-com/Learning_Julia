// レッスン: 微分方程式と動的システム — 時間発展モデルを誤差と割当を制御して解く
// 公式仕様: https://docs.sciml.ai/DiffEqDocs/stable/
export default {
  id: "ode-dynamical-simulation",
  title: "微分方程式と動的システム",
  tag: "時間発展モデルを誤差と割当を制御して解く",
  pages: [
    {
      t: "「時点ごとの回帰」から「変化の法則」を書くモデルへ",
      b: [
        "練習によるスキルの習熟と忘却、感染症や情報の広がり（SIRモデル）、神経活動の減衰と発火など、多くの自然・人間現象は「いまの状態 `u` から次の瞬間の変化速度 `du/dt` が決まる」という常微分方程式（ODE）で表されます。",
        "Juliaは科学技術計算エコシステム `DifferentialEquations.jl`（SciML）の本拠地であり、RやPythonから呼び出されるほど高速で豊富なソルバを備えています。その恩恵を正しく使いこなすには、①数値積分の刻み幅と近似次数、②ステップが大きすぎるときに起きる数値振動、③`du` を書き換える in-place 形式（`rhs!(du, u, p, t)`）による割当ゼロ化、の3つの基礎が欠かせません。",
      ],
    },
    {
      t: "Euler法と4次Runge–Kutta法（RK4）：同じ刻み幅で誤差が500倍違う",
      b: [
        "上限 `K = 1.0` に向かって速度 `r = 0.8` で習熟する学習曲線 `du/dt = r * (K - u)`（初期値 `u(0) = 0.2`）を考えます。この式には厳密な解析解 `u(t) = K - (K - u₀) * exp(-r * t)` があるため、数値解法の誤差を直接測れます。",
        "現在の傾きだけで1歩進む陽的Euler法は1次精度（誤差が `dt` に比例）なのに対し、区間内の4箇所の傾きを重み付き平均する古典的4次Runge–Kutta法（RK4）は4次精度（誤差が `dt^4` に比例）を持ちます。",
      ],
      code: `exact_learning(t; u0 = 0.2, K = 1.0, r = 0.8) = K - (K - u0) * exp(-r * t)
f_learn(u, _t) = 0.8 * (1.0 - u)

function solve_euler(f, u0::Float64, dt::Float64, nsteps::Int)
    u, t = u0, 0.0
    for _ in 1:nsteps
        u += dt * f(u, t)
        t += dt
    end
    return u
end

function solve_rk4(f, u0::Float64, dt::Float64, nsteps::Int)
    u, t = u0, 0.0
    for _ in 1:nsteps
        k1 = f(u, t)
        k2 = f(u + 0.5 * dt * k1, t + 0.5 * dt)
        k3 = f(u + 0.5 * dt * k2, t + 0.5 * dt)
        k4 = f(u + dt * k3, t + dt)
        u += (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
        t += dt
    end
    return u
end

u_ex = exact_learning(5.0)
u_eu = solve_euler(f_learn, 0.2, 0.5, 10)
u_rk = solve_rk4(f_learn, 0.2, 0.5, 10)
println((exact = round(u_ex, digits = 6),
         euler = round(u_eu, digits = 6),
         rk4   = round(u_rk, digits = 6)))
println((euler_err = round(abs(u_eu - u_ex), sigdigits = 3),
         rk4_err   = round(abs(u_rk - u_ex), sigdigits = 3)))`,
      out: `(exact = 0.985347, euler = 0.995163, rk4 = 0.98533)
(euler_err = 0.00982, rk4_err = 1.75e-5)`,
      a: [
        "同じ `dt = 0.5`（10ステップ）でも、Euler法の誤差 `0.00982` に対してRK4の誤差は `1.75e-5` と約560分の1に縮まりました。実務のソルバ（`Tsit5()` など）は、さらに局所誤差を見積もって `dt` を自動調整します。",
      ],
    },
    {
      t: "反例：刻み幅が大きすぎると「あり得ない負の値や振動」が生まれる",
      b: [
        "数値積分の失敗は「少しズレる」だけでは済みません。変化速度 `r = 3.0` の減衰系に `dt = 0.8` で陽的Euler法を当てると、`r * dt = 2.4 > 2.0` となって安定領域を超え、真の解は滑らかに `1.0` へ近づくのに数値解は上下に激しく振動・発散します。",
      ],
      code: `f_stiff(u, _t) = 3.0 * (1.0 - u)

u1 = solve_euler(f_stiff, 0.0, 0.8, 1) # t = 0.8
u2 = solve_euler(f_stiff, 0.0, 0.8, 2) # t = 1.6
println((step1 = round(u1, digits = 2), step2 = round(u2, digits = 2)))`,
      out: `(step1 = 2.4, step2 = -0.96)`,
      fig: {
        src: "figures/euler-vs-rk4.svg",
        alt: "左パネルは学習曲線における解析解と陽的Euler・RK4の比較。右パネルは r*dt = 2.4 > 2 のとき陽的Eulerが上限1.0を超えて上下に発散振動する様子。",
        cap: "左：緩やかな系でもEuler法は上振れし、RK4は解析解と重なります。右：速い減衰系で刻み幅が安定限界（r·dt ≤ 2）を超えると、割合や濃度なのに 2.4 → -0.96 と非物理的な振動を起こします。",
      },
      a: [
        "速い反応と遅い反応が混在する「硬い（stiff）方程式」では、陽的手法のままだと極小の `dt` を強いられます。その場合は陰的解法（`Rodas5P()` 等）へ切り替えるのが定石です。",
      ],
    },
    {
      t: "多変量システムの基本形：rhs!(du, u, p, t) で割当ゼロにする",
      b: [
        "感受性保持者 `S`・感染者 `I`・回復者 `R` の3変数が連動するSIRモデルのように、状態がベクトルになる系では、毎ステップ `[dS, dI, dR]` と新しい配列を作って返すと何万ステップものループで大量のヒープ割当が発生します。",
        "そこで第1引数に出力先バッファ `du` を受け取って中身を書き換える `sir_rhs!(du, u, p, t)` の形にします。これは `DifferentialEquations.jl` の `ODEProblem` が採用している標準インターフェースそのものです。",
      ],
      code: `function sir_rhs!(du::Vector{Float64}, u::Vector{Float64}, p::NamedTuple, _t::Float64)
    S, I, _R = u[1], u[2], u[3]
    inf_flow = p.beta * S * I / p.N
    rec_flow = p.gamma * I
    du[1] = -inf_flow
    du[2] = inf_flow - rec_flow
    du[3] = rec_flow
    return nothing
end

function rk4_step!(u, rhs!, p, t, dt, k1, k2, k3, k4, tmp)
    rhs!(k1, u, p, t)
    @. tmp = u + 0.5 * dt * k1
    rhs!(k2, tmp, p, t + 0.5 * dt)
    @. tmp = u + 0.5 * dt * k2
    rhs!(k3, tmp, p, t + 0.5 * dt)
    @. tmp = u + dt * k3
    rhs!(k4, tmp, p, t + dt)
    @. u = u + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
    return nothing
end

p_sir = (beta = 0.45, gamma = 0.15, N = 1000.0)
u = [995.0, 5.0, 0.0]
k1, k2, k3, k4, tmp = zeros(3), zeros(3), zeros(3), zeros(3), zeros(3)
sir_rhs!(k1, u, p_sir, 0.0)
println(@allocated sir_rhs!(k1, u, p_sir, 0.0))

peak_I = u[2]
for step in 0:159
    rk4_step!(u, sir_rhs!, p_sir, step * 0.25, 0.25, k1, k2, k3, k4, tmp)
    u[2] > peak_I && (peak_I = u[2])
end
println((peak_I = round(peak_I, digits = 1),
         final_R = round(u[3], digits = 1),
         total = round(sum(u), digits = 1)))`,
      out: `0
(peak_I = 302.1, final_R = 874.1, total = 1000.0)`,
      a: [
        "`@. tmp = u + 0.5 * dt * k1` の `@.` マクロは、行内のすべての演算をドット付きの要素ごと更新（broadcast融合）に変換し、一時配列を作らず既存の `tmp` に直接書き込みます。",
      ],
    },
    {
      t: "保存則による検算と、実務パッケージへの橋渡し",
      b: [
        "動的モデルを書いたら、まず**物理的・数理的な不変量（保存則）**を検査します。SIRモデルでは `du[1] + du[2] + du[3] == 0` なので、何ステップ進んでも総人口 `S + I + R` が初期値 `1000.0` と一致し、かつすべての状態が非負でなければなりません。先ほどの出力で `total = 1000.0` が保たれていることが最初の安全確認になります。",
        "この `sir_rhs!(du, u, p, t)` を書けるようになれば、実務では `using OrdinaryDiffEq; prob = ODEProblem(sir_rhs!, u0, (0.0, 40.0), p_sir); sol = solve(prob, Tsit5())` とそのまま渡すだけで、適応ステップ制御・イベント検出（閾値到達で停止）・パラメータ推定（感度解析や自動微分）へ直結します。",
      ],
    },
  ],
  ex: [
    {
      k: "choice",
      q: "減衰方程式 `du/dt = -r * u`（`r > 0`）を陽的Euler法で解くとき、刻み幅 `dt` を大きくしすぎると何が起きるでしょう?",
      opts: [
        "`r * dt > 2` を超えると1ステップごとに符号が反転して振幅が増大し、非物理的な振動・発散が起きる",
        "計算速度が大幅に速くなるだけで、十分なステップ数を回せば刻み幅によらず必ず真の収束値 `0` に漸近して落ち着く",
        "Juliaが自動的に陰的ソルバへ切り替えるため、刻み幅によらず誤差は常にゼロになる",
      ],
      ans: 0,
      why: "陽的Euler法の1ステップ更新は `u_{n+1} = (1 - r * dt) * u_n` となるため、`|1 - r * dt| > 1`（すなわち `r * dt > 2`）では絶対値が1ステップごとに拡大しながら符号反転します。",
      hint: "`u_0 = 1` のとき、`u_1 = u_0 - dt * r * u_0 = (1 - r * dt)` がどんな値になるか代入してみましょう。",
    },
    {
      k: "fill",
      q: "配列更新式 `tmp = u + 0.5 * dt * k1` のすべての演算を要素ごとのin-place更新（broadcast融合）にして一時配列の割当を消す、行頭のマクロ名を入力しましょう（`@` を含む）。",
      code: `〔?〕 tmp = u + 0.5 * dt * k1`,
      accept: ["@."],
      show: "@.",
      why: "`@.` はその行の代入と演算すべてにドット `.` を付け、`tmp .= u .+ 0.5 .* dt .* k1` と同じ融合ループに展開してヒープ割当を防ぎます。",
      hint: "`@` のすぐ後ろにドット1文字を書く短縮マクロです。",
      placeholder: "@から始まる2文字",
    },
    {
      k: "tf",
      q: "常微分方程式の数値解法と実装設計について、正しいか判定しましょう。",
      items: [
        {
          s: "4次Runge–Kutta法（RK4）は1ステップあたり複数回傾きを評価するため、滑らかな問題では同じ刻み幅 `dt` の陽的Euler法よりはるかに高精度になる",
          a: true,
          why: "Euler法の大域誤差が `O(dt)` なのに対し、RK4は `O(dt^4)` で減少するため、同じ刻み幅でも桁違いに小さい誤差を達成できます。",
        },
        {
          s: "`sir_rhs!(du, u, p, t)` の中で毎回 `du = [-inf, inf - rec, rec]` と再代入すれば、呼び出し元の配列 `du` が書き換わって割当ゼロになる",
          a: false,
          why: "`du = ...` はローカル変数 `du` の束縛先を新しい配列へ付け替えるだけで、呼び出し元の配列は更新されず配列割当も発生します。`du[1] = ...` や `du .= ...` と要素を書き換えます。",
        },
        {
          s: "総人口 `S + I + R` のような保存量が数値計算の前後で保たれているか確認することは、バグや不安定性の検出に有効である",
          a: true,
          why: "右辺の符号ミスや発散があると保存則や非負性が崩れるため、動的モデルの単体テストとして非常に有効です。",
        },
      ],
      hint: "RK4の次数、`du = [...]` と `du[1] = ...` の違い、保存則による検算を順に確認しましょう。",
    },
    {
      k: "choice",
      q: "`DifferentialEquations.jl` にもそのまま渡せる in-place 右辺関数の引数順として正しいものはどれでしょう?",
      opts: [
        "`rhs!(du, u, p, t)`（出力バッファ、現在の状態、パラメータ、時刻）",
        "`rhs!(t, p, u, du)`（時刻、パラメータ、現在の状態、出力バッファ）",
        "`rhs!(u, du)`（パラメータや時刻は必ずグローバル変数から読む）",
      ],
      ans: 0,
      why: "Juliaの慣習では書き換えられる対象を第1引数に置くため、`rhs!(du, u, p, t)` の順が標準です。パラメータ `p` も引数で渡すことで型安定性と再利用性を保てます。",
      hint: "破壊的関数 `!` では「書き換える先の配列」を最初に置く原則を思い出しましょう。",
    },
  ],
};
