import { HttpError } from '../lib/httpError.js';
import { ValidationError } from '../lib/validate.js';

// Browsers print every 4xx response as a red console line. The web client marks its requests, and
// for those an expected refusal comes back as 200 with the real status in the body. Any other client
// still receives the real HTTP status, and server errors (5xx) are never softened.
function reply(req, res, status, body) {
  if (status < 500 && req.get('x-matcha-client') === 'web') {
    return res.status(200).json({ softError: true, status, ...body });
  }
  return res.status(status).json(body);
}

export function notFoundHandler(req, res) {
  reply(req, res, 404, { error: 'Endpoint not found' });
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof ValidationError) {
    return reply(req, res, 400, { error: 'Please correct the highlighted fields', fields: error.fields });
  }

  if (error instanceof HttpError) {
    return reply(req, res, error.status, { error: error.message, ...(error.details ? { fields: error.details } : {}) });
  }

  if (error?.type === 'entity.too.large' || error?.code === 'LIMIT_FILE_SIZE') {
    return reply(req, res, 413, { error: error.code === 'LIMIT_FILE_SIZE' ? 'Image is too large' : 'Request payload is too large' });
  }

  if (error?.name === 'MulterError') {
    return reply(req, res, 400, { error: 'Send one image in the "photo" field' });
  }

  if (typeof error?.code === 'string' && error.code.startsWith('22')) {
    return reply(req, res, 400, { error: 'The request contains an invalid value' });
  }

  if (typeof error?.code === 'string' && error.code.startsWith('23')) {
    return reply(req, res, 409, { error: 'This conflicts with existing data' });
  }

  const status = Number(error?.status ?? error?.statusCode);
  if (status >= 400 && status < 500) {
    return reply(req, res, status, { error: status === 400 ? 'Malformed request' : 'Request refused' });
  }

  console.error('[error]', error);
  return res.status(500).json({ error: 'Unexpected server error' });
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
