/** Functional regression checks against an ephemeral SQLite D1 adapter.
 * Requires Node >=22.13; never connects to a production database. */
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {handleApiRequest} from '../src/index.js';
const sqlite=new DatabaseSync(':memory:');
class Statement{
 constructor(sql,values=[]){this.sql=sql;this.values=values}
 bind(...values){return new Statement(this.sql,values)}
 async first(){return sqlite.prepare(this.sql).get(...this.values)||null}
 async all(){return {results:sqlite.prepare(this.sql).all(...this.values),success:true}}
 async run(){const info=sqlite.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:Number(info.changes),last_row_id:Number(info.lastInsertRowid)}}}
}
const DB={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const env={DB,SETUP_TOKEN:'local-regression-token',APP_URL:'https://slc.test',EXAM_URL:'https://exam.skyfirst.io.vn'};
const pending=[];const ctx={waitUntil:p=>pending.push(p)};let cookie='';let checks=0;
async function call(path,{method='GET',body,headers={}}={}){
 const req=new Request('https://slc.test'+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const res=await handleApiRequest(req,env,ctx);const json=await res.json();return {res,json};
}
async function pass(name,fn){await fn();checks++;console.log('PASS '+name)}
await pass('fresh installer runs all canonical schema stages',async()=>{const r=await call('/api/setup/install',{method:'POST',body:{setup_token:env.SETUP_TOKEN}});assert.equal(r.res.status,200,JSON.stringify(r.json));assert.equal(sqlite.prepare("PRAGMA integrity_check").get().integrity_check,'ok')});
await pass('bootstrap administrator and preserve password whitespace',async()=>{const r=await call('/api/setup/bootstrap',{method:'POST',body:{setup_token:env.SETUP_TOKEN,full_name:'Kiểm thử',email:'admin@example.test',password:' StrongPassword123! '}});assert.equal(r.res.status,200,JSON.stringify(r.json))});
await pass('bad password denied',async()=>{const r=await call('/api/auth/login',{method:'POST',body:{login:'admin@example.test',password:'wrong'}});assert.equal(r.res.status,401)});
await pass('login creates secure session',async()=>{const r=await call('/api/auth/login',{method:'POST',body:{login:'admin@example.test',password:' StrongPassword123! '}});assert.equal(r.res.status,200,JSON.stringify(r.json));const h=r.res.headers.get('set-cookie');assert.match(h,/HttpOnly; Secure; SameSite=Lax/);cookie=h.split(';')[0]});
await pass('profile and optional malformed unrelated cookie',async()=>{const r=await call('/api/auth/me',{headers:{cookie:cookie+'; broken=%E0%A4%A'}});assert.equal(r.res.status,200);assert.equal(r.json.user.full_name,'Kiểm thử')});
await pass('expired ISO session denied within same UTC day',async()=>{const token=cookie.split('=')[1];sqlite.prepare('UPDATE sessions SET expires_at=? WHERE token=?').run(new Date(Date.now()-60000).toISOString(),token);const r=await call('/api/auth/me');assert.equal(r.json.user,null);sqlite.prepare('UPDATE sessions SET expires_at=? WHERE token=?').run(new Date(Date.now()+86400000).toISOString(),token)});
let classId;
await pass('create class and read class detail',async()=>{const r=await call('/api/classes',{method:'POST',body:{name:'Lớp kiểm thử',description:'Dữ liệu kiểm thử'}});assert.equal(r.res.status,200,JSON.stringify(r.json));classId=r.json.id;const d=await call('/api/classes/'+classId);assert.equal(d.res.status,200,JSON.stringify(d.json))});
for(const path of ['/api/organizations/mine','/api/classes','/api/calendar','/api/resources','/api/notifications','/api/support/tickets','/api/admin/stats','/api/admin/users',...['posts','materials','assignments','exams','gradebook/categories','attendance','learning-summary','chat','events'].map(x=>`/api/classes/${classId}/${x}`)]){
 await pass('GET '+path,async()=>{const r=await call(path);assert.equal(r.res.status,200,JSON.stringify(r.json))});
}
let examId;
await pass('create draft exam and progress through publishing states',async()=>{const r=await call(`/api/classes/${classId}/exams`,{method:'POST',body:{title:'Bài kiểm thử',questions:[{id:'q1',type:'mcq',question:'2 + 2 = ?',options:['3','4'],answer:'4',points:1}],public_access:true}});assert.equal(r.res.status,200,JSON.stringify(r.json));examId=r.json.id;for(const status of ['review','approved','published']){const r=await call('/api/exams/'+examId,{method:'PATCH',body:{status}});assert.equal(r.res.status,200,JSON.stringify(r.json))}});
await pass('exam questions never disclose correct answer on start',async()=>{const r=await call(`/api/exams/${examId}/start`,{method:'POST',body:{}});assert.equal(r.res.status,200,JSON.stringify(r.json));assert.ok(r.json.exam.questions.length);assert.equal('answer' in r.json.exam.questions[0],false);const s=await call(`/api/exam-attempts/${r.json.attempt_id}/submit`,{method:'POST',body:{answers:{q1:'4'}}});assert.equal(s.res.status,200,JSON.stringify(s.json));assert.equal(s.json.score,1)});
await pass('public guest attempt starts, saves and submits with correct score',async()=>{
 const token=sqlite.prepare('SELECT public_token FROM exams WHERE id=?').get(examId).public_token;
 const r=await call(`/api/public/assessments/${token}/start`,{method:'POST',body:{full_name:'Học viên thử',email:'guest@example.test',candidate_code:'TEST01',class_name:'Lớp thử'}});assert.equal(r.res.status,200,JSON.stringify(r.json));
 const headers={authorization:`Bearer ${r.json.access_key}`};
 const read=await call(`/api/public/exam-attempts/${r.json.attempt_id}`,{headers});assert.equal(read.res.status,200,JSON.stringify(read.json));
 for(const action of ['save','submit']){const x=await call(`/api/public/exam-attempts/${r.json.attempt_id}/${action}`,{method:'POST',headers,body:{answers:{q1:'4'}}});assert.equal(x.res.status,200,JSON.stringify(x.json));if(action==='submit')assert.equal(x.json.score,1)}
});
await pass('cross-organization appeal cannot be modified',async()=>{
 sqlite.prepare("INSERT INTO organizations(id,name,slug,status) VALUES('other','Other','other','active')").run();
 sqlite.prepare("UPDATE classes SET organization_id='other' WHERE id=?").run(classId);
 const userId=sqlite.prepare('SELECT id FROM users LIMIT 1').get().id;
 sqlite.prepare("INSERT INTO assessment_appeals(id,attempt_id,user_id,reason,status) VALUES('appeal-test',?,?, 'Test','open')").run(sqlite.prepare('SELECT id FROM exam_attempts WHERE exam_id=?').get(examId).id,userId);
 const r=await call('/api/admin/assessment-appeals/appeal-test',{method:'PATCH',body:{status:'resolved',resolution:'No'}});assert.equal(r.res.status,403,JSON.stringify(r.json));assert.equal(sqlite.prepare("SELECT status FROM assessment_appeals WHERE id='appeal-test'").get().status,'open');
 sqlite.prepare("UPDATE classes SET organization_id='sky-first' WHERE id=?").run(classId);const allowed=await call('/api/admin/assessment-appeals/appeal-test',{method:'PATCH',body:{status:'resolved',resolution:'Đã kiểm tra'}});assert.equal(allowed.res.status,200,JSON.stringify(allowed.json));
});
await pass('change password preserves whitespace and rejects old value',async()=>{const r=await call('/api/account/password',{method:'POST',body:{current_password:' StrongPassword123! ',new_password:' NextPassword123! '}});assert.equal(r.res.status,200,JSON.stringify(r.json));const next=await call('/api/auth/login',{method:'POST',body:{login:'admin@example.test',password:' NextPassword123! '}});assert.equal(next.res.status,200,JSON.stringify(next.json));const old=await call('/api/auth/login',{method:'POST',body:{login:'admin@example.test',password:' StrongPassword123! '}});assert.equal(old.res.status,401)});
await pass('logout invalidates session',async()=>{const r=await call('/api/auth/logout',{method:'POST',body:{}});assert.equal(r.res.status,200);const me=await call('/api/auth/me');assert.equal(me.json.user,null)});
// Client functions execute in isolation, with real Fetch responses and controlled requests.
const appSource=fs.readFileSync('public/app.js','utf8');
const apiChunk=appSource.slice(appSource.indexOf('const _apiInflight'),appSource.indexOf('function esc'));
await pass('client rejects successful non-JSON response',async()=>{const sandbox={state:{user:null},AbortController,setTimeout,clearTimeout,FormData,fetch:async()=>new Response('<html>Error</html>')};vm.createContext(sandbox);vm.runInContext(apiChunk+';globalThis.testApi=api',sandbox);await assert.rejects(sandbox.testApi('/api/x'),/Phản hồi hệ thống không hợp lệ/)});
await pass('client rejects JSON null and arrays without shell TypeError',async()=>{for(const value of [null,[]]){const sandbox={state:{user:null},AbortController,setTimeout,clearTimeout,FormData,fetch:async()=>Response.json(value)};vm.createContext(sandbox);vm.runInContext(apiChunk+';globalThis.testApi=api',sandbox);await assert.rejects(sandbox.testApi('/api/x'),/Phản hồi hệ thống không hợp lệ/)}});
await pass('client isolates GET cache by authenticated user',async()=>{let n=0;const sandbox={state:{user:{id:'a'},organizationId:'sky-first'},AbortController,setTimeout,clearTimeout,FormData,fetch:async()=>Response.json({ok:true,count:++n})};vm.createContext(sandbox);vm.runInContext(apiChunk+';globalThis.testApi=api',sandbox);assert.equal((await sandbox.testApi('/api/x',{cacheTtl:5000})).count,1);sandbox.state.user={id:'b'};assert.equal((await sandbox.testApi('/api/x',{cacheTtl:5000})).count,2)});
await pass('client normalizes database UTC and legacy Vietnam schedule',async()=>{
 const fn=appSource.slice(appSource.indexOf('function safeDate('),appSource.indexOf('function formatDateTime'));
 const sandbox={};vm.createContext(sandbox);vm.runInContext(fn+';globalThis.safeDate=safeDate',sandbox);
 assert.equal(sandbox.safeDate('2026-10-05 09:00:00').toISOString(),'2026-10-05T09:00:00.000Z');
 assert.equal(sandbox.safeDate('2026-10-05T09:00').toISOString(),'2026-10-05T02:00:00.000Z');assert.equal(sandbox.safeDate(null),null);
});
await pass('login prevents double submission and restores form after failure',async()=>{
 const button={disabled:false,textContent:''},msg={innerHTML:'',textContent:''};const form={dataset:{},querySelector:selector=>{assert.ok(!selector.includes('!='));return selector==='#msg'?msg:button}};
 const toggle={};const dom={innerHTML:''};let calls=0,rejectRequest;
 class TestFormData{*[Symbol.iterator](){yield ['login','admin@example.test'];yield ['password',' secret ']}}
 const sandbox={app:dom,shell:x=>x,esc:x=>String(x),bindNav:()=>{},$:q=>q==='#loginForm'?form:toggle,FormData:TestFormData,api:async()=>{calls++;await new Promise((resolve,reject)=>rejectRequest=reject)},loadMe:async()=>({id:'test'}),loadOrganizations:async()=>{},location:{hash:'#login'},render:async()=>{}};
 vm.createContext(sandbox);const fn=appSource.slice(appSource.indexOf('function login()'),appSource.indexOf('function requestAccount()'));vm.runInContext(fn+';login()',sandbox);
 assert.match(dom.innerHTML,/for="loginPassword"/);assert.match(dom.innerHTML,/aria-live="polite"/);
 const event={preventDefault(){},currentTarget:form};const first=form.onsubmit(event);await form.onsubmit(event);assert.equal(calls,1);assert.equal(button.disabled,true);
 rejectRequest(new Error('Network unavailable'));await first;assert.equal(button.disabled,false);assert.equal(form.dataset.pending,undefined);assert.match(msg.innerHTML,/Network unavailable/);
});
await Promise.allSettled(pending);sqlite.close();console.log(`RUNTIME REGRESSION: ${checks}/${checks} PASS`);
