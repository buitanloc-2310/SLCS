// Production schema installer generated from the canonical migration set.
export const V11_SCHEMA_STAGES = [
  {
    "name": "0001_initial",
    "statements": [
      "CREATE TABLE IF NOT EXISTS counters (\n  key TEXT PRIMARY KEY,\n  value INTEGER NOT NULL DEFAULT 0\n);",
      "INSERT OR IGNORE INTO counters(key,value) VALUES('sfn_user',0);",
      "CREATE TABLE IF NOT EXISTS users (\n  id TEXT PRIMARY KEY,\n  sfn_no INTEGER NOT NULL UNIQUE CHECK(sfn_no BETWEEN 1 AND 10000),\n  sfn_id TEXT NOT NULL UNIQUE,\n  full_name TEXT NOT NULL,\n  email TEXT NOT NULL UNIQUE,\n  phone TEXT NOT NULL DEFAULT '',\n  role TEXT NOT NULL DEFAULT 'student',\n  status TEXT NOT NULL DEFAULT 'pending_activation',\n  avatar_key TEXT,\n  profile_json TEXT NOT NULL DEFAULT '{}',\n  password_hash TEXT NOT NULL DEFAULT '',\n  password_salt TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);",
      "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role,status);",
      "CREATE TRIGGER IF NOT EXISTS trg_users_max_10000\nBEFORE INSERT ON users\nWHEN (SELECT COUNT(*) FROM users) >= 10000\nBEGIN\n  SELECT RAISE(ABORT, 'SFN_ACCOUNT_LIMIT_10000');\nEND;",
      "CREATE TABLE IF NOT EXISTS account_requests (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  request_code TEXT NOT NULL UNIQUE,\n  full_name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  phone TEXT NOT NULL,\n  data_json TEXT NOT NULL DEFAULT '{}',\n  portrait_key TEXT NOT NULL,\n  student_card_key TEXT,\n  status TEXT NOT NULL DEFAULT 'pending',\n  reviewed_by TEXT,\n  reviewed_at TEXT,\n  approved_user_id TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_account_requests_status ON account_requests(status,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS activation_tokens (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  token TEXT NOT NULL UNIQUE,\n  user_id TEXT NOT NULL,\n  expires_at TEXT NOT NULL,\n  used_at TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE TABLE IF NOT EXISTS sessions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  token TEXT NOT NULL UNIQUE,\n  user_id TEXT NOT NULL,\n  ip_hash TEXT NOT NULL DEFAULT '',\n  user_agent TEXT NOT NULL DEFAULT '',\n  expires_at TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id,expires_at DESC);",
      "CREATE TABLE IF NOT EXISTS files (\n  id TEXT PRIMARY KEY,\n  owner_user_id TEXT,\n  r2_key TEXT NOT NULL UNIQUE,\n  name TEXT NOT NULL,\n  mime TEXT NOT NULL DEFAULT '',\n  size INTEGER NOT NULL DEFAULT 0,\n  visibility TEXT NOT NULL DEFAULT 'private',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_user_id,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS classes (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  description TEXT NOT NULL DEFAULT '',\n  unit TEXT NOT NULL DEFAULT '',\n  cover_key TEXT,\n  join_code TEXT NOT NULL UNIQUE,\n  owner_user_id TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE RESTRICT\n);",
      "CREATE TABLE IF NOT EXISTS class_members (\n  class_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  role TEXT NOT NULL DEFAULT 'student',\n  status TEXT NOT NULL DEFAULT 'active',\n  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(class_id,user_id),\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE INDEX IF NOT EXISTS idx_class_members_user ON class_members(user_id,status);",
      "CREATE TABLE IF NOT EXISTS class_posts (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  author_user_id TEXT NOT NULL,\n  body TEXT NOT NULL,\n  pinned INTEGER NOT NULL DEFAULT 0,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE TABLE IF NOT EXISTS materials (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  file_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  description TEXT NOT NULL DEFAULT '',\n  created_by TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT\n);",
      "CREATE TABLE IF NOT EXISTS assignments (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  type TEXT NOT NULL DEFAULT 'assignment',\n  title TEXT NOT NULL,\n  instructions TEXT NOT NULL DEFAULT '',\n  due_at TEXT,\n  points REAL NOT NULL DEFAULT 10,\n  created_by TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT\n);",
      "CREATE TABLE IF NOT EXISTS submissions (\n  id TEXT PRIMARY KEY,\n  assignment_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  text_answer TEXT NOT NULL DEFAULT '',\n  file_id TEXT,\n  status TEXT NOT NULL DEFAULT 'submitted',\n  score REAL,\n  feedback TEXT,\n  submitted_at TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(assignment_id,user_id),\n  FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,\n  FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE SET NULL\n);",
      "CREATE TABLE IF NOT EXISTS exams (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  instructions TEXT NOT NULL DEFAULT '',\n  duration_minutes INTEGER NOT NULL DEFAULT 30,\n  strict_mode INTEGER NOT NULL DEFAULT 0,\n  question_json TEXT NOT NULL DEFAULT '[]',\n  status TEXT NOT NULL DEFAULT 'draft',\n  created_by TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT\n);",
      "CREATE TABLE IF NOT EXISTS exam_attempts (\n  id TEXT PRIMARY KEY,\n  exam_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'in_progress',\n  started_at TEXT,\n  last_saved_at TEXT,\n  submitted_at TEXT,\n  answers_json TEXT NOT NULL DEFAULT '{}',\n  event_log_json TEXT NOT NULL DEFAULT '[]',\n  score REAL,\n  max_score REAL,\n  FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE INDEX IF NOT EXISTS idx_exam_attempts_user ON exam_attempts(user_id,status,started_at DESC);",
      "CREATE TABLE IF NOT EXISTS live_sessions (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  room_code TEXT NOT NULL UNIQUE,\n  started_by TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'scheduled',\n  scheduled_at TEXT,\n  started_at TEXT,\n  ended_at TEXT,\n  settings_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(started_by) REFERENCES users(id) ON DELETE RESTRICT\n);",
      "CREATE TABLE IF NOT EXISTS attendance (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  live_session_id TEXT NOT NULL,\n  user_id TEXT,\n  guest_name TEXT,\n  joined_at TEXT NOT NULL,\n  left_at TEXT,\n  seconds_present INTEGER NOT NULL DEFAULT 0,\n  status TEXT NOT NULL DEFAULT 'present',\n  FOREIGN KEY(live_session_id) REFERENCES live_sessions(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE TABLE IF NOT EXISTS support_tickets (\n  id TEXT PRIMARY KEY,\n  ticket_code TEXT NOT NULL UNIQUE,\n  requester_user_id TEXT NOT NULL,\n  category TEXT NOT NULL DEFAULT 'other',\n  subject TEXT NOT NULL,\n  message TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'new',\n  assigned_to TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(requester_user_id) REFERENCES users(id) ON DELETE CASCADE,\n  FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE TABLE IF NOT EXISTS audit_logs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  actor_user_id TEXT,\n  action TEXT NOT NULL,\n  entity_type TEXT,\n  entity_id TEXT,\n  data_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE TABLE IF NOT EXISTS policies (\n  key TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  body_html TEXT NOT NULL,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "INSERT OR IGNORE INTO policies(key,title,body_html) VALUES\n('privacy','Chính sách quyền riêng tư','<h2>Quyền riêng tư tại SLC</h2><p>SLC chỉ thu thập dữ liệu cần thiết để vận hành tài khoản, lớp học và hỗ trợ. Ảnh xác minh, bài nộp và dữ liệu riêng tư không được công khai mặc định.</p>'),\n('security','Chính sách bảo mật','<h2>Bảo mật tài khoản</h2><p>Không chia sẻ mật khẩu hoặc mã kích hoạt. Hệ thống ghi nhận phiên đăng nhập để hỗ trợ bảo vệ tài khoản.</p>'),\n('terms','Điều khoản sử dụng','<h2>Điều khoản sử dụng</h2><p>Người dùng có trách nhiệm sử dụng SLC đúng mục đích học tập, cộng đồng và quy định của Sky First Network.</p>');"
    ]
  },
  {
    "name": "0002_learning_plus",
    "statements": [
      "CREATE TABLE IF NOT EXISTS learning_units (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  position INTEGER NOT NULL DEFAULT 0,\n  status TEXT NOT NULL DEFAULT 'published',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE\n);",
      "CREATE TABLE IF NOT EXISTS lessons (\n  id TEXT PRIMARY KEY,\n  unit_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  body_html TEXT NOT NULL DEFAULT '',\n  source_material_id TEXT,\n  position INTEGER NOT NULL DEFAULT 0,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(unit_id) REFERENCES learning_units(id) ON DELETE CASCADE,\n  FOREIGN KEY(source_material_id) REFERENCES materials(id) ON DELETE SET NULL\n);",
      "CREATE TABLE IF NOT EXISTS lesson_progress (\n  lesson_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  progress_percent INTEGER NOT NULL DEFAULT 0,\n  completed_at TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(lesson_id,user_id),\n  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE TABLE IF NOT EXISTS quizzes (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  source_material_id TEXT,\n  title TEXT NOT NULL,\n  questions_json TEXT NOT NULL DEFAULT '[]',\n  status TEXT NOT NULL DEFAULT 'draft',\n  created_by TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(source_material_id) REFERENCES materials(id) ON DELETE SET NULL,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT\n);"
    ]
  },
  {
    "name": "0003_public_account_email",
    "statements": [
      "CREATE TABLE IF NOT EXISTS email_logs (\n  id TEXT PRIMARY KEY,\n  to_email TEXT NOT NULL,\n  subject TEXT NOT NULL,\n  status TEXT NOT NULL,\n  provider_message_id TEXT NOT NULL DEFAULT '',\n  error TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_email_logs_to_created\nON email_logs(to_email, created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_email_logs_status_created\nON email_logs(status, created_at DESC);"
    ]
  },
  {
    "name": "0004_admin_control_center",
    "statements": [
      "CREATE TABLE IF NOT EXISTS system_settings (\n  key TEXT PRIMARY KEY,\n  value TEXT NOT NULL DEFAULT '',\n  updated_by TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "INSERT OR IGNORE INTO system_settings(key,value) VALUES\n('public_intro_title','Một không gian học tập số được xây dựng để đồng hành lâu dài.'),\n('public_intro_text','Trung tâm Học tập Số Sky First Network kết nối lớp học, học liệu, hoạt động trực tuyến, bài tập, kiểm tra và hỗ trợ trong một hành trình thống nhất.'),\n('support_email','support@skyfirst.io.vn'),\n('system_email','slc@skyfirst.io.vn'),\n('account_request_enabled','1'),\n('maintenance_mode','0'),\n('maintenance_message','Hệ thống đang được bảo trì. Vui lòng quay lại sau.'),\n('default_session_days','30');",
      "CREATE TABLE IF NOT EXISTS announcements (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  body TEXT NOT NULL,\n  audience TEXT NOT NULL DEFAULT 'all',\n  status TEXT NOT NULL DEFAULT 'draft',\n  starts_at TEXT,\n  ends_at TEXT,\n  created_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS email_templates (\n  key TEXT PRIMARY KEY,\n  subject TEXT NOT NULL,\n  body_html TEXT NOT NULL,\n  enabled INTEGER NOT NULL DEFAULT 1,\n  updated_by TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "INSERT OR IGNORE INTO email_templates(key,subject,body_html) VALUES\n('account_request_received','[Sky First] Xác nhận tiếp nhận yêu cầu cấp tài khoản',''),\n('account_approved','[Sky First] Kích hoạt tài khoản SFN',''),\n('account_needs_info','[Sky First] Yêu cầu bổ sung thông tin',''),\n('account_rejected','[Sky First] Kết quả yêu cầu cấp tài khoản','');",
      "CREATE TABLE IF NOT EXISTS admin_activity (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  actor_user_id TEXT,\n  action TEXT NOT NULL,\n  detail_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity(created_at DESC);"
    ]
  },
  {
    "name": "0005_admin_supercenter",
    "statements": [
      "CREATE TABLE IF NOT EXISTS notification_center (\n  id TEXT PRIMARY KEY,\n  user_id TEXT,\n  title TEXT NOT NULL,\n  body TEXT NOT NULL,\n  type TEXT NOT NULL DEFAULT 'info',\n  link TEXT NOT NULL DEFAULT '',\n  is_read INTEGER NOT NULL DEFAULT 0,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE INDEX IF NOT EXISTS idx_notification_center_user ON notification_center(user_id,is_read,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS admin_notes (\n  id TEXT PRIMARY KEY,\n  entity_type TEXT NOT NULL,\n  entity_id TEXT NOT NULL,\n  note TEXT NOT NULL,\n  created_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE INDEX IF NOT EXISTS idx_admin_notes_entity ON admin_notes(entity_type,entity_id,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS system_jobs (\n  id TEXT PRIMARY KEY,\n  job_type TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'queued',\n  detail_json TEXT NOT NULL DEFAULT '{}',\n  created_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  finished_at TEXT,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n);",
      "INSERT OR IGNORE INTO system_settings(key,value) VALUES\n('site_name','Trung tâm Học tập Số Sky First Network'),\n('site_name_en','Sky First Network Digital Learning Center'),\n('public_about_title','Không gian học tập số cho hành trình phát triển dài hạn.'),\n('public_about_text','Trung tâm Học tập Số Sky First Network được xây dựng như một không gian học tập và vận hành thống nhất, nơi người học có thể tham gia lớp, tiếp cận học liệu, làm bài tập, kiểm tra, học trực tuyến và nhận hỗ trợ trong cùng một hệ thống.'),\n('allow_guest_live','1'),\n('default_class_unit','Sky First Network'),\n('footer_product_text','Một sản phẩm thuộc hệ sinh thái Sky First Network.'),\n('footer_copyright','© 2026 Sky First Network. Mọi quyền được bảo lưu.');"
    ]
  },
  {
    "name": "0006_v10_hardening",
    "statements": [
      "CREATE TABLE IF NOT EXISTS login_throttle (\n  key TEXT PRIMARY KEY,\n  attempts INTEGER NOT NULL DEFAULT 0,\n  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  blocked_until TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE TABLE IF NOT EXISTS live_access_tokens (\n  token TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  user_id TEXT,\n  guest_name TEXT NOT NULL DEFAULT '',\n  role TEXT NOT NULL DEFAULT 'guest',\n  expires_at TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_access_tokens_class\nON live_access_tokens(class_id,expires_at);",
      "CREATE TABLE IF NOT EXISTS class_messages (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  body TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  edited_at TEXT,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE INDEX IF NOT EXISTS idx_class_messages_class\nON class_messages(class_id,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS class_events (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  details TEXT NOT NULL DEFAULT '',\n  event_type TEXT NOT NULL DEFAULT 'class',\n  starts_at TEXT NOT NULL,\n  ends_at TEXT,\n  created_by TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT\n);",
      "CREATE INDEX IF NOT EXISTS idx_class_events_class\nON class_events(class_id,starts_at);",
      "CREATE TABLE IF NOT EXISTS system_incidents (\n  id TEXT PRIMARY KEY,\n  severity TEXT NOT NULL DEFAULT 'info',\n  component TEXT NOT NULL,\n  message TEXT NOT NULL,\n  detail_json TEXT NOT NULL DEFAULT '{}',\n  resolved_at TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_system_incidents_created\nON system_incidents(created_at DESC);",
      "INSERT OR IGNORE INTO system_settings(key,value) VALUES\n('platform_version','V10'),\n('login_rate_limit','10'),\n('max_upload_mb','50'),\n('account_portrait_max_mb','5'),\n('account_document_max_mb','10'),\n('public_status_text','Hệ thống đang hoạt động ổn định.'),\n('live_mesh_max_peers','18');"
    ]
  },
  {
    "name": "0007_class_plus",
    "statements": [
      "CREATE TABLE IF NOT EXISTS class_settings (\n  class_id TEXT PRIMARY KEY,\n  class_type TEXT NOT NULL DEFAULT 'standard',\n  access_mode TEXT NOT NULL DEFAULT 'code',\n  visibility TEXT NOT NULL DEFAULT 'private',\n  live_mode TEXT NOT NULL DEFAULT 'classroom',\n  max_members INTEGER NOT NULL DEFAULT 200,\n  features_json TEXT NOT NULL DEFAULT '{\"feed\":true,\"materials\":true,\"assignments\":true,\"exams\":true,\"chat\":true,\"schedule\":true,\"members\":true,\"live\":true}',\n  updated_by TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE\n);",
      "CREATE TABLE IF NOT EXISTS class_access_codes (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  code TEXT NOT NULL UNIQUE,\n  label TEXT NOT NULL DEFAULT '',\n  member_role TEXT NOT NULL DEFAULT 'student',\n  max_uses INTEGER NOT NULL DEFAULT 0,\n  used_count INTEGER NOT NULL DEFAULT 0,\n  expires_at TEXT,\n  enabled INTEGER NOT NULL DEFAULT 1,\n  created_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE INDEX IF NOT EXISTS idx_class_access_codes_class ON class_access_codes(class_id,enabled,created_at DESC);"
    ]
  },
  {
    "name": "0007_classroom_experience",
    "statements": [
      "CREATE TABLE IF NOT EXISTS class_profiles (\n  class_id TEXT PRIMARY KEY,\n  class_type TEXT NOT NULL DEFAULT 'class',\n  theme TEXT NOT NULL DEFAULT 'aurora',\n  room_mode TEXT NOT NULL DEFAULT 'classroom',\n  capacity INTEGER NOT NULL DEFAULT 40,\n  allow_guests INTEGER NOT NULL DEFAULT 1,\n  updated_by TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE TABLE IF NOT EXISTS class_invite_codes (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  code TEXT NOT NULL UNIQUE,\n  label TEXT NOT NULL DEFAULT '',\n  target_role TEXT NOT NULL DEFAULT 'student',\n  max_uses INTEGER NOT NULL DEFAULT 0,\n  use_count INTEGER NOT NULL DEFAULT 0,\n  expires_at TEXT,\n  active INTEGER NOT NULL DEFAULT 1,\n  created_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL\n);",
      "CREATE INDEX IF NOT EXISTS idx_class_invite_codes_class ON class_invite_codes(class_id,active,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS live_room_settings (\n  class_id TEXT PRIMARY KEY,\n  room_mode TEXT NOT NULL DEFAULT 'classroom',\n  waiting_room INTEGER NOT NULL DEFAULT 0,\n  chat_enabled INTEGER NOT NULL DEFAULT 1,\n  reactions_enabled INTEGER NOT NULL DEFAULT 1,\n  hand_raise_enabled INTEGER NOT NULL DEFAULT 1,\n  updated_by TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,\n  FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL\n);"
    ]
  },
  {
    "name": "0007_live_runtime",
    "statements": [
      "-- Runtime signaling fallback for Cloudflare Pages (small-room WebRTC)\nCREATE TABLE IF NOT EXISTS live_runtime_participants (id TEXT PRIMARY KEY,class_id TEXT NOT NULL,access_token TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'guest',joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,left_at TEXT,mic_on INTEGER NOT NULL DEFAULT 0,cam_on INTEGER NOT NULL DEFAULT 0,screen_on INTEGER NOT NULL DEFAULT 0,hand_raised INTEGER NOT NULL DEFAULT 0,kicked_at TEXT);",
      "CREATE INDEX IF NOT EXISTS idx_live_runtime_participants_room_seen ON live_runtime_participants(class_id,last_seen);",
      "CREATE TABLE IF NOT EXISTS live_runtime_signals (id INTEGER PRIMARY KEY AUTOINCREMENT,class_id TEXT NOT NULL,from_peer TEXT NOT NULL,to_peer TEXT NOT NULL,type TEXT NOT NULL,payload_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
      "CREATE INDEX IF NOT EXISTS idx_live_runtime_signals_to ON live_runtime_signals(class_id,to_peer,id);",
      "CREATE TABLE IF NOT EXISTS live_runtime_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,class_id TEXT NOT NULL,peer_id TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'guest',body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
      "CREATE INDEX IF NOT EXISTS idx_live_runtime_messages_room ON live_runtime_messages(class_id,id);"
    ]
  },
  {
    "name": "0008_realtime_sfu_foundation",
    "statements": [
      "-- V12: Cloudflare Realtime SFU foundation for skyfirsthoc.\n-- Safe CREATE-only migration. No existing classroom data is removed.\nCREATE TABLE IF NOT EXISTS live_sfu_sessions (\n  session_id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  owner_key TEXT NOT NULL,\n  owner_name TEXT NOT NULL DEFAULT '',\n  role TEXT NOT NULL DEFAULT 'student',\n  status TEXT NOT NULL DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  ended_at TEXT\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_sfu_sessions_room ON live_sfu_sessions(class_id,status,last_seen);",
      "CREATE TABLE IF NOT EXISTS live_sfu_tracks (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  session_id TEXT NOT NULL,\n  track_name TEXT NOT NULL,\n  mid TEXT,\n  kind TEXT NOT NULL DEFAULT '',\n  source TEXT NOT NULL DEFAULT '',\n  owner_key TEXT NOT NULL,\n  owner_name TEXT NOT NULL DEFAULT '',\n  role TEXT NOT NULL DEFAULT 'student',\n  active INTEGER NOT NULL DEFAULT 1,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(session_id,track_name)\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_sfu_tracks_room ON live_sfu_tracks(class_id,active,updated_at);",
      "CREATE INDEX IF NOT EXISTS idx_live_sfu_tracks_session ON live_sfu_tracks(session_id,active);"
    ]
  },
  {
    "name": "0009_v13_school_platform",
    "statements": [
      "CREATE TABLE IF NOT EXISTS class_live_settings (\n  class_id TEXT PRIMARY KEY,\n  waiting_room INTEGER NOT NULL DEFAULT 1,\n  allow_student_mic INTEGER NOT NULL DEFAULT 1,\n  allow_student_camera INTEGER NOT NULL DEFAULT 1,\n  allow_student_share INTEGER NOT NULL DEFAULT 0,\n  allow_chat INTEGER NOT NULL DEFAULT 1,\n  allow_reactions INTEGER NOT NULL DEFAULT 1,\n  allow_anonymous_pulse INTEGER NOT NULL DEFAULT 1,\n  theme TEXT NOT NULL DEFAULT 'sky',\n  accent TEXT NOT NULL DEFAULT '#4263eb',\n  background TEXT NOT NULL DEFAULT '#f5f7fb',\n  surface TEXT NOT NULL DEFAULT '#ffffff',\n  layout_default TEXT NOT NULL DEFAULT 'auto',\n  max_visible_videos INTEGER NOT NULL DEFAULT 12,\n  adaptive_video INTEGER NOT NULL DEFAULT 1,\n  confidence_camera INTEGER NOT NULL DEFAULT 1,\n  feature_flags_json TEXT NOT NULL DEFAULT '{}',\n  updated_by TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE TABLE IF NOT EXISTS live_attendance (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  user_key TEXT NOT NULL,\n  user_id TEXT,\n  display_name TEXT NOT NULL DEFAULT '',\n  role TEXT NOT NULL DEFAULT 'student',\n  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  left_at TEXT,\n  reconnect_count INTEGER NOT NULL DEFAULT 0,\n  device_json TEXT NOT NULL DEFAULT '{}'\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_attendance_class ON live_attendance(class_id,joined_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_live_attendance_open ON live_attendance(class_id,user_key,left_at,last_seen);",
      "CREATE TABLE IF NOT EXISTS live_polls (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  question TEXT NOT NULL,\n  options_json TEXT NOT NULL DEFAULT '[]',\n  anonymous INTEGER NOT NULL DEFAULT 0,\n  status TEXT NOT NULL DEFAULT 'open',\n  created_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  closed_at TEXT\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_polls_class ON live_polls(class_id,status,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS live_poll_answers (\n  poll_id TEXT NOT NULL,\n  responder_key TEXT NOT NULL,\n  user_id TEXT,\n  option_index INTEGER NOT NULL,\n  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(poll_id,responder_key)\n);",
      "CREATE TABLE IF NOT EXISTS live_resources (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  title TEXT NOT NULL,\n  url TEXT NOT NULL DEFAULT '',\n  resource_type TEXT NOT NULL DEFAULT 'link',\n  pinned INTEGER NOT NULL DEFAULT 0,\n  created_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_resources_class ON live_resources(class_id,pinned DESC,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS live_room_events (\n  id TEXT PRIMARY KEY,\n  class_id TEXT NOT NULL,\n  event_type TEXT NOT NULL,\n  actor_key TEXT,\n  actor_name TEXT NOT NULL DEFAULT '',\n  detail_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_room_events_class ON live_room_events(class_id,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS live_telemetry_hourly (\n  bucket TEXT NOT NULL,\n  class_id TEXT NOT NULL,\n  metric TEXT NOT NULL,\n  value INTEGER NOT NULL DEFAULT 0,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(bucket,class_id,metric)\n);"
    ]
  },
  {
    "name": "0010_vplus_foundation",
    "statements": [
      "-- Sky First School VPLUS foundation. CREATE-only and safe to apply once through D1 migrations.\nCREATE TABLE IF NOT EXISTS platform_events (\n  id TEXT PRIMARY KEY,\n  tenant_key TEXT NOT NULL DEFAULT 'sky-first',\n  class_id TEXT,\n  user_id TEXT,\n  event_type TEXT NOT NULL,\n  event_source TEXT NOT NULL DEFAULT 'platform',\n  detail_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_platform_events_class_time ON platform_events(class_id,created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_platform_events_type_time ON platform_events(event_type,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS organizations (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  slug TEXT NOT NULL UNIQUE,\n  status TEXT NOT NULL DEFAULT 'active',\n  plan TEXT NOT NULL DEFAULT 'community',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE TABLE IF NOT EXISTS organization_members (\n  organization_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  role TEXT NOT NULL DEFAULT 'member',\n  status TEXT NOT NULL DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(organization_id,user_id)\n);",
      "CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id,status);",
      "CREATE TABLE IF NOT EXISTS organization_domains (\n  domain TEXT PRIMARY KEY,\n  organization_id TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE TABLE IF NOT EXISTS organization_settings (\n  organization_id TEXT NOT NULL,\n  key TEXT NOT NULL,\n  value TEXT NOT NULL DEFAULT '',\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(organization_id,key)\n);",
      "CREATE TABLE IF NOT EXISTS usage_hourly (\n  organization_id TEXT NOT NULL DEFAULT 'sky-first',\n  bucket TEXT NOT NULL,\n  metric TEXT NOT NULL,\n  value INTEGER NOT NULL DEFAULT 0,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(organization_id,bucket,metric)\n);"
    ]
  },
  {
    "name": "0011_platform_foundation_1_35",
    "statements": [
      "-- SLC master requirements 1-35: additive foundation only. No destructive changes.\nCREATE TABLE IF NOT EXISTS organization_entitlements (\n  organization_id TEXT NOT NULL,\n  capability TEXT NOT NULL,\n  enabled INTEGER NOT NULL DEFAULT 1,\n  quota_value INTEGER,\n  expires_at TEXT,\n  source TEXT NOT NULL DEFAULT 'grant',\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(organization_id,capability)\n);",
      "CREATE TABLE IF NOT EXISTS user_preferences (\n  user_id TEXT NOT NULL,\n  key TEXT NOT NULL,\n  value TEXT NOT NULL DEFAULT '',\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(user_id,key)\n);",
      "CREATE TABLE IF NOT EXISTS calendar_events (\n  id TEXT PRIMARY KEY,\n  organization_id TEXT NOT NULL DEFAULT 'sky-first',\n  class_id TEXT,\n  title TEXT NOT NULL,\n  event_type TEXT NOT NULL DEFAULT 'event',\n  starts_at TEXT NOT NULL,\n  ends_at TEXT,\n  status TEXT NOT NULL DEFAULT 'scheduled',\n  created_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_calendar_events_org_time ON calendar_events(organization_id,starts_at);",
      "CREATE TABLE IF NOT EXISTS support_ticket_messages (\n  id TEXT PRIMARY KEY,\n  ticket_id TEXT NOT NULL,\n  author_user_id TEXT,\n  body TEXT NOT NULL,\n  file_id TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE\n);",
      "CREATE TABLE IF NOT EXISTS profile_visibility (\n  user_id TEXT NOT NULL,\n  field TEXT NOT NULL,\n  visibility TEXT NOT NULL DEFAULT 'members',\n  PRIMARY KEY(user_id,field)\n);",
      "INSERT OR IGNORE INTO organizations(id,name,slug,status,plan) VALUES('sky-first','Sky First Network','sky-first','active','community');",
      "INSERT OR IGNORE INTO organization_entitlements(organization_id,capability,enabled,source) VALUES\n('sky-first','live.use',1,'internal'),('sky-first','guest.access',1,'internal'),('sky-first','teaching.core',1,'internal');"
    ]
  },
  {
    "name": "0012_platform_foundation_36_70",
    "statements": [
      "-- SLC master requirements 36-70: additive multi-organization, entitlement, subscription and audit foundation.\nALTER TABLE classes ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'sky-first';",
      "CREATE TABLE IF NOT EXISTS organization_subscriptions (\n  organization_id TEXT PRIMARY KEY,\n  plan_code TEXT NOT NULL DEFAULT 'community',\n  status TEXT NOT NULL DEFAULT 'active',\n  starts_at TEXT,\n  renews_at TEXT,\n  expires_at TEXT,\n  source TEXT NOT NULL DEFAULT 'grant',\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE TABLE IF NOT EXISTS organization_usage (\n  organization_id TEXT NOT NULL,\n  metric TEXT NOT NULL,\n  value INTEGER NOT NULL DEFAULT 0,\n  period_key TEXT NOT NULL DEFAULT 'current',\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(organization_id,metric,period_key)\n);",
      "CREATE TABLE IF NOT EXISTS scoped_role_grants (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  scope_type TEXT NOT NULL,\n  scope_id TEXT NOT NULL,\n  role TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'active',\n  granted_by TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(user_id,scope_type,scope_id,role)\n);",
      "CREATE INDEX IF NOT EXISTS idx_scoped_role_grants_user ON scoped_role_grants(user_id,status);",
      "CREATE TABLE IF NOT EXISTS organization_branding (\n  organization_id TEXT PRIMARY KEY,\n  logo_key TEXT,\n  cover_key TEXT,\n  accent TEXT NOT NULL DEFAULT '#1677ff',\n  support_email TEXT,\n  description TEXT,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE TABLE IF NOT EXISTS platform_audit_v2 (\n  id TEXT PRIMARY KEY,\n  actor_user_id TEXT,\n  action TEXT NOT NULL,\n  target_type TEXT,\n  target_id TEXT,\n  organization_id TEXT,\n  result TEXT NOT NULL DEFAULT 'ok',\n  request_id TEXT,\n  metadata_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_platform_audit_v2_time ON platform_audit_v2(created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_platform_audit_v2_org ON platform_audit_v2(organization_id,created_at DESC);",
      "INSERT OR IGNORE INTO organization_subscriptions(organization_id,plan_code,status,source) VALUES('sky-first','internal','active','internal');",
      "INSERT OR IGNORE INTO organization_entitlements(organization_id,capability,enabled,quota_value,source) VALUES\n('sky-first','platform.organization.manage',1,NULL,'internal'),\n('sky-first','platform.entitlement.manage',1,NULL,'internal'),\n('sky-first','organization.branding',1,NULL,'internal'),\n('sky-first','website.studio',1,NULL,'internal'),\n('sky-first','beauty.studio.advanced',1,NULL,'internal'),\n('sky-first','live.capacity',1,120,'internal'),\n('sky-first','classes',1,10000,'internal'),\n('sky-first','members',1,10000,'internal'),\n('sky-first','storage.bytes',1,107374182400,'internal');"
    ]
  },
  {
    "name": "0013_pages_realtime_fallback",
    "statements": [
      "-- Pages-compatible realtime signaling fallback. Additive only; no existing data is changed.\nCREATE TABLE IF NOT EXISTS live_signal_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  class_id TEXT NOT NULL,\n  sender_key TEXT NOT NULL,\n  sender_name TEXT NOT NULL DEFAULT '',\n  sender_role TEXT NOT NULL DEFAULT 'guest',\n  target_key TEXT,\n  event_type TEXT NOT NULL,\n  payload_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_signal_events_class_id ON live_signal_events(class_id,id);",
      "CREATE TABLE IF NOT EXISTS live_signal_presence (\n  class_id TEXT NOT NULL,\n  peer_key TEXT NOT NULL,\n  display_name TEXT NOT NULL DEFAULT '',\n  role TEXT NOT NULL DEFAULT 'guest',\n  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(class_id,peer_key)\n);",
      "CREATE INDEX IF NOT EXISTS idx_live_signal_presence_seen ON live_signal_presence(class_id,last_seen);"
    ]
  },
  {
    "name": "0014_exam_center_v32",
    "statements": [
      "-- V32 Exam Center: strict proctoring lifecycle, scheduling, grading workflow and audit.\nALTER TABLE exams ADD COLUMN opens_at TEXT;",
      "ALTER TABLE exams ADD COLUMN closes_at TEXT;",
      "ALTER TABLE exams ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE exams ADD COLUMN show_score INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE exams ADD COLUMN fullscreen_required INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE exams ADD COLUMN terminate_on_exit INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE exam_attempts ADD COLUMN closed_reason TEXT;",
      "ALTER TABLE exam_attempts ADD COLUMN closed_at TEXT;",
      "ALTER TABLE exam_attempts ADD COLUMN reviewed_by TEXT;",
      "ALTER TABLE exam_attempts ADD COLUMN reviewed_at TEXT;",
      "ALTER TABLE exam_attempts ADD COLUMN teacher_feedback TEXT NOT NULL DEFAULT '';",
      "CREATE TABLE IF NOT EXISTS exam_audit_log (\n id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, attempt_id TEXT, actor_user_id TEXT,\n event_type TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,\n FOREIGN KEY(attempt_id) REFERENCES exam_attempts(id) ON DELETE SET NULL\n);",
      "CREATE INDEX IF NOT EXISTS idx_exam_audit_exam ON exam_audit_log(exam_id,created_at DESC);"
    ]
  },
  {
    "name": "0015_remove_legacy_assistant_tables",
    "statements": [
      "-- V32 decommission: remove legacy assistant-era storage from already deployed databases.\nDROP TABLE IF EXISTS ai_rate_limits;",
      "DROP TABLE IF EXISTS ai_action_requests;",
      "DROP TABLE IF EXISTS ai_audit;",
      "DROP TABLE IF EXISTS ai_messages;",
      "DROP TABLE IF EXISTS ai_conversations;",
      "DELETE FROM organization_entitlements WHERE capability='ai.use';"
    ]
  },
  {
    "name": "0016_assessment_engine_v34",
    "statements": [
      "-- V34: generalize Exam Center into reusable Assessment Engine.\nALTER TABLE exams ADD COLUMN assessment_type TEXT NOT NULL DEFAULT 'class_test';",
      "ALTER TABLE exams ADD COLUMN assessment_label TEXT NOT NULL DEFAULT 'Kiểm tra lớp học';",
      "ALTER TABLE exams ADD COLUMN center_label TEXT NOT NULL DEFAULT 'Trung tâm Đánh giá';",
      "CREATE INDEX IF NOT EXISTS idx_exams_assessment_type ON exams(assessment_type,status);"
    ]
  },
  {
    "name": "0017_learning_core_v36",
    "statements": [
      "-- SLCS V36 Learning Core: assignments, gradebook, progress and attendance\nALTER TABLE assignments ADD COLUMN category TEXT NOT NULL DEFAULT 'assignment';",
      "ALTER TABLE assignments ADD COLUMN allow_late INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE assignments ADD COLUMN max_resubmissions INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE assignments ADD COLUMN published INTEGER NOT NULL DEFAULT 1;",
      "CREATE TABLE IF NOT EXISTS gradebook_categories (\n id TEXT PRIMARY KEY, class_id TEXT NOT NULL, name TEXT NOT NULL, weight REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE\n);",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_gradebook_category_name ON gradebook_categories(class_id,name);",
      "CREATE TABLE IF NOT EXISTS class_attendance_sessions (\n id TEXT PRIMARY KEY, class_id TEXT NOT NULL, title TEXT NOT NULL, starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ends_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE, FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT\n);",
      "CREATE TABLE IF NOT EXISTS class_attendance_records (\n session_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'present', note TEXT NOT NULL DEFAULT '', marked_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n PRIMARY KEY(session_id,user_id), FOREIGN KEY(session_id) REFERENCES class_attendance_sessions(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n);",
      "CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class ON class_attendance_sessions(class_id,starts_at DESC);"
    ]
  },
  {
    "name": "0018_assessment_max_v37",
    "statements": [
      "-- V37 Assessment MAX foundation: reusable bank, sections, manual grading, appeals and receipts.\nCREATE TABLE IF NOT EXISTS assessment_question_bank (\n  id TEXT PRIMARY KEY, organization_id TEXT, owner_user_id TEXT NOT NULL,\n  subject TEXT, grade_level TEXT, topic TEXT, lesson TEXT, difficulty TEXT NOT NULL DEFAULT 'medium',\n  type TEXT NOT NULL, question TEXT NOT NULL, options_json TEXT NOT NULL DEFAULT '[]', answer_json TEXT,\n  explanation TEXT, points REAL NOT NULL DEFAULT 1, tags_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_assessment_bank_filter ON assessment_question_bank(organization_id,subject,topic,difficulty,status);",
      "CREATE TABLE IF NOT EXISTS assessment_sections (\n  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, title TEXT NOT NULL, instructions TEXT, position INTEGER NOT NULL DEFAULT 0,\n  points REAL, time_limit_minutes INTEGER, navigation_mode TEXT NOT NULL DEFAULT 'free', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_assessment_sections_exam ON assessment_sections(exam_id,position);",
      "CREATE TABLE IF NOT EXISTS assessment_manual_grades (\n  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, question_id TEXT NOT NULL, grader_user_id TEXT NOT NULL,\n  score REAL, feedback TEXT, rubric_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(attempt_id,question_id)\n);",
      "CREATE TABLE IF NOT EXISTS assessment_appeals (\n  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',\n  resolution TEXT, resolved_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT\n);",
      "CREATE TABLE IF NOT EXISTS assessment_receipts (\n  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE, receipt_code TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);"
    ]
  },
  {
    "name": "0019_website_studio_v38",
    "statements": [
      "-- V38 Website Studio MAX: immutable snapshots for revision history.\nCREATE TABLE IF NOT EXISTS website_revisions (\n  id TEXT PRIMARY KEY,\n  snapshot_json TEXT NOT NULL,\n  note TEXT DEFAULT '',\n  created_by TEXT,\n  created_at TEXT DEFAULT CURRENT_TIMESTAMP\n);",
      "CREATE INDEX IF NOT EXISTS idx_website_revisions_created ON website_revisions(created_at DESC);"
    ]
  },
  {
    "name": "0020_operations_v39",
    "statements": [
      "-- V39 IAM + Organization + Automation + Analytics foundation\nCREATE TABLE IF NOT EXISTS custom_roles (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', name TEXT NOT NULL, description TEXT DEFAULT '', created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);",
      "CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT NOT NULL, permission TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(role_id,permission));",
      "CREATE TABLE IF NOT EXISTS user_role_assignments (organization_id TEXT NOT NULL DEFAULT 'sky-first', user_id TEXT NOT NULL, role_id TEXT NOT NULL, assigned_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(organization_id,user_id,role_id));",
      "CREATE TABLE IF NOT EXISTS automation_rules (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', name TEXT NOT NULL, trigger_key TEXT NOT NULL, action_key TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);",
      "CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON automation_rules(organization_id,enabled);",
      "CREATE TABLE IF NOT EXISTS automation_runs (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, organization_id TEXT NOT NULL DEFAULT 'sky-first', status TEXT NOT NULL, detail_json TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT);",
      "CREATE TABLE IF NOT EXISTS analytics_events (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', user_id TEXT, event_key TEXT NOT NULL, entity_type TEXT, entity_id TEXT, value_num REAL, meta_json TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP);",
      "CREATE INDEX IF NOT EXISTS idx_analytics_events_org_time ON analytics_events(organization_id,created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_analytics_events_key_time ON analytics_events(event_key,created_at DESC);"
    ]
  },
  {
    "name": "0021_learning_operations_complete",
    "statements": [
      "CREATE TABLE IF NOT EXISTS certificates (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'sky-first', user_id TEXT NOT NULL, class_id TEXT, title TEXT NOT NULL, certificate_code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'issued', payload_json TEXT NOT NULL DEFAULT '{}', issued_by TEXT, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT, revoke_reason TEXT);",
      "CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id,issued_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_certificates_org ON certificates(organization_id,issued_at DESC);",
      "CREATE TABLE IF NOT EXISTS grade_change_log (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, user_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, old_score REAL, new_score REAL, note TEXT NOT NULL DEFAULT '', changed_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
      "CREATE INDEX IF NOT EXISTS idx_grade_change_class ON grade_change_log(class_id,created_at DESC);",
      "CREATE TABLE IF NOT EXISTS resource_folders (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, name TEXT NOT NULL, parent_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
      "CREATE INDEX IF NOT EXISTS idx_resource_folders_class ON resource_folders(class_id,parent_id,sort_order);"
    ]

  }
  ,{
    "name": "0022_assessment_center_complete",
    "statements": [
    "-- V40 Assessment Center Complete: flexible timing, public invitations, guest candidates and resilient attempts.\nALTER TABLE exams ADD COLUMN time_limit_enabled INTEGER NOT NULL DEFAULT 1;",
    "ALTER TABLE exams ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE exams ADD COLUMN public_token TEXT;",
    "ALTER TABLE exams ADD COLUMN hide_schedule INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE exams ADD COLUMN require_email_verify INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE exams ADD COLUMN shuffle_questions INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE exams ADD COLUMN shuffle_options INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE exams ADD COLUMN updated_at TEXT;",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_exams_public_token ON exams(public_token) WHERE public_token IS NOT NULL;",
    "CREATE TABLE IF NOT EXISTS exam_guest_attempts (\n id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, access_key TEXT NOT NULL UNIQUE,\n full_name TEXT NOT NULL, email TEXT NOT NULL, candidate_code TEXT, class_name TEXT,\n status TEXT NOT NULL DEFAULT 'in_progress', started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n last_saved_at TEXT, submitted_at TEXT, answers_json TEXT NOT NULL DEFAULT '{}', event_log_json TEXT NOT NULL DEFAULT '[]',\n score REAL, max_score REAL, closed_reason TEXT, closed_at TEXT,\n FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE\n);",
    "CREATE INDEX IF NOT EXISTS idx_guest_exam ON exam_guest_attempts(exam_id,started_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_guest_email ON exam_guest_attempts(email,exam_id);"
]
  },
  {
    "name": "0023_assessment_governance_v42",
    "statements": [
      "ALTER TABLE exams ADD COLUMN version_no INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE exams ADD COLUMN blueprint_json TEXT NOT NULL DEFAULT '{}';",
      "ALTER TABLE exams ADD COLUMN result_policy TEXT NOT NULL DEFAULT 'score_after_submit';",
      "ALTER TABLE exams ADD COLUMN scope_level TEXT NOT NULL DEFAULT 'class';",
      "ALTER TABLE exam_attempts ADD COLUMN question_snapshot_json TEXT;",
      "ALTER TABLE exam_attempts ADD COLUMN extra_time_minutes INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE exam_attempts ADD COLUMN invalidated_at TEXT;",
      "ALTER TABLE exam_guest_attempts ADD COLUMN question_snapshot_json TEXT;",
      "ALTER TABLE exam_guest_attempts ADD COLUMN extra_time_minutes INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE exam_guest_attempts ADD COLUMN invalidated_at TEXT;",
      "CREATE INDEX IF NOT EXISTS idx_exam_attempt_status ON exam_attempts(exam_id,status,last_saved_at);",
      "CREATE INDEX IF NOT EXISTS idx_exam_guest_status ON exam_guest_attempts(exam_id,status,last_saved_at);"
    ]
  }  ,{
    "name": "0024_red_orange_hardening",
    "statements": [
      "ALTER TABLE submissions ADD COLUMN submission_count INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE live_signal_presence ADD COLUMN admitted INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE live_access_tokens ADD COLUMN admitted INTEGER NOT NULL DEFAULT 1;",
      "CREATE INDEX IF NOT EXISTS idx_live_signal_presence_admitted ON live_signal_presence(class_id,admitted,last_seen);",
      "CREATE TABLE IF NOT EXISTS assessment_email_verifications (id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, verified_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
      "CREATE INDEX IF NOT EXISTS idx_assessment_email_verify ON assessment_email_verifications(exam_id,email,created_at DESC);"
    ]
  }
  ,{
    "name": "0025_assessment_integrity_v43",
    "statements": [
      "CREATE TABLE IF NOT EXISTS assessment_candidates (id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL, candidate_code TEXT NOT NULL, class_name TEXT, status TEXT NOT NULL DEFAULT 'eligible', accommodation_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(exam_id,candidate_code), FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE);",
      "CREATE INDEX IF NOT EXISTS idx_assessment_candidates_identity ON assessment_candidates(exam_id,email,candidate_code,status);",
      "CREATE TABLE IF NOT EXISTS assessment_rate_limits (bucket TEXT NOT NULL, subject_hash TEXT NOT NULL, window_start TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(bucket,subject_hash,window_start));",
      "CREATE TABLE IF NOT EXISTS assessment_incidents (id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, attempt_id TEXT, source TEXT NOT NULL DEFAULT 'internal', category TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', detail TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_by TEXT, resolved_by TEXT, resolution TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT, FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE);",
      "CREATE INDEX IF NOT EXISTS idx_assessment_incidents_exam ON assessment_incidents(exam_id,status,created_at DESC);"
    ]
  }
,
  {
    "name": "0026_assessment_professional_v44",
    "statements": [
      "ALTER TABLE exams ADD COLUMN review_policy TEXT NOT NULL DEFAULT 'none';",
      "ALTER TABLE exams ADD COLUMN review_opens_at TEXT;",
      "ALTER TABLE exams ADD COLUMN review_closes_at TEXT;",
      "ALTER TABLE exams ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'draft';",
      "ALTER TABLE exams ADD COLUMN approved_by TEXT;",
      "ALTER TABLE exams ADD COLUMN approved_at TEXT;",
      "ALTER TABLE exams ADD COLUMN published_at TEXT;",
      "ALTER TABLE exams ADD COLUMN owner_user_id TEXT;",
      "ALTER TABLE exam_attempts ADD COLUMN answer_revision INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE exam_guest_attempts ADD COLUMN answer_revision INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE assessment_question_bank ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'draft';",
      "ALTER TABLE assessment_question_bank ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE assessment_question_bank ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE assessment_question_bank ADD COLUMN response_count INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE assessment_receipts ADD COLUMN receipt_hash TEXT;",
      "ALTER TABLE assessment_receipts ADD COLUMN snapshot_hash TEXT;",
      "ALTER TABLE assessment_receipts ADD COLUMN answer_hash TEXT;",
      "CREATE TABLE IF NOT EXISTS assessment_exam_versions (\n  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, version_no INTEGER NOT NULL, snapshot_json TEXT NOT NULL,\n  change_summary TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(exam_id,version_no), FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE\n);",
      "CREATE TABLE IF NOT EXISTS assessment_exam_roles (\n  exam_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,\n  created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY(exam_id,user_id,role), FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE\n);",
      "CREATE TABLE IF NOT EXISTS assessment_answer_revisions (\n  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'internal', revision INTEGER NOT NULL,\n  answers_json TEXT NOT NULL, events_json TEXT NOT NULL DEFAULT '[]', accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(attempt_id,source,revision)\n);",
      "CREATE INDEX IF NOT EXISTS idx_assessment_answer_revisions ON assessment_answer_revisions(attempt_id,source,revision DESC);",
      "CREATE TABLE IF NOT EXISTS assessment_grade_changes (\n  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, question_id TEXT, old_score REAL, new_score REAL,\n  reason TEXT NOT NULL, requested_by TEXT NOT NULL, approved_by TEXT, status TEXT NOT NULL DEFAULT 'approved',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_at TEXT\n);",
      "CREATE TABLE IF NOT EXISTS assessment_competencies (\n  id TEXT PRIMARY KEY, organization_id TEXT, code TEXT NOT NULL, name TEXT NOT NULL, description TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(organization_id,code)\n);",
      "CREATE TABLE IF NOT EXISTS assessment_question_competencies (\n  question_id TEXT NOT NULL, competency_id TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1,\n  PRIMARY KEY(question_id,competency_id)\n);",
      "CREATE INDEX IF NOT EXISTS idx_assessment_versions_exam ON assessment_exam_versions(exam_id,version_no DESC);",
      "CREATE INDEX IF NOT EXISTS idx_assessment_incidents_attempt ON assessment_incidents(attempt_id,status);"
]
  }


];
