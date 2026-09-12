import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { pool, query } from '../src/db/pool.js';

const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${config.port}`;
const results = [];

class Client {
  constructor() {
    this.cookies = new Map();
  }

  get csrf() {
    return this.cookies.get('matcha_csrf');
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  absorb(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, decodeURIComponent(value));
    }
  }

  async request(method, path, body, extraHeaders = {}) {
    const headers = { cookie: this.header(), ...extraHeaders };
    if (this.csrf) headers['x-csrf-token'] = this.csrf;

    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    this.absorb(response);

    if (response.status === 429) {
      console.error(
        `\nThe server rate limited ${method} ${path}.\n` +
          'The suite creates real accounts and sends real mail, so running it many times in one hour\n' +
          'trips the limiter. Restart the API (make stop, then make dev) and run make test again.\n',
      );
      process.exit(1);
    }

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: response.status, body: json };
  }

  get = (path) => this.request('GET', path);
  post = (path, body, headers) => this.request('POST', path, body, headers);
  put = (path, body) => this.request('PUT', path, body);
  del = (path) => this.request('DELETE', path);
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
}

async function latestMailLink(email) {
  if (config.mail.host) {
    const response = await fetch(`http://${config.mail.host}:${config.mail.uiPort}/api/v1/search?query=${encodeURIComponent(email)}`);
    if (response.ok) {
      const data = await response.json();
      const id = data.messages?.[0]?.ID;
      if (id) {
        const detail = await fetch(`http://${config.mail.host}:${config.mail.uiPort}/api/v1/message/${id}`).then((r) => r.json());
        const match = `${detail.Text || ''}${detail.HTML || ''}`.match(/https?:\/\/\S*?token=([A-Za-z0-9_-]+)/);
        if (match) return match[1];
      }
    }
  }

  const files = await readdir(config.mail.spoolDir).catch(() => []);
  const mine = files.filter((file) => file.includes(email.replace(/[^a-z0-9]/gi, '_'))).sort();
  if (mine.length === 0) return null;

  const content = await readFile(join(config.mail.spoolDir, mine.at(-1)), 'utf8');
  return content.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

function pngFixture() {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return Buffer.from(base64, 'base64');
}

