import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function TagEditor({ value, onChange, error }) {
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    api
      .get('/api/tags')
      .then((data) => setSuggestions(data.items.map((tag) => tag.name).slice(0, 20)))
      .catch(() => setSuggestions([]));
  }, []);

  const add = (raw) => {
    const tag = raw.trim().toLowerCase().replace(/^#/, '');
    if (!tag || value.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  const remove = (tag) => onChange(value.filter((entry) => entry !== tag));

  return (
    <div className="field">
      <span className="label">Interests</span>

      {value.length > 0 ? (
        <ul className="tag-list" style={{ marginBottom: 8 }}>
          {value.map((tag) => (
            <li key={tag}>
              <span className="tag">
                #{tag}
                <button type="button" onClick={() => remove(tag)} aria-label={`Remove ${tag}`}>
                  &times;
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="filters__row">
        <input
          type="text"
          value={draft}
          placeholder="Add an interest, for example vegan"
          maxLength={25}
          aria-invalid={Boolean(error)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(draft);
            }
          }}
        />
        <button className="button button--secondary button--small" type="button" onClick={() => add(draft)}>
          Add
        </button>
      </div>

      <p className="hint">Letters and digits only, 2 to 24 characters. Press Enter to add.</p>
      {error ? <p className="field-error">{error}</p> : null}

      {suggestions.length > 0 ? (
        <div className="tag-suggestions">
          {suggestions
            .filter((tag) => !value.includes(tag))
            .slice(0, 14)
            .map((tag) => (
              <button key={tag} type="button" onClick={() => add(tag)}>
                #{tag}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
