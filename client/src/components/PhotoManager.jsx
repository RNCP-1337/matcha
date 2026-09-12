import { useRef, useState } from 'react';
import { ApiError, api, photoUrl } from '../lib/api.js';
import { Notice } from './Bits.jsx';
import ImageEditor from './ImageEditor.jsx';

const MAX_PHOTOS = 5;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function PhotoManager({ user, onChange }) {
  const input = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(null);
  const [order, setOrder] = useState(null);

  const photos = user.photos || [];

  const accept = (file) => {
    setError('');
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError('Only JPEG, PNG, GIF and WebP images are accepted.');
      return;
    }
    if (photos.length >= MAX_PHOTOS) {
      setError(`You already have ${MAX_PHOTOS} photos. Delete one first.`);
      return;
    }
    setEditing(file);
  };

  const upload = async (file) => {
    setBusy(true);
    const body = new FormData();
    body.append('photo', file);

    try {
      await api.post('/api/me/photos', body);
      await onChange();
      setEditing(null);
    } catch (problem) {
      throw new Error(problem instanceof ApiError ? problem.message : 'Could not upload that image');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const act = async (call, failure) => {
    setBusy(true);
    setError('');
    try {
      await call();
      await onChange();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files?.[0]);
  };

  const reorder = async (from, to) => {
    if (from === to || to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next.map((photo) => photo.id));

    await act(
      () => api.put('/api/me/photos/order', { order: next.map((photo) => photo.id) }),
      'Could not reorder the gallery',
    );
    setOrder(null);
  };

  const shown = order ? order.map((id) => photos.find((photo) => photo.id === id)).filter(Boolean) : photos;

  return (
    <div className="panel">
      <div className="panel__title">
        <h2>Photo gallery</h2>
        <span className="small muted">
          {photos.length} of {MAX_PHOTOS}
        </span>
      </div>

      <Notice kind="error">{error}</Notice>

      <div className="photo-grid">
        {shown.map((photo, index) => {
          const isProfile = photo.id === user.profilePhotoId;
          return (
            <div
              className={`photo-item${isProfile ? ' is-profile' : ''}`}
              key={photo.id}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const from = Number(event.dataTransfer.getData('text/plain'));
                if (Number.isInteger(from)) reorder(from, index);
              }}
            >
              <img src={photoUrl(photo.filename)} alt="" />
              <div className="photo-item__actions">
                {isProfile ? (
                  <span className="photo-item__label">Profile picture</span>
                ) : (
                  <button
                    className="link-button"
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => api.put(`/api/me/photos/${photo.id}/profile`), 'Could not update')}
                  >
                    Use as profile
                  </button>
                )}
                <button
                  className="link-button"
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => api.delete(`/api/me/photos/${photo.id}`), 'Could not delete that photo')}
                >
                  Delete
                </button>
              </div>
              <div className="photo-item__move">
                <button
                  type="button"
                  className="link-button"
                  disabled={busy || index === 0}
                  onClick={() => reorder(index, index - 1)}
                  aria-label="Move earlier"
                >
                  &larr;
                </button>
                <span className="small muted">{index + 1}</span>
                <button
                  type="button"
                  className="link-button"
                  disabled={busy || index === shown.length - 1}
                  onClick={() => reorder(index, index + 1)}
                  aria-label="Move later"
                >
                  &rarr;
                </button>
              </div>
            </div>
          );
        })}

        {photos.length < MAX_PHOTOS ? (
          <label
            className={`upload-slot${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span>{dragging ? 'Drop it here' : 'Drag a photo here'}</span>
            <span className="small">or click to choose one</span>
            <span className="small">JPEG, PNG, GIF or WebP, up to 5 MB</span>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              disabled={busy}
              onChange={(event) => accept(event.target.files?.[0])}
            />
          </label>
        ) : null}
      </div>

      <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
        Drag photos to reorder them, or use the arrows. Your profile picture is the one other members see in
        lists and notifications, and you need one before you can like anybody.
      </p>

      {editing ? (
        <ImageEditor file={editing} onCancel={() => setEditing(null)} onConfirm={upload} />
      ) : null}
    </div>
  );
}
