let ready = false;

export const V13_DEFAULTS = {
  waiting_room: 1,
  allow_student_mic: 1,
  allow_student_camera: 1,
  allow_student_share: 0,
  allow_chat: 1,
  allow_reactions: 1,
  allow_anonymous_pulse: 1,
  theme: 'sky',
  accent: '#4263eb',
  background: '#f5f7fb',
  surface: '#ffffff',
  layout_default: 'auto',
  max_visible_videos: 12,
  adaptive_video: 1,
  confidence_camera: 1,
  feature_flags_json: '{}'
};

export async function ensureV13Schema(env) {
  if (ready) return;
  const sql = [
    `CREATE TABLE IF NOT EXISTS class_live_settings (
      class_id TEXT PRIMARY KEY,
      waiting_room INTEGER NOT NULL DEFAULT 1,
      allow_student_mic INTEGER NOT NULL DEFAULT 1,
      allow_student_camera INTEGER NOT NULL DEFAULT 1,
      allow_student_share INTEGER NOT NULL DEFAULT 0,
      allow_chat INTEGER NOT NULL DEFAULT 1,
      allow_reactions INTEGER NOT NULL DEFAULT 1,
      allow_anonymous_pulse INTEGER NOT NULL DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'sky',
      accent TEXT NOT NULL DEFAULT '#4263eb',
      background TEXT NOT NULL DEFAULT '#f5f7fb',
      surface TEXT NOT NULL DEFAULT '#ffffff',
      layout_default TEXT NOT NULL DEFAULT 'auto',
      max_visible_videos INTEGER NOT NULL DEFAULT 12,
      adaptive_video INTEGER NOT NULL DEFAULT 1,
      confidence_camera INTEGER NOT NULL DEFAULT 1,
      feature_flags_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS live_attendance (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      user_key TEXT NOT NULL,
      user_id TEXT,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'student',
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      left_at TEXT,
      reconnect_count INTEGER NOT NULL DEFAULT 0,
      device_json TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE INDEX IF NOT EXISTS idx_live_attendance_class ON live_attendance(class_id,joined_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_live_attendance_open ON live_attendance(class_id,user_key,left_at,last_seen)`,
    `CREATE TABLE IF NOT EXISTS live_polls (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]',
      anonymous INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_live_polls_class ON live_polls(class_id,status,created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS live_poll_answers (
      poll_id TEXT NOT NULL,
      responder_key TEXT NOT NULL,
      user_id TEXT,
      option_index INTEGER NOT NULL,
      answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(poll_id,responder_key)
    )`,
    `CREATE TABLE IF NOT EXISTS live_resources (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      resource_type TEXT NOT NULL DEFAULT 'link',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_live_resources_class ON live_resources(class_id,pinned DESC,created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS live_room_events (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_key TEXT,
      actor_name TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_live_room_events_class ON live_room_events(class_id,created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS live_telemetry_hourly (
      bucket TEXT NOT NULL,
      class_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(bucket,class_id,metric)
    )`
  ];
  for (const statement of sql) await env.DB.prepare(statement).run();
  ready = true;
}

export async function getClassLiveSettings(env, classId) {
  await ensureV13Schema(env);
  let row = await env.DB.prepare(`SELECT * FROM class_live_settings WHERE class_id=?`).bind(classId).first();
  if (!row) {
    await env.DB.prepare(`INSERT OR IGNORE INTO class_live_settings(class_id) VALUES(?)`).bind(classId).run();
    row = await env.DB.prepare(`SELECT * FROM class_live_settings WHERE class_id=?`).bind(classId).first();
  }
  return { ...V13_DEFAULTS, ...(row || {}), feature_flags: safeJson(row?.feature_flags_json, {}) };
}

export function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export async function logLiveEvent(env, classId, eventType, actorKey='', actorName='', detail={}) {
  await ensureV13Schema(env);
  try {
    await env.DB.prepare(`INSERT INTO live_room_events(id,class_id,event_type,actor_key,actor_name,detail_json,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(crypto.randomUUID(), classId, eventType, actorKey || null, actorName || '', JSON.stringify(detail || {})).run();
  } catch {}
}
