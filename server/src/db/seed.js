import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { config } from '../config.js';
import { generateAvatarPng } from '../lib/avatar.js';
import { cities } from '../lib/cities.js';
import { recomputeFameForAll } from '../lib/fame.js';
import { hashPassword } from '../lib/password.js';
import { pool, query, transaction } from './pool.js';
import {
  bioEndings,
  bioMiddles,
  bioOpenings,
  conversationReplies,
  conversationStarters,
  femaleFirstNames,
  lastNames,
  maleFirstNames,
  neutralFirstNames,
} from './seed-data.js';

let state = 987654321;

function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return ((state >>> 0) % 1000000) / 1000000;
}

const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + Math.floor(random() * (max - min + 1));

function buildBiography() {
  const parts = [pick(bioOpenings), pick(bioMiddles), pick(bioEndings)].filter(Boolean);
  return parts.join(' ');
}

function birthDateForAge(age) {
  const now = new Date();
  const year = now.getUTCFullYear() - age;
  const month = between(1, 12);
  const day = between(1, 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function jitter(value, spread) {
  return value + (random() - 0.5) * spread;
}

async function loadTagIds() {
  const { rows } = await query('SELECT id, name FROM tags ORDER BY id');
  return rows;
}

function buildUsers(total) {
  const users = [];
  const usernames = new Set();

  for (let i = 0; i < total; i += 1) {
    const roll = random();
    const gender = roll < 0.47 ? 'female' : roll < 0.94 ? 'male' : 'other';
    const firstName =
      gender === 'female' ? pick(femaleFirstNames) : gender === 'male' ? pick(maleFirstNames) : pick(neutralFirstNames);
    const lastName = pick(lastNames);

    let username = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z]/g, '');
    let suffix = 1;
    while (usernames.has(username)) {
      suffix += 1;
      username = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z]/g, '') + suffix;
    }
    usernames.add(username);

    const preferenceRoll = random();
    const sexualPreference =
      preferenceRoll < 0.72 ? 'heterosexual' : preferenceRoll < 0.88 ? 'bisexual' : 'homosexual';

    const home = pick(cities);
    const lastSeenHoursAgo = random() < 0.25 ? between(0, 3) : between(4, 720);

    users.push({
      email: `${username}@matcha.local`,
      username,
      firstName,
      lastName,
      gender,
      sexualPreference,
      biography: buildBiography(),
      birthDate: birthDateForAge(between(18, 48)),
      latitude: jitter(home.latitude, 0.14),
      longitude: jitter(home.longitude, 0.14),
      city: home.city,
      country: home.country,
      photoCount: between(1, 5),
      lastSeenHoursAgo,
    });
  }

  return users;
}

const DEMO_ACCOUNTS = [
  {
    email: 'demo@matcha.local',
    username: 'demo',
    firstName: 'Demo',
    lastName: 'Account',
    gender: 'female',
    sexualPreference: 'bisexual',
    biography:
      'Demo account used for the evaluation. Everything on this profile can be edited from the settings page.',
    birthDate: birthDateForAge(27),
    city: 'Paris',
    country: 'France',
    latitude: 48.8566,
    longitude: 2.3522,
    photoCount: 3,
    lastSeenHoursAgo: 0,
  },
  {
    email: 'demo2@matcha.local',
    username: 'demo2',
    firstName: 'Sam',
    lastName: 'Rivera',
    gender: 'male',
    sexualPreference: 'bisexual',
    biography: 'Second demo account, already connected with demo so the chat has history.',
    birthDate: birthDateForAge(30),
    city: 'Paris',
    country: 'France',
    latitude: 48.8606,
    longitude: 2.3376,
    photoCount: 2,
    lastSeenHoursAgo: 1,
  },
];

