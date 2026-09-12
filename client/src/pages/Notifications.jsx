import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { Avatar, Empty, Notice } from '../components/Bits.jsx';
import { relativeTime } from '../lib/format.js';
import { useApp } from '../state/AppState.jsx';

const TEXT = {
  like: 'liked your profile',
  visit: 'looked at your profile',
  message: 'sent you a message',
  match: 'is now connected with you',
  unlike: 'removed their like',
  meetup: 'updated a meetup with you',
};

export default function Notifications() {
  const { subscribe, setCounts, refreshCounts } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/notifications');
      setItems(data.items);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then(async () => {
      await api.post('/api/notifications/read').catch(() => {});
      setCounts((current) => ({ ...current, notifications: 0 }));
    });
  }, [load, setCounts]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'notification') {
          load();
          api.post('/api/notifications/read').catch(() => {});
          refreshCounts();
        }
      }),
    [subscribe, load, refreshCounts],
  );

  return (
    <div className="medium">
      <div className="page-head">
        <h1>Notifications</h1>
        <p>Likes, visits, messages and connections, newest first.</p>
      </div>

      <Notice kind="error">{error}</Notice>

      {loading ? (
        <p className="loading">Loading...</p>
      ) : items.length === 0 ? (
        <Empty>Nothing has happened yet. Like a few profiles to get things moving.</Empty>
      ) : (
        <div className="stack">
          {items.map((item) => {
            const body = (
              <>
                <Avatar filename={item.actor?.photo} alt="" size={38} />
                <div className="row-item__body">
                  <strong>{item.actor ? item.actor.firstName : 'Someone'}</strong>{' '}
                  {TEXT[item.type] || 'interacted with your profile'}
                  {item.actor ? <div className="small muted">@{item.actor.username}</div> : null}
                </div>
                <span className="row-item__time">{relativeTime(item.createdAt)}</span>
              </>
            );

            return item.actor ? (
              <Link
                className={`row-item${item.readAt ? '' : ' is-unread'}`}
                key={item.id}
                to={`/profile/${item.actor.username}`}
              >
                {body}
              </Link>
            ) : (
              <div className={`row-item${item.readAt ? '' : ' is-unread'}`} key={item.id}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
