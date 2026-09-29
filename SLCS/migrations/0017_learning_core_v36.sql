-- SLCS V36 Learning Core: assignments, gradebook, progress and attendance
ALTER TABLE assignments ADD COLUMN category TEXT NOT NULL DEFAULT 'assignment';
ALTER TABLE assignments ADD COLUMN allow_late INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assignments ADD COLUMN max_resubmissions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assignments ADD COLUMN published INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS gradebook_categories (
 id TEXT PRIMARY KEY, class_id TEXT NOT NULL, name TEXT NOT NULL, weight REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gradebook_category_name ON gradebook_categories(class_id,name);

CREATE TABLE IF NOT EXISTS class_attendance_sessions (
 id TEXT PRIMARY KEY, class_id TEXT NOT NULL, title TEXT NOT NULL, starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ends_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE, FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS class_attendance_records (
 session_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'present', note TEXT NOT NULL DEFAULT '', marked_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(session_id,user_id), FOREIGN KEY(session_id) REFERENCES class_attendance_sessions(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class ON class_attendance_sessions(class_id,starts_at DESC);
