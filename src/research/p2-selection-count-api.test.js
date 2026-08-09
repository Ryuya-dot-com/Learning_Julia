import { describe, expect, it, vi } from "vitest";
import {
  API_REQUEST_FIXTURE,
  API_RESPONSE_FIXTURE,
  API_SCHEMA_VERSION,
  LOCAL_SESSION_MEDIA_TYPE,
  LOCAL_SESSION_SCHEMA_ID,
  P2_API_VERSION_REGISTRY,
  P2ApiError,
  REPORT_SCHEMA_VERSION,
  RESPONSE_MEDIA_TYPE,
  createLocalResearchSession,
  loadReportWithExplicitFixtureFallback,
  normalizeSameOriginEndpoint,
  requestSelectionCountReport,
  validateApiExchange,
  validateApiRequest,
  validateApiResponse,
  validateLocalResearchSession,
} from "./p2-selection-count-api.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function responseHeaders(overrides = {}) {
  return {
    "Content-Type": `${RESPONSE_MEDIA_TYPE}; version=${API_SCHEMA_VERSION}`,
    "X-Learning-Julia-API-Version": API_SCHEMA_VERSION,
    "X-Learning-Julia-Report-Version": REPORT_SCHEMA_VERSION,
    "X-Request-ID": API_REQUEST_FIXTURE.request_id,
    ...overrides,
  };
}

const okFetch = vi.fn(async () => new Response(
  JSON.stringify(API_RESPONSE_FIXTURE),
  { status: 200, headers: responseHeaders() }
));

const LOCAL_SESSION = Object.freeze({
  schema_id: LOCAL_SESSION_SCHEMA_ID,
  schema_version: API_SCHEMA_VERSION,
  csrf_token: "abcdefghijklmnopqrstuvwxyzABCDE_123456789",
  expires_in_seconds: 900,
  api_version: API_SCHEMA_VERSION,
  report_version: REPORT_SCHEMA_VERSION,
  scope: "synthetic_fixture_only",
});

