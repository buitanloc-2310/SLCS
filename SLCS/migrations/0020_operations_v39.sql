-- V39 IAM + Organization + Automation + Analytics foundation
CREATE TABLE IF NOT EXISTS custom_roles (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', name TEXT NOT NULL, description TEXT DEFAULT '', created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT NOT NULL, permission TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(role_id,permission));
CREATE TABLE IF NOT EXISTS user_role_assignments (organization_id TEXT NOT NULL DEFAULT 'sky-first', user_id TEXT NOT NULL, role_id TEXT NOT NULL, assigned_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(organization_id,user_id,role_id));
CREATE TABLE IF NOT EXISTS automation_rules (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', name TEXT NOT NULL, trigger_key TEXT NOT NULL, action_key TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON automation_rules(organization_id,enabled);
CREATE TABLE IF NOT EXISTS automation_runs (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, organization_id TEXT NOT NULL DEFAULT 'sky-first', status TEXT NOT NULL, detail_json TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT);
CREATE TABLE IF NOT EXISTS analytics_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', user_id TEXT, event_key TEXT NOT NULL, entity_type TEXT, entity_id TEXT, value_num REAL, meta_json TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_analytics_events_org_time ON analytics_events(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_key_time ON analytics_events(event_key,created_at DESC);
