#!/usr/bin/env julia

# 公開Notebookの判定と直結する表作成・予測を実行する。非公開解答・R実行・Stanは使わない。
ENV["GKSwstype"] = "100"
using Test, Markdown, CSV, DataFrames, Statistics, SHA, Random, Distributions

const ROOT = normpath(joinpath(@__DIR__, ".."))

function notebook_scope(name)
    path = joinpath(ROOT, "public", "notebooks", name)
    cells = Dict(Tuple(split(part, '\n'; limit = 2)) for part in
                 split(read(path, String), "# ╔═╡ ")[2:end])
    scope = Module(gensym(:NotebookInput))
    Core.eval(scope, :(using Markdown))
    import_cell = only(code for code in values(cells) if startswith(code, "begin\n    using "))
    Base.include_string(scope, import_cell, path)
    judges = Dict(Symbol(m[1]) => code for code in values(cells)
                  for m in (match(r"^if (\w+) === missing", code),) if m !== nothing)
    return (; scope, cells, judges, path)
end

setvalue(nb, name, value) = Core.eval(nb.scope, :($name = $(QuoteNode(value))))
judge(nb, name, value) = begin
    setvalue(nb, name, value)
    if nb === NB3 && name === :make_trials
        Base.include_string(nb.scope, nb.cells["beefca07-0000-11f1-9a01-000000000007"], nb.path)
    elseif nb === NB4 && name === :m7
        Base.include_string(nb.scope, nb.cells["da7aca56-0000-11f1-9a01-000000000056"], nb.path)
    end
    string(Base.include_string(nb.scope, nb.judges[name], nb.path))
end

const NB1 = notebook_scope("nb1-data.jl")
const NB2 = notebook_scope("nb2-stats.jl")
const NB3 = notebook_scope("nb3-sim.jl")
const NB4 = notebook_scope("nb4-model.jl")
const NB5 = notebook_scope("nb5-advanced.jl")
const NB6 = notebook_scope("nb6-r.jl")
@assert length(NB5.judges) == 9
pop!(NB5.judges, :design_result) # 課題6は既存のnb5-grading-test.jlで実適合とともに検査する。
NB3.judges[:make_trials] = NB3.cells["beefca05-0000-11f1-9a01-000000000005"]
NB3.judges[:csv_path] = pop!(NB3.judges, :trials_df)
for nb in (NB1, NB2)
    setvalue(nb, :df, CSV.read(joinpath(ROOT, "public", "data", "rt_data.csv"), DataFrame))
end
for id in ("c0ffee14-0000-11f1-9a01-000000000014", "c0ffee22-0000-11f1-9a01-000000000022",
           "c0ffee35-0000-11f1-9a01-000000000035", "c0ffee42-0000-11f1-9a01-000000000042")
    Base.include_string(NB2.scope, NB2.cells[id], NB2.path)
end
for id in ("beefca11-0000-11f1-9a01-000000000011", "beefca12-0000-11f1-9a01-000000000012")
    Base.include_string(NB3.scope, NB3.cells[id], NB3.path)
end
for id in ("da7aca04-0000-11f1-9a01-000000000004", "da7aca15-0000-11f1-9a01-000000000015",
           "da7aca19-0000-11f1-9a01-000000000019")
    Base.include_string(NB4.scope, NB4.cells[id], NB4.path)
end
for id in ("5eed1a04-0000-11f1-9a01-000000000004", "5eed1a32-0000-11f1-9a01-000000000032",
           "5eed1a40-0000-11f1-9a01-000000000040", "5eed1a44-0000-11f1-9a01-000000000044",
           "5eed1a48-0000-11f1-9a01-000000000048")
    Base.include_string(NB5.scope, NB5.cells[id], NB5.path)
end
for id in ("6b1d0104-0000-11f1-9a01-000000000004",
           "6b1d0108-0000-11f1-9a01-000000000008",
           "6b1d0115-0000-11f1-9a01-000000000015")
    Base.include_string(NB6.scope, NB6.cells[id], NB6.path)
end
for nb in (NB1, NB2, NB3, NB4, NB5, NB6), name in keys(nb.judges)
    setvalue(nb, name, name === :make_trials ? p -> missing : missing)
end
setvalue(NB1, :batch_data, missing)
Base.include_string(NB3.scope, NB3.cells["beefca07-0000-11f1-9a01-000000000007"], NB3.path)
Base.include_string(NB4.scope, NB4.cells["da7aca56-0000-11f1-9a01-000000000056"], NB4.path)

@testset "NB1–NB6: 未回答と異なる型の誤答（NB5課題6は別検査）" begin
    @test length(NB1.judges) == 7
    @test length(NB2.judges) == 12
    @test length(NB3.judges) == 5
    @test length(NB4.judges) == 14
    @test length(NB5.judges) == 8
    @test length(NB6.judges) == 5
    for nb in (NB1, NB2, NB3, NB4, NB5, NB6), name in keys(nb.judges)
        @test occursin("⏳", judge(nb, name, name === :make_trials ? p -> missing : missing))
        for value in (nothing, true, 0, NaN, Inf, "誤答", (;), [missing], ["誤答"])
            # 上流が未回答なら待機する課題もある。エラーや✅にならないことを確認。
            result = judge(nb, name, name === :make_trials ? p -> value : value)
            @test occursin("🤔", result) || occursin("⏳", result)
            @test !occursin("✅", result)
        end
        setvalue(nb, name, name === :make_trials ? p -> missing : missing)
    end
end