describe("P2 selection-count research API boundary", () => {
  it("Julia生成request・response fixtureと本文SHAを検査する", async () => {
    expect(validateApiRequest(API_REQUEST_FIXTURE)).toBe(true);
    expect(validateApiResponse(API_RESPONSE_FIXTURE)).toBe(true);
    expect(await validateApiExchange(
      API_REQUEST_FIXTURE,
      JSON.stringify(API_REQUEST_FIXTURE),
      API_RESPONSE_FIXTURE
    )).toBe(true);
    expect(API_REQUEST_FIXTURE.input_contract.selected_values).toHaveLength(43);
    expect(API_RESPONSE_FIXTURE.report_bundle.reports).toHaveLength(1);
    expect(API_RESPONSE_FIXTURE.report_bundle.reports[0].automatic_interval).toBeNull();
  });

  it("selected_count・境界・観測仮定・計算上限の改変を拒否する", () => {
    const wrongCount = clone(API_REQUEST_FIXTURE);
    wrongCount.input_contract.selected_count = 42;
    expect(() => validateApiRequest(wrongCount)).toThrow("長さが一致しません");

    const onBoundary = clone(API_REQUEST_FIXTURE);
    onBoundary.input_contract.selected_values[0] = onBoundary.input_contract.upper_boundary;
    expect(() => validateApiRequest(onBoundary)).toThrow("事前境界の内側");

    const assumption = clone(API_REQUEST_FIXTURE);
    assumption.input_contract.assumptions_confirmed.same_boundary = false;
    expect(() => validateApiRequest(assumption)).toThrow("観測契約");

    const excessive = clone(API_REQUEST_FIXTURE);
    excessive.analysis_options.bootstrap_repetitions = 10_000;
    expect(() => validateApiRequest(excessive)).toThrow("bootstrap_repetitions");
  });

  it("responseのrequest ID・SHA・engine provenance・入力echo改変を拒否する", async () => {
    const wrongId = clone(API_RESPONSE_FIXTURE);
    wrongId.request_id = "another-request";
    expect(() => validateApiResponse(wrongId)).toThrow("request_idとreport_id");

    const wrongManifest = clone(API_RESPONSE_FIXTURE);
    wrongManifest.engine.manifest_sha256 = "0".repeat(63);
    expect(() => validateApiResponse(wrongManifest)).toThrow("manifest_sha256");

    const stale = clone(API_RESPONSE_FIXTURE);
    stale.report_bundle.reports[0].input_contract.total_screened = 401;
    await expect(validateApiExchange(
      API_REQUEST_FIXTURE,
      JSON.stringify(API_REQUEST_FIXTURE),
      stale
    )).rejects.toThrow("total_screened");
  });

  it("endpointを同一originのqueryなしpathへ限定する", () => {
    expect(normalizeSameOriginEndpoint(
      "/Learning_Julia/api/research/p2/selection-count-report",
      "https://example.test"
    )).toBe("https://example.test/Learning_Julia/api/research/p2/selection-count-report");
    expect(() => normalizeSameOriginEndpoint("https://evil.example/api", "https://example.test"))
      .toThrow(P2ApiError);
    expect(() => normalizeSameOriginEndpoint("//evil.example/api", "https://example.test"))
      .toThrow("同一origin");
    expect(() => normalizeSameOriginEndpoint("/api?token=secret", "https://example.test"))
      .toThrow("query");
  });

  it("same-origin cookie境界・版header・CSRF tokenでPOSTしBearer secretを持たない", async () => {
    okFetch.mockClear();
    const response = await requestSelectionCountReport({
      endpoint: "/Learning_Julia/api/research/p2/selection-count-report",
      request: API_REQUEST_FIXTURE,
      csrfToken: "public-csrf-nonce",
      baseOrigin: "https://example.test",
      fetchImpl: okFetch,
    });
    expect(response.request_id).toBe(API_REQUEST_FIXTURE.request_id);
    expect(okFetch).toHaveBeenCalledOnce();
    const [url, options] = okFetch.mock.calls[0];
    expect(url).toBe("https://example.test/Learning_Julia/api/research/p2/selection-count-report");
    expect(options).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      mode: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(options.headers["X-Learning-Julia-API-Version"]).toBe(API_SCHEMA_VERSION);
    expect(options.headers["X-Learning-Julia-Report-Version"]).toBe(REPORT_SCHEMA_VERSION);
    expect(options.headers["X-CSRF-Token"]).toBe("public-csrf-nonce");
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("local capability sessionをsame-origin POSTで開始しCSRFだけをJavaScriptへ返す", async () => {
    expect(validateLocalResearchSession(LOCAL_SESSION)).toBe(true);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(LOCAL_SESSION), {
      status: 201,
      headers: { "Content-Type": `${LOCAL_SESSION_MEDIA_TYPE}; version=1.0.0` },
    }));
    const session = await createLocalResearchSession({
      endpoint: "/Learning_Julia/api/research/p2/session",
      baseOrigin: "https://example.test",
      fetchImpl,
    });
    expect(session).toEqual(LOCAL_SESSION);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.test/Learning_Julia/api/research/p2/session");
    expect(options).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      mode: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.body).toBeUndefined();

    const invalid = { ...LOCAL_SESSION, scope: "real_data" };
    expect(() => validateLocalResearchSession(invalid)).toThrow("scope");
  });

  it.each([
    [401, "auth_required"],
    [403, "forbidden_or_csrf"],
    [406, "unsupported_version"],
    [426, "unsupported_version"],
    [429, "rate_limited"],
    [502, "invalid_gateway_response"],
    [504, "worker_timeout"],
    [503, "server_error"],
  ])("HTTP %iを別々のtransport codeへ変換する", async (status, code) => {
    const fetchImpl = vi.fn(async () => new Response("", { status }));
    await expect(requestSelectionCountReport({
      endpoint: "/api/research/p2",
      request: API_REQUEST_FIXTURE,
      baseOrigin: "https://example.test",
      fetchImpl,
    })).rejects.toMatchObject({ code, status });
  });

  it("timeoutと利用者cancelをnetwork errorへ潰さない", async () => {
    const hangingFetch = (_url, options) => new Promise((_resolve, reject) => {
      if (options.signal.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    await expect(requestSelectionCountReport({
      endpoint: "/api/research/p2",
      request: API_REQUEST_FIXTURE,
      timeoutMs: 5,
      baseOrigin: "https://example.test",
      fetchImpl: hangingFetch,
    })).rejects.toMatchObject({ code: "timeout", retryable: true });

    const controller = new AbortController();
    controller.abort();
    await expect(requestSelectionCountReport({
      endpoint: "/api/research/p2",
      request: API_REQUEST_FIXTURE,
      signal: controller.signal,
      baseOrigin: "https://example.test",
      fetchImpl: hangingFetch,
    })).rejects.toMatchObject({ code: "cancelled" });
  });

  it("media type・header version・response sizeを本文parse前に止める", async () => {
    const badMedia = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: responseHeaders({ "Content-Type": "application/json" }),
    }));
    await expect(requestSelectionCountReport({
      endpoint: "/api/research/p2",
      request: API_REQUEST_FIXTURE,
      baseOrigin: "https://example.test",
      fetchImpl: badMedia,
    })).rejects.toMatchObject({ code: "invalid_content_type" });

    const badVersion = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: responseHeaders({ "X-Learning-Julia-API-Version": "2.0.0" }),
    }));
    await expect(requestSelectionCountReport({
      endpoint: "/api/research/p2",
      request: API_REQUEST_FIXTURE,
      baseOrigin: "https://example.test",
      fetchImpl: badVersion,
    })).rejects.toMatchObject({ code: "unsupported_version" });

    const tooLarge = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: responseHeaders({ "Content-Length": "1048577" }),
    }));
    await expect(requestSelectionCountReport({
      endpoint: "/api/research/p2",
      request: API_REQUEST_FIXTURE,
      baseOrigin: "https://example.test",
      fetchImpl: tooLarge,
    })).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("完全一致する合成requestだけを明示fixtureへfallbackする", async () => {
    const loaded = await loadReportWithExplicitFixtureFallback({
      endpoint: undefined,
      request: API_REQUEST_FIXTURE,
      allowFixtureFallback: true,
      baseOrigin: "https://example.test",
    });
    expect(loaded.source).toBe("fixture");
    expect(loaded.transportError).toMatchObject({ code: "api_not_configured" });
    expect(loaded.response.request_id).toBe(API_REQUEST_FIXTURE.request_id);

    const unmatched = clone(API_REQUEST_FIXTURE);
    unmatched.request_id = "unmatched-request";
    await expect(loadReportWithExplicitFixtureFallback({
      endpoint: undefined,
      request: unmatched,
      allowFixtureFallback: true,
      baseOrigin: "https://example.test",
    })).rejects.toMatchObject({ code: "api_not_configured" });
  });

  it("研究versionはloopback限定・公開未配備で、後継版重複期間を180日以上に固定する", () => {
    expect(P2_API_VERSION_REGISTRY.endpoint_status).toBe("local_research_only");
    expect(P2_API_VERSION_REGISTRY.versions[0]).toMatchObject({
      api_version: API_SCHEMA_VERSION,
      status: "research",
      available: false,
      sunset_at: null,
    });
    expect(P2_API_VERSION_REGISTRY.policy).toMatchObject({
      minimum_successor_overlap_days_after_public_release: 180,
      sunset_header_required: true,
      fixture_fallback_required: true,
      silent_fallback_for_unmatched_input_forbidden: true,
    });
  });
});
