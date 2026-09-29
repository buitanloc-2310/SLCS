CREATE TABLE IF NOT EXISTS class_live_settings (
  class_id TEXT PRIMARY KEY,
  waiting_room INTEGER NOT NULL DEFAULT 1,
  allow_student_mic INTEGER NOT NULL DEFAULT 1,
  allow_student_camera INTEGER NOT NULL DEFAULT 1,
  allow_student_share INTEGER NOT NULL DEFAULT 0,
  allow_chat INTEGER NOT NULL DEFAULT 1,
  allow_reactions INTEGER NOT NULL DEFAULT 1,
  allow_anonymous_pulse INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'sky',
  accent TEXT NOT NULL DEFAULT '#4263eb',
  background TEXT NOT NULL DEFAULT '#f5f7fb',
  surface TEXT NOT NULL DEFAULT '#ffffff',
  layout_default TEXT NOT NULL DEFAULT 'auto',
  max_visible_videos INTEGER NOT NULL DEFAULT 12,
  adaptive_video INTEGER NOT NULL DEFAULT 1,
  confidence_camera INTEGER NOT NULL DEFAULT 1,
  feature_flags_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS live_attendance (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  user_key TEXT NOT NULL,
  user_id TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TEXT,
  reconnect_count INTEGER NOT NULL DEFAULT 0,
  device_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_live_attendance_class ON live_attendance(class_id,joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_attendance_open ON live_attendance(class_id,user_key,left_at,last_seen);
CREATE TABLE IF NOT EXISTS live_polls (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  anonymous INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_live_polls_class ON live_polls(class_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS live_poll_answers (
  poll_id TEXT NOT NULL,
  responder_key TEXT NOT NULL,
  user_id TEXT,
  option_index INTEGER NOT NULL,
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(poll_id,responder_key)
);
CREATE TABLE IF NOT EXISTS live_resources (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL DEFAULT 'link',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_resources_class ON live_resources(class_id,pinned DESC,created_at DESC);
CREATE TABLE IF NOT EXISTS live_room_events (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_key TEXT,
  actor_name TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_room_events_class ON live_room_events(class_id,created_at DESC);
CREATE TABLE IF NOT EXISTS live_telemetry_hourly (
  bucket TEXT NOT NULL,
  class_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(bucket,class_id,metric)
);
