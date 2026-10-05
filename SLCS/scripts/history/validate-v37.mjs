import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8'), api=fs.readFileSync('src/index.js','utf8'), mig=fs.readFileSync('migrations/0018_assessment_max_v37.sql','utf8');
const checks=[
 ['safeHttpUrl defined before footer',/function safeHttpUrl\(/.test(app)&&app.indexOf('function safeHttpUrl(')<app.indexOf('function footer(')],
 ['safeHttpUrl protocol whitelist',app.includes("['http:','https:'].includes(u.protocol)")],
 ['question types extended',api.includes("'essay','fill','multi','matching','ordering'")],
 ['fill auto grading',api.includes("type==='fill'||type==='short'")&&api.includes('autoScoreQuestions')],
 ['question bank schema',mig.includes('assessment_question_bank')],
 ['sections schema',mig.includes('assessment_sections')],
 ['manual grading schema',mig.includes('assessment_manual_grades')],
 ['appeals schema',mig.includes('assessment_appeals')],
 ['receipt schema',mig.includes('assessment_receipts')],
];
let fail=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++} console.log(`V37 ${checks.length-fail}/${checks.length}`); if(fail)process.exit(1);
