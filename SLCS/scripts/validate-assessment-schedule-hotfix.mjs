import fs from 'node:fs';
const api=fs.readFileSync('src/index.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const checks=[
 ['legacy datetime-local interpreted +07',api.includes("+'+07:00'")&&api.includes('function examTimeMs')],
 ['public assessment status uses normalized schedule',api.includes('openMs=examTimeMs(e.opens_at)')&&api.includes('closeMs=examTimeMs(e.closes_at)')],
 ['authenticated exam start uses normalized schedule',api.includes("if(openMs&&now<openMs)return bad('Kỳ thi chưa mở.'")],
 ['new schedule values sent as ISO',app.includes('localDateTimeToIso')&&app.includes('opens_at:localDateTimeToIso(meta.opens_at)')&&app.includes('closes_at:localDateTimeToIso(meta.closes_at)')]
];
for(const [n,ok] of checks)console.log(ok?'PASS':'FAIL',n);
if(checks.some(x=>!x[1]))process.exit(1);
console.log(`ASSESSMENT SCHEDULE HOTFIX: ${checks.length}/${checks.length} PASS`);
