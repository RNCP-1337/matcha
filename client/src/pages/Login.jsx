import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { Notice } from '../components/Bits.jsx';
import OAuthButtons from '../components/OAuthButtons.jsx';
import { useApp } from '../state/AppState.jsx';

export default function Login() {
  const { signIn } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);

    try {
      const user = await signIn(form);
      navigate(user.profileComplete ? '/browse' : '/settings');
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    try {
      const data = await api.post('/api/auth/resend-verification', { email: form.username });
      setInfo(data.message);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not send the email');
    }
  };

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Sign in</h1>
        <p>Use the username you chose when you registered.</p>
      </div>

      <Notice kind="error">{error}</Notice>
      <Notice>{info}</Notice>

      <form className="panel" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={update('username')}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={update('password')}
            required
          />
        </div>

        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>

        <OAuthButtons verb="Sign in" />

        <div className="divider" />

        <p className="small muted" style={{ margin: 0 }}>
          <Link to="/forgot-password">Forgotten your password?</Link>
          {' · '}
          <Link to="/register">Create an account</Link>
        </p>
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Account not confirmed yet? Type your email address above and{' '}
          <button type="button" className="link-button" onClick={resend}>
            send the confirmation link again
          </button>
          .
        </p>
      </form>
    </div>
  );
}
