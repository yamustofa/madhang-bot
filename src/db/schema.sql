-- makan-siang D1 schema
--
-- All times are stored as WIB (UTC+7) wall-clock strings so the board reads
-- naturally and the cron can compare against "now in WIB".
--   date_local      -> 'YYYY-MM-DD'
--   leave_at_local  -> 'HH:mm'
--   *_at columns    -> ISO8601 UTC (datetime('now')), used only for ordering.

-- A Telegram group that uses the bot. One row per chat.
CREATE TABLE IF NOT EXISTS groups (
  chat_id    INTEGER PRIMARY KEY,           -- telegram chat id (negative for groups)
  title      TEXT,
  settings   TEXT NOT NULL DEFAULT '{}',    -- JSON; see defaults applied in code
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The shared roster of places for a group. Anyone can add.
CREATE TABLE IF NOT EXISTS places (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id           INTEGER NOT NULL REFERENCES groups(chat_id),
  name              TEXT NOT NULL,
  added_by_user_id  INTEGER,
  added_by_name     TEXT,
  last_suggested_at TEXT,                   -- ISO8601 UTC; feeds LRU rotation
  last_chosen_at    TEXT,                   -- set when a proposal for this place first gets a join
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (chat_id, name)
);
CREATE INDEX IF NOT EXISTS idx_places_chat ON places(chat_id);

-- One lunch session per group per day.
CREATE TABLE IF NOT EXISTS sessions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id            INTEGER NOT NULL REFERENCES groups(chat_id),
  date_local         TEXT NOT NULL,         -- 'YYYY-MM-DD' (WIB)
  status             TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  board_message_id   INTEGER,               -- the pinned board message id in this chat
  opened_by_user_id  INTEGER,
  opened_by_name     TEXT,
  bot_suggestion_count INTEGER NOT NULL DEFAULT 0,  -- cap at 1 per session
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (chat_id, date_local)
);
CREATE INDEX IF NOT EXISTS idx_sessions_open ON sessions(status, date_local);

-- A proposed place within a session, with a soft "leaves at" deadline.
CREATE TABLE IF NOT EXISTS proposals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        INTEGER NOT NULL REFERENCES sessions(id),
  place_id          INTEGER REFERENCES places(id),  -- nullable for ad-hoc free-text places
  place_name        TEXT NOT NULL,                  -- denormalized for display
  proposer_user_id  INTEGER,
  proposer_name     TEXT,
  leave_at_local    TEXT,                           -- 'HH:mm' (WIB), nullable
  is_bot_suggestion INTEGER NOT NULL DEFAULT 0,
  leave_ping_sent   INTEGER NOT NULL DEFAULT 0,     -- set to 1 once the 10-min ping fires
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_proposals_session ON proposals(session_id);

-- Who joined which proposal. One row per (proposal, user).
CREATE TABLE IF NOT EXISTS joins (
  proposal_id INTEGER NOT NULL REFERENCES proposals(id),
  user_id     INTEGER NOT NULL,
  user_name   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (proposal_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_joins_proposal ON joins(proposal_id);

-- The "I'm flexible" pool for a session.
CREATE TABLE IF NOT EXISTS flexible (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  user_id    INTEGER NOT NULL,
  user_name  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_flexible_session ON flexible(session_id);
