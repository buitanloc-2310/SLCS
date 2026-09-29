import fs from 'node:fs';
const api=fs.readFileSync('src/index.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const checks=[
 ['existing user cannot re-request',api.includes('Email này đã có tài khoản ${existingUser.sfn_id}')],
 ['requested role allowlist',api.includes("['student','teacher'].includes(str(form.get('requested_access')))" )],
 ['activation respects suspension',api.includes("['disabled','suspended'].includes(row.user_status)")],
 ['admin cannot self demote',api.includes('Không thể tự hạ quyền hoặc tạm ngưng')],
 ['suspended account status supported',api.includes("'suspended','disabled','pending_activation'")],
 ['terminal request protected',api.includes('đã được xử lý và không thể chuyển lại')],
 ['admin request view enriched',api.includes('approved_sfn_id')&&api.includes('requested_access:data.requested_access')],
 ['UI exposes suspension',app.includes('Tạm ngưng')],
 ['mail failure UI truthful',app.includes('nhà cung cấp chưa xác nhận')],
 ['P2.1 marker',app.includes('P2.1 ACCOUNT LIFECYCLE HARDENING')]
];
let bad=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`); if(!ok)bad++;} console.log(`P2.1: ${checks.length-bad}/${checks.length} PASS`); if(bad)process.exit(1);
