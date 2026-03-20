const SENSITIVE_KEY_PATTERN =
  /token|key|secret|password|auth|credential|apikey/i;
const MAX_QUERY_KEYS = 20;

export function sanitizeQueryParams(
  query: Record<string, any>
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(query).slice(0, MAX_QUERY_KEYS)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => String(item)).join(",");
      continue;
    }

    sanitized[key] = String(value);
  }

  return sanitized;
}
