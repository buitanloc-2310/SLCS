import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8'), api=fs.readFileSync('src/index.js','utf8'), beauty=fs.readFileSync('public/classroom/beauty-engine.js','utf8');
const tests=[
 ['beauty entitlement API',api.includes("/api/beauty/me")&&api.includes('BEAUTY_OWNER_USER_ID')],
 ['beauty hidden without entitlement',app.includes('beautyAllowed=beautyAccess?.allowed===true')],
 ['beauty module lazy load',app.includes('loadBeautyModule')&&app.includes('beauty-engine.js?v=20260920-p23-beauty1')],
 ['camera publishes processed track',app.includes("await applyBeauty({republish:false})")],
 ['beauty can restore raw camera',app.includes("stopBeauty({restorePublish:true})")],
 ['audio not processed',!beauty.includes('AudioContext')&&!beauty.includes('getAudioTracks')],
 ['screen not processed',!beauty.includes('getDisplayMedia')&&!beauty.includes('screenTrack')],
 ['local processing canvas',beauty.includes('captureStream')&&beauty.includes('workCanvas')&&beauty.includes('outputCanvas')],
 ['owner UI',app.includes('Beauty Studio')&&app.includes('Chỉ khả dụng cho tài khoản được cấp riêng')],
 ['cache marker',fs.readFileSync('public/index.html','utf8').includes('p23-beauty1')]
];
let bad=0;for(const [n,ok] of tests){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)bad++}if(bad)process.exit(1);console.log(`P2.3 Beauty: ${tests.length}/${tests.length} PASS`);
