const DEFAULT_BASE = 'https://rtc.live.cloudflare.com/v1';
let schemaReady = false;

export function realtimeSfuConfig(env = {}) {
  const appId = String(env.REALTIME_APP_ID || env.CF_REALTIME_APP_ID || '').trim();
  const secret = String(env.REALTIME_APP_SECRET || env.CF_REALTIME_APP_SECRET || '').trim();
  const base = String(env.REALTIME_API_BASE || DEFAULT_BASE).replace(/\/+$/,'');
  return {
    configured: !!(appId && secret),
    appId,
    secret,
    base,
    appName: String(env.REALTIME_APP_NAME || 'skyfirsthoc').trim() || 'skyfirsthoc'
  };
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function realtimeSfuRequest(env, path, init = {}) {
  const cfg = realtimeSfuConfig(env);
  if (!cfg.configured) {
    const e = new Error('Cloudflare Realtime SFU chưa được cấu hình.');
    e.code = 'REALTIME_SFU_NOT_CONFIGURED';
    e.status = 503;
    throw e;
  }
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${cfg.secret}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${cfg.base}/apps/${encodeURIComponent(cfg.appId)}${path}`, { ...init, headers });
  const data = await parseJsonSafe(response);
  if (!response.ok || data?.errorCode) {
    const message = data?.errorDescription || data?.message || data?.errors?.[0]?.message || `Realtime SFU HTTP ${response.status}`;
    const e = new Error(message);
    e.code = data?.errorCode || 'REALTIME_SFU_ERROR';
    e.status = response.status || 502;
    e.detail = data;
    throw e;
  }
  return data;
}

export function createRealtimeSession(env) {
  return realtimeSfuRequest(env, '/sessions/new', { method: 'POST' });
}

export function addRealtimeTracks(env, sessionId, payload) {
  return realtimeSfuRequest(env, `/sessions/${encodeURIComponent(sessionId)}/tracks/new`, {
    method: 'POST', body: JSON.stringify(payload || {})
  });
}

export function renegotiateRealtimeSession(env, sessionId, payload) {
  return realtimeSfuRequest(env, `/sessions/${encodeURIComponent(sessionId)}/renegotiate`, {
    method: 'PUT', body: JSON.stringify(payload || {})
  });
}

export function getRealtimeSession(env, sessionId) {
  return realtimeSfuRequest(env, `/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
}

export async function ensureRealtimeSfuSchema(env) {
  if (schemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS live_sfu_sessions (
      session_id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      owner_key TEXT NOT NULL,
      owner_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'student',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_live_sfu_sessions_room ON live_sfu_sessions(class_id,status,last_seen)`,
    `CREATE TABLE IF NOT EXISTS live_sfu_tracks (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      mid TEXT,
      kind TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      owner_key TEXT NOT NULL,
      owner_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'student',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id,track_name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_live_sfu_tracks_room ON live_sfu_tracks(class_id,active,updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_live_sfu_tracks_session ON live_sfu_tracks(session_id,active)`
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
  schemaReady = true;
}
