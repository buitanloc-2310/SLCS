-- SLC master requirements 1-35: additive foundation only. No destructive changes.
CREATE TABLE IF NOT EXISTS organization_entitlements (
  organization_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  quota_value INTEGER,
  expires_at TEXT,
  source TEXT NOT NULL DEFAULT 'grant',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(organization_id,capability)
);
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,key)
);
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL DEFAULT 'sky-first',
  class_id TEXT,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'event',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_org_time ON calendar_events(organization_id,starts_at);
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author_user_id TEXT,
  body TEXT NOT NULL,
  file_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS profile_visibility (
  user_id TEXT NOT NULL,
  field TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'members',
  PRIMARY KEY(user_id,field)
);
INSERT OR IGNORE INTO organizations(id,name,slug,status,plan) VALUES('sky-first','Sky First Network','sky-first','active','community');
INSERT OR IGNORE INTO organization_entitlements(organization_id,capability,enabled,source) VALUES
('sky-first','live.use',1,'internal'),('sky-first','guest.access',1,'internal'),('sky-first','teaching.core',1,'internal'),('sky-first','ai.use',1,'internal');
