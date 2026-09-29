-- Pages-compatible realtime signaling fallback. Additive only; no existing data is changed.
CREATE TABLE IF NOT EXISTS live_signal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT NOT NULL,
  sender_key TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_role TEXT NOT NULL DEFAULT 'guest',
  target_key TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_signal_events_class_id ON live_signal_events(class_id,id);
CREATE TABLE IF NOT EXISTS live_signal_presence (
  class_id TEXT NOT NULL,
  peer_key TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'guest',
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(class_id,peer_key)
);
CREATE INDEX IF NOT EXISTS idx_live_signal_presence_seen ON live_signal_presence(class_id,last_seen);
