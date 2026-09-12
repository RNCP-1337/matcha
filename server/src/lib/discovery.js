import { enumParam, intParam } from './validate.js';

export const SORT_FIELDS = ['relevance', 'age', 'distance', 'fame', 'tags'];
export const SORT_DIRECTIONS = ['asc', 'desc'];

export function parseDiscoveryParams(rawQuery, { defaultSort }) {
  const tags = String(rawQuery.tags || '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
    .filter((tag) => /^[a-z0-9]{2,24}$/.test(tag))
    .slice(0, 10);

  return {
    ageMin: intParam(rawQuery.ageMin, { min: 18, max: 120, fallback: null }),
    ageMax: intParam(rawQuery.ageMax, { min: 18, max: 120, fallback: null }),
    fameMin: intParam(rawQuery.fameMin, { min: 0, max: 100, fallback: null }),
    fameMax: intParam(rawQuery.fameMax, { min: 0, max: 100, fallback: null }),
    maxDistance: intParam(rawQuery.maxDistance, { min: 1, max: 20000, fallback: null }),
    city: typeof rawQuery.city === 'string' ? rawQuery.city.trim().slice(0, 80) : '',
    tags,
    sort: enumParam(rawQuery.sort, SORT_FIELDS, defaultSort),
    direction: enumParam(rawQuery.direction, SORT_DIRECTIONS, 'desc'),
    limit: intParam(rawQuery.limit, { min: 1, max: 60, fallback: 24 }),
    offset: intParam(rawQuery.offset, { min: 0, max: 10000, fallback: 0 }),
  };
}

export function buildDiscoveryQuery(viewer, params, { requireCompatibility }) {
  const values = [];
  const push = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  const viewerId = `${push(viewer.id)}::int`;
  const viewerLat = `${push(viewer.latitude ?? 0)}::float8`;
  const viewerLon = `${push(viewer.longitude ?? 0)}::float8`;

  const distanceExpr = `
    (6371 * acos(least(1, greatest(-1,
      cos(radians(${viewerLat})) * cos(radians(u.latitude)) *
      cos(radians(u.longitude) - radians(${viewerLon})) +
      sin(radians(${viewerLat})) * sin(radians(u.latitude))
    ))))`;

  const conditions = [
    `u.id <> ${viewerId}`,
    'u.is_verified = true',
    'u.gender IS NOT NULL',
    'u.birth_date IS NOT NULL',
    'u.latitude IS NOT NULL',
    `NOT EXISTS (
       SELECT 1 FROM blocks b
        WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = u.id)
           OR (b.blocker_id = u.id AND b.blocked_id = ${viewerId})
     )`,
  ];

  if (requireCompatibility) {
    const viewerGender = `${push(viewer.gender)}::text`;
    const viewerPreference = `${push(viewer.sexual_preference)}::text`;

    conditions.push(`
      CASE ${viewerPreference}
        WHEN 'heterosexual' THEN u.gender <> ${viewerGender}
        WHEN 'homosexual' THEN u.gender = ${viewerGender}
        ELSE true
      END`);
    conditions.push(`
      CASE u.sexual_preference
        WHEN 'heterosexual' THEN u.gender <> ${viewerGender}
        WHEN 'homosexual' THEN u.gender = ${viewerGender}
        ELSE true
      END`);
  }

  if (params.ageMin !== null) {
    conditions.push(`u.birth_date <= (current_date - (${push(params.ageMin)}::int || ' years')::interval)`);
  }
  if (params.ageMax !== null) {
    conditions.push(`u.birth_date > (current_date - ((${push(params.ageMax)}::int + 1) || ' years')::interval)`);
  }
  if (params.fameMin !== null) conditions.push(`u.fame_rating >= ${push(params.fameMin)}::int`);
  if (params.fameMax !== null) conditions.push(`u.fame_rating <= ${push(params.fameMax)}::int`);
  if (params.city) conditions.push(`u.city ILIKE ${push(`%${params.city}%`)}::text`);
  if (params.maxDistance !== null) conditions.push(`${distanceExpr} <= ${push(params.maxDistance)}::int`);

  if (params.tags.length > 0) {
    const tagsParam = push(params.tags);
    conditions.push(`
      EXISTS (
        SELECT 1 FROM user_tags ut
          JOIN tags t ON t.id = ut.tag_id
         WHERE ut.user_id = u.id AND lower(t.name) = ANY(${tagsParam}::text[])
      )`);
  }

  const orderColumn = {
    relevance: 'score',
    age: 'age',
    distance: 'distance_km',
    fame: 'fame_rating',
    tags: 'common_tags',
  }[params.sort];

  const direction = params.direction === 'asc' ? 'ASC' : 'DESC';
  const limit = push(params.limit);
  const offset = push(params.offset);

  const text = `
    WITH viewer_tags AS (
      SELECT tag_id FROM user_tags WHERE user_id = ${viewerId}
    ),
    candidates AS (
      SELECT
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.gender,
        u.sexual_preference,
        u.biography,
        u.city,
        u.country,
        u.fame_rating,
        u.latitude,
        u.longitude,
        u.is_online,
        u.last_seen,
        date_part('year', age(u.birth_date))::int AS age,
        p.filename AS photo,
        ${distanceExpr} AS distance_km,
        (SELECT count(*) FROM user_tags ut
          WHERE ut.user_id = u.id AND ut.tag_id IN (SELECT tag_id FROM viewer_tags))::int AS common_tags,
        EXISTS (SELECT 1 FROM likes l WHERE l.liker_id = ${viewerId} AND l.liked_id = u.id) AS i_liked,
        EXISTS (SELECT 1 FROM likes l WHERE l.liker_id = u.id AND l.liked_id = ${viewerId}) AS likes_me
      FROM users u
      LEFT JOIN photos p ON p.id = u.profile_photo_id
      WHERE ${conditions.join('\n        AND ')}
    ),
    scored AS (
      SELECT c.*,
        (
          greatest(0, 100 - least(100, c.distance_km)) * 0.45
          + c.common_tags * 9
          + c.fame_rating * 0.4
          + CASE WHEN c.likes_me THEN 12 ELSE 0 END
        )::numeric(8,2) AS score
      FROM candidates c
    )
    SELECT *, count(*) OVER () AS total_count
      FROM scored
     ORDER BY ${orderColumn} ${direction} NULLS LAST, id ASC
     LIMIT ${limit}::int OFFSET ${offset}::int`;

  return { text, values };
}
