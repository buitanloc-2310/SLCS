
CREATE TABLE IF NOT EXISTS login_throttle (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_access_tokens (
  token TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  user_id TEXT,
  guest_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'guest',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_live_access_tokens_class
ON live_access_tokens(class_id,expires_at);

CREATE TABLE IF NOT EXISTS class_messages (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at TEXT,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_class_messages_class
ON class_messages(class_id,created_at DESC);

CREATE TABLE IF NOT EXISTS class_events (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'class',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_class_events_class
ON class_events(class_id,starts_at);

CREATE TABLE IF NOT EXISTS system_incidents (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'info',
  component TEXT NOT NULL,
  message TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_system_incidents_created
ON system_incidents(created_at DESC);

INSERT OR IGNORE INTO system_settings(key,value) VALUES
('platform_version','V10'),
('login_rate_limit','10'),
('max_upload_mb','50'),
('account_portrait_max_mb','5'),
('account_document_max_mb','10'),
('public_status_text','Hệ thống đang hoạt động ổn định.'),
('live_mesh_max_peers','18');
