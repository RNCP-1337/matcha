import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { Notice } from '../components/Bits.jsx';
import OAuthButtons from '../components/OAuthButtons.jsx';

const EMPTY = { firstName: '', lastName: '', username: '', email: '', password: '', confirm: '' };

export default function Register() {
  const [form, setForm] = useState(EMPTY);
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFields({});

    if (form.password !== form.confirm) {
      setFields({ confirm: 'The two passwords do not match' });
      return;
    }

    setBusy(true);
    try {
      await api.post('/api/auth/register', {
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        email: form.email,
        password: form.password,
      });
      setDone(true);
    } catch (problem) {
      if (problem instanceof ApiError) {
        setError(problem.fields ? '' : problem.message);
        setFields(problem.fields || {});
      } else {
        setError('Could not create the account');
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="narrow">
        <div className="page-head">
          <h1>Check your inbox</h1>
        </div>
        <div className="panel">
          <p>
            We sent a confirmation link to <strong>{form.email}</strong>. Open it to activate your account,
            then sign in.
          </p>
          <p className="small muted">
            Running the project locally? The mail server catches every message: open{' '}
            <a href="http://localhost:8085" target="_blank" rel="noreferrer">
              the local mailbox
            </a>{' '}
            to find the link.
          </p>
          <Link className="button" to="/login">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Create an account</h1>
        <p>You will confirm your email address before your first sign in.</p>
      </div>

      <Notice kind="error">{error}</Notice>

      <form className="panel" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="firstName">First name</label>
          <input
            id="firstName"
            value={form.firstName}
            onChange={update('firstName')}
            autoComplete="given-name"
            aria-invalid={Boolean(fields.firstName)}
            required
          />
          {fields.firstName ? <p className="field-error">{fields.firstName}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="lastName">Last name</label>
          <input
            id="lastName"
            value={form.lastName}
            onChange={update('lastName')}
            autoComplete="family-name"
            aria-invalid={Boolean(fields.lastName)}
            required
          />
          {fields.lastName ? <p className="field-error">{fields.lastName}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={form.username}
            onChange={update('username')}
            autoComplete="username"
            aria-invalid={Boolean(fields.username)}
            required
          />
          <p className="hint">3 to 20 letters, digits, hyphens or underscores.</p>
          {fields.username ? <p className="field-error">{fields.username}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={update('email')}
            autoComplete="email"
            aria-invalid={Boolean(fields.email)}
            required
          />
          {fields.email ? <p className="field-error">{fields.email}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            aria-invalid={Boolean(fields.password)}
            required
          />
          <p className="hint">
            At least 8 characters with upper case, lower case, a digit and a symbol. Common English words are
            refused.
          </p>
          {fields.password ? <p className="field-error">{fields.password}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="confirm">Repeat the password</label>
          <input
            id="confirm"
            type="password"
            value={form.confirm}
            onChange={update('confirm')}
            autoComplete="new-password"
            aria-invalid={Boolean(fields.confirm)}
            required
          />
          {fields.confirm ? <p className="field-error">{fields.confirm}</p> : null}
        </div>

        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? 'Creating...' : 'Create my account'}
        </button>

        <OAuthButtons verb="Continue" />

        <p className="small muted center" style={{ marginTop: 14, marginBottom: 0 }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
