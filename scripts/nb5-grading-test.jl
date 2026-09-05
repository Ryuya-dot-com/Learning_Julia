#!/usr/bin/env julia

# NB5課題6の判定セルと反復記録を直接検査する。模範解答とPlutoは不要。
using Test
include("nb5-design-comparison.jl")

const NOTEBOOK = NB5DesignComparison.NOTEBOOK
const PARTS = split(read(NOTEBOOK, String),
    "# ╔═╡ 5eed1a17-0000-11f1-9a01-000000000017\n")
length(PARTS) == 2 || error("NB5 task 6 judge cell must exist exactly once")
const JUDGE = first(split(PARTS[2], "\n# ╔═╡"; limit = 2))
const SCOPE = NB5DesignComparison
Core.eval(SCOPE, :(using Markdown))

function judge(value)
    Core.eval(SCOPE, :(design_result = $(QuoteNode(value))))
    string(Base.include_string(SCOPE, JUDGE, NOTEBOOK))
end

@testset "NB5: 7条件とCSV往復・再集計・上書き拒否" begin
    tables = SCOPE.comparison_tables(nsim = 2, null_nsim = 3)
    @test tables.settings.scenario == ["baseline", "null", "more_subjects", "more_items",
                                       "higher_slope_sd", "lower_reliability", "smaller_effect"]
    @test tables.settings.nsim == [2, 3, 2, 2, 2, 2, 2]
    @test tables.settings.seed == [3601, 3602, 3603, 3604, 3605, 3606, 3608]
    @test tables.settings.n_subj == [24, 24, 48, 24, 24, 24, 24]
    @test tables.settings.n_item == [12, 12, 12, 24, 12, 12, 12]
    @test tables.settings.effect == [20, 0, 20, 20, 20, 20, 10]
    @test tables.settings.subj_slope_sd == [25, 25, 25, 25, 45, 25, 25]
    @test tables.settings.item_slope_sd == [15, 15, 15, 15, 30, 15, 15]
    @test tables.settings.reliability == [0.8, 0.8, 0.8, 0.8, 0.8, 0.5, 0.8]
    @test all(==(:Xoshiro), tables.settings.rng)
    @test SCOPE.nrow(tables.trials) == 15
    @test !any(SCOPE.nonunique(tables.trials, [:scenario, :simulation]))

    mktempdir() do root
        output = joinpath(root, "comparison")
        loaded = SCOPE.save_comparison(output, tables)
        @test all(name -> isequal(loaded[name], tables[name]), keys(tables))
        @test all(isempty, loaded.trials.error_message)
        for (source, relative) in (
            (SCOPE.NOTEBOOK, "public/notebooks/nb5-advanced.jl"),
            (joinpath(@__DIR__, "nb5-design-comparison.jl"), "scripts/nb5-design-comparison.jl"),
            (Base.active_project(), "validation/Project.toml"),
            (joinpath(dirname(Base.active_project()), "Manifest.toml"), "validation/Manifest.toml"),
        )
            @test read(source) == read(joinpath(output, relative))
        end
        before = read(joinpath(output, "trials.csv"))
        @test isfile(joinpath(output, "README.md"))
        @test_throws Base.IOError SCOPE.save_comparison(output, tables)
        @test read(joinpath(output, "trials.csv")) == before

        # I/O専用の全失敗例。空文字・NAという文字列・引用符・改行も保持する。
        failed_trials = copy(tables.trials[1:2, :])
        failed_trials.status .= :exception
        failed_trials.return_code .= :NOT_AVAILABLE
        for name in (:estimate, :se, :objective, :singular, :rejected)
            failed_trials[!, name] = fill(missing, 2)
        end
        failed_trials.error_type .= "ArgumentError"
        failed_trials.error_message = ["例外, \"値\"\n次の行", "NA"]
        failed_summary = SCOPE.DataFrame([SCOPE.summary_row("baseline",
            SCOPE.summarize_power_trials_nb(failed_trials))])
        failed = (settings = tables.settings[1:1, :], summary = failed_summary, trials = failed_trials)
        restored = SCOPE.save_comparison(joinpath(root, "failed"), failed)
        @test all(name -> isequal(restored[name], failed[name]), keys(failed))
        @test ismissing(only(restored.summary.power))
        @test only(restored.summary.detection_rate_all) == 0

        corrupted = copy(tables.summary)
        corrupted.hits = string.(corrupted.hits)
        corrupted.hits[1] = "数値でない"
        path = joinpath(root, "corrupted.csv")
        SCOPE.CSV.write(path, corrupted)
        @test_throws SCOPE.CSV.Error SCOPE.readback_table(path, tables.summary)
        corrupted.hits[1] = "999"
        SCOPE.CSV.write(path, corrupted)
        @test_throws ErrorException SCOPE.readback_table(path, tables.summary)

        wrong_settings = copy(tables.settings)
        wrong_settings.nsim[1] += 1
        incomplete = joinpath(root, "incomplete")
        @test_throws ErrorException SCOPE.save_comparison(incomplete, merge(tables, (settings = wrong_settings,)))
        @test !isfile(joinpath(incomplete, "README.md"))
        failed_trials.error_message[1] = SCOPE.MISSING_MARKER
        reserved = joinpath(root, "reserved")
        @test_throws ArgumentError SCOPE.save_comparison(reserved, failed)
        @test !ispath(reserved)
    end
