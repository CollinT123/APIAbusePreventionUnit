import { describe, expect, it } from "vitest";

import { sanitizeQueryParams } from "../src/utils/sanitize";

describe("sanitizeQueryParams", () => {
  it("passes through normal string params unchanged", () => {
    expect(
      sanitizeQueryParams({
        page: "1",
        sort: "desc"
      })
    ).toEqual({
      page: "1",
      sort: "desc"
    });
  });

  it("redacts values for sensitive keys", () => {
    expect(
      sanitizeQueryParams({
        token: "abc123",
        access_key: "secret-key",
        dbSecret: "hidden",
        password: "hunter2",
        authCode: "code"
      })
    ).toEqual({
      token: "[REDACTED]",
      access_key: "[REDACTED]",
      dbSecret: "[REDACTED]",
      password: "[REDACTED]",
      authCode: "[REDACTED]"
    });
  });

  it("redacts sensitive keys case-insensitively", () => {
    expect(
      sanitizeQueryParams({
        API_KEY: "one",
        apiKey: "two",
        ApiToken: "three"
      })
    ).toEqual({
      API_KEY: "[REDACTED]",
      apiKey: "[REDACTED]",
      ApiToken: "[REDACTED]"
    });
  });

  it("joins array values with commas", () => {
    expect(
      sanitizeQueryParams({
        tags: ["alpha", "beta", "gamma"]
      })
    ).toEqual({
      tags: "alpha,beta,gamma"
    });
  });

  it("converts non-string values to strings", () => {
    expect(
      sanitizeQueryParams({
        page: 2,
        enabled: false,
        extra: { nested: true }
      })
    ).toEqual({
      page: "2",
      enabled: "false",
      extra: "[object Object]"
    });
  });

  it("limits output to 20 keys", () => {
    const input = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`key${index + 1}`, `${index + 1}`])
    );
    const output = sanitizeQueryParams(input);

    expect(Object.keys(output)).toHaveLength(20);
    expect(output.key1).toBe("[REDACTED]");
    expect(output.key20).toBe("[REDACTED]");
    expect(output.key21).toBeUndefined();
  });

  it("returns an empty object for an empty input", () => {
    expect(sanitizeQueryParams({})).toEqual({});
  });
});
