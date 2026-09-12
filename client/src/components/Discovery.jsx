import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, buildQuery } from '../lib/api.js';
import { Empty, Notice, ProfileCard } from './Bits.jsx';

const EMPTY_FILTERS = {
  ageMin: '',
  ageMax: '',
  fameMin: '',
  fameMax: '',
  maxDistance: '',
  city: '',
  tags: [],
  sort: 'relevance',
  direction: 'desc',
};

const SORT_LABELS = [
  ['relevance', 'Best match'],
  ['age', 'Age'],
  ['distance', 'Distance'],
  ['fame', 'Fame rating'],
  ['tags', 'Shared interests'],
];

export default function Discovery({ endpoint, pageSize = 24, intro }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [tagOptions, setTagOptions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/tags')
      .then((data) => setTagOptions(data.items.map((tag) => tag.name).slice(0, 24)))
      .catch(() => setTagOptions([]));
  }, []);

  const load = useCallback(
    async (params, nextOffset, append) => {
      setLoading(true);
      setError('');

      try {
        const query = buildQuery({ ...params, limit: pageSize, offset: nextOffset });
        const data = await api.get(`${endpoint}${query}`);
        setItems((current) => (append ? [...current, ...data.items] : data.items));
        setTotal(data.total);
        setOffset(nextOffset);
      } catch (problem) {
        setError(problem instanceof ApiError ? problem.message : 'Could not load profiles');
        if (!append) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [endpoint, pageSize],
  );

  useEffect(() => {
    load(EMPTY_FILTERS, 0, false);
  }, [load]);

  const update = (key) => (event) => {
    const value = event.target.value;
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleTag = (tag) => {
    setFilters((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((entry) => entry !== tag) : [...current.tags, tag],
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    setApplied(filters);
    load(filters, 0, false);
  };

  const reset = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    load(EMPTY_FILTERS, 0, false);
  };

  const sortNow = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setApplied(next);
    load(next, 0, false);
  };

  return (
    <>
      {intro}

      <form className="filters" onSubmit={submit}>
        <div className="filters__grid">
          <div>
            <label className="label" htmlFor="sort">
              Sort by
            </label>
            <select id="sort" value={filters.sort} onChange={(event) => sortNow('sort', event.target.value)}>
              {SORT_LABELS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="direction">
              Order
            </label>
            <select
              id="direction"
              value={filters.direction}
              onChange={(event) => sortNow('direction', event.target.value)}
            >
              <option value="desc">Highest first</option>
              <option value="asc">Lowest first</option>
            </select>
          </div>

          <div>
            <span className="label">Age</span>
            <div className="filters__row">
              <input
                type="number"
                min="18"
                max="120"
                placeholder="18"
                aria-label="Minimum age"
                value={filters.ageMin}
                onChange={update('ageMin')}
              />
              <span className="muted small">to</span>
              <input
                type="number"
                min="18"
                max="120"
                placeholder="120"
                aria-label="Maximum age"
                value={filters.ageMax}
                onChange={update('ageMax')}
              />
            </div>
          </div>

          <div>
            <span className="label">Fame rating</span>
            <div className="filters__row">
              <input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                aria-label="Minimum fame rating"
                value={filters.fameMin}
                onChange={update('fameMin')}
              />
              <span className="muted small">to</span>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="100"
                aria-label="Maximum fame rating"
                value={filters.fameMax}
                onChange={update('fameMax')}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="maxDistance">
              Within (km)
            </label>
            <input
              id="maxDistance"
              type="number"
              min="1"
              max="20000"
              placeholder="Any distance"
              value={filters.maxDistance}
              onChange={update('maxDistance')}
            />
          </div>

          <div>
            <label className="label" htmlFor="city">
              City
            </label>
            <input
              id="city"
              type="text"
              placeholder="Any city"
              value={filters.city}
              onChange={update('city')}
              maxLength={80}
            />
          </div>
        </div>

        {tagOptions.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <span className="label">Interests</span>
            <div className="tag-suggestions">
              {tagOptions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={
                    filters.tags.includes(tag)
                      ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-dark)' }
                      : undefined
                  }
                  aria-pressed={filters.tags.includes(tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="filters__actions">
          <button className="button" type="submit">
            Apply filters
          </button>
          <button className="button button--secondary" type="button" onClick={reset}>
            Clear
          </button>
          <span className="filters__count">
            {loading && items.length === 0 ? 'Loading...' : `${total} profile${total === 1 ? '' : 's'} found`}
          </span>
        </div>
      </form>

      <Notice kind="error">{error}</Notice>

      {items.length === 0 && !loading ? (
        <Empty>No profile matches these criteria. Try widening the age range or the distance.</Empty>
      ) : (
        <div className="card-grid">
          {items.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      )}

      {items.length < total ? (
        <div className="center" style={{ marginTop: 22 }}>
          <button
            className="button button--secondary"
            type="button"
            disabled={loading}
            onClick={() => load(applied, offset + pageSize, true)}
          >
            {loading ? 'Loading...' : 'Show more profiles'}
          </button>
        </div>
      ) : null}
    </>
  );
}
