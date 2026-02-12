import crypto from "crypto";

export function createRequestContext(request, name) {
  const requestId = crypto.randomUUID();
  const forwarded = request?.headers?.get("x-forwarded-for") || "";
  const ip =
    forwarded.split(",")[0]?.trim() ||
    request?.headers?.get("x-real-ip") ||
    "";
  return {
    requestId,
    name,
    ip,
    startedAt: Date.now(),
  };
}

export function withRequestId(payload, requestId) {
  return { ...payload, request_id: requestId };
}

export function logError(ctx, message, extra = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      request_id: ctx?.requestId,
      route: ctx?.name,
      ip: ctx?.ip,
      message,
      ...extra,
    })
  );
}

export function logInfo(ctx, message, extra = {}) {
  console.info(
    JSON.stringify({
      level: "info",
      request_id: ctx?.requestId,
      route: ctx?.name,
      ip: ctx?.ip,
      message,
      ...extra,
    })
  );
}
