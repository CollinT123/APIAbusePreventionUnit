import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

import { config } from "../config";
import { ApiEvent } from "../types/apiEvent";
import { generateFingerprint } from "../utils/fingerprint";
import { sanitizeQueryParams } from "../utils/sanitize";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
    correlationId?: string;
  }
}

function getRequestBodySize(req: Request): number | null {
  const contentLengthHeader = req.headers["content-length"];

  if (typeof contentLengthHeader === "string") {
    const parsedContentLength = Number(contentLengthHeader);

    return Number.isFinite(parsedContentLength) ? parsedContentLength : null;
  }

  if (typeof req.body === "undefined") {
    return null;
  }

  if (typeof req.body === "string") {
    return Buffer.byteLength(req.body);
  }

  return Buffer.byteLength(JSON.stringify(req.body));
}

export function requestTracker(onEvent: (event: ApiEvent) => void) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = process.hrtime.bigint();
    const startedAt = new Date().toISOString();
    const requestId = uuidv4();
    const headerCorrelationId = req.headers["x-correlation-id"];
    const correlationId =
      typeof headerCorrelationId === "string" && headerCorrelationId.trim() !== ""
        ? headerCorrelationId
        : uuidv4();
    const chainDepthHeader = req.headers["x-chain-depth"];
    const currentChainDepth =
      typeof chainDepthHeader === "string" && Number.isFinite(Number(chainDepthHeader))
        ? Number(chainDepthHeader)
        : 0;

    req.requestId = requestId;
    req.correlationId = correlationId;

    res.setHeader("x-request-id", requestId);
    res.setHeader("x-correlation-id", correlationId);
    res.setHeader("x-chain-depth", String(currentChainDepth + 1));

    res.on("finish", () => {
      const completedAt = new Date().toISOString();
      const latencyMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      const route =
        typeof req.route?.path === "string" ? req.route.path : req.originalUrl;
      const queryParams = sanitizeQueryParams(
        req.query as Record<string, unknown>
      );
      const fingerprint = generateFingerprint(req.method, route, queryParams);
      const responseSizeHeader = res.getHeader("content-length");
      const responseSize =
        typeof responseSizeHeader === "string"
          ? Number(responseSizeHeader)
          : typeof responseSizeHeader === "number"
            ? responseSizeHeader
            : null;
      const clientIdHeader = req.headers["x-client-id"];
      const sessionIdHeader = req.headers["x-session-id"];
      const requestBodySize = getRequestBodySize(req);

      const event: ApiEvent = {
        requestId,
        correlationId,
        schemaVersion: config.SCHEMA_VERSION,
        timestamp: startedAt,
        completedAt,
        latencyMs,
        method: req.method,
        originalUrl: req.originalUrl,
        route,
        queryParams,
        fingerprint,
        chainDepth: currentChainDepth,
        statusCode: res.statusCode,
        success: res.statusCode >= 200 && res.statusCode < 400,
        requestBodySize,
        responseSize: Number.isFinite(responseSize) ? responseSize : null,
        serviceName: config.SERVICE_NAME,
        environment: config.ENVIRONMENT,
        clientId: typeof clientIdHeader === "string" ? clientIdHeader : null,
        sessionId: typeof sessionIdHeader === "string" ? sessionIdHeader : null,
        userAgent: req.get("user-agent") ?? null
      };

      onEvent(event);
    });

    next();
  };
}
