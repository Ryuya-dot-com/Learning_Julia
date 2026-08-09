// Research-only browser boundary for a future same-origin Julia service.
// Authentication secrets are intentionally absent: deployment must use an
// HttpOnly same-origin session cookie and, when configured, a CSRF token.
import apiRequestFixture from "../../validation/p2-likelihood/fixtures/selection-count-api-v1-request.json";
import apiResponseFixture from "../../validation/p2-likelihood/fixtures/selection-count-api-v1-response.json";
import versionRegistry from "../../validation/p2-likelihood/p2-api-version-registry.json";
import {
  REPORT_SCHEMA_VERSION,
  validateSelectionCountReportBundle,
} from "./p2-selection-count-report.js";

export { REPORT_SCHEMA_VERSION };

export const API_REQUEST_SCHEMA_ID = "learning-julia.p2.selection-count-api-request";
export const API_RESPONSE_SCHEMA_ID = "learning-julia.p2.selection-count-api-response";
export const API_SCHEMA_VERSION = "1.0.0";
export const REQUEST_MEDIA_TYPE =
  "application/vnd.learning-julia.p2.selection-count-api-request+json";
export const RESPONSE_MEDIA_TYPE =
  "application/vnd.learning-julia.p2.selection-count-api-response+json";
export const LOCAL_SESSION_MEDIA_TYPE =
  "application/vnd.learning-julia.p2.local-session+json";
export const LOCAL_SESSION_SCHEMA_ID =
  "learning-julia.p2.selection-count-local-session";
export const DEFAULT_API_TIMEOUT_MS = 120_000;
export const MAX_RESPONSE_BYTES = 1_048_576;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ASSUMPTION_KEYS = [
  "boundary_precommitted",
  "same_boundary",
  "same_population",
  "independent_rows",
  "exact_selected_values",
  "excluded_confirmed_outside",
];

const fail = (message) => {
  throw new Error(`P2 API schema error: ${message}`);
};

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label}はobjectである必要があります`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label}のkeyが一致しません: ${actual.join(",")}`);
  }
}

const isInteger = (value) => Number.isInteger(value) && typeof value !== "boolean";
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

export function validateApiRequest(request) {
  exactKeys(
    request,
    ["schema_id", "schema_version", "request_id", "model_scope", "input_contract", "analysis_options"],
    "request"
  );
  if (request.schema_id !== API_REQUEST_SCHEMA_ID) fail("request schema_idが不正です");
  if (request.schema_version !== API_SCHEMA_VERSION) fail("未対応request schema_versionです");
  if (typeof request.request_id !== "string" || !REQUEST_ID_PATTERN.test(request.request_id)) {
    fail("request_idが不正です");
  }

  exactKeys(
    request.model_scope,
    ["family", "selection_rule", "automatic_interval_selection"],
    "model_scope"
  );
  if (request.model_scope.family !== "Normal") fail("Normal専用requestです");
  if (request.model_scope.selection_rule !== "strict_open_interval") fail("selection_ruleが不正です");
  if (request.model_scope.automatic_interval_selection !== false) {
    fail("automatic interval selectionを有効化できません");
  }

  const input = request.input_contract;
  exactKeys(
    input,
    [
      "total_screened",
      "selected_count",
      "lower_boundary",
      "upper_boundary",
      "boundary_rule",
      "selected_values",
      "assumptions_confirmed",
    ],
    "input_contract"
  );
  if (!isInteger(input.total_screened) || input.total_screened < 2) fail("total_screenedが不正です");
  if (!isInteger(input.selected_count) || input.selected_count < 2 || input.selected_count > input.total_screened) {
    fail("selected_countが不正です");
  }
  if (!isFiniteNumber(input.lower_boundary) || !isFiniteNumber(input.upper_boundary) ||
      input.lower_boundary >= input.upper_boundary) {
    fail("境界が不正です");
  }
  if (input.boundary_rule !== "lower < value < upper") fail("boundary_ruleが不正です");
  if (!Array.isArray(input.selected_values) || input.selected_values.length !== input.selected_count) {
    fail("selected_countとselected_valuesの長さが一致しません");
  }
  if (input.selected_values.some((value) => !isFiniteNumber(value) ||
      value <= input.lower_boundary || value >= input.upper_boundary)) {
    fail("selected_valuesは有限かつ事前境界の内側にしてください");
  }
  exactKeys(input.assumptions_confirmed, ASSUMPTION_KEYS, "assumptions_confirmed");
  if (ASSUMPTION_KEYS.some((key) => input.assumptions_confirmed[key] !== true)) {
    fail("観測契約を確認できないrequestは送信しません");
  }

  const options = request.analysis_options;
  exactKeys(
    options,
    ["random_seed", "bootstrap_repetitions", "minimum_bootstrap_success_rate", "profile_max_expansions"],
    "analysis_options"
  );
  if (!isInteger(options.random_seed) || options.random_seed < 0 || options.random_seed > 4_294_967_295) {
    fail("random_seedが不正です");
  }
  if (!isInteger(options.bootstrap_repetitions) ||
      options.bootstrap_repetitions < 99 || options.bootstrap_repetitions > 9_999) {
    fail("bootstrap_repetitionsが不正です");
  }
  if (!isFiniteNumber(options.minimum_bootstrap_success_rate) ||
      options.minimum_bootstrap_success_rate <= 0 || options.minimum_bootstrap_success_rate > 1) {
    fail("minimum_bootstrap_success_rateが不正です");
  }
  if (!isInteger(options.profile_max_expansions) ||
      options.profile_max_expansions < 0 || options.profile_max_expansions > 50) {
    fail("profile_max_expansionsが不正です");
  }
  return true;
}

