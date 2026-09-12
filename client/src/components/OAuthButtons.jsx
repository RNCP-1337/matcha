import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function OAuthButtons({ verb }) {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    api
      .get('/api/auth/oauth/providers')
      .then((data) => setProviders(data.items))
      .catch(() => setProviders([]));
  }, []);

  if (providers.length === 0) return null;

  return (
    <>
      <div className="divider" />
      <p className="small muted center" style={{ marginBottom: 10 }}>
        or continue with
      </p>
      <div className="button-row" style={{ justifyContent: 'center' }}>
        {providers.map((provider) => (
          <a className="button button--secondary" key={provider.name} href={`/api/auth/oauth/${provider.name}`}>
            {verb} with {provider.label}
          </a>
        ))}
      </div>
    </>
  );
}
