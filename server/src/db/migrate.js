import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));

const DEFAULT_TAGS = [
  'vegan', 'geek', 'piercing', 'tattoo', 'travel', 'coffee', 'music', 'cinema', 'running',
  'climbing', 'cooking', 'photography', 'gaming', 'hiking', 'yoga', 'reading', 'art',
  'dancing', 'football', 'basketball', 'surfing', 'skiing', 'cycling', 'jazz', 'techno',
  'rock', 'metal', 'poetry', 'theatre', 'startup', 'science', 'astronomy', 'chess',
  'gardening', 'volunteering', 'languages', 'dogs', 'cats', 'wine', 'beer', 'sushi',
  'roadtrip', 'camping', 'diving', 'painting', 'podcasts', 'boardgames', 'fashion',
  'meditation', 'karaoke',
];

async function waitForDatabase(attempts = 30) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await query('SELECT 1');
      return;
    } catch (error) {
      if (i === attempts) throw error;
      process.stdout.write(`\rWaiting for PostgreSQL (${i}/${attempts})...`);
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
}

async function dropEverything() {
  await query('DROP SCHEMA public CASCADE');
  await query('CREATE SCHEMA public');
  console.log('Dropped existing schema.');
}

async function main() {
  const shouldDrop = process.argv.includes('--drop');

  await waitForDatabase();
  process.stdout.write('\r');

  if (shouldDrop) await dropEverything();

  const sql = await readFile(resolve(here, 'schema.sql'), 'utf8');
  await query(sql);

  for (const tag of DEFAULT_TAGS) {
    await query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT DO NOTHING', [tag]);
  }

  await query('INSERT INTO schema_version (version) VALUES (2) ON CONFLICT DO NOTHING');

  const { rows } = await query('SELECT count(*)::int AS total FROM users');
  console.log(`Schema ready. ${rows[0].total} user(s) in the database.`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(`Migration failed: ${error.message}`);
    await pool.end();
    process.exit(1);
  });
