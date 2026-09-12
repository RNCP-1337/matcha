import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ApiError, api, photoUrl } from '../lib/api.js';
import { Empty, Notice } from '../components/Bits.jsx';
import { distanceLabel } from '../lib/format.js';
import { useApp } from '../state/AppState.jsx';

const RADIUS_OPTIONS = [25, 50, 150, 500, 2000, 20000];

function markerIcon(profile, isSelf) {
  const photo = photoUrl(profile.photo);
  const body = photo
    ? `<img src="${photo}" alt="" />`
    : `<span class="map-pin__initial">${(profile.firstName || '?').slice(0, 1)}</span>`;

  return L.divIcon({
    className: '',
    html: `<span class="map-pin${isSelf ? ' map-pin--self' : ''}${profile.isOnline ? ' map-pin--online' : ''}">${body}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
  });
}

export default function MapView() {
  const { user, refreshUser } = useApp();
  const navigate = useNavigate();

  const container = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  const [radius, setRadius] = useState(150);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async (km) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/api/map?radius=${km}`);
      setData(response);
    } catch (problem) {
      setData(null);
      setError(problem instanceof ApiError ? problem.message : 'Could not load the map');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(radius);
  }, [load, radius]);

  useEffect(() => {
    if (!container.current || map.current) return undefined;

    map.current = L.map(container.current, { scrollWheelZoom: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current || !data) return;

    layer.current.clearLayers();
    const centre = [data.centre.latitude, data.centre.longitude];

    L.marker(centre, { icon: markerIcon({ ...user, photo: user.profilePhoto }, true), zIndexOffset: 500 })
      .bindPopup(`<strong>You</strong><br>${data.centre.city || ''}`)
      .addTo(layer.current);

    L.circle(centre, {
      radius: Math.min(data.radiusKm, 2000) * 1000,
      color: '#3d6b4b',
      weight: 1,
      fillOpacity: 0.04,
    }).addTo(layer.current);

    const points = [centre];

    for (const profile of data.items) {
      const position = [profile.latitude, profile.longitude];
      points.push(position);

      const marker = L.marker(position, { icon: markerIcon(profile, false) }).addTo(layer.current);
      marker.bindPopup(
        `<strong>${profile.firstName}, ${profile.age}</strong><br>` +
          `${profile.city || ''}<br>${distanceLabel(profile.distanceKm)}<br>` +
          `<a href="/profile/${profile.username}" data-profile="${profile.username}">Open profile</a>`,
      );
      marker.on('popupopen', (event) => {
        const link = event.popup.getElement()?.querySelector('[data-profile]');
        link?.addEventListener('click', (click) => {
          click.preventDefault();
          navigate(`/profile/${profile.username}`);
        });
      });
    }

    if (points.length > 1) map.current.fitBounds(L.latLngBounds(points).pad(0.15));
    else map.current.setView(centre, 11);
  }, [data, user, navigate]);

  const preciseLocation = () => {
    setMessage('');
    setError('');

    if (!('geolocation' in navigator)) {
      setError('This browser cannot provide GPS coordinates.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await api.put('/api/me/location', {
            source: 'gps',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          await refreshUser();
          await load(radius);
          setMessage(
            `Position updated to about ${Math.round(position.coords.accuracy)} m of accuracy. Other members still only see your neighbourhood.`,
          );
        } catch (problem) {
          setError(problem instanceof ApiError ? problem.message : 'Could not save your position');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setError('We could not read your position. Check the browser permission, or set a city in your settings.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  return (
    <div>
      <div className="page-head">
        <h1>Members near you</h1>
        <p>
          Everyone compatible with your preferences, placed on the map. Positions are rounded to about a
          kilometre, so you see the neighbourhood and never the doorstep.
        </p>
      </div>

      <Notice kind="error">{error}</Notice>
      <Notice>{message}</Notice>

      <div className="filters">
        <div className="filters__actions" style={{ marginTop: 0 }}>
          <label className="label" htmlFor="radius" style={{ marginBottom: 0 }}>
            Show members within
          </label>
          <select
            id="radius"
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
            style={{ width: 'auto' }}
          >
            {RADIUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.toLocaleString('en-GB')} km
              </option>
            ))}
          </select>
          <button className="button button--secondary" type="button" onClick={preciseLocation} disabled={locating}>
            {locating ? 'Reading GPS...' : 'Use precise GPS'}
          </button>
          <span className="filters__count">
            {loading ? 'Loading...' : `${data?.items.length ?? 0} members shown`}
          </span>
        </div>
      </div>

      <div className="map-frame" ref={container} />

      {!loading && data && data.items.length === 0 ? (
        <Empty>Nobody compatible within {radius} km. Widen the radius above.</Empty>
      ) : null}

      <p className="small muted" style={{ marginTop: 14 }}>
        Map data from OpenStreetMap. Tiles are fetched from openstreetmap.org, so this page needs an internet
        connection; the rest of the site does not.
      </p>
    </div>
  );
}