@testset "NB1: 配列の要素と表の列・値を確認する" begin
    for value in (fill(missing, 12), fill("文字", 12),
                  [0.5125; fill(0.0, 11)], fill(NaN, 12))
        @test occursin("🤔", judge(NB1, :sec, value))
    end
    @test occursin("🤔", judge(NB1, :names5, fill(missing, 5)))
    @test occursin("✅", judge(NB1, :names5, ["s1", "s2", "s3", "s4", "s5"]))
    @test occursin("✅", judge(NB1, :age_mean, 22.0))
    for table in (DataFrame(wrong = 1:2), DataFrame(rt = [missing, 700.]),
                  DataFrame(rt = ["700", "800"]), DataFrame(rt = [700., 800.]))
        @test occursin("🤔", judge(NB1, :slow, table))
    end
    for table in (DataFrame(wrong = 1:2), DataFrame(rt_mean = [missing, 590.]),
                  DataFrame(rt_mean = ["508", "590"]),
                  DataFrame(cond = ["cong", "incong"], rt_mean = [507.93333333, 999.]),
                  DataFrame(cond = ["incong", "cong"], rt_mean = [507.93333333, 590.58333333]))
        @test occursin("🤔", judge(NB1, :m, table))
    end
    # 配布CSVから手計算できる基準値。非公開の解答ファイルは読まない。
    means = DataFrame(cond = ["cong", "incong"], rt_mean = [507.93333333, 590.58333333])
    @test occursin("✅", judge(NB1, :m, means))
    @test occursin("✅", judge(NB1, :m, reverse(means)))
    seconds = [0.5125, 0.4982, 0.5604, 0.6013, 0.5301, 0.5217,
               0.5882, 0.6249, 0.4798, 0.5053, 0.5706, 0.5981]
    @test occursin("✅", judge(NB1, :sec, seconds))
    @test occursin("✅", judge(NB1, :slow, NB1.scope.df[[8, 4], :]))
    setvalue(NB1, :batch_data, DataFrame(source_file = repeat(["a", "b"], inner = 6)))
    for value in (nothing, [missing, missing], [1, 2], ["trials_02.csv", "trials_01.csv"])
        @test occursin("🤔", judge(NB1, :batch_files, value))
    end
end

@testset "NB6: 名前付き要素とStan辞書の内側を確認する" begin
    r_result = (rows = 2, header = ["condition", "mean_rt"], values = [511.5, 557.0])
    stan_run = (model = NB6.scope.stan_model,
                data = Dict("N" => 10, "y" => NB6.scope.stan_y), seed = 20260904, chains = 4)
    for (name, valid) in ((:r_result, r_result), (:stan_run, stan_run))
        @test occursin("✅", judge(NB6, name, valid))
        for field in keys(valid)
            incomplete = (; (k => v for (k, v) in pairs(valid) if k != field)...)
            @test occursin("🤔", judge(NB6, name, incomplete))
            for value in (missing, nothing, "文字", [missing], true, NaN, Inf)
                @test occursin("🤔", judge(NB6, name, merge(valid, NamedTuple{(field,)}((value,)))))
            end
        end
    end
    for value in (Dict(), Dict("N" => 10), Dict("y" => NB6.scope.stan_y),
                  Dict("N" => missing, "y" => NB6.scope.stan_y),
                  Dict("N" => 10, "y" => fill(missing, 10)),
                  Dict("N" => 10, "y" => Float64.(NB6.scope.stan_y)))
        @test occursin("🤔", judge(NB6, :stan_run, merge(stan_run, (data = value,))))
    end
    @test occursin("🤔", judge(NB6, :r_result, merge(r_result, (values = [missing, 557.0],))))
end

@testset "NB1・NB6: 読めないCSVと実際のハッシュを照合する" begin
    mktempdir() do root
        empty_csv = joinpath(root, "empty.csv")
        broken_csv = joinpath(root, "broken.csv")
        trailing_quote = joinpath(root, "trailing-quote.csv")
        numeric_header = joinpath(root, "numeric.csv")
        blank_csv = joinpath(root, "blank.csv")
        header_only = joinpath(root, "header-only.csv")
        write(empty_csv, "")
        write(broken_csv, "id,rt\n\"unterminated,510\n")
        write(trailing_quote, "id,rt\n\"P01\"x,510\n")
        write(numeric_header, "1,2,3\na,b,1\na,b,2\na,b,3\na,b,4\n")
        write(blank_csv, "\n \n")
        write(header_only, "participant_id,condition,rt_ms\n")
        for path in (root, joinpath(root, "absent.csv"), empty_csv, blank_csv, header_only,
                     broken_csv, trailing_quote, numeric_header)
            @test occursin("🤔", judge(NB1, :batch_output, path))
            @test occursin("🤔", judge(NB6, :exchange_path, path))
        end
        paths = joinpath.(root, ["trials_01.csv", "trials_02.csv"])
        combined = copy(NB1.scope.df)
        combined.source_file = repeat(paths, inner = 6)
        setvalue(NB1, :batch_data, combined)
        @test occursin("🤔", judge(NB1, :batch_files, paths))
        CSV.write(paths[1], NB1.scope.df[1:6, :])
        CSV.write(paths[2], NB1.scope.df[7:12, :])
        @test occursin("✅", judge(NB1, :batch_files, paths))
        combined_path = joinpath(root, "combined.csv")
        CSV.write(combined_path, combined)
        @test occursin("✅", judge(NB1, :batch_output, combined_path))
        changed = copy(combined)
        changed.rt[1] += 1
        CSV.write(combined_path, changed)
        @test occursin("🤔", judge(NB1, :batch_output, combined_path))
        for table in (select(combined, Not(:rt)), changed,
                      transform(combined, :source_file => (_ -> fill(missing, 12)) => :source_file),
                      transform(combined, :source_file => reverse => :source_file))
            setvalue(NB1, :batch_data, table)
            @test occursin("🤔", judge(NB1, :batch_files, paths))
        end
        exchange = joinpath(root, "trials.csv")
        NB6.scope.writedlm(exchange, NB6.scope.bridge_table, ',')
        @test occursin("✅", judge(NB6, :exchange_path, exchange))
        command = Cmd([NB6.scope.r_executable, "--vanilla", NB6.scope.r_script_path,
                       exchange, NB6.scope.r_output_path])
        @test occursin("✅", judge(NB6, :r_runner, command))
        setvalue(NB6, :exchange_path, missing)
        @test occursin("🤔", judge(NB6, :r_runner, command))
        setvalue(NB6, :exchange_path, exchange)
        manifest = (input_sha256 = bytes2hex(sha256(read(exchange))),
                    model_sha256 = bytes2hex(sha256(NB6.scope.stan_model)),
                    julia_version = string(VERSION),
                    rscript = something(Sys.which("Rscript"), "not found"))
        @test occursin("✅", judge(NB6, :bridge_manifest, manifest))
        for field in keys(manifest), value in (missing, nothing, 1, fill('a', 64), "x"^64)
            @test occursin("🤔", judge(NB6, :bridge_manifest,
                merge(manifest, NamedTuple{(field,)}((value,)))))
        end
        write(exchange, "changed input\n")
        @test occursin("🤔", judge(NB6, :bridge_manifest, manifest))
        setvalue(NB6, :exchange_path, joinpath(root, "absent.csv"))
        @test occursin("🤔", judge(NB6, :bridge_manifest, manifest))
        setvalue(NB6, :exchange_path, missing)
        @test occursin("⏳", judge(NB6, :bridge_manifest, manifest))
    end
