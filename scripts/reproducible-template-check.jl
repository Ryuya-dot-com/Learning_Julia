using CSV
using DataFrames
using SHA
using TOML
using Tar
using Test

const ROOT = normpath(joinpath(@__DIR__, ".."))
const SOURCE = joinpath(ROOT, "examples", "reproducible-study")
const ARCHIVE = joinpath(ROOT, "public", "templates", "reproducible-study-template.tar")
const EXPECTED_FILES = sort([
    ".gitignore",
    ".gitattributes",
    "README.md",
    "Project.toml",
    "Manifest.toml",
    "code/run_analysis.jl",
    "data/example/trials_synthetic.csv",
    "data/raw/README.md",
    "metadata/data_dictionary.csv",
    "metadata/schema.toml",
    "metadata/study.toml",
    "metadata/DATA_LICENSE.txt",
])

file_sha256(path) = open(path, "r") do io
    bytes2hex(sha256(io))
end

portable_files(root) = sort([
    replace(relpath(joinpath(directory, file), root), '\\' => '/')
    for (directory, _, files) in walkdir(root)
    for file in files
])

@testset "配布用の再現可能研究project" begin
    @test isfile(ARCHIVE)
    @test portable_files(SOURCE) == EXPECTED_FILES

    mktempdir() do extraction
        Tar.extract(ARCHIVE, extraction)
        template = joinpath(extraction, "reproducible-study")
        @test isdir(template)
        @test portable_files(template) == EXPECTED_FILES
        for relative_path in EXPECTED_FILES
            @test file_sha256(joinpath(template, relative_path)) ==
                  file_sha256(joinpath(SOURCE, relative_path))
        end

        input_path = joinpath(template, "data", "example", "trials_synthetic.csv")
        manifest_path = joinpath(template, "Manifest.toml")
        input_before = file_sha256(input_path)
        manifest_before = file_sha256(manifest_path)
        entrypoint = joinpath(template, "code", "run_analysis.jl")
        command = `$(Base.julia_cmd()) --project=$template $entrypoint`

        elsewhere = mktempdir()
        try
            first_output = cd(elsewhere) do
                read(command, String)
            end
            second_output = cd(elsewhere) do
                read(command, String)
            end

            @test occursin("mean_rt_ms", first_output)
            @test occursin("510.0", first_output)
            @test occursin("550.0", first_output)
            @test occursin("(:created, :created, :created)", first_output)
            @test occursin("(:reused, :reused, :created)", second_output)
            @test file_sha256(input_path) == input_before
            @test file_sha256(manifest_path) == manifest_before

            derived = filter(endswith(".csv"), readdir(joinpath(template, "data", "derived")))
            summaries = filter(endswith(".csv"), readdir(joinpath(template, "output", "tables")))
            run_records = filter(endswith(".toml"), readdir(joinpath(template, "metadata", "runs")))
            @test length(derived) == 1
            @test length(summaries) == 1
            @test length(run_records) == 2

            summary = CSV.read(joinpath(template, "output", "tables", only(summaries)), DataFrame)
            @test summary.condition == ["control", "treatment"]
            @test summary.n == [3, 2]
            @test summary.mean_rt_ms == [510.0, 550.0]

            record_path = joinpath(template, "metadata", "runs", first(run_records))
            record = TOML.parsefile(record_path)
            @test record["inputs"]["trials_path"] == "data/example/trials_synthetic.csv"
            @test record["inputs"]["study_path"] == "metadata/study.toml"
            @test record["inputs"]["study_id"] == "synthetic-rt-demo"
            @test record["inputs"]["input_classification"] == "synthetic-public"
            @test record["quality"]["input_unchanged"] == true
            @test startswith(record["outputs"]["summary_path"], "output/tables/")
            record_text = read(record_path, String)
            @test !occursin(template, record_text)
            @test !occursin(extraction, record_text)
            @test !occursin(elsewhere, record_text)

            invalid = CSV.read(input_path, DataFrame)
            invalid.condition[1] = "unknown"
            CSV.write(input_path, invalid)
            expected_error_path = joinpath(elsewhere, "expected-schema-error.txt")
            failed = cd(elsewhere) do
                open(expected_error_path, "w") do error_log
                    run(pipeline(
                        ignorestatus(command);
                        stdout = devnull,
                        stderr = error_log,
                    ); wait = true)
                end
            end
            @test !success(failed)
            @test occursin(
                "conditionに許可されていない値または欠測があります",
                read(expected_error_path, String),
            )
        finally
            rm(elsewhere; recursive = true, force = true)
        end
    end
end

println((
    archive_sha256 = file_sha256(ARCHIVE),
    source_files = length(EXPECTED_FILES),
    clean_process_runs = 2,
))
println("reproducible study template checks passed")
