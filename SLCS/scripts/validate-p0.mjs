import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/app.js'), cls=read('public/classroom/classroom-plus.js'), api=read('src/index.js'), wr=JSON.parse(read('wrangler.json')), pkg=JSON.parse(read('package.json'));
const checks=[
 ['stable external join landing',app.includes('/join.html?class=')&&fs.existsSync('public/join.html')],
 ['fresh token after prejoin',app.indexOf('await runClassroomPrejoin')<app.indexOf("access=guestName")],
 ['realtime service binding',wr.services?.some(x=>x.binding==='LIVE_SERVICE'&&x.service==='sfn-slc-live')],
 ['live worker deploy script',!!pkg.scripts?.['deploy:live']],
 ['websocket error visible',!app.includes('ws.onerror=()=>{}')&&app.includes('Kết nối thời gian thực gặp gián đoạn')],
 ['reconnect refreshes access',app.includes('async function refreshLiveAccess')],
 ['media capability guard',cls.includes('mediaSupported')&&cls.includes('window.isSecureContext')],
 ['in-app browser guidance',cls.includes('inAppBrowser')&&cls.includes('Chrome/Safari')],
 ['server resource URL whitelist',api.includes("!/^https?:\\/\\//i.test(urlv)" )],
 ['client resource URL whitelist',cls.includes('safeHttpUrl')&&cls.includes("['http:','https:'].includes")]
];
let bad=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)bad++}if(bad){console.error(`${bad} P0 checks failed`);process.exit(1)}console.log(`${checks.length}/${checks.length} P0 hardening checks passed`);
