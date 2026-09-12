# Matcha

A dating site: sign up, fill in a profile, get suggestions that fit your preferences, like people,
and chat with the ones who like you back. Built for the 42 *Matcha* subject.

## Run it

You need Node 18+ and Docker. Then:

```
make setup     # installs everything, starts PostgreSQL, creates the tables, seeds 500+ profiles
make dev       # runs the API and the site
```

Open <http://localhost:5173>. Sign in with `demo` and the password `make seed` printed
(`Matcha!2024seed` unless you changed `SEED_PASSWORD`). A second account, `demo2`, is already
connected to `demo` so the chat has history.

`make` on its own lists every command. The ones you are most likely to want:

| Command | What it does |
| --- | --- |
| `make setup` | Everything needed to go from a fresh clone to a working site |
| `make dev` | API on 4000 with hot reload, site on 5173 |
| `make start` | Production mode: builds the client and serves it from the API on 4000 |
| `make test` | 54 end to end checks against a running server |
| `make reset-db` | Drop, recreate and reseed the database |
| `make doctor` | Reports on Node, Docker, ports and the current database contents |
| `make stop` | Stops the dev servers and the containers |

Emails are never sent anywhere real in development: the local mailbox at <http://localhost:8085>
catches all of them, including the confirmation and password reset links.

## What is in the box

```
server/          Express API, hand written SQL, WebSocket hub
  src/db/        schema.sql, migration runner, seeder
  src/lib/       password hashing, validation, geo, fame rating, mail
  src/routes/    auth, oauth, profile, photos, browse/search/map, chat, meetups, notifications
  test/          the two suites behind `make test`
client/          React + Vite front end, plain CSS
docker-compose.yml   PostgreSQL 16 and a local mailbox
Makefile             every command described above
```

## Choices worth knowing about

**No ORM, no query builder, no validation library, no account manager.** Express is used as a
router, `pg` sends parameterised SQL that is written by hand in
[`server/src/db/schema.sql`](server/src/db/schema.sql) and in the route files. Validation lives in
[`server/src/lib/validate.js`](server/src/lib/validate.js), sessions in
[`server/src/middleware/session.js`](server/src/middleware/session.js).

**Passwords** are hashed with scrypt (N=16384, r=8, p=1) from Node's own crypto module, with a
random 16 byte salt per password and a constant time comparison. The stored format is
`scrypt$N$r$p$salt$hash`. A password must be 8 characters or more and mix cases, digits and
symbols; it is rejected if it reduces to a common English word or a leaked password, including
through leet substitutions and trailing digits, so `password`, `P4ssw0rd!` and `Summer2024!` are
all refused.

**Sessions** are opaque random tokens stored server side. The cookie holds a signed
`session id : token` pair, is `HttpOnly`, `SameSite=Lax` and `Secure` in production, and the token
is only ever kept as an HMAC in the database. Every state changing request must also echo a CSRF
token from a second, readable cookie.

**The fame rating** runs from 0 to 100 and is recomputed after every event that feeds it: likes
received (up to 40), mutual connections (up to 25), distinct visitors (up to 15), photos and
interests (up to 10), profile completeness (up to 10), minus 10 per report and 5 per block. The
formula lives in [`server/src/lib/fame.js`](server/src/lib/fame.js) and is explained to users on
the *How matching works* page.

**Suggestions** only contain people whose gender matches what you are looking for and for whom your
gender matches what they are looking for; nobody who has been blocked in either direction ever
appears. The default ranking is `distance × 0.45 + shared interests × 9 + fame × 0.4`, with a bonus
for people who already liked you, so people nearby come first. Every list can be re-sorted and
filtered by age, distance, city, fame and interests.

**Location** is asked for through the browser's geolocation API only when the user clicks the
button. Coordinates are reverse-labelled to the nearest city from a local dataset, so no third
party ever sees them. A user who refuses types a city instead, and can change it at any time. Other
members only ever see a city name and a distance in kilometres, except on the map, where positions
are rounded to about a kilometre before they leave the server.

**Realtime** is a WebSocket at `/ws`, authenticated with the same session cookie. It delivers
messages, notifications and connection changes, and drives the online indicator and the unread
badges in the header, which are visible from every page. Delivery is immediate, well inside the ten
second limit the subject asks for.

**Uploads** are held in memory, checked against the real magic bytes of JPEG, PNG, GIF and WebP
rather than the declared content type, capped at 5 MB and 5 photos per account, and written under a
random UUID name. They are served with `X-Content-Type-Options: nosniff`.

