-- Learning Operations Complete: certificates, schedule metadata, resource folders, audit-friendly grade changes.
CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', user_id TEXT NOT NULL,
  class_id TEXT, title TEXT NOT NULL, certificate_code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'issued',
  payload_json TEXT NOT NULL DEFAULT '{}', issued_by TEXT, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT, revoke_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id,issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_org ON certificates(organization_id,issued_at DESC);
CREATE TABLE IF NOT EXISTS grade_change_log (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL, user_id TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, old_score REAL, new_score REAL, note TEXT NOT NULL DEFAULT '', changed_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_grade_change_class ON grade_change_log(class_id,created_at DESC);
CREATE TABLE IF NOT EXISTS resource_folders (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL, name TEXT NOT NULL, parent_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resource_folders_class ON resource_folders(class_id,parent_id,sort_order);
