import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8');
const api=fs.readFileSync('src/index.js','utf8');
const migration=fs.readFileSync('migrations/0027_exam_domain_split.sql','utf8');
const config=JSON.parse(fs.readFileSync('wrangler.json','utf8'));
const checks=[
 ['EXAM_URL points to dedicated domain',config?.vars?.EXAM_URL==='https://exam.skyfirst.io.vn'],
 ['Start uses launch endpoint',app.includes('await launchExamDomain(r.attempt_id)')],
 ['Resume buttons launch directly',app.includes("[data-resume-exam]').forEach(b=>b.onclick=()=>resumeExam(b.dataset.resumeExam))")],
 ['Active attempt launches directly',app.includes('await resumeExam(state.activeExam.attempt_id);return;')],
 ['Legacy internal exam route only delegates to launch',app.includes("if(h.startsWith('exam/'))return state.user?resumeExam(h.split('/')[1]):login()")],
 ['Launch API exists',api.includes('exam-attempts\\/([^/]+)\\/launch') && api.includes('exam_launch_tokens')],
 ['Redeem API exists',api.includes("path==='/api/public/exam-launch/redeem'")],
 ['Launch URL uses configured exam domain',api.includes('env.EXAM_URL') && api.includes('?launch=')],
 ['Token tables migration exists',migration.includes('exam_launch_tokens') && migration.includes('exam_access_tokens')],
 ['No authenticated start path calls runExam',!(/async function startExam[\s\S]{0,800}runExam\(/.test(app))],
];
let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++}
if(fail)process.exit(1);
