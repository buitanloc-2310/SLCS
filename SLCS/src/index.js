import { V11_SCHEMA_STAGES } from './schema-v11.js';
import { ensureV13Schema, safeJson } from './v13-platform.js';
import { ensureVPlusSchema, recordPlatformEvent, requirePermission, safeUserMessage } from './vplus-platform.js';

const SECURITY_HEADERS = {'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'SAMEORIGIN','permissions-policy':'camera=(), microphone=(), display-capture=(), geolocation=()','cross-origin-opener-policy':'same-origin-allow-popups','strict-transport-security':'max-age=31536000; includeSubDomains','access-control-allow-origin':'https://exam.skyfirst.io.vn','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'86400'};
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control':'no-store', ...SECURITY_HEADERS };
const COOKIE = 'sfn_slc_session';
const MAX_ACCOUNTS = 10000;
function json(data, status = 200, extra = {}) { return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } }); }
function bad(message, status = 400, detail = undefined) { return json({ ok: false, message, detail }, status); }
function ok(data = {}) { return json({ ok: true, ...data }); }
function secureResponse(r,requestId=''){if(!r||r.status===101)return r;const h=new Headers(r.headers);for(const [k,v] of Object.entries(SECURITY_HEADERS))if(!h.has(k))h.set(k,v);if(requestId)h.set('x-request-id',requestId);return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});}
function nowIso() { return new Date().toISOString(); }
// Backward compatibility: old assessment schedules were saved from datetime-local without a timezone.
// SLC is operated in Viet Nam, so legacy naive values are interpreted as UTC+07:00. New clients send ISO/Z.
function examTimeMs(value) {
  const v=str(value); if(!v) return null;
  const explicit=/(?:Z|[+-]\d{2}:?\d{2})$/i.test(v);
  const normalized=explicit?v:v.replace(' ','T')+'+07:00';
  const ms=Date.parse(normalized); return Number.isFinite(ms)?ms:null;
}

function publicExamQuestions(raw='[]') {
  let questions=[]; try{questions=Array.isArray(raw)?raw:JSON.parse(raw||'[]')}catch{questions=[]}
  return questions.map(q=>{const {answer,...safe}=q&&typeof q==='object'?q:{};return safe});
}

function cryptoShuffle(list=[]){
  const out=[...list];
  for(let i=out.length-1;i>0;i--){const max=0x100000000-(0x100000000%(i+1));let n;do{const a=new Uint32Array(1);crypto.getRandomValues(a);n=a[0]}while(n>=max);const j=n%(i+1);[out[i],out[j]]=[out[j],out[i]]}
  return out;
}
function examQuestionSnapshot(raw='[]',shuffleQuestions=false,shuffleOptions=false){
  let qs=[];try{qs=Array.isArray(raw)?raw:JSON.parse(raw||'[]')}catch{qs=[]}
  qs=qs.map(q=>({...q,options:Array.isArray(q?.options)?[...q.options]:[]}));
  if(shuffleOptions)qs=qs.map(q=>q.options.length>1?{...q,options:cryptoShuffle(q.options)}:q);
  return JSON.stringify(shuffleQuestions?cryptoShuffle(qs):qs);
}
function assessmentScoreVisible(exam={},now=Date.now()){
  if(Number(exam.show_score)===0)return false;
  const policy=str(exam.result_policy||'score_after_submit');
  if(policy==='score_after_submit')return true;
  if(policy==='full_review_after_close'){const closeMs=examTimeMs(exam.closes_at);return exam.status==='closed'||!!(closeMs&&now>=closeMs)}
  return false;
}

function randomToken(bytes = 32) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2,'0')).join(''); }
function safeName(s='file') { return s.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120) || 'file'; }
function cookieParse(h='') { return Object.fromEntries(h.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('='); return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]})); }
function bearerToken(request){const h=str(request.headers.get('authorization'));const m=h.match(/^Bearer\s+([A-Za-z0-9._~-]{16,512})$/i);return m?m[1]:'';}
function sessionCookie(token, days=30) { return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${days*86400}`; }
function clearCookie() { return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`; }
function idCode(n) { return `SFN${String(n).padStart(5,'0')}`; }
function slugCode(prefix='CLS') { const a=new Uint8Array(8); crypto.getRandomValues(a); const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const code=[...a].map(x=>alphabet[x%alphabet.length]).join(''); return `${prefix}-${code.slice(0,4)}-${code.slice(4,8)}`; }

