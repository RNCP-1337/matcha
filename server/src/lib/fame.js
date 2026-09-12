import { query } from '../db/pool.js';

export async function recomputeFame(userId) {
  const { rows } = await query(
    `WITH stats AS (
       SELECT
         (SELECT count(*) FROM likes WHERE liked_id = $1)                          AS likes_received,
         (SELECT count(*) FROM likes l1
            JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
           WHERE l1.liker_id = $1)                                                 AS matches,
         (SELECT count(DISTINCT visitor_id) FROM visits WHERE visited_id = $1)     AS visitors,
         (SELECT count(*) FROM reports WHERE reported_id = $1)                     AS reports,
         (SELECT count(*) FROM blocks WHERE blocked_id = $1)                       AS blocks,
         (SELECT count(*) FROM photos WHERE user_id = $1)                          AS photos,
         (SELECT count(*) FROM user_tags WHERE user_id = $1)                       AS tags,
         (SELECT (biography IS NOT NULL AND length(biography) > 20)::int
            + (gender IS NOT NULL)::int
            + (profile_photo_id IS NOT NULL)::int
            + (city IS NOT NULL)::int
          FROM users WHERE id = $1)                                                AS completeness
     )
     UPDATE users SET fame_rating = greatest(0, least(100, (
         least(40, likes_received * 4)
       + least(25, matches * 5)
       + least(15, visitors)
       + least(10, photos * 2 + tags)
       + completeness * 2.5
       - reports * 10
       - blocks * 5
     )::int)), updated_at = now()
     FROM stats
     WHERE users.id = $1
     RETURNING users.fame_rating`,
    [userId],
  );
  return rows[0]?.fame_rating ?? 0;
}

export async function recomputeFameForAll() {
  await query(
    `WITH stats AS (
       SELECT u.id,
         (SELECT count(*) FROM likes WHERE liked_id = u.id)                        AS likes_received,
         (SELECT count(*) FROM likes l1
            JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
           WHERE l1.liker_id = u.id)                                               AS matches,
         (SELECT count(DISTINCT visitor_id) FROM visits WHERE visited_id = u.id)   AS visitors,
         (SELECT count(*) FROM reports WHERE reported_id = u.id)                   AS reports,
         (SELECT count(*) FROM blocks WHERE blocked_id = u.id)                     AS blocks,
         (SELECT count(*) FROM photos WHERE user_id = u.id)                        AS photos,
         (SELECT count(*) FROM user_tags WHERE user_id = u.id)                     AS tags,
         (u.biography IS NOT NULL AND length(u.biography) > 20)::int
           + (u.gender IS NOT NULL)::int
           + (u.profile_photo_id IS NOT NULL)::int
           + (u.city IS NOT NULL)::int                                             AS completeness
       FROM users u
     )
     UPDATE users SET fame_rating = greatest(0, least(100, (
         least(40, stats.likes_received * 4)
       + least(25, stats.matches * 5)
       + least(15, stats.visitors)
       + least(10, stats.photos * 2 + stats.tags)
       + stats.completeness * 2.5
       - stats.reports * 10
       - stats.blocks * 5
     )::int))
     FROM stats WHERE users.id = stats.id`,
  );
}
