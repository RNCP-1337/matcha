import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
export const serverRoot = resolve(here, '..');
export const projectRoot = resolve(serverRoot, '..');

dotenv.config({ path: resolve(projectRoot, '.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing environment variable ${name}. Run "make env" and edit .env.`);
  }
  return value;
}

const uploadDir = process.env.UPLOAD_DIR || 'uploads';

export const config = {
  env: process.env.NODE_ENV || 'development',
  get isProduction() {
    return this.env === 'production';
  },
  port: Number(process.env.PORT || 4000),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, ''),
  db: {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5455),
    user: process.env.PGUSER || 'matcha',
    password: process.env.PGPASSWORD || 'matcha',
    database: process.env.PGDATABASE || 'matcha',
    max: Number(process.env.PGPOOL_MAX || 10),
  },
  sessionSecret: required('SESSION_SECRET', 'insecure-development-secret-change-me'),
  tokenPepper: required('TOKEN_PEPPER', 'insecure-development-pepper-change-me'),
  sessionTtlDays: 14,
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 1085),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.MAIL_FROM || 'Matcha <no-reply@matcha.local>',
    spoolDir: resolve(serverRoot, 'tmp/mail'),
    uiPort: Number(process.env.MAILUI_PORT || 8085),
  },
  uploads: {
    dir: isAbsolute(uploadDir) ? uploadDir : resolve(serverRoot, uploadDir),
    maxBytes: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
    maxPerUser: 5,
  },
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    mock: {
      clientId: process.env.OAUTH_MOCK_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_MOCK_CLIENT_SECRET || '',
      baseUrl: process.env.OAUTH_MOCK_BASE_URL || '',
    },
  },
  seed: {
    users: Number(process.env.SEED_USERS || 520),
    password: process.env.SEED_PASSWORD || 'Matcha!2024seed',
  },
};