const PASSWORD_KDF_VERSION='v3';
// Cloudflare Workers WebCrypto handles 100k PBKDF2-SHA256 iterations reliably while
// materially hardening the previous 10k configuration. Existing v2/legacy hashes
// remain verifiable and are transparently upgraded after a successful login.
const PASSWORD_KDF_ITERATIONS=100000;
function parsePasswordSaltSpec(value=''){
  const raw=String(value||'');
  const versioned=raw.match(/^(v\d+)\$(\d+)\$([0-9a-fA-F]{16,256})$/);
  if(versioned)return {version:versioned[1],iterations:Math.max(10000,Math.min(600000,Number(versioned[2])||10000)),saltHex:versioned[3].toLowerCase()};
  return {version:'legacy',iterations:10000,saltHex:/^[0-9a-fA-F]{16,256}$/.test(raw)?raw.toLowerCase():''};
}
async function hashPassword(password, saltSpec = null) {
  const parsed=saltSpec?parsePasswordSaltSpec(saltSpec):{version:PASSWORD_KDF_VERSION,iterations:PASSWORD_KDF_ITERATIONS,saltHex:''};
  const iterations=parsed.iterations, saltHex=parsed.saltHex;
  const pairs=saltHex.match(/.{1,2}/g);
  const salt=pairs&&pairs.length?Uint8Array.from(pairs.map(x=>parseInt(x,16))):crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'},key,256);
  const hash=[...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const saltOut=[...salt].map(x=>x.toString(16).padStart(2,'0')).join('');
  return {hash,salt:saltSpec?String(saltSpec):`${PASSWORD_KDF_VERSION}$${PASSWORD_KDF_ITERATIONS}$${saltOut}`};
}
async function verifyPassword(password,salt,expected){return (await hashPassword(password,salt)).hash===expected;}
function passwordNeedsUpgrade(salt=''){const p=parsePasswordSaltSpec(salt);return p.version!==PASSWORD_KDF_VERSION||p.iterations<PASSWORD_KDF_ITERATIONS;}

async function getSession(request, env) {
  const token = cookieParse(request.headers.get('cookie') || '')[COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT s.id session_id,s.user_id,s.expires_at,u.sfn_no,COALESCE(u.sfn_id,'') sfn_id,COALESCE(u.full_name,'') full_name,COALESCE(u.email,'') email,COALESCE(u.phone,'') phone,COALESCE(u.role,'student') role,COALESCE(u.status,'active') status,COALESCE(u.avatar_key,'') avatar_key FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > CURRENT_TIMESTAMP AND u.status='active'`).bind(token).first();
  return row || null;
}
async function requireUser(req, env) { const u=await getSession(req,env); if(!u) throw Object.assign(new Error('AUTH'),{status:401}); return u; }
async function requireExamUser(req,env,attemptId){
  const session=await getSession(req,env); if(session)return session;
  const raw=bearerToken(req); if(!raw)throw Object.assign(new Error('AUTH'),{status:401});
  const hash=await sha256Text(raw);
  const row=await env.DB.prepare(`SELECT t.user_id,u.sfn_no,COALESCE(u.sfn_id,'') sfn_id,COALESCE(u.full_name,'') full_name,COALESCE(u.email,'') email,COALESCE(u.role,'student') role,COALESCE(u.status,'active') status FROM exam_access_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.attempt_id=? AND t.expires_at>CURRENT_TIMESTAMP AND u.status='active'`).bind(hash,attemptId).first();
  if(!row)throw Object.assign(new Error('AUTH'),{status:401}); return row;
}
async function requireRole(req, env, roles) { const u=await requireUser(req,env); if(!roles.includes(u.role)) throw Object.assign(new Error('FORBIDDEN'),{status:403}); return u; }
async function tableHasColumn(env,table,column){const r=await env.DB.prepare(`PRAGMA table_info(${table})`).all();return (r.results||[]).some(x=>x.name===column)}
async function requireOrganizationContext(request,env,u){
  const explicit=str(request.headers.get('x-organization-id'));
  const requested=explicit||'sky-first';
  if(u.role==='super_admin'){
    const o=await env.DB.prepare(`SELECT id FROM organizations WHERE id=? AND status='active'`).bind(requested).first();
    if(o?.id)return o.id;
    if(!explicit&&requested==='sky-first')return 'sky-first';
    throw Object.assign(new Error('Không tìm thấy tổ chức đang chọn.'),{status:404});
  }
  const m=await env.DB.prepare(`SELECT organization_id FROM organization_members WHERE organization_id=? AND user_id=? AND status='active'`).bind(requested,u.user_id).first();
  if(m)return requested;
  if(requested==='sky-first')return 'sky-first';
  throw Object.assign(new Error('FORBIDDEN'),{status:403});
}

async function activeExam(userId, env) { return reconcileActiveExam(userId,env); }

async function classOrganization(env,classId){
  const r=await env.DB.prepare(`SELECT COALESCE(organization_id,'sky-first') organization_id FROM classes WHERE id=?`).bind(classId).first();
  if(!r)throw Object.assign(new Error('Không tìm thấy lớp.'),{status:404});
  return str(r.organization_id)||'sky-first';
}
async function requireClassOrganizationAccess(request,env,u,classId){const classOrg=await classOrganization(env,classId);const requested=await requireOrganizationContext(request,env,u);if(u.role!=='super_admin'&&classOrg!==requested)throw Object.assign(new Error('FORBIDDEN'),{status:403});if(u.role==='super_admin'&&str(request.headers.get('x-organization-id'))&&classOrg!==requested)throw Object.assign(new Error('FORBIDDEN'),{status:403});return classOrg}
const BASE_ROLE_PERMISSIONS={student:['class.join','class.chat','class.react'],guest:['class.join','class.chat','class.react'],assistant:['class.manage','assessment.monitor','assessment.grade'],teacher:['class.manage','assessment.manage','assessment.monitor','assessment.grade'],account_admin:['accounts.manage','assessment.view'],school_admin:['school.manage','class.manage','assessment.manage','assessment.monitor','assessment.grade','analytics.view','automation.manage','iam.manage'],super_admin:['*']};
async function effectivePermissions(env,u,org='sky-first'){
  const base=BASE_ROLE_PERMISSIONS[str(u?.role)||'guest']||[];
  if(base.includes('*'))return new Set(['*']);
  const out=new Set(base);
  try{const rows=await env.DB.prepare(`SELECT rp.permission FROM user_role_assignments ura JOIN role_permissions rp ON rp.role_id=ura.role_id AND rp.allowed=1 JOIN custom_roles cr ON cr.id=ura.role_id WHERE ura.organization_id=? AND ura.user_id=? AND cr.organization_id=?`).bind(org,u.user_id,org).all();for(const r of rows.results||[])out.add(str(r.permission))}catch{}
  // Legacy scoped grants are honored for organization scope so existing IAM data is
  // not a dead end. Class-level grants remain class-scoped and are not promoted to
  // organization-wide permissions.
  try{const grants=await env.DB.prepare(`SELECT role FROM scoped_role_grants WHERE user_id=? AND scope_type='organization' AND scope_id=? AND status='active'`).bind(u.user_id,org).all();for(const g of grants.results||[]){for(const permission of BASE_ROLE_PERMISSIONS[str(g.role)]||[])out.add(permission)}}catch{}
  return out;
}
async function hasEffectivePermission(env,u,org,permission){const p=await effectivePermissions(env,u,org);return p.has('*')||p.has(permission)}
async function requireEffectivePermission(env,u,org,permission){if(!(await hasEffectivePermission(env,u,org,permission)))throw Object.assign(new Error('FORBIDDEN'),{status:403});return true}
async function requireRoleOrPermission(request,env,roles,permission){const u=await requireUser(request,env);if(roles.includes(u.role))return u;const org=await requireOrganizationContext(request,env,u);await requireEffectivePermission(env,u,org,permission);return u}
async function recordAnalytics(env,organizationId,eventKey,{userId=null,entityType=null,entityId=null,value=null,meta={}}={}){
  try{await env.DB.prepare(`INSERT INTO analytics_events(id,organization_id,user_id,event_key,entity_type,entity_id,value_num,meta_json,created_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),organizationId||'sky-first',userId,eventKey,entityType,entityId,Number.isFinite(Number(value))?Number(value):null,JSON.stringify(meta||{}).slice(0,8000)).run()}catch{}
}
async function orgEntitlement(env,org,capability){try{return await env.DB.prepare(`SELECT enabled,quota_value,expires_at FROM organization_entitlements WHERE organization_id=? AND capability=?`).bind(org,capability).first()}catch{return null}}
async function enforceOrgQuota(env,org,capability,currentValue,increment=1){const e=await orgEntitlement(env,org,capability);if(e&&Number(e.enabled)===0)throw Object.assign(new Error('FORBIDDEN'),{status:403,publicMessage:'Tính năng này đang bị tắt cho tổ chức.'});if(e?.expires_at&&Date.parse(e.expires_at)<=Date.now())throw Object.assign(new Error('FORBIDDEN'),{status:403,publicMessage:'Quyền sử dụng tính năng này đã hết hạn.'});if(e?.quota_value!=null&&Number(currentValue)+Number(increment)>Number(e.quota_value))throw Object.assign(new Error('QUOTA'),{status:409,publicMessage:'Tổ chức đã đạt giới hạn được cấp cho tính năng này.'});return e}
async function organizationUserIds(env,org){try{const rows=await env.DB.prepare(`SELECT DISTINCT user_id FROM organization_members WHERE organization_id=? AND status='active' UNION SELECT DISTINCT cm.user_id FROM class_members cm JOIN classes c ON c.id=cm.class_id WHERE COALESCE(c.organization_id,'sky-first')=? AND cm.status='active' UNION SELECT DISTINCT owner_user_id user_id FROM classes WHERE COALESCE(organization_id,'sky-first')=? AND status!='deleted'`).bind(org,org,org).all();return (rows.results||[]).map(x=>x.user_id).filter(Boolean)}catch{return []}}
function answerEqual(q,actual){
  const type=str(q?.type);const expected=q?.answer;
  if(type==='mcq'||type==='truefalse')return String(actual??'')===String(expected??'');
  if(type==='fill'||type==='short'){const norm=x=>String(x??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi-VN');let accepted=[];try{const j=JSON.parse(expected||'null');accepted=Array.isArray(j)?j:[j]}catch{accepted=String(expected??'').split('|')}return accepted.some(x=>norm(x)===norm(actual));}
  if(type==='multi'||type==='ordering'){let ex=[];try{ex=Array.isArray(expected)?expected:JSON.parse(expected||'[]')}catch{}const ac=Array.isArray(actual)?actual:[];return type==='multi'?JSON.stringify([...ac].map(String).sort())===JSON.stringify([...ex].map(String).sort()):JSON.stringify(ac.map(String))===JSON.stringify(ex.map(String));}
  if(type==='matching'){let ex={};try{ex=expected&&typeof expected==='object'?expected:JSON.parse(expected||'{}')}catch{}const ac=actual&&typeof actual==='object'&&!Array.isArray(actual)?actual:{};const keys=Object.keys(ex);return keys.length>0&&keys.every(k=>String(ac[k]??'')===String(ex[k]??''));}
  return false;
}
function autoScoreQuestions(qs=[],answers={}){let score=0,max=0,manual=[];for(const q of qs){const pts=Math.max(0,Number(q.points||1));max+=pts;if(q.type==='essay'){manual.push(q);continue}if(answerEqual(q,answers[q.id]))score+=pts}return {score,max,manual}}
async function seedManualGrades(env,attemptId,questions=[]){for(const q of questions.filter(x=>x.type==='essay')){await env.DB.prepare(`INSERT OR IGNORE INTO assessment_manual_grades(id,attempt_id,question_id,grader_user_id,score,feedback,status,created_at,updated_at) VALUES(?,?,?,'system',NULL,'','draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),attemptId,str(q.id)).run().catch(()=>{})}}
async function recomputeAttemptScore(env,attemptId,source='internal'){
  const table=source==='guest'?'exam_guest_attempts':'exam_attempts';const a=await env.DB.prepare(`SELECT a.answers_json,COALESCE(a.question_snapshot_json,e.question_json) question_json FROM ${table} a JOIN exams e ON e.id=a.exam_id WHERE a.id=?`).bind(attemptId).first();if(!a)return null;let qs=[],ans={};try{qs=JSON.parse(a.question_json||'[]')}catch{}try{ans=JSON.parse(a.answers_json||'{}')}catch{}const auto=autoScoreQuestions(qs,ans);const grades=await env.DB.prepare(`SELECT question_id,score,status FROM assessment_manual_grades WHERE attempt_id=?`).bind(attemptId).all().catch(()=>({results:[]}));let manualScore=0;for(const g of grades.results||[])if(g.score!=null&&g.status==='published')manualScore+=Number(g.score||0);const total=auto.score+manualScore;await env.DB.prepare(`UPDATE ${table} SET score=?,max_score=? WHERE id=?`).bind(total,auto.max,attemptId).run();return {score:total,max_score:auto.max,pending:auto.manual.length-(grades.results||[]).filter(g=>g.status==='published').length};
}
async function runAutomations(env,org,triggerKey,context={},ctx=null){
  let rules=[];try{rules=(await env.DB.prepare(`SELECT * FROM automation_rules WHERE organization_id=? AND trigger_key=? AND enabled=1 ORDER BY created_at`).bind(org,triggerKey).all()).results||[]}catch{return}
  for(const rule of rules){if(context.event_id){const prior=await env.DB.prepare(`SELECT 1 ok FROM automation_runs WHERE rule_id=? AND status='completed' AND detail_json LIKE ? LIMIT 1`).bind(rule.id,`%\"event_id\":\"${String(context.event_id).replace(/[\"%_]/g,'')}\"%`).first().catch(()=>null);if(prior)continue}const runId=crypto.randomUUID();let status='completed',detail={trigger:triggerKey,event_id:context.event_id||null};try{const cfg=safeJson(rule.config_json,{});if(rule.action_key==='notification.create'){const userId=str(cfg.user_id||context.user_id)||null;await env.DB.prepare(`INSERT INTO notification_center(id,user_id,title,body,type,link,is_read,created_at) VALUES(?,?,?,?,?,?,0,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),userId,str(cfg.title||context.title||'Thông báo tự động').slice(0,180),str(cfg.body||context.message||`Sự kiện ${triggerKey} vừa xảy ra.`).slice(0,3000),'info',str(cfg.link||context.link||'').slice(0,500)).run();}
    else if(rule.action_key==='email.send'){const to=str(cfg.to||context.email);if(to){const subject=str(cfg.subject||context.title||'[SLC] Thông báo tự động').slice(0,180),html=emailShell({title:subject,env,body:`<p>${htmlEsc(str(cfg.body||context.message||`Sự kiện ${triggerKey} vừa xảy ra.`))}</p>`});const work=sendMail(env,to,subject,html);ctx?.waitUntil?.(work);if(!ctx)await work;}}
    else if(rule.action_key==='audit.record')await adminLog(env,context.user_id||null,'automation.'+triggerKey,{rule_id:rule.id,...context});
  }catch(e){status='failed';detail.error=String(e?.message||e).slice(0,500)}try{await env.DB.prepare(`INSERT INTO automation_runs(id,rule_id,organization_id,status,detail_json,created_at,finished_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(runId,rule.id,org,status,JSON.stringify(detail)).run()}catch{}}
}


async function sweepTimeAutomations(env,org,ctx=null){
  const due=await env.DB.prepare(`SELECT a.id,a.title,a.class_id,a.due_at FROM assignments a JOIN classes c ON c.id=a.class_id WHERE COALESCE(c.organization_id,'sky-first')=? AND a.published=1 AND a.due_at IS NOT NULL AND datetime(a.due_at)<=datetime('now') AND datetime(a.due_at)>=datetime('now','-7 days') LIMIT 100`).bind(org).all().catch(()=>({results:[]}));for(const a of due.results||[])await runAutomations(env,org,'assignment.due',{event_id:`assignment.due:${a.id}`,title:'Bài tập đến hạn',message:`${a.title} đã đến hạn.`,link:`/#class/${a.class_id}`},ctx);const ids=await organizationUserIds(env,org);if(ids.length){const tickets=await env.DB.prepare(`SELECT id,ticket_code,subject,requester_user_id FROM support_tickets WHERE status IN ('new','in_progress','waiting_user') AND updated_at<datetime('now','-48 hours') ORDER BY updated_at LIMIT 100`).all().catch(()=>({results:[]}));for(const t of tickets.results||[])if(ids.includes(t.requester_user_id))await runAutomations(env,org,'ticket.stale',{event_id:`ticket.stale:${t.id}`,title:'Ticket cần theo dõi',message:`${t.ticket_code}: ${t.subject}`,link:'/#admin'},ctx)}return true;
}

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
async function requireClassMember(env,classId,userId,roles=null){let m=await env.DB.prepare(`SELECT role,status FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(classId,userId).first();if(!m){const admin=await env.DB.prepare(`SELECT role FROM users WHERE id=? AND status='active'`).bind(userId).first();if(admin?.role==='super_admin')m={role:'super_admin',status:'active'};else if(admin?.role==='school_admin'){const org=await classOrganization(env,classId);const om=await env.DB.prepare(`SELECT 1 ok FROM organization_members WHERE organization_id=? AND user_id=? AND status='active'`).bind(org,userId).first().catch(()=>null);if(om||org==='sky-first')m={role:'school_admin',status:'active'};}}if(!m)throw Object.assign(new Error('FORBIDDEN'),{status:403});if(roles&&!roles.includes(m.role)&&!['school_admin','super_admin'].includes(m.role))throw Object.assign(new Error('FORBIDDEN'),{status:403});return m;}
async function checkLoginThrottle(env,key){try{const r=await env.DB.prepare(`SELECT attempts,window_started_at,blocked_until FROM login_throttle WHERE key=?`).bind(key).first();if(!r)return {allowed:true};if(r.blocked_until&&new Date(r.blocked_until)>new Date())return {allowed:false,retry_after:Math.max(1,Math.ceil((new Date(r.blocked_until)-Date.now())/1000))};const age=Date.now()-new Date(r.window_started_at).getTime();if(age>15*60*1000){await env.DB.prepare(`DELETE FROM login_throttle WHERE key=?`).bind(key).run();return {allowed:true}}return {allowed:true}}catch(e){console.error('[security][login-throttle-read]',e);throw Object.assign(new Error('Dịch vụ đăng nhập đang tạm thời chưa sẵn sàng.'),{status:503})}}
async function recordLoginFailure(env,key,limit=10){const row=await env.DB.prepare(`SELECT attempts,window_started_at FROM login_throttle WHERE key=?`).bind(key).first();const now=Date.now();if(!row||now-new Date(row.window_started_at).getTime()>15*60*1000){await env.DB.prepare(`INSERT INTO login_throttle(key,attempts,window_started_at,blocked_until,updated_at) VALUES(?,1,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET attempts=1,window_started_at=CURRENT_TIMESTAMP,blocked_until=NULL,updated_at=CURRENT_TIMESTAMP`).bind(key).run();return}const attempts=Number(row.attempts||0)+1;const blocked=attempts>=limit?new Date(now+15*60*1000).toISOString():null;await env.DB.prepare(`UPDATE login_throttle SET attempts=?,blocked_until=?,updated_at=CURRENT_TIMESTAMP WHERE key=?`).bind(attempts,blocked,key).run()}
async function clearLoginThrottle(env,key){await env.DB.prepare(`DELETE FROM login_throttle WHERE key=?`).bind(key).run()}
function validateUpload(file,{maxMb=50,mimes=null,label='Tệp'}={}){if(!(file instanceof File)||!file.size)return `${label} không hợp lệ.`;if(file.size>maxMb*1024*1024)return `${label} vượt quá ${maxMb}MB.`;if(mimes&&file.type&&!mimes.includes(file.type))return `${label} không đúng định dạng được hỗ trợ.`;return null;}
async function reconcileActiveExam(userId,env){const a=await env.DB.prepare(`SELECT a.id attempt_id,a.started_at,a.extra_time_minutes,e.id exam_id,e.title,e.duration_minutes,e.time_limit_enabled FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.user_id=? AND a.status='in_progress' ORDER BY a.started_at DESC LIMIT 1`).bind(userId).first();if(!a)return null;const deadline=Number(a.time_limit_enabled)===0?null:new Date(a.started_at).getTime()+(Number(a.duration_minutes||30)+Number(a.extra_time_minutes||0))*60000;if(deadline&&Date.now()>=deadline){await env.DB.prepare(`UPDATE exam_attempts SET status='expired',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(a.attempt_id).run();return null}return {...a,remaining_seconds:deadline?Math.max(0,Math.ceil((deadline-Date.now())/1000)):null};}
function viRequestStatus(status='pending'){
  return ({pending:'Đã tiếp nhận',reviewing:'Đang xem xét',needs_info:'Cần bổ sung thông tin',approved:'Đã duyệt',rejected:'Không được phê duyệt'})[status] || 'Đang được xử lý';
}
function emailShell({title,preheader='',body,env}){
  const support=env.SUPPORT_EMAIL||'support@skyfirst.io.vn';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEsc(title)}</title></head><body style="margin:0;background:#eef8ff;font-family:Arial,Helvetica,sans-serif;color:#102436"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${htmlEsc(preheader)}</div><div style="max-width:720px;margin:28px auto;padding:0 14px"><div style="background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 18px 55px rgba(15,95,154,.14)"><div style="padding:34px;background:linear-gradient(135deg,#0b5f9f 0%,#1687dc 50%,#67b8ee 100%);color:#fff"><div style="font-size:12px;letter-spacing:1.2px;font-weight:700;text-transform:uppercase;opacity:.86">Sky First Network Digital Learning Center</div><div style="font-size:16px;font-weight:800;margin-top:7px">Trung tâm Học tập Số Sky First Network</div><h1 style="margin:18px 0 8px;font-size:29px;line-height:1.18">${htmlEsc(title)}</h1></div><div style="padding:30px 34px">${body}</div><div style="padding:23px 34px 28px;background:#0b3553;color:#dbeeff;font-size:12px;line-height:1.7"><b>Trung tâm Học tập Số Sky First Network</b><br>Hỗ trợ: <a href="mailto:${support}" style="color:#bfe4ff;text-decoration:none">${support}</a><br>Email hệ thống: <a href="mailto:slc@skyfirst.io.vn" style="color:#bfe4ff;text-decoration:none">slc@skyfirst.io.vn</a><br><br><div style="padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10);color:#edf8ff"><b>Email này được gửi tự động từ Trung tâm Học tập Số Sky First Network.</b><br>Vui lòng không phản hồi trực tiếp email này. Nếu bạn cần hỗ trợ, vui lòng liên hệ <b>${support}</b>.</div><br>Một sản phẩm thuộc hệ sinh thái Sky First Network.<br>© 2026 Sky First Network. Mọi quyền được bảo lưu.</div></div></div></body></html>`;
}
function requestReceivedEmail(env,{fullName,requestCode,email,phone,data}){
  const lookup=`${env.APP_URL||'https://slc.skyfirst.io.vn'}/#lookup`;
  const body=`<p style="font-size:17px;line-height:1.7;margin-top:0">Xin chào <b>${htmlEsc(fullName)}</b>, yêu cầu cấp tài khoản SFN của bạn đã được hệ thống ghi nhận.</p><div style="margin:22px 0;padding:22px;border-radius:20px;background:linear-gradient(135deg,#f4fbff,#edf8ff);border:1px solid #cfe6f5;text-align:center"><div style="font-size:12px;color:#52677a;font-weight:700;margin-bottom:8px">MÃ TRA CỨU YÊU CẦU</div><div style="font-family:Consolas,monospace;font-size:25px;font-weight:800;letter-spacing:1px;color:#1687dc">${htmlEsc(requestCode)}</div><div style="display:inline-block;margin-top:10px;background:#dff3ff;color:#0e6fb9;padding:7px 11px;border-radius:999px;font-weight:700;font-size:12px">ĐÃ TIẾP NHẬN</div></div><table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #d6e8f4;border-radius:18px;overflow:hidden"><tr><td style="padding:12px 15px;font-weight:700;color:#40586d">Email đăng ký</td><td style="padding:12px 15px">${htmlEsc(email)}</td></tr><tr><td style="padding:12px 15px;font-weight:700;color:#40586d;border-top:1px solid #e5f1f8">Số điện thoại</td><td style="padding:12px 15px;border-top:1px solid #e5f1f8">${htmlEsc(phone)}</td></tr><tr><td style="padding:12px 15px;font-weight:700;color:#40586d;border-top:1px solid #e5f1f8">Đơn vị học tập</td><td style="padding:12px 15px;border-top:1px solid #e5f1f8">${htmlEsc(data.education_unit||'Chưa cung cấp')}</td></tr><tr><td style="padding:12px 15px;font-weight:700;color:#40586d;border-top:1px solid #e5f1f8">Lớp / Khóa</td><td style="padding:12px 15px;border-top:1px solid #e5f1f8">${htmlEsc(data.class_name||'Chưa cung cấp')}</td></tr></table><div style="text-align:center;margin:28px 0"><a href="${lookup}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:linear-gradient(90deg,#1687dc,#63b6ed);color:#ffffff;text-decoration:none;font-weight:800">TRA CỨU YÊU CẦU</a></div><div style="padding:16px 18px;border-radius:16px;background:#fff8ec;color:#6f5637;line-height:1.55;font-size:13px"><b>Lưu ý:</b> Email này xác nhận hệ thống đã tiếp nhận hồ sơ, chưa đồng nghĩa với việc tài khoản đã được cấp. Các cập nhật quan trọng sẽ được gửi đến email đăng ký.</div>`;
  return emailShell({title:'Xác nhận tiếp nhận yêu cầu cấp tài khoản',preheader:`Mã tra cứu: ${requestCode}`,body,env});
}
function activationEmail(env,{fullName,sfnId,activationUrl}){
  const body=`<p style="font-size:17px;line-height:1.7;margin-top:0">Xin chào <b>${htmlEsc(fullName)}</b>, yêu cầu cấp tài khoản của bạn đã được phê duyệt.</p><div style="padding:20px;border-radius:18px;background:#f4fbff;border:1px solid #d6e8f4"><div style="font-size:12px;color:#52677a;font-weight:700">SFN ID CỦA BẠN</div><div style="font-family:Consolas,monospace;font-size:28px;font-weight:900;color:#1687dc;margin-top:6px">${htmlEsc(sfnId)}</div></div><p style="line-height:1.7">Để hoàn tất, hãy tạo mật khẩu cho tài khoản bằng nút bên dưới. Liên kết kích hoạt có thời hạn và chỉ sử dụng một lần.</p><div style="text-align:center;margin:28px 0"><a href="${activationUrl}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:linear-gradient(90deg,#1687dc,#63b6ed);color:#ffffff;text-decoration:none;font-weight:800">KÍCH HOẠT TÀI KHOẢN</a></div>`;
  return emailShell({title:'Tài khoản SFN của bạn đã được phê duyệt',preheader:`SFN ID: ${sfnId}`,body,env});
}
function temporaryPassword(){
  const a=new Uint8Array(14); crypto.getRandomValues(a);
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const body=[...a].map(x=>alphabet[x%alphabet.length]).join('');
  return `SFN@${body}!`;
}
function credentialsEmail(env,{fullName,sfnId,password,reset=false}){
  const loginUrl=`${env.APP_URL||'https://slc.skyfirst.io.vn'}/#login`;
  const title=reset?'Mật khẩu tạm mới của tài khoản SFN':'Thông tin kích hoạt tài khoản SFN';
  const body=`<p style="font-size:17px;line-height:1.7;margin-top:0">Xin chào <b>${htmlEsc(fullName)}</b>,</p><p style="line-height:1.7">${reset?'Quản trị viên đã cấp lại mật khẩu cho tài khoản của bạn.':'Tài khoản của bạn đã được quản trị viên kích hoạt.'}</p><div style="padding:20px;border-radius:18px;background:#f4fbff;border:1px solid #d6e8f4"><div style="font-size:12px;color:#52677a;font-weight:700">SFN ID / TÊN ĐĂNG NHẬP</div><div style="font-family:Consolas,monospace;font-size:25px;font-weight:900;color:#1687dc;margin:6px 0 18px">${htmlEsc(sfnId)}</div><div style="font-size:12px;color:#52677a;font-weight:700">MẬT KHẨU TẠM</div><div style="font-family:Consolas,monospace;font-size:21px;font-weight:900;color:#1687dc;margin-top:6px">${htmlEsc(password)}</div></div><div style="text-align:center;margin:28px 0"><a href="${loginUrl}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:linear-gradient(90deg,#1687dc,#63b6ed);color:#ffffff;text-decoration:none;font-weight:800">ĐĂNG NHẬP SLC</a></div><div style="padding:16px 18px;border-radius:16px;background:#fff8ec;color:#6f5637;line-height:1.55;font-size:13px"><b>Bảo mật:</b> Đây là mật khẩu tạm. Hãy đổi mật khẩu sau khi đăng nhập và không chia sẻ thông tin đăng nhập cho người khác.</div>`;
  return emailShell({title,preheader:`SFN ID: ${sfnId}`,body,env});
}

async function writeEmailLog(env,{to,subject,status,providerId='',error=''}){try{await env.DB.prepare(`INSERT INTO email_logs(id,to_email,subject,status,provider_message_id,error,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),to,subject,status,providerId,error).run()}catch{}}
function mailConfig(env){
  return {
    key:String(env.RESEND_API_KEY||env.RESEND_KEY||env.RESEND_TOKEN||'').trim(),
    from:String(env.MAIL_FROM||'Trung tâm Học tập Số Sky First Network <slc@skyfirst.io.vn>').trim(),
    replyTo:String(env.MAIL_REPLY_TO||env.SUPPORT_EMAIL||'support@skyfirst.io.vn').trim()
  };
}
function publicMailFailure(code='EMAIL_PROVIDER_ERROR'){
  return ({RESEND_API_KEY_NOT_CONFIGURED:'Dịch vụ email chưa được cấu hình.',EMAIL_TIMEOUT:'Dịch vụ email phản hồi quá chậm.',EMAIL_PROVIDER_REJECTED:'Nhà cung cấp email chưa chấp nhận thư.',EMAIL_NETWORK_ERROR:'Chưa thể kết nối dịch vụ email.'})[code]||'Email chưa gửi được.';
}
async function sendMail(env,to,subject,html){
  const cfg=mailConfig(env);
  if(!cfg.key){await writeEmailLog(env,{to,subject,status:'skipped',error:'RESEND_API_KEY_NOT_CONFIGURED'});return {sent:false,code:'RESEND_API_KEY_NOT_CONFIGURED',reason:publicMailFailure('RESEND_API_KEY_NOT_CONFIGURED')};}
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const payload={from:cfg.from,to:[to],subject,html}; if(cfg.replyTo)payload.reply_to=cfg.replyTo;
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${cfg.key}`,'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    const raw=await r.text(); let data={}; try{data=raw?JSON.parse(raw):{}}catch{}
    if(!r.ok){const detail=`HTTP ${r.status} ${String(data?.name||data?.message||raw||'provider rejected').slice(0,900)}`;await writeEmailLog(env,{to,subject,status:'failed',error:detail});return {sent:false,code:'EMAIL_PROVIDER_REJECTED',provider_status:r.status,reason:publicMailFailure('EMAIL_PROVIDER_REJECTED')};}
    await writeEmailLog(env,{to,subject,status:'sent',providerId:data.id||''});return {sent:true,data};
  }catch(error){const code=error?.name==='AbortError'?'EMAIL_TIMEOUT':'EMAIL_NETWORK_ERROR';await writeEmailLog(env,{to,subject,status:'failed',error:`${code}: ${String(error?.message||error).slice(0,900)}`});return {sent:false,code,reason:publicMailFailure(code)};
  }finally{clearTimeout(timer)}
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
      const message=String(error?.message||error||'');
      // The web installer doubles as an in-place repair path. Canonical migrations
      // contain ADD COLUMN statements which are expected to report duplicate-column
      // when an older production database already received that migration.
      if(/duplicate column name/i.test(message)){completed.push(i+1);continue;}
      const e=new Error(message || 'D1 statement failed');
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
  // A stable marker lets diagnostics distinguish a fully reconciled production schema
  // from databases that only contain a subset of historical migrations.
  await env.DB.prepare(`INSERT INTO system_settings(key,value,updated_at) VALUES('schema_version','production',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='production',updated_at=CURRENT_TIMESTAMP`).run();
  return {completed};
}

async function ensureLatestSchema(env){
  // Same safe one-statement-at-a-time engine used for upgrades from the admin UI.
  return installSchema(env);
}

let runtimeSchemaVerified=false;
let runtimeSchemaPromise=null;
async function productionSchemaLooksReady(env){
  if(!env?.DB)return false;
  try{
    const marker=await env.DB.prepare(`SELECT value FROM system_settings WHERE key='schema_version'`).first();
    if(marker?.value!=='production')return false;
    // Verify representative objects from every major generation. A stale marker
    // must not allow session/auth queries to run against an incomplete database.
    await env.DB.prepare(`SELECT organization_id FROM classes LIMIT 0`).all();
    // Assessment Center V40 fields must be present before we trust the marker.
    // Older deployments could already have schema_version='production' while
    // still missing migration 0022, which made Assessment routes fail with a
    // generic 500 / Request ID instead of reconciling the schema.
    await env.DB.prepare(`SELECT assessment_type,time_limit_enabled,public_access,public_token,hide_schedule,require_email_verify,shuffle_questions,shuffle_options,updated_at,version_no,blueprint_json,result_policy,scope_level FROM exams LIMIT 0`).all();
    await env.DB.prepare(`SELECT access_key,full_name,email,candidate_code,class_name,status,answers_json,event_log_json,question_snapshot_json,extra_time_minutes,invalidated_at FROM exam_guest_attempts LIMIT 0`).all();
    // Exam-domain split is part of the production schema too. A database that
    // predates migration 0027 must be repaired before Start/Resume tries to
    // create a launch token; otherwise the UI only sees a generic HTTP 500.
    await env.DB.prepare(`SELECT token_hash,user_id,attempt_id,expires_at,used_at FROM exam_launch_tokens LIMIT 0`).all();
    await env.DB.prepare(`SELECT token_hash,user_id,attempt_id,expires_at FROM exam_access_tokens LIMIT 0`).all();
    await env.DB.prepare(`SELECT published FROM assignments LIMIT 0`).all();
    await env.DB.prepare(`SELECT submission_count FROM submissions LIMIT 0`).all();
    await env.DB.prepare(`SELECT admitted FROM live_access_tokens LIMIT 0`).all();
    await env.DB.prepare(`SELECT admitted FROM live_signal_presence LIMIT 0`).all();
    await env.DB.prepare(`SELECT 1 FROM assessment_email_verifications LIMIT 0`).all();
    await env.DB.prepare(`SELECT 1 FROM website_revisions LIMIT 0`).all();
    await env.DB.prepare(`SELECT 1 FROM automation_rules LIMIT 0`).all();
    await env.DB.prepare(`SELECT 1 FROM analytics_events LIMIT 0`).all();
    return true;
  }catch{return false}
}
async function ensureRuntimeSchema(env){
  if(runtimeSchemaVerified)return true;
  if(runtimeSchemaPromise)return runtimeSchemaPromise;
  runtimeSchemaPromise=(async()=>{
    if(!(await productionSchemaLooksReady(env)))await ensureLatestSchema(env);
    if(!(await productionSchemaLooksReady(env)))throw new Error('Production schema verification failed');
    runtimeSchemaVerified=true;
    return true;
  })();
  try{return await runtimeSchemaPromise}finally{runtimeSchemaPromise=null}
}

async function adminLog(env,userId,action,detail={}){
  try{await env.DB.prepare(`INSERT INTO admin_activity(actor_user_id,action,detail_json,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).bind(userId||null,action,JSON.stringify(detail)).run()}catch(error){console.error('[audit-log]',error)}
}
async function getSettings(env){
  const rows=await env.DB.prepare(`SELECT key,value FROM system_settings ORDER BY key`).all();
  return Object.fromEntries((rows.results||[]).map(x=>[x.key,x.value]));
}
function settingNumber(settings,key,fallback,{min=0,max=Number.MAX_SAFE_INTEGER}={}){const n=Number(settings?.[key]);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
const PUBLIC_SETTING_KEYS=new Set(['site_primary_color','site_primary_dark','site_background_color','site_surface_color','site_text_color','site_muted_color','site_border_color','site_soft_color','site_danger_color','site_radius','site_button_radius','site_input_radius','site_content_width','site_font_scale','site_shadow_opacity','site_header_style','site_auth_footer','site_reduce_motion','public_intro_title','public_intro_text','public_about_title','public_about_text','site_name','site_name_en','site_header_title','site_header_subtitle','footer_connect_eyebrow','footer_connect_title','footer_connect_text','footer_ctt_label','footer_ctt_url','footer_tnv_label','footer_tnv_url','footer_game_label','footer_game_url','footer_web_label','footer_web_url','footer_facebook_label','footer_facebook_url','footer_tiktok_label','footer_tiktok_url','footer_instagram_label','footer_instagram_url','footer_zalo_label','footer_zalo_url','support_email','account_request_enabled','maintenance_mode','maintenance_message','allow_guest_live','default_class_unit','footer_product_text','footer_copyright','public_hero_eyebrow','public_hero_side_title','public_hero_side_text','public_feature_1_title','public_feature_1_text','public_feature_2_title','public_feature_2_text','public_feature_3_title','public_feature_3_text','public_feature_4_title','public_feature_4_text','public_learner_title','public_learner_text','public_learner_quote','public_teacher_title','public_teacher_text','public_teacher_before_title','public_teacher_before_text','public_teacher_during_title','public_teacher_during_text','public_teacher_after_title','public_teacher_after_text','public_safety_title','public_safety_text','public_faq_title','public_faq_1_q','public_faq_1_a','public_faq_2_q','public_faq_2_a','public_faq_3_q','public_faq_3_a','public_faq_4_q','public_faq_4_a','public_cta_title','public_cta_text','public_status_text']);
function publicSettings(settings={}){return Object.fromEntries(Object.entries(settings).filter(([key])=>PUBLIC_SETTING_KEYS.has(key)));}

function trustedRequestOrigin(request,env){
  if(!['POST','PUT','PATCH','DELETE'].includes(request.method))return true;
  const origin=request.headers.get('origin');
  if(!origin)return true; // non-browser clients/Cloudflare internal calls
  const allowed=new Set();
  try{allowed.add(new URL(request.url).origin)}catch{}
  try{if(env.APP_URL)allowed.add(new URL(env.APP_URL).origin)}catch{}
  try{if(env.EXAM_URL)allowed.add(new URL(env.EXAM_URL).origin)}catch{}
  allowed.add('https://exam.skyfirst.io.vn');
  return allowed.has(origin);
}

async function routeApi(request, env, ctx, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health') return ok({ service:'Sky First School', status:'available', time:nowIso() });


  const publicAssessment=path.match(/^\/api\/public\/assessments\/([^/]+)$/);
  if(publicAssessment && method==='GET'){
    const e=await env.DB.prepare(`SELECT id,title,instructions,opens_at,closes_at,hide_schedule,status,center_label,require_email_verify,result_policy FROM exams WHERE public_token=? AND public_access=1 AND status IN ('published','closed')`).bind(publicAssessment[1]).first();
    if(!e)return bad('Liên kết dự thi không tồn tại hoặc đã bị vô hiệu hóa.',404);
    const now=Date.now(), openMs=examTimeMs(e.opens_at), closeMs=examTimeMs(e.closes_at), state=e.status==='closed'?'Đã kết thúc':openMs&&now<openMs?'Chưa mở':closeMs&&now>closeMs?'Đã kết thúc':'Đang mở';
    return ok({exam:{title:e.title,instructions:e.instructions,center_label:e.center_label,public_status:`Trạng thái: ${state}`,schedule:e.hide_schedule?null:{opens_at:e.opens_at,closes_at:e.closes_at},require_email_verify:!!Number(e.require_email_verify),result_policy:e.result_policy}});
  }
  const publicVerify=path.match(/^\/api\/public\/assessments\/([^/]+)\/request-verification$/);
  if(publicVerify && method==='POST'){
    const e=await env.DB.prepare(`SELECT id,title,require_email_verify FROM exams WHERE public_token=? AND public_access=1 AND status='published'`).bind(publicVerify[1]).first();if(!e)return bad('Liên kết dự thi không khả dụng.',404);if(!Number(e.require_email_verify))return ok({required:false});const b=await request.json(),email=normalizeEmail(str(b.email));if(!validEmail(email))return bad('Email không hợp lệ.');const recent=await env.DB.prepare(`SELECT created_at FROM assessment_email_verifications WHERE exam_id=? AND email=? ORDER BY created_at DESC LIMIT 1`).bind(e.id,email).first();if(recent&&Date.now()-Date.parse(recent.created_at)<60000)return bad('Vui lòng chờ 60 giây trước khi yêu cầu mã mới.',429);const hourly=await env.DB.prepare(`SELECT COUNT(*) n FROM assessment_email_verifications WHERE exam_id=? AND email=? AND datetime(created_at)>=datetime('now','-1 hour')`).bind(e.id,email).first();if(Number(hourly?.n||0)>=5)return bad('Bạn đã yêu cầu quá nhiều mã xác minh. Vui lòng thử lại sau.',429,{retry_after:3600});const a=new Uint32Array(1);crypto.getRandomValues(a);const code=String(a[0]%1000000).padStart(6,'0'),hash=await sha256Text(`${e.id}:${email}:${code}`),id=crypto.randomUUID(),expires=new Date(Date.now()+10*60*1000).toISOString();await env.DB.prepare(`INSERT INTO assessment_email_verifications(id,exam_id,email,code_hash,expires_at) VALUES(?,?,?,?,?)`).bind(id,e.id,email,hash,expires).run();const html=emailShell({title:'Mã xác minh dự thi',preheader:`Mã xác minh cho ${e.title}`,env,body:`<p>Mã xác minh email của bạn là:</p><div style="font-size:30px;font-weight:900;letter-spacing:6px;padding:18px;text-align:center;border:1px solid #dce8f2;border-radius:16px">${code}</div><p>Mã có hiệu lực trong 10 phút và chỉ dùng cho bài đánh giá <b>${htmlEsc(e.title)}</b>.</p>`});const mail=await sendMail(env,email,`[SLC] Mã xác minh dự thi – ${e.title}`,html);if(!mail.sent)return bad('Chưa thể gửi mã xác minh. Vui lòng thử lại sau.',502);return ok({required:true,expires_in_seconds:600});
  }
  const publicStart=path.match(/^\/api\/public\/assessments\/([^/]+)\/start$/);
  if(publicStart && method==='POST'){
    const e=await env.DB.prepare(`SELECT * FROM exams WHERE public_token=? AND public_access=1 AND status='published'`).bind(publicStart[1]).first();if(!e)return bad('Liên kết dự thi không khả dụng.',404);
    const now=Date.now(),openMs=examTimeMs(e.opens_at),closeMs=examTimeMs(e.closes_at);if(openMs&&now<openMs)return bad('Bài đánh giá hiện chưa mở.',409);if(closeMs&&now>closeMs)return bad('Bài đánh giá đã kết thúc.',409);
    const b=await request.json(),full=str(b.full_name).slice(0,160),email=str(b.email).trim().toLowerCase().slice(0,220),code=str(b.candidate_code).slice(0,100),className=str(b.class_name).slice(0,160);if(!full||!/^\S+@\S+\.\S+$/.test(email)||!code||!className)return bad('Vui lòng nhập đầy đủ họ tên, email, mã học viên/mã dự thi và lớp/đơn vị.');if(Number(e.require_email_verify)){const verifyCode=str(b.verification_code);if(!/^\d{6}$/.test(verifyCode))return bad('Vui lòng nhập mã xác minh 6 số đã gửi tới email.',403);const vr=await env.DB.prepare(`SELECT * FROM assessment_email_verifications WHERE exam_id=? AND email=? AND verified_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`).bind(e.id,email).first();if(!vr)return bad('Mã xác minh đã hết hạn hoặc chưa được yêu cầu.',403);if(Number(vr.attempts||0)>=5)return bad('Mã xác minh đã bị khóa do nhập sai quá nhiều lần.',429);const hash=await sha256Text(`${e.id}:${email}:${verifyCode}`);if(hash!==vr.code_hash){await env.DB.prepare(`UPDATE assessment_email_verifications SET attempts=attempts+1 WHERE id=?`).bind(vr.id).run();return bad('Mã xác minh không đúng.',403)}await env.DB.prepare(`UPDATE assessment_email_verifications SET verified_at=CURRENT_TIMESTAMP WHERE id=?`).bind(vr.id).run();}
    const old=await env.DB.prepare(`SELECT id,access_key,started_at,extra_time_minutes FROM exam_guest_attempts WHERE exam_id=? AND email=? AND candidate_code=? AND status='in_progress' ORDER BY started_at DESC LIMIT 1`).bind(e.id,email,code).first();
    if(old){const deadline=e.time_limit_enabled===0?null:new Date(old.started_at).getTime()+(Number(e.duration_minutes||60)+Number(old.extra_time_minutes||0))*60000;if(deadline&&Date.now()>=deadline)await env.DB.prepare(`UPDATE exam_guest_attempts SET status='expired',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(old.id).run();else return ok({attempt_id:old.id,access_key:old.access_key,resumed:true});}
    const cnt=await env.DB.prepare(`SELECT COUNT(*) n FROM exam_guest_attempts WHERE exam_id=? AND email=? AND candidate_code=? AND status IN ('submitted','expired','terminated')`).bind(e.id,email,code).first();if(Number(cnt?.n||0)>=Number(e.max_attempts||1))return bad('Bạn đã sử dụng hết số lượt thi.',409);
    const snapshot=examQuestionSnapshot(e.question_json,e.shuffle_questions,e.shuffle_options);
    const id=crypto.randomUUID(),key=crypto.randomUUID()+crypto.randomUUID();await env.DB.prepare(`INSERT INTO exam_guest_attempts(id,exam_id,access_key,full_name,email,candidate_code,class_name,question_snapshot_json) VALUES(?,?,?,?,?,?,?,?)`).bind(id,e.id,key,full,email,code,className,snapshot).run();
    const subject=`[SLC] Xác nhận tham gia bài đánh giá – ${e.title}`;const html=emailShell({title:'Thông báo từ Trung tâm Đánh giá Sky First',preheader:`Đã ghi nhận ${full} tham gia dự thi`,body:`<p>Xin chào <b>${htmlEsc(full)}</b>,</p><p>SLC đã ghi nhận bạn bắt đầu tham gia hoạt động đánh giá.</p><div style="padding:18px;border:1px solid #dce8f2;border-radius:16px"><b>Bài đánh giá:</b> ${htmlEsc(e.title)}<br><b>Họ và tên:</b> ${htmlEsc(full)}<br><b>Mã học viên/Mã dự thi:</b> ${htmlEsc(code)}<br><b>Lớp/Đơn vị:</b> ${htmlEsc(className)}<br><b>Trạng thái:</b> Đã bắt đầu dự thi</div><p>Email này được gửi tự động từ Trung tâm Đánh giá Sky First.</p>`,env});ctx?.waitUntil?.(sendMail(env,email,subject,html));return ok({attempt_id:id,access_key:key});
  }
  const guestAttempt=path.match(/^\/api\/public\/exam-attempts\/([^/]+)$/);
  if(guestAttempt && method==='GET'){
    const key=bearerToken(request);if(!key)return bad('Thiếu khóa truy cập phiên dự thi.',401);const a=await env.DB.prepare(`SELECT a.*,e.title,e.instructions,e.duration_minutes,e.time_limit_enabled,e.strict_mode,e.fullscreen_required,e.terminate_on_exit,e.show_score,e.assessment_type,e.assessment_label,e.center_label,e.public_token,COALESCE(a.question_snapshot_json,e.question_json) question_json FROM exam_guest_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.access_key=?`).bind(guestAttempt[1],key).first();if(!a)return bad('Phiên dự thi không hợp lệ.',404);if(a.status!=='in_progress')return bad('Phiên dự thi đã kết thúc.',409,{status:a.status});let remaining=null;if(a.time_limit_enabled!==0){const deadline=new Date(a.started_at).getTime()+(Number(a.duration_minutes||60)+Number(a.extra_time_minutes||0))*60000;remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));if(remaining<=0){await env.DB.prepare(`UPDATE exam_guest_attempts SET status='expired',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(a.id).run();return bad('Thời gian làm bài đã kết thúc.',409,{status:'expired'});}}return ok({attempt_id:a.id,exam:{id:a.exam_id,title:a.title,instructions:a.instructions,duration_minutes:a.duration_minutes,time_limit_enabled:a.time_limit_enabled!==0,strict_mode:a.strict_mode,fullscreen_required:a.fullscreen_required,terminate_on_exit:a.terminate_on_exit,show_score:a.show_score,assessment_type:a.assessment_type,assessment_label:a.assessment_label,center_label:a.center_label,public_token:a.public_token,questions:publicExamQuestions(a.question_json)},answers:JSON.parse(a.answers_json||'{}'),events:JSON.parse(a.event_log_json||'[]'),remaining_seconds:remaining,answer_revision:Number(a.answer_revision||0),last_saved_at:a.last_saved_at||null,server_time:nowIso(),deadline_at:a.time_limit_enabled===0?null:new Date(new Date(a.started_at).getTime()+(Number(a.duration_minutes||60)+Number(a.extra_time_minutes||0))*60000).toISOString()});
  }
  const guestAction=path.match(/^\/api\/public\/exam-attempts\/([^/]+)\/(save|submit|violation)$/);
  if(guestAction && method==='POST'){
    const key=bearerToken(request);if(!key)return bad('Thiếu khóa truy cập phiên dự thi.',401);const action=guestAction[2],b=await request.json();const a=await env.DB.prepare(`SELECT a.*,COALESCE(a.question_snapshot_json,e.question_json) question_json,e.duration_minutes,e.time_limit_enabled,e.show_score,e.title,e.terminate_on_exit,e.strict_mode,e.result_policy,e.closes_at,e.status exam_status FROM exam_guest_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.access_key=? AND a.status='in_progress'`).bind(guestAction[1],key).first();if(!a)return bad('Phiên dự thi không còn hoạt động.',409);const events=Array.isArray(b.events)?b.events.slice(-500):[];
    const deadline=a.time_limit_enabled===0?null:new Date(a.started_at).getTime()+(Number(a.duration_minutes||60)+Number(a.extra_time_minutes||0))*60000;
    if(deadline&&Date.now()>deadline+120000){await env.DB.prepare(`UPDATE exam_guest_attempts SET status='expired',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(a.id).run();return bad('Phiên thi đã quá thời gian nộp bài.',409,{status:'expired'});}
    if(deadline&&Date.now()>deadline){
      if(action==='save')return bad('Đã hết thời gian làm bài. Hệ thống đã khóa thay đổi mới.',409,{status:'time_locked'});
      if(action==='violation')return bad('Đã hết thời gian làm bài.',409,{status:'time_locked'});
      const qs=JSON.parse(a.question_json||'[]'),ans=safeJson(a.answers_json,{});const scored=autoScoreQuestions(qs,ans),score=scored.score,max=scored.max;
      await env.DB.prepare(`UPDATE exam_guest_attempts SET score=?,max_score=?,status='submitted',submitted_at=CURRENT_TIMESTAMP,last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(score,max,a.id).run();await seedManualGrades(env,a.id,scored.manual);return ok({submitted:true,status:'submitted',score:assessmentScoreVisible(a)?score:null,max_score:assessmentScoreVisible(a)?max:null,time_locked:true});
    }
    if(action==='save'){const clientRev=Number(b.revision??a.answer_revision??0);if(clientRev!==Number(a.answer_revision||0))return bad('Bài làm trên máy chủ đã có phiên bản mới hơn.',409,{code:'REVISION_CONFLICT',answer_revision:Number(a.answer_revision||0)});const nextRev=Number(a.answer_revision||0)+1;const wr=await env.DB.prepare(`UPDATE exam_guest_attempts SET answers_json=?,event_log_json=?,answer_revision=?,last_saved_at=CURRENT_TIMESTAMP WHERE id=? AND answer_revision=?`).bind(JSON.stringify(b.answers||{}),JSON.stringify(events),nextRev,a.id,Number(a.answer_revision||0)).run();if(!Number(wr?.meta?.changes||0))return bad('Bài làm vừa được cập nhật ở một phiên khác.',409,{code:'REVISION_CONFLICT'});await env.DB.prepare(`INSERT OR IGNORE INTO assessment_answer_revisions(id,attempt_id,source,revision,answers_json,events_json,accepted_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),a.id,'guest',nextRev,JSON.stringify(b.answers||{}),JSON.stringify(events)).run().catch(()=>{});return ok({saved_at:nowIso(),answer_revision:nextRev});}
    if(action==='violation'){const reason=str(b.reason).slice(0,300)||'Rời chế độ giám sát';if(!a.terminate_on_exit){await env.DB.prepare(`UPDATE exam_guest_attempts SET answers_json=?,event_log_json=?,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(b.answers||{}),JSON.stringify(events),a.id).run();return ok({terminated:false});}await env.DB.prepare(`UPDATE exam_guest_attempts SET answers_json=?,event_log_json=?,status='terminated',closed_reason=?,closed_at=CURRENT_TIMESTAMP,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(b.answers||{}),JSON.stringify(events),reason,a.id).run();await env.DB.prepare(`INSERT INTO exam_audit_log(id,exam_id,attempt_id,actor_user_id,event_type,detail_json) VALUES(?,?,?,NULL,?,?)`).bind(crypto.randomUUID(),a.exam_id,a.id,'guest_attempt.terminated',JSON.stringify({reason,email:a.email,candidate_code:a.candidate_code})).run();return ok({terminated:true});}
    const qs=JSON.parse(a.question_json||'[]'),ans=b.answers||{};const scored=autoScoreQuestions(qs,ans),score=scored.score,max=scored.max;
    await env.DB.prepare(`UPDATE exam_guest_attempts SET answers_json=?,event_log_json=?,score=?,max_score=?,status='submitted',submitted_at=CURRENT_TIMESTAMP,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(ans),JSON.stringify(events),score,max,a.id).run();await seedManualGrades(env,a.id,scored.manual);const receipt=`SLC-${a.id.slice(0,8).toUpperCase()}`;await env.DB.prepare(`INSERT INTO assessment_receipts(id,attempt_id,receipt_code,payload_json,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(attempt_id) DO UPDATE SET receipt_code=excluded.receipt_code,payload_json=excluded.payload_json`).bind(crypto.randomUUID(),a.id,receipt,JSON.stringify({attempt_id:a.id,exam_id:a.exam_id,status:'submitted'})).run().catch(()=>{});const subject=`[SLC] Xác nhận hoàn thành bài đánh giá – ${a.title}`;const html=emailShell({title:'Xác nhận hoàn thành bài đánh giá',preheader:`Mã xác nhận ${receipt}`,body:`<p>Xin chào <b>${htmlEsc(a.full_name)}</b>,</p><p>Trung tâm Đánh giá Sky First xác nhận bài làm của bạn đã được ghi nhận thành công.</p><div style="padding:18px;border:1px solid #dce8f2;border-radius:16px"><b>Bài đánh giá:</b> ${htmlEsc(a.title)}<br><b>Mã xác nhận:</b> ${receipt}<br><b>Trạng thái:</b> ${scored.manual.length?'Đã nộp · chờ chấm tự luận':'Đã nộp thành công'}</div>`,env});ctx?.waitUntil?.(sendMail(env,a.email,subject,html));const examClass=await env.DB.prepare(`SELECT class_id FROM exams WHERE id=?`).bind(a.exam_id).first();const org=await classOrganization(env,examClass?.class_id);ctx?.waitUntil?.(recordAnalytics(env,org,'assessment.guest_submitted',{entityType:'exam',entityId:a.exam_id,value:score,meta:{candidate_code:a.candidate_code}}));{const visible=assessmentScoreVisible({...a,status:a.exam_status})&&!scored.manual.length;return ok({score:visible?score:null,max_score:visible?max:null,show_score:visible,pending_manual:scored.manual.length,review_available:a.result_policy==='full_review_after_close'&&(a.exam_status==='closed'||(examTimeMs(a.closes_at)&&Date.now()>=examTimeMs(a.closes_at))),receipt_code:receipt});}
  }

  const guestReview=path.match(/^\/api\/public\/exam-attempts\/([^/]+)\/review$/);
  if(guestReview && method==='GET'){
    const key=bearerToken(request);if(!key)return bad('Thiếu khóa truy cập phiên dự thi.',401);const a=await env.DB.prepare(`SELECT a.*,e.question_json exam_questions,e.result_policy,e.status exam_status,e.closes_at,e.title FROM exam_guest_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.access_key=?`).bind(guestReview[1],key).first();if(!a)return bad('Phiên dự thi không hợp lệ.',404);const closed=a.exam_status==='closed'||(examTimeMs(a.closes_at)&&Date.now()>=examTimeMs(a.closes_at));if(a.result_policy!=='full_review_after_close'||!closed||a.status!=='submitted')return bad('Bài làm chưa được mở để xem lại.',403);const qs=safeJson(a.question_snapshot_json||a.exam_questions,[]),answers=safeJson(a.answers_json,{}),grades=await env.DB.prepare(`SELECT question_id,score,feedback,status FROM assessment_manual_grades WHERE attempt_id=?`).bind(a.id).all().catch(()=>({results:[]}));return ok({title:a.title,score:a.score,max_score:a.max_score,questions:qs.map(q=>({...q,user_answer:answers[q.id]??null,manual_grade:(grades.results||[]).find(g=>String(g.question_id)===String(q.id))||null}))});
  }
  const internalReview=path.match(/^\/api\/exam-attempts\/([^/]+)\/review$/);
  if(internalReview && method==='GET'){
    const u=await requireUser(request,env);const a=await env.DB.prepare(`SELECT a.*,e.question_json exam_questions,e.result_policy,e.status exam_status,e.closes_at,e.title FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.user_id=?`).bind(internalReview[1],u.user_id).first();if(!a)return bad('Không tìm thấy bài làm.',404);const closed=a.exam_status==='closed'||(examTimeMs(a.closes_at)&&Date.now()>=examTimeMs(a.closes_at));if(a.result_policy!=='full_review_after_close'||!closed||a.status!=='submitted')return bad('Bài làm chưa được mở để xem lại.',403);const qs=safeJson(a.question_snapshot_json||a.exam_questions,[]),answers=safeJson(a.answers_json,{}),grades=await env.DB.prepare(`SELECT question_id,score,feedback,status FROM assessment_manual_grades WHERE attempt_id=?`).bind(a.id).all().catch(()=>({results:[]}));return ok({title:a.title,score:a.score,max_score:a.max_score,questions:qs.map(q=>({...q,user_answer:answers[q.id]??null,manual_grade:(grades.results||[]).find(g=>String(g.question_id)===String(q.id))||null}))});
  }

  if (path === '/api/setup/installer-info' && method === 'GET') return ok({ installer_available:true });

  if (path === '/api/setup/status' && method === 'GET') {
    let ready=await schemaReady(env);
    if(!ready){
      try{await ensureRuntimeSchema(env);ready=await schemaReady(env)}catch{}
    }
    if(!ready) return ok({schema_ready:false,initialized:false});
    let marker=''; try{marker=str((await env.DB.prepare(`SELECT value FROM system_settings WHERE key='schema_version'`).first())?.value)}catch{}
    if(marker!=='production'){
      try{await ensureRuntimeSchema(env);marker='production'}catch{}
    }
    const row=await env.DB.prepare(`SELECT COUNT(*) n FROM users`).first();
    return ok({schema_ready:marker==='production',initialized:Number(row?.n||0)>0});
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
    const cfg=await getSettings(env); if(cfg.account_request_enabled==='0') return bad('Cổng yêu cầu cấp tài khoản hiện đang tạm đóng.',503);
    const form = await request.formData();
    const fullName=str(form.get('full_name')), email=normalizeEmail(str(form.get('email'))), phone=str(form.get('phone'));
    if (!fullName || !email || !phone) return bad('Vui lòng nhập đầy đủ họ tên, email và số điện thoại.');
    if(!validEmail(email)) return bad('Địa chỉ email không hợp lệ.');
    if(fullName.length>160||phone.length>40) return bad('Thông tin cá nhân vượt quá độ dài cho phép.');
    const normalizedPhone=phone.replace(/[^0-9+]/g,'');
    if(normalizedPhone.replace(/\D/g,'').length<9) return bad('Số điện thoại chưa hợp lệ.');
    const existingUser=await env.DB.prepare(`SELECT sfn_id,status FROM users WHERE lower(email)=lower(?) LIMIT 1`).bind(email).first();
    if(existingUser) return bad(existingUser.status==='active'?`Email này đã có tài khoản ${existingUser.sfn_id}. Vui lòng đăng nhập thay vì gửi yêu cầu mới.`:`Email này đã được cấp tài khoản ${existingUser.sfn_id} và đang ở trạng thái chờ kích hoạt hoặc tạm ngưng. Vui lòng liên hệ bộ phận phụ trách.`,409,{sfn_id:existingUser.sfn_id,status:existingUser.status});
    const portrait = form.get('portrait');
    const studentCard = form.get('student_card');
    if (!(portrait instanceof File) || !portrait.size) return bad('Ảnh chân dung là bắt buộc.');
    const portraitMax=settingNumber(cfg,'account_portrait_max_mb',5,{min:1,max:50}),documentMax=settingNumber(cfg,'account_document_max_mb',10,{min:1,max:50});
    const portraitErr=validateUpload(portrait,{maxMb:portraitMax,mimes:['image/jpeg','image/png','image/webp'],label:'Ảnh chân dung'}); if(portraitErr)return bad(portraitErr);
    if(studentCard instanceof File && studentCard.size){const docErr=validateUpload(studentCard,{maxMb:documentMax,mimes:['image/jpeg','image/png','image/webp','application/pdf'],label:'Giấy tờ học tập'});if(docErr)return bad(docErr);}
    const existing=await env.DB.prepare(`SELECT request_code,status FROM account_requests WHERE lower(email)=lower(?) AND status IN ('pending','reviewing','needs_info') ORDER BY created_at DESC LIMIT 1`).bind(email).first();
    if(existing) return bad(`Email này đang có một yêu cầu chưa hoàn tất (${existing.request_code}). Vui lòng tra cứu yêu cầu hiện tại trước khi gửi hồ sơ mới.`,409,{request_code:existing.request_code});
    const requestId = `SLC-ACC-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const portraitMeta = await uploadR2(portrait, env, 'account-requests/portrait');
    const studentMeta = studentCard instanceof File && studentCard.size ? await uploadR2(studentCard, env, 'account-requests/student-card') : null;
    const data = {
      birth_date:str(form.get('birth_date')), gender:str(form.get('gender')), province:str(form.get('province')),
      education_unit_type:str(form.get('education_unit_type')), education_unit:str(form.get('education_unit')), faculty:str(form.get('faculty')),
      major:str(form.get('major')), class_name:str(form.get('class_name')), student_code:str(form.get('student_code')), academic_year:str(form.get('academic_year')),
      sfn_unit:str(form.get('sfn_unit')), sfn_role:str(form.get('sfn_role')), purpose:str(form.get('purpose')), requested_access:['student','teacher'].includes(str(form.get('requested_access')))?str(form.get('requested_access')):'student',
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
    const settings=publicSettings(await getSettings(env));
    const anns=await env.DB.prepare(`SELECT id,title,body FROM announcements WHERE status='published' AND (starts_at IS NULL OR starts_at<=CURRENT_TIMESTAMP) AND (ends_at IS NULL OR ends_at>=CURRENT_TIMESTAMP) AND audience IN ('all','public') ORDER BY created_at DESC LIMIT 5`).all();
    return ok({configured:true,settings,announcements:anns.results||[]});
  }

  const publicCertificate=path.match(/^\/api\/public\/certificates\/([^/]+)$/);
  if(publicCertificate && method==='GET'){
    const code=decodeURIComponent(publicCertificate[1]).trim().toUpperCase();const row=await env.DB.prepare(`SELECT c.certificate_code,c.title,c.status,c.issued_at,c.revoked_at,c.revoke_reason,u.full_name recipient_name,cl.name class_name FROM certificates c JOIN users u ON u.id=c.user_id LEFT JOIN classes cl ON cl.id=c.class_id WHERE upper(c.certificate_code)=? LIMIT 1`).bind(code).first();if(!row)return bad('Không tìm thấy chứng nhận với mã này.',404);return ok({certificate:row,valid:row.status==='issued'&&!row.revoked_at});
  }

  const publicAssessmentReceipt=path.match(/^\/api\/public\/assessment-receipts\/([^/]+)$/);
  if(publicAssessmentReceipt && method==='GET'){
    if(!(await schemaReady(env)))return bad('Hệ thống chưa được khởi tạo.',503);
    const code=str(publicAssessmentReceipt[1]).toUpperCase();const r=await env.DB.prepare(`SELECT r.receipt_code,r.created_at,e.title FROM assessment_receipts r LEFT JOIN exam_attempts a ON a.id=r.attempt_id LEFT JOIN exam_guest_attempts g ON g.id=r.attempt_id LEFT JOIN exams e ON e.id=COALESCE(a.exam_id,g.exam_id) WHERE upper(r.receipt_code)=? LIMIT 1`).bind(code).first();if(!r)return bad('Không tìm thấy biên nhận đánh giá.',404);return ok({valid:true,receipt_code:r.receipt_code,assessment_title:r.title||'',recorded_at:r.created_at});
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
    if(passwordNeedsUpgrade(u.password_salt)){try{const upgraded=await hashPassword(pw);await env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(upgraded.hash,upgraded.salt,u.id).run()}catch{}}
    const token=randomToken(32); const cfg=await getSettings(env).catch(()=>({})); const days=Math.max(1,Math.min(90,Number(cfg.default_session_days||env.SESSION_DAYS||30)));
    const exp=new Date(Date.now()+days*86400000).toISOString(); const ipHash=ip?await sha256Text(ip):'';
    await env.DB.prepare(`INSERT INTO sessions(token,user_id,ip_hash,user_agent,expires_at,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(token,u.id,ipHash,(request.headers.get('user-agent')||'').slice(0,500),exp).run();ctx?.waitUntil?.(recordAnalytics(env,'sky-first','auth.login',{userId:u.id,entityType:'user',entityId:u.id}));
    return json({ok:true,user:{sfn_id:str(u.sfn_id),full_name:str(u.full_name)||str(u.sfn_id)||'Thành viên Sky First',role:str(u.role)||'student'}},200,{'set-cookie':sessionCookie(token,days)});
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    const token=cookieParse(request.headers.get('cookie')||'')[COOKIE]; if(token) await env.DB.prepare(`DELETE FROM sessions WHERE token=?`).bind(token).run();
    return json({ok:true},200,{'set-cookie':clearCookie()});
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const u=await getSession(request,env); if(!u) return ok({user:null});
    let exam=null;try{exam=await activeExam(u.user_id,env)}catch(error){console.error('[auth/me active exam]',error)}const permissions=[...(await effectivePermissions(env,u,'sky-first'))];
    return ok({user:{id:str(u.user_id),user_id:str(u.user_id),sfn_id:str(u.sfn_id)||'SFN',full_name:str(u.full_name)||str(u.sfn_id)||'Thành viên Sky First',email:str(u.email),phone:str(u.phone),role:str(u.role)||'student',avatar_key:str(u.avatar_key),status:'active',permissions},active_exam:exam&&typeof exam==='object'?exam:null});
  }

  if (path === '/api/auth/activate' && method === 'POST') {
    const body=await request.json(); const token=str(body.token), password=str(body.password);
    if(password.length<10) return bad('Mật khẩu phải có ít nhất 10 ký tự.');
    const row=await env.DB.prepare(`SELECT a.*,u.status user_status FROM activation_tokens a JOIN users u ON u.id=a.user_id WHERE a.token=? AND a.used_at IS NULL AND a.expires_at>CURRENT_TIMESTAMP`).bind(token).first();
    if(!row) return bad('Liên kết kích hoạt không hợp lệ hoặc đã hết hạn.');
    if(['disabled','suspended'].includes(row.user_status)) return bad('Tài khoản hiện đang tạm ngưng. Vui lòng liên hệ bộ phận phụ trách.',403);
    const hp=await hashPassword(password);
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(hp.hash,hp.salt,row.user_id),
      env.DB.prepare(`UPDATE activation_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL`).bind(row.user_id)
    ]);
    return ok({message:'Tài khoản SFN đã được kích hoạt.'});
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
    const u=await requireUser(request,env), org=await requireOrganizationContext(request,env,u), hasOrg=await tableHasColumn(env,'classes','organization_id');
    const base=`SELECT c.*,cm.role member_role,(SELECT COUNT(*) FROM class_members x WHERE x.class_id=c.id AND x.status='active') member_count FROM classes c JOIN class_members cm ON cm.class_id=c.id WHERE cm.user_id=? AND cm.status='active' AND c.status!='deleted'`;
    const rows=hasOrg?await env.DB.prepare(`${base} AND COALESCE(c.organization_id,'sky-first')=? ORDER BY c.updated_at DESC`).bind(u.user_id,org).all():await env.DB.prepare(`${base} ORDER BY c.updated_at DESC`).bind(u.user_id).all();
    return ok({classes:rows.results||[],organization_id:hasOrg?org:'sky-first',schema_mode:hasOrg?'organization':'legacy'});
  }

  if (path === '/api/classes' && method === 'POST') {
    const u=await requireRole(request,env,['super_admin','school_admin','teacher']), org=await requireOrganizationContext(request,env,u), hasOrg=await tableHasColumn(env,'classes','organization_id');
    const b=await request.json(); if(!str(b.name)) return bad('Tên lớp không được để trống.');const classCount=hasOrg?await env.DB.prepare(`SELECT COUNT(*) n FROM classes WHERE COALESCE(organization_id,'sky-first')=? AND status!='deleted'`).bind(org).first():{n:0};if(hasOrg)await enforceOrgQuota(env,org,'classes',Number(classCount?.n||0),1);
    const id=crypto.randomUUID(), joinCode=slugCode('SLC');
    const insertClass=hasOrg?env.DB.prepare(`INSERT INTO classes(id,name,description,unit,cover_key,join_code,owner_user_id,status,organization_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,str(b.name),str(b.description),str(b.unit),null,joinCode,u.user_id,org):env.DB.prepare(`INSERT INTO classes(id,name,description,unit,cover_key,join_code,owner_user_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,str(b.name),str(b.description),str(b.unit),null,joinCode,u.user_id);
    await env.DB.batch([insertClass,env.DB.prepare(`INSERT INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,'teacher','active',CURRENT_TIMESTAMP)`).bind(id,u.user_id)]);
    ctx?.waitUntil?.(recordAnalytics(env,hasOrg?org:'sky-first','class.created',{userId:u.user_id,entityType:'class',entityId:id}));return ok({id,join_code:joinCode,organization_id:hasOrg?org:'sky-first'});
  }

  const classMatch=path.match(/^\/api\/classes\/([^/]+)$/);
  if(classMatch && method==='GET'){
    const u=await requireUser(request,env); const id=classMatch[1];
    const cls=await env.DB.prepare(`SELECT c.*,COALESCE(u.full_name,'') owner_name FROM classes c LEFT JOIN users u ON u.id=c.owner_user_id WHERE c.id=? AND c.status!='deleted'`).bind(id).first();
    if(!cls) return bad('Không tìm thấy lớp.',404);
    if(['school_admin','super_admin'].includes(u.role)) await requireClassOrganizationAccess(request,env,u,id);
    const member=['school_admin','super_admin'].includes(u.role)?{role:u.role}:await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first();
    if(!member) return bad('Bạn không thuộc lớp này.',403);
    let members={results:[]};
    const canSeeMemberEmail=['teacher','assistant','school_admin','super_admin'].includes(member.role);
    try{members=await env.DB.prepare(`SELECT cm.user_id,cm.role,u.sfn_id,u.full_name${canSeeMemberEmail?',u.email':''} FROM class_members cm JOIN users u ON u.id=cm.user_id WHERE cm.class_id=? AND cm.status='active' ORDER BY cm.role,u.full_name`).bind(id).all()}catch(error){console.error('[class members]',error)}
    const org=await classOrganization(env,id);const role=member.role;const isSystemAdmin=['school_admin','super_admin'].includes(u.role);const baseManage=isSystemAdmin||['teacher','assistant'].includes(role);const assessmentManage=isSystemAdmin||role==='teacher'||await hasEffectivePermission(env,u,org,'assessment.manage');const assessmentMonitor=isSystemAdmin||await hasEffectivePermission(env,u,org,'assessment.monitor');const assessmentGrade=isSystemAdmin||await hasEffectivePermission(env,u,org,'assessment.grade');const capabilities={can_manage_class:baseManage,can_post:true,can_manage_materials:baseManage,can_manage_assignments:baseManage,can_create_assessment:assessmentManage,can_edit_assessment:assessmentManage,can_monitor_assessment:assessmentMonitor,can_grade_assessment:assessmentGrade,can_manage_attendance:baseManage,can_manage_members:baseManage,can_manage_live:baseManage,can_create_guest_link:baseManage};
    return ok({class:cls,members:members.results||[],my_role:role,capabilities});
  }

  const classMemberManage=path.match(/^\/api\/classes\/([^/]+)\/members(?:\/([^/]+))?$/);
  if(classMemberManage && method==='POST'){
    const u=await requireUser(request,env), classId=classMemberManage[1];
    const cls=await env.DB.prepare(`SELECT owner_user_id,status FROM classes WHERE id=?`).bind(classId).first(); if(!cls||cls.status==='deleted')return bad('Không tìm thấy lớp.',404);
    if(['school_admin','super_admin'].includes(u.role)) await requireClassOrganizationAccess(request,env,u,classId);
    const mine=['super_admin','school_admin'].includes(u.role)?{role:u.role}:await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(classId,u.user_id).first();
    if(!mine||(!['super_admin','school_admin'].includes(u.role)&&mine.role!=='teacher'))return bad('Chỉ giáo viên hoặc quản trị được thêm thành viên.',403);
    const b=await request.json(), login=str(b.login), role=['teacher','assistant','student'].includes(b.role)?b.role:'student'; if(!login)return bad('Vui lòng nhập SFN ID hoặc email.');
    const target=await env.DB.prepare(`SELECT id,sfn_id,full_name,email FROM users WHERE (lower(email)=lower(?) OR lower(sfn_id)=lower(?)) AND status='active' LIMIT 1`).bind(login,login).first(); if(!target)return bad('Không tìm thấy tài khoản đang hoạt động.',404);const existing=await env.DB.prepare(`SELECT 1 ok FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(classId,target.id).first();if(!existing){const org=await classOrganization(env,classId),memberCount=(await organizationUserIds(env,org)).length;await enforceOrgQuota(env,org,'members',memberCount,1)}
    await env.DB.prepare(`INSERT INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,?,'active',CURRENT_TIMESTAMP) ON CONFLICT(class_id,user_id) DO UPDATE SET role=excluded.role,status='active',joined_at=CURRENT_TIMESTAMP`).bind(classId,target.id,role).run();
    await adminLog(env,u.user_id,'class.member_add',{class_id:classId,user_id:target.id,role}); return ok({member:target});
  }
  if(classMemberManage && method==='DELETE' && classMemberManage[2]){
    const u=await requireUser(request,env), classId=classMemberManage[1], targetId=classMemberManage[2];
    const cls=await env.DB.prepare(`SELECT owner_user_id,status FROM classes WHERE id=?`).bind(classId).first(); if(!cls||cls.status==='deleted')return bad('Không tìm thấy lớp.',404);
    if(['school_admin','super_admin'].includes(u.role)) await requireClassOrganizationAccess(request,env,u,classId);
    const mine=['super_admin','school_admin'].includes(u.role)?{role:u.role}:await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(classId,u.user_id).first();
    if(!mine||(!['super_admin','school_admin'].includes(u.role)&&mine.role!=='teacher'))return bad('Chỉ giáo viên hoặc quản trị được xóa thành viên.',403);
    if(targetId===cls.owner_user_id)return bad('Không thể xóa giáo viên sở hữu lớp.',409);
    await env.DB.prepare(`UPDATE class_members SET status='removed' WHERE class_id=? AND user_id=?`).bind(classId,targetId).run(); await adminLog(env,u.user_id,'class.member_remove',{class_id:classId,user_id:targetId}); return ok();
  }

  const classDelete=path.match(/^\/api\/classes\/([^/]+)$/);
  if(classDelete && method==='DELETE'){
    const u=await requireUser(request,env), classId=classDelete[1]; const cls=await env.DB.prepare(`SELECT owner_user_id,name,status FROM classes WHERE id=?`).bind(classId).first(); if(!cls||cls.status==='deleted')return bad('Không tìm thấy lớp.',404);
    if(['school_admin','super_admin'].includes(u.role)) await requireClassOrganizationAccess(request,env,u,classId);
    if(!['super_admin','school_admin'].includes(u.role)&&cls.owner_user_id!==u.user_id)return bad('Chỉ giáo viên sở hữu lớp hoặc quản trị được xóa lớp.',403);
    await env.DB.batch([env.DB.prepare(`UPDATE classes SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(classId),env.DB.prepare(`UPDATE class_members SET status='removed' WHERE class_id=?`).bind(classId)]); await adminLog(env,u.user_id,'class.delete',{class_id:classId,name:cls.name}); return ok({deleted:true});
  }

  const joinMatch=path.match(/^\/api\/classes\/join$/);
  if(joinMatch && method==='POST'){
    const u=await requireUser(request,env); const b=await request.json(); const code=str(b.code).toUpperCase();
    const hasOrg=await tableHasColumn(env,'classes','organization_id');
    const cls=await env.DB.prepare(`SELECT id${hasOrg?",COALESCE(organization_id,'sky-first') organization_id":''} FROM classes WHERE upper(join_code)=? AND status='active'`).bind(code).first();
    if(!cls) return bad('Mã lớp không hợp lệ.');
    if(hasOrg){const requested=await requireOrganizationContext(request,env,u);if(str(cls.organization_id)!==requested)return bad('Lớp không thuộc tổ chức hiện tại.',403);}
    const settings=await env.DB.prepare(`SELECT access_mode FROM class_settings WHERE class_id=?`).bind(cls.id).first();if(settings&&['closed','invite'].includes(str(settings.access_mode)))return bad('Lớp hiện không cho phép tự tham gia bằng mã.',403)
    await env.DB.prepare(`INSERT INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,'student','active',CURRENT_TIMESTAMP) ON CONFLICT(class_id,user_id) DO UPDATE SET status='active'`).bind(cls.id,u.user_id).run();
    return ok({class_id:cls.id});
  }

  const postsMatch=path.match(/^\/api\/classes\/([^/]+)\/posts$/);
  if(postsMatch && method==='GET'){
    const u=await requireUser(request,env); const id=postsMatch[1];
    await requireClassMember(env,id,u.user_id);
    const rows=await env.DB.prepare(`SELECT p.*,u.full_name author FROM class_posts p JOIN users u ON u.id=p.author_user_id WHERE p.class_id=? ORDER BY p.pinned DESC,p.created_at DESC LIMIT 100`).bind(id).all(); return ok({posts:rows.results});
  }
  if(postsMatch && method==='POST'){
    const u=await requireUser(request,env); const id=postsMatch[1]; const m=await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!m)return bad('Không có quyền.',403);
    const b=await request.json(); if(!str(b.body))return bad('Nội dung trống.');
    await env.DB.prepare(`INSERT INTO class_posts(id,class_id,author_user_id,body,pinned,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),id,u.user_id,str(b.body),['teacher','assistant'].includes(m.role)&&b.pinned?1:0).run(); return ok();
  }

  const matsMatch=path.match(/^\/api\/classes\/([^/]+)\/materials$/);
  if(matsMatch && method==='GET'){
    const u=await requireUser(request,env); const id=matsMatch[1]; if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,id);else await requireClassMember(env,id,u.user_id);
    const rows=await env.DB.prepare(`SELECT m.*,f.name,f.mime,f.size FROM materials m JOIN files f ON f.id=m.file_id WHERE m.class_id=? ORDER BY m.created_at DESC`).bind(id).all(); return ok({materials:rows.results});
  }
  if(matsMatch && method==='POST'){
    const u=await requireUser(request,env); const id=matsMatch[1]; const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,id);const m=isAdmin?{role:'admin'}:await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!m||(!isAdmin&&!['teacher','assistant'].includes(m.role)))return bad('Chỉ giáo viên/trợ giảng/quản trị viên được tải học liệu.',403);
    const form=await request.formData(); const file=form.get('file'); if(!(file instanceof File)||!file.size)return bad('Chưa chọn tệp.');
    // Học liệu accepts every file type. We still enforce a size ceiling and store the
    // original MIME as metadata; download responses use nosniff/sandbox protections.
    const uploadCfg=await getSettings(env),maxUpload=settingNumber(uploadCfg,'max_upload_mb',50,{min:1,max:50});const uploadErr=validateUpload(file,{maxMb:maxUpload,label:'Học liệu'}); if(uploadErr)return bad(uploadErr,400);const org=await classOrganization(env,id);const usedBytes=await env.DB.prepare(`SELECT COALESCE(SUM(f.size),0) n FROM files f JOIN materials m ON m.file_id=f.id JOIN classes c ON c.id=m.class_id WHERE COALESCE(c.organization_id,'sky-first')=?`).bind(org).first();await enforceOrgQuota(env,org,'storage.bytes',Number(usedBytes?.n||0),file.size);
    const meta=await uploadR2(file,env,`classes/${id}/materials`,u.user_id,'class');
    const mid=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO materials(id,class_id,file_id,title,description,created_by,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(mid,id,meta.id,str(form.get('title'))||file.name,str(form.get('description')),u.user_id).run(); return ok({id:mid});
  }


  const materialItem=path.match(/^\/api\/materials\/([^/]+)$/);
  if(materialItem && method==='PATCH'){
    const u=await requireUser(request,env),mid=materialItem[1];const row=await env.DB.prepare(`SELECT m.id,m.class_id,m.title,m.description FROM materials m WHERE m.id=?`).bind(mid).first();if(!row)return bad('Không tìm thấy học liệu.',404);const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,row.class_id);else await requireClassMember(env,row.class_id,u.user_id,['teacher','assistant']);const b=await request.json(),title=str(b.title??row.title).slice(0,180),description=str(b.description??row.description).slice(0,2000);if(!title)return bad('Tên học liệu không được để trống.');await env.DB.prepare(`UPDATE materials SET title=?,description=? WHERE id=?`).bind(title,description,mid).run();await adminLog(env,u.user_id,'material.update',{material_id:mid,class_id:row.class_id});return ok({updated:true});
  }
  if(materialItem && method==='DELETE'){
    const u=await requireUser(request,env),mid=materialItem[1];const row=await env.DB.prepare(`SELECT m.id,m.class_id,m.file_id,f.r2_key FROM materials m JOIN files f ON f.id=m.file_id WHERE m.id=?`).bind(mid).first();if(!row)return bad('Không tìm thấy học liệu.',404);const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,row.class_id);else await requireClassMember(env,row.class_id,u.user_id,['teacher','assistant']);await env.DB.prepare(`DELETE FROM materials WHERE id=?`).bind(mid).run();try{await env.FILES.delete(row.r2_key)}catch(error){console.error('[material r2 delete]',error)}await env.DB.prepare(`DELETE FROM files WHERE id=?`).bind(row.file_id).run().catch(error=>console.error('[material file cleanup]',error));await adminLog(env,u.user_id,'material.delete',{material_id:mid,class_id:row.class_id});return ok({deleted:true});
  }

  const assignmentsMatch=path.match(/^\/api\/classes\/([^/]+)\/assignments$/);
  if(assignmentsMatch && method==='GET'){
    const u=await requireUser(request,env); const id=assignmentsMatch[1]; const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,id);const membership=isAdmin?{role:u.role}:await requireClassMember(env,id,u.user_id); const canManage=['teacher','assistant','school_admin','super_admin'].includes(membership.role); const rows=await env.DB.prepare(`SELECT a.*,(SELECT status FROM submissions s WHERE s.assignment_id=a.id AND s.user_id=?) my_status,(SELECT submission_count FROM submissions s WHERE s.assignment_id=a.id AND s.user_id=?) my_submission_count FROM assignments a WHERE a.class_id=? ${canManage?'':'AND a.published=1'} ORDER BY a.created_at DESC`).bind(u.user_id,u.user_id,id).all(); return ok({assignments:rows.results});
  }
  if(assignmentsMatch && method==='POST'){
    const u=await requireUser(request,env); const id=assignmentsMatch[1]; const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,id);const m=isAdmin?{role:u.role}:await env.DB.prepare(`SELECT role FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(id,u.user_id).first(); if(!m||(!isAdmin&&!['teacher','assistant'].includes(m.role)))return bad('Không có quyền.',403);
    const b=await request.json(); if(!str(b.title))return bad('Tên bài tập không được để trống.'); const aid=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO assignments(id,class_id,type,title,instructions,due_at,points,created_by,created_at,category,allow_late,max_resubmissions,published) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?)`).bind(aid,id,b.type==='tnv_task'?'tnv_task':'assignment',str(b.title),str(b.instructions),b.due_at||null,Math.max(0,Number(b.points||10)),u.user_id,str(b.category).slice(0,80)||'assignment',b.allow_late===false?0:1,Math.max(0,Math.min(20,Number(b.max_resubmissions??1))),b.published===false?0:1).run(); return ok({id:aid});
  }


  const assignmentItem=path.match(/^\/api\/assignments\/([^/]+)$/);
  if(assignmentItem && method==='PATCH'){
    const u=await requireUser(request,env),aid=assignmentItem[1];const current=await env.DB.prepare(`SELECT * FROM assignments WHERE id=?`).bind(aid).first();if(!current)return bad('Không tìm thấy bài tập.',404);const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,current.class_id);else await requireClassMember(env,current.class_id,u.user_id,['teacher','assistant']);const b=await request.json(),title=str(b.title??current.title).slice(0,180);if(!title)return bad('Tên bài tập không được để trống.');await env.DB.prepare(`UPDATE assignments SET type=?,title=?,instructions=?,due_at=?,points=?,category=?,allow_late=?,max_resubmissions=?,published=? WHERE id=?`).bind(b.type==='tnv_task'?'tnv_task':(b.type==='assignment'?'assignment':current.type),title,str(b.instructions??current.instructions).slice(0,6000),b.due_at===undefined?current.due_at:(str(b.due_at)||null),Math.max(0,Number(b.points??current.points)),str(b.category??current.category).slice(0,80)||'assignment',b.allow_late===undefined?Number(current.allow_late):(b.allow_late?1:0),Math.max(0,Math.min(20,Number(b.max_resubmissions??current.max_resubmissions))),b.published===undefined?Number(current.published):(b.published?1:0),aid).run();await adminLog(env,u.user_id,'assignment.update',{assignment_id:aid,class_id:current.class_id});return ok({updated:true});
  }
  if(assignmentItem && method==='DELETE'){
    const u=await requireUser(request,env),aid=assignmentItem[1];const current=await env.DB.prepare(`SELECT id,class_id,title FROM assignments WHERE id=?`).bind(aid).first();if(!current)return bad('Không tìm thấy bài tập.',404);const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,current.class_id);else await requireClassMember(env,current.class_id,u.user_id,['teacher','assistant']);const count=await env.DB.prepare(`SELECT COUNT(*) n FROM submissions WHERE assignment_id=?`).bind(aid).first();if(Number(count?.n||0)>0)return bad('Bài tập đã có bài nộp. Hãy ẩn bài thay vì xóa để giữ lịch sử học tập.',409);await env.DB.prepare(`DELETE FROM assignments WHERE id=?`).bind(aid).run();await adminLog(env,u.user_id,'assignment.delete',{assignment_id:aid,class_id:current.class_id,title:current.title});return ok({deleted:true});
  }

  const submitMatch=path.match(/^\/api\/assignments\/([^/]+)\/submit$/);
  if(submitMatch && method==='POST'){
    const u=await requireUser(request,env); const aid=submitMatch[1]; const assignment=await env.DB.prepare(`SELECT id,class_id,due_at,published,allow_late,max_resubmissions FROM assignments WHERE id=?`).bind(aid).first(); if(!assignment)return bad('Không tìm thấy bài tập.',404); await requireClassMember(env,assignment.class_id,u.user_id); if(!Number(assignment.published))return bad('Bài tập này chưa được công bố.',403); const due=assignment.due_at?Date.parse(assignment.due_at):null;if(due&&Date.now()>due&&!Number(assignment.allow_late))return bad('Bài tập đã hết hạn và không cho phép nộp muộn.',409);const existing=await env.DB.prepare(`SELECT id,submission_count FROM submissions WHERE assignment_id=? AND user_id=?`).bind(aid,u.user_id).first();const used=Math.max(0,Number(existing?.submission_count||0));const maxTotal=1+Math.max(0,Number(assignment.max_resubmissions||0));if(existing&&used>=maxTotal)return bad('Bạn đã sử dụng hết số lần nộp lại cho bài tập này.',409,{submission_count:used,max_submissions:maxTotal}); const form=await request.formData(); const file=form.get('file'); let fileId=null;
    if(file instanceof File && file.size){const uploadCfg=await getSettings(env),maxUpload=settingNumber(uploadCfg,'max_upload_mb',50,{min:1,max:50});const err=validateUpload(file,{maxMb:maxUpload,label:'Tệp bài nộp'});if(err)return bad(err);const org=await classOrganization(env,assignment.class_id);const usedBytes=await env.DB.prepare(`SELECT COALESCE(SUM(f.size),0) n FROM files f JOIN submissions s ON s.file_id=f.id JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id WHERE COALESCE(c.organization_id,'sky-first')=?`).bind(org).first();await enforceOrgQuota(env,org,'storage.bytes',Number(usedBytes?.n||0),file.size); const meta=await uploadR2(file,env,`submissions/${aid}`,u.user_id,'private'); fileId=meta.id; }
    await env.DB.prepare(`INSERT INTO submissions(id,assignment_id,user_id,text_answer,file_id,status,submitted_at,updated_at,submission_count) VALUES(?,?,?,?,?,'submitted',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1) ON CONFLICT(assignment_id,user_id) DO UPDATE SET text_answer=excluded.text_answer,file_id=COALESCE(excluded.file_id,submissions.file_id),status='submitted',submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,submission_count=COALESCE(submissions.submission_count,1)+1`).bind(crypto.randomUUID(),aid,u.user_id,str(form.get('text')),fileId).run(); const org=await classOrganization(env,assignment.class_id);ctx?.waitUntil?.(recordAnalytics(env,org,'assignment.submitted',{userId:u.user_id,entityType:'assignment',entityId:aid}));ctx?.waitUntil?.(runAutomations(env,org,'assignment.submitted',{user_id:u.user_id,title:'Bài tập đã được nộp',message:`Một bài tập vừa được nộp.`,link:`/#class/${assignment.class_id}`},ctx));return ok({submission_count:used+1,max_submissions:maxTotal});
  }

  // Learning Core — Gradebook, progress and attendance.
  const learningSummary=path.match(/^\/api\/classes\/([^/]+)\/learning-summary$/);
  if(learningSummary && method==='GET'){
    const u=await requireUser(request,env), classId=learningSummary[1]; const membership=await requireClassMember(env,classId,u.user_id);const canViewAll=['teacher','assistant','school_admin','super_admin'].includes(membership.role);
    const members=canViewAll?await env.DB.prepare(`SELECT cm.user_id,cm.role,u.sfn_id,u.full_name FROM class_members cm JOIN users u ON u.id=cm.user_id WHERE cm.class_id=? AND cm.status='active' ORDER BY u.full_name`).bind(classId).all():await env.DB.prepare(`SELECT cm.user_id,cm.role,u.sfn_id,u.full_name FROM class_members cm JOIN users u ON u.id=cm.user_id WHERE cm.class_id=? AND cm.user_id=? AND cm.status='active'`).bind(classId,u.user_id).all();
    const assignments=await env.DB.prepare(`SELECT id,title,type,category,points,due_at FROM assignments WHERE class_id=? AND published=1 ORDER BY created_at`).bind(classId).all();
    const userIds=(members.results||[]).map(x=>x.user_id);const submissions=userIds.length?await env.DB.prepare(`SELECT s.assignment_id,s.user_id,s.status,s.score,s.submitted_at FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=? ${canViewAll?'':'AND s.user_id=?'}`).bind(...(canViewAll?[classId]:[classId,u.user_id])).all():{results:[]};
    const exams=await env.DB.prepare(`SELECT id,title,assessment_type FROM exams WHERE class_id=? AND status IN ('published','closed') ORDER BY created_at`).bind(classId).all();
    const attempts=userIds.length?await env.DB.prepare(`SELECT a.exam_id,a.user_id,a.status,a.score,a.max_score FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE e.class_id=? AND a.status='submitted' ${canViewAll?'':'AND a.user_id=?'}`).bind(...(canViewAll?[classId]:[classId,u.user_id])).all():{results:[]};
    const categories=await env.DB.prepare(`SELECT * FROM gradebook_categories WHERE class_id=? ORDER BY sort_order,name`).bind(classId).all();
    const att=userIds.length?await env.DB.prepare(`SELECT r.user_id,r.status FROM class_attendance_records r JOIN class_attendance_sessions s ON s.id=r.session_id WHERE s.class_id=? ${canViewAll?'':'AND r.user_id=?'}`).bind(...(canViewAll?[classId]:[classId,u.user_id])).all():{results:[]};
    const cats=categories.results||[];const studentRows=(members.results||[]).filter(x=>x.role==='student'||x.user_id===u.user_id).map(m=>{const ss=(submissions.results||[]).filter(x=>x.user_id===m.user_id);const aa=(attempts.results||[]).filter(x=>x.user_id===m.user_id);const ar=(att.results||[]).filter(x=>x.user_id===m.user_id);const graded=ss.filter(x=>x.score!=null);const possible=graded.reduce((n,x)=>n+Number((assignments.results||[]).find(a=>a.id===x.assignment_id)?.points||0),0);const earned=graded.reduce((n,x)=>n+Number(x.score||0),0);const examPct=aa.filter(x=>Number(x.max_score)>0).map(x=>100*Number(x.score||0)/Number(x.max_score));const categoryScores={};for(const c of cats){const key=str(c.name).toLocaleLowerCase('vi-VN');let vals=[];for(const sub of graded){const asg=(assignments.results||[]).find(a=>a.id===sub.assignment_id);if(asg&&str(asg.category).toLocaleLowerCase('vi-VN')===key&&Number(asg.points)>0)vals.push(100*Number(sub.score||0)/Number(asg.points));}if(['assessment','đánh giá','kiem tra','kiểm tra'].includes(key))vals.push(...examPct);if(vals.length)categoryScores[c.id]=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)}let weightedNum=0,weightedDen=0;for(const c of cats){const v=categoryScores[c.id],w=Math.max(0,Number(c.weight||0));if(v!=null&&w>0){weightedNum+=v*w;weightedDen+=w}}return {...m,assignments_submitted:ss.length,assignments_total:(assignments.results||[]).length,assignment_percent:possible?Math.round(earned/possible*100):null,assessment_percent:examPct.length?Math.round(examPct.reduce((a,b)=>a+b,0)/examPct.length):null,attendance_percent:ar.length?Math.round(ar.filter(x=>['present','late'].includes(x.status)).length/ar.length*100):null,category_scores:categoryScores,weighted_percent:weightedDen?Math.round(weightedNum/weightedDen):null}});
    return ok({role:membership.role,scope:canViewAll?'class':'self',assignments:assignments.results,exams:exams.results,categories:cats,students:studentRows});
  }
  const gradeCategories=path.match(/^\/api\/classes\/([^/]+)\/gradebook\/categories$/);
  if(gradeCategories && method==='GET'){
    const u=await requireUser(request,env),classId=gradeCategories[1],isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id);const rows=await env.DB.prepare(`SELECT id,class_id,name,weight,sort_order FROM gradebook_categories WHERE class_id=? ORDER BY sort_order,name`).bind(classId).all();return ok({categories:rows.results||[]});
  }
  if(gradeCategories && method==='POST'){
    const u=await requireUser(request,env),classId=gradeCategories[1],isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id,['teacher','assistant']);const b=await request.json(),name=str(b.name).slice(0,80);if(!name)return bad('Tên nhóm điểm không được để trống.');const weight=Math.max(0,Math.min(100,Number(b.weight||0))),existing=await env.DB.prepare(`SELECT id,weight FROM gradebook_categories WHERE class_id=? AND name=?`).bind(classId,name).first(),sum=await env.DB.prepare(`SELECT COALESCE(SUM(weight),0) n FROM gradebook_categories WHERE class_id=?`).bind(classId).first(),nextTotal=Number(sum?.n||0)-Number(existing?.weight||0)+weight;if(nextTotal>100.0001)return bad(`Tổng trọng số các nhóm không được vượt quá 100%. Hiện sẽ là ${Math.round(nextTotal*100)/100}%.`,409);if(existing)await env.DB.prepare(`UPDATE gradebook_categories SET weight=?,sort_order=? WHERE id=?`).bind(weight,Number(b.sort_order||0),existing.id).run();else await env.DB.prepare(`INSERT INTO gradebook_categories(id,class_id,name,weight,sort_order) VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(),classId,name,weight,Number(b.sort_order||0)).run();return ok({total_weight:nextTotal});
  }
  const gradeCategoryItem=path.match(/^\/api\/classes\/([^/]+)\/gradebook\/categories\/([^/]+)$/);
  if(gradeCategoryItem && method==='PATCH'){
    const u=await requireUser(request,env),classId=gradeCategoryItem[1],categoryId=gradeCategoryItem[2],isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id,['teacher','assistant']);const current=await env.DB.prepare(`SELECT * FROM gradebook_categories WHERE id=? AND class_id=?`).bind(categoryId,classId).first();if(!current)return bad('Không tìm thấy nhóm điểm.',404);const b=await request.json(),name=str(b.name??current.name).slice(0,80),weight=Math.max(0,Math.min(100,Number(b.weight??current.weight)));if(!name)return bad('Tên nhóm điểm không được để trống.');const dup=await env.DB.prepare(`SELECT id FROM gradebook_categories WHERE class_id=? AND name=? AND id!=?`).bind(classId,name,categoryId).first();if(dup)return bad('Tên nhóm điểm đã tồn tại.',409);const sum=await env.DB.prepare(`SELECT COALESCE(SUM(weight),0) n FROM gradebook_categories WHERE class_id=?`).bind(classId).first(),nextTotal=Number(sum?.n||0)-Number(current.weight||0)+weight;if(nextTotal>100.0001)return bad(`Tổng trọng số các nhóm không được vượt quá 100%. Hiện sẽ là ${Math.round(nextTotal*100)/100}%.`,409);await env.DB.prepare(`UPDATE gradebook_categories SET name=?,weight=?,sort_order=? WHERE id=?`).bind(name,weight,Number(b.sort_order??current.sort_order),categoryId).run();return ok({updated:true,total_weight:nextTotal});
  }
  if(gradeCategoryItem && method==='DELETE'){
    const u=await requireUser(request,env),classId=gradeCategoryItem[1],categoryId=gradeCategoryItem[2],isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id,['teacher','assistant']);const current=await env.DB.prepare(`SELECT id,name FROM gradebook_categories WHERE id=? AND class_id=?`).bind(categoryId,classId).first();if(!current)return bad('Không tìm thấy nhóm điểm.',404);const used=await env.DB.prepare(`SELECT COUNT(*) n FROM assignments WHERE class_id=? AND lower(category)=lower(?)`).bind(classId,current.name).first();if(Number(used?.n||0)>0)return bad('Nhóm điểm đang được sử dụng bởi bài tập. Hãy chuyển bài tập sang nhóm khác trước.',409);await env.DB.prepare(`DELETE FROM gradebook_categories WHERE id=? AND class_id=?`).bind(categoryId,classId).run();return ok({deleted:true});
  }
  const attendance=path.match(/^\/api\/classes\/([^/]+)\/attendance$/);
  if(attendance && method==='GET'){
    const u=await requireUser(request,env), classId=attendance[1]; if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id);const sessions=await env.DB.prepare(`SELECT s.*,(SELECT COUNT(*) FROM class_attendance_records r WHERE r.session_id=s.id) marked_count FROM class_attendance_sessions s WHERE s.class_id=? ORDER BY s.starts_at DESC LIMIT 100`).bind(classId).all();return ok({sessions:sessions.results});
  }
  if(attendance && method==='POST'){
    const u=await requireUser(request,env), classId=attendance[1];if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id,['teacher','assistant']);const b=await request.json();const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO class_attendance_sessions(id,class_id,title,starts_at,ends_at,created_by) VALUES(?,?,?,?,?,?)`).bind(id,classId,str(b.title).slice(0,120)||'Buổi học',str(b.starts_at)||nowIso(),str(b.ends_at)||null,u.user_id).run();const members=await env.DB.prepare(`SELECT user_id FROM class_members WHERE class_id=? AND role='student' AND status='active'`).bind(classId).all();for(const m of members.results||[])await env.DB.prepare(`INSERT OR IGNORE INTO class_attendance_records(session_id,user_id,status,marked_by) VALUES(?,?,'unmarked',NULL)`).bind(id,m.user_id).run();return ok({id});
  }
  const attendanceSession=path.match(/^\/api\/attendance\/([^/]+)$/);
  if(attendanceSession && method==='GET'){
    const u=await requireUser(request,env);const sid=attendanceSession[1];const sess=await env.DB.prepare(`SELECT * FROM class_attendance_sessions WHERE id=?`).bind(sid).first();if(!sess)return bad('Không tìm thấy buổi điểm danh.',404);const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,sess.class_id);const membership=isAdmin?{role:u.role}:await requireClassMember(env,sess.class_id,u.user_id);const canViewAll=['teacher','assistant','school_admin','super_admin'].includes(membership.role);const rows=canViewAll?await env.DB.prepare(`SELECT r.*,u.sfn_id,u.full_name FROM class_attendance_records r JOIN users u ON u.id=r.user_id WHERE r.session_id=? ORDER BY u.full_name`).bind(sid).all():await env.DB.prepare(`SELECT r.*,u.sfn_id,u.full_name FROM class_attendance_records r JOIN users u ON u.id=r.user_id WHERE r.session_id=? AND r.user_id=?`).bind(sid,u.user_id).all();return ok({session:sess,scope:canViewAll?'class':'self',records:rows.results});
  }
  if(attendanceSession && method==='PATCH'){
    const u=await requireUser(request,env),sid=attendanceSession[1];const sess=await env.DB.prepare(`SELECT * FROM class_attendance_sessions WHERE id=?`).bind(sid).first();if(!sess)return bad('Không tìm thấy buổi điểm danh.',404);if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,sess.class_id);else await requireClassMember(env,sess.class_id,u.user_id,['teacher','assistant']);const b=await request.json();if(b.user_id){const status=['unmarked','present','late','absent','excused'].includes(str(b.status))?str(b.status):null;if(!status)return bad('Trạng thái điểm danh không hợp lệ.');const target=await env.DB.prepare(`SELECT 1 ok FROM class_attendance_records WHERE session_id=? AND user_id=?`).bind(sid,str(b.user_id)).first();if(!target)return bad('Học viên không thuộc buổi điểm danh này.',404);await env.DB.prepare(`UPDATE class_attendance_records SET status=?,note=?,marked_by=?,updated_at=CURRENT_TIMESTAMP WHERE session_id=? AND user_id=?`).bind(status,str(b.note).slice(0,300),u.user_id,sid,str(b.user_id)).run();return ok({updated:'record'});}const title=str(b.title??sess.title).slice(0,120),starts=str(b.starts_at??sess.starts_at),ends=str(b.ends_at??sess.ends_at)||null;if(!title||!starts)return bad('Tên buổi và thời gian bắt đầu là bắt buộc.');await env.DB.prepare(`UPDATE class_attendance_sessions SET title=?,starts_at=?,ends_at=? WHERE id=?`).bind(title,starts,ends,sid).run();await adminLog(env,u.user_id,'attendance.session_update',{session_id:sid,class_id:sess.class_id});return ok({updated:'session'});
  }
  if(attendanceSession && method==='DELETE'){
    const u=await requireUser(request,env),sid=attendanceSession[1];const sess=await env.DB.prepare(`SELECT class_id FROM class_attendance_sessions WHERE id=?`).bind(sid).first();if(!sess)return bad('Không tìm thấy buổi điểm danh.',404);if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,sess.class_id);else await requireClassMember(env,sess.class_id,u.user_id,['teacher','assistant']);await env.DB.prepare(`DELETE FROM class_attendance_sessions WHERE id=?`).bind(sid).run();await adminLog(env,u.user_id,'attendance.session_delete',{session_id:sid,class_id:sess.class_id});return ok({deleted:true});
  }

  const examsMatch=path.match(/^\/api\/classes\/([^/]+)\/exams$/);
  if(examsMatch && method==='GET'){
    const u=await requireUser(request,env); const id=examsMatch[1];const isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,id);else await requireClassMember(env,id,u.user_id);const org=await classOrganization(env,id),canManage=isAdmin||await hasEffectivePermission(env,u,org,'assessment.manage'),canMonitor=isAdmin||await hasEffectivePermission(env,u,org,'assessment.monitor'),canGrade=isAdmin||await hasEffectivePermission(env,u,org,'assessment.grade'); const rows=await env.DB.prepare(`SELECT e.id,e.class_id,e.title,e.instructions,e.duration_minutes,e.time_limit_enabled,e.strict_mode,e.status,e.created_at,e.opens_at,e.closes_at,e.max_attempts,e.show_score,e.fullscreen_required,e.terminate_on_exit,e.assessment_type,e.assessment_label,e.center_label,e.public_access,e.public_token,e.time_limit_enabled,(SELECT id FROM exam_attempts a WHERE a.exam_id=e.id AND a.user_id=? ORDER BY a.started_at DESC LIMIT 1) attempt_id,(SELECT status FROM exam_attempts a WHERE a.exam_id=e.id AND a.user_id=? ORDER BY a.started_at DESC LIMIT 1) attempt_status,(SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id=e.id AND a.user_id=?) attempt_count FROM exams e WHERE e.class_id=? ${canManage?'':"AND e.status IN ('published','closed')"} ORDER BY e.created_at DESC`).bind(u.user_id,u.user_id,u.user_id,id).all(); return ok({exams:rows.results,capabilities:{can_manage:canManage,can_monitor:canMonitor,can_grade:canGrade}});
  }
  if(examsMatch && method==='POST'){
    const u=await requireUser(request,env); const id=examsMatch[1]; const isAssessmentAdmin=['school_admin','super_admin'].includes(u.role);if(isAssessmentAdmin)await requireClassOrganizationAccess(request,env,u,id);else await requireClassMember(env,id,u.user_id);const org=await classOrganization(env,id);if(!isAssessmentAdmin&&!(await hasEffectivePermission(env,u,org,'assessment.manage')))return bad('Bạn không có quyền tạo hoặc quản lý bài đánh giá.',403);
    const b=await request.json(); const requestedType=str(b.assessment_type)||'class_test'; const systemTypes=['official_exam','volunteer_evaluation','selection','competition']; if(systemTypes.includes(requestedType)&&!['school_admin','super_admin'].includes(u.role))return bad('Giáo viên/TNV chỉ được tạo đề kiểm tra cấp lớp. Loại đánh giá cấp hệ thống do quản trị viên tạo.',403); const title=str(b.title), questions=Array.isArray(b.questions)?b.questions.slice(0,300):[]; if(!title)return bad('Tên bài kiểm tra không được để trống.'); if(!questions.length)return bad('Bài kiểm tra cần ít nhất một câu hỏi.'); const clean=questions.map(q=>({id:str(q.id)||crypto.randomUUID(),type:['mcq','truefalse','short','essay','fill','multi','matching','ordering'].includes(q.type)?q.type:'mcq',question:str(q.question).slice(0,3000),options:Array.isArray(q.options)?q.options.slice(0,8).map(x=>str(x).slice(0,500)):[],answer:str(q.answer).slice(0,1000),points:Math.max(.25,Math.min(100,Number(q.points||1)))})).filter(q=>q.question); if(!clean.length)return bad('Không có câu hỏi hợp lệ.'); const eid=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO exams(id,class_id,title,instructions,duration_minutes,strict_mode,question_json,status,created_by,created_at,opens_at,closes_at,max_attempts,show_score,fullscreen_required,terminate_on_exit,assessment_type,assessment_label,center_label,time_limit_enabled,public_access,public_token,hide_schedule,require_email_verify,shuffle_questions,shuffle_options,updated_at) VALUES(?,?,?,?,?,?,?,'draft',?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(eid,id,title,str(b.instructions).slice(0,5000),Math.max(1,Math.min(720,Number(b.duration_minutes||30))),b.strict_mode?1:0,JSON.stringify(clean),u.user_id,str(b.opens_at)||null,str(b.closes_at)||null,Math.max(1,Math.min(10,Number(b.max_attempts||1))),b.show_score===false?0:1,b.fullscreen_required?1:0,b.terminate_on_exit?1:0,['official_exam','class_test','volunteer_evaluation','selection','competition','survey','custom'].includes(requestedType)?requestedType:'class_test',str(b.assessment_label).slice(0,120)||({official_exam:'Kỳ thi chính thức',class_test:'Kiểm tra lớp học',volunteer_evaluation:'Đánh giá TNV',selection:'Tuyển chọn / Sát hạch',competition:'Cuộc thi kiến thức',survey:'Khảo sát',custom:'Đánh giá tùy chỉnh'}[str(b.assessment_type)]||'Kiểm tra lớp học'),str(b.center_label).slice(0,120)||'Trung tâm Đánh giá',b.time_limit_enabled===false?0:1,b.public_access?1:0,b.public_access?crypto.randomUUID().replaceAll('-',''):null,b.hide_schedule?1:0,b.require_email_verify?1:0,b.shuffle_questions?1:0,b.shuffle_options?1:0).run(); await env.DB.prepare(`UPDATE exams SET blueprint_json=?,result_policy=?,scope_level=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(str(b.blueprint_json)||'{}',['score_after_submit','status_only','publish_later','full_review_after_close'].includes(str(b.result_policy))?str(b.result_policy):'score_after_submit',isAssessmentAdmin&&b.scope_level==='system'?'system':'class',eid).run(); const created=await env.DB.prepare(`SELECT public_token FROM exams WHERE id=?`).bind(eid).first();ctx?.waitUntil?.(recordAnalytics(env,org,'assessment.created',{userId:u.user_id,entityType:'exam',entityId:eid})); return ok({id:eid,status:'draft',public_token:created?.public_token||null});
  }


  const manageExam=path.match(/^\/api\/exams\/([^/]+)$/);
  if(manageExam && method==='DELETE'){
    const u=await requireUser(request,env);const e=await env.DB.prepare(`SELECT id,class_id,created_by,status,version_no FROM exams WHERE id=?`).bind(manageExam[1]).first();if(!e)return bad('Không tìm thấy bài đánh giá.',404);const org=await classOrganization(env,e.class_id);if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,e.class_id);else if(e.created_by!==u.user_id&&!(await hasEffectivePermission(env,u,org,'assessment.manage')))return bad('Bạn không có quyền quản lý bài đánh giá này.',403);const used=await env.DB.prepare(`SELECT COUNT(*) n FROM exam_attempts WHERE exam_id=?`).bind(e.id).first();const guests=await env.DB.prepare(`SELECT COUNT(*) n FROM exam_guest_attempts WHERE exam_id=?`).bind(e.id).first();if(Number(used?.n||0)+Number(guests?.n||0)>0){await env.DB.prepare(`UPDATE exams SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(e.id).run();return ok({archived:true});}await env.DB.prepare(`DELETE FROM exams WHERE id=?`).bind(e.id).run();return ok({deleted:true});
  }
  if(manageExam && method==='PATCH'){
    const u=await requireUser(request,env);const e=await env.DB.prepare(`SELECT id,class_id,created_by,status,version_no FROM exams WHERE id=?`).bind(manageExam[1]).first();if(!e)return bad('Không tìm thấy bài đánh giá.',404);const org=await classOrganization(env,e.class_id);if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,e.class_id);else if(e.created_by!==u.user_id&&!(await hasEffectivePermission(env,u,org,'assessment.manage')))return bad('Bạn không có quyền quản lý bài đánh giá này.',403);const b=await request.json();if(e.status==='published'&&b.force_open===true){await env.DB.prepare(`UPDATE exams SET opens_at=NULL,closes_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(e.id).run();await env.DB.prepare(`INSERT INTO exam_audit_log(id,exam_id,attempt_id,actor_user_id,event_type,detail_json) VALUES(?,?,NULL,?,?,?)`).bind(crypto.randomUUID(),e.id,u.user_id,'exam.force_open',JSON.stringify({previous_status:e.status})).run();return ok({updated:true,status:'published',force_open:true});}const status=['draft','review','approved','published','closed','archived'].includes(str(b.status))?str(b.status):null;if(status&&status!==e.status){const allowed={draft:['review','archived'],review:['draft','approved','archived'],approved:['draft','published','archived'],published:['closed','archived'],closed:['archived'],archived:[]};if(!(allowed[e.status]||[]).includes(status))return bad('Chuyển trạng thái kỳ đánh giá không hợp lệ.',409,{from:e.status,to:status});await env.DB.prepare(`UPDATE exams SET status=?,version_no=COALESCE(version_no,1)+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,e.id).run();await env.DB.prepare(`INSERT INTO exam_audit_log(id,exam_id,attempt_id,actor_user_id,event_type,detail_json) VALUES(?,?,NULL,?,?,?)`).bind(crypto.randomUUID(),e.id,u.user_id,'exam.status_changed',JSON.stringify({from:e.status,to:status})).run();}if(b.publish_results===true)await env.DB.prepare(`UPDATE exams SET result_policy='score_after_submit',show_score=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(e.id).run();return ok({updated:true,status:status||e.status});
  }


  const examSections=path.match(/^\/api\/exams\/([^/]+)\/sections(?:\/([^/]+))?$/);
  if(examSections && method==='GET'){
    const u=await requireUser(request,env),e=await env.DB.prepare(`SELECT id,class_id,created_by,status FROM exams WHERE id=?`).bind(examSections[1]).first();if(!e)return bad('Không tìm thấy kỳ đánh giá.',404);const org=await classOrganization(env,e.class_id);if(['super_admin','school_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,e.class_id);else if(e.created_by!==u.user_id&&!(await hasEffectivePermission(env,u,org,'assessment.view')))await requireClassMember(env,e.class_id,u.user_id);const rows=await env.DB.prepare(`SELECT * FROM assessment_sections WHERE exam_id=? ORDER BY position,id`).bind(e.id).all();return ok({sections:rows.results||[]});
  }
  if(examSections && method==='POST'){
    const u=await requireUser(request,env),e=await env.DB.prepare(`SELECT id,class_id,created_by,status FROM exams WHERE id=?`).bind(examSections[1]).first();if(!e)return bad('Không tìm thấy kỳ đánh giá.',404);const org=await classOrganization(env,e.class_id);if(!['super_admin','school_admin'].includes(u.role)&&e.created_by!==u.user_id&&!(await hasEffectivePermission(env,u,org,'assessment.manage')))return bad('Không có quyền chỉnh cấu trúc đề.',403);if(e.status!=='draft')return bad('Chỉ được chỉnh cấu trúc khi đề ở trạng thái nháp.',409);const b=await request.json(),sid=crypto.randomUUID();await env.DB.prepare(`INSERT INTO assessment_sections(id,exam_id,title,instructions,position,points,time_limit_minutes,navigation_mode) VALUES(?,?,?,?,?,?,?,?)`).bind(sid,e.id,str(b.title).slice(0,180)||'Phần mới',str(b.instructions).slice(0,3000),Math.max(0,Number(b.position||0)),Number.isFinite(Number(b.points))?Number(b.points):null,Number.isFinite(Number(b.time_limit_minutes))?Math.max(1,Number(b.time_limit_minutes)):null,['free','linear'].includes(str(b.navigation_mode))?str(b.navigation_mode):'free').run();return ok({id:sid});
  }
  if(examSections && examSections[2] && method==='DELETE'){
    const u=await requireUser(request,env),e=await env.DB.prepare(`SELECT id,class_id,created_by,status FROM exams WHERE id=?`).bind(examSections[1]).first();if(!e)return bad('Không tìm thấy kỳ đánh giá.',404);const org=await classOrganization(env,e.class_id);if(!['super_admin','school_admin'].includes(u.role)&&e.created_by!==u.user_id&&!(await hasEffectivePermission(env,u,org,'assessment.manage')))return bad('Không có quyền chỉnh cấu trúc đề.',403);if(e.status!=='draft')return bad('Chỉ được chỉnh cấu trúc khi đề ở trạng thái nháp.',409);await env.DB.prepare(`DELETE FROM assessment_sections WHERE id=? AND exam_id=?`).bind(examSections[2],e.id).run();return ok({deleted:true});
  }

  const attemptAppeals=path.match(/^\/api\/exam-attempts\/([^/]+)\/appeals$/);
  if(attemptAppeals && method==='GET'){
    const u=await requireUser(request,env);const a=await env.DB.prepare(`SELECT id,user_id FROM exam_attempts WHERE id=?`).bind(attemptAppeals[1]).first();if(!a)return bad('Không tìm thấy bài làm.',404);if(a.user_id!==u.user_id&&!['super_admin','school_admin'].includes(u.role))return bad('Không có quyền.',403);const rows=await env.DB.prepare(`SELECT id,attempt_id,user_id,reason,status,resolution,resolved_by,created_at,resolved_at FROM assessment_appeals WHERE attempt_id=? ORDER BY created_at DESC`).bind(a.id).all();return ok({appeals:rows.results||[]});
  }
  if(attemptAppeals && method==='POST'){
    const u=await requireUser(request,env),a=await env.DB.prepare(`SELECT id,user_id,status FROM exam_attempts WHERE id=? AND user_id=?`).bind(attemptAppeals[1],u.user_id).first();if(!a)return bad('Không tìm thấy bài làm.',404);if(!['submitted','graded'].includes(a.status))return bad('Bài làm chưa đủ điều kiện phúc khảo.',409);const b=await request.json(),reason=str(b.reason).slice(0,4000);if(reason.length<10)return bad('Vui lòng nêu rõ lý do phúc khảo.');const existing=await env.DB.prepare(`SELECT id FROM assessment_appeals WHERE attempt_id=? AND user_id=? AND status IN ('open','reviewing') LIMIT 1`).bind(a.id,u.user_id).first();if(existing)return bad('Đã có yêu cầu phúc khảo đang được xử lý.',409);const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO assessment_appeals(id,attempt_id,user_id,reason,status) VALUES(?,?,?,?,'open')`).bind(id,a.id,u.user_id,reason).run();return ok({id,status:'open'});
  }
  if(path==='/api/admin/assessment-appeals' && method==='GET'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin'],'assessment.grade');const org=await requireOrganizationContext(request,env,u);const rows=await env.DB.prepare(`SELECT ap.*,e.title exam_title,u.full_name candidate_name FROM assessment_appeals ap JOIN exam_attempts a ON a.id=ap.attempt_id JOIN exams e ON e.id=a.exam_id JOIN classes c ON c.id=e.class_id JOIN users u ON u.id=ap.user_id WHERE COALESCE(c.organization_id,'sky-first')=? ORDER BY CASE ap.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,ap.created_at DESC LIMIT 300`).bind(org).all();return ok({appeals:rows.results||[]});
  }

  const adminAppeal=path.match(/^\/api\/admin\/assessment-appeals\/([^/]+)$/);
  if(adminAppeal && method==='PATCH'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin'],'assessment.grade');const b=await request.json(),status=['reviewing','resolved','rejected'].includes(str(b.status))?str(b.status):'reviewing';await env.DB.prepare(`UPDATE assessment_appeals SET status=?,resolution=?,resolved_by=?,resolved_at=CASE WHEN ? IN ('resolved','rejected') THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id=?`).bind(status,str(b.resolution).slice(0,4000),u.user_id,status,adminAppeal[1]).run();return ok({updated:true,status});
  }

  const startExam=path.match(/^\/api\/exams\/([^/]+)\/start$/);
  if(startExam && method==='POST'){
    const u=await requireUser(request,env); const eid=startExam[1]; const e=await env.DB.prepare(`SELECT * FROM exams WHERE id=? AND status='published'`).bind(eid).first(); if(!e)return bad('Không tìm thấy bài kiểm tra.'); await requireClassMember(env,e.class_id,u.user_id); const now=Date.now(),openMs=examTimeMs(e.opens_at),closeMs=examTimeMs(e.closes_at); if(openMs&&now<openMs)return bad('Kỳ thi chưa mở.',409); if(closeMs&&now>closeMs)return bad('Kỳ thi đã đóng.',409);
    const existing=await activeExam(u.user_id,env); if(existing)return bad('Bạn đang có một phiên kiểm tra khác đang hoạt động.',409,existing); const cnt=await env.DB.prepare(`SELECT COUNT(*) n FROM exam_attempts WHERE exam_id=? AND user_id=? AND status IN ('submitted','expired','terminated')`).bind(eid,u.user_id).first(); if(Number(cnt?.n||0)>=Number(e.max_attempts||1))return bad('Bạn đã sử dụng hết số lượt thi.',409);
    const snapshot=examQuestionSnapshot(e.question_json,e.shuffle_questions,e.shuffle_options);const id=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO exam_attempts(id,exam_id,user_id,status,started_at,answers_json,event_log_json,question_snapshot_json) VALUES(?,?,?,'in_progress',CURRENT_TIMESTAMP,'{}','[]',?)`).bind(id,eid,u.user_id,snapshot).run(); const candidate=await env.DB.prepare(`SELECT full_name,email,sfn_id FROM users WHERE id=?`).bind(u.user_id).first(); if(candidate?.email){const html=emailShell({title:'Thông báo từ Trung tâm Đánh giá Sky First',preheader:`Đã bắt đầu ${e.title}`,body:`<p>Xin chào <b>${htmlEsc(candidate.full_name||'')}</b>,</p><p>Hệ thống ghi nhận bạn đã tham gia dự thi.</p><div style="padding:18px;border:1px solid #dce8f2;border-radius:16px"><b>Bài đánh giá:</b> ${htmlEsc(e.title)}<br><b>Mã học viên/Mã dự thi:</b> ${htmlEsc(candidate.sfn_id||'')}<br><b>Trạng thái:</b> Đã bắt đầu dự thi</div>`,env});ctx?.waitUntil?.(sendMail(env,candidate.email,`[SLC] Đã tham gia dự thi – ${e.title}`,html));} const org=await classOrganization(env,e.class_id);ctx?.waitUntil?.(recordAnalytics(env,org,'assessment.started',{userId:u.user_id,entityType:'exam',entityId:e.id}));return ok({attempt_id:id,exam:{id:e.id,title:e.title,instructions:e.instructions,duration_minutes:e.duration_minutes,time_limit_enabled:e.time_limit_enabled!==0,strict_mode:e.strict_mode,fullscreen_required:e.fullscreen_required,terminate_on_exit:e.terminate_on_exit,show_score:e.show_score,assessment_type:e.assessment_type,assessment_label:e.assessment_label,center_label:e.center_label,questions:publicExamQuestions(snapshot)}});
  }

  const launchExam=path.match(/^\/api\/exam-attempts\/([^/]+)\/launch$/);
  if(launchExam && method==='POST'){
    const u=await requireUser(request,env); const a=await env.DB.prepare(`SELECT id,user_id,status FROM exam_attempts WHERE id=? AND user_id=?`).bind(launchExam[1],u.user_id).first();
    if(!a||a.status!=='in_progress')return bad('Phiên thi không còn hoạt động.',409);
    const raw=randomToken(32),hash=await sha256Text(raw),exp=new Date(Date.now()+5*60*1000).toISOString();
    await env.DB.prepare(`INSERT INTO exam_launch_tokens(token_hash,user_id,attempt_id,expires_at,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(hash,u.user_id,a.id,exp).run();
    const base=str(env.EXAM_URL||'https://exam.skyfirst.io.vn').replace(/\/$/,''); return ok({launch_url:`${base}/?launch=${encodeURIComponent(raw)}`});
  }

  if(path==='/api/public/exam-launch/redeem' && method==='POST'){
    const b=await request.json(),raw=str(b.launch_token); if(!raw)return bad('Thiếu mã khởi chạy.',400);
    const hash=await sha256Text(raw); const row=await env.DB.prepare(`SELECT token_hash,user_id,attempt_id,expires_at,used_at FROM exam_launch_tokens WHERE token_hash=?`).bind(hash).first();
    if(!row||row.used_at||Date.parse(row.expires_at)<=Date.now())return bad('Mã khởi chạy không hợp lệ hoặc đã hết hạn.',401);
    const access=randomToken(32),accessHash=await sha256Text(access),exp=new Date(Date.now()+12*60*60*1000).toISOString();
    await env.DB.batch([env.DB.prepare(`UPDATE exam_launch_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND used_at IS NULL`).bind(hash),env.DB.prepare(`INSERT INTO exam_access_tokens(token_hash,user_id,attempt_id,expires_at,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(accessHash,row.user_id,row.attempt_id,exp)]);
    return ok({attempt_id:row.attempt_id,access_token:access,expires_at:exp});
  }

  const saveExam=path.match(/^\/api\/exam-attempts\/([^/]+)\/save$/);
  if(saveExam && method==='POST'){
    const u=await requireExamUser(request,env,saveExam[1]); const b=await request.json(); const a=await env.DB.prepare(`SELECT a.*,e.duration_minutes,e.time_limit_enabled FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.user_id=? AND a.status='in_progress'`).bind(saveExam[1],u.user_id).first(); if(!a)return bad('Phiên thi không còn hoạt động.',409);
    const deadline=a.time_limit_enabled===0?null:new Date(a.started_at).getTime()+(Number(a.duration_minutes||60)+Number(a.extra_time_minutes||0))*60000;
    if(deadline&&Date.now()>deadline)return bad('Đã hết thời gian làm bài. Hệ thống đã khóa thay đổi mới.',409,{status:'time_locked'});
    const events=Array.isArray(b.events)?b.events.slice(-500):JSON.parse(a.event_log_json||'[]');
    const clientRev=Number(b.revision??a.answer_revision??0);if(clientRev!==Number(a.answer_revision||0))return bad('Bài làm trên máy chủ đã có phiên bản mới hơn.',409,{code:'REVISION_CONFLICT',answer_revision:Number(a.answer_revision||0)});const nextRev=Number(a.answer_revision||0)+1;const wr=await env.DB.prepare(`UPDATE exam_attempts SET answers_json=?,event_log_json=?,answer_revision=?,last_saved_at=CURRENT_TIMESTAMP WHERE id=? AND answer_revision=?`).bind(JSON.stringify(b.answers||{}),JSON.stringify(events),nextRev,a.id,Number(a.answer_revision||0)).run();if(!Number(wr?.meta?.changes||0))return bad('Bài làm vừa được cập nhật ở một phiên khác.',409,{code:'REVISION_CONFLICT'});await env.DB.prepare(`INSERT OR IGNORE INTO assessment_answer_revisions(id,attempt_id,source,revision,answers_json,events_json,accepted_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),a.id,'internal',nextRev,JSON.stringify(b.answers||{}),JSON.stringify(events)).run().catch(()=>{}); return ok({saved_at:nowIso(),answer_revision:nextRev});
  }

  const submitExam=path.match(/^\/api\/exam-attempts\/([^/]+)\/submit$/);
  if(submitExam && method==='POST'){
    const u=await requireExamUser(request,env,submitExam[1]); const b=await request.json(); const a=await env.DB.prepare(`SELECT a.*,COALESCE(a.question_snapshot_json,e.question_json) question_json,e.duration_minutes,e.time_limit_enabled,e.show_score,e.result_policy,e.closes_at,e.status exam_status FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.user_id=? AND a.status='in_progress'`).bind(submitExam[1],u.user_id).first(); if(!a)return bad('Phiên thi không còn hoạt động.',409);
    const deadline=a.time_limit_enabled===0?null:new Date(a.started_at).getTime()+(Number(a.duration_minutes||60)+Number(a.extra_time_minutes||0))*60000; if(deadline&&Date.now()>deadline+120000){await env.DB.prepare(`UPDATE exam_attempts SET status='expired',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(a.id).run();return bad('Phiên thi đã quá thời gian nộp bài.',409,{status:'expired'});}
    const qs=JSON.parse(a.question_json||'[]'), ans=(deadline&&Date.now()>deadline)?safeJson(a.answers_json,{}):(b.answers||{}); const scored=autoScoreQuestions(qs,ans);let score=scored.score,max=scored.max;
    await env.DB.prepare(`UPDATE exam_attempts SET answers_json=?,event_log_json=?,score=?,max_score=?,status='submitted',submitted_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(ans),JSON.stringify(b.events||[]),score,max,a.id).run();await seedManualGrades(env,a.id,scored.manual); const candidate=await env.DB.prepare(`SELECT u.full_name,u.email,u.sfn_id,e.title,e.class_id FROM exam_attempts aa JOIN users u ON u.id=aa.user_id JOIN exams e ON e.id=aa.exam_id WHERE aa.id=?`).bind(a.id).first(); const receipt=`SLC-${a.id.slice(0,8).toUpperCase()}`;await env.DB.prepare(`INSERT INTO assessment_receipts(id,attempt_id,receipt_code,payload_json,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(attempt_id) DO UPDATE SET receipt_code=excluded.receipt_code,payload_json=excluded.payload_json`).bind(crypto.randomUUID(),a.id,receipt,JSON.stringify({attempt_id:a.id,exam_id:a.exam_id,status:'submitted'})).run().catch(()=>{}); if(candidate?.email){const html=emailShell({title:'Xác nhận hoàn thành bài đánh giá',preheader:`Mã xác nhận ${receipt}`,body:`<p>Xin chào <b>${htmlEsc(candidate.full_name||'')}</b>,</p><p>Trung tâm Đánh giá Sky First xác nhận bài làm của bạn đã được ghi nhận.</p><div style="padding:18px;border:1px solid #dce8f2;border-radius:16px"><b>Bài đánh giá:</b> ${htmlEsc(candidate.title||'')}<br><b>Mã dự thi:</b> ${htmlEsc(candidate.sfn_id||'')}<br><b>Mã xác nhận:</b> ${receipt}<br><b>Trạng thái:</b> ${scored.manual.length?'Đã nộp · chờ chấm tự luận':'Đã nộp thành công'}</div>`,env});ctx?.waitUntil?.(sendMail(env,candidate.email,`[SLC] Xác nhận hoàn thành bài đánh giá – ${candidate.title||''}`,html));} const org=await classOrganization(env,candidate?.class_id);ctx?.waitUntil?.(recordAnalytics(env,org,'assessment.submitted',{userId:u.user_id,entityType:'exam',entityId:a.exam_id,value:score}));ctx?.waitUntil?.(runAutomations(env,org,'assessment.submitted',{user_id:u.user_id,email:candidate?.email,title:'Bài đánh giá đã được nộp',message:`${candidate?.full_name||'Thí sinh'} đã nộp ${candidate?.title||'bài đánh giá'}.`,link:'/#admin-assessments'},ctx));{const visible=assessmentScoreVisible({...a,status:a.exam_status})&&!scored.manual.length;return ok({score:visible?score:null,max_score:visible?max:null,show_score:visible,pending_manual:scored.manual.length,receipt_code:receipt});}
  }

  if(path==='/api/admin/assessment-center' && method==='GET'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin','account_admin'],'assessment.view');const org=await requireOrganizationContext(request,env,u);
    const rows=await env.DB.prepare(`SELECT e.id,e.class_id,e.title,e.instructions,e.duration_minutes,e.time_limit_enabled,e.strict_mode,e.status,e.opens_at,e.closes_at,e.max_attempts,e.show_score,e.fullscreen_required,e.terminate_on_exit,e.assessment_type,e.assessment_label,e.center_label,e.public_access,e.public_token,e.hide_schedule,e.result_policy,e.require_email_verify,e.created_at,e.updated_at,c.name class_name,(SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id=e.id) internal_attempts,(SELECT COUNT(*) FROM exam_guest_attempts g WHERE g.exam_id=e.id) guest_attempts,(SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id=e.id AND a.status='in_progress') active_internal,(SELECT COUNT(*) FROM exam_guest_attempts g WHERE g.exam_id=e.id AND g.status='in_progress') active_guest FROM exams e JOIN classes c ON c.id=e.class_id WHERE COALESCE(c.organization_id,'sky-first')=? ORDER BY COALESCE(e.updated_at,e.created_at) DESC`).bind(org).all();
    const bank=await env.DB.prepare(`SELECT COUNT(*) n FROM assessment_question_bank WHERE COALESCE(organization_id,'sky-first')=? AND status='active'`).bind(org).first().catch(()=>({n:0})); const pending=await env.DB.prepare(`SELECT COUNT(*) n FROM assessment_manual_grades mg WHERE mg.status!='published' AND (EXISTS(SELECT 1 FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN classes c ON c.id=e.class_id WHERE a.id=mg.attempt_id AND COALESCE(c.organization_id,'sky-first')=?) OR EXISTS(SELECT 1 FROM exam_guest_attempts g JOIN exams e ON e.id=g.exam_id JOIN classes c ON c.id=e.class_id WHERE g.id=mg.attempt_id AND COALESCE(c.organization_id,'sky-first')=?))`).bind(org,org).first().catch(()=>({n:0})); const incidents=await env.DB.prepare(`SELECT COUNT(*) n FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN classes c ON c.id=e.class_id WHERE COALESCE(c.organization_id,'sky-first')=? AND a.status IN ('terminated','expired')`).bind(org).first().catch(()=>({n:0})); return ok({exams:rows.results||[],viewer_role:u.role,organization_id:org,question_bank_count:Number(bank?.n||0),pending_grades:Number(pending?.n||0),incidents:Number(incidents?.n||0)});
  }

  if(path==='/api/admin/assessment-question-bank' && method==='GET'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin','account_admin','teacher','assistant'],'assessment.view');const org=await requireOrganizationContext(request,env,u);const canSeeAnswers=['super_admin','school_admin'].includes(u.role)||await hasEffectivePermission(env,u,org,'assessment.manage')||await hasEffectivePermission(env,u,org,'assessment.grade');const rows=await env.DB.prepare(`SELECT * FROM assessment_question_bank WHERE COALESCE(organization_id,'sky-first')=? AND status!='deleted' ORDER BY updated_at DESC LIMIT 500`).bind(org).all();return ok({questions:(rows.results||[]).map(x=>{const q={...x,options:safeJson(x.options_json,[]),tags:safeJson(x.tags_json,[])};if(canSeeAnswers){q.answer=safeJson(x.answer_json,x.answer_json);q.explanation=x.explanation}else{delete q.answer_json;delete q.explanation}return q})});
  }
  if(path==='/api/admin/assessment-question-bank' && method==='POST'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin'],'assessment.manage');const org=await requireOrganizationContext(request,env,u);const b=await request.json(),type=['mcq','multi','truefalse','fill','short','essay','matching','ordering'].includes(str(b.type))?str(b.type):'mcq',question=str(b.question).slice(0,3000);if(!question)return bad('Nội dung câu hỏi không được để trống.');const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO assessment_question_bank(id,organization_id,owner_user_id,subject,grade_level,topic,lesson,difficulty,type,question,options_json,answer_json,explanation,points,tags_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,org,u.user_id,str(b.subject).slice(0,120),str(b.grade_level).slice(0,80),str(b.topic).slice(0,160),str(b.lesson).slice(0,160),['easy','medium','hard'].includes(str(b.difficulty))?str(b.difficulty):'medium',type,question,JSON.stringify(Array.isArray(b.options)?b.options.slice(0,20):[]),JSON.stringify(b.answer??''),str(b.explanation).slice(0,4000),Math.max(.25,Math.min(100,Number(b.points||1))),JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,30):[])).run();return ok({id});
  }
  const bankItem=path.match(/^\/api\/admin\/assessment-question-bank\/([^/]+)$/);
  if(bankItem && method==='PATCH'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin'],'assessment.manage');const org=await requireOrganizationContext(request,env,u);const current=await env.DB.prepare(`SELECT * FROM assessment_question_bank WHERE id=? AND COALESCE(organization_id,'sky-first')=?`).bind(bankItem[1],org).first();if(!current)return bad('Không tìm thấy câu hỏi.',404);const b=await request.json();const type=['mcq','multi','truefalse','fill','short','essay','matching','ordering'].includes(str(b.type))?str(b.type):current.type;const requestedStatus=['draft','review','approved','active','retired'].includes(str(b.status))?str(b.status):current.status;const bankFlow={draft:['review','retired'],review:['draft','approved','retired'],approved:['active','draft','retired'],active:['retired'],retired:['draft']};if(requestedStatus!==current.status&&!(bankFlow[current.status]||[]).includes(requestedStatus))return bad('Chuyển trạng thái câu hỏi không hợp lệ.',409,{from:current.status,to:requestedStatus});await env.DB.prepare(`UPDATE assessment_question_bank SET subject=?,grade_level=?,topic=?,lesson=?,difficulty=?,type=?,question=?,options_json=?,answer_json=?,explanation=?,points=?,tags_json=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(str(b.subject??current.subject).slice(0,120),str(b.grade_level??current.grade_level).slice(0,80),str(b.topic??current.topic).slice(0,160),str(b.lesson??current.lesson).slice(0,160),['easy','medium','hard'].includes(str(b.difficulty))?str(b.difficulty):current.difficulty,type,str(b.question??current.question).slice(0,3000),JSON.stringify(Array.isArray(b.options)?b.options:safeJson(current.options_json,[])),JSON.stringify(b.answer!==undefined?b.answer:safeJson(current.answer_json,current.answer_json)),str(b.explanation??current.explanation).slice(0,4000),Math.max(.25,Math.min(100,Number((b.points??current.points)||1))),JSON.stringify(Array.isArray(b.tags)?b.tags:safeJson(current.tags_json,[])),requestedStatus,current.id).run();await adminLog(env,u.user_id,'assessment.bank_update',{question_id:current.id,from_status:current.status,to_status:requestedStatus});return ok({updated:true,status:requestedStatus});
  }
  if(bankItem && method==='DELETE'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin'],'assessment.manage');const org=await requireOrganizationContext(request,env,u);await env.DB.prepare(`UPDATE assessment_question_bank SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=? AND COALESCE(organization_id,'sky-first')=?`).bind(bankItem[1],org).run();return ok({deleted:true});
  }
  if(path==='/api/admin/assessment-manual-grading' && method==='GET'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin','account_admin'],'assessment.grade');const org=await requireOrganizationContext(request,env,u);const rows=await env.DB.prepare(`SELECT mg.*,e.title exam_title,c.name class_name,'internal' source,u.full_name candidate_name,u.sfn_id candidate_code,a.answers_json,COALESCE(a.question_snapshot_json,e.question_json) question_json FROM assessment_manual_grades mg JOIN exam_attempts a ON a.id=mg.attempt_id JOIN exams e ON e.id=a.exam_id JOIN classes c ON c.id=e.class_id JOIN users u ON u.id=a.user_id WHERE COALESCE(c.organization_id,'sky-first')=? UNION ALL SELECT mg.*,e.title exam_title,c.name class_name,'guest' source,g.full_name candidate_name,g.candidate_code,g.answers_json,COALESCE(g.question_snapshot_json,e.question_json) question_json FROM assessment_manual_grades mg JOIN exam_guest_attempts g ON g.id=mg.attempt_id JOIN exams e ON e.id=g.exam_id JOIN classes c ON c.id=e.class_id WHERE COALESCE(c.organization_id,'sky-first')=? ORDER BY updated_at DESC LIMIT 500`).bind(org,org).all();const items=(rows.results||[]).map(x=>{const qs=safeJson(x.question_json,[]),answers=safeJson(x.answers_json,{}),q=qs.find(z=>String(z.id)===String(x.question_id))||{};return {...x,question:q.question||'',points:Number(q.points||1),answer:answers[x.question_id]??''}});return ok({items});
  }
  const manualGrade=path.match(/^\/api\/admin\/assessment-manual-grading\/([^/]+)$/);
  if(manualGrade && method==='PATCH'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin'],'assessment.grade');const org=await requireOrganizationContext(request,env,u);const row=await env.DB.prepare(`SELECT mg.*,CASE WHEN a.id IS NOT NULL THEN 'internal' ELSE 'guest' END source,COALESCE(a.exam_id,g.exam_id) exam_id FROM assessment_manual_grades mg LEFT JOIN exam_attempts a ON a.id=mg.attempt_id LEFT JOIN exam_guest_attempts g ON g.id=mg.attempt_id WHERE mg.id=?`).bind(manualGrade[1]).first();if(!row)return bad('Không tìm thấy mục chấm.',404);const ex=await env.DB.prepare(`SELECT e.class_id,COALESCE(c.organization_id,'sky-first') organization_id,COALESCE(a.question_snapshot_json,g.question_snapshot_json,e.question_json) question_json FROM exams e JOIN classes c ON c.id=e.class_id LEFT JOIN exam_attempts a ON a.id=? LEFT JOIN exam_guest_attempts g ON g.id=? WHERE e.id=?`).bind(row.attempt_id,row.attempt_id,row.exam_id).first();if(!ex||ex.organization_id!==org)return bad('Không có quyền.',403);const q=safeJson(ex.question_json,[]).find(z=>String(z.id)===String(row.question_id));if(!q)return bad('Không tìm thấy câu tự luận.',404);const b=await request.json(),score=Number(b.score);if(!Number.isFinite(score)||score<0||score>Number(q.points||1))return bad('Điểm tự luận không hợp lệ.');await env.DB.prepare(`UPDATE assessment_manual_grades SET grader_user_id=?,score=?,feedback=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(u.user_id,score,str(b.feedback).slice(0,5000),b.publish===false?'draft':'published',row.id).run();const total=await recomputeAttemptScore(env,row.attempt_id,row.source);await recordAnalytics(env,org,'assessment.manual_graded',{userId:u.user_id,entityType:'attempt',entityId:row.attempt_id,value:score});return ok({updated:true,total});
  }
  if(path==='/api/admin/assessment-candidates' && method==='GET'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin','account_admin'],'assessment.view');const org=await requireOrganizationContext(request,env,u);const rows=await env.DB.prepare(`SELECT a.id,e.title exam_title,'internal' source,u.full_name,u.email,u.sfn_id candidate_code,a.status,a.started_at,a.submitted_at,a.score,a.max_score FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN classes c ON c.id=e.class_id JOIN users u ON u.id=a.user_id WHERE COALESCE(c.organization_id,'sky-first')=? UNION ALL SELECT g.id,e.title,'guest',g.full_name,g.email,g.candidate_code,g.status,g.started_at,g.submitted_at,g.score,g.max_score FROM exam_guest_attempts g JOIN exams e ON e.id=g.exam_id JOIN classes c ON c.id=e.class_id WHERE COALESCE(c.organization_id,'sky-first')=? ORDER BY started_at DESC LIMIT 1000`).bind(org,org).all();return ok({candidates:rows.results||[]});
  }
  if(path==='/api/admin/assessment-audit' && method==='GET'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin','account_admin'],'assessment.view');const org=await requireOrganizationContext(request,env,u);const rows=await env.DB.prepare(`SELECT l.*,e.title exam_title FROM exam_audit_log l JOIN exams e ON e.id=l.exam_id JOIN classes c ON c.id=e.class_id WHERE COALESCE(c.organization_id,'sky-first')=? ORDER BY l.created_at DESC LIMIT 500`).bind(org).all();return ok({events:rows.results||[]});
  }

  if(path==='/api/exam-center' && method==='GET'){
    const u=await requireUser(request,env); const rows=await env.DB.prepare(`SELECT e.id,e.title,e.instructions,e.duration_minutes,e.time_limit_enabled,e.strict_mode,e.status,e.opens_at,e.closes_at,e.max_attempts,e.show_score,e.result_policy,e.fullscreen_required,e.terminate_on_exit,e.assessment_type,e.assessment_label,e.center_label,c.name class_name,a.id attempt_id,a.status attempt_status,a.score,a.max_score,a.closed_reason,(SELECT COUNT(*) FROM assessment_manual_grades mg WHERE mg.attempt_id=a.id AND mg.status!='published') pending_manual FROM exams e JOIN classes c ON c.id=e.class_id JOIN class_members cm ON cm.class_id=e.class_id AND cm.user_id=? AND cm.status='active' LEFT JOIN exam_attempts a ON a.id=(SELECT aa.id FROM exam_attempts aa WHERE aa.exam_id=e.id AND aa.user_id=? ORDER BY aa.started_at DESC LIMIT 1) WHERE e.status IN ('published','closed') ORDER BY COALESCE(e.opens_at,e.created_at) DESC`).bind(u.user_id,u.user_id).all(); const exams=(rows.results||[]).map(x=>{const visible=assessmentScoreVisible(x)&&Number(x.pending_manual||0)===0;return {...x,show_score:visible?1:0,score:visible?x.score:null,max_score:visible?x.max_score:null}});return ok({exams});
  }

  const adminAttempts=path.match(/^\/api\/admin\/exams\/([^/]+)\/attempts$/);
  if(adminAttempts && method==='GET'){
    const admin=await requireRoleOrPermission(request,env,['super_admin','school_admin','account_admin'],'assessment.monitor'); const eid=adminAttempts[1];const ex=await env.DB.prepare(`SELECT class_id FROM exams WHERE id=?`).bind(eid).first();if(!ex)return bad('Không tìm thấy kỳ thi.',404);await requireClassOrganizationAccess(request,env,admin,ex.class_id);
    const internal=await env.DB.prepare(`SELECT a.id,'internal' source,a.status,a.started_at,a.last_saved_at,a.submitted_at,a.closed_reason,a.score,a.max_score,a.extra_time_minutes,u.full_name,u.email,u.sfn_id candidate_code FROM exam_attempts a JOIN users u ON u.id=a.user_id WHERE a.exam_id=? ORDER BY a.started_at DESC`).bind(eid).all();
    const guest=await env.DB.prepare(`SELECT g.id,'guest' source,g.status,g.started_at,g.last_saved_at,g.submitted_at,g.closed_reason,g.score,g.max_score,g.extra_time_minutes,g.full_name,g.email,g.candidate_code FROM exam_guest_attempts g WHERE g.exam_id=? ORDER BY g.started_at DESC`).bind(eid).all();
    return ok({attempts:[...(internal.results||[]),...(guest.results||[])].sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at)))});
  }
  const adminAttemptAction=path.match(/^\/api\/admin\/exam-attempts\/([^/]+)\/action$/);
  if(adminAttemptAction && method==='POST'){
    const u=await requireRoleOrPermission(request,env,['super_admin','school_admin'],'assessment.manage'); const b=await request.json(); const id=adminAttemptAction[1],source=b.source==='guest'?'guest':'internal',table=source==='guest'?'exam_guest_attempts':'exam_attempts'; const a=await env.DB.prepare(`SELECT id,exam_id,status FROM ${table} WHERE id=?`).bind(id).first(); if(!a)return bad('Không tìm thấy lượt thi.',404);const ex=await env.DB.prepare(`SELECT class_id FROM exams WHERE id=?`).bind(a.exam_id).first();if(!ex)return bad('Không tìm thấy kỳ thi.',404);await requireClassOrganizationAccess(request,env,u,ex.class_id); const action=str(b.action),reason=str(b.reason).slice(0,500); if(!reason)return bad('Vui lòng nhập lý do thao tác.');
    if(action==='add_time'){const mins=Math.max(1,Math.min(720,Number(b.minutes||0)));await env.DB.prepare(`UPDATE ${table} SET extra_time_minutes=COALESCE(extra_time_minutes,0)+? WHERE id=?`).bind(mins,id).run();}
    else if(action==='force_submit'){const row=await env.DB.prepare(`SELECT a.answers_json,COALESCE(a.question_snapshot_json,e.question_json) question_json FROM ${table} a JOIN exams e ON e.id=a.exam_id WHERE a.id=?`).bind(id).first();const qs=safeJson(row?.question_json,[]),ans=safeJson(row?.answers_json,{}),scored=autoScoreQuestions(qs,ans);await env.DB.prepare(`UPDATE ${table} SET score=?,max_score=?,status='submitted',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(scored.score,scored.max,id).run();await seedManualGrades(env,id,scored.manual);}
    else if(action==='reopen')await env.DB.prepare(`UPDATE ${table} SET status='in_progress',started_at=CURRENT_TIMESTAMP,submitted_at=NULL,closed_reason=NULL,closed_at=NULL,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    else if(action==='invalidate')await env.DB.prepare(`UPDATE ${table} SET status='invalidated',invalidated_at=CURRENT_TIMESTAMP,closed_reason=? WHERE id=?`).bind(reason,id).run();
    else if(action==='reset'){await env.DB.prepare(`UPDATE ${table} SET status='in_progress',started_at=CURRENT_TIMESTAMP,answers_json='{}',event_log_json='[]',score=NULL,max_score=NULL,submitted_at=NULL,closed_reason=NULL,closed_at=NULL,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();await env.DB.prepare(`DELETE FROM assessment_manual_grades WHERE attempt_id=?`).bind(id).run().catch(()=>{});}
    else return bad('Thao tác không hợp lệ.');
    await env.DB.prepare(`INSERT INTO exam_audit_log(id,exam_id,attempt_id,actor_user_id,event_type,detail_json) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),a.exam_id,id,u.user_id,'admin.'+action,JSON.stringify({reason,minutes:Number(b.minutes||0),source})).run(); return ok({updated:true});
  }

  const violation=path.match(/^\/api\/exam-attempts\/([^/]+)\/violation$/);
  if(violation && method==='POST'){
    const u=await requireExamUser(request,env,violation[1]); const b=await request.json(); const a=await env.DB.prepare(`SELECT a.*,e.id exam_id,e.duration_minutes,e.time_limit_enabled,e.terminate_on_exit,e.strict_mode FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.user_id=? AND a.status='in_progress'`).bind(violation[1],u.user_id).first(); if(!a)return bad('Phiên thi không còn hoạt động.',409);const deadline=a.time_limit_enabled===0?null:new Date(a.started_at).getTime()+(Number(a.duration_minutes||60)+Number(a.extra_time_minutes||0))*60000;if(deadline&&Date.now()>=deadline){await env.DB.prepare(`UPDATE exam_attempts SET status='expired',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),last_saved_at=COALESCE(last_saved_at,CURRENT_TIMESTAMP) WHERE id=? AND status='in_progress'`).bind(a.id).run();return bad('Thời gian làm bài đã kết thúc.',409,{status:'time_locked'});} const reason=str(b.reason).slice(0,300)||'Rời chế độ giám sát'; const events=Array.isArray(b.events)?b.events.slice(-500):[]; if(!a.terminate_on_exit){await env.DB.prepare(`UPDATE exam_attempts SET answers_json=?,event_log_json=?,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(b.answers||{}),JSON.stringify(events),a.id).run();return ok({terminated:false});} await env.DB.prepare(`UPDATE exam_attempts SET answers_json=?,event_log_json=?,status='terminated',closed_reason=?,closed_at=CURRENT_TIMESTAMP,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(b.answers||{}),JSON.stringify(events),reason,a.id).run(); await env.DB.prepare(`INSERT INTO exam_audit_log(id,exam_id,attempt_id,actor_user_id,event_type,detail_json) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),a.exam_id,a.id,u.user_id,'attempt.terminated',JSON.stringify({reason})).run(); return ok({terminated:true});
  }

  const monitor=path.match(/^\/api\/exams\/([^/]+)\/monitor$/);
  if(monitor && method==='GET'){
    const u=await requireUser(request,env); const e=await env.DB.prepare(`SELECT id,class_id,title FROM exams WHERE id=?`).bind(monitor[1]).first(); if(!e)return bad('Không tìm thấy kỳ thi.',404); if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,e.class_id);else{const org=await classOrganization(env,e.class_id);if(!(await hasEffectivePermission(env,u,org,'assessment.monitor')))return bad('Bạn không có quyền giám sát kỳ đánh giá.',403);} const rows=await env.DB.prepare(`SELECT a.id,a.status,a.started_at,a.last_saved_at,a.submitted_at,a.closed_reason,a.score,a.max_score,u.sfn_id,u.full_name FROM exam_attempts a JOIN users u ON u.id=a.user_id WHERE a.exam_id=? ORDER BY a.started_at DESC`).bind(e.id).all(); return ok({exam:e,attempts:rows.results||[]});
  }

  const reopen=path.match(/^\/api\/exam-attempts\/([^/]+)\/reopen$/);
  if(reopen && method==='POST'){
    const u=await requireUser(request,env); const a=await env.DB.prepare(`SELECT a.*,e.class_id,e.id exam_id FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=?`).bind(reopen[1]).first(); if(!a)return bad('Không tìm thấy phiên thi.',404); const org=await classOrganization(env,a.class_id);if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,a.class_id);else if(!(await hasEffectivePermission(env,u,org,'assessment.manage')))return bad('Bạn không có quyền mở lại phiên thi.',403);const b=await request.json().catch(()=>({})),reason=str(b.reason).slice(0,500);if(!reason)return bad('Vui lòng nhập lý do mở lại phiên thi.'); await env.DB.prepare(`UPDATE exam_attempts SET status='in_progress',started_at=CURRENT_TIMESTAMP,submitted_at=NULL,closed_reason=NULL,closed_at=NULL,last_saved_at=CURRENT_TIMESTAMP WHERE id=?`).bind(a.id).run(); await env.DB.prepare(`INSERT INTO exam_audit_log(id,exam_id,attempt_id,actor_user_id,event_type,detail_json) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),a.exam_id,a.id,u.user_id,'attempt.reopened',JSON.stringify({reason})).run(); return ok({reopened:true});
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
    const u=await requireExamUser(request,env,examAttemptGet[1]); const a=await env.DB.prepare(`SELECT a.*,e.title,e.instructions,e.duration_minutes,e.time_limit_enabled,e.strict_mode,e.fullscreen_required,e.terminate_on_exit,e.show_score,e.result_policy,e.closes_at,e.status exam_status,e.assessment_type,e.assessment_label,e.center_label,COALESCE(a.question_snapshot_json,e.question_json) question_json FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.user_id=?`).bind(examAttemptGet[1],u.user_id).first();
    if(!a)return bad('Không tìm thấy phiên kiểm tra.',404); if(a.status!=='in_progress'){const visible=assessmentScoreVisible({...a,status:a.exam_status});return bad('Phiên kiểm tra đã kết thúc.',409,{status:a.status,score:visible?a.score:null,max_score:visible?a.max_score:null,show_score:visible});}
    const deadline=a.time_limit_enabled===0?null:new Date(a.started_at).getTime()+(Number(a.duration_minutes||60)+Number(a.extra_time_minutes||0))*60000; if(deadline&&Date.now()>=deadline){await env.DB.prepare(`UPDATE exam_attempts SET status='expired',submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='in_progress'`).bind(a.id).run();return bad('Thời gian làm bài đã kết thúc.',409,{status:'expired'});}
    return ok({attempt_id:a.id,exam:{id:a.exam_id,title:a.title,instructions:a.instructions,duration_minutes:a.duration_minutes,time_limit_enabled:a.time_limit_enabled!==0,strict_mode:a.strict_mode,fullscreen_required:a.fullscreen_required,terminate_on_exit:a.terminate_on_exit,show_score:a.show_score,assessment_type:a.assessment_type,assessment_label:a.assessment_label,center_label:a.center_label,questions:publicExamQuestions(a.question_json)},answers:JSON.parse(a.answers_json||'{}'),events:JSON.parse(a.event_log_json||'[]'),remaining_seconds:deadline?Math.max(0,Math.ceil((deadline-Date.now())/1000)):null,answer_revision:Number(a.answer_revision||0),last_saved_at:a.last_saved_at||null,server_time:nowIso(),deadline_at:deadline?new Date(deadline).toISOString():null});
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
    const u=await requireUser(request,env),classId=eventsMatch[1],isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id);const rows=await env.DB.prepare(`SELECT * FROM class_events WHERE class_id=? AND datetime(starts_at)>=datetime('now','-30 days') ORDER BY datetime(starts_at) ASC LIMIT 200`).bind(classId).all();return ok({events:rows.results||[]});
  }
  if(eventsMatch && method==='POST'){
    const u=await requireUser(request,env),classId=eventsMatch[1],isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id,['teacher','assistant']);const b=await request.json();if(!str(b.title)||!str(b.starts_at))return bad('Tên sự kiện và thời gian bắt đầu là bắt buộc.');const id=crypto.randomUUID(),type=['class','exam','deadline','other'].includes(b.event_type)?b.event_type:'class';await env.DB.prepare(`INSERT INTO class_events(id,class_id,title,details,event_type,starts_at,ends_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,classId,str(b.title).slice(0,160),str(b.details).slice(0,3000),type,str(b.starts_at),str(b.ends_at)||null,u.user_id).run();return ok({id});
  }
  const classEventItem=path.match(/^\/api\/classes\/([^/]+)\/events\/([^/]+)$/);
  if(classEventItem && ['PATCH','DELETE'].includes(method)){
    const u=await requireUser(request,env),classId=classEventItem[1],eventId=classEventItem[2],isAdmin=['school_admin','super_admin'].includes(u.role);if(isAdmin)await requireClassOrganizationAccess(request,env,u,classId);else await requireClassMember(env,classId,u.user_id,['teacher','assistant']);const current=await env.DB.prepare(`SELECT * FROM class_events WHERE id=? AND class_id=?`).bind(eventId,classId).first();if(!current)return bad('Không tìm thấy hoạt động.',404);if(method==='DELETE'){await env.DB.prepare(`DELETE FROM class_events WHERE id=? AND class_id=?`).bind(eventId,classId).run();await adminLog(env,u.user_id,'class.event_delete',{class_id:classId,event_id:eventId});return ok({deleted:true});}const b=await request.json(),title=str(b.title??current.title).slice(0,160),starts=str(b.starts_at??current.starts_at),type=['class','exam','deadline','other'].includes(str(b.event_type))?str(b.event_type):current.event_type;if(!title||!starts)return bad('Tên sự kiện và thời gian bắt đầu là bắt buộc.');await env.DB.prepare(`UPDATE class_events SET title=?,details=?,event_type=?,starts_at=?,ends_at=? WHERE id=? AND class_id=?`).bind(title,str(b.details??current.details).slice(0,3000),type,starts,str(b.ends_at??current.ends_at)||null,eventId,classId).run();await adminLog(env,u.user_id,'class.event_update',{class_id:classId,event_id:eventId});return ok({updated:true});
  }

  const submissionsList=path.match(/^\/api\/assignments\/([^/]+)\/submissions$/);
  if(submissionsList && method==='GET'){
    const u=await requireUser(request,env); const assignment=await env.DB.prepare(`SELECT id,class_id,points,title FROM assignments WHERE id=?`).bind(submissionsList[1]).first(); if(!assignment)return bad('Không tìm thấy bài tập.',404); await requireClassMember(env,assignment.class_id,u.user_id,['teacher','assistant']); const rows=await env.DB.prepare(`SELECT s.*,u.sfn_id,u.full_name,u.email,f.name file_name FROM submissions s JOIN users u ON u.id=s.user_id LEFT JOIN files f ON f.id=s.file_id WHERE s.assignment_id=? ORDER BY s.submitted_at DESC`).bind(assignment.id).all(); return ok({assignment,submissions:rows.results||[]});
  }
  const gradeSubmission=path.match(/^\/api\/submissions\/([^/]+)\/grade$/);
  if(gradeSubmission && method==='PATCH'){
    const u=await requireUser(request,env); const sub=await env.DB.prepare(`SELECT s.id,s.user_id,s.score old_score,a.id assignment_id,a.class_id,a.points FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?`).bind(gradeSubmission[1]).first(); if(!sub)return bad('Không tìm thấy bài nộp.',404); await requireClassMember(env,sub.class_id,u.user_id,['teacher','assistant']); const b=await request.json(); const score=b.score===''||b.score==null?null:Number(b.score); if(score!=null&&(!Number.isFinite(score)||score<0||score>Number(sub.points)))return bad('Điểm không hợp lệ.'); await env.DB.batch([env.DB.prepare(`UPDATE submissions SET score=?,feedback=?,status='graded',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(score,str(b.feedback).slice(0,5000),sub.id),env.DB.prepare(`INSERT INTO grade_change_log(id,class_id,user_id,entity_type,entity_id,old_score,new_score,note,changed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),sub.class_id,sub.user_id,'submission',sub.id,sub.old_score,score,str(b.feedback).slice(0,500),u.user_id)]); return ok();
  }


  if(path==='/api/support/tickets' && method==='GET'){
    const u=await requireUser(request,env); const rows=await env.DB.prepare(`SELECT * FROM support_tickets WHERE requester_user_id=? ORDER BY created_at DESC`).bind(u.user_id).all(); return ok({tickets:rows.results});
  }
  if(path==='/api/support/tickets' && method==='POST'){
    const u=await requireUser(request,env); const b=await request.json(); if(!str(b.subject)||!str(b.message))return bad('Vui lòng nhập chủ đề và nội dung hỗ trợ.'); if(str(b.subject).length>180||str(b.message).length>6000)return bad('Nội dung hỗ trợ vượt quá độ dài cho phép.'); const code=`SUP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`,ticketId=crypto.randomUUID(),messageId=crypto.randomUUID();await env.DB.batch([env.DB.prepare(`INSERT INTO support_tickets(id,ticket_code,requester_user_id,category,subject,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'new',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(ticketId,code,u.user_id,str(b.category),str(b.subject),str(b.message)),env.DB.prepare(`INSERT INTO support_ticket_messages(id,ticket_id,author_user_id,body,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(messageId,ticketId,u.user_id,str(b.message))]); return ok({ticket_code:code,id:ticketId});
  }
  const supportTicketDetail=path.match(/^\/api\/support\/tickets\/([^/]+)$/);
  if(supportTicketDetail && method==='GET'){
    const u=await requireUser(request,env),ticket=await env.DB.prepare(`SELECT id,ticket_code,category,subject,message,status,assigned_to,created_at,updated_at FROM support_tickets WHERE id=? AND requester_user_id=?`).bind(supportTicketDetail[1],u.user_id).first();if(!ticket)return bad('Không tìm thấy ticket.',404);const messages=await env.DB.prepare(`SELECT m.id,m.author_user_id,m.body,m.file_id,m.created_at,COALESCE(a.full_name,'Hỗ trợ') author_name FROM support_ticket_messages m LEFT JOIN users a ON a.id=m.author_user_id WHERE m.ticket_id=? ORDER BY m.created_at ASC,m.id ASC`).bind(ticket.id).all();let rows=messages.results||[];if(!rows.length&&ticket.message)rows=[{id:'initial',author_user_id:u.user_id,author_name:u.full_name,body:ticket.message,file_id:null,created_at:ticket.created_at}];return ok({ticket,messages:rows});
  }
  const supportTicketMessages=path.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
  if(supportTicketMessages && method==='POST'){
    const u=await requireUser(request,env),ticket=await env.DB.prepare(`SELECT id,status FROM support_tickets WHERE id=? AND requester_user_id=?`).bind(supportTicketMessages[1],u.user_id).first();if(!ticket)return bad('Không tìm thấy ticket.',404);if(ticket.status==='closed')return bad('Ticket đã đóng. Hãy tạo yêu cầu mới nếu cần hỗ trợ thêm.',409);const b=await request.json(),body=str(b.body).trim();if(!body)return bad('Nội dung phản hồi không được để trống.');if(body.length>6000)return bad('Nội dung phản hồi quá dài.');const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare(`INSERT INTO support_ticket_messages(id,ticket_id,author_user_id,body,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,ticket.id,u.user_id,body),env.DB.prepare(`UPDATE support_tickets SET status=CASE WHEN status='waiting_user' THEN 'in_progress' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(ticket.id)]);return ok({id});
  }

  if(path==='/api/admin/users' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin','account_admin']);const org=await requireOrganizationContext(request,env,admin);
    const q=str(url.searchParams.get('q')); const lim=Math.max(10,Math.min(300,Number(url.searchParams.get('limit')||100))),like=`%${q}%`;const scope=`(EXISTS(SELECT 1 FROM organization_members om WHERE om.user_id=users.id AND om.organization_id=? AND om.status='active') OR EXISTS(SELECT 1 FROM class_members cm JOIN classes c ON c.id=cm.class_id WHERE cm.user_id=users.id AND cm.status='active' AND COALESCE(c.organization_id,'sky-first')=?) OR EXISTS(SELECT 1 FROM classes c WHERE c.owner_user_id=users.id AND c.status!='deleted' AND COALESCE(c.organization_id,'sky-first')=?))`;
    const rows=q?await env.DB.prepare(`SELECT id,sfn_id,full_name,email,phone,role,status,created_at FROM users WHERE ${scope} AND (sfn_id LIKE ? OR full_name LIKE ? OR email LIKE ?) ORDER BY created_at DESC LIMIT ?`).bind(org,org,org,like,like,like,lim).all():await env.DB.prepare(`SELECT id,sfn_id,full_name,email,phone,role,status,created_at FROM users WHERE ${scope} ORDER BY created_at DESC LIMIT ?`).bind(org,org,org,lim).all();
    return ok({users:rows.results||[],organization_id:org});
  }

  const adminUser=path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if(adminUser && method==='PATCH'){
    const admin=await requireRole(request,env,['super_admin']); const b=await request.json();
    const current=await env.DB.prepare(`SELECT id,role,status FROM users WHERE id=?`).bind(adminUser[1]).first(); if(!current)return bad('Không tìm thấy tài khoản.',404);
    const role=['super_admin','school_admin','account_admin','teacher','assistant','student'].includes(b.role)?b.role:current.role;
    const status=['active','suspended','disabled','pending_activation'].includes(b.status)?b.status:current.status;
    if(status==='active' && (!current.password_hash || !current.password_salt)) return bad('Tài khoản chưa có mật khẩu. Hãy dùng Gửi email kích hoạt.',409);
    if(current.id===admin.user_id && (status!=='active'||role!=='super_admin')) return bad('Không thể tự hạ quyền hoặc tạm ngưng tài khoản quản trị đang đăng nhập.');
    await env.DB.prepare(`UPDATE users SET role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(role,status,current.id).run(); await adminLog(env,admin.user_id,'user.update',{user_id:current.id,role,status}); return ok();
  }

  if(path==='/api/admin/classes' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);
    const rows=await env.DB.prepare(`SELECT c.id,c.name,c.unit,c.join_code,c.status,c.created_at,u.full_name owner_name,(SELECT COUNT(*) FROM class_members cm WHERE cm.class_id=c.id AND cm.status='active') member_count FROM (SELECT * FROM classes WHERE COALESCE(organization_id,'sky-first')=?) c JOIN users u ON u.id=c.owner_user_id WHERE c.status!='deleted' ORDER BY c.created_at DESC LIMIT 300`).bind(org).all(); return ok({classes:rows.results||[],organization_id:org});
  }
  const adminClass=path.match(/^\/api\/admin\/classes\/([^/]+)$/);
  if(adminClass && method==='PATCH'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);await requireClassOrganizationAccess(request,env,admin,adminClass[1]); const b=await request.json(); const status=['active','archived'].includes(b.status)?b.status:null; if(!status)return bad('Trạng thái lớp không hợp lệ.'); await env.DB.prepare(`UPDATE classes SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,adminClass[1]).run(); await adminLog(env,admin.user_id,'class.status',{class_id:adminClass[1],status}); return ok();
  }

  if(path==='/api/admin/tickets' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin); const rows=await env.DB.prepare(`SELECT t.*,u.full_name,u.email FROM support_tickets t JOIN users u ON u.id=t.requester_user_id WHERE EXISTS(SELECT 1 FROM organization_members om WHERE om.user_id=u.id AND om.organization_id=? AND om.status='active') OR EXISTS(SELECT 1 FROM class_members cm JOIN classes c ON c.id=cm.class_id WHERE cm.user_id=u.id AND cm.status='active' AND COALESCE(c.organization_id,'sky-first')=?) ORDER BY t.updated_at DESC LIMIT 300`).bind(org,org).all(); return ok({tickets:rows.results||[],organization_id:org});
  }
  const adminTicket=path.match(/^\/api\/admin\/tickets\/([^/]+)$/);
  if(adminTicket && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']),org=await requireOrganizationContext(request,env,admin);const ticket=await env.DB.prepare(`SELECT t.*,u.full_name,u.email FROM support_tickets t JOIN users u ON u.id=t.requester_user_id WHERE t.id=?`).bind(adminTicket[1]).first();if(!ticket)return bad('Không tìm thấy ticket.',404);const ids=await organizationUserIds(env,org);if(admin.role!=='super_admin'&&!ids.includes(ticket.requester_user_id))return bad('Không có quyền.',403);const messages=await env.DB.prepare(`SELECT m.id,m.author_user_id,m.body,m.file_id,m.created_at,COALESCE(a.full_name,'Hỗ trợ') author_name FROM support_ticket_messages m LEFT JOIN users a ON a.id=m.author_user_id WHERE m.ticket_id=? ORDER BY m.created_at ASC,m.id ASC`).bind(ticket.id).all();let rows=messages.results||[];if(!rows.length&&ticket.message)rows=[{id:'initial',author_user_id:ticket.requester_user_id,author_name:ticket.full_name,body:ticket.message,file_id:null,created_at:ticket.created_at}];return ok({ticket,messages:rows,organization_id:org});
  }
  const adminTicketMessages=path.match(/^\/api\/admin\/tickets\/([^/]+)\/messages$/);
  if(adminTicketMessages && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']),org=await requireOrganizationContext(request,env,admin),ticket=await env.DB.prepare(`SELECT requester_user_id,status FROM support_tickets WHERE id=?`).bind(adminTicketMessages[1]).first();if(!ticket)return bad('Không tìm thấy ticket.',404);const ids=await organizationUserIds(env,org);if(admin.role!=='super_admin'&&!ids.includes(ticket.requester_user_id))return bad('Không có quyền.',403);if(ticket.status==='closed')return bad('Ticket đã đóng.',409);const b=await request.json(),body=str(b.body).trim();if(!body)return bad('Nội dung phản hồi không được để trống.');if(body.length>6000)return bad('Nội dung phản hồi quá dài.');const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare(`INSERT INTO support_ticket_messages(id,ticket_id,author_user_id,body,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,adminTicketMessages[1],admin.user_id,body),env.DB.prepare(`UPDATE support_tickets SET status='waiting_user',assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(admin.user_id,adminTicketMessages[1])]);await adminLog(env,admin.user_id,'ticket.reply',{ticket_id:adminTicketMessages[1],organization_id:org});return ok({id});
  }
  if(adminTicket && method==='PATCH'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);const ticket=await env.DB.prepare(`SELECT requester_user_id FROM support_tickets WHERE id=?`).bind(adminTicket[1]).first();if(!ticket)return bad('Không tìm thấy ticket.',404);const ids=await organizationUserIds(env,org);if(admin.role!=='super_admin'&&!ids.includes(ticket.requester_user_id))return bad('Không có quyền.',403); const b=await request.json(); const status=['new','in_progress','waiting_user','resolved','closed'].includes(b.status)?b.status:null; if(!status)return bad('Trạng thái ticket không hợp lệ.'); await env.DB.prepare(`UPDATE support_tickets SET status=?,assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,admin.user_id,adminTicket[1]).run(); await adminLog(env,admin.user_id,'ticket.status',{ticket_id:adminTicket[1],status,organization_id:org}); return ok();
  }


  if(path==='/api/beauty/me' && method==='GET'){
    const u=await requireUser(request,env); const settings=await getSettings(env);
    const ownerId=str(env.BEAUTY_OWNER_USER_ID||settings.beauty_owner_user_id||'bca18603-3eef-42cb-ba29-7c71d1d245c1');
    const allowed=!!ownerId&&String(u.user_id)===ownerId;
    return ok({allowed,enabled:allowed&&settings.beauty_enabled!=='0',config:allowed?{smooth:Number(settings.beauty_smooth_default||0.20),brightness:Number(settings.beauty_brightness_default||0.10),contrast:Number(settings.beauty_contrast_default||0.05),background:settings.beauty_background_enabled!=='0'}:{}});
  }

  if(path==='/api/admin/website/revisions' && method==='GET'){
    await requireRole(request,env,['super_admin','school_admin']);
    const rows=await env.DB.prepare(`SELECT id,note,created_by,created_at FROM website_revisions ORDER BY created_at DESC LIMIT 50`).all();
    return ok({revisions:rows.results||[]});
  }
  const websiteRevision=path.match(/^\/api\/admin\/website\/revisions\/([^/]+)$/);
  if(websiteRevision && method==='GET'){
    await requireRole(request,env,['super_admin','school_admin']);
    const row=await env.DB.prepare(`SELECT * FROM website_revisions WHERE id=?`).bind(websiteRevision[1]).first();
    if(!row)return bad('Không tìm thấy phiên bản website.',404);
    let snapshot={};try{snapshot=JSON.parse(row.snapshot_json||'{}')}catch{}
    return ok({revision:{...row,snapshot}});
  }
  const websiteRestore=path.match(/^\/api\/admin\/website\/revisions\/([^/]+)\/restore$/);
  if(websiteRestore && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);
    const row=await env.DB.prepare(`SELECT * FROM website_revisions WHERE id=?`).bind(websiteRestore[1]).first();
    if(!row)return bad('Không tìm thấy phiên bản website.',404);
    let snapshot={};try{snapshot=JSON.parse(row.snapshot_json||'{}')}catch{return bad('Phiên bản website bị lỗi dữ liệu.',409)}
    const current=await getSettings(env);
    await env.DB.prepare(`INSERT INTO website_revisions(id,snapshot_json,note,created_by,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),JSON.stringify(current),'Tự động lưu trước khi khôi phục',admin.user_id).run();
    const stmts=Object.entries(snapshot).slice(0,300).map(([k,v])=>env.DB.prepare(`INSERT INTO system_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(k,String(v??'')));
    if(stmts.length)await env.DB.batch(stmts);
    await adminLog(env,admin.user_id,'website.revision.restore',{revision_id:row.id});
    return ok({restored:true});
  }

  if(path==='/api/admin/settings' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const all=await getSettings(env);
    if(admin.role==='super_admin') return ok({settings:all});
    const allowed=['site_primary_color','site_primary_dark','site_background_color','site_surface_color','site_text_color','site_muted_color','site_border_color','site_soft_color','site_danger_color','site_radius','site_button_radius','site_input_radius','site_content_width','site_font_scale','site_shadow_opacity','site_header_style','site_auth_footer','site_reduce_motion','public_intro_title','public_intro_text','public_about_title','public_about_text','site_name','site_name_en','site_header_title','site_header_subtitle','footer_connect_eyebrow','footer_connect_title','footer_connect_text','footer_ctt_label','footer_ctt_url','footer_tnv_label','footer_tnv_url','footer_game_label','footer_game_url','footer_web_label','footer_web_url','footer_facebook_label','footer_facebook_url','footer_tiktok_label','footer_tiktok_url','footer_instagram_label','footer_instagram_url','footer_zalo_label','footer_zalo_url','support_email','account_request_enabled','maintenance_mode','maintenance_message','allow_guest_live','default_class_unit','footer_product_text','footer_copyright','public_hero_eyebrow','public_hero_side_title','public_hero_side_text','public_feature_1_title','public_feature_1_text','public_feature_2_title','public_feature_2_text','public_feature_3_title','public_feature_3_text','public_feature_4_title','public_feature_4_text','public_learner_title','public_learner_text','public_learner_quote','public_teacher_title','public_teacher_text','public_teacher_before_title','public_teacher_before_text','public_teacher_during_title','public_teacher_during_text','public_teacher_after_title','public_teacher_after_text','public_safety_title','public_safety_text','public_faq_title','public_faq_1_q','public_faq_1_a','public_faq_2_q','public_faq_2_a','public_faq_3_q','public_faq_3_a','public_faq_4_q','public_faq_4_a','public_cta_title','public_cta_text','public_status_text'];
    return ok({settings:Object.fromEntries(allowed.filter(k=>Object.prototype.hasOwnProperty.call(all,k)).map(k=>[k,all[k]]))});
  }
  if(path==='/api/admin/settings' && method==='PUT'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const b=await request.json(); const before=await getSettings(env); await env.DB.prepare(`INSERT INTO website_revisions(id,snapshot_json,note,created_by,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),JSON.stringify(before),str(b.__revision_note||'Trước khi cập nhật Website Studio'),admin.user_id).run(); delete b.__revision_note; let allowed=['live_room_max_participants','site_primary_color','site_primary_dark','site_background_color','site_surface_color','site_text_color','site_muted_color','site_border_color','site_soft_color','site_danger_color','site_radius','site_button_radius','site_input_radius','site_content_width','site_font_scale','site_shadow_opacity','site_header_style','site_auth_footer','site_reduce_motion','public_intro_title','public_intro_text','public_about_title','public_about_text','site_name','site_name_en','site_header_title','site_header_subtitle','footer_connect_eyebrow','footer_connect_title','footer_connect_text','footer_ctt_label','footer_ctt_url','footer_tnv_label','footer_tnv_url','footer_game_label','footer_game_url','footer_web_label','footer_web_url','footer_facebook_label','footer_facebook_url','footer_tiktok_label','footer_tiktok_url','footer_instagram_label','footer_instagram_url','footer_zalo_label','footer_zalo_url','support_email','system_email','account_request_enabled','maintenance_mode','maintenance_message','default_session_days','allow_guest_live','default_class_unit','footer_product_text','footer_copyright','live_mesh_max_peers','login_rate_limit','max_upload_mb','account_portrait_max_mb','account_document_max_mb','public_hero_eyebrow','public_hero_side_title','public_hero_side_text','public_feature_1_title','public_feature_1_text','public_feature_2_title','public_feature_2_text','public_feature_3_title','public_feature_3_text','public_feature_4_title','public_feature_4_text','public_learner_title','public_learner_text','public_learner_quote','public_teacher_title','public_teacher_text','public_teacher_before_title','public_teacher_before_text','public_teacher_during_title','public_teacher_during_text','public_teacher_after_title','public_teacher_after_text','public_safety_title','public_safety_text','public_faq_title','public_faq_1_q','public_faq_1_a','public_faq_2_q','public_faq_2_a','public_faq_3_q','public_faq_3_a','public_faq_4_q','public_faq_4_a','public_cta_title','public_cta_text','public_status_text','beauty_enabled','beauty_owner_user_id','beauty_smooth_default','beauty_brightness_default','beauty_contrast_default','beauty_background_enabled','beauty_advanced_admin_enabled']; if(admin.role!=='super_admin'){const safePrefixes=['site_','public_','footer_']; const safeExact=new Set(['support_email','account_request_enabled','maintenance_mode','maintenance_message','allow_guest_live','default_class_unit']); allowed=allowed.filter(k=>safePrefixes.some(p=>k.startsWith(p))||safeExact.has(k))} const statements=[];
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
    await requireRole(request,env,['super_admin','account_admin']); const rows=await env.DB.prepare(`SELECT r.*,u.sfn_id approved_sfn_id,(SELECT COUNT(*) FROM admin_notes n WHERE n.entity_type='account_request' AND n.entity_id=CAST(r.id AS TEXT)) note_count FROM account_requests r LEFT JOIN users u ON u.id=r.approved_user_id ORDER BY r.created_at DESC LIMIT 200`).all(); return ok({requests:(rows.results||[]).map(r=>{let data={};try{data=JSON.parse(r.data_json||'{}')}catch{}return {...r,requested_access:data.requested_access||'student',education_unit:data.education_unit||'',class_name:data.class_name||''}})});
  }

  const approve=path.match(/^\/api\/admin\/account-requests\/([^/]+)\/approve$/);
  if(approve && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']); const reqRow=await env.DB.prepare(`SELECT * FROM account_requests WHERE id=? AND status IN ('pending','reviewing','needs_info')`).bind(approve[1]).first(); if(!reqRow)return bad('Yêu cầu không tồn tại hoặc đã xử lý.');
    if(await env.DB.prepare(`SELECT 1 ok FROM users WHERE lower(email)=lower(?)`).bind(reqRow.email).first())return bad('Email này đã có tài khoản.',409);
    const seq=await env.DB.prepare(`UPDATE counters SET value=value+1 WHERE key='sfn_user' AND value < ? RETURNING value`).bind(MAX_ACCOUNTS).first();
    if(!seq) return bad(`Hệ thống đã đạt giới hạn ${MAX_ACCOUNTS.toLocaleString('vi-VN')} tài khoản cho giai đoạn khởi tạo.`,409);
    const sfnNo=Number(seq.value), userId=crypto.randomUUID(); const data=JSON.parse(reqRow.data_json||'{}');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users(id,sfn_no,sfn_id,full_name,email,phone,role,status,avatar_key,profile_json,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending_activation',?,?, '', '',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(userId,sfnNo,idCode(sfnNo),reqRow.full_name,reqRow.email,reqRow.phone,data.requested_access==='teacher'?'teacher':'student',reqRow.portrait_key,JSON.stringify(data)),
      env.DB.prepare(`UPDATE account_requests SET status='approved',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,approved_user_id=? WHERE id=?`).bind(admin.user_id,userId,reqRow.id)
    ]);
    await adminLog(env,admin.user_id,'account_request.approve',{id:reqRow.id,user_id:userId,sfn_id:idCode(sfnNo)});
    return ok({sfn_id:idCode(sfnNo),status:'pending_activation',email_sent:false,limit:MAX_ACCOUNTS});
  }

  const accountReview=path.match(/^\/api\/admin\/account-requests\/([^/]+)\/review$/);
  if(accountReview && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']);
    const b=await request.json(); const action=str(b.action); const note=str(b.note);
    if(!['needs_info','rejected','reviewing'].includes(action)) return bad('Thao tác xử lý không hợp lệ.');
    const row=await env.DB.prepare(`SELECT * FROM account_requests WHERE id=?`).bind(accountReview[1]).first();
    if(!row) return bad('Không tìm thấy yêu cầu.',404);
    if(['approved','rejected'].includes(row.status)) return bad('Yêu cầu này đã được xử lý và không thể chuyển lại bằng thao tác này.',409);
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

  const resendRequestMail=path.match(/^\/api\/admin\/account-requests\/([^/]+)\/resend-email$/);
  if(resendRequestMail && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']);
    const row=await env.DB.prepare(`SELECT r.*,u.sfn_id approved_sfn_id,u.id approved_user_id,u.status user_status,u.full_name user_full_name,u.email user_email FROM account_requests r LEFT JOIN users u ON u.id=r.approved_user_id WHERE r.id=?`).bind(resendRequestMail[1]).first();
    if(!row)return bad('Không tìm thấy yêu cầu.',404);
    let mail;
    if(row.status==='approved' && row.approved_user_id){
      if(row.user_status!=='pending_activation') return bad('Tài khoản này đã được kích hoạt. Hãy dùng chức năng Cấp lại mật khẩu trong Quản lý tài khoản.',409);
      const password=temporaryPassword(), hp=await hashPassword(password);
      const html=credentialsEmail(env,{fullName:row.user_full_name||row.full_name,sfnId:row.approved_sfn_id,password});
      mail=await sendMail(env,row.user_email||row.email,`[Sky First] Thông tin kích hoạt tài khoản ${row.approved_sfn_id}`,html);
      if(mail.sent){
        await env.DB.batch([
          env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending_activation'`).bind(hp.hash,hp.salt,row.approved_user_id),
          env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(row.approved_user_id),
          env.DB.prepare(`UPDATE activation_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL`).bind(row.approved_user_id)
        ]);
      }
    }else{
      let data={};try{data=JSON.parse(row.data_json||'{}')}catch{} const fallback=requestReceivedEmail(env,{fullName:row.full_name,requestCode:row.request_code,email:row.email,phone:row.phone,data}); const tpl=await resolveEmailTemplate(env,'account_request_received','[Sky First] Xác nhận tiếp nhận yêu cầu cấp tài khoản',fallback,{full_name:row.full_name,request_code:row.request_code,email:row.email,phone:row.phone}); mail=await sendMail(env,row.email,tpl.subject,tpl.html);
    }
    await adminLog(env,admin.user_id,row.status==='approved'?'account_request.activate_email':'account_request.resend_email',{id:row.id,sent:mail.sent,code:mail.code||''});
    return ok({sent:mail.sent,reason:mail.reason||'',code:mail.code||'',activated:row.status==='approved'&&mail.sent});
  }

  if(path==='/api/admin/users/create' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']); const b=await request.json();
    const fullName=str(b.full_name), email=normalizeEmail(str(b.email)), phone=str(b.phone), role=['teacher','assistant','student','account_admin','school_admin'].includes(b.role)?b.role:'student';
    if(!fullName||!email) return bad('Họ tên và email là bắt buộc.');
    if(!validEmail(email)) return bad('Địa chỉ email không hợp lệ.');
    if(fullName.length>160||phone.length>40) return bad('Thông tin tài khoản vượt quá độ dài cho phép.');
    if(await env.DB.prepare(`SELECT 1 ok FROM users WHERE lower(email)=lower(?)`).bind(email).first()) return bad('Email đã có tài khoản.',409);
    const org=await requireOrganizationContext(request,env,admin),memberCount=(await organizationUserIds(env,org)).length;await enforceOrgQuota(env,org,'members',memberCount,1);const seq=await env.DB.prepare(`UPDATE counters SET value=value+1 WHERE key='sfn_user' AND value < ? RETURNING value`).bind(MAX_ACCOUNTS).first(); if(!seq)return bad('Đã đạt giới hạn tài khoản.',409);
    const no=Number(seq.value), id=crypto.randomUUID();
    await env.DB.batch([env.DB.prepare(`INSERT INTO users(id,sfn_no,sfn_id,full_name,email,phone,role,status,profile_json,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending_activation','{}','','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,no,idCode(no),fullName,email,phone,role),env.DB.prepare(`INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,status,created_at) VALUES(?,?,?,'active',CURRENT_TIMESTAMP)`).bind(org,id,role)]);
    await adminLog(env,admin.user_id,'user.create',{user_id:id,sfn_id:idCode(no),role,organization_id:org});ctx?.waitUntil?.(recordAnalytics(env,org,'account.created',{userId:admin.user_id,entityType:'user',entityId:id}));ctx?.waitUntil?.(runAutomations(env,org,'account.created',{event_id:`account.created:${id}`,user_id:id,email,title:'Tài khoản mới được tạo',message:`${fullName} (${idCode(no)}) vừa được tạo.`},ctx)); return ok({id,sfn_id:idCode(no),status:'pending_activation',email_sent:false});
  }

  if(path==='/api/admin/users/bulk-create' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']); const b=await request.json(); const items=Array.isArray(b.users)?b.users.slice(0,200):[];
    if(!items.length)return bad('Danh sách tài khoản trống.'); const results=[];
    for(const item of items){
      const fullName=str(item.full_name), email=normalizeEmail(str(item.email)), phone=str(item.phone), role=['teacher','assistant','student'].includes(item.role)?item.role:'student';
      if(!fullName||!email){results.push({email,status:'error',message:'Thiếu họ tên/email'});continue;}
      if(!validEmail(email)){results.push({email,status:'error',message:'Email không hợp lệ'});continue;}
      if(fullName.length>160||phone.length>40){results.push({email,status:'error',message:'Thông tin vượt quá độ dài cho phép'});continue;}
      if(await env.DB.prepare(`SELECT 1 ok FROM users WHERE lower(email)=lower(?)`).bind(email).first()){results.push({email,status:'skip',message:'Email đã tồn tại'});continue;}
      const org=await requireOrganizationContext(request,env,admin),memberCount=(await organizationUserIds(env,org)).length;try{await enforceOrgQuota(env,org,'members',memberCount,1)}catch(e){results.push({email,status:'error',message:e.publicMessage||'Đạt giới hạn thành viên'});continue}const seq=await env.DB.prepare(`UPDATE counters SET value=value+1 WHERE key='sfn_user' AND value < ? RETURNING value`).bind(MAX_ACCOUNTS).first(); if(!seq){results.push({email,status:'error',message:'Đạt giới hạn tài khoản'});break;}
      const no=Number(seq.value), id=crypto.randomUUID();
      await env.DB.batch([env.DB.prepare(`INSERT INTO users(id,sfn_no,sfn_id,full_name,email,phone,role,status,profile_json,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending_activation','{}','','',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,no,idCode(no),fullName,email,phone,role),env.DB.prepare(`INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,status,created_at) VALUES(?,?,?,'active',CURRENT_TIMESTAMP)`).bind(org,id,role)]);
      results.push({email,status:'created',sfn_id:idCode(no)});ctx?.waitUntil?.(recordAnalytics(env,org,'account.created',{userId:admin.user_id,entityType:'user',entityId:id}));ctx?.waitUntil?.(runAutomations(env,org,'account.created',{event_id:`account.created:${id}`,user_id:id,email,title:'Tài khoản mới được tạo',message:`${fullName} (${idCode(no)}) vừa được tạo.`},ctx));
    }
    await adminLog(env,admin.user_id,'user.bulk_create',{count:items.length,created:results.filter(x=>x.status==='created').length}); return ok({results});
  }

  const userAction=path.match(/^\/api\/admin\/users\/([^/]+)\/(force-logout|send-activation-email|reset-password)$/);
  if(userAction && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','account_admin']); const user=await env.DB.prepare(`SELECT * FROM users WHERE id=?`).bind(userAction[1]).first(); if(!user)return bad('Không tìm thấy tài khoản.',404);
    const action=userAction[2];
    if(action==='force-logout'){await env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(user.id).run(); await adminLog(env,admin.user_id,'user.force_logout',{user_id:user.id}); return ok();}
    if(action==='send-activation-email' && user.status!=='pending_activation') return bad('Chỉ tài khoản Chờ kích hoạt mới có thể nhận email kích hoạt.',409);
    if(action==='reset-password' && user.status!=='active') return bad('Chỉ tài khoản đang hoạt động mới có thể được cấp lại mật khẩu.',409);
    const password=temporaryPassword(), hp=await hashPassword(password), reset=action==='reset-password';
    const html=credentialsEmail(env,{fullName:user.full_name,sfnId:user.sfn_id,password,reset});
    const mail=await sendMail(env,user.email,reset?`[Sky First] Cấp lại mật khẩu ${user.sfn_id}`:`[Sky First] Thông tin kích hoạt tài khoản ${user.sfn_id}`,html);
    if(!mail.sent) return ok({sent:false,email_sent:false,reason:mail.reason||'Email chưa gửi được.',code:mail.code||''});
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(hp.hash,hp.salt,user.id),
      env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(user.id),
      env.DB.prepare(`UPDATE activation_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL`).bind(user.id)
    ]);
    await adminLog(env,admin.user_id,reset?'user.reset_password':'user.activate_email',{user_id:user.id,email_sent:true});
    return ok({sent:true,email_sent:true,status:'active'});
  }

  if(path==='/api/admin/classes/create' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin); const b=await request.json(); const name=str(b.name); if(!name)return bad('Tên lớp là bắt buộc.');const classCount=await env.DB.prepare(`SELECT COUNT(*) n FROM classes WHERE COALESCE(organization_id,'sky-first')=? AND status!='deleted'`).bind(org).first();await enforceOrgQuota(env,org,'classes',Number(classCount?.n||0),1);
    let owner=admin.user_id; if(str(b.owner_login)){const u=await env.DB.prepare(`SELECT id FROM users WHERE lower(email)=lower(?) OR lower(sfn_id)=lower(?) LIMIT 1`).bind(str(b.owner_login),str(b.owner_login)).first(); if(!u)return bad('Không tìm thấy người phụ trách.'); owner=u.id;}
    const id=crypto.randomUUID(), code=slugCode('CLS'); await env.DB.batch([env.DB.prepare(`INSERT INTO classes(id,name,description,unit,join_code,owner_user_id,status,organization_id,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,name,str(b.description),str(b.unit)||'Sky First Network',code,owner,org),env.DB.prepare(`INSERT OR REPLACE INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,'teacher','active',CURRENT_TIMESTAMP)`).bind(id,owner)]); await adminLog(env,admin.user_id,'class.create',{id,name,organization_id:org});await recordAnalytics(env,org,'class.created',{userId:admin.user_id,entityType:'class',entityId:id}); return ok({id,join_code:code,organization_id:org});
  }

  const classAction=path.match(/^\/api\/admin\/classes\/([^/]+)\/(rotate-code|members)$/);
  if(classAction && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const classId=classAction[1];const org=await requireClassOrganizationAccess(request,env,admin,classId);
    if(classAction[2]==='rotate-code'){const code=slugCode('CLS'); await env.DB.prepare(`UPDATE classes SET join_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(code,classId).run(); await adminLog(env,admin.user_id,'class.rotate_code',{class_id:classId}); return ok({join_code:code});}
    const b=await request.json(); const login=str(b.login); const role=['teacher','assistant','student'].includes(b.role)?b.role:'student'; const u=await env.DB.prepare(`SELECT id,sfn_id,full_name FROM users WHERE lower(email)=lower(?) OR lower(sfn_id)=lower(?) LIMIT 1`).bind(login,login).first(); if(!u)return bad('Không tìm thấy thành viên.');const exists=await env.DB.prepare(`SELECT 1 ok FROM class_members WHERE class_id=? AND user_id=? AND status='active'`).bind(classId,u.id).first();if(!exists){const memberCount=(await organizationUserIds(env,org)).length;await enforceOrgQuota(env,org,'members',memberCount,1)} await env.DB.prepare(`INSERT INTO class_members(class_id,user_id,role,status,joined_at) VALUES(?,?,?,'active',CURRENT_TIMESTAMP) ON CONFLICT(class_id,user_id) DO UPDATE SET role=excluded.role,status='active'`).bind(classId,u.id,role).run(); await adminLog(env,admin.user_id,'class.member_add',{class_id:classId,user_id:u.id,role,organization_id:org}); return ok({member:u});
  }

  const classMemberDelete=path.match(/^\/api\/admin\/classes\/([^/]+)\/members\/([^/]+)$/);
  if(classMemberDelete && method==='DELETE'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);await requireClassOrganizationAccess(request,env,admin,classMemberDelete[1]); await env.DB.prepare(`UPDATE class_members SET status='removed' WHERE class_id=? AND user_id=?`).bind(classMemberDelete[1],classMemberDelete[2]).run(); await adminLog(env,admin.user_id,'class.member_remove',{class_id:classMemberDelete[1],user_id:classMemberDelete[2]}); return ok();
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

  // Role-aware analytics. Infrastructure details never leave System Admin routes.
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

  if(path==='/api/notifications' && method==='GET'){
    const u=await requireUser(request,env); const rows=await env.DB.prepare(`SELECT * FROM notification_center WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50`).bind(u.user_id).all(); return ok({notifications:rows.results||[]});
  }
  const notificationRead=path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if(notificationRead && method==='POST'){
    const u=await requireUser(request,env); await env.DB.prepare(`UPDATE notification_center SET is_read=1 WHERE id=? AND (user_id=? OR user_id IS NULL)`).bind(notificationRead[1],u.user_id).run(); return ok();
  }

  if(path==='/api/admin/system/upgrade' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin']); const upgrade=await ensureLatestSchema(env); await env.DB.prepare(`INSERT INTO system_settings(key,value,updated_by,updated_at) VALUES('platform_version','production',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='production',updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(admin.user_id).run(); await adminLog(env,admin.user_id,'system.schema_upgrade',{version:'production',completed:upgrade.completed}); await ensureV13Schema(env); await ensureVPlusSchema(env); return ok({version:'production',message:'Nền tảng đã được kiểm tra và cập nhật an toàn.',completed:upgrade.completed});
  }

  if(path==='/api/admin/system/diagnostics' && method==='GET'){
    await requireRole(request,env,['super_admin']); const checks=[];
    const add=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
    try{const r=await env.DB.prepare(`SELECT COUNT(*) n FROM users`).first();add('D1 / users',true,`${r?.n||0} tài khoản`)}catch(e){add('D1 / users',false,e.message)}
    try{const r=await env.DB.prepare(`SELECT COUNT(*) n FROM system_settings`).first();add('Cấu hình hệ thống',true,`${r?.n||0} thiết lập`)}catch(e){add('Cấu hình hệ thống',false,e.message)}
    try{await env.DB.prepare(`SELECT 1 FROM live_access_tokens LIMIT 1`).first();add('Live access',true,'Bảng token phòng học sẵn sàng')}catch(e){add('Live access',false,e.message)}
    try{await env.DB.prepare(`SELECT 1 FROM class_messages LIMIT 1`).first();add('Class chat',true,'Bảng trò chuyện sẵn sàng')}catch(e){add('Class chat',false,e.message)}
    add('R2 FILES',!!env.FILES,env.FILES?'Binding FILES đã có':'Thiếu binding FILES');
    {const mc=mailConfig(env);add('Dịch vụ email',!!mc.key,mc.key?`Đã cấu hình gửi từ ${mc.from}`:'Chưa cấu hình khóa gửi email');}
    add('Setup token',!!env.SETUP_TOKEN,env.SETUP_TOKEN?'SETUP_TOKEN đã cấu hình':'Nên cấu hình SETUP_TOKEN để bảo vệ khởi tạo');
    const failed=checks.filter(x=>!x.ok).length; return ok({version:'production',status:failed?'attention':'healthy',failed,checks,time:nowIso()});
  }

  if(path==='/api/admin/system/test-email' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin']); const u=await env.DB.prepare(`SELECT email,full_name FROM users WHERE id=?`).bind(admin.user_id).first(); const body=emailShell({title:'Kiểm tra hệ thống email',preheader:'Email kiểm tra từ Trung tâm Học tập Số Sky First Network',env,body:`<p>Xin chào <b>${htmlEsc(u?.full_name||'Quản trị viên')}</b>,</p><p>Email này xác nhận dịch vụ gửi thư của Trung tâm Học tập Số đang hoạt động và nhà cung cấp đã tiếp nhận yêu cầu gửi.</p>`}); const mail=await sendMail(env,u.email,'[Sky First] Kiểm tra hệ thống email',body); await adminLog(env,admin.user_id,'system.test_email',{sent:mail.sent}); return ok({sent:mail.sent,reason:mail.reason||''});
  }

  if(path==='/api/admin/system/cleanup' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin']); const a=await env.DB.prepare(`DELETE FROM sessions WHERE expires_at<=CURRENT_TIMESTAMP`).run(); const b=await env.DB.prepare(`DELETE FROM activation_tokens WHERE expires_at<=CURRENT_TIMESTAMP OR used_at IS NOT NULL`).run(); const c=await env.DB.prepare(`DELETE FROM live_access_tokens WHERE expires_at<=CURRENT_TIMESTAMP`).run(); const d=await env.DB.prepare(`DELETE FROM login_throttle WHERE updated_at<datetime('now','-2 days')`).run(); const result={sessions:a.meta?.changes||0,activation_tokens:b.meta?.changes||0,live_tokens:c.meta?.changes||0,throttle:d.meta?.changes||0}; await adminLog(env,admin.user_id,'system.cleanup',result); return ok(result);
  }

  if(path==='/api/admin/stats' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin','account_admin']);const org=await requireOrganizationContext(request,env,admin);const ids=await organizationUserIds(env,org),placeholders=ids.length?ids.map(()=>'?').join(','):"''";
    const [users,classes,requests,tickets]=await Promise.all([
      Promise.resolve({n:ids.length}),env.DB.prepare(`SELECT COUNT(*) n FROM classes WHERE status='active' AND COALESCE(organization_id,'sky-first')=?`).bind(org).first(),env.DB.prepare(`SELECT COUNT(*) n FROM account_requests WHERE status='pending'`).first(),ids.length?env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets WHERE status!='resolved' AND requester_user_id IN (${placeholders})`).bind(...ids).first():Promise.resolve({n:0})
    ]);
    const base={users:users.n,account_limit:MAX_ACCOUNTS,classes:classes.n,pending_requests:requests.n,open_tickets:tickets.n,organization_id:org};
    if(admin.role!=='super_admin') return ok(base);
    const [failedMail,activeSessions,liveTokens]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) n FROM email_logs WHERE status='failed'`).first(),
      env.DB.prepare(`SELECT COUNT(*) n FROM sessions WHERE expires_at>CURRENT_TIMESTAMP`).first(),
      env.DB.prepare(`SELECT COUNT(*) n FROM live_access_tokens WHERE expires_at>CURRENT_TIMESTAMP`).first().catch(()=>({n:0}))
    ]);
    return ok({...base,failed_emails:failedMail?.n||0,active_sessions:activeSessions?.n||0,live_tokens:liveTokens?.n||0});
  }


  // Operations Center: custom IAM roles, organization-scoped automation and analytics.
  if(path==='/api/admin/v39/overview' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']); const org=await requireOrganizationContext(request,env,admin);ctx?.waitUntil?.(sweepTimeAutomations(env,org,ctx));
    const q=async(sql,...args)=>{try{return await env.DB.prepare(sql).bind(...args).first()}catch{return {n:0}}};
    const [members,classes,assessments,events,rules]=await Promise.all([
      q(`SELECT COUNT(*) n FROM organization_members WHERE organization_id=? AND status='active'`,org),
      q(`SELECT COUNT(*) n FROM classes WHERE COALESCE(organization_id,'sky-first')=? AND status='active'`,org),
      q(`SELECT COUNT(*) n FROM exams e JOIN classes c ON c.id=e.class_id WHERE COALESCE(c.organization_id,'sky-first')=?`,org),
      q(`SELECT COUNT(*) n FROM analytics_events WHERE organization_id=? AND created_at>=datetime('now','-30 days')`,org),
      q(`SELECT COUNT(*) n FROM automation_rules WHERE organization_id=? AND enabled=1`,org)
    ]); return ok({organization_id:org,members:members?.n||0,classes:classes?.n||0,assessments:assessments?.n||0,events_30d:events?.n||0,automation_rules:rules?.n||0});
  }
  if(path==='/api/admin/v39/roles' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);
    const rows=await env.DB.prepare(`SELECT r.*,GROUP_CONCAT(p.permission) permissions FROM custom_roles r LEFT JOIN role_permissions p ON p.role_id=r.id AND p.allowed=1 WHERE r.organization_id=? GROUP BY r.id ORDER BY r.name`).bind(org).all().catch(()=>({results:[]}));return ok({roles:rows.results||[]});
  }
  if(path==='/api/admin/v39/roles' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);const b=await request.json();const name=str(b.name).slice(0,80);if(name.length<2)return bad('Tên vai trò chưa hợp lệ.');const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO custom_roles(id,organization_id,name,description,created_by) VALUES(?,?,?,?,?)`).bind(id,org,name,str(b.description).slice(0,500),admin.user_id).run();for(const permission of (Array.isArray(b.permissions)?b.permissions:[]).slice(0,100)){const x=str(permission).slice(0,100);if(x)await env.DB.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission,allowed) VALUES(?,?,1)`).bind(id,x).run()}await adminLog(env,admin.user_id,'iam.role.create',{organization_id:org,role_id:id,name});return ok({id});
  }
  if(path==='/api/admin/v39/role-assignments' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);const rows=await env.DB.prepare(`SELECT ura.user_id,ura.role_id,u.sfn_id,u.full_name,r.name role_name,GROUP_CONCAT(rp.permission) permissions FROM user_role_assignments ura JOIN users u ON u.id=ura.user_id JOIN custom_roles r ON r.id=ura.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id AND rp.allowed=1 WHERE ura.organization_id=? GROUP BY ura.user_id,ura.role_id ORDER BY u.full_name,r.name`).bind(org).all();return ok({assignments:rows.results||[]});
  }
  if(path==='/api/admin/v39/role-assignments' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin),b=await request.json(),login=str(b.login),roleId=str(b.role_id);const role=await env.DB.prepare(`SELECT id FROM custom_roles WHERE id=? AND organization_id=?`).bind(roleId,org).first();if(!role)return bad('Vai trò không tồn tại trong tổ chức.',404);const user=await env.DB.prepare(`SELECT id,sfn_id,full_name FROM users WHERE lower(email)=lower(?) OR lower(sfn_id)=lower(?) LIMIT 1`).bind(login,login).first();if(!user)return bad('Không tìm thấy tài khoản.',404);const memberCount=(await organizationUserIds(env,org)).length,member=await env.DB.prepare(`SELECT 1 ok FROM organization_members WHERE organization_id=? AND user_id=? AND status='active'`).bind(org,user.id).first();if(!member)await enforceOrgQuota(env,org,'members',memberCount,1);await env.DB.batch([env.DB.prepare(`INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,status,created_at) VALUES(?,?,'member','active',CURRENT_TIMESTAMP)`).bind(org,user.id),env.DB.prepare(`INSERT OR IGNORE INTO user_role_assignments(organization_id,user_id,role_id,assigned_by,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`).bind(org,user.id,roleId,admin.user_id)]);await adminLog(env,admin.user_id,'iam.role.assign',{organization_id:org,user_id:user.id,role_id:roleId});return ok({user});
  }
  const roleAssignment=path.match(/^\/api\/admin\/v39\/role-assignments\/([^/]+)\/([^/]+)$/);
  if(roleAssignment && method==='DELETE'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);await env.DB.prepare(`DELETE FROM user_role_assignments WHERE organization_id=? AND user_id=? AND role_id=?`).bind(org,roleAssignment[1],roleAssignment[2]).run();return ok({deleted:true});
  }
  if(path==='/api/admin/v39/automations/run-due' && method==='POST'){const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);await sweepTimeAutomations(env,org,ctx);return ok({ran:true});}
  if(path==='/api/admin/v39/automations' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);const rows=await env.DB.prepare(`SELECT * FROM automation_rules WHERE organization_id=? ORDER BY updated_at DESC`).bind(org).all().catch(()=>({results:[]}));return ok({rules:rows.results||[]});
  }
  if(path==='/api/admin/v39/automations' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);const b=await request.json();const allowedTriggers=['account.created','assessment.published','assessment.submitted','assignment.due','ticket.stale'];const allowedActions=['notification.create','email.send','audit.record'];if(!allowedTriggers.includes(b.trigger_key)||!allowedActions.includes(b.action_key))return bad('Trigger hoặc action chưa được hỗ trợ.');const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO automation_rules(id,organization_id,name,trigger_key,action_key,config_json,enabled,created_by) VALUES(?,?,?,?,?,?,?,?)`).bind(id,org,str(b.name||'Quy tắc tự động').slice(0,120),b.trigger_key,b.action_key,JSON.stringify(b.config||{}),b.enabled===false?0:1,admin.user_id).run();await adminLog(env,admin.user_id,'automation.create',{organization_id:org,rule_id:id});return ok({id});
  }
  if(path==='/api/admin/v39/analytics' && method==='GET'){
    const admin=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,admin);
    const rows=await env.DB.prepare(`SELECT event_key,COUNT(*) count,ROUND(AVG(value_num),2) average_value FROM analytics_events WHERE organization_id=? AND created_at>=datetime('now','-30 days') GROUP BY event_key ORDER BY count DESC LIMIT 50`).bind(org).all().catch(()=>({results:[]}));return ok({window_days:30,metrics:rows.results||[]});
  }

  // Master requirements 1-35: profile identity, organizations, calendar, resources and notifications.
  if(path==='/api/account/profile' && method==='GET'){
    const u=await requireUser(request,env);
    const prefs=await env.DB.prepare(`SELECT key,value FROM user_preferences WHERE user_id=?`).bind(u.user_id).all().catch(()=>({results:[]}));
    return ok({profile:u,preferences:Object.fromEntries((prefs.results||[]).map(x=>[x.key,x.value]))});
  }
  const avatarImage=path.match(/^\/api\/avatar\/([^/]+)$/);
  if(avatarImage && method==='GET'){
    await requireUser(request,env); const row=await env.DB.prepare(`SELECT avatar_key FROM users WHERE id=? AND status='active'`).bind(avatarImage[1]).first(); if(!row?.avatar_key)return bad('Không có ảnh đại diện.',404);
    const obj=await env.FILES.get(row.avatar_key); if(!obj)return bad('Ảnh đại diện không còn trong kho.',404); const h=new Headers();obj.writeHttpMetadata(h);h.set('cache-control','private, max-age=300');h.set('x-content-type-options','nosniff');return new Response(obj.body,{headers:h});
  }

  if(path==='/api/account/avatar' && method==='POST'){
    const u=await requireUser(request,env); const form=await request.formData(); const file=form.get('avatar');
    const avatarCfg=await getSettings(env),avatarMax=settingNumber(avatarCfg,'account_portrait_max_mb',5,{min:1,max:50});const err=validateUpload(file,{maxMb:avatarMax,mimes:['image/jpeg','image/png','image/webp'],label:'Ảnh đại diện'}); if(err)return bad(err,400);
    const saved=await uploadR2(file,env,'avatars',u.user_id,'private');
    await env.DB.prepare(`UPDATE users SET avatar_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(saved.key,u.user_id).run();
    return ok({avatar_key:saved.key,file_id:saved.id});
  }
  if(path==='/api/account/avatar' && method==='DELETE'){
    const u=await requireUser(request,env); await env.DB.prepare(`UPDATE users SET avatar_key=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(u.user_id).run(); return ok();
  }
  if(path==='/api/account/preferences' && method==='PATCH'){
    const u=await requireUser(request,env); const body=await request.json();
    for(const [k,v] of Object.entries(body||{})){if(!['theme','notifications','accessibility','profile_visibility'].includes(k))continue;await env.DB.prepare(`INSERT INTO user_preferences(user_id,key,value,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(u.user_id,k,String(v).slice(0,1000)).run();}
    return ok();
  }
  if(path==='/api/admin/organizations' && method==='GET'){
    await requireRole(request,env,['super_admin']);
    const rows=await env.DB.prepare(`SELECT o.*,s.plan_code subscription_plan,s.status subscription_status,s.expires_at subscription_expires_at,(SELECT COUNT(*) FROM organization_members om WHERE om.organization_id=o.id AND om.status='active') member_count,(SELECT COUNT(*) FROM classes c WHERE COALESCE(c.organization_id,'sky-first')=o.id) class_count FROM organizations o LEFT JOIN organization_subscriptions s ON s.organization_id=o.id ORDER BY o.created_at DESC`).all().catch(()=>({results:[]}));
    return ok({organizations:rows.results||[]});
  }
  if(path==='/api/admin/organizations' && method==='POST'){
    const admin=await requireRole(request,env,['super_admin']); const b=await request.json();
    const name=str(b.name).slice(0,120), slug=str(b.slug||name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
    if(name.length<2||slug.length<2)return bad('Tên tổ chức chưa hợp lệ.'); const id=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO organizations(id,name,slug,status,plan,created_at,updated_at) VALUES(?,?,?,'active',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(id,name,slug,str(b.plan||'community')).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO organization_subscriptions(organization_id,plan_code,status,source,updated_at) VALUES(?,?,'active',?,CURRENT_TIMESTAMP)`).bind(id,str(b.plan||'community'),str(b.source||'grant')).run();
    await adminLog(env,admin.user_id,'organization.create',{organization_id:id,name,slug}); return ok({id});
  }
  const adminOrg=path.match(/^\/api\/admin\/organizations\/([^/]+)$/);
  if(adminOrg && method==='PATCH'){
    const admin=await requireRole(request,env,['super_admin']); const b=await request.json(); const status=['active','suspended','expired','trial'].includes(b.status)?b.status:null;
    if(!status)return bad('Trạng thái tổ chức không hợp lệ.'); await env.DB.prepare(`UPDATE organizations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,adminOrg[1]).run();
    await adminLog(env,admin.user_id,'organization.status',{organization_id:adminOrg[1],status}); return ok();
  }
  const ent=path.match(/^\/api\/admin\/organizations\/([^/]+)\/entitlements$/);
  if(ent && method==='GET'){
    await requireRole(request,env,['super_admin']); const rows=await env.DB.prepare(`SELECT capability,enabled,quota_value,expires_at,source,updated_at FROM organization_entitlements WHERE organization_id=? ORDER BY capability`).bind(ent[1]).all(); return ok({entitlements:rows.results||[]});
  }
  if(ent && method==='PUT'){
    const admin=await requireRole(request,env,['super_admin']); const b=await request.json(); const items=Array.isArray(b.entitlements)?b.entitlements:[];
    for(const x of items.slice(0,100)){const capability=str(x.capability).slice(0,100);if(!capability)continue;await env.DB.prepare(`INSERT INTO organization_entitlements(organization_id,capability,enabled,quota_value,expires_at,source,updated_at) VALUES(?,?,?,?,?, ?,CURRENT_TIMESTAMP) ON CONFLICT(organization_id,capability) DO UPDATE SET enabled=excluded.enabled,quota_value=excluded.quota_value,expires_at=excluded.expires_at,source=excluded.source,updated_at=CURRENT_TIMESTAMP`).bind(ent[1],capability,x.enabled?1:0,Number.isFinite(Number(x.quota_value))?Number(x.quota_value):null,x.expires_at||null,str(x.source||'override')).run();}
    await adminLog(env,admin.user_id,'organization.entitlements',{organization_id:ent[1],count:items.length}); return ok();
  }
  const usage=path.match(/^\/api\/admin\/organizations\/([^/]+)\/usage$/);
  if(usage && method==='GET'){
    await requireRole(request,env,['super_admin']); const org=usage[1]; const members=await env.DB.prepare(`SELECT COUNT(*) n FROM organization_members WHERE organization_id=? AND status='active'`).bind(org).first().catch(()=>({n:0})); const classes=await env.DB.prepare(`SELECT COUNT(*) n FROM classes WHERE COALESCE(organization_id,'sky-first')=?`).bind(org).first().catch(()=>({n:0})); const custom=await env.DB.prepare(`SELECT metric,value,period_key,updated_at FROM organization_usage WHERE organization_id=?`).bind(org).all().catch(()=>({results:[]})); return ok({members:members?.n||0,classes:classes?.n||0,metrics:custom.results||[]});
  }
  if(path==='/api/organizations/mine' && method==='GET'){
    const u=await requireUser(request,env);
    let rows=(await env.DB.prepare(`SELECT o.id,o.name,o.slug,o.status,o.plan,om.role FROM organizations o JOIN organization_members om ON om.organization_id=o.id WHERE om.user_id=? AND om.status='active' AND o.status='active' ORDER BY o.name`).bind(u.user_id).all()).results||[];
    if(!rows.length)rows=[{id:'sky-first',name:'Sky First Network',slug:'sky-first',status:'active',plan:'community',role:u.role==='super_admin'?'owner':'member'}];
    rows=rows.filter(Boolean).map(o=>({id:str(o.id)||'sky-first',name:str(o.name)||'Sky First Network',slug:str(o.slug)||'sky-first',status:str(o.status)||'active',plan:str(o.plan)||'community',role:str(o.role)||'member'}));for(const o of rows)o.permissions=[...(await effectivePermissions(env,u,o.id))];
    return ok({organizations:rows});
  }
  if(path==='/api/notifications/read-all' && method==='POST'){
    const u=await requireUser(request,env);await env.DB.prepare(`UPDATE notification_center SET is_read=1 WHERE user_id=?`).bind(u.user_id).run().catch(error=>console.error('[notifications read-all]',error));return ok();
  }
  if(path==='/api/calendar' && method==='GET'){
    const u=await requireUser(request,env),org=await requireOrganizationContext(request,env,u);const rows=await env.DB.prepare(`SELECT ce.* FROM calendar_events ce WHERE ce.organization_id=? ORDER BY ce.starts_at LIMIT 200`).bind(org).all();return ok({events:rows.results||[],organization_id:org});
  }
  if(path==='/api/resources' && method==='GET'){
    const u=await requireUser(request,env),org=await requireOrganizationContext(request,env,u),hasOrg=await tableHasColumn(env,'classes','organization_id');const base=`SELECT m.id,m.class_id,m.title,m.created_at,f.id file_id,f.name,f.mime,f.size,c.name class_name FROM materials m JOIN files f ON f.id=m.file_id JOIN classes c ON c.id=m.class_id JOIN class_members cm ON cm.class_id=m.class_id WHERE cm.user_id=? AND cm.status='active' AND c.status!='deleted'`;const rows=hasOrg?await env.DB.prepare(`${base} AND COALESCE(c.organization_id,'sky-first')=? ORDER BY m.created_at DESC LIMIT 100`).bind(u.user_id,org).all():await env.DB.prepare(`${base} ORDER BY m.created_at DESC LIMIT 100`).bind(u.user_id).all();return ok({resources:rows.results||[],organization_id:hasOrg?org:'sky-first'});
  }

  // Learning Operations: actionable calendar, global search, certificates and command center.
  if(path==='/api/calendar' && method==='POST'){
    const u=await requireUser(request,env),org=await requireOrganizationContext(request,env,u);const b=await request.json();
    if(!['super_admin','school_admin','teacher'].includes(u.role))return bad('Không có quyền tạo lịch.',403);
    const title=str(b.title).slice(0,160),starts=str(b.starts_at);if(!title||!starts)return bad('Cần tên và thời gian bắt đầu.');
    const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO calendar_events(id,organization_id,class_id,title,event_type,starts_at,ends_at,status,created_by) VALUES(?,?,?,?,?,?,?,'scheduled',?)`).bind(id,org,str(b.class_id)||null,title,str(b.event_type||'event').slice(0,40),starts,str(b.ends_at)||null,u.user_id).run();
    return ok({id});
  }
  const calendarItem=path.match(/^\/api\/calendar\/([^/]+)$/);
  if(calendarItem && ['PATCH','DELETE'].includes(method)){
    const u=await requireUser(request,env),org=await requireOrganizationContext(request,env,u);if(!['super_admin','school_admin','teacher'].includes(u.role))return bad('Không có quyền quản lý lịch.',403);const current=await env.DB.prepare(`SELECT * FROM calendar_events WHERE id=? AND organization_id=?`).bind(calendarItem[1],org).first();if(!current)return bad('Không tìm thấy sự kiện.',404);if(method==='DELETE'){await env.DB.prepare(`DELETE FROM calendar_events WHERE id=? AND organization_id=?`).bind(current.id,org).run();return ok({deleted:true});}const b=await request.json(),title=str(b.title??current.title).slice(0,160),starts=str(b.starts_at??current.starts_at);if(!title||!starts)return bad('Cần tên và thời gian bắt đầu.');await env.DB.prepare(`UPDATE calendar_events SET title=?,event_type=?,starts_at=?,ends_at=?,status=? WHERE id=? AND organization_id=?`).bind(title,str(b.event_type??current.event_type).slice(0,40)||'event',starts,str(b.ends_at??current.ends_at)||null,['scheduled','cancelled','done'].includes(str(b.status))?str(b.status):current.status,current.id,org).run();return ok({updated:true});
  }

  if(path==='/api/search' && method==='GET'){
    const u=await requireUser(request,env),org=await requireOrganizationContext(request,env,u),term=str(url.searchParams.get('q')).trim();if(term.length<2)return ok({results:[]});const like=`%${term.slice(0,80)}%`;
    const [classes,materials,assignments,exams]=await Promise.all([
      env.DB.prepare(`SELECT c.id,c.name title,'class' type,c.description subtitle FROM classes c JOIN class_members cm ON cm.class_id=c.id WHERE cm.user_id=? AND cm.status='active' AND COALESCE(c.organization_id,'sky-first')=? AND (c.name LIKE ? OR c.description LIKE ?) LIMIT 12`).bind(u.user_id,org,like,like).all().catch(()=>({results:[]})),
      env.DB.prepare(`SELECT m.id,m.class_id,m.title,'resource' type,c.name subtitle FROM materials m JOIN classes c ON c.id=m.class_id JOIN class_members cm ON cm.class_id=c.id WHERE cm.user_id=? AND cm.status='active' AND COALESCE(c.organization_id,'sky-first')=? AND m.title LIKE ? LIMIT 12`).bind(u.user_id,org,like).all().catch(()=>({results:[]})),
      env.DB.prepare(`SELECT a.id,a.class_id,a.title,'assignment' type,c.name subtitle FROM assignments a JOIN classes c ON c.id=a.class_id JOIN class_members cm ON cm.class_id=c.id WHERE cm.user_id=? AND cm.status='active' AND COALESCE(c.organization_id,'sky-first')=? AND a.title LIKE ? LIMIT 12`).bind(u.user_id,org,like).all().catch(()=>({results:[]})),
      env.DB.prepare(`SELECT e.id,e.class_id,e.title,'assessment' type,c.name subtitle FROM exams e JOIN classes c ON c.id=e.class_id JOIN class_members cm ON cm.class_id=c.id WHERE cm.user_id=? AND cm.status='active' AND COALESCE(c.organization_id,'sky-first')=? AND e.title LIKE ? LIMIT 12`).bind(u.user_id,org,like).all().catch(()=>({results:[]}))]);
    return ok({results:[...(classes.results||[]),...(materials.results||[]),...(assignments.results||[]),...(exams.results||[])]});
  }
  if(path==='/api/certificates' && method==='GET'){
    const u=await requireUser(request,env);const rows=await env.DB.prepare(`SELECT id,title,certificate_code,status,issued_at,class_id FROM certificates WHERE user_id=? ORDER BY issued_at DESC LIMIT 100`).bind(u.user_id).all().catch(()=>({results:[]}));return ok({certificates:rows.results||[]});
  }
  if(path==='/api/admin/certificates' && method==='GET'){
    const u=await requireRole(request,env,['super_admin','school_admin']),org=await requireOrganizationContext(request,env,u);const rows=await env.DB.prepare(`SELECT c.id,c.title,c.certificate_code,c.status,c.issued_at,c.revoked_at,c.revoke_reason,c.class_id,u.full_name,u.sfn_id FROM certificates c JOIN users u ON u.id=c.user_id WHERE c.organization_id=? ORDER BY c.issued_at DESC LIMIT 200`).bind(org).all();return ok({certificates:rows.results||[],organization_id:org});
  }
  if(path==='/api/admin/certificates' && method==='POST'){
    const u=await requireRole(request,env,['super_admin','school_admin']);const org=await requireOrganizationContext(request,env,u),b=await request.json(),title=str(b.title).slice(0,160),classId=str(b.class_id)||null;let userId=str(b.user_id);if(!userId&&str(b.login)){const target=await env.DB.prepare(`SELECT id FROM users WHERE lower(email)=lower(?) OR lower(sfn_id)=lower(?) LIMIT 1`).bind(str(b.login),str(b.login)).first();userId=target?.id||''}if(!userId||!title)return bad('Thiếu người nhận hoặc tên ghi nhận.');const memberIds=await organizationUserIds(env,org);if(!memberIds.includes(userId))return bad('Người nhận không thuộc tổ chức hiện tại.',403);if(classId){const classOrg=await classOrganization(env,classId);if(classOrg!==org)return bad('Lớp không thuộc tổ chức hiện tại.',403)}
    const code=`SFCA-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g,'').slice(0,10).toUpperCase()}`,id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO certificates(id,organization_id,user_id,class_id,title,certificate_code,payload_json,issued_by) VALUES(?,?,?,?,?,?,?,?)`).bind(id,org,userId,classId,title,code,JSON.stringify(b.payload||{}),u.user_id).run();await adminLog(env,u.user_id,'certificate.issue',{id,organization_id:org,user_id:userId,certificate_code:code});return ok({id,certificate_code:code});
  }
  const revokeCertificate=path.match(/^\/api\/admin\/certificates\/([^/]+)\/revoke$/);
  if(revokeCertificate && method==='POST'){
    const u=await requireRole(request,env,['super_admin','school_admin']),org=await requireOrganizationContext(request,env,u),cert=await env.DB.prepare(`SELECT id,status,organization_id,certificate_code FROM certificates WHERE id=?`).bind(revokeCertificate[1]).first();if(!cert)return bad('Không tìm thấy chứng nhận.',404);if(cert.organization_id!==org)return bad('Không có quyền thu hồi chứng nhận này.',403);const b=await request.json(),reason=str(b.reason).trim().slice(0,500);if(!reason)return bad('Vui lòng nhập lý do thu hồi.');if(cert.status==='revoked')return ok({revoked:true,already_revoked:true});await env.DB.prepare(`UPDATE certificates SET status='revoked',revoked_at=CURRENT_TIMESTAMP,revoke_reason=? WHERE id=?`).bind(reason,cert.id).run();await adminLog(env,u.user_id,'certificate.revoke',{id:cert.id,organization_id:org,certificate_code:cert.certificate_code,reason});return ok({revoked:true});
  }
  if(path==='/api/command-center' && method==='GET'){
    const u=await requireUser(request,env),org=await requireOrganizationContext(request,env,u);if(!['super_admin','school_admin','teacher'].includes(u.role))return bad('Không có quyền.',403);
    const [classes,upcoming,pending,tickets,notices]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) n FROM classes WHERE COALESCE(organization_id,'sky-first')=? AND status!='deleted'`).bind(org).first().catch(()=>({n:0})),
      env.DB.prepare(`SELECT COUNT(*) n FROM calendar_events WHERE organization_id=? AND datetime(starts_at)>=datetime('now') AND datetime(starts_at)<=datetime('now','+7 days')`).bind(org).first().catch(()=>({n:0})),
      env.DB.prepare(`SELECT COUNT(*) n FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id WHERE COALESCE(c.organization_id,'sky-first')=? AND s.status='submitted' AND s.score IS NULL`).bind(org).first().catch(()=>({n:0})),
      env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets t JOIN users tu ON tu.id=t.requester_user_id WHERE t.status NOT IN ('closed','resolved') AND (EXISTS(SELECT 1 FROM organization_members om WHERE om.user_id=tu.id AND om.organization_id=? AND om.status='active') OR EXISTS(SELECT 1 FROM class_members cm JOIN classes cc ON cc.id=cm.class_id WHERE cm.user_id=tu.id AND cm.status='active' AND COALESCE(cc.organization_id,'sky-first')=?))`).bind(org,org).first().catch(()=>({n:0})),
      env.DB.prepare(`SELECT COUNT(*) n FROM notification_center WHERE is_read=0 AND (user_id=? OR user_id IS NULL)`).bind(u.user_id).first().catch(()=>({n:0}))]);
    return ok({classes:Number(classes?.n||0),upcoming:Number(upcoming?.n||0),pending_grading:Number(pending?.n||0),open_tickets:Number(tickets?.n||0),unread_notifications:Number(notices?.n||0)});
  }
  const fileMatch=path.match(/^\/api\/files\/([^/]+)$/);
  if(fileMatch && method==='GET'){
    const u=await requireUser(request,env); const f=await env.DB.prepare(`SELECT * FROM files WHERE id=?`).bind(fileMatch[1]).first(); if(!f)return bad('Không tìm thấy tệp.',404);
    if(f.visibility==='private' && f.owner_user_id!==u.user_id && u.role!=='super_admin'){let allowed=false;if(u.role==='school_admin'){const org=await requireOrganizationContext(request,env,u);const scoped=await env.DB.prepare(`SELECT 1 ok FROM (SELECT m.file_id,c.organization_id FROM materials m JOIN classes c ON c.id=m.class_id UNION ALL SELECT s.file_id,c.organization_id FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id WHERE s.file_id IS NOT NULL) x WHERE x.file_id=? AND COALESCE(x.organization_id,'sky-first')=? LIMIT 1`).bind(f.id,org).first();allowed=!!scoped}else{const grader=await env.DB.prepare(`SELECT 1 ok FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN class_members cm ON cm.class_id=a.class_id WHERE s.file_id=? AND cm.user_id=? AND cm.status='active' AND cm.role IN ('teacher','assistant') LIMIT 1`).bind(f.id,u.user_id).first();allowed=!!grader}if(!allowed)return bad('Không có quyền.',403); }
    if(f.visibility==='class' && !['super_admin','school_admin'].includes(u.role)){ const allowed=await env.DB.prepare(`SELECT 1 ok FROM materials m JOIN class_members cm ON cm.class_id=m.class_id WHERE m.file_id=? AND cm.user_id=? AND cm.status='active' LIMIT 1`).bind(f.id,u.user_id).first(); if(!allowed) return bad('Không có quyền.',403); }
    const obj=await env.FILES.get(f.r2_key); if(!obj)return bad('Tệp không còn trong kho.',404);
    const headers=new Headers(); obj.writeHttpMetadata(headers); const unsafe=new Set(['text/html','image/svg+xml','application/xhtml+xml','text/javascript','application/javascript']); headers.set('content-disposition',`${unsafe.has(String(f.mime||'').toLowerCase())?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`); headers.set('x-content-type-options','nosniff'); headers.set('cache-control','private, no-store'); if(unsafe.has(String(f.mime||'').toLowerCase()))headers.set('content-security-policy',"sandbox; default-src 'none'"); return new Response(obj.body,{headers});
  }

  return bad(`API không tồn tại: ${method} ${path}`,404,{code:'API_ROUTE_NOT_FOUND',area:'API_ROUTER',method,path});
}

