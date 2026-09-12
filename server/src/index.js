import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config, projectRoot } from './config.js';
import { pool, query } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { loadSession, verifyCsrf } from './middleware/session.js';
import { attachRealtime } from './realtime/hub.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import discoveryRoutes from './routes/discovery.js';
import meRoutes from './routes/me.js';
import meetupRoutes from './routes/meetups.js';
import notificationRoutes from './routes/notifications.js';
import oauthRoutes from './routes/oauth.js';
import photoRoutes from './routes/photos.js';
import tagRoutes from './routes/tags.js';
import userRoutes from './routes/users.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.tile.openstreetmap.org'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'same-origin' },
  }),
);

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use(loadSession);
app.use('/api', verifyCsrf);

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'database unavailable' });
  }
});

app.use('/api/auth/oauth', oauthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/me/photos', photoRoutes);
app.use('/api/me', meRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/meetups', meetupRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api', discoveryRoutes);

app.use(
  '/uploads',
  express.static(config.uploads.dir, {
    dotfiles: 'deny',
    index: false,
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
    },
  }),
);

const clientDist = resolve(projectRoot, 'client/dist');

if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api|\/uploads|\/ws).*/, (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use('/api', notFoundHandler);
app.use(errorHandler);

const server = createServer(app);
attachRealtime(server);

async function start() {
  await mkdir(config.uploads.dir, { recursive: true });

  try {
    await query('UPDATE users SET is_online = false WHERE is_online = true');
  } catch (error) {
    console.error(`Could not reach the database: ${error.message}`);
    console.error('Run "make db" and "make migrate" first.');
    process.exit(1);
  }

  server.listen(config.port, () => {
    console.log(`Matcha API listening on http://localhost:${config.port} (${config.env})`);
    if (existsSync(clientDist)) console.log(`Serving the built client from ${clientDist}`);
  });
}

const cleanupInterval = setInterval(() => {
  query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
  query("DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'").catch(() => {});
}, 60 * 60 * 1000);
cleanupInterval.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log('\nShutting down...');
    server.close();
    await query('UPDATE users SET is_online = false').catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  });
}

start();
