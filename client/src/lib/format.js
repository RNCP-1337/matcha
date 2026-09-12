const RELATIVE = [
  { limit: 60, unit: 'second', divisor: 1 },
  { limit: 3600, unit: 'minute', divisor: 60 },
  { limit: 86400, unit: 'hour', divisor: 3600 },
  { limit: 2592000, unit: 'day', divisor: 86400 },
  { limit: 31536000, unit: 'month', divisor: 2592000 },
];

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function relativeTime(value) {
  if (!value) return '';
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;

  if (seconds < 45) return 'just now';

  for (const step of RELATIVE) {
    if (seconds < step.limit) {
      return relativeFormatter.format(-Math.round(seconds / step.divisor), step.unit);
    }
  }
  return relativeFormatter.format(-Math.round(seconds / 31536000), 'year');
}

export function shortDate(value) {
  return value ? dateFormatter.format(new Date(value)) : '';
}

export function clockTime(value) {
  return value ? timeFormatter.format(new Date(value)) : '';
}

export function presenceLabel(user) {
  if (user.isOnline) return 'Online now';
  if (!user.lastSeen) return 'Never connected';
  return `Last seen ${shortDate(user.lastSeen)} at ${clockTime(user.lastSeen)} (${relativeTime(user.lastSeen)})`;
}

export function distanceLabel(km) {
  if (km === null || km === undefined) return 'Distance unknown';
  if (km < 1) return 'Less than 1 km away';
  if (km < 100) return `${Math.round(km)} km away`;
  return `${Math.round(km).toLocaleString('en-GB')} km away`;
}

export const GENDER_LABELS = {
  male: 'Man',
  female: 'Woman',
  other: 'Other',
};

export const PREFERENCE_LABELS = {
  heterosexual: 'Heterosexual',
  homosexual: 'Homosexual',
  bisexual: 'Bisexual',
};
