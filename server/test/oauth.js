import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { serverRoot } from '../src/config.js';
import { pool, query } from '../src/db/pool.js';

const API_PORT = 4109;
const PROVIDER_PORT = 4110;
const BASE = `http://localhost:${API_PORT}`;
const PROVIDER_BASE = `http://localhost:${PROVIDER_PORT}`;

const ACCOUNT = {
  id: `oauth-${Date.now()}`,
  email: `oauth${Date.now()}@matcha.local`,
  username: `oauth${Date.now()}`.slice(0, 18),
  firstName: 'Olive',
  lastName: 'Tester',
};

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`  ok    ${name}`);
  } catch (error) {
    results.push(false);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
}

function startProvider() {
  const issued = new Set();

  const server = createServer((req, res) => {
    const url = new URL(req.url, PROVIDER_BASE);

    if (url.pathname === '/authorize') {
      const redirect = new URL(url.searchParams.get('redirect_uri'));
      redirect.searchParams.set('code', 'test-code');
      redirect.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { location: redirect.toString() });
      res.end();
      return;
    }

    if (url.pathname === '/token') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const ok =
          params.get('code') === 'test-code' &&
          params.get('client_id') === 'test-client' &&
          params.get('client_secret') === 'test-secret';

        res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
        if (ok) issued.add('test-access-token');
        res.end(JSON.stringify(ok ? { access_token: 'test-access-token' } : { error: 'invalid_grant' }));
      });
      return;
    }

    if (url.pathname === '/userinfo') {
      const ok = req.headers.authorization === 'Bearer test-access-token';
      res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify(ok ? ACCOUNT : { error: 'unauthorized' }));
      return;
    }

    res.writeHead(404).end();
  });

  return new Promise((done) => server.listen(PROVIDER_PORT, () => done(server)));
}

function startApi() {
  const child = spawn('node', ['src/index.js'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(API_PORT),
      PUBLIC_URL: BASE,
      OAUTH_MOCK_CLIENT_ID: 'test-client',
      OAUTH_MOCK_CLIENT_SECRET: 'test-secret',
      OAUTH_MOCK_BASE_URL: PROVIDER_BASE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('the API did not start in time')), 15000);
    const ready = async () => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          const response = await fetch(`${BASE}/api/health`);
          if (response.ok) {
            clearTimeout(timer);
            return done(child);
          }
        } catch {
          /* not up yet */
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      clearTimeout(timer);
      return fail(new Error('the API never answered'));
    };
    ready();
  });
}

const jar = new Map();

function absorb(response) {
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}

const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function main() {
  console.log(`Running OAuth tests against ${BASE}\n`);

  const provider = await startProvider();
  const api = await startApi();

  try {
    await test('the test provider is advertised when it is configured', async () => {
      const data = await fetch(`${BASE}/api/auth/oauth/providers`).then((r) => r.json());
      assert.ok(data.items.some((entry) => entry.name === 'mock'), 'mock provider missing');
    });

    await test('an unconfigured provider is refused', async () => {
      const response = await fetch(`${BASE}/api/auth/oauth/nowhere`, { redirect: 'manual' });
      assert.equal(response.status, 400);
    });

    let authorizeUrl = null;
    await test('starting the flow redirects to the provider with a state', async () => {
      const response = await fetch(`${BASE}/api/auth/oauth/mock`, { redirect: 'manual' });
      absorb(response);
      assert.equal(response.status, 302);

      authorizeUrl = new URL(response.headers.get('location'));
      assert.equal(authorizeUrl.origin, PROVIDER_BASE);
      assert.equal(authorizeUrl.searchParams.get('client_id'), 'test-client');
      assert.ok(authorizeUrl.searchParams.get('state'), 'no state parameter');
      assert.ok(jar.get('matcha_oauth_state'), 'no state cookie');
    });

    await test('a callback with a forged state is rejected', async () => {
      const response = await fetch(`${BASE}/api/auth/oauth/mock/callback?code=test-code&state=forged`, {
        redirect: 'manual',
        headers: { cookie: cookieHeader() },
      });
      assert.equal(response.status, 302);
      assert.match(response.headers.get('location'), /result=bad-state/);
    });

    await test('the full round trip creates an account and signs it in', async () => {
      const restart = await fetch(`${BASE}/api/auth/oauth/mock`, { redirect: 'manual' });
      absorb(restart);
      const state = new URL(restart.headers.get('location')).searchParams.get('state');

      const providerHop = await fetch(new URL(restart.headers.get('location')), { redirect: 'manual' });
      const back = new URL(providerHop.headers.get('location'));
      assert.equal(back.searchParams.get('state'), state);

      const callback = await fetch(back, { redirect: 'manual', headers: { cookie: cookieHeader() } });
      absorb(callback);
      assert.equal(callback.status, 302);
      assert.match(callback.headers.get('location'), /result=complete-profile/);

      const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: cookieHeader() } }).then((r) => r.json());
      assert.ok(me.user, 'no session after the callback');
      assert.equal(me.user.email, ACCOUNT.email);
      assert.equal(me.user.isVerified, true);
      assert.equal(me.user.profileComplete, false);
    });

    await test('an account created through the provider has no password', async () => {
      const { rows } = await query('SELECT password_hash FROM users WHERE lower(email) = lower($1)', [ACCOUNT.email]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].password_hash, null);
    });

    await test('signing in again links to the same account instead of creating another', async () => {
      const fresh = new Map();
      const grab = (response) => {
        for (const cookie of response.headers.getSetCookie?.() ?? []) {
          const [pair] = cookie.split(';');
          const i = pair.indexOf('=');
          fresh.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
        }
      };

      const start = await fetch(`${BASE}/api/auth/oauth/mock`, { redirect: 'manual' });
      grab(start);
      const hop = await fetch(new URL(start.headers.get('location')), { redirect: 'manual' });
      const callback = await fetch(new URL(hop.headers.get('location')), {
        redirect: 'manual',
        headers: { cookie: [...fresh].map(([k, v]) => `${k}=${v}`).join('; ') },
      });
      assert.equal(callback.status, 302);

      const { rows } = await query('SELECT count(*)::int AS total FROM users WHERE lower(email) = lower($1)', [
        ACCOUNT.email,
      ]);
      assert.equal(rows[0].total, 1);

      const links = await query('SELECT count(*)::int AS total FROM oauth_accounts WHERE provider_account_id = $1', [
        ACCOUNT.id,
      ]);
      assert.equal(links.rows[0].total, 1);
    });

    await query('DELETE FROM users WHERE lower(email) = lower($1)', [ACCOUNT.email]);

    const failed = results.filter((ok) => !ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    api.kill('SIGTERM');
    provider.close();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
