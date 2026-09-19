import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const passes=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const pass=m=>passes.push(m);
const fail=m=>failures.push(m);

const required=[
  'src/index.js','src/live-room.js','src/realtime-sfu.js','src/vplus-platform.js',
  'public/app.js','public/classroom/media-client.js','public/classroom/classroom-plus.js',
  'public/ai/vplus-ai.js','migrations/0010_vplus_foundation.sql','wrangler.json'
];
for(const f of required) exists(f)?pass(`required: ${f}`):fail(`missing: ${f}`);

const frontendFiles=['public/app.js','public/classroom/media-client.js','public/classroom/classroom-plus.js','public/ai/vplus-ai.js'];
const frontend=frontendFiles.map(f=>read(f)).join('\n');
for(const [label,re] of [
  ['old SFU API path',/\/api\/live\/sfu\//i],
  ['old V13 live API path',/live-v13/i],
  ['old V13 classroom filename',/v13-classroom\.js/i],
  ['visible mesh fallback phrase',/Mesh dự phòng/i],
  ['visible SFU status phrase',/SFU\s*[·:]/i],
  ['legacy reconnect version phrase',/(?:V13 đang tự nối lại|V13 không kết nối được|V13[^\n]{0,20}Mesh dự phòng)/i]
]) re.test(frontend)?fail(`frontend leakage: ${label}`):pass(`no frontend leakage: ${label}`);

for(const secret of ['REALTIME_APP_SECRET','AI_API_KEY','AI_RESEARCH_API_KEY']) {
  frontend.includes(secret)?fail(`secret identifier exposed in public code: ${secret}`):pass(`secret absent from public code: ${secret}`);
}

const app=read('public/app.js');
app.includes("import('/ai/vplus-ai.js')")?pass('AI client is lazy-loaded'):fail('AI client lazy-load missing');
app.includes("import('/classroom/media-client.js')")?pass('media client is lazy-loaded'):fail('media client lazy-load missing');
app.includes("if(!wsOnline&&!document.hidden)loadHttpChat()")?pass('HTTP chat polling is fallback-only'):fail('chat polling optimization missing');
app.includes("state.user.role==='super_admin'?'<button class=\"btn\" data-admin-tab=\"system\"")
  ? pass('system tab is super-admin gated') : fail('system tab super-admin gate not found');
app.includes("state.user?.role!=='super_admin') document.querySelector('#adm-system')?.remove()")
  ? pass('system pane removed for non-system-admin') : fail('system pane removal gate not found');

const server=read('src/index.js');
for(const route of ['/api/admin/system/diagnostics','/api/admin/system/live-metrics','/api/admin/ai/status','/api/admin/ai/test']) {
  server.includes(route)?pass(`system endpoint exists: ${route}`):fail(`system endpoint missing: ${route}`);
}
if(/path === '\/api\/health'[\s\S]{0,180}service:'Sky First School', status:'available'/.test(server)) pass('public health endpoint is minimal');
else fail('public health endpoint is not minimal as expected');

const ai=read('src/vplus-platform.js');

const indexHtml=read('public/index.html');
indexHtml.includes('qrcode.min.js')?fail('QR library is still render-blocking'):pass('QR library is not render-blocking');
exists('public/assets/sky-first-logo-ui.webp')?pass('optimized UI logo exists'):fail('optimized UI logo missing');
exists('public/_headers')?pass('Pages static cache headers exist'):fail('Pages static cache headers missing');
app.includes('const _apiInflight=new Map()')?pass('duplicate GET request coalescing enabled'):fail('GET request coalescing missing');
app.includes('loadQrLibrary')?pass('QR library lazy loader enabled'):fail('QR lazy loader missing');
app.includes("if(!document.hidden)discoverSfuTracks()")?pass('hidden-page SFU discovery suppression enabled'):fail('SFU hidden-page suppression missing');
ai.includes("if(usedWeb&&[400,404,422].includes(r.status))")?pass('AI research graceful fallback enabled'):fail('AI research graceful fallback missing');
ai.includes("if([500,502,503,504].includes(r.status))")?pass('AI transient retry enabled'):fail('AI transient retry missing');
ai.includes("String(env?.AI_API_KEY||'').trim()")?pass('AI API key is normalized before auth'):fail('AI API key normalization missing');
ai.includes("https://api.openai.com/v1/me")?pass('OpenAI auth probe exists'):fail('OpenAI auth probe missing');
server.includes('testAiAuthentication')?pass('System Admin AI test separates authentication'):fail('AI auth diagnostic route missing');
for(const token of ['hasPermission','requirePermission','consumeAiQuota','auditAi','fetchResearchSources','aiProviderConfig','aiSupportsNativeResearch','openai_responses','web_search'])
  ai.includes(token)?pass(`AI guard present: ${token}`):fail(`AI guard missing: ${token}`);

// Resolve static relative imports and /public imports in JS modules.
function walk(dir){
  const out=[];
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) out.push(...walk(p));
    else if(ent.isFile()&&p.endsWith('.js')) out.push(p);
  }
  return out;
}
const jsFiles=[...walk(path.join(root,'src')),...walk(path.join(root,'public')),...walk(path.join(root,'functions'))];
const importRe=/\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
for(const f of jsFiles){
  const txt=fs.readFileSync(f,'utf8');
  let m;
  while((m=importRe.exec(txt))){
    const spec=m[1];
    if(spec.startsWith('http')||spec.startsWith('node:')) continue;
    let target;
    if(spec.startsWith('/')) target=path.join(root,'public',spec.slice(1));
    else if(spec.startsWith('.')) target=path.resolve(path.dirname(f),spec);
    else continue;
    if(!fs.existsSync(target)) fail(`broken import: ${path.relative(root,f)} -> ${spec}`);
  }
}
if(!failures.some(x=>x.startsWith('broken import:'))) pass('static imports resolve');

// Catch named-import/export mismatches in local modules (a syntax-only check cannot detect these).
const namedImportRe=/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
for(const f of jsFiles){
  const txt=fs.readFileSync(f,'utf8'); let m;
  while((m=namedImportRe.exec(txt))){
    const spec=m[2]; if(!(spec.startsWith('.')||spec.startsWith('/'))) continue;
    const target=spec.startsWith('/')?path.join(root,'public',spec.slice(1)):path.resolve(path.dirname(f),spec);
    if(!fs.existsSync(target)) continue;
    const targetText=fs.readFileSync(target,'utf8');
    for(const raw of m[1].split(',')){
      const imported=raw.trim().split(/\s+as\s+/)[0].trim(); if(!imported) continue;
      const exportRe=new RegExp(`(?:export\\s+(?:async\\s+)?(?:function|class|const|let|var)\\s+${imported}\\b|export\\s*\\{[^}]*\\b${imported}\\b[^}]*\\})`);
      if(!exportRe.test(targetText)) fail(`missing named export: ${path.relative(root,f)} imports ${imported} from ${spec}`);
    }
  }
}
if(!failures.some(x=>x.startsWith('missing named export:'))) pass('named imports match local exports');

console.log(`VPLUS validation: ${passes.length} checks passed`);
for(const p of passes) console.log(`  PASS ${p}`);
if(failures.length){
  console.error(`VPLUS validation FAILED: ${failures.length}`);
  for(const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log('VPLUS validation PASSED');
