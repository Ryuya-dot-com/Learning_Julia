module P2SelectionCountAPICore

# Pure Julia core for the research-only HTTP boundary. An HTTP server may pass
# the exact request bytes to `execute_api_request`; this module deliberately
# owns no socket, credential, logging, or deployment behavior.
using Dates
using JSON3
using Random
using SHA
using ..P2LikelihoodContracts
using ..P2SelectionCountReportIO

export API_REQUEST_SCHEMA_ID,
       API_RESPONSE_SCHEMA_ID,
       API_SCHEMA_VERSION,
       build_api_request,
       execute_api_request,
       read_api_request,
       read_api_response,
       request_bytes,
       validate_api_exchange,
       validate_api_request,
       validate_api_response,
       write_api_fixtures

const API_REQUEST_SCHEMA_ID = "learning-julia.p2.selection-count-api-request"
const API_RESPONSE_SCHEMA_ID = "learning-julia.p2.selection-count-api-response"
const API_SCHEMA_VERSION = "1.0.0"
const PROJECT_ENVIRONMENT = "validation/p2-likelihood"
const REQUEST_KEYS = Set((
    "schema_id", "schema_version", "request_id", "model_scope",
    "input_contract", "analysis_options",
))
const SCOPE_KEYS = Set((
    "family", "selection_rule", "automatic_interval_selection",
))
const INPUT_KEYS = Set((
    "total_screened", "selected_count", "lower_boundary", "upper_boundary",
    "boundary_rule", "selected_values", "assumptions_confirmed",
))
const ASSUMPTION_KEYS = Set((
    "boundary_precommitted", "same_boundary", "same_population",
    "independent_rows", "exact_selected_values", "excluded_confirmed_outside",
))
const OPTION_KEYS = Set((
    "random_seed", "bootstrap_repetitions",
    "minimum_bootstrap_success_rate", "profile_max_expansions",
))
const RESPONSE_KEYS = Set((
    "schema_id", "schema_version", "request_id", "request_sha256",
    "engine", "report_bundle",
))
const ENGINE_KEYS = Set((
    "julia_version", "project_environment", "manifest_sha256",
    "report_schema_version", "generated_at_utc",
))
const REQUEST_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$"
const SHA256_PATTERN = r"^[a-f0-9]{64}$"
const DEFAULT_MANIFEST_PATH = normpath(joinpath(
    @__DIR__, "..", "validation", "p2-likelihood", "Manifest.toml",
))

field(value, key::Symbol) = getproperty(value, key)

function exact_keys(value, expected, label)
    actual = Set(string.(keys(value)))
    actual == expected || throw(ArgumentError(
        "$(label)のkeyがschemaと一致しません: $(sort!(collect(actual)))",
    ))
end

function validate_scope(scope)
    exact_keys(scope, SCOPE_KEYS, "model_scope")
    field(scope, :family) == "Normal" ||
        throw(ArgumentError("APIはNormal family専用です"))
    field(scope, :selection_rule) == "strict_open_interval" ||
        throw(ArgumentError("selection_ruleが不正です"))
    field(scope, :automatic_interval_selection) === false ||
        throw(ArgumentError("automatic interval selectionを有効化できません"))
    true
end

function validate_input(input)
    exact_keys(input, INPUT_KEYS, "input_contract")
    total = field(input, :total_screened)
    selected = field(input, :selected_count)
    lower = field(input, :lower_boundary)
    upper = field(input, :upper_boundary)
    values = field(input, :selected_values)
    total isa Integer && !(total isa Bool) && total >= 2 ||
        throw(ArgumentError("total_screenedは2以上の整数にしてください"))
    selected isa Integer && !(selected isa Bool) && 2 <= selected <= total ||
        throw(ArgumentError("selected_countは2以上N以下の整数にしてください"))
    lower isa Real && upper isa Real && isfinite(lower) && isfinite(upper) && lower < upper ||
        throw(ArgumentError("境界は有限かつlower < upperにしてください"))
    field(input, :boundary_rule) == "lower < value < upper" ||
        throw(ArgumentError("boundary_ruleが不正です"))
    length(values) == selected ||
        throw(ArgumentError("selected_countとselected_valuesの長さが一致しません"))
    all(value -> value isa Real && isfinite(value), values) ||
        throw(ArgumentError("selected_valuesには有限数だけを使ってください"))
    all(value -> lower < value < upper, values) ||
        throw(ArgumentError("selected_valuesは全件、事前境界の内側に置いてください"))

    assumptions = field(input, :assumptions_confirmed)
    exact_keys(assumptions, ASSUMPTION_KEYS, "assumptions_confirmed")
    all(key -> field(assumptions, Symbol(key)) === true, ASSUMPTION_KEYS) ||
        throw(ArgumentError("観測契約を確認できないrequestは実行しません"))
    true
end

