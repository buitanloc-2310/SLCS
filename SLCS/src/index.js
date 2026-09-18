import { LiveRoom } from './live-room.js';
import { V11_SCHEMA_STAGES } from './schema-v11.js';
import { realtimeSfuConfig, createRealtimeSession, addRealtimeTracks, renegotiateRealtimeSession, ensureRealtimeSfuSchema } from './realtime-sfu.js';
import { ensureV13Schema, getClassLiveSettings, safeJson, logLiveEvent } from './v13-platform.js';
import { VPLUS, ensureVPlusSchema, recordPlatformEvent, auditAi, aiConfigured, aiProviderConfig, aiSupportsNativeResearch, callAiProvider, testAiAuthentication, aiKeyDiagnostic, buildAiSystemPrompt, hasPermission, requirePermission, safeUserMessage, consumeAiQuota, fetchResearchSources, parseAiAction, moderateAiInput } from './vplus-platform.js';
export { LiveRoom };

const SECURITY_HEADERS = {'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'SAMEORIGIN','permissions-policy':'camera=(self), microphone=(self), display-capture=(self), geolocation=()','cross-origin-opener-policy':'same-origin-allow-popups'};
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control':'no-store', ...SECURITY_HEADERS };
const COOKIE = 'sfn_slc_session';
const MAX_ACCOUNTS = 10000;
function json(data, status = 200, extra = {}) { return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } }); }
function bad(message, status = 400, detail = undefined) { return json({ ok: false, message, detail }, status); }
function ok(data = {}) { return json({ ok: true, ...data }); }
function secureResponse(r,requestId=''){if(!r||r.status===101)return r;const h=new Headers(r.headers);for(const [k,v] of Object.entries(SECURITY_HEADERS))if(!h.has(k))h.set(k,v);if(requestId)h.set('x-request-id',requestId);return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});}
function nowIso() { return new Date().toISOString(); }
function randomToken(bytes = 32) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2,'0')).join(''); }
function safeName(s='file') { return s.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120) || 'file'; }
function cookieParse(h='') { return Object.fromEntries(h.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('='); return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]})); }
function sessionCookie(token, days=30) { return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${days*86400}`; }
function clearCookie() { return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`; }
function idCode(n) { return `SFN${String(n).padStart(5,'0')}`; }
function slugCode(prefix='CLS') { return `${prefix}-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`; }

async function hashPassword(password, saltHex = null) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/.{1,2}/g).map(x=>parseInt(x,16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt, iterations:10000, hash:'SHA-256' }, key, 256);
  const hash = [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const saltOut = [...salt].map(x=>x.toString(16).padStart(2,'0')).join('');
  return { hash, salt: saltOut };
}
async function verifyPassword(password, salt, expected) { return (await hashPassword(password, salt)).hash === expected; }

async function getSession(request, env) {
  const token = cookieParse(request.headers.get('cookie') || '')[COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT s.id session_id,s.user_id,s.expires_at,u.sfn_no,u.sfn_id,u.full_name,u.email,u.phone,u.role,u.status,u.avatar_key FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > CURRENT_TIMESTAMP AND u.status='active'`).bind(token).first();
  return row || null;
}
async function requireUser(req, env) { const u=await getSession(req,env); if(!u) throw Object.assign(new Error('AUTH'),{status:401}); return u; }
async function requireRole(req, env, roles) { const u=await requireUser(req,env); if(!roles.includes(u.role)) throw Object.assign(new Error('FORBIDDEN'),{status:403}); return u; }

async function activeExam(userId, env) { return reconcileActiveExam(userId,env); }

async function uploadR2(file, env, prefix, ownerId=null, visibility='private') {
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > 50*1024*1024) throw Object.assign(new Error('Tệp vượt quá 50MB'),{status:413});
  const key = `${prefix}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${safeName(file.name)}`; const id=crypto.randomUUID();
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  try{await env.DB.prepare(`INSERT INTO files(id,owner_user_id,r2_key,name,mime,size,visibility,created_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id, ownerId, key, file.name, file.type||'', file.size, visibility).run()}catch(e){try{await env.FILES.delete(key)}catch{};throw e}
  return { id, key, name:file.name, mime:file.type||'', size:file.size };
}

