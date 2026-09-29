-- V37 Assessment MAX foundation: reusable bank, sections, manual grading, appeals and receipts.
CREATE TABLE IF NOT EXISTS assessment_question_bank (
  id TEXT PRIMARY KEY, organization_id TEXT, owner_user_id TEXT NOT NULL,
  subject TEXT, grade_level TEXT, topic TEXT, lesson TEXT, difficulty TEXT NOT NULL DEFAULT 'medium',
  type TEXT NOT NULL, question TEXT NOT NULL, options_json TEXT NOT NULL DEFAULT '[]', answer_json TEXT,
  explanation TEXT, points REAL NOT NULL DEFAULT 1, tags_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assessment_bank_filter ON assessment_question_bank(organization_id,subject,topic,difficulty,status);
CREATE TABLE IF NOT EXISTS assessment_sections (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, title TEXT NOT NULL, instructions TEXT, position INTEGER NOT NULL DEFAULT 0,
  points REAL, time_limit_minutes INTEGER, navigation_mode TEXT NOT NULL DEFAULT 'free', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assessment_sections_exam ON assessment_sections(exam_id,position);
CREATE TABLE IF NOT EXISTS assessment_manual_grades (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, question_id TEXT NOT NULL, grader_user_id TEXT NOT NULL,
  score REAL, feedback TEXT, rubric_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_id,question_id)
);
CREATE TABLE IF NOT EXISTS assessment_appeals (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT, resolved_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS assessment_receipts (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE, receipt_code TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
