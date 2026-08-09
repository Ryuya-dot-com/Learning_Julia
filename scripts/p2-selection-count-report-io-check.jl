#!/usr/bin/env julia

# Versioned Julia-Web schema and lossless JSON/CSV output check for the P2
# research track. Files are written only to a temporary directory during tests.
using Distributions
using JSON3
using Random
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
include(joinpath(@__DIR__, "p2-selection-count-report-io.jl"))
using .P2LikelihoodContracts
using .P2SelectionCountReportIO

const ROOT = normpath(joinpath(@__DIR__, ".."))
const FIXTURE_DIR = joinpath(ROOT, "validation", "p2-likelihood", "fixtures")
const SCHEMA_PATH = joinpath(
    ROOT, "validation", "p2-likelihood", "selection-count-report-v1.schema.json",
)

function make_report_bundle()
    truth = Normal(37, 1.7)
    lower, upper = quantile.(Ref(truth), (0.45, 0.55))
    observed = filter(
        value -> lower < value < upper,
        rand(Xoshiro(20271234), truth, 400),
    )
    review = selection_count_interval_report(
        Xoshiro(20279001), observed, 400;
        lower,
        upper,
        bootstrap_repetitions = 499,
    )
    unresolved_profile = selection_count_interval_report(
        Xoshiro(20281200), observed, 400;
        lower,
        upper,
        bootstrap_repetitions = 99,
        profile_max_expansions = 0,
    )
    insufficient_bootstrap = parametric_bootstrap_selection_count_intervals(
        Xoshiro(20281199), review.fit, 10;
        lower,
        upper,
        repetitions = 99,
    )
    unresolved_bootstrap = merge(review, (
        status = :unresolved_bootstrap,
        bootstrap = insufficient_bootstrap,
        messages = (:wald_is_local_approximation, :bootstrap_success_rate_too_low),
    ))
    records = [
        interval_report_record(
            "review", review;
            total_screened = 400,
            selected_count = length(observed),
            lower,
            upper,
        ),
        interval_report_record(
            "unresolvedProfile", unresolved_profile;
            total_screened = 400,
            selected_count = length(observed),
            lower,
            upper,
        ),
        interval_report_record(
            "unresolvedBootstrap", unresolved_bootstrap;
            total_screened = 400,
            selected_count = length(observed),
            lower,
            upper,
        ),
    ]
    build_report_bundle(records)
end

bundle = make_report_bundle()

if "--update-fixtures" in ARGS
    mkpath(FIXTURE_DIR)
    for extension in ("json", "csv")
        path = joinpath(FIXTURE_DIR, "selection-count-report-v1.$(extension)")
        ispath(path) && rm(path)
    end
    written = write_report_artifacts(
        FIXTURE_DIR, bundle; basename = "selection-count-report-v1",
    )
    println("P2_SELECTION_COUNT_REPORT_FIXTURES_UPDATED ", written)
end

@testset "P2 selection-count versioned report IO" begin
    @test validate_report_bundle(bundle)
    schema = JSON3.read(read(SCHEMA_PATH, String))
    @test schema[Symbol("\$schema")] == "https://json-schema.org/draft/2020-12/schema"
    @test schema[Symbol("\$id")] == "urn:learning-julia:p2:selection-count-report:1"
    @test schema.properties.schema_version[Symbol("const")] == SCHEMA_VERSION

    @testset "temporary JSON and CSV round trip" begin
        mktempdir() do output_dir
            artifacts = write_report_artifacts(output_dir, bundle)
            @test length(artifacts.json_sha256) == 64
            @test length(artifacts.csv_sha256) == 64
            restored_json = read_report_json(artifacts.json_path)
            restored_rows = read_report_csv(artifacts.csv_path)
            @test length(restored_json.reports) == 3
            @test length(restored_rows) == 18
            @test count(row -> row.report_status == "unresolved_profile", restored_rows) == 6
            @test count(row -> row.report_status == "unresolved_bootstrap", restored_rows) == 6
            unresolved_rows = filter(row -> row.method_status != "ok", restored_rows)
            @test length(unresolved_rows) == 4
            @test all(row -> ismissing(row.lower) && ismissing(row.upper), unresolved_rows)
            @test all(row -> ismissing(row.automatic_interval), restored_rows)
            bootstrap_failure_rows = filter(
                row -> row.report_id == "unresolvedBootstrap" &&
                    row.method == "bootstrap",
                restored_rows,
            )
            @test all(row -> row.bootstrap_total_screened == 10, bootstrap_failure_rows)
            @test_throws ArgumentError write_report_artifacts(output_dir, bundle)
        end
    end

    @testset "checked-in cross-language fixtures" begin
        fixture_json = read_report_json(joinpath(
            FIXTURE_DIR, "selection-count-report-v1.json",
        ))
        fixture_rows = read_report_csv(joinpath(
            FIXTURE_DIR, "selection-count-report-v1.csv",
        ))
        @test [report.report_id for report in fixture_json.reports] ==
            ["review", "unresolvedProfile", "unresolvedBootstrap"]
        @test length(fixture_rows) == 18
        @test fixture_json.schema_version == SCHEMA_VERSION
        @test all(report -> isnothing(report.automatic_interval), fixture_json.reports)
    end

    @testset "schema and semantic failures" begin
        @test_throws ArgumentError validate_report_bundle(merge(
            bundle, (schema_version = "2.0.0",),
        ))
        @test_throws ArgumentError validate_report_bundle(merge(
            bundle,
            (model_scope = merge(
                bundle.model_scope, (automatic_interval_selection = true,),
            ),),
        ))
        invalid_report = merge(bundle.reports[1], (automatic_interval = "wald",))
        @test_throws ArgumentError build_report_bundle([
            invalid_report,
            bundle.reports[2],
            bundle.reports[3],
        ])
        missing_rows = flatten_report_bundle(bundle)[1:end-1]
        @test_throws ArgumentError validate_report_csv_rows(missing_rows)
    end
end

println("P2_SELECTION_COUNT_REPORT_IO_CHECK_PASS")