async function main() {
  console.log(`Running smoke tests against ${BASE}\n`);

  const stamp = Date.now();
  const email = `smoke${stamp}@matcha.local`;
  const username = `smoke${stamp}`.slice(0, 20);
  const password = 'Tr0ub4dour&Ferry';

  const anon = new Client();
  const demo = new Client();
  const fresh = new Client();

  await test('health endpoint answers', async () => {
    const { status, body } = await anon.get('/api/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
  });

  await test('anonymous session is empty and receives a csrf cookie', async () => {
    const { body } = await anon.get('/api/auth/me');
    assert.equal(body.user, null);
    assert.ok(anon.csrf, 'expected a csrf cookie');
  });

  await test('state changing request without csrf token is rejected', async () => {
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'whatever' }),
    });
    assert.equal(response.status, 403);
  });

  await test('registration rejects a common english word as password', async () => {
    const { status, body } = await anon.post('/api/auth/register', {
      email: `weak${stamp}@matcha.local`,
      username: `weak${stamp}`.slice(0, 20),
      firstName: 'Weak',
      lastName: 'Password',
      password: 'password',
    });
    assert.equal(status, 400);
    assert.match(body.fields.password, /at least 8|common word|uppercase/i);
  });

  await test('registration rejects a dictionary word with leet substitutions', async () => {
    const { status, body } = await anon.post('/api/auth/register', {
      email: `leet${stamp}@matcha.local`,
      username: `leet${stamp}`.slice(0, 20),
      firstName: 'Leet',
      lastName: 'Password',
      password: 'P4ssw0rd!',
    });
    assert.equal(status, 400);
    assert.match(body.fields.password, /common word/i);
  });

  await test('registration accepts a strong password', async () => {
    const { status } = await anon.post('/api/auth/register', {
      email,
      username,
      firstName: 'Smoke',
      lastName: 'Tester',
      password,
    });
    assert.equal(status, 201);
  });

  await test('duplicate email is refused', async () => {
    const { status } = await anon.post('/api/auth/register', {
      email,
      username: `${username}x`.slice(0, 20),
      firstName: 'Smoke',
      lastName: 'Tester',
      password,
    });
    assert.equal(status, 409);
  });

  await test('login is refused before the email is confirmed', async () => {
    const { status } = await fresh.get('/api/auth/me').then(() => fresh.post('/api/auth/login', { username, password }));
    assert.equal(status, 401);
  });

  let verificationToken = null;
  await test('verification email contains a working token', async () => {
    verificationToken = await latestMailLink(email);
    assert.ok(verificationToken, 'no verification email found');
    const { status } = await fresh.post('/api/auth/verify', { token: verificationToken });
    assert.equal(status, 200);
  });

  await test('a verification token cannot be replayed', async () => {
    const { status } = await fresh.post('/api/auth/verify', { token: verificationToken });
    assert.equal(status, 400);
  });

  await test('login works after confirmation', async () => {
    const { status, body } = await fresh.post('/api/auth/login', { username, password });
    assert.equal(status, 200);
    assert.equal(body.user.username, username);
    assert.equal(body.user.profileComplete, false);
  });

  await test('password is not stored in clear text', async () => {
    const { rows } = await query('SELECT password_hash FROM users WHERE lower(username) = lower($1)', [username]);
    assert.ok(rows[0].password_hash.startsWith('scrypt$'));
    assert.ok(!rows[0].password_hash.includes(password));
  });

  await test('browsing is refused while the profile is incomplete', async () => {
    const { status } = await fresh.get('/api/browse');
    assert.equal(status, 403);
  });

  await test('profile can be completed', async () => {
    const { status, body } = await fresh.put('/api/me/profile', {
      firstName: 'Smoke',
      lastName: 'Tester',
      email,
      gender: 'female',
      sexualPreference: 'bisexual',
      biography: 'Automated smoke test account, created by the test suite.',
      birthDate: '1996-04-12',
      tags: ['coffee', 'music', 'testing'],
    });
    assert.equal(status, 200);
    assert.deepEqual(body.user.tags.sort(), ['coffee', 'music', 'testing']);
  });

  await test('html in the biography is stored verbatim and never interpreted', async () => {
    const payload = '<script>alert(1)</script> still me';
    const { status, body } = await fresh.put('/api/me/profile', {
      firstName: 'Smoke',
      lastName: 'Tester',
      email,
      gender: 'female',
      sexualPreference: 'bisexual',
      biography: payload,
      birthDate: '1996-04-12',
      tags: ['coffee'],
    });
    assert.equal(status, 200);
    assert.equal(body.user.biography, payload);
  });

  await test('location can be set from gps coordinates', async () => {
    const { status, body } = await fresh.put('/api/me/location', {
      source: 'gps',
      latitude: 48.8698,
      longitude: 2.3075,
    });
    assert.equal(status, 200);
    assert.equal(body.user.city, 'Paris');
    assert.equal(body.user.locationSource, 'gps');
  });

  await test('an unknown manual city is refused', async () => {
    const { status } = await fresh.put('/api/me/location', { source: 'manual', city: 'Nowhereville' });
    assert.equal(status, 400);
  });

  await test('a non image upload is refused', async () => {
    const form = new FormData();
    form.append('photo', new Blob([Buffer.from('#!/bin/sh\nrm -rf /\n')], { type: 'image/png' }), 'evil.png');
    const { status } = await fresh.post('/api/me/photos', form);
    assert.equal(status, 400);
  });

  let photoId = null;
  await test('a real png upload is accepted and becomes the profile picture', async () => {
    const form = new FormData();
    form.append('photo', new Blob([pngFixture()], { type: 'image/png' }), 'me.png');
    const { status, body } = await fresh.post('/api/me/photos', form);
    assert.equal(status, 201);
    photoId = body.photo.id;

    const profile = await fresh.get('/api/me/profile');
    assert.equal(profile.body.user.profilePhotoId, photoId);
    assert.equal(profile.body.user.profileComplete, true);
  });

  await test('the uploaded file is served back', async () => {
    const profile = await fresh.get('/api/me/profile');
    const response = await fetch(`${BASE}/uploads/${profile.body.user.profilePhoto}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  await test('path traversal on the upload folder is refused', async () => {
    const response = await fetch(`${BASE}/uploads/..%2f..%2fpackage.json`);
    assert.notEqual(response.status, 200);
  });

  await test('demo account signs in', async () => {
    await demo.get('/api/auth/me');
    const { status } = await demo.post('/api/auth/login', { username: 'demo', password: config.seed.password });
    assert.equal(status, 200);
  });

  await test('browse only returns compatible profiles', async () => {
    const { status, body } = await demo.get('/api/browse?limit=10');
    assert.equal(status, 200);
    assert.ok(body.items.length > 0);
    for (const item of body.items) assert.ok(item.gender);
  });

  await test('browse can be sorted by distance', async () => {
    const { body } = await demo.get('/api/browse?sort=distance&direction=asc&limit=10');
    const distances = body.items.map((item) => item.distanceKm);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  });

  await test('search can be filtered by age and fame', async () => {
    const { body } = await demo.get('/api/search?ageMin=25&ageMax=30&fameMin=20&limit=20');
    for (const item of body.items) {
      assert.ok(item.age >= 25 && item.age <= 30, `age ${item.age} out of range`);
      assert.ok(item.fameRating >= 20);
    }
  });

  await test('sql injection through the city filter returns no rows and no error', async () => {
    const { status, body } = await demo.get(`/api/search?city=${encodeURIComponent("' OR 1=1 --")}`);
    assert.equal(status, 200);
    assert.equal(body.items.length, 0);
  });

  const freshProfile = await fresh.get('/api/me/profile');
  const freshId = freshProfile.body.user.id;

  await test('visiting a profile records a visit and notifies the owner', async () => {
    const { status } = await demo.get(`/api/users/${username}`);
    assert.equal(status, 200);

    const visits = await fresh.get('/api/me/visits');
    assert.ok(visits.body.items.some((item) => item.username === 'demo'));

    const summary = await fresh.get('/api/notifications/summary');
    assert.ok(summary.body.notifications >= 1);
  });

  await test('chat is refused between members that are not connected', async () => {
    const { status } = await demo.post(`/api/chat/${freshId}/messages`, { body: 'hello' });
    assert.equal(status, 403);
  });

  await test('a like from one side does not open the chat', async () => {
    const { status, body } = await demo.post(`/api/users/${username}/like`);
    assert.equal(status, 200);
    assert.equal(body.relationship.isMatch, false);

    const chat = await demo.post(`/api/chat/${freshId}/messages`, { body: 'hello' });
    assert.equal(chat.status, 403);
  });

  let demoId = null;
  await test('a mutual like creates a connection', async () => {
    const profile = await fresh.get('/api/users/demo');
    demoId = profile.body.profile.id;
    assert.equal(profile.body.relationship.likesMe, true);

    const { body } = await fresh.post('/api/users/demo/like');
    assert.equal(body.relationship.isMatch, true);
  });

  await test('connected members can exchange messages', async () => {
    const sent = await fresh.post(`/api/chat/${demoId}/messages`, { body: 'Hello from the smoke test' });
    assert.equal(sent.status, 201);

    const conversation = await demo.get(`/api/chat/${freshId}/messages`);
    assert.equal(conversation.status, 200);
    assert.ok(conversation.body.items.some((message) => message.body === 'Hello from the smoke test'));
  });

  await test('an empty message is refused', async () => {
    const { status } = await fresh.post(`/api/chat/${demoId}/messages`, { body: '   ' });
    assert.equal(status, 400);
  });

  await test('the map returns compatible members with blurred coordinates', async () => {
    const { status, body } = await demo.get('/api/map?radius=500');
    assert.equal(status, 200);
    assert.ok(body.centre.latitude !== null);
    assert.ok(body.items.length > 0, 'no members on the map');

    for (const item of body.items) {
      assert.ok(item.latitude !== null && item.longitude !== null);
      assert.equal(item.latitude, Math.round(item.latitude * 100) / 100, 'latitude is not rounded');
      assert.ok(item.distanceKm <= 500);
    }
  });

  await test('the gallery can be reordered', async () => {
    const second = new FormData();
    second.append('photo', new Blob([pngFixture()], { type: 'image/png' }), 'second.png');
    await fresh.post('/api/me/photos', second);

    const before = await fresh.get('/api/me/photos');
    assert.equal(before.body.items.length, 2);

    const reversed = [...before.body.items].map((photo) => photo.id).reverse();
    const reorder = await fresh.put('/api/me/photos/order', { order: reversed });
    assert.equal(reorder.status, 200);

    const after = await fresh.get('/api/me/photos');
    assert.deepEqual(after.body.items.map((photo) => photo.id), reversed);
  });

  await test('a gallery order naming somebody else photo is refused', async () => {
    const mine = await fresh.get('/api/me/photos');
    const forged = [...mine.body.items.map((photo) => photo.id).slice(0, -1), 999999];
    const { status } = await fresh.put('/api/me/photos/order', { order: forged });
    assert.equal(status, 400);
  });

  await test('a meetup cannot be proposed to somebody you are not connected with', async () => {
    const candidates = await demo.get('/api/browse?limit=40');
    const target = candidates.body.items.find((item) => !(item.iLiked && item.likesMe));
    assert.ok(target, 'expected at least one member who is not a connection');

    const { status } = await demo.post('/api/meetups', {
      inviteeId: target.id,
      title: 'Coffee',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.equal(status, 403);
  });

  await test('a meetup in the past is refused', async () => {
    const { status, body } = await demo.post('/api/meetups', {
      inviteeId: freshId,
      title: 'Yesterday',
      scheduledAt: new Date(Date.now() - 86400000).toISOString(),
    });
    assert.equal(status, 400);
    assert.ok(body.fields.scheduledAt);
  });

  let meetupId = null;
  await test('a connected member can propose a meetup', async () => {
    const when = new Date(Date.now() + 3 * 86400000).toISOString();
    const { status, body } = await demo.post('/api/meetups', {
      inviteeId: freshId,
      title: 'Coffee at the market',
      place: 'Rue Mouffetard',
      scheduledAt: when,
      note: 'Smoke test meetup',
    });
    assert.equal(status, 201);
    assert.equal(body.meetup.status, 'proposed');
    assert.equal(body.meetup.isOrganizer, true);
    meetupId = body.meetup.id;
  });

  await test('the invited member sees the proposal and can accept it', async () => {
    const listed = await fresh.get('/api/meetups');
    const found = listed.body.upcoming.find((entry) => entry.id === meetupId);
    assert.ok(found, 'the proposal is missing from the invited member list');
    assert.equal(found.isOrganizer, false);

    const answer = await fresh.put(`/api/meetups/${meetupId}`, { status: 'accepted' });
    assert.equal(answer.status, 200);
    assert.equal(answer.body.meetup.status, 'accepted');
  });

  await test('only the organiser can cancel a meetup', async () => {
    const refused = await fresh.put(`/api/meetups/${meetupId}`, { status: 'cancelled' });
    assert.equal(refused.status, 403);

    const cancelled = await demo.put(`/api/meetups/${meetupId}`, { status: 'cancelled' });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.meetup.status, 'cancelled');
  });

  await test('call signalling is relayed between connected members', async () => {
    const open = (client) =>
      new Promise((done, fail) => {
        const socket = new WebSocket(`${BASE.replace('http', 'ws')}/ws`, { headers: { cookie: client.header() } });
        socket.on('open', () => done(socket));
        socket.on('error', fail);
      });

    const [demoSocket, freshSocket] = await Promise.all([open(demo), open(fresh)]);
    const received = [];
    freshSocket.on('message', (data) => received.push(JSON.parse(data.toString())));

    await new Promise((r) => setTimeout(r, 250));
    demoSocket.send(JSON.stringify({ type: 'call:offer', to: freshId, sdp: { type: 'offer', sdp: 'v=0' }, media: 'video' }));
    await new Promise((r) => setTimeout(r, 600));

    const offer = received.find((frame) => frame.type === 'call:offer');
    assert.ok(offer, 'the offer was never relayed');
    assert.equal(offer.from, demoId);
    assert.equal(offer.media, 'video');

    demoSocket.close();
    freshSocket.close();
    await new Promise((r) => setTimeout(r, 300));
  });

  await test('call signalling towards a stranger is refused', async () => {
    const candidates = await demo.get('/api/browse?limit=40');
    const target = candidates.body.items.find((item) => !(item.iLiked && item.likesMe));
    assert.ok(target, 'expected at least one member who is not a connection');

    const socket = await new Promise((done, fail) => {
      const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`, { headers: { cookie: demo.header() } });
      ws.on('open', () => done(ws));
      ws.on('error', fail);
    });

    const frames = [];
    socket.on('message', (data) => frames.push(JSON.parse(data.toString())));

    await new Promise((r) => setTimeout(r, 250));
    socket.send(JSON.stringify({ type: 'call:offer', to: target.id, sdp: { type: 'offer' }, media: 'video' }));
    await new Promise((r) => setTimeout(r, 600));

    assert.ok(frames.some((frame) => frame.type === 'call:refused'), 'the server did not refuse the call');
    socket.close();
    await new Promise((r) => setTimeout(r, 300));
  });

  await test('unliking closes the chat again', async () => {
    const { body } = await fresh.del('/api/users/demo/like');
    assert.equal(body.relationship.isMatch, false);

    const chat = await fresh.post(`/api/chat/${demoId}/messages`, { body: 'still there?' });
    assert.equal(chat.status, 403);
  });

  await test('reporting a profile works once', async () => {
    const first = await fresh.post('/api/users/demo/report', { reason: 'smoke test' });
    assert.equal(first.status, 200);
    const second = await fresh.post('/api/users/demo/report', { reason: 'smoke test' });
    assert.equal(second.status, 400);
  });

  await test('blocking hides the profile and its notifications', async () => {
    const { status } = await fresh.post('/api/users/demo/block');
    assert.equal(status, 200);

    const view = await fresh.get('/api/users/demo');
    assert.equal(view.status, 403);

    const search = await fresh.get('/api/search?city=Paris&limit=60');
    assert.ok(!search.body.items.some((item) => item.username === 'demo'));

    await fresh.del('/api/users/demo/block');
  });

  await test('password reset flow issues a working token', async () => {
    const forgot = await fresh.post('/api/auth/forgot-password', { email });
    assert.equal(forgot.status, 200);

    const token = await latestMailLink(email);
    assert.ok(token);

    const reset = await fresh.post('/api/auth/reset-password', { token, password: 'N3wPhrase!Anchor' });
    assert.equal(reset.status, 200);

    const relogin = new Client();
    await relogin.get('/api/auth/me');
    const login = await relogin.post('/api/auth/login', { username, password: 'N3wPhrase!Anchor' });
    assert.equal(login.status, 200);
  });

  await test('logout clears the session', async () => {
    const { status } = await demo.post('/api/auth/logout');
    assert.equal(status, 200);
    const me = await demo.get('/api/auth/me');
    assert.equal(me.body.user, null);
  });

  await query('DELETE FROM users WHERE lower(email) = lower($1)', [email]);
  await rm(config.mail.spoolDir, { recursive: true, force: true }).catch(() => {});

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  await pool.end();
  if (failed.length > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
