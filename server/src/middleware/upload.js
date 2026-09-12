import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/httpError.js';

const SIGNATURES = [
  { mime: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', extension: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes, files: 1, fields: 4 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
      return callback(badRequest('Only JPEG, PNG, GIF and WebP images are accepted'));
    }
    return callback(null, true);
  },
}).single('photo');

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  for (const signature of SIGNATURES) {
    if (signature.bytes.every((byte, index) => buffer[index] === byte)) {
      return { mime: signature.mime, extension: signature.extension };
    }
  }

  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (isWebp) return { mime: 'image/webp', extension: 'webp' };

  return null;
}
