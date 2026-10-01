-- Assessment integrity V43: candidate roster, public verification throttling and incident records.
CREATE TABLE IF NOT EXISTS assessment_candidates (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL,
  candidate_code TEXT NOT NULL, class_name TEXT, status TEXT NOT NULL DEFAULT 'eligible',
  accommodation_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id,candidate_code), FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_assessment_candidates_identity ON assessment_candidates(exam_id,email,candidate_code,status);
CREATE TABLE IF NOT EXISTS assessment_rate_limits (
  bucket TEXT NOT NULL, subject_hash TEXT NOT NULL, window_start TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(bucket,subject_hash,window_start)
);
CREATE TABLE IF NOT EXISTS assessment_incidents (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, attempt_id TEXT, source TEXT NOT NULL DEFAULT 'internal',
  category TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', created_by TEXT, resolved_by TEXT, resolution TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT,
  FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_assessment_incidents_exam ON assessment_incidents(exam_id,status,created_at DESC);
