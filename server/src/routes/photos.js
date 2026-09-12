import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { many, one, query, transaction } from '../db/pool.js';
import { recomputeFame } from '../lib/fame.js';
import { badRequest, notFound } from '../lib/httpError.js';
import { requireBody } from '../lib/validate.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/session.js';
import { detectImageType, uploadImage } from '../middleware/upload.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const photos = await many(
      'SELECT id, filename, created_at FROM photos WHERE user_id = $1 ORDER BY position, id',
      [req.user.id],
    );
    res.json({ items: photos, profilePhotoId: req.user.profile_photo_id });
  }),
);

router.post(
  '/',
  (req, res, next) => uploadImage(req, res, (error) => (error ? next(error) : next())),
  asyncRoute(async (req, res) => {
    if (!req.file) throw badRequest('No image received');

    const type = detectImageType(req.file.buffer);
    if (!type) throw badRequest('That file is not a valid JPEG, PNG, GIF or WebP image');
    if (req.file.size > config.uploads.maxBytes) throw badRequest('Image is too large');

    const { rows } = await query('SELECT count(*)::int AS total FROM photos WHERE user_id = $1', [req.user.id]);
    if (rows[0].total >= config.uploads.maxPerUser) {
      throw badRequest(`You can upload at most ${config.uploads.maxPerUser} photos`);
    }

    const filename = `${randomUUID()}.${type.extension}`;
    await writeFile(join(config.uploads.dir, filename), req.file.buffer);

    const photo = await one(
      `INSERT INTO photos (user_id, filename, mime_type, byte_size, position)
       VALUES ($1, $2, $3, $4, coalesce((SELECT max(position) + 1 FROM photos WHERE user_id = $1), 1))
       RETURNING id, filename, created_at`,
      [req.user.id, filename, type.mime, req.file.size],
    );

    if (!req.user.profile_photo_id) {
      await query('UPDATE users SET profile_photo_id = $1 WHERE id = $2', [photo.id, req.user.id]);
    }

    await recomputeFame(req.user.id);
    res.status(201).json({ photo });
  }),
);

router.put(
  '/order',
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    if (!Array.isArray(body.order)) throw badRequest('Send the photo ids in the order you want');

    const wanted = body.order.map((value) => Number.parseInt(value, 10)).filter(Number.isInteger);
    const mine = await many('SELECT id FROM photos WHERE user_id = $1', [req.user.id]);
    const owned = new Set(mine.map((row) => row.id));

    if (wanted.length !== owned.size || wanted.some((id) => !owned.has(id)) || new Set(wanted).size !== wanted.length) {
      throw badRequest('That ordering does not match your gallery');
    }

    await transaction(async (client) => {
      for (const [index, id] of wanted.entries()) {
        await client.query('UPDATE photos SET position = $1 WHERE id = $2 AND user_id = $3', [
          index + 1,
          id,
          req.user.id,
        ]);
      }
    });

    res.json({ order: wanted });
  }),
);

router.put(
  '/:id/profile',
  asyncRoute(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw badRequest('Invalid photo id');

    const photo = await one('SELECT id FROM photos WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!photo) throw notFound('Photo not found');

    await query('UPDATE users SET profile_photo_id = $1, updated_at = now() WHERE id = $2', [id, req.user.id]);
    await recomputeFame(req.user.id);
    res.json({ profilePhotoId: id });
  }),
);

router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw badRequest('Invalid photo id');

    const photo = await one('SELECT id, filename FROM photos WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!photo) throw notFound('Photo not found');

    await query('DELETE FROM photos WHERE id = $1', [id]);
    await unlink(join(config.uploads.dir, photo.filename)).catch(() => {});

    const remaining = await one('SELECT id FROM photos WHERE user_id = $1 ORDER BY position, id LIMIT 1', [req.user.id]);
    const current = await one('SELECT profile_photo_id FROM users WHERE id = $1', [req.user.id]);

    if (!current.profile_photo_id && remaining) {
      await query('UPDATE users SET profile_photo_id = $1 WHERE id = $2', [remaining.id, req.user.id]);
    }

    await recomputeFame(req.user.id);
    res.json({ message: 'Photo removed' });
  }),
);

export default router;
