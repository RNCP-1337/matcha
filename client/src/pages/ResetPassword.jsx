import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { Notice } from '../components/Bits.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFields({});

    if (password !== confirm) {
      setFields({ confirm: 'The two passwords do not match' });
      return;
    }

    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
    } catch (problem) {
      if (problem instanceof ApiError) {
        setError(problem.fields ? '' : problem.message);
        setFields(problem.fields || {});
      } else {
        setError('Could not update the password');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="narrow">
        <div className="page-head">
          <h1>Reset your password</h1>
        </div>
        <Notice kind="error">This page needs a reset link. Ask for a new one from the sign in page.</Notice>
        <Link className="button button--secondary" to="/forgot-password">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="narrow">
        <div className="page-head">
          <h1>Password updated</h1>
        </div>
        <div className="panel">
          <p>Your password has been changed and every other session was signed out.</p>
          <Link className="button" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Choose a new password</h1>
      </div>

      <Notice kind="error">{error}</Notice>

      <form className="panel" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            aria-invalid={Boolean(fields.password)}
            required
          />
          {fields.password ? <p className="field-error">{fields.password}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="confirm">Repeat the new password</label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            aria-invalid={Boolean(fields.confirm)}
            required
          />
          {fields.confirm ? <p className="field-error">{fields.confirm}</p> : null}
        </div>

        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Save the new password'}
        </button>
      </form>
    </div>
  );
}