function validate_options(options)
    exact_keys(options, OPTION_KEYS, "analysis_options")
    seed = field(options, :random_seed)
    repetitions = field(options, :bootstrap_repetitions)
    minimum = field(options, :minimum_bootstrap_success_rate)
    expansions = field(options, :profile_max_expansions)
    seed isa Integer && !(seed isa Bool) && 0 <= seed <= typemax(UInt32) ||
        throw(ArgumentError("random_seedはUInt32範囲の整数にしてください"))
    repetitions isa Integer && !(repetitions isa Bool) && 99 <= repetitions <= 9_999 ||
        throw(ArgumentError("bootstrap_repetitionsは99以上9999以下にしてください"))
    minimum isa Real && isfinite(minimum) && 0 < minimum <= 1 ||
        throw(ArgumentError("minimum_bootstrap_success_rateは0より大きく1以下にしてください"))
    expansions isa Integer && !(expansions isa Bool) && 0 <= expansions <= 50 ||
        throw(ArgumentError("profile_max_expansionsは0以上50以下にしてください"))
    true
end

function validate_api_request(request)
    exact_keys(request, REQUEST_KEYS, "API request")
    field(request, :schema_id) == API_REQUEST_SCHEMA_ID ||
        throw(ArgumentError("request schema_idが不正です"))
    field(request, :schema_version) == API_SCHEMA_VERSION ||
        throw(ArgumentError("未対応のrequest schema_versionです"))
    request_id = String(field(request, :request_id))
    occursin(REQUEST_ID_PATTERN, request_id) ||
        throw(ArgumentError("request_idは64文字以内の安全な識別子にしてください"))
    validate_scope(field(request, :model_scope))
    validate_input(field(request, :input_contract))
    validate_options(field(request, :analysis_options))
    true
end

function build_api_request(
    request_id,
    selected_values,
    total_screened;
    lower,
    upper,
    random_seed,
    bootstrap_repetitions = 999,
    minimum_bootstrap_success_rate = 0.9,
    profile_max_expansions = 14,
)
    request = (
        schema_id = API_REQUEST_SCHEMA_ID,
        schema_version = API_SCHEMA_VERSION,
        request_id = String(request_id),
        model_scope = (
            family = "Normal",
            selection_rule = "strict_open_interval",
            automatic_interval_selection = false,
        ),
        input_contract = (
            total_screened = Int(total_screened),
            selected_count = length(selected_values),
            lower_boundary = Float64(lower),
            upper_boundary = Float64(upper),
            boundary_rule = "lower < value < upper",
            selected_values = Float64.(selected_values),
            assumptions_confirmed = (
                boundary_precommitted = true,
                same_boundary = true,
                same_population = true,
                independent_rows = true,
                exact_selected_values = true,
                excluded_confirmed_outside = true,
            ),
        ),
        analysis_options = (
            random_seed = Int(random_seed),
            bootstrap_repetitions = Int(bootstrap_repetitions),
            minimum_bootstrap_success_rate = Float64(minimum_bootstrap_success_rate),
            profile_max_expansions = Int(profile_max_expansions),
        ),
    )
    validate_api_request(request)
    request
end

request_bytes(request) = Vector{UInt8}(codeunits(JSON3.write(request)))
request_sha256(bytes::AbstractVector{UInt8}) = bytes2hex(sha256(bytes))

function validate_generated_at(value)
    text = String(value)
    endswith(text, "Z") || throw(ArgumentError("generated_at_utcはUTCのZ表記にしてください"))
    try
        DateTime(chop(text; tail = 1))
    catch
        throw(ArgumentError("generated_at_utcがISO 8601形式ではありません"))
    end
    true
end

function validate_api_response(response)
    exact_keys(response, RESPONSE_KEYS, "API response")
    field(response, :schema_id) == API_RESPONSE_SCHEMA_ID ||
        throw(ArgumentError("response schema_idが不正です"))
    field(response, :schema_version) == API_SCHEMA_VERSION ||
        throw(ArgumentError("未対応のresponse schema_versionです"))
    request_id = String(field(response, :request_id))
    occursin(REQUEST_ID_PATTERN, request_id) ||
        throw(ArgumentError("response request_idが不正です"))
    occursin(SHA256_PATTERN, String(field(response, :request_sha256))) ||
        throw(ArgumentError("request_sha256が不正です"))

    engine = field(response, :engine)
    exact_keys(engine, ENGINE_KEYS, "engine")
    isempty(String(field(engine, :julia_version))) &&
        throw(ArgumentError("julia_versionが空です"))
    field(engine, :project_environment) == PROJECT_ENVIRONMENT ||
        throw(ArgumentError("project_environmentが不正です"))
    occursin(SHA256_PATTERN, String(field(engine, :manifest_sha256))) ||
        throw(ArgumentError("manifest_sha256が不正です"))
    field(engine, :report_schema_version) == P2SelectionCountReportIO.SCHEMA_VERSION ||
        throw(ArgumentError("report_schema_versionが不正です"))
    validate_generated_at(field(engine, :generated_at_utc))

    bundle = field(response, :report_bundle)
    validate_report_bundle(bundle)
    length(field(bundle, :reports)) == 1 ||
        throw(ArgumentError("API responseにはrequestごとに1 reportだけを返してください"))
    field(field(bundle, :reports)[1], :report_id) == request_id ||
        throw(ArgumentError("request_idとreport_idが一致しません"))
    true
