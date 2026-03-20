import { NextFunction, Request, Response } from "express";

import { fixRegistry } from "../fixes/fixRegistry";
import {
  getOrCreateCache,
  responseCaches
} from "../fixes/strategies/responseCache";
import { generateFingerprint } from "../utils/fingerprint";
import { sanitizeQueryParams } from "../utils/sanitize";

function normalizeHeaders(headers: Response["getHeaders"] extends () => infer T ? T : never): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key] = value.join(",");
    } else if (typeof value === "number") {
      normalized[key] = String(value);
    } else if (typeof value === "string") {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function fixInterceptor() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const route = req.route?.path || req.path;
    const fix = fixRegistry.getFixForRoute(route);

    if (!fix) {
      next();
      return;
    }

    if (fix.strategy === "response_cache") {
      const sanitizedQuery = sanitizeQueryParams(
        req.query as Record<string, unknown>
      );
      const fingerprint = generateFingerprint(req.method, route, sanitizedQuery);
      const ttlMs =
        typeof fix.params.ttlMs === "number" ? fix.params.ttlMs : 5000;
      const cache =
        responseCaches.get(route) ?? getOrCreateCache(route, ttlMs);
      const cachedResponse = cache.get(fingerprint);

      if (cachedResponse) {
        res.setHeader("x-fix-applied", "response_cache");
        res.setHeader("x-cache-hit", "true");

        for (const [headerName, headerValue] of Object.entries(
          cachedResponse.headers
        )) {
          if (
            headerName === "x-fix-applied" ||
            headerName === "x-cache-hit" ||
            headerName === "x-request-id" ||
            headerName === "x-correlation-id" ||
            headerName === "x-chain-depth"
          ) {
            continue;
          }
          res.setHeader(headerName, headerValue);
        }

        console.log(
          `[FIX] Cache hit for ${req.method} ${route} (fingerprint: ${fingerprint})`
        );

        res.status(cachedResponse.statusCode).json(cachedResponse.body);
        return;
      }

      const originalJson = res.json.bind(res);
      let capturedBody: unknown;

      res.setHeader("x-fix-applied", "response_cache");
      res.setHeader("x-cache-hit", "false");

      res.json = ((body: unknown) => {
        capturedBody = body;
        return originalJson(body);
      }) as Response["json"];

      res.once("finish", () => {
        if (typeof capturedBody === "undefined") {
          return;
        }

        cache.set(
          fingerprint,
          capturedBody,
          res.statusCode,
          normalizeHeaders(res.getHeaders())
        );

        console.log(`[FIX] Cached response for ${req.method} ${route}`);
      });
    }

    next();
  };
}
