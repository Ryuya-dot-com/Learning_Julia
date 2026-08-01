#!/usr/bin/env julia

using Arrow
using CSV
using CategoricalArrays
using DataFrames
using Dates
using JLD2
using Serialization
using SHA
using Test

analysis_data = DataFrame(
    id = ["P01", "P02", "P03"],
    condition = categorical(["control", "treatment", "control"], ordered = true),
    rt = Union{Missing, Float64}[512.5, missing, 488.0],
    collected = Date.(2026, 8, 1:3),
)
levels!(analysis_data.condition, ["control", "treatment"])

formula_text = "rt ~ condition"
summary_values = (observed = 2, mean_rt = 500.25)

function check_roundtrips(directory)
    csv_path = joinpath(directory, "analysis.csv")
    arrow_path = joinpath(directory, "analysis.arrow")
    jld2_path = joinpath(directory, "analysis.jld2")
    cache_path = joinpath(directory, "analysis.jls")

    CSV.write(csv_path, analysis_data)
    csv_data = CSV.read(csv_path, DataFrame)

    Arrow.write(arrow_path, analysis_data)
    # Arrow.Table(path)はmmapを使う。Windowsのtemp削除まで検証するこのscriptでは、
    # 書き出したbytesを読み、同じArrow payloadをfile handleなしで復元する。
    arrow_data = DataFrame(Arrow.Table(read(arrow_path)))

    jldsave(jld2_path;
        data = analysis_data,
        formula_text,
        summary_values,
        julia_version = string(VERSION),
    )
    jld2_bundle = load(jld2_path)

    serialize(cache_path, (; analysis_data, formula_text, summary_values))
    cache_bundle = deserialize(cache_path)

    csv_hash = bytes2hex(sha256(read(csv_path)))

    @testset "データの保存・交換・再現" begin
        @test names(csv_data) == names(analysis_data)
        @test csv_data.id == analysis_data.id
        @test isequal(csv_data.rt, analysis_data.rt)
        @test csv_data.collected == analysis_data.collected
        @test !(csv_data.condition isa CategoricalArray)

        @test names(arrow_data) == names(analysis_data)
        @test arrow_data.id == analysis_data.id
        @test isequal(arrow_data.rt, analysis_data.rt)
        @test arrow_data.collected == analysis_data.collected
        @test eltype(arrow_data.condition) <: CategoricalValue
        @test String.(arrow_data.condition) == String.(analysis_data.condition)
        @test String.(levels(arrow_data.condition)) == ["control", "treatment"]
        @test !isordered(first(arrow_data.condition))

        @test jld2_bundle["formula_text"] == formula_text
        @test jld2_bundle["summary_values"] == summary_values
        @test isequal(jld2_bundle["data"], analysis_data)
        @test levels(jld2_bundle["data"].condition) == ["control", "treatment"]
        @test isordered(jld2_bundle["data"].condition)

        @test cache_bundle.formula_text == formula_text
        @test cache_bundle.summary_values == summary_values
        @test isequal(cache_bundle.analysis_data, analysis_data)

        @test length(csv_hash) == 64
        @test all(isfile, [csv_path, arrow_path, jld2_path, cache_path])
    end

    return (
        csv_condition_type = string(eltype(csv_data.condition)),
        csv_missing_restored = ismissing(csv_data.rt[2]),
        csv_collected_type = string(eltype(csv_data.collected)),
        arrow_condition_type = string(eltype(arrow_data.condition)),
        arrow_ordered = isordered(first(arrow_data.condition)),
        jld2_levels = String.(levels(jld2_bundle["data"].condition)),
        csv_sha256_prefix = first(csv_hash, 12),
    )
end

mktempdir() do directory
    roundtrip_summary = check_roundtrips(directory)
    # 関数内の参照をスコープ外へ出してから解放し、Windowsでも一時
    # ディレクトリを警告なく削除できることまで検証する。
    GC.gc(true)
    println(roundtrip_summary)
end

println("data persistence checks passed")
