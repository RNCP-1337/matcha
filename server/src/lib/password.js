import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 };

export async function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain.normalize('NFKC'), salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: 128 * PARAMS.N * PARAMS.r * 2,
  });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const N = Number(n);
  const rr = Number(r);

  const derived = await scryptAsync(plain.normalize('NFKC'), salt, expected.length, {
    N,
    r: rr,
    p: Number(p),
    maxmem: 128 * N * rr * 2,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
