import { describe, expect, it } from "vitest";

import { generateFingerprint } from "../src/utils/fingerprint";

describe("generateFingerprint", () => {
  it("produces the same hash for the same method, route, and query keys", () => {
    const first = generateFingerprint("GET", "/api/users/:id", {
      expand: "true",
      page: "1"
    });
    const second = generateFingerprint("GET", "/api/users/:id", {
      expand: "true",
      page: "1"
    });

    expect(first).toBe(second);
  });

  it("ignores query values when the keys are the same", () => {
    const first = generateFingerprint("GET", "/api/users/:id", {
      expand: "true",
      page: "1"
    });
    const second = generateFingerprint("GET", "/api/users/:id", {
      expand: "false",
      page: "99"
    });

    expect(first).toBe(second);
  });

  it("produces different hashes when query keys differ", () => {
    const first = generateFingerprint("GET", "/api/users/:id", {
      expand: "true"
    });
    const second = generateFingerprint("GET", "/api/users/:id", {
      filter: "active"
    });

    expect(first).not.toBe(second);
  });

  it("produces different hashes for different methods", () => {
    const getHash = generateFingerprint("GET", "/api/users/:id", {
      expand: "true"
    });
    const postHash = generateFingerprint("POST", "/api/users/:id", {
      expand: "true"
    });

    expect(getHash).not.toBe(postHash);
  });

  it("produces different hashes for different routes", () => {
    const usersHash = generateFingerprint("GET", "/api/users/:id", {
      expand: "true"
    });
    const ordersHash = generateFingerprint("GET", "/api/orders/:id", {
      expand: "true"
    });

    expect(usersHash).not.toBe(ordersHash);
  });

  it("handles empty query params correctly", () => {
    const first = generateFingerprint("GET", "/api/health", {});
    const second = generateFingerprint("GET", "/api/health", {});

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("sorts query keys so key order does not affect the hash", () => {
    const first = generateFingerprint("GET", "/api/users/:id", {
      zeta: "1",
      alpha: "2",
      middle: "3"
    });
    const second = generateFingerprint("GET", "/api/users/:id", {
      middle: "9",
      zeta: "8",
      alpha: "7"
    });

    expect(first).toBe(second);
  });
});
