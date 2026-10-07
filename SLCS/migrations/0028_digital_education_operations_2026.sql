-- Digital Education Operations & Innovation 2026 — additive production migration.
-- SLCS remains schema/control-plane owner. EXAM receives direct D1/R2 bindings only for sealed attempt runtime.

CREATE TABLE IF NOT EXISTS education_fields (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', code TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id,code)
);
CREATE INDEX IF NOT EXISTS idx_education_fields_org ON education_fields(organization_id,status,name);

CREATE TABLE IF NOT EXISTS education_programs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', field_id TEXT, code TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '', scale_target INTEGER,
  owner_unit TEXT NOT NULL DEFAULT '', owner_user_id TEXT, starts_at TEXT, ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft', metadata_json TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id,code), FOREIGN KEY(field_id) REFERENCES education_fields(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_education_programs_org ON education_programs(organization_id,status,starts_at);

CREATE TABLE IF NOT EXISTS program_cohorts (
  id TEXT PRIMARY KEY, program_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
  starts_at TEXT, ends_at TEXT, capacity INTEGER, status TEXT NOT NULL DEFAULT 'planned',
  metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(program_id,code),
  FOREIGN KEY(program_id) REFERENCES education_programs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_program_cohorts_program ON program_cohorts(program_id,status,starts_at);

CREATE TABLE IF NOT EXISTS program_classes (
  cohort_id TEXT NOT NULL, class_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(cohort_id,class_id), FOREIGN KEY(cohort_id) REFERENCES program_cohorts(id) ON DELETE CASCADE,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_program_classes_class ON program_classes(class_id,cohort_id);

CREATE TABLE IF NOT EXISTS class_sessions (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT,
  teacher_user_id TEXT, assistant_user_id TEXT, content_summary TEXT NOT NULL DEFAULT '', room_link TEXT,
  material_refs_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_class_sessions_class_time ON class_sessions(class_id,starts_at,status);

ALTER TABLE class_attendance_sessions ADD COLUMN class_session_id TEXT;
ALTER TABLE class_attendance_sessions ADD COLUMN policy_id TEXT;
ALTER TABLE class_attendance_records ADD COLUMN minutes_late INTEGER NOT NULL DEFAULT 0;
ALTER TABLE class_attendance_records ADD COLUMN minutes_early_leave INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS attendance_policies (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', name TEXT NOT NULL,
  allowed_excused_absences INTEGER, allowed_unexcused_absences INTEGER, late_after_minutes INTEGER NOT NULL DEFAULT 10,
  early_leave_before_minutes INTEGER NOT NULL DEFAULT 10, warning_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_attendance_policies_org ON attendance_policies(organization_id,status,name);

ALTER TABLE exams ADD COLUMN security_profile TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE exams ADD COLUMN allow_clipboard INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exams ADD COLUMN allow_paste INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exams ADD COLUMN allow_external_links INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN device_policy TEXT NOT NULL DEFAULT 'single_session';
ALTER TABLE exams ADD COLUMN resume_policy TEXT NOT NULL DEFAULT 'same_session';
ALTER TABLE exams ADD COLUMN calculator_policy TEXT NOT NULL DEFAULT 'disabled';
ALTER TABLE exams ADD COLUMN result_release_at TEXT;
ALTER TABLE exams ADD COLUMN freeze_from TEXT;
ALTER TABLE exams ADD COLUMN sealed_version_id TEXT;
ALTER TABLE exam_attempts ADD COLUMN exam_version_id TEXT;
ALTER TABLE exam_guest_attempts ADD COLUMN exam_version_id TEXT;
UPDATE exam_attempts SET exam_version_id=(SELECT sealed_version_id FROM exams WHERE exams.id=exam_attempts.exam_id) WHERE exam_version_id IS NULL;
UPDATE exam_guest_attempts SET exam_version_id=(SELECT sealed_version_id FROM exams WHERE exams.id=exam_guest_attempts.exam_id) WHERE exam_version_id IS NULL;

CREATE TABLE IF NOT EXISTS assessment_attempt_leases (
  attempt_id TEXT NOT NULL, source TEXT NOT NULL, session_id TEXT NOT NULL, claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, transferred_by TEXT, transfer_reason TEXT,
  PRIMARY KEY(attempt_id,source)
);
CREATE INDEX IF NOT EXISTS idx_assessment_attempt_leases_session ON assessment_attempt_leases(session_id,source);

CREATE TABLE IF NOT EXISTS assessment_response_files (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, source TEXT NOT NULL, question_id TEXT NOT NULL, file_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_assessment_response_files_attempt ON assessment_response_files(attempt_id,question_id,status);

ALTER TABLE assessment_question_bank ADD COLUMN field_code TEXT NOT NULL DEFAULT '';
ALTER TABLE assessment_question_bank ADD COLUMN content_domain TEXT NOT NULL DEFAULT '';
ALTER TABLE assessment_question_bank ADD COLUMN version_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assessment_question_bank ADD COLUMN last_used_at TEXT;

CREATE TABLE IF NOT EXISTS assessment_question_versions (
  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, version_no INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(question_id,version_no)
);
CREATE INDEX IF NOT EXISTS idx_assessment_question_versions_question ON assessment_question_versions(question_id,version_no DESC);

CREATE TABLE IF NOT EXISTS assessment_rubrics (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft', current_version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assessment_rubrics_org ON assessment_rubrics(organization_id,status,name);
CREATE TABLE IF NOT EXISTS assessment_rubric_versions (
  id TEXT PRIMARY KEY, rubric_id TEXT NOT NULL, version_no INTEGER NOT NULL, criteria_json TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(rubric_id,version_no),
  FOREIGN KEY(rubric_id) REFERENCES assessment_rubrics(id) ON DELETE CASCADE
);
ALTER TABLE assessment_manual_grades ADD COLUMN rubric_id TEXT;
ALTER TABLE assessment_manual_grades ADD COLUMN rubric_version INTEGER;

CREATE TABLE IF NOT EXISTS assessment_marking_records (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, question_id TEXT NOT NULL, marker_slot TEXT NOT NULL DEFAULT 'A',
  grader_user_id TEXT NOT NULL, score REAL, feedback TEXT NOT NULL DEFAULT '', rubric_scores_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_id,question_id,marker_slot)
);
CREATE INDEX IF NOT EXISTS idx_assessment_marking_queue ON assessment_marking_records(status,marker_slot,updated_at);

CREATE TABLE IF NOT EXISTS assessment_result_workflows (
  attempt_id TEXT PRIMARY KEY, source TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'submitted',
  approved_by TEXT, approved_at TEXT, published_at TEXT, final_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assessment_result_workflow_state ON assessment_result_workflows(state,updated_at);

CREATE TABLE IF NOT EXISTS exam_freeze_windows (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_exam_freeze_windows_exam ON exam_freeze_windows(exam_id,starts_at,ends_at);
