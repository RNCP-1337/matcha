import { Router } from 'express';
import { one, query } from '../db/pool.js';
import { recomputeFame } from '../lib/fame.js';
import { distanceKm } from '../lib/geo.js';
import { badRequest, forbidden, notFound } from '../lib/httpError.js';
import { pushNotification } from '../lib/notify.js';
import { parseId, ageFrom, requireBody } from '../lib/validate.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth, requireCompleteProfile } from '../middleware/session.js';
import { sendToUser } from '../realtime/hub.js';
import { userPhotos, userTags } from './serializers.js';

const router = Router();

router.use(requireAuth);

async function loadTarget(req) {
  const identifier = req.params.identifier;
  const numeric = parseId(identifier);

  const target = await one(
    `SELECT u.*, p.filename AS profile_photo
       FROM users u
       LEFT JOIN photos p ON p.id = u.profile_photo_id
      WHERE (lower(u.username) = lower($1) OR u.id = $2) AND u.id <> $3`,
    [identifier, Number.isInteger(numeric) ? numeric : 0, req.user.id],
  );

  if (!target) throw notFound('This profile does not exist');

  const blocked = await one(
    `SELECT 1 FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [req.user.id, target.id],
  );
  if (blocked) throw forbidden('This profile is not available');

  return target;
}

async function relationship(viewerId, targetId) {
  const row = await one(
    `SELECT
       EXISTS (SELECT 1 FROM likes WHERE liker_id = $1 AND liked_id = $2) AS i_liked,
       EXISTS (SELECT 1 FROM likes WHERE liker_id = $2 AND liked_id = $1) AS likes_me,
       EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2) AS i_blocked,
       EXISTS (SELECT 1 FROM reports WHERE reporter_id = $1 AND reported_id = $2) AS i_reported`,
    [viewerId, targetId],
  );
  return { ...row, is_match: row.i_liked && row.likes_me };
}

router.get(
  '/:identifier',
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req);

    const [tags, photos, relation] = await Promise.all([
      userTags(target.id),
      userPhotos(target.id),
      relationship(req.user.id, target.id),
    ]);

    const viewerReady = Boolean(req.user.gender && req.user.birth_date && req.user.city);

    if (viewerReady) {
      const recent = await one(
        `SELECT id FROM visits
          WHERE visitor_id = $1 AND visited_id = $2 AND created_at > now() - interval '1 hour'
          LIMIT 1`,
        [req.user.id, target.id],
      );

      if (!recent) {
        await query('INSERT INTO visits (visitor_id, visited_id) VALUES ($1, $2)', [req.user.id, target.id]);
        await pushNotification(target.id, req.user.id, 'visit');
        await recomputeFame(target.id);
      }
    }

    const fame = await one('SELECT fame_rating FROM users WHERE id = $1', [target.id]);

    res.json({
      profile: {
        id: target.id,
        username: target.username,
        firstName: target.first_name,
        lastName: target.last_name,
        gender: target.gender,
        sexualPreference: target.sexual_preference,
        biography: target.biography,
        age: target.birth_date ? ageFrom(target.birth_date) : null,
        city: target.city,
        country: target.country,
        fameRating: fame.fame_rating,
        isOnline: target.is_online,
        lastSeen: target.last_seen,
        profilePhoto: target.profile_photo,
        photos,
        tags,
        distanceKm: (() => {
          const d = distanceKm(req.user, target);
          return d === null ? null : Math.round(d * 10) / 10;
        })(),
      },
      relationship: {
        iLiked: relation.i_liked,
        likesMe: relation.likes_me,
        isMatch: relation.is_match,
        iBlocked: relation.i_blocked,
        iReported: relation.i_reported,
      },
    });
  }),
);

router.post(
  '/:identifier/like',
  requireCompleteProfile,
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req);

    if (!req.user.profile_photo_id) {
      throw forbidden('Add a profile picture before liking other members');
    }

    const inserted = await query(
      'INSERT INTO likes (liker_id, liked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING liker_id',
      [req.user.id, target.id],
    );

    const relation = await relationship(req.user.id, target.id);

    if (inserted.rowCount > 0) {
      await pushNotification(target.id, req.user.id, relation.is_match ? 'match' : 'like');
      if (relation.is_match) {
        await pushNotification(req.user.id, target.id, 'match');
        sendToUser(target.id, { type: 'match', userId: req.user.id });
        sendToUser(req.user.id, { type: 'match', userId: target.id });
      }
      await Promise.all([recomputeFame(target.id), recomputeFame(req.user.id)]);
    }

    res.json({
      relationship: {
        iLiked: relation.i_liked,
        likesMe: relation.likes_me,
        isMatch: relation.is_match,
        iBlocked: relation.i_blocked,
        iReported: relation.i_reported,
      },
    });
  }),
);

router.delete(
  '/:identifier/like',
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req);
    const before = await relationship(req.user.id, target.id);

    const removed = await query('DELETE FROM likes WHERE liker_id = $1 AND liked_id = $2', [req.user.id, target.id]);

    if (removed.rowCount > 0 && before.is_match) {
      await pushNotification(target.id, req.user.id, 'unlike');
      sendToUser(target.id, { type: 'unmatch', userId: req.user.id });
    }

    if (removed.rowCount > 0) {
      await Promise.all([recomputeFame(target.id), recomputeFame(req.user.id)]);
    }

    const relation = await relationship(req.user.id, target.id);
    res.json({
      relationship: {
        iLiked: relation.i_liked,
        likesMe: relation.likes_me,
        isMatch: relation.is_match,
        iBlocked: relation.i_blocked,
        iReported: relation.i_reported,
      },
    });
  }),
);

router.post(
  '/:identifier/block',
  asyncRoute(async (req, res) => {
    const identifier = req.params.identifier;
    const numeric = parseId(identifier);

    const target = await one(
      'SELECT id FROM users WHERE (lower(username) = lower($1) OR id = $2) AND id <> $3',
      [identifier, Number.isInteger(numeric) ? numeric : 0, req.user.id],
    );
    if (!target) throw notFound('This profile does not exist');

    await query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      req.user.id,
      target.id,
    ]);
    await query('DELETE FROM likes WHERE (liker_id = $1 AND liked_id = $2) OR (liker_id = $2 AND liked_id = $1)', [
      req.user.id,
      target.id,
    ]);
    await query('DELETE FROM notifications WHERE user_id = $1 AND actor_id = $2', [req.user.id, target.id]);

    await Promise.all([recomputeFame(target.id), recomputeFame(req.user.id)]);
    sendToUser(target.id, { type: 'blocked', userId: req.user.id });

    res.json({ message: 'User blocked' });
  }),
);

router.delete(
  '/:identifier/block',
  asyncRoute(async (req, res) => {
    const identifier = req.params.identifier;
    const numeric = parseId(identifier);

    const target = await one('SELECT id FROM users WHERE lower(username) = lower($1) OR id = $2', [
      identifier,
      Number.isInteger(numeric) ? numeric : 0,
    ]);
    if (!target) throw notFound('This profile does not exist');

    await query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.user.id, target.id]);
    await recomputeFame(target.id);
    res.json({ message: 'User unblocked' });
  }),
);

router.post(
  '/:identifier/report',
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body ?? {});
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    const target = await loadTarget(req);

    const result = await query(
      'INSERT INTO reports (reporter_id, reported_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.user.id, target.id, reason || null],
    );

    if (result.rowCount === 0) throw badRequest('You already reported this account');

    await recomputeFame(target.id);
    res.json({ message: 'Report sent. Thank you for helping keep Matcha safe.' });
  }),
);

export default router;
