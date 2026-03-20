import { createHash } from "crypto";

// Example: generateFingerprint("get", "/api/users/:id", { expand: "true", page: "2" }) -> SHA-256("GET:/api/users/:id:expand,page")
// Example: generateFingerprint("post", "/api/orders", {}) -> SHA-256("POST:/api/orders:")
// Example: generateFingerprint("delete", "/api/sessions/:id", { force: "1" }) -> SHA-256("DELETE:/api/sessions/:id:force")
export function generateFingerprint(
  method: string,
  route: string,
  queryParams: Record<string, string>
): string {
  const normalizedMethod = method.toUpperCase();
  const sortedQueryKeys = Object.keys(queryParams).sort();
  const fingerprintInput = `${normalizedMethod}:${route}:${sortedQueryKeys.join(",")}`;

  return createHash("sha256").update(fingerprintInput).digest("hex");
}
