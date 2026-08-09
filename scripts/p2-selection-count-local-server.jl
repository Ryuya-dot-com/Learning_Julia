module P2SelectionCountLocalServer

# Loopback-only research server. It accepts exactly one checked-in synthetic
# request SHA and delegates computation to a killable Julia child process.
using Base64
using HTTP
using JSON3
using Random
using SHA
using ..P2SelectionCountAPICore
using ..P2SelectionCountReportIO

export API_PATH,
       HEALTH_PATH,
       MAX_BODY_BYTES,
       REQUEST_MEDIA_TYPE,
       RESPONSE_MEDIA_TYPE,
       SESSION_MEDIA_TYPE,
       SESSION_PATH,
       ExecutionResult,
       LocalServerState,
       execute_in_subprocess,
       local_server_handler,
       start_local_server,
       stop_local_server

const API_PATH = "/Learning_Julia/api/research/p2/selection-count-report"
const SESSION_PATH = "/Learning_Julia/api/research/p2/session"
const HEALTH_PATH = "/Learning_Julia/api/research/p2/health"
const REQUEST_MEDIA_TYPE = "application/vnd.learning-julia.p2.selection-count-api-request+json"
const RESPONSE_MEDIA_TYPE = "application/vnd.learning-julia.p2.selection-count-api-response+json"
const SESSION_MEDIA_TYPE = "application/vnd.learning-julia.p2.local-session+json"
const PROBLEM_MEDIA_TYPE = "application/problem+json"
const MAX_BODY_BYTES = 1_048_576
const MAX_RESPONSE_BYTES = 1_048_576
const SESSION_COOKIE = "p2_session"
const SESSION_COOKIE_PATH = "/Learning_Julia/api/research/p2"
const DEFAULT_PROJECT_DIR = normpath(joinpath(@__DIR__, "..", "validation", "p2-likelihood"))
const DEFAULT_WORKER_PATH = joinpath(@__DIR__, "p2-selection-count-api-worker.jl")
const DEFAULT_REQUEST_FIXTURE = normpath(joinpath(
    @__DIR__, "..", "validation", "p2-likelihood", "fixtures",
    "selection-count-api-v1-request.json",
))

struct ExecutionResult
    status::Symbol
    body::Vector{UInt8}
end

mutable struct LocalSession
    csrf_sha256::String
    expires_at::Float64
    window_started_at::Float64
    request_count::Int
end

mutable struct LocalServerState
    lock::ReentrantLock
    sessions::Dict{String, LocalSession}
    allowed_origin::String
    allowed_request_sha256::String
    active_jobs::Int
    max_concurrent_jobs::Int
    rate_limit::Int
    rate_window_seconds::Float64
    session_ttl_seconds::Int
    worker_timeout_seconds::Float64
    secure_cookie::Bool
    clock::Function
    executor::Function
end

struct LocalReply
    status::Int
    headers::Vector{Pair{String, String}}
    body::Vector{UInt8}
end

struct BodyTooLarge <: Exception end

function default_worker_command()
    `$(Base.julia_cmd()) --startup-file=no --project=$(DEFAULT_PROJECT_DIR) $(DEFAULT_WORKER_PATH)`
end

function terminate_process!(process)
    process_exited(process) && return
    try
        kill(process)
    catch
    end
    timedwait(() -> process_exited(process), 1.0; pollint = 0.01)
    if !process_exited(process)
        try
            kill(process, Base.SIGKILL)
        catch
        end
        timedwait(() -> process_exited(process), 1.0; pollint = 0.01)
    end
    try
        wait(process)
    catch
    end
end

