import { Router } from 'express';
import { many } from '../db/pool.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 24) : '';

    const rows = await many(
      `SELECT t.name, count(ut.user_id)::int AS uses
         FROM tags t
         LEFT JOIN user_tags ut ON ut.tag_id = t.id
        WHERE ($1 = '' OR t.name ILIKE '%' || $1 || '%')
        GROUP BY t.name
        ORDER BY uses DESC, t.name ASC
        LIMIT 60`,
      [term],
    );

    res.json({ items: rows });
  }),
);

export default router;
