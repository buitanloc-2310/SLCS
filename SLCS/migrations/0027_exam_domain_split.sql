-- Dedicated exam.skyfirst.io.vn launch/access tokens. Schema owner remains SLCS.
CREATE TABLE IF NOT EXISTS exam_launch_tokens (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,attempt_id TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_exam_launch_attempt ON exam_launch_tokens(attempt_id,expires_at);
CREATE TABLE IF NOT EXISTS exam_access_tokens (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,attempt_id TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_exam_access_attempt ON exam_access_tokens(attempt_id,expires_at);
