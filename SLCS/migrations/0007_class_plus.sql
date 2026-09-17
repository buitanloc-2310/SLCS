CREATE TABLE IF NOT EXISTS class_settings (
  class_id TEXT PRIMARY KEY,
  class_type TEXT NOT NULL DEFAULT 'standard',
  access_mode TEXT NOT NULL DEFAULT 'code',
  visibility TEXT NOT NULL DEFAULT 'private',
  live_mode TEXT NOT NULL DEFAULT 'classroom',
  max_members INTEGER NOT NULL DEFAULT 200,
  features_json TEXT NOT NULL DEFAULT '{"feed":true,"materials":true,"assignments":true,"exams":true,"chat":true,"schedule":true,"members":true,"live":true}',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS class_access_codes (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  member_role TEXT NOT NULL DEFAULT 'student',
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_class_access_codes_class ON class_access_codes(class_id,enabled,created_at DESC);
