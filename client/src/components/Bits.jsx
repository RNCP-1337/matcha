import { Link } from 'react-router-dom';
import { photoUrl } from '../lib/api.js';
import { distanceLabel, presenceLabel } from '../lib/format.js';

export function Presence({ online, label }) {
  return (
    <span title={label} className={`presence${online ? ' presence--online' : ''}`} aria-hidden="true" />
  );
}

export function Fame({ value }) {
  return (
    <span className="fame" title="Fame rating out of 100">
      <span className="fame__bar">
        <span className="fame__fill" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </span>
      <span className="small">{value}/100</span>
    </span>
  );
}

export function Avatar({ filename, alt, size = 38, className = 'chat__avatar' }) {
  const source = photoUrl(filename);
  if (!source) {
    return (
      <span
        className={className}
        style={{ width: size, height: size, display: 'inline-block', background: 'var(--surface-alt)' }}
        aria-hidden="true"
      />
    );
  }
  return <img className={className} src={source} alt={alt} width={size} height={size} />;
}

export function Notice({ kind = 'info', children }) {
  if (!children) return null;
  const suffix = kind === 'error' ? ' notice--error' : kind === 'warning' ? ' notice--warning' : '';
  return (
    <p className={`notice${suffix}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

export function TagList({ tags, highlight = [] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <ul className="tag-list">
      {tags.map((tag) => (
        <li key={tag}>
          <span className={highlight.includes(tag) ? 'tag' : 'tag tag--plain'}>#{tag}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProfileCard({ profile }) {
  const flag = profile.isMatch || (profile.iLiked && profile.likesMe)
    ? 'Connected'
    : profile.likesMe
      ? 'Likes you'
      : profile.iLiked
        ? 'You liked'
        : null;

  return (
    <Link className="profile-card" to={`/profile/${profile.username}`}>
      <span className="profile-card__media">
        {profile.photo ? (
          <img src={photoUrl(profile.photo)} alt={`${profile.firstName}'s profile picture`} loading="lazy" />
        ) : null}
        {flag ? <span className="profile-card__flag">{flag}</span> : null}
      </span>
      <span className="profile-card__body">
        <span className="profile-card__name">
          <Presence online={profile.isOnline} label={presenceLabel(profile)} />
          {profile.firstName}, {profile.age}
        </span>
        <span className="profile-card__meta">
          {profile.city}
          {profile.city && profile.country ? ', ' : ''}
          {profile.country}
        </span>
        <span className="profile-card__stats">
          <span>{distanceLabel(profile.distanceKm)}</span>
          <span>Fame {profile.fameRating}</span>
          {profile.commonTags ? (
            <span>
              {profile.commonTags} shared interest{profile.commonTags === 1 ? '' : 's'}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