function validateEngine(engine) {
  exactKeys(
    engine,
    ["julia_version", "project_environment", "manifest_sha256", "report_schema_version", "generated_at_utc"],
    "engine"
  );
  if (typeof engine.julia_version !== "string" || engine.julia_version.length === 0) fail("julia_versionが空です");
  if (engine.project_environment !== "validation/p2-likelihood") fail("project_environmentが不正です");
  if (typeof engine.manifest_sha256 !== "string" || !SHA256_PATTERN.test(engine.manifest_sha256)) {
    fail("manifest_sha256が不正です");
  }
  if (engine.report_schema_version !== REPORT_SCHEMA_VERSION) fail("report_schema_versionが不正です");
  if (typeof engine.generated_at_utc !== "string" || !engine.generated_at_utc.endsWith("Z") ||
      Number.isNaN(Date.parse(engine.generated_at_utc))) {
    fail("generated_at_utcが不正です");
  }
}

export function validateApiResponse(response) {
  exactKeys(
    response,
    ["schema_id", "schema_version", "request_id", "request_sha256", "engine", "report_bundle"],
    "response"
  );
  if (response.schema_id !== API_RESPONSE_SCHEMA_ID) fail("response schema_idが不正です");
  if (response.schema_version !== API_SCHEMA_VERSION) fail("未対応response schema_versionです");
  if (typeof response.request_id !== "string" || !REQUEST_ID_PATTERN.test(response.request_id)) {
    fail("response request_idが不正です");
  }
  if (typeof response.request_sha256 !== "string" || !SHA256_PATTERN.test(response.request_sha256)) {
    fail("request_sha256が不正です");
  }
  validateEngine(response.engine);
  validateSelectionCountReportBundle(response.report_bundle);
  if (response.report_bundle.reports.length !== 1) fail("API responseは1 reportにしてください");
  if (response.report_bundle.reports[0].report_id !== response.request_id) {
    fail("request_idとreport_idが一致しません");
  }
  return true;
}