function execute_in_subprocess(
    exact_request_bytes::Vector{UInt8};
    timeout_seconds::Real = 120.0,
    command = default_worker_command(),
)
    0 < timeout_seconds <= 300 || throw(ArgumentError(
        "worker timeoutは0より大きく300秒以下にしてください",
    ))
    length(exact_request_bytes) <= MAX_BODY_BYTES ||
        return ExecutionResult(:request_too_large, UInt8[])
    mktempdir() do directory
        request_path = joinpath(directory, "request.json")
        response_path = joinpath(directory, "response.json")
        open(request_path, "w") do io
            write(io, exact_request_bytes)
        end
        chmod(request_path, 0o600)
        chmod(directory, 0o700)
        process = open(request_path, "r") do input
            open(response_path, "w") do output
                run(pipeline(command; stdin = input, stdout = output, stderr = devnull); wait = false)
            end
        end
        wait_status = timedwait(
            () -> process_exited(process),
            Float64(timeout_seconds);
            pollint = 0.01,
        )
        if wait_status == :timed_out
            terminate_process!(process)
            return ExecutionResult(:timeout, UInt8[])
        end
        try
            wait(process)
        catch
        end
        success(process) || return ExecutionResult(:failed, UInt8[])
        isfile(response_path) || return ExecutionResult(:failed, UInt8[])
        filesize(response_path) <= MAX_RESPONSE_BYTES ||
            return ExecutionResult(:response_too_large, UInt8[])
        output = read(response_path)
        try
            parsed = JSON3.read(output)
            validate_api_response(parsed)
            validate_api_exchange(exact_request_bytes, parsed)
        catch
            return ExecutionResult(:invalid_response, UInt8[])
        end
        ExecutionResult(:ok, output)
    end
end

function LocalServerState(;
    allowed_origin = "",
    allowed_request_path = DEFAULT_REQUEST_FIXTURE,
    max_concurrent_jobs = 1,
    rate_limit = 3,
    rate_window_seconds = 60.0,
    session_ttl_seconds = 900,
    worker_timeout_seconds = 120.0,
    secure_cookie = false,
    clock = time,
    executor = bytes -> execute_in_subprocess(
        bytes; timeout_seconds = worker_timeout_seconds,
    ),
)
    max_concurrent_jobs == 1 || throw(ArgumentError(
        "research serverの同時計算数は1だけを許可します",
    ))
    rate_limit >= 1 || throw(ArgumentError("rate_limitは1以上にしてください"))
    rate_window_seconds > 0 || throw(ArgumentError("rate windowは正にしてください"))
    session_ttl_seconds in 60:3600 || throw(ArgumentError(
        "session TTLは60〜3600秒にしてください",
    ))
    0 < worker_timeout_seconds <= 300 || throw(ArgumentError(
        "worker timeoutは0より大きく300秒以下にしてください",
    ))
    fixture_bytes = read(allowed_request_path)
    parsed = JSON3.read(fixture_bytes)
    validate_api_request(parsed)
    LocalServerState(
        ReentrantLock(),
        Dict{String, LocalSession}(),
        String(allowed_origin),
        bytes2hex(sha256(fixture_bytes)),
        0,
        max_concurrent_jobs,
        rate_limit,
        Float64(rate_window_seconds),
        session_ttl_seconds,
        Float64(worker_timeout_seconds),
        secure_cookie,
        clock,
        executor,
    )
end

function common_headers(content_type)
    Pair{String, String}[
        "Content-Type" => content_type,
        "Cache-Control" => "no-store",
        "X-Content-Type-Options" => "nosniff",
        "Referrer-Policy" => "no-referrer",
        "Cross-Origin-Resource-Policy" => "same-origin",
    ]
end

function json_reply(status, value; content_type = "application/json", headers = Pair{String, String}[])
    body = Vector{UInt8}(codeunits(JSON3.write(value)))
    LocalReply(
        Int(status),
        vcat(
            common_headers(content_type),
            Pair{String, String}[String(first(pair)) => String(last(pair)) for pair in headers],
        ),
        body,
    )
end

function problem_reply(status, code, title; retryable = false, retry_after = nothing)
    headers = Pair{String, String}[]
    isnothing(retry_after) || push!(headers, "Retry-After" => string(retry_after))
    json_reply(
        status,
        (
            type = "urn:learning-julia:p2:problem:$(code)",
            title = String(title),
            status = Int(status),
            code = String(code),
            retryable = Bool(retryable),
        );
        content_type = PROBLEM_MEDIA_TYPE,
        headers,
    )
end

function token_urlsafe(bytes = 32)
    token = base64encode(rand(RandomDevice(), UInt8, bytes))
    replace(rstrip(token, '='), '+' => '-', '/' => '_')
end

