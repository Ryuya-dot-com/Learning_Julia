#!/usr/bin/env julia

# Julia execution core and transport-envelope check for the research-only P2
# API boundary. No network listener or credential is created by this script.
using Distributions
using JSON3
using Random
using SHA
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
include(joinpath(@__DIR__, "p2-selection-count-report-io.jl"))
include(joinpath(@__DIR__, "p2-selection-count-api-core.jl"))
using .P2LikelihoodContracts
using .P2SelectionCountReportIO
using .P2SelectionCountAPICore

const ROOT = normpath(joinpath(@__DIR__, ".."))
const VALIDATION_DIR = joinpath(ROOT, "validation", "p2-likelihood")
const FIXTURE_DIR = joinpath(VALIDATION_DIR, "fixtures")
const REQUEST_SCHEMA_PATH = joinpath(
    VALIDATION_DIR, "selection-count-api-request-v1.schema.json",
)
const RESPONSE_SCHEMA_PATH = joinpath(
    VALIDATION_DIR, "selection-count-api-response-v1.schema.json",
)

function make_api_request()
    truth = Normal(37, 1.7)
    lower, upper = quantile.(Ref(truth), (0.45, 0.55))
    observed = filter(
        value -> lower < value < upper,
        rand(Xoshiro(20271234), truth, 400),
    )
    build_api_request(
        "teaching-example-v1",
        observed,
        400;
        lower,
        upper,
        random_seed = 20279001,
        bootstrap_repetitions = 99,
    )
end

request = make_api_request()
bytes = request_bytes(request)
response = execute_api_request(
    request;
    exact_request_bytes = bytes,
    generated_at_utc = "2026-08-10T00:00:00.000Z",
)

if "--update-fixtures" in ARGS
    mkpath(FIXTURE_DIR)
    for suffix in ("request.json", "response.json")
        path = joinpath(FIXTURE_DIR, "selection-count-api-v1-$(suffix)")
        ispath(path) && rm(path)
    end
    written = write_api_fixtures(FIXTURE_DIR, request)
    println("P2_SELECTION_COUNT_API_FIXTURES_UPDATED ", written)
end

@testset "P2 selection-count API boundary" begin
    @test validate_api_request(request)
    @test validate_api_response(response)
    @test validate_api_exchange(bytes, response)
    @test request.input_contract.selected_count == 43
    @test length(request.input_contract.selected_values) == 43
    @test all(
        request.input_contract.lower_boundary .< request.input_contract.selected_values .<
        request.input_contract.upper_boundary,
    )
    @test response.request_id == request.request_id
    @test response.request_sha256 == bytes2hex(sha256(bytes))
    @test response.engine.project_environment == "validation/p2-likelihood"
    @test response.engine.report_schema_version == P2SelectionCountReportIO.SCHEMA_VERSION
    @test length(response.report_bundle.reports) == 1
    @test response.report_bundle.reports[1].report_id == request.request_id
    @test isnothing(response.report_bundle.reports[1].automatic_interval)

    request_schema = JSON3.read(read(REQUEST_SCHEMA_PATH, String))
    response_schema = JSON3.read(read(RESPONSE_SCHEMA_PATH, String))
    @test request_schema[Symbol("\$schema")] == "https://json-schema.org/draft/2020-12/schema"
    @test request_schema[Symbol("\$id")] == "urn:learning-julia:p2:selection-count-api-request:1"
    @test response_schema[Symbol("\$id")] == "urn:learning-julia:p2:selection-count-api-response:1"
    @test response_schema.properties.report_bundle[Symbol("\$ref")] ==
        "selection-count-report-v1.schema.json"

    @testset "temporary request-response round trip" begin
        mktempdir() do output_dir
            artifacts = write_api_fixtures(output_dir, request)
            restored_request, restored_bytes = read_api_request(artifacts.request_path)
            restored_response = read_api_response(artifacts.response_path)
            @test validate_api_exchange(restored_bytes, restored_response)
            @test restored_request.request_id == request.request_id
            @test artifacts.request_sha256 == restored_response.request_sha256
            @test length(artifacts.response_sha256) == 64
            @test_throws ArgumentError write_api_fixtures(output_dir, request)
        end
    end

    @testset "checked-in Julia-generated fixtures" begin
        fixture_request_path = joinpath(
            FIXTURE_DIR, "selection-count-api-v1-request.json",
        )
        fixture_response_path = joinpath(
            FIXTURE_DIR, "selection-count-api-v1-response.json",
        )
        fixture_request, fixture_bytes = read_api_request(fixture_request_path)
        fixture_response = read_api_response(fixture_response_path)
        @test validate_api_exchange(fixture_bytes, fixture_response)
        @test JSON3.write(fixture_request) == String(bytes)
        @test fixture_response.request_sha256 == bytes2hex(sha256(fixture_bytes))
    end

    @testset "request and response tampering stops execution" begin
        input = request.input_contract
        @test_throws ArgumentError validate_api_request(merge(
            request,
            (input_contract = merge(input, (selected_count = 42,)),),
        ))
        outside_values = copy(input.selected_values)
        outside_values[1] = input.upper_boundary
        @test_throws ArgumentError validate_api_request(merge(
            request,
            (input_contract = merge(input, (selected_values = outside_values,)),),
        ))
        false_assumption = merge(
            input.assumptions_confirmed, (boundary_precommitted = false,),
        )
        @test_throws ArgumentError validate_api_request(merge(
            request,
            (input_contract = merge(input, (assumptions_confirmed = false_assumption,)),),
        ))
        @test_throws ArgumentError validate_api_request(merge(
            request,
            (analysis_options = merge(
                request.analysis_options, (bootstrap_repetitions = 98,),
            ),),
        ))
        @test_throws ArgumentError validate_api_response(merge(
            response, (request_sha256 = repeat("0", 63),),
        ))
        @test_throws ArgumentError validate_api_exchange(
            vcat(bytes, UInt8(' ')), response,
        )
        @test_throws ArgumentError validate_api_response(merge(
            response,
            (engine = merge(response.engine, (generated_at_utc = "2026-08-10",)),),
        ))
    end
end

println("P2_SELECTION_COUNT_API_BOUNDARY_CHECK_PASS")