export function validateLocalResearchSession(session) {
  exactKeys(
    session,
    [
      "schema_id",
      "schema_version",
      "csrf_token",
      "expires_in_seconds",
      "api_version",
      "report_version",
      "scope",
    ],
    "local session"
  );
  if (session.schema_id !== LOCAL_SESSION_SCHEMA_ID || session.schema_version !== API_SCHEMA_VERSION) {
    fail("local session schemaが不正です");
  }
  if (typeof session.csrf_token !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(session.csrf_token)) {
    fail("local session CSRF tokenが不正です");
  }
  if (!isInteger(session.expires_in_seconds) || session.expires_in_seconds < 60 || session.expires_in_seconds > 3600) {
    fail("local session TTLが不正です");
  }
  if (session.api_version !== API_SCHEMA_VERSION || session.report_version !== REPORT_SCHEMA_VERSION) {
    fail("local session versionが不正です");
  }
  if (session.scope !== "synthetic_fixture_only") fail("local session scopeが不正です");
  return true;
}

function validateVersionRegistry(registry) {
  exactKeys(registry, ["schema_id", "schema_version", "endpoint_status", "versions", "policy"], "version registry");
  if (registry.schema_id !== "learning-julia.p2.selection-count-api-version-registry" ||
      registry.schema_version !== API_SCHEMA_VERSION) fail("version registry識別子が不正です");
  if (registry.endpoint_status !== "local_research_only") fail("未登録endpoint statusです");
  if (!Array.isArray(registry.versions) || registry.versions.length !== 1) fail("version registryが不正です");
  const version = registry.versions[0];
  exactKeys(
    version,
    ["api_version", "request_schema_version", "report_schema_version", "status", "available", "sunset_at"],
    "registered version"
  );
  if (version.api_version !== API_SCHEMA_VERSION || version.request_schema_version !== API_SCHEMA_VERSION ||
      version.report_schema_version !== REPORT_SCHEMA_VERSION || version.status !== "research" ||
      version.available !== false || version.sunset_at !== null) fail("研究versionの状態が不正です");
  exactKeys(
    registry.policy,
    [
      "minimum_successor_overlap_days_after_public_release",
      "sunset_header_required",
      "fixture_fallback_required",
      "silent_fallback_for_unmatched_input_forbidden",
    ],
    "version policy"
  );
  if (registry.policy.minimum_successor_overlap_days_after_public_release !== 180 ||
      registry.policy.sunset_header_required !== true ||
      registry.policy.fixture_fallback_required !== true ||
      registry.policy.silent_fallback_for_unmatched_input_forbidden !== true) {
    fail("version policyが不正です");
  }
  return true;
}