end

@testset "NB2: 配列内部・分布・予測区間の上流入力" begin
    fit = fit_mle(LogNormal, NB2.scope.df.rt)
    @test occursin("✅", judge(NB2, :fitted_rt, fit))
    for (name, dims) in ((:q1, (3,)), (:sim_rt, (2000,)), (:rt_replicates, (12, 2000)),
                         (:dependent_draws, (2, 5000)), (:mixture_draws, (10_000,)))
        for value in (missing, nothing, "文字", NaN, Inf, -Inf, true, 1 + 0im)
            @test occursin("🤔", judge(NB2, name, fill(value, dims)))
        end
    end
    @test occursin("✅", judge(NB2, :q1, quantile(NB2.scope.df.rt, [0.25, 0.5, 0.75])))
    @test occursin("✅", judge(NB2, :p550, 0.841344746))
    @test occursin("🤔", judge(NB2, :p550, 0.841344746 + 0im))
    @test occursin("✅", judge(NB2, :sim_rt, rand(Xoshiro(2026), Normal(500, 50), 2000)))
    @test occursin("✅", judge(NB2, :dependent_draws,
        rand(Xoshiro(2032), MvNormal([0., 0.], [1. .65; .65 1.]), 5000)))
    @test occursin("✅", judge(NB2, :mixture_draws, rand(Xoshiro(2033), NB2.scope.mixture_rt, 10_000)))
    draws = rand(Xoshiro(2027), fit, 12, 2000)
    for upstream in (missing, nothing, Normal(), LogNormal(0, 1))
        setvalue(NB2, :fitted_rt, upstream)
        @test occursin(upstream === missing ? "⏳" : "🤔", judge(NB2, :rt_replicates, draws))
    end
    setvalue(NB2, :fitted_rt, fit)
    @test occursin("✅", judge(NB2, :rt_replicates, draws))
    for value in (zeros(12, 2000), -draws, transpose(draws))
        @test occursin("🤔", judge(NB2, :rt_replicates, value))
    end
    prediction = (observed_q95 = quantile(NB2.scope.df.rt, .95),
                  predicted_q95 = quantile([quantile(c, .95) for c in eachcol(draws)], [.025, .975]),
                  observed_max = maximum(NB2.scope.df.rt),
                  predicted_max = quantile(vec(maximum(draws; dims = 1)), [.025, .975]))
    for upstream in (missing, nothing, fill(missing, 12, 2000), zeros(12, 2000), transpose(draws))
        setvalue(NB2, :rt_replicates, upstream)
        @test occursin(upstream === missing ? "⏳" : "🤔", judge(NB2, :predictive_check, prediction))
    end
    setvalue(NB2, :rt_replicates, draws)
    stability = (log_product = -Inf, sum_logs = -921.0340371976183,
                 tail_subtraction = 0., tail_direct = 7.619853024160498e-24)
    for (name, valid) in ((:stability_summary, stability), (:predictive_check, prediction))
        @test occursin("✅", judge(NB2, name, valid))
        for field in keys(valid)
            incomplete = (; (k => v for (k, v) in pairs(valid) if k != field)...)
            @test occursin("🤔", judge(NB2, name, incomplete))
            for value in (missing, nothing, "文字", [missing, missing], [NaN, Inf], true, NaN, Inf, 1 + 0im)
                @test occursin("🤔", judge(NB2, name, merge(valid, NamedTuple{(field,)}((value,)))))
            end
        end
    end
    boundary = (selected = truncated(Normal(500, 80); lower = 400),
                recorded = censored(Normal(500, 80); lower = 400))
    @test occursin("✅", judge(NB2, :boundary_models, boundary))
    for field in keys(boundary)
        @test occursin("🤔", judge(NB2, :boundary_models,
            (; (k => v for (k, v) in pairs(boundary) if k != field)...)))
        for value in (missing, nothing, 1, "文字", Normal(500, 80),
                      truncated(Normal(501, 80); lower = 400),
                      censored(Normal(501, 80); lower = 400),
                      truncated(Normal(500, 80), 400, 1000),
                      censored(Normal(500, 80), 400, 1000),
                      truncated(Exponential(500); lower = 400),
                      censored(Exponential(500); lower = 400))
            @test occursin("🤔", judge(NB2, :boundary_models,
                merge(boundary, NamedTuple{(field,)}((value,)))))
        end
    end
    @test occursin("🤔", judge(NB2, :boundary_models,
        (selected = boundary.recorded, recorded = boundary.selected)))
