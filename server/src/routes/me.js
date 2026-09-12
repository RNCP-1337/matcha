import { Router } from 'express';
import { many, one, query, transaction } from '../db/pool.js';
import { badRequest, conflict } from '../lib/httpError.js';
import { recomputeFame } from '../lib/fame.js';
import { findCityByName, nearestCity, searchCities } from '../lib/geo.js';
import {
  checkBiography,
  checkBirthDate,
  checkCity,
  checkCoordinate,
  checkEmail,
  checkGender,
  checkName,
  checkPreference,
  checkTags,
  collect,
  requireBody,
} from '../lib/validate.js';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/session.js';
import { publicSelf, summarizeRow } from './serializers.js';

const router = Router();

router.use(requireAuth);

router.get(
  '/profile',
  asyncRoute(async (req, res) => {
    res.json({ user: await publicSelf(req.user) });
  }),
);

router.put(
  '/profile',
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);

    const values = collect({
      firstName: checkName(body.firstName, 'First name'),
      lastName: checkName(body.lastName, 'Last name'),
      email: checkEmail(body.email),
      gender: checkGender(body.gender),
      sexualPreference: checkPreference(body.sexualPreference),
      biography: checkBiography(body.biography),
      birthDate: checkBirthDate(body.birthDate),
      tags: checkTags(Array.isArray(body.tags) ? body.tags : []),
    });

    const taken = await one('SELECT id FROM users WHERE lower(email) = $1 AND id <> $2', [values.email, req.user.id]);
    if (taken) throw conflict('This email address is already used by another account');

    await transaction(async (client) => {
      await client.query(
        `UPDATE users SET first_name = $1, last_name = $2, email = $3, gender = $4,
                          sexual_preference = $5, biography = $6, birth_date = $7,
                          updated_at = now()
          WHERE id = $8`,
        [
          values.firstName,
          values.lastName,
          values.email,
          values.gender,
          values.sexualPreference,
          values.biography || null,
          values.birthDate,
          req.user.id,
        ],
      );

      await client.query('DELETE FROM user_tags WHERE user_id = $1', [req.user.id]);

      for (const tag of values.tags) {
        const { rows } = await client.query(
          `INSERT INTO tags (name) VALUES ($1)
           ON CONFLICT (lower(name)) DO UPDATE SET name = tags.name
           RETURNING id`,
          [tag],
        );
        await client.query('INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
          req.user.id,
          rows[0].id,
        ]);
      }
    });

    await recomputeFame(req.user.id);
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);

    res.json({ user: await publicSelf(user), message: 'Profile updated' });
  }),
);

router.put(
  '/location',
  asyncRoute(async (req, res) => {
    const body = requireBody(req.body);
    const source = body.source === 'gps' ? 'gps' : 'manual';

    let latitude;
    let longitude;
    let city;
    let country;

    if (source === 'gps') {
      const values = collect({
        latitude: checkCoordinate(body.latitude, 'latitude'),
        longitude: checkCoordinate(body.longitude, 'longitude'),
      });
      latitude = values.latitude;
      longitude = values.longitude;
      const nearest = nearestCity(latitude, longitude);
      city = nearest?.city || 'Unknown area';
      country = nearest?.country || null;
    } else {
      const values = collect({ city: checkCity(body.city) });
      const known = findCityByName(values.city);
      if (!known) {
        throw badRequest('Unknown city', {
          city: 'We do not know that city yet. Pick one from the suggestions.',
        });
      }
      city = known.city;
      country = known.country;
      latitude = known.latitude;
      longitude = known.longitude;
    }

    await query(
      `UPDATE users SET latitude = $1, longitude = $2, city = $3, country = $4,
                        location_source = $5, updated_at = now()
        WHERE id = $6`,
      [latitude, longitude, city, country, source, req.user.id],
    );

    await recomputeFame(req.user.id);
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({ user: await publicSelf(user), message: 'Location updated' });
  }),
);

router.get(
  '/visits',
  asyncRoute(async (req, res) => {
    const rows = await many(
      `SELECT DISTINCT ON (u.id) u.id, u.username, u.first_name, u.last_name, u.city, u.country,
              u.fame_rating, u.is_online, u.last_seen, u.gender, u.sexual_preference, u.biography,
              date_part('year', age(u.birth_date))::int AS age,
              p.filename AS photo, v.created_at AS visited_at
         FROM visits v
         JOIN users u ON u.id = v.visitor_id
         LEFT JOIN photos p ON p.id = u.profile_photo_id
        WHERE v.visited_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                OR (b.blocker_id = u.id AND b.blocked_id = $1))
        ORDER BY u.id, v.created_at DESC
        LIMIT 100`,
      [req.user.id],
    );

    const sorted = rows.sort((a, b) => new Date(b.visited_at) - new Date(a.visited_at));
    res.json({ items: sorted.map((row) => ({ ...summarizeRow(row), visitedAt: row.visited_at })) });
  }),
);

router.get(
  '/likes',
  asyncRoute(async (req, res) => {
    const rows = await many(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.city, u.country, u.fame_rating,
              u.is_online, u.last_seen, u.gender, u.sexual_preference, u.biography,
              date_part('year', age(u.birth_date))::int AS age,
              p.filename AS photo, l.created_at AS liked_at,
              EXISTS (SELECT 1 FROM likes l2 WHERE l2.liker_id = $1 AND l2.liked_id = u.id) AS i_liked,
              true AS likes_me
         FROM likes l
         JOIN users u ON u.id = l.liker_id
         LEFT JOIN photos p ON p.id = u.profile_photo_id
        WHERE l.liked_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                OR (b.blocker_id = u.id AND b.blocked_id = $1))
        ORDER BY l.created_at DESC
        LIMIT 100`,
      [req.user.id],
    );

    res.json({ items: rows.map((row) => ({ ...summarizeRow(row), likedAt: row.liked_at })) });
  }),
);

router.get(
  '/matches',
  asyncRoute(async (req, res) => {
    const rows = await many(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.city, u.country, u.fame_rating,
              u.is_online, u.last_seen, u.gender, u.sexual_preference, u.biography,
              date_part('year', age(u.birth_date))::int AS age,
              p.filename AS photo, greatest(l1.created_at, l2.created_at) AS matched_at,
              true AS i_liked, true AS likes_me
         FROM likes l1
         JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
         JOIN users u ON u.id = l1.liked_id
         LEFT JOIN photos p ON p.id = u.profile_photo_id
        WHERE l1.liker_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                OR (b.blocker_id = u.id AND b.blocked_id = $1))
        ORDER BY matched_at DESC`,
      [req.user.id],
    );

    res.json({ items: rows.map((row) => ({ ...summarizeRow(row), matchedAt: row.matched_at })) });
  }),
);

router.get(
  '/blocked',
  asyncRoute(async (req, res) => {
    const rows = await many(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.city, u.country, u.fame_rating,
              u.is_online, u.last_seen, u.gender, u.sexual_preference, u.biography,
              date_part('year', age(u.birth_date))::int AS age, p.filename AS photo,
              b.created_at AS blocked_at
         FROM blocks b
         JOIN users u ON u.id = b.blocked_id
         LEFT JOIN photos p ON p.id = u.profile_photo_id
        WHERE b.blocker_id = $1
        ORDER BY b.created_at DESC`,
      [req.user.id],
    );

    res.json({ items: rows.map((row) => ({ ...summarizeRow(row), blockedAt: row.blocked_at })) });
  }),
);

router.get(
  '/cities',
  asyncRoute(async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '';
    res.json({ items: searchCities(term) });
  }),
);

export default router;
