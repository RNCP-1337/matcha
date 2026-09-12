import { Router } from 'express';
import { many, one, query, transaction } from '../db/pool.js';
import { badRequest, conflict, unauthorized } from '../lib/httpError.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/mailer.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import {
  checkEmail,
  checkName,
  checkPassword,
  checkUsername,
  collect,
  requireBody,
} from '../lib/validate.js';
import { asyncRoute } from '../middleware/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createSession, destroySession, issueCsrfToken, requireAuth } from '../middleware/session.js';
import { publicSelf } from './serializers.js';

const router = Router();

// Sign in is the endpoint worth guarding tightly: it is the one an attacker grinds against.
// Registration and outgoing mail are throttled to stop abuse, but loosely enough that a whole
// campus behind a single address can still use the site.
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, keyPrefix: 'login' });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40, keyPrefix: 'register' });
const mailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, keyPrefix: 'mail' });

async function issueToken(userId, purpose, ttlMs) {
  const token = randomToken();
  await query('DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
  await query(
    'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + ($4 || \' milliseconds\')::interval)',
    [userId, purpose, hashToken(token), String(ttlMs)],
  );
  return token;
}

async function consumeToken(rawToken, purpose) {
  if (typeof rawToken !== 'string' || rawToken.length < 10) return null;

  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM auth_tokens
        WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [hashToken(rawToken), purpose],
    );
    if (rows.length === 0) return null;

    await client.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [rows[0].id]);
    return rows[0];
  });
}

router.post(
  '/register',
  registerLimiter,
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);

    const values = collect({
      email: checkEmail(body.email),
      username: checkUsername(body.username),
      firstName: checkName(body.firstName, 'First name'),
      lastName: checkName(body.lastName, 'Last name'),
      password: checkPassword(body.password, {
        username: body.username,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
      }),
    });

    const existing = await many(
      'SELECT lower(email) AS email, lower(username) AS username FROM users WHERE lower(email) = $1 OR lower(username) = $2',
      [values.email, values.username.toLowerCase()],
    );

    if (existing.some((row) => row.email === values.email)) throw conflict('This email address is already registered');
    if (existing.some((row) => row.username === values.username.toLowerCase())) {
      throw conflict('This username is already taken');
    }

    const passwordHash = await hashPassword(values.password);
    const user = await one(
      `INSERT INTO users (email, username, first_name, last_name, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, username, first_name`,
      [values.email, values.username, values.firstName, values.lastName, passwordHash],
    );

    const token = await issueToken(user.id, 'email_verification', 24 * 60 * 60 * 1000);
    await sendVerificationEmail(user, token);

    res.status(201).json({ message: 'Account created. Check your inbox to confirm your email address.' });
  }),
);

router.post(
  '/verify',
  mailLimiter,
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    const token = await consumeToken(body.token, 'email_verification');
    if (!token) throw badRequest('This confirmation link is invalid or has expired');

    await query('UPDATE users SET is_verified = true, updated_at = now() WHERE id = $1', [token.user_id]);
    res.json({ message: 'Your account is confirmed. You can sign in now.' });
  }),
);

router.post(
  '/resend-verification',
  mailLimiter,
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    const { email } = collect({ email: checkEmail(body.email) });

    const user = await one(
      'SELECT id, email, first_name, is_verified FROM users WHERE lower(email) = $1',
      [email],
    );

    if (user && !user.is_verified) {
      const token = await issueToken(user.id, 'email_verification', 24 * 60 * 60 * 1000);
      await sendVerificationEmail(user, token);
    }

    res.json({ message: 'If that address needs confirming, a new link is on its way.' });
  }),
);

router.post(
  '/login',
  loginLimiter,
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) throw badRequest('Username and password are required');

    const user = await one('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
    const passwordOk = user ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !passwordOk) throw unauthorized('Incorrect username or password');
    if (!user.is_verified) {
      throw unauthorized('Confirm your email address before signing in. Check your inbox for the link.');
    }

    await createSession(res, user, req);
    await query('UPDATE users SET last_seen = now() WHERE id = $1', [user.id]);

    const fresh = await one('SELECT * FROM users WHERE id = $1', [user.id]);
    res.json({ user: await publicSelf(fresh) });
  }),
);

router.post(
  '/logout',
  asyncRoute(async (req, res) => {
    if (req.user) {
      await query('UPDATE users SET is_online = false, last_seen = now() WHERE id = $1', [req.user.id]);
    }
    await destroySession(req, res);
    res.json({ message: 'Signed out' });
  }),
);

router.get(
  '/me',
  asyncRoute(async (req, res) => {
    if (!req.cookies?.matcha_csrf) issueCsrfToken(res);
    if (!req.user) return res.json({ user: null });
    return res.json({ user: await publicSelf(req.user) });
  }),
);

router.post(
  '/forgot-password',
  mailLimiter,
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    const { email } = collect({ email: checkEmail(body.email) });

    const user = await one('SELECT id, email, first_name FROM users WHERE lower(email) = $1', [email]);
    if (user) {
      const token = await issueToken(user.id, 'password_reset', 60 * 60 * 1000);
      await sendPasswordResetEmail(user, token);
    }

    res.json({ message: 'If an account exists for that address, a reset link has been sent.' });
  }),
);

router.post(
  '/reset-password',
  mailLimiter,
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    const token = await consumeToken(body.token, 'password_reset');
    if (!token) throw badRequest('This reset link is invalid or has expired');

    const user = await one('SELECT username, email, first_name, last_name FROM users WHERE id = $1', [token.user_id]);
    const { password } = collect({
      password: checkPassword(body.password, {
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      }),
    });

    const passwordHash = await hashPassword(password);
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, token.user_id]);
    await query('DELETE FROM sessions WHERE user_id = $1', [token.user_id]);

    res.json({ message: 'Password updated. You can sign in with your new password.' });
  }),
);

router.put(
  '/password',
  requireAuth,
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';

    const stored = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(current, stored.password_hash))) {
      throw badRequest('Current password is incorrect', { currentPassword: 'Current password is incorrect' });
    }

    const { password } = collect({
      password: checkPassword(body.password, {
        username: req.user.username,
        email: req.user.email,
        firstName: req.user.first_name,
        lastName: req.user.last_name,
      }),
    });

    const passwordHash = await hashPassword(password);
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, req.user.id]);
    await query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [req.user.id, req.sessionId]);

    res.json({ message: 'Password updated' });
  }),
);

export default router;