end

@testset "NB2–NB4: 実際の作図系列・軸・元データとの対応" begin
    rt, cond = NB2.scope.df.rt, NB2.scope.df.cond
    @test occursin("✅", judge(NB2, :p2, NB2.scope.histogram(rt; bins = 6)))
    @test occursin("✅", judge(NB2, :p2, NB2.scope.histogram(reverse(rt); bins = 6,
        color = :orange, legend = false, title = "RT", xlabel = "RT (ms)", ylabel = "Count")))
    # binsの整数値は目安。現在のデータでは4区間で、度数は2,4,4,2になる。
    histogram_rt = NB2.scope.histogram(rt; bins = 6)
    @test histogram_rt.series_list[2][:y] == [2., 4., 4., 2.]
    for p in (NB2.scope.plot(), NB2.scope.plot(rt), NB2.scope.scatter(rt),
              NB2.scope.histogram(rt; bins = 3), NB2.scope.histogram(rt .+ 100; bins = 6),
              NB2.scope.histogram(rt[1:6]; bins = 6),
              NB2.scope.histogram(rt; bins = 6, normalize = :pdf),
              NB2.scope.histogram(rt; bins = 6, orientation = :horizontal),
              NB2.scope.histogram(rt; bins = 6, xflip = true),
              NB2.scope.histogram(rt; bins = 6, weights = fill(2., length(rt))),
              NB2.scope.plot(histogram_rt, histogram_rt; layout = (1, 2)))
        @test occursin("🤔", judge(NB2, :p2, p))
    end
    NB2.scope.plot!(histogram_rt, [500, 600], [1, 2])
    @test occursin("🤔", judge(NB2, :p2, histogram_rt))

    @test occursin("✅", judge(NB2, :p3,
        Core.eval(NB2.scope, :(@df df boxplot(:cond, :rt; legend = false, ylabel = "RT (ms)")))))
    @test occursin("✅", judge(NB2, :p3, NB2.scope.boxplot(reverse(cond), reverse(rt);
        color = :orange, linewidth = 2, title = "Conditions", xlabel = "Condition")))
    for p in (NB2.scope.plot(), NB2.scope.scatter(cond, rt), NB2.scope.violin(cond, rt),
              NB2.scope.boxplot(rt), NB2.scope.boxplot(cond, rt .+ 10),
              NB2.scope.boxplot(cond, reverse(rt)),
              NB2.scope.boxplot(ifelse.(cond .== "cong", "incong", "cong"), rt),
              NB2.scope.boxplot(cond, rt; orientation = :horizontal),
              NB2.scope.boxplot(cond, rt; xticks = ([.5, 1.5], ["incong", "cong"])),
              NB2.scope.boxplot(cond, rt; yflip = true),
              NB2.scope.boxplot(cond, rt; yscale = :log10))
        @test occursin("🤔", judge(NB2, :p3, p))
    end

    sizes = NB3.scope.ns
    ses = [NB3.scope.empirical_se(n) for n in sizes]
    line = NB3.scope.plot(sizes, ses; marker = :circle, ylabel = "SE of mean")
    setvalue(NB3, :ses, missing)
    @test occursin("⏳", judge(NB3, :p4, line))
    for value in (nothing, true, [missing, 10, 5], [25, NaN, 5], [1., 1., 1.])
        setvalue(NB3, :ses, value)
        @test occursin("🤔", judge(NB3, :p4, line))
    end
    setvalue(NB3, :ses, [1., 1., 1.])
    @test occursin("🤔", judge(NB3, :p4,
        NB3.scope.plot(sizes, [1., 1., 1.]; marker = :circle, ylabel = "SE of mean")))
    @test occursin("✅", judge(NB3, :ses, ses))
    @test occursin("✅", judge(NB3, :p4, line))
    @test occursin("✅", judge(NB3, :p4, NB3.scope.plot(sizes, ses; marker = :circle,
        ylabel = "SE of mean", xlabel = "n", color = :orange, linestyle = :dash, legend = false)))
    for p in (NB3.scope.plot(), NB3.scope.plot(ses; marker = :circle, ylabel = "SE of mean"),
              NB3.scope.plot(ses, sizes; marker = :circle, ylabel = "SE of mean"),
              NB3.scope.plot(sizes, reverse(ses); marker = :circle, ylabel = "SE of mean"),
              NB3.scope.plot(sizes, ses .+ .1; marker = :circle, ylabel = "SE of mean"),
              NB3.scope.scatter(sizes, ses; marker = :circle, ylabel = "SE of mean"),
              NB3.scope.plot(sizes, ses; ylabel = "SE of mean"),
              NB3.scope.plot(sizes, ses; marker = :square, ylabel = "SE of mean"),
              NB3.scope.plot(sizes, ses; marker = :circle, ylabel = "SD"),
              NB3.scope.plot(sizes, ses; marker = :circle, ylabel = "SE of mean", xscale = :log10),
              NB3.scope.plot(sizes, ses; marker = :circle, ylabel = "SE of mean", yflip = true),
              NB3.scope.plot(line, line; layout = (1, 2)))
        @test occursin("🤔", judge(NB3, :p4, p))
    end
    NB3.scope.plot!(line, sizes, ses .* 2)
    @test occursin("🤔", judge(NB3, :p4, line))
    # upstreamを戻せば採点も復帰する。前の正答図を別のsesへ流用はできない。
    line = NB3.scope.plot(sizes, ses; marker = :circle, ylabel = "SE of mean")
    setvalue(NB3, :ses, ses .+ .01)
    @test occursin("🤔", judge(NB3, :p4, line))
    setvalue(NB3, :ses, ses)
    @test occursin("✅", judge(NB3, :p4, line))

    correlations = NB4.scope.cor_sims(20)
    for bins in (20, 30, 40, :auto, :sqrt, range(-1., 1.; length = 31))
        @test occursin("✅", judge(NB4, :h1, NB4.scope.histogram(correlations; bins)))
    end
    @test occursin("✅", judge(NB4, :h1, NB4.scope.histogram(reverse(correlations);
        bins = 30, color = :orange, legend = false, xlabel = "r", ylabel = "Count")))
    for p in (NB4.scope.plot(), NB4.scope.plot(correlations), NB4.scope.histogram([-.1, .3, .5]),
              NB4.scope.histogram(NB4.scope.cor_sims(50); bins = 30),
              NB4.scope.histogram(correlations[1:500]; bins = 30),
              NB4.scope.histogram(correlations; bins = 30, normalize = :probability),
              NB4.scope.histogram(correlations; bins = 30, orientation = :horizontal),
              NB4.scope.histogram(correlations; bins = 30, xflip = true),
              NB4.scope.histogram(correlations; bins = range(0., 1.; length = 20)),
              NB4.scope.histogram(correlations; bins = 30, weights = fill(2., 1000)))
        @test occursin("🤔", judge(NB4, :h1, p))
    end
    # 既に作られた図の設定が壊れていても、再作図する前に拒否する。
    hist = NB4.scope.histogram(correlations; bins = 30)
    for bins in (missing, nothing, true, -1, 0, 10_001, 1.5, :wand, "30",
                 [missing, 1], [0., NaN], [1., 0.], [-1., -1., 1.])
        hist.series_list[1][:bins] = bins
        @test occursin("🤔", judge(NB4, :h1, hist))
    end
    hist.series_list[1][:bins] = 30
    @test occursin("✅", judge(NB4, :h1, hist))
    # 判定用の基準図が、次のplot!の描画先を奪わないこと。
    for (nb, name, p) in ((NB2, :p2, NB2.scope.histogram(rt; bins = 6)),
                          (NB2, :p3, NB2.scope.boxplot(cond, rt)), (NB4, :h1, hist))
        current = NB2.scope.plot([1, 2])
        @test occursin("✅", judge(nb, name, p))
        @test NB2.scope.Plots.current() === current
    end
