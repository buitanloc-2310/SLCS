
CREATE TABLE IF NOT EXISTS notification_center (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT NOT NULL DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notification_center_user ON notification_center(user_id,is_read,created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notes (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_notes_entity ON admin_notes(entity_type,entity_id,created_at DESC);

CREATE TABLE IF NOT EXISTS system_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO system_settings(key,value) VALUES
('site_name','Trung tâm Học tập Số Sky First Network'),
('site_name_en','Sky First Network Digital Learning Center'),
('public_about_title','Không gian học tập số cho hành trình phát triển dài hạn.'),
('public_about_text','Trung tâm Học tập Số Sky First Network được xây dựng như một không gian học tập và vận hành thống nhất, nơi người học có thể tham gia lớp, tiếp cận học liệu, làm bài tập, kiểm tra, học trực tuyến và nhận hỗ trợ trong cùng một hệ thống.'),
('allow_guest_live','1'),
('default_class_unit','Sky First Network'),
('footer_product_text','Một sản phẩm thuộc hệ sinh thái Sky First Network.'),
('footer_copyright','© 2026 Sky First Network. Mọi quyền được bảo lưu.');
