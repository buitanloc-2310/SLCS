-- V44 Professional Assessment Center: governed lifecycle, immutable versions, sections,
-- revision-safe autosave, review windows, grading governance, incidents and verifiable receipts.
ALTER TABLE exams ADD COLUMN review_policy TEXT NOT NULL DEFAULT 'none';
ALTER TABLE exams ADD COLUMN review_opens_at TEXT;
ALTER TABLE exams ADD COLUMN review_closes_at TEXT;
ALTER TABLE exams ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE exams ADD COLUMN approved_by TEXT;
ALTER TABLE exams ADD COLUMN approved_at TEXT;
ALTER TABLE exams ADD COLUMN published_at TEXT;
ALTER TABLE exams ADD COLUMN owner_user_id TEXT;
ALTER TABLE exam_attempts ADD COLUMN answer_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exam_guest_attempts ADD COLUMN answer_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assessment_question_bank ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE assessment_question_bank ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assessment_question_bank ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assessment_question_bank ADD COLUMN response_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assessment_receipts ADD COLUMN receipt_hash TEXT;
ALTER TABLE assessment_receipts ADD COLUMN snapshot_hash TEXT;
ALTER TABLE assessment_receipts ADD COLUMN answer_hash TEXT;
CREATE TABLE IF NOT EXISTS assessment_exam_versions (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, version_no INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
  change_summary TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id,version_no), FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS assessment_exam_roles (
  exam_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(exam_id,user_id,role), FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS assessment_answer_revisions (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'internal', revision INTEGER NOT NULL,
  answers_json TEXT NOT NULL, events_json TEXT NOT NULL DEFAULT '[]', accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_id,source,revision)
);
CREATE INDEX IF NOT EXISTS idx_assessment_answer_revisions ON assessment_answer_revisions(attempt_id,source,revision DESC);
CREATE TABLE IF NOT EXISTS assessment_grade_changes (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, question_id TEXT, old_score REAL, new_score REAL,
  reason TEXT NOT NULL, requested_by TEXT NOT NULL, approved_by TEXT, status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_at TEXT
);
CREATE TABLE IF NOT EXISTS assessment_competencies (
  id TEXT PRIMARY KEY, organization_id TEXT, code TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(organization_id,code)
);
CREATE TABLE IF NOT EXISTS assessment_question_competencies (
  question_id TEXT NOT NULL, competency_id TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY(question_id,competency_id)
);
CREATE INDEX IF NOT EXISTS idx_assessment_versions_exam ON assessment_exam_versions(exam_id,version_no DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_incidents_attempt ON assessment_incidents(attempt_id,status);
