#!/usr/bin/env julia

module NB5DesignComparison

using CSV, DataFrames, MixedModels, Random, Statistics

# 配布Notebookの計算セルを使い、生成式・適合・分母を二重管理しない。
const NOTEBOOK = joinpath(@__DIR__, "..", "public", "notebooks", "nb5-advanced.jl")
const POWER_PARTS = split(read(NOTEBOOK, String),
    "# ╔═╡ 5eed1a15-0000-11f1-9a01-000000000015\n")
length(POWER_PARTS) == 2 || error("NB5 power cell must exist exactly once")
include_string(@__MODULE__, first(split(POWER_PARTS[2], "\n# ╔═╡"; limit = 2)), NOTEBOOK)

summary_row(scenario, result) =
    (; scenario, (k => v for (k, v) in pairs(result) if k ∉ (:trials, :settings))...)

function comparison_tables(; nsim = 200, null_nsim = 300)
    settings, summaries, trials = NamedTuple[], NamedTuple[], DataFrame[]
    for (scenario, args, options) in (
        ("baseline", (24, 12, 20), (; nsim, seed = 3601)),
        ("null", (24, 12, 0), (; nsim = null_nsim, seed = 3602)),
        ("more_subjects", (48, 12, 20), (; nsim, seed = 3603)),
        ("more_items", (24, 24, 20), (; nsim, seed = 3604)),
        ("higher_slope_sd", (24, 12, 20),
            (; nsim, seed = 3605, subj_slope_sd = 45, item_slope_sd = 30)),
        ("lower_reliability", (24, 12, 20), (; nsim, seed = 3606, reliability = 0.5)),
        ("smaller_effect", (24, 12, 10), (; nsim, seed = 3608)),
    )
        result = power_lmm_nb(args...; options...)
        push!(settings, (; scenario, result.settings...))
        push!(summaries, summary_row(scenario, result))
        push!(trials, insertcols!(copy(result.trials), 1, :scenario => scenario))
    end
    return (settings = DataFrame(settings), summary = DataFrame(summaries),
            trials = reduce(vcat, trials))
end

# 空の例外文 "" と数値のmissingを区別する。予約語の衝突は保存前に拒否する。
const MISSING_MARKER = "__NB5_MISSING__"

function readback_table(path, expected)
    types = Dict(name => (Base.nonmissingtype(eltype(col)) in (Symbol, Union{}) ?
                         String : Base.nonmissingtype(eltype(col)))
                 for (name, col) in pairs(eachcol(expected)))
    actual = CSV.read(path, DataFrame; types, missingstring = MISSING_MARKER,
                      stringtype = String, strict = true, ntasks = 1)
    for (name, col) in pairs(eachcol(expected))
        Base.nonmissingtype(eltype(col)) == Symbol &&
            (actual[!, name] = Symbol.(actual[!, name]))
    end
    isequal(actual, expected) || error("CSVの再読込が元の表と一致しません: $path")
    return actual
end

function save_comparison(output, tables)
    for table in values(tables), col in eachcol(table), value in col
        isequal(value, MISSING_MARKER) &&
            throw(ArgumentError("保存用の欠測記号と文字列が衝突しています"))
    end
    project = Base.active_project()
    project !== nothing && isfile(project) || error("有効なProject.tomlが必要です")
    manifest = joinpath(dirname(project), "Manifest.toml")
    isfile(manifest) || error("有効な環境のManifest.tomlが必要です")

    # mkdirは既存ディレクトリも拒否する。途中失敗の出力も上書きしない。
    mkdir(output)
    for (name, table) in pairs(tables)
        CSV.write(joinpath(output, "$name.csv"), table; missingstring = MISSING_MARKER)
    end
    loaded = (; (name => readback_table(joinpath(output, "$name.csv"), table)
                 for (name, table) in pairs(tables))...)
    recomputed = NamedTuple[]
    for setting in eachrow(loaded.settings)
        trials = filter(:scenario => ==(setting.scenario), loaded.trials)
        trials.simulation == collect(1:setting.nsim) || error("設定と反復IDが一致しません")
        push!(recomputed, summary_row(setting.scenario, summarize_power_trials_nb(trials)))
    end
    isequal(DataFrame(recomputed), loaded.summary) || error("全試行からの再集計が一致しません")

    for (source, relative) in (
        (@__FILE__, "scripts/nb5-design-comparison.jl"),
        (NOTEBOOK, "public/notebooks/nb5-advanced.jl"),
        (project, "validation/Project.toml"),
        (manifest, "validation/Manifest.toml"),
    )
        destination = joinpath(output, relative)
        mkpath(dirname(destination))
        cp(source, destination)
    end
    # 最後に書く。これがないディレクトリは保存・照合が完了していない。
    write(joinpath(output, "README.md"), """
    # NB5 設計比較の記録

    設定・集計・全試行のCSVを再読込し、保存前との一致と全試行からの再集計を確認しました。
    scenarioで3表を対応させ、trialsはscenarioとsimulationで反復を識別します。
    power・mcse・lower・upper・singular_rateの分母はanalyzed、
    detection_rate_all・mcse_all・lower_all・upper_allの分母はattemptedです。
    失敗した行も残しています。欠測は$(MISSING_MARKER)、空の例外文は空文字列です。

    CSVだけを読む例（推定状態や停止コードは文字列として読み込みます）:

    ```julia
    using CSV, DataFrames
    settings = CSV.read("settings.csv", DataFrame; missingstring="$MISSING_MARKER")
    summary = CSV.read("summary.csv", DataFrame; missingstring="$MISSING_MARKER")
    trials = CSV.read("trials.csv", DataFrame; missingstring="$MISSING_MARKER")
    ```

    再計算はこのディレクトリで、settings.csv記載のJulia版を使って実行します。
    標準の7条件（基準など各200、帰無300、合計1500反復）のコマンドです。
    関数の引数を変更した実験は、保存したsettings.csvに合わせて引数を設定してください。

    ```sh
    julia --startup-file=no --project=validation -e 'using Pkg; Pkg.instantiate()'
    julia --startup-file=no --project=validation scripts/nb5-design-comparison.jl rerun
    ```

    出力先は未作成のディレクトリを指定します。既存の結果は上書きしません。
    環境・数値ライブラリの違いで丸めや適合結果が変わることがあります。
    この照合は保存した数値と集計の確認で、研究上の仮定や学習の達成を判定しません。
    """)
    return loaded
end

function main(args)
    length(args) == 1 || error("usage: julia --project=validation scripts/nb5-design-comparison.jl NEW_OUTPUT_DIR")
    output = abspath(only(args))
    ispath(output) && error("既存の出力を上書きしません: $output")
    isdir(dirname(output)) || error("出力先の親ディレクトリがありません: $(dirname(output))")
    tables = comparison_tables()
    loaded = save_comparison(output, tables)
    show(stdout, MIME("text/plain"), loaded.summary; allrows = true, allcols = true)
    println("\nNB5_DESIGN_COMPARISON_PASS scenarios=$(nrow(loaded.settings)) trials=$(nrow(loaded.trials)) output=$output")
end

end # module

if abspath(PROGRAM_FILE) == @__FILE__
    NB5DesignComparison.main(ARGS)
end
