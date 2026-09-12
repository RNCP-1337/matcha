CREATE TABLE IF NOT EXISTS schema_version (
    version     integer PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id                  serial PRIMARY KEY,
    email               text NOT NULL,
    username            text NOT NULL,
    first_name          text NOT NULL,
    last_name           text NOT NULL,
    password_hash       text NOT NULL,
    gender              text,
    sexual_preference   text NOT NULL DEFAULT 'bisexual',
    biography           text,
    birth_date          date,
    latitude            double precision,
    longitude           double precision,
    city                text,
    country             text,
    location_source     text,
    fame_rating         integer NOT NULL DEFAULT 0,
    profile_photo_id    integer,
    is_verified         boolean NOT NULL DEFAULT false,
    is_online           boolean NOT NULL DEFAULT false,
    last_seen           timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female', 'other')),
    CONSTRAINT users_preference_check CHECK (sexual_preference IN ('heterosexual', 'homosexual', 'bisexual')),
    CONSTRAINT users_location_source_check CHECK (location_source IS NULL OR location_source IN ('gps', 'manual', 'network'))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
CREATE INDEX IF NOT EXISTS users_fame_idx ON users (fame_rating DESC);
CREATE INDEX IF NOT EXISTS users_position_idx ON users (latitude, longitude);
CREATE INDEX IF NOT EXISTS users_birth_date_idx ON users (birth_date);

CREATE TABLE IF NOT EXISTS photos (
    id          serial PRIMARY KEY,
    user_id     integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    filename    text NOT NULL,
    mime_type   text NOT NULL,
    byte_size   integer NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photos_user_idx ON photos (user_id);

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_profile_photo_fkey;
ALTER TABLE users
    ADD CONSTRAINT users_profile_photo_fkey
    FOREIGN KEY (profile_photo_id) REFERENCES photos (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS sessions (
    id          uuid PRIMARY KEY,
    user_id     integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  text NOT NULL,
    user_agent  text,
    ip_address  text,
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS auth_tokens (
    id          serial PRIMARY KEY,
    user_id     integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose     text NOT NULL,
    token_hash  text NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_tokens_purpose_check CHECK (purpose IN ('email_verification', 'password_reset'))
);

CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id, purpose);

CREATE TABLE IF NOT EXISTS tags (
    id      serial PRIMARY KEY,
    name    text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_name_key ON tags (lower(name));

CREATE TABLE IF NOT EXISTS user_tags (
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tag_id  integer NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS user_tags_tag_idx ON user_tags (tag_id);

CREATE TABLE IF NOT EXISTS likes (
    liker_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    liked_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (liker_id, liked_id),
    CONSTRAINT likes_not_self CHECK (liker_id <> liked_id)
);

CREATE INDEX IF NOT EXISTS likes_liked_idx ON likes (liked_id);

CREATE TABLE IF NOT EXISTS visits (
    id          serial PRIMARY KEY,
    visitor_id  integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    visited_id  integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT visits_not_self CHECK (visitor_id <> visited_id)
);

CREATE INDEX IF NOT EXISTS visits_visited_idx ON visits (visited_id, created_at DESC);
CREATE INDEX IF NOT EXISTS visits_visitor_idx ON visits (visitor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blocks (
    blocker_id  integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    blocked_id  integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE IF NOT EXISTS reports (
    id          serial PRIMARY KEY,
    reporter_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reported_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason      text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (reporter_id, reported_id),
    CONSTRAINT reports_not_self CHECK (reporter_id <> reported_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id           serial PRIMARY KEY,
    sender_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body         text NOT NULL,
    read_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messages_not_self CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages (
    least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at DESC
);
CREATE INDEX IF NOT EXISTS messages_unread_idx ON messages (recipient_id, read_at);

CREATE TABLE IF NOT EXISTS notifications (
    id          serial PRIMARY KEY,
    user_id     integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    actor_id    integer REFERENCES users (id) ON DELETE CASCADE,
    type        text NOT NULL,
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notifications_type_check CHECK (
        type IN ('like', 'visit', 'message', 'match', 'unlike')
    )
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id, read_at);

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_accounts (
    id                  serial PRIMARY KEY,
    user_id             integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider            text NOT NULL,
    provider_account_id text NOT NULL,
    email               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS oauth_accounts_user_idx ON oauth_accounts (user_id);

CREATE TABLE IF NOT EXISTS meetups (
    id            serial PRIMARY KEY,
    organizer_id  integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    invitee_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title         text NOT NULL,
    place         text,
    scheduled_at  timestamptz NOT NULL,
    note          text,
    status        text NOT NULL DEFAULT 'proposed',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT meetups_status_check CHECK (status IN ('proposed', 'accepted', 'declined', 'cancelled')),
    CONSTRAINT meetups_not_self CHECK (organizer_id <> invitee_id)
);

CREATE INDEX IF NOT EXISTS meetups_pair_idx ON meetups (
    least(organizer_id, invitee_id), greatest(organizer_id, invitee_id), scheduled_at
);
CREATE INDEX IF NOT EXISTS meetups_invitee_idx ON meetups (invitee_id, status);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type IN ('like', 'visit', 'message', 'match', 'unlike', 'meetup')
);

ALTER TABLE photos ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

UPDATE photos p SET position = ranked.rank
  FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY id) AS rank FROM photos) ranked
 WHERE p.id = ranked.id AND p.position = 0;

CREATE INDEX IF NOT EXISTS photos_order_idx ON photos (user_id, position);
