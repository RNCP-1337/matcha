import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { Empty, Notice, ProfileCard } from '../components/Bits.jsx';

const TABS = [
  { key: 'matches', label: 'Connections', endpoint: '/api/me/matches', empty: 'Nobody has liked you back yet.' },
  { key: 'likes', label: 'Likes received', endpoint: '/api/me/likes', empty: 'No one has liked your profile yet.' },
  { key: 'visits', label: 'Profile visits', endpoint: '/api/me/visits', empty: 'Nobody has looked at your profile yet.' },
];

export default function Activity() {
  const [tab, setTab] = useState(TABS[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    api
      .get(tab.endpoint)
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((problem) => {
        if (!cancelled) {
          setItems([]);
          setError(problem instanceof ApiError ? problem.message : 'Could not load this list');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div>
      <div className="page-head">
        <h1>Activity</h1>
        <p>Who is interested in you, and who has been reading your profile.</p>
      </div>

      <div className="button-row" style={{ marginBottom: 20 }}>
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={entry.key === tab.key ? 'button' : 'button button--secondary'}
            onClick={() => setTab(entry)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <Notice kind="error">{error}</Notice>

      {loading ? (
        <p className="loading">Loading...</p>
      ) : items.length === 0 ? (
        <Empty>{tab.empty}</Empty>
      ) : (
        <div className="card-grid">
          {items.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}
