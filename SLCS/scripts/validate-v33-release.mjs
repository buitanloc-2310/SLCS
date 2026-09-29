import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/styles.css','utf8')+'\n'+fs.readFileSync('public/auth-shell.css','utf8');
const backend=fs.readFileSync('src/index.js','utf8');
const checks=[
 ['Header editable',app.includes('site_header_title')&&backend.includes('site_header_title')],
 ['Footer links editable',app.includes("link('ctt'")&&app.includes("link('zalo'")&&backend.includes('footer_ctt_url')&&backend.includes('footer_zalo_url')],
 ['Footer hides raw URL labels',app.includes("link('ctt','Cổng thông tin'")],
 ['Theme governance',app.includes('--site-primary:')&&app.includes('site_background_color')],
 ['Authenticated shell',fs.existsSync('public/auth-shell.css')&&css.includes('.shell.is-auth')],
 ['Exam center route',app.includes("h==='exam-center'")],
 ['Strict fullscreen exam',app.includes('requestFullscreen')&&app.includes('fullscreenchange')],
 ['Exam server close path',backend.includes('terminate')&&backend.includes('exam')],
 ['No assistant UI/API',!/(Sky First AI|\/api\/ai|sfn-ai|data-ai)/i.test(app+backend)],
 ['No legacy purple placeholder',!css.includes('217,70,239')],
 ['Website editor',app.includes('Trình chỉnh sửa website')],
 ['Class management',app.includes('Quản lý thành viên')||app.includes('Thành viên')],
];
let pass=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(ok)pass++}
console.log(`V33 RELEASE GATE: ${pass}/${checks.length}`); if(pass!==checks.length)process.exit(1);
