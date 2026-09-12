import { tooMany } from '../lib/httpError.js';

const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt < now) buckets.delete(key);
  }
}, 60_000).unref();

export function rateLimit({ windowMs, max, keyPrefix }) {
  return (req, _res, next) => {
    const key = `${keyPrefix}:${req.ip}`;
    const now = Date.now();
    const entry = buckets.get(key);

    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const seconds = Math.ceil((entry.resetAt - now) / 1000);
      return next(tooMany(`Too many attempts. Try again in ${seconds} second(s).`));
    }
    return next();
  };
}
