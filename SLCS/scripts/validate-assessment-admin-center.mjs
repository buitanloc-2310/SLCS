import fs from 'node:fs';
const api=fs.readFileSync('src/index.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const checks=[
 ['admin assessment API',api.includes("path==='/api/admin/assessment-center'")],
 ['admin role guard',api.includes("['super_admin','school_admin','account_admin']")],
 ['admin assessment route',app.includes("h==='admin-assessments'")],
 ['control center shortcut',app.includes('data-go="admin-assessments"')],
 ['central exam manager',app.includes('async function adminAssessmentCenter()')],
 ['open close controls',app.includes('data-admin-status')],
 ['monitor control',app.includes('data-admin-monitor')],
 ['public link control',app.includes('data-admin-copy')],
 ['archive delete control',app.includes('data-admin-delete')],
 ['personal/admin surfaces separated',app.includes('Trung tâm Đánh giá của tôi')&&app.includes('adminCreateAssessment')],
];
let n=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok)process.exitCode=1; else n++;}
console.log(`ASSESSMENT ADMIN CENTER: ${n}/${checks.length} PASS`);
