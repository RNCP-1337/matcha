import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return createHmac('sha256', config.tokenPepper).update(token).digest('hex');
}

export function sign(value) {
  const signature = createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

export function unsign(signed) {
  if (typeof signed !== 'string') return null;
  const index = signed.lastIndexOf('.');
  if (index <= 0) return null;

  const value = signed.slice(0, index);
  const provided = Buffer.from(signed.slice(index + 1));
  const expected = Buffer.from(createHmac('sha256', config.sessionSecret).update(value).digest('base64url'));

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return value;
}

export function safeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