end

@testset "NB3: 関数の返り値と同じ内容から表を作る" begin
    valid_trials(p) = shuffle(Xoshiro(100 + p), repeat(["cong", "incong"], 4))
    for value in (nothing, 1, () -> missing)
        @test occursin("🤔", judge(NB3, :make_trials, value))
        @test NB3.scope.trials_df === missing
    end
    @test occursin("⏳", judge(NB3, :make_trials, p -> missing))
    for participant in 1:5, value in (missing, nothing, fill(missing, 8), fill("cong", 8),
                                    [fill("cong", 4); fill("other", 4)], valid_trials(1)[1:7])
        @test occursin("🤔", judge(NB3, :make_trials, p -> p == participant ? value : valid_trials(p)))
        @test NB3.scope.trials_df === missing
        @test occursin("⏳", judge(NB3, :csv_path, "not-created.csv"))
    end
    @test occursin("🤔", judge(NB3, :make_trials, p -> valid_trials(1)))
    @test NB3.scope.trial_check_nb3.status === :same_order
    for participant in 1:5
        calls = zeros(Int, 5)
        changing(p) = begin
            calls[p] += 1
            p == participant && calls[p] > 1 ? reverse(valid_trials(p)) : valid_trials(p)
        end
        @test occursin("🤔", judge(NB3, :make_trials, changing))
        @test NB3.scope.trial_check_nb3.status === :not_reproducible
        @test NB3.scope.trials_df === missing
    end
    # 同じ配列を使い回しても、各呼出し時点の値を記録する。
    shared = fill("", 8)
    calls = zeros(Int, 5)
    shared_trials(p) = (calls[p] += 1; shared .= valid_trials(p))
    @test occursin("✅", judge(NB3, :make_trials, shared_trials))
    @test calls == fill(2, 5)
    @test nrow(NB3.scope.trials_df) == 40
    @test NB3.scope.trials_df.cond == reduce(vcat, [valid_trials(p) for p in 1:5])
    @test all(p -> NB3.scope.trial_check_nb3.lists[p] == valid_trials(p), 1:5)
    # 関数本体の不具合は誤答扱いで隠さず、元の例外を残す。
    @test_throws LoadError judge(NB3, :make_trials, p -> error("function body failure"))
    @test occursin("✅", judge(NB3, :make_trials, valid_trials))
    for value in (fill(missing, 3), fill("文字", 3), fill(true, 3), [25., NaN, 5.], [25., 10., Inf])
        @test occursin("🤔", judge(NB3, :ses, value))
    end
    @test occursin("✅", judge(NB3, :ses, [25., 10., 5.]))
    valid_rank = (p = .007109, superiority = .855)
    @test occursin("✅", judge(NB3, :rank_summary, valid_rank))
    for field in keys(valid_rank)
        @test occursin("🤔", judge(NB3, :rank_summary,
            (; (k => v for (k, v) in pairs(valid_rank) if k != field)...)))
        for value in (missing, nothing, "文字", true, NaN, Inf, .855 + 0im)
            @test occursin("🤔", judge(NB3, :rank_summary,
                merge(valid_rank, NamedTuple{(field,)}((value,)))))
        end
    end
    mktempdir() do root
        path = joinpath(root, "trials.csv")
        @test occursin("🤔", judge(NB3, :csv_path, root))
        @test occursin("🤔", judge(NB3, :csv_path, path))
        for content in ("", "\n \n", "participant,trial,cond\n", "cond\n\"unterminated\n")
            write(path, content)
            @test occursin("🤔", judge(NB3, :csv_path, path))
        end
        correct = NB3.scope.trials_df
        CSV.write(path, correct)
        @test occursin("✅", judge(NB3, :csv_path, path))
        changed = copy(correct)
        changed.cond[1] = changed.cond[1] == "cong" ? "incong" : "cong"
        for table in (changed, select(correct, Not(:cond)), correct[1:39, :],
                      DataFrame(unrelated = 1:40), reverse(correct))
            CSV.write(path, table)
            @test occursin("🤔", judge(NB3, :csv_path, path))
        end
    end
