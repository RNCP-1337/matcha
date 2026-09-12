import pg from 'pg';
import { config } from '../config.js';

pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool(config.db);

pool.on('error', (error) => {
  console.error('[db] idle client error:', error.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

export async function many(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function transaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
