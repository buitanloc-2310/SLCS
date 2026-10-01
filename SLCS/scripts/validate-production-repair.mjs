import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/app.js'), api=read('src/index.js'), schema=read('src/schema-v11.js');
const examInsert=api.match(/INSERT INTO exams\([\s\S]*?\) VALUES\(([^`]+)\)`/)?.[0]||'';
const cols=(examInsert.match(/INSERT INTO exams\(([^)]+)\)/)?.[1]||'').split(',').filter(Boolean).length;
const values=(examInsert.match(/VALUES\(([^`]*)\)`$/)?.[1]||'').split(',').filter(Boolean).length;
const checks=[
 ['class detail isolates optional API failures',app.includes('const optional=await Promise.allSettled([api(`/api/classes/${id}/posts`)')&&app.includes('classLoadErrors')&&app.includes('fallback=arr(listing.classes).find')],
 ['exam INSERT column/value arity',cols===26&&values===26],
 ['fresh installer includes assessment migration',schema.includes('0018_assessment_max_v37')],
 ['fresh installer includes website studio migration',schema.includes('0019_website_studio_v38')],
 ['fresh installer includes operations migration',schema.includes('0020_operations_v39')],
 ['installer tolerates already-applied ADD COLUMN',api.includes('duplicate column name')],
 ['admin class access fallback',api.includes("['school_admin','super_admin'].includes(admin.role)")],
 ['safeHttpUrl still defined',app.indexOf('function safeHttpUrl(')>=0&&app.indexOf('function safeHttpUrl(')<app.indexOf('function footer(')],
 ['repair cache bust',(read('public/index.html').includes('/app.js?v=40.0.1')&&app.includes('/ui-system.js?v=40.0.1'))||(read('public/index.html').includes('/app.js?build=20261001-media-assessment-repair')&&app.includes('/ui-system.js?build=20261001-media-assessment-repair'))]
];
let bad=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)bad++;}console.log(`PRODUCTION REPAIR: ${checks.length-bad}/${checks.length} PASS`);if(bad)process.exit(1);