async function insertUsers(records, passwordHash) {
  const ids = [];
  const chunkSize = 50;

  for (let start = 0; start < records.length; start += chunkSize) {
    const slice = records.slice(start, start + chunkSize);
    const values = [];
    const placeholders = [];

    slice.forEach((user, index) => {
      const base = index * 14;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7},` +
          ` $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, true,` +
          ` now() - ($${base + 14} || ' hours')::interval)`,
      );
      values.push(
        user.email,
        user.username,
        user.firstName,
        user.lastName,
        passwordHash,
        user.gender,
        user.sexualPreference,
        user.biography,
        user.birthDate,
        user.latitude,
        user.longitude,
        user.city,
        user.country,
        String(user.lastSeenHoursAgo),
      );
    });

    const { rows } = await query(
      `INSERT INTO users
         (email, username, first_name, last_name, password_hash, gender, sexual_preference,
          biography, birth_date, latitude, longitude, city, country, is_verified, last_seen)
       VALUES ${placeholders.join(', ')}
       RETURNING id`,
      values,
    );
    ids.push(...rows.map((row) => row.id));
  }

  await query("UPDATE users SET location_source = 'manual' WHERE location_source IS NULL");
  return ids;
}

async function insertTags(userIds, tagRows) {
  const pairs = [];
  for (const userId of userIds) {
    const count = between(2, 7);
    const chosen = new Set();
    while (chosen.size < count) chosen.add(pick(tagRows).id);
    for (const tagId of chosen) pairs.push([userId, tagId]);
  }

  const chunkSize = 500;
  for (let start = 0; start < pairs.length; start += chunkSize) {
    const slice = pairs.slice(start, start + chunkSize);
    const values = slice.flat();
    const placeholders = slice.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`);
    await query(
      `INSERT INTO user_tags (user_id, tag_id) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    );
  }
}

async function insertPhotos(userIds, records) {
  await mkdir(config.uploads.dir, { recursive: true });

  for (let index = 0; index < userIds.length; index += 1) {
    const userId = userIds[index];
    const count = records[index].photoCount;
    const inserted = [];

    for (let n = 0; n < count; n += 1) {
      const buffer = generateAvatarPng(`${records[index].username}-${n}`);
      const filename = `${randomUUID()}.png`;
      await writeFile(join(config.uploads.dir, filename), buffer);
      const { rows } = await query(
        `INSERT INTO photos (user_id, filename, mime_type, byte_size)
         VALUES ($1, $2, 'image/png', $3) RETURNING id`,
        [userId, filename, buffer.length],
      );
      inserted.push(rows[0].id);
    }

    await query('UPDATE users SET profile_photo_id = $1 WHERE id = $2', [inserted[0], userId]);
  }
}

async function insertInteractions(userIds) {
  const likes = new Set();
  const visits = [];

  for (const userId of userIds) {
    const likeCount = between(0, 12);
    for (let n = 0; n < likeCount; n += 1) {
      const target = pick(userIds);
      if (target !== userId) likes.add(`${userId}:${target}`);
    }

    const visitCount = between(0, 10);
    for (let n = 0; n < visitCount; n += 1) {
      const target = pick(userIds);
      if (target !== userId) visits.push([userId, target, between(1, 600)]);
    }
  }

  for (const entry of [...likes]) {
    if (random() < 0.28) {
      const [liker, liked] = entry.split(':');
      likes.add(`${liked}:${liker}`);
    }
  }

  const likeRows = [...likes].map((entry) => entry.split(':').map(Number));

  for (let start = 0; start < likeRows.length; start += 500) {
    const slice = likeRows.slice(start, start + 500);
    const values = slice.flat();
    const placeholders = slice.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`);
    await query(
      `INSERT INTO likes (liker_id, liked_id) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    );
  }

  for (let start = 0; start < visits.length; start += 400) {
    const slice = visits.slice(start, start + 400);
    const values = slice.flat();
    const placeholders = slice.map(
      (_, index) => `($${index * 3 + 1}, $${index * 3 + 2}, now() - ($${index * 3 + 3} || ' hours')::interval)`,
    );
    await query(
      `INSERT INTO visits (visitor_id, visited_id, created_at) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  return likeRows.length;
}

async function seedConversations() {
  const { rows: matches } = await query(
    `SELECT l1.liker_id AS a, l1.liked_id AS b
       FROM likes l1
       JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
      WHERE l1.liker_id < l1.liked_id
      LIMIT 250`,
  );

  for (const match of matches) {
    const turns = between(1, 4);
    for (let turn = 0; turn < turns; turn += 1) {
      const fromA = turn % 2 === 0;
      const body = fromA ? pick(conversationStarters) : pick(conversationReplies);
      await query(
        `INSERT INTO messages (sender_id, recipient_id, body, created_at, read_at)
         VALUES ($1, $2, $3, now() - ($4 || ' hours')::interval, now())`,
        [fromA ? match.a : match.b, fromA ? match.b : match.a, body, String(between(1, 200))],
      );
    }
  }

  return matches.length;
}

async function connectDemoAccounts(demoIds, poolIds) {
  const [demo, demo2] = demoIds;

  await query('INSERT INTO likes (liker_id, liked_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING', [
    demo,
    demo2,
  ]);

  await query(
    `INSERT INTO messages (sender_id, recipient_id, body, created_at, read_at)
     VALUES ($1, $2, 'Hey, glad we matched. Coffee this week?', now() - interval '2 hours', now()),
            ($2, $1, 'Definitely. Thursday afternoon works for me.', now() - interval '1 hour', now())`,
    [demo2, demo],
  );

  const admirers = poolIds.slice(0, 6);
  for (const admirer of admirers) {
    await query('INSERT INTO likes (liker_id, liked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [admirer, demo]);
    await query('INSERT INTO visits (visitor_id, visited_id) VALUES ($1, $2)', [admirer, demo]);
    await query('INSERT INTO notifications (user_id, actor_id, type) VALUES ($1, $2, $3)', [demo, admirer, 'like']);
  }
}

async function main() {
  const total = Math.max(500, config.seed.users);
  console.log(`Seeding ${total} profiles plus ${DEMO_ACCOUNTS.length} demo accounts...`);

  await transaction(async (client) => {
    await client.query('TRUNCATE users RESTART IDENTITY CASCADE');
  });

  const passwordHash = await hashPassword(config.seed.password);
  const tagRows = await loadTagIds();
  if (tagRows.length === 0) throw new Error('No tags found. Run the migration first.');

  const generated = buildUsers(total);
  const records = [...DEMO_ACCOUNTS, ...generated];

  console.log('  inserting users...');
  const ids = await insertUsers(records, passwordHash);

  console.log('  attaching interests...');
  await insertTags(ids, tagRows);

  console.log('  generating photos...');
  await insertPhotos(ids, records);

  console.log('  generating likes and visits...');
  const likeCount = await insertInteractions(ids);

  console.log('  generating conversations...');
  const matchCount = await seedConversations();

  await connectDemoAccounts(ids.slice(0, 2), ids.slice(2));

  console.log('  computing fame ratings...');
  await recomputeFameForAll();

  const { rows } = await query('SELECT count(*)::int AS total FROM users');
  console.log('');
  console.log(`Done: ${rows[0].total} profiles, ${likeCount} likes, ${matchCount} conversations.`);
  console.log(`Sign in with  demo / ${config.seed.password}`);
  console.log(`          or  demo2 / ${config.seed.password}`);
  console.log('Every generated profile uses its username with the same password.');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(`Seeding failed: ${error.message}`);
    await pool.end();
    process.exit(1);
  });