token_sha256(token) = bytes2hex(sha256(codeunits(token)))

function constant_time_equal(left::AbstractString, right::AbstractString)
    ncodeunits(left) == ncodeunits(right) || return false
    difference = UInt8(0)
    for (a, b) in zip(codeunits(left), codeunits(right))
        difference |= xor(a, b)
    end
    iszero(difference)
end

function cookie_value(request, name)
    raw = HTTP.header(request, "Cookie", nothing)
    isnothing(raw) && return nothing
    for item in split(raw, ';')
        parts = split(strip(item), '='; limit = 2)
        length(parts) == 2 && parts[1] == name && return parts[2]
    end
    nothing
end

function session_cookie(token, state; delete = false)
    cookie = HTTP.Cookies.Cookie(
        SESSION_COOKIE,
        token;
        path = SESSION_COOKIE_PATH,
        maxage = delete ? -1 : state.session_ttl_seconds,
        secure = state.secure_cookie,
        httponly = true,
        samesite = :strict,
    )
    HTTP.Cookies.stringify(cookie, false)
end

function origin_allowed(state, request)
    !isempty(state.allowed_origin) &&
        HTTP.header(request, "Origin", nothing) == state.allowed_origin &&
        HTTP.header(request, "Sec-Fetch-Site", nothing) == "same-origin"
end

function issue_session!(state)
    session_token = token_urlsafe()
    csrf_token = token_urlsafe()
    now_value = Float64(state.clock())
    lock(state.lock) do
        state.sessions[token_sha256(session_token)] = LocalSession(
            token_sha256(csrf_token),
            now_value + state.session_ttl_seconds,
            now_value,
            0,
        )
    end
    session_token, csrf_token
end

function authenticate_session(state, request; consume_rate = false)
    token = cookie_value(request, SESSION_COOKIE)
    isnothing(token) && return (status = :missing, retry_after = 0)
    csrf = HTTP.header(request, "X-CSRF-Token", nothing)
    isnothing(csrf) && return (status = :csrf, retry_after = 0)
    key = token_sha256(token)
    now_value = Float64(state.clock())
    lock(state.lock) do
        session = get(state.sessions, key, nothing)
        isnothing(session) && return (status = :missing, retry_after = 0)
        if now_value >= session.expires_at
            delete!(state.sessions, key)
            return (status = :expired, retry_after = 0)
        end
        constant_time_equal(session.csrf_sha256, token_sha256(csrf)) ||
            return (status = :csrf, retry_after = 0)
        if consume_rate
            if now_value - session.window_started_at >= state.rate_window_seconds
                session.window_started_at = now_value
                session.request_count = 0
            end
            if session.request_count >= state.rate_limit
                retry_after = max(1, ceil(Int, state.rate_window_seconds - (now_value - session.window_started_at)))
                return (status = :rate_limited, retry_after)
            end
            session.request_count += 1
        end
        (status = :ok, retry_after = 0)
    end
end

function delete_session!(state, request)
    token = cookie_value(request, SESSION_COOKIE)
    isnothing(token) && return
    lock(state.lock) do
        delete!(state.sessions, token_sha256(token))
    end
end

function begin_job!(state)
    lock(state.lock) do
        state.active_jobs >= state.max_concurrent_jobs && return false
        state.active_jobs += 1
        true
    end
end

function end_job!(state)
    lock(state.lock) do
        state.active_jobs = max(0, state.active_jobs - 1)
    end
end

function session_error_reply(result)
    result.status in (:missing, :expired) && return problem_reply(
        401, "auth_required", "有効なlocal research sessionが必要です",
    )
    result.status == :csrf && return problem_reply(
        403, "forbidden_or_csrf", "CSRF tokenが一致しません",
    )
    result.status == :rate_limited && return problem_reply(
        429,
        "rate_limited",
        "sessionの計算回数上限に達しました";
        retryable = true,
        retry_after = result.retry_after,
    )
    nothing
end

