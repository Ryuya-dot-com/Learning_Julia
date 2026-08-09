module P2SelectionCountReportIO

# Research-only exchange and output contract for selection-count reports.
# Official references checked 2026-08-09:
# https://quinnj.github.io/JSON3.jl/dev/
# https://csv.juliadata.org/stable/index.html
# https://csv.juliadata.org/stable/reading.html
# https://json-schema.org/draft/2020-12/draft-bhutton-json-schema-00
using CSV
using JSON3
using SHA

export SCHEMA_ID,
       SCHEMA_VERSION,
       build_report_bundle,
       flatten_report_bundle,
       interval_report_record,
       read_report_csv,
       read_report_json,
       validate_report_bundle,
       validate_report_csv_rows,
       write_report_artifacts

const SCHEMA_ID = "learning-julia.p2.selection-count-report"
const SCHEMA_VERSION = "1.0.0"
const REPORT_STATUSES = Set((
    "review_profile_and_bootstrap",
    "unresolved_profile",
    "unresolved_bootstrap",
))
const METHOD_NAMES = Set(("wald", "profile", "bootstrap"))
const METHOD_STATUSES = Set((
    "ok",
    "search_limit",
    "skipped_weak_identification",
    "error",
    "insufficient_success",
))
const MESSAGE_CODES = Set((
    "wald_is_local_approximation",
    "profile_interval_unresolved",
    "profile_skipped_weak_identification",
    "profile_computation_error",
    "bootstrap_success_rate_too_low",
    "compare_profile_and_bootstrap",
))
const REPORT_KEYS = Set((
    "report_id", "status", "automatic_interval", "input_contract",
    "methods", "messages",
))
const INPUT_KEYS = Set((
    "total_screened", "selected_count", "lower_boundary", "upper_boundary",
    "boundary_rule",
))
const METHOD_KEYS = Set(("method", "status", "intervals", "diagnostics"))
const INTERVAL_KEYS = Set(("parameter", "lower", "upper"))
const DIAGNOSTIC_KEYS = Set((
    "total_screened", "repetitions", "successes", "success_rate",
    "minimum_success_rate",
))

field(value, key::Symbol) = getproperty(value, key)
string_status(value) = string(value)
json_bound(value) = ismissing(value) || isnothing(value) ? nothing : Float64(value)
csv_value(value) = isnothing(value) ? missing : value

function exact_keys(value, expected, label)
    actual = Set(string.(keys(value)))
    actual == expected || throw(ArgumentError(
        "$(label)のkeyがschemaと一致しません: $(sort!(collect(actual)))",
    ))
end

function interval_records(source)
    [
        (
            parameter = "mu",
            lower = json_bound(source.mu[1]),
            upper = json_bound(source.mu[2]),
        ),
        (
            parameter = "sigma",
            lower = json_bound(source.sigma[1]),
            upper = json_bound(source.sigma[2]),
        ),
    ]
end

function method_record(name, source)
    diagnostics = name == "bootstrap" ? (
        total_screened = Int(source.total_screened),
        repetitions = Int(source.repetitions),
        successes = Int(source.successes),
        success_rate = Float64(source.success_rate),
        minimum_success_rate = Float64(source.minimum_success_rate),
    ) : nothing
    status = name == "wald" ? "ok" : string_status(source.status)
    (
        method = name,
        status,
        intervals = interval_records(source),
        diagnostics,
    )
end

function interval_report_record(
    report_id,
    report;
    total_screened,
    selected_count,
    lower,
    upper,
)
    record = (
        report_id = String(report_id),
        status = string_status(report.status),
        automatic_interval = report.automatic_interval,
        input_contract = (
            total_screened = Int(total_screened),
            selected_count = Int(selected_count),
            lower_boundary = Float64(lower),
            upper_boundary = Float64(upper),
            boundary_rule = "lower < value < upper",
        ),
        methods = [
            method_record("wald", report.wald),
            method_record("profile", report.profile),
            method_record("bootstrap", report.bootstrap),
        ],
        messages = string.(report.messages),
    )
    validate_report_record(record)
    record
end

function build_report_bundle(reports)
    bundle = (
        schema_id = SCHEMA_ID,
        schema_version = SCHEMA_VERSION,
        model_scope = (
            family = "Normal",
            selection_rule = "strict_open_interval",
            automatic_interval_selection = false,
        ),
        reports = collect(reports),
    )
    validate_report_bundle(bundle)
    bundle
