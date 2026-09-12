import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { Notice } from '../components/Bits.jsx';

export default function Verify() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const attempted = useRef(false);

  const [state, setState] = useState(token ? 'working' : 'missing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    api
      .post('/api/auth/verify', { token })
      .then((data) => {
        setMessage(data.message);
        setState('done');
      })
      .catch((problem) => {
        setMessage(problem instanceof ApiError ? problem.message : 'Could not confirm this account');
        setState('failed');
      });
  }, [token]);

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Confirm your account</h1>
      </div>

      {state === 'working' ? <p className="loading">Checking your link...</p> : null}
      {state === 'missing' ? (
        <Notice kind="error">This page needs a confirmation link sent to your email address.</Notice>
      ) : null}
      {state === 'failed' ? <Notice kind="error">{message}</Notice> : null}
      {state === 'done' ? <Notice>{message}</Notice> : null}

      {state === 'done' ? (
        <Link className="button" to="/login">
          Sign in
        </Link>
      ) : null}
      {state === 'failed' ? (
        <Link className="button button--secondary" to="/login">
          Back to sign in
        </Link>
      ) : null}
    </div>
  );
}