end

@testset "NB5: 計算例の判定は欠落・不正な解答で停止しない" begin
    # 本文の公開値。課題を解くコードや非公開の模範解答は含めない。
    baseline = (power = 0.71, mcse = sqrt(0.71 * 0.29 / 200),
                lower = 0.644, upper = 0.768, singular_rate = 0.16,
                attempted = 200, analyzed = 200, hits = 142,
                failure_rate = 0.0, detection_rate_all = 0.71)
    @test occursin("⏳", judge(missing))
    @test occursin("✅", judge(baseline))
    @test occursin("自動採点していません", judge(baseline))

    for value in (nothing, 0.71, "0.71", [0.71], (;), (power = 0.71,),
                  merge(baseline, (power = 0.9,)),
                  merge(baseline, (lower = -0.1,)),
                  merge(baseline, (upper = 1.1,)),
                  merge(baseline, (lower = 0.75, upper = 0.65)),
                  merge(baseline, (mcse = 0.03,)),
                  merge(baseline, (singular_rate = 0.8,)),
                  merge(baseline, (analyzed = 199,)),
                  merge(baseline, (attempted = 200.0,)),
                  merge(baseline, (hits = 140,)),
                  merge(baseline, (failure_rate = 0.1,)),
                  merge(baseline, (detection_rate_all = 0.6,)))
        @test occursin("🤔", judge(value))
    end
    for field in keys(baseline)
        without_field = (; (k => v for (k, v) in pairs(baseline) if k != field)...)
        @test occursin("🤔", judge(without_field))
        for value in (missing, nothing, "数値でない", [0.1], NaN, Inf, -Inf, true)
            @test occursin("🤔", judge(merge(baseline, NamedTuple{(field,)}((value,)))))
        end
    end
end

@testset "NB5: 停止コード・無効な推定・分母・全失敗を区別する" begin
    for code in (:SUCCESS, :STOPVAL_REACHED, :FTOL_REACHED, :XTOL_REACHED)
        @test SCOPE.power_fit_status_nb(code, 20.0, 5.0, 100.0) == :ok
    end
    for code in (:MAXEVAL_REACHED, :MAXTIME_REACHED, :ROUNDOFF_LIMITED, :FAILURE, :UNKNOWN)
        @test SCOPE.power_fit_status_nb(code, 20.0, 5.0, 100.0) == :nonconverged
    end
    for (estimate, se, objective) in ((NaN, 5., 100.), (20., 0., 100.),
                                     (20., -1., 100.), (20., Inf, 100.), (20., 5., Inf),
                                     (1e308, 1e-308, 100.))
        @test SCOPE.power_fit_status_nb(:FTOL_REACHED, estimate, se, objective) == :invalid_estimate
    end
    trials = SCOPE.DataFrame(
        simulation = 1:5,
        status = [:ok, :ok, :nonconverged, :invalid_estimate, :exception],
        rejected = [true, false, missing, missing, missing],
        singular = [true, false, false, false, missing])
    result = SCOPE.summarize_power_trials_nb(trials)
    @test (result.attempted, result.analyzed, result.hits) == (5, 2, 1)
    @test result.failure_rate == 3 / 5
    @test result.power == result.singular_rate == 1 / 2
    @test result.detection_rate_all == 1 / 5
    @test result.mcse ≈ sqrt(0.5 * 0.5 / 2)
    @test result.mcse_all ≈ sqrt(0.2 * 0.8 / 5)
    @test result.trials === trials
    for k in (:lower, :upper, :lower_all, :upper_all)
        @test 0 <= getproperty(result, k) <= 1
    end
    failed = SCOPE.summarize_power_trials_nb(trials[3:5, :])
    @test failed.analyzed == failed.hits == 0
    @test failed.failure_rate == 1
    @test all(ismissing, (failed.power, failed.mcse, failed.lower, failed.upper, failed.singular_rate))
    @test failed.detection_rate_all == 0 && failed.lower_all == 0 && failed.upper_all > 0
    @test_throws ArgumentError SCOPE.summarize_power_trials_nb(trials[1:0, :])
    for hits in (0, 10)
        interval = SCOPE.power_binomial_nb(hits, 10)
        @test 0 <= interval.lower < interval.upper <= 1
        @test hits == 0 ? interval.lower == 0 : interval.upper == 1
    end
    @test_throws ArgumentError SCOPE.power_binomial_nb(1, 0)
    @test_throws ArgumentError SCOPE.power_binomial_nb(-1, 10)
