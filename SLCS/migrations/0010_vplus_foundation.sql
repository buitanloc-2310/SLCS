-- Sky First School VPLUS foundation. CREATE-only and safe to apply once through D1 migrations.
CREATE TABLE IF NOT EXISTS platform_events (
  id TEXT PRIMARY KEY,
  tenant_key TEXT NOT NULL DEFAULT 'sky-first',
  class_id TEXT,
  user_id TEXT,
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'platform',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_events_class_time ON platform_events(class_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_type_time ON platform_events(event_type,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id TEXT,
  mode TEXT NOT NULL DEFAULT 'ask',
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id,created_at);

CREATE TABLE IF NOT EXISTS ai_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  class_id TEXT,
  mode TEXT NOT NULL DEFAULT 'ask',
  action TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'ok',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_audit_time ON ai_audit(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_action_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id TEXT,
  action_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_action_requests_user ON ai_action_requests(user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,bucket)
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'community',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(organization_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id,status);

CREATE TABLE IF NOT EXISTS organization_domains (
  domain TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_settings (
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(organization_id,key)
);

CREATE TABLE IF NOT EXISTS usage_hourly (
  organization_id TEXT NOT NULL DEFAULT 'sky-first',
  bucket TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(organization_id,bucket,metric)
);
