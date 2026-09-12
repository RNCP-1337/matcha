import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { Avatar, Empty, Notice } from '../components/Bits.jsx';
import { useApp } from '../state/AppState.jsx';

const STATUS_LABELS = {
  proposed: 'Waiting for an answer',
  accepted: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function formatWhen(value) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function Entry({ item, onAnswer, busy }) {
  return (
    <div className={`meetup meetup--${item.status}`}>
      <Avatar filename={item.partner.photo} alt="" size={38} />
      <div className="meetup__body">
        <strong>{item.title}</strong>
        <div className="small">
          {formatWhen(item.scheduledAt)}
          {item.place ? ` · ${item.place}` : ''}
        </div>
        {item.note ? <div className="small muted">{item.note}</div> : null}
        <div className="small muted">
          {STATUS_LABELS[item.status]} ·{' '}
          <Link to={`/profile/${item.partner.username}`}>{item.partner.firstName}</Link>
          {item.isOrganizer ? ' · you proposed this' : ''}
        </div>
      </div>
      <div className="meetup__actions">
        {item.status === 'proposed' && !item.isOrganizer ? (
          <>
            <button className="button button--small" type="button" disabled={busy} onClick={() => onAnswer(item.id, 'accepted')}>
              Accept
            </button>
            <button
              className="button button--secondary button--small"
              type="button"
              disabled={busy}
              onClick={() => onAnswer(item.id, 'declined')}
            >
              Decline
            </button>
          </>
        ) : null}
        {item.isOrganizer && item.status !== 'cancelled' ? (
          <button
            className="button button--danger button--small"
            type="button"
            disabled={busy}
            onClick={() => onAnswer(item.id, 'cancelled')}
          >
            Cancel
          </button>
        ) : null}
        <Link className="button button--secondary button--small" to={`/chat/${item.partner.id}`}>
          Message
        </Link>
      </div>
    </div>
  );
}

export default function Meetups() {
  const { subscribe } = useApp();
  const [data, setData] = useState({ upcoming: [], past: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.get('/api/meetups'));
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not load your meetups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'meetup') load();
      }),
    [subscribe, load],
  );

  const answer = async (id, status) => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/api/meetups/${id}`, { status });
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not update that meetup');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="loading">Loading your meetups...</p>;

  return (
    <div className="medium">
      <div className="page-head">
        <h1>Meetups</h1>
        <p>Dates and outings you have arranged with the members you are connected with.</p>
      </div>

      <Notice kind="error">{error}</Notice>

      <div className="panel">
        <div className="panel__title">
          <h2>Coming up</h2>
          <span className="small muted">{data.upcoming.length}</span>
        </div>
        {data.upcoming.length === 0 ? (
          <Empty>
            Nothing planned. Open a <Link to="/chat">conversation</Link> and propose something.
          </Empty>
        ) : (
          data.upcoming.map((item) => <Entry key={item.id} item={item} onAnswer={answer} busy={busy} />)
        )}
      </div>

      {data.past.length > 0 ? (
        <div className="panel">
          <div className="panel__title">
            <h2>Earlier</h2>
            <span className="small muted">{data.past.length}</span>
          </div>
          {data.past.slice(0, 20).map((item) => (
            <Entry key={item.id} item={item} onAnswer={answer} busy={busy} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