end

function validate_interval(interval, method_status)
    exact_keys(interval, INTERVAL_KEYS, "interval")
    parameter = String(field(interval, :parameter))
    parameter in ("mu", "sigma") ||
        throw(ArgumentError("parameterはmuまたはsigmaにしてください"))
    lower = field(interval, :lower)
    upper = field(interval, :upper)
    if method_status == "ok"
        lower isa Real && upper isa Real &&
            isfinite(lower) && isfinite(upper) && lower < upper ||
            throw(ArgumentError("ok methodの区間端点は有限かつlower < upperにしてください"))
        parameter == "sigma" && lower <= 0 &&
            throw(ArgumentError("sigma区間の下端は正にしてください"))
    else
        isnothing(lower) && isnothing(upper) ||
            throw(ArgumentError("未解決methodの区間端点はnullにしてください"))
    end
    true
end

function validate_diagnostics(diagnostics, method_name, method_status)
    if method_name != "bootstrap"
        isnothing(diagnostics) ||
            throw(ArgumentError("bootstrap以外のdiagnosticsはnullにしてください"))
        return true
    end
    isnothing(diagnostics) && throw(ArgumentError("bootstrap diagnosticsがありません"))
    exact_keys(diagnostics, DIAGNOSTIC_KEYS, "bootstrap diagnostics")
    repetitions = field(diagnostics, :repetitions)
    total_screened = field(diagnostics, :total_screened)
    successes = field(diagnostics, :successes)
    success_rate = field(diagnostics, :success_rate)
    minimum = field(diagnostics, :minimum_success_rate)
    total_screened isa Integer && total_screened >= 2 ||
        throw(ArgumentError("bootstrap total_screenedは2以上の整数にしてください"))
    repetitions isa Integer && repetitions >= 1 ||
        throw(ArgumentError("bootstrap repetitionsは1以上の整数にしてください"))
    successes isa Integer && 0 <= successes <= repetitions ||
        throw(ArgumentError("bootstrap successesが範囲外です"))
    success_rate isa Real && isfinite(success_rate) && 0 <= success_rate <= 1 ||
        throw(ArgumentError("bootstrap success_rateが範囲外です"))
    isapprox(success_rate, successes / repetitions; atol = 1e-12, rtol = 0) ||
        throw(ArgumentError("bootstrap success_rateと件数が一致しません"))
    minimum isa Real && isfinite(minimum) && 0 < minimum <= 1 ||
        throw(ArgumentError("minimum_success_rateが範囲外です"))
    expected_status = success_rate >= minimum ? "ok" : "insufficient_success"
    method_status == expected_status ||
        throw(ArgumentError("bootstrap statusとsuccess_rateが一致しません"))
    true
end

function validate_method(method)
    exact_keys(method, METHOD_KEYS, "method")
    method_name = String(field(method, :method))
    method_status = String(field(method, :status))
    method_name in METHOD_NAMES || throw(ArgumentError("未登録のmethodです: $(method_name)"))
    method_status in METHOD_STATUSES ||
        throw(ArgumentError("未登録のmethod statusです: $(method_status)"))
    method_name == "wald" && method_status != "ok" &&
        throw(ArgumentError("Wald statusはokにしてください"))
    method_name == "profile" && method_status == "insufficient_success" &&
        throw(ArgumentError("profileにbootstrap専用statusは使えません"))
    method_name == "bootstrap" &&
        !(method_status in ("ok", "insufficient_success")) &&
        throw(ArgumentError("bootstrap statusが不正です"))
    intervals = field(method, :intervals)
    length(intervals) == 2 || throw(ArgumentError("各methodにはmu・sigmaの2行が必要です"))
    Set(String(field(interval, :parameter)) for interval in intervals) == Set(("mu", "sigma")) ||
        throw(ArgumentError("各methodにはmu・sigmaを一度ずつ保存してください"))
    foreach(interval -> validate_interval(interval, method_status), intervals)
    validate_diagnostics(field(method, :diagnostics), method_name, method_status)
    true
end

