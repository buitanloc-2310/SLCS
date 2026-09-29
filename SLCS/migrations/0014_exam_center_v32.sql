-- V32 Exam Center: strict proctoring lifecycle, scheduling, grading workflow and audit.
ALTER TABLE exams ADD COLUMN opens_at TEXT;
ALTER TABLE exams ADD COLUMN closes_at TEXT;
ALTER TABLE exams ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exams ADD COLUMN show_score INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exams ADD COLUMN fullscreen_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN terminate_on_exit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN closed_reason TEXT;
ALTER TABLE exam_attempts ADD COLUMN closed_at TEXT;
ALTER TABLE exam_attempts ADD COLUMN reviewed_by TEXT;
ALTER TABLE exam_attempts ADD COLUMN reviewed_at TEXT;
ALTER TABLE exam_attempts ADD COLUMN teacher_feedback TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS exam_audit_log (
 id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, attempt_id TEXT, actor_user_id TEXT,
 event_type TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,
 FOREIGN KEY(attempt_id) REFERENCES exam_attempts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_audit_exam ON exam_audit_log(exam_id,created_at DESC);