end

@testset "NB4: 数値の型・値域・配列内部を確認する" begin
    @test occursin("✅", judge(NB4, :spreads, [.3, .13, .065]))
    @test occursin("✅", judge(NB4, :vif_value, 23.2))
    for value in (missing, nothing, "文字", true, NaN, Inf, -Inf, .065 + 0im)
        @test occursin("🤔", judge(NB4, :spreads, [.3, .13, value]))
    end
    logistic = Core.eval(NB4.scope, :(glm(@formula(correct ~ study), df_l, Binomial(), LogitLink())))
    @test occursin("✅", judge(NB4, :m7, logistic))
    # 公開課題の基準値。非公開解答は読み込まない。
    values = (
        scale_rs = (point_biserial = .282, phi = .492, spearman = 1.),
        cross_summary = (p = .0106564, phi = .361158, risk_difference = .36, odds_ratio = 4.57143),
        simpson_summary = (marginal_or = .748349, easy_or = 2.076923, difficult_or = 1.229193),
        tf_relation = (t = 2.402, F = 2.402^2),
        diagnostic_signals = (normality_p = 1e-15, quadratic_r2_gain = .000185),
        condition_summary = (raw = 3.446827639575834e12, centered = 3.4468241926162726,
                             standardized = 1.0025094142341706),
        ridge_summary = (matrix_rank = 3, prediction_gap = 0.,
                         ridge_beta = [2.000833, 2.251992, -1.642080, .609912]),
        penalty_updates = (lasso = [-.4, 0., 0., 0., .5],
                           elastic_net = [-.45454545454545453, 0., 0., 0., .5454545454545454]),
        decision_summary = (theoretical_threshold = 1 / 6, theoretical_cost = .488, half_cost = 1.098),
    )
    for (name, valid) in pairs(values)
        @test occursin("✅", judge(NB4, name, valid))
        for field in keys(valid)
            @test occursin("🤔", judge(NB4, name, (; (k => v for (k, v) in pairs(valid) if k != field)...)))
            for value in (missing, nothing, "文字", true, NaN, Inf, -Inf, 1 + 0im, [missing])
                @test occursin("🤔", judge(NB4, name, merge(valid, NamedTuple{(field,)}((value,)))))
            end
        end
    end
    for (name, field, valid_array) in ((:ridge_summary, :ridge_beta, values.ridge_summary.ridge_beta),
                                      (:penalty_updates, :lasso, values.penalty_updates.lasso),
                                      (:penalty_updates, :elastic_net, values.penalty_updates.elastic_net))
        for bad in (missing, nothing, "文字", true, NaN, Inf, -Inf, 1 + 0im)
            array = Any[valid_array...]
            array[end] = bad
            @test occursin("🤔", judge(NB4, name, merge(values[name], NamedTuple{(field,)}((array,)))))
        end
        for array in (valid_array[1:end-1], [valid_array; 0.], reshape(valid_array, :, 1))
            @test occursin("🤔", judge(NB4, name, merge(values[name], NamedTuple{(field,)}((array,)))))
        end
    end
    @test occursin("🤔", judge(NB4, :diagnostic_signals, merge(values.diagnostic_signals, (normality_p = -1e-15,))))
    @test occursin("🤔", judge(NB4, :ridge_summary, merge(values.ridge_summary, (prediction_gap = -1.,))))
    @test occursin("🤔", judge(NB4, :ridge_summary, merge(values.ridge_summary, (matrix_rank = 3.,))))
    @test occursin("🤔", judge(NB4, :tf_relation, (t = 2.402, F = 5.770))) # 丸めたFではt²との照合に失敗する。
    @test occursin("🤔", judge(NB4, :cross_summary, merge(values.cross_summary, (risk_difference = -.36,))))
end

