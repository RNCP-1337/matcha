import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import LocationEditor from '../components/LocationEditor.jsx';
import PhotoManager from '../components/PhotoManager.jsx';
import TagEditor from '../components/TagEditor.jsx';
import { Fame, Notice } from '../components/Bits.jsx';
import { useApp } from '../state/AppState.jsx';

function ProfileForm({ user, onSaved }) {
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    gender: user.gender || '',
    sexualPreference: user.sexualPreference || 'bisexual',
    biography: user.biography || '',
    birthDate: user.birthDate || '',
  });
  const [tags, setTags] = useState(user.tags || []);
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setFields({});
    setBusy(true);

    try {
      const data = await api.put('/api/me/profile', { ...form, tags });
      setMessage(data.message);
      await onSaved();
    } catch (problem) {
      if (problem instanceof ApiError) {
        setError(problem.fields ? '' : problem.message);
        setFields(problem.fields || {});
      } else {
        setError('Could not save your profile');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="panel__title">
        <h2>Your details</h2>
      </div>

      <Notice kind="error">{error}</Notice>
      <Notice>{message}</Notice>

      <div className="field">
        <label htmlFor="firstName">First name</label>
        <input
          id="firstName"
          value={form.firstName}
          onChange={update('firstName')}
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
          aria-invalid={Boolean(fields.lastName)}
          required
        />
        {fields.lastName ? <p className="field-error">{fields.lastName}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          value={form.email}
          onChange={update('email')}
          aria-invalid={Boolean(fields.email)}
          required
        />
        {fields.email ? <p className="field-error">{fields.email}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="birthDate">Date of birth</label>
        <input
          id="birthDate"
          type="date"
          value={form.birthDate}
          onChange={update('birthDate')}
          aria-invalid={Boolean(fields.birthDate)}
          required
        />
        {fields.birthDate ? <p className="field-error">{fields.birthDate}</p> : null}
      </div>

      <fieldset>
        <legend>Gender</legend>
        <div className="radio-row">
          {[
            ['female', 'Woman'],
            ['male', 'Man'],
            ['other', 'Other'],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="gender"
                value={value}
                checked={form.gender === value}
                onChange={update('gender')}
              />
              {label}
            </label>
          ))}
        </div>
        {fields.gender ? <p className="field-error">{fields.gender}</p> : null}
      </fieldset>

      <fieldset>
        <legend>Sexual preference</legend>
        <div className="radio-row">
          {[
            ['heterosexual', 'Heterosexual'],
            ['homosexual', 'Homosexual'],
            ['bisexual', 'Bisexual'],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="sexualPreference"
                value={value}
                checked={form.sexualPreference === value}
                onChange={update('sexualPreference')}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          Bisexual is the default when nothing is chosen.
        </p>
      </fieldset>

      <div className="field">
        <label htmlFor="biography">Biography</label>
        <textarea
          id="biography"
          value={form.biography}
          onChange={update('biography')}
          maxLength={1000}
          aria-invalid={Boolean(fields.biography)}
          placeholder="A few honest lines about you."
        />
        <p className="hint">{form.biography.length} of 1000 characters.</p>
        {fields.biography ? <p className="field-error">{fields.biography}</p> : null}
      </div>

      <TagEditor value={tags} onChange={setTags} error={fields.tags} />

      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Saving...' : 'Save my profile'}
      </button>
    </form>
  );
}

function PasswordForm() {
  const { user } = useApp();
  const [form, setForm] = useState({ currentPassword: '', password: '', confirm: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setFields({});

    if (form.password !== form.confirm) {
      setFields({ confirm: 'The two passwords do not match' });
      return;
    }

    setBusy(true);
    try {
      const data = await api.put('/api/auth/password', {
        currentPassword: form.currentPassword,
        password: form.password,
      });
      setMessage(data.message);
      setForm({ currentPassword: '', password: '', confirm: '' });
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

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="panel__title">
        <h2>Password</h2>
      </div>

      <Notice kind="error">{error}</Notice>
      <Notice>{message}</Notice>

      <input type="text" name="username" autoComplete="username" value={user?.username || ''} readOnly hidden />

      <div className="field">
        <label htmlFor="currentPassword">Current password</label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={update('currentPassword')}
          aria-invalid={Boolean(fields.currentPassword)}
          required
        />
        {fields.currentPassword ? <p className="field-error">{fields.currentPassword}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          aria-invalid={Boolean(fields.password)}
          required
        />
        {fields.password ? <p className="field-error">{fields.password}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="confirmPassword">Repeat the new password</label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={update('confirm')}
          aria-invalid={Boolean(fields.confirm)}
          required
        />
        {fields.confirm ? <p className="field-error">{fields.confirm}</p> : null}
      </div>

      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Saving...' : 'Change my password'}
      </button>
      <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
        Changing your password signs out every other device.
      </p>
    </form>
  );
}

export default function Settings() {
  const { user, refreshUser } = useApp();
  const [blocked, setBlocked] = useState([]);

  const loadBlocked = () =>
    api
      .get('/api/me/blocked')
      .then((data) => setBlocked(data.items))
      .catch(() => setBlocked([]));

  useEffect(() => {
    loadBlocked();
  }, []);

  if (!user) return null;

  const missing = [];
  if (!user.gender) missing.push('your gender');
  if (!user.birthDate) missing.push('your date of birth');
  if (!user.city) missing.push('your location');
  if (!user.profilePhoto) missing.push('a profile picture');

  return (
    <div className="medium">
      <div className="page-head">
        <h1>Your profile</h1>
        <p>
          Everything here is editable. Your email address and password are never shown to other members.
        </p>
      </div>

      {missing.length > 0 ? (
        <Notice kind="warning">
          Add {missing.join(', ')} to appear in suggestions and use the matching features.
        </Notice>
      ) : (
        <div className="panel">
          <div className="spread">
            <div>
              <h2 style={{ marginBottom: 4 }}>Your profile is complete</h2>
              <p className="small muted" style={{ margin: 0 }}>
                See it the way other members do:{' '}
                <Link to={`/profile/${user.username}`}>view your public profile</Link>.
              </p>
            </div>
            <Fame value={user.fameRating} />
          </div>
        </div>
      )}

      <PhotoManager user={user} onChange={refreshUser} />
      <LocationEditor user={user} onChange={refreshUser} />
      <ProfileForm user={user} onSaved={refreshUser} />
      <PasswordForm />

      <div className="panel">
        <div className="panel__title">
          <h2>Blocked members</h2>
          <span className="small muted">{blocked.length}</span>
        </div>
        {blocked.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            You have not blocked anybody.
          </p>
        ) : (
          <div className="stack">
            {blocked.map((entry) => (
              <div className="row-item" key={entry.id}>
                <div className="row-item__body">
                  <strong>
                    {entry.firstName} {entry.lastName}
                  </strong>
                  <div className="small muted">@{entry.username}</div>
                </div>
                <button
                  className="button button--secondary button--small"
                  type="button"
                  onClick={async () => {
                    await api.delete(`/api/users/${entry.username}/block`);
                    loadBlocked();
                  }}
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
