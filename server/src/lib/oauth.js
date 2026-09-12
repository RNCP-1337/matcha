import { config } from '../config.js';

const PROVIDERS = {
  github: {
    label: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    async profile(accessToken) {
      const headers = { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json' };
      const account = await fetch('https://api.github.com/user', { headers }).then((r) => r.json());
      let email = account.email;

      if (!email) {
        const emails = await fetch('https://api.github.com/user/emails', { headers }).then((r) => r.json());
        email = Array.isArray(emails)
          ? emails.find((entry) => entry.primary && entry.verified)?.email || emails.find((e) => e.verified)?.email
          : null;
      }

      const [first, ...rest] = String(account.name || account.login || '').trim().split(/\s+/);
      return {
        id: String(account.id),
        email,
        username: account.login,
        firstName: first || account.login,
        lastName: rest.join(' ') || account.login,
      };
    },
  },
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async profile(accessToken) {
      const account = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${accessToken}` },
      }).then((r) => r.json());

      return {
        id: String(account.sub),
        email: account.email_verified ? account.email : null,
        username: (account.email || '').split('@')[0],
        firstName: account.given_name || account.name || 'Member',
        lastName: account.family_name || account.given_name || 'Member',
      };
    },
  },
};

// Test double used by `make test` so the whole OAuth round trip can be exercised without
// registering an application with a real provider. Never available in production.
if (!config.isProduction && config.oauth.mock.baseUrl) {
  const base = config.oauth.mock.baseUrl.replace(/\/$/, '');
  PROVIDERS.mock = {
    label: 'Test provider',
    authorizeUrl: `${base}/authorize`,
    tokenUrl: `${base}/token`,
    scope: 'profile',
    async profile(accessToken) {
      const account = await fetch(`${base}/userinfo`, {
        headers: { authorization: `Bearer ${accessToken}` },
      }).then((r) => r.json());
      return {
        id: String(account.id),
        email: account.email,
        username: account.username,
        firstName: account.firstName,
        lastName: account.lastName,
      };
    },
  };
}

export function providerConfig(name) {
  const provider = PROVIDERS[name];
  if (!provider) return null;

  const credentials = config.oauth[name];
  if (!credentials?.clientId || !credentials?.clientSecret) return null;

  return { name, ...provider, ...credentials };
}

export function enabledProviders() {
  return Object.keys(PROVIDERS)
    .map((name) => providerConfig(name))
    .filter(Boolean)
    .map((provider) => ({ name: provider.name, label: provider.label }));
}

export function authorizeUrl(provider, state, redirectUri) {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', provider.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

export async function exchangeCode(provider, code, redirectUri) {
  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'The provider refused the authorization code');
  }
  return payload.access_token;
}