@testset "NB4: 別のモデルを予測・意思決定へ渡さない" begin
    training = Core.eval(NB4.scope, quote
        lm(@formula(posttest ~ pre_c + group), ancova_df;
           contrasts = Dict(:group => DummyCoding(base = "training", levels = ["control", "training", "combined"])))
    end)
    @test occursin("✅", judge(NB4, :training_model, training))
    wrong_training = Core.eval(NB4.scope, quote
        let coding = Dict(:group => DummyCoding(base = "training", levels = ["control", "training", "combined"]))
            [control_model, control_model.model,
             lm(@formula(posttest ~ pre_c + group), repeat(ancova_df, 2); contrasts = coding),
             lm(@formula(posttest ~ pre_c + group), ancova_df[1:end-1, :]; contrasts = coding),
             lm(@formula(posttest ~ pre_c + group), transform(ancova_df, :posttest => (x -> x .+ 1) => :posttest); contrasts = coding),
             glm(@formula(posttest ~ pre_c + group), ancova_df, Normal(), IdentityLink(); contrasts = coding)]
        end
    end)
    for model in wrong_training
        @test occursin("🤔", judge(NB4, :training_model, model))
    end
    logistic = Core.eval(NB4.scope, :(glm(@formula(correct ~ study), df_l, Binomial(), LogitLink())))
    @test occursin("✅", judge(NB4, :m7, logistic))
    @test length(NB4.scope.decision_probability) == 1000
    @test all(p -> isfinite(p) && 0 <= p <= 1, NB4.scope.decision_probability)
    summary = (theoretical_threshold = 1 / 6, theoretical_cost = .488, half_cost = 1.098)
    @test occursin("✅", judge(NB4, :decision_summary, summary))
    wrong_logistic = Core.eval(NB4.scope, quote
        [lm(@formula(y ~ study), DataFrame(study = [-1., 0., 1.], y = [.9, 2., 3.1])),
         glm(@formula(correct ~ study), df_l, Binomial(), ProbitLink()),
         glm(@formula(correct ~ study), df_l, Normal(), IdentityLink()),
         glm(@formula(correct ~ other), rename(df_l, :study => :other), Binomial(), LogitLink()),
         glm(@formula(correct ~ study), df_l[1:end-1, :], Binomial(), LogitLink()),
         glm(@formula(correct ~ study), transform(df_l, :correct => (x -> .!x) => :correct), Binomial(), LogitLink()),
         glm(@formula(correct ~ study), df_l, Binomial(), LogitLink(); offset = zeros(nrow(df_l))),
         glm(@formula(correct ~ study), df_l, Binomial(), LogitLink(); wts = fill(2., nrow(df_l)))]
    end)
    for model in [missing, nothing, logistic.model, wrong_logistic...]
        @test occursin(model === missing ? "⏳" : "🤔", judge(NB4, :m7, model))
        @test NB4.scope.decision_probability === missing
        @test NB4.scope.decision_cost(1 / 6) === missing
        @test occursin(model === missing ? "⏳" : "🤔", judge(NB4, :decision_summary, summary))
    end
    # 誤答後に正しいモデルへ戻したら、同じ確率と損失へ戻る。
    @test occursin("✅", judge(NB4, :m7, logistic))
    @test NB4.scope.decision_cost(1 / 6) == .488
    @test NB4.scope.decision_cost(.5) == 1.098
    for threshold in (missing, nothing, "文字", true, NaN, Inf, -Inf, -.1, 1.1)
        @test_throws ArgumentError NB4.scope.decision_cost(threshold)
    end
    unit_weights = Core.eval(NB4.scope, :(glm(@formula(correct ~ study), df_l, Binomial(), LogitLink(); wts = ones(nrow(df_l)))))
    @test occursin("✅", judge(NB4, :m7, unit_weights))
end

@testset "NB5: 8項目すべてと入れ子の数値を確認する" begin
    ctt = (pass_rate = vec(mean(NB5.scope.ctt_items, dims = 1)),
           corrected = [cor(NB5.scope.ctt_items[:, j], NB5.scope.ctt_total .- NB5.scope.ctt_items[:, j]) for j in 1:8],
           alpha = NB5.scope.coefficient_alpha_nb(NB5.scope.ctt_scored),
           kr20 = NB5.scope.coefficient_alpha_nb(NB5.scope.ctt_scored))
    values = (
        ctt_stats = ctt,
        mtmm_pattern = (convergent = .669, same_method = .286),
        glmm_probability_summary = (fixed = [.377541, .598688], marginal = [.393814, .585370],
                                    conditional_or = 2.459603, marginal_or = 2.173123),
        deployment_metric_summary = (known = (brier = .136946, log_loss = .424227),
                                     fixed_zero = (brier = .212773, log_loss = .624081),
                                     marginal = (brier = .204680, log_loss = .597593)),
        measurement_effects = (correlations = [.7, .56, .35], slopes = (outcome = 1.5, predictor = .9)),
    )
    for (name, valid) in pairs(values)
        @test occursin("✅", judge(NB5, name, valid))
        for field in keys(valid)
            @test occursin("🤔", judge(NB5, name, (; (k => v for (k, v) in pairs(valid) if k != field)...)))
            for value in (missing, nothing, "文字", true, NaN, Inf, -Inf, 1 + 0im, [missing])
                @test occursin("🤔", judge(NB5, name, merge(valid, NamedTuple{(field,)}((value,)))))
            end
            if valid[field] isa AbstractVector
                for value in (missing, nothing, "文字", true, NaN, Inf, -Inf, 1 + 0im)
                    array = Any[valid[field]...]
                    array[end] = value
                    @test occursin("🤔", judge(NB5, name, merge(valid, NamedTuple{(field,)}((array,)))))
                end
                for array in (valid[field][1:end-1], [valid[field]; 0.], reshape(valid[field], :, 1))
                    @test occursin("🤔", judge(NB5, name, merge(valid, NamedTuple{(field,)}((array,)))))
                end
            elseif valid[field] isa NamedTuple
                nested = valid[field]
                for key in keys(nested)
                    incomplete = (; (k => v for (k, v) in pairs(nested) if k != key)...)
                    @test occursin("🤔", judge(NB5, name, merge(valid, NamedTuple{(field,)}((incomplete,)))))
                    for value in (missing, nothing, "文字", true, NaN, Inf, -Inf, 1 + 0im)
                        changed = merge(nested, NamedTuple{(key,)}((value,)))
                        @test occursin("🤔", judge(NB5, name, merge(valid, NamedTuple{(field,)}((changed,)))))
                    end
                end
            end
        end
    end
    for field in (:pass_rate, :corrected), item in 1:8
        changed = copy(ctt[field])
        changed[item] += .1
        @test occursin("🤔", judge(NB5, :ctt_stats, merge(ctt, NamedTuple{(field,)}((changed,)))))
    end
    @test occursin("✅", judge(NB5, :sds, [5., 30., 60.]))
    @test occursin("✅", judge(NB5, :sds, [0., 30., 60.])) # 分散成分0は負のSDと区別する。
    for value in (missing, nothing, "文字", true, NaN, Inf, -Inf, -1., 1 + 0im)
        @test occursin("🤔", judge(NB5, :sds, Any[value, 30., 60.]))
    end
