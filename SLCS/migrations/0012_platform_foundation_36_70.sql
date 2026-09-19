-- SLC master requirements 36-70: additive multi-organization, entitlement, subscription and audit foundation.
ALTER TABLE classes ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'sky-first';
CREATE TABLE IF NOT EXISTS organization_subscriptions (
  organization_id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL DEFAULT 'community',
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TEXT,
  renews_at TEXT,
  expires_at TEXT,
  source TEXT NOT NULL DEFAULT 'grant',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS organization_usage (
  organization_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  period_key TEXT NOT NULL DEFAULT 'current',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(organization_id,metric,period_key)
);
CREATE TABLE IF NOT EXISTS scoped_role_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  granted_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,scope_type,scope_id,role)
);
CREATE INDEX IF NOT EXISTS idx_scoped_role_grants_user ON scoped_role_grants(user_id,status);
CREATE TABLE IF NOT EXISTS organization_branding (
  organization_id TEXT PRIMARY KEY,
  logo_key TEXT,
  cover_key TEXT,
  accent TEXT NOT NULL DEFAULT '#1677ff',
  support_email TEXT,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_audit_v2 (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  organization_id TEXT,
  result TEXT NOT NULL DEFAULT 'ok',
  request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_v2_time ON platform_audit_v2(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_v2_org ON platform_audit_v2(organization_id,created_at DESC);
INSERT OR IGNORE INTO organization_subscriptions(organization_id,plan_code,status,source) VALUES('sky-first','internal','active','internal');
INSERT OR IGNORE INTO organization_entitlements(organization_id,capability,enabled,quota_value,source) VALUES
('sky-first','platform.organization.manage',1,NULL,'internal'),
('sky-first','platform.entitlement.manage',1,NULL,'internal'),
('sky-first','organization.branding',1,NULL,'internal'),
('sky-first','website.studio',1,NULL,'internal'),
('sky-first','beauty.studio.advanced',1,NULL,'internal'),
('sky-first','live.capacity',1,120,'internal'),
('sky-first','classes',1,10000,'internal'),
('sky-first','members',1,10000,'internal'),
('sky-first','storage.bytes',1,107374182400,'internal');
