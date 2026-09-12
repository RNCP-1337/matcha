import { useCallback, useEffect, useRef, useState } from 'react';

const FILTERS = [
  { key: 'none', label: 'Original', css: 'none' },
  { key: 'mono', label: 'Black and white', css: 'grayscale(1) contrast(1.05)' },
  { key: 'warm', label: 'Warm', css: 'sepia(0.35) saturate(1.2)' },
  { key: 'cool', label: 'Cool', css: 'saturate(0.85) hue-rotate(-12deg) brightness(1.03)' },
  { key: 'faded', label: 'Faded', css: 'contrast(0.88) brightness(1.08) saturate(0.9)' },
  { key: 'punch', label: 'Punchy', css: 'contrast(1.18) saturate(1.25)' },
];

const OUTPUT_SIZE = 900;

export default function ImageEditor({ file, onCancel, onConfirm }) {
  const canvas = useRef(null);
  const image = useRef(null);
  const dragState = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [filter, setFilter] = useState('none');
  const [crop, setCrop] = useState({ x: 0, y: 0, size: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const element = new Image();

    // The url is released once the load settles rather than on cleanup, so a remount
    // never pulls the source out from under an image that is still decoding.
    element.onload = () => {
      URL.revokeObjectURL(url);
      if (cancelled) return;
      image.current = element;
      setLoaded(true);
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      if (!cancelled) setError('That file could not be read as an image.');
    };
    element.src = url;

    return () => {
      cancelled = true;
    };
  }, [file]);

  const rotatedSize = useCallback(() => {
    const source = image.current;
    if (!source) return { width: 0, height: 0 };
    const swap = rotation % 180 !== 0;
    return {
      width: swap ? source.naturalHeight : source.naturalWidth,
      height: swap ? source.naturalWidth : source.naturalHeight,
    };
  }, [rotation]);

  const draw = useCallback(() => {
    const surface = canvas.current;
    const source = image.current;
    if (!surface || !source) return;

    const { width, height } = rotatedSize();
    const scale = Math.min(520 / width, 420 / height, 1);
    surface.width = Math.round(width * scale);
    surface.height = Math.round(height * scale);

    const context = surface.getContext('2d');
    context.clearRect(0, 0, surface.width, surface.height);
    context.save();
    context.filter = FILTERS.find((entry) => entry.key === filter).css;
    context.translate(surface.width / 2, surface.height / 2);
    context.rotate((rotation * Math.PI) / 180);

    const drawWidth = (rotation % 180 === 0 ? surface.width : surface.height);
    const drawHeight = (rotation % 180 === 0 ? surface.height : surface.width);
    context.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();

    const side = Math.min(surface.width, surface.height) * crop.size;
    const left = crop.x * (surface.width - side);
    const top = crop.y * (surface.height - side);

    context.save();
    context.fillStyle = 'rgba(30, 30, 28, 0.55)';
    context.beginPath();
    context.rect(0, 0, surface.width, surface.height);
    context.rect(left, top, side, side);
    context.fill('evenodd');
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.strokeRect(left, top, side, side);
    context.restore();
  }, [crop, filter, rotation, rotatedSize]);

  useEffect(() => {
    if (loaded) draw();
  }, [loaded, draw]);

  const pointerToCrop = (event) => {
    const surface = canvas.current;
    const rect = surface.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * surface.width;
    const y = ((event.clientY - rect.top) / rect.height) * surface.height;
    const side = Math.min(surface.width, surface.height) * crop.size;

    return {
      x: Math.max(0, Math.min(1, (x - side / 2) / Math.max(1, surface.width - side))),
      y: Math.max(0, Math.min(1, (y - side / 2) / Math.max(1, surface.height - side))),
    };
  };

  const startDrag = (event) => {
    event.preventDefault();
    dragState.current = true;
    setCrop((current) => ({ ...current, ...pointerToCrop(event) }));
  };

  const moveDrag = (event) => {
    if (!dragState.current) return;
    setCrop((current) => ({ ...current, ...pointerToCrop(event) }));
  };

  const endDrag = () => {
    dragState.current = null;
  };

  const confirm = async () => {
    setBusy(true);
    setError('');

    try {
      const source = image.current;
      const { width, height } = rotatedSize();
      const stage = document.createElement('canvas');
      stage.width = width;
      stage.height = height;

      const context = stage.getContext('2d');
      context.filter = FILTERS.find((entry) => entry.key === filter).css;
      context.translate(width / 2, height / 2);
      context.rotate((rotation * Math.PI) / 180);
      const drawWidth = rotation % 180 === 0 ? width : height;
      const drawHeight = rotation % 180 === 0 ? height : width;
      context.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

      const side = Math.min(width, height) * crop.size;
      const left = crop.x * (width - side);
      const top = crop.y * (height - side);

      const output = document.createElement('canvas');
      const outputSize = Math.min(OUTPUT_SIZE, Math.round(side));
      output.width = outputSize;
      output.height = outputSize;
      output.getContext('2d').drawImage(stage, left, top, side, side, 0, 0, outputSize, outputSize);

      const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('The browser could not encode the image');

      await onConfirm(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    } catch (problem) {
      setError(problem.message || 'Could not prepare the image');
      setBusy(false);
    }
  };

  return (
    <div className="editor" role="dialog" aria-modal="true" aria-label="Edit the photo before uploading">
      <div className="editor__panel">
        <div className="panel__title">
          <h2>Adjust your photo</h2>
          <button className="link-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>

        {error ? <p className="notice notice--error">{error}</p> : null}

        <div className="editor__stage">
          <canvas
            ref={canvas}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          />
        </div>

        <p className="hint">Drag inside the picture to move the square, then choose how much of it to keep.</p>

        <div className="field">
          <label htmlFor="crop-size">Crop size</label>
          <input
            id="crop-size"
            type="range"
            min="30"
            max="100"
            value={Math.round(crop.size * 100)}
            onChange={(event) => setCrop((current) => ({ ...current, size: Number(event.target.value) / 100 }))}
          />
        </div>

        <div className="field">
          <span className="label">Rotation</span>
          <div className="button-row">
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={() => setRotation((value) => (value + 270) % 360)}
            >
              Rotate left
            </button>
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={() => setRotation((value) => (value + 90) % 360)}
            >
              Rotate right
            </button>
            <span className="small muted">{rotation}&deg;</span>
          </div>
        </div>

        <div className="field">
          <span className="label">Filter</span>
          <div className="tag-suggestions">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(entry.key)}
                style={
                  filter === entry.key
                    ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-dark)' }
                    : undefined
                }
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="button-row">
          <button className="button" type="button" onClick={confirm} disabled={busy || !loaded}>
            {busy ? 'Uploading...' : 'Use this photo'}
          </button>
          <button className="button button--secondary" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
