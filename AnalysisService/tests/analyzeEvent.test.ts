import { describe, expect, it } from "vitest";
import { analyzeEvent } from "../src/ruleEngine/analyzeEvent";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/config/mvpConfig";
import { makeRawEvent } from "./fixtures/rawEvents";

const testConfig = {
  ...DEFAULT_ANALYSIS_CONFIG,
  endpointHotspots: {
    ...DEFAULT_ANALYSIS_CONFIG.endpointHotspots,
    enabled: false
  }
};

describe("AnalysisService rule engine (MVP)", () => {
  it("flags duplicate API requests (ORANGE)", () => {
    const t1 = "2026-03-20T10:00:00.000Z";
    const t2 = "2026-03-20T10:00:01.000Z";
    const route = "/api/users/{id}";
    const fingerprint = "fp:GET:/api/users/{id}:include=profile";

    const e1 = makeRawEvent({
      requestId: "r1",
      timestamp: t1,
      method: "GET",
      route,
      fingerprint,
      clientId: "client-1",
      sessionId: "sess-1",
      userAgent: "ua-a"
    });
    const e2 = makeRawEvent({
      requestId: "r2",
      timestamp: t2,
      method: "GET",
      route,
      fingerprint,
      clientId: "client-1",
      sessionId: "sess-1",
      userAgent: "ua-a"
    });

    const analyzed = analyzeEvent({
      currentEvent: e2,
      fingerprintHistory: [e1],
      routeHistory: [e1],
      config: testConfig
    });

    expect(analyzed.flagged).toBe(true);
    expect(analyzed.severity).toBe("ORANGE");
    expect(analyzed.ruleHits.some((h) => h.ruleName === "duplicateRequests")).toBe(true);
  });

  it("flags burst traffic (RED)", () => {
    const base = new Date("2026-03-20T10:00:00.000Z").getTime();
    const route = "/api/search";
    const fingerprint = "fp:GET:/api/search:q=*";

    const events = Array.from({ length: 8 }).map((_, i) => {
      const t = new Date(base + i * 200).toISOString(); // 0..1400ms
      return makeRawEvent({
        requestId: `b${i + 1}`,
        timestamp: t,
        method: "GET",
        route,
        fingerprint,
        clientId: "client-burst",
        sessionId: "sess-burst",
        userAgent: "ua-burst"
      });
    });

    const current = events[7];
    const history = events.slice(0, 7);

    const analyzed = analyzeEvent({
      currentEvent: current,
      fingerprintHistory: history,
      routeHistory: history,
      config: testConfig
    });

    expect(analyzed.severity).toBe("RED");
    expect(analyzed.ruleHits.some((h) => h.ruleName === "burstTraffic")).toBe(true);
  });

  it("flags excessive polling (ORANGE)", () => {
    const base = new Date("2026-03-20T10:00:00.000Z").getTime();
    const route = "/api/notifications/stream";
    const fingerprint = "fp:GET:/api/notifications/stream";

    const events = Array.from({ length: 5 }).map((_, i) => {
      const t = new Date(base + i * 200).toISOString(); // min interval 200ms
      return makeRawEvent({
        requestId: `p${i + 1}`,
        timestamp: t,
        method: "GET",
        route,
        fingerprint,
        clientId: "client-poll",
        sessionId: "sess-poll",
        userAgent: "ua-poll"
      });
    });

    const current = events[4];
    const history = events.slice(0, 4);

    const analyzed = analyzeEvent({
      currentEvent: current,
      fingerprintHistory: history,
      routeHistory: history,
      config: testConfig
    });

    expect(analyzed.severity).toBe("ORANGE");
    const pollingHit = analyzed.ruleHits.find((h) => h.ruleName === "excessivePolling");
    expect(pollingHit).toBeTruthy();
    expect(pollingHit?.severity).toBe("ORANGE");
  });

  it("flags retry storm (ORANGE)", () => {
    const base = new Date("2026-03-20T10:00:00.000Z").getTime();
    const route = "/api/payments/charge";
    const fingerprint = "fp:POST:/api/payments/charge";

    const events = Array.from({ length: 4 }).map((_, i) => {
      const t = new Date(base + i * 700).toISOString(); // failures within 5s
      return makeRawEvent({
        requestId: `rt${i + 1}`,
        timestamp: t,
        method: "POST",
        route,
        fingerprint,
        clientId: "client-retry",
        sessionId: "sess-retry",
        userAgent: "ua-retry",
        success: false,
        statusCode: 500
      });
    });

    const current = events[3];
    const history = events.slice(0, 3);

    const analyzed = analyzeEvent({
      currentEvent: current,
      fingerprintHistory: history,
      routeHistory: history,
      config: testConfig
    });

    expect(analyzed.ruleHits.some((h) => h.ruleName === "retryStorm")).toBe(true);
    const retryHit = analyzed.ruleHits.find((h) => h.ruleName === "retryStorm");
    expect(retryHit?.severity).toBe("ORANGE");
  });

  it("flags authentication abuse (RED)", () => {
    const base = new Date("2026-03-20T10:00:00.000Z").getTime();
    const route = "/auth/login";
    const fingerprint = "fp:POST:/auth/login";

    const events = Array.from({ length: 5 }).map((_, i) => {
      const t = new Date(base + i * 900).toISOString(); // all within 30s
      return makeRawEvent({
        requestId: `a${i + 1}`,
        timestamp: t,
        method: "POST",
        route,
        fingerprint,
        clientId: "client-auth",
        sessionId: "sess-auth",
        userAgent: "ua-auth",
        success: false,
        statusCode: 401
      });
    });

    const current = events[4];
    const history = events.slice(0, 4);

    const analyzed = analyzeEvent({
      currentEvent: current,
      fingerprintHistory: history,
      routeHistory: history,
      config: testConfig
    });

    expect(analyzed.severity).toBe("RED");
    const hit = analyzed.ruleHits.find((h) => h.ruleName === "authenticationAbuse");
    expect(hit?.severity).toBe("RED");
  });
});

