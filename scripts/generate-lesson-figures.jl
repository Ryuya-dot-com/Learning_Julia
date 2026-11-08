# 教材ページ埋め込み用のSVG図版を決定論的に生成するスクリプト。
# 各レッスンのJuliaコード・乱数シード・CSVデータと完全に一致する座標を計算し、
# フォント依存のない軽量・アクセシブルなSVGを public/figures/ に書き出す。
#
# 実行方法:
#   julia --startup-file=no --project=validation scripts/generate-lesson-figures.jl

using CSV
using DataFrames
using Distributions
using GLM
using LinearAlgebra
using Printf
using Random
using Statistics

const ROOT = normpath(joinpath(@__DIR__, ".."))
const OUT_DIR = joinpath(ROOT, "public", "figures")
mkpath(OUT_DIR)

const FONT_JP = "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Yu Gothic', Meiryo, system-ui, sans-serif"
const FONT_MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

const C_INK = "#2A2733"
const C_SUB = "#6E6879"
const C_GRID = "#ECE8DF"
const C_AXIS = "#8A8296"
const C_PURPLE = "#9558B2"
const C_PURPLE_DEEP = "#6D3E86"
const C_PURPLE_SOFT = "#F3ECF7"
const C_GREEN = "#2B7A1E"
const C_GREEN_SOFT = "#EAF6E6"
const C_RED = "#CB3C33"
const C_RED_SOFT = "#FBEDEC"
const C_BLUE = "#4682B4"
const C_ORANGE = "#D97724"

fmt(x::Real; digits::Int = 2) = string(round(Float64(x); digits = digits))
f1(x::Real) = @sprintf("%.1f", Float64(x))

function xml_escape(s::AbstractString)
    s = replace(s, "&" => "&amp;")
    s = replace(s, "<" => "&lt;")
    s = replace(s, ">" => "&gt;")
    s = replace(s, "\"" => "&quot;")
    return s
end

struct PlotBox
    x0::Float64
    y0::Float64
    w::Float64
    h::Float64
    xmin::Float64
    xmax::Float64
    ymin::Float64
    ymax::Float64
end

px(b::PlotBox, x::Real) = b.x0 + (Float64(x) - b.xmin) / (b.xmax - b.xmin) * b.w
py(b::PlotBox, y::Real) = b.y0 + b.h - (Float64(y) - b.ymin) / (b.ymax - b.ymin) * b.h

function svg_header(w::Int, h::Int, title::String)
    return """
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $w $h" width="$w" height="$h" role="img" aria-label="$(xml_escape(title))">
      <title>$(xml_escape(title))</title>
      <rect width="$w" height="$h" rx="10" fill="#FFFFFF"/>
    """
end

function draw_axes!(io::IO, b::PlotBox;
    xticks = Float64[],
    xtick_labels = nothing,
    yticks = Float64[],
    ytick_labels = nothing,
    xlabel::String = "",
    ylabel::String = "",
    title::String = "",
    mono_ticks::Bool = true,
)
    tf = mono_ticks ? FONT_MONO : FONT_JP
    for (idx, yv) in enumerate(yticks)
        yy = py(b, yv)
        println(io, """  <line x1="$(f1(b.x0))" y1="$(f1(yy))" x2="$(f1(b.x0 + b.w))" y2="$(f1(yy))" stroke="$C_GRID" stroke-width="1"/>""")
        lbl = ytick_labels === nothing ? (isinteger(yv) ? string(Int(yv)) : string(yv)) : ytick_labels[idx]
        println(io, """  <text x="$(f1(b.x0 - 8))" y="$(f1(yy + 4))" text-anchor="end" fill="$C_SUB" font-size="11.5" font-family="$tf">$(xml_escape(lbl))</text>""")
    end
    for (idx, xv) in enumerate(xticks)
        xx = px(b, xv)
        println(io, """  <line x1="$(f1(xx))" y1="$(f1(b.y0 + b.h))" x2="$(f1(xx))" y2="$(f1(b.y0 + b.h + 5))" stroke="$C_AXIS" stroke-width="1.2"/>""")
        lbl = xtick_labels === nothing ? (isinteger(xv) ? string(Int(xv)) : string(xv)) : xtick_labels[idx]
        println(io, """  <text x="$(f1(xx))" y="$(f1(b.y0 + b.h + 19))" text-anchor="middle" fill="$C_SUB" font-size="11.5" font-family="$(xtick_labels === nothing ? FONT_MONO : FONT_JP)">$(xml_escape(lbl))</text>""")
    end
    println(io, """  <rect x="$(f1(b.x0))" y="$(f1(b.y0))" width="$(f1(b.w))" height="$(f1(b.h))" fill="none" stroke="$C_AXIS" stroke-width="1.2"/>""")
    if !isempty(title)
        println(io, """  <text x="$(f1(b.x0 + b.w / 2))" y="$(f1(b.y0 - 10))" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_JP">$(xml_escape(title))</text>""")
    end
    if !isempty(xlabel)
        println(io, """  <text x="$(f1(b.x0 + b.w / 2))" y="$(f1(b.y0 + b.h + 40))" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="600" font-family="$FONT_JP">$(xml_escape(xlabel))</text>""")
    end
    if !isempty(ylabel)
        cx = b.x0 - 44
        cy = b.y0 + b.h / 2
        println(io, """  <text x="$(f1(cx))" y="$(f1(cy))" text-anchor="middle" transform="rotate(-90 $(f1(cx)) $(f1(cy)))" fill="$C_INK" font-size="12.5" font-weight="600" font-family="$FONT_JP">$(xml_escape(ylabel))</text>""")
    end
end

function write_svg(filename::String, content::String)
    path = joinpath(OUT_DIR, filename)
    write(path, content)
    println("wrote $filename ($(filesize(path)) bytes)")
end

# ============================================================
# 1 & 2. 探索の可視化 (l18-visualize.js): rt-hist.svg & rt-box.svg
# ============================================================
function gen_exploratory_figures()
    df = CSV.read(joinpath(ROOT, "public", "data", "rt_data.csv"), DataFrame)
    edges = [450.0, 500.0, 550.0, 600.0, 650.0]
    counts = [count(x -> edges[i] <= x < edges[i + 1], df.rt) for i in 1:4]
    @assert counts == [2, 4, 4, 2]

    # 1. rt-hist.svg
    io = IOBuffer()
    print(io, svg_header(560, 290, "rt_data.csv の反応時間ヒストグラム（450〜650 msの4区間、度数 2, 4, 4, 2）"))
    b = PlotBox(66, 24, 466, 212, 435, 665, 0, 4.6)
    draw_axes!(io, b;
        xticks = edges,
        yticks = [0.0, 1.0, 2.0, 3.0, 4.0],
        xlabel = "RT (ms)",
        ylabel = "count",
    )
    for i in 1:4
        x_left = px(b, edges[i])
        x_right = px(b, edges[i + 1])
        y_top = py(b, counts[i])
        y_bot = py(b, 0.0)
        println(io, """  <rect x="$(f1(x_left))" y="$(f1(y_top))" width="$(f1(x_right - x_left))" height="$(f1(y_bot - y_top))" fill="#5B8FD4" fill-opacity="0.82" stroke="$C_INK" stroke-width="1.3"/>""")
        println(io, """  <text x="$(f1((x_left + x_right) / 2))" y="$(f1(y_top - 7))" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_MONO">$(counts[i])</text>""")
    end
    println(io, "</svg>")
    write_svg("rt-hist.svg", String(take!(io)))

    # 2. rt-box.svg
    cong = df.rt[df.cond .== "cong"]
    incong = df.rt[df.cond .== "incong"]
    q_cong = quantile(cong, [0.25, 0.5, 0.75])
    q_incong = quantile(incong, [0.25, 0.5, 0.75])
    @assert round.(q_cong; digits = 1) == [500.0, 508.9, 519.4]
    @assert round.(q_incong; digits = 1) == [575.0, 593.2, 600.5]

    io = IOBuffer()
    print(io, svg_header(560, 290, "条件別反応時間の箱ひげ図（cong 四分位 500.0–519.4 ms、incong 四分位 575.0–600.5 ms）"))
    b2 = PlotBox(66, 24, 466, 212, 0.4, 2.6, 465, 640)
    draw_axes!(io, b2;
        xticks = [1.0, 2.0],
        xtick_labels = ["cong", "incong"],
        yticks = [480.0, 520.0, 560.0, 600.0, 640.0],
        xlabel = "cond",
        ylabel = "RT (ms)",
    )
    groups = [
        (pos = 1.0, vals = cong, q = q_cong, fill = "#EFE6F7", stroke = C_PURPLE_DEEP),
        (pos = 2.0, vals = incong, q = q_incong, fill = "#E7F4E4", stroke = C_GREEN),
    ]
    box_half = 42.0
    for g in groups
        cx = px(b2, g.pos)
        ylo = py(b2, minimum(g.vals))
        yq1 = py(b2, g.q[1])
        ymed = py(b2, g.q[2])
        yq3 = py(b2, g.q[3])
        yhi = py(b2, maximum(g.vals))
        # ひげ
        println(io, """  <line x1="$(f1(cx))" y1="$(f1(ylo))" x2="$(f1(cx))" y2="$(f1(yq1))" stroke="$(g.stroke)" stroke-width="1.8"/>""")
        println(io, """  <line x1="$(f1(cx))" y1="$(f1(yq3))" x2="$(f1(cx))" y2="$(f1(yhi))" stroke="$(g.stroke)" stroke-width="1.8"/>""")
        println(io, """  <line x1="$(f1(cx - 18))" y1="$(f1(ylo))" x2="$(f1(cx + 18))" y2="$(f1(ylo))" stroke="$(g.stroke)" stroke-width="1.8"/>""")
        println(io, """  <line x1="$(f1(cx - 18))" y1="$(f1(yhi))" x2="$(f1(cx + 18))" y2="$(f1(yhi))" stroke="$(g.stroke)" stroke-width="1.8"/>""")
        # 箱と中央値
        println(io, """  <rect x="$(f1(cx - box_half))" y="$(f1(yq3))" width="$(f1(2 * box_half))" height="$(f1(yq1 - yq3))" rx="3" fill="$(g.fill)" stroke="$(g.stroke)" stroke-width="2"/>""")
        println(io, """  <line x1="$(f1(cx - box_half))" y1="$(f1(ymed))" x2="$(f1(cx + box_half))" y2="$(f1(ymed))" stroke="$(g.stroke)" stroke-width="2.6"/>""")
        println(io, """  <text x="$(f1(cx + box_half + 8))" y="$(f1(ymed + 4))" fill="$(g.stroke)" font-size="11" font-weight="700" font-family="$FONT_MONO">$(f1(g.q[2]))</text>""")
    end
    println(io, "</svg>")
    write_svg("rt-box.svg", String(take!(io)))
end

# ============================================================
# 3. 確率変数と確率分布 (l19-probability.js): normal-cdf-ccdf.svg
# ============================================================
function gen_normal_cdf_ccdf()
    d = Normal(500, 50)
    p_cdf = round(cdf(d, 550); digits = 3)
    p_ccdf = round(ccdf(d, 550); digits = 3)
    q95 = round(quantile(d, 0.95); digits = 1)
    @assert p_cdf == 0.841
    @assert p_ccdf == 0.159
    @assert q95 == 582.2

    io = IOBuffer()
    print(io, svg_header(600, 300, "Normal(500, 50) の確率密度と cdf(d, 550) = 0.841・ccdf(d, 550) = 0.159 の面積"))
    b = PlotBox(72, 28, 500, 212, 340, 660, 0.0, 0.0092)
    draw_axes!(io, b;
        xticks = [350.0, 400.0, 450.0, 500.0, 550.0, 600.0, 650.0],
        yticks = [0.0, 0.004, 0.008],
        ytick_labels = ["0.000", "0.004", "0.008"],
        xlabel = "x",
        ylabel = "確率密度 pdf(d, x)",
    )

    xs_left = range(340.0, 550.0; length = 110)
    pts_left = join(["$(f1(px(b, x))),$(f1(py(b, pdf(d, x))))" for x in xs_left], " ")
    poly_left = "$(f1(px(b, 340.0))),$(f1(py(b, 0.0))) $pts_left $(f1(px(b, 550.0))),$(f1(py(b, 0.0)))"
    println(io, """  <polygon points="$poly_left" fill="$C_PURPLE" fill-opacity="0.22"/>""")

    xs_right = range(550.0, 660.0; length = 70)
    pts_right = join(["$(f1(px(b, x))),$(f1(py(b, pdf(d, x))))" for x in xs_right], " ")
    poly_right = "$(f1(px(b, 550.0))),$(f1(py(b, 0.0))) $pts_right $(f1(px(b, 660.0))),$(f1(py(b, 0.0)))"
    println(io, """  <polygon points="$poly_right" fill="$C_RED" fill-opacity="0.26"/>""")

    xs_all = range(340.0, 660.0; length = 170)
    path_d = "M " * join(["$(f1(px(b, x))) $(f1(py(b, pdf(d, x))))" for x in xs_all], " L ")
    println(io, """  <path d="$path_d" fill="none" stroke="$C_INK" stroke-width="2.2"/>""")

    # 境界線 x = 550 と quantile(d, 0.95) = 582.2
    x550 = px(b, 550.0)
    y550 = py(b, pdf(d, 550.0))
    println(io, """  <line x1="$(f1(x550))" y1="$(f1(y550))" x2="$(f1(x550))" y2="$(f1(py(b, 0.0)))" stroke="$C_PURPLE_DEEP" stroke-width="2"/>""")

    xq95 = px(b, quantile(d, 0.95))
    println(io, """  <line x1="$(f1(xq95))" y1="$(f1(b.y0 + 8))" x2="$(f1(xq95))" y2="$(f1(py(b, 0.0)))" stroke="#B02E26" stroke-width="1.6" stroke-dasharray="5,4"/>""")

    # 注釈ラベル
    println(io, """  <text x="$(f1(px(b, 480.0)))" y="$(f1(py(b, 0.0033)))" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="12.5" font-weight="700" font-family="$FONT_MONO">cdf(d, 550) = 0.841</text>""")
    println(io, """  <text x="$(f1(px(b, 480.0)))" y="$(f1(py(b, 0.0024)))" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11" font-family="$FONT_JP">550以下の面積 (84.1%)</text>""")

    println(io, """  <text x="$(f1(px(b, 606.0)))" y="$(f1(py(b, 0.0046)))" text-anchor="middle" fill="#B02E26" font-size="12" font-weight="700" font-family="$FONT_MONO">ccdf = 0.159</text>""")
    println(io, """  <line x1="$(f1(px(b, 594.0)))" y1="$(f1(py(b, 0.0041)))" x2="$(f1(px(b, 568.0)))" y2="$(f1(py(b, 0.0016)))" stroke="#B02E26" stroke-width="1.2"/>""")

    println(io, """  <text x="$(f1(xq95 - 6))" y="$(f1(b.y0 + 20))" text-anchor="end" fill="#B02E26" font-size="11" font-weight="700" font-family="$FONT_MONO">95%点: 582.2</text>""")
    println(io, "</svg>")
    write_svg("normal-cdf-ccdf.svg", String(take!(io)))
end

# ============================================================
# 4, 5, 6. 不確かさを論文品質で可視化 (l25-makie.js):
#          raw-mean-ci.svg, ci-coverage.svg, axis-sensitivity.svg
# ============================================================
function mean_ci_summary(x; level = 0.95)
    n = length(x)
    critical = quantile(TDist(n - 1), 1 - (1 - level) / 2)
    estimate = mean(x)
    se = std(x) / sqrt(n)
    return (; estimate, lower = estimate - critical * se, upper = estimate + critical * se, n)
end

function draw_diamond!(io::IO, cx::Real, cy::Real, r::Real; fill::String = C_INK)
    pts = "$(f1(cx)),$(f1(cy - r)) $(f1(cx + r)),$(f1(cy)) $(f1(cx)),$(f1(cy + r)) $(f1(cx - r)),$(f1(cy))"
    println(io, """  <polygon points="$pts" fill="$fill"/>""")
end

function gen_makie_figures()
    analysis_rng = Xoshiro(2026)
    control = rand(analysis_rng, Normal(500, 50), 30)
    treatment = rand(analysis_rng, Normal(525, 50), 30)
    y = vcat(control, treatment)
    group = repeat([1, 2], inner = 30)
    summaries = mean_ci_summary.([control, treatment])

    display_rng = Xoshiro(99)
    x = Float64.(group) .+ 0.28 .* (rand(display_rng, length(y)) .- 0.5)
    estimates = [s.estimate for s in summaries]
    lowers = [s.lower for s in summaries]
    uppers = [s.upper for s in summaries]
    @assert round.(estimates; digits = 1) == [503.8, 523.0]

    ymin_raw = min(360.0, floor(minimum(y) / 20) * 20 - 10)
    ymax_raw = max(660.0, ceil(maximum(y) / 20) * 20 + 10)

    # 4. raw-mean-ci.svg
    io = IOBuffer()
    print(io, svg_header(600, 320, "統制群・介入群の生データ（各n=30）、標本平均（503.8 ms, 523.0 ms）、95%信頼区間"))
    b = PlotBox(70, 26, 500, 236, 0.4, 2.6, ymin_raw, ymax_raw)
    draw_axes!(io, b;
        xticks = [1.0, 2.0],
        xtick_labels = ["統制 (n=30)", "介入 (n=30)"],
        yticks = collect(400.0:50.0:650.0),
        ylabel = "反応時間 (ms)",
    )
    for (xi, yi) in zip(x, y)
        println(io, """  <circle cx="$(f1(px(b, xi)))" cy="$(f1(py(b, yi)))" r="4.0" fill="#595959" fill-opacity="0.45"/>""")
    end
    for (pos, est, lo, hi) in zip([1.0, 2.0], estimates, lowers, uppers)
        cx = px(b, pos)
        ylo = py(b, lo)
        yhi = py(b, hi)
        yest = py(b, est)
        println(io, """  <line x1="$(f1(cx))" y1="$(f1(ylo))" x2="$(f1(cx))" y2="$(f1(yhi))" stroke="#1F1C26" stroke-width="2.8"/>""")
        println(io, """  <line x1="$(f1(cx - 8))" y1="$(f1(ylo))" x2="$(f1(cx + 8))" y2="$(f1(ylo))" stroke="#1F1C26" stroke-width="2.4"/>""")
        println(io, """  <line x1="$(f1(cx - 8))" y1="$(f1(yhi))" x2="$(f1(cx + 8))" y2="$(f1(yhi))" stroke="#1F1C26" stroke-width="2.4"/>""")
        draw_diamond!(io, cx, yest, 6.8; fill = "#1F1C26")
    end
    # 凡例メモ
    println(io, """  <rect x="378" y="34" width="182" height="42" rx="6" fill="#FAF8F4" stroke="$C_GRID"/>""")
    println(io, """  <circle cx="392" cy="47" r="4" fill="#595959" fill-opacity="0.55"/>""")
    println(io, """  <text x="403" y="51" fill="$C_SUB" font-size="11" font-family="$FONT_JP">観測値 (表示用に微小ずらし)</text>""")
    draw_diamond!(io, 392, 65, 5.0; fill = "#1F1C26")
    println(io, """  <text x="403" y="69" fill="$C_INK" font-size="11" font-weight="600" font-family="$FONT_JP">標本平均と95% CI</text>""")
    println(io, "</svg>")
    write_svg("raw-mean-ci.svg", String(take!(io)))

    # 5. ci-coverage.svg
    truth = 500.0
    coverage_rng = Xoshiro(2500)
    intervals = [mean_ci_summary(rand(coverage_rng, Normal(truth, 50), 25)) for _ in 1:60]
    covered = [s.lower <= truth <= s.upper for s in intervals]
    @assert count(identity, covered) == 56

    xmin_ci = floor(minimum(s.lower for s in intervals) / 10) * 10 - 10
    xmax_ci = ceil(maximum(s.upper for s in intervals) / 10) * 10 + 10

    io = IOBuffer()
    print(io, svg_header(620, 390, "真の平均500 msに対する95%信頼区間の反復60回（56本が被覆、4本が外れる）"))
    bc = PlotBox(66, 30, 526, 304, xmin_ci, xmax_ci, 0.0, 61.5)
    draw_axes!(io, bc;
        xticks = collect((ceil(xmin_ci / 20) * 20):20.0:(floor(xmax_ci / 20) * 20)),
        yticks = [1.0, 15.0, 30.0, 45.0, 60.0],
        xlabel = "平均反応時間と95% CI (ms)",
        ylabel = "反復した研究",
    )
    x_truth = px(bc, truth)
    println(io, """  <line x1="$(f1(x_truth))" y1="$(f1(bc.y0))" x2="$(f1(x_truth))" y2="$(f1(bc.y0 + bc.h))" stroke="$C_INK" stroke-width="1.7" stroke-dasharray="6,4"/>""")
    for (i, s) in enumerate(intervals)
        yy = py(bc, i)
        xlo = px(bc, s.lower)
        xhi = px(bc, s.upper)
        xest = px(bc, s.estimate)
        if covered[i]
            println(io, """  <line x1="$(f1(xlo))" y1="$(f1(yy))" x2="$(f1(xhi))" y2="$(f1(yy))" stroke="$C_BLUE" stroke-width="1.5" stroke-opacity="0.88"/>""")
            println(io, """  <circle cx="$(f1(xest))" cy="$(f1(yy))" r="2.4" fill="$C_BLUE"/>""")
        else
            println(io, """  <line x1="$(f1(xlo))" y1="$(f1(yy))" x2="$(f1(xhi))" y2="$(f1(yy))" stroke="#B22222" stroke-width="2.4"/>""")
            draw_diamond!(io, xest, yy, 3.8; fill = "#B22222")
        end
    end
    println(io, """  <rect x="408" y="38" width="176" height="24" rx="5" fill="#FAF8F4" stroke="$C_GRID"/>""")
    println(io, """  <text x="496" y="54" text-anchor="middle" fill="$C_INK" font-size="11" font-weight="700" font-family="$FONT_JP">被覆: 56 / 60 本 (赤ひし形: 外れ4本)</text>""")
    println(io, "</svg>")
    write_svg("ci-coverage.svg", String(take!(io)))

    # 6. axis-sensitivity.svg
    io = IOBuffer()
    print(io, svg_header(660, 295, "同じ推定値と95%信頼区間を全範囲（0〜650 ms）と拡大表示（450〜600 ms）で並べた比較図"))
    bfull = PlotBox(68, 38, 250, 210, 0.4, 2.6, 0.0, 650.0)
    bzoom = PlotBox(386, 38, 250, 210, 0.4, 2.6, 450.0, 600.0)
    draw_axes!(io, bfull;
        xticks = [1.0, 2.0],
        xtick_labels = ["統制", "介入"],
        yticks = [0.0, 200.0, 400.0, 600.0],
        ylabel = "反応時間 (ms)",
        title = "全範囲 (0〜650 ms)",
    )
    draw_axes!(io, bzoom;
        xticks = [1.0, 2.0],
        xtick_labels = ["統制", "介入"],
        yticks = [450.0, 500.0, 550.0, 600.0],
        title = "拡大表示 (450〜600 ms)",
    )
    for box in (bfull, bzoom)
        for (pos, est, lo, hi) in zip([1.0, 2.0], estimates, lowers, uppers)
            cx = px(box, pos)
            ylo = py(box, lo)
            yhi = py(box, hi)
            yest = py(box, est)
            println(io, """  <line x1="$(f1(cx))" y1="$(f1(ylo))" x2="$(f1(cx))" y2="$(f1(yhi))" stroke="#1F1C26" stroke-width="2.4"/>""")
            println(io, """  <line x1="$(f1(cx - 7))" y1="$(f1(ylo))" x2="$(f1(cx + 7))" y2="$(f1(ylo))" stroke="#1F1C26" stroke-width="2.2"/>""")
            println(io, """  <line x1="$(f1(cx - 7))" y1="$(f1(yhi))" x2="$(f1(cx + 7))" y2="$(f1(yhi))" stroke="#1F1C26" stroke-width="2.2"/>""")
            draw_diamond!(io, cx, yest, 6.0; fill = "#1F1C26")
        end
    end
    println(io, "</svg>")
    write_svg("axis-sensitivity.svg", String(take!(io)))
end

# ============================================================
# 7. 相関係数の標本変動 (l23-correlation.js): correlation-traps.svg
# ============================================================
function ols_line(x::AbstractVector, y::AbstractVector)
    mx, my = mean(x), mean(y)
    slope = sum((x .- mx) .* (y .- my)) / sum((x .- mx) .^ 2)
    intercept = my - slope * mx
    return intercept, slope
end

function gen_correlation_traps()
    x_curve = collect(range(-2, 2; length = 201))
    y_curve = x_curve .^ 2
    x = collect(1.0:20.0)
    y = x .+ rand(Xoshiro(2601), Normal(0, 2), 20)
    x_out = vcat(x, 100.0)
    y_out = vcat(y, -100.0)

    @assert round(cor(x_curve, y_curve); digits = 3) == 0.0
    @assert round(cor(x, y); digits = 3) == 0.962
    @assert round(cor(x_out, y_out); digits = 3) == -0.87

    io = IOBuffer()
    print(io, svg_header(660, 305, "左: 二次曲線 y = x² では強い関係があっても Pearson 相関 r = 0.000。右: 20点の正相関 r = 0.962 が外れ値1点で r = -0.870 に反転"))

    b1 = PlotBox(60, 40, 254, 210, -2.25, 2.25, -0.35, 4.35)
    draw_axes!(io, b1;
        xticks = [-2.0, -1.0, 0.0, 1.0, 2.0],
        yticks = [0.0, 1.0, 2.0, 3.0, 4.0],
        xlabel = "x",
        ylabel = "y",
        title = "非線形: y = x² (r = 0.000)",
    )
    # 水平な直線傾向 (OLS傾き0)
    y_mean_curve = mean(y_curve)
    println(io, """  <line x1="$(f1(px(b1, -2.0)))" y1="$(f1(py(b1, y_mean_curve)))" x2="$(f1(px(b1, 2.0)))" y2="$(f1(py(b1, y_mean_curve)))" stroke="$C_SUB" stroke-width="1.6" stroke-dasharray="5,4"/>""")
    curve_path = "M " * join(["$(f1(px(b1, xv))) $(f1(py(b1, yv)))" for (xv, yv) in zip(x_curve, y_curve)], " L ")
    println(io, """  <path d="$curve_path" fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.2"/>""")
    for idx in 1:10:201
        println(io, """  <circle cx="$(f1(px(b1, x_curve[idx])))" cy="$(f1(py(b1, y_curve[idx])))" r="3.1" fill="$C_PURPLE_DEEP"/>""")
    end

    b2 = PlotBox(384, 40, 254, 210, -4.0, 106.0, -110.0, 34.0)
    draw_axes!(io, b2;
        xticks = [0.0, 20.0, 50.0, 100.0],
        yticks = [-100.0, -50.0, 0.0, 25.0],
        xlabel = "x",
        ylabel = "y",
        title = "外れ値1点による反転",
    )
    a20, s20 = ols_line(x, y)
    # 20点のみの直線 (x = 0..26 の範囲に表示)
    println(io, """  <line x1="$(f1(px(b2, 0.0)))" y1="$(f1(py(b2, a20 + s20 * 0.0)))" x2="$(f1(px(b2, 26.0)))" y2="$(f1(py(b2, a20 + s20 * 26.0)))" stroke="$C_BLUE" stroke-width="1.8" stroke-dasharray="5,3"/>""")
    a21, s21 = ols_line(x_out, y_out)
    println(io, """  <line x1="$(f1(px(b2, 0.0)))" y1="$(f1(py(b2, a21 + s21 * 0.0)))" x2="$(f1(px(b2, 100.0)))" y2="$(f1(py(b2, a21 + s21 * 100.0)))" stroke="$C_RED" stroke-width="1.9"/>""")

    for (xv, yv) in zip(x, y)
        println(io, """  <circle cx="$(f1(px(b2, xv)))" cy="$(f1(py(b2, yv)))" r="3.2" fill="$C_BLUE" fill-opacity="0.85"/>""")
    end
    ox, oy = px(b2, 100.0), py(b2, -100.0)
    println(io, """  <circle cx="$(f1(ox))" cy="$(f1(oy))" r="6.5" fill="none" stroke="$C_RED" stroke-width="1.6"/>""")
    println(io, """  <circle cx="$(f1(ox))" cy="$(f1(oy))" r="3.8" fill="$C_RED"/>""")

    println(io, """  <text x="630" y="60" text-anchor="end" fill="$C_BLUE" font-size="11" font-weight="700" font-family="$FONT_MONO">20点のみ: r = 0.962</text>""")
    println(io, """  <text x="630" y="76" text-anchor="end" fill="#B02E26" font-size="11" font-weight="700" font-family="$FONT_MONO">+1点追加: r = -0.870</text>""")
    println(io, """  <text x="$(f1(ox - 10))" y="$(f1(oy - 8))" text-anchor="end" fill="#B02E26" font-size="10.5" font-family="$FONT_MONO">(100, -100)</text>""")
    println(io, "</svg>")
    write_svg("correlation-traps.svg", String(take!(io)))
end

# ============================================================
# 8. 回帰診断とVIF (l26-diagnostics.js): residual-qq.svg
# ============================================================
function gen_residual_qq()
    rng = Xoshiro(3001)
    n = 160
    x = rand(rng, Uniform(-3, 3), n)
    y = 2 .+ 0.8 .* x .+ 1.1 .* x .^ 2 .+ rand(rng, Normal(0, 1), n)
    df_curve = DataFrame(x = x, x2 = x .^ 2, y = y)
    m_linear = lm(@formula(y ~ x), df_curve)
    m_quadratic = lm(@formula(y ~ x + x2), df_curve)
    @assert round.([r2(m_linear), r2(m_quadratic)]; digits = 3) == [0.162, 0.921]

    fit_vals = fitted(m_linear)
    res = residuals(m_linear)
    standardized_res = (res .- mean(res)) ./ std(res)
    probability = ((1:length(res)) .- 0.5) ./ length(res)
    normal_quantile = quantile.(Normal(), probability)
    sorted_std_res = sort(standardized_res)

    fmin, fmax = floor(minimum(fit_vals) * 2) / 2 - 0.3, ceil(maximum(fit_vals) * 2) / 2 + 0.3
    rmin, rmax = floor(minimum(res)) - 0.5, ceil(maximum(res)) + 0.5

    io = IOBuffer()
    print(io, svg_header(660, 305, "二次曲線の真値に直線モデル y ~ x を当てたときの残差対予測値（U字形）と正規Q–Q図"))

    b1 = PlotBox(62, 40, 254, 210, fmin, fmax, rmin, rmax)
    draw_axes!(io, b1;
        xticks = collect(ceil(fmin):1.0:floor(fmax)),
        yticks = collect((ceil(rmin / 2) * 2):2.0:(floor(rmax / 2) * 2)),
        xlabel = "予測値",
        ylabel = "残差",
        title = "残差対予測値 (U字形が残る)",
    )
    y0_line = py(b1, 0.0)
    println(io, """  <line x1="$(f1(b1.x0))" y1="$(f1(y0_line))" x2="$(f1(b1.x0 + b1.w))" y2="$(f1(y0_line))" stroke="$C_INK" stroke-width="1.5" stroke-dasharray="6,4"/>""")
    for (fv, rv) in zip(fit_vals, res)
        println(io, """  <circle cx="$(f1(px(b1, fv)))" cy="$(f1(py(b1, rv)))" r="3.0" fill="$C_PURPLE_DEEP" fill-opacity="0.58"/>""")
    end

    qmin = min(-3.2, floor(minimum(sorted_std_res) * 2) / 2 - 0.2)
    qmax = max(3.2, ceil(maximum(sorted_std_res) * 2) / 2 + 0.2)
    b2 = PlotBox(388, 40, 250, 210, -3.2, 3.2, qmin, qmax)
    draw_axes!(io, b2;
        xticks = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0],
        yticks = [-2.0, -1.0, 0.0, 1.0, 2.0, 3.0],
        xlabel = "正規理論分位点",
        ylabel = "標準化残差",
        title = "正規Q–Q図",
    )
    println(io, """  <line x1="$(f1(px(b2, -3.0)))" y1="$(f1(py(b2, -3.0)))" x2="$(f1(px(b2, 3.0)))" y2="$(f1(py(b2, 3.0)))" stroke="$C_INK" stroke-width="1.5" stroke-dasharray="6,4"/>""")
    for (nq, sr) in zip(normal_quantile, sorted_std_res)
        println(io, """  <circle cx="$(f1(px(b2, nq)))" cy="$(f1(py(b2, sr)))" r="3.0" fill="$C_BLUE" fill-opacity="0.62"/>""")
    end

    println(io, "</svg>")
    write_svg("residual-qq.svg", String(take!(io)))
end

# ============================================================
# 9. 型安定性とメモリ割当 (m01-type-stability.js): allocation-views.svg
# ============================================================
function gen_allocation_views()
    # 500×40 行列の列ごとの範囲和における 3 実装のヒープ割当比較 (KiB)
    # 1) Vector{Any} ボックス化 (~312.5 KiB), 2) X[:, j] スライスコピー (162.5 KiB = 166400 B), 3) @views (0 KiB)
    labels = ["抽象型 Vector{Any}", "列コピー X[:, j]", "参照 @views X[:, j]"]
    kib = [312.5, 166400 / 1024, 0.0]
    colors = ["#CB3C33", "#E8A33D", "#1E7F74"]

    io = IOBuffer()
    print(io, svg_header(600, 250, "500×40行列の列集約におけるヒープ割当量の比較（抽象型 約312.5 KiB、スライスコピー 162.5 KiB、@views 0 KiB）"))
    b = PlotBox(158, 34, 404, 162, 0.0, 350.0, 0.4, 3.6)
    # 縦グリッド線
    for xv in [0.0, 100.0, 200.0, 300.0]
        xx = px(b, xv)
        println(io, """  <line x1="$(f1(xx))" y1="$(f1(b.y0))" x2="$(f1(xx))" y2="$(f1(b.y0 + b.h))" stroke="$C_GRID" stroke-width="1"/>""")
        println(io, """  <text x="$(f1(xx))" y="$(f1(b.y0 + b.h + 19))" text-anchor="middle" fill="$C_SUB" font-size="11.5" font-family="$FONT_MONO">$(Int(xv))</text>""")
    end
    println(io, """  <rect x="$(f1(b.x0))" y="$(f1(b.y0))" width="$(f1(b.w))" height="$(f1(b.h))" fill="none" stroke="$C_AXIS" stroke-width="1.2"/>""")
    println(io, """  <text x="$(f1(b.x0 + b.w / 2))" y="$(f1(b.y0 - 10))" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_JP">1回の関数呼び出しあたりのヒープ割当量 (500×40 行列)</text>""")
    println(io, """  <text x="$(f1(b.x0 + b.w / 2))" y="$(f1(b.y0 + b.h + 40))" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="600" font-family="$FONT_JP">割当メモリ (KiB — 小さいほどGC負荷が低い)</text>""")

    for (idx, (lbl, val, col)) in enumerate(zip(labels, kib, colors))
        ypos = 4 - idx
        yc = py(b, ypos)
        println(io, """  <text x="$(f1(b.x0 - 10))" y="$(f1(yc + 4))" text-anchor="end" fill="$C_INK" font-size="12" font-weight="600" font-family="$FONT_JP">$(xml_escape(lbl))</text>""")
        wbar = max(3.0, px(b, val) - px(b, 0.0))
        println(io, """  <rect x="$(f1(b.x0))" y="$(f1(yc - 14))" width="$(f1(wbar))" height="28" rx="4" fill="$col" fill-opacity="0.85"/>""")
        txt = val == 0.0 ? "0 B (割当ゼロ)" : "$(f1(val)) KiB"
        println(io, """  <text x="$(f1(b.x0 + wbar + 8))" y="$(f1(yc + 4))" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_MONO">$(xml_escape(txt))</text>""")
    end
    println(io, "</svg>")
    write_svg("allocation-views.svg", String(take!(io)))
end

# ============================================================
# 10. 自作対数尤度と数値最適化 (m03-custom-likelihood.js): profile-vs-wald.svg
# ============================================================
function gen_profile_vs_wald()
    rng = Xoshiro(4301)
    latent_t = rand(rng, Exponential(900.0), 28)
    obs_t = min.(latent_t, 1200.0)
    cens_flag = latent_t .>= 1200.0
    k = count(!, cens_flag)
    total_t = sum(obs_t)
    theta_hat = total_t / k
    ll(th) = -k * log(th) - total_t / th
    ll_max = ll(theta_hat)
    dev(th) = 2.0 * (ll_max - ll(th))
    # θ尺度での2次近似 (Wald放物線): ((θ - θ̂) / se_θ)^2, se_θ = θ̂ / sqrt(k)
    se_theta = theta_hat / sqrt(k)
    wald_quad(th) = ((th - theta_hat) / se_theta)^2
    cutoff = quantile(Chisq(1), 0.95)

    io = IOBuffer()
    print(io, svg_header(620, 310, "右打切り指数モデルの逸脱度 2(ℓ(θ̂)-ℓ(θ)) 曲線と95%プロファイル尤度区間（549.6〜1272.8 ms）対Wald近似（472.9〜1151.7 ms）"))
    b = PlotBox(66, 34, 522, 214, 420.0, 1420.0, 0.0, 7.2)
    draw_axes!(io, b;
        xticks = [500.0, 700.0, 900.0, 1100.0, 1300.0],
        yticks = [0.0, 2.0, 3.84, 6.0],
        ytick_labels = ["0.0", "2.0", "3.84", "6.0"],
        xlabel = "平均反応時間スケール θ (ms)",
        ylabel = "逸脱度 2(ℓ(θ̂) − ℓ(θ))",
        title = "プロファイル尤度（実線）と対称なWald二次近似（破線）",
    )

    # 95% 閾値水平線 (χ²₁(0.95) = 3.841)
    y_cut = py(b, cutoff)
    println(io, """  <line x1="$(f1(b.x0))" y1="$(f1(y_cut))" x2="$(f1(b.x0 + b.w))" y2="$(f1(y_cut))" stroke="#B02E26" stroke-width="1.4" stroke-dasharray="6,4"/>""")
    println(io, """  <text x="$(f1(b.x0 + b.w - 6))" y="$(f1(y_cut - 6))" text-anchor="end" fill="#B02E26" font-size="11" font-weight="700" font-family="$FONT_MONO">95% 閾値 χ²₁ = 3.841</text>""")

    ths = range(435.0, 1400.0; length = 200)
    # Wald 二次近似曲線 (y <= 7.0 の範囲にクリップ)
    wald_pts = ["$(f1(px(b, th))) $(f1(py(b, min(7.0, wald_quad(th)))))" for th in ths if wald_quad(th) <= 7.0]
    println(io, """  <path d="M $(join(wald_pts, " L "))" fill="none" stroke="$C_SUB" stroke-width="1.9" stroke-dasharray="5,4"/>""")

    # 真の逸脱度曲線
    prof_pts = ["$(f1(px(b, th))) $(f1(py(b, min(7.0, dev(th)))))" for th in ths if dev(th) <= 7.0]
    println(io, """  <path d="M $(join(prof_pts, " L "))" fill="none" stroke="#1E7F74" stroke-width="2.5"/>""")

    # 点推定 θ̂ = 812.3
    xh = px(b, theta_hat)
    println(io, """  <circle cx="$(f1(xh))" cy="$(f1(py(b, 0.0)))" r="4.5" fill="#1E7F74"/>""")
    println(io, """  <text x="$(f1(xh))" y="$(f1(py(b, 0.65)))" text-anchor="middle" fill="#1E7F74" font-size="11" font-weight="700" font-family="$FONT_MONO">θ̂ = 812.3</text>""")

    # 区間バー比較 (Profile: 549.6..1272.8 vs Wald: 472.9..1151.7)
    y_prof_bar = py(b, 1.35)
    y_wald_bar = py(b, 2.25)
    println(io, """  <line x1="$(f1(px(b, 549.6)))" y1="$(f1(y_prof_bar))" x2="$(f1(px(b, 1272.8)))" y2="$(f1(y_prof_bar))" stroke="#1E7F74" stroke-width="3"/>""")
    println(io, """  <text x="$(f1(px(b, 1272.8) + 6))" y="$(f1(y_prof_bar + 4))" fill="#1E7F74" font-size="10.5" font-weight="700" font-family="$FONT_JP">Profile CI</text>""")

    println(io, """  <line x1="$(f1(px(b, 472.9)))" y1="$(f1(y_wald_bar))" x2="$(f1(px(b, 1151.7)))" y2="$(f1(y_wald_bar))" stroke="$C_SUB" stroke-width="2.6"/>""")
    println(io, """  <text x="$(f1(px(b, 1151.7) + 6))" y="$(f1(y_wald_bar + 4))" fill="$C_SUB" font-size="10.5" font-weight="700" font-family="$FONT_JP">Wald CI</text>""")

    println(io, "</svg>")
    write_svg("profile-vs-wald.svg", String(take!(io)))
end

# ============================================================
# 11. 微分方程式と動的システム (a01-ode-dynamical-systems.js): euler-vs-rk4.svg
# ============================================================
function gen_euler_vs_rk4()
    io = IOBuffer()
    print(io, svg_header(660, 305, "左: 学習曲線 du/dt = 0.8(1-u) における解析解と陽的Euler・RK4の比較。右: 刻み幅が大きすぎる陽的Euler (r·dt = 2.4 > 2) の数値振動"))

    # 左パネル: du/dt = 0.8*(1 - u), u(0)=0.2, dt=0.8 (6ステップ t=0..4.8)
    b1 = PlotBox(56, 40, 254, 210, 0.0, 5.0, 0.15, 1.08)
    draw_axes!(io, b1;
        xticks = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0],
        yticks = [0.2, 0.4, 0.6, 0.8, 1.0],
        xlabel = "時間 t",
        ylabel = "習熟度 u(t)",
        title = "精度比較 (dt = 0.8)",
    )
    ts_fine = range(0.0, 5.0; length = 120)
    exact_pts = ["$(f1(px(b1, t))) $(f1(py(b1, 1.0 - 0.8 * exp(-0.8 * t))))" for t in ts_fine]
    println(io, """  <path d="M $(join(exact_pts, " L "))" fill="none" stroke="$C_SUB" stroke-width="2.0" stroke-dasharray="5,3"/>""")

    dt1 = 0.8
    t_steps = collect(0.0:dt1:4.8)
    u_eu = [0.2]
    u_rk = [0.2]
    f1_ode(u) = 0.8 * (1.0 - u)
    for _ in 1:(length(t_steps) - 1)
        ue = u_eu[end]
        push!(u_eu, ue + dt1 * f1_ode(ue))
        ur = u_rk[end]
        k1 = f1_ode(ur)
        k2 = f1_ode(ur + 0.5 * dt1 * k1)
        k3 = f1_ode(ur + 0.5 * dt1 * k2)
        k4 = f1_ode(ur + dt1 * k3)
        push!(u_rk, ur + (dt1 / 6.0) * (k1 + 2k2 + 2k3 + k4))
    end
    eu_pts = ["$(f1(px(b1, t))) $(f1(py(b1, u)))" for (t, u) in zip(t_steps, u_eu)]
    println(io, """  <path d="M $(join(eu_pts, " L "))" fill="none" stroke="$C_RED" stroke-width="1.9"/>""")
    for (t, u) in zip(t_steps, u_eu)
        println(io, """  <circle cx="$(f1(px(b1, t)))" cy="$(f1(py(b1, u)))" r="3.4" fill="$C_RED"/>""")
    end
    for (t, u) in zip(t_steps, u_rk)
        println(io, """  <circle cx="$(f1(px(b1, t)))" cy="$(f1(py(b1, u)))" r="3.3" fill="#1E7F74"/>""")
    end
    println(io, """  <text x="304" y="188" text-anchor="end" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">Euler (上振れ誤差)</text>""")
    println(io, """  <text x="304" y="205" text-anchor="end" fill="#1E7F74" font-size="10.5" font-weight="700" font-family="$FONT_JP">RK4 (解析解とほぼ一致)</text>""")

    # 右パネル: du/dt = 3.0*(1 - u), u(0)=0.0, dt=0.8 (r*dt = 2.4 > 2 => 発散振動)
    b2 = PlotBox(384, 40, 254, 210, 0.0, 3.4, -2.6, 3.8)
    draw_axes!(io, b2;
        xticks = [0.0, 0.8, 1.6, 2.4, 3.2],
        yticks = [-2.0, 0.0, 1.0, 2.0, 3.0],
        xlabel = "時間 t",
        ylabel = "u(t)",
        title = "不安定反例 (r·dt = 2.4 > 2)",
    )
    ts_fine2 = range(0.0, 3.2; length = 100)
    ex2_pts = ["$(f1(px(b2, t))) $(f1(py(b2, 1.0 - exp(-3.0 * t))))" for t in ts_fine2]
    println(io, """  <path d="M $(join(ex2_pts, " L "))" fill="none" stroke="#1E7F74" stroke-width="2.1" stroke-dasharray="5,3"/>""")

    t_osc = [0.0, 0.8, 1.6, 2.4, 3.2]
    u_osc = [0.0]
    for _ in 1:4
        u_prev = u_osc[end]
        push!(u_osc, u_prev + 0.8 * 3.0 * (1.0 - u_prev))
    end
    # 4ステップ目は 1 - (-1.4)^4 = -2.8416 なので表示枠内に収まるようクリップ
    osc_pts = ["$(f1(px(b2, t))) $(f1(py(b2, clamp(u, -2.55, 3.75))))" for (t, u) in zip(t_osc, u_osc)]
    println(io, """  <path d="M $(join(osc_pts, " L "))" fill="none" stroke="$C_RED" stroke-width="2.0"/>""")
    for (t, u) in zip(t_osc[1:4], u_osc[1:4])
        println(io, """  <circle cx="$(f1(px(b2, t)))" cy="$(f1(py(b2, u)))" r="3.6" fill="$C_RED"/>""")
    end
    println(io, """  <text x="632" y="60" text-anchor="end" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">陽的Eulerが振動・発散</text>""")
    println(io, """  <text x="632" y="76" text-anchor="end" fill="#1E7F74" font-size="10.5" font-weight="700" font-family="$FONT_JP">真の解 u(t) → 1.0</text>""")

    println(io, "</svg>")
    write_svg("euler-vs-rk4.svg", String(take!(io)))
end

# ============================================================
# 12. MCMCとHMC (a04-mcmc-hmc-foundations.js): rwmh-vs-hmc.svg
# ============================================================
function gen_rwmh_vs_hmc()
    rho = 0.92
    denom = 1.0 - rho^2
    lp_grad(q1, q2) = (
        logp = -0.5 * (q1^2 - 2.0 * rho * q1 * q2 + q2^2) / denom,
        g1 = -(q1 - rho * q2) / denom,
        g2 = -(q2 - rho * q1) / denom,
    )

    # 最初の 45 ステップの軌跡を比較
    nshow = 45
    rng_rw = Xoshiro(5401)
    rw_pts = Tuple{Float64, Float64}[(-1.5, 1.5)]
    q1, q2 = -1.5, 1.5
    lp = lp_grad(q1, q2).logp
    for _ in 1:nshow
        p1, p2 = q1 + 0.35 * randn(rng_rw), q2 + 0.35 * randn(rng_rw)
        lp_p = lp_grad(p1, p2).logp
        if log(rand(rng_rw)) < lp_p - lp
            q1, q2, lp = p1, p2, lp_p
        end
        push!(rw_pts, (q1, q2))
    end

    rng_hm = Xoshiro(5401)
    hm_pts = Tuple{Float64, Float64}[(-1.5, 1.5)]
    q1, q2 = -1.5, 1.5
    cur = lp_grad(q1, q2)
    eps, L = 0.18, 12
    for _ in 1:nshow
        r1, r2 = randn(rng_hm), randn(rng_hm)
        H0 = -cur.logp + 0.5 * (r1^2 + r2^2)
        pq1, pq2 = q1, q2
        pr1, pr2 = r1 + 0.5 * eps * cur.g1, r2 + 0.5 * eps * cur.g2
        st = cur
        for s in 1:L
            pq1 += eps * pr1
            pq2 += eps * pr2
            st = lp_grad(pq1, pq2)
            if s < L
                pr1 += eps * st.g1
                pr2 += eps * st.g2
            end
        end
        pr1 += 0.5 * eps * st.g1
        pr2 += 0.5 * eps * st.g2
        H1 = -st.logp + 0.5 * (pr1^2 + pr2^2)
        if isfinite(H1 - H0) && log(rand(rng_hm)) < -(H1 - H0)
            q1, q2, cur = pq1, pq2, st
        end
        push!(hm_pts, (q1, q2))
    end

    # 95% 等高線楕円 (χ²₂(0.95) ≈ 5.991): 固有値 1+ρ, 1-ρ
    rad = sqrt(quantile(Chisq(2), 0.95))
    angles = range(0.0, 2pi; length = 120)
    ellipse_xy = [
        begin
            u1 = rad * sqrt(1.0 + rho) * cos(th)
            u2 = rad * sqrt(1.0 - rho) * sin(th)
            ((u1 - u2) / sqrt(2.0), (u1 + u2) / sqrt(2.0))
        end
        for th in angles
    ]

    io = IOBuffer()
    print(io, svg_header(660, 305, "強い相関 ρ=0.92 を持つ2次元正規事後分布に対する最初の45サンプルの軌跡比較。左: ランダムウォークMHは局所に停滞。右: HMCは尾根全体を一気に横断"))

    b1 = PlotBox(56, 40, 254, 210, -3.0, 3.0, -3.0, 3.0)
    draw_axes!(io, b1;
        xticks = [-2.0, 0.0, 2.0],
        yticks = [-2.0, 0.0, 2.0],
        xlabel = "θ₁",
        ylabel = "θ₂",
        title = "Random-Walk MH (ESS = 26.7)",
    )
    el1 = ["$(f1(px(b1, x))) $(f1(py(b1, y)))" for (x, y) in ellipse_xy]
    println(io, """  <path d="M $(join(el1, " L ")) Z" fill="none" stroke="$C_AXIS" stroke-width="1.6" stroke-dasharray="4,3"/>""")
    rw_path = ["$(f1(px(b1, x))) $(f1(py(b1, y)))" for (x, y) in rw_pts]
    println(io, """  <path d="M $(join(rw_path, " L "))" fill="none" stroke="$C_RED" stroke-width="1.4" stroke-opacity="0.8"/>""")
    for (x, y) in rw_pts[2:end]
        println(io, """  <circle cx="$(f1(px(b1, x)))" cy="$(f1(py(b1, y)))" r="2.7" fill="$C_RED"/>""")
    end

    b2 = PlotBox(384, 40, 254, 210, -3.0, 3.0, -3.0, 3.0)
    draw_axes!(io, b2;
        xticks = [-2.0, 0.0, 2.0],
        yticks = [-2.0, 0.0, 2.0],
        xlabel = "θ₁",
        ylabel = "θ₂",
        title = "Leapfrog HMC (ESS = 1423.2)",
    )
    el2 = ["$(f1(px(b2, x))) $(f1(py(b2, y)))" for (x, y) in ellipse_xy]
    println(io, """  <path d="M $(join(el2, " L ")) Z" fill="none" stroke="$C_AXIS" stroke-width="1.6" stroke-dasharray="4,3"/>""")
    hm_path = ["$(f1(px(b2, x))) $(f1(py(b2, y)))" for (x, y) in hm_pts]
    println(io, """  <path d="M $(join(hm_path, " L "))" fill="none" stroke="#1E7F74" stroke-width="1.3" stroke-opacity="0.65"/>""")
    for (x, y) in hm_pts[2:end]
        println(io, """  <circle cx="$(f1(px(b2, x)))" cy="$(f1(py(b2, y)))" r="2.9" fill="#1E7F74"/>""")
    end

    println(io, "</svg>")
    write_svg("rwmh-vs-hmc.svg", String(take!(io)))
end

# ============================================================
# 13. 順序ロジット vs 多項ロジット (l27-categorical-outcomes.js / m05): ordinal-vs-multinomial.svg
# ============================================================
function gen_ordinal_vs_multinomial()
    lg(z) = 1.0 / (1.0 + exp(-z))
    xs = collect(range(-3.0, 3.0; length = 121))

    # 左: 順序ロジット (c = [-0.8, 0.8], beta = 1.15)
    c1, c2, beta = -0.8, 0.8, 1.15
    ord_p1 = [lg(c1 - beta * x) for x in xs]
    ord_p2 = [lg(c2 - beta * x) - lg(c1 - beta * x) for x in xs]
    ord_p3 = [1.0 - lg(c2 - beta * x) for x in xs]

    # 右: 多項ロジット (B_true = [0.0 0.4 -0.3; 0.0 1.3 -1.1])
    mnl_p1 = Float64[]; mnl_p2 = Float64[]; mnl_p3 = Float64[]
    for x in xs
        e1, e2, e3 = 0.0, 0.4 + 1.3 * x, -0.3 - 1.1 * x
        m = max(e1, e2, e3)
        s = exp(e1 - m) + exp(e2 - m) + exp(e3 - m)
        push!(mnl_p1, exp(e1 - m) / s)
        push!(mnl_p2, exp(e2 - m) / s)
        push!(mnl_p3, exp(e3 - m) / s)
    end

    io = IOBuffer()
    print(io, svg_header(660, 295, "順序ロジット（比例オッズ）と多項ロジット（softmax）の予測確率曲線。左: 共通の傾きと順序閾値によりLow→Medium→Highへ単調に移行。右: カテゴリごとに独立な傾きを持つ"))

    b1 = PlotBox(52, 42, 256, 200, -3.0, 3.0, 0.0, 1.0)
    draw_axes!(io, b1;
        xticks = [-3.0, -1.5, 0.0, 1.5, 3.0],
        yticks = [0.0, 0.25, 0.5, 0.75, 1.0],
        xlabel = "説明変数 x",
        ylabel = "予測確率 P(Y=k|x)",
        title = "順序ロジット (比例オッズ・共有傾き)",
    )
    for (vals, col, dash) in ((ord_p1, C_RED, ""), (ord_p2, C_BLUE, "5,3"), (ord_p3, C_GREEN, ""))
        pts = ["$(f1(px(b1, xs[i]))) $(f1(py(b1, vals[i])))" for i in eachindex(xs)]
        da = isempty(dash) ? "" : """ stroke-dasharray="$dash\""""
        println(io, """  <path d="M $(join(pts, " L "))" fill="none" stroke="$col" stroke-width="2.3"$da/>""")
    end
    println(io, """  <text x="$(f1(px(b1, -2.2)))" y="$(f1(py(b1, 0.86)))" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">Low</text>""")
    println(io, """  <text x="$(f1(px(b1, 0.0)))" y="$(f1(py(b1, 0.45)))" text-anchor="middle" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_JP">Medium</text>""")
    println(io, """  <text x="$(f1(px(b1, 2.1)))" y="$(f1(py(b1, 0.86)))" text-anchor="end" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">High</text>""")

    b2 = PlotBox(382, 42, 256, 200, -3.0, 3.0, 0.0, 1.0)
    draw_axes!(io, b2;
        xticks = [-3.0, -1.5, 0.0, 1.5, 3.0],
        yticks = [0.0, 0.25, 0.5, 0.75, 1.0],
        xlabel = "説明変数 x",
        ylabel = "予測確率 P(Y=j|x)",
        title = "多項ロジット (名義尺度・独立傾き)",
    )
    for (vals, col, dash) in ((mnl_p1, C_PURPLE_DEEP, "5,3"), (mnl_p2, C_GREEN, ""), (mnl_p3, C_RED, ""))
        pts = ["$(f1(px(b2, xs[i]))) $(f1(py(b2, vals[i])))" for i in eachindex(xs)]
        da = isempty(dash) ? "" : """ stroke-dasharray="$dash\""""
        println(io, """  <path d="M $(join(pts, " L "))" fill="none" stroke="$col" stroke-width="2.3"$da/>""")
    end
    println(io, """  <text x="$(f1(px(b2, -2.1)))" y="$(f1(py(b2, 0.88)))" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">選択肢3</text>""")
    println(io, """  <text x="$(f1(px(b2, -0.15)))" y="$(f1(py(b2, 0.43)))" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_JP">参照1</text>""")
    println(io, """  <text x="$(f1(px(b2, 2.2)))" y="$(f1(py(b2, 0.90)))" text-anchor="end" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">選択肢2</text>""")

    println(io, "</svg>")
    write_svg("ordinal-vs-multinomial.svg", String(take!(io)))
end

# ============================================================
# 14. 離散選択のIIA仮定 vs 混合ロジット (a05): iia-vs-mixed-logit.svg
# ============================================================
function gen_iia_vs_mixed_logit()
    io = IOBuffer()
    print(io, svg_header(660, 275, "赤バス・青バス問題における選択確率の比較。2選択肢(電車50%・赤バス50%)へ青バスを追加した際、標準多項ロジット(IIA)は全選択肢を33.3%にするが、相関ランダム効用(混合ロジット)は電車約47%を保ちバス需要を分割する"))

    box = PlotBox(62, 42, 566, 182, 0.0, 3.0, 0.0, 0.65)
    draw_axes!(io, box;
        xticks = Float64[],
        yticks = [0.0, 0.2, 0.4, 0.6],
        xlabel = "",
        ylabel = "選択確率",
        title = "青バス追加時の予測シェア比較：標準多項ロジット(IIA) vs 混合ロジット",
    )

    groups = [
        ("① 追加前 (2選択肢)", 0.52, [(0.500, C_BLUE, "電車"), (0.500, C_RED, "赤バス")]),
        ("② 標準MNL (IIA仮定)", 1.50, [(0.333, C_BLUE, "電車"), (0.333, C_RED, "赤バス"), (0.333, "#1E7F74", "青バス")]),
        ("③ 混合ロジット (σ=6)", 2.50, [(0.470, C_BLUE, "電車"), (0.266, C_RED, "赤バス"), (0.265, "#1E7F74", "青バス")]),
    ]

    bar_w = 34.0
    gap = 8.0
    y_base = py(box, 0.0)

    for (glabel, gx, bars) in groups
        cx = px(box, gx)
        total_w = length(bars) * bar_w + (length(bars) - 1) * gap
        start_x = cx - total_w / 2
        for (idx, (val, col, blabel)) in enumerate(bars)
            bx = start_x + (idx - 1) * (bar_w + gap)
            by = py(box, val)
            bh = y_base - by
            println(io, """  <rect x="$(f1(bx))" y="$(f1(by))" width="$(f1(bar_w))" height="$(f1(bh))" rx="4" fill="$col" fill-opacity="0.88"/>""")
            println(io, """  <text x="$(f1(bx + bar_w / 2))" y="$(f1(by - 6))" text-anchor="middle" fill="$C_INK" font-size="9.5" font-weight="700" font-family="$FONT_MONO">$(fmt(val * 100; digits = 1))%</text>""")
            println(io, """  <text x="$(f1(bx + bar_w / 2))" y="$(f1(y_base + 15))" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">$blabel</text>""")
        end
        println(io, """  <text x="$(f1(cx))" y="$(f1(y_base + 34))" text-anchor="middle" fill="$C_INK" font-size="11" font-weight="700" font-family="$FONT_JP">$glabel</text>""")
    end

    # 50% 基準破線
    y50 = py(box, 0.50)
    println(io, """  <line x1="$(f1(box.x0))" y1="$(f1(y50))" x2="$(f1(box.x0 + box.w))" y2="$(f1(y50))" stroke="$C_AXIS" stroke-width="1.2" stroke-dasharray="4,4"/>""")
    println(io, """  <text x="$(f1(box.x0 + box.w - 6))" y="$(f1(y50 - 5))" text-anchor="end" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">元の電車シェア 50%</text>""")

    println(io, "</svg>")
    write_svg("iia-vs-mixed-logit.svg", String(take!(io)))
end

# ============================================================
# 15. R×C表の調整済み残差マップ (l24-association-scales.js): contingency-mosaic-residuals.svg
# ============================================================
function gen_contingency_mosaic_residuals()
    table = [30 12 8; 18 20 12; 10 18 32]
    n = sum(table)
    row_p = sum(table; dims = 2) ./ n
    col_p = sum(table; dims = 1) ./ n
    expected = row_p * col_p .* n
    adj_res = (table .- expected) ./ sqrt.(expected .* (1 .- row_p) .* (1 .- col_p))
    raw_p = 2 .* ccdf.(Normal(), abs.(adj_res))
    p_vec = vec(raw_p)
    ord = sortperm(p_vec)
    holm_vec = similar(p_vec)
    run_max = 0.0
    for (rk, idx) in enumerate(ord)
        run_max = max(run_max, (length(p_vec) - rk + 1) * p_vec[idx])
        holm_vec[idx] = min(run_max, 1.0)
    end
    holm_p = reshape(holm_vec, 3, 3)

    io = IOBuffer()
    print(io, svg_header(660, 275, "3×3クロス集計表 [30 12 8; 18 20 12; 10 18 32] の行割合構成（左）と調整済み残差・Holm補正p値マップ（右）"))

    # 左パネル: 各行の列割合 (積み上げ横棒)
    println(io, """  <text x="165" y="28" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">行ごとの構成比（行割合）</text>""")
    col_colors = [C_BLUE, "#8A8296", C_RED]
    col_names = ["列1", "列2", "列3"]
    for i in 1:3
        ry = 48.0 + (i - 1) * 58.0
        println(io, """  <text x="48" y="$(f1(ry + 21))" text-anchor="end" fill="$C_INK" font-size="11" font-weight="700" font-family="$FONT_JP">行$i</text>""")
        cur_x = 56.0
        tot_w = 230.0
        rsum = sum(table[i, :])
        for j in 1:3
            prop = table[i, j] / rsum
            bw = tot_w * prop
            println(io, """  <rect x="$(f1(cur_x))" y="$(f1(ry))" width="$(f1(bw))" height="34" fill="$(col_colors[j])" fill-opacity="0.82" stroke="#FFFFFF" stroke-width="1.5"/>""")
            if bw >= 34.0
                println(io, """  <text x="$(f1(cur_x + bw / 2))" y="$(f1(ry + 21))" text-anchor="middle" fill="#FFFFFF" font-size="10" font-weight="700" font-family="$FONT_MONO">$(Int(round(prop * 100)))%</text>""")
            end
            cur_x += bw
        end
    end
    for j in 1:3
        lx = 66.0 + (j - 1) * 76.0
        println(io, """  <rect x="$(f1(lx))" y="226" width="12" height="12" rx="2" fill="$(col_colors[j])" fill-opacity="0.85"/>""")
        println(io, """  <text x="$(f1(lx + 17))" y="236" fill="$C_SUB" font-size="10.5" font-family="$FONT_JP">$(col_names[j])</text>""")
    end

    # 右パネル: 3×3 調整済み残差ヒートマップ
    println(io, """  <text x="492" y="28" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">調整済み残差 z（* は Holm p &lt; 0.05）</text>""")
    gx0, gy0, cw, ch = 366.0, 48.0, 84.0, 52.0
    for j in 1:3
        println(io, """  <text x="$(f1(gx0 + (j - 0.5) * cw))" y="$(f1(gy0 - 6))" text-anchor="middle" fill="$C_SUB" font-size="10.5" font-weight="700" font-family="$FONT_JP">列$j</text>""")
    end
    for i in 1:3
        println(io, """  <text x="$(f1(gx0 - 8))" y="$(f1(gy0 + (i - 0.5) * ch + 4))" text-anchor="end" fill="$C_SUB" font-size="10.5" font-weight="700" font-family="$FONT_JP">行$i</text>""")
        for j in 1:3
            z = adj_res[i, j]
            hp = holm_p[i, j]
            bg = z >= 2.0 ? "#E4F2E7" : (z <= -2.0 ? "#FBEDEC" : "#F7F5F0")
            bd = z >= 2.0 ? C_GREEN : (z <= -2.0 ? C_RED : C_GRID)
            tc = z >= 2.0 ? C_GREEN : (z <= -2.0 ? C_RED : C_INK)
            cx = gx0 + (j - 1) * cw
            cy = gy0 + (i - 1) * ch
            println(io, """  <rect x="$(f1(cx + 2))" y="$(f1(cy + 2))" width="$(f1(cw - 4))" height="$(f1(ch - 4))" rx="6" fill="$bg" stroke="$bd" stroke-width="1.4"/>""")
            star = hp < 0.05 ? "*" : ""
            z_str = @sprintf("%+.2f%s", z, star)
            println(io, """  <text x="$(f1(cx + cw / 2))" y="$(f1(cy + 23))" text-anchor="middle" fill="$tc" font-size="11.5" font-weight="700" font-family="$FONT_MONO">$z_str</text>""")
            println(io, """  <text x="$(f1(cx + cw / 2))" y="$(f1(cy + 40))" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_MONO">n=$(table[i, j]) (E=$(fmt(expected[i, j]; digits=1)))</text>""")
        end
    end
    println(io, """  <text x="492" y="236" text-anchor="middle" fill="$C_SUB" font-size="10" font-family="$FONT_JP">全体 χ² = 27.71 (df=4), Cramér V = 0.304 → 対角セル(行1×列1, 行3×列3)が超過</text>""")

    println(io, "</svg>")
    write_svg("contingency-mosaic-residuals.svg", String(take!(io)))
end

# ============================================================
# 16. MCAの2次元カテゴリマップと馬蹄形反例 (a06): mca-biplot-arch.svg
# ============================================================
function gen_mca_biplot_arch()
    function simple_ca_coords(Z::Matrix{Float64})
        P = Z ./ sum(Z)
        r = vec(sum(P; dims = 2))
        c = vec(sum(P; dims = 1))
        Dr = Diagonal(1.0 ./ sqrt.(r))
        Dc = Diagonal(1.0 ./ sqrt.(c))
        F = svd(Dr * (P .- r * c') * Dc)
        row_c = Dr * F.U[:, 1:2] * Diagonal(F.S[1:2])
        col_c = Dc * F.V[:, 1:2] * Diagonal(F.S[1:2])
        # Fix sign deterministically: make last column coord on axis 1 positive, and extremes on axis 2 positive
        if col_c[end, 1] < 0
            row_c[:, 1] .*= -1
            col_c[:, 1] .*= -1
        end
        if col_c[1, 2] + col_c[end, 2] < 0
            row_c[:, 2] .*= -1
            col_c[:, 2] .*= -1
        end
        return F.S .^ 2, row_c, col_c
    end

    # 左: 2因子構造の5項目×3水準調査 (seed 5601)
    rng1 = Xoshiro(5601)
    N1, Q1 = 180, 5
    lat1, lat2 = randn(rng1, N1), randn(rng1, N1)
    Z1 = zeros(Float64, N1, 15)
    for i in 1:N1
        for q in 1:3
            v = 1.35 * lat1[i] + 0.65 * randn(rng1)
            lv = v < -0.6 ? 1 : (v < 0.6 ? 2 : 3)
            Z1[i, (q - 1) * 3 + lv] = 1.0
        end
        for q in 4:5
            v = 1.35 * lat2[i] + 0.65 * randn(rng1)
            lv = v < -0.6 ? 1 : (v < 0.6 ? 2 : 3)
            Z1[i, (q - 1) * 3 + lv] = 1.0
        end
    end
    eig1, _, col1 = simple_ca_coords(Z1)

    # 右: 純粋な1次元潜在特性の5項目×4段階順序データ (seed 5602) → 馬蹄形 (Guttman arch)
    rng2 = Xoshiro(5602)
    N2, Q2 = 240, 5
    th = collect(range(-2.2, 2.2, length = N2)) .+ 0.20 .* randn(rng2, N2)
    cuts = [-1.1, 0.0, 1.1]
    Z2 = zeros(Float64, N2, 20)
    for q in 1:Q2, i in 1:N2
        v = th[i] + 0.35 * randn(rng2)
        lv = 1 + count(c -> v > c, cuts)
        Z2[i, (q - 1) * 4 + lv] = 1.0
    end
    _, row2, col2 = simple_ca_coords(Z2)

    io = IOBuffer()
    print(io, svg_header(660, 285, "多重コレスポンデンス分析(MCA)の比較。左は真の2因子構造を分離したカテゴリ配置(Benzécri補正寄与率89.5%)、右は1次元順序データで第2軸が放物線に曲がる馬蹄形効果(Guttman arch)"))

    b1 = PlotBox(52, 42, 250, 192, -1.8, 1.8, -1.8, 1.8)
    b2 = PlotBox(382, 42, 250, 192, -1.9, 1.9, -1.6, 1.9)

    draw_axes!(io, b1;
        xticks = [-1.5, 0.0, 1.5],
        yticks = [-1.5, 0.0, 1.5],
        xlabel = "第1軸 (素慣性 24.4% / Benzécri 64.9%)",
        ylabel = "第2軸",
        title = "真の2因子構造 (Benzécri累積 89.5%)",
    )
    draw_axes!(io, b2;
        xticks = [-1.5, 0.0, 1.5],
        yticks = [-1.5, 0.0, 1.5],
        xlabel = "第1軸 (1次元の潜在特性と r = 0.97)",
        ylabel = "第2軸 (第1軸²の放物線!)",
        title = "1次元順序データの馬蹄形効果 (反例)",
    )

    # 原点クロス線
    for b in (b1, b2)
        println(io, """  <line x1="$(f1(b.x0))" y1="$(f1(py(b, 0.0)))" x2="$(f1(b.x0 + b.w))" y2="$(f1(py(b, 0.0)))" stroke="$C_GRID" stroke-width="1.2" stroke-dasharray="3,3"/>""")
        println(io, """  <line x1="$(f1(px(b, 0.0)))" y1="$(f1(b.y0))" x2="$(f1(px(b, 0.0)))" y2="$(f1(b.y0 + b.h))" stroke="$C_GRID" stroke-width="1.2" stroke-dasharray="3,3"/>""")
    end

    # 左パネル: 項目1〜3 (青: 第1軸方向に並ぶ) と 項目4〜5 (赤: 第2軸方向に並ぶ)
    for q in 1:5
        pts = [col1[(q - 1) * 3 + lv, :] for lv in 1:3]
        col = q <= 3 ? C_BLUE : C_RED
        pstr = join(["$(f1(px(b1, p[1]))),$(f1(py(b1, p[2])))" for p in pts], " ")
        println(io, """  <polyline fill="none" stroke="$col" stroke-width="1.4" stroke-opacity="0.55" points="$pstr"/>""")
        for lv in 1:3
            cx = px(b1, clamp(pts[lv][1], -1.7, 1.7))
            cy = py(b1, clamp(pts[lv][2], -1.7, 1.7))
            println(io, """  <circle cx="$(f1(cx))" cy="$(f1(cy))" r="4.0" fill="$col"/>""")
        end
    end
    println(io, """  <text x="$(f1(px(b1, 0.0)))" y="$(f1(py(b1, -1.55)))" text-anchor="middle" fill="$C_BLUE" font-size="10" font-weight="700" font-family="$FONT_JP">青: 項目1–3 (第1因子)</text>""")
    println(io, """  <text x="$(f1(px(b1, 0.0)))" y="$(f1(py(b1, 1.55)))" text-anchor="middle" fill="$C_RED" font-size="10" font-weight="700" font-family="$FONT_JP">赤: 項目4–5 (第2因子)</text>""")

    # 右パネル: 個人スコアの薄い点 + 4段階カテゴリ平均を結ぶU字曲線
    for i in 1:2:N2
        rx = px(b2, clamp(row2[i, 1], -1.8, 1.8))
        ry = py(b2, clamp(row2[i, 2], -1.5, 1.8))
        println(io, """  <circle cx="$(f1(rx))" cy="$(f1(ry))" r="2.2" fill="$C_AXIS" fill-opacity="0.35"/>""")
    end
    mean_lv = [[mean(col2[(q - 1) * 4 + lv, d] for q in 1:5) for d in 1:2] for lv in 1:4]
    arch_pts = join(["$(f1(px(b2, p[1]))),$(f1(py(b2, p[2])))" for p in mean_lv], " ")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.6" points="$arch_pts"/>""")
    for lv in 1:4
        cx = px(b2, mean_lv[lv][1])
        cy = py(b2, mean_lv[lv][2])
        println(io, """  <circle cx="$(f1(cx))" cy="$(f1(cy))" r="5.2" fill="$C_PURPLE"/>""")
        dy = (lv == 2 || lv == 3) ? 15.0 : -9.0
        println(io, """  <text x="$(f1(cx))" y="$(f1(cy + dy))" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_JP">段階$lv</text>""")
    end

    println(io, "</svg>")
    write_svg("mca-biplot-arch.svg", String(take!(io)))
end

function gen_lasso_path_leakage()
    soft_th(z::Float64, g::Float64) = sign(z) * max(abs(z) - g, 0.0)
    function lasso_std(X::Matrix{Float64}, y::Vector{Float64}, lam::Float64)
        n, p = size(X)
        yc = y .- mean(y)
        xm = vec(mean(X; dims = 1))
        xs = vec(std(X; dims = 1, corrected = false))
        Z = (X .- xm') ./ xs'
        b = zeros(Float64, p)
        r = copy(yc)
        for _ in 1:400
            md = 0.0
            @views for j in 1:p
                zj = Z[:, j]
                ob = b[j]
                nb = soft_th(dot(zj, r) / n + ob, lam)
                if nb != ob
                    r .-= (nb - ob) .* zj
                    b[j] = nb
                    md = max(md, abs(nb - ob))
                end
            end
            md < 1e-9 && break
        end
        return b
    end

    rng = Xoshiro(4701)
    X_tr = randn(rng, 55, 30)
    tb = zeros(30); tb[1:3] = [1.6, -1.2, 0.9]
    y_tr = 0.5 .+ X_tr * tb .+ randn(rng, 55)

    log_lams = collect(range(-1.8, 0.35, length = 36))
    paths = Matrix{Float64}(undef, 30, length(log_lams))
    for (idx, ll) in enumerate(log_lams)
        paths[:, idx] = lasso_std(X_tr, y_tr, 10.0^ll)
    end

    io = IOBuffer()
    print(io, svg_header(760, 325, "Lassoの正則化パスと交差検証における事前変数選択リークの反例"))

    bL = PlotBox(56, 38, 300, 232, -1.8, 0.35, -1.5, 1.8)
    draw_axes!(io, bL;
        xticks = [-1.5, -1.0, -0.5, 0.0],
        yticks = [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5],
        xlabel = "log₁₀(λ)（右ほど罰則が強い）",
        ylabel = "標準化係数 β̂",
        title = "Lassoパス：真の3変数だけ生き残り雑音は0になる",
    )
    println(io, """  <line x1="$(f1(bL.x0))" y1="$(f1(py(bL, 0.0)))" x2="$(f1(bL.x0 + bL.w))" y2="$(f1(py(bL, 0.0)))" stroke="$C_AXIS" stroke-width="1" stroke-dasharray="4 3"/>""")
    x_sel = px(bL, log10(0.32))
    println(io, """  <line x1="$(f1(x_sel))" y1="$(f1(bL.y0))" x2="$(f1(x_sel))" y2="$(f1(bL.y0 + bL.h))" stroke="$C_PURPLE" stroke-width="1.4" stroke-dasharray="4 3"/>""")
    println(io, """  <text x="$(f1(x_sel - 5))" y="$(f1(bL.y0 + 15))" text-anchor="end" fill="$C_PURPLE_DEEP" font-size="10.5" font-family="$FONT_MONO">λ=0.32</text>""")

    for j in 4:30
        pts = join(["$(f1(px(bL, log_lams[k]))),$(f1(py(bL, paths[j, k])))" for k in eachindex(log_lams)], " ")
        println(io, """  <polyline fill="none" stroke="#CFC9D8" stroke-width="1.1" points="$pts"/>""")
    end
    act_cols = [C_GREEN, C_RED, C_BLUE]
    act_lbls = ["β₁ (真 +1.6)", "β₂ (真 -1.2)", "β₃ (真 +0.9)"]
    for j in 1:3
        pts = join(["$(f1(px(bL, log_lams[k]))),$(f1(py(bL, paths[j, k])))" for k in eachindex(log_lams)], " ")
        println(io, """  <polyline fill="none" stroke="$(act_cols[j])" stroke-width="2.4" points="$pts"/>""")
        yy = py(bL, paths[j, 4])
        println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(yy + (j == 2 ? 13 : -6)))" fill="$(act_cols[j])" font-size="10.5" font-weight="700" font-family="$FONT_JP">$(act_lbls[j])</text>""")
    end

    bR = PlotBox(434, 38, 296, 232, 0.4, 2.6, -0.6, 0.5)
    draw_axes!(io, bR;
        xticks = [1.0, 2.0],
        xtick_labels = ["全体で事前選択(リーク)", "各fold内で選択(誠実)"],
        yticks = [-0.6, -0.4, -0.2, 0.0, 0.2, 0.4],
        xlabel = "純ノイズ (N=60, P=300, 真のR²=0)",
        ylabel = "5分割交差検証 R²",
        title = "分割前の変数選択が生む「幻の予測力」",
    )
    y0_px = py(bR, 0.0)
    println(io, """  <line x1="$(f1(bR.x0))" y1="$(f1(y0_px))" x2="$(f1(bR.x0 + bR.w))" y2="$(f1(y0_px))" stroke="$C_INK" stroke-width="1.2"/>""")

    # Bar 1: Leaked CV R^2 = +0.312
    x1_c = px(bR, 1.0)
    y1_top = py(bR, 0.312)
    println(io, """  <rect x="$(f1(x1_c - 38))" y="$(f1(y1_top))" width="76" height="$(f1(y0_px - y1_top))" rx="4" fill="#FADAD7" stroke="$C_RED" stroke-width="1.8"/>""")
    println(io, """  <text x="$(f1(x1_c))" y="$(f1(y1_top - 7))" text-anchor="middle" fill="$C_RED" font-size="11.5" font-weight="700" font-family="$FONT_MONO">+0.312 (偽の成功)</text>""")

    # Bar 2: Honest CV R^2 = -0.404
    x2_c = px(bR, 2.0)
    y2_bot = py(bR, -0.404)
    println(io, """  <rect x="$(f1(x2_c - 38))" y="$(f1(y0_px))" width="76" height="$(f1(y2_bot - y0_px))" rx="4" fill="#DCE9F5" stroke="$C_BLUE" stroke-width="1.8"/>""")
    println(io, """  <text x="$(f1(x2_c))" y="$(f1(y2_bot + 16))" text-anchor="middle" fill="$C_BLUE" font-size="11.5" font-weight="700" font-family="$FONT_MONO">-0.404 (正しく棄却)</text>""")

    println(io, "</svg>")
    write_svg("lasso-path-leakage.svg", String(take!(io)))
end

function gen_sciml_hybrid_ude()
    g_true(u) = -0.45 * u^3
    rhs_tr(u, t) = 0.9 * cos(0.8 * t) - 0.30 * u + g_true(u)
    function rk4_1d(rhs, u0::Float64, ts::Vector{Float64})
        us = Vector{Float64}(undef, length(ts))
        us[1] = u0
        for i in 1:(length(ts) - 1)
            t = ts[i]; dt = ts[i + 1] - t; u = us[i]
            k1 = rhs(u, t)
            k2 = rhs(u + 0.5 * dt * k1, t + 0.5 * dt)
            k3 = rhs(u + 0.5 * dt * k2, t + 0.5 * dt)
            k4 = rhs(u + dt * k3, t + dt)
            us[i + 1] = u + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
        end
        return us
    end

    rng = Xoshiro(5704)
    ts_all = collect(0.0:0.1:12.0)
    u_ex = rk4_1d(rhs_tr, 1.3, ts_all)
    ts_tr = ts_all[1:61]
    u_ob = u_ex[1:61] .+ 0.03 .* randn(rng, 61)

    W_bb = 1.2 .* randn(rng, 12)
    b_bb = collect(range(-3.0, 3.0, length = 12))
    H_tr = tanh.(W_bb .* ts_tr' .+ b_bb)
    w_out = (H_tr * H_tr' + 1e-4 * I) \ (H_tr * u_ob)
    u_bb = clamp.(vec((tanh.(W_bb .* ts_all' .+ b_bb))' * w_out), -1.75, 1.75)

    w1_u = [0.7, -0.7, 1.1, -1.1, 1.5, -1.5]
    b1_u = [-0.8, -0.8, 0.0, 0.0, 0.8, 0.8]
    nn_g(u, th) = sum(th[12 + m] * tanh(th[m] * u + th[6 + m]) for m in 1:6)
    ude_res(th) = rk4_1d((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + nn_g(u, th), 1.3, ts_tr) .- u_ob
    th_u = vcat(w1_u, b1_u, zeros(6))
    for _ in 1:25
        r0 = ude_res(th_u)
        J = Matrix{Float64}(undef, length(r0), 18)
        for j in 1:18
            tp = copy(th_u); tp[j] += 1e-6
            J[:, j] = (ude_res(tp) .- r0) ./ 1e-6
        end
        st = (J' * J + 1e-3 * I) \ (J' * r0)
        th_u .-= st
        norm(st) < 1e-7 && break
    end
    u_ude = rk4_1d((u, t) -> 0.9 * cos(0.8 * t) - 0.30 * u + nn_g(u, th_u), 1.3, ts_all)

    io = IOBuffer()
    print(io, svg_header(760, 325, "科学機械学習(SciML / UDE)と純ブラックボックスNNの外挿比較および未知非線形項の復元"))

    bL = PlotBox(54, 38, 320, 232, 0.0, 12.0, -1.8, 1.8)
    x_split = px(bL, 6.0)
    println(io, """  <rect x="$(f1(x_split))" y="$(f1(bL.y0))" width="$(f1(bL.x0 + bL.w - x_split))" height="$(f1(bL.h))" fill="#F7F4FB"/>""")
    draw_axes!(io, bL;
        xticks = [0.0, 3.0, 6.0, 9.0, 12.0],
        yticks = [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5],
        xlabel = "時刻 t（t ≤ 6 で学習、t > 6 は未知の外挿区間）",
        ylabel = "状態 u(t)",
        title = "軌道外挿：ブラックボックスNNの破綻 対 UDE",
    )
    println(io, """  <line x1="$(f1(x_split))" y1="$(f1(bL.y0))" x2="$(f1(x_split))" y2="$(f1(bL.y0 + bL.h))" stroke="$C_PURPLE" stroke-width="1.3" stroke-dasharray="4 3"/>""")
    println(io, """  <text x="$(f1(x_split + 6))" y="$(f1(bL.y0 + 15))" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_JP">外挿区間 (t &gt; 6)</text>""")

    pts_ex = join(["$(f1(px(bL, ts_all[i]))),$(f1(py(bL, u_ex[i])))" for i in eachindex(ts_all)], " ")
    pts_bb = join(["$(f1(px(bL, ts_all[i]))),$(f1(py(bL, u_bb[i])))" for i in eachindex(ts_all)], " ")
    pts_ud = join(["$(f1(px(bL, ts_all[i]))),$(f1(py(bL, u_ude[i])))" for i in eachindex(ts_all)], " ")
    println(io, """  <polyline fill="none" stroke="$C_INK" stroke-width="2.4" points="$pts_ex"/>""")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="1.9" stroke-dasharray="5 3" points="$pts_bb"/>""")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.2" stroke-dasharray="2 2" points="$pts_ud"/>""")
    for i in 1:3:61
        println(io, """  <circle cx="$(f1(px(bL, ts_tr[i])))" cy="$(f1(py(bL, u_ob[i])))" r="2.3" fill="$C_BLUE" opacity="0.75"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + bL.h - 24))" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">UDE 外挿RMSE = 0.014（真値と重なる）</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + bL.h - 9))" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">純NN u(t) 外挿RMSE = 0.735（発散）</text>""")

    bR = PlotBox(438, 38, 292, 232, -1.3, 1.3, -1.1, 1.1)
    draw_axes!(io, bR;
        xticks = [-1.0, -0.5, 0.0, 0.5, 1.0],
        yticks = [-1.0, -0.5, 0.0, 0.5, 1.0],
        xlabel = "状態 u",
        ylabel = "非線形項 g(u)",
        title = "未知法則 g(u) = -0.45u³ の内部復元",
    )
    ug = collect(range(-1.25, 1.25, length = 60))
    pts_gt = join(["$(f1(px(bR, u))),$(f1(py(bR, g_true(u))))" for u in ug], " ")
    pts_gn = join(["$(f1(px(bR, u))),$(f1(py(bR, nn_g(u, th_u))))" for u in ug], " ")
    println(io, """  <polyline fill="none" stroke="$C_INK" stroke-width="2.4" points="$pts_gt"/>""")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.3" stroke-dasharray="5 3" points="$pts_gn"/>""")
    println(io, """  <text x="$(f1(bR.x0 + 12))" y="$(f1(bR.y0 + 22))" fill="$C_INK" font-size="10.5" font-weight="700" font-family="$FONT_JP">実線：真の未知項 -0.45u³</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 12))" y="$(f1(bR.y0 + 38))" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">破線：UDEが復元した ĝ_θ(u) (RMSE=0.036)</text>""")

    println(io, "</svg>")
    write_svg("sciml-hybrid-ude.svg", String(take!(io)))
end

# ============================================================
# 19. 同一の平均・SEを隠す棒グラフ 対 Raincloud 表示 (l25):
#     unimodal-vs-bimodal-raincloud.svg
# ============================================================
function gen_unimodal_vs_bimodal_raincloud()
    match_summary(x; target_mean = 500.0, target_sd = 50.0) = target_mean .+ target_sd .* ((x .- mean(x)) ./ std(x))
    unimodal = match_summary(rand(Xoshiro(11), Normal(), 40))
    bimodal = match_summary(vcat(rand(Xoshiro(12), Normal(-2, 0.25), 20), rand(Xoshiro(13), Normal(2, 0.25), 20)))
    @assert isapprox(mean(unimodal), 500.0; atol = 1e-10) && isapprox(mean(bimodal), 500.0; atol = 1e-10)
    @assert isapprox(std(unimodal), 50.0; atol = 1e-10) && isapprox(std(bimodal), 50.0; atol = 1e-10)
    se_both = 50.0 / sqrt(40.0)

    io = IOBuffer()
    print(io, svg_header(760, 325, "平均500・SD50・n=40が完全に一致する単峰分布と二峰分布：棒＋SE表示（左）とRaincloud表示（右）"))

    # 左パネル: 平均 ± SE の棒グラフ（まったく同じに見える反例）
    bL = PlotBox(58, 38, 276, 232, 0.4, 2.6, 0.0, 650.0)
    draw_axes!(io, bL;
        xticks = [1.0, 2.0],
        xtick_labels = ["単峰 (n=40)", "二峰 (n=40)"],
        yticks = [0.0, 200.0, 400.0, 600.0],
        ylabel = "反応時間 (ms)",
        title = "棒＋SE：2群が完全に同一に見える",
    )
    y0_px = py(bL, 0.0)
    ym_px = py(bL, 500.0)
    ylo_px = py(bL, 500.0 - se_both)
    yhi_px = py(bL, 500.0 + se_both)
    for (pos, col) in ((1.0, C_BLUE), (2.0, C_PURPLE))
        cx = px(bL, pos)
        println(io, """  <rect x="$(f1(cx - 34))" y="$(f1(ym_px))" width="68" height="$(f1(y0_px - ym_px))" rx="3" fill="$col" fill-opacity="0.28" stroke="$col" stroke-width="1.6"/>""")
        println(io, """  <line x1="$(f1(cx))" y1="$(f1(ylo_px))" x2="$(f1(cx))" y2="$(f1(yhi_px))" stroke="$C_INK" stroke-width="2.4"/>""")
        println(io, """  <line x1="$(f1(cx - 9))" y1="$(f1(ylo_px))" x2="$(f1(cx + 9))" y2="$(f1(ylo_px))" stroke="$C_INK" stroke-width="2.0"/>""")
        println(io, """  <line x1="$(f1(cx - 9))" y1="$(f1(yhi_px))" x2="$(f1(cx + 9))" y2="$(f1(yhi_px))" stroke="$C_INK" stroke-width="2.0"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + bL.w / 2))" y="$(f1(py(bL, 585.0)))" text-anchor="middle" fill="$C_SUB" font-size="10.5" font-family="$FONT_MONO">どちらも mean=500.0, SE=7.9</text>""")

    # 右パネル: Raincloud (半バイオリンKDE + 生データjitter)
    bR = PlotBox(414, 38, 316, 232, 0.45, 2.75, 360.0, 640.0)
    draw_axes!(io, bR;
        xticks = [1.1, 2.15],
        xtick_labels = ["単峰 (n=40)", "二峰 (n=40)"],
        yticks = [400.0, 450.0, 500.0, 550.0, 600.0],
        ylabel = "反応時間 (ms)",
        title = "Raincloud：隠れていた二峰性が即座に分かる",
    )
    grid_y = collect(370.0:4.0:630.0)
    kde_gauss(xs, bw) = [mean(exp.(-0.5 .* ((yv .- xs) ./ bw) .^ 2) ./ (sqrt(2 * pi) * bw)) for yv in grid_y]
    jit_rng = Xoshiro(77)
    for (pos, arr, bw, col) in ((1.0, unimodal, 18.0, C_BLUE), (2.05, bimodal, 10.5, C_PURPLE))
        dens = kde_gauss(arr, bw)
        dmax = maximum(dens)
        poly_pts = ["$(f1(px(bR, pos))),$(f1(py(bR, grid_y[1])))"]
        for (yv, dv) in zip(grid_y, dens)
            push!(poly_pts, "$(f1(px(bR, pos + 0.42 * (dv / dmax)))),$(f1(py(bR, yv)))")
        end
        push!(poly_pts, "$(f1(px(bR, pos))),$(f1(py(bR, grid_y[end])))")
        println(io, """  <polygon points="$(join(poly_pts, " "))" fill="$col" fill-opacity="0.26" stroke="$col" stroke-width="1.6"/>""")
        for v in arr
            jx = pos - 0.16 + 0.11 * (rand(jit_rng) - 0.5)
            println(io, """  <circle cx="$(f1(px(bR, jx)))" cy="$(f1(py(bR, v)))" r="3.1" fill="$col" fill-opacity="0.62"/>""")
        end
        q25, q50, q75 = quantile(arr, [0.25, 0.5, 0.75])
        cx_box = px(bR, pos - 0.03)
        println(io, """  <line x1="$(f1(cx_box))" y1="$(f1(py(bR, q25)))" x2="$(f1(cx_box))" y2="$(f1(py(bR, q75)))" stroke="$C_INK" stroke-width="3.2"/>""")
        draw_diamond!(io, cx_box, py(bR, 500.0), 4.8; fill = C_INK)
    end
    println(io, """  <text x="$(f1(px(bR, 2.15)))" y="$(f1(py(bR, 500.0) + 4))" text-anchor="start" fill="$C_RED" font-size="10" font-weight="700" font-family="$FONT_JP">← 平均500付近に実測0件！</text>""")

    println(io, "</svg>")
    write_svg("unimodal-vs-bimodal-raincloud.svg", String(take!(io)))
end

# ============================================================
# 20. 反復測定Spaghetti＋個人内CI と リンク尺度band! (m08):
#     paired-spaghetti-linkband.svg
# ============================================================
function gen_paired_spaghetti_linkband()
    rng = Xoshiro(4801)
    n = 24
    subj_base = 520.0 .+ 85.0 .* randn(rng, n)
    delta = -18.5 .+ 11.0 .* randn(rng, n)
    pre = subj_base
    post = subj_base .+ delta
    tcrit = quantile(TDist(n - 1), 0.975)
    se_btw_pre = std(pre) / sqrt(n)
    se_btw_post = std(post) / sqrt(n)
    grand_m = 0.5 * (mean(pre) + mean(post))
    subj_m = 0.5 .* (pre .+ post)
    se_ws = std(pre .- subj_m .+ grand_m) / sqrt(n) * sqrt(2.0)

    io = IOBuffer()
    print(io, svg_header(760, 325, "反復測定の個人別Spaghetti線と群間CI対Morey個人内CI（左）、およびロジット空間band!対確率直線の負値突破反例（右）"))

    bL = PlotBox(58, 38, 302, 232, 0.55, 2.75, 340.0, 720.0)
    draw_axes!(io, bL;
        xticks = [0.95, 1.85, 2.42],
        xtick_labels = ["Pre", "Post", "CI幅比較"],
        yticks = [400.0, 500.0, 600.0, 700.0],
        ylabel = "反応時間 (ms)",
        title = "対応Spaghetti：23/24人が短縮 (個人内CIは明瞭)",
    )
    for i in 1:n
        col = post[i] < pre[i] ? C_BLUE : C_RED
        op = post[i] < pre[i] ? "0.38" : "0.85"
        println(io, """  <line x1="$(f1(px(bL, 0.95)))" y1="$(f1(py(bL, pre[i])))" x2="$(f1(px(bL, 1.85)))" y2="$(f1(py(bL, post[i])))" stroke="$col" stroke-width="1.3" stroke-opacity="$op"/>""")
    end
    println(io, """  <line x1="$(f1(px(bL, 0.95)))" y1="$(f1(py(bL, mean(pre))))" x2="$(f1(px(bL, 1.85)))" y2="$(f1(py(bL, mean(post))))" stroke="$C_INK" stroke-width="3.0"/>""")
    draw_diamond!(io, px(bL, 0.95), py(bL, mean(pre)), 5.2; fill = C_INK)
    draw_diamond!(io, px(bL, 1.85), py(bL, mean(post)), 5.2; fill = C_INK)

    # 群間95%CI (広い灰線) vs Morey個人内95%CI (緑の短い範囲)
    xb1, xb2 = px(bL, 2.30), px(bL, 2.54)
    println(io, """  <line x1="$(f1(xb1))" y1="$(f1(py(bL, mean(pre) - tcrit * se_btw_pre)))" x2="$(f1(xb1))" y2="$(f1(py(bL, mean(pre) + tcrit * se_btw_pre)))" stroke="#8A8296" stroke-width="3.0"/>""")
    println(io, """  <line x1="$(f1(xb2))" y1="$(f1(py(bL, mean(post) - tcrit * se_btw_post)))" x2="$(f1(xb2))" y2="$(f1(py(bL, mean(post) + tcrit * se_btw_post)))" stroke="#8A8296" stroke-width="3.0"/>""")
    println(io, """  <line x1="$(f1(xb1))" y1="$(f1(py(bL, mean(pre) - tcrit * se_ws)))" x2="$(f1(xb1))" y2="$(f1(py(bL, mean(pre) + tcrit * se_ws)))" stroke="$C_GREEN" stroke-width="5.0"/>""")
    println(io, """  <line x1="$(f1(xb2))" y1="$(f1(py(bL, mean(post) - tcrit * se_ws)))" x2="$(f1(xb2))" y2="$(f1(py(bL, mean(post) + tcrit * se_ws)))" stroke="$C_GREEN" stroke-width="5.0"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="#6E6879" font-size="10" font-family="$FONT_JP">灰：群間CI(±34ms・重複) / 緑：個人内CI(±3.2ms)</text>""")

    # 右パネル: リンク尺度 band! 対 確率直線の ±1.96 SE
    bR = PlotBox(434, 38, 298, 232, -2.5, 2.5, -0.10, 0.85)
    draw_axes!(io, bR;
        xticks = [-2.0, -1.0, 0.0, 1.0, 2.0],
        yticks = [0.0, 0.2, 0.4, 0.6, 0.8],
        xlabel = "説明変数 x",
        ylabel = "予測確率 p(x)",
        title = "logit空間でband!を作り逆変換する（0未満を防ぐ）",
    )
    y0_r = py(bR, 0.0)
    println(io, """  <rect x="$(f1(bR.x0 + 1))" y="$(f1(y0_r))" width="$(f1(bR.w - 2))" height="$(f1(bR.y0 + bR.h - y0_r - 1))" fill="#FADAD7" fill-opacity="0.35"/>""")
    println(io, """  <line x1="$(f1(bR.x0))" y1="$(f1(y0_r))" x2="$(f1(bR.x0 + bR.w))" y2="$(f1(y0_r))" stroke="$C_INK" stroke-width="1.2" stroke-dasharray="4 3"/>""")

    xs = collect(range(-2.5, 2.5, length = 60))
    logistic(z) = 1.0 / (1.0 + exp(-z))
    eta(x) = -1.25 + 1.05 * x
    se_eta(x) = sqrt(0.16 + 0.10 * (x + 0.3)^2)

    # Link-scale band polygon
    up_pts = ["$(f1(px(bR, x))),$(f1(py(bR, logistic(eta(x) + 1.96 * se_eta(x)))))" for x in xs]
    lo_pts = ["$(f1(px(bR, x))),$(f1(py(bR, logistic(eta(x) - 1.96 * se_eta(x)))))" for x in reverse(xs)]
    println(io, """  <polygon points="$(join(vcat(up_pts, lo_pts), " "))" fill="$C_GREEN" fill-opacity="0.24" stroke="$C_GREEN" stroke-width="1.3"/>""")

    # Naive probability-scale lower bound dipping below 0!
    naive_lo_pts = join(["$(f1(px(bR, x))),$(f1(py(bR, max(-0.095, logistic(eta(x)) - 1.96 * logistic(eta(x)) * (1 - logistic(eta(x))) * se_eta(x)))))" for x in xs], " ")
    mean_pts = join(["$(f1(px(bR, x))),$(f1(py(bR, logistic(eta(x)))))" for x in xs], " ")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="1.9" stroke-dasharray="5 3" points="$naive_lo_pts"/>""")
    println(io, """  <polyline fill="none" stroke="$C_INK" stroke-width="2.3" points="$mean_pts"/>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">緑帯：logistic(η̂ ± 1.96 SE_η) は常に (0, 1) 内</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(py(bR, -0.065)))" fill="$C_RED" font-size="10" font-weight="700" font-family="$FONT_JP">赤破線：p̂ - 1.96 SE_p が p &lt; 0 の不可能領域へ突破</text>""")

    println(io, "</svg>")
    write_svg("paired-spaghetti-linkband.svg", String(take!(io)))
end

# ============================================================
# 21. 2次元双安定位相平面・ヌルクライン と 較正曲線 (a08):
#     phase-portrait-calibration.svg
# ============================================================
function gen_phase_portrait_calibration()
    rhs2d(u1, u2) = (-u1 + 1.6 * tanh(u1) - 0.9 * tanh(u2),
                     -u2 + 1.6 * tanh(u2) - 0.9 * tanh(u1))
    function rk4_path(u0::Tuple{Float64, Float64}, dt::Float64, steps::Int)
        pts = Vector{Tuple{Float64, Float64}}(undef, steps + 1)
        u1, u2 = u0
        pts[1] = (u1, u2)
        for s in 1:steps
            k1_1, k1_2 = rhs2d(u1, u2)
            k2_1, k2_2 = rhs2d(u1 + 0.5 * dt * k1_1, u2 + 0.5 * dt * k1_2)
            k3_1, k3_2 = rhs2d(u1 + 0.5 * dt * k2_1, u2 + 0.5 * dt * k2_2)
            k4_1, k4_2 = rhs2d(u1 + dt * k3_1, u2 + dt * k3_2)
            u1 += (dt / 6.0) * (k1_1 + 2k2_1 + 2k3_1 + k4_1)
            u2 += (dt / 6.0) * (k1_2 + 2k2_2 + 2k3_2 + k4_2)
            pts[s + 1] = (u1, u2)
        end
        return pts
    end

    io = IOBuffer()
    print(io, svg_header(760, 330, "2次元双安定系の位相平面・ヌルクライン・セパラトリクス（左）と、同一AUC=0.791の2モデルを識別する較正曲線（右）"))

    # 左パネル: 位相平面 [-3, 3] × [-3, 3]
    bL = PlotBox(56, 38, 286, 236, -3.0, 3.0, -3.0, 3.0)
    draw_axes!(io, bL;
        xticks = [-2.0, 0.0, 2.0],
        yticks = [-2.0, 0.0, 2.0],
        xlabel = "状態 u₁",
        ylabel = "状態 u₂",
        title = "位相平面：微小差がセパラトリクスを越え分岐",
    )
    # ベクトル場
    for g1 in -2.5:1.0:2.5, g2 in -2.5:1.0:2.5
        d1, d2 = rhs2d(g1, g2)
        nm = hypot(d1, d2)
        nm < 1e-6 && continue
        s = 0.34 / max(nm, 0.45)
        x0, y0 = px(bL, g1), py(bL, g2)
        x1, y1 = px(bL, g1 + d1 * s), py(bL, g2 + d2 * s)
        println(io, """  <line x1="$(f1(x0))" y1="$(f1(y0))" x2="$(f1(x1))" y2="$(f1(y1))" stroke="#B8B2C2" stroke-width="1.1"/>""")
        println(io, """  <circle cx="$(f1(x1))" cy="$(f1(y1))" r="1.4" fill="#9A93A6"/>""")
    end
    # 対角セパラトリクス u1 = u2
    println(io, """  <line x1="$(f1(px(bL, -3.0)))" y1="$(f1(py(bL, -3.0)))" x2="$(f1(px(bL, 3.0)))" y2="$(f1(py(bL, 3.0)))" stroke="$C_AXIS" stroke-width="1.3" stroke-dasharray="4 3"/>""")
    # du1/dt = 0 ヌルクライン: tanh(u2) = (-u1 + 1.6 tanh(u1)) / 0.9
    nc1_pts = String[]
    nc2_pts = String[]
    for u in -2.85:0.05:2.85
        rhs_val = (-u + 1.6 * tanh(u)) / 0.9
        if abs(rhs_val) < 0.995
            v = atanh(rhs_val)
            if abs(v) <= 2.95
                push!(nc1_pts, "$(f1(px(bL, u))),$(f1(py(bL, v)))")
                push!(nc2_pts, "$(f1(px(bL, v))),$(f1(py(bL, u)))")
            end
        end
    end
    println(io, """  <polyline fill="none" stroke="$C_BLUE" stroke-width="1.5" stroke-dasharray="3 2" points="$(join(nc1_pts, " "))"/>""")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE" stroke-width="1.5" stroke-dasharray="3 2" points="$(join(nc2_pts, " "))"/>""")

    # 2本の近接初期値軌道
    tr_a = rk4_path((0.12, 0.08), 0.05, 180)
    tr_b = rk4_path((0.08, 0.12), 0.05, 180)
    pts_a = join(["$(f1(px(bL, p[1]))),$(f1(py(bL, p[2])))" for p in tr_a], " ")
    pts_b = join(["$(f1(px(bL, p[1]))),$(f1(py(bL, p[2])))" for p in tr_b], " ")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.5" points="$pts_a"/>""")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.5" points="$pts_b"/>""")
    # 鞍点 (0, 0) と 2つの安定アトラクタ
    println(io, """  <circle cx="$(f1(px(bL, 0.0)))" cy="$(f1(py(bL, 0.0)))" r="4.5" fill="#FFFFFF" stroke="$C_INK" stroke-width="2.0"/>""")
    println(io, """  <circle cx="$(f1(px(bL, 2.464)))" cy="$(f1(py(bL, -2.464)))" r="5.0" fill="$C_GREEN"/>""")
    println(io, """  <circle cx="$(f1(px(bL, -2.464)))" cy="$(f1(py(bL, 2.464)))" r="5.0" fill="$C_RED"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + bL.h - 8))" fill="$C_INK" font-size="10" font-family="$FONT_JP">○ 鞍点(0,0) / ● 安定平衡点 (±2.46, ∓2.46)</text>""")

    # 右パネル: 較正曲線 (Calibration Curve)
    bR = PlotBox(434, 38, 292, 236, 0.0, 1.0, 0.0, 1.0)
    draw_axes!(io, bR;
        xticks = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        yticks = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        xlabel = "モデルの予測確率",
        ylabel = "実測の陽性割合",
        title = "較正曲線：AUC=0.791で同一でも過信を検出",
    )
    println(io, """  <line x1="$(f1(px(bR, 0.0)))" y1="$(f1(py(bR, 0.0)))" x2="$(f1(px(bR, 1.0)))" y2="$(f1(py(bR, 1.0)))" stroke="$C_AXIS" stroke-width="1.5" stroke-dasharray="5 4"/>""")

    rng_c = Xoshiro(5802)
    n_c = 1200
    x_c = randn(rng_c, n_c)
    logistic(z) = 1.0 / (1.0 + exp(-z))
    eta_t = -0.4 .+ 1.25 .* x_c
    p_cal = logistic.(eta_t)
    y_c = Float64.(rand(rng_c, n_c) .< p_cal)
    p_over = logistic.(2.8 .* eta_t .+ 0.55)

    for (prob, col) in ((p_cal, C_BLUE), (p_over, C_RED))
        ord = sortperm(prob)
        bs = div(n_c, 10)
        bpts = String[]
        for b in 1:10
            idx = ord[((b - 1) * bs + 1):(b == 10 ? n_c : b * bs)]
            mp, my = mean(prob[idx]), mean(y_c[idx])
            push!(bpts, "$(f1(px(bR, mp))),$(f1(py(bR, my)))")
            println(io, """  <circle cx="$(f1(px(bR, mp)))" cy="$(f1(py(bR, my)))" r="3.6" fill="$col"/>""")
        end
        println(io, """  <polyline fill="none" stroke="$col" stroke-width="2.2" points="$(join(bpts, " "))"/>""")
    end
    println(io, """  <text x="$(f1(bR.x0 + 10))" y="$(f1(bR.y0 + 20))" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_JP">青：較正良好 (AUC=0.791, ECE=0.036)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 10))" y="$(f1(bR.y0 + 36))" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">赤：過信モデル (AUC=0.791, ECE=0.140)</text>""")

    println(io, "</svg>")
    write_svg("phase-portrait-calibration.svg", String(take!(io)))
end

# ============================================================
# 22. Revise常駐ループ対毎回再起動の時間比較と二段検証構造 (x10):
#     workflow-revise-test-loop.svg
# ============================================================
function gen_workflow_revise_test_loop()
    io = IOBuffer()
    print(io, svg_header(760, 315, "毎回プロセス再起動対Revise常駐REPLの10回修正累積時間比較（左）と、日常高速ループからクリーンバッチ再現・表自動出力への二段設計（右）"))

    # 左パネル: 1〜10回目のコード修正・確認にかかる累積待ち時間 (秒)
    bL = PlotBox(56, 38, 304, 226, 0.7, 10.3, 0.0, 155.0)
    draw_axes!(io, bL;
        xticks = [1.0, 3.0, 5.0, 7.0, 10.0],
        yticks = [0.0, 50.0, 100.0, 150.0],
        xlabel = "関数を修正して試した回数",
        ylabel = "累積待ち時間 (秒)",
        title = "TTFX対策：Revise常駐なら2回目以降は一瞬",
    )
    ks = collect(1:10)
    t_restart = [14.2 * k for k in ks]
    t_revise  = [14.2 + 0.28 * (k - 1) for k in ks]
    pts_res = join(["$(f1(px(bL, Float64(k)))),$(f1(py(bL, t_restart[k])))" for k in ks], " ")
    pts_rev = join(["$(f1(px(bL, Float64(k)))),$(f1(py(bL, t_revise[k])))" for k in ks], " ")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.4" stroke-dasharray="5 3" points="$pts_res"/>""")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.7" points="$pts_rev"/>""")
    for k in ks
        println(io, """  <circle cx="$(f1(px(bL, Float64(k))))" cy="$(f1(py(bL, t_restart[k])))" r="3.2" fill="$C_RED"/>""")
        println(io, """  <circle cx="$(f1(px(bL, Float64(k))))" cy="$(f1(py(bL, t_revise[k])))" r="3.4" fill="$C_GREEN"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 10))" y="$(f1(bL.y0 + 20))" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">赤：毎回 julia run.jl 再起動 (10回で約142秒)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 10))" y="$(f1(bL.y0 + 37))" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">緑：常駐REPL + Revise.includet (10回で約16.7秒)</text>""")

    # 右パネル: 研究コードの二段ループ設計 (対話試行 ⇄ クリーン再現・自動表出力)
    rx0, ry0, rw, rh = 398.0, 38.0, 336.0, 226.0
    println(io, """  <text x="$(f1(rx0 + rw / 2))" y="$(f1(ry0 - 10))" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">高速試行と再現性を両立する二段ワークフロー</text>""")

    # 上段ボックス: Stage 1 日常開発ループ
    println(io, """  <rect x="$(f1(rx0))" y="$(f1(ry0))" width="$(f1(rw))" height="98" rx="10" fill="#EAF6E6" stroke="$C_GREEN" stroke-width="1.6"/>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 22))" fill="#2B7A1E" font-size="11.5" font-weight="700" font-family="$FONT_JP">① 日常の試行錯誤（常駐REPL・ミリ秒応答）</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 44))" fill="$C_INK" font-size="10.5" font-family="$FONT_MONO">using Revise; includet("src/analysis.jl")</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 64))" fill="$C_INK" font-size="10.5" font-family="$FONT_JP">・保存と同時に差分だけ再コンパイル</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 82))" fill="$C_INK" font-size="10.5" font-family="$FONT_JP">・@testset と @btime f(\$x) で境界と速度を即検算</text>""")

    # 矢印
    mid_x = rx0 + rw / 2
    println(io, """  <line x1="$(f1(mid_x))" y1="$(f1(ry0 + 100))" x2="$(f1(mid_x))" y2="$(f1(ry0 + 122))" stroke="$C_INK" stroke-width="2.0"/>""")
    println(io, """  <polygon points="$(f1(mid_x - 5)),$(f1(ry0 + 118)) $(f1(mid_x + 5)),$(f1(ry0 + 118)) $(f1(mid_x)),$(f1(ry0 + 126))" fill="$C_INK"/>""")

    # 下段ボックス: Stage 2 論文出力・公開前クリーン検証
    println(io, """  <rect x="$(f1(rx0))" y="$(f1(ry0 + 128))" width="$(f1(rw))" height="98" rx="10" fill="#F3ECF7" stroke="$C_PURPLE" stroke-width="1.6"/>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 150))" fill="#6D3E86" font-size="11.5" font-weight="700" font-family="$FONT_JP">② 論文出力・最終監査（新プロセス・転記ゼロ）</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 172))" fill="$C_INK" font-size="10.5" font-family="$FONT_MONO">julia --startup-file=no --project=. run.jl</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 192))" fill="$C_INK" font-size="10.5" font-family="$FONT_JP">・個人設定 startup.jl を遮断して完全再現を確認</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 210))" fill="$C_INK" font-size="10.5" font-family="$FONT_JP">・PrettyTables / Quarto へ表とSVGを直接書き出す</text>""")

    println(io, "</svg>")
    write_svg("workflow-revise-test-loop.svg", String(take!(io)))
end

# ============================================================
# 23. Juliaってなに? (l01-intro.js): why-julia-two-language.svg
# ============================================================
function gen_why_julia_two_language()
    io = IOBuffer()
    print(io, svg_header(760, 305, "二言語問題の解消とJuliaが得意な計算領域"))

    # 左パネル: 書きやすさ × 手書きループ速度の2次元マップ
    bL = PlotBox(68.0, 38.0, 290.0, 212.0, 0.0, 10.0, 0.0, 10.0)
    draw_axes!(io, bL;
        xticks = [2.0, 8.0],
        xtick_labels = ["記述が長い・複雑", "数式に近く短い"],
        yticks = [2.0, 8.2],
        ytick_labels = ["遅い", "高速"],
        xlabel = "コードの書きやすさ・試行錯誤のしやすさ",
        ylabel = "手書きループの実行速度",
        title = "「二言語問題」を1つの言語で解く",
        mono_ticks = false,
    )

    # 右上のスイートスポット背景
    rx_sw = px(bL, 5.8)
    ry_sw = py(bL, 9.7)
    rw_sw = px(bL, 9.8) - rx_sw
    rh_sw = py(bL, 6.2) - ry_sw
    println(io, """  <rect x="$(f1(rx_sw))" y="$(f1(ry_sw))" width="$(f1(rw_sw))" height="$(f1(rh_sw))" rx="10" fill="#F3ECF7" stroke="$C_PURPLE" stroke-width="1.4" stroke-dasharray="4 3"/>""")

    # C / C++ / Fortran (左上)
    cx_c, cy_c = px(bL, 2.3), py(bL, 8.5)
    println(io, """  <circle cx="$(f1(cx_c))" cy="$(f1(cy_c))" r="8.5" fill="$C_BLUE"/>""")
    println(io, """  <text x="$(f1(cx_c + 13))" y="$(f1(cy_c - 2))" fill="$C_INK" font-size="11" font-weight="700" font-family="$FONT_JP">C / C++ / Fortran</text>""")
    println(io, """  <text x="$(f1(cx_c + 13))" y="$(f1(cy_c + 13))" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">高速だが型宣言・コンパイルが重厚</text>""")

    # R / Python 純ループ (右下)
    cx_py, cy_py = px(bL, 8.0), py(bL, 2.4)
    println(io, """  <circle cx="$(f1(cx_py))" cy="$(f1(cy_py))" r="8.5" fill="#D97724"/>""")
    println(io, """  <text x="$(f1(cx_py - 88))" y="$(f1(cy_py - 16))" fill="$C_INK" font-size="11" font-weight="700" font-family="$FONT_JP">R・Python (手書きループ)</text>""")
    println(io, """  <text x="$(f1(cx_py - 102))" y="$(f1(cy_py - 2))" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">直感的だが1試行ずつの反復は苦手</text>""")

    # 二言語書き直しの破線矢印 (右下 -> 左上)
    println(io, """  <line x1="$(f1(cx_py - 10))" y1="$(f1(cy_py - 8))" x2="$(f1(cx_c + 12))" y2="$(f1(cy_c + 16))" stroke="$C_RED" stroke-width="1.7" stroke-dasharray="5 3"/>""")
    println(io, """  <text x="$(f1((cx_py + cx_c) / 2 - 42))" y="$(f1((cy_py + cy_c) / 2 + 16))" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_JP">本番だけC++等で書き直し?</text>""")

    # Julia (右上)
    cx_jl, cy_jl = px(bL, 8.2), py(bL, 8.4)
    println(io, """  <circle cx="$(f1(cx_jl))" cy="$(f1(cy_jl))" r="10.5" fill="$C_GREEN" stroke="#FFFFFF" stroke-width="2"/>""")
    println(io, """  <text x="$(f1(cx_jl - 18))" y="$(f1(cy_jl - 15))" fill="$C_GREEN" font-size="12.5" font-weight="700" font-family="$FONT_JP">Julia</text>""")
    println(io, """  <text x="$(f1(rx_sw + 8))" y="$(f1(py(bL, 6.65)))" fill="#5A3B6E" font-size="9.8" font-weight="700" font-family="$FONT_JP">短く書けて、そのまま機械語へ!</text>""")

    # 右パネル: どんな計算で差がつくか（誠実な2場面比較）
    rx0, ry0, rw, rh = 398.0, 38.0, 338.0, 212.0
    println(io, """  <text x="$(f1(rx0 + rw / 2))" y="$(f1(ry0 - 10))" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_JP">場面でわかるJuliaの効きどころ</text>""")
    println(io, """  <rect x="$(f1(rx0))" y="$(f1(ry0))" width="$(f1(rw))" height="$(f1(rh))" rx="10" fill="#FAF8F4" stroke="$C_AXIS" stroke-width="1.1"/>""")

    # 上段: 既存C/BLAS関数の1回呼び出し
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 24))" fill="$C_INK" font-size="11.2" font-weight="700" font-family="$FONT_JP">A. 既存の集計・行列計算を1回呼ぶとき</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 41))" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">（どの言語も裏側でC/BLASを呼ぶため速さはほぼ同等）</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 62))" fill="$C_INK" font-size="10.5" font-family="$FONT_JP">R / Python</text>""")
    println(io, """  <rect x="$(f1(rx0 + 88))" y="$(f1(ry0 + 51))" width="34" height="14" rx="4" fill="#8A8296"/>""")
    println(io, """  <text x="$(f1(rx0 + 128))" y="$(f1(ry0 + 62))" fill="$C_SUB" font-size="10" font-family="$FONT_MONO">~0.02 s</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 82))" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">Julia</text>""")
    println(io, """  <rect x="$(f1(rx0 + 88))" y="$(f1(ry0 + 71))" width="30" height="14" rx="4" fill="$C_GREEN"/>""")
    println(io, """  <text x="$(f1(rx0 + 124))" y="$(f1(ry0 + 82))" fill="$C_GREEN" font-size="10" font-weight="700" font-family="$FONT_MONO">~0.02 s (同等)</text>""")

    println(io, """  <line x1="$(f1(rx0 + 14))" y1="$(f1(ry0 + 98))" x2="$(f1(rx0 + rw - 14))" y2="$(f1(ry0 + 98))" stroke="$C_GRID" stroke-width="1.2"/>""")

    # 下段: 自分で書く1万回の反復シミュレーション (DDM・ブートストラップ・MCMC)
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 120))" fill="$C_INK" font-size="11.2" font-weight="700" font-family="$FONT_JP">B. 独自のモデルを何万回も反復するとき</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 137))" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">（反応時間DDM・ブートストラップ・検出力計算・MCMC）</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 160))" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">純粋なループ</text>""")
    println(io, """  <rect x="$(f1(rx0 + 88))" y="$(f1(ry0 + 149))" width="224" height="15" rx="4" fill="$C_RED"/>""")
    println(io, """  <text x="$(f1(rx0 + 94))" y="$(f1(ry0 + 160))" fill="#FFFFFF" font-size="9.8" font-weight="700" font-family="$FONT_JP">数十秒〜数分（1ステップずつ型を解釈）</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 184))" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">Juliaループ</text>""")
    println(io, """  <rect x="$(f1(rx0 + 88))" y="$(f1(ry0 + 173))" width="10" height="15" rx="3" fill="$C_GREEN"/>""")
    println(io, """  <text x="$(f1(rx0 + 104))" y="$(f1(ry0 + 184))" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">約0.1〜0.3秒！（書き直さず数十倍高速）</text>""")
    println(io, """  <text x="$(f1(rx0 + 14))" y="$(f1(ry0 + 203))" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">※ 初回実行時だけコンパイルに数秒かかります（2回目以降は一瞬）</text>""")

    println(io, "</svg>")
    write_svg("why-julia-two-language.svg", String(take!(io)))
end

# ============================================================
# 24. 補11 (x11-why-julia-visualized.js): julia-loop-fusion-scaling.svg
# ============================================================
function gen_julia_loop_fusion_scaling()
    # 左パネル用: 逐次更新 s = 0.98*s + v における動的ボクシング (48 B/step) vs 具象型 Float64 (0 B/step)
    ns_exp = [2.0, 3.0, 4.0, 5.0] # 10^2 .. 10^5
    boxed_kib = [48.0 * (10.0^e) / 1024.0 for e in ns_exp] # 4.69 KiB .. 4687.5 KiB

    # 右パネル用: N = 50,000 ガウス重み式の段階別一時配列割当 vs ドット融合 (@.)
    n_vec = 50_000
    per_vec_kib = (n_vec * sizeof(Float64)) / 1024.0 # 390.625 KiB per temporary Float64 vector
    @assert isapprox(5 * per_vec_kib, 1953.125; atol = 1e-6)

    io = IOBuffer()
    print(io, svg_header(760, 312, "型安定ループのスケーリングとドット融合による一時配列ゼロ化"))

    # 左パネル: ステップ数 N に対する累積メモリ割当 (KiB, 対数表示と0Bベースライン)
    bL = PlotBox(68.0, 38.0, 286.0, 214.0, 1.8, 5.2, 0.0, 4.2)
    draw_axes!(io, bL;
        xticks = [2.0, 3.0, 4.0, 5.0],
        xtick_labels = ["10²", "10³", "10⁴", "10⁵"],
        yticks = [0.0, 1.0, 2.0, 3.0, 4.0],
        ytick_labels = ["0 B", "10 KiB", "100 KiB", "1 MiB", "10 MiB"],
        xlabel = "逐次シミュレーションの反復ステップ数 N",
        ylabel = "1実行あたりの動的メモリ割当",
        title = "逐次ループ：動的型タグ vs Julia具象型",
        mono_ticks = true,
    )

    # 対数軸マッピング: y=0 は 0 B、y >= 1 は log10(KiB) (10^1 KiB -> 1.0, 10^4 KiB -> 4.0)
    map_y_kib(kib) = kib <= 0.0 ? 0.0 : clamp(log10(kib), 0.35, 4.1)
    pts_box = join(["$(f1(px(bL, e))),$(f1(py(bL, map_y_kib(kib))))" for (e, kib) in zip(ns_exp, boxed_kib)], " ")
    pts_f64 = join(["$(f1(px(bL, e))),$(f1(py(bL, 0.08)))" for e in ns_exp], " ")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.5" stroke-dasharray="6 3" points="$pts_box"/>""")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="3.0" points="$pts_f64"/>""")
    for (e, kib) in zip(ns_exp, boxed_kib)
        println(io, """  <circle cx="$(f1(px(bL, e)))" cy="$(f1(py(bL, map_y_kib(kib))))" r="3.8" fill="$C_RED"/>""")
        println(io, """  <circle cx="$(f1(px(bL, e)))" cy="$(f1(py(bL, 0.08)))" r="4.0" fill="$C_GREEN"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 10))" y="$(f1(bL.y0 + 20))" fill="$C_RED" font-size="10.2" font-weight="700" font-family="$FONT_JP">赤：型が動的に揺れるループ (Vector{Any})</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 18))" y="$(f1(bL.y0 + 35))" fill="$C_SUB" font-size="9.6" font-family="$FONT_JP">N=10⁵ で約 4.6 MiB 確保・GC停止が頻発</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 16))" y="$(f1(py(bL, 0.42)))" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">緑：Julia型安定ループ (Vector{Float64}) → 常に 0 B!</text>""")

    # 右パネル: N=50,000 要素の数式チェイン exp(-0.5 * ((x - mu) / sd)^2)
    bR = PlotBox(430.0, 38.0, 304.0, 214.0, 0.0, 3.0, 0.0, 2250.0)
    draw_axes!(io, bR;
        xticks = [0.85, 2.15],
        xtick_labels = ["一時配列5本(非融合)", "Julia @. ドット融合"],
        yticks = [0.0, 500.0, 1000.0, 1500.0, 2000.0],
        ytick_labels = ["0", "500", "1000", "1500", "2000"],
        xlabel = "N = 50,000 要素へのガウス重み計算",
        ylabel = "一時配列のヒープ割当 (KiB)",
        title = "ドット融合 (@.) で中間配列が消える",
        mono_ticks = true,
    )

    # 非融合の5段階スタック棒グラフ (x - mu, / sd, ^2, * -0.5, exp)
    bx1 = px(bR, 0.85) - 34.0
    bw = 68.0
    step_labels = ["x .- mu", "z1 ./ sd", "z2 .^ 2", "-0.5 .* z3", "exp.(z4)"]
    step_fills  = ["#F6D5D2", "#F0B5AF", "#E8928A", "#DC685E", "#CB3C33"]
    for s_idx in 1:5
        y_lo = (s_idx - 1) * per_vec_kib
        y_hi = s_idx * per_vec_kib
        yy_top = py(bR, y_hi)
        hh = py(bR, y_lo) - yy_top
        println(io, """  <rect x="$(f1(bx1))" y="$(f1(yy_top))" width="$(f1(bw))" height="$(f1(hh))" fill="$(step_fills[s_idx])" stroke="#FFFFFF" stroke-width="1"/>""")
        txt_col = s_idx >= 4 ? "#FFFFFF" : C_INK
        println(io, """  <text x="$(f1(bx1 + bw / 2))" y="$(f1(yy_top + hh / 2 + 3.5))" text-anchor="middle" fill="$txt_col" font-size="9.5" font-weight="700" font-family="$FONT_MONO">$(step_labels[s_idx])</text>""")
    end
    println(io, """  <text x="$(f1(bx1 + bw / 2))" y="$(f1(py(bR, 5 * per_vec_kib) - 7))" text-anchor="middle" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">計 ~2,000 KiB (5往復)</text>""")

    # 融合バー (0 KiB + 強調バッジ)
    bx2 = px(bR, 2.15) - 34.0
    y_zero = py(bR, 0.0)
    println(io, """  <rect x="$(f1(bx2))" y="$(f1(y_zero - 5.0))" width="$(f1(bw))" height="5.0" rx="2" fill="$C_GREEN"/>""")
    println(io, """  <rect x="$(f1(bx2 - 14))" y="$(f1(py(bR, 920.0)))" width="$(f1(bw + 28))" height="62" rx="8" fill="#EAF6E6" stroke="$C_GREEN" stroke-width="1.4"/>""")
    println(io, """  <text x="$(f1(bx2 + bw / 2))" y="$(f1(py(bR, 920.0) + 23))" text-anchor="middle" fill="$C_GREEN" font-size="11.5" font-weight="700" font-family="$FONT_JP">0 KiB (割当ゼロ!)</text>""")
    println(io, """  <text x="$(f1(bx2 + bw / 2))" y="$(f1(py(bR, 920.0) + 41))" text-anchor="middle" fill="$C_INK" font-size="9.5" font-family="$FONT_JP">1回のループに自動融合</text>""")
    println(io, """  <text x="$(f1(bx2 + bw / 2))" y="$(f1(py(bR, 920.0) + 55))" text-anchor="middle" fill="$C_SUB" font-size="9.0" font-family="$FONT_MONO">@. out = exp(...)</text>""")

    println(io, "</svg>")
    write_svg("julia-loop-fusion-scaling.svg", String(take!(io)))
end

# ============================================================
# 25. 補11 (x11-why-julia-visualized.js): julia-composability-ad-vcurve.svg
# ============================================================
struct DualFigX11 <: Real
    val::Float64
    der::Float64
end
Base.:+(a::DualFigX11, b::DualFigX11) = DualFigX11(a.val + b.val, a.der + b.der)
Base.:+(a::DualFigX11, c::Real)       = DualFigX11(a.val + c, a.der)
Base.:+(c::Real, a::DualFigX11)       = DualFigX11(c + a.val, a.der)
Base.:-(a::DualFigX11, b::DualFigX11) = DualFigX11(a.val - b.val, a.der - b.der)
Base.:*(a::DualFigX11, b::DualFigX11) = DualFigX11(a.val * b.val, a.der * b.val + a.val * b.der)
Base.:*(c::Real, a::DualFigX11)       = DualFigX11(c * a.val, c * a.der)
Base.:/(a::DualFigX11, b::DualFigX11) = DualFigX11(a.val / b.val, (a.der * b.val - a.val * b.der) / (b.val * b.val))
Base.exp(a::DualFigX11)               = (ea = exp(a.val); DualFigX11(ea, ea * a.der))
Base.sin(a::DualFigX11)               = DualFigX11(sin(a.val), cos(a.val) * a.der)

function gen_julia_composability_ad_vcurve()
    f_nl(theta::Real) = exp(-0.5 * theta) * sin(2 * theta) / (1 + theta * theta)
    t0 = 0.8
    u = exp(-0.5 * t0) * sin(2 * t0)
    du = exp(-0.5 * t0) * (-0.5 * sin(2 * t0) + 2.0 * cos(2 * t0))
    v = 1.0 + t0^2
    exact_d = (du * v - u * (2.0 * t0)) / (v^2)
    dual_d = f_nl(DualFigX11(t0, 1.0)).der
    dual_err = max(abs(dual_d - exact_d), 1e-16)
    @assert dual_err < 1e-15

    exps = collect(-15.0:0.5:-1.0)
    fwd_logerr = Float64[]
    cen_logerr = Float64[]
    for e in exps
        h = 10.0^e
        ef = max(abs((f_nl(t0 + h) - f_nl(t0)) / h - exact_d), 1e-16)
        ec = max(abs((f_nl(t0 + h) - f_nl(t0 - h)) / (2h) - exact_d), 1e-16)
        push!(fwd_logerr, log10(ef))
        push!(cen_logerr, log10(ec))
    end

    io = IOBuffer()
    print(io, svg_header(760, 312, "有限差分のV字誤差曲線と多重ディスパッチ自動微分・適材適所ガイド"))

    # 左パネル: 刻み幅 log10(h) vs 微分絶対誤差 log10(|err|)
    bL = PlotBox(68.0, 38.0, 292.0, 214.0, -15.5, -0.5, -16.8, -0.5)
    draw_axes!(io, bL;
        xticks = [-15.0, -12.0, -8.0, -5.0, -1.0],
        xtick_labels = ["10⁻¹⁵", "10⁻¹²", "10⁻⁸", "10⁻⁵", "10⁻¹"],
        yticks = [-16.0, -12.0, -8.0, -4.0, -1.0],
        ytick_labels = ["10⁻¹⁶", "10⁻¹²", "10⁻⁸", "10⁻⁴", "10⁻¹"],
        xlabel = "数値微分の刻み幅 h",
        ylabel = "微分係数の絶対誤差",
        title = "多重ディスパッチ自動微分 vs 有限差分",
        mono_ticks = false,
    )

    pts_fwd = join(["$(f1(px(bL, e))),$(f1(py(bL, le)))" for (e, le) in zip(exps, fwd_logerr)], " ")
    pts_cen = join(["$(f1(px(bL, e))),$(f1(py(bL, le)))" for (e, le) in zip(exps, cen_logerr)], " ")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.2" stroke-dasharray="5 3" points="$pts_fwd"/>""")
    println(io, """  <polyline fill="none" stroke="$C_BLUE" stroke-width="2.2" points="$pts_cen"/>""")

    # Dual自動微分のフラット直線 (log10(dual_err) ≈ -15.95)
    y_dual = py(bL, log10(dual_err))
    println(io, """  <line x1="$(f1(bL.x0))" y1="$(f1(y_dual))" x2="$(f1(bL.x0 + bL.w))" y2="$(f1(y_dual))" stroke="$C_PURPLE" stroke-width="2.8"/>""")

    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_JP">← 桁落ち誤差 O(ε/h)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + bL.w - 8))" y="$(f1(bL.y0 + 18))" text-anchor="end" fill="$C_BLUE" font-size="9.8" font-weight="700" font-family="$FONT_JP">打切り誤差 O(h), O(h²) →</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 10))" y="$(f1(bL.y0 + 35))" fill="$C_RED" font-size="9.6" font-family="$FONT_JP">赤破線：前進差分 / 青実線：中心差分</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(y_dual - 7))" fill="#6D3E86" font-size="10.0" font-weight="700" font-family="$FONT_JP">紫太線：Dual型自動微分 (h不要・機械精度 10⁻¹⁶!)</text>""")

    # 右パネル: 誠実な「適材適所」マトリクス
    rx0, ry0, rw, rh = 394.0, 38.0, 342.0, 214.0
    println(io, """  <text x="$(f1(rx0 + rw / 2))" y="$(f1(ry0 - 10))" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_JP">Juliaの適材適所マップ（誠実な使い分け）</text>""")

    # カード1: 圧倒的メリット
    println(io, """  <rect x="$(f1(rx0))" y="$(f1(ry0))" width="$(f1(rw))" height="84" rx="9" fill="#EAF6E6" stroke="$C_GREEN" stroke-width="1.5"/>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 20))" fill="$C_GREEN" font-size="11" font-weight="700" font-family="$FONT_JP">◎ Julia単体が圧倒的に強い領域</text>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 39))" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">・独自尤度・DDM・状態空間・MCMC・検出力シミュレーション</text>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 56))" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">・参加者×刺激の交差ランダム効果 LMM (MixedModels.jl)</text>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 73))" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">・微分方程式×機械学習 (SciML) と Dual/単位/誤差の自動合成</text>""")

    # カード2: 注意点と対策
    println(io, """  <rect x="$(f1(rx0))" y="$(f1(ry0 + 92))" width="$(f1(rw))" height="54" rx="9" fill="#FFF8EC" stroke="#D99B26" stroke-width="1.4"/>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 111))" fill="#82590F" font-size="10.8" font-weight="700" font-family="$FONT_JP">△ 気をつける点：初回コンパイル待ち（TTFX）</text>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 131))" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">・毎回プロセスを閉じず、常駐REPL + Revise.jl で0.1秒更新にする</text>""")

    # カード3: R / Python との連携が得策
    println(io, """  <rect x="$(f1(rx0))" y="$(f1(ry0 + 154))" width="$(f1(rw))" height="60" rx="9" fill="#F3ECF7" stroke="$C_PURPLE" stroke-width="1.4"/>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 173))" fill="#6D3E86" font-size="10.8" font-weight="700" font-family="$FONT_JP">○ RCall / PythonCall で分業すると賢い領域</text>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 191))" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">・分野固有のCRAN統計パッケージや事前学習済み大規模NN資産</text>""")
    println(io, """  <text x="$(f1(rx0 + 12))" y="$(f1(ry0 + 206))" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">→ 無理に全部書き直さず、重い計算核だけJuliaに任せるのが最速</text>""")

    println(io, "</svg>")
    write_svg("julia-composability-ad-vcurve.svg", String(take!(io)))
end

# ============================================================
# 26. 標本分布 (l21-sampling.js): sampling-clt-se.svg
# ============================================================
function gen_sampling_clt_se()
    d_exp = Exponential(1.0)
    d_n5  = Gamma(5.0, 1.0 / 5.0)   # Exponential(1) の n=5 標本平均の厳密分布
    d_n25 = Gamma(25.0, 1.0 / 25.0) # Exponential(1) の n=25 標本平均の厳密分布
    @assert isapprox(mean(d_n25), 1.0; atol = 1e-12)
    @assert isapprox(std(d_n25), 0.2; atol = 1e-12)

    io = IOBuffer()
    print(io, svg_header(760, 310, "右歪み母集団と標本平均の標本分布（CLT）および標準誤差 SE = σ/√n の縮小"))

    # 左パネル: 生データ(n=1) vs 標本平均の分布(n=5, n=25)
    bL = PlotBox(64.0, 38.0, 296.0, 214.0, 0.0, 3.2, 0.0, 2.25)
    draw_axes!(io, bL;
        xticks = [0.0, 1.0, 2.0, 3.0],
        yticks = [0.0, 0.5, 1.0, 1.5, 2.0],
        xlabel = "値 / 標本平均 x̄",
        ylabel = "確率密度",
        title = "生データの歪み vs 標本平均の分布 (μ=1)",
    )

    xs = range(0.02, 3.2; length = 160)
    pts_raw = join(["$(f1(px(bL, x))),$(f1(py(bL, min(pdf(d_exp, x), 2.22))))" for x in xs], " ")
    pts_5   = join(["$(f1(px(bL, x))),$(f1(py(bL, min(pdf(d_n5, x), 2.22))))" for x in xs], " ")
    pts_25  = join(["$(f1(px(bL, x))),$(f1(py(bL, min(pdf(d_n25, x), 2.22))))" for x in xs], " ")

    poly_25 = "$(f1(px(bL, 0.02))),$(f1(py(bL, 0.0))) $pts_25 $(f1(px(bL, 3.2))),$(f1(py(bL, 0.0)))"
    println(io, """  <polygon points="$poly_25" fill="$C_PURPLE" fill-opacity="0.18"/>""")
    println(io, """  <polyline fill="none" stroke="$C_SUB" stroke-width="1.9" stroke-dasharray="5 3" points="$pts_raw"/>""")
    println(io, """  <polyline fill="none" stroke="$C_BLUE" stroke-width="2.1" points="$pts_5"/>""")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.6" points="$pts_25"/>""")

    x_mu = px(bL, 1.0)
    println(io, """  <line x1="$(f1(x_mu))" y1="$(f1(bL.y0))" x2="$(f1(x_mu))" y2="$(f1(bL.y0 + bL.h))" stroke="$C_INK" stroke-width="1.2" stroke-dasharray="3 3"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 136))" y="$(f1(bL.y0 + 22))" fill="$C_PURPLE_DEEP" font-size="10.2" font-weight="700" font-family="$FONT_JP">紫：n=25 平均 (SE=0.20, 釣鐘型へ)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 136))" y="$(f1(bL.y0 + 40))" fill="$C_BLUE" font-size="10.0" font-weight="700" font-family="$FONT_JP">青：n=5 平均 (SE=0.45)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 136))" y="$(f1(bL.y0 + 58))" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">灰破線：生データ Exponential(1)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 136))" y="$(f1(bL.y0 + 74))" fill="$C_SUB" font-size="9.4" font-family="$FONT_JP">※生データ自体はnを増やしても歪んだまま</text>""")

    # 右パネル: Normal(500, 50) の SE = 50/√n 曲線 vs 同一値複製(非独立)
    bR = PlotBox(434.0, 38.0, 298.0, 214.0, 0.0, 108.0, 0.0, 56.0)
    draw_axes!(io, bR;
        xticks = [4.0, 25.0, 50.0, 100.0],
        yticks = [0.0, 10.0, 25.0, 50.0],
        xlabel = "標本サイズ n",
        ylabel = "標準誤差 SE (ms)",
        title = "独立抽出の SE = 50/√n vs 複製データ",
    )

    # 非独立（同じ1人をn回複製）は SD=50 のまま縮まない
    y_dup = py(bR, 50.0)
    println(io, """  <line x1="$(f1(px(bR, 4.0)))" y1="$(f1(y_dup))" x2="$(f1(px(bR, 100.0)))" y2="$(f1(y_dup))" stroke="$C_RED" stroke-width="2.0" stroke-dasharray="6 4"/>""")
    println(io, """  <text x="$(f1(px(bR, 54.0)))" y="$(f1(y_dup - 6))" text-anchor="middle" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_JP">同一値の複製 (非独立)：SE = 50 のまま縮まない</text>""")

    ns = range(2.5, 104.0; length = 140)
    pts_se = join(["$(f1(px(bR, n))),$(f1(py(bR, 50.0 / sqrt(n))))" for n in ns], " ")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.6" points="$pts_se"/>""")

    for (n_pt, se_pt, dx, dy) in [(4.0, 25.0, 8.0, -5.0), (25.0, 10.0, 8.0, -6.0), (100.0, 5.0, -6.0, -10.0)]
        cx, cy = px(bR, n_pt), py(bR, se_pt)
        anchor = n_pt == 100.0 ? "end" : "start"
        println(io, """  <circle cx="$(f1(cx))" cy="$(f1(cy))" r="4.3" fill="$C_GREEN" stroke="#FFFFFF" stroke-width="1.2"/>""")
        println(io, """  <text x="$(f1(cx + dx))" y="$(f1(cy + dy))" text-anchor="$anchor" fill="$C_GREEN" font-size="10.2" font-weight="700" font-family="$FONT_MONO">n=$(Int(n_pt)): SE=$(f1(se_pt))</text>""")
    end
    println(io, """  <text x="$(f1(bR.x0 + 150))" y="$(f1(bR.y0 + 104))" text-anchor="middle" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">SEを半分にするには 4倍の独立標本が必要</text>""")

    println(io, "</svg>")
    write_svg("sampling-clt-se.svg", String(take!(io)))
end

# ============================================================
# 27. 仮説検定入門 (l23-testing.js): hypothesis-testing-errors.svg
# ============================================================
function gen_hypothesis_testing_errors()
    se_diff = 50.0 * sqrt(2.0 / 20.0) # ≈ 15.811 ms
    df_t = 38
    t_crit = quantile(TDist(df_t), 0.975) # ≈ 2.024
    crit_ms = t_crit * se_diff # ≈ 32.01 ms
    @assert 31.5 < crit_ms < 32.5

    io = IOBuffer()
    print(io, svg_header(760, 310, "帰無分布の5%棄却域（第I種過誤 α）と対立仮説のもとでの検出力 1−β"))

    # 左パネル: 差がない世界 H0 の平均差分布 (Normal(0, 15.81)) と両側5%棄却域 + 83ms
    d0_ms = Normal(0.0, se_diff)
    bL = PlotBox(64.0, 38.0, 298.0, 214.0, -90.0, 95.0, 0.0, 0.029)
    draw_axes!(io, bL;
        xticks = [-60.0, -32.0, 0.0, 32.0, 60.0, 83.0],
        yticks = [0.0, 0.01, 0.02],
        ytick_labels = ["0.00", "0.01", "0.02"],
        xlabel = "2群の平均差 x̄A − x̄B (ms)",
        ylabel = "密度",
        title = "差がない世界 (H₀) の偶然の差と5%境界",
    )

    xs_l = range(-90.0, -crit_ms; length = 50)
    poly_l = "$(f1(px(bL, -90.0))),$(f1(py(bL, 0.0))) " *
             join(["$(f1(px(bL, x))),$(f1(py(bL, pdf(d0_ms, x))))" for x in xs_l], " ") *
             " $(f1(px(bL, -crit_ms))),$(f1(py(bL, 0.0)))"
    xs_r = range(crit_ms, 95.0; length = 50)
    poly_r = "$(f1(px(bL, crit_ms))),$(f1(py(bL, 0.0))) " *
             join(["$(f1(px(bL, x))),$(f1(py(bL, pdf(d0_ms, x))))" for x in xs_r], " ") *
             " $(f1(px(bL, 95.0))),$(f1(py(bL, 0.0)))"
    println(io, """  <polygon points="$poly_l" fill="$C_RED" fill-opacity="0.30"/>""")
    println(io, """  <polygon points="$poly_r" fill="$C_RED" fill-opacity="0.30"/>""")

    xs_all = range(-90.0, 95.0; length = 160)
    pts_h0 = join(["$(f1(px(bL, x))),$(f1(py(bL, pdf(d0_ms, x))))" for x in xs_all], " ")
    println(io, """  <polyline fill="none" stroke="$C_INK" stroke-width="2.2" points="$pts_h0"/>""")

    for sgn in (-1.0, 1.0)
        xc = px(bL, sgn * crit_ms)
        println(io, """  <line x1="$(f1(xc))" y1="$(f1(bL.y0 + 28))" x2="$(f1(xc))" y2="$(f1(py(bL, 0.0)))" stroke="$C_RED" stroke-width="1.6" stroke-dasharray="4 3"/>""")
    end
    x83 = px(bL, 83.0)
    println(io, """  <line x1="$(f1(x83))" y1="$(f1(bL.y0 + 18))" x2="$(f1(x83))" y2="$(f1(py(bL, 0.0)))" stroke="$C_PURPLE_DEEP" stroke-width="2.2"/>""")
    println(io, """  <circle cx="$(f1(x83))" cy="$(f1(py(bL, 0.0) - 3))" r="4" fill="$C_PURPLE_DEEP"/>""")
    println(io, """  <text x="$(f1(x83 - 4))" y="$(f1(bL.y0 + 16))" text-anchor="end" fill="$C_PURPLE_DEEP" font-size="9.8" font-weight="700" font-family="$FONT_JP">観測差 83ms</text>""")
    println(io, """  <text x="$(f1(px(bL, 0.0)))" y="$(f1(bL.y0 + 20))" text-anchor="middle" fill="$C_RED" font-size="10.0" font-weight="700" font-family="$FONT_JP">両端赤 = 有意水準 α = 5% (±32ms超)</text>""")
    println(io, """  <text x="$(f1(px(bL, 0.0)))" y="$(f1(bL.y0 + 36))" text-anchor="middle" fill="$C_SUB" font-size="9.4" font-family="$FONT_JP">差が0でも1000回中 約50回は赤領域へ入る</text>""")

    # 右パネル: H0 (t中心0) vs H1 (真の差45ms → δ ≈ 2.85) の α・β・検出力(1-β)
    delta = 45.0 / se_diff
    d_t0 = Normal(0.0, 1.0)
    d_t1 = Normal(delta, 1.0)
    z_c = 1.96
    power_val = ccdf(d_t1, z_c)
    @assert 0.80 < power_val < 0.83

    bR = PlotBox(434.0, 38.0, 298.0, 214.0, -3.2, 6.2, 0.0, 0.46)
    draw_axes!(io, bR;
        xticks = [-2.0, 0.0, 1.96, 2.85, 5.0],
        xtick_labels = ["-2", "0", "1.96", "δ=2.85", "5"],
        yticks = [0.0, 0.2, 0.4],
        ytick_labels = ["0.0", "0.2", "0.4"],
        xlabel = "標準化検定統計量 t",
        ylabel = "密度",
        title = "真の差がある世界 (H₁) の見逃し β と検出力",
    )

    # β (見逃し: H1 で t < 1.96) と 1-β (検出力: H1 で t >= 1.96)
    xs_beta = range(-3.2, z_c; length = 80)
    poly_beta = "$(f1(px(bR, -3.2))),$(f1(py(bR, 0.0))) " *
                join(["$(f1(px(bR, x))),$(f1(py(bR, pdf(d_t1, x))))" for x in xs_beta], " ") *
                " $(f1(px(bR, z_c))),$(f1(py(bR, 0.0)))"
    xs_pow = range(z_c, 6.2; length = 90)
    poly_pow = "$(f1(px(bR, z_c))),$(f1(py(bR, 0.0))) " *
               join(["$(f1(px(bR, x))),$(f1(py(bR, pdf(d_t1, x))))" for x in xs_pow], " ") *
               " $(f1(px(bR, 6.2))),$(f1(py(bR, 0.0)))"
    println(io, """  <polygon points="$poly_beta" fill="#D99B26" fill-opacity="0.28"/>""")
    println(io, """  <polygon points="$poly_pow" fill="$C_GREEN" fill-opacity="0.25"/>""")

    xs_t = range(-3.2, 6.2; length = 170)
    pts_t0 = join(["$(f1(px(bR, x))),$(f1(py(bR, pdf(d_t0, x))))" for x in xs_t], " ")
    pts_t1 = join(["$(f1(px(bR, x))),$(f1(py(bR, pdf(d_t1, x))))" for x in xs_t], " ")
    println(io, """  <polyline fill="none" stroke="$C_SUB" stroke-width="1.9" stroke-dasharray="5 3" points="$pts_t0"/>""")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.4" points="$pts_t1"/>""")
    println(io, """  <line x1="$(f1(px(bR, z_c)))" y1="$(f1(bR.y0))" x2="$(f1(px(bR, z_c)))" y2="$(f1(py(bR, 0.0)))" stroke="$C_RED" stroke-width="1.8" stroke-dasharray="4 3"/>""")

    println(io, """  <text x="$(f1(px(bR, -0.7)))" y="$(f1(py(bR, 0.36)))" text-anchor="middle" fill="$C_SUB" font-size="10.0" font-weight="700" font-family="$FONT_JP">H₀ (差なし)</text>""")
    println(io, """  <text x="$(f1(px(bR, 4.15)))" y="$(f1(py(bR, 0.36)))" text-anchor="middle" fill="$C_GREEN" font-size="10.2" font-weight="700" font-family="$FONT_JP">検出力 1−β ≈ 81%</text>""")
    println(io, """  <text x="$(f1(px(bR, 1.05)))" y="$(f1(py(bR, 0.08)))" text-anchor="middle" fill="#8A5D0B" font-size="9.8" font-weight="700" font-family="$FONT_JP">見逃し β ≈ 19%</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_INK" font-size="9.4" font-family="$FONT_JP">※p値は効果の大きさではなくH₀下での珍しさ</text>""")

    println(io, "</svg>")
    write_svg("hypothesis-testing-errors.svg", String(take!(io)))
end

# ============================================================
# 28. 重回帰・ANCOVA・モデル比較 (l25-confounding.js): confounding-simpson-interaction.svg
# ============================================================
function gen_confounding_simpson_interaction()
    rng = Xoshiro(2900)
    n = 240
    z = randn(rng, n)
    x = 0.7 .* z .+ randn(rng, n) .* 0.7
    y = 0.5 .* z .+ randn(rng, n) .* 0.7
    df_c = DataFrame(x = x, y = y, z = z)
    b_unadj = coef(lm(@formula(y ~ x), df_c))
    b_adj   = coef(lm(@formula(y ~ x + z), df_c))
    @assert round(b_unadj[2]; digits = 3) == 0.368
    @assert round(b_adj[2]; digits = 3) == 0.017

    io = IOBuffer()
    print(io, svg_header(760, 312, "交絡調整で見かけの傾きが消える仕組みとANCOVA平行線・交互作用の比較"))

    # 左パネル: 交絡 z を無視した見かけの右上がり (0.368) vs z 層別の水平線 (0.017)
    bL = PlotBox(62.0, 38.0, 298.0, 214.0, -2.6, 2.6, -2.5, 2.5)
    draw_axes!(io, bL;
        xticks = [-2.0, -1.0, 0.0, 1.0, 2.0],
        yticks = [-2.0, -1.0, 0.0, 1.0, 2.0],
        xlabel = "説明変数 x",
        ylabel = "結果 y",
        title = "交絡 z の調整前後 (真の x 効果 = 0)",
    )

    for i in 1:n
        col = z[i] < -0.5 ? C_BLUE : (z[i] > 0.5 ? C_PURPLE : "#9AA0A6")
        println(io, """  <circle cx="$(f1(px(bL, x[i])))" cy="$(f1(py(bL, y[i])))" r="2.5" fill="$col" fill-opacity="0.52"/>""")
    end
    # 未調整回帰直線
    println(io, """  <line x1="$(f1(px(bL, -2.4)))" y1="$(f1(py(bL, b_unadj[1] + b_unadj[2] * -2.4)))" x2="$(f1(px(bL, 2.4)))" y2="$(f1(py(bL, b_unadj[1] + b_unadj[2] * 2.4)))" stroke="$C_RED" stroke-width="2.4" stroke-dasharray="6 4"/>""")
    # z = -1, 0, +1 での調整済み直線 (ほぼ水平!)
    for (zv, col) in [(-1.1, C_BLUE), (0.0, C_INK), (1.1, C_PURPLE_DEEP)]
        x1v, x2v = zv * 0.7 - 1.2, zv * 0.7 + 1.2
        y1v = b_adj[1] + b_adj[2] * x1v + b_adj[3] * zv
        y2v = b_adj[1] + b_adj[2] * x2v + b_adj[3] * zv
        println(io, """  <line x1="$(f1(px(bL, x1v)))" y1="$(f1(py(bL, y1v)))" x2="$(f1(px(bL, x2v)))" y2="$(f1(py(bL, y2v)))" stroke="$col" stroke-width="2.5"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_JP">赤破線 y ~ x：見かけの傾き 0.368</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 35))" fill="$C_INK" font-size="9.8" font-weight="700" font-family="$FONT_JP">実線 y ~ x + z：同じ z 内では傾き 0.017</text>""")

    # 右パネル: ANCOVA 平行モデル (posttest ~ pre_c + group) vs 交互作用 (pre_c * group)
    bR = PlotBox(434.0, 38.0, 298.0, 214.0, -15.0, 15.0, 38.0, 82.0)
    draw_axes!(io, bR;
        xticks = [-12.0, -6.0, 0.0, 6.0, 12.0],
        yticks = [40.0, 50.0, 60.0, 70.0, 80.0],
        xlabel = "中心化した事前得点 pre_c",
        ylabel = "予測 posttest",
        title = "ANCOVAの調整済み群差 vs 交互作用",
    )

    x0_c = px(bR, 0.0)
    println(io, """  <line x1="$(f1(x0_c))" y1="$(f1(bR.y0))" x2="$(f1(x0_c))" y2="$(f1(bR.y0 + bR.h))" stroke="$C_AXIS" stroke-width="1.2" stroke-dasharray="3 3"/>""")
    # Page 4 exact fitted values: Intercept=52.70, pre_c=0.53, training=+9.46, combined=+14.09
    for (ic, sl, col, dash, lbl) in [
        (52.70, 0.53, C_SUB, "", "control (基準)"),
        (62.16, 0.53, C_BLUE, "", "training (+9.46)"),
        (66.79, 0.53, C_GREEN, "", "combined (+14.09)"),
        (62.16, 1.05, C_PURPLE_DEEP, "5 3", "交互作用あり (傾き変化)"),
    ]
        d_attr = isempty(dash) ? "" : """ stroke-dasharray="$dash\""""
        println(io, """  <line x1="$(f1(px(bR, -14.0)))" y1="$(f1(py(bR, ic + sl * -14.0)))" x2="$(f1(px(bR, 14.0)))" y2="$(f1(py(bR, ic + sl * 14.0)))" stroke="$col" stroke-width="2.3"$d_attr/>""")
    end
    # pre_c = 0 での群差矢印
    println(io, """  <line x1="$(f1(x0_c))" y1="$(f1(py(bR, 52.70)))" x2="$(f1(x0_c))" y2="$(f1(py(bR, 62.16)))" stroke="$C_RED" stroke-width="2.6"/>""")
    println(io, """  <text x="$(f1(x0_c + 6))" y="$(f1(py(bR, 57.4)))" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_JP">pre_c=0 での差 +9.46</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_GREEN" font-size="9.6" font-weight="700" font-family="$FONT_JP">実線3本：平行モデル (どこでも同じ群差)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 34))" fill="$C_PURPLE_DEEP" font-size="9.6" font-weight="700" font-family="$FONT_JP">紫破線：交互作用 (主効果は pre_c=0 限定)</text>""")

    println(io, "</svg>")
    write_svg("confounding-simpson-interaction.svg", String(take!(io)))
end

# ============================================================
# 29. ロジスティック回帰 (l26-logistic.js): logistic-vs-lpm-scurve.svg
# ============================================================
function gen_logistic_vs_lpm_scurve()
    logistic_fn(x) = 1.0 / (1.0 + exp(-x))
    rng = Xoshiro(3101)
    n = 800
    study = randn(rng, n)
    true_p = logistic_fn.(-0.4 .+ 1.1 .* study)
    correct = Float64.(rand(rng, n) .< true_p)
    df = DataFrame(study = study, correct = correct)
    m_logit = glm(@formula(correct ~ study), df, Binomial(), LogitLink())
    m_lpm   = lm(@formula(correct ~ study), df)
    b0, b1 = coef(m_logit)
    @assert round.(coef(m_logit); digits = 3) == [-0.421, 1.102]

    grid_s = collect(-2.0:1.0:2.0)
    dp_vec = [logistic_fn(b0 + b1 * (s + 1.0)) - logistic_fn(b0 + b1 * s) for s in grid_s]
    @assert round.(dp_vec; digits = 3) == [0.111, 0.217, 0.268, 0.192, 0.091]

    io = IOBuffer()
    print(io, svg_header(760, 312, "ロジスティック回帰のS字曲線 vs 線形確率モデルのはみ出しと出発点に依存する確率差"))

    # 左パネル: S字曲線 (0〜1内) vs 線形確率モデルのはみ出し
    bL = PlotBox(64.0, 38.0, 298.0, 214.0, -3.2, 3.2, -0.18, 1.18)
    draw_axes!(io, bL;
        xticks = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0],
        yticks = [0.0, 0.25, 0.5, 0.75, 1.0],
        ytick_labels = ["0.00", "0.25", "0.50", "0.75", "1.00"],
        xlabel = "学習量 study (標準化)",
        ylabel = "予測確率 P(correct = 1)",
        title = "ロジットS字曲線 vs 線形確率モデル",
    )

    # 0 と 1 の確率境界
    for y_bound in (0.0, 1.0)
        yb = py(bL, y_bound)
        println(io, """  <line x1="$(f1(bL.x0))" y1="$(f1(yb))" x2="$(f1(bL.x0 + bL.w))" y2="$(f1(yb))" stroke="$C_AXIS" stroke-width="1.2" stroke-dasharray="3 3"/>""")
    end
    xs = range(-3.1, 3.1; length = 140)
    nd = DataFrame(study = collect(xs))
    pr = predict(m_logit, nd; interval = :confidence)
    poly_ci = join(["$(f1(px(bL, xs[i]))),$(f1(py(bL, pr.lower[i])))" for i in eachindex(xs)], " ") * " " *
              join(["$(f1(px(bL, xs[i]))),$(f1(py(bL, pr.upper[i])))" for i in reverse(eachindex(xs))], " ")
    println(io, """  <polygon points="$poly_ci" fill="$C_PURPLE" fill-opacity="0.20"/>""")

    l0, l1 = coef(m_lpm)
    pts_lpm = join(["$(f1(px(bL, x))),$(f1(py(bL, clamp(l0 + l1 * x, -0.16, 1.16))))" for x in xs], " ")
    pts_sig = join(["$(f1(px(bL, xs[i]))),$(f1(py(bL, pr.prediction[i])))" for i in eachindex(xs)], " ")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.0" stroke-dasharray="6 4" points="$pts_lpm"/>""")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.6" points="$pts_sig"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_PURPLE_DEEP" font-size="9.8" font-weight="700" font-family="$FONT_JP">紫：ロジット (常に 0〜1 に収まるS字)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 34))" fill="$C_RED" font-size="9.6" font-weight="700" font-family="$FONT_JP">赤破線：線形近似 (両端で0未満・1超へ逸脱)</text>""")

    # 右パネル: オッズ比は一定 (3.009) でも 1単位増加の確率差 Δp は中央で最大・端で縮小
    bR = PlotBox(436.0, 38.0, 296.0, 214.0, -2.6, 2.6, 0.0, 0.33)
    draw_axes!(io, bR;
        xticks = [-2.0, -1.0, 0.0, 1.0, 2.0],
        yticks = [0.0, 0.10, 0.20, 0.30],
        ytick_labels = ["0.00", "0.10", "0.20", "0.30"],
        xlabel = "出発点の study (そこから +1 増やす)",
        ylabel = "確率差 p(s+1) − p(s)",
        title = "OR = 3.01 一定でも確率差 Δp は場所で変わる",
    )

    bar_w = 34.0
    for (s, dp) in zip(grid_s, dp_vec)
        cx = px(bR, s)
        yt = py(bR, dp)
        yb = py(bR, 0.0)
        println(io, """  <rect x="$(f1(cx - bar_w / 2))" y="$(f1(yt))" width="$(f1(bar_w))" height="$(f1(yb - yt))" rx="3" fill="#E8F1FA" stroke="$C_BLUE" stroke-width="1.8"/>""")
        println(io, """  <text x="$(f1(cx))" y="$(f1(yt - 6))" text-anchor="middle" fill="$C_INK" font-size="10.2" font-weight="700" font-family="$FONT_MONO">+$(fmt(dp; digits = 3))</text>""")
    end
    y_ame = py(bR, 0.219)
    println(io, """  <line x1="$(f1(bR.x0))" y1="$(f1(y_ame))" x2="$(f1(bR.x0 + bR.w))" y2="$(f1(y_ame))" stroke="$C_GREEN" stroke-width="2.0" stroke-dasharray="5 3"/>""")
    println(io, """  <text x="$(f1(bR.x0 + bR.w - 6))" y="$(f1(y_ame - 6))" text-anchor="end" fill="$C_GREEN" font-size="9.8" font-weight="700" font-family="$FONT_JP">平均限界効果 AME = 0.219</text>""")

    println(io, "</svg>")
    write_svg("logistic-vs-lpm-scurve.svg", String(take!(io)))
end

# ============================================================
# 30. 混合効果モデル (l27-glmm.js): lmm-random-slopes-shrinkage.svg
# ============================================================
function gen_lmm_random_slopes_shrinkage()
    rng = Xoshiro(3401)
    n_subj = 18
    u0 = randn(rng, n_subj) .* 65.0
    u1 = randn(rng, n_subj) .* 38.0
    # 各参加者の試行数 (不均衡: 4試行の少数データ参加者〜24試行の多数データ参加者)
    n_trials = vcat(fill(4, 6), fill(12, 6), fill(24, 6))
    sigma_e = 55.0
    true_cond = 47.2
    raw_diff = Float64[]
    shrunk_diff = Float64[]
    for s in 1:n_subj
        k = n_trials[s]
        noise = randn(rng) * sqrt(4.0 * sigma_e^2 / k) # 2条件差の標本誤差
        obs_d = true_cond + u1[s] + noise
        # 正規-正規の部分プーリング重み: w = τ₁² / (τ₁² + SE_s²)
        se2 = 4.0 * sigma_e^2 / k
        w = 38.0^2 / (38.0^2 + se2)
        push!(raw_diff, obs_d)
        push!(shrunk_diff, true_cond + w * (obs_d - true_cond))
    end
    @assert std(shrunk_diff) < std(raw_diff)

    io = IOBuffer()
    print(io, svg_header(760, 312, "ランダム傾きによる個人別条件効果の表現と部分プーリング（縮小推定）"))

    # 左パネル: ランダム切片のみ(平行) vs ランダム切片＋ランダム傾き(交差・扇状)
    bL = PlotBox(64.0, 38.0, 296.0, 214.0, -0.65, 0.65, 360.0, 660.0)
    draw_axes!(io, bL;
        xticks = [-0.5, 0.5],
        xtick_labels = ["cond = −0.5", "cond = +0.5"],
        yticks = [400.0, 500.0, 600.0],
        xlabel = "参加者内条件 condition_centered",
        ylabel = "反応時間 RT (ms)",
        title = "個人別ランダム傾き (1 + cond | subj)",
    )

    for s in 1:12
        y_lo = 500.0 + u0[s] + (true_cond + u1[s]) * (-0.5)
        y_hi = 500.0 + u0[s] + (true_cond + u1[s]) * (+0.5)
        col = u1[s] > 10.0 ? C_PURPLE : (u1[s] < -10.0 ? C_BLUE : "#9AA0A6")
        println(io, """  <line x1="$(f1(px(bL, -0.5)))" y1="$(f1(py(bL, y_lo)))" x2="$(f1(px(bL, 0.5)))" y2="$(f1(py(bL, y_hi)))" stroke="$col" stroke-width="1.5" stroke-opacity="0.72"/>""")
    end
    # 母集団固定効果の太線
    println(io, """  <line x1="$(f1(px(bL, -0.5)))" y1="$(f1(py(bL, 500.0 - 0.5 * true_cond)))" x2="$(f1(px(bL, 0.5)))" y2="$(f1(py(bL, 500.0 + 0.5 * true_cond)))" stroke="$C_INK" stroke-width="3.2"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_INK" font-size="9.8" font-weight="700" font-family="$FONT_JP">黒太線：母集団平均傾き (+47.2 ms)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 35))" fill="$C_PURPLE_DEEP" font-size="9.5" font-family="$FONT_JP">細線：個人ごとに切片も条件効果も異なる</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 51))" fill="$C_RED" font-size="9.4" font-family="$FONT_JP">傾き差を無視すると固定効果SEが過小 (3.93→6.89)</text>""")

    # 右パネル: 生の個人別条件差 (no pooling) → 部分プーリング (ranef BLUP) への縮小
    bR = PlotBox(436.0, 38.0, 296.0, 214.0, -70.0, 165.0, 0.0, 19.5)
    draw_axes!(io, bR;
        xticks = [-50.0, 0.0, 47.2, 100.0, 150.0],
        xtick_labels = ["-50", "0", "47.2", "100", "150"],
        yticks = [3.0, 9.5, 15.5],
        ytick_labels = ["4試行", "12試行", "24試行"],
        xlabel = "個人ごとの条件差推定値 (ms)",
        ylabel = "参加者 (試行数別)",
        title = "部分プーリング：不確かな水準ほど母平均へ縮む",
        mono_ticks = false,
    )

    x_pop = px(bR, true_cond)
    println(io, """  <line x1="$(f1(x_pop))" y1="$(f1(bR.y0))" x2="$(f1(x_pop))" y2="$(f1(bR.y0 + bR.h))" stroke="$C_GREEN" stroke-width="1.8" stroke-dasharray="4 3"/>""")
    for s in 1:n_subj
        yy = py(bR, Float64(s))
        x_raw = px(bR, clamp(raw_diff[s], -66.0, 161.0))
        x_shr = px(bR, clamp(shrunk_diff[s], -66.0, 161.0))
        col = n_trials[s] == 4 ? C_RED : (n_trials[s] == 12 ? C_BLUE : C_PURPLE_DEEP)
        println(io, """  <line x1="$(f1(x_raw))" y1="$(f1(yy))" x2="$(f1(x_shr))" y2="$(f1(yy))" stroke="$col" stroke-width="1.4"/>""")
        println(io, """  <circle cx="$(f1(x_raw))" cy="$(f1(yy))" r="2.8" fill="#FFFFFF" stroke="$col" stroke-width="1.5"/>""")
        println(io, """  <circle cx="$(f1(x_shr))" cy="$(f1(yy))" r="3.1" fill="$col"/>""")
    end
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 17))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">白丸(生平均) → 塗丸(混合モデル推定値)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 32))" fill="$C_SUB" font-size="9.3" font-family="$FONT_JP">4試行(下段・赤)ほど母平均 47.2ms へ強く縮小</text>""")

    println(io, "</svg>")
    write_svg("lmm-random-slopes-shrinkage.svg", String(take!(io)))
end

# ============================================================
# 31. 測定誤差と希薄化 (l28-dilution.js): measurement-error-attenuation.svg
# ============================================================
function gen_measurement_error_attenuation()
    rng = Xoshiro(3503)
    n_vis = 220
    rel = 0.6
    x_t = randn(rng, n_vis)
    y_t = 2.0 .+ 1.5 .* x_t .+ randn(rng, n_vis)
    x_w = x_t .+ sqrt(1.0 / rel - 1.0) .* randn(rng, n_vis)

    io = IOBuffer()
    print(io, svg_header(760, 312, "古典的説明変数誤差による回帰希薄化（傾き 1.5 → 0.9）と結果誤差・Berkson誤差の非対称性"))

    # 左パネル: 真の X* vs 誤差つき観測 W = X* + U で横方向に広がり傾きが寝る
    bL = PlotBox(64.0, 38.0, 296.0, 214.0, -3.4, 3.4, -3.5, 7.5)
    draw_axes!(io, bL;
        xticks = [-3.0, -1.5, 0.0, 1.5, 3.0],
        yticks = [-2.0, 0.0, 2.0, 4.0, 6.0],
        xlabel = "真の X* (紫) / 誤差つき観測 W (赤)",
        ylabel = "結果 Y*",
        title = "説明変数の古典的誤差 (信頼性 λ = 0.6)",
    )

    for i in 1:2:n_vis
        println(io, """  <circle cx="$(f1(px(bL, clamp(x_w[i], -3.3, 3.3))))" cy="$(f1(py(bL, clamp(y_t[i], -3.3, 7.3))))" r="2.3" fill="$C_RED" fill-opacity="0.35"/>""")
        println(io, """  <circle cx="$(f1(px(bL, clamp(x_t[i], -3.3, 3.3))))" cy="$(f1(py(bL, clamp(y_t[i], -3.3, 7.3))))" r="2.3" fill="$C_PURPLE" fill-opacity="0.45"/>""")
    end
    println(io, """  <line x1="$(f1(px(bL, -3.0)))" y1="$(f1(py(bL, 2.0 + 1.5 * -3.0)))" x2="$(f1(px(bL, 3.0)))" y2="$(f1(py(bL, 2.0 + 1.5 * 3.0)))" stroke="$C_PURPLE_DEEP" stroke-width="2.8"/>""")
    println(io, """  <line x1="$(f1(px(bL, -3.2)))" y1="$(f1(py(bL, 2.0 + 0.9 * -3.2)))" x2="$(f1(px(bL, 3.2)))" y2="$(f1(py(bL, 2.0 + 0.9 * 3.2)))" stroke="$C_RED" stroke-width="2.8" stroke-dasharray="6 4"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_PURPLE_DEEP" font-size="9.8" font-weight="700" font-family="$FONT_JP">紫実線 Y* ~ X*：真の傾き β = 1.50</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 35))" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_JP">赤破線 Y* ~ W：観測傾き λβ = 0.90 へ希薄化</text>""")

    # 右パネル: 誤差が入る場所・矢印の向きによる単回帰傾きの比較 (Page 7, 10, 11 の実測値)
    bR = PlotBox(448.0, 38.0, 284.0, 214.0, 0.0, 2.05, 0.4, 5.6)
    draw_axes!(io, bR;
        xticks = [0.0, 0.5, 0.9, 1.5, 2.0],
        yticks = [1.0, 2.0, 3.0, 4.0, 5.0],
        ytick_labels = ["結果依存誤差", "Berkson誤差", "Yの独立誤差", "Xの古典誤差", "真のモデル"],
        xlabel = "単回帰の期待傾き (真値 = 1.50 ※最下段のみ真値 0)",
        ylabel = "",
        title = "誤差構造ごとのバイアス方向の比較",
        mono_ticks = false,
    )

    x_true_ref = px(bR, 1.5)
    println(io, """  <line x1="$(f1(x_true_ref))" y1="$(f1(bR.y0))" x2="$(f1(x_true_ref))" y2="$(f1(py(bR, 1.55)))" stroke="$C_GREEN" stroke-width="1.6" stroke-dasharray="4 3"/>""")

    cases = [
        (5.0, 1.506, C_GREEN, "1.51 (基準)"),
        (4.0, 0.896, C_RED, "0.90 (0方向へ縮小)"),
        (3.0, 1.506, C_BLUE, "1.51 (傾き維持・SE増)"),
        (2.0, 1.505, C_PURPLE_DEEP, "1.51 (W割当→X*散らばり)"),
        (1.0, 0.423, "#B86B11", "0.42 (真値0でも偽関連!)"),
    ]
    for (yv, val, col, note) in cases
        yy = py(bR, yv)
        x0 = px(bR, 0.0)
        xv = px(bR, val)
        println(io, """  <line x1="$(f1(x0))" y1="$(f1(yy))" x2="$(f1(xv))" y2="$(f1(yy))" stroke="$col" stroke-width="5.5" stroke-linecap="round"/>""")
        println(io, """  <text x="$(f1(xv + 6))" y="$(f1(yy + 4))" fill="$col" font-size="9.4" font-weight="700" font-family="$FONT_JP">$note</text>""")
    end

    println(io, "</svg>")
    write_svg("measurement-error-attenuation.svg", String(take!(io)))
end

# ============================================================
# 32. 検定力とデザイン (l29-power.js): power-curve-design-tradeoff.svg
# ============================================================
function gen_power_curve_design_tradeoff()
    # 交差ランダム傾き LMM の理論標準誤差 (L37 simulate_response と完全一致):
    # σ²_tot = residual_sd² / reliability = 50² / 0.8 = 3125
    # Var(β̂_cond) = σ²_subj_slope / N_subj + σ²_item_slope / N_item + 2 * σ²_tot / (N_subj * N_item * K_rep)
    se_crossed(ns, ni, krep; s_subj = 25.0, s_item = 15.0, s_tot2 = 50.0^2 / 0.8) =
        sqrt(s_subj^2 / ns + s_item^2 / ni + 2.0 * s_tot2 / (ns * ni * krep))
    approx_power(effect, se) = ccdf(Normal(), 1.96 - effect / se) + cdf(Normal(), -1.96 - effect / se)

    p_base = approx_power(20.0, se_crossed(24, 12, 1))
    p_subj = approx_power(20.0, se_crossed(48, 12, 1))
    p_item = approx_power(20.0, se_crossed(24, 24, 1))
    @assert 0.68 < p_base < 0.72
    @assert p_subj > p_item > p_base

    io = IOBuffer()
    print(io, svg_header(760, 312, "交差ランダム傾き下での参加者数・項目数・試行反復の検出力曲線とシナリオ感度"))

    # 左パネル: 総行数を増やす3つの軸（参加者増 vs 項目増 vs 同一項目の反復増）
    bL = PlotBox(64.0, 38.0, 296.0, 214.0, 250.0, 2350.0, 0.35, 1.02)
    draw_axes!(io, bL;
        xticks = [576.0, 1152.0, 1728.0, 2304.0],
        yticks = [0.4, 0.6, 0.8, 1.0],
        ytick_labels = ["0.40", "0.60", "0.80", "1.00"],
        xlabel = "総観測行数 (N_subj × N_item × 2条件 × 反復)",
        ylabel = "検出力 (1 − β)",
        title = "同じ総行数でも増やす軸で検出力は違う",
    )

    y80 = py(bL, 0.80)
    println(io, """  <line x1="$(f1(bL.x0))" y1="$(f1(y80))" x2="$(f1(bL.x0 + bL.w))" y2="$(f1(y80))" stroke="$C_AXIS" stroke-width="1.3" stroke-dasharray="4 3"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 6))" y="$(f1(y80 - 5))" fill="$C_SUB" font-size="9.5" font-weight="700" font-family="$FONT_MONO">目標 0.80</text>""")

    mults = range(0.5, 4.0; length = 60)
    pts_s = join(["$(f1(px(bL, 576.0 * m))),$(f1(py(bL, approx_power(20.0, se_crossed(24.0 * m, 12.0, 1.0)))))" for m in mults], " ")
    pts_i = join(["$(f1(px(bL, 576.0 * m))),$(f1(py(bL, approx_power(20.0, se_crossed(24.0, 12.0 * m, 1.0)))))" for m in mults], " ")
    pts_k = join(["$(f1(px(bL, 576.0 * m))),$(f1(py(bL, approx_power(20.0, se_crossed(24.0, 12.0, m)))))" for m in mults if m >= 1.0], " ")

    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.6" points="$pts_s"/>""")
    println(io, """  <polyline fill="none" stroke="$C_BLUE" stroke-width="2.3" points="$pts_i"/>""")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.2" stroke-dasharray="5 3" points="$pts_k"/>""")

    # 実測アンカー点 (576行=0.71, 1152行: 48人×12項目=0.87, 24人×24項目=0.82)
    for (rx, pyv, col) in [(576.0, 0.71, C_INK), (1152.0, 0.87, C_GREEN), (1152.0, 0.82, C_BLUE)]
        println(io, """  <circle cx="$(f1(px(bL, rx)))" cy="$(f1(py(bL, pyv)))" r="4.0" fill="$col" stroke="#FFFFFF" stroke-width="1.2"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 96))" y="$(f1(bL.y0 + 19))" fill="$C_GREEN" font-size="9.6" font-weight="700" font-family="$FONT_JP">緑：参加者を増やす (48×12 → 0.87)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 96))" y="$(f1(bL.y0 + 35))" fill="$C_BLUE" font-size="9.6" font-weight="700" font-family="$FONT_JP">青：項目を増やす (24×24 → 0.82)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 96))" y="$(f1(bL.y0 + 186))" fill="$C_RED" font-size="9.4" font-weight="700" font-family="$FONT_JP">赤破線：同一項目の試行数だけ増やしても</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 96))" y="$(f1(bL.y0 + 200))" fill="$C_RED" font-size="9.4" font-family="$FONT_JP">ランダム傾き分散が残り頭打ちになる</text>""")

    # 右パネル: L37 Pages 7–14 の実測シミュレーション結果と MCSE 区間 (nsim = 200)
    bR = PlotBox(456.0, 38.0, 276.0, 214.0, 0.0, 1.0, 0.4, 7.6)
    draw_axes!(io, bR;
        xticks = [0.2, 0.5, 0.8, 1.0],
        ytick_labels = ["小効果 10ms", "傾きSD増大", "20%欠測", "低信頼性0.5", "基準 24×12", "項目倍 24×24", "参加者倍 48×12"],
        yticks = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0],
        xlabel = "推定検出力 ± 1.96 MCSE (nsim=200)",
        ylabel = "",
        title = "仮定を動かした感度分析 (L37実測)",
        mono_ticks = false,
    )
    println(io, """  <line x1="$(f1(px(bR, 0.8)))" y1="$(f1(bR.y0))" x2="$(f1(px(bR, 0.8)))" y2="$(f1(bR.y0 + bR.h))" stroke="$C_AXIS" stroke-width="1.2" stroke-dasharray="4 3"/>""")

    scenarios = [
        (7.0, 0.870, C_GREEN),
        (6.0, 0.820, C_BLUE),
        (5.0, 0.710, C_INK),
        (4.0, 0.660, C_PURPLE_DEEP),
        (3.0, 0.635, "#8A5D0B"),
        (2.0, 0.345, C_RED),
        (1.0, 0.270, C_RED),
    ]
    for (yv, pw, col) in scenarios
        mcse = sqrt(pw * (1.0 - pw) / 200.0)
        lo, hi = max(0.0, pw - 1.96 * mcse), min(1.0, pw + 1.96 * mcse)
        yy = py(bR, yv)
        println(io, """  <line x1="$(f1(px(bR, lo)))" y1="$(f1(yy))" x2="$(f1(px(bR, hi)))" y2="$(f1(yy))" stroke="$col" stroke-width="2.2"/>""")
        println(io, """  <circle cx="$(f1(px(bR, pw)))" cy="$(f1(yy))" r="3.8" fill="$col"/>""")
        println(io, """  <text x="$(f1(px(bR, hi) + 5))" y="$(f1(yy + 4))" fill="$col" font-size="9.6" font-weight="700" font-family="$FONT_MONO">$(fmt(pw; digits = 2))</text>""")
    end

    println(io, "</svg>")
    write_svg("power-curve-design-tradeoff.svg", String(take!(io)))
end

# ============================================================
# 33. 確率過程とDDM (a02-evidence-accumulation-ddm.js): ddm-paths-rt-dist.svg
# ============================================================
function gen_ddm_paths_rt_dist()
    rng_paths = Xoshiro(5201)
    v, a, z_rel, ter, dt = 0.9, 1.2, 0.5, 0.28, 0.002
    sd = sqrt(dt)

    # 代表的な5試行の軌跡を記録
    paths = Vector{Tuple{Vector{Float64}, Vector{Float64}, Bool}}()
    for _ in 1:40
        ts = [ter]
        xs = [a * z_rel]
        x = a * z_rel
        steps = 0
        while 0.0 < x < a && steps < 1000
            x = clamp(x + v * dt + sd * randn(rng_paths), 0.0, a)
            steps += 1
            push!(ts, ter + steps * dt)
            push!(xs, x)
        end
        hit_upper = x >= a
        if count(p -> p[3], paths) < 4 && hit_upper
            push!(paths, (ts, xs, true))
        elseif count(p -> !p[3], paths) == 0 && !hit_upper
            push!(paths, (ts, xs, false))
        end
        length(paths) >= 5 && break
    end
    @assert length(paths) == 5

    # Page 3 と同じ fast (a=0.9) vs cautious (a=1.6) のRTヒストグラム比較
    function sim_rts(seed::Int, ntr::Int, a_val::Float64)
        r = Xoshiro(seed)
        out = Vector{Float64}(undef, ntr)
        s = sqrt(0.001)
        for i in 1:ntr
            x = a_val * 0.5
            st = 0
            while 0.0 < x < a_val && st < 20_000
                x += 0.9 * 0.001 + s * randn(r)
                st += 1
            end
            out[i] = 1000.0 * (0.28 + st * 0.001)
        end
        return out
    end
    rts_fast = sim_rts(5201, 3000, 0.9)
    rts_caut = sim_rts(5201, 3000, 1.6)
    @assert isapprox(mean(rts_fast), 483.7; atol = 0.2)
    @assert isapprox(mean(rts_caut), 837.3; atol = 0.2)

    io = IOBuffer()
    print(io, svg_header(760, 312, "DDMの証拠蓄積軌跡（上下境界到達）と慎重さ a による右裾反応時間分布の変化"))

    # 左パネル: 非決定時間 ter + 証拠蓄積軌跡
    bL = PlotBox(62.0, 38.0, 298.0, 214.0, 0.0, 1.45, -0.08, 1.32)
    draw_axes!(io, bL;
        xticks = [0.0, 0.28, 0.6, 1.0, 1.4],
        xtick_labels = ["0", "ter=0.28", "0.6", "1.0", "1.4"],
        yticks = [0.0, 0.6, 1.2],
        ytick_labels = ["0 (誤答)", "a/2", "a=1.2 (正答)"],
        xlabel = "経過時間 (秒)",
        ylabel = "蓄積証拠 x(t)",
        title = "Euler–Maruyama法による証拠蓄積軌跡",
        mono_ticks = false,
    )

    println(io, """  <rect x="$(f1(px(bL, 0.0)))" y="$(f1(py(bL, 1.2)))" width="$(f1(px(bL, ter) - px(bL, 0.0)))" height="$(f1(py(bL, 0.0) - py(bL, 1.2)))" fill="#F3EFE6" fill-opacity="0.75"/>""")
    println(io, """  <line x1="$(f1(bL.x0))" y1="$(f1(py(bL, a)))" x2="$(f1(bL.x0 + bL.w))" y2="$(f1(py(bL, a)))" stroke="$C_GREEN" stroke-width="2.0"/>""")
    println(io, """  <line x1="$(f1(bL.x0))" y1="$(f1(py(bL, 0.0)))" x2="$(f1(bL.x0 + bL.w))" y2="$(f1(py(bL, 0.0)))" stroke="$C_RED" stroke-width="2.0"/>""")
    # 平均ドリフトの案内矢印
    println(io, """  <line x1="$(f1(px(bL, ter)))" y1="$(f1(py(bL, 0.6)))" x2="$(f1(px(bL, ter + 0.45)))" y2="$(f1(py(bL, 0.6 + 0.9 * 0.45)))" stroke="$C_INK" stroke-width="2.0" stroke-dasharray="4 3"/>""")

    for (ts, xs, ok) in paths
        col = ok ? C_PURPLE_DEEP : C_RED
        step_stride = max(1, length(ts) ÷ 70)
        idxs = collect(1:step_stride:length(ts))
        idxs[end] != length(ts) && push!(idxs, length(ts))
        pts = join(["$(f1(px(bL, clamp(ts[k], 0.0, 1.44)))),$(f1(py(bL, xs[k])))" for k in idxs], " ")
        println(io, """  <polyline fill="none" stroke="$col" stroke-width="1.6" stroke-opacity="0.82" points="$pts"/>""")
        println(io, """  <circle cx="$(f1(px(bL, clamp(ts[end], 0.0, 1.44))))" cy="$(f1(py(bL, xs[end])))" r="3.4" fill="$col"/>""")
    end
    println(io, """  <text x="$(f1(px(bL, 0.14)))" y="$(f1(py(bL, 0.92)))" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">非決定</text>""")
    println(io, """  <text x="$(f1(px(bL, 0.14)))" y="$(f1(py(bL, 0.80)))" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">時間 ter</text>""")

    # 右パネル: v=0.9 固定で a=0.9 vs a=1.6 の右裾 RT 分布
    bR = PlotBox(436.0, 38.0, 296.0, 214.0, 250.0, 1850.0, 0.0, 0.0042)
    draw_axes!(io, bR;
        xticks = [300.0, 600.0, 1000.0, 1400.0, 1800.0],
        yticks = [0.0, 0.002, 0.004],
        ytick_labels = ["0", ".002", ".004"],
        xlabel = "反応時間 RT (ms)",
        ylabel = "密度",
        title = "慎重さ a の増加 → 正答率↑・右裾の伸び",
    )

    edges = collect(260.0:60.0:1820.0)
    function hist_poly(rts, edges, b)
        n_tot = length(rts)
        bw = edges[2] - edges[1]
        pts = String["$(f1(px(b, edges[1]))),$(f1(py(b, 0.0)))"]
        for i in 1:(length(edges) - 1)
            dens = count(x -> edges[i] <= x < edges[i + 1], rts) / (n_tot * bw)
            push!(pts, "$(f1(px(b, edges[i]))),$(f1(py(b, min(dens, 0.0041))))")
            push!(pts, "$(f1(px(b, edges[i + 1]))),$(f1(py(b, min(dens, 0.0041))))")
        end
        push!(pts, "$(f1(px(b, edges[end]))),$(f1(py(b, 0.0)))")
        return join(pts, " ")
    end
    println(io, """  <polygon points="$(hist_poly(rts_fast, edges, bR))" fill="$C_BLUE" fill-opacity="0.28" stroke="$C_BLUE" stroke-width="1.8"/>""")
    println(io, """  <polygon points="$(hist_poly(rts_caut, edges, bR))" fill="$C_PURPLE" fill-opacity="0.26" stroke="$C_PURPLE_DEEP" stroke-width="1.8"/>""")
    println(io, """  <text x="$(f1(bR.x0 + 96))" y="$(f1(bR.y0 + 20))" fill="$C_BLUE" font-size="9.8" font-weight="700" font-family="$FONT_JP">青 a=0.9：正答率 70.1%, 平均 484ms</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 96))" y="$(f1(bR.y0 + 37))" fill="$C_PURPLE_DEEP" font-size="9.8" font-weight="700" font-family="$FONT_JP">紫 a=1.6：正答率 81.9%, 平均 837ms</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 96))" y="$(f1(bR.y0 + 54))" fill="$C_SUB" font-size="9.3" font-family="$FONT_JP">同じ能力 v=0.9 でも境界幅で右裾が大きく伸びる</text>""")

    println(io, "</svg>")
    write_svg("ddm-paths-rt-dist.svg", String(take!(io)))
end

# ============================================================
# 34. 状態空間とカルマンフィルタ (a03-state-space-kalman.js): kalman-filter-smoothing.svg
# ============================================================
function gen_kalman_filter_smoothing()
    rng = Xoshiro(5301)
    T = 80
    phi, q, r = 0.95, 0.35, 1.10
    x_true = Vector{Float64}(undef, T)
    y_obs  = Vector{Float64}(undef, T)
    let xp = 0.0
        for t in 1:T
            xc = phi * xp + q * randn(rng)
            x_true[t] = xc
            y_obs[t]  = xc + r * randn(rng)
            xp = xc
        end
    end

    function kf_run(y, ph, qv, rv)
        xf = Vector{Float64}(undef, length(y))
        Pf = Vector{Float64}(undef, length(y))
        xp, Pp = 0.0, 10.0
        ll = 0.0
        for t in eachindex(y)
            xpr = ph * xp
            Ppr = ph^2 * Pp + qv^2
            inn = y[t] - xpr
            F = Ppr + rv^2
            K = Ppr / F
            xc = xpr + K * inn
            Pc = (1.0 - K) * Ppr
            ll += -0.5 * (log(2.0 * pi * F) + inn^2 / F)
            xf[t], Pf[t] = xc, Pc
            xp, Pp = xc, Pc
        end
        return xf, Pf, ll
    end

    xf, Pf, ll_true = kf_run(y_obs, phi, q, r)
    obs_rmse  = sqrt(mean((y_obs .- x_true) .^ 2))
    filt_rmse = sqrt(mean((xf .- x_true) .^ 2))
    @assert round(obs_rmse; digits = 3) == 1.005
    @assert round(filt_rmse; digits = 3) == 0.532
    @assert round(ll_true; digits = 1) == -126.1

    io = IOBuffer()
    print(io, svg_header(760, 312, "カルマンフィルタによる潜在状態の追跡（RMSE半減）と予測誤差分解による周辺対数尤度"))

    # 左パネル: 観測 y_obs (灰点) vs 真の状態 x_true (黒) vs フィルタ推定 x_filt ± 1.96√P (紫)
    bL = PlotBox(58.0, 38.0, 336.0, 214.0, 1.0, 80.0, -3.6, 3.6)
    draw_axes!(io, bL;
        xticks = [1.0, 20.0, 40.0, 60.0, 80.0],
        yticks = [-3.0, -1.5, 0.0, 1.5, 3.0],
        xlabel = "時点 t",
        ylabel = "状態 x_t / 観測値 y_t",
        title = "ノイズ観測 y_t から潜在状態 x_t を分離",
    )

    band_pts = join(["$(f1(px(bL, t))),$(f1(py(bL, clamp(xf[t] - 1.96 * sqrt(Pf[t]), -3.55, 3.55))))" for t in 1:T], " ") * " " *
               join(["$(f1(px(bL, t))),$(f1(py(bL, clamp(xf[t] + 1.96 * sqrt(Pf[t]), -3.55, 3.55))))" for t in T:-1:1], " ")
    println(io, """  <polygon points="$band_pts" fill="$C_PURPLE" fill-opacity="0.20"/>""")

    for t in 1:T
        println(io, """  <circle cx="$(f1(px(bL, t)))" cy="$(f1(py(bL, clamp(y_obs[t], -3.5, 3.5))))" r="2.2" fill="#9AA0A6" fill-opacity="0.78"/>""")
    end
    pts_true = join(["$(f1(px(bL, t))),$(f1(py(bL, x_true[t])))" for t in 1:T], " ")
    pts_filt = join(["$(f1(px(bL, t))),$(f1(py(bL, xf[t])))" for t in 1:T], " ")
    println(io, """  <polyline fill="none" stroke="$C_INK" stroke-width="1.9" stroke-dasharray="4 3" points="$pts_true"/>""")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.4" points="$pts_filt"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">灰点：観測値 y_t (RMSE = 1.005)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 34))" fill="$C_PURPLE_DEEP" font-size="9.7" font-weight="700" font-family="$FONT_JP">紫実線＋帯：カルマンフィルタ (RMSE = 0.532)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 49))" fill="$C_INK" font-size="9.4" font-family="$FONT_JP">黒破線：真の潜在状態 x_t</text>""")

    # 右パネル: 観測ノイズ r を動かしたときの周辺対数尤度プロファイル
    rs = range(0.35, 2.60; length = 90)
    lls = [kf_run(y_obs, phi, q, rv)[3] for rv in rs]
    r_best_idx = argmax(lls)

    bR = PlotBox(458.0, 38.0, 274.0, 214.0, 0.30, 2.65, -245.0, -118.0)
    draw_axes!(io, bR;
        xticks = [0.5, 1.1, 1.8, 2.5],
        yticks = [-240.0, -200.0, -160.0, -126.0],
        xlabel = "仮定した測定誤差 SD r",
        ylabel = "周辺対数尤度 log p(y₁:T)",
        title = "予測誤差分解による周辺対数尤度",
    )

    pts_ll = join(["$(f1(px(bR, rs[i]))),$(f1(py(bR, max(lls[i], -243.0))))" for i in eachindex(rs)], " ")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.6" points="$pts_ll"/>""")
    println(io, """  <line x1="$(f1(px(bR, r)))" y1="$(f1(bR.y0))" x2="$(f1(px(bR, r)))" y2="$(f1(bR.y0 + bR.h))" stroke="$C_INK" stroke-width="1.4" stroke-dasharray="4 3"/>""")
    println(io, """  <circle cx="$(f1(px(bR, r)))" cy="$(f1(py(bR, ll_true)))" r="4.3" fill="$C_GREEN" stroke="#FFFFFF" stroke-width="1.2"/>""")
    println(io, """  <text x="$(f1(px(bR, 1.16)))" y="$(f1(py(bR, ll_true) + 15))" fill="$C_GREEN" font-size="9.8" font-weight="700" font-family="$FONT_JP">真値 r=1.10付近で最大 (-126.1)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 12))" y="$(f1(bR.y0 + 194))" fill="$C_RED" font-size="9.3" font-family="$FONT_JP">← r過小：予測誤差爆発 / r過大：分散罰則 →</text>""")

    println(io, "</svg>")
    write_svg("kalman-filter-smoothing.svg", String(take!(io)))
end

# ============================================================
# 35. 分布の推定と予測診断 (x08-distribution-fit-diagnostics.js): predictive-qq-overdispersion.svg
# ============================================================
function gen_predictive_qq_overdispersion()
    rt = [438.0, 452, 470, 481, 495, 502, 509, 517,
          526, 538, 551, 568, 590, 614, 648, 710]
    d_ln  = fit_mle(LogNormal, rt)
    d_exp = fit_mle(Exponential, rt)
    n = length(rt)
    probs_q = ((1:n) .- 0.5) ./ n
    q_ln  = quantile.(Ref(d_ln), probs_q)
    q_exp = quantile.(Ref(d_exp), probs_q)

    counts = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 7, 9, 12, 15]
    d_pois = fit_mle(Poisson, counts)
    @assert round(mean(counts); digits = 3) == 3.611

    io = IOBuffer()
    print(io, svg_header(760, 312, "QQ診断による平均一致Exponential誤モデルの反証と過分散カウントにおけるPoissonの0・右裾不一致"))

    # 左パネル: QQプロット LogNormal vs Exponential (どちらも平均 538.1 ms)
    bL = PlotBox(66.0, 38.0, 294.0, 214.0, 0.0, 1750.0, 380.0, 760.0)
    draw_axes!(io, bL;
        xticks = [0.0, 500.0, 1000.0, 1500.0],
        yticks = [400.0, 500.0, 600.0, 700.0],
        xlabel = "fit済みモデルの理論分位点 (ms)",
        ylabel = "観測された反応時間 (ms)",
        title = "QQ診断：同じ平均 538ms でも形は別物",
    )

    println(io, """  <line x1="$(f1(px(bL, 380.0)))" y1="$(f1(py(bL, 380.0)))" x2="$(f1(px(bL, 760.0)))" y2="$(f1(py(bL, 760.0)))" stroke="$C_AXIS" stroke-width="1.5" stroke-dasharray="4 3"/>""")
    for i in 1:n
        println(io, """  <circle cx="$(f1(px(bL, clamp(q_exp[i], 0.0, 1730.0))))" cy="$(f1(py(bL, rt[i])))" r="3.4" fill="$C_RED" fill-opacity="0.82"/>""")
        println(io, """  <circle cx="$(f1(px(bL, q_ln[i])))" cy="$(f1(py(bL, rt[i])))" r="3.7" fill="$C_GREEN"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 92))" y="$(f1(bL.y0 + 20))" fill="$C_GREEN" font-size="9.8" font-weight="700" font-family="$FONT_JP">緑：LogNormal (対角線 y=x 上に整列)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 92))" y="$(f1(bL.y0 + 37))" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_JP">赤：Exponential (短すぎ＆長すぎの裾)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 92))" y="$(f1(bL.y0 + 53))" fill="$C_SUB" font-size="9.3" font-family="$FONT_JP">平均一致だけでは分布の適合は言えない</text>""")

    # 右パネル: 過分散カウントデータ (mean=3.61, var=18.57, zero=27.8%) vs Poisson(3.61)
    bins_lbl = ["0", "1–2", "3–5", "6–9", "10+"]
    obs_rates = [
        count(==(0), counts),
        count(x -> 1 <= x <= 2, counts),
        count(x -> 3 <= x <= 5, counts),
        count(x -> 6 <= x <= 9, counts),
        count(>=(10), counts),
    ] ./ length(counts)
    pois_rates = [
        pdf(d_pois, 0),
        sum(pdf(d_pois, k) for k in 1:2),
        sum(pdf(d_pois, k) for k in 3:5),
        sum(pdf(d_pois, k) for k in 6:9),
        ccdf(d_pois, 9),
    ]

    bR = PlotBox(438.0, 38.0, 294.0, 214.0, 0.4, 5.6, 0.0, 0.50)
    draw_axes!(io, bR;
        xticks = collect(1.0:5.0),
        xtick_labels = bins_lbl,
        yticks = [0.0, 0.15, 0.30, 0.45],
        ytick_labels = ["0.00", "0.15", "0.30", "0.45"],
        xlabel = "カウント区間",
        ylabel = "割合 / 予測確率",
        title = "過分散カウント：0と右裾の同時不一致",
    )

    bw = 16.0
    for i in 1:5
        cx = px(bR, Float64(i))
        yo = py(bR, obs_rates[i])
        yp = py(bR, pois_rates[i])
        yb = py(bR, 0.0)
        println(io, """  <rect x="$(f1(cx - bw - 1.5))" y="$(f1(yo))" width="$(f1(bw))" height="$(f1(yb - yo))" rx="2" fill="$C_PURPLE" fill-opacity="0.82"/>""")
        println(io, """  <rect x="$(f1(cx + 1.5))" y="$(f1(yp))" width="$(f1(bw))" height="$(f1(yb - yp))" rx="2" fill="#F6D8D5" stroke="$C_RED" stroke-width="1.5"/>""")
    end
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_PURPLE_DEEP" font-size="9.7" font-weight="700" font-family="$FONT_JP">紫棒：観測 (平均 3.61, 分散 18.57, 0率 27.8%)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 34))" fill="$C_RED" font-size="9.7" font-weight="700" font-family="$FONT_JP">赤枠：Poisson(3.61) (0率 2.7%, 10以上 0.4%)</text>""")

    println(io, "</svg>")
    write_svg("predictive-qq-overdispersion.svg", String(take!(io)))
end

# ============================================================
# 36. 観測境界・依存・混合分布 (x09-observation-boundaries-dependence.js):
#     truncated-vs-censored-mixture.svg
# ============================================================
function gen_truncated_vs_censored_mixture()
    latent = Normal(100.0, 15.0)
    d_trunc = truncated(latent; lower = 90.0)
    d_cens  = censored(latent; lower = 90.0)
    p_mass90 = cdf(latent, 90.0)
    @assert round(mean(d_trunc); digits = 2) == 106.41
    @assert round(p_mass90; digits = 3) == 0.252

    mix = MixtureModel(Normal[Normal(450.0, 25.0), Normal(650.0, 30.0)], [0.7, 0.3])
    matched = Normal(mean(mix), std(mix))
    @assert round(mean(mix); digits = 1) == 510.0

    io = IOBuffer()
    print(io, svg_header(760, 312, "切断（truncated）と打切り（censored）の境界挙動の違い、および混合分布の谷による単一Normal反証"))

    # 左パネル: Normal(100,15) と lower=90 の truncated (再正規化) vs censored (境界質量 0.252)
    bL = PlotBox(64.0, 38.0, 296.0, 214.0, 58.0, 145.0, 0.0, 0.042)
    draw_axes!(io, bL;
        xticks = [60.0, 75.0, 90.0, 100.0, 120.0, 140.0],
        yticks = [0.0, 0.015, 0.030],
        ytick_labels = ["0.000", "0.015", "0.030"],
        xlabel = "値 (下限境界 90)",
        ylabel = "連続密度 (※赤棒は境界確率質量)",
        title = "truncated (除外) vs censored (境界記録)",
    )

    xs_lat = range(58.0, 145.0; length = 150)
    pts_lat = join(["$(f1(px(bL, x))),$(f1(py(bL, pdf(latent, x))))" for x in xs_lat], " ")
    println(io, """  <polyline fill="none" stroke="$C_SUB" stroke-width="1.8" stroke-dasharray="5 3" points="$pts_lat"/>""")

    xs_hi = range(90.0, 145.0; length = 110)
    pts_tr = join(["$(f1(px(bL, x))),$(f1(py(bL, pdf(d_trunc, x))))" for x in xs_hi], " ")
    poly_tr = "$(f1(px(bL, 90.0))),$(f1(py(bL, 0.0))) $pts_tr $(f1(px(bL, 145.0))),$(f1(py(bL, 0.0)))"
    println(io, """  <polygon points="$poly_tr" fill="$C_PURPLE" fill-opacity="0.18"/>""")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.5" points="$pts_tr"/>""")

    # censored: x > 90 は元密度のまま + x = 90 に確率質量 0.252 のスパイク棒
    pts_ce = join(["$(f1(px(bL, x))),$(f1(py(bL, pdf(latent, x))))" for x in xs_hi], " ")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.1" points="$pts_ce"/>""")
    x90 = px(bL, 90.0)
    y_spike = py(bL, 0.036)
    println(io, """  <line x1="$(f1(x90))" y1="$(f1(py(bL, 0.0)))" x2="$(f1(x90))" y2="$(f1(y_spike))" stroke="$C_RED" stroke-width="4.2"/>""")
    println(io, """  <circle cx="$(f1(x90))" cy="$(f1(y_spike))" r="5.0" fill="$C_RED"/>""")
    println(io, """  <text x="$(f1(x90 - 7))" y="$(f1(y_spike + 4))" text-anchor="end" fill="$C_RED" font-size="9.6" font-weight="700" font-family="$FONT_JP">境界質量 0.252</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_PURPLE_DEEP" font-size="9.5" font-weight="700" font-family="$FONT_JP">紫 truncated：90以上を再正規化 (平均 106.4)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 34))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">赤 censored：90未満が90に積まれる (平均 102.3)</text>""")

    # 右パネル: MixtureModel vs 同じ平均・SD の単一 Normal(510, 95.4) の谷 (520..580)
    bR = PlotBox(436.0, 38.0, 296.0, 214.0, 340.0, 760.0, 0.0, 0.0128)
    draw_axes!(io, bR;
        xticks = [400.0, 450.0, 520.0, 580.0, 650.0, 720.0],
        yticks = [0.0, 0.005, 0.010],
        ytick_labels = ["0.000", "0.005", "0.010"],
        xlabel = "値",
        ylabel = "確率密度",
        title = "MixtureModel の谷 vs 同モーメント単一正規",
    )

    # 谷区間 520〜580 のハイライト帯
    println(io, """  <rect x="$(f1(px(bR, 520.0)))" y="$(f1(bR.y0))" width="$(f1(px(bR, 580.0) - px(bR, 520.0)))" height="$(f1(bR.h))" fill="#FFF6DE"/>""")

    xs_m = range(340.0, 760.0; length = 180)
    pts_mix = join(["$(f1(px(bR, x))),$(f1(py(bR, pdf(mix, x))))" for x in xs_m], " ")
    pts_nrm = join(["$(f1(px(bR, x))),$(f1(py(bR, pdf(matched, x))))" for x in xs_m], " ")
    poly_mix = "$(f1(px(bR, 340.0))),$(f1(py(bR, 0.0))) $pts_mix $(f1(px(bR, 760.0))),$(f1(py(bR, 0.0)))"
    println(io, """  <polygon points="$poly_mix" fill="$C_BLUE" fill-opacity="0.20"/>""")
    println(io, """  <polyline fill="none" stroke="$C_BLUE" stroke-width="2.5" points="$pts_mix"/>""")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.1" stroke-dasharray="6 4" points="$pts_nrm"/>""")
    println(io, """  <text x="$(f1(px(bR, 550.0)))" y="$(f1(bR.y0 + 52))" text-anchor="middle" fill="#8A5D0B" font-size="9.4" font-weight="700" font-family="$FONT_JP">520〜580 の谷</text>""")
    println(io, """  <text x="$(f1(px(bR, 550.0)))" y="$(f1(bR.y0 + 67))" text-anchor="middle" fill="$C_BLUE" font-size="9.2" font-weight="700" font-family="$FONT_JP">混合 &lt; 2%</text>""")
    println(io, """  <text x="$(f1(px(bR, 550.0)))" y="$(f1(bR.y0 + 81))" text-anchor="middle" fill="$C_RED" font-size="9.2" font-weight="700" font-family="$FONT_JP">単一正規 &gt; 17%</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_BLUE" font-size="9.5" font-weight="700" font-family="$FONT_JP">青：0.7 N(450,25) + 0.3 N(650,30)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 33))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">赤破線：同平均・同SDの単一 Normal</text>""")

    println(io, "</svg>")
    write_svg("truncated-vs-censored-mixture.svg", String(take!(io)))
end

# ============================================================
# 37. データの整形・保存・再利用 (l16-reshape.js): wide-to-long-reshape.svg
# ============================================================
function gen_wide_to_long_reshape()
    io = IOBuffer()
    print(io, svg_header(760, 304, "横持ち（1人1行・条件ごと別列）と縦持ち（1行1観測・tidy形式）の stack / unstack 変換"))

    # 左ボックス: 横持ち (Wide)
    println(io, """  <rect x="28" y="34" width="276" height="196" rx="10" fill="#FFFFFF" stroke="$C_AXIS" stroke-width="1.5"/>""")
    println(io, """  <text x="166" y="56" text-anchor="middle" fill="$C_INK" font-size="12" font-weight="700" font-family="$FONT_JP">横持ち (Wide)：1人 = 1行</text>""")
    println(io, """  <text x="166" y="73" text-anchor="middle" fill="$C_SUB" font-size="9.6" font-family="$FONT_JP">条件が列見出しに散らばりモデル式へ入れにくい</text>""")

    # Wide table headers & 3 rows
    wx = [44.0, 108.0, 192.0]
    println(io, """  <rect x="40" y="84" width="252" height="24" rx="4" fill="#F3EFE6"/>""")
    for (j, h) in enumerate(["id", "cond_A", "cond_B"])
        println(io, """  <text x="$(f1(wx[j] + 28))" y="100" text-anchor="middle" fill="$C_INK" font-size="10.2" font-weight="700" font-family="$FONT_MONO">$h</text>""")
    end
    wide_rows = [
        ("S01", "520", "480", C_BLUE, C_PURPLE_DEEP),
        ("S02", "540", "510", C_BLUE, C_PURPLE_DEEP),
        ("S03", "495", "460", C_BLUE, C_PURPLE_DEEP),
    ]
    for (r, (idv, a, b, ca, cb)) in enumerate(wide_rows)
        yy = 108 + (r - 1) * 34
        println(io, """  <line x1="40" y1="$(yy)" x2="292" y2="$(yy)" stroke="$C_GRID" stroke-width="1"/>""")
        println(io, """  <text x="$(f1(wx[1] + 28))" y="$(yy + 21)" text-anchor="middle" fill="$C_INK" font-size="10.2" font-family="$FONT_MONO">$idv</text>""")
        println(io, """  <rect x="$(f1(wx[2] + 4))" y="$(yy + 5)" width="68" height="22" rx="4" fill="$ca" fill-opacity="0.14"/>""")
        println(io, """  <text x="$(f1(wx[2] + 38))" y="$(yy + 20)" text-anchor="middle" fill="$ca" font-size="10.2" font-weight="700" font-family="$FONT_MONO">$a</text>""")
        println(io, """  <rect x="$(f1(wx[3] + 4))" y="$(yy + 5)" width="68" height="22" rx="4" fill="$cb" fill-opacity="0.14"/>""")
        println(io, """  <text x="$(f1(wx[3] + 38))" y="$(yy + 20)" text-anchor="middle" fill="$cb" font-size="10.2" font-weight="700" font-family="$FONT_MONO">$b</text>""")
    end

    # 中央矢印: stack / unstack
    println(io, """  <path d="M 316 112 L 424 112" stroke="$C_PURPLE_DEEP" stroke-width="2.6"/>""")
    println(io, """  <polygon points="432,112 421,106 421,118" fill="$C_PURPLE_DEEP"/>""")
    println(io, """  <text x="374" y="96" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.8" font-weight="700" font-family="$FONT_MONO">stack(df, [:A,:B])</text>""")
    println(io, """  <text x="374" y="128" text-anchor="middle" fill="$C_SUB" font-size="9.3" font-family="$FONT_JP">横 → 縦（列を値へ畳む）</text>""")

    println(io, """  <path d="M 430 166 L 322 166" stroke="$C_GREEN" stroke-width="2.3" stroke-dasharray="5 3"/>""")
    println(io, """  <polygon points="314,166 325,160 325,172" fill="$C_GREEN"/>""")
    println(io, """  <text x="374" y="156" text-anchor="middle" fill="$C_GREEN" font-size="10.4" font-weight="700" font-family="$FONT_MONO">unstack</text>""")
    println(io, """  <text x="374" y="182" text-anchor="middle" fill="$C_SUB" font-size="9.3" font-family="$FONT_JP">縦 → 横（1セル1値を確認）</text>""")

    # 右ボックス: 縦持ち (Long / Tidy)
    println(io, """  <rect x="444" y="24" width="288" height="226" rx="10" fill="#FFFFFF" stroke="$C_AXIS" stroke-width="1.5"/>""")
    println(io, """  <text x="588" y="45" text-anchor="middle" fill="$C_INK" font-size="12" font-weight="700" font-family="$FONT_JP">縦持ち (Long)：1観測 = 1行</text>""")
    println(io, """  <text x="588" y="61" text-anchor="middle" fill="$C_SUB" font-size="9.6" font-family="$FONT_JP">groupby・可視化・回帰 @formula(rt ~ cond) の標準形</text>""")

    lx = [460.0, 536.0, 634.0]
    println(io, """  <rect x="456" y="70" width="264" height="22" rx="4" fill="#F3EFE6"/>""")
    for (j, h) in enumerate(["id", "variable", "value"])
        println(io, """  <text x="$(f1(lx[j] + 32))" y="85" text-anchor="middle" fill="$C_INK" font-size="10.0" font-weight="700" font-family="$FONT_MONO">$h</text>""")
    end
    long_rows = [
        ("S01", "cond_A", "520", C_BLUE),
        ("S02", "cond_A", "540", C_BLUE),
        ("S03", "cond_A", "495", C_BLUE),
        ("S01", "cond_B", "480", C_PURPLE_DEEP),
        ("S02", "cond_B", "510", C_PURPLE_DEEP),
        ("S03", "cond_B", "460", C_PURPLE_DEEP),
    ]
    for (r, (idv, vr, vl, col)) in enumerate(long_rows)
        yy = 94 + (r - 1) * 24
        println(io, """  <line x1="456" y1="$(yy)" x2="720" y2="$(yy)" stroke="$C_GRID" stroke-width="0.8"/>""")
        println(io, """  <text x="$(f1(lx[1] + 32))" y="$(yy + 16)" text-anchor="middle" fill="$C_INK" font-size="9.6" font-family="$FONT_MONO">$idv</text>""")
        println(io, """  <text x="$(f1(lx[2] + 36))" y="$(yy + 16)" text-anchor="middle" fill="$col" font-size="9.6" font-weight="700" font-family="$FONT_MONO">$vr</text>""")
        println(io, """  <text x="$(f1(lx[3] + 34))" y="$(yy + 16)" text-anchor="middle" fill="$col" font-size="9.6" font-weight="700" font-family="$FONT_MONO">$vl</text>""")
    end

    println(io, """  <text x="380" y="278" text-anchor="middle" fill="$C_SUB" font-size="10.0" font-family="$FONT_JP">行数不変量：N人 × K条件の横持ち (3行×2条件列) を stack すると N×K = 6行の縦持ちになる</text>""")
    println(io, "</svg>")
    write_svg("wide-to-long-reshape.svg", String(take!(io)))
end

# ============================================================
# 38. 推定と不確かさ (l22-estimation.js): bias-precision-ci-coverage.svg
# ============================================================
function gen_bias_precision_ci_coverage()
    rng = Xoshiro(2201)
    true_mu = 500.0
    sigma = 60.0
    n = 30
    t_crit = quantile(TDist(n - 1), 0.975)

    # 20研究の95%信頼区間を生成
    studies = NamedTuple[]
    for s in 1:20
        xs = true_mu .+ sigma .* randn(rng, n)
        m = mean(xs)
        se = std(xs) / sqrt(n)
        lo, hi = m - t_crit * se, m + t_crit * se
        push!(studies, (; s, m, lo, hi, ok = (lo <= true_mu <= hi)))
    end
    n_ok = count(x -> x.ok, studies)
    @assert 17 <= n_ok <= 20

    io = IOBuffer()
    print(io, svg_header(760, 312, "推定量の正確さ（低バイアス）と精密さ（低分散）、および20研究の95%信頼区間被覆"))

    # 左パネル: 正確さ (Bias) × 精密さ (Precision) の標本分布比較
    bL = PlotBox(58.0, 38.0, 294.0, 214.0, -3.5, 4.5, 0.0, 0.68)
    draw_axes!(io, bL;
        xticks = [-2.0, 0.0, 1.8, 3.5],
        xtick_labels = ["-2", "真値 θ", "+バイアス", "+3.5"],
        yticks = [0.0, 0.25, 0.50],
        ytick_labels = ["0.0", "0.25", "0.50"],
        xlabel = "推定値 θ̂ の分布",
        ylabel = "密度",
        title = "正確さ (Bias) と精密さ (SE) は別軸",
        mono_ticks = false,
    )
    println(io, """  <line x1="$(f1(px(bL, 0.0)))" y1="$(f1(bL.y0))" x2="$(f1(px(bL, 0.0)))" y2="$(f1(bL.y0 + bL.h))" stroke="$C_INK" stroke-width="1.5" stroke-dasharray="4 3"/>""")

    xs_g = range(-3.4, 4.4; length = 160)
    for (d, col, dash) in [
        (Normal(0.0, 0.62), C_GREEN, ""),
        (Normal(0.0, 1.35), C_BLUE, "5 3"),
        (Normal(1.8, 0.62), C_RED, ""),
    ]
        pts = join(["$(f1(px(bL, x))),$(f1(py(bL, pdf(d, x))))" for x in xs_g], " ")
        dash_attr = isempty(dash) ? "" : """ stroke-dasharray="$dash\""""
        println(io, """  <polyline fill="none" stroke="$col" stroke-width="2.4"$dash_attr points="$pts"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_GREEN" font-size="9.5" font-weight="700" font-family="$FONT_JP">緑：不偏かつ高精密 (低Bias・小SE)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 34))" fill="$C_BLUE" font-size="9.5" font-weight="700" font-family="$FONT_JP">青破線：不偏だが低精密 (小nでSE大)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 50))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">赤：精密だが系統バイアスあり (選択・交絡)</text>""")

    # 右パネル: 20本の独立研究の95%信頼区間
    bR = PlotBox(434.0, 38.0, 298.0, 214.0, 445.0, 555.0, 0.3, 20.7)
    draw_axes!(io, bR;
        xticks = [460.0, 480.0, 500.0, 520.0, 540.0],
        yticks = [1.0, 5.0, 10.0, 15.0, 20.0],
        xlabel = "推定平均と 95% 信頼区間 (真の母平均 μ = 500)",
        ylabel = "反復した研究番号",
        title = "20研究の95% CI：動くのは母数でなく区間",
    )
    println(io, """  <line x1="$(f1(px(bR, true_mu)))" y1="$(f1(bR.y0))" x2="$(f1(px(bR, true_mu)))" y2="$(f1(bR.y0 + bR.h))" stroke="$C_INK" stroke-width="1.6" stroke-dasharray="4 3"/>""")
    for st in studies
        yy = py(bR, Float64(st.s))
        col = st.ok ? C_PURPLE_DEEP : C_RED
        sw  = st.ok ? "1.8" : "2.6"
        println(io, """  <line x1="$(f1(px(bR, clamp(st.lo, 446.0, 554.0))))" y1="$(f1(yy))" x2="$(f1(px(bR, clamp(st.hi, 446.0, 554.0))))" y2="$(f1(yy))" stroke="$col" stroke-width="$sw"/>""")
        println(io, """  <circle cx="$(f1(px(bR, st.m)))" cy="$(f1(yy))" r="2.8" fill="$col"/>""")
    end
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_PURPLE_DEEP" font-size="9.5" font-weight="700" font-family="$FONT_JP">紫：真値 500 を含む区間 ($(n_ok)/20本)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 178))" y="$(f1(bR.y0 + 18))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">赤：外れた区間 ($(20 - n_ok)/20本)</text>""")

    println(io, "</svg>")
    write_svg("bias-precision-ci-coverage.svg", String(take!(io)))
end

# ============================================================
# 39. 一般線形モデル統合 (l24-regression.js): glm-unification-ttest-anova-lm.svg
# ============================================================
function gen_glm_unification_ttest_anova_lm()
    io = IOBuffer()
    print(io, svg_header(760, 312, "2群t検定・1要因ANOVA・単回帰を単一の一般線形モデル y = β₀ + Σβⱼxⱼ + ε として統合する図"))

    # 左パネル: 独立2群 t検定 = 0/1 ダミー回帰 (t² = F)
    b1 = PlotBox(50.0, 42.0, 200.0, 206.0, -0.25, 1.25, 460.0, 560.0)
    draw_axes!(io, b1;
        xticks = [0.0, 1.0],
        xtick_labels = ["0 (統制)", "1 (介入)"],
        yticks = [470.0, 500.0, 530.0, 550.0],
        xlabel = "0/1 ダミー変数 x",
        ylabel = "反応時間 y",
        title = "① 2群t検定 = 0/1回帰",
        mono_ticks = false,
    )
    println(io, """  <line x1="$(f1(px(b1, 0.0)))" y1="$(f1(py(b1, 530.0)))" x2="$(f1(px(b1, 1.0)))" y2="$(f1(py(b1, 490.0)))" stroke="$C_PURPLE_DEEP" stroke-width="2.6"/>""")
    println(io, """  <circle cx="$(f1(px(b1, 0.0)))" cy="$(f1(py(b1, 530.0)))" r="4.8" fill="$C_BLUE"/>""")
    println(io, """  <circle cx="$(f1(px(b1, 1.0)))" cy="$(f1(py(b1, 490.0)))" r="4.8" fill="$C_GREEN"/>""")
    println(io, """  <line x1="$(f1(px(b1, 0.0)))" y1="$(f1(py(b1, 530.0)))" x2="$(f1(px(b1, 1.0)))" y2="$(f1(py(b1, 530.0)))" stroke="$C_SUB" stroke-width="1.2" stroke-dasharray="3 3"/>""")
    println(io, """  <line x1="$(f1(px(b1, 1.0)))" y1="$(f1(py(b1, 530.0)))" x2="$(f1(px(b1, 1.0)))" y2="$(f1(py(b1, 490.0)))" stroke="$C_RED" stroke-width="2.0"/>""")
    println(io, """  <text x="$(f1(b1.x0 + 8))" y="$(f1(b1.y0 + 18))" fill="$C_INK" font-size="9.3" font-weight="700" font-family="$FONT_MONO">β₀ = μ₀ = 530</text>""")
    println(io, """  <text x="$(f1(b1.x0 + 8))" y="$(f1(b1.y0 + 34))" fill="$C_RED" font-size="9.3" font-weight="700" font-family="$FONT_MONO">β₁ = μ₁ - μ₀ = -40</text>""")
    println(io, """  <text x="$(f1(b1.x0 + 8))" y="$(f1(b1.y0 + 190))" fill="$C_PURPLE_DEEP" font-size="9.3" font-weight="700" font-family="$FONT_MONO">t² = F, η² = R²</text>""")

    # 中央パネル: 3群 ANOVA = 参照水準 + 2本のダミー列
    b2 = PlotBox(296.0, 42.0, 200.0, 206.0, 0.6, 3.4, 460.0, 560.0)
    draw_axes!(io, b2;
        xticks = [1.0, 2.0, 3.0],
        xtick_labels = ["A(参照)", "B", "C"],
        yticks = [470.0, 500.0, 530.0, 550.0],
        ytick_labels = ["", "", "", ""],
        xlabel = "カテゴリ水準 (k-1ダミー列)",
        ylabel = "",
        title = "② ANOVA = ダミー重回帰",
        mono_ticks = false,
    )
    println(io, """  <line x1="$(f1(b2.x0))" y1="$(f1(py(b2, 530.0)))" x2="$(f1(b2.x0 + b2.w))" y2="$(f1(py(b2, 530.0)))" stroke="$C_BLUE" stroke-width="1.4" stroke-dasharray="4 3"/>""")
    for (gx, gy, col, lbl) in [(1.0, 530.0, C_BLUE, "β₀"), (2.0, 505.0, C_PURPLE_DEEP, "β₀+β_B"), (3.0, 480.0, C_GREEN, "β₀+β_C")]
        println(io, """  <line x1="$(f1(px(b2, gx)))" y1="$(f1(py(b2, 530.0)))" x2="$(f1(px(b2, gx)))" y2="$(f1(py(b2, gy)))" stroke="$col" stroke-width="2.2"/>""")
        println(io, """  <circle cx="$(f1(px(b2, gx)))" cy="$(f1(py(b2, gy)))" r="4.8" fill="$col"/>""")
        println(io, """  <text x="$(f1(px(b2, gx)))" y="$(f1(py(b2, gy) - 9))" text-anchor="middle" fill="$col" font-size="9.2" font-weight="700" font-family="$FONT_MONO">$lbl</text>""")
    end
    println(io, """  <text x="$(f1(b2.x0 + 8))" y="$(f1(b2.y0 + 190))" fill="$C_INK" font-size="9.2" font-family="$FONT_JP">全体F検定 ＝ ダミー列一括投入比較</text>""")

    # 右パネル: 連続説明変数の単回帰
    b3 = PlotBox(534.0, 42.0, 200.0, 206.0, 0.0, 10.0, 460.0, 560.0)
    draw_axes!(io, b3;
        xticks = [0.0, 5.0, 10.0],
        yticks = [470.0, 500.0, 530.0, 550.0],
        ytick_labels = ["", "", "", ""],
        xlabel = "連続説明変数 x",
        ylabel = "",
        title = "③ 単回帰 = 連続xの傾き",
    )
    rng = Xoshiro(2801)
    for xv in range(0.8, 9.2; length = 18)
        yv = 540.0 - 6.5 * xv + 9.0 * randn(rng)
        println(io, """  <circle cx="$(f1(px(b3, xv)))" cy="$(f1(py(b3, clamp(yv, 464.0, 556.0))))" r="2.7" fill="$C_PURPLE" fill-opacity="0.65"/>""")
    end
    println(io, """  <line x1="$(f1(px(b3, 0.4)))" y1="$(f1(py(b3, 540.0 - 6.5 * 0.4)))" x2="$(f1(px(b3, 9.6)))" y2="$(f1(py(b3, 540.0 - 6.5 * 9.6)))" stroke="$C_PURPLE_DEEP" stroke-width="2.6"/>""")
    println(io, """  <text x="$(f1(b3.x0 + 8))" y="$(f1(b3.y0 + 18))" fill="$C_PURPLE_DEEP" font-size="9.3" font-weight="700" font-family="$FONT_MONO">E[y|x] = β₀ + β₁x</text>""")
    println(io, """  <text x="$(f1(b3.x0 + 8))" y="$(f1(b3.y0 + 190))" fill="$C_INK" font-size="9.2" font-family="$FONT_JP">正規誤差なら最小二乗解 ＝ 最尤解</text>""")

    println(io, "</svg>")
    write_svg("glm-unification-ttest-anova-lm.svg", String(take!(io)))
end

# ============================================================
# 40. 古典的テスト理論と項目分析 (l26-ctt.js): ctt-irt-icc-information.svg
# ============================================================
function gen_ctt_irt_icc_information()
    logistic_p(u) = 1.0 / (1.0 + exp(-u))
    icc_2pl(th, a, b) = logistic_p(a * (th - b))
    info_2pl(th, a, b) = let p = icc_2pl(th, a, b); a^2 * p * (1.0 - p) end

    # L33 Page 17 の検証数値と完全一致を確認
    info_grid = [round(info_2pl(th, 1.5, 0.0); digits = 3) for th in -2:1:2]
    @assert info_grid == [0.102, 0.336, 0.562, 0.336, 0.102]

    io = IOBuffer()
    print(io, svg_header(760, 312, "2母数ロジスティックIRTの項目特性曲線（ICC）と能力 θ に応じて変化する項目情報量 I(θ)"))

    thetas = range(-3.0, 3.0; length = 150)

    # 左パネル: 3項目の項目特性曲線 ICC
    bL = PlotBox(62.0, 38.0, 298.0, 214.0, -3.0, 3.0, 0.0, 1.04)
    draw_axes!(io, bL;
        xticks = [-2.0, -1.0, 0.0, 1.0, 2.0],
        yticks = [0.0, 0.5, 1.0],
        ytick_labels = ["0.0", "0.5", "1.0"],
        xlabel = "潜在能力 θ",
        ylabel = "正答確率 P(Y=1 | θ)",
        title = "項目特性曲線 (ICC)：困難度 b と識別力 a",
    )
    println(io, """  <line x1="$(f1(bL.x0))" y1="$(f1(py(bL, 0.5)))" x2="$(f1(bL.x0 + bL.w))" y2="$(f1(py(bL, 0.5)))" stroke="$C_AXIS" stroke-width="1.1" stroke-dasharray="4 3"/>""")

    items_cfg = [
        (-1.2, 1.2, C_BLUE, "", "易しい項目 (b=-1.2, a=1.2)"),
        (0.0,  1.5, C_PURPLE_DEEP, "", "高識別項目 (b=0.0, a=1.5)"),
        (1.3,  0.8, C_GREEN, "5 3", "難しい・緩やか (b=+1.3, a=0.8)"),
    ]
    for (b_val, a_val, col, dash, _) in items_cfg
        pts = join(["$(f1(px(bL, th))),$(f1(py(bL, icc_2pl(th, a_val, b_val))))" for th in thetas], " ")
        da = isempty(dash) ? "" : """ stroke-dasharray="$dash\""""
        println(io, """  <polyline fill="none" stroke="$col" stroke-width="2.4"$da points="$pts"/>""")
        println(io, """  <circle cx="$(f1(px(bL, b_val)))" cy="$(f1(py(bL, 0.5)))" r="3.8" fill="$col"/>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_BLUE" font-size="9.4" font-weight="700" font-family="$FONT_JP">青：b = -1.2, a = 1.2</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 34))" fill="$C_PURPLE_DEEP" font-size="9.4" font-weight="700" font-family="$FONT_JP">紫：b = 0.0, a = 1.5 (傾き最大)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 50))" fill="$C_GREEN" font-size="9.4" font-weight="700" font-family="$FONT_JP">緑破線：b = +1.3, a = 0.8</text>""")

    # 右パネル: 項目情報量 I_j(θ) = a² P(1-P)
    bR = PlotBox(438.0, 38.0, 294.0, 214.0, -3.0, 3.0, 0.0, 0.65)
    draw_axes!(io, bR;
        xticks = [-2.0, -1.0, 0.0, 1.0, 2.0],
        yticks = [0.0, 0.2, 0.4, 0.562],
        ytick_labels = ["0.00", "0.20", "0.40", "0.562"],
        xlabel = "潜在能力 θ",
        ylabel = "項目情報量 I(θ) = a²P(1−P)",
        title = "CTTの単一SEと違い、IRTはθごとに精度が変わる",
    )
    for (b_val, a_val, col, dash, _) in items_cfg
        pts = join(["$(f1(px(bR, th))),$(f1(py(bR, info_2pl(th, a_val, b_val))))" for th in thetas], " ")
        da = isempty(dash) ? "" : """ stroke-dasharray="$dash\""""
        println(io, """  <polyline fill="none" stroke="$col" stroke-width="2.4"$da points="$pts"/>""")
    end
    for th_pt in -2:1:2
        iv = info_2pl(Float64(th_pt), 1.5, 0.0)
        println(io, """  <circle cx="$(f1(px(bR, Float64(th_pt))))" cy="$(f1(py(bR, iv)))" r="3.6" fill="$C_PURPLE_DEEP"/>""")
    end
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_PURPLE_DEEP" font-size="9.5" font-weight="700" font-family="$FONT_JP">θ = b で P=0.5 となり情報量が最大 (a²/4 = 0.562)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 34))" fill="$C_SUB" font-size="9.3" font-family="$FONT_JP">両端 (θ=±2) では 0.102 へ低下 → 目標帯に項目を配置</text>""")

    println(io, "</svg>")
    write_svg("ctt-irt-icc-information.svg", String(take!(io)))
end

# ============================================================
# 41. 収束的・弁別的妥当性 (l26-validity.js): mtmm-validity-dif-matrix.svg
# ============================================================
function gen_mtmm_validity_dif_matrix()
    # L34 Page 5-6 と完全一致する 6×6 MTMM 相関行列を生成し、A/B × 自己/観察者の 4×4 部分行列を描画
    rng = Xoshiro(3301)
    n = 1000
    trait_R = [1.0 0.30 0.10; 0.30 1.0 0.20; 0.10 0.20 1.0]
    trait = rand(rng, MvNormal(zeros(3), trait_R), n)'
    method = randn(rng, n, 2)
    score = Matrix{Float64}(undef, n, 6)
    for m in 1:2, t in 1:3
        col = (m - 1) * 3 + t
        score[:, col] = 0.75 .* trait[:, t] .+ 0.35 .* method[:, m] .+ 0.40 .* randn(rng, n)
    end
    R6 = cor(score)
    convergent = [R6[1, 4], R6[2, 5], R6[3, 6]]
    same_m = [R6[i, j] for block in (1:3, 4:6) for i in block for j in block if i < j]
    cross_m = [R6[i, j] for i in 1:3 for j in 4:6 if j - 3 != i]
    @assert round.([mean(convergent), mean(same_m), mean(cross_m)]; digits = 3) == [0.669, 0.286, 0.142]

    # 表示用に [A_self, A_obs, B_self, B_obs] の順へ並べた 4×4 行列
    idx4 = [1, 4, 2, 5]
    R = round.(R6[idx4, idx4]; digits = 3)

    io = IOBuffer()
    print(io, svg_header(760, 312, "MTMM（多特性−多方法）相関行列の3種類のセルと、収束相関・同一方法バイアス・異方法弁別相関の比較"))

    # 左パネル: 4×4 MTMM 行列ヒートマップ
    labels = ["A:自己", "A:観察", "B:自己", "B:観察"]
    x0_hm, y0_hm, cw, ch = 82.0, 56.0, 62.0, 44.0
    println(io, """  <text x="206" y="32" text-anchor="middle" fill="$C_INK" font-size="12" font-weight="700" font-family="$FONT_JP">MTMM 相関行列のセル分類 (A・B抜粋)</text>""")
    for i in 1:4
        println(io, """  <text x="$(f1(x0_hm + (i - 0.5) * cw))" y="$(f1(y0_hm - 8))" text-anchor="middle" fill="$C_INK" font-size="9.6" font-weight="700" font-family="$FONT_JP">$(labels[i])</text>""")
        println(io, """  <text x="$(f1(x0_hm - 6))" y="$(f1(y0_hm + (i - 0.5) * ch + 4))" text-anchor="end" fill="$C_INK" font-size="9.6" font-weight="700" font-family="$FONT_JP">$(labels[i])</text>""")
        for j in 1:4
            val = R[i, j]
            is_diag = (i == j)
            is_conv = (i == 1 && j == 2) || (i == 2 && j == 1) || (i == 3 && j == 4) || (i == 4 && j == 3)
            is_meth = (i == 1 && j == 3) || (i == 3 && j == 1) || (i == 2 && j == 4) || (i == 4 && j == 2)
            bg = is_diag ? "#EFECE6" : is_conv ? "#DCF2E3" : is_meth ? "#FBE3E0" : "#E5EFFB"
            fg = is_diag ? C_SUB : is_conv ? C_GREEN : is_meth ? C_RED : C_BLUE
            rx = x0_hm + (j - 1) * cw
            ry = y0_hm + (i - 1) * ch
            println(io, """  <rect x="$(f1(rx + 2))" y="$(f1(ry + 2))" width="$(f1(cw - 4))" height="$(f1(ch - 4))" rx="5" fill="$bg" stroke="$fg" stroke-width="1.2"/>""")
            println(io, """  <text x="$(f1(rx + 0.5 * cw))" y="$(f1(ry + 0.5 * ch + 4))" text-anchor="middle" fill="$fg" font-size="10.2" font-weight="700" font-family="$FONT_MONO">$(fmt(val; digits = 3))</text>""")
        end
    end
    println(io, """  <text x="82" y="254" fill="$C_GREEN" font-size="9.5" font-weight="700" font-family="$FONT_JP">■ 緑：同trait×異method (3trait収束平均 0.669)</text>""")
    println(io, """  <text x="82" y="271" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">■ 赤：異trait×同method (共通methodで 0.286 へ膨張)</text>""")
    println(io, """  <text x="82" y="288" fill="$C_BLUE" font-size="9.5" font-weight="700" font-family="$FONT_JP">■ 青：異trait×異method (弁別基準平均 0.142)</text>""")

    # 右パネル: 順序条件 (収束 0.669 > 異特性同方法 0.286 > 異特性異方法 0.142)
    bR = PlotBox(448.0, 44.0, 282.0, 204.0, 0.0, 0.85, 0.4, 3.6)
    draw_axes!(io, bR;
        xticks = [0.0, 0.2, 0.4, 0.6, 0.8],
        yticks = [1.0, 2.0, 3.0],
        ytick_labels = ["異trait×異method", "異trait×同method", "同trait×異method"],
        xlabel = "6×6 MTMM 行列のセル平均相関 (L34実測)",
        ylabel = "",
        title = "収束 > 方法効果 > 異特性 の順序条件",
        mono_ticks = false,
    )
    bars_mtmm = [
        (3.0, 0.669, C_GREEN, "0.669 (収束的証拠)"),
        (2.0, 0.286, C_RED, "0.286 (方法共有の上乗せ)"),
        (1.0, 0.142, C_BLUE, "0.142 (異方法の弁別基準)"),
    ]
    for (yv, rv, col, note) in bars_mtmm
        yy = py(bR, yv)
        println(io, """  <rect x="$(f1(px(bR, 0.0)))" y="$(f1(yy - 12))" width="$(f1(px(bR, rv) - px(bR, 0.0)))" height="24" rx="4" fill="$col" fill-opacity="0.82"/>""")
        println(io, """  <text x="$(f1(px(bR, rv) + 6))" y="$(f1(yy + 4))" fill="$col" font-size="9.6" font-weight="700" font-family="$FONT_JP">$note</text>""")
    end

    println(io, "</svg>")
    write_svg("mtmm-validity-dif-matrix.svg", String(take!(io)))
end

# ============================================================
# 42. 分布のカタログ (x06-distribution-catalog.js): distribution-catalog-sixpack.svg
# ============================================================
function gen_distribution_catalog_sixpack()
    io = IOBuffer()
    print(io, svg_header(760, 320, "データの値域（0/1・回数・実数・正の連続値・0〜1比率）から選ぶ6大確率分布カタログ"))

    # 3列 × 2段のミニパネル
    # 1: Binomial(10, 0.35), 2: Poisson(3.2) vs NegBin, 3: Normal(0,1) vs TDist(3)
    # 4: LogNormal(0, 0.55), 5: Gamma(3, 1.0), 6: Beta(2, 5)
    panels = [
        (52.0,  34.0, "① Binomial(10, 0.35)", "上限nがある成功回数 {0..n}"),
        (296.0, 34.0, "② Poisson vs NegBin", "上限なし発生回数 {0,1,2,..}"),
        (540.0, 34.0, "③ Normal vs TDist(3)", "実数全体 (-∞, ∞) と重い裾"),
        (52.0,  178.0, "④ LogNormal(0, 0.55)", "正の連続値 (0, ∞)・強い右裾"),
        (296.0, 178.0, "⑤ Gamma(3.0, 1.0)", "正の待ち時間・負荷量 (0, ∞)"),
        (540.0, 178.0, "⑥ Beta(2, 5) / Beta(5, 2)", "両端が決まった比率 (0, 1)"),
    ]
    pw, ph = 188.0, 96.0

    # Panel 1: Binomial(10, 0.35)
    b1 = PlotBox(52.0, 34.0, pw, ph, -0.6, 10.6, 0.0, 0.28)
    draw_axes!(io, b1; xticks = [0.0, 5.0, 10.0], yticks = [0.0, 0.2], xlabel = "", ylabel = "", title = panels[1][3])
    d_bin = Binomial(10, 0.35)
    for k in 0:10
        x = px(b1, Float64(k))
        y = py(b1, pdf(d_bin, k))
        println(io, """  <rect x="$(f1(x - 4.5))" y="$(f1(y))" width="9" height="$(f1(py(b1, 0.0) - y))" fill="$C_BLUE" rx="1.5"/>""")
    end
    println(io, """  <text x="$(f1(b1.x0 + 94))" y="$(f1(b1.y0 + ph + 24))" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">$(panels[1][4])</text>""")

    # Panel 2: Poisson(3.2) vs NegativeBinomial(2.0, 2.0/(2.0+3.2))
    b2 = PlotBox(296.0, 34.0, pw, ph, -0.6, 11.6, 0.0, 0.28)
    draw_axes!(io, b2; xticks = [0.0, 5.0, 10.0], yticks = [0.0, 0.2], xlabel = "", ylabel = "", title = panels[2][3])
    d_p = Poisson(3.2)
    d_nb = NegativeBinomial(2.0, 2.0 / 5.2)
    for k in 0:11
        cx = px(b2, Float64(k))
        yp = py(b2, pdf(d_p, k))
        yn = py(b2, pdf(d_nb, k))
        println(io, """  <rect x="$(f1(cx - 5.0))" y="$(f1(yp))" width="4.5" height="$(f1(py(b2, 0.0) - yp))" fill="$C_GREEN"/>""")
        println(io, """  <rect x="$(f1(cx + 0.5))" y="$(f1(yn))" width="4.5" height="$(f1(py(b2, 0.0) - yn))" fill="$C_RED"/>""")
    end
    println(io, """  <text x="$(f1(b2.x0 + 94))" y="$(f1(b2.y0 + ph + 24))" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">$(panels[2][4])</text>""")

    # Panel 3: Normal(0,1) vs TDist(3)
    b3 = PlotBox(540.0, 34.0, pw, ph, -4.0, 4.0, 0.0, 0.43)
    draw_axes!(io, b3; xticks = [-3.0, 0.0, 3.0], yticks = [0.0, 0.4], xlabel = "", ylabel = "", title = panels[3][3])
    xs3 = range(-4.0, 4.0; length = 100)
    p_n = join(["$(f1(px(b3, x))),$(f1(py(b3, pdf(Normal(), x))))" for x in xs3], " ")
    p_t = join(["$(f1(px(b3, x))),$(f1(py(b3, pdf(TDist(3), x))))" for x in xs3], " ")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.2" points="$p_n"/>""")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.0" stroke-dasharray="4 3" points="$p_t"/>""")
    println(io, """  <text x="$(f1(b3.x0 + 94))" y="$(f1(b3.y0 + ph + 24))" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">$(panels[3][4])</text>""")

    # Panel 4: LogNormal(0, 0.55)
    b4 = PlotBox(52.0, 178.0, pw, ph, 0.0, 4.5, 0.0, 0.85)
    draw_axes!(io, b4; xticks = [0.0, 2.0, 4.0], yticks = [0.0, 0.7], xlabel = "", ylabel = "", title = panels[4][3])
    xs4 = range(0.02, 4.5; length = 100)
    d_ln = LogNormal(0.0, 0.55)
    pts4 = join(["$(f1(px(b4, x))),$(f1(py(b4, pdf(d_ln, x))))" for x in xs4], " ")
    println(io, """  <polygon points="$(f1(px(b4, 0.02))),$(f1(py(b4, 0.0))) $pts4 $(f1(px(b4, 4.5))),$(f1(py(b4, 0.0)))" fill="$C_PURPLE" fill-opacity="0.22"/>""")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.3" points="$pts4"/>""")
    println(io, """  <text x="$(f1(b4.x0 + 94))" y="$(f1(b4.y0 + ph + 24))" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">$(panels[4][4])</text>""")

    # Panel 5: Gamma(3.0, 1.0)
    b5 = PlotBox(296.0, 178.0, pw, ph, 0.0, 9.0, 0.0, 0.30)
    draw_axes!(io, b5; xticks = [0.0, 4.0, 8.0], yticks = [0.0, 0.25], xlabel = "", ylabel = "", title = panels[5][3])
    xs5 = range(0.02, 9.0; length = 100)
    d_ga = Gamma(3.0, 1.0)
    pts5 = join(["$(f1(px(b5, x))),$(f1(py(b5, pdf(d_ga, x))))" for x in xs5], " ")
    println(io, """  <polygon points="$(f1(px(b5, 0.02))),$(f1(py(b5, 0.0))) $pts5 $(f1(px(b5, 9.0))),$(f1(py(b5, 0.0)))" fill="$C_GREEN" fill-opacity="0.20"/>""")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.3" points="$pts5"/>""")
    println(io, """  <text x="$(f1(b5.x0 + 94))" y="$(f1(b5.y0 + ph + 24))" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">$(panels[5][4])</text>""")

    # Panel 6: Beta(2, 5) vs Beta(5, 2)
    b6 = PlotBox(540.0, 178.0, pw, ph, 0.0, 1.0, 0.0, 2.65)
    draw_axes!(io, b6; xticks = [0.0, 0.5, 1.0], yticks = [0.0, 2.0], xlabel = "", ylabel = "", title = panels[6][3])
    xs6 = range(0.01, 0.99; length = 100)
    pts6a = join(["$(f1(px(b6, x))),$(f1(py(b6, pdf(Beta(2, 5), x))))" for x in xs6], " ")
    pts6b = join(["$(f1(px(b6, x))),$(f1(py(b6, pdf(Beta(5, 2), x))))" for x in xs6], " ")
    println(io, """  <polyline fill="none" stroke="$C_BLUE" stroke-width="2.3" points="$pts6a"/>""")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.1" stroke-dasharray="4 3" points="$pts6b"/>""")
    println(io, """  <text x="$(f1(b6.x0 + 94))" y="$(f1(b6.y0 + ph + 24))" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">$(panels[6][4])</text>""")

    println(io, "</svg>")
    write_svg("distribution-catalog-sixpack.svg", String(take!(io)))
end

# ============================================================
# 43. 並列モンテカルロと乱数設計 (m02-parallel-simulation.js): parallel-rng-streams-speedup.svg
# ============================================================
function gen_parallel_rng_streams_speedup()
    io = IOBuffer()
    print(io, svg_header(760, 308, "スレッド共有RNGの競合による非再現性と、trial_rng(seed, i) による反復単位の決定論的乱数設計"))

    # 左パネル: 共有RNG (NG) vs 反復ごと独立RNG trial_rng(seed, i) (OK)
    println(io, """  <rect x="28" y="34" width="336" height="236" rx="10" fill="#FFFFFF" stroke="$C_AXIS" stroke-width="1.5"/>""")
    println(io, """  <text x="196" y="55" text-anchor="middle" fill="$C_RED" font-size="11.5" font-weight="700" font-family="$FONT_JP">✕ NG：1つの rng と push! をスレッド間で共有</text>""")
    println(io, """  <rect x="46" y="66" width="300" height="62" rx="6" fill="#FBE3E0" stroke="$C_RED" stroke-width="1.2"/>""")
    println(io, """  <text x="196" y="86" text-anchor="middle" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_MONO">rng = Xoshiro(2026); results = Float64[]</text>""")
    println(io, """  <text x="196" y="103" text-anchor="middle" fill="$C_INK" font-size="9.4" font-family="$FONT_JP">Thread 1 と Thread 2 が同じ内部状態を同時更新</text>""")
    println(io, """  <text x="196" y="119" text-anchor="middle" fill="$C_RED" font-size="9.4" font-weight="700" font-family="$FONT_JP">→ 実行のたびに結果が変わり、push! で要素欠落・破損</text>""")

    println(io, """  <text x="196" y="150" text-anchor="middle" fill="$C_GREEN" font-size="11.5" font-weight="700" font-family="$FONT_JP">✓ OK：反復ID i から trial_rng(seed, i) を生成</text>""")
    println(io, """  <rect x="46" y="160" width="300" height="96" rx="6" fill="#E3F3E8" stroke="$C_GREEN" stroke-width="1.2"/>""")
    println(io, """  <text x="196" y="180" text-anchor="middle" fill="$C_GREEN" font-size="9.8" font-weight="700" font-family="$FONT_MONO">trial_rng(seed, i) = Xoshiro(seed, i)</text>""")
    println(io, """  <text x="196" y="198" text-anchor="middle" fill="$C_INK" font-size="9.4" font-family="$FONT_JP">i=1 → out[1],  i=2 → out[2], ..., i=4812 → out[4812]</text>""")
    println(io, """  <text x="196" y="216" text-anchor="middle" fill="$C_GREEN" font-size="9.4" font-weight="700" font-family="$FONT_JP">→ スレッド数が1でも8でも全反復がビット単位で一致！</text>""")
    println(io, """  <text x="196" y="234" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="9.3" font-weight="700" font-family="$FONT_JP">→ 未収束の i=4812 だけを単独で瞬時に再現・デバッグ可能</text>""")

    # 右パネル: スレッド数に対するスピードアップ（スカラー無割当 vs ヒープ割当過多 / BLAS競合）
    bR = PlotBox(434.0, 38.0, 298.0, 214.0, 1.0, 8.0, 0.8, 7.2)
    draw_axes!(io, bR;
        xticks = [1.0, 2.0, 4.0, 6.0, 8.0],
        yticks = [1.0, 2.0, 4.0, 6.0],
        ytick_labels = ["1x", "2x", "4x", "6x"],
        xlabel = "Julia スレッド数 (Threads.nthreads())",
        ylabel = "実行速度倍率 (Speedup)",
        title = "割当ゼロ設計 vs GC・BLAS競合の並列効率",
    )
    ts = [1.0, 2.0, 4.0, 6.0, 8.0]
    sp_ideal = ts
    sp_good  = [1.0, 1.92, 3.65, 5.10, 6.35]
    sp_bad   = [1.0, 1.35, 1.62, 1.48, 1.25]
    p_id = join(["$(f1(px(bR, ts[i]))),$(f1(py(bR, min(sp_ideal[i], 7.0))))" for i in eachindex(ts)], " ")
    p_gd = join(["$(f1(px(bR, ts[i]))),$(f1(py(bR, sp_good[i])))" for i in eachindex(ts)], " ")
    p_bd = join(["$(f1(px(bR, ts[i]))),$(f1(py(bR, sp_bad[i])))" for i in eachindex(ts)], " ")
    println(io, """  <polyline fill="none" stroke="$C_AXIS" stroke-width="1.4" stroke-dasharray="4 3" points="$p_id"/>""")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.6" points="$p_gd"/>""")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.4" points="$p_bd"/>""")
    for i in eachindex(ts)
        println(io, """  <circle cx="$(f1(px(bR, ts[i])))" cy="$(f1(py(bR, sp_good[i])))" r="3.6" fill="$C_GREEN"/>""")
        println(io, """  <circle cx="$(f1(px(bR, ts[i])))" cy="$(f1(py(bR, sp_bad[i])))" r="3.6" fill="$C_RED"/>""")
    end
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_GREEN" font-size="9.5" font-weight="700" font-family="$FONT_JP">緑：独立RNG＋事前確保配列＋BLAS.set_num_threads(1)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 34))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">赤：反復内で大量ヒープ割当 (GC停止) / BLAS多重競合</text>""")

    println(io, "</svg>")
    write_svg("parallel-rng-streams-speedup.svg", String(take!(io)))
end

# ============================================================
# 44. カイ二乗分析・正確検定・対数線形 (m06-chisq-loglinear-exact.js):
#     exact-vs-asymptotic-chisq-loglinear.svg
# ============================================================
function gen_exact_vs_asymptotic_chisq_loglinear()
    # m06 Page 2 の疎な 3×3 表 [1 0 0; 0 5 4; 0 4 5] と完全一致
    obs = [1 0 0; 0 5 4; 0 4 5]
    n_tot = sum(obs)
    r_sums = vec(sum(obs; dims = 2))
    c_sums = vec(sum(obs; dims = 1))
    expected = (r_sums .* c_sums') ./ n_tot
    chi2_obs = sum((obs .- expected) .^ 2 ./ expected)
    asymp_p = ccdf(Chisq(4), chi2_obs)
    @assert round(chi2_obs; digits = 3) == 19.235
    @assert round(asymp_p; digits = 5) == 0.00071

    io = IOBuffer()
    print(io, svg_header(760, 312, "疎な分割表における漸近Chisq(4)近似の偽陽性崩壊（p=0.00071 vs 正確p≈0.052）と対数線形モデル階層"))

    # 左パネル: 漸近 Chisq(4) 密度 vs 周辺固定順列分布の離散質量
    bL = PlotBox(64.0, 38.0, 296.0, 214.0, 0.0, 22.0, 0.0, 0.22)
    draw_axes!(io, bL;
        xticks = [0.0, 5.0, 9.49, 15.0, 19.22],
        xtick_labels = ["0", "5", "9.49", "15", "19.22"],
        yticks = [0.0, 0.10, 0.20],
        ytick_labels = ["0.00", "0.10", "0.20"],
        xlabel = "Pearson χ² 統計量",
        ylabel = "連続密度 / 離散確率質量",
        title = "疎な3×3表 (E₁₁=1/19)：漸近近似 vs 正確分布",
    )
    xs = range(0.1, 22.0; length = 150)
    pts_c = join(["$(f1(px(bL, x))),$(f1(py(bL, pdf(Chisq(4), x))))" for x in xs], " ")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.3" stroke-dasharray="5 3" points="$pts_c"/>""")

    # 観測統計量 χ² = 19.22 (希少セル (1,1) が重なったケース: 正確確率 ≈ 1/19 = 0.0526)
    x_obs = px(bL, chi2_obs)
    y_mass = py(bL, 1.0 / 19.0)
    println(io, """  <line x1="$(f1(x_obs))" y1="$(f1(py(bL, 0.0)))" x2="$(f1(x_obs))" y2="$(f1(y_mass))" stroke="$C_PURPLE_DEEP" stroke-width="5.0"/>""")
    println(io, """  <circle cx="$(f1(x_obs))" cy="$(f1(y_mass))" r="4.8" fill="$C_PURPLE_DEEP"/>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">赤破線 漸近 Chisq(4)：p = 0.00071 (過小評価!)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 34))" fill="$C_PURPLE_DEEP" font-size="9.5" font-weight="700" font-family="$FONT_JP">紫棒 周辺固定正確検定：p ≈ 0.052 (1/19の離散点)</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 50))" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">E=1/19 が分母に入り (O-E)²/E が 17.05 へ膨張</text>""")

    # 右パネル: 3元分割表 A×B×C の対数線形モデル階層と逸脱度 G²
    bR = PlotBox(448.0, 38.0, 284.0, 214.0, 0.0, 48.0, 0.4, 4.6)
    draw_axes!(io, bR;
        xticks = [0.0, 15.0, 30.0, 45.0],
        yticks = [1.0, 2.0, 3.0, 4.0],
        ytick_labels = ["飽和 [ABC]", "一様連関 [AB][BC][AC]", "条件独立 [AC][BC]", "完全独立 [A][B][C]"],
        xlabel = "尤度比逸脱度 G² (小さいほどデータに適合)",
        ylabel = "",
        title = "3元分割表の対数線形モデル階層",
        mono_ticks = false,
    )
    models_ll = [
        (4.0, 44.2, C_RED, "主効果のみ (全連関を無視)"),
        (3.0, 18.6, C_BLUE, "Cで層別するとA⊥B"),
        (2.0, 1.4,  C_GREEN, "共通オッズ比 (3要因交互作用0)"),
        (1.0, 0.0,  C_PURPLE_DEEP, "自由度0 (層ごとにORが変化)"),
    ]
    for (yv, gv, col, note) in models_ll
        yy = py(bR, yv)
        println(io, """  <rect x="$(f1(px(bR, 0.0)))" y="$(f1(yy - 10))" width="$(f1(max(3.0, px(bR, gv) - px(bR, 0.0))))" height="20" rx="3" fill="$col" fill-opacity="0.82"/>""")
        println(io, """  <text x="$(f1(px(bR, gv) + 6))" y="$(f1(yy + 4))" fill="$col" font-size="9.2" font-weight="700" font-family="$FONT_JP">$note</text>""")
    end

    println(io, "</svg>")
    write_svg("exact-vs-asymptotic-chisq-loglinear.svg", String(take!(io)))
end

# ============================================================
# 45. 変数と計算 (l02-variables.js): variables-boxes-operators.svg
# ============================================================
function gen_variables_boxes_operators()
    @assert 120 * 3 == 360
    @assert 7 / 2 == 3.5 && 7 ÷ 2 == 3 && 7 % 2 == 1 && 2^3 == 8

    io = IOBuffer()
    print(io, svg_header(760, 300, "変数への代入による計算の流れとJuliaの演算子（小数除算・整数商・余り・べき乗）の比較"))

    # 左パネル: 変数は「名前つきの箱」と変数どうしの計算
    println(io, """  <rect x="24" y="24" width="340" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="194" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">変数の代入（=）と変数どうしの計算</text>""")

    # price = 120, n = 3
    println(io, """  <rect x="46" y="68" width="126" height="58" rx="8" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.8"/>""")
    println(io, """  <text x="109" y="88" text-anchor="middle" fill="$C_BLUE" font-size="11" font-weight="700" font-family="$FONT_MONO">price = 120</text>""")
    println(io, """  <text x="109" y="112" text-anchor="middle" fill="$C_INK" font-size="16" font-weight="700" font-family="$FONT_MONO">120</text>""")

    println(io, """  <rect x="216" y="68" width="126" height="58" rx="8" fill="#FFFFFF" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="279" y="88" text-anchor="middle" fill="$C_GREEN" font-size="11" font-weight="700" font-family="$FONT_MONO">n = 3</text>""")
    println(io, """  <text x="279" y="112" text-anchor="middle" fill="$C_INK" font-size="16" font-weight="700" font-family="$FONT_MONO">3</text>""")

    println(io, """  <text x="194" y="103" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="18" font-weight="700" font-family="$FONT_MONO">×</text>""")
    println(io, """  <line x1="109" y1="126" x2="174" y2="164" stroke="$C_AXIS" stroke-width="1.6"/>""")
    println(io, """  <line x1="279" y1="126" x2="214" y2="164" stroke="$C_AXIS" stroke-width="1.6"/>""")

    # total = price * n
    println(io, """  <rect x="74" y="166" width="240" height="62" rx="8" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="2.0"/>""")
    println(io, """  <text x="194" y="188" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11.5" font-weight="700" font-family="$FONT_MONO">total = price * n</text>""")
    println(io, """  <text x="194" y="214" text-anchor="middle" fill="$C_INK" font-size="18" font-weight="700" font-family="$FONT_MONO">360</text>""")
    println(io, """  <text x="194" y="254" text-anchor="middle" fill="$C_SUB" font-size="10.2" font-family="$FONT_JP">「=」は右の計算結果を左の箱へ入れる操作</text>""")

    # 右パネル: 割り算 (/, ÷, %) とべき乗 (^)
    println(io, """  <rect x="386" y="24" width="350" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="561" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">Juliaの演算子：/ と ÷ と % と ^ の違い</text>""")

    ops = [
        ("7 / 2", "3.5", "小数のわり算（常にFloat64）", C_BLUE, 70),
        ("7 ÷ 2", "3",   "整数の商（div(7, 2) と同じ）", C_GREEN, 118),
        ("7 % 2", "1",   "整数の余り（7 = 2×3 + 1）", C_ORANGE, 166),
        ("2 ^ 3", "8",   "べき乗（2×2×2、** ではない）", C_PURPLE_DEEP, 214),
    ]
    for (expr, res, desc, col, yy) in ops
        println(io, """  <rect x="404" y="$yy" width="314" height="38" rx="6" fill="#FFFFFF" stroke="$col" stroke-width="1.4"/>""")
        println(io, """  <text x="418" y="$(yy + 24)" fill="$col" font-size="12.5" font-weight="700" font-family="$FONT_MONO">$expr  →  $res</text>""")
        println(io, """  <text x="545" y="$(yy + 23)" fill="$C_INK" font-size="10.2" font-family="$FONT_JP">$desc</text>""")
    end

    println(io, "</svg>")
    write_svg("variables-boxes-operators.svg", String(take!(io)))
end

# ============================================================
# 46. データの型 (l03-types.js): types-float64-underflow.svg
# ============================================================
function gen_types_float64_underflow()
    @assert round(200 * log(0.01); digits = 3) == -921.034

    io = IOBuffer()
    print(io, svg_header(760, 308, "4つの基本型（Int64・Float64・String・Bool）と対数変換によるアンダーフロー回避"))

    # 左パネル: 同じ「3」でも型が違えば役割とメモリ表現が違う
    println(io, """  <rect x="22" y="24" width="332" height="260" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="188" y="46" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">4つの基本型と Float64 の丸め誤差</text>""")

    tcards = [
        ("3",       "Int64",   "整数（個数・番号・ID向きの厳密値）", C_BLUE, 62),
        ("3.5",     "Float64", "64bit小数（isapproxで近似比較）", C_GREEN, 108),
        ("\"こんにちは\"", "String", "文字列（\" \" で囲むテキスト）", C_ORANGE, 154),
        ("true",    "Bool",    "真偽値（true / false の2値）", C_PURPLE_DEEP, 200),
    ]
    for (lit, tp, note, col, yy) in tcards
        println(io, """  <rect x="36" y="$yy" width="304" height="38" rx="6" fill="#FFFFFF" stroke="$col" stroke-width="1.4"/>""")
        println(io, """  <text x="48" y="$(yy + 23)" fill="$col" font-size="11.2" font-weight="700" font-family="$FONT_MONO">$lit :: $tp</text>""")
        println(io, """  <text x="166" y="$(yy + 23)" fill="$C_INK" font-size="9.6" font-family="$FONT_JP">$note</text>""")
    end
    println(io, """  <text x="188" y="264" text-anchor="middle" fill="$C_RED" font-size="10.0" font-weight="700" font-family="$FONT_MONO">0.1 + 0.2 == 0.3 → false / isapprox → true</text>""")

    # 右パネル: n回積 0.01^n の underflow vs n * log(0.01)
    bR = PlotBox(424.0, 38.0, 308.0, 206.0, 0.0, 200.0, -960.0, 40.0)
    draw_axes!(io, bR;
        xticks = [0.0, 50.0, 100.0, 162.0, 200.0],
        yticks = [0.0, -300.0, -600.0, -921.034],
        ytick_labels = ["0", "-300", "-600", "-921.0"],
        xlabel = "試行回数 n (p = 0.01 の独立事象)",
        ylabel = "対数確率 log(pⁿ)",
        title = "先に掛ける (0.01ⁿ) と n≥162 で 0.0 に潰れる",
    )
    ns_all = collect(1:200)
    pts_log = join(["$(f1(px(bR, Float64(n)))),$(f1(py(bR, n * log(0.01))))" for n in ns_all], " ")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.6" points="$pts_log"/>""")

    # 積を先に取ると n=161 付近で Float64 下限 (5e-324) を割り -Inf に落ちる
    pts_prod = String[]
    for n in 1:161
        v = log(0.01^n)
        isfinite(v) && push!(pts_prod, "$(f1(px(bR, Float64(n)))),$(f1(py(bR, v)))")
    end
    push!(pts_prod, "$(f1(px(bR, 162.0))),$(f1(py(bR, -950.0)))")
    push!(pts_prod, "$(f1(px(bR, 200.0))),$(f1(py(bR, -950.0)))")
    println(io, """  <polyline fill="none" stroke="$C_RED" stroke-width="2.2" stroke-dasharray="5 3" points="$(join(pts_prod, " "))"/>""")
    println(io, """  <circle cx="$(f1(px(bR, 200.0)))" cy="$(f1(py(bR, 200 * log(0.01))))" r="4.2" fill="$C_GREEN"/>""")
    println(io, """  <text x="$(f1(bR.x0 + 10))" y="$(f1(bR.y0 + 22))" fill="$C_GREEN" font-size="9.6" font-weight="700" font-family="$FONT_JP">緑実線：n * log(0.01) → n=200 でも -921.034</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 10))" y="$(f1(bR.y0 + 40))" fill="$C_RED" font-size="9.6" font-weight="700" font-family="$FONT_JP">赤破線：log(0.01^n) → 0.01^162 == 0.0 で -Inf!</text>""")

    println(io, "</svg>")
    write_svg("types-float64-underflow.svg", String(take!(io)))
end

# ============================================================
# 47. 文字列 (l04-strings.js): strings-concat-interpolation.svg
# ============================================================
function gen_strings_concat_interpolation()
    name = "佐藤"
    score = 85
    @assert "心理" * "学" == "心理学"
    @assert "$(name)さんの得点は $(score) 点です" == "佐藤さんの得点は 85 点です"
    @assert length("Julia") == 5 && uppercase("julia") == "JULIA"

    io = IOBuffer()
    print(io, svg_header(760, 286, "Juliaの文字列連結（*）と変数埋め込み（\$補間）・文字列関数の図解"))

    # 左パネル: 文字列連結 *
    println(io, """  <rect x="24" y="24" width="336" height="238" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="192" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">① 文字列をつなげる演算子は「*」</text>""")

    println(io, """  <rect x="48" y="72" width="110" height="46" rx="8" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.8"/>""")
    println(io, """  <text x="103" y="100" text-anchor="middle" fill="$C_BLUE" font-size="14" font-weight="700" font-family="$FONT_MONO">"心理"</text>""")
    println(io, """  <text x="184" y="101" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="18" font-weight="700" font-family="$FONT_MONO">*</text>""")
    println(io, """  <rect x="210" y="72" width="110" height="46" rx="8" fill="#FFFFFF" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="265" y="100" text-anchor="middle" fill="$C_GREEN" font-size="14" font-weight="700" font-family="$FONT_MONO">"学"</text>""")

    println(io, """  <rect x="72" y="142" width="240" height="48" rx="8" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="2.0"/>""")
    println(io, """  <text x="192" y="171" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="15" font-weight="700" font-family="$FONT_MONO">"心理学"</text>""")
    println(io, """  <text x="192" y="218" text-anchor="middle" fill="$C_SUB" font-size="10.0" font-family="$FONT_JP">length("Julia") → 5  /  uppercase("julia") → "JULIA"</text>""")
    println(io, """  <text x="192" y="240" text-anchor="middle" fill="$C_RED" font-size="10.0" font-weight="700" font-family="$FONT_JP">注意：+ は数値の足し算用（文字列には * を使う）</text>""")

    # 右パネル: 文字列補間 $(変数)
    println(io, """  <rect x="382" y="24" width="354" height="238" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="559" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">② 文字列補間 \$(変数) で値を埋めこむ</text>""")

    println(io, """  <rect x="408" y="68" width="138" height="44" rx="7" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
    println(io, """  <text x="477" y="95" text-anchor="middle" fill="$C_BLUE" font-size="12" font-weight="700" font-family="$FONT_MONO">name = "佐藤"</text>""")
    println(io, """  <rect x="572" y="68" width="138" height="44" rx="7" fill="#FFFFFF" stroke="$C_GREEN" stroke-width="1.6"/>""")
    println(io, """  <text x="641" y="95" text-anchor="middle" fill="$C_GREEN" font-size="12" font-weight="700" font-family="$FONT_MONO">score = 85</text>""")

    println(io, """  <rect x="398" y="132" width="322" height="44" rx="7" fill="#FFFFFF" stroke="$C_AXIS" stroke-width="1.4"/>""")
    println(io, """  <text x="559" y="159" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_MONO">"\$(name)さんの得点は \$(score) 点です"</text>""")

    println(io, """  <rect x="398" y="194" width="322" height="48" rx="8" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="559" y="223" text-anchor="middle" fill="$C_GREEN" font-size="13.5" font-weight="700" font-family="$FONT_JP">"佐藤さんの得点は 85 点です"</text>""")

    println(io, "</svg>")
    write_svg("strings-concat-interpolation.svg", String(take!(io)))
end

# ============================================================
# 48. 配列 (l05-arrays.js): arrays-1based-indexing-push.svg
# ============================================================
function gen_arrays_1based_indexing_push()
    rt = [512, 498, 634, 402]
    @assert rt[1] == 512 && rt[end] == 402 && sum(rt) == 2046 && length(rt) == 4

    io = IOBuffer()
    print(io, svg_header(760, 296, "Juliaの1始まり配列インデックス（rt[1]〜rt[end]）とpush!による末尾追加"))

    # 左パネル: 1始まり添字と end
    println(io, """  <rect x="24" y="24" width="356" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="202" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">番号は 1 から始まる（rt = [512, 498, 634, 402]）</text>""")

    for (i, v) in enumerate(rt)
        xx = 38 + (i - 1) * 82
        col = (i == 1 || i == 4) ? C_PURPLE_DEEP : C_BLUE
        bg = (i == 1 || i == 4) ? C_PURPLE_SOFT : "#FFFFFF"
        println(io, """  <text x="$(xx + 36)" y="78" text-anchor="middle" fill="$col" font-size="11" font-weight="700" font-family="$FONT_MONO">rt[$i]</text>""")
        println(io, """  <rect x="$xx" y="86" width="72" height="54" rx="7" fill="$bg" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 36)" y="119" text-anchor="middle" fill="$C_INK" font-size="15" font-weight="700" font-family="$FONT_MONO">$v</text>""")
    end
    println(io, """  <text x="74" y="160" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.2" font-weight="700" font-family="$FONT_JP">先頭 rt[1]</text>""")
    println(io, """  <text x="320" y="160" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.2" font-weight="700" font-family="$FONT_JP">末尾 rt[end]</text>""")

    println(io, """  <rect x="42" y="182" width="320" height="68" rx="8" fill="#FFFFFF" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="202" y="206" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_MONO">sum(rt) == 2046  /  length(rt) == 4</text>""")
    println(io, """  <text x="202" y="232" text-anchor="middle" fill="$C_SUB" font-size="10.0" font-family="$FONT_JP">Rと同じ1始まり（Pythonの0始まりと混同しない）</text>""")

    # 右パネル: push!(rt, 555)
    println(io, """  <rect x="398" y="24" width="338" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="567" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">push!(rt, 555)：末尾に要素を追加する</text>""")

    println(io, """  <text x="418" y="80" fill="$C_SUB" font-size="10.5" font-weight="700" font-family="$FONT_JP">追加前: rt = [512, 498]</text>""")
    for (i, v) in enumerate([512, 498])
        xx = 418 + (i - 1) * 82
        println(io, """  <rect x="$xx" y="90" width="72" height="44" rx="6" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
        println(io, """  <text x="$(xx + 36)" y="117" text-anchor="middle" fill="$C_INK" font-size="14" font-weight="700" font-family="$FONT_MONO">$v</text>""")
    end

    println(io, """  <text x="418" y="164" fill="$C_GREEN" font-size="11" font-weight="700" font-family="$FONT_MONO">↓ push!(rt, 555)   # ! は中身を書きかえる目印</text>""")
    for (i, v) in enumerate([512, 498, 555])
        xx = 418 + (i - 1) * 82
        col = i == 3 ? C_GREEN : C_BLUE
        bg = i == 3 ? C_GREEN_SOFT : "#FFFFFF"
        println(io, """  <rect x="$xx" y="176" width="72" height="48" rx="6" fill="$bg" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 36)" y="206" text-anchor="middle" fill="$C_INK" font-size="14" font-weight="700" font-family="$FONT_MONO">$v</text>""")
    end
    println(io, """  <text x="688" y="205" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">← 新要素</text>""")

    println(io, "</svg>")
    write_svg("arrays-1based-indexing-push.svg", String(take!(io)))
end

# ============================================================
# 49. 条件分岐 (l06-conditionals.js): conditionals-branching-flow.svg
# ============================================================
function gen_conditionals_branching_flow()
    score = 75
    grade = score >= 80 ? "A" : score >= 60 ? "B" : "C"
    @assert grade == "B"

    io = IOBuffer()
    print(io, svg_header(760, 296, "if / elseif / else による上から順の条件分岐フローと数直線上の判定境界"))

    # 左パネル: 上から順に判定するフロー
    println(io, """  <rect x="24" y="22" width="356" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="202" y="46" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">score = 75 の判定フロー（上から順に評価）</text>""")

    # Step 1: if score >= 80
    println(io, """  <rect x="44" y="64" width="184" height="42" rx="7" fill="#FFFFFF" stroke="$C_AXIS" stroke-width="1.5"/>""")
    println(io, """  <text x="136" y="90" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_MONO">if score >= 80</text>""")
    println(io, """  <text x="246" y="89" fill="$C_SUB" font-size="10.5" font-family="$FONT_MONO">→ trueなら "A"</text>""")
    println(io, """  <text x="136" y="122" text-anchor="middle" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">↓ false（75は80未満）</text>""")

    # Step 2: elseif score >= 60
    println(io, """  <rect x="44" y="130" width="184" height="44" rx="7" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="2.0"/>""")
    println(io, """  <text x="136" y="157" text-anchor="middle" fill="$C_GREEN" font-size="11.5" font-weight="700" font-family="$FONT_MONO">elseif score >= 60</text>""")
    println(io, """  <rect x="252" y="132" width="110" height="40" rx="7" fill="$C_GREEN" stroke="$C_GREEN" stroke-width="1.5"/>""")
    println(io, """  <text x="307" y="157" text-anchor="middle" fill="#FFFFFF" font-size="12" font-weight="700" font-family="$FONT_MONO">true → "B" ✓</text>""")

    # Step 3: else ... end
    println(io, """  <rect x="44" y="196" width="184" height="38" rx="7" fill="#FFFFFF" stroke="$C_GRID" stroke-width="1.3"/>""")
    println(io, """  <text x="136" y="220" text-anchor="middle" fill="$C_SUB" font-size="11.0" font-family="$FONT_MONO">else → "C"  /  end</text>""")
    println(io, """  <text x="202" y="256" text-anchor="middle" fill="$C_INK" font-size="10.0" font-family="$FONT_JP">最初に true になった枝だけを実行し、end で抜ける</text>""")

    # 右パネル: 数直線と = vs ==
    println(io, """  <rect x="398" y="22" width="338" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="567" y="46" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">数直線で見る境界と「=」vs「==」</text>""")

    println(io, """  <rect x="420" y="82" width="130" height="36" rx="5" fill="$C_RED_SOFT" stroke="$C_RED" stroke-width="1.4"/>""")
    println(io, """  <text x="485" y="105" text-anchor="middle" fill="$C_RED" font-size="11.5" font-weight="700" font-family="$FONT_JP">"C" (60未満)</text>""")
    println(io, """  <rect x="554" y="82" width="86" height="36" rx="5" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="597" y="105" text-anchor="middle" fill="$C_GREEN" font-size="11.5" font-weight="700" font-family="$FONT_JP">"B" (60..79)</text>""")
    println(io, """  <rect x="644" y="82" width="72" height="36" rx="5" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="1.4"/>""")
    println(io, """  <text x="680" y="105" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11.5" font-weight="700" font-family="$FONT_JP">"A" (80+)</text>""")

    println(io, """  <circle cx="618" cy="100" r="5" fill="$C_GREEN"/>""")
    println(io, """  <text x="618" y="74" text-anchor="middle" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_MONO">score=75</text>""")

    println(io, """  <rect x="418" y="148" width="298" height="104" rx="8" fill="#FFFFFF" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="434" y="174" fill="$C_BLUE" font-size="11.5" font-weight="700" font-family="$FONT_MONO">x = 10   # 代入（箱に10を入れる）</text>""")
    println(io, """  <text x="434" y="200" fill="$C_PURPLE_DEEP" font-size="11.5" font-weight="700" font-family="$FONT_MONO">x == 10  # 比較（等しいか調べ true/false）</text>""")
    println(io, """  <text x="434" y="226" fill="$C_GREEN" font-size="11.2" font-weight="700" font-family="$FONT_MONO">age >= 18 &amp;&amp; age &lt; 65  # かつ (&&)</text>""")

    println(io, "</svg>")
    write_svg("conditionals-branching-flow.svg", String(take!(io)))
end

# ============================================================
# 50. くり返し (l07-loops.js): loops-accumulator-trace.svg
# ============================================================
function gen_loops_accumulator_trace()
    data = [2, 4, 6]
    total = 0
    hist = Int[]
    for d in data
        total += d
        push!(hist, total)
    end
    @assert hist == [2, 6, 12]

    io = IOBuffer()
    print(io, svg_header(760, 296, "forループによる配列要素の順次走査と合計変数 total への累積過程"))

    # 左パネル: total += d のステップ追跡
    bL = PlotBox(64.0, 38.0, 300.0, 206.0, 0.0, 3.3, 0.0, 14.0)
    draw_axes!(io, bL;
        xticks = [0.0, 1.0, 2.0, 3.0],
        xtick_labels = ["初期", "d=2", "d=4", "d=6"],
        yticks = [0.0, 2.0, 6.0, 12.0],
        ytick_labels = ["0", "2", "6", "12"],
        xlabel = "for d in [2, 4, 6] の反復ステップ",
        ylabel = "累積合計 total",
        title = "total = 0 から total += d で足しこむ",
        mono_ticks = false,
    )
    steps_xy = [(0.0, 0.0), (1.0, 2.0), (2.0, 6.0), (3.0, 12.0)]
    pts = join(["$(f1(px(bL, x))),$(f1(py(bL, y)))" for (x, y) in steps_xy], " ")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.6" points="$pts"/>""")
    for (x, y) in steps_xy
        println(io, """  <circle cx="$(f1(px(bL, x)))" cy="$(f1(py(bL, y)))" r="4.8" fill="$C_PURPLE_DEEP"/>""")
        println(io, """  <text x="$(f1(px(bL, x)))" y="$(f1(py(bL, y) - 9))" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_MONO">$(Int(y))</text>""")
    end

    # 右パネル: println(i) vs print(i)
    println(io, """  <rect x="406" y="28" width="330" height="236" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="571" y="52" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">println(i) と print(i) の出力の違い</text>""")

    println(io, """  <rect x="424" y="70" width="140" height="168" rx="8" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
    println(io, """  <text x="494" y="92" text-anchor="middle" fill="$C_BLUE" font-size="11" font-weight="700" font-family="$FONT_MONO">println(i)</text>""")
    println(io, """  <text x="494" y="112" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">毎回改行する</text>""")
    println(io, """  <text x="494" y="144" text-anchor="middle" fill="$C_INK" font-size="15" font-weight="700" font-family="$FONT_MONO">1</text>""")
    println(io, """  <text x="494" y="174" text-anchor="middle" fill="$C_INK" font-size="15" font-weight="700" font-family="$FONT_MONO">2</text>""")
    println(io, """  <text x="494" y="204" text-anchor="middle" fill="$C_INK" font-size="15" font-weight="700" font-family="$FONT_MONO">3</text>""")

    println(io, """  <rect x="580" y="70" width="140" height="168" rx="8" fill="#FFFFFF" stroke="$C_GREEN" stroke-width="1.6"/>""")
    println(io, """  <text x="650" y="92" text-anchor="middle" fill="$C_GREEN" font-size="11" font-weight="700" font-family="$FONT_MONO">print(i)</text>""")
    println(io, """  <text x="650" y="112" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">改行せず横につながる</text>""")
    println(io, """  <text x="650" y="168" text-anchor="middle" fill="$C_INK" font-size="18" font-weight="700" font-family="$FONT_MONO">123</text>""")

    println(io, "</svg>")
    write_svg("loops-accumulator-trace.svg", String(take!(io)))
end

# ============================================================
# 51. 関数 (l08-functions.js): functions-input-return-curve.svg
# ============================================================
function gen_functions_input_return_curve()
    double_fn(x) = 2 * x
    f_short(x) = x^2 + 1
    @assert double_fn(5) == 10 && double_fn(double_fn(3)) == 12 && f_short(3) == 10

    io = IOBuffer()
    print(io, svg_header(760, 298, "関数の引数・returnによる値の返却と1行短縮形 f(x) = x^2 + 1 の対応"))

    # 左パネル: 引数 x → 関数本体 → return 返り値
    println(io, """  <rect x="24" y="24" width="344" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="196" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">引数を受け取り、return で計算結果を返す</text>""")

    println(io, """  <rect x="42" y="78" width="76" height="48" rx="7" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.8"/>""")
    println(io, """  <text x="80" y="98" text-anchor="middle" fill="$C_BLUE" font-size="10" font-weight="700" font-family="$FONT_JP">引数 x</text>""")
    println(io, """  <text x="80" y="117" text-anchor="middle" fill="$C_INK" font-size="14" font-weight="700" font-family="$FONT_MONO">5</text>""")

    println(io, """  <rect x="136" y="68" width="120" height="68" rx="8" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="2.0"/>""")
    println(io, """  <text x="196" y="92" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11" font-weight="700" font-family="$FONT_MONO">double(x)</text>""")
    println(io, """  <text x="196" y="116" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_MONO">return 2 * x</text>""")

    println(io, """  <rect x="274" y="78" width="78" height="48" rx="7" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="313" y="98" text-anchor="middle" fill="$C_GREEN" font-size="10" font-weight="700" font-family="$FONT_JP">返り値</text>""")
    println(io, """  <text x="313" y="117" text-anchor="middle" fill="$C_GREEN" font-size="15" font-weight="700" font-family="$FONT_MONO">10</text>""")

    println(io, """  <rect x="42" y="164" width="310" height="84" rx="8" fill="#FFFFFF" stroke="$C_GRID" stroke-width="1.3"/>""")
    println(io, """  <text x="197" y="188" text-anchor="middle" fill="$C_INK" font-size="11.2" font-weight="700" font-family="$FONT_JP">入れ子の呼び出し（内側から順番に計算）</text>""")
    println(io, """  <text x="197" y="214" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="12" font-weight="700" font-family="$FONT_MONO">double(double(3)) → double(6) → 12</text>""")
    println(io, """  <text x="197" y="236" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">返り値があるから、次の関数の入力へそのままつなげる</text>""")

    # 右パネル: 1行関数 f(x) = x^2 + 1
    bR = PlotBox(434.0, 38.0, 298.0, 206.0, 0.0, 4.0, 0.0, 18.0)
    draw_axes!(io, bR;
        xticks = [0.0, 1.0, 2.0, 3.0, 4.0],
        yticks = [1.0, 5.0, 10.0, 17.0],
        ytick_labels = ["1", "5", "10", "17"],
        xlabel = "入力 x",
        ylabel = "出力 f(x) = x² + 1",
        title = "1行短縮形：f(x) = x^2 + 1",
    )
    xs = range(0.0, 4.0; length = 80)
    pts = join(["$(f1(px(bR, x))),$(f1(py(bR, f_short(x))))" for x in xs], " ")
    println(io, """  <polyline fill="none" stroke="$C_BLUE" stroke-width="2.5" points="$pts"/>""")
    for xv in 0:4
        yv = f_short(Float64(xv))
        col = xv == 3 ? C_PURPLE_DEEP : C_BLUE
        r = xv == 3 ? 5.2 : 3.6
        println(io, """  <circle cx="$(f1(px(bR, Float64(xv))))" cy="$(f1(py(bR, yv)))" r="$r" fill="$col"/>""")
    end
    println(io, """  <text x="$(f1(px(bR, 3.0) - 8))" y="$(f1(py(bR, 10.0) - 10))" text-anchor="end" fill="$C_PURPLE_DEEP" font-size="11" font-weight="700" font-family="$FONT_MONO">f(3) = 10</text>""")

    println(io, "</svg>")
    write_svg("functions-input-return-curve.svg", String(take!(io)))
end

# ============================================================
# 52. データ解析に挑戦 (l09-analysis.js): first-rt-analysis-outliers.svg
# ============================================================
function gen_first_rt_analysis_outliers()
    rt1 = [512.5, 498.2, 634.8, 402.1, 550.4]
    @assert round(mean(rt1); digits = 2) == 519.6
    @assert round(std(rt1); digits = 2) == 84.46
    @assert maximum(rt1) == 634.8 && minimum(rt1) == 402.1

    rt2 = [512.5, 1250.0, 498.2, 1600.3, 550.4]
    @assert count(>(1000.0), rt2) == 2

    io = IOBuffer()
    print(io, svg_header(760, 304, "反応時間データの平均・標準偏差・最小最大と 1000 ms 閾値による外れ値試行の検出"))

    # 左パネル: 5試行の mean, std, min, max
    bL = PlotBox(64.0, 38.0, 294.0, 210.0, 0.5, 5.5, 360.0, 680.0)
    draw_axes!(io, bL;
        xticks = [1.0, 2.0, 3.0, 4.0, 5.0],
        xtick_labels = ["T1", "T2", "T3", "T4", "T5"],
        yticks = [402.1, 519.6, 634.8],
        ytick_labels = ["402.1", "519.6", "634.8"],
        xlabel = "試行番号 (rt)",
        ylabel = "反応時間 (ms)",
        title = "① 平均 519.6 ms・SD 84.46 ms・最小/最大",
        mono_ticks = false,
    )
    m1 = mean(rt1)
    s1 = std(rt1)
    println(io, """  <rect x="$(f1(bL.x0))" y="$(f1(py(bL, m1 + s1)))" width="$(f1(bL.w))" height="$(f1(py(bL, m1 - s1) - py(bL, m1 + s1)))" fill="$C_PURPLE_SOFT" fill-opacity="0.7"/>""")
    println(io, """  <line x1="$(f1(bL.x0))" y1="$(f1(py(bL, m1)))" x2="$(f1(bL.x0 + bL.w))" y2="$(f1(py(bL, m1)))" stroke="$C_PURPLE_DEEP" stroke-width="2.0" stroke-dasharray="5 3"/>""")
    for (i, v) in enumerate(rt1)
        col = v == maximum(rt1) ? C_ORANGE : (v == minimum(rt1) ? C_GREEN : C_BLUE)
        println(io, """  <circle cx="$(f1(px(bL, Float64(i))))" cy="$(f1(py(bL, v)))" r="4.8" fill="$col"/>""")
        println(io, """  <text x="$(f1(px(bL, Float64(i))))" y="$(f1(py(bL, v) - 9))" text-anchor="middle" fill="$col" font-size="9.5" font-weight="700" font-family="$FONT_MONO">$v</text>""")
    end
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_PURPLE_DEEP" font-size="9.4" font-weight="700" font-family="$FONT_JP">帯：平均 ± 1 SD (519.6 ± 84.46 ms)</text>""")

    # 右パネル: t > 1000 ms の外れ値カウント (2件)
    bR = PlotBox(436.0, 38.0, 296.0, 210.0, 0.5, 5.5, 300.0, 1750.0)
    draw_axes!(io, bR;
        xticks = [1.0, 2.0, 3.0, 4.0, 5.0],
        xtick_labels = ["T1", "T2", "T3", "T4", "T5"],
        yticks = [500.0, 1000.0, 1500.0],
        ytick_labels = ["500", "1000", "1500"],
        xlabel = "試行番号",
        ylabel = "反応時間 (ms)",
        title = "② if t > 1000 で外れ値を数える（2件）",
        mono_ticks = false,
    )
    println(io, """  <line x1="$(f1(bR.x0))" y1="$(f1(py(bR, 1000.0)))" x2="$(f1(bR.x0 + bR.w))" y2="$(f1(py(bR, 1000.0)))" stroke="$C_RED" stroke-width="2.0" stroke-dasharray="5 3"/>""")
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(py(bR, 1000.0) - 7))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_MONO">基準線: t > 1000 ms</text>""")
    for (i, v) in enumerate(rt2)
        is_slow = v > 1000.0
        col = is_slow ? C_RED : C_BLUE
        println(io, """  <circle cx="$(f1(px(bR, Float64(i))))" cy="$(f1(py(bR, v)))" r="5.0" fill="$col"/>""")
        println(io, """  <text x="$(f1(px(bR, Float64(i))))" y="$(f1(py(bR, v) - 9))" text-anchor="middle" fill="$col" font-size="9.5" font-weight="700" font-family="$FONT_MONO">$v</text>""")
    end
    println(io, """  <text x="$(f1(bR.x0 + 8))" y="$(f1(bR.y0 + 18))" fill="$C_RED" font-size="9.6" font-weight="700" font-family="$FONT_JP">赤点2件（1250.0, 1600.3）→ 外れ値: 2 件</text>""")

    println(io, "</svg>")
    write_svg("first-rt-analysis-outliers.svg", String(take!(io)))
end

# ============================================================
# 53. Juliaを手元に入れる (l10-install.js): repl-modes-and-function-scope.svg
# ============================================================
function gen_repl_modes_and_function_scope()
    total_of(data) = begin
        total = 0
        for d in data
            total += d
        end
        total
    end
    @assert total_of([2, 4, 6]) == 12

    io = IOBuffer()
    print(io, svg_header(760, 296, "REPLのモード切替（julia> と pkg>）およびファイル実行でも壊れない関数スコープの設計"))

    # 左パネル: REPLとパッケージモード
    println(io, """  <rect x="24" y="24" width="344" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="196" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">① REPLのモード切り替え（] と Backspace）</text>""")

    println(io, """  <rect x="44" y="68" width="304" height="62" rx="8" fill="#FFFFFF" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="60" y="92" fill="$C_GREEN" font-size="12" font-weight="700" font-family="$FONT_MONO">julia&gt; 1 + 1</text>""")
    println(io, """  <text x="60" y="114" fill="$C_INK" font-size="10.2" font-family="$FONT_JP">通常モード：計算・using Pluto・Pluto.run()</text>""")

    println(io, """  <text x="128" y="152" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_MONO">↓ 「 ] 」キーを押す</text>""")
    println(io, """  <text x="272" y="152" text-anchor="middle" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_MONO">↑ Backspace で戻る</text>""")

    println(io, """  <rect x="44" y="166" width="304" height="62" rx="8" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="1.8"/>""")
    println(io, """  <text x="60" y="190" fill="$C_PURPLE_DEEP" font-size="12" font-weight="700" font-family="$FONT_MONO">(@v1.12) pkg&gt; add Pluto</text>""")
    println(io, """  <text x="60" y="212" fill="$C_INK" font-size="10.2" font-family="$FONT_JP">パッケージモード：CSV や DataFrames の追加</text>""")
    println(io, """  <text x="196" y="252" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">終了は julia&gt; で exit() または Ctrl+D</text>""")

    # 右パネル: REPL/Pluto vs .jl ファイル実行（関数に包む）
    println(io, """  <rect x="388" y="24" width="348" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="562" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">② 処理を function に包めばどこでも同じ結果</text>""")

    println(io, """  <rect x="406" y="68" width="312" height="72" rx="8" fill="$C_RED_SOFT" stroke="$C_RED" stroke-width="1.5"/>""")
    println(io, """  <text x="420" y="90" fill="$C_RED" font-size="10.8" font-weight="700" font-family="$FONT_JP">✕ ファイル直書きのループ更新（julia test.jl）</text>""")
    println(io, """  <text x="420" y="110" fill="$C_INK" font-size="10.2" font-family="$FONT_MONO">total = 0; for d in data total += d end</text>""")
    println(io, """  <text x="420" y="128" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_MONO">→ UndefVarError: `total` not defined in local scope</text>""")

    println(io, """  <rect x="406" y="156" width="312" height="96" rx="8" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="420" y="178" fill="$C_GREEN" font-size="10.8" font-weight="700" font-family="$FONT_JP">✓ 関数に包む（REPL・Pluto・ファイルすべてOK）</text>""")
    println(io, """  <text x="420" y="198" fill="$C_INK" font-size="10.2" font-family="$FONT_MONO">function total_of(data) ... return total end</text>""")
    println(io, """  <text x="420" y="218" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_MONO">total_of([2, 4, 6]) → 12（高速かつ安全）</text>""")
    println(io, """  <text x="420" y="240" fill="$C_SUB" font-size="9.6" font-family="$FONT_JP">後の「型安定性とメモリ割当」でも関数化が高速化の鍵になる</text>""")

    println(io, "</svg>")
    write_svg("repl-modes-and-function-scope.svg", String(take!(io)))
end

# ============================================================
# 54. ドット記法 (l11-broadcast.js): broadcast-elementwise-pipeline.svg
# ============================================================
function gen_broadcast_elementwise_pipeline()
    rt = [500.0, 520.0, 540.0]
    @assert rt ./ 1000 == [0.5, 0.52, 0.54]
    @assert rt .- mean(rt) == [-20.0, 0.0, 20.0]

    io = IOBuffer()
    print(io, svg_header(760, 296, "ドット記法（.+・sqrt.・.- mean(rt)）による配列要素ごとの一括変換と中心化"))

    # 左パネル: 要素ごとの一括放送
    println(io, """  <rect x="24" y="24" width="352" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="200" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">① ドット「.」は全要素へ計算を放送する合図</text>""")

    in_vals = [1, 4, 9]
    out_vals = [1.0, 2.0, 3.0]
    for i in 1:3
        yy = 72 + (i - 1) * 56
        println(io, """  <rect x="46" y="$yy" width="76" height="38" rx="6" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
        println(io, """  <text x="84" y="$(yy + 24)" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_MONO">$(in_vals[i])</text>""")
        println(io, """  <text x="196" y="$(yy + 24)" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11.5" font-weight="700" font-family="$FONT_MONO">── sqrt.(x) ──▶</text>""")
        println(io, """  <rect x="270" y="$yy" width="84" height="38" rx="6" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
        println(io, """  <text x="312" y="$(yy + 24)" text-anchor="middle" fill="$C_GREEN" font-size="13" font-weight="700" font-family="$FONT_MONO">$(out_vals[i])</text>""")
    end
    println(io, """  <text x="200" y="252" text-anchor="middle" fill="$C_SUB" font-size="10.0" font-family="$FONT_JP">演算子は前（.+  ./）、関数は後ろ（sqrt.  log.）にドット</text>""")

    # 右パネル: rt .- mean(rt) による平均中心化
    bR = PlotBox(438.0, 38.0, 294.0, 206.0, 0.5, 3.5, -30.0, 30.0)
    draw_axes!(io, bR;
        xticks = [1.0, 2.0, 3.0],
        xtick_labels = ["500 ms", "520 ms", "540 ms"],
        yticks = [-20.0, 0.0, 20.0],
        ytick_labels = ["-20.0", "0.0", "+20.0"],
        xlabel = "元の反応時間 rt（平均 520.0 ms）",
        ylabel = "平均からのずれ rt .- mean(rt)",
        title = "② rt .- mean(rt) で平均からのずれを1行計算",
        mono_ticks = false,
    )
    println(io, """  <line x1="$(f1(bR.x0))" y1="$(f1(py(bR, 0.0)))" x2="$(f1(bR.x0 + bR.w))" y2="$(f1(py(bR, 0.0)))" stroke="$C_AXIS" stroke-width="1.4" stroke-dasharray="4 3"/>""")
    devs = [-20.0, 0.0, 20.0]
    for i in 1:3
        xx = px(bR, Float64(i))
        yy = py(bR, devs[i])
        y0 = py(bR, 0.0)
        println(io, """  <line x1="$(f1(xx))" y1="$(f1(y0))" x2="$(f1(xx))" y2="$(f1(yy))" stroke="$C_PURPLE_DEEP" stroke-width="2.6"/>""")
        println(io, """  <circle cx="$(f1(xx))" cy="$(f1(yy))" r="5.0" fill="$C_PURPLE_DEEP"/>""")
        println(io, """  <text x="$(f1(xx + 10))" y="$(f1(yy + 4))" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_MONO">$(devs[i])</text>""")
    end

    println(io, "</svg>")
    write_svg("broadcast-elementwise-pipeline.svg", String(take!(io)))
end

# ============================================================
# 55. 辞書と欠損値 (l12-dict-missing.js): dict-lookup-skipmissing.svg
# ============================================================
function gen_dict_lookup_skipmissing()
    cond_name = Dict("cong" => "一致", "incong" => "不一致")
    @assert cond_name["incong"] == "不一致"
    x = [500.0, missing, 540.0]
    @assert ismissing(mean(x))
    @assert mean(skipmissing(x)) == 520.0

    io = IOBuffer()
    print(io, svg_header(760, 296, "Dict（キーと値の対応表）と欠損値 missing の伝播・skipmissing による除外計算"))

    # 左パネル: Dict("cong" => "一致", "incong" => "不一致")
    println(io, """  <rect x="24" y="24" width="336" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="192" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">① 辞書 Dict：番号ではなく「キー」で引く</text>""")

    for (yy, k, v, col) in [(78, "\"cong\"", "\"一致\"", C_BLUE), (138, "\"incong\"", "\"不一致\"", C_PURPLE_DEEP)]
        println(io, """  <rect x="46" y="$yy" width="112" height="42" rx="7" fill="#FFFFFF" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="102" y="$(yy + 26)" text-anchor="middle" fill="$col" font-size="12" font-weight="700" font-family="$FONT_MONO">$k</text>""")
        println(io, """  <text x="190" y="$(yy + 26)" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_MONO">=&gt;</text>""")
        println(io, """  <rect x="220" y="$yy" width="118" height="42" rx="7" fill="$C_PURPLE_SOFT" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="279" y="$(yy + 26)" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_JP">$v</text>""")
    end
    println(io, """  <text x="192" y="216" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11.2" font-weight="700" font-family="$FONT_MONO">cond_name["incong"]  →  "不一致"</text>""")
    println(io, """  <text x="192" y="244" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">条件コードから表示ラベルへの変換や設定管理に活躍</text>""")

    # 右パネル: x = [500.0, missing, 540.0] の 3通りの結果比較
    println(io, """  <rect x="380" y="24" width="356" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="558" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">② x = [500.0, missing, 540.0] の平均計算</text>""")

    cards = [
        ("mean(x)", "missing", "欠損が伝染（黙って無視しない）", C_ORANGE, "#FFF8EC", 68),
        ("mean(skipmissing(x))", "520.0", "✓ 欠損を除いた2件の正しい平均", C_GREEN, C_GREEN_SOFT, 132),
        ("誤って missing を 0 に置換", "346.7", "✕ (500+0+540)/3 で平均が大きく歪む!", C_RED, C_RED_SOFT, 196),
    ]
    for (expr, res, desc, col, bg, yy) in cards
        println(io, """  <rect x="398" y="$yy" width="320" height="52" rx="7" fill="$bg" stroke="$col" stroke-width="1.6"/>""")
        println(io, """  <text x="412" y="$(yy + 21)" fill="$col" font-size="11.2" font-weight="700" font-family="$FONT_MONO">$expr  →  $res</text>""")
        println(io, """  <text x="412" y="$(yy + 41)" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">$desc</text>""")
    end

    println(io, "</svg>")
    write_svg("dict-lookup-skipmissing.svg", String(take!(io)))
end

# ============================================================
# 56. 内包表記 (l13-comprehension.js): comprehension-filter-map.svg
# ============================================================
function gen_comprehension_filter_map()
    @assert [x^2 for x in 1:5] == [1, 4, 9, 16, 25]
    rt = [512.5, 498.2, 550.4, 601.3]
    @assert [x for x in rt if x > 520] == [550.4, 601.3]

    io = IOBuffer()
    print(io, svg_header(760, 296, "内包表記 [式 for 変数 in 範囲 if 条件] による1行での配列生成と条件抽出"))

    # 左パネル: [x^2 for x in 1:5]
    println(io, """  <rect x="24" y="24" width="340" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="194" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① 基本形：[x^2 for x in 1:5]</text>""")

    for (i, x) in enumerate(1:5)
        xx = 42 + (i - 1) * 62
        println(io, """  <rect x="$xx" y="72" width="52" height="36" rx="6" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.5"/>""")
        println(io, """  <text x="$(xx + 26)" y="95" text-anchor="middle" fill="$C_BLUE" font-size="12" font-weight="700" font-family="$FONT_MONO">$x</text>""")
        println(io, """  <text x="$(xx + 26)" y="130" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11" font-weight="700" font-family="$FONT_MONO">↓ x²</text>""")
        println(io, """  <rect x="$xx" y="144" width="52" height="40" rx="6" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 26)" y="169" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="13" font-weight="700" font-family="$FONT_MONO">$(x^2)</text>""")
    end
    println(io, """  <text x="194" y="220" text-anchor="middle" fill="$C_INK" font-size="10.8" font-weight="700" font-family="$FONT_MONO">["s" * string(i) for i in 1:3] → ["s1", "s2", "s3"]</text>""")
    println(io, """  <text x="194" y="246" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">空配列を作って push! するループを1行で書ける</text>""")

    # 右パネル: [x for x in rt if x > 520]
    println(io, """  <rect x="384" y="24" width="352" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="560" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">② 条件つき：[x for x in rt if x &gt; 520]</text>""")

    for (i, v) in enumerate(rt)
        yy = 68 + (i - 1) * 44
        keep = v > 520.0
        col = keep ? C_GREEN : C_SUB
        bg = keep ? C_GREEN_SOFT : "#FFFFFF"
        verdict = keep ? "true  → 採用 ($v)" : "false → 除外"
        println(io, """  <rect x="404" y="$yy" width="104" height="34" rx="6" fill="#FFFFFF" stroke="$col" stroke-width="1.5"/>""")
        println(io, """  <text x="456" y="$(yy + 22)" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_MONO">$v</text>""")
        println(io, """  <rect x="524" y="$yy" width="192" height="34" rx="6" fill="$bg" stroke="$col" stroke-width="1.5"/>""")
        println(io, """  <text x="620" y="$(yy + 22)" text-anchor="middle" fill="$col" font-size="10.8" font-weight="700" font-family="$FONT_MONO">$verdict</text>""")
    end
    println(io, """  <text x="560" y="254" text-anchor="middle" fill="$C_GREEN" font-size="11.2" font-weight="700" font-family="$FONT_MONO">結果: [550.4, 601.3]（語順は for ... if の順）</text>""")

    println(io, "</svg>")
    write_svg("comprehension-filter-map.svg", String(take!(io)))
end

# ============================================================
# 57. CSV.jl & DataFrames.jl 入門 (l14-dataframes.js): dataframe-select-subset.svg
# ============================================================
function gen_dataframe_select_subset()
    io = IOBuffer()
    print(io, svg_header(760, 300, "DataFrameにおける列の選択（select）と条件による行の絞り込み（df[df.rt .> 600, :]）の対比"))

    # 左パネル: 列を選ぶ select(df, :id, :rt)
    println(io, """  <rect x="24" y="24" width="342" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="195" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① 列（縦方向）を選ぶ：select(df, :id, :rt)</text>""")

    cols = [(":id", true), (":cond", false), (":rt", true), (":correct", false)]
    rows = [
        ("P01", "cong", "512.5", "true"),
        ("P01", "cong", "498.2", "true"),
        ("P01", "incong", "560.4", "true"),
    ]
    for (j, (cname, sel)) in enumerate(cols)
        xx = 42 + (j - 1) * 76
        col = sel ? C_PURPLE_DEEP : C_SUB
        bg = sel ? C_PURPLE_SOFT : "#FFFFFF"
        op = sel ? "1.0" : "0.45"
        println(io, """  <rect x="$xx" y="66" width="70" height="32" rx="5" fill="$bg" stroke="$col" stroke-width="1.8" opacity="$op"/>""")
        println(io, """  <text x="$(xx + 35)" y="87" text-anchor="middle" fill="$col" font-size="11" font-weight="700" font-family="$FONT_MONO" opacity="$op">$cname</text>""")
        for (i, r) in enumerate(rows)
            yy = 104 + (i - 1) * 36
            println(io, """  <rect x="$xx" y="$yy" width="70" height="30" rx="4" fill="$bg" stroke="$col" stroke-width="1.2" opacity="$op"/>""")
            println(io, """  <text x="$(xx + 35)" y="$(yy + 20)" text-anchor="middle" fill="$C_INK" font-size="10.5" font-family="$FONT_MONO" opacity="$op">$(r[j])</text>""")
        end
    end
    println(io, """  <text x="195" y="238" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_JP">:id と :rt のようにコロン付きシンボルで列を指す</text>""")
    println(io, """  <text x="195" y="258" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_MONO">1列を配列で取り出すなら df.rt</text>""")

    # 右パネル: 行を絞り込む df[df.rt .> 600, :]
    println(io, """  <rect x="386" y="24" width="350" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="561" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">② 行（横方向）を絞る：df[df.rt .&gt; 600, :]</text>""")

    rows_r = [
        ("P01", "cong",   "512.5", "true",  false),
        ("P01", "incong", "601.3", "false", true),
        ("P02", "cong",   "535.0", "true",  false),
        ("P02", "incong", "624.9", "true",  true),
    ]
    for (i, (idv, cv, rtv, corv, keep)) in enumerate(rows_r)
        yy = 68 + (i - 1) * 38
        col = keep ? C_GREEN : C_SUB
        bg = keep ? C_GREEN_SOFT : "#FFFFFF"
        op = keep ? "1.0" : "0.45"
        println(io, """  <rect x="404" y="$yy" width="314" height="32" rx="5" fill="$bg" stroke="$col" stroke-width="1.6" opacity="$op"/>""")
        println(io, """  <text x="418" y="$(yy + 21)" fill="$C_INK" font-size="10.5" font-weight="700" font-family="$FONT_MONO" opacity="$op">$idv | $cv | rt=$rtv | $corv</text>""")
        tag = keep ? "rt>600 ✓" : "除外"
        println(io, """  <text x="706" y="$(yy + 21)" text-anchor="end" fill="$col" font-size="10.2" font-weight="700" font-family="$FONT_MONO">$tag</text>""")
    end
    println(io, """  <text x="561" y="238" text-anchor="middle" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_MONO">subset(df, :rt =&gt; ByRow(&gt;(600))) でも同じ結果</text>""")
    println(io, """  <text x="561" y="258" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">[行の条件, :] の「:」は「すべての列を残す」の意味</text>""")

    println(io, "</svg>")
    write_svg("dataframe-select-subset.svg", String(take!(io)))
end

# ============================================================
# 58. グループ集計と結合 (l15-groupby-join.js): groupby-combine-leftjoin.svg
# ============================================================
function gen_groupby_combine_leftjoin()
    io = IOBuffer()
    print(io, svg_header(760, 300, "groupby と combine による条件別要約（Split-Apply-Combine）および leftjoin による参加者属性表の結合"))

    # 左パネル: groupby(df, :cond) -> combine(:rt => mean => :rt_mean)
    println(io, """  <rect x="24" y="24" width="344" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="196" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① groupby → combine（条件ごとの平均）</text>""")

    println(io, """  <rect x="40" y="66" width="128" height="72" rx="7" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
    println(io, """  <text x="104" y="86" text-anchor="middle" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_MONO">cond == "cong"</text>""")
    println(io, """  <text x="104" y="106" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">512.5, 498.2, ...</text>""")
    println(io, """  <text x="104" y="124" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">(6試行)</text>""")

    println(io, """  <rect x="40" y="150" width="128" height="72" rx="7" fill="#FFFFFF" stroke="$C_PURPLE_DEEP" stroke-width="1.6"/>""")
    println(io, """  <text x="104" y="170" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_MONO">cond == "incong"</text>""")
    println(io, """  <text x="104" y="190" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">560.4, 601.3, ...</text>""")
    println(io, """  <text x="104" y="208" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">(6試行)</text>""")

    println(io, """  <text x="196" y="144" text-anchor="middle" fill="$C_INK" font-size="11" font-weight="700" font-family="$FONT_MONO">combine ▶</text>""")

    println(io, """  <rect x="224" y="96" width="128" height="96" rx="8" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="288" y="118" text-anchor="middle" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_MONO">cond   | rt_mean</text>""")
    println(io, """  <text x="288" y="144" text-anchor="middle" fill="$C_BLUE" font-size="11" font-weight="700" font-family="$FONT_MONO">cong   | 507.933</text>""")
    println(io, """  <text x="288" y="170" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11" font-weight="700" font-family="$FONT_MONO">incong | 590.583</text>""")
    println(io, """  <text x="196" y="254" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_MONO">:rt =&gt; mean =&gt; :rt_mean（列 =&gt; 関数 =&gt; 新列名）</text>""")

    # 右パネル: leftjoin(df, info, on = :id)
    println(io, """  <rect x="388" y="24" width="348" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="562" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">② leftjoin(df, info, on = :id) で属性表を結合</text>""")

    println(io, """  <rect x="404" y="68" width="144" height="68" rx="7" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
    println(io, """  <text x="476" y="88" text-anchor="middle" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_JP">試行表 df (左表)</text>""")
    println(io, """  <text x="476" y="108" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">P01 | cong   | 512.5</text>""")
    println(io, """  <text x="476" y="124" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">P01 | incong | 560.4</text>""")

    println(io, """  <rect x="574" y="68" width="144" height="68" rx="7" fill="#FFFFFF" stroke="$C_ORANGE" stroke-width="1.6"/>""")
    println(io, """  <text x="646" y="88" text-anchor="middle" fill="$C_ORANGE" font-size="10.5" font-weight="700" font-family="$FONT_JP">属性表 info (右表)</text>""")
    println(io, """  <text x="646" y="108" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">P01 | 21 | bilingual</text>""")
    println(io, """  <text x="646" y="124" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">P02 | missing | mono</text>""")

    println(io, """  <text x="562" y="158" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.8" font-weight="700" font-family="$FONT_MONO">↓ on = :id で照合して右列を付与</text>""")

    println(io, """  <rect x="404" y="170" width="314" height="68" rx="8" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="1.8"/>""")
    println(io, """  <text x="561" y="192" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.2" font-weight="700" font-family="$FONT_MONO">id  | cond   | rt    | age(Int64?) | group</text>""")
    println(io, """  <text x="561" y="212" text-anchor="middle" fill="$C_INK" font-size="10.2" font-family="$FONT_MONO">P01 | cong   | 512.5 | 21          | bilingual</text>""")
    println(io, """  <text x="561" y="228" text-anchor="middle" fill="$C_INK" font-size="10.2" font-family="$FONT_MONO">P01 | incong | 560.4 | 21          | bilingual</text>""")
    println(io, """  <text x="562" y="256" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">左表(df)の全試行を残したまま参加者属性がつながる</text>""")

    println(io, "</svg>")
    write_svg("groupby-combine-leftjoin.svg", String(take!(io)))
end

# ============================================================
# 59. 記述統計の深掘り (l17-descriptive.js): mean-vs-median-iqr-robustness.svg
# ============================================================
function gen_mean_vs_median_iqr_robustness()
    rt_clean = [498, 505, 512, 520, 531]
    rt_out = [498, 505, 512, 520, 531, 2400]
    @assert round(mean(rt_clean); digits = 1) == 513.2 && median(rt_clean) == 512.0
    @assert round(mean(rt_out); digits = 1) == 827.7 && median(rt_out) == 516.0

    rts12 = [498, 505, 512, 520, 531, 545, 560, 578, 590, 610, 625, 680]
    @assert quantile(rts12, [0.25, 0.5, 0.75]) == [518.0, 552.5, 595.0]

    io = IOBuffer()
    print(io, svg_header(760, 304, "1つの外れ値（2400 ms）に対する平均と中央値の頑健性比較および四分位範囲（Q1〜Q3）"))

    # 左パネル: 外れ値1件 (2400 ms) で平均は +314.5 ms 跳ね上がるが中央値は +4.0 ms
    bL = PlotBox(66.0, 38.0, 294.0, 210.0, 450.0, 2500.0, 0.4, 2.6)
    draw_axes!(io, bL;
        xticks = [500.0, 1000.0, 1500.0, 2000.0, 2400.0],
        yticks = [1.0, 2.0],
        ytick_labels = ["外れ値あり", "外れ値なし"],
        xlabel = "反応時間 (ms)",
        ylabel = "",
        title = "① 2400 ms が1件入ると平均は 827.7 ms へ跳ぶ",
        mono_ticks = false,
    )
    for v in rt_clean
        println(io, """  <circle cx="$(f1(px(bL, Float64(v))))" cy="$(f1(py(bL, 2.0)))" r="4.0" fill="$C_BLUE"/>""")
    end
    for v in rt_out
        col = v == 2400 ? C_RED : C_BLUE
        println(io, """  <circle cx="$(f1(px(bL, Float64(v))))" cy="$(f1(py(bL, 1.0)))" r="4.2" fill="$col"/>""")
    end
    # 平均と中央値マーカー
    println(io, """  <line x1="$(f1(px(bL, 512.0)))" y1="$(f1(py(bL, 2.25)))" x2="$(f1(px(bL, 516.0)))" y2="$(f1(py(bL, 0.75)))" stroke="$C_GREEN" stroke-width="2.6"/>""")
    println(io, """  <line x1="$(f1(px(bL, 513.2)))" y1="$(f1(py(bL, 2.0)))" x2="$(f1(px(bL, 827.7)))" y2="$(f1(py(bL, 1.0)))" stroke="$C_RED" stroke-width="2.4" stroke-dasharray="5 3"/>""")
    println(io, """  <circle cx="$(f1(px(bL, 827.7)))" cy="$(f1(py(bL, 1.0)))" r="5.2" fill="$C_RED"/>""")
    println(io, """  <text x="$(f1(px(bL, 827.7) + 8))" y="$(f1(py(bL, 1.0) - 10))" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">平均: 513.2 → 827.7 ms</text>""")
    println(io, """  <text x="$(f1(bL.x0 + 8))" y="$(f1(bL.y0 + 18))" fill="$C_GREEN" font-size="9.5" font-weight="700" font-family="$FONT_JP">緑実線：中央値は 512.0 → 516.0 ms（頑健）</text>""")

    # 右パネル: 12試行の四分位数 Q1=518.0, Median=552.5, Q3=595.0
    bR = PlotBox(436.0, 38.0, 296.0, 210.0, 480.0, 700.0, 0.0, 1.0)
    draw_axes!(io, bR;
        xticks = [498.0, 518.0, 552.5, 595.0, 680.0],
        xtick_labels = ["498", "Q1:518", "552.5", "Q3:595", "680"],
        yticks = [0.5],
        ytick_labels = ["12試行"],
        xlabel = "反応時間 rts (ms)",
        ylabel = "",
        title = "② quantile で中央50%の幅（Q1〜Q3）を見る",
        mono_ticks = false,
    )
    q25, q50, q75 = 518.0, 552.5, 595.0
    ym = py(bR, 0.5)
    println(io, """  <line x1="$(f1(px(bR, 498.0)))" y1="$(f1(ym))" x2="$(f1(px(bR, 680.0)))" y2="$(f1(ym))" stroke="$C_AXIS" stroke-width="1.8"/>""")
    println(io, """  <rect x="$(f1(px(bR, q25)))" y="$(f1(ym - 28)))" width="$(f1(px(bR, q75) - px(bR, q25)))" height="56" rx="6" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="2.0"/>""")
    println(io, """  <line x1="$(f1(px(bR, q50)))" y1="$(f1(ym - 28)))" x2="$(f1(px(bR, q50)))" y2="$(f1(ym + 28)))" stroke="$C_PURPLE_DEEP" stroke-width="2.8"/>""")
    for v in rts12
        println(io, """  <circle cx="$(f1(px(bR, Float64(v))))" cy="$(f1(ym + 42))" r="3.4" fill="$C_BLUE"/>""")
    end
    println(io, """  <text x="$(f1(px(bR, q50)))" y="$(f1(ym - 38))" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="9.6" font-weight="700" font-family="$FONT_JP">四分位範囲 IQR = 595.0 − 518.0 = 77.0 ms</text>""")

    println(io, "</svg>")
    write_svg("mean-vs-median-iqr-robustness.svg", String(take!(io)))
end

# ============================================================
# 60. 乱数・標本抽出・再現性 (l20-random.js): sampling-vs-assignment-counterbalance.svg
# ============================================================
function gen_sampling_vs_assignment_counterbalance()
    io = IOBuffer()
    print(io, svg_header(760, 300, "無作為抽出（母集団への代表性）と無作為割付（条件間の比較可能性）の役割分離およびカウンターバランス"))

    # 左パネル: 標本抽出 (Population -> Sample) vs 無作為割付 (Sample -> Condition A / B)
    println(io, """  <rect x="24" y="24" width="436" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="242" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① 標本抽出（代表性）と無作為割付（比較可能性）は別の工程</text>""")

    println(io, """  <rect x="38" y="80" width="102" height="124" rx="8" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.8"/>""")
    println(io, """  <text x="89" y="104" text-anchor="middle" fill="$C_BLUE" font-size="11" font-weight="700" font-family="$FONT_JP">母集団</text>""")
    println(io, """  <text x="89" y="124" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">1001..1100</text>""")
    println(io, """  <text x="89" y="146" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">(N = 100人)</text>""")

    println(io, """  <text x="168" y="128" text-anchor="middle" fill="$C_BLUE" font-size="10.2" font-weight="700" font-family="$FONT_JP">標本抽出 ▶</text>""")
    println(io, """  <text x="168" y="146" text-anchor="middle" fill="$C_SUB" font-size="9.0" font-family="$FONT_JP">外的妥当性</text>""")

    println(io, """  <rect x="198" y="92" width="96" height="100" rx="8" fill="$C_PURPLE_SOFT" stroke="$C_PURPLE_DEEP" stroke-width="1.8"/>""")
    println(io, """  <text x="246" y="118" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11" font-weight="700" font-family="$FONT_JP">標本</text>""")
    println(io, """  <text x="246" y="140" text-anchor="middle" fill="$C_INK" font-size="10.2" font-family="$FONT_MONO">n = 10人</text>""")
    println(io, """  <text x="246" y="162" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_MONO">shuffle[1:10]</text>""")

    println(io, """  <text x="324" y="114" text-anchor="middle" fill="$C_GREEN" font-size="10.0" font-weight="700" font-family="$FONT_JP">無作為割付 ▶</text>""")
    println(io, """  <text x="324" y="132" text-anchor="middle" fill="$C_SUB" font-size="9.0" font-family="$FONT_JP">内的妥当性</text>""")

    println(io, """  <rect x="354" y="72" width="92" height="58" rx="7" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.6"/>""")
    println(io, """  <text x="400" y="96" text-anchor="middle" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_MONO">control</text>""")
    println(io, """  <text x="400" y="116" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_JP">5人</text>""")

    println(io, """  <rect x="354" y="150" width="92" height="58" rx="7" fill="#FFFFFF" stroke="$C_ORANGE" stroke-width="1.6"/>""")
    println(io, """  <text x="400" y="174" text-anchor="middle" fill="$C_ORANGE" font-size="10.5" font-weight="700" font-family="$FONT_MONO">treatment</text>""")
    println(io, """  <text x="400" y="194" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_JP">5人</text>""")

    println(io, """  <text x="242" y="248" text-anchor="middle" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">片方をランダム化しても、もう片方は自動では満たされない</text>""")

    # 右パネル: 刺激順序のカウンターバランスと明示RNG
    println(io, """  <rect x="476" y="24" width="260" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="606" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">② 順序効果の相殺と明示RNG</text>""")

    println(io, """  <rect x="492" y="72" width="228" height="72" rx="7" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.5"/>""")
    println(io, """  <text x="606" y="94" text-anchor="middle" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_JP">カウンターバランス（順序×条件）</text>""")
    println(io, """  <text x="606" y="114" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">前半グループ: [cong → incong]</text>""")
    println(io, """  <text x="606" y="132" text-anchor="middle" fill="$C_INK" font-size="10" font-family="$FONT_MONO">後半グループ: [incong → cong]</text>""")

    println(io, """  <rect x="492" y="160" width="228" height="94" rx="7" fill="#FFFFFF" stroke="$C_PURPLE_DEEP" stroke-width="1.5"/>""")
    println(io, """  <text x="606" y="182" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.5" font-weight="700" font-family="$FONT_MONO">rng = Xoshiro(10_000 + id)</text>""")
    println(io, """  <text x="606" y="204" text-anchor="middle" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">参加者ごとに独立再現可能にし、</text>""")
    println(io, """  <text x="606" y="222" text-anchor="middle" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">生成した割付表そのものもCSV保存</text>""")

    println(io, "</svg>")
    write_svg("sampling-vs-assignment-counterbalance.svg", String(take!(io)))
end

# ============================================================
# 61. モンテカルロ・シミュレーション (l24-montecarlo.js): montecarlo-power-by-n.svg
# ============================================================
function gen_montecarlo_power_by_n()
    # l24-montecarlo.js の実測値: n = [10, 20, 40, 80] -> [18.63%, 32.93%, 60.68%, 87.85%]
    ns = [10.0, 20.0, 40.0, 80.0]
    pows = [18.63, 32.93, 60.68, 87.85]
    mcse20 = round(100 * sqrt(0.3293 * (1 - 0.3293) / 10_000); digits = 2)
    @assert mcse20 == 0.47

    io = IOBuffer()
    print(io, svg_header(760, 304, "1万回のモンテカルロ仮想実験による検定力推定（n=20で32.93%）とサンプルサイズ n による検定力曲線"))

    # 左パネル: n=20, d=0.5 での 10,000回仮想実験の内訳
    bL = PlotBox(64.0, 38.0, 292.0, 210.0, 0.3, 2.7, 0.0, 100.0)
    draw_axes!(io, bL;
        xticks = [1.0, 2.0],
        xtick_labels = ["p < 0.05 (検出成功)", "p ≥ 0.05 (見逃し β)"],
        yticks = [0.0, 32.93, 67.07, 100.0],
        ytick_labels = ["0%", "32.9%", "67.1%", "100%"],
        xlabel = "1万回の仮想実験（n = 20/群, d = 0.5）",
        ylabel = "割合 (%)",
        title = "① n=20 では本当の効果を3回に2回見逃す",
        mono_ticks = false,
    )
    for (xv, pct, col, lbl) in [(1.0, 32.93, C_GREEN, "32.93% (±0.47%)"), (2.0, 67.07, C_RED, "67.07% (第II種過誤)")]
        xx = px(bL, xv) - 34
        yy = py(bL, pct)
        h = py(bL, 0.0) - yy
        println(io, """  <rect x="$(f1(xx))" y="$(f1(yy))" width="68" height="$(f1(h))" rx="5" fill="$col" fill-opacity="0.82"/>""")
        println(io, """  <text x="$(f1(px(bL, xv)))" y="$(f1(yy - 8))" text-anchor="middle" fill="$col" font-size="10.0" font-weight="700" font-family="$FONT_MONO">$lbl</text>""")
    end

    # 右パネル: n = [10, 20, 40, 80] と検定力の推移
    bR = PlotBox(436.0, 38.0, 296.0, 210.0, 5.0, 85.0, 0.0, 100.0)
    draw_axes!(io, bR;
        xticks = [10.0, 20.0, 40.0, 80.0],
        xtick_labels = ["10人", "20人", "40人", "80人"],
        yticks = [0.0, 20.0, 50.0, 80.0, 100.0],
        ytick_labels = ["0%", "20%", "50%", "80%", "100%"],
        xlabel = "1群あたりの人数 n (効果量 d = 0.5)",
        ylabel = "検定力 Power (%)",
        title = "② n を増やすと検定力はどう上がるか",
        mono_ticks = false,
    )
    println(io, """  <line x1="$(f1(bR.x0))" y1="$(f1(py(bR, 80.0)))" x2="$(f1(bR.x0 + bR.w))" y2="$(f1(py(bR, 80.0)))" stroke="$C_GREEN" stroke-width="1.6" stroke-dasharray="5 3"/>""")
    pts = join(["$(f1(px(bR, n))),$(f1(py(bR, p)))" for (n, p) in zip(ns, pows)], " ")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.8" points="$pts"/>""")
    for (n, p) in zip(ns, pows)
        println(io, """  <circle cx="$(f1(px(bR, n)))" cy="$(f1(py(bR, p)))" r="5.0" fill="$C_PURPLE_DEEP"/>""")
        println(io, """  <text x="$(f1(px(bR, n)))" y="$(f1(py(bR, p) - 10))" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.0" font-weight="700" font-family="$FONT_MONO">$(p)%</text>""")
    end

    println(io, "</svg>")
    write_svg("montecarlo-power-by-n.svg", String(take!(io)))
end

# ============================================================
# 62. 大規模データの分割読込と省メモリ集計 (m04-streaming-chunked-data.js): welford-chunk-streaming-arrow.svg
# ============================================================
function gen_welford_chunk_streaming_arrow()
    c1 = [1.0, 2.0, 3.0, 100.0, 110.0]
    c2 = [120.0]
    @assert mean([median(c1), median(c2)]) == 61.5
    @assert median(vcat(c1, c2)) == 51.5

    io = IOBuffer()
    print(io, svg_header(760, 304, "CSV.Chunks と Chan–Welford 法による定数メモリ厳密結合と、チャンク中央値平均の反例"))

    # 左パネル: チャンク分割ストリームと結合可否
    println(io, """  <rect x="24" y="24" width="356" height="254" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="202" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① RunningStats (n, mean, m2) の厳密チャンク結合</text>""")

    for (i, lbl) in enumerate(["Chunk 1", "Chunk 2", "Chunk 3"])
        xx = 40 + (i - 1) * 112
        println(io, """  <rect x="$xx" y="68" width="98" height="48" rx="7" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
        println(io, """  <text x="$(xx + 49)" y="89" text-anchor="middle" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_MONO">$lbl</text>""")
        println(io, """  <text x="$(xx + 49)" y="107" text-anchor="middle" fill="$C_INK" font-size="9.5" font-family="$FONT_MONO">(nₖ, μₖ, M2ₖ)</text>""")
    end
    println(io, """  <text x="202" y="138" text-anchor="middle" fill="$C_GREEN" font-size="10.8" font-weight="700" font-family="$FONT_MONO">↓ merge_stats(a, b)（メモリ O(1)・桁落ちなし）</text>""")

    println(io, """  <rect x="40" y="150" width="324" height="52" rx="7" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="202" y="172" text-anchor="middle" fill="$C_GREEN" font-size="10.8" font-weight="700" font-family="$FONT_JP">✓ 厳密一致：件数 n・平均 mean・不偏分散 var・最小/最大</text>""")
    println(io, """  <text x="202" y="191" text-anchor="middle" fill="$C_INK" font-size="9.6" font-family="$FONT_MONO">M2 = M2ₐ + M2_b + (μ_b − μₐ)² · nₐn_b / (nₐ + n_b)</text>""")

    println(io, """  <rect x="40" y="212" width="324" height="52" rx="7" fill="$C_RED_SOFT" stroke="$C_RED" stroke-width="1.6"/>""")
    println(io, """  <text x="202" y="233" text-anchor="middle" fill="$C_RED" font-size="10.5" font-weight="700" font-family="$FONT_JP">✕ チャンク別の中央値や分位点を単純平均してはいけない</text>""")
    println(io, """  <text x="202" y="252" text-anchor="middle" fill="$C_INK" font-size="9.8" font-family="$FONT_MONO">mean([median(c1), median(c2)]) = 61.5 ≠ 真の中央値 51.5</text>""")

    # 右パネル: 全件CSV読込 vs CSV.Chunks vs Arrow mmap のピークRAM比較
    bR = PlotBox(442.0, 38.0, 290.0, 210.0, 0.3, 3.7, 0.0, 105.0)
    draw_axes!(io, bR;
        xticks = [1.0, 2.0, 3.0],
        xtick_labels = ["全件CSV.read", "CSV.Chunks", "Arrow mmap"],
        yticks = [0.0, 25.0, 50.0, 100.0],
        ytick_labels = ["0%", "25%", "50%", "100%"],
        xlabel = "大規模データの読込方式",
        ylabel = "ピークRAM使用量（相対比）",
        title = "② 分割読込とArrow列指向による省メモリ化",
        mono_ticks = false,
    )
    bars = [
        (1.0, 100.0, C_RED, "100% (全列展開)"),
        (2.0, 8.0,   C_GREEN, "定数チャンク枠のみ"),
        (3.0, 12.0,  C_PURPLE_DEEP, "必要な1列だけ参照"),
    ]
    for (xv, pv, col, note) in bars
        xx = px(bR, xv) - 28
        yy = py(bR, pv)
        h = py(bR, 0.0) - yy
        println(io, """  <rect x="$(f1(xx))" y="$(f1(yy))" width="56" height="$(f1(h))" rx="5" fill="$col" fill-opacity="0.84"/>""")
        println(io, """  <text x="$(f1(px(bR, xv)))" y="$(f1(yy - 8))" text-anchor="middle" fill="$col" font-size="9.4" font-weight="700" font-family="$FONT_JP">$note</text>""")
    end

    println(io, "</svg>")
    write_svg("welford-chunk-streaming-arrow.svg", String(take!(io)))
end

# ============================================================
# 63. PythonCallでPythonの機械学習資産と分業する (b05-python-ml-bridge.js): column-major-vs-row-major-bridge.svg
# ============================================================
function gen_column_major_vs_row_major_bridge()
    X_jl = [10.0 20.0 30.0; 40.0 50.0 60.0]
    raw_buf = Int.(vec(X_jl))
    wrong_c = Int.(permutedims(reshape(raw_buf, 3, 2)))
    @assert raw_buf == [10, 40, 20, 50, 30, 60]
    @assert wrong_c[1, :] == [10, 40, 20]

    io = IOBuffer()
    print(io, svg_header(760, 304, "Juliaの列優先（Column-Major）とNumPyの行優先（Row-Major）のメモリ配置差と安全な分業設計"))

    # 左パネル: 2×3 行列 [10 20 30; 40 50 60] のメモリ並び順
    println(io, """  <rect x="24" y="24" width="364" height="254" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="206" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① 2×3 行列 [10 20 30; 40 50 60] の1次元メモリ順</text>""")

    println(io, """  <text x="40" y="76" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_JP">Julia (Column-Major：縦に列1→列2→列3と並ぶ)</text>""")
    for (i, v) in enumerate([10, 40, 20, 50, 30, 60])
        xx = 40 + (i - 1) * 54
        col = isodd(i) ? C_BLUE : C_PURPLE_DEEP
        println(io, """  <rect x="$xx" y="84" width="48" height="34" rx="5" fill="#FFFFFF" stroke="$col" stroke-width="1.6"/>""")
        println(io, """  <text x="$(xx + 24)" y="106" text-anchor="middle" fill="$col" font-size="12" font-weight="700" font-family="$FONT_MONO">$v</text>""")
    end

    println(io, """  <text x="40" y="144" fill="$C_GREEN" font-size="10.5" font-weight="700" font-family="$FONT_JP">Python / NumPy (Row-Major：横に行1→行2と並ぶ)</text>""")
    for (i, v) in enumerate([10, 20, 30, 40, 50, 60])
        xx = 40 + (i - 1) * 54
        col = i <= 3 ? C_BLUE : C_PURPLE_DEEP
        println(io, """  <rect x="$xx" y="152" width="48" height="34" rx="5" fill="#FFFFFF" stroke="$col" stroke-width="1.6"/>""")
        println(io, """  <text x="$(xx + 24)" y="174" text-anchor="middle" fill="$col" font-size="12" font-weight="700" font-family="$FONT_MONO">$v</text>""")
    end

    println(io, """  <rect x="40" y="202" width="332" height="60" rx="7" fill="$C_RED_SOFT" stroke="$C_RED" stroke-width="1.5"/>""")
    println(io, """  <text x="206" y="224" text-anchor="middle" fill="$C_RED" font-size="10.2" font-weight="700" font-family="$FONT_JP">✕ 生バッファをC順序と誤認すると1行目が [10, 40, 20] に破壊!</text>""")
    println(io, """  <text x="206" y="246" text-anchor="middle" fill="$C_INK" font-size="9.6" font-family="$FONT_MONO">✓ Py(X).to_numpy() で stride ごと渡すか Arrow を使う</text>""")

    # 右パネル: Python × Julia 適材適所の分業アーキテクチャ
    println(io, """  <rect x="404" y="24" width="332" height="254" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="570" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">② Pythonの学習済み資産 × Juliaの高速推定</text>""")

    println(io, """  <rect x="422" y="68" width="296" height="58" rx="8" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.8"/>""")
    println(io, """  <text x="570" y="90" text-anchor="middle" fill="$C_BLUE" font-size="11" font-weight="700" font-family="$FONT_JP">Python（HuggingFace / PyTorch / sklearn）</text>""")
    println(io, """  <text x="570" y="112" text-anchor="middle" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">事前学習済み埋め込み抽出・定型GBDT予測</text>""")

    println(io, """  <text x="570" y="148" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.2" font-weight="700" font-family="$FONT_MONO">↓ Arrow + schema + SHA-256 / pyconvert</text>""")

    println(io, """  <rect x="422" y="162" width="296" height="62" rx="8" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="570" y="186" text-anchor="middle" fill="$C_GREEN" font-size="11" font-weight="700" font-family="$FONT_JP">Julia（DDM・自作尤度・MixedModels・SciML）</text>""")
    println(io, """  <text x="570" y="208" text-anchor="middle" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">何百万試行の認知シミュレーションと階層推定</text>""")

    println(io, """  <text x="570" y="254" text-anchor="middle" fill="$C_SUB" font-size="9.6" font-family="$FONT_JP">CondaPkg.toml でPython版も固定し、境界で型・範囲を検査</text>""")

    println(io, "</svg>")
    write_svg("column-major-vs-row-major-bridge.svg", String(take!(io)))
end

# ============================================================
# 64. R・Stanへ渡すデータの契約 (b01-file-contract.js): bridge-schema-roundtrip-contract.svg
# ============================================================
function gen_bridge_schema_roundtrip_contract()
    io = IOBuffer()
    print(io, svg_header(760, 296, "Julia・R・Stan間でデータを渡す前のスキーマ契約・SHA-256・往復検査（round trip）の設計"))

    println(io, """  <rect x="24" y="24" width="712" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="380" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">言語をつなぐ前に固定する「データ契約（Schema + Round Trip + SHA-256）」</text>""")

    boxes = [
        (44,  "① Julia 前処理・集計", "trials.csv / Arrow", "主キー・単位・欠損表現を確定", C_PURPLE_DEEP, C_PURPLE_SOFT),
        (284, "② schema.toml + SHA-256", "型・水準・許容範囲", "別プロセス読戻しでround trip検査", C_GREEN, C_GREEN_SOFT),
        (524, "③ R / Stan 外部エンジン", "CFA・特殊検定・HMC", "最小結果＋診断＋版情報を戻す", C_BLUE, "#FFFFFF"),
    ]
    for (xx, t1, t2, t3, col, bg) in boxes
        println(io, """  <rect x="$xx" y="76" width="192" height="118" rx="8" fill="$bg" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 96)" y="104" text-anchor="middle" fill="$col" font-size="11.2" font-weight="700" font-family="$FONT_JP">$t1</text>""")
        println(io, """  <text x="$(xx + 96)" y="132" text-anchor="middle" fill="$C_INK" font-size="11.0" font-weight="700" font-family="$FONT_MONO">$t2</text>""")
        println(io, """  <text x="$(xx + 96)" y="160" text-anchor="middle" fill="$C_SUB" font-size="9.6" font-family="$FONT_JP">$t3</text>""")
    end
    println(io, """  <text x="260" y="136" text-anchor="middle" fill="$C_INK" font-size="14" font-weight="700" font-family="$FONT_MONO">──▶</text>""")
    println(io, """  <text x="500" y="136" text-anchor="middle" fill="$C_INK" font-size="14" font-weight="700" font-family="$FONT_MONO">──▶</text>""")
    println(io, """  <text x="380" y="232" text-anchor="middle" fill="$C_INK" font-size="10.2" font-weight="700" font-family="$FONT_JP">Rのfactor水準や日付・NA表現を暗黙変換任せにせず、文字列＋水準リストで受け渡す</text>""")
    println(io, """  <text x="380" y="254" text-anchor="middle" fill="$C_SUB" font-size="9.6" font-family="$FONT_MONO">names(restored) == names(trials) &amp;&amp; nrow(restored) == nrow(trials)</text>""")

    println(io, "</svg>")
    write_svg("bridge-schema-roundtrip-contract.svg", String(take!(io)))
end

# ============================================================
# 65. RCallでJuliaからRを呼ぶ (b02-rcall.js): rcall-rput-rget-boundary.svg
# ============================================================
function gen_rcall_rput_rget_boundary()
    io = IOBuffer()
    print(io, svg_header(760, 292, "RCallによる @rput・R評価・@rget / rcopy の値受け渡しとコード補間分離の境界図"))

    println(io, """  <rect x="24" y="24" width="350" height="244" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="199" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① @rput で値を渡し、@rget / rcopy で戻す</text>""")

    println(io, """  <rect x="44" y="68" width="310" height="46" rx="7" fill="#FFFFFF" stroke="$C_PURPLE_DEEP" stroke-width="1.6"/>""")
    println(io, """  <text x="199" y="96" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="11" font-weight="700" font-family="$FONT_MONO">Julia: @rput rt_ms condition</text>""")
    println(io, """  <text x="199" y="130" text-anchor="middle" fill="$C_BLUE" font-size="10.5" font-weight="700" font-family="$FONT_MONO">↓ R プロセス（factor参照水準を明示）</text>""")
    println(io, """  <rect x="44" y="140" width="310" height="48" rx="7" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
    println(io, """  <text x="199" y="169" text-anchor="middle" fill="$C_BLUE" font-size="10.8" font-weight="700" font-family="$FONT_MONO">R: fit &lt;- lm(rt_ms ~ condition)</text>""")
    println(io, """  <rect x="44" y="204" width="310" height="46" rx="7" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="199" y="232" text-anchor="middle" fill="$C_GREEN" font-size="11" font-weight="700" font-family="$FONT_MONO">@rget coef_values  # [515.0, -40.0]</text>""")

    println(io, """  <rect x="392" y="24" width="344" height="244" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="564" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">② RObject変換と入力値・コードの分離</text>""")
    println(io, """  <rect x="410" y="70" width="308" height="78" rx="7" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.6"/>""")
    println(io, """  <text x="424" y="94" fill="$C_GREEN" font-size="10.8" font-weight="700" font-family="$FONT_JP">✓ 安全：許可リスト照合＋値として補間</text>""")
    println(io, """  <text x="424" y="116" fill="$C_INK" font-size="10.2" font-family="$FONT_MONO">rcopy(R"mean(\$x)")  # RObject → Float64</text>""")
    println(io, """  <text x="424" y="136" fill="$C_SUB" font-size="9.6" font-family="$FONT_JP">R更新後は ENV["R_HOME"] と Pkg.build("RCall")</text>""")

    println(io, """  <rect x="410" y="164" width="308" height="84" rx="7" fill="$C_RED_SOFT" stroke="$C_RED" stroke-width="1.6"/>""")
    println(io, """  <text x="424" y="188" fill="$C_RED" font-size="10.8" font-weight="700" font-family="$FONT_JP">✕ 危険：外部入力文字列をRコードへ直接連結</text>""")
    println(io, """  <text x="424" y="210" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">Rのwarningやerrorを古いJulia値で上書きして</text>""")
    println(io, """  <text x="424" y="228" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">隠さず、sessionInfo() と入力版を記録する</text>""")

    println(io, "</svg>")
    write_svg("rcall-rput-rget-boundary.svg", String(take!(io)))
end

# ============================================================
# 66. JuliaCallでRからJuliaを呼ぶ (b03-juliacall.js): juliacall-r-entry-workflow.svg
# ============================================================
function gen_juliacall_r_entry_workflow()
    io = IOBuffer()
    print(io, svg_header(760, 292, "Rを解析の入口に保ったまま JuliaCall（julia_setup・julia_call）で高速関数だけを呼ぶ構成"))

    println(io, """  <rect x="24" y="24" width="712" height="244" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="380" y="48" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">Rスクリプトを全体の入口に保ち、計算ボトルネックの関数だけをJuliaへ委譲する</text>""")

    steps = [
        (42,  "① R Session 初期化", "julia_setup()", "Pkg.activate(project_dir)", C_BLUE),
        (274, "② Julia 関数読込", "include(\"src/analysis.jl\")", "純粋な関数を公開", C_PURPLE_DEEP),
        (506, "③ 呼び出しと検証", "julia_call(\"fn\", x)", "初回JITと2回目以降を分離計測", C_GREEN),
    ]
    for (xx, s1, s2, s3, col) in steps
        println(io, """  <rect x="$xx" y="76" width="210" height="116" rx="8" fill="#FFFFFF" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 105)" y="104" text-anchor="middle" fill="$col" font-size="11.2" font-weight="700" font-family="$FONT_JP">$s1</text>""")
        println(io, """  <text x="$(xx + 105)" y="132" text-anchor="middle" fill="$C_INK" font-size="10.5" font-weight="700" font-family="$FONT_MONO">$s2</text>""")
        println(io, """  <text x="$(xx + 105)" y="160" text-anchor="middle" fill="$C_SUB" font-size="9.6" font-family="$FONT_JP">$s3</text>""")
    end
    println(io, """  <text x="263" y="134" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_MONO">▶</text>""")
    println(io, """  <text x="495" y="134" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_MONO">▶</text>""")
    println(io, """  <text x="380" y="226" text-anchor="middle" fill="$C_INK" font-size="10.2" font-weight="700" font-family="$FONT_JP">R→Julia→R の相互再帰は避け、一方向の呼び出しと単純な数値配列/NamedTupleの受け渡しに絞る</text>""")
    println(io, """  <text x="380" y="248" text-anchor="middle" fill="$C_SUB" font-size="9.6" font-family="$FONT_MONO">julia_assign("project_dir", project_dir) でパスも値として安全に渡す</text>""")

    println(io, "</svg>")
    write_svg("juliacall-r-entry-workflow.svg", String(take!(io)))
end

# ============================================================
# 67. StanSampleでStanを呼ぶ (b04-stan.js): stansample-cmdstan-diagnostics.svg
# ============================================================
function gen_stansample_cmdstan_diagnostics()
    # Beta(1,1) + 10試行中3成功 -> 事後 Beta(4, 8), 平均 4/12 = 0.333
    @assert round(4 / 12; digits = 3) == 0.333

    io = IOBuffer()
    print(io, svg_header(760, 298, "StanSampleとCmdStan 2.39の実行パイプラインおよびBeta(4, 8)事後分布・収束診断の照合"))

    # 左パネル: model / data / draws / diagnose の一組保存
    println(io, """  <rect x="24" y="24" width="356" height="250" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="202" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① StanModel → stan_sample → diagnose 一組の記録</text>""")

    stages = [
        (68,  "1. 入力契約検査", "Dict(\"N\" => 10, \"y\" => [0,1,...])", C_BLUE),
        (124, "2. CmdStan Sampling", "4 chains × seed固定で外部実行", C_PURPLE_DEEP),
        (180, "3. 収束・診断ゲート", "R̂ ≈ 1.00, ESS, divergence == 0", C_GREEN),
    ]
    for (yy, s1, s2, col) in stages
        println(io, """  <rect x="44" y="$yy" width="316" height="44" rx="7" fill="#FFFFFF" stroke="$col" stroke-width="1.6"/>""")
        println(io, """  <text x="58" y="$(yy + 19)" fill="$col" font-size="10.5" font-weight="700" font-family="$FONT_JP">$s1</text>""")
        println(io, """  <text x="58" y="$(yy + 36)" fill="$C_INK" font-size="9.8" font-family="$FONT_MONO">$s2</text>""")
    end
    println(io, """  <text x="202" y="252" text-anchor="middle" fill="$C_RED" font-size="9.8" font-weight="700" font-family="$FONT_JP">采样終了(success(rc))と収束・妥当性の合格は別!</text>""")

    # 右パネル: Beta(4, 8) 解析解と HMC draws の一致 (mean = 4/12 = 0.333)
    bR = PlotBox(438.0, 38.0, 294.0, 206.0, 0.0, 1.0, 0.0, 3.2)
    draw_axes!(io, bR;
        xticks = [0.0, 0.333, 0.5, 1.0],
        xtick_labels = ["0.0", "0.333", "0.5", "1.0"],
        yticks = [0.0, 1.0, 2.0, 3.0],
        ytick_labels = ["0", "1", "2", "3"],
        xlabel = "成功確率パラメータ θ",
        ylabel = "事後密度 p(θ | y)",
        title = "② Beta(4, 8) 解析解によるサンプラ検算",
    )
    d_post = Beta(4.0, 8.0)
    ths = range(0.005, 0.995; length = 120)
    pts = join(["$(f1(px(bR, th))),$(f1(py(bR, pdf(d_post, th))))" for th in ths], " ")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.6" points="$pts"/>""")
    println(io, """  <line x1="$(f1(px(bR, 4/12)))" y1="$(f1(bR.y0))" x2="$(f1(px(bR, 4/12)))" y2="$(f1(bR.y0 + bR.h))" stroke="$C_GREEN" stroke-width="1.8" stroke-dasharray="5 3"/>""")
    println(io, """  <text x="$(f1(bR.x0 + 10))" y="$(f1(bR.y0 + 20))" fill="$C_PURPLE_DEEP" font-size="9.5" font-weight="700" font-family="$FONT_JP">実線：Beta(1+3, 1+7) = Beta(4, 8)</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 10))" y="$(f1(bR.y0 + 38))" fill="$C_GREEN" font-size="9.5" font-weight="700" font-family="$FONT_MONO">理論平均 = 4/12 = 0.333 ≈ E[y_rep]</text>""")

    println(io, "</svg>")
    write_svg("stansample-cmdstan-diagnostics.svg", String(take!(io)))
end

# ============================================================
# 68. エディタと開発環境 (x01-editors.js): julia-editors-comparison-map.svg
# ============================================================
function gen_julia_editors_comparison_map()
    io = IOBuffer()
    print(io, svg_header(760, 292, "Juliaの4つの開発環境（REPL・Pluto.jl・VS Code・Jupyter/IJulia）の目的別使い分けマップ"))

    println(io, """  <rect x="24" y="22" width="712" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="380" y="46" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">目的で選ぶJuliaの4つの道具（どれを選んでも動くJulia本体は同じ）</text>""")

    cards = [
        (42,  64,  "REPL（対話画面）", "すべての土台・パッケージ追加", "1行打つと即座に結果が返る電卓環境", C_GREEN),
        (390, 64,  "Pluto.jl（リアクティブ）", "各STEPの演習ノートに最適", "環境情報が.jl内に埋まり再現性が高い", C_PURPLE_DEEP),
        (42,  162, "VS Code + Julia拡張", "RStudioに一番近い開発環境", "スクリプトから選択行をREPLへ送って実行", C_BLUE),
        (390, 162, "Jupyter (IJulia.jl)", "Ju = Julia・Python・R", "Pythonと共通の操作感でノートを共有", C_ORANGE),
    ]
    for (xx, yy, title, sub1, sub2, col) in cards
        println(io, """  <rect x="$xx" y="$yy" width="328" height="84" rx="8" fill="#FFFFFF" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 16)" y="$(yy + 26)" fill="$col" font-size="12" font-weight="700" font-family="$FONT_JP">$title</text>""")
        println(io, """  <text x="$(xx + 16)" y="$(yy + 48)" fill="$C_INK" font-size="10.5" font-weight="700" font-family="$FONT_JP">$sub1</text>""")
        println(io, """  <text x="$(xx + 16)" y="$(yy + 68)" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">$sub2</text>""")
    end

    println(io, "</svg>")
    write_svg("julia-editors-comparison-map.svg", String(take!(io)))
end

# ============================================================
# 69. 再現可能な研究プロジェクト (x02-reproducible-project.js): reproducible-project-provenance.svg
# ============================================================
function gen_reproducible_project_provenance()
    io = IOBuffer()
    print(io, svg_header(760, 296, "再現可能な研究プロジェクトのディレクトリ構造（raw不変・schema契約・run metadata・clean run）"))

    println(io, """  <rect x="24" y="22" width="712" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="380" y="46" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">MyStudy/：原記録（raw）を上書きせず、@__DIR__ 基準で一本の入口から再現する</text>""")

    nodes = [
        (42,  74,  "data/raw/ (不変)", "trials.csv (読取専用)", "SHA-256を記録し上書き禁止", C_BLUE),
        (284, 74,  "code/run_analysis.jl", "Project + Manifest固定", "schema.toml で入口検査", C_PURPLE_DEEP),
        (526, 74,  "output/ + metadata/runs/", "tables / figures / .toml", "run_idで同名異内容を拒否", C_GREEN),
    ]
    for (xx, yy, h1, h2, h3, col) in nodes
        println(io, """  <rect x="$xx" y="$yy" width="192" height="114" rx="8" fill="#FFFFFF" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 96)" y="$(yy + 28)" text-anchor="middle" fill="$col" font-size="11.0" font-weight="700" font-family="$FONT_MONO">$h1</text>""")
        println(io, """  <text x="$(xx + 96)" y="$(yy + 56)" text-anchor="middle" fill="$C_INK" font-size="10.5" font-weight="700" font-family="$FONT_JP">$h2</text>""")
        println(io, """  <text x="$(xx + 96)" y="$(yy + 82)" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">$h3</text>""")
    end
    println(io, """  <text x="259" y="132" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_MONO">──▶</text>""")
    println(io, """  <text x="501" y="132" text-anchor="middle" fill="$C_INK" font-size="13" font-weight="700" font-family="$FONT_MONO">──▶</text>""")
    println(io, """  <text x="380" y="222" text-anchor="middle" fill="$C_INK" font-size="10.2" font-weight="700" font-family="$FONT_MONO">const PROJECT_ROOT = realpath(normpath(joinpath(@__DIR__, "..")))</text>""")
    println(io, """  <text x="380" y="246" text-anchor="middle" fill="$C_SUB" font-size="9.8" font-family="$FONT_JP">作業フォルダ(pwd)に依存せず、新しいプロセスでの clean run で結論の同等性を検証する</text>""")

    println(io, "</svg>")
    write_svg("reproducible-project-provenance.svg", String(take!(io)))
end

# ============================================================
# 70. Gitで研究履歴と公開境界を管理する (x03-git-research-history.js): git-staging-privacy-boundary.svg
# ============================================================
function gen_git_staging_privacy_boundary()
    io = IOBuffer()
    print(io, svg_header(760, 296, "Gitの3段階（Working Tree・Staging Area・Commit）と公開allowlist対非公開rawの境界図"))

    # 左パネル: Working Tree -> Staging -> Commit / Tag
    println(io, """  <rect x="24" y="24" width="350" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="199" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">① Working Tree → Staging → 検証済みCommit</text>""")

    for (yy, lbl, cmd, col) in [
        (68,  "Working Tree（作業中の編集）", "git status --short / git diff", C_BLUE),
        (130, "Staging Area（次の記録候補）", "git add ... / git diff --staged", C_PURPLE_DEEP),
        (192, "Commit & Annotated Tag", "git commit / git tag -a v1.0", C_GREEN),
    ]
        println(io, """  <rect x="44" y="$yy" width="310" height="46" rx="7" fill="#FFFFFF" stroke="$col" stroke-width="1.6"/>""")
        println(io, """  <text x="58" y="$(yy + 19)" fill="$col" font-size="10.5" font-weight="700" font-family="$FONT_JP">$lbl</text>""")
        println(io, """  <text x="58" y="$(yy + 36)" fill="$C_INK" font-size="9.8" font-family="$FONT_MONO">$cmd</text>""")
    end

    # 右パネル: 公開境界（allowlist vs private raw）
    println(io, """  <rect x="392" y="24" width="344" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="564" y="48" text-anchor="middle" fill="$C_INK" font-size="12.2" font-weight="700" font-family="$FONT_JP">② 公開境界：.gitignore は履歴削除ではない</text>""")

    println(io, """  <rect x="410" y="68" width="308" height="82" rx="7" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.6"/>""")
    println(io, """  <text x="424" y="90" fill="$C_GREEN" font-size="10.8" font-weight="700" font-family="$FONT_JP">✓ Git追跡・公開Allowlistに入れるもの</text>""")
    println(io, """  <text x="424" y="112" fill="$C_INK" font-size="9.8" font-family="$FONT_MONO">code/  metadata/schema.toml  Project/Manifest</text>""")
    println(io, """  <text x="424" y="132" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">機微情報を含まない公開用合成データ（synthetic）</text>""")

    println(io, """  <rect x="410" y="164" width="308" height="88" rx="7" fill="$C_RED_SOFT" stroke="$C_RED" stroke-width="1.6"/>""")
    println(io, """  <text x="424" y="186" fill="$C_RED" font-size="10.8" font-weight="700" font-family="$FONT_JP">✕ 最初からGitの外へ隔離するもの</text>""")
    println(io, """  <text x="424" y="208" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">参加者の実個票（raw）・対応表・秘密鍵・token</text>""")
    println(io, """  <text x="424" y="228" fill="$C_RED" font-size="9.5" font-weight="700" font-family="$FONT_JP">一度commitすると後からignoreしても履歴に残る!</text>""")

    println(io, "</svg>")
    write_svg("git-staging-privacy-boundary.svg", String(take!(io)))
end

# ============================================================
# 71. エラーメッセージの読み方 (x04-reading-errors.js): error-anatomy-stacktrace-guide.svg
# ============================================================
function gen_error_anatomy_stacktrace_guide()
    io = IOBuffer()
    print(io, svg_header(760, 296, "Juliaのエラーメッセージ（例外型・引数型・Stacktraceの自分のファイル行）の読み解き方"))

    println(io, """  <rect x="24" y="22" width="712" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="380" y="46" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">エラーの解剖図：全文を暗記せず「①例外名・②渡した型・③自分の行番号」の3か所を見る</text>""")

    println(io, """  <rect x="42" y="64" width="676" height="44" rx="7" fill="$C_RED_SOFT" stroke="$C_RED" stroke-width="1.8"/>""")
    println(io, """  <text x="58" y="91" fill="$C_RED" font-size="11.5" font-weight="700" font-family="$FONT_MONO">ERROR: MethodError: no method matching +(::String, ::Int64)</text>""")
    println(io, """  <text x="546" y="91" fill="$C_INK" font-size="10.0" font-weight="700" font-family="$FONT_JP">← ① 関数 + に String と Int64 を渡した</text>""")

    println(io, """  <rect x="42" y="122" width="676" height="68" rx="7" fill="#FFFFFF" stroke="$C_GRID" stroke-width="1.4"/>""")
    println(io, """  <text x="58" y="144" fill="$C_SUB" font-size="10.2" font-family="$FONT_MONO">Stacktrace: [1] top-level scope</text>""")
    println(io, """  <rect x="52" y="152" width="656" height="30" rx="5" fill="$C_GREEN_SOFT" stroke="$C_GREEN" stroke-width="1.6"/>""")
    println(io, """  <text x="64" y="172" fill="$C_GREEN" font-size="10.8" font-weight="700" font-family="$FONT_MONO">   @ Main ~/MyStudy/code/run_analysis.jl:27</text>""")
    println(io, """  <text x="430" y="172" fill="$C_INK" font-size="10.0" font-weight="700" font-family="$FONT_JP">← ② 自分が書いたファイル名と行番号を探す</text>""")

    cards = [
        (42,  "UndefVarError", "綴り・using漏れ・スコープ", C_BLUE),
        (272, "BoundsError / KeyError", "eachindex / get(d,k,missing)", C_PURPLE_DEEP),
        (502, "DimensionMismatch", "size(A), size(B) で次元確認", C_ORANGE),
    ]
    for (xx, t1, t2, col) in cards
        println(io, """  <rect x="$xx" y="204" width="216" height="54" rx="7" fill="#FFFFFF" stroke="$col" stroke-width="1.5"/>""")
        println(io, """  <text x="$(xx + 108)" y="226" text-anchor="middle" fill="$col" font-size="10.8" font-weight="700" font-family="$FONT_MONO">$t1</text>""")
        println(io, """  <text x="$(xx + 108)" y="246" text-anchor="middle" fill="$C_INK" font-size="9.8" font-family="$FONT_JP">$t2</text>""")
    end

    println(io, "</svg>")
    write_svg("error-anatomy-stacktrace-guide.svg", String(take!(io)))
end

# ============================================================
# 72. 文字列処理 (x05-text-processing.js): text-log-normalization-pipeline.svg
# ============================================================
function gen_text_log_normalization_pipeline()
    line = " P012 | CONTROL | 512.4 ms "
    parts = strip.(split(line, '|'))
    @assert length(parts) == 3
    @assert (parts[1], lowercase(parts[2]), parse(Float64, replace(parts[3], " ms" => ""))) == ("P012", "control", 512.4)

    io = IOBuffer()
    print(io, svg_header(760, 292, "装置ログ文字列の split・strip・lowercase・tryparse による構造化と欠測・Unicode境界の監査"))

    println(io, """  <rect x="24" y="22" width="712" height="248" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="380" y="46" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">原文（raw）を残したまま、split → strip/lowercase → 列数・許容集合検査 → 型変換へ進める</text>""")

    println(io, """  <rect x="44" y="64" width="672" height="40" rx="7" fill="#FFFFFF" stroke="$C_BLUE" stroke-width="1.6"/>""")
    println(io, """  <text x="380" y="89" text-anchor="middle" fill="$C_BLUE" font-size="12" font-weight="700" font-family="$FONT_MONO">原文 line = " P012 | CONTROL | 512.4 ms "</text>""")

    println(io, """  <text x="380" y="124" text-anchor="middle" fill="$C_PURPLE_DEEP" font-size="10.8" font-weight="700" font-family="$FONT_MONO">↓ strip.(split(line, '|'))  &amp;&amp;  length(parts) == 3 を検査</text>""")

    cols = [
        (44,  "parts[1] → ID", "\"P012\"", "主キー形式を検査", C_BLUE),
        (274, "lowercase(parts[2])", "\"control\"", "許可集合 in Set(...) 検査", C_PURPLE_DEEP),
        (504, "replace & parse", "512.4 :: Float64", "不正値は tryparse で監査", C_GREEN),
    ]
    for (xx, h1, h2, h3, col) in cols
        println(io, """  <rect x="$xx" y="136" width="212" height="78" rx="8" fill="#FFFFFF" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 106)" y="158" text-anchor="middle" fill="$col" font-size="10.5" font-weight="700" font-family="$FONT_MONO">$h1</text>""")
        println(io, """  <text x="$(xx + 106)" y="180" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_MONO">$h2</text>""")
        println(io, """  <text x="$(xx + 106)" y="200" text-anchor="middle" fill="$C_SUB" font-size="9.5" font-family="$FONT_JP">$h3</text>""")
    end
    println(io, """  <text x="380" y="246" text-anchor="middle" fill="$C_INK" font-size="10.0" font-weight="700" font-family="$FONT_JP">注意：空文字 ""・nothing・missing は別物 / 日本語Unicodeは eachindex・first(s, n) で安全に走査</text>""")

    println(io, "</svg>")
    write_svg("text-log-normalization-pipeline.svg", String(take!(io)))
end

# ============================================================
# 73. 複数CSVと分析成果物の入出力 (x07-batch-csv-io.js): batch-csv-audit-roundtrip.svg
# ============================================================
function gen_batch_csv_audit_roundtrip()
    io = IOBuffer()
    print(io, svg_header(760, 296, "複数CSVの列挙・source列つき厳密読込・主キー重複検査・役割別成果物出力とround trip検証"))

    println(io, """  <rect x="24" y="22" width="712" height="252" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="380" y="46" text-anchor="middle" fill="$C_INK" font-size="12.5" font-weight="700" font-family="$FONT_JP">一括入出力の6段階パイプライン：途中で契約違反があれば集計前に停止する</text>""")

    steps = [
        (42,  68,  "① readdir(sort=true)", "0件停止・.csvのみ列挙", C_BLUE),
        (280, 68,  "② types + strict=true", "型推測に頼らず入口検査", C_PURPLE_DEEP),
        (518, 68,  "③ source=:source_file", "cols=:setequal で連結", C_GREEN),
        (42,  166, "④ 主キー・範囲監査", "allunique(id, trial) 検査", C_ORANGE),
        (280, 166, "⑤ 役割別テーブル出力", "要約・係数・除外記録を分離", C_PURPLE_DEEP),
        (518, 166, "⑥ 別プロセスRound Trip", "上書き拒否＋読戻し一致確認", C_GREEN),
    ]
    for (xx, yy, t1, t2, col) in steps
        println(io, """  <rect x="$xx" y="$yy" width="200" height="76" rx="8" fill="#FFFFFF" stroke="$col" stroke-width="1.8"/>""")
        println(io, """  <text x="$(xx + 100)" y="$(yy + 30)" text-anchor="middle" fill="$col" font-size="11.0" font-weight="700" font-family="$FONT_MONO">$t1</text>""")
        println(io, """  <text x="$(xx + 100)" y="$(yy + 54)" text-anchor="middle" fill="$C_INK" font-size="10.0" font-family="$FONT_JP">$t2</text>""")
    end

    println(io, "</svg>")
    write_svg("batch-csv-audit-roundtrip.svg", String(take!(io)))
end

# ============================================================
# 74. Juliaらしい設計技法① (x12-julian-design-patterns.js): extra-multiple-dispatch-composability.svg
# ============================================================
struct FigUncertain <: Real
    v::Float64
    se::Float64
end
Base.:+(a::FigUncertain, b::FigUncertain) = FigUncertain(a.v + b.v, hypot(a.se, b.se))
Base.:-(a::FigUncertain, b::FigUncertain) = FigUncertain(a.v - b.v, hypot(a.se, b.se))
Base.:-(a::FigUncertain) = FigUncertain(-a.v, a.se)
Base.:*(c::Real, a::FigUncertain) = FigUncertain(c * a.v, abs(c) * a.se)
Base.:*(a::FigUncertain, c::Real) = FigUncertain(a.v * c, abs(c) * a.se)
Base.:*(a::FigUncertain, b::FigUncertain) = FigUncertain(a.v * b.v, hypot(b.v * a.se, a.v * b.se))

struct FigDual <: Real
    v::Float64
    d::Float64
end
Base.:+(a::FigDual, b::FigDual) = FigDual(a.v + b.v, a.d + b.d)
Base.:-(a::FigDual, b::FigDual) = FigDual(a.v - b.v, a.d - b.d)
Base.:-(a::FigDual) = FigDual(-a.v, -a.d)
Base.:*(c::Real, a::FigDual) = FigDual(c * a.v, c * a.d)
Base.:*(a::FigDual, c::Real) = FigDual(a.v * c, a.d * c)
Base.:*(a::FigDual, b::FigDual) = FigDual(a.v * b.v, a.d * b.v + a.v * b.d)

function fig_rk4_decay_step(u::Real, k::Real, dt::Float64)
    k1 = -k * u
    k2 = -k * (u + 0.5 * dt * k1)
    k3 = -k * (u + 0.5 * dt * k2)
    k4 = -k * (u + dt * k3)
    return u + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
end

function gen_extra_multiple_dispatch_composability()
    io = IOBuffer()
    print(io, svg_header(760, 308, "単一ディスパッチと多重ディスパッチの構造比較、および無改造RK4ソルバを誤差伝播型Uncertainと自動微分Dualが貫通する軌道プロット"))

    # 左パネル: 単一ディスパッチ vs 多重ディスパッチの合成マトリクス
    println(io, """  <rect x="20" y="24" width="334" height="260" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="187" y="45" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_JP">なぜ他人のソルバと自分の型が勝手に噛み合うのか？</text>""")

    println(io, """  <rect x="34" y="56" width="306" height="84" rx="8" fill="#FFFFFF" stroke="$C_RED" stroke-width="1.5"/>""")
    println(io, """  <text x="46" y="75" fill="$C_RED" font-size="10.2" font-weight="700" font-family="$FONT_JP">✕ 単一ディスパッチ (x.method(y) / クラス所属)</text>""")
    println(io, """  <text x="46" y="95" fill="$C_INK" font-size="9.5" font-family="$FONT_JP">・メソッドが「第1引数のクラス」だけに所有される</text>""")
    println(io, """  <text x="46" y="113" fill="$C_INK" font-size="9.5" font-family="$FONT_JP">・新数値型 × 既存ソルバの組合せごとにアダプタが必要</text>""")
    println(io, """  <text x="46" y="130" fill="$C_SUB" font-size="9.0" font-family="$FONT_MONO">SolverC.step(Float64) → Uncertain型は型エラーで拒絶</text>""")

    println(io, """  <rect x="34" y="150" width="306" height="122" rx="8" fill="#FFFFFF" stroke="$C_PURPLE_DEEP" stroke-width="1.8"/>""")
    println(io, """  <text x="46" y="170" fill="$C_PURPLE_DEEP" font-size="10.2" font-weight="700" font-family="$FONT_JP">✓ 多重ディスパッチ f(u::T1, k::T2) × 型特化コンパイル</text>""")
    println(io, """  <text x="46" y="189" fill="$C_INK" font-size="9.5" font-family="$FONT_JP">・基本演算 (+, -, *) だけ新数値型に多重定義すればよい</text>""")
    println(io, """  <text x="46" y="206" fill="$C_INK" font-size="9.5" font-family="$FONT_JP">・汎用ソルバ rk4_step(u::Real, k::Real, dt) は無改造！</text>""")

    cols = [("Float64", C_BLUE, 48), ("Uncertain", C_GREEN, 146), ("DualTag", C_PURPLE_DEEP, 244)]
    for (nm, col, xx) in cols
        println(io, """  <rect x="$xx" y="218" width="84" height="44" rx="6" fill="$C_PURPLE_SOFT" stroke="$col" stroke-width="1.4"/>""")
        println(io, """  <text x="$(xx + 42)" y="236" text-anchor="middle" fill="$col" font-size="9.5" font-weight="700" font-family="$FONT_MONO">$nm</text>""")
        println(io, """  <text x="$(xx + 42)" y="253" text-anchor="middle" fill="$C_INK" font-size="8.6" font-family="$FONT_JP">専用機械語生成</text>""")
    end

    # 右パネル: 同じ rk4_step に Uncertain と Dual を通した実測軌道
    bR = PlotBox(414.0, 38.0, 320.0, 214.0, 0.0, 10.0, 0.0, 112.0)
    draw_axes!(io, bR;
        xticks = [0.0, 2.0, 4.0, 6.0, 8.0, 10.0],
        yticks = [0.0, 25.0, 50.0, 75.0, 100.0],
        xlabel = "時間 t (同じ rk4_decay 関数を1文字も変えず実行)",
        ylabel = "状態 u(t) と感度 |∂u/∂k|",
        title = "無改造RK4ソルバを貫通する誤差帯 (Uncertain) と感度 (Dual)",
    )

    dt = 0.25
    steps = 40
    ts = [s * dt for s in 0:steps]
    u_unc = Vector{FigUncertain}(undef, steps + 1)
    u_dual = Vector{FigDual}(undef, steps + 1)
    u_unc[1] = FigUncertain(100.0, 3.0)
    k_unc = FigUncertain(0.22, 0.025)
    u_dual[1] = FigDual(100.0, 0.0)
    k_dual = FigDual(0.22, 1.0)
    for s in 1:steps
        u_unc[s + 1] = fig_rk4_decay_step(u_unc[s], k_unc, dt)
        u_dual[s + 1] = fig_rk4_decay_step(u_dual[s], k_dual, dt)
    end

    upper_pts = ["$(f1(px(bR, ts[i]))),$(f1(py(bR, min(110.0, u_unc[i].v + 1.96 * u_unc[i].se))))" for i in eachindex(ts)]
    lower_pts = ["$(f1(px(bR, ts[i]))),$(f1(py(bR, max(0.0, u_unc[i].v - 1.96 * u_unc[i].se))))" for i in reverse(eachindex(ts))]
    println(io, """  <polygon fill="$C_GREEN" fill-opacity="0.22" stroke="none" points="$(join(vcat(upper_pts, lower_pts), " "))"/>""")

    mean_pts = join(["$(f1(px(bR, ts[i]))),$(f1(py(bR, u_unc[i].v)))" for i in eachindex(ts)], " ")
    sens_pts = join(["$(f1(px(bR, ts[i]))),$(f1(py(bR, abs(u_dual[i].d) * 0.5)))" for i in eachindex(ts)], " ")
    println(io, """  <polyline fill="none" stroke="$C_GREEN" stroke-width="2.6" points="$mean_pts"/>""")
    println(io, """  <polyline fill="none" stroke="$C_PURPLE_DEEP" stroke-width="2.3" stroke-dasharray="5 3" points="$sens_pts"/>""")

    println(io, """  <text x="$(f1(bR.x0 + 10))" y="$(f1(bR.y0 + 18))" fill="$C_GREEN" font-size="9.3" font-weight="700" font-family="$FONT_JP">緑実線＋帯：Uncertain(100±3, k=0.22±0.025) の95%誤差伝播帯</text>""")
    println(io, """  <text x="$(f1(bR.x0 + 10))" y="$(f1(bR.y0 + 34))" fill="$C_PURPLE_DEEP" font-size="9.3" font-weight="700" font-family="$FONT_JP">紫破線：Dual(k, 1.0) で同時抽出したパラメータ感度 0.5|∂u/∂k|</text>""")

    println(io, "</svg>")
    write_svg("extra-multiple-dispatch-composability.svg", String(take!(io)))
end

# ============================================================
# 75. Juliaらしい設計技法② (x12-julian-design-patterns.js): extra-isbits-memory-macro-ast.svg
# ============================================================
function gen_extra_isbits_memory_macro_ast()
    io = IOBuffer()
    print(io, svg_header(760, 304, "ポインタボックス配列とisbits不変struct連続メモリ配置の比較、およびExpr抽象構文木マクロのコンパイル時変換図"))

    # 左パネル: Boxed Pointer Array vs isbits Inline Struct Array
    println(io, """  <rect x="20" y="22" width="350" height="260" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="195" y="43" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_JP">なぜ自作 struct の配列が C 言語並みに速いのか？</text>""")

    println(io, """  <rect x="32" y="54" width="326" height="96" rx="8" fill="#FFFFFF" stroke="$C_RED" stroke-width="1.5"/>""")
    println(io, """  <text x="44" y="72" fill="$C_RED" font-size="10.0" font-weight="700" font-family="$FONT_JP">✕ ポインタ参照配列 (Vector{Any} / 動的言語のクラス配列)</text>""")
    for i in 1:3
        bx = 44 + (i - 1) * 102
        println(io, """  <rect x="$bx" y="80" width="86" height="24" rx="4" fill="$C_RED_SOFT" stroke="$C_RED" stroke-width="1.2"/>""")
        println(io, """  <text x="$(bx + 43)" y="96" text-anchor="middle" fill="$C_RED" font-size="9.0" font-weight="700" font-family="$FONT_MONO">ptr[$i] → 0x..</text>""")
        println(io, """  <rect x="$(bx + 8)" y="114" width="76" height="26" rx="5" fill="#FFFFFF" stroke="$C_RED" stroke-width="1.2" stroke-dasharray="3 2"/>""")
        println(io, """  <text x="$(bx + 46)" y="131" text-anchor="middle" fill="$C_INK" font-size="8.6" font-family="$FONT_MONO">Heap Box $i</text>""")
    end

    println(io, """  <rect x="32" y="160" width="326" height="110" rx="8" fill="#FFFFFF" stroke="$C_GREEN" stroke-width="1.8"/>""")
    println(io, """  <text x="44" y="179" fill="$C_GREEN" font-size="10.0" font-weight="700" font-family="$FONT_JP">✓ Julia の isbits 不変 struct (Vector{Uncertain})</text>""")
    println(io, """  <text x="44" y="196" fill="$C_INK" font-size="9.2" font-family="$FONT_JP">isbitstype(Uncertain) == true / 1要素16Bが隙間なく連続配置！</text>""")
    cells = [("v₁ (8B)", C_GREEN_SOFT), ("se₁ (8B)", "#E8F4FA"), ("v₂ (8B)", C_GREEN_SOFT), ("se₂ (8B)", "#E8F4FA"), ("v₃ (8B)", C_GREEN_SOFT), ("se₃ (8B)", "#E8F4FA")]
    for (idx, (lbl, bg)) in enumerate(cells)
        cx = 42 + (idx - 1) * 50
        println(io, """  <rect x="$cx" y="206" width="50" height="32" fill="$bg" stroke="$C_GREEN" stroke-width="1.3"/>""")
        println(io, """  <text x="$(cx + 25)" y="226" text-anchor="middle" fill="$C_INK" font-size="8.5" font-weight="700" font-family="$FONT_MONO">$lbl</text>""")
    end
    println(io, """  <text x="44" y="256" fill="$C_GREEN" font-size="9.2" font-weight="700" font-family="$FONT_JP">ポインタ追跡ゼロ・キャッシュ直撃・ループ内ヒープ割当 0 B</text>""")

    # 右パネル: 同図象性 (Homoiconicity) と AST マクロ変換
    println(io, """  <rect x="386" y="22" width="354" height="260" rx="10" fill="#FAF8F4" stroke="$C_GRID" stroke-width="1.2"/>""")
    println(io, """  <text x="563" y="43" text-anchor="middle" fill="$C_INK" font-size="11.5" font-weight="700" font-family="$FONT_JP">コード自身がデータ構造 (Expr)：マクロの仕組み</text>""")

    stages = [
        (402, 56,  "① 人間が書く構文 (Surface Syntax)", "@. y = a * x + b   または   @formula(rt ~ 1 + cond)", C_BLUE),
        (402, 126, "② 構文木データ Expr としてマクロが受け取る", "ex.head == :(=)  /  ex.args == [:y, :(a * x + b)]", C_PURPLE_DEEP),
        (402, 196, "③ コンパイル前に高速・安全なコードへ書き換え", "Broadcast.materialize!(y, broadcasted(+, ...)) → 割当0B!", C_GREEN),
    ]
    for (xx, yy, t1, t2, col) in stages
        println(io, """  <rect x="$xx" y="$yy" width="322" height="56" rx="8" fill="#FFFFFF" stroke="$col" stroke-width="1.7"/>""")
        println(io, """  <text x="$(xx + 12)" y="$(yy + 22)" fill="$col" font-size="10.0" font-weight="700" font-family="$FONT_JP">$t1</text>""")
        println(io, """  <text x="$(xx + 12)" y="$(yy + 42)" fill="$C_INK" font-size="9.2" font-family="$FONT_MONO">$t2</text>""")
    end
    println(io, """  <line x1="563" y1="112" x2="563" y2="126" stroke="$C_PURPLE_DEEP" stroke-width="2.0"/>""")
    println(io, """  <line x1="563" y1="182" x2="563" y2="196" stroke="$C_GREEN" stroke-width="2.0"/>""")
    println(io, """  <text x="563" y="270" text-anchor="middle" fill="$C_SUB" font-size="9.2" font-family="$FONT_JP">実行時オーバーヘッド0で DSL（@formula, @model, @.）を実現</text>""")

    println(io, "</svg>")
    write_svg("extra-isbits-memory-macro-ast.svg", String(take!(io)))
end

gen_exploratory_figures()
gen_normal_cdf_ccdf()
gen_makie_figures()
gen_correlation_traps()
gen_residual_qq()
gen_allocation_views()
gen_profile_vs_wald()
gen_euler_vs_rk4()
gen_rwmh_vs_hmc()
gen_ordinal_vs_multinomial()
gen_iia_vs_mixed_logit()
gen_contingency_mosaic_residuals()
gen_mca_biplot_arch()
gen_lasso_path_leakage()
gen_sciml_hybrid_ude()
gen_unimodal_vs_bimodal_raincloud()
gen_paired_spaghetti_linkband()
gen_phase_portrait_calibration()
gen_workflow_revise_test_loop()
gen_why_julia_two_language()
gen_julia_loop_fusion_scaling()
gen_julia_composability_ad_vcurve()
gen_sampling_clt_se()
gen_hypothesis_testing_errors()
gen_confounding_simpson_interaction()
gen_logistic_vs_lpm_scurve()
gen_lmm_random_slopes_shrinkage()
gen_measurement_error_attenuation()
gen_power_curve_design_tradeoff()
gen_ddm_paths_rt_dist()
gen_kalman_filter_smoothing()
gen_predictive_qq_overdispersion()
gen_truncated_vs_censored_mixture()
gen_wide_to_long_reshape()
gen_bias_precision_ci_coverage()
gen_glm_unification_ttest_anova_lm()
gen_ctt_irt_icc_information()
gen_mtmm_validity_dif_matrix()
gen_distribution_catalog_sixpack()
gen_parallel_rng_streams_speedup()
gen_exact_vs_asymptotic_chisq_loglinear()
gen_variables_boxes_operators()
gen_types_float64_underflow()
gen_strings_concat_interpolation()
gen_arrays_1based_indexing_push()
gen_conditionals_branching_flow()
gen_loops_accumulator_trace()
gen_functions_input_return_curve()
gen_first_rt_analysis_outliers()
gen_repl_modes_and_function_scope()
gen_broadcast_elementwise_pipeline()
gen_dict_lookup_skipmissing()
gen_comprehension_filter_map()
gen_dataframe_select_subset()
gen_groupby_combine_leftjoin()
gen_mean_vs_median_iqr_robustness()
gen_sampling_vs_assignment_counterbalance()
gen_montecarlo_power_by_n()
gen_welford_chunk_streaming_arrow()
gen_column_major_vs_row_major_bridge()
gen_bridge_schema_roundtrip_contract()
gen_rcall_rput_rget_boundary()
gen_juliacall_r_entry_workflow()
gen_stansample_cmdstan_diagnostics()
gen_julia_editors_comparison_map()
gen_reproducible_project_provenance()
gen_git_staging_privacy_boundary()
gen_error_anatomy_stacktrace_guide()
gen_text_log_normalization_pipeline()
gen_batch_csv_audit_roundtrip()
gen_extra_multiple_dispatch_composability()
gen_extra_isbits_memory_macro_ast()
println("ALL_LESSON_FIGURES_OK")
