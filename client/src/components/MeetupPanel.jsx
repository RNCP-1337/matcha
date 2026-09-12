import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { Notice } from './Bits.jsx';
import { useApp } from '../state/AppState.jsx';

const STATUS_LABELS = {
  proposed: 'Waiting for an answer',
  accepted: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function formatWhen(value) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function defaultSlot() {
  const when = new Date(Date.now() + 24 * 60 * 60 * 1000);
  when.setMinutes(0, 0, 0);
  const pad = (value) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:00`;
}

export default function MeetupPanel({ partner }) {
  const { subscribe } = useApp();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', place: '', scheduledAt: defaultSlot(), note: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const partnerId = partner?.id;

  const load = useCallback(async () => {
    if (!partnerId) return;
    try {
      const data = await api.get(`/api/meetups/with/${partnerId}`);
      setItems(data.items);
    } catch {
      setItems([]);
    }
  }, [partnerId]);

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

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setFields({});
    setBusy(true);

    try {
      await api.post('/api/meetups', { inviteeId: partnerId, ...form });
      setForm({ title: '', place: '', scheduledAt: defaultSlot(), note: '' });
      setOpen(false);
      await load();
    } catch (problem) {
      if (problem instanceof ApiError) {
        setError(problem.fields ? '' : problem.message);
        setFields(problem.fields || {});
      } else {
        setError('Could not send the proposal');
      }
    } finally {
      setBusy(false);
    }
  };

  const answer = async (id, status) => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/api/meetups/${id}`, { status });
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not update the meetup');
    } finally {
      setBusy(false);
    }
  };

  if (!partner) return null;

  const upcoming = items.filter(
    (item) => item.status !== 'cancelled' && new Date(item.scheduledAt).getTime() >= Date.now() - 3600_000,
  );

  return (
    <div className="meetups">
      <div className="panel__title" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Meet in person</h3>
        <button className="link-button" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? 'Close' : 'Propose something'}
        </button>
      </div>

      <Notice kind="error">{error}</Notice>

      {upcoming.length === 0 && !open ? (
        <p className="small muted" style={{ margin: 0 }}>
          Nothing planned with {partner.firstName} yet.
        </p>
      ) : null}

      {upcoming.map((item) => (
        <div className={`meetup meetup--${item.status}`} key={item.id}>
          <div className="meetup__body">
            <strong>{item.title}</strong>
            <div className="small">
              {formatWhen(item.scheduledAt)}
              {item.place ? ` · ${item.place}` : ''}
            </div>
            {item.note ? <div className="small muted">{item.note}</div> : null}
            <div className="small muted">
              {STATUS_LABELS[item.status]}
              {item.isOrganizer ? ' · you proposed this' : ` · proposed by ${item.partner.firstName}`}
            </div>
          </div>

          <div className="meetup__actions">
            {item.status === 'proposed' && !item.isOrganizer ? (
              <>
                <button
                  className="button button--small"
                  type="button"
                  disabled={busy}
                  onClick={() => answer(item.id, 'accepted')}
                >
                  Accept
                </button>
                <button
                  className="button button--secondary button--small"
                  type="button"
                  disabled={busy}
                  onClick={() => answer(item.id, 'declined')}
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
                onClick={() => answer(item.id, 'cancelled')}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {open ? (
        <form onSubmit={submit} style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="meetup-title">What are you suggesting?</label>
            <input
              id="meetup-title"
              type="text"
              value={form.title}
              onChange={update('title')}
              placeholder="Coffee at the market"
              maxLength={120}
              aria-invalid={Boolean(fields.title)}
              required
            />
            {fields.title ? <p className="field-error">{fields.title}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="meetup-when">When</label>
            <input
              id="meetup-when"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={update('scheduledAt')}
              aria-invalid={Boolean(fields.scheduledAt)}
              required
            />
            {fields.scheduledAt ? <p className="field-error">{fields.scheduledAt}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="meetup-place">Where</label>
            <input
              id="meetup-place"
              type="text"
              value={form.place}
              onChange={update('place')}
              placeholder="Optional"
              maxLength={160}
            />
            {fields.place ? <p className="field-error">{fields.place}</p> : null}
          </div>

          <div className="field">
            <label htmlFor="meetup-note">Anything to add?</label>
            <textarea
              id="meetup-note"
              value={form.note}
              onChange={update('note')}
              maxLength={500}
              style={{ minHeight: 70 }}
            />
            {fields.note ? <p className="field-error">{fields.note}</p> : null}
          </div>

          <button className="button button--small" type="submit" disabled={busy}>
            {busy ? 'Sending...' : 'Send the proposal'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
