const buckets = new Map<string, number[]>();

const prune = (timestamps: number[], now: number, windowMs: number) => timestamps.filter((ts) => now - ts < windowMs);

export const getRateLimitKey = (req: any, userId?: string) => {
  if (userId) return `user:${userId}`;

  const forwarded = req.headers?.['x-forwarded-for'] || req.headers?.['X-Forwarded-For'];
  const firstIp = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : '';
  if (firstIp) return `ip:${firstIp}`;

  return 'unknown';
};

export const allow = (key: string, windowSec: number, maxRequests: number) => {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const next = prune(buckets.get(key) || [], now, windowMs);

  if (next.length >= maxRequests) {
    const oldest = next[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return {
      ok: false,
      retryAfterSec,
      remaining: 0,
      resetInSec: retryAfterSec,
    };
  }

  next.push(now);
  buckets.set(key, next);

  const resetInSec = next[0] ? Math.max(1, Math.ceil((windowMs - (now - next[0])) / 1000)) : windowSec;

  return {
    ok: true,
    remaining: Math.max(0, maxRequests - next.length),
    resetInSec,
  };
};