export class P2ApiError extends Error {
  constructor(code, message, { status = null, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "P2ApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const apiError = (code, message, options) => new P2ApiError(code, message, options);

export function normalizeSameOriginEndpoint(endpoint, baseOrigin = globalThis.location?.origin) {
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    throw apiError("api_not_configured", "実計算APIは構成されていません。");
  }
  if (!baseOrigin) throw apiError("invalid_endpoint", "同一originを確認できません。");
  if (!endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.includes("\\")) {
    throw apiError("invalid_endpoint", "API endpointは同一originの絶対pathに限定します。");
  }
  const origin = new URL(baseOrigin).origin;
  const resolved = new URL(endpoint, origin);
  if (resolved.origin !== origin || resolved.search || resolved.hash) {
    throw apiError("invalid_endpoint", "API endpointに外部origin・query・fragmentは使えません。");
  }
  return resolved.href;
}

async function sha256Hex(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw apiError("crypto_unavailable", "request照合用SHA-256を計算できません。");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function responseStatusError(response) {
  if (response.status === 400) return apiError("bad_request", "requestをserverが解釈できませんでした。", { status: 400 });
  if (response.status === 401) return apiError("auth_required", "認証sessionが必要です。", { status: 401 });
  if (response.status === 403) return apiError("forbidden_or_csrf", "権限またはCSRF確認に失敗しました。", { status: 403 });
  if (response.status === 409) return apiError("request_mismatch", "request IDが一致しません。", { status: 409 });
  if (response.status === 413) return apiError("request_too_large", "request bodyが上限を超えています。", { status: 413 });
  if (response.status === 415) return apiError("invalid_content_type", "request media typeが不正です。", { status: 415 });
  if (response.status === 422) return apiError("invalid_request", "request schemaまたは研究scopeが不正です。", { status: 422 });
  if (response.status === 406 || response.status === 426) {
    return apiError("unsupported_version", "要求したAPI/schema versionは提供されていません。", { status: response.status });
  }
  if (response.status === 429) return apiError("rate_limited", "計算要求が集中しています。", { status: 429, retryable: true });
  if (response.status === 502) return apiError("invalid_gateway_response", "Julia worker responseを検証できません。", { status: 502, retryable: true });
  if (response.status === 504) return apiError("worker_timeout", "Julia workerが期限内に終了しませんでした。", { status: 504, retryable: true });
  if (!response.ok) return apiError("server_error", `serverがHTTP ${response.status}を返しました。`, { status: response.status, retryable: response.status >= 500 });
  return null;
}

export async function createLocalResearchSession({
  endpoint,
  timeoutMs = 5_000,
  fetchImpl = globalThis.fetch,
  baseOrigin = globalThis.location?.origin,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw apiError("invalid_timeout", "local session timeoutは1〜30000 msの整数にしてください。");
  }
  if (typeof fetchImpl !== "function") throw apiError("fetch_unavailable", "fetch APIを利用できません。");
  const url = normalizeSameOriginEndpoint(endpoint, baseOrigin);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Accept: `${LOCAL_SESSION_MEDIA_TYPE}; version=${API_SCHEMA_VERSION}`,
          "X-Learning-Julia-API-Version": API_SCHEMA_VERSION,
          "X-Learning-Julia-Report-Version": REPORT_SCHEMA_VERSION,
        },
        credentials: "same-origin",
        mode: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw apiError("timeout", `local session APIが${timeoutMs} ms以内に応答しませんでした。`, { retryable: true, cause: error });
      throw apiError("network_error", "local session APIへ接続できませんでした。", { retryable: true, cause: error });
    }
    const statusError = responseStatusError(response);
    if (statusError) throw statusError;
    if (response.status !== 201) throw apiError("invalid_session_response", "local session APIのstatusが不正です。");
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith(LOCAL_SESSION_MEDIA_TYPE)) {
      throw apiError("invalid_content_type", "local session responseのmedia typeが不正です。");
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 16_384) {
      throw apiError("response_too_large", "local session responseが上限16 KiBを超えています。");
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
      validateLocalResearchSession(parsed);
    } catch (error) {
      throw apiError("invalid_session_response", error.message, { cause: error });
    }
    return deepFreeze(parsed);
  } finally {
    clearTimeout(timeoutId);
  }
}

function assertResponseHeaders(response, requestId) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith(RESPONSE_MEDIA_TYPE)) {
    throw apiError("invalid_content_type", "API responseのmedia typeが不正です。");
  }
  if (response.headers.get("x-learning-julia-api-version") !== API_SCHEMA_VERSION ||
      response.headers.get("x-learning-julia-report-version") !== REPORT_SCHEMA_VERSION) {
    throw apiError("unsupported_version", "response headerのversionが一致しません。");
  }
  if (response.headers.get("x-request-id") !== requestId) {
    throw apiError("request_mismatch", "response headerのrequest IDが一致しません。");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    throw apiError("response_too_large", "API responseが上限1 MiBを超えています。");
  }
}

function assertInputEcho(request, response) {
  const expected = request.input_contract;
  const actual = response.report_bundle.reports[0].input_contract;
  for (const key of ["total_screened", "selected_count", "lower_boundary", "upper_boundary", "boundary_rule"]) {
    if (expected[key] !== actual[key]) fail(`response input_contractがrequestと一致しません: ${key}`);
  }
}

