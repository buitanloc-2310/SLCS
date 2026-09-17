-- V12: Cloudflare Realtime SFU foundation for skyfirsthoc.
-- Safe CREATE-only migration. No existing classroom data is removed.
CREATE TABLE IF NOT EXISTS live_sfu_sessions (
  session_id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_live_sfu_sessions_room ON live_sfu_sessions(class_id,status,last_seen);

CREATE TABLE IF NOT EXISTS live_sfu_tracks (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  track_name TEXT NOT NULL,
  mid TEXT,
  kind TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  owner_key TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id,track_name)
);
CREATE INDEX IF NOT EXISTS idx_live_sfu_tracks_room ON live_sfu_tracks(class_id,active,updated_at);
CREATE INDEX IF NOT EXISTS idx_live_sfu_tracks_session ON live_sfu_tracks(session_id,active);