function normalizeEmail(s=''){return s.trim().toLowerCase();}
function str(v=''){return String(v ?? '').trim();}
function normalizeSetupToken(v=''){
  return String(v ?? '').replace(/^\uFEFF/, '').trim();
}
function setupTokenMatches(provided, configured){
  const a=normalizeSetupToken(provided), b=normalizeSetupToken(configured);
  if(!a || !b || a.length!==b.length) return false;
  let diff=0; for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function tokenFingerprint(v=''){
  const n=normalizeSetupToken(v); if(!n) return '';
  return (await sha256Text(n)).slice(0,12);
}
function htmlEsc(s=''){return String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function validEmail(s=''){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(s));}
async function sha256Text(s=''){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(s)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function requireClassMember(env,classId,userId,roles=null){const m=await env.DB.prepare(`SELECT role,status FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(classId,userId).first();if(!m)throw Object.assign(new Error('FORBIDDEN'),{status:403});if(roles&&!roles.includes(m.role))throw Object.assign(new Error('FORBIDDEN'),{status:403});return m;}
async function requireLiveAccess(env,classId,token){
  const clean=str(token); if(!clean||!classId)throw Object.assign(new Error('LIVE_AUTH'),{status:401});
  const row=await env.DB.prepare(`SELECT t.class_id,t.user_id,t.guest_name,t.role,t.expires_at,COALESCE(u.full_name,t.guest_name,'Guest') display_name FROM live_access_tokens t LEFT JOIN users u ON u.id=t.user_id WHERE t.token=? AND t.class_id=? AND t.expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(clean,classId).first();
  if(!row)throw Object.assign(new Error('LIVE_AUTH'),{status:401});
  const ownerKey=row.user_id?`user:${row.user_id}`:`guest:${(await sha256Text(clean)).slice(0,24)}`;
  return {...row,owner_key:ownerKey,display_name:str(row.display_name).slice(0,80)||'Guest'};
}
async function requireOwnedSfuSession(env,sessionId,classId,access){
  await ensureRealtimeSfuSchema(env);
  const row=await env.DB.prepare(`SELECT * FROM live_sfu_sessions WHERE session_id=? AND class_id=? AND owner_key=? AND status='active' LIMIT 1`).bind(sessionId,classId,access.owner_key).first();
  if(!row)throw Object.assign(new Error('SFU_SESSION_FORBIDDEN'),{status:403});
  await env.DB.prepare(`UPDATE live_sfu_sessions SET last_seen=CURRENT_TIMESTAMP WHERE session_id=?`).bind(sessionId).run().catch(()=>{});
  return row;
}
async function checkLoginThrottle(env,key){try{const r=await env.DB.prepare(`SELECT attempts,window_started_at,blocked_until FROM login_throttle WHERE key=?`).bind(key).first();if(!r)return {allowed:true};if(r.blocked_until&&new Date(r.blocked_until)>new Date())return {allowed:false,retry_after:Math.max(1,Math.ceil((new Date(r.blocked_until)-Date.now())/1000))};const age=Date.now()-new Date(r.window_started_at).getTime();if(age>15*60*1000){await env.DB.prepare(`DELETE FROM login_throttle WHERE key=?`).bind(key).run();return {allowed:true}}return {allowed:true}}catch{return {allowed:true}}}
async function recordLoginFailure(env,key,limit=10){try{const row=await env.DB.prepare(`SELECT attempts,window_started_at FROM login_throttle WHERE key=?`).bind(key).first();const now=Date.now();if(!row||now-new Date(row.window_started_at).getTime()>15*60*1000){await env.DB.prepare(`INSERT INTO login_throttle(key,attempts,window_started_at,blocked_until,updated_at) VALUES(?,1,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET attempts=1,window_started_at=CURRENT_TIMESTAMP,blocked_until=NULL,updated_at=CURRENT_TIMESTAMP`).bind(key).run();return}const attempts=Number(row.attempts||0)+1;const blocked=attempts>=limit?new Date(now+15*60*1000).toISOString():null;await env.DB.prepare(`UPDATE login_throttle SET attempts=?,blocked_until=?,updated_at=CURRENT_TIMESTAMP WHERE key=?`).bind(attempts,blocked,key).run()}catch{}}
async function clearLoginThrottle(env,key){try{await env.DB.prepare(`DELETE FROM login_throttle WHERE key=?`).bind(key).run()}catch{}}
function validateUpload(file,{maxMb=50,mimes=null,label='Tệp'}={}){if(!(file instanceof File)||!file.size)return `${label} không hợp lệ.`;if(file.size>maxMb*1024*1024)return `${label} vượt quá ${maxMb}MB.`;if(mimes&&file.type&&!mimes.includes(file.type))return `${label} không đúng định dạng được hỗ trợ.`;return null;}
async function reconcileActiveExam(userId,env){const a=await env.DB.prepare(`SELECT a.id attempt_id,a.started_at,e.id exam_id,e.title,e.duration_minutes FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.user_id=? AND a.status='in_progress' ORDER BY a.started_at DESC LIMIT 1`).bind(userId).first();if(!a)return null;const deadline=new Date(a.started_at).getTime()+Number(a.duration_minutes||30)*60000;if(Date.now()>=deadline){await env.DB.prepare(`UPDATE exam_attempts SET status='expired',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(a.attempt_id).run();return null}return {...a,remaining_seconds:Math.max(0,Math.ceil((deadline-Date.now())/1000))};}
function viRequestStatus(status='pending'){
  return ({pending:'Đã tiếp nhận',reviewing:'Đang xem xét',needs_info:'Cần bổ sung thông tin',approved:'Đã duyệt',rejected:'Không được phê duyệt'})[status] || 'Đang được xử lý';
}
function emailShell({title,preheader='',body,env}){
  const support=env.SUPPORT_EMAIL||'support@skyfirst.io.vn';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEsc(title)}</title></head><body style="margin:0;background:#f6eff6;font-family:Arial,Helvetica,sans-serif;color:#2a1d2b"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${htmlEsc(preheader)}</div><div style="max-width:720px;margin:28px auto;padding:0 14px"><div style="background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 18px 55px rgba(53,20,52,.14)"><div style="padding:34px;background:linear-gradient(135deg,#351544 0%,#7f2457 50%,#ff7b57 100%);color:#fff"><div style="font-size:12px;letter-spacing:1.2px;font-weight:700;text-transform:uppercase;opacity:.86">Sky First Network Digital Learning Center</div><div style="font-size:16px;font-weight:800;margin-top:7px">Trung tâm Học tập Số Sky First Network</div><h1 style="margin:18px 0 8px;font-size:29px;line-height:1.18">${htmlEsc(title)}</h1></div><div style="padding:30px 34px">${body}</div><div style="padding:23px 34px 28px;background:#2a162d;color:#ddd0df;font-size:12px;line-height:1.7"><b>Trung tâm Học tập Số Sky First Network</b><br>Hỗ trợ: <a href="mailto:${support}" style="color:#ffd3df;text-decoration:none">${support}</a><br>Email hệ thống: <a href="mailto:slc@skyfirst.io.vn" style="color:#ffd3df;text-decoration:none">slc@skyfirst.io.vn</a><br><br><div style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10);color:#f2e8f3"><b>Email này được gửi tự động từ Trung tâm Học tập Số Sky First Network.</b><br>Vui lòng không phản hồi trực tiếp email này. Nếu bạn cần hỗ trợ, vui lòng liên hệ <b>${support}</b>.</div><br>Một sản phẩm thuộc hệ sinh thái Sky First Network.<br>© 2026 Sky First Network. Mọi quyền được bảo lưu.</div></div></div></body></html>`;
}
function requestReceivedEmail(env,{fullName,requestCode,email,phone,data}){
  const lookup=`${env.APP_URL||'https://slc.skyfirst.io.vn'}/#lookup`;
  const body=`<p style="font-size:17px;line-height:1.7;margin-top:0">Xin chào <b>${htmlEsc(fullName)}</b>, yêu cầu cấp tài khoản SFN của bạn đã được hệ thống ghi nhận.</p><div style="margin:22px 0;padding:22px;border-radius:20px;background:linear-gradient(135deg,#fff3f0,#f8edff);border:1px solid #ecd8e7;text-align:center"><div style="font-size:12px;color:#796879;font-weight:700;margin-bottom:8px">MÃ TRA CỨU YÊU CẦU</div><div style="font-family:Consolas,monospace;font-size:25px;font-weight:800;letter-spacing:1px;color:#7f2457">${htmlEsc(requestCode)}</div><div style="display:inline-block;margin-top:10px;background:#ffe5d8;color:#8a3b28;padding:7px 11px;border-radius:999px;font-weight:700;font-size:12px">ĐÃ TIẾP NHẬN</div></div><table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #eee1eb;border-radius:18px;overflow:hidden"><tr><td style="padding:12px 15px;font-weight:700;color:#5b4759">Email đăng ký</td><td style="padding:12px 15px">${htmlEsc(email)}</td></tr><tr><td style="padding:12px 15px;font-weight:700;color:#5b4759;border-top:1px solid #f1e7ef">Số điện thoại</td><td style="padding:12px 15px;border-top:1px solid #f1e7ef">${htmlEsc(phone)}</td></tr><tr><td style="padding:12px 15px;font-weight:700;color:#5b4759;border-top:1px solid #f1e7ef">Đơn vị học tập</td><td style="padding:12px 15px;border-top:1px solid #f1e7ef">${htmlEsc(data.education_unit||'Chưa cung cấp')}</td></tr><tr><td style="padding:12px 15px;font-weight:700;color:#5b4759;border-top:1px solid #f1e7ef">Lớp / Khóa</td><td style="padding:12px 15px;border-top:1px solid #f1e7ef">${htmlEsc(data.class_name||'Chưa cung cấp')}</td></tr></table><div style="text-align:center;margin:28px 0"><a href="${lookup}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:linear-gradient(90deg,#ff658d,#ff9b63);color:#24141d;text-decoration:none;font-weight:800">TRA CỨU YÊU CẦU</a></div><div style="padding:16px 18px;border-radius:16px;background:#fff8ec;color:#6f5637;line-height:1.55;font-size:13px"><b>Lưu ý:</b> Email này xác nhận hệ thống đã tiếp nhận hồ sơ, chưa đồng nghĩa với việc tài khoản đã được cấp. Các cập nhật quan trọng sẽ được gửi đến email đăng ký.</div>`;
  return emailShell({title:'Xác nhận tiếp nhận yêu cầu cấp tài khoản',preheader:`Mã tra cứu: ${requestCode}`,body,env});
}
function activationEmail(env,{fullName,sfnId,activationUrl}){
  const body=`<p style="font-size:17px;line-height:1.7;margin-top:0">Xin chào <b>${htmlEsc(fullName)}</b>, yêu cầu cấp tài khoản của bạn đã được phê duyệt.</p><div style="padding:20px;border-radius:18px;background:#fff4f2;border:1px solid #eddce3"><div style="font-size:12px;color:#7a6674;font-weight:700">SFN ID CỦA BẠN</div><div style="font-family:Consolas,monospace;font-size:28px;font-weight:900;color:#7f2457;margin-top:6px">${htmlEsc(sfnId)}</div></div><p style="line-height:1.7">Để hoàn tất, hãy tạo mật khẩu cho tài khoản bằng nút bên dưới. Liên kết kích hoạt có thời hạn và chỉ sử dụng một lần.</p><div style="text-align:center;margin:28px 0"><a href="${activationUrl}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:linear-gradient(90deg,#ff658d,#ff9b63);color:#24141d;text-decoration:none;font-weight:800">KÍCH HOẠT TÀI KHOẢN</a></div>`;
  return emailShell({title:'Tài khoản SFN của bạn đã được phê duyệt',preheader:`SFN ID: ${sfnId}`,body,env});
}
async function writeEmailLog(env,{to,subject,status,providerId='',error=''}){try{await env.DB.prepare(`INSERT INTO email_logs(id,to_email,subject,status,provider_message_id,error,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),to,subject,status,providerId,error).run()}catch{}}
async function sendMail(env,to,subject,html){
  if(!env.RESEND_API_KEY){await writeEmailLog(env,{to,subject,status:'skipped',error:'RESEND_API_KEY_NOT_CONFIGURED'});return {sent:false,reason:'RESEND_API_KEY_NOT_CONFIGURED'};}
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.MAIL_FROM||'Trung tâm Học tập Số Sky First Network <slc@skyfirst.io.vn>',to:[to],subject,html})});
  if(!r.ok){const reason=await r.text();await writeEmailLog(env,{to,subject,status:'failed',error:reason});return {sent:false,reason};}
  const data=await r.json();await writeEmailLog(env,{to,subject,status:'sent',providerId:data.id||''});return {sent:true,data};
}



async function resolveEmailTemplate(env,key,fallbackSubject,fallbackHtml,vars={}){
  let row=null; try{row=await env.DB.prepare(`SELECT subject,body_html,enabled FROM email_templates WHERE key=?`).bind(key).first()}catch{}
  let subject=(row&&row.enabled!==0&&str(row.subject))?row.subject:fallbackSubject;
  let html=(row&&row.enabled!==0&&str(row.body_html))?row.body_html:fallbackHtml;
  const values={...vars};
  for(const [k,v] of Object.entries(values)){
    const re=new RegExp(`{{\\s*${k}\\s*}}`,'g'); subject=subject.replace(re,String(v??'')); html=html.replace(re,htmlEsc(v??''));
  }
  return {subject,html};
}

async function schemaReady(env){
  try { await env.DB.prepare(`SELECT 1 ok FROM users LIMIT 1`).first(); await env.DB.prepare(`SELECT 1 ok FROM system_settings LIMIT 1`).first(); return true; }
  catch { return false; }
}
function compactSqlLabel(sql=''){
  return String(sql).replace(/\s+/g,' ').trim().slice(0,220);
}

async function runSchemaStage(env, stage){
  const completed=[];
  for(let i=0;i<stage.statements.length;i++){
    const sql=stage.statements[i];
    try{
      // Pages + D1: execute exactly one complete SQLite statement at a time.
      // We intentionally do NOT use D1Database.exec() for the installer.
      await env.DB.prepare(sql).run();
      completed.push(i+1);
    }catch(error){
      const e=new Error(error?.message || String(error) || 'D1 statement failed');
      e.code='SETUP_SCHEMA_STATEMENT_FAILED';
      e.stage=stage.name;
      e.statement_index=i+1;
      e.statement_total=stage.statements.length;
      e.statement_preview=compactSqlLabel(sql);
      e.causeText=String(error?.cause?.message || error?.cause || '');
      throw e;
    }
  }
  return completed.length;
}

async function installSchema(env){
  const completed=[];
  for(const stage of V11_SCHEMA_STAGES){
    try{
      const count=await runSchemaStage(env,stage);
      completed.push({stage:stage.name,statements:count});
    }catch(error){
      error.completed=completed;
      throw error;
    }
  }
  // final verification: required core objects must be queryable
  const checks=['users','system_settings','classes','account_requests','system_incidents'];
  for(const table of checks){
    try{ await env.DB.prepare(`SELECT 1 FROM ${table} LIMIT 1`).first(); }
    catch(error){
      const e=new Error(`Bảng bắt buộc ${table} chưa sẵn sàng: ${error?.message||error}`);
      e.code='SETUP_SCHEMA_VERIFY_FAILED';
      e.stage='verification';
      e.statement_preview=`SELECT 1 FROM ${table} LIMIT 1`;
      e.completed=completed;
      throw e;
    }
  }
  return {completed};
}

async function ensureLatestSchema(env){
  // Same safe one-statement-at-a-time engine used for upgrades from the admin UI.
  return installSchema(env);
}

async function adminLog(env,userId,action,detail={}){
  try{await env.DB.prepare(`INSERT INTO admin_activity(actor_user_id,action,detail_json,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(userId||null,action,JSON.stringify(detail)).run()}catch{}
}
async function getSettings(env){
  const rows=await env.DB.prepare(`SELECT key,value FROM system_settings ORDER BY key`).all();
  return Object.fromEntries((rows.results||[]).map(x=>[x.key,x.value]));
}

async function routeApi(request, env, ctx, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health') return ok({ service:'Sky First School', status:'available', time:nowIso() });

  if (path === '/api/setup/installer-info' && method === 'GET') return ok({ installer_available:true });

  if (path === '/api/setup/status' && method === 'GET') {
    const ready=await schemaReady(env);
    if(!ready) return ok({schema_ready:false,initialized:false});
    const row=await env.DB.prepare(`SELECT COUNT(*) n FROM users`).first();
    return ok({schema_ready:true,initialized:Number(row?.n||0)>0});
  }

  if (path === '/api/setup/install' && method === 'POST') {
    if (!normalizeSetupToken(env.SETUP_TOKEN)) return bad('Hệ thống chưa sẵn sàng để cài đặt. Vui lòng kiểm tra cấu hình quản trị.',500);
    let installBody={}; try{ installBody=await request.clone().json(); }catch{}
    const providedToken=request.headers.get('x-setup-token') ?? installBody?.setup_token ?? '';
    if (!setupTokenMatches(providedToken, env.SETUP_TOKEN)) return bad('Mã thiết lập hệ thống không hợp lệ.',403);
    if (!env.DB) return bad('Hệ thống chưa sẵn sàng để cài đặt. Vui lòng kiểm tra cấu hình quản trị.',500);
    try {
      const result=await installSchema(env);
      return ok({schema_ready:true,stages:result.completed,message:'Dữ liệu nền tảng đã được khởi tạo. Không cần chạy migration thủ công.'});
    } catch (e) {
      console.error('SETUP_INSTALL_FAILED', {stage:e?.stage, message:e?.message, cause:e?.causeText, completed:e?.completed});
      return bad('Không thể hoàn tất cài đặt dữ liệu nền tảng. Vui lòng thử lại hoặc liên hệ quản trị hệ thống.',500);
    }
  }

  if (path === '/api/setup/bootstrap' && method === 'POST') {
    if (!normalizeSetupToken(env.SETUP_TOKEN)) return bad('Hệ thống chưa sẵn sàng để khởi tạo. Vui lòng kiểm tra cấu hình quản trị.',500);
    let stage='read_body';
    try {
      const body=await request.json();
      const providedToken=request.headers.get('x-setup-token') ?? body?.setup_token ?? '';
      if (!setupTokenMatches(providedToken, env.SETUP_TOKEN)) return bad('Mã thiết lập hệ thống không hợp lệ.',403);
      if (!env.DB) return bad('Hệ thống chưa sẵn sàng để cài đặt. Vui lòng kiểm tra cấu hình quản trị.',500);
      const fullName=str(body.full_name)||'SFN Super Admin';
      const email=normalizeEmail(str(body.email));
      const password=str(body.password);
      if(!email || !validEmail(email) || password.length<12) return bad('Email hợp lệ và mật khẩu tối thiểu 12 ký tự là bắt buộc.');

      stage='check_users';
      const exists=await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
      if(Number(exists?.n||0)>0) return bad('Hệ thống đã được khởi tạo.',409,{code:'ALREADY_BOOTSTRAPPED'});

      // V11.1 deliberately avoids UPDATE ... RETURNING because bootstrap must
      // remain compatible with the D1 execution path used by Pages Functions.
      stage='read_counter';
      const counter=await env.DB.prepare(`SELECT value FROM counters WHERE key='sfn_user'`).first();
      if(!counter) return bad('Không tìm thấy bộ đếm SFN. Hãy chạy lại bước Cài đặt dữ liệu nền tảng.',500,{code:'SFN_COUNTER_MISSING',stage});
      const no=Number(counter.value)+1;
      if(!Number.isInteger(no) || no<1 || no>MAX_ACCOUNTS) return bad('Đã đạt giới hạn 10.000 tài khoản SFN.',409,{code:'ACCOUNT_LIMIT_REACHED'});

      stage='reserve_counter';
      const reserved=await env.DB.prepare(`UPDATE counters SET value=? WHERE key='sfn_user' AND value=?`).bind(no,Number(counter.value)).run();
      if(!reserved?.success || Number(reserved?.meta?.changes||0)!==1) return bad('Bộ đếm tài khoản vừa thay đổi. Vui lòng bấm khởi tạo lại.',409,{code:'COUNTER_RACE',retry_safe:true});

      try {
        stage='hash_password';
        const hp=await hashPassword(password);
        stage='insert_super_admin';
        const id=crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO users(id,sfn_no,sfn_id,full_name,email,phone,role,status,profile_json,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,'super_admin','active','{}',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,no,idCode(no),fullName,email,str(body.phone),hp.hash,hp.salt).run();
        return ok({sfn_id:idCode(no),message:'Đã khởi tạo quản trị hệ thống đầu tiên.'});
      } catch(inner) {
        // Release the reserved number when account creation itself fails.
        await env.DB.prepare(`UPDATE counters SET value=? WHERE key='sfn_user' AND value=?`).bind(no-1,no).run().catch(()=>{});
        throw inner;
      }
    } catch(e) {
      console.error('BOOTSTRAP_V11_1_FAILED',stage,e);
      return bad('Không thể khởi tạo quản trị đầu tiên. Vui lòng thử lại hoặc kiểm tra cấu hình quản trị.',500);
    }
  }

  if (path === '/api/auth/request-account' && method === 'POST') {
    const cfg=await getSettings(env).catch(()=>({})); if(cfg.account_request_enabled==='0') return bad('Cổng yêu cầu cấp tài khoản hiện đang tạm đóng.',503);
    const form = await request.formData();
    const fullName=str(form.get('full_name')), email=normalizeEmail(str(form.get('email'))), phone=str(form.get('phone'));
    if (!fullName || !email || !phone) return bad('Vui lòng nhập đầy đủ họ tên, email và số điện thoại.');
    if(!validEmail(email)) return bad('Địa chỉ email không hợp lệ.');
    if(fullName.length>160||phone.length>40) return bad('Thông tin cá nhân vượt quá độ dài cho phép.');
    const portrait = form.get('portrait');
    const studentCard = form.get('student_card');
    if (!(portrait instanceof File) || !portrait.size) return bad('Ảnh chân dung là bắt buộc.');
    const portraitErr=validateUpload(portrait,{maxMb:5,mimes:['image/jpeg','image/png','image/webp'],label:'Ảnh chân dung'}); if(portraitErr)return bad(portraitErr);
    if(studentCard instanceof File && studentCard.size){const docErr=validateUpload(studentCard,{maxMb:10,mimes:['image/jpeg','image/png','image/webp','application/pdf'],label:'Giấy tờ học tập'});if(docErr)return bad(docErr);}
    const existing=await env.DB.prepare(`SELECT request_code,status FROM account_requests WHERE lower(email)=lower(?) AND status IN ('pending','reviewing','needs_info') ORDER BY created_at DESC LIMIT 1`).bind(email).first();
    if(existing) return bad(`Email này đang có một yêu cầu chưa hoàn tất (${existing.request_code}). Vui lòng tra cứu yêu cầu hiện tại trước khi gửi hồ sơ mới.`,409,{request_code:existing.request_code});
    const requestId = `SLC-ACC-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const portraitMeta = await uploadR2(portrait, env, 'account-requests/portrait');
    const studentMeta = studentCard instanceof File && studentCard.size ? await uploadR2(studentCard, env, 'account-requests/student-card') : null;
    const data = {
      birth_date:str(form.get('birth_date')), gender:str(form.get('gender')), province:str(form.get('province')),
      education_unit_type:str(form.get('education_unit_type')), education_unit:str(form.get('education_unit')), faculty:str(form.get('faculty')),
      major:str(form.get('major')), class_name:str(form.get('class_name')), student_code:str(form.get('student_code')), academic_year:str(form.get('academic_year')),
      sfn_unit:str(form.get('sfn_unit')), sfn_role:str(form.get('sfn_role')), purpose:str(form.get('purpose')), requested_access:str(form.get('requested_access')),
      referral:str(form.get('referral')), notes:str(form.get('notes'))
    };
    await env.DB.prepare(`INSERT INTO account_requests(request_code,full_name,email,phone,data_json,portrait_key,student_card_key,status,created_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(requestId,fullName,email,phone,JSON.stringify(data),portraitMeta.key,studentMeta?.key||null,'pending').run();
    const fallbackHtml=requestReceivedEmail(env,{fullName,requestCode:requestId,email,phone,data}); const tpl=await resolveEmailTemplate(env,'account_request_received','[Sky First] Xác nhận tiếp nhận yêu cầu cấp tài khoản',fallbackHtml,{full_name:fullName,request_code:requestId,email,phone}); const mail=await sendMail(env,email,tpl.subject,tpl.html);
    return ok({ request_code:requestId, email_sent:mail.sent, message:'Yêu cầu đã được tiếp nhận. Mã tra cứu đã được tạo và sẽ được gửi đến email đăng ký nếu dịch vụ email đang hoạt động.' });
  }

  if (path === '/api/auth/lookup-account-request' && method === 'POST') {
    const body=await request.json(); const code=str(body.request_code).toUpperCase(); const email=normalizeEmail(str(body.email));
    if(!code || !email) return bad('Vui lòng nhập mã yêu cầu và email đã đăng ký.');
    const row=await env.DB.prepare(`SELECT request_code,status,created_at,reviewed_at FROM account_requests WHERE upper(request_code)=? AND lower(email)=lower(?) LIMIT 1`).bind(code,email).first();
    if(!row) return bad('Không tìm thấy yêu cầu phù hợp với thông tin đã nhập.',404);
    return ok({request:{request_code:row.request_code,status:row.status,status_label:viRequestStatus(row.status),created_at:row.created_at,updated_at:row.reviewed_at||row.created_at}});
  }

  if(path==='/api/public/site-config' && method==='GET'){
    if(!(await schemaReady(env))) return ok({configured:false,settings:{}});
    const settings=await getSettings(env);
    const anns=await env.DB.prepare(`SELECT id,title,body FROM announcements WHERE status='published' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP) AND audience IN ('all','public') ORDER BY created_at DESC LIMIT 5`).all();
    return ok({configured:true,settings,announcements:anns.results||[]});
  }

  const publicPolicy=path.match(/^\/api\/public\/policies\/([^/]+)$/);
  if(publicPolicy && method==='GET'){
    if(!(await schemaReady(env))) return bad('Hệ thống chưa được khởi tạo.',503);
    const row=await env.DB.prepare(`SELECT key,title,body_html,updated_at FROM policies WHERE key=?`).bind(publicPolicy[1]).first(); if(!row)return bad('Không tìm thấy chính sách.',404); return ok({policy:row});
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const body=await request.json(); const login=str(body.login).slice(0,180); const pw=str(body.password);
    if(!login||!pw) return bad('Vui lòng nhập tài khoản và mật khẩu.');
    const ip=request.headers.get('cf-connecting-ip')||''; const throttleKey=await sha256Text(`${normalizeEmail(login)}|${ip}`); const throttle=await checkLoginThrottle(env,throttleKey);
    if(!throttle.allowed) return bad('Có quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau.',429,{retry_after:throttle.retry_after});
    const u=await env.DB.prepare(`SELECT * FROM users WHERE (lower(email)=lower(?) OR lower(sfn_id)=lower(?)) LIMIT 1`).bind(login,login).first();
    const good=!!u && u.status==='active' && !!u.password_salt && !!u.password_hash && await verifyPassword(pw,u.password_salt,u.password_hash);
    if(!good){const cfg=await getSettings(env).catch(()=>({}));await recordLoginFailure(env,throttleKey,Math.max(5,Math.min(30,Number(cfg.login_rate_limit||10))));return bad('Thông tin đăng nhập không đúng.',401);}
    await clearLoginThrottle(env,throttleKey);
    const token=randomToken(32); const cfg=await getSettings(env).catch(()=>({})); const days=Math.max(1,Math.min(90,Number(cfg.default_session_days||env.SESSION_DAYS||30)));
    const exp=new Date(Date.now()+days*86400000).toISOString(); const ipHash=ip?await sha256Text(ip):'';
    await env.DB.prepare(`INSERT INTO sessions(token,user_id,ip_hash,user_agent,expires_at,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(token,u.id,ipHash,(request.headers.get('user-agent')||'').slice(0,500),exp).run();
    return json({ok:true,user:{sfn_id:u.sfn_id,full_name:u.full_name,role:u.role}},200,{'set-cookie':sessionCookie(token,days)});
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token=cookieParse(request.headers.get('cookie')||'')[COOKIE]; if(token) await env.DB.prepare(`DELETE FROM sessions WHERE token=?`).bind(token).run();
    return json({ok:true},200,{'set-cookie':clearCookie()});
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const u=await getSession(request,env); if(!u) return ok({user:null});
    const exam=await activeExam(u.user_id,env);
    return ok({user:{id:u.user_id,sfn_id:u.sfn_id,full_name:u.full_name,email:u.email,phone:u.phone,role:u.role,avatar_key:u.avatar_key},active_exam:exam||null});
  }

  if (path === '/api/auth/activate' && method === 'POST') {
    const body=await request.json(); const token=str(body.token), password=str(body.password);
    if(password.length<10) return bad('Mật khẩu phải có ít nhất 10 ký tự.');
    const row=await env.DB.prepare(`SELECT * FROM activation_tokens WHERE token=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP`).bind(token).first();
    if(!row) return bad('Liên kết kích hoạt không hợp lệ hoặc đã hết hạn.');
    const hp=await hashPassword(password);
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(hp.hash,hp.salt,row.user_id),
      env.DB.prepare(`UPDATE activation_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL`).bind(row.user_id)
    ]);
    return ok({message:'Tài khoản SFN đã được kích hoạt.'});
  }

  const publicLiveInfo=path.match(/^\/api\/public\/classes\/([^/]+)\/live-info$/);
  if(publicLiveInfo && method==='GET'){
    const cls=await env.DB.prepare(`SELECT id,name,unit,status FROM classes WHERE id=? AND status='active'`).bind(publicLiveInfo[1]).first();
    if(!cls) return bad('Không tìm thấy lớp.',404);
    return ok({class:cls});
  }


  if(path==='/api/account/profile' && method==='PATCH'){
    const u=await requireUser(request,env); const b=await request.json(); const fullName=str(b.full_name), phone=str(b.phone);
    if(!fullName)return bad('Họ tên không được để trống.');
    await env.DB.prepare(`UPDATE users SET full_name=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(fullName,phone,u.user_id).run();
    return ok();
  }
  if(path==='/api/account/password' && method==='POST'){
    const u=await requireUser(request,env); const b=await request.json(); const oldPw=str(b.current_password), newPw=str(b.new_password); if(newPw.length<10)return bad('Mật khẩu mới phải có ít nhất 10 ký tự.');
    const row=await env.DB.prepare(`SELECT password_hash,password_salt FROM users WHERE id=?`).bind(u.user_id).first(); if(!row||!(await verifyPassword(oldPw,row.password_salt,row.password_hash)))return bad('Mật khẩu hiện tại không đúng.',401);
    const hp=await hashPassword(newPw); await env.DB.batch([env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(hp.hash,hp.salt,u.user_id),env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND token<>?`).bind(u.user_id,cookieParse(request.headers.get('cookie')||'')[COOKIE]||'')]); return ok();
  }
  if(path==='/api/account/sessions' && method==='GET'){
    const u=await requireUser(request,env); const token=cookieParse(request.headers.get('cookie')||'')[COOKIE]||''; const rows=await env.DB.prepare(`SELECT id,token,user_agent,expires_at,created_at FROM sessions WHERE user_id=? ORDER BY created_at DESC`).bind(u.user_id).all(); return ok({sessions:(rows.results||[]).map(x=>({id:x.id,user_agent:x.user_agent,expires_at:x.expires_at,created_at:x.created_at,current:x.token===token}))});
  }
  const accountSession=path.match(/^\/api\/account\/sessions\/(\d+)$/);
  if(accountSession && method==='DELETE'){
    const u=await requireUser(request,env); await env.DB.prepare(`DELETE FROM sessions WHERE id=? AND user_id=?`).bind(Number(accountSession[1]),u.user_id).run(); return ok();
  }
  if (path === '/api/classes' && method === 'GET') {
    const u=await requireUser(request,env);
    const rows=await env.DB.prepare(`SELECT c.*,cm.role member_role,(SELECT COUNT(*) FROM class_members x WHERE x.class_id=c.id AND x.status='active') member_count FROM classes c JOIN class_members cm ON cm.class_id=c.id WHERE cm.user_id=? AND cm.status='active' ORDER BY c.updated_at DESC`).bind(u.user_id).all();
    return ok({classes:rows.results});
  }

  if (path === '/api/classes' && method === 'POST') {
    const u=await requireRole(request,env,['super_admin','school_admin','teacher']);
    const b=await request.json(); if(!str(b.name)) return bad('Tên lớp không được để trống.');
    const id=crypto.randomUUID(), joinCode=slugCode('SLC');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO classes(id,name,description,unit,cover_key,join_code,owner_user_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,str(b.name),str(b.description),str(b.unit),null,joinCode,u.user_id),
      env.DB.prepare(`INSERT INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,'teacher','active',CURRENT_TIMESTAMP)`).bind(id,u.user_id)
    ]);
    return ok({id,join_code:joinCode});
  }

  const classMatch=path.match(/^\/api\/classes\/([^/]+)$/);
  if(classMatch && method==='GET'){
    const u=await requireUser(request,env); const id=classMatch[1];
    const member=['school_admin','super_admin'].includes(u.role)?{role:u.role}:await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first();
    if(!member) return bad('Bạn không thuộc lớp này.',403);
    const cls=await env.DB.prepare(`SELECT c.*,u.full_name owner_name FROM classes c JOIN users u ON u.id=c.owner_user_id WHERE c.id=?`).bind(id).first();
    const members=await env.DB.prepare(`SELECT cm.role,u.sfn_id,u.full_name,u.email FROM class_members cm JOIN users u ON u.id=cm.user_id WHERE cm.class_id=? AND cm.status='active' ORDER BY cm.role,u.full_name`).bind(id).all();
    return ok({class:cls,members:members.results,my_role:member.role});
  }

  const joinMatch=path.match(/^\/api\/classes\/join$/);
  if(joinMatch && method==='POST'){
    const u=await requireUser(request,env); const b=await request.json(); const code=str(b.code).toUpperCase();
    const cls=await env.DB.prepare(`SELECT id FROM classes WHERE upper(join_code)=? AND status='active'`).bind(code).first();
    if(!cls) return bad('Mã lớp không hợp lệ.');
    await env.DB.prepare(`INSERT INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,'student','active',CURRENT_TIMESTAMP) ON CONFLICT(class_id,user_id) DO UPDATE SET status='active'`).bind(cls.id,u.user_id).run();
    return ok({class_id:cls.id});
  }

  const postsMatch=path.match(/^\/api\/classes\/([^/]+)\/posts$/);
  if(postsMatch && method==='GET'){
    const u=await requireUser(request,env); const id=postsMatch[1];
    const member=await env.DB.prepare(`SELECT 1 ok FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!member)return bad('Không có quyền.',403);
    const rows=await env.DB.prepare(`SELECT p.*,u.full_name author FROM class_posts p JOIN users u ON u.id=p.author_user_id WHERE p.class_id=? ORDER BY p.pinned DESC,p.created_at DESC LIMIT 100`).bind(id).all(); return ok({posts:rows.results});
  }
  if(postsMatch && method==='POST'){
    const u=await requireUser(request,env); const id=postsMatch[1]; const m=await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!m)return bad('Không có quyền.',403);
    const b=await request.json(); if(!str(b.body))return bad('Nội dung trống.');
    await env.DB.prepare(`INSERT INTO class_posts(id,class_id,author_user_id,body,pinned,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),id,u.user_id,str(b.body),['teacher','assistant'].includes(m.role)&&b.pinned?1:0).run(); return ok();
  }

  const matsMatch=path.match(/^\/api\/classes\/([^/]+)\/materials$/);
  if(matsMatch && method==='GET'){
    const u=await requireUser(request,env); const id=matsMatch[1]; const m=await env.DB.prepare(`SELECT 1 ok FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!m)return bad('Không có quyền.',403);
    const rows=await env.DB.prepare(`SELECT m.*,f.name,f.mime,f.size FROM materials m JOIN files f ON f.id=m.file_id WHERE m.class_id=? ORDER BY m.created_at DESC`).bind(id).all(); return ok({materials:rows.results});
  }
  if(matsMatch && method==='POST'){
    const u=await requireUser(request,env); const id=matsMatch[1]; const m=await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!m||!['teacher','assistant'].includes(m.role))return bad('Chỉ giáo viên/trợ giảng được tải học liệu.',403);
    const form=await request.formData(); const file=form.get('file'); if(!(file instanceof File)||!file.size)return bad('Chưa chọn tệp.');
    const meta=await uploadR2(file,env,`classes/${id}/materials`,u.user_id,'class');
    const mid=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO materials(id,class_id,file_id,title,description,created_by,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(mid,id,meta.id,str(form.get('title'))||file.name,str(form.get('description')),u.user_id).run(); return ok({id:mid});
  }

  const assignmentsMatch=path.match(/^\/api\/classes\/([^/]+)\/assignments$/);
  if(assignmentsMatch && method==='GET'){
    const u=await requireUser(request,env); const id=assignmentsMatch[1]; await requireClassMember(env,id,u.user_id); const rows=await env.DB.prepare(`SELECT a.*,(SELECT status FROM submissions s WHERE s.assignment_id=a.id AND s.user_id=?) my_status FROM assignments a WHERE a.class_id=? ORDER BY a.created_at DESC`).bind(u.user_id,id).all(); return ok({assignments:rows.results});
  }
  if(assignmentsMatch && method==='POST'){
    const u=await requireUser(request,env); const id=assignmentsMatch[1]; const m=await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!m||!['teacher','assistant'].includes(m.role))return bad('Không có quyền.',403);
    const b=await request.json(); if(!str(b.title))return bad('Tên bài tập không được để trống.'); const aid=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO assignments(id,class_id,type,title,instructions,due_at,points,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(aid,id,b.type==='tnv_task'?'tnv_task':'assignment',str(b.title),str(b.instructions),b.due_at||null,Number(b.points||10),u.user_id).run(); return ok({id:aid});
  }

  const submitMatch=path.match(/^\/api\/assignments\/([^/]+)\/submit$/);
  if(submitMatch && method==='POST'){
    const u=await requireUser(request,env); const aid=submitMatch[1]; const assignment=await env.DB.prepare(`SELECT id,class_id,due_at FROM assignments WHERE id=?`).bind(aid).first(); if(!assignment)return bad('Không tìm thấy bài tập.',404); await requireClassMember(env,assignment.class_id,u.user_id); const form=await request.formData(); const file=form.get('file'); let fileId=null;
    if(file instanceof File && file.size){const err=validateUpload(file,{maxMb:50,label:'Tệp bài nộp'});if(err)return bad(err); const meta=await uploadR2(file,env,`submissions/${aid}`,u.user_id,'private'); fileId=meta.id; }
    await env.DB.prepare(`INSERT INTO submissions(id,assignment_id,user_id,text_answer,file_id,status,submitted_at,updated_at) VALUES(?,?,?,?,?,'submitted',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(assignment_id,user_id) DO UPDATE SET text_answer=excluded.text_answer,file_id=COALESCE(excluded.file_id,submissions.file_id),status='submitted',submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),aid,u.user_id,str(form.get('text')),fileId).run(); return ok();
  }

  const examsMatch=path.match(/^\/api\/classes\/([^/]+)\/exams$/);
  if(examsMatch && method==='GET'){
    const u=await requireUser(request,env); const id=examsMatch[1]; await requireClassMember(env,id,u.user_id); const rows=await env.DB.prepare(`SELECT e.id,e.class_id,e.title,e.instructions,e.duration_minutes,e.strict_mode,e.status,e.created_at,(SELECT status FROM exam_attempts a WHERE a.exam_id=e.id AND a.user_id=? ORDER BY a.started_at DESC LIMIT 1) attempt_status FROM exams e WHERE e.class_id=? ORDER BY e.created_at DESC`).bind(u.user_id,id).all(); return ok({exams:rows.results});
  }
  if(examsMatch && method==='POST'){
    const u=await requireUser(request,env); const id=examsMatch[1]; const m=await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!m||!['teacher','assistant'].includes(m.role))return bad('Không có quyền.',403);
    const b=await request.json(); const title=str(b.title), questions=Array.isArray(b.questions)?b.questions.slice(0,300):[]; if(!title)return bad('Tên bài kiểm tra không được để trống.'); if(!questions.length)return bad('Bài kiểm tra cần ít nhất một câu hỏi.'); const clean=questions.map(q=>({id:str(q.id)||crypto.randomUUID(),type:['mcq','truefalse','short'].includes(q.type)?q.type:'mcq',question:str(q.question).slice(0,3000),options:Array.isArray(q.options)?q.options.slice(0,8).map(x=>str(x).slice(0,500)):[],answer:str(q.answer).slice(0,1000),points:Math.max(.25,Math.min(100,Number(q.points||1)))})).filter(q=>q.question); if(!clean.length)return bad('Không có câu hỏi hợp lệ.'); const eid=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO exams(id,class_id,title,instructions,duration_minutes,strict_mode,question_json,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,'published',?,CURRENT_TIMESTAMP)`).bind(eid,id,title,str(b.instructions).slice(0,5000),Math.max(1,Math.min(720,Number(b.duration_minutes||30))),b.strict_mode?1:0,JSON.stringify(clean),u.user_id).run(); return ok({id:eid});
  }

  const startExam=path.match(/^\/api\/exams\/([^/]+)\/start$/);
  if(startExam && method==='POST'){
    const u=await requireUser(request,env); const eid=startExam[1]; const e=await env.DB.prepare(`SELECT * FROM exams WHERE id=? AND status='published'`).bind(eid).first(); if(!e)return bad('Không tìm thấy bài kiểm tra.'); await requireClassMember(env,e.class_id,u.user_id);
    const existing=await activeExam(u.user_id,env); if(existing)return bad('Bạn đang có một phiên kiểm tra khác đang hoạt động.',409,existing);
    const id=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO exam_attempts(id,exam_id,user_id,status,started_at,answers_json,event_log_json) VALUES(?,?,?,'in_progress',CURRENT_TIMESTAMP,'{}','[]')`).bind(id,eid,u.user_id).run(); return ok({attempt_id:id,exam:{id:e.id,title:e.title,duration_minutes:e.duration_minutes,strict_mode:e.strict_mode,questions:JSON.parse(e.question_json||'[]')}});
  }

  const saveExam=path.match(/^\/api\/exam-attempts\/([^/]+)\/save$/);
  if(saveExam && method==='POST'){
    const u=await requireUser(request,env); const b=await request.json(); const a=await env.DB.prepare(`SELECT * FROM exam_attempts WHERE id=? AND user_id=? AND status='in_progress'`).bind(saveExam[1],u.user_id).first(); if(!a)return bad('Phiên thi không còn hoạt động.',409);
    const events=Array.isArray(b.events)?b.events.slice(-500):JSON.parse(a.event_log_json||'[]');
    await env.DB.prepare(`UPDATE exam_attempts SET answers_json=?,event_log_json=?,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(b.answers||{}),JSON.stringify(events),a.id).run(); return ok({saved_at:nowIso()});
  }

  const submitExam=path.match(/^\/api\/exam-attempts\/([^/]+)\/submit$/);
  if(submitExam && method==='POST'){
    const u=await requireUser(request,env); const b=await request.json(); const a=await env.DB.prepare(`SELECT a.*,e.question_json,e.duration_minutes FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.user_id=? AND a.status='in_progress'`).bind(submitExam[1],u.user_id).first(); if(!a)return bad('Phiên thi không còn hoạt động.',409);
    const deadline=new Date(a.started_at).getTime()+Number(a.duration_minutes||30)*60000; if(Date.now()>deadline+120000){await env.DB.prepare(`UPDATE exam_attempts SET status='expired',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(a.id).run();return bad('Phiên thi đã quá thời gian nộp bài.',409,{status:'expired'});}
    const qs=JSON.parse(a.question_json||'[]'), ans=b.answers||{}; let score=0,max=0;
    for(const q of qs){ const pts=Number(q.points||1); max+=pts; if(q.type==='mcq' && String(ans[q.id])===String(q.answer)) score+=pts; if(q.type==='truefalse' && String(ans[q.id])===String(q.answer)) score+=pts; }
    await env.DB.prepare(`UPDATE exam_attempts SET answers_json=?,event_log_json=?,score=?,max_score=?,status='submitted',submitted_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(ans),JSON.stringify(b.events||[]),score,max,a.id).run(); return ok({score,max_score:max});
  }

  if(path==='/api/quiz/generate' && method==='POST'){
    const u=await requireRole(request,env,['super_admin','school_admin','teacher','assistant']); const b=await request.json(); const text=str(b.text).replace(/\s+/g,' ');
    if(text.length<120)return bad('Nội dung quá ngắn để tạo quiz.');
    const sentences=text.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.length>45&&s.length<260).slice(0,40);
    const count=Math.max(3,Math.min(20,Number(b.count||8))); const questions=[];
    for(let i=0;i<Math.min(count,sentences.length);i++){
      const s=sentences[i]; const words=s.match(/[A-Za-zÀ-ỹ0-9]{5,}/g)||[]; const target=words.sort((a,b)=>b.length-a.length)[0];
      if(!target)continue; const prompt=s.replace(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'_____');
      questions.push({id:crypto.randomUUID(),type:'fill',question:`Điền từ còn thiếu theo tài liệu: ${prompt}`,answer:target,points:1,source_excerpt:s});
    }
    return ok({draft:true,questions,notice:'Bản nháp được tạo từ nội dung tài liệu. Giáo viên cần kiểm tra trước khi xuất bản.'});
  }

  const examAttemptGet=path.match(/^\/api\/exam-attempts\/([^/]+)$/);
  if(examAttemptGet && method==='GET'){
    const u=await requireUser(request,env); const a=await env.DB.prepare(`SELECT a.*,e.title,e.instructions,e.duration_minutes,e.strict_mode,e.question_json FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.user_id=?`).bind(examAttemptGet[1],u.user_id).first();
    if(!a)return bad('Không tìm thấy phiên kiểm tra.',404); if(a.status!=='in_progress')return bad('Phiên kiểm tra đã kết thúc.',409,{status:a.status,score:a.score,max_score:a.max_score});
    const deadline=new Date(a.started_at).getTime()+Number(a.duration_minutes||30)*60000; if(Date.now()>=deadline){await env.DB.prepare(`UPDATE exam_attempts SET status='expired',submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='in_progress'`).bind(a.id).run();return bad('Thời gian làm bài đã kết thúc.',409,{status:'expired'});}
    return ok({attempt_id:a.id,exam:{id:a.exam_id,title:a.title,instructions:a.instructions,duration_minutes:a.duration_minutes,strict_mode:a.strict_mode,questions:JSON.parse(a.question_json||'[]')},answers:JSON.parse(a.answers_json||'{}'),events:JSON.parse(a.event_log_json||'[]'),remaining_seconds:Math.max(0,Math.ceil((deadline-Date.now())/1000))});
  }

  const chatMatch=path.match(/^\/api\/classes\/([^/]+)\/chat$/);
  if(chatMatch && method==='GET'){
    const u=await requireUser(request,env); const classId=chatMatch[1]; await requireClassMember(env,classId,u.user_id); const rows=await env.DB.prepare(`SELECT m.id,m.body,m.created_at,m.edited_at,u.sfn_id,u.full_name,cm.role FROM class_messages m JOIN users u ON u.id=m.user_id JOIN class_members cm ON cm.class_id=m.class_id AND cm.user_id=m.user_id WHERE m.class_id=? ORDER BY m.created_at DESC LIMIT 150`).bind(classId).all(); return ok({messages:(rows.results||[]).reverse()});
  }
  if(chatMatch && method==='POST'){
    const u=await requireUser(request,env); const classId=chatMatch[1]; await requireClassMember(env,classId,u.user_id); const b=await request.json(); const body=str(b.body); if(!body)return bad('Tin nhắn trống.'); if(body.length>3000)return bad('Tin nhắn vượt quá 3.000 ký tự.'); const id=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO class_messages(id,class_id,user_id,body,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,classId,u.user_id,body).run(); return ok({id});
  }
  const chatDelete=path.match(/^\/api\/classes\/([^/]+)\/chat\/([^/]+)$/);
  if(chatDelete && method==='DELETE'){
    const u=await requireUser(request,env); const classId=chatDelete[1]; const member=await requireClassMember(env,classId,u.user_id); const msg=await env.DB.prepare(`SELECT user_id FROM class_messages WHERE id=? AND class_id=?`).bind(chatDelete[2],classId).first(); if(!msg)return bad('Không tìm thấy tin nhắn.',404); if(msg.user_id!==u.user_id&&!['teacher','assistant'].includes(member.role))return bad('Không có quyền.',403); await env.DB.prepare(`DELETE FROM class_messages WHERE id=?`).bind(chatDelete[2]).run(); return ok();
  }

  const eventsMatch=path.match(/^\/api\/classes\/([^/]+)\/events$/);
  if(eventsMatch && method==='GET'){
    const u=await requireUser(request,env); const classId=eventsMatch[1]; await requireClassMember(env,classId,u.user_id); const rows=await env.DB.prepare(`SELECT * FROM class_events WHERE class_id=? AND datetime(starts_at)>=datetime('now','-30 days') ORDER BY datetime(starts_at) ASC LIMIT 200`).bind(classId).all(); return ok({events:rows.results||[]});
  }
  if(eventsMatch && method==='POST'){
    const u=await requireUser(request,env); const classId=eventsMatch[1]; await requireClassMember(env,classId,u.user_id,['teacher','assistant']); const b=await request.json(); if(!str(b.title)||!str(b.starts_at))return bad('Tên sự kiện và thời gian bắt đầu là bắt buộc.'); const id=crypto.randomUUID(); const type=['class','exam','deadline','live','other'].includes(b.event_type)?b.event_type:'class'; await env.DB.prepare(`INSERT INTO class_events(id,class_id,title,details,event_type,starts_at,ends_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,classId,str(b.title),str(b.details),type,str(b.starts_at),str(b.ends_at)||null,u.user_id).run(); return ok({id});
  }

  const submissionsList=path.match(/^\/api\/assignments\/([^/]+)\/submissions$/);
  if(submissionsList && method==='GET'){
    const u=await requireUser(request,env); const assignment=await env.DB.prepare(`SELECT id,class_id,points,title FROM assignments WHERE id=?`).bind(submissionsList[1]).first(); if(!assignment)return bad('Không tìm thấy bài tập.',404); await requireClassMember(env,assignment.class_id,u.user_id,['teacher','assistant']); const rows=await env.DB.prepare(`SELECT s.*,u.sfn_id,u.full_name,u.email,f.name file_name FROM submissions s JOIN users u ON u.id=s.user_id LEFT JOIN files f ON f.id=s.file_id WHERE s.assignment_id=? ORDER BY s.submitted_at DESC`).bind(assignment.id).all(); return ok({assignment,submissions:rows.results||[]});
  }
  const gradeSubmission=path.match(/^\/api\/submissions\/([^/]+)\/grade$/);
  if(gradeSubmission && method==='PATCH'){
    const u=await requireUser(request,env); const sub=await env.DB.prepare(`SELECT s.id,a.class_id,a.points FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?`).bind(gradeSubmission[1]).first(); if(!sub)return bad('Không tìm thấy bài nộp.',404); await requireClassMember(env,sub.class_id,u.user_id,['teacher','assistant']); const b=await request.json(); const score=b.score===''||b.score==null?null:Number(b.score); if(score!=null&&(!Number.isFinite(score)||score<0||score>Number(sub.points)))return bad('Điểm không hợp lệ.'); await env.DB.prepare(`UPDATE submissions SET score=?,feedback=?,status='graded',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(score,str(b.feedback).slice(0,5000),sub.id).run(); return ok();
  }


  const v13Live = path.match(/^\/api\/classes\/([^/]+)\/live$/);
  if(v13Live && method==='GET'){
    const u=await requireUser(request,env); const classId=v13Live[1]; const member=['school_admin','super_admin'].includes(u.role)?{role:u.role}:await requireClassMember(env,classId,u.user_id); await ensureV13Schema(env);
    const settings=await getClassLiveSettings(env,classId);
    const polls=await env.DB.prepare(`SELECT p.*, (SELECT COUNT(*) FROM live_poll_answers a WHERE a.poll_id=p.id) answer_count FROM live_polls p WHERE p.class_id=? ORDER BY p.created_at DESC LIMIT 20`).bind(classId).all();
    const resources=await env.DB.prepare(`SELECT * FROM live_resources WHERE class_id=? ORDER BY pinned DESC,created_at DESC LIMIT 50`).bind(classId).all();
    let attendance=[];
    if(['teacher','assistant'].includes(member.role)) attendance=(await env.DB.prepare(`SELECT * FROM live_attendance WHERE class_id=? ORDER BY joined_at DESC LIMIT 300`).bind(classId).all()).results||[];
    return ok({settings,polls:(polls.results||[]).map(x=>({...x,options:safeJson(x.options_json,[])})),resources:resources.results||[],attendance,my_role:member.role});
  }
  if(v13Live && method==='PATCH'){
    const u=await requireUser(request,env); const classId=v13Live[1]; if(!['school_admin','super_admin'].includes(u.role))await requireClassMember(env,classId,u.user_id,['teacher','assistant']); await ensureV13Schema(env); const b=await request.json();
    const current=await getClassLiveSettings(env,classId);
    const bool=k=>(b[k]===undefined?Number(current[k]||0):(b[k]?1:0));
    const theme=['sky','ocean','lavender','mint','sunrise','rose','midnight'].includes(str(b.theme))?str(b.theme):current.theme;
    const layout=['auto','grid','speaker','presentation','compact'].includes(str(b.layout_default))?str(b.layout_default):current.layout_default;
    const color=(v,fb)=>/^#[0-9a-f]{6}$/i.test(str(v))?str(v):fb;
    const maxVideos=Math.max(2,Math.min(24,Number(b.max_visible_videos??current.max_visible_videos??12)));
    const flags=typeof b.feature_flags==='object'&&b.feature_flags?b.feature_flags:safeJson(current.feature_flags_json||'{}',{});
    await env.DB.prepare(`INSERT INTO class_live_settings(class_id,waiting_room,allow_student_mic,allow_student_camera,allow_student_share,allow_chat,allow_reactions,allow_anonymous_pulse,theme,accent,background,surface,layout_default,max_visible_videos,adaptive_video,confidence_camera,feature_flags_json,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(class_id) DO UPDATE SET waiting_room=excluded.waiting_room,allow_student_mic=excluded.allow_student_mic,allow_student_camera=excluded.allow_student_camera,allow_student_share=excluded.allow_student_share,allow_chat=excluded.allow_chat,allow_reactions=excluded.allow_reactions,allow_anonymous_pulse=excluded.allow_anonymous_pulse,theme=excluded.theme,accent=excluded.accent,background=excluded.background,surface=excluded.surface,layout_default=excluded.layout_default,max_visible_videos=excluded.max_visible_videos,adaptive_video=excluded.adaptive_video,confidence_camera=excluded.confidence_camera,feature_flags_json=excluded.feature_flags_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
      .bind(classId,bool('waiting_room'),bool('allow_student_mic'),bool('allow_student_camera'),bool('allow_student_share'),bool('allow_chat'),bool('allow_reactions'),bool('allow_anonymous_pulse'),theme,color(b.accent,current.accent),color(b.background,current.background),color(b.surface,current.surface),layout,maxVideos,bool('adaptive_video'),bool('confidence_camera'),JSON.stringify(flags),u.user_id).run();
    await logLiveEvent(env,classId,'settings.updated',`user:${u.user_id}`,u.full_name,{theme,layout,maxVideos}); return ok({settings:await getClassLiveSettings(env,classId)});
  }
  const v13Attendance=path.match(/^\/api\/classes\/([^/]+)\/live\/attendance$/);
  if(v13Attendance && method==='POST'){
    const u=await requireUser(request,env); const classId=v13Attendance[1]; const member=['school_admin','super_admin'].includes(u.role)?{role:u.role}:await requireClassMember(env,classId,u.user_id); await ensureV13Schema(env); const b=await request.json(); const action=str(b.action||'heartbeat'); const key=`user:${u.user_id}`;
    if(action==='join'){
      const existing=await env.DB.prepare(`SELECT id FROM live_attendance WHERE class_id=? AND user_key=? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1`).bind(classId,key).first();
      if(existing) await env.DB.prepare(`UPDATE live_attendance SET last_seen=CURRENT_TIMESTAMP,reconnect_count=reconnect_count+1,device_json=? WHERE id=?`).bind(JSON.stringify(b.device||{}),existing.id).run();
      else await env.DB.prepare(`INSERT INTO live_attendance(id,class_id,user_key,user_id,display_name,role,joined_at,last_seen,device_json) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)`).bind(crypto.randomUUID(),classId,key,u.user_id,u.full_name,member.role,JSON.stringify(b.device||{})).run();
      await logLiveEvent(env,classId,'attendance.join',key,u.full_name,{});
    } else if(action==='leave'){
      await env.DB.prepare(`UPDATE live_attendance SET left_at=CURRENT_TIMESTAMP,last_seen=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM live_attendance WHERE class_id=? AND user_key=? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1)`).bind(classId,key).run();
      await logLiveEvent(env,classId,'attendance.leave',key,u.full_name,{});
    } else await env.DB.prepare(`UPDATE live_attendance SET last_seen=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM live_attendance WHERE class_id=? AND user_key=? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1)`).bind(classId,key).run();
    return ok();
  }
  const v13Polls=path.match(/^\/api\/classes\/([^/]+)\/live\/polls$/);
  if(v13Polls && method==='POST'){
    const u=await requireUser(request,env); const classId=v13Polls[1]; if(!['school_admin','super_admin'].includes(u.role))await requireClassMember(env,classId,u.user_id,['teacher','assistant']); await ensureV13Schema(env); const b=await request.json(); const question=str(b.question).slice(0,300); const options=(Array.isArray(b.options)?b.options:[]).map(x=>str(x).slice(0,180)).filter(Boolean).slice(0,8); if(question.length<2||options.length<2)return bad('Cần câu hỏi và ít nhất 2 lựa chọn.'); const id=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO live_polls(id,class_id,question,options_json,anonymous,status,created_by,created_at) VALUES(?,?,?,?,?,'open',?,CURRENT_TIMESTAMP)`).bind(id,classId,question,JSON.stringify(options),b.anonymous?1:0,u.user_id).run(); await logLiveEvent(env,classId,'poll.created',`user:${u.user_id}`,u.full_name,{poll_id:id,question}); return ok({id,question,options});
  }
  const v13PollAnswer=path.match(/^\/api\/classes\/([^/]+)\/live\/polls\/([^/]+)\/answer$/);
  if(v13PollAnswer && method==='POST'){
    const u=await requireUser(request,env); const classId=v13PollAnswer[1]; await requireClassMember(env,classId,u.user_id); await ensureV13Schema(env); const poll=await env.DB.prepare(`SELECT * FROM live_polls WHERE id=? AND class_id=? AND status='open'`).bind(v13PollAnswer[2],classId).first(); if(!poll)return bad('Poll đã đóng hoặc không tồn tại.',404); const b=await request.json(); const options=safeJson(poll.options_json,[]); const idx=Number(b.option_index); if(!Number.isInteger(idx)||idx<0||idx>=options.length)return bad('Lựa chọn không hợp lệ.');
    await env.DB.prepare(`INSERT INTO live_poll_answers(poll_id,responder_key,user_id,option_index,answered_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(poll_id,responder_key) DO UPDATE SET option_index=excluded.option_index,answered_at=CURRENT_TIMESTAMP`).bind(poll.id,`user:${u.user_id}`,u.user_id,idx).run(); return ok();
  }
  const v13PollClose=path.match(/^\/api\/classes\/([^/]+)\/live\/polls\/([^/]+)\/close$/);
  if(v13PollClose && method==='POST'){
    const u=await requireUser(request,env); const classId=v13PollClose[1]; if(!['school_admin','super_admin'].includes(u.role))await requireClassMember(env,classId,u.user_id,['teacher','assistant']); await ensureV13Schema(env); await env.DB.prepare(`UPDATE live_polls SET status='closed',closed_at=CURRENT_TIMESTAMP WHERE id=? AND class_id=?`).bind(v13PollClose[2],classId).run(); const results=await env.DB.prepare(`SELECT option_index,COUNT(*) n FROM live_poll_answers WHERE poll_id=? GROUP BY option_index ORDER BY option_index`).bind(v13PollClose[2]).all(); return ok({results:results.results||[]});
  }
  const v13Resources=path.match(/^\/api\/classes\/([^/]+)\/live\/resources$/);
  if(v13Resources && method==='POST'){
    const u=await requireUser(request,env); const classId=v13Resources[1]; if(!['school_admin','super_admin'].includes(u.role))await requireClassMember(env,classId,u.user_id,['teacher','assistant']); await ensureV13Schema(env); const b=await request.json(); const title=str(b.title).slice(0,160),urlv=str(b.url).slice(0,1200); if(!title||!/^https?:\/\//i.test(urlv))return bad('Tài nguyên cần tên và liên kết http/https hợp lệ.'); const id=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO live_resources(id,class_id,title,url,resource_type,pinned,created_by,created_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,classId,title,urlv,str(b.resource_type||'link').slice(0,30),b.pinned?1:0,u.user_id).run(); await logLiveEvent(env,classId,'resource.added',`user:${u.user_id}`,u.full_name,{id,title}); return ok({id});
  }
  const v13Catchup=path.match(/^\/api\/classes\/([^/]+)\/live\/catchup$/);
  if(v13Catchup && method==='GET'){
    const u=await requireUser(request,env); const classId=v13Catchup[1]; if(!['school_admin','super_admin'].includes(u.role))await requireClassMember(env,classId,u.user_id); await ensureV13Schema(env); const mins=Math.max(1,Math.min(30,Number(url.searchParams.get('minutes')||5))); const rows=await env.DB.prepare(`SELECT event_type,actor_name,detail_json,created_at FROM live_room_events WHERE class_id=? AND datetime(created_at)>=datetime('now',?) ORDER BY created_at DESC LIMIT 40`).bind(classId,`-${mins} minutes`).all(); return ok({events:(rows.results||[]).map(x=>({...x,detail:safeJson(x.detail_json,{})}))});
  }
  if(path==='/api/admin/system/live-metrics' && method==='GET'){
    await requireRole(request,env,['super_admin']); await ensureV13Schema(env); const [a,s,t]=await Promise.all([env.DB.prepare(`SELECT COUNT(DISTINCT class_id) classes,COUNT(*) sessions FROM live_attendance WHERE left_at IS NULL AND datetime(last_seen)>datetime('now','-2 minutes')`).first(),env.DB.prepare(`SELECT COUNT(*) sessions FROM live_sfu_sessions WHERE status='active' AND datetime(last_seen)>datetime('now','-2 minutes')`).first().catch(()=>({sessions:0})),env.DB.prepare(`SELECT COUNT(*) tracks FROM live_sfu_tracks WHERE active=1 AND kind='video'`).first().catch(()=>({tracks:0}))]); return ok({active_classes:Number(a?.classes||0),online_users:Number(a?.sessions||0),media_sessions:Number(s?.sessions||0),publishing_video_tracks:Number(t?.tracks||0)});
  }

  if(path==='/api/live/access-token' && method==='POST'){
    const u=await requireUser(request,env); const b=await request.json(); const classId=str(b.class_id); const m=['school_admin','super_admin'].includes(u.role)?{role:u.role}:await requireClassMember(env,classId,u.user_id); const token=randomToken(28); const exp=new Date(Date.now()+18*60*60*1000).toISOString(); const role=['teacher','assistant','school_admin','super_admin'].includes(m.role)?m.role:'student'; await env.DB.prepare(`INSERT INTO live_access_tokens(token,class_id,user_id,guest_name,role,expires_at,created_at) VALUES(?,?,?,'',?,?,CURRENT_TIMESTAMP)`).bind(token,classId,u.user_id,role,exp).run(); return ok({token,expires_at:exp,role});
  }
  const guestLive=path.match(/^\/api\/public\/live\/([^/]+)\/guest-token$/);
  if(guestLive && method==='POST'){
    const cfg=await getSettings(env).catch(()=>({})); if(cfg.allow_guest_live==='0')return bad('Phòng học hiện không cho phép khách tham gia.',403); const b=await request.json(); const name=str(b.name).slice(0,80); if(name.length<2)return bad('Vui lòng nhập tên hiển thị.'); const cls=await env.DB.prepare(`SELECT id,name FROM classes WHERE id=? AND status='active'`).bind(guestLive[1]).first(); if(!cls)return bad('Không tìm thấy lớp.',404); const token=randomToken(28); const exp=new Date(Date.now()+14*60*60*1000).toISOString(); await env.DB.prepare(`INSERT INTO live_access_tokens(token,class_id,user_id,guest_name,role,expires_at,created_at) VALUES(?,?,NULL,?,'guest',?,CURRENT_TIMESTAMP)`).bind(token,cls.id,name,exp).run(); return ok({token,expires_at:exp,class:cls});
  }

  if(path==='/api/live/media/status' && method==='POST'){
    const b=await request.json(); const classId=str(b.class_id); await requireLiveAccess(env,classId,b.access_token);
    const cfg=realtimeSfuConfig(env);
    return ok({ready:cfg.configured});
  }

  if(path==='/api/live/media/session/new' && method==='POST'){
    const b=await request.json(); const classId=str(b.class_id); const access=await requireLiveAccess(env,classId,b.access_token);
    await ensureRealtimeSfuSchema(env);
    const session=await createRealtimeSession(env);
    if(!session?.sessionId)return bad('Chưa thể thiết lập kết nối hình ảnh và âm thanh. Vui lòng thử lại.',502);
    await env.DB.prepare(`INSERT INTO live_sfu_sessions(session_id,class_id,owner_key,owner_name,role,status,created_at,last_seen) VALUES(?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(session_id) DO UPDATE SET class_id=excluded.class_id,owner_key=excluded.owner_key,owner_name=excluded.owner_name,role=excluded.role,status='active',last_seen=CURRENT_TIMESTAMP`).bind(session.sessionId,classId,access.owner_key,access.display_name,access.role||'student').run();
    return ok({session_id:session.sessionId});
  }

  const sfuTracks=path.match(/^\/api\/live\/media\/session\/([^/]+)\/tracks$/);
  if(sfuTracks && method==='POST'){
    const b=await request.json(); const classId=str(b.class_id); const access=await requireLiveAccess(env,classId,b.access_token); const sessionId=sfuTracks[1];
    await requireOwnedSfuSession(env,sessionId,classId,access);
    const op=b.operation==='subscribe'?'subscribe':'publish'; const tracks=Array.isArray(b.tracks)?b.tracks.slice(0,64):[];
    if(!tracks.length)return bad('Không có dữ liệu âm thanh hoặc hình ảnh để xử lý.');
    if(op==='publish'){
      const liveSettings=await getClassLiveSettings(env,classId).catch(()=>null); const isHost=['teacher','assistant','school_admin','super_admin'].includes(access.role);
      if(!isHost&&liveSettings){
        for(const t of tracks){const source=str(t.source||t.kind);if(source==='mic'&&!Number(liveSettings.allow_student_mic))return bad('Giáo viên đang khóa micro của học viên.',403);if(source==='camera'&&!Number(liveSettings.allow_student_camera))return bad('Giáo viên đang khóa camera của học viên.',403);if(source==='screen'&&!Number(liveSettings.allow_student_share))return bad('Bạn chưa được phép chia sẻ màn hình.',403);}
      }
      if(tracks.some(t=>t.location!=='local'))return bad('Dữ liệu gửi lên không hợp lệ.');
      if(tracks.length>4)return bad('Có quá nhiều luồng thiết bị được bật cùng lúc.');
      for(const t of tracks){if(!str(t.trackName)||!['audio','video'].includes(str(t.kind)))return bad('Dữ liệu thiết bị không hợp lệ.');}
    }else{
      if(tracks.some(t=>t.location!=='remote'||!str(t.sessionId)||!str(t.trackName)))return bad('Dữ liệu nhận từ phòng học không hợp lệ.');
      for(const t of tracks){
        const allowed=await env.DB.prepare(`SELECT 1 ok FROM live_sfu_tracks WHERE class_id=? AND session_id=? AND track_name=? AND active=1 LIMIT 1`).bind(classId,str(t.sessionId),str(t.trackName)).first();
        if(!allowed)return bad('Nội dung này không còn khả dụng trong phòng học.',403);
      }
    }
    const payload={tracks:tracks.map(t=>op==='publish'?{location:'local',mid:t.mid,trackName:str(t.trackName)}:{location:'remote',sessionId:str(t.sessionId),trackName:str(t.trackName)})};
    if(b.sessionDescription?.sdp&&b.sessionDescription?.type)payload.sessionDescription={type:str(b.sessionDescription.type),sdp:String(b.sessionDescription.sdp)};
    const result=await addRealtimeTracks(env,sessionId,payload);
    if(op==='publish'){
      const byName=new Map(tracks.map(t=>[str(t.trackName),t]));
      for(const rt of result.tracks||[]){
        const input=byName.get(str(rt.trackName))||tracks[0]; const id=crypto.randomUUID();
        await env.DB.prepare(`INSERT INTO live_sfu_tracks(id,class_id,session_id,track_name,mid,kind,source,owner_key,owner_name,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(session_id,track_name) DO UPDATE SET mid=excluded.mid,kind=excluded.kind,source=excluded.source,owner_name=excluded.owner_name,role=excluded.role,active=1,updated_at=CURRENT_TIMESTAMP`).bind(id,classId,sessionId,str(rt.trackName||input.trackName),str(rt.mid??input.mid??''),str(input.kind),str(input.source||input.kind),access.owner_key,access.display_name,access.role||'student').run();
      }
    }
    return ok({...result});
  }

  const sfuRenegotiate=path.match(/^\/api\/live\/media\/session\/([^/]+)\/renegotiate$/);
  if(sfuRenegotiate && method==='PUT'){
    const b=await request.json(); const classId=str(b.class_id); const access=await requireLiveAccess(env,classId,b.access_token); const sessionId=sfuRenegotiate[1]; await requireOwnedSfuSession(env,sessionId,classId,access);
    if(!b.sessionDescription?.sdp||!b.sessionDescription?.type)return bad('Chưa thể khôi phục kết nối. Vui lòng thử lại.',400);
    const result=await renegotiateRealtimeSession(env,sessionId,{sessionDescription:{type:str(b.sessionDescription.type),sdp:String(b.sessionDescription.sdp)}}); return ok({...result});
  }

  const sfuUnpublish=path.match(/^\/api\/live\/media\/session\/([^/]+)\/unpublish$/);
  if(sfuUnpublish && method==='POST'){
    const b=await request.json(); const classId=str(b.class_id); const access=await requireLiveAccess(env,classId,b.access_token); const sessionId=sfuUnpublish[1]; await requireOwnedSfuSession(env,sessionId,classId,access);
    const name=str(b.track_name); await env.DB.prepare(`UPDATE live_sfu_tracks SET active=0,updated_at=CURRENT_TIMESTAMP WHERE class_id=? AND session_id=? AND track_name=? AND owner_key=?`).bind(classId,sessionId,name,access.owner_key).run(); return ok();
  }

  const sfuEnd=path.match(/^\/api\/live\/media\/session\/([^/]+)\/end$/);
  if(sfuEnd && method==='POST'){
    const b=await request.json(); const classId=str(b.class_id); const access=await requireLiveAccess(env,classId,b.access_token); const sessionId=sfuEnd[1]; await requireOwnedSfuSession(env,sessionId,classId,access);
    await env.DB.batch([env.DB.prepare(`UPDATE live_sfu_sessions SET status='ended',ended_at=CURRENT_TIMESTAMP,last_seen=CURRENT_TIMESTAMP WHERE session_id=?`).bind(sessionId),env.DB.prepare(`UPDATE live_sfu_tracks SET active=0,updated_at=CURRENT_TIMESTAMP WHERE session_id=?`).bind(sessionId)]); return ok();
  }

  if(path==='/api/live/media/room-tracks' && method==='POST'){
    const b=await request.json(); const classId=str(b.class_id); await requireLiveAccess(env,classId,b.access_token); await ensureRealtimeSfuSchema(env);
    const rows=await env.DB.prepare(`SELECT t.session_id,t.track_name,t.mid,t.kind,t.source,t.owner_name,t.role,t.updated_at FROM live_sfu_tracks t JOIN live_sfu_sessions s ON s.session_id=t.session_id WHERE t.class_id=? AND t.active=1 AND s.status='active' AND datetime(s.last_seen)>datetime('now','-18 hours') ORDER BY t.updated_at DESC LIMIT 500`).bind(classId).all(); return ok({tracks:rows.results||[]});
  }

  if(path==='/api/support/tickets' && method==='GET'){
    const u=await requireUser(request,env); const rows=await env.DB.prepare(`SELECT * FROM support_tickets WHERE requester_user_id=? ORDER BY created_at DESC`).bind(u.user_id).all(); return ok({tickets:rows.results});
  }
  if(path==='/api/support/tickets' && method==='POST'){
    const u=await requireUser(request,env); const b=await request.json(); if(!str(b.subject)||!str(b.message))return bad('Vui lòng nhập chủ đề và nội dung hỗ trợ.'); if(str(b.subject).length>180||str(b.message).length>6000)return bad('Nội dung hỗ trợ vượt quá độ dài cho phép.'); const code=`SUP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`; await env.DB.prepare(`INSERT INTO support_tickets(id,ticket_code,requester_user_id,category,subject,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'new',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),code,u.user_id,str(b.category),str(b.subject),str(b.message)).run(); return ok({ticket_code:code});
  }

  if(path==='/api/admin/users' && method==='GET'){
    await requireRole(request,env,['super_admin','school_admin','account_admin']);
    const q=str(url.searchParams.get('q')); const lim=Math.max(10,Math.min(300,Number(url.searchParams.get('limit')||100)));
    const like=`%${q}%`;
    const rows=q?await env.DB.prepare(`SELECT id,sfn_id,full_name,email,phone,role,status,created_at FROM users WHERE sfn_id LIKE ? OR full_name LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT ?`).bind(like,like,like,lim).all():await env.DB.prepare(`SELECT id,sfn_id,full_name,email,phone,role,status,created_at FROM users ORDER BY created_at DESC LIMIT ?`).bind(lim).all();
    return ok({users:rows.results||[]});
  }

  const adminUser=path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if(adminUser && method==='PATCH'){
    const admin=await requireRole(request,env,['super_admin']); const b=await request.json();
    const current=await env.DB.prepare(`SELECT id,role,status FROM users WHERE id=?`).bind(adminUser[1]).first(); if(!current)return bad('Không tìm thấy tài khoản.',404);
    const role=['super_admin','school_admin','account_admin','teacher','assistant','student'].includes(b.role)?b.role:current.role;
    const status=['active','disabled','pending_activation'].includes(b.status)?b.status:current.status;
    if(current.id===admin.user_id && status!=='active') return bad('Không thể tự vô hiệu hóa tài khoản đang đăng nhập.');
    await env.DB.prepare(`UPDATE users SET role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(role,status,current.id).run(); await adminLog(env,admin.user_id,'user.update',{user_id:current.id,role,status}); return ok();
  }

  if(path==='/api/admin/classes' && method==='GET'){
    await requireRole(request,env,['super_admin','school_admin']);
    const rows=await env.DB.prepare(`SELECT c.id,c.name,c.unit,c.join_code,c.status,c.created_at,u.full_name owner_name,(SELECT COUNT(*) FROM class_members cm WHERE cm.class_id=c.id AND cm.status='active') member_count FROM classes c JOIN users u ON u.id=c.owner_user_id ORDER BY c.created_at DESC LIMIT 300`).all(); return ok({classes:rows.results||[]});
  }
  const adminClass=path.match(/^\/api\/admin\/classes\/([^/]+)$/);
  if(adminClass && method==='PATCH'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const b=await request.json(); const status=['active','archived'].includes(b.status)?b.status:null; if(!status)return bad('Trạng thái lớp không hợp lệ.'); await env.DB.prepare(`UPDATE classes SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,adminClass[1]).run(); await adminLog(env,admin.user_id,'class.status',{class_id:adminClass[1],status}); return ok();
  }

  if(path==='/api/admin/tickets' && method==='GET'){
    await requireRole(request,env,['super_admin','school_admin']); const rows=await env.DB.prepare(`SELECT t.*,u.full_name,u.email FROM support_tickets t JOIN users u ON u.id=t.requester_user_id ORDER BY t.updated_at DESC LIMIT 300`).all(); return ok({tickets:rows.results||[]});
  }
  const adminTicket=path.match(/^\/api\/admin\/tickets\/([^/]+)$/);
  if(adminTicket && method==='PATCH'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const b=await request.json(); const status=['new','in_progress','waiting_user','resolved','closed'].includes(b.status)?b.status:null; if(!status)return bad('Trạng thái ticket không hợp lệ.'); await env.DB.prepare(`UPDATE support_tickets SET status=?,assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,admin.user_id,adminTicket[1]).run(); await adminLog(env,admin.user_id,'ticket.status',{ticket_id:adminTicket[1],status}); return ok();
  }

  if(path==='/api/admin/settings' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const all=await getSettings(env);
    if(admin.role==='super_admin') return ok({settings:all});
    const allowed=['public_intro_title','public_intro_text','public_about_title','public_about_text','site_name','site_name_en','support_email','account_request_enabled','maintenance_mode','maintenance_message','allow_guest_live','default_class_unit','footer_product_text','footer_copyright','public_status_text'];
    return ok({settings:Object.fromEntries(allowed.filter(k=>Object.prototype.hasOwnProperty.call(all,k)).map(k=>[k,all[k]]))});
  }
  if(path==='/api/admin/settings' && method==='PUT'){
    const admin=await requireRole(request,env,['super_admin']); const b=await request.json(); const allowed=['live_room_max_participants','public_intro_title','public_intro_text','public_about_title','public_about_text','site_name','site_name_en','support_email','system_email','account_request_enabled','maintenance_mode','maintenance_message','default_session_days','allow_guest_live','default_class_unit','footer_product_text','footer_copyright','live_mesh_max_peers','login_rate_limit','max_upload_mb','account_portrait_max_mb','account_document_max_mb','public_status_text']; const statements=[];
    for(const key of allowed){if(Object.prototype.hasOwnProperty.call(b,key))statements.push(env.DB.prepare(`INSERT INTO system_settings(key,value,updated_by,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(key,str(b[key]),admin.user_id));}
    if(statements.length)await env.DB.batch(statements); await adminLog(env,admin.user_id,'settings.update',{keys:statements.length}); return ok({settings:await getSettings(env)});
  }

  if(path==='/api/admin/announcements' && method==='GET'){
    await requireRole(request,env,['super_admin','school_admin']); const rows=await env.DB.prepare(`SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100`).all(); return ok({announcements:rows.results||[]});
  }
  if(path==='/api/admin/announcements' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const b=await request.json(); if(!str(b.title)||!str(b.body))return bad('Tiêu đề và nội dung là bắt buộc.'); const id=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO announcements(id,title,body,audience,status,starts_at,ends_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,str(b.title),str(b.body),str(b.audience)||'all',['draft','published'].includes(b.status)?b.status:'draft',b.starts_at||null,b.ends_at||null,admin.user_id).run(); await adminLog(env,admin.user_id,'announcement.create',{id}); return ok({id});
  }

  if(path==='/api/admin/email-logs' && method==='GET'){
    await requireRole(request,env,['super_admin','account_admin']); const rows=await env.DB.prepare(`SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 200`).all(); return ok({logs:rows.results||[]});
  }

  if(path==='/api/admin/activity' && method==='GET'){
    await requireRole(request,env,['super_admin']); const rows=await env.DB.prepare(`SELECT a.*,u.full_name actor_name FROM admin_activity a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 200`).all(); return ok({activity:rows.results||[]});
  }

  if(path==='/api/admin/account-requests' && method==='GET'){
    await requireRole(request,env,['super_admin','account_admin']); const rows=await env.DB.prepare(`SELECT * FROM account_requests ORDER BY created_at DESC LIMIT 200`).all(); return ok({requests:rows.results});
  }

  const approve=path.match(/^\/api\/admin\/account-requests\/([^/]+)\/approve$/);
  if(approve && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']); const reqRow=await env.DB.prepare(`SELECT * FROM account_requests WHERE id=? AND status IN ('pending','reviewing','needs_info')`).bind(approve[1]).first(); if(!reqRow)return bad('Yêu cầu không tồn tại hoặc đã xử lý.');
    if(await env.DB.prepare(`SELECT 1 ok FROM users WHERE lower(email)=lower(?)`).bind(reqRow.email).first())return bad('Email này đã có tài khoản.',409);
    const seq=await env.DB.prepare(`UPDATE counters SET value=value+1 WHERE key='sfn_user' AND value < ? RETURNING value`).bind(MAX_ACCOUNTS).first();
    if(!seq) return bad(`Hệ thống đã đạt giới hạn ${MAX_ACCOUNTS.toLocaleString('vi-VN')} tài khoản cho giai đoạn khởi tạo.`,409);
    const sfnNo=Number(seq.value); const userId=crypto.randomUUID(); const activation=randomToken(24); const expires=new Date(Date.now()+7*86400000).toISOString();
    const data=JSON.parse(reqRow.data_json||'{}');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,sfn_no,sfn_id,full_name,email,phone,role,status,avatar_key,profile_json,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending_activation',?,?, '', '',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(userId,sfnNo,idCode(sfnNo),reqRow.full_name,reqRow.email,reqRow.phone,data.requested_access==='teacher'?'teacher':'student',reqRow.portrait_key,JSON.stringify(data)),
      env.DB.prepare(`INSERT INTO activation_tokens(token,user_id,expires_at,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(activation,userId,expires),
      env.DB.prepare(`UPDATE account_requests SET status='approved',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,approved_user_id=? WHERE id=?`).bind(admin.user_id,userId,reqRow.id)
    ]);
    const activationUrl=`${env.APP_URL}/#activate/${activation}`;
    const fallbackActivation=activationEmail(env,{fullName:reqRow.full_name,sfnId:idCode(sfnNo),activationUrl}); const tpl=await resolveEmailTemplate(env,'account_approved',`[Sky First] Kích hoạt tài khoản ${idCode(sfnNo)}`,fallbackActivation,{full_name:reqRow.full_name,sfn_id:idCode(sfnNo),activation_url:activationUrl}); const mail=await sendMail(env,reqRow.email,tpl.subject,tpl.html);
    return ok({sfn_id:idCode(sfnNo),activation_token:activation,activation_url:activationUrl,activation_email_sent:mail.sent,limit:MAX_ACCOUNTS});
  }


  const accountReview=path.match(/^\/api\/admin\/account-requests\/([^/]+)\/review$/);
  if(accountReview && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']);
    const b=await request.json(); const action=str(b.action); const note=str(b.note);
    if(!['needs_info','rejected','reviewing'].includes(action)) return bad('Thao tác xử lý không hợp lệ.');
    const row=await env.DB.prepare(`SELECT * FROM account_requests WHERE id=?`).bind(accountReview[1]).first();
    if(!row) return bad('Không tìm thấy yêu cầu.',404);
    await env.DB.batch([
      env.DB.prepare(`UPDATE account_requests SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(action,admin.user_id,row.id),
      env.DB.prepare(`INSERT INTO admin_notes(id,entity_type,entity_id,note,created_by,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),'account_request',String(row.id),note||action,admin.user_id)
    ]);
    const label=action==='needs_info'?'Cần bổ sung thông tin':action==='rejected'?'Yêu cầu chưa được chấp thuận':'Đang được xem xét';
    const body=emailShell({title:label,preheader:`Cập nhật yêu cầu ${row.request_code}`,env,body:`<p>Xin chào <b>${htmlEsc(row.full_name)}</b>,</p><p>Yêu cầu cấp tài khoản SFN <b>${htmlEsc(row.request_code)}</b> vừa được cập nhật trạng thái: <b>${htmlEsc(label)}</b>.</p>${note?`<div style="padding:16px;border-radius:14px;background:#f7f1fb"><b>Thông tin từ bộ phận phụ trách</b><br>${htmlEsc(note)}</div>`:''}<p>Bạn có thể sử dụng mã yêu cầu và email đăng ký để tra cứu trạng thái trên Trung tâm Học tập Số.</p>`});
    const key=action==='needs_info'?'account_needs_info':action==='rejected'?'account_rejected':'account_request_received'; const tpl=await resolveEmailTemplate(env,key,`[Sky First] Cập nhật yêu cầu ${row.request_code}`,body,{full_name:row.full_name,request_code:row.request_code,status:label,note}); await sendMail(env,row.email,tpl.subject,tpl.html);
    await adminLog(env,admin.user_id,'account_request.review',{id:row.id,action,note});
    return ok({status:action});
  }

  if(path==='/api/admin/users/create' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']); const b=await request.json();
    const fullName=str(b.full_name), email=normalizeEmail(str(b.email)), phone=str(b.phone), role=['teacher','assistant','student','account_admin','school_admin'].includes(b.role)?b.role:'student';
    if(!fullName||!email) return bad('Họ tên và email là bắt buộc.');
    if(await env.DB.prepare(`SELECT 1 ok FROM users WHERE lower(email)=lower(?)`).bind(email).first()) return bad('Email đã có tài khoản.',409);
    const seq=await env.DB.prepare(`UPDATE counters SET value=value+1 WHERE key='sfn_user' AND value < ? RETURNING value`).bind(MAX_ACCOUNTS).first(); if(!seq)return bad('Đã đạt giới hạn tài khoản.',409);
    const no=Number(seq.value), id=crypto.randomUUID(), token=randomToken(24), expires=new Date(Date.now()+7*86400000).toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,sfn_no,sfn_id,full_name,email,phone,role,status,profile_json,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending_activation','{}','','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,no,idCode(no),fullName,email,phone,role),
      env.DB.prepare(`INSERT INTO activation_tokens(token,user_id,expires_at,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(token,id,expires)
    ]);
    const activationUrl=`${env.APP_URL}/#activate/${token}`; const fallbackActivation=activationEmail(env,{fullName,sfnId:idCode(no),activationUrl}); const tpl=await resolveEmailTemplate(env,'account_approved',`[Sky First] Kích hoạt tài khoản ${idCode(no)}`,fallbackActivation,{full_name:fullName,sfn_id:idCode(no),activation_url:activationUrl}); const mail=await sendMail(env,email,tpl.subject,tpl.html);
    await adminLog(env,admin.user_id,'user.create',{user_id:id,sfn_id:idCode(no),role}); return ok({id,sfn_id:idCode(no),activation_url:activationUrl,email_sent:mail.sent});
  }

  if(path==='/api/admin/users/bulk-create' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']); const b=await request.json(); const items=Array.isArray(b.users)?b.users.slice(0,200):[];
    if(!items.length)return bad('Danh sách tài khoản trống.'); const results=[];
    for(const item of items){
      const fullName=str(item.full_name), email=normalizeEmail(str(item.email)), phone=str(item.phone), role=['teacher','assistant','student'].includes(item.role)?item.role:'student';
      if(!fullName||!email){results.push({email,status:'error',message:'Thiếu họ tên/email'});continue;}
      if(await env.DB.prepare(`SELECT 1 ok FROM users WHERE lower(email)=lower(?)`).bind(email).first()){results.push({email,status:'skip',message:'Email đã tồn tại'});continue;}
      const seq=await env.DB.prepare(`UPDATE counters SET value=value+1 WHERE key='sfn_user' AND value < ? RETURNING value`).bind(MAX_ACCOUNTS).first(); if(!seq){results.push({email,status:'error',message:'Đạt giới hạn tài khoản'});break;}
      const no=Number(seq.value), id=crypto.randomUUID(), token=randomToken(24), expires=new Date(Date.now()+7*86400000).toISOString();
      await env.DB.batch([env.DB.prepare(`INSERT INTO users(id,sfn_no,sfn_id,full_name,email,phone,role,status,profile_json,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending_activation','{}','','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,no,idCode(no),fullName,email,phone,role),env.DB.prepare(`INSERT INTO activation_tokens(token,user_id,expires_at,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(token,id,expires)]);
      const activationUrl=`${env.APP_URL}/#activate/${token}`; await sendMail(env,email,`[Sky First] Kích hoạt tài khoản ${idCode(no)}`,activationEmail(env,{fullName,sfnId:idCode(no),activationUrl})); results.push({email,status:'created',sfn_id:idCode(no)});
    }
    await adminLog(env,admin.user_id,'user.bulk_create',{count:items.length,created:results.filter(x=>x.status==='created').length}); return ok({results});
  }

  const userAction=path.match(/^\/api\/admin\/users\/([^/]+)\/(force-logout|activation-link)$/);
  if(userAction && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']); const user=await env.DB.prepare(`SELECT * FROM users WHERE id=?`).bind(userAction[1]).first(); if(!user)return bad('Không tìm thấy tài khoản.',404);
    if(userAction[2]==='force-logout'){await env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(user.id).run(); await adminLog(env,admin.user_id,'user.force_logout',{user_id:user.id}); return ok();}
    const token=randomToken(24), expires=new Date(Date.now()+7*86400000).toISOString(); await env.DB.batch([env.DB.prepare(`UPDATE activation_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL`).bind(user.id),env.DB.prepare(`INSERT INTO activation_tokens(token,user_id,expires_at,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(token,user.id,expires)]); const activationUrl=`${env.APP_URL}/#activate/${token}`; const mail=await sendMail(env,user.email,`[Sky First] Thiết lập lại mật khẩu ${user.sfn_id}`,activationEmail(env,{fullName:user.full_name,sfnId:user.sfn_id,activationUrl})); await adminLog(env,admin.user_id,'user.activation_link',{user_id:user.id}); return ok({activation_url:activationUrl,email_sent:mail.sent});
  }

  if(path==='/api/admin/classes/create' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const b=await request.json(); const name=str(b.name); if(!name)return bad('Tên lớp là bắt buộc.');
    let owner=admin.user_id; if(str(b.owner_login)){const u=await env.DB.prepare(`SELECT id FROM users WHERE lower(email)=lower(?) OR lower(sfn_id)=lower(?) LIMIT 1`).bind(str(b.owner_login),str(b.owner_login)).first(); if(!u)return bad('Không tìm thấy người phụ trách.'); owner=u.id;}
    const id=crypto.randomUUID(), code=slugCode('CLS'); await env.DB.batch([env.DB.prepare(`INSERT INTO classes(id,name,description,unit,join_code,owner_user_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,name,str(b.description),str(b.unit)||'Sky First Network',code,owner),env.DB.prepare(`INSERT OR REPLACE INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,'teacher','active',CURRENT_TIMESTAMP)`).bind(id,owner)]); await adminLog(env,admin.user_id,'class.create',{id,name}); return ok({id,join_code:code});
  }

  const classAction=path.match(/^\/api\/admin\/classes\/([^/]+)\/(rotate-code|members)$/);
  if(classAction && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const classId=classAction[1];
    if(classAction[2]==='rotate-code'){const code=slugCode('CLS'); await env.DB.prepare(`UPDATE classes SET join_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(code,classId).run(); await adminLog(env,admin.user_id,'class.rotate_code',{class_id:classId}); return ok({join_code:code});}
    const b=await request.json(); const login=str(b.login); const role=['teacher','assistant','student'].includes(b.role)?b.role:'student'; const u=await env.DB.prepare(`SELECT id,sfn_id,full_name FROM users WHERE lower(email)=lower(?) OR lower(sfn_id)=lower(?) LIMIT 1`).bind(login,login).first(); if(!u)return bad('Không tìm thấy thành viên.'); await env.DB.prepare(`INSERT INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,?,'active',CURRENT_TIMESTAMP) ON CONFLICT(class_id,user_id) DO UPDATE SET role=excluded.role,status='active'`).bind(classId,u.id,role).run(); await adminLog(env,admin.user_id,'class.member_add',{class_id:classId,user_id:u.id,role}); return ok({member:u});
  }

  const classMemberDelete=path.match(/^\/api\/admin\/classes\/([^/]+)\/members\/([^/]+)$/);
  if(classMemberDelete && method==='DELETE'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); await env.DB.prepare(`UPDATE class_members SET status='removed' WHERE class_id=? AND user_id=?`).bind(classMemberDelete[1],classMemberDelete[2]).run(); await adminLog(env,admin.user_id,'class.member_remove',{class_id:classMemberDelete[1],user_id:classMemberDelete[2]}); return ok();
  }

  const announcementItem=path.match(/^\/api\/admin\/announcements\/([^/]+)$/);
  if(announcementItem && method==='PATCH'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const b=await request.json(); await env.DB.prepare(`UPDATE announcements SET title=COALESCE(?,title),body=COALESCE(?,body),audience=COALESCE(?,audience),status=COALESCE(?,status),starts_at=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(b.title??null,b.body??null,b.audience??null,b.status??null,b.starts_at||null,b.ends_at||null,announcementItem[1]).run(); await adminLog(env,admin.user_id,'announcement.update',{id:announcementItem[1]}); return ok();
  }
  if(announcementItem && method==='DELETE'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); await env.DB.prepare(`DELETE FROM announcements WHERE id=?`).bind(announcementItem[1]).run(); await adminLog(env,admin.user_id,'announcement.delete',{id:announcementItem[1]}); return ok();
  }

  if(path==='/api/admin/policies' && method==='GET'){
    await requireRole(request,env,['super_admin','school_admin']); const rows=await env.DB.prepare(`SELECT * FROM policies ORDER BY key`).all(); return ok({policies:rows.results||[]});
  }
  const policyItem=path.match(/^\/api\/admin\/policies\/([^/]+)$/);
  if(policyItem && method==='PUT'){
    const admin=await requireRole(request,env,['super_admin']); const b=await request.json(); if(!str(b.title)||!str(b.body_html))return bad('Tiêu đề và nội dung là bắt buộc.'); await env.DB.prepare(`INSERT INTO policies(key,title,body_html,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET title=excluded.title,body_html=excluded.body_html,updated_at=CURRENT_TIMESTAMP`).bind(policyItem[1],str(b.title),str(b.body_html)).run(); await adminLog(env,admin.user_id,'policy.update',{key:policyItem[1]}); return ok();
  }

  if(path==='/api/admin/email-templates' && method==='GET'){
    await requireRole(request,env,['super_admin','account_admin']); const rows=await env.DB.prepare(`SELECT * FROM email_templates ORDER BY key`).all(); return ok({templates:rows.results||[]});
  }
  const templateItem=path.match(/^\/api\/admin\/email-templates\/([^/]+)$/);
  if(templateItem && method==='PUT'){
    const admin=await requireRole(request,env,['super_admin']); const b=await request.json(); await env.DB.prepare(`INSERT INTO email_templates(key,subject,body_html,enabled,updated_by,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET subject=excluded.subject,body_html=excluded.body_html,enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(templateItem[1],str(b.subject),str(b.body_html),b.enabled===false?0:1,admin.user_id).run(); await adminLog(env,admin.user_id,'email_template.update',{key:templateItem[1]}); return ok();
  }

  if(path==='/api/admin/export' && method==='GET'){
    await requireRole(request,env,['super_admin']); const type=url.searchParams.get('type')||'users';
    if(type==='users'){const rows=await env.DB.prepare(`SELECT sfn_id,full_name,email,phone,role,status,created_at FROM users ORDER BY sfn_no`).all(); return ok({type,generated_at:nowIso(),rows:rows.results||[]});}
    if(type==='classes'){const rows=await env.DB.prepare(`SELECT id,name,unit,join_code,status,created_at FROM classes ORDER BY created_at DESC`).all(); return ok({type,generated_at:nowIso(),rows:rows.results||[]});}
    if(type==='account_requests'){const rows=await env.DB.prepare(`SELECT request_code,full_name,email,phone,status,created_at,reviewed_at FROM account_requests ORDER BY created_at DESC`).all(); return ok({type,generated_at:nowIso(),rows:rows.results||[]});}
    return bad('Loại dữ liệu xuất không hợp lệ.');
  }

  if(path==='/api/admin/system/cleanup-sessions' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin']); const r=await env.DB.prepare(`DELETE FROM sessions WHERE expires_at<=CURRENT_TIMESTAMP`).run(); await adminLog(env,admin.user_id,'system.cleanup_sessions',{changes:r.meta?.changes||0}); return ok({deleted:r.meta?.changes||0});
  }

  // VPLUS: role-aware analytics. Infrastructure details never leave System Admin routes.
  const vplusAnalytics=path.match(/^\/api\/classes\/([^/]+)\/analytics$/);
  if(vplusAnalytics && method==='GET'){
    const u=await requireUser(request,env); const classId=vplusAnalytics[1];
    if(!['super_admin','school_admin'].includes(u.role)) await requireClassMember(env,classId,u.user_id,['teacher','assistant']);
    await ensureVPlusSchema(env); await ensureV13Schema(env);
    const [attendance,events,polls]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) visits,COUNT(DISTINCT user_key) participants,ROUND(AVG((julianday(COALESCE(left_at,last_seen))-julianday(joined_at))*1440),1) avg_minutes FROM live_attendance WHERE class_id=?`).bind(classId).first(),
      env.DB.prepare(`SELECT event_type,COUNT(*) n FROM live_room_events WHERE class_id=? AND datetime(created_at)>=datetime('now','-30 days') GROUP BY event_type ORDER BY n DESC LIMIT 20`).bind(classId).all(),
      env.DB.prepare(`SELECT COUNT(*) polls,COALESCE(SUM((SELECT COUNT(*) FROM live_poll_answers a WHERE a.poll_id=p.id)),0) answers FROM live_polls p WHERE class_id=?`).bind(classId).first()
    ]);
    return ok({attendance:{visits:Number(attendance?.visits||0),participants:Number(attendance?.participants||0),average_minutes:Number(attendance?.avg_minutes||0)},events:events.results||[],polls:{count:Number(polls?.polls||0),answers:Number(polls?.answers||0)}});
  }

  if(path==='/api/admin/ai/status' && method==='GET'){
    await requireRole(request,env,['super_admin']); await ensureVPlusSchema(env);
    const cfg=aiProviderConfig(env);
    const recent=await env.DB.prepare(`SELECT status,COUNT(*) n FROM ai_audit WHERE datetime(created_at)>=datetime('now','-24 hours') GROUP BY status`).all().catch(()=>({results:[]}));
    const last=await env.DB.prepare(`SELECT mode,action,status,detail_json,created_at FROM ai_audit ORDER BY created_at DESC LIMIT 1`).first().catch(()=>null);
    const key=await aiKeyDiagnostic(env);
    return ok({configured:cfg.configured,provider:cfg.provider,model:cfg.model||null,endpoint:cfg.url?(()=>{try{return new URL(cfg.url).origin}catch{return 'configured'}})():null,native_web_search:cfg.nativeWebSearch,timeout_ms:cfg.timeoutMs,key_present:key.present,key_diagnostic:key,activity_24h:recent.results||[],last:last?{mode:last.mode,action:last.action,status:last.status,created_at:last.created_at}:null});
  }

  if(path==='/api/admin/ai/test' && method==='POST'){
    await requireRole(request,env,['super_admin']); const started=Date.now(); const cfg=aiProviderConfig(env); const u=await requireUser(request,env);
    if(!cfg.configured)return bad('Sky First AI chưa được cấu hình đầy đủ.',503,{code:'AI_NOT_READY',auth:{ok:false,status:0,code:'AI_KEY_MISSING'}});
    const auth=await testAiAuthentication(env);
    if(!auth.ok){
      await auditAi(env,{userId:u.user_id,mode:'ask',action:'provider_auth_test',status:'error',detail:{code:auth.code,provider_status:auth.status||null,latency_ms:Date.now()-started}});
      return bad('Kiểm tra Sky First AI chưa thành công.',503,{code:auth.code,provider_status:auth.status||null,auth:{ok:false,status:auth.status||null,code:auth.code,error_code:auth.error_code||null,me:auth.me?{ok:auth.me.ok,status:auth.me.status,error_code:auth.me.error_code||null}:null,models:auth.models?{ok:auth.models.ok,status:auth.models.status,error_code:auth.models.error_code||null}:null},key_diagnostic:auth.key,detail:String(auth.detail||'').slice(0,600),latency_ms:Date.now()-started});
    }
    try{
      const result=await callAiProvider(env,{messages:[{role:'system',content:'Bạn đang thực hiện kiểm tra kết nối nội bộ. Trả lời thật ngắn.'},{role:'user',content:'Trả lời đúng cụm từ: SKY FIRST AI READY'}],maxTokens:48});
      await auditAi(env,{userId:u.user_id,mode:'ask',action:'provider_test',status:'ok',detail:{provider:cfg.provider,model:cfg.model,auth_status:auth.status,latency_ms:Date.now()-started}});
      return ok({ready:true,latency_ms:Date.now()-started,provider:cfg.provider,model:cfg.model,response:String(result.text).slice(0,160),native_web_search:cfg.nativeWebSearch,key_present:true,auth:{ok:true,status:auth.status,code:auth.code,me:auth.me?{ok:auth.me.ok,status:auth.me.status}:null,models:auth.models?{ok:auth.models.ok,status:auth.models.status}:null},key_diagnostic:auth.key,responses:{ok:true}});
    }catch(e){
      await auditAi(env,{userId:u.user_id,mode:'ask',action:'provider_test',status:'error',detail:{code:String(e?.message||'AI_ERROR'),provider_status:e?.providerStatus||null,auth_status:auth.status,latency_ms:Date.now()-started}});
      return bad('Kiểm tra Sky First AI chưa thành công.',503,{code:String(e?.message||'AI_ERROR'),provider_status:e?.providerStatus||null,auth:{ok:true,status:auth.status,code:auth.code,me:auth.me?{ok:auth.me.ok,status:auth.me.status}:null,models:auth.models?{ok:auth.models.ok,status:auth.models.status}:null},key_diagnostic:auth.key,responses:{ok:false,status:e?.providerStatus||null},detail:String(e?.internalDetail||'').slice(0,600),latency_ms:Date.now()-started});
    }
  }

  if(path==='/api/ai/capabilities' && method==='GET'){
    const u=await requireUser(request,env);
    return ok({available:aiConfigured(env),modes:['ask','research','create',...(hasPermission(u,'ai.analyze.class')||hasPermission(u,'ai.analyze.school')?['analyze']:[]),...(hasPermission(u,'ai.act.class')?['act']:[])]});
  }

  if(path==='/api/ai/chat' && method==='POST'){
    const u=await requireUser(request,env); requirePermission(u,'ai.ask'); await ensureVPlusSchema(env); await consumeAiQuota(env,u.user_id);
    const b=await request.json(); const message=str(b.message).slice(0,8000); const mode=['ask','research','create','analyze','act'].includes(str(b.mode))?str(b.mode):'ask'; const classId=str(b.class_id)||null;
    if(message.length<1)return bad('Vui lòng nhập nội dung bạn muốn hỏi.');
    const safety=moderateAiInput(message); if(!safety.allowed){await auditAi(env,{userId:u.user_id,classId,mode,action:'safety_block',status:'blocked',detail:{category:safety.category}}).catch(()=>{});return bad(safety.message,422,{code:'AI_CONTENT_RESTRICTED'});}
    if(mode==='analyze' && !(hasPermission(u,'ai.analyze.class')||hasPermission(u,'ai.analyze.school'))) return bad('Bạn không có quyền sử dụng chế độ phân tích này.',403);
    if(mode==='act' && !hasPermission(u,'ai.act.class')) return bad('Bạn không có quyền sử dụng chế độ thực hiện trong lớp.',403);
    let classInfo=null,contextText=''; const sources=[];
    if(classId){
      if(!['super_admin','school_admin'].includes(u.role)) await requireClassMember(env,classId,u.user_id);
      classInfo=await env.DB.prepare(`SELECT id,name,unit FROM classes WHERE id=?`).bind(classId).first();
      if(!classInfo)return bad('Không tìm thấy lớp học.',404);
      const resources=await env.DB.prepare(`SELECT title,url,resource_type,pinned FROM live_resources WHERE class_id=? ORDER BY pinned DESC,created_at DESC LIMIT 20`).bind(classId).all().catch(()=>({results:[]}));
      const polls=await env.DB.prepare(`SELECT question,status FROM live_polls WHERE class_id=? ORDER BY created_at DESC LIMIT 8`).bind(classId).all().catch(()=>({results:[]}));
      const bits=[];
      if(resources.results?.length){bits.push('Tài nguyên lớp được phép tham chiếu: '+resources.results.map(x=>`${x.title}${x.resource_type?` [${x.resource_type}]`:''}`).join('; ')); for(const x of resources.results){if(/^https?:\/\//i.test(String(x.url||''))) sources.push({index:sources.length+1,title:x.title,url:x.url,snippet:'Tài nguyên được ghim/cung cấp trong lớp học.',origin:'internal'});}}
      if(polls.results?.length) bits.push('Poll gần đây: '+polls.results.map(x=>`${x.question} (${x.status})`).join('; '));
      if((mode==='analyze'||mode==='act')&&['teacher','assistant','school_admin','super_admin'].includes(u.role)){
        const att=await env.DB.prepare(`SELECT COUNT(DISTINCT user_key) participants,ROUND(AVG((julianday(COALESCE(left_at,last_seen))-julianday(joined_at))*1440),1) avg_minutes FROM live_attendance WHERE class_id=?`).bind(classId).first().catch(()=>null);
        const evt=await env.DB.prepare(`SELECT event_type,COUNT(*) n FROM live_room_events WHERE class_id=? AND datetime(created_at)>=datetime('now','-7 days') GROUP BY event_type ORDER BY n DESC LIMIT 12`).bind(classId).all().catch(()=>({results:[]}));
        if(att) bits.push(`Tổng hợp tham gia: ${Number(att.participants||0)} người; thời lượng trung bình ${Number(att.avg_minutes||0)} phút.`);
        if(evt.results?.length) bits.push('Tương tác 7 ngày: '+evt.results.map(x=>`${x.event_type}: ${x.n}`).join('; '));
      }
      contextText=bits.join('\n');
    } else if(mode==='analyze' && u.role==='super_admin'){
      const [users,classes,incidents]=await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) n FROM users WHERE status='active'`).first().catch(()=>({n:0})),
        env.DB.prepare(`SELECT COUNT(*) n FROM classes WHERE status='active'`).first().catch(()=>({n:0})),
        env.DB.prepare(`SELECT severity,COUNT(*) n FROM system_incidents WHERE datetime(created_at)>=datetime('now','-24 hours') GROUP BY severity`).all().catch(()=>({results:[]}))
      ]);
      contextText=`Tổng hợp nền tảng được phép cho System Admin: ${Number(users?.n||0)} tài khoản hoạt động; ${Number(classes?.n||0)} lớp hoạt động; sự cố 24 giờ: ${(incidents.results||[]).map(x=>`${x.severity}:${x.n}`).join(', ')||'không ghi nhận'}.`;
    }
    const skyFirstQuery=/(sky\s*first|skyfirst|trung tam hoc tap so|chu tich|chu nhiem|sfec|nha han ngu|ctt\.|tnv\.|game\.skyfirst|sky first network)/i.test(message.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
    if(skyFirstQuery){
      contextText += `${contextText?'\n':''}NGUỒN CHÍNH THỨC SKY FIRST NETWORK (ưu tiên xác minh trước mọi nguồn khác):\n- Trang điện tử: https://skyfirst.io.vn\n- Cổng thông tin: https://ctt.skyfirst.io.vn\n- Tình nguyện viên: https://tnv.skyfirst.io.vn\n- Sky First Play: https://game.skyfirst.io.vn\n- Facebook chính thức: https://facebook.com/skyfirstnetwork\n- TikTok chính thức: https://tiktok.com/@skyfirstnetwork\n- Instagram chính thức: https://instagram.com/skyfirstnetwork\nKhi câu hỏi liên quan Sky First Network, hãy chủ động dùng tìm kiếm web nếu kiến thức hiện có chưa đủ; ưu tiên các nguồn chính thức trên, đối chiếu ít nhất một nguồn khác khi thông tin có tính nhân sự/chức danh hoặc có khả năng thay đổi. Không tự suy đoán hoặc lưu vĩnh viễn thông tin chưa xác minh.`;
    }
    if(mode==='research'){
      const found=await fetchResearchSources(env,message);
      sources.push(...found.map(x=>({...x,origin:'web'})));
      if(found.length){contextText += `${contextText?'\n':''}Nguồn nghiên cứu được hệ thống cung cấp:\n`+found.map(x=>`[${x.index}] ${x.title}\n${x.url}\n${x.snippet}`).join('\n\n');}
      else if(aiSupportsNativeResearch(env)) contextText += `${contextText?'\n':''}Bạn được phép sử dụng công cụ tìm kiếm web tích hợp cho lượt nghiên cứu này. Chỉ nêu thông tin bạn thực sự tìm thấy.`;
      else contextText += `${contextText?'\n':''}Chưa có nguồn web trực tiếp được cung cấp cho lượt này. Không được giả vờ đã duyệt web.`;
    }
    let conversationId=str(b.conversation_id);
    if(conversationId){const own=await env.DB.prepare(`SELECT id FROM ai_conversations WHERE id=? AND user_id=?`).bind(conversationId,u.user_id).first();if(!own)conversationId='';}
    if(!conversationId){conversationId=crypto.randomUUID();await env.DB.prepare(`INSERT INTO ai_conversations(id,user_id,class_id,mode,title,created_at,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(conversationId,u.user_id,classId,mode,message.slice(0,80)).run();}
    const history=await env.DB.prepare(`SELECT role,content FROM ai_messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 30`).bind(conversationId).all();
    const system=buildAiSystemPrompt({user:u,classInfo,mode,contextText}); const msgs=[{role:'system',content:system},...(history.results||[]).reverse().map(x=>({role:x.role==='assistant'?'assistant':'user',content:x.content})),{role:'user',content:message}];
    await env.DB.prepare(`INSERT INTO ai_messages(id,conversation_id,role,content,created_at) VALUES(?,?, 'user',?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),conversationId,message).run();
    try{
      const result=await callAiProvider(env,{messages:msgs,maxTokens:(mode==='research'||skyFirstQuery)?1900:1500,webSearch:mode==='research'||skyFirstQuery});
      if(Array.isArray(result.sources)&&result.sources.length){const seen=new Set(sources.map(x=>x.url));for(const src of result.sources){if(src.url&&!seen.has(src.url)){sources.push({...src,index:sources.length+1,origin:skyFirstQuery&&/skyfirst\.io\.vn|facebook\.com\/skyfirstnetwork|tiktok\.com\/@skyfirstnetwork|instagram\.com\/skyfirstnetwork/i.test(src.url)?'official':'web'});seen.add(src.url)}}}
      let answer=result.text,pendingAction=null;
      if(mode==='act'&&classId){
        const parsed=parseAiAction(result.text);
        if(parsed){
          answer=parsed.message; const actionId=crypto.randomUUID(); const expires=new Date(Date.now()+10*60*1000).toISOString();
          await env.DB.prepare(`INSERT INTO ai_action_requests(id,user_id,class_id,action_key,payload_json,risk_level,status,expires_at,created_at) VALUES(?,?,?,?,?,'normal','pending',?,CURRENT_TIMESTAMP)`).bind(actionId,u.user_id,classId,parsed.action.key,JSON.stringify(parsed.action.payload||{}),expires).run();
          pendingAction={id:actionId,key:parsed.action.key,summary:parsed.message,expires_at:expires};
        }
      }
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO ai_messages(id,conversation_id,role,content,citations_json,created_at) VALUES(?,?, 'assistant',?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),conversationId,answer,JSON.stringify(sources)),
        env.DB.prepare(`UPDATE ai_conversations SET mode=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(mode,conversationId)
      ]);
      await auditAi(env,{userId:u.user_id,classId,mode,action:pendingAction?'prepare_action':'chat',status:'ok',detail:{chars:message.length,action:pendingAction?.key||null,sources:sources.length}}); await recordPlatformEvent(env,{classId,userId:u.user_id,type:'ai.used',source:'ai',detail:{mode}});
      return ok({conversation_id:conversationId,answer,sources,pending_action:pendingAction});
    }catch(e){await auditAi(env,{userId:u.user_id,classId,mode,action:'chat',status:'error',detail:{code:String(e?.message||'AI_ERROR')}});return bad(safeUserMessage(e,'Sky First AI tạm thời chưa thể phản hồi. Vui lòng thử lại sau.'),e?.status||503);}
  }

  const aiActionConfirm=path.match(/^\/api\/ai\/actions\/([^/]+)\/confirm$/);
  if(aiActionConfirm && method==='POST'){
    const u=await requireUser(request,env); await ensureVPlusSchema(env);
    const row=await env.DB.prepare(`SELECT * FROM ai_action_requests WHERE id=? AND user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`).bind(aiActionConfirm[1],u.user_id).first();
    if(!row)return bad('Yêu cầu xác nhận đã hết hạn hoặc không còn khả dụng.',404);
    if(!hasPermission(u,'ai.act.class'))return bad('Bạn không có quyền thực hiện thao tác này.',403);
    if(!['super_admin','school_admin'].includes(u.role))await requireClassMember(env,row.class_id,u.user_id,['teacher','assistant']);
    const payload=safeJson(row.payload_json,{}); let result={};
    if(row.action_key==='create_poll'){
      const question=str(payload.question).slice(0,300); const options=(Array.isArray(payload.options)?payload.options:[]).map(x=>str(x).slice(0,180)).filter(Boolean).slice(0,8);
      if(question.length<2||options.length<2)return bad('Nội dung poll chưa đủ để tạo.'); const id=crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO live_polls(id,class_id,question,options_json,anonymous,status,created_by,created_at) VALUES(?,?,?,?,?,'open',?,CURRENT_TIMESTAMP)`).bind(id,row.class_id,question,JSON.stringify(options),payload.anonymous?1:0,u.user_id).run(); result={id,kind:'poll'}; await logLiveEvent(env,row.class_id,'poll.created',`user:${u.user_id}`,u.full_name,{id,question});
    }else if(row.action_key==='add_resource'){
      const title=str(payload.title).slice(0,160),urlv=str(payload.url).slice(0,1200); if(!title||!/^https?:\/\//i.test(urlv))return bad('Tài nguyên cần tên và liên kết hợp lệ.'); const id=crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO live_resources(id,class_id,title,url,resource_type,pinned,created_by,created_at) VALUES(?,?,?,?, 'link',1,?,CURRENT_TIMESTAMP)`).bind(id,row.class_id,title,urlv,u.user_id).run(); result={id,kind:'resource'}; await logLiveEvent(env,row.class_id,'resource.added',`user:${u.user_id}`,u.full_name,{id,title});
    }else if(row.action_key==='update_class_policy'){
      await ensureV13Schema(env); const allowed=['allow_student_mic','allow_student_camera','allow_student_share','allow_chat','allow_reactions']; const updates=[]; const values=[];
      for(const k of allowed)if(k in payload){updates.push(`${k}=?`);values.push(payload[k]?1:0)} if(!updates.length)return bad('Không có cài đặt phù hợp để thay đổi.');
      values.push(u.user_id,row.class_id); await env.DB.prepare(`UPDATE class_live_settings SET ${updates.join(',')},updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE class_id=?`).bind(...values).run(); result={kind:'class_policy',changed:updates.length}; await logLiveEvent(env,row.class_id,'settings.updated',`user:${u.user_id}`,u.full_name,{source:'ai'});
    }else return bad('Thao tác này chưa được hỗ trợ.',400);
    await env.DB.prepare(`UPDATE ai_action_requests SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run(); await auditAi(env,{userId:u.user_id,classId:row.class_id,mode:'act',action:row.action_key,status:'confirmed',detail:result}); await recordPlatformEvent(env,{classId:row.class_id,userId:u.user_id,type:'ai.action.confirmed',source:'ai',detail:{action:row.action_key}}); return ok({message:'Đã thực hiện thao tác.',result});
  }

  const aiActionCancel=path.match(/^\/api\/ai\/actions\/([^/]+)\/cancel$/);
  if(aiActionCancel && method==='POST'){
    const u=await requireUser(request,env); await ensureVPlusSchema(env); await env.DB.prepare(`UPDATE ai_action_requests SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'`).bind(aiActionCancel[1],u.user_id).run(); return ok({message:'Đã hủy thao tác.'});
  }

  if(path==='/api/notifications' && method==='GET'){
    const u=await requireUser(request,env); const rows=await env.DB.prepare(`SELECT * FROM notification_center WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50`).bind(u.user_id).all(); return ok({notifications:rows.results||[]});
  }
  const notificationRead=path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if(notificationRead && method==='POST'){
    const u=await requireUser(request,env); await env.DB.prepare(`UPDATE notification_center SET is_read=1 WHERE id=? AND (user_id=? OR user_id IS NULL)`).bind(notificationRead[1],u.user_id).run(); return ok();
  }

  if(path==='/api/admin/system/upgrade' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin']); const upgrade=await ensureLatestSchema(env); await ensureRealtimeSfuSchema(env); await env.DB.prepare(`INSERT INTO system_settings(key,value,updated_by,updated_at) VALUES('platform_version','VPLUS',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='VPLUS',updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(admin.user_id).run(); await adminLog(env,admin.user_id,'system.schema_upgrade',{version:'VPLUS',completed:upgrade.completed}); await ensureV13Schema(env); await ensureVPlusSchema(env); return ok({version:'VPLUS',message:'Nền tảng đã được kiểm tra và cập nhật an toàn.',completed:upgrade.completed});
  }

  if(path==='/api/admin/system/diagnostics' && method==='GET'){
    await requireRole(request,env,['super_admin']); const checks=[];
    const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
    try{const r=await env.DB.prepare(`SELECT COUNT(*) n FROM users`).first();add('D1 / users',true,`${r?.n||0} tài khoản`)}catch(e){add('D1 / users',false,e.message)}
    try{const r=await env.DB.prepare(`SELECT COUNT(*) n FROM system_settings`).first();add('Cấu hình hệ thống',true,`${r?.n||0} thiết lập`)}catch(e){add('Cấu hình hệ thống',false,e.message)}
    try{await env.DB.prepare(`SELECT 1 FROM live_access_tokens LIMIT 1`).first();add('Live access V10',true,'Bảng token phòng học sẵn sàng')}catch(e){add('Live access V10',false,e.message)}
    try{await env.DB.prepare(`SELECT 1 FROM class_messages LIMIT 1`).first();add('Class chat V10',true,'Bảng trò chuyện sẵn sàng')}catch(e){add('Class chat V10',false,e.message)}
    add('R2 FILES',!!env.FILES,env.FILES?'Binding FILES đã có':'Thiếu binding FILES');
    add('Durable Object LIVE_ROOM',!!env.LIVE_ROOM,env.LIVE_ROOM?'Binding LIVE_ROOM đã có':'Thiếu binding LIVE_ROOM');
    {const sf=realtimeSfuConfig(env);add('Realtime SFU / skyfirsthoc',sf.configured,sf.configured?`Đã cấu hình ${sf.appName}`:'Thiếu REALTIME_APP_ID hoặc REALTIME_APP_SECRET');}
    add('Resend',!!env.RESEND_API_KEY,env.RESEND_API_KEY?'RESEND_API_KEY đã cấu hình':'Chưa có RESEND_API_KEY; email sẽ không gửi');
    {const ai=aiProviderConfig(env);add('Sky First AI',ai.configured,ai.configured?`Provider ${ai.provider}; model ${ai.model}`:'Thiếu AI_API_KEY hoặc cấu hình provider/model');}
    add('Setup token',!!env.SETUP_TOKEN,env.SETUP_TOKEN?'SETUP_TOKEN đã cấu hình':'Nên cấu hình SETUP_TOKEN để bảo vệ khởi tạo');
    const failed=checks.filter(x=>!x.ok).length; return ok({version:'VPLUS',status:failed?'attention':'healthy',failed,checks,time:nowIso()});
  }

  if(path==='/api/admin/system/test-email' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin']); const u=await env.DB.prepare(`SELECT email,full_name FROM users WHERE id=?`).bind(admin.user_id).first(); const body=emailShell({title:'Kiểm tra hệ thống email V10',preheader:'Email kiểm tra từ Trung tâm Học tập Số Sky First Network',env,body:`<p>Xin chào <b>${htmlEsc(u?.full_name||'Quản trị viên')}</b>,</p><p>Email này xác nhận cấu hình gửi thư của hệ thống V10 đang được kiểm tra trực tiếp từ Control Center.</p>`}); const mail=await sendMail(env,u.email,'[Sky First] Kiểm tra hệ thống email V10',body); await adminLog(env,admin.user_id,'system.test_email',{sent:mail.sent}); return ok({sent:mail.sent,reason:mail.reason||''});
  }

  if(path==='/api/admin/system/cleanup' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin']); const a=await env.DB.prepare(`DELETE FROM sessions WHERE expires_at<=CURRENT_TIMESTAMP`).run(); const b=await env.DB.prepare(`DELETE FROM activation_tokens WHERE expires_at<=CURRENT_TIMESTAMP OR used_at IS NOT NULL`).run(); const c=await env.DB.prepare(`DELETE FROM live_access_tokens WHERE expires_at<=CURRENT_TIMESTAMP`).run(); const d=await env.DB.prepare(`DELETE FROM login_throttle WHERE updated_at<datetime('now','-2 days')`).run(); const result={sessions:a.meta?.changes||0,activation_tokens:b.meta?.changes||0,live_tokens:c.meta?.changes||0,throttle:d.meta?.changes||0}; await adminLog(env,admin.user_id,'system.cleanup',result); return ok(result);
  }

  if(path==='/api/admin/stats' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin','account_admin']);
    const [users,classes,requests,tickets]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) n FROM users`).first(),env.DB.prepare(`SELECT COUNT(*) n FROM classes WHERE status='active'`).first(),env.DB.prepare(`SELECT COUNT(*) n FROM account_requests WHERE status='pending'`).first(),env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets WHERE status!='resolved'`).first()
    ]);
    const base={users:users.n,account_limit:MAX_ACCOUNTS,classes:classes.n,pending_requests:requests.n,open_tickets:tickets.n};
    if(admin.role!=='super_admin') return ok(base);
    const [failedMail,activeSessions,liveTokens]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) n FROM email_logs WHERE status='failed'`).first(),
      env.DB.prepare(`SELECT COUNT(*) n FROM sessions WHERE expires_at>CURRENT_TIMESTAMP`).first(),
      env.DB.prepare(`SELECT COUNT(*) n FROM live_access_tokens WHERE expires_at>CURRENT_TIMESTAMP`).first().catch(()=>({n:0}))
    ]);
    return ok({...base,failed_emails:failedMail?.n||0,active_sessions:activeSessions?.n||0,live_tokens:liveTokens?.n||0});
  }

  const fileMatch=path.match(/^\/api\/files\/([^/]+)$/);
  if(fileMatch && method==='GET'){
    const u=await requireUser(request,env); const f=await env.DB.prepare(`SELECT * FROM files WHERE id=?`).bind(fileMatch[1]).first(); if(!f)return bad('Không tìm thấy tệp.',404);
    if(f.visibility==='private' && f.owner_user_id!==u.user_id && !['super_admin','school_admin'].includes(u.role)){ const grader=await env.DB.prepare(`SELECT 1 ok FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN class_members cm ON cm.class_id=a.class_id WHERE s.file_id=? AND cm.user_id=? AND cm.status='active' AND cm.role IN ('teacher','assistant') LIMIT 1`).bind(f.id,u.user_id).first(); if(!grader)return bad('Không có quyền.',403); }
    if(f.visibility==='class' && !['super_admin','school_admin'].includes(u.role)){ const allowed=await env.DB.prepare(`SELECT 1 ok FROM materials m JOIN class_members cm ON cm.class_id=m.class_id WHERE m.file_id=? AND cm.user_id=? AND cm.status='active' LIMIT 1`).bind(f.id,u.user_id).first(); if(!allowed) return bad('Không có quyền.',403); }
    const obj=await env.FILES.get(f.r2_key); if(!obj)return bad('Tệp không còn trong kho.',404);
    const headers=new Headers(); obj.writeHttpMetadata(headers); const unsafe=new Set(['text/html','image/svg+xml','application/xhtml+xml','text/javascript','application/javascript']); headers.set('content-disposition',`${unsafe.has(String(f.mime||'').toLowerCase())?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`); headers.set('x-content-type-options','nosniff'); headers.set('cache-control','private, no-store'); if(unsafe.has(String(f.mime||'').toLowerCase()))headers.set('content-security-policy',"sandbox; default-src 'none'"); return new Response(obj.body,{headers});
  }

  if(path==='/api/live/capabilities' && method==='GET'){
    await requireUser(request,env);
    return ok({media:true,discussion:true,realtime:!!env.LIVE_ROOM,screen_share:true});
  }

  const wsMatch=path.match(/^\/api\/live\/([^/]+)\/ws$/);
  if(wsMatch){
    if(env.LIVE_ROOM){
      const id=env.LIVE_ROOM.idFromName(wsMatch[1]); return env.LIVE_ROOM.get(id).fetch(request);
    }
    return bad('Phòng học trực tuyến thời gian thực chưa được liên kết. Các chức năng học tập khác vẫn hoạt động bình thường.',503,{code:'LIVE_SIGNALING_NOT_BOUND'});
  }

  return bad('API không tồn tại.',404);
}

export async function handleApiRequest(request, env, ctx) {
  const url=new URL(request.url); const requestId=crypto.randomUUID();
  try {
    if(!url.pathname.startsWith('/api/')) return bad('API không tồn tại.',404);
    if(request.method==='OPTIONS') return secureResponse(new Response(null,{status:204}),requestId);

    // SETUP/HẠ TẦNG PHẢI CHẠY TRƯỚC SESSION PREFLIGHT.
    // Trình duyệt có thể còn cookie phiên cũ từ một deployment trước. Nếu schema
    // phiên cũ chưa đầy đủ, getSession() có thể lỗi trước khi /api/setup/bootstrap
    // được xử lý và biến mọi lỗi thành 500 chung chung. Các endpoint setup dùng
    // SETUP_TOKEN riêng nên không phụ thuộc vào session người dùng.
    if (url.pathname === '/api/health' || url.pathname.startsWith('/api/setup/')) {
      return secureResponse(await routeApi(request,env,ctx,url),requestId);
    }

    const session=await getSession(request,env);
    if(session && !url.pathname.startsWith('/api/exam-attempts/') && !['/api/auth/me','/api/auth/logout'].includes(url.pathname)){
      const exam=await activeExam(session.user_id,env);
      if(exam && !url.pathname.startsWith('/api/exam-attempts/') && !url.pathname.startsWith('/api/exams/') && url.pathname!='/api/auth/me' && url.pathname!='/api/auth/logout') return secureResponse(bad('Tài khoản đang ở Chế độ kiểm tra. Hãy hoàn thành hoặc nộp bài trước khi truy cập chức năng khác.',423,exam),requestId);
    }
    return secureResponse(await routeApi(request,env,ctx,url),requestId);
  } catch(e){
    if(e?.message==='AUTH')return secureResponse(bad('Vui lòng đăng nhập tài khoản SFN.',401),requestId);
    if(e?.message==='FORBIDDEN')return secureResponse(bad('Bạn không có quyền thực hiện thao tác này.',403),requestId);
    console.error(e); if((e?.status||500)>=500&&ctx?.waitUntil){ctx.waitUntil((async()=>{try{await env.DB.prepare(`INSERT INTO system_incidents(id,severity,component,message,detail_json,created_at) VALUES(?,'error','pages-function',?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),String(e?.message||'Lỗi hệ thống').slice(0,500),JSON.stringify({path:url.pathname,request_id:requestId})).run()}catch{}})());} return secureResponse(bad(safeUserMessage(e),e?.status||500,{request_id:requestId}),requestId);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url=new URL(request.url); const requestId=crypto.randomUUID();
    if(url.pathname.startsWith('/api/')) return handleApiRequest(request,env,ctx);
    if(env.ASSETS?.fetch) return secureResponse(await env.ASSETS.fetch(request),requestId);
    return secureResponse(new Response('Not found',{status:404}),requestId);
  }
};
