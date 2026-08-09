#!/usr/bin/env julia

# 「複数CSVと分析成果物の入出力」の掲載コードを、成功系と意図的失敗系の
# 両方で検証する。すべて一時directory内で完結し、repositoryのdataは変更しない。
using CSV
using DataFrames
using SHA
using Statistics
using Test

include(joinpath(@__DIR__, "p0-p1-contracts.jl"))
using .P0P1Contracts

@testset "batch CSV input and result output" begin
    mktempdir() do project_dir
        input_dir = joinpath(project_dir, "data", "raw")
        output_dir = joinpath(project_dir, "output", "tables")
        mkpath(input_dir)

        p02 = DataFrame(
            participant_id = ["P02", "P02"],
            trial = [1, 2],
            condition = ["control", "treatment"],
            rt_ms = Union{Missing, Float64}[520.0, missing],
            correct = [true, false],
        )
        p01 = DataFrame(
            participant_id = ["P01", "P01"],
            trial = [1, 2],
            condition = ["control", "treatment"],
            rt_ms = Union{Missing, Float64}[500.0, 620.0],
            correct = [true, true],
        )

        # 作成順を逆にしても、discover_csvsは名前順を返す。
        CSV.write(joinpath(input_dir, "trials_02.csv"), p02)
        CSV.write(joinpath(input_dir, "trials_01.csv"), p01)
        write(joinpath(input_dir, "README.txt"), "raw input directory\n")

        files = discover_csvs(input_dir)
        @test basename.(files) == ["trials_01.csv", "trials_02.csv"]

        # CSV.jl公式のvector inputとsource列も独立に確認する。
        direct = DataFrame(CSV.File(
            files;
            source = :source_file,
            types = TRIAL_TYPES,
            missingstring = ["", "NA"],
            strict = true,
        ))
        @test nrow(direct) == 4
        @test length(unique(direct.source_file)) == 2

        data, loaded_files = load_trials(input_dir)
        @test loaded_files == files
        @test nrow(data) == 4
        @test propertynames(data) == [REQUIRED_COLUMNS; :source_file]
        @test data.source_file == [
            "trials_01.csv", "trials_01.csv",
            "trials_02.csv", "trials_02.csv",
        ]
        @test count(ismissing, data.rt_ms) == 1

        file_audit = combine(
            groupby(data, :source_file),
            nrow => :rows,
            :rt_ms => (x -> count(ismissing, x)) => :missing_rt,
        )
        summary = combine(
            groupby(dropmissing(data, :rt_ms), :condition),
            nrow => :n,
            :rt_ms => mean => :mean_rt_ms,
        )
        sort!(summary, :condition)

        @test file_audit.rows == [2, 2]
        @test file_audit.missing_rt == [0, 1]
        @test summary.condition == ["control", "treatment"]
        @test summary.n == [2, 1]
        @test summary.mean_rt_ms == [510.0, 620.0]

        participants = DataFrame(participant_id = ["P01", "P02"], group = ["A", "B"])
        joined = leftjoin(
            data,
            participants;
            on = :participant_id,
            validate = (false, true),
            order = :left,
            source = :participant_match,
        )
        @test nrow(joined) == nrow(data)
        @test all(==("both"), joined.participant_match)

        summary_path = joinpath(output_dir, "condition_summary.csv")
        audit_path = joinpath(output_dir, "input_file_audit.csv")
        @test write_new_csv(summary_path, summary; missingstring = "NA") == summary_path
        @test write_new_csv(audit_path, file_audit; missingstring = "NA") == audit_path

        restored = CSV.read(
            summary_path,
            DataFrame;
            types = Dict(:condition => String, :n => Int, :mean_rt_ms => Float64),
            missingstring = "NA",
            strict = true,
        )
        @test isequal(restored, summary)
        @test length(bytes2hex(open(sha256, summary_path))) == 64
        @test_throws ArgumentError write_new_csv(summary_path, summary)
    end

    mktempdir() do empty_dir
        @test_throws ArgumentError discover_csvs(empty_dir)
    end

    mktempdir() do bad_schema_dir
        bad = DataFrame(
            participant_id = ["P01"], trial = [1], condition = ["control"], rt_ms = [500.0],
        )
        CSV.write(joinpath(bad_schema_dir, "bad.csv"), bad)
        @test_throws ArgumentError load_trials(bad_schema_dir)
    end

    mktempdir() do bad_type_dir
        bad = DataFrame(
            participant_id = ["P01"], trial = [1], condition = ["control"],
            rt_ms = ["not-a-number"], correct = [true],
        )
        CSV.write(joinpath(bad_type_dir, "bad.csv"), bad)
        @test_throws Exception load_trials(bad_type_dir)
    end

    mktempdir() do duplicate_dir
        one = DataFrame(
            participant_id = ["P01"], trial = [1], condition = ["control"],
            rt_ms = [500.0], correct = [true],
        )
        CSV.write(joinpath(duplicate_dir, "a.csv"), one)
        CSV.write(joinpath(duplicate_dir, "b.csv"), one)
        @test_throws ArgumentError load_trials(duplicate_dir)
    end
end

println("BATCH_CSV_IO_CHECK_PASS")
