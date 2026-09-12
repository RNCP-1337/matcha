import { WebSocketServer } from 'ws';
import { one, query } from '../db/pool.js';
import { hashToken, safeEquals, unsign } from '../lib/tokens.js';

const connections = new Map();

function parseCookies(header) {
  const jar = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    jar[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

async function authenticate(request) {
  const cookies = parseCookies(request.headers.cookie);
  const value = unsign(cookies.matcha_sid);
  if (!value) return null;

  const [id, token] = value.split(':');
  if (!id || !token) return null;

  const row = await one(
    `SELECT s.token_hash, s.expires_at, u.id, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [id],
  );

  if (!row || new Date(row.expires_at) < new Date()) return null;
  if (!safeEquals(row.token_hash, hashToken(token))) return null;
  return { id: row.id, username: row.username };
}

const SIGNAL_TYPES = new Set(['call:offer', 'call:answer', 'call:ice', 'call:end', 'call:decline', 'call:busy']);
const MAX_FRAME_BYTES = 64 * 1024;

async function areConnected(a, b) {
  const row = await one(
    `SELECT 1 AS ok
       FROM likes l1
       JOIN likes l2 ON l2.liker_id = l1.liked_id AND l2.liked_id = l1.liker_id
      WHERE l1.liker_id = $1 AND l1.liked_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM blocks
           WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1))`,
    [a, b],
  );
  return Boolean(row);
}

async function setPresence(userId, isOnline) {
  await query('UPDATE users SET is_online = $2, last_seen = now() WHERE id = $1', [userId, isOnline]);
}

export function sendToUser(userId, payload) {
  const sockets = connections.get(userId);
  if (!sockets) return false;

  const message = JSON.stringify(payload);
  let delivered = false;
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
      delivered = true;
    }
  }
  return delivered;
}

export function isConnected(userId) {
  const sockets = connections.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }

      const user = await authenticate(request);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.userId = user.id;
        ws.isAlive = true;
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws) => {
    if (!connections.has(ws.userId)) connections.set(ws.userId, new Set());
    connections.get(ws.userId).add(ws);

    if (connections.get(ws.userId).size === 1) {
      await setPresence(ws.userId, true).catch(() => {});
    }

    ws.send(JSON.stringify({ type: 'ready' }));

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.allowedPeers = new Set();

    ws.on('message', async (data) => {
      if (data.length > MAX_FRAME_BYTES) return;

      let payload;
      try {
        payload = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (payload.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (!SIGNAL_TYPES.has(payload.type)) return;

      const peerId = Number.parseInt(payload.to, 10);
      if (!Number.isInteger(peerId) || peerId === ws.userId) return;

      if (!ws.allowedPeers.has(peerId)) {
        if (!(await areConnected(ws.userId, peerId))) {
          ws.send(JSON.stringify({ type: 'call:refused', reason: 'You are not connected with this member' }));
          return;
        }
        ws.allowedPeers.add(peerId);
      }

      const relayed = sendToUser(peerId, {
        type: payload.type,
        from: ws.userId,
        sdp: payload.sdp ?? null,
        candidate: payload.candidate ?? null,
        media: payload.media === 'audio' ? 'audio' : 'video',
      });

      if (!relayed && payload.type === 'call:offer') {
        ws.send(JSON.stringify({ type: 'call:unavailable', to: peerId }));
      }
    });

    ws.on('close', async () => {
      const sockets = connections.get(ws.userId);
      if (!sockets) return;
      sockets.delete(ws);
      if (sockets.size === 0) {
        connections.delete(ws.userId);
        await setPresence(ws.userId, false).catch(() => {});
      }
    });

    ws.on('error', () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  return wss;
}