function validate_report_record(report)
    exact_keys(report, REPORT_KEYS, "report")
    report_id = String(field(report, :report_id))
    isempty(report_id) && throw(ArgumentError("report_idを空にできません"))
    status = String(field(report, :status))
    status in REPORT_STATUSES || throw(ArgumentError("未登録のreport statusです: $(status)"))
    isnothing(field(report, :automatic_interval)) ||
        throw(ArgumentError("automatic_intervalはnullのままにしてください"))

    input = field(report, :input_contract)
    exact_keys(input, INPUT_KEYS, "input_contract")
    total = field(input, :total_screened)
    selected = field(input, :selected_count)
    lower = field(input, :lower_boundary)
    upper = field(input, :upper_boundary)
    total isa Integer && !(total isa Bool) && total >= 2 ||
        throw(ArgumentError("total_screenedは2以上の整数にしてください"))
    selected isa Integer && !(selected isa Bool) && 2 <= selected <= total ||
        throw(ArgumentError("selected_countは2以上total_screened以下にしてください"))
    lower isa Real && upper isa Real && isfinite(lower) && isfinite(upper) && lower < upper ||
        throw(ArgumentError("境界は有限かつlower < upperにしてください"))
    field(input, :boundary_rule) == "lower < value < upper" ||
        throw(ArgumentError("boundary_ruleがschemaと一致しません"))

    methods = field(report, :methods)
    length(methods) == 3 || throw(ArgumentError("Wald・profile・bootstrapの3 methodが必要です"))
    foreach(validate_method, methods)
    by_name = Dict(String(field(method, :method)) => method for method in methods)
    Set(keys(by_name)) == METHOD_NAMES ||
        throw(ArgumentError("Wald・profile・bootstrapを一度ずつ保存してください"))
    profile_ok = field(by_name["profile"], :status) == "ok"
    bootstrap_ok = field(by_name["bootstrap"], :status) == "ok"
    expected_status = !profile_ok ? "unresolved_profile" :
        !bootstrap_ok ? "unresolved_bootstrap" : "review_profile_and_bootstrap"
    status == expected_status ||
        throw(ArgumentError("report statusとmethod statusが一致しません"))

    messages = field(report, :messages)
    isempty(messages) && throw(ArgumentError("message codeを少なくとも1件保存してください"))
    all(message -> String(message) in MESSAGE_CODES, messages) ||
        throw(ArgumentError("未登録のmessage codeがあります"))
    "wald_is_local_approximation" in String.(messages) ||
        throw(ArgumentError("Waldの局所近似messageがありません"))
    status == "unresolved_profile" &&
        !any(startswith(message, "profile_") for message in String.(messages)) &&
        throw(ArgumentError("profile未解決messageがありません"))
    status == "unresolved_bootstrap" &&
        !("bootstrap_success_rate_too_low" in String.(messages)) &&
        throw(ArgumentError("bootstrap未解決messageがありません"))
    status == "review_profile_and_bootstrap" &&
        !("compare_profile_and_bootstrap" in String.(messages)) &&
        throw(ArgumentError("method比較messageがありません"))
    true
end

function validate_report_bundle(bundle)
    exact_keys(
        bundle,
        Set(("schema_id", "schema_version", "model_scope", "reports")),
        "bundle",
    )
    field(bundle, :schema_id) == SCHEMA_ID || throw(ArgumentError("schema_idが不正です"))
    field(bundle, :schema_version) == SCHEMA_VERSION ||
        throw(ArgumentError("未対応のschema_versionです"))
    scope = field(bundle, :model_scope)
    exact_keys(
        scope,
        Set(("family", "selection_rule", "automatic_interval_selection")),
        "model_scope",
    )
    field(scope, :family) == "Normal" || throw(ArgumentError("Normal専用schemaです"))
    field(scope, :selection_rule) == "strict_open_interval" ||
        throw(ArgumentError("selection_ruleが不正です"))
    field(scope, :automatic_interval_selection) === false ||
        throw(ArgumentError("automatic interval selectionを有効化できません"))
    reports = field(bundle, :reports)
    isempty(reports) && throw(ArgumentError("reportがありません"))
    foreach(validate_report_record, reports)
    ids = String[field(report, :report_id) for report in reports]
    allunique(ids) || throw(ArgumentError("report_idが重複しています"))
    true
end

