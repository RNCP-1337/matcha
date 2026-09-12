import { Router } from 'express';
import { config } from '../config.js';
import { one, query, transaction } from '../db/pool.js';
import { badRequest } from '../lib/httpError.js';
import { authorizeUrl, enabledProviders, exchangeCode, providerConfig } from '../lib/oauth.js';
import { randomToken, safeEquals } from '../lib/tokens.js';
import { asyncRoute } from '../middleware/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createSession } from '../middleware/session.js';

const router = Router();
const STATE_COOKIE = 'matcha_oauth_state';
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'oauth' });

function redirectUri(provider) {
  return `${config.publicUrl}/api/auth/oauth/${provider}/callback`;
}

function finish(res, outcome) {
  res.redirect(`${config.publicUrl}/oauth?result=${encodeURIComponent(outcome)}`);
}

async function uniqueUsername(candidate) {
  const base = String(candidate || 'member')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 16) || 'member';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const username = attempt === 0 ? base : `${base}${attempt + 1}`;
    const taken = await one('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
    if (!taken) return username;
  }
  return `${base}${Date.now().toString(36).slice(-5)}`;
}

router.get(
  '/providers',
  asyncRoute(async (_req, res) => {
    res.json({ items: enabledProviders() });
  }),
);

router.get(
  '/:provider',
  limiter,
  asyncRoute(async (req, res) => {
    const provider = providerConfig(req.params.provider);
    if (!provider) throw badRequest('This sign in provider is not configured');

    const state = randomToken(24);
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      maxAge: 10 * 60 * 1000,
    });

    res.redirect(authorizeUrl(provider, state, redirectUri(provider.name)));
  }),
);

router.get(
  '/:provider/callback',
  limiter,
  asyncRoute(async (req, res) => {
    const provider = providerConfig(req.params.provider);
    if (!provider) return finish(res, 'unknown-provider');

    const expected = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/' });

    if (req.query.error) return finish(res, 'cancelled');
    if (!expected || !safeEquals(String(req.query.state || ''), expected)) return finish(res, 'bad-state');
    if (!req.query.code) return finish(res, 'no-code');

    let profile;
    try {
      const accessToken = await exchangeCode(provider, String(req.query.code), redirectUri(provider.name));
      profile = await provider.profile(accessToken);
    } catch (error) {
      console.error(`[oauth] ${provider.name} exchange failed: ${error.message}`);
      return finish(res, 'exchange-failed');
    }

    if (!profile?.id) return finish(res, 'no-profile');

    const user = await transaction(async (client) => {
      const linked = await client.query(
        `SELECT u.* FROM oauth_accounts o JOIN users u ON u.id = o.user_id
          WHERE o.provider = $1 AND o.provider_account_id = $2`,
        [provider.name, profile.id],
      );
      if (linked.rows.length > 0) return linked.rows[0];

      if (profile.email) {
        const existing = await client.query('SELECT * FROM users WHERE lower(email) = lower($1)', [profile.email]);
        if (existing.rows.length > 0) {
          await client.query(
            `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, email)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [existing.rows[0].id, provider.name, profile.id, profile.email],
          );
          await client.query('UPDATE users SET is_verified = true WHERE id = $1', [existing.rows[0].id]);
          return existing.rows[0];
        }
      }

      const username = await uniqueUsername(profile.username || profile.firstName);
      const email = profile.email || `${username}.${provider.name}@matcha.invalid`;

      const created = await client.query(
        `INSERT INTO users (email, username, first_name, last_name, is_verified)
         VALUES ($1, $2, $3, $4, true) RETURNING *`,
        [email.toLowerCase(), username, profile.firstName || username, profile.lastName || username],
      );

      await client.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, email)
         VALUES ($1, $2, $3, $4)`,
        [created.rows[0].id, provider.name, profile.id, profile.email],
      );

      return created.rows[0];
    });

    await createSession(res, user, req);
    await query('UPDATE users SET last_seen = now() WHERE id = $1', [user.id]);

    const complete = Boolean(user.gender && user.birth_date && user.city && user.profile_photo_id);
    return finish(res, complete ? 'signed-in' : 'complete-profile');
  }),
);

export default router;
