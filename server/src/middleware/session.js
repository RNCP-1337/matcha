import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { one, query } from '../db/pool.js';
import { hashToken, randomToken, safeEquals, sign, unsign } from '../lib/tokens.js';
import { forbidden, unauthorized } from '../lib/httpError.js';

const SESSION_COOKIE = 'matcha_sid';
const CSRF_COOKIE = 'matcha_csrf';

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export async function createSession(res, user, req) {
  const id = randomUUID();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, user.id, hashToken(token), String(req.get('user-agent') || '').slice(0, 255), req.ip, expiresAt],
  );

  const maxAge = config.sessionTtlDays * 24 * 60 * 60 * 1000;
  res.cookie(SESSION_COOKIE, sign(`${id}:${token}`), cookieOptions(maxAge));
  issueCsrfToken(res);
  return id;
}

export async function destroySession(req, res) {
  if (req.sessionId) await query('DELETE FROM sessions WHERE id = $1', [req.sessionId]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function issueCsrfToken(res) {
  const token = randomToken(24);
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
  });
  return token;
}

export async function loadSession(req, res, next) {
  req.user = null;
  req.sessionId = null;

  try {
    const raw = req.cookies?.[SESSION_COOKIE];
    const value = unsign(raw);
    if (!value) return next();

    const [id, token] = value.split(':');
    if (!id || !token) return next();

    const row = await one(
      `SELECT s.id AS session_id, s.token_hash, s.expires_at, u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1`,
      [id],
    );

    if (!row) return next();
    if (new Date(row.expires_at) < new Date()) {
      await query('DELETE FROM sessions WHERE id = $1', [id]);
      return next();
    }
    if (!safeEquals(row.token_hash, hashToken(token))) return next();

    const { session_id: sessionId, token_hash: _tokenHash, expires_at: _expiresAt, ...user } = row;
    req.user = user;
    req.sessionId = sessionId;

    if (!req.cookies?.[CSRF_COOKIE]) issueCsrfToken(res);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.is_verified) return next(forbidden('Confirm your email address to continue'));
  return next();
}

export function requireCompleteProfile(req, _res, next) {
  const user = req.user;
  const complete = Boolean(user.gender && user.birth_date && user.city && user.profile_photo_id);
  if (!complete) return next(forbidden('Complete your profile to use this feature'));
  return next();
}

export function verifyCsrf(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken || !safeEquals(cookieToken, headerToken)) {
    return next(forbidden('Invalid or missing CSRF token'));
  }
  return next();
}

export async function touchPresence(userId, isOnline) {
  await query('UPDATE users SET is_online = $2, last_seen = now() WHERE id = $1', [userId, isOnline]);
}
