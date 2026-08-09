#!/usr/bin/env julia

# Actual loopback HTTP tests for the research-only selection-count service.
using HTTP
using JSON3
using Test

include(joinpath(@__DIR__, "p2-likelihood-contracts.jl"))
include(joinpath(@__DIR__, "p2-selection-count-report-io.jl"))
include(joinpath(@__DIR__, "p2-selection-count-api-core.jl"))
include(joinpath(@__DIR__, "p2-selection-count-local-server.jl"))
using .P2SelectionCountAPICore
using .P2SelectionCountLocalServer
using .P2SelectionCountReportIO

const ROOT = normpath(joinpath(@__DIR__, ".."))
const REQUEST_PATH = joinpath(
    ROOT, "validation", "p2-likelihood", "fixtures",
    "selection-count-api-v1-request.json",
)
const REQUEST_BYTES = read(REQUEST_PATH)

function send(method, url; headers = Pair{String, String}[], body = UInt8[], timeout = 30.0)
    HTTP.request(
        method,
        url;
        headers,
        body,
        status_exception = false,
        retry = false,
        cookies = false,
        request_timeout = timeout,
        proxy = HTTP.ProxyConfig(),
    )
end

body_json(response) = JSON3.read(String(copy(response.body)))

function create_session(handle)
    response = send(
        "POST",
        handle.session_url;
        headers = [
            "Origin" => handle.state.allowed_origin,
            "Sec-Fetch-Site" => "same-origin",
        ],
    )
    @test response.status == 201
    payload = body_json(response)
    cookie = HTTP.header(response, "Set-Cookie", nothing)
    @test !isnothing(cookie)
    cookie_pair = first(split(cookie, ';'))
    (payload, cookie_pair, cookie)
end

function compute_headers(handle, session; overrides = Pair{String, String}[])
    base = Pair{String, String}[
        "Origin" => handle.state.allowed_origin,
        "Sec-Fetch-Site" => "same-origin",
        "Cookie" => session.cookie_pair,
        "X-CSRF-Token" => String(session.payload.csrf_token),
        "Accept" => "$(RESPONSE_MEDIA_TYPE); version=1.0.0",
        "Content-Type" => "$(REQUEST_MEDIA_TYPE); version=1.0.0; charset=utf-8",
        "X-Learning-Julia-API-Version" => API_SCHEMA_VERSION,
        "X-Learning-Julia-Report-Version" => P2SelectionCountReportIO.SCHEMA_VERSION,
        "X-Request-ID" => "teaching-example-v1",
    ]
    overridden = Set(first.(overrides))
    vcat(filter(pair -> !(first(pair) in overridden), base), overrides)
end

