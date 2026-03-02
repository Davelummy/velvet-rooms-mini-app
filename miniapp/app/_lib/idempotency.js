export function generateIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Keyed idempotency cache: returns same key for same scope within a session
const cache = new Map();

export function getIdempotencyKey(scope) {
  if (!cache.has(scope)) {
    cache.set(scope, generateIdempotencyKey());
  }
  return cache.get(scope);
}

export function clearIdempotencyKey(scope) {
  cache.delete(scope);
}

export function clearAllIdempotencyKeys() {
  cache.clear();
}
