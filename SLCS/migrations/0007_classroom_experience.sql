CREATE TABLE IF NOT EXISTS class_profiles (
  class_id TEXT PRIMARY KEY,
  class_type TEXT NOT NULL DEFAULT 'class',
  theme TEXT NOT NULL DEFAULT 'aurora',
  room_mode TEXT NOT NULL DEFAULT 'classroom',
  capacity INTEGER NOT NULL DEFAULT 40,
  allow_guests INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS class_invite_codes (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  target_role TEXT NOT NULL DEFAULT 'student',
  max_uses INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_class_invite_codes_class ON class_invite_codes(class_id,active,created_at DESC);

CREATE TABLE IF NOT EXISTS live_room_settings (
  class_id TEXT PRIMARY KEY,
  room_mode TEXT NOT NULL DEFAULT 'classroom',
  waiting_room INTEGER NOT NULL DEFAULT 0,
  chat_enabled INTEGER NOT NULL DEFAULT 1,
  reactions_enabled INTEGER NOT NULL DEFAULT 1,
  hand_raise_enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
);
