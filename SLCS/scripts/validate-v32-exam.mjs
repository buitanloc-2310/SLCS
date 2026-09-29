import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8'),api=fs.readFileSync('src/index.js','utf8'),css=fs.readFileSync('public/styles.css','utf8'),mig=fs.readFileSync('migrations/0014_exam_center_v32.sql','utf8');
const checks=[
 ['Exam Center route',app.includes("h==='exam-center'")&&app.includes('async function examCenter')],
 ['Exam Builder',app.includes('function openExamBuilder')&&app.includes('terminate_on_exit')],
 ['Fullscreen gate',app.includes('requestFullscreen')&&app.includes('GIÁM SÁT TOÀN MÀN HÌNH')],
 ['Strict terminate client',app.includes('/violation')&&app.includes("terminate('Thoát toàn màn hình')")],
 ['Strict terminate server',api.includes("status='terminated'")&&api.includes('attempt.terminated')],
 ['Exam Center API',api.includes("path==='/api/exam-center'")],
 ['Exam Monitor',app.includes('async function examMonitor')&&api.includes('/monitor$/')],
 ['Reopen attempt',api.includes('/reopen$/')&&app.includes('Cho phép tiếp tục')],
 ['Attempt limit',api.includes('max_attempts')&&api.includes('số lượt thi')],
 ['Scheduling',api.includes('opens_at')&&api.includes('closes_at')],
 ['Exam audit schema',mig.includes('exam_audit_log')],
 ['Exam isolated UI',css.includes('.exam-lock')&&css.includes('.exam-main')],
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++}console.log(`V32 EXAM: ${checks.length-fail}/${checks.length}`);if(fail)process.exit(1);
