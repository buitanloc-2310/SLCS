
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO system_settings(key,value) VALUES
('public_intro_title','Một không gian học tập số được xây dựng để đồng hành lâu dài.'),
('public_intro_text','Trung tâm Học tập Số Sky First Network kết nối lớp học, học liệu, hoạt động trực tuyến, bài tập, kiểm tra và hỗ trợ trong một hành trình thống nhất.'),
('support_email','support@skyfirst.io.vn'),
('system_email','slc@skyfirst.io.vn'),
('account_request_enabled','1'),
('maintenance_mode','0'),
('maintenance_message','Hệ thống đang được bảo trì. Vui lòng quay lại sau.'),
('default_session_days','30');

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'draft',
  starts_at TEXT,
  ends_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status,created_at DESC);

CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO email_templates(key,subject,body_html) VALUES
('account_request_received','[Sky First] Xác nhận tiếp nhận yêu cầu cấp tài khoản',''),
('account_approved','[Sky First] Kích hoạt tài khoản SFN',''),
('account_needs_info','[Sky First] Yêu cầu bổ sung thông tin',''),
('account_rejected','[Sky First] Kết quả yêu cầu cấp tài khoản','');

CREATE TABLE IF NOT EXISTS admin_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity(created_at DESC);