function flatten_report_bundle(bundle)
    validate_report_bundle(bundle)
    rows = NamedTuple[]
    for report in field(bundle, :reports)
        input = field(report, :input_contract)
        message_codes = join(String.(field(report, :messages)), "|")
        for method in field(report, :methods)
            diagnostics = field(method, :diagnostics)
            for interval in field(method, :intervals)
                push!(rows, (
                    schema_id = SCHEMA_ID,
                    schema_version = SCHEMA_VERSION,
                    report_id = String(field(report, :report_id)),
                    report_status = String(field(report, :status)),
                    automatic_interval = missing,
                    model_family = "Normal",
                    selection_rule = "strict_open_interval",
                    total_screened = Int(field(input, :total_screened)),
                    selected_count = Int(field(input, :selected_count)),
                    lower_boundary = Float64(field(input, :lower_boundary)),
                    upper_boundary = Float64(field(input, :upper_boundary)),
                    method = String(field(method, :method)),
                    method_status = String(field(method, :status)),
                    parameter = String(field(interval, :parameter)),
                    lower = csv_value(field(interval, :lower)),
                    upper = csv_value(field(interval, :upper)),
                    bootstrap_total_screened = isnothing(diagnostics) ? missing : Int(field(diagnostics, :total_screened)),
                    repetitions = isnothing(diagnostics) ? missing : Int(field(diagnostics, :repetitions)),
                    successes = isnothing(diagnostics) ? missing : Int(field(diagnostics, :successes)),
                    success_rate = isnothing(diagnostics) ? missing : Float64(field(diagnostics, :success_rate)),
                    minimum_success_rate = isnothing(diagnostics) ? missing : Float64(field(diagnostics, :minimum_success_rate)),
                    message_codes,
                ))
            end
        end
    end
    rows
end

function validate_report_csv_rows(input_rows)
    rows = collect(input_rows)
    isempty(rows) && throw(ArgumentError("CSVにreport行がありません"))
    all(row -> row.schema_id == SCHEMA_ID && row.schema_version == SCHEMA_VERSION, rows) ||
        throw(ArgumentError("CSV schema識別子が不正です"))
    all(row -> ismissing(row.automatic_interval), rows) ||
        throw(ArgumentError("CSV automatic_intervalはNAのままにしてください"))
    for report_id in unique(row.report_id for row in rows)
        report_rows = filter(row -> row.report_id == report_id, rows)
        length(report_rows) == 6 ||
            throw(ArgumentError("各reportには3 method×2 parameterの6行が必要です"))
        Set((row.method, row.parameter) for row in report_rows) ==
            Set((method, parameter) for method in METHOD_NAMES for parameter in ("mu", "sigma")) ||
            throw(ArgumentError("CSVのmethod・parameter行が欠落または重複しています"))
        for row in report_rows
            if row.method_status == "ok"
                !ismissing(row.lower) && !ismissing(row.upper) && row.lower < row.upper ||
                    throw(ArgumentError("ok行のCSV区間端点が不正です"))
            else
                ismissing(row.lower) && ismissing(row.upper) ||
                    throw(ArgumentError("未解決行は端点NAのまま保存してください"))
            end
        end
    end
    true
end

function read_report_json(path)
    bundle = JSON3.read(read(path, String))
    validate_report_bundle(bundle)
    bundle
end

function read_report_csv(path)
    rows = collect(CSV.File(
        path;
        missingstring = "NA",
        stringtype = String,
        strict = true,
    ))
    validate_report_csv_rows(rows)
    rows
end

function write_report_artifacts(output_dir, bundle; basename = "selection-count-report")
    validate_report_bundle(bundle)
    occursin(r"^[A-Za-z0-9._-]+$", basename) ||
        throw(ArgumentError("basenameには英数字・dot・underscore・hyphenだけを使ってください"))
    mkpath(output_dir)
    json_path = joinpath(output_dir, "$(basename).json")
    csv_path = joinpath(output_dir, "$(basename).csv")
    any(ispath, (json_path, csv_path)) &&
        throw(ArgumentError("既存成果物を上書きしません: $(basename)"))

    open(json_path, "w") do io
        JSON3.pretty(io, bundle)
        write(io, '\n')
    end
    CSV.write(csv_path, flatten_report_bundle(bundle); missingstring = "NA")
    (
        json_path,
        csv_path,
        json_sha256 = bytes2hex(open(sha256, json_path)),
        csv_sha256 = bytes2hex(open(sha256, csv_path)),
    )
end

end
