-- V40 Assessment Center Complete: flexible timing, public invitations, guest candidates and resilient attempts.
ALTER TABLE exams ADD COLUMN time_limit_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exams ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN public_token TEXT;
ALTER TABLE exams ADD COLUMN hide_schedule INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN require_email_verify INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN shuffle_questions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN shuffle_options INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exams_public_token ON exams(public_token) WHERE public_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS exam_guest_attempts (
 id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, access_key TEXT NOT NULL UNIQUE,
 full_name TEXT NOT NULL, email TEXT NOT NULL, candidate_code TEXT, class_name TEXT,
 status TEXT NOT NULL DEFAULT 'in_progress', started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_saved_at TEXT, submitted_at TEXT, answers_json TEXT NOT NULL DEFAULT '{}', event_log_json TEXT NOT NULL DEFAULT '[]',
 score REAL, max_score REAL, closed_reason TEXT, closed_at TEXT,
 FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_guest_exam ON exam_guest_attempts(exam_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_email ON exam_guest_attempts(email,exam_id);