end

@testset "NB5: 実適合の記録・再現・失敗後の継続" begin
    baseline = SCOPE.power_lmm_nb(24, 12, 20)
    @test occursin("✅", judge(baseline))
    @test baseline.trials.simulation == collect(1:200)
    @test count(==(:ok), baseline.trials.status) == baseline.analyzed
    @test count(x -> x === true, baseline.trials.rejected) == baseline.hits
    @test count(==(:ok), baseline.trials.status) + count(!=(:ok), baseline.trials.status) == 200
    @test all(isempty, baseline.trials.error_message)
    @test baseline.settings.seed == 3601 && baseline.settings.nsim == 200
    @test baseline.settings.backend == :nlopt && baseline.settings.optimizer == :LN_NEWUOA
    repeat_run = SCOPE.power_lmm_nb(24, 12, 20; nsim = 3)
    @test isequal(baseline.trials[1:3, :], repeat_run.trials)

    limited = SCOPE.power_lmm_nb(24, 12, 20; nsim = 3, maxfeval = 1)
    @test limited.trials.simulation == collect(1:3)
    @test all(==(:MAXEVAL_REACHED), limited.trials.return_code)
    @test all(==(:nonconverged), limited.trials.status)
    @test limited.analyzed == 0 && limited.failure_rate == 1
    @test all(ismissing, limited.trials.rejected)
    @test ismissing(limited.power) && limited.detection_rate_all == 0
    @test occursin("🤔", judge(limited))

    # 実際にfit!が例外を返す定数応答。その次の正常適合へ状態を持ち越さない。
    df = SCOPE.DataFrame(subj = repeat(["S1", "S2", "S3"], inner = 4),
        item = repeat(["I1", "I1", "I2", "I2"], outer = 3),
        condition_centered = repeat([-0.5, 0.5], outer = 6), y = ones(12))
    broken = SCOPE.fit_power_trial_nb(df)
    @test broken.status == :exception && broken.error_type == "ArgumentError"
    @test !isempty(broken.error_message) && ismissing(broken.rejected)
    after_failure = SCOPE.power_lmm_nb(24, 12, 20; nsim = 1)
    @test isequal(after_failure.trials, baseline.trials[1:1, :])
    for args in ((1, 12, 20), (24, 1, 20), (true, 12, 20), (24, 12, Inf))
        @test_throws ArgumentError SCOPE.power_lmm_nb(args...; nsim = 1)
    end
    for kwargs in ((nsim = 0,), (nsim = true,), (reliability = 0,), (reliability = 1.1,),
                   (subj_slope_sd = -1,), (item_slope_sd = NaN,), (maxfeval = 0,))
        @test_throws ArgumentError SCOPE.power_lmm_nb(24, 12, 20; kwargs...)
    end
    println("NB5_POWER_RECORDS_PASS attempted=$(baseline.attempted) analyzed=$(baseline.analyzed) hits=$(baseline.hits) power=$(baseline.power) singular=$(baseline.singular_rate)")
end
