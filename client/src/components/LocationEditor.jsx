import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { Notice } from './Bits.jsx';

export default function LocationEditor({ user, onChange }) {
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState(user.city || '');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/api/me/cities')
      .then((data) => setCities(data.items))
      .catch(() => setCities([]));
  }, []);

  const save = async (payload, successMessage) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.put('/api/me/location', payload);
      await onChange();
      setMessage(successMessage);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save your location');
    } finally {
      setBusy(false);
    }
  };

  const useGps = () => {
    setError('');
    setMessage('');

    if (!('geolocation' in navigator)) {
      setError('This browser cannot provide GPS coordinates. Enter your city instead.');
      return;
    }

    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        save(
          {
            source: 'gps',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          'Location updated from GPS.',
        );
      },
      () => {
        setBusy(false);
        setError('We could not read your position. Enter your city below instead.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div className="panel">
      <div className="panel__title">
        <h2>Location</h2>
        <span className="small muted">
          {user.locationSource === 'gps' ? 'Set from GPS' : user.city ? 'Set manually' : 'Not set'}
        </span>
      </div>

      <Notice kind="error">{error}</Notice>
      <Notice>{message}</Notice>

      <p className="small muted">
        Matching needs a location. Share your GPS position if you are comfortable with it, or pick the closest
        city. You can change or replace it at any time.
      </p>

      <div className="button-row" style={{ marginBottom: 16 }}>
        <button className="button button--secondary" type="button" onClick={useGps} disabled={busy}>
          Use my GPS position
        </button>
        <span className="small muted">
          Current: {user.city ? `${user.city}${user.country ? `, ${user.country}` : ''}` : 'not set'}
        </span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save({ source: 'manual', city }, 'Location updated.');
        }}
      >
        <div className="field">
          <label htmlFor="city">City or neighbourhood</label>
          <input
            id="city"
            list="known-cities"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Start typing a city"
            maxLength={80}
          />
          <datalist id="known-cities">
            {cities.map((entry) => (
              <option key={`${entry.city}-${entry.country}`} value={entry.city}>
                {entry.country}
              </option>
            ))}
          </datalist>
        </div>

        <button className="button" type="submit" disabled={busy || !city.trim()}>
          Save this location
        </button>
      </form>
    </div>
  );
}
