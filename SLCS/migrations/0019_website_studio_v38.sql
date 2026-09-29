-- V38 Website Studio MAX: immutable snapshots for revision history.
CREATE TABLE IF NOT EXISTS website_revisions (
  id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_website_revisions_created ON website_revisions(created_at DESC);
