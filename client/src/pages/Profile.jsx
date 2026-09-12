import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api, photoUrl } from '../lib/api.js';
import { Fame, Notice, Presence, TagList } from '../components/Bits.jsx';
import { GENDER_LABELS, PREFERENCE_LABELS, distanceLabel, presenceLabel } from '../lib/format.js';
import { useApp } from '../state/AppState.jsx';

function Gallery({ photos, profilePhoto, name }) {
  const ordered = [...photos].sort((a, b) => {
    if (a.filename === profilePhoto) return -1;
    if (b.filename === profilePhoto) return 1;
    return a.id - b.id;
  });

  const [active, setActive] = useState(0);
  const current = ordered[active];

  if (ordered.length === 0) {
    return (
      <div className="gallery__main" aria-label="This member has no photo" />
    );
  }

  return (
    <div>
      <div className="gallery__main">
        <img src={photoUrl(current.filename)} alt={`${name}, photo ${active + 1}`} />
      </div>
      {ordered.length > 1 ? (
        <div className="gallery__strip">
          {ordered.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              className={`gallery__thumb${index === active ? ' is-active' : ''}`}
              onClick={() => setActive(index)}
              aria-label={`Show photo ${index + 1}`}
            >
              <img src={photoUrl(photo.filename)} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user, subscribe } = useApp();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await api.get(`/api/users/${encodeURIComponent(username)}`);
      setData(response);
    } catch (problem) {
      setData(null);
      setError(problem instanceof ApiError ? problem.message : 'Could not load this profile');
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'match' || event.type === 'unmatch') load();
      }),
    [subscribe, load],
  );

  const act = async (call, successMessage) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await call();
      if (response?.relationship) {
        setData((current) => ({ ...current, relationship: response.relationship }));
      }
      if (successMessage) setMessage(successMessage);
      return response;
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'That action failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <div className="medium">
        <Notice kind="error">{error}</Notice>
        <Link className="button button--secondary" to="/browse">
          Back to suggestions
        </Link>
      </div>
    );
  }

  if (!data) return <p className="loading">Loading profile...</p>;

  const { profile, relationship } = data;
  const canLike = Boolean(user?.profilePhoto);

  return (
    <div>
      <Notice kind="error">{error}</Notice>
      <Notice>{message}</Notice>

      {relationship.isMatch ? (
        <Notice>
          You are connected with {profile.firstName}.{' '}
          <Link to={`/chat/${profile.id}`}>Open the conversation</Link>
        </Notice>
      ) : relationship.likesMe ? (
        <Notice kind="warning">{profile.firstName} liked your profile. Like back to start chatting.</Notice>
      ) : null}

      <div className="profile-layout">
        <Gallery photos={profile.photos} profilePhoto={profile.profilePhoto} name={profile.firstName} />

        <div>
          <div className="profile-header">
            <h1>
              <Presence online={profile.isOnline} label={presenceLabel(profile)} />
              {profile.firstName} {profile.lastName}
            </h1>
            <div className="button-row">
              {relationship.iLiked ? (
                <button
                  className="button button--danger"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api.delete(`/api/users/${profile.username}/like`),
                      `You removed your like. ${profile.firstName} can no longer chat with you.`,
                    )
                  }
                >
                  Remove my like
                </button>
              ) : (
                <button
                  className="button"
                  type="button"
                  disabled={busy || !canLike}
                  title={canLike ? undefined : 'Add a profile picture first'}
                  onClick={() => act(() => api.post(`/api/users/${profile.username}/like`), 'Like sent')}
                >
                  Like this profile
                </button>
              )}
              {relationship.isMatch ? (
                <Link className="button button--secondary" to={`/chat/${profile.id}`}>
                  Message
                </Link>
              ) : null}
            </div>
          </div>

          <p className="profile-sub">
            @{profile.username} &middot; {presenceLabel(profile)}
          </p>

          {!canLike ? (
            <Notice kind="warning">
              Add a profile picture in <Link to="/settings">your settings</Link> before you can like other
              members.
            </Notice>
          ) : null}

          <dl className="definition-list">
            <dt>Age</dt>
            <dd>{profile.age ? `${profile.age} years old` : 'Not given'}</dd>

            <dt>Gender</dt>
            <dd>{GENDER_LABELS[profile.gender] || 'Not given'}</dd>

            <dt>Looking for</dt>
            <dd>{PREFERENCE_LABELS[profile.sexualPreference] || 'Not given'}</dd>

            <dt>Location</dt>
            <dd>
              {profile.city ? `${profile.city}${profile.country ? `, ${profile.country}` : ''}` : 'Not given'}
              {' — '}
              {distanceLabel(profile.distanceKm)}
            </dd>

            <dt>Fame rating</dt>
            <dd>
              <Fame value={profile.fameRating} />
            </dd>
          </dl>

          {profile.biography ? (
            <div className="panel">
              <h3>About</h3>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{profile.biography}</p>
            </div>
          ) : null}

          {profile.tags.length > 0 ? (
            <div className="panel">
              <h3>Interests</h3>
              <TagList tags={profile.tags} highlight={profile.tags} />
            </div>
          ) : null}

          <div className="panel">
            <h3>Something wrong?</h3>
            {relationship.iReported ? (
              <p className="small muted">You reported this account. Our team will look into it.</p>
            ) : reporting ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const response = await act(
                    () => api.post(`/api/users/${profile.username}/report`, { reason }),
                    'Report sent. Thank you.',
                  );
                  if (response) {
                    setReporting(false);
                    setReason('');
                    load();
                  }
                }}
              >
                <div className="field">
                  <label htmlFor="reason">Why are you reporting this account?</label>
                  <textarea
                    id="reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={500}
                    placeholder="Optional, but it helps."
                  />
                </div>
                <div className="button-row">
                  <button className="button button--danger" type="submit" disabled={busy}>
                    Send the report
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => setReporting(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="button-row">
                <button className="button button--secondary" type="button" onClick={() => setReporting(true)}>
                  Report as a fake account
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const response = await act(() => api.post(`/api/users/${profile.username}/block`));
                    if (response) navigate('/browse');
                  }}
                >
                  Block this member
                </button>
              </div>
            )}
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Blocking removes the member from your searches and notifications, and closes any conversation
              between you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