export async function handleApiRequest(request, env, ctx) {
  const url=new URL(request.url); const requestId=crypto.randomUUID();
  try {
    if(!url.pathname.startsWith('/api/')) return secureResponse(bad(`Đường dẫn không thuộc API: ${request.method} ${url.pathname}`,404,{code:'NOT_API_PATH',area:'API_ENTRY',method:request.method,path:url.pathname}),requestId);
    if(request.method==='OPTIONS') return secureResponse(new Response(null,{status:204}),requestId);
    if(!trustedRequestOrigin(request,env)) return secureResponse(bad('Nguồn yêu cầu không hợp lệ.',403,{code:'ORIGIN_NOT_ALLOWED'}),requestId);

    // SETUP/HẠ TẦNG PHẢI CHẠY TRƯỚC SESSION PREFLIGHT.
    // Trình duyệt có thể còn cookie phiên cũ từ một deployment trước. Nếu schema
    // phiên cũ chưa đầy đủ, getSession() có thể lỗi trước khi /api/setup/bootstrap
    // được xử lý và biến mọi lỗi thành 500 chung chung. Các endpoint setup dùng
    // SETUP_TOKEN riêng nên không phụ thuộc vào session người dùng.
    if (url.pathname === '/api/health' || url.pathname.startsWith('/api/setup/')) {
      return secureResponse(await routeApi(request,env,ctx,url),requestId);
    }

    // A production deployment can be pointed at a database created by an older
    // release. Reconcile the canonical schema before session/auth queries so a
    // stale database cannot turn every authenticated route into a generic 500.
    await ensureRuntimeSchema(env);

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