function validate_transport_headers(request)
    content_type = HTTP.header(request, "Content-Type", "")
    startswith(lowercase(content_type), lowercase(REQUEST_MEDIA_TYPE)) ||
        return problem_reply(415, "invalid_content_type", "request media typeが不正です")
    occursin(RESPONSE_MEDIA_TYPE, HTTP.header(request, "Accept", "")) ||
        return problem_reply(406, "unsupported_media_type", "response media typeを提供できません")
    HTTP.header(request, "X-Learning-Julia-API-Version", nothing) == API_SCHEMA_VERSION ||
        return problem_reply(426, "unsupported_version", "API versionを提供できません")
    HTTP.header(request, "X-Learning-Julia-Report-Version", nothing) == P2SelectionCountReportIO.SCHEMA_VERSION ||
        return problem_reply(426, "unsupported_version", "report versionを提供できません")
    nothing
end

function handle_session(state, request, body)
    origin_allowed(state, request) || return problem_reply(
        403, "origin_forbidden", "同一origin requestだけを許可します",
    )
    isempty(body) || return problem_reply(400, "session_body_forbidden", "session開始にbodyは使いません")
    session_token, csrf_token = issue_session!(state)
    response = json_reply(
        201,
        (
            schema_id = "learning-julia.p2.selection-count-local-session",
            schema_version = API_SCHEMA_VERSION,
            csrf_token,
            expires_in_seconds = state.session_ttl_seconds,
            api_version = API_SCHEMA_VERSION,
            report_version = P2SelectionCountReportIO.SCHEMA_VERSION,
            scope = "synthetic_fixture_only",
        );
        content_type = SESSION_MEDIA_TYPE,
        headers = ["Set-Cookie" => session_cookie(session_token, state)],
    )
    response
end

function handle_delete_session(state, request, body)
    origin_allowed(state, request) || return problem_reply(
        403, "origin_forbidden", "同一origin requestだけを許可します",
    )
    isempty(body) || return problem_reply(400, "session_body_forbidden", "session終了にbodyは使いません")
    auth = authenticate_session(state, request)
    error_response = session_error_reply(auth)
    isnothing(error_response) || return error_response
    delete_session!(state, request)
    LocalReply(
        204,
        vcat(common_headers("application/json"), [
            "Set-Cookie" => session_cookie("deleted", state; delete = true),
        ]),
        UInt8[],
    )
end

function handle_compute(state, request, body)
    origin_allowed(state, request) || return problem_reply(
        403, "origin_forbidden", "同一origin requestだけを許可します",
    )
    header_error = validate_transport_headers(request)
    isnothing(header_error) || return header_error
    auth = authenticate_session(state, request)
    error_response = session_error_reply(auth)
    isnothing(error_response) || return error_response
    request_id = HTTP.header(request, "X-Request-ID", nothing)
    isnothing(request_id) && return problem_reply(
        400, "request_id_missing", "X-Request-IDが必要です",
    )
    parsed = try
        JSON3.read(body)
    catch
        return problem_reply(400, "invalid_json", "request bodyをJSONとして読めません")
    end
    try
        validate_api_request(parsed)
    catch
        return problem_reply(422, "invalid_request", "request schemaまたは意味契約が不正です")
    end
    parsed.request_id == request_id || return problem_reply(
        409, "request_mismatch", "headerとbodyのrequest IDが一致しません",
    )
    body_sha = bytes2hex(sha256(body))
    constant_time_equal(body_sha, state.allowed_request_sha256) || return problem_reply(
        422,
        "synthetic_fixture_only",
        "research serverはchecked-in合成requestだけを実行します",
    )
    auth = authenticate_session(state, request; consume_rate = true)
    error_response = session_error_reply(auth)
    isnothing(error_response) || return error_response
    begin_job!(state) || return problem_reply(
        429,
        "server_busy",
        "別の合成計算を実行中です";
        retryable = true,
        retry_after = 1,
    )
    result = try
        state.executor(body)
    catch
        ExecutionResult(:failed, UInt8[])
    finally
        end_job!(state)
    end
    result.status == :timeout && return problem_reply(
        504, "worker_timeout", "Julia workerが期限内に終了しませんでした";
        retryable = true,
    )
    result.status == :response_too_large && return problem_reply(
        502, "worker_response_too_large", "Julia worker responseが上限を超えました",
    )
    result.status == :ok || return problem_reply(
        500, "worker_failed", "Julia workerが検証可能なresponseを返しませんでした",
    )
    parsed_response = try
        JSON3.read(result.body)
    catch
        return problem_reply(502, "invalid_worker_response", "Julia worker responseを読めません")
    end
    try
        validate_api_exchange(body, parsed_response)
    catch
        return problem_reply(502, "invalid_worker_response", "Julia worker responseの照合に失敗しました")
    end
    LocalReply(
        200,
        vcat(common_headers(RESPONSE_MEDIA_TYPE), [
            "X-Learning-Julia-API-Version" => API_SCHEMA_VERSION,
            "X-Learning-Julia-Report-Version" => P2SelectionCountReportIO.SCHEMA_VERSION,
            "X-Request-ID" => String(request_id),
        ]),
        result.body,
    )
