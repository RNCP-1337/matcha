import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { Notice } from '../components/Bits.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);

    try {
      const data = await api.post('/api/auth/forgot-password', { email });
      setMessage(data.message);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not send the email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Reset your password</h1>
        <p>Enter the address you registered with and we will send a link to choose a new password.</p>
      </div>

      <Notice kind="error">{error}</Notice>
      <Notice>{message}</Notice>

      <form className="panel" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <button className="button button--block" type="submit" disabled={busy}>
          {busy ? 'Sending...' : 'Send the reset link'}
        </button>

        <p className="small muted center" style={{ marginTop: 14, marginBottom: 0 }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