end

@testset "NB5: 不正な確率を丸めて採点しない" begin
    count = length(NB5.scope.deployment_response)
    for probability in (missing, nothing, .5, zeros(count - 1), zeros(count + 1), zeros(count, 1))
        @test_throws ArgumentError NB5.scope.deployment_score_nb(probability)
    end
    for value in (missing, nothing, "文字", true, NaN, Inf, -Inf, -.1, 1.1, 1 + 0im)
        probability = Any[NB5.scope.known_probability...]
        probability[end] = value
        @test_throws ArgumentError NB5.scope.deployment_score_nb(probability)
    end
    @test NB5.scope.deployment_score_nb(zeros(count)).brier == mean(NB5.scope.deployment_response)
    @test NB5.scope.deployment_score_nb(ones(count)).brier == mean(1 .- NB5.scope.deployment_response)
    @test isfinite(NB5.scope.deployment_score_nb(zeros(count)).log_loss)
    summary = (known = NB5.scope.deployment_score_nb(NB5.scope.known_probability),
               fixed_zero = NB5.scope.deployment_score_nb(NB5.scope.fixed_zero_probability),
               marginal = NB5.scope.deployment_score_nb(NB5.scope.marginal_deployment_probability))
    @test occursin("✅", judge(NB5, :deployment_metric_summary, summary))
    reordered = merge(summary, (known = NB5.scope.deployment_score_nb(reverse(NB5.scope.known_probability)),))
    @test occursin("🤔", judge(NB5, :deployment_metric_summary, reordered))
end

@testset "NB5: ランダム構造・参加者の対応・観測値を照合する" begin
    models = Core.eval(NB5.scope, quote
        let rt = make_rt_data(20, 10, 40),
            f = @formula(rt ~ 1 + condition_centered + (1 + condition_centered | subj)),
            panel_f = @formula(outcome ~ 1 + time_since_baseline + treatment +
                time_since_baseline & treatment + x_between + x_within + (1 + time_since_baseline | subj))
            m = fit(MixedModel, f, rt; progress = false)
            panel = fit(MixedModel, panel_f, panel_nb; progress = false)
            (m = m, panel = panel,
                wrong_rt = [LinearMixedModel(f, rt),
                    fit(MixedModel, @formula(rt ~ 1 + condition_centered + (1 | subj)), rt; progress = false),
                    fit(MixedModel, @formula(rt ~ 1 + condition_centered + (1 + condition_centered | other)), rename(rt, :subj => :other); progress = false),
                    fit(MixedModel, @formula(rt ~ 1 + condition_centered + (1 + alternative | subj)), transform(rt, :condition_centered => identity => :alternative); progress = false),
                    fit(MixedModel, f, transform(rt, :subj => (x -> circshift(x, 1)) => :subj); progress = false),
                    fit(MixedModel, f, transform(rt, :rt => (x -> x .+ 1) => :rt); progress = false),
                    fit(MixedModel, f, repeat(rt, 2); progress = false),
                    fit(MixedModel, @formula(rt ~ 1 + condition_centered + zerocorr(1 + condition_centered | subj)), rt; progress = false),
                    fit(MixedModel, f, rt; weights = fill(2., nrow(rt)), progress = false),
                    fit(MixedModel, f, rt; σ = 50., progress = false),
                    GeneralizedLinearMixedModel(f, transform(rt, :rt => (x -> Int.(x .> 500)) => :rt), Bernoulli())],
                wrong_panel = [LinearMixedModel(panel_f, panel_nb),
                    fit(MixedModel, panel_f, repeat(panel_nb, 2); progress = false),
                    fit(MixedModel, panel_f, panel_nb[1:end-12, :]; progress = false),
                    fit(MixedModel, panel_f, transform(panel_nb, :subj => (x -> circshift(x, 1)) => :subj); progress = false),
                    fit(MixedModel, @formula(outcome ~ 1 + time_since_baseline + treatment +
                        time_since_baseline & treatment + x_between + x_within + (1 + x_within | subj)), panel_nb; progress = false)],
                unit_weights = fit(MixedModel, f, rt; weights = ones(nrow(rt)), progress = false))
        end
    end)
    @test occursin("✅", judge(NB5, :m1, models.m))
    @test occursin("✅", judge(NB5, :panel_model_nb, models.panel))
    lag1 = NB5.scope.panel_lag1_nb(models.panel, NB5.scope.panel_nb)
    @test isfinite(lag1) && -1 <= lag1 <= 1
    for model in models.wrong_rt
        @test occursin("🤔", judge(NB5, :m1, model))
    end
    for model in models.wrong_panel
        @test occursin("🤔", judge(NB5, :panel_model_nb, model))
    end
    # 収束扱いにしない停止コードは、数値が基準値でも合格にしない。
    for (name, model) in ((:m1, models.m), (:panel_model_nb, models.panel))
        original = model.optsum.returnvalue
        try
            model.optsum.returnvalue = :MAXEVAL_REACHED
            @test occursin("🤔", judge(NB5, name, model))
        finally
            model.optsum.returnvalue = original
        end
        @test occursin("✅", judge(NB5, name, model))
    end
    @test occursin("✅", judge(NB5, :m1, models.unit_weights))
end

println("NOTEBOOK_INPUT_TEST_PASS notebooks=6 judges=51 external_engines=0 private_answers=0")
