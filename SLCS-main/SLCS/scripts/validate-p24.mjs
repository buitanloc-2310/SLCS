import fs from 'node:fs';
const api=fs.readFileSync('src/index.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const media=fs.readFileSync('public/classroom/media-client.js','utf8');
const beauty=fs.readFileSync('public/classroom/beauty-engine.js','utf8');
const headers=fs.readFileSync('public/_headers','utf8');
const tests=[
 ['P2 canonical validator accepts cache-busted classroom modules',fs.readFileSync('scripts/validate-p2.mjs','utf8').includes('classroom-plus\\.js(?:\\?')&&fs.readFileSync('scripts/validate-p2.mjs','utf8').includes('media-client\\.js(?:\\?')],
 ['beauty entitlement requires authenticated user',api.includes("if(path==='/api/beauty/me' && method==='GET')")&&api.includes('const u=await requireUser(request,env)')],
 ['beauty entitlement is identity-scoped',api.includes('BEAUTY_OWNER_USER_ID')&&api.includes('String(u.user_id)===ownerId')],
 ['guest never receives beauty entitlement',app.includes("const beautyAccess=!guestName?")&&app.includes("{allowed:false,enabled:false,config:{}}")],
 ['beauty never processes audio',!beauty.includes('AudioContext')&&!beauty.includes('getAudioTracks')],
 ['beauty never processes display capture',!beauty.includes('getDisplayMedia')&&!beauty.includes('screenTrack')],
 ['email logs are admin protected',api.includes("path==='/api/admin/email-logs'")&&api.includes("['super_admin','account_admin']")],
 ['public account request cannot self-assign admin',api.includes("requested_access:['student','teacher'].includes")],
 ['account duplicate email guard',api.includes('SELECT sfn_id,status FROM users WHERE lower(email)=lower(?)')],
 ['remote media cleanup remains present',app.includes('remoteMissingPolls')&&app.includes('discoverSfuTracks')],
 ['network recovery remains present',app.includes("window.addEventListener('online',onlineRecovery)")&&app.includes('recoverIce')],
 ['screen and beauty are isolated',app.includes("publishSfu(outbound,'camera')")&&beauty.includes('captureStream')],
 ['static asset cache remains bounded',headers.includes('max-age=300')&&headers.includes('/index.html')&&headers.includes('no-cache')],
 ['no legacy SFU client restored',!fs.existsSync('public/classroom/sfu-client.js')&&!fs.existsSync('public/classroom/v13-classroom.js')]
];
let bad=0;for(const [name,ok] of tests){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)bad++}
if(bad){console.error(`P2.4 HARDENING: ${tests.length-bad}/${tests.length} PASS`);process.exit(1)}
console.log(`P2.4 HARDENING: ${tests.length}/${tests.length} PASS`);
