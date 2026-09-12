import { HttpError } from '../lib/httpError.js';
import { ValidationError } from '../lib/validate.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Endpoint not found' });
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: 'Please correct the highlighted fields', fields: error.fields });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, ...(error.details ? { fields: error.details } : {}) });
  }

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload is too large' });
  }

  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Image is too large' });
  }

  console.error('[error]', error);
  return res.status(500).json({ error: 'Unexpected server error' });
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