## The bonus features

All five are implemented.

**Social sign in.** `GET /api/auth/oauth/:provider` starts the flow, the callback exchanges the code
server side and links or creates the account. GitHub and Google ship configured; the buttons appear
only once credentials are in `.env`, and `make oauth-help` walks through registering an app. An
account created this way has no password at all (`password_hash` stays null) and is verified from
the start, because the provider already proved the address. Signing in again links to the same
account rather than creating a second one, and a callback whose `state` does not match the cookie is
refused. `make test` drives the entire round trip against a throwaway provider it starts itself, so
none of this needs real credentials to be verified. The code lives in
[`oauth.js`](server/src/lib/oauth.js) and [`routes/oauth.js`](server/src/routes/oauth.js).

**Photo gallery with drag and drop and editing.** Drop a file on the gallery, or click it, and an
editor opens before anything is uploaded: drag the square to choose the crop, a slider to size it,
rotate in either direction, and six filters. The result is composited on a canvas and uploaded as
JPEG, so the server receives exactly what was previewed. Photos can be reordered by dragging them or
with the arrows, and the order is stored per user. See
[`ImageEditor.jsx`](client/src/components/ImageEditor.jsx) and
[`PhotoManager.jsx`](client/src/components/PhotoManager.jsx).

**Interactive map.** [`MapView.jsx`](client/src/pages/MapView.jsx) draws every compatible member on a
Leaflet map with OpenStreetMap tiles, each pin showing their photo and opening their profile. A
*Use precise GPS* button asks the browser for a high accuracy fix, which sharpens your own position
for distance sorting; what other people see of you stays rounded. Leaflet is bundled from npm, not a
CDN, but the tiles are fetched from openstreetmap.org, so this page is the only one that needs an
internet connection.

**Video and audio calls.** Connected members can call each other from the conversation. The media is
peer to peer over WebRTC; the server only relays the offer, answer and ICE candidates through the
existing WebSocket, and refuses to relay anything between members who are not connected, so the
audio and video never pass through it. Mute, camera toggle, decline, busy and hang up are all
handled. See [`CallPanel.jsx`](client/src/components/CallPanel.jsx) and the signalling block in
[`hub.js`](server/src/realtime/hub.js).

**Meetups.** Connected members can propose a real meeting with a title, time, place and note. The
invited person accepts or declines, the organiser can cancel, and both sides get a realtime
notification. Proposals appear inside the conversation and on a dedicated *Meetups* page.
See [`routes/meetups.js`](server/src/routes/meetups.js) and
[`Meetups.jsx`](client/src/pages/Meetups.jsx).

## Security checklist from the subject

| Requirement | Where it is handled |
| --- | --- |
| Passwords never stored in clear | scrypt hashes, `server/src/lib/password.js`; checked by `make test` |
| No SQL injection | every query is parameterised; `make test` fires injection strings at the search filters |
| No HTML or JavaScript injection | React escapes all rendered values, `dangerouslySetInnerHTML` is never used, and a Content Security Policy blocks inline scripts |
| No unauthorised uploads | magic byte detection, size and count limits, random filenames, `nosniff` |
| Forms validated | server side in `validate.js`, with the messages shown per field in the UI |
| Credentials out of Git | everything lives in `.env`, which `.gitignore` excludes; `.env.example` is the template |

Other measures: rate limiting on sign in, registration and every email sending endpoint; sessions
invalidated everywhere when the password changes; user enumeration avoided in the forgotten
password and resend confirmation replies; single use, expiring tokens for confirmation and reset;
`helmet` for the security headers.

## Tests

`make dev` in one terminal, `make test` in another. Two suites run.

The main one signs up a real account, confirms it through the email that the local mailbox received,
completes the profile, uploads a photo, browses, searches, likes, matches, chats, unlikes, reports,
blocks and resets its password, checking the security properties along the way. It also covers the
bonus features: the map's coordinate rounding, gallery reordering (including refusing an order that
names someone else's photo), the meetup lifecycle, and call signalling — that it reaches a connected
member and is refused towards a stranger.

The second starts a throwaway OAuth provider and a second API instance, then drives the whole social
sign in round trip: the redirect and its state cookie, a forged state being rejected, account
creation, the absence of a password on that account, and a second sign in linking rather than
duplicating.

Both clean up after themselves.

## Configuration

Everything is in `.env`, created by `make setup` from `.env.example`. Ports were chosen to stay out
of the way of other projects: API 4000, site 5173, PostgreSQL 5455, mailbox 8085. Change them there
and every command follows.
