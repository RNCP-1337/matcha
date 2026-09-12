import { Router } from 'express';
import { many, one, query } from '../db/pool.js';
import { forbidden, notFound } from '../lib/httpError.js';
import { pushNotification } from '../lib/notify.js';
import { parseId, checkMessage, collect, intParam, requireBody } from '../lib/validate.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/session.js';
import { sendToUser } from '../realtime/hub.js';

const router = Router();

router.use(requireAuth);

async function loadPartner(req) {
  const id = parseId(req.params.id);
  if (!Number.isInteger(id) || id === req.user.id) throw notFound('Conversation not found');

  const partner = await one(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.is_online, u.last_seen, p.filename AS photo
       FROM users u
       LEFT JOIN photos p ON p.id = u.profile_photo_id
      WHERE u.id = $1`,
    [id],
  );
  if (!partner) throw notFound('Conversation not found');

  const blocked = await one(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
    [req.user.id, id],
  );
  if (blocked) throw forbidden('You cannot chat with this member');

  const match = await one(
    `SELECT 1 FROM likes l1
       JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
      WHERE l1.liker_id = $1 AND l1.liked_id = $2`,
    [req.user.id, id],
  );
  if (!match) throw forbidden('You can only chat with members you are connected with');

  return partner;
}

router.get(
  '/conversations',
  asyncRoute(async (req, res) => {
    const rows = await many(
      `WITH connections AS (
         SELECT l1.liked_id AS partner_id
           FROM likes l1
           JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
          WHERE l1.liker_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
               WHERE (b.blocker_id = $1 AND b.blocked_id = l1.liked_id)
                  OR (b.blocker_id = l1.liked_id AND b.blocked_id = $1))
       )
       SELECT u.id, u.username, u.first_name, u.last_name, u.is_online, u.last_seen,
              p.filename AS photo,
              m.body AS last_message,
              m.created_at AS last_message_at,
              m.sender_id AS last_sender_id,
              (SELECT count(*)::int FROM messages
                WHERE sender_id = u.id AND recipient_id = $1 AND read_at IS NULL) AS unread
         FROM connections c
         JOIN users u ON u.id = c.partner_id
         LEFT JOIN photos p ON p.id = u.profile_photo_id
         LEFT JOIN LATERAL (
           SELECT body, created_at, sender_id FROM messages
            WHERE (sender_id = $1 AND recipient_id = u.id) OR (sender_id = u.id AND recipient_id = $1)
            ORDER BY created_at DESC LIMIT 1
         ) m ON true
        ORDER BY m.created_at DESC NULLS LAST, u.first_name ASC`,
      [req.user.id],
    );

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        isOnline: row.is_online,
        lastSeen: row.last_seen,
        photo: row.photo,
        lastMessage: row.last_message,
        lastMessageAt: row.last_message_at,
        lastSenderId: row.last_sender_id,
        unread: row.unread,
      })),
    });
  }),
);

router.get(
  '/:id/messages',
  asyncRoute(async (req, res) => {
    const partner = await loadPartner(req);
    const limit = intParam(req.query.limit, { min: 1, max: 200, fallback: 50 });
    const before = intParam(req.query.before, { min: 1, max: 2 ** 31 - 1, fallback: null });

    const rows = await many(
      `SELECT id, sender_id, recipient_id, body, created_at, read_at
         FROM messages
        WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
          AND ($3::int IS NULL OR id < $3)
        ORDER BY id DESC
        LIMIT $4`,
      [req.user.id, partner.id, before, limit],
    );

    await query('UPDATE messages SET read_at = now() WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL', [
      req.user.id,
      partner.id,
    ]);

    res.json({
      partner: {
        id: partner.id,
        username: partner.username,
        firstName: partner.first_name,
        lastName: partner.last_name,
        isOnline: partner.is_online,
        lastSeen: partner.last_seen,
        photo: partner.photo,
      },
      items: rows.reverse().map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        body: row.body,
        createdAt: row.created_at,
        readAt: row.read_at,
      })),
    });
  }),
);

router.post(
  '/:id/messages',
  asyncRoute(async (req, res) => {
    const partner = await loadPartner(req);
    const body = requireBody(req.body);
    const { message } = collect({ message: checkMessage(body.body) });

    const row = await one(
      'INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id, created_at',
      [req.user.id, partner.id, message],
    );

    const payload = {
      id: row.id,
      senderId: req.user.id,
      recipientId: partner.id,
      body: message,
      createdAt: row.created_at,
      readAt: null,
    };

    sendToUser(partner.id, { type: 'message', message: payload, from: { id: req.user.id, firstName: req.user.first_name } });
    sendToUser(req.user.id, { type: 'message', message: payload, from: { id: req.user.id, firstName: req.user.first_name } });
    await pushNotification(partner.id, req.user.id, 'message');

    res.status(201).json({ message: payload });
  }),
);

export default router;