end

function dispatch_request(state, request, body)
    method = String(request.method)
    target = String(request.target)
    if method == "GET" && target == HEALTH_PATH
        return json_reply(200, (
            status = "ok",
            scope = "loopback_synthetic_fixture_only",
            endpoint_status = "local_research_only",
            api_version = API_SCHEMA_VERSION,
        ))
    elseif method == "POST" && target == SESSION_PATH
        return handle_session(state, request, body)
    elseif method == "DELETE" && target == SESSION_PATH
        return handle_delete_session(state, request, body)
    elseif method == "POST" && target == API_PATH
        return handle_compute(state, request, body)
    elseif target in (HEALTH_PATH, SESSION_PATH, API_PATH)
        return problem_reply(405, "method_not_allowed", "HTTP methodが不正です")
    end
    problem_reply(404, "not_found", "研究API routeがありません")
end

function read_body_bounded(stream, request)
    request.content_length > MAX_BODY_BYTES && throw(BodyTooLarge())
    output = IOBuffer()
    buffer = Vector{UInt8}(undef, 16 * 1024)
    total = 0
    while !eof(stream)
        n = readbytes!(stream, buffer, length(buffer))
        n == 0 && break
        total += n
        total > MAX_BODY_BYTES && throw(BodyTooLarge())
        write(output, @view(buffer[1:n]))
    end
    take!(output)
end

function write_reply(stream, reply)
    HTTP.setstatus(stream, reply.status)
    for (name, value) in reply.headers
        HTTP.setheader(stream, name, value)
    end
    HTTP.setheader(stream, "Content-Length", string(length(reply.body)))
    isempty(reply.body) || write(stream, reply.body)
    HTTP.closewrite(stream)
    HTTP.closeread(stream)
    nothing
end

function local_server_handler(state)
    function handler(stream)
        request = HTTP.startread(stream)
        reply = try
            body = read_body_bounded(stream, request)
            dispatch_request(state, request, body)
        catch error
            if error isa BodyTooLarge
                problem_reply(413, "request_too_large", "request bodyが上限1 MiBを超えました")
            else
                problem_reply(500, "internal_error", "研究server内部で停止しました")
            end
        end
        write_reply(stream, reply)
    end
end

function start_local_server(;
    host = "127.0.0.1",
    port = 0,
    allowed_origin = nothing,
    state = nothing,
)
    host == "127.0.0.1" || throw(ArgumentError(
        "research serverは127.0.0.1だけへbindできます",
    ))
    0 <= port <= 65_535 || throw(ArgumentError("portが範囲外です"))
    local_state = isnothing(state) ? LocalServerState() : state
    server = HTTP.listen!(
        local_server_handler(local_state),
        host,
        port;
        listenany = port == 0,
        read_header_timeout = 5.0,
        read_timeout = 10.0,
        write_timeout = 10.0,
        idle_timeout = 15.0,
        max_header_bytes = 32 * 1024,
        backlog = 16,
    )
    bound_origin = "http://$(host):$(HTTP.port(server))"
    local_state.allowed_origin = isnothing(allowed_origin) ? bound_origin : String(allowed_origin)
    (
        server,
        state = local_state,
        origin = bound_origin,
        health_url = bound_origin * HEALTH_PATH,
        session_url = bound_origin * SESSION_PATH,
        api_url = bound_origin * API_PATH,
    )
end

stop_local_server(handle) = HTTP.forceclose(handle.server)

end