end

function validate_api_exchange(bytes::AbstractVector{UInt8}, response)
    request = JSON3.read(bytes)
    validate_api_request(request)
    validate_api_response(response)
    field(response, :request_id) == field(request, :request_id) ||
        throw(ArgumentError("requestとresponseのrequest_idが一致しません"))
    field(response, :request_sha256) == request_sha256(bytes) ||
        throw(ArgumentError("responseが送信requestのSHA-256と一致しません"))
    input = field(request, :input_contract)
    report_input = field(field(field(response, :report_bundle), :reports)[1], :input_contract)
    for key in (:total_screened, :selected_count, :lower_boundary, :upper_boundary, :boundary_rule)
        field(input, key) == field(report_input, key) ||
            throw(ArgumentError("responseのinput_contractがrequestと一致しません: $(key)"))
    end
    true
end

function execute_api_request(
    request;
    exact_request_bytes = request_bytes(request),
    generated_at_utc = Dates.format(now(UTC), dateformat"yyyy-mm-ddTHH:MM:SS.sssZ"),
    manifest_path = DEFAULT_MANIFEST_PATH,
)
    validate_api_request(request)
    parsed_from_bytes = JSON3.read(exact_request_bytes)
    validate_api_request(parsed_from_bytes)
    JSON3.write(parsed_from_bytes) == JSON3.write(request) ||
        throw(ArgumentError("exact_request_bytesとrequest objectが一致しません"))

    input = field(request, :input_contract)
    options = field(request, :analysis_options)
    report = selection_count_interval_report(
        Xoshiro(field(options, :random_seed)),
        Float64.(field(input, :selected_values)),
        field(input, :total_screened);
        lower = field(input, :lower_boundary),
        upper = field(input, :upper_boundary),
        bootstrap_repetitions = field(options, :bootstrap_repetitions),
        minimum_bootstrap_success_rate = field(options, :minimum_bootstrap_success_rate),
        profile_max_expansions = field(options, :profile_max_expansions),
    )
    record = interval_report_record(
        field(request, :request_id), report;
        total_screened = field(input, :total_screened),
        selected_count = field(input, :selected_count),
        lower = field(input, :lower_boundary),
        upper = field(input, :upper_boundary),
    )
    response = (
        schema_id = API_RESPONSE_SCHEMA_ID,
        schema_version = API_SCHEMA_VERSION,
        request_id = String(field(request, :request_id)),
        request_sha256 = request_sha256(exact_request_bytes),
        engine = (
            julia_version = string(VERSION),
            project_environment = PROJECT_ENVIRONMENT,
            manifest_sha256 = bytes2hex(open(sha256, manifest_path)),
            report_schema_version = P2SelectionCountReportIO.SCHEMA_VERSION,
            generated_at_utc = String(generated_at_utc),
        ),
        report_bundle = build_report_bundle([record]),
    )
    validate_api_exchange(exact_request_bytes, response)
    response
end

function read_api_request(path)
    bytes = read(path)
    request = JSON3.read(bytes)
    validate_api_request(request)
    (request, bytes)
end

function read_api_response(path)
    response = JSON3.read(read(path))
    validate_api_response(response)
    response
end

function write_api_fixtures(
    output_dir,
    request;
    basename = "selection-count-api-v1",
    generated_at_utc = "2026-08-10T00:00:00.000Z",
)
    validate_api_request(request)
    occursin(r"^[A-Za-z0-9._-]+$", basename) ||
        throw(ArgumentError("basenameには英数字・dot・underscore・hyphenだけを使ってください"))
    mkpath(output_dir)
    request_path = joinpath(output_dir, "$(basename)-request.json")
    response_path = joinpath(output_dir, "$(basename)-response.json")
    any(ispath, (request_path, response_path)) &&
        throw(ArgumentError("既存API fixtureを上書きしません: $(basename)"))
    bytes = request_bytes(request)
    response = execute_api_request(
        request; exact_request_bytes = bytes, generated_at_utc,
    )
    open(request_path, "w") do io
        write(io, bytes)
    end
    open(response_path, "w") do io
        JSON3.pretty(io, response)
        write(io, '\n')
    end
    (
        request_path,
        response_path,
        request_sha256 = request_sha256(bytes),
        response_sha256 = bytes2hex(open(sha256, response_path)),
    )
end

end
