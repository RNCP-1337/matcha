import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Notice } from '../components/Bits.jsx';
import { useApp } from '../state/AppState.jsx';

const MESSAGES = {
  cancelled: 'You cancelled the sign in at the provider. Nothing was changed.',
  'bad-state': 'That sign in attempt could not be verified. Start again from the sign in page.',
  'no-code': 'The provider did not send an authorization code back.',
  'exchange-failed': 'The provider refused the authorization. Start again from the sign in page.',
  'no-profile': 'The provider did not return a usable profile.',
  'unknown-provider': 'That sign in provider is not configured on this server.',
};

export default function OAuthResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useApp();
  const [problem, setProblem] = useState('');

  const result = params.get('result') || 'unknown-provider';

  useEffect(() => {
    if (result !== 'signed-in' && result !== 'complete-profile') {
      setProblem(MESSAGES[result] || 'That sign in did not work.');
      return;
    }

    refreshUser()
      .then(() => navigate(result === 'complete-profile' ? '/settings' : '/browse', { replace: true }))
      .catch(() => setProblem('The session could not be read back. Try signing in again.'));
  }, [result, refreshUser, navigate]);

  if (!problem) return <p className="loading">Finishing your sign in...</p>;

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Sign in failed</h1>
      </div>
      <Notice kind="error">{problem}</Notice>
      <Link className="button button--secondary" to="/login">
        Back to sign in
      </Link>
    </div>
  );
}
