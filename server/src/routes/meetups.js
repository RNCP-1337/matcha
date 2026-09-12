import { Router } from 'express';
import { many, one, query } from '../db/pool.js';
import { badRequest, forbidden, notFound } from '../lib/httpError.js';
import { pushNotification } from '../lib/notify.js';
import { parseId, collect, requireBody } from '../lib/validate.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/session.js';
import { sendToUser } from '../realtime/hub.js';

const router = Router();

router.use(requireAuth);

function checkTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) return { error: 'Give the meetup a title' };
  if (title.length > 120) return { error: 'The title must be at most 120 characters' };
  return { value: title };
}

function checkPlace(value) {
  const place = typeof value === 'string' ? value.trim() : '';
  if (place.length > 160) return { error: 'The place must be at most 160 characters' };
  return { value: place };
}

function checkNote(value) {
  const note = typeof value === 'string' ? value.trim() : '';
  if (note.length > 500) return { error: 'The note must be at most 500 characters' };
  return { value: note };
}

function checkSchedule(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { error: 'Choose a date and a time' };

  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) return { error: 'That date could not be read' };
  if (when.getTime() < Date.now() - 60_000) return { error: 'Pick a moment in the future' };
  if (when.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) return { error: 'Pick a date within the next year' };
  return { value: when.toISOString() };
}

async function requireConnection(viewerId, partnerId) {
  if (!Number.isInteger(partnerId) || partnerId === viewerId) throw notFound('This member does not exist');

  const blocked = await one(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
    [viewerId, partnerId],
  );
  if (blocked) throw forbidden('This member is not available');

  const match = await one(
    `SELECT 1 FROM likes l1
       JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
      WHERE l1.liker_id = $1 AND l1.liked_id = $2`,
    [viewerId, partnerId],
  );
  if (!match) throw forbidden('You can only plan a meetup with a member you are connected with');
}

function serialize(row, viewerId) {
  return {
    id: row.id,
    title: row.title,
    place: row.place,
    note: row.note,
    scheduledAt: row.scheduled_at,
    status: row.status,
    createdAt: row.created_at,
    isOrganizer: row.organizer_id === viewerId,
    partner: {
      id: row.partner_id,
      username: row.partner_username,
      firstName: row.partner_first_name,
      photo: row.partner_photo,
    },
  };
}

const SELECT_MEETUPS = `
  SELECT m.*,
         CASE WHEN m.organizer_id = $1 THEN m.invitee_id ELSE m.organizer_id END AS partner_id,
         u.username AS partner_username,
         u.first_name AS partner_first_name,
         p.filename AS partner_photo
    FROM meetups m
    JOIN users u ON u.id = CASE WHEN m.organizer_id = $1 THEN m.invitee_id ELSE m.organizer_id END
    LEFT JOIN photos p ON p.id = u.profile_photo_id
   WHERE (m.organizer_id = $1 OR m.invitee_id = $1)
     AND NOT EXISTS (
       SELECT 1 FROM blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
           OR (b.blocker_id = u.id AND b.blocked_id = $1))`;

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const rows = await many(`${SELECT_MEETUPS} ORDER BY m.scheduled_at ASC`, [req.user.id]);
    const now = Date.now();

    res.json({
      upcoming: rows
        .filter((row) => new Date(row.scheduled_at).getTime() >= now && row.status !== 'cancelled')
        .map((row) => serialize(row, req.user.id)),
      past: rows
        .filter((row) => new Date(row.scheduled_at).getTime() < now || row.status === 'cancelled')
        .reverse()
        .map((row) => serialize(row, req.user.id)),
    });
  }),
);

router.get(
  '/with/:id',
  asyncRoute(async (req, res) => {
    const partnerId = parseId(req.params.id);
    await requireConnection(req.user.id, partnerId);

    const rows = await many(
      `${SELECT_MEETUPS} AND (m.organizer_id = $2 OR m.invitee_id = $2) ORDER BY m.scheduled_at ASC`,
      [req.user.id, partnerId],
    );
    res.json({ items: rows.map((row) => serialize(row, req.user.id)) });
  }),
);

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    const inviteeId = parseId(body.inviteeId);
    await requireConnection(req.user.id, inviteeId);

    const values = collect({
      title: checkTitle(body.title),
      place: checkPlace(body.place),
      note: checkNote(body.note),
      scheduledAt: checkSchedule(body.scheduledAt),
    });

    const pending = await one(
      `SELECT count(*)::int AS total FROM meetups
        WHERE organizer_id = $1 AND invitee_id = $2 AND status = 'proposed'`,
      [req.user.id, inviteeId],
    );
    if (pending.total >= 5) throw badRequest('You already have five proposals waiting for an answer');

    const created = await one(
      `INSERT INTO meetups (organizer_id, invitee_id, title, place, scheduled_at, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.user.id, inviteeId, values.title, values.place || null, values.scheduledAt, values.note || null],
    );

    const row = await one(`${SELECT_MEETUPS} AND m.id = $2`, [req.user.id, created.id]);
    const forInvitee = await one(`${SELECT_MEETUPS} AND m.id = $2`, [inviteeId, created.id]);

    await pushNotification(inviteeId, req.user.id, 'meetup');
    sendToUser(inviteeId, { type: 'meetup', meetup: serialize(forInvitee, inviteeId) });

    res.status(201).json({ meetup: serialize(row, req.user.id) });
  }),
);

router.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    const body = requireBody(req.body);
    const status = body.status;

    if (!['accepted', 'declined', 'cancelled'].includes(status)) throw badRequest('Unknown status');

    const meetup = await one('SELECT * FROM meetups WHERE id = $1', [id]);
    if (!meetup) throw notFound('This meetup does not exist');

    const isOrganizer = meetup.organizer_id === req.user.id;
    const isInvitee = meetup.invitee_id === req.user.id;
    if (!isOrganizer && !isInvitee) throw forbidden('This meetup is not yours');

    if (status === 'cancelled' && !isOrganizer) throw forbidden('Only the organiser can cancel a meetup');
    if (status !== 'cancelled' && !isInvitee) throw forbidden('Only the invited member can answer a proposal');
    if (meetup.status !== 'proposed' && status !== 'cancelled') throw badRequest('This proposal was already answered');

    await query('UPDATE meetups SET status = $1, updated_at = now() WHERE id = $2', [status, id]);

    const partnerId = isOrganizer ? meetup.invitee_id : meetup.organizer_id;
    const mine = await one(`${SELECT_MEETUPS} AND m.id = $2`, [req.user.id, id]);
    const theirs = await one(`${SELECT_MEETUPS} AND m.id = $2`, [partnerId, id]);

    if (theirs) {
      sendToUser(partnerId, { type: 'meetup', meetup: serialize(theirs, partnerId) });
      await pushNotification(partnerId, req.user.id, 'meetup');
    }

    res.json({ meetup: serialize(mine, req.user.id) });
  }),
);

export default router;