export async function validateApiExchange(request, bodyText, response) {
  validateApiRequest(request);
  validateApiResponse(response);
  const digest = await sha256Hex(bodyText);
  if (response.request_id !== request.request_id) fail("requestとresponseのrequest_idが一致しません");
  if (response.request_sha256 !== digest) fail("responseが送信requestのSHA-256と一致しません");
  assertInputEcho(request, response);
  return true;
}

export async function requestSelectionCountReport({
  endpoint,
  request,
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
  csrfToken,
  fetchImpl = globalThis.fetch,
  baseOrigin = globalThis.location?.origin,
  signal,
} = {}) {
  validateApiRequest(request);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw apiError("invalid_timeout", "timeoutは1〜300000 msの整数にしてください。");
  }
  if (typeof fetchImpl !== "function") throw apiError("fetch_unavailable", "fetch APIを利用できません。");
  if (csrfToken !== undefined && (typeof csrfToken !== "string" || csrfToken.length > 256 || /[\r\n]/.test(csrfToken))) {
    throw apiError("invalid_csrf_token", "CSRF tokenの形式が不正です。");
  }
  const url = normalizeSameOriginEndpoint(endpoint, baseOrigin);
  const bodyText = JSON.stringify(request);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  const headers = {
    Accept: `${RESPONSE_MEDIA_TYPE}; version=${API_SCHEMA_VERSION}`,
    "Content-Type": `${REQUEST_MEDIA_TYPE}; version=${API_SCHEMA_VERSION}; charset=utf-8`,
    "X-Learning-Julia-API-Version": API_SCHEMA_VERSION,
    "X-Learning-Julia-Report-Version": REPORT_SCHEMA_VERSION,
    "X-Request-ID": request.request_id,
  };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  try {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: bodyText,
        credentials: "same-origin",
        mode: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw apiError("timeout", `APIが${timeoutMs} ms以内に応答しませんでした。`, { retryable: true, cause: error });
      if (controller.signal.aborted) throw apiError("cancelled", "API requestを中止しました。", { cause: error });
      throw apiError("network_error", "APIへ接続できませんでした。", { retryable: true, cause: error });
    }

    const statusError = responseStatusError(response);
    if (statusError) throw statusError;
    assertResponseHeaders(response, request.request_id);
    const responseText = await response.text();
    if (new TextEncoder().encode(responseText).byteLength > MAX_RESPONSE_BYTES) {
      throw apiError("response_too_large", "API responseが上限1 MiBを超えています。");
    }
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (error) {
      throw apiError("invalid_json", "API responseをJSONとして読めません。", { cause: error });
    }
    try {
      await validateApiExchange(request, bodyText, parsed);
    } catch (error) {
      if (error instanceof P2ApiError) throw error;
      throw apiError("invalid_response", error.message, { cause: error });
    }
    return deepFreeze(parsed);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

const sameFixtureRequest = (request) => JSON.stringify(request) === JSON.stringify(apiRequestFixture);

export async function loadReportWithExplicitFixtureFallback(options = {}) {
  const request = options.request ?? API_REQUEST_FIXTURE;
  try {
    const response = await requestSelectionCountReport({ ...options, request });
    return deepFreeze({ source: "server", response, transportError: null });
  } catch (error) {
    if (!options.allowFixtureFallback || !sameFixtureRequest(request)) throw error;
    const bodyText = JSON.stringify(request);
    await validateApiExchange(request, bodyText, API_RESPONSE_FIXTURE);
    return deepFreeze({
      source: "fixture",
      response: API_RESPONSE_FIXTURE,
      transportError: {
        code: error.code ?? "unknown_error",
        message: error.message,
        retryable: error.retryable === true,
      },
    });
  }
}

validateVersionRegistry(versionRegistry);
validateApiRequest(apiRequestFixture);
validateApiResponse(apiResponseFixture);

export const API_REQUEST_FIXTURE = deepFreeze(apiRequestFixture);
export const API_RESPONSE_FIXTURE = deepFreeze(apiResponseFixture);
export const P2_API_VERSION_REGISTRY = deepFreeze(versionRegistry);
