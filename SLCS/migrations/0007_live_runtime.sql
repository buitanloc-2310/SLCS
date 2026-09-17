-- Runtime signaling fallback for Cloudflare Pages (small-room WebRTC)
CREATE TABLE IF NOT EXISTS live_runtime_participants (id TEXT PRIMARY KEY,class_id TEXT NOT NULL,access_token TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'guest',joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,left_at TEXT,mic_on INTEGER NOT NULL DEFAULT 0,cam_on INTEGER NOT NULL DEFAULT 0,screen_on INTEGER NOT NULL DEFAULT 0,hand_raised INTEGER NOT NULL DEFAULT 0,kicked_at TEXT);
CREATE INDEX IF NOT EXISTS idx_live_runtime_participants_room_seen ON live_runtime_participants(class_id,last_seen);
CREATE TABLE IF NOT EXISTS live_runtime_signals (id INTEGER PRIMARY KEY AUTOINCREMENT,class_id TEXT NOT NULL,from_peer TEXT NOT NULL,to_peer TEXT NOT NULL,type TEXT NOT NULL,payload_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_live_runtime_signals_to ON live_runtime_signals(class_id,to_peer,id);
CREATE TABLE IF NOT EXISTS live_runtime_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,class_id TEXT NOT NULL,peer_id TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'guest',body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_live_runtime_messages_room ON live_runtime_messages(class_id,id);
