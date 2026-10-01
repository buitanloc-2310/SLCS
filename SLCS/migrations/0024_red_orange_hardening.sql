-- Red/orange hardening: submission policy tracking, public assessment email verification,
-- and Pages/D1 waiting-room state. Additive only.
ALTER TABLE submissions ADD COLUMN submission_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE live_signal_presence ADD COLUMN admitted INTEGER NOT NULL DEFAULT 1;
ALTER TABLE live_access_tokens ADD COLUMN admitted INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_live_signal_presence_admitted ON live_signal_presence(class_id,admitted,last_seen);
CREATE TABLE IF NOT EXISTS assessment_email_verifications (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assessment_email_verify ON assessment_email_verifications(exam_id,email,created_at DESC);
