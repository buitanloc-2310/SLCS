-- V42 Assessment governance: snapshots, blueprints, publication controls and incident operations.
ALTER TABLE exams ADD COLUMN version_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exams ADD COLUMN blueprint_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE exams ADD COLUMN result_policy TEXT NOT NULL DEFAULT 'score_after_submit';
ALTER TABLE exams ADD COLUMN scope_level TEXT NOT NULL DEFAULT 'class';
ALTER TABLE exam_attempts ADD COLUMN question_snapshot_json TEXT;
ALTER TABLE exam_attempts ADD COLUMN extra_time_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN invalidated_at TEXT;
ALTER TABLE exam_guest_attempts ADD COLUMN question_snapshot_json TEXT;
ALTER TABLE exam_guest_attempts ADD COLUMN extra_time_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exam_guest_attempts ADD COLUMN invalidated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_exam_attempt_status ON exam_attempts(exam_id,status,last_saved_at);
CREATE INDEX IF NOT EXISTS idx_exam_guest_status ON exam_guest_attempts(exam_id,status,last_saved_at);
