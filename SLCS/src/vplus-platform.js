const schemaReadyByDb = new WeakSet();

export const VPLUS = Object.freeze({
  product: 'Sky First School',
  channel: 'VPLUS',
  edition: 'VIP PRO'
});

export const ROLE_PERMISSIONS = Object.freeze({
  student: ['class.join','class.chat','class.react'],
  guest: ['class.join','class.chat','class.react'],
  assistant: ['class.manage'],
  teacher: ['class.manage'],
  account_admin: ['accounts.manage'],
  school_admin: ['school.manage'],
  super_admin: ['*']
});

export function hasPermission(user, permission) {
  const role=String(user?.role||'guest');
  const perms=ROLE_PERMISSIONS[role]||[];
  return perms.includes('*') || perms.includes(permission);
}

export function requirePermission(user, permission) {
  if (!hasPermission(user, permission)) throw Object.assign(new Error('FORBIDDEN'),{status:403});
  return true;
}

export function safeUserMessage(error, fallback='Đã xảy ra sự cố tạm thời. Vui lòng thử lại sau.') {
  const status=Number(error?.status||500);
  if(status===401) return 'Vui lòng đăng nhập để tiếp tục.';
  if(status===403) return 'Bạn không có quyền thực hiện thao tác này.';
  if(status===404) return 'Không tìm thấy nội dung bạn yêu cầu.';
  if(status===409) return 'Thao tác chưa thể hoàn tất do dữ liệu vừa thay đổi. Vui lòng thử lại.';
  if(status===413) return 'Tệp bạn chọn vượt quá giới hạn cho phép.';
  if(status===429) return 'Có quá nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít phút.';
  if(status>=500) return fallback;
  const msg=String(error?.publicMessage||error?.message||'').trim();
  if(!msg || /\b(D1|R2|SFU|mesh|durable|worker|websocket|ICE|binding|schema|SQL|API|HTTP)\b/i.test(msg)) return fallback;
  return msg.slice(0,400);
}

export async function ensureVPlusSchema(env){
  if(!env?.DB) return;
  if(schemaReadyByDb.has(env.DB)) return;
  const sql=[
    `CREATE TABLE IF NOT EXISTS platform_events (
      id TEXT PRIMARY KEY,
      tenant_key TEXT NOT NULL DEFAULT 'sky-first',
      class_id TEXT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      event_source TEXT NOT NULL DEFAULT 'platform',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_platform_events_class_time ON platform_events(class_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_platform_events_type_time ON platform_events(event_type,created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      plan TEXT NOT NULL DEFAULT 'community',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS organization_members (
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id,user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id,status)`,
    `CREATE TABLE IF NOT EXISTS organization_domains (
      domain TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS organization_settings (
      organization_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id,key)
    )`,
    `CREATE TABLE IF NOT EXISTS usage_hourly (
      organization_id TEXT NOT NULL DEFAULT 'sky-first',
      bucket TEXT NOT NULL,
      metric TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id,bucket,metric)
    )`
  ];
  for(const statement of sql) await env.DB.prepare(statement).run();
  schemaReadyByDb.add(env.DB);
}

export async function recordPlatformEvent(env,{classId=null,userId=null,type,source='platform',detail={}}={}){
  if(!type||!env?.DB) return;
  try{
    await ensureVPlusSchema(env);
    await env.DB.prepare(`INSERT INTO platform_events(id,class_id,user_id,event_type,event_source,detail_json,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(crypto.randomUUID(),classId,userId,type,source,JSON.stringify(detail||{})).run();
  }catch{}
}