@testset "P2 selection-count loopback HTTP server" begin
    @testset "killable Julia worker" begin
        result = execute_in_subprocess(REQUEST_BYTES; timeout_seconds = 30)
        @test result.status == :ok
        @test length(result.body) < MAX_BODY_BYTES
        @test validate_api_exchange(REQUEST_BYTES, JSON3.read(result.body))

        sleeping_command = Cmd([
            joinpath(Sys.BINDIR, Base.julia_exename()),
            "--startup-file=no",
            "-e",
            "sleep(5)",
        ])
        started = time()
        timed_out = execute_in_subprocess(
            REQUEST_BYTES;
            timeout_seconds = 0.1,
            command = sleeping_command,
        )
        @test timed_out.status == :timeout
        @test time() - started < 3
    end

    successful = execute_in_subprocess(REQUEST_BYTES; timeout_seconds = 30)
    mock_executor = _ -> ExecutionResult(:ok, copy(successful.body))
    state = LocalServerState(
        rate_limit = 2,
        executor = mock_executor,
    )
    handle = start_local_server(state = state)
    try
        @test startswith(handle.origin, "http://127.0.0.1:")
        @test_throws ArgumentError start_local_server(host = "0.0.0.0", state = state)

        health = send("GET", handle.health_url)
        @test health.status == 200
        @test body_json(health).scope == "loopback_synthetic_fixture_only"
        @test HTTP.header(health, "Cache-Control", nothing) == "no-store"
        @test HTTP.header(health, "Cross-Origin-Resource-Policy", nothing) == "same-origin"
        @test isnothing(HTTP.header(health, "Access-Control-Allow-Origin", nothing))

        forbidden_session = send(
            "POST",
            handle.session_url;
            headers = ["Origin" => "https://evil.example"],
        )
        @test forbidden_session.status == 403
        @test body_json(forbidden_session).code == "origin_forbidden"

        missing_fetch_metadata = send(
            "POST",
            handle.session_url;
            headers = ["Origin" => handle.state.allowed_origin],
        )
        @test missing_fetch_metadata.status == 403
        @test body_json(missing_fetch_metadata).code == "origin_forbidden"

        payload, cookie_pair, full_cookie = create_session(handle)
        session = (; payload, cookie_pair)
        @test payload.scope == "synthetic_fixture_only"
        @test payload.api_version == API_SCHEMA_VERSION
        @test occursin("HttpOnly", full_cookie)
        @test occursin("SameSite=Strict", full_cookie)
        @test !occursin("Secure", full_cookie)

        unauthenticated = send(
            "POST",
            handle.api_url;
            headers = filter(
                pair -> first(pair) != "Cookie",
                compute_headers(handle, session),
            ),
            body = REQUEST_BYTES,
        )
        @test unauthenticated.status == 401
        @test body_json(unauthenticated).code == "auth_required"

        wrong_csrf = send(
            "POST",
            handle.api_url;
            headers = compute_headers(handle, session; overrides = [
                "X-CSRF-Token" => "wrong-token",
            ]),
            body = REQUEST_BYTES,
        )
        @test wrong_csrf.status == 403
        @test body_json(wrong_csrf).code == "forbidden_or_csrf"

        wrong_version = send(
            "POST",
            handle.api_url;
            headers = compute_headers(handle, session; overrides = [
                "X-Learning-Julia-API-Version" => "2.0.0",
            ]),
            body = REQUEST_BYTES,
        )
        @test wrong_version.status == 426
        @test body_json(wrong_version).code == "unsupported_version"

        altered = vcat(REQUEST_BYTES, UInt8(' '))
        synthetic_only = send(
            "POST",
            handle.api_url;
            headers = compute_headers(handle, session),
            body = altered,
        )
        @test synthetic_only.status == 422
        @test body_json(synthetic_only).code == "synthetic_fixture_only"

        first_success = send(
            "POST",
            handle.api_url;
            headers = compute_headers(handle, session),
            body = REQUEST_BYTES,
        )
        @test first_success.status == 200
        @test HTTP.header(first_success, "Content-Type", nothing) == RESPONSE_MEDIA_TYPE
        @test HTTP.header(first_success, "X-Request-ID", nothing) == "teaching-example-v1"
        @test validate_api_exchange(REQUEST_BYTES, body_json(first_success))

        second_success = send(
            "POST",
            handle.api_url;
            headers = compute_headers(handle, session),
            body = REQUEST_BYTES,
        )
        @test second_success.status == 200

        limited = send(
            "POST",
            handle.api_url;
            headers = compute_headers(handle, session),
            body = REQUEST_BYTES,
        )
        @test limited.status == 429
        @test body_json(limited).code == "rate_limited"
        @test parse(Int, HTTP.header(limited, "Retry-After", "0")) >= 1

        ended = send(
            "DELETE",
            handle.session_url;
            headers = [
                "Origin" => handle.state.allowed_origin,
                "Sec-Fetch-Site" => "same-origin",
                "Cookie" => cookie_pair,
                "X-CSRF-Token" => String(payload.csrf_token),
            ],
        )
        @test ended.status == 204
        @test occursin("Max-Age=0", HTTP.header(ended, "Set-Cookie", ""))

        after_delete = send(
            "POST",
            handle.api_url;
            headers = compute_headers(handle, session),
            body = REQUEST_BYTES,
        )
        @test after_delete.status == 401

        oversized = send(
            "POST",
            handle.api_url;
            headers = compute_headers(handle, session),
            body = fill(UInt8('x'), MAX_BODY_BYTES + 1),
        )
        @test oversized.status == 413
        @test body_json(oversized).code == "request_too_large"
    finally
        stop_local_server(handle)
    end

    @testset "one active job" begin
        entered = Channel{Nothing}(1)
        release = Channel{Nothing}(1)
        blocking_executor = _ -> begin
            put!(entered, nothing)
            take!(release)
            ExecutionResult(:ok, copy(successful.body))
        end
        busy_state = LocalServerState(rate_limit = 10, executor = blocking_executor)
        busy_handle = start_local_server(state = busy_state)
        try
            payload, cookie_pair, _ = create_session(busy_handle)
            session = (; payload, cookie_pair)
            first_task = @async send(
                "POST",
                busy_handle.api_url;
                headers = compute_headers(busy_handle, session),
                body = REQUEST_BYTES,
            )
            take!(entered)
            busy = send(
                "POST",
                busy_handle.api_url;
                headers = compute_headers(busy_handle, session),
                body = REQUEST_BYTES,
            )
            @test busy.status == 429
            @test body_json(busy).code == "server_busy"
            put!(release, nothing)
            @test fetch(first_task).status == 200
            @test busy_handle.state.active_jobs == 0
        finally
            isready(release) || put!(release, nothing)
            stop_local_server(busy_handle)
        end
    end

    @testset "worker timeout becomes 504" begin
        timeout_state = LocalServerState(
            rate_limit = 10,
            executor = _ -> ExecutionResult(:timeout, UInt8[]),
        )
        timeout_handle = start_local_server(state = timeout_state)
        try
            payload, cookie_pair, _ = create_session(timeout_handle)
            session = (; payload, cookie_pair)
            response = send(
                "POST",
                timeout_handle.api_url;
                headers = compute_headers(timeout_handle, session),
                body = REQUEST_BYTES,
            )
            @test response.status == 504
            @test body_json(response).code == "worker_timeout"
            @test body_json(response).retryable === true
        finally
            stop_local_server(timeout_handle)
        end
    end
end

println("P2_SELECTION_COUNT_LOCAL_SERVER_CHECK_PASS")
