import { cities } from './cities.js';

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a, b) {
  if (a?.latitude == null || b?.latitude == null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function nearestCity(latitude, longitude) {
  let best = null;
  let bestDistance = Infinity;
  for (const city of cities) {
    const d = distanceKm({ latitude, longitude }, city);
    if (d < bestDistance) {
      bestDistance = d;
      best = city;
    }
  }
  return best ? { ...best, distanceKm: bestDistance } : null;
}

export function findCityByName(name) {
  const needle = name.trim().toLowerCase();
  return (
    cities.find((entry) => entry.city.toLowerCase() === needle) ||
    cities.find((entry) => entry.city.toLowerCase().startsWith(needle)) ||
    cities.find((entry) => `${entry.city}, ${entry.country}`.toLowerCase() === needle) ||
    null
  );
}

export function searchCities(term, limit = 8) {
  const needle = term.trim().toLowerCase();
  if (!needle) return cities.slice(0, limit);
  return cities
    .filter((entry) => entry.city.toLowerCase().includes(needle) || entry.country.toLowerCase().includes(needle))
    .slice(0, limit);
}

export const DISTANCE_SQL = `
  (6371 * acos(
    least(1, greatest(-1,
      cos(radians($LAT)) * cos(radians(u.latitude)) *
      cos(radians(u.longitude) - radians($LON)) +
      sin(radians($LAT)) * sin(radians(u.latitude))
    ))
  ))
`;
