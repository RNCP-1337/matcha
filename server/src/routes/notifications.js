import { Router } from 'express';
import { many, one, query } from '../db/pool.js';
import { intParam } from '../lib/validate.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const limit = intParam(req.query.limit, { min: 1, max: 100, fallback: 30 });

    const rows = await many(
      `SELECT n.id, n.type, n.created_at, n.read_at,
              u.id AS actor_id, u.username AS actor_username, u.first_name AS actor_first_name,
              p.filename AS actor_photo
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actor_id
         LEFT JOIN photos p ON p.id = u.profile_photo_id
        WHERE n.user_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = n.actor_id)
                OR (b.blocker_id = n.actor_id AND b.blocked_id = $1))
        ORDER BY n.created_at DESC
        LIMIT $2`,
      [req.user.id, limit],
    );

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        createdAt: row.created_at,
        readAt: row.read_at,
        actor: row.actor_id
          ? {
              id: row.actor_id,
              username: row.actor_username,
              firstName: row.actor_first_name,
              photo: row.actor_photo,
            }
          : null,
      })),
    });
  }),
);

router.get(
  '/summary',
  asyncRoute(async (req, res) => {
    const row = await one(
      `SELECT
         (SELECT count(*)::int FROM notifications n
           WHERE n.user_id = $1 AND n.read_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM blocks b
                WHERE (b.blocker_id = $1 AND b.blocked_id = n.actor_id)
                   OR (b.blocker_id = n.actor_id AND b.blocked_id = $1))) AS notifications,
         (SELECT count(*)::int FROM messages m
           WHERE m.recipient_id = $1 AND m.read_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM blocks b
                WHERE (b.blocker_id = $1 AND b.blocked_id = m.sender_id)
                   OR (b.blocker_id = m.sender_id AND b.blocked_id = $1))) AS messages`,
      [req.user.id],
    );

    res.json({ notifications: row.notifications, messages: row.messages });
  }),
);

router.post(
  '/read',
  asyncRoute(async (req, res) => {
    await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    res.json({ message: 'Notifications marked as read' });
  }),
);

export default router;
