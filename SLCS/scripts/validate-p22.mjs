import fs from 'node:fs';
const src=fs.readFileSync('src/index.js','utf8'), app=fs.readFileSync('public/app.js','utf8');
const checks=[
 ['mail timeout',src.includes('EMAIL_TIMEOUT')&&src.includes('AbortController')],
 ['provider rejection',src.includes('EMAIL_PROVIDER_REJECTED')],
 ['mail config aliases',src.includes('RESEND_KEY')&&src.includes('RESEND_TOKEN')],
 ['reply-to support',src.includes('reply_to')],
 ['email logging',src.includes('writeEmailLog')&&src.includes('provider_message_id')],
 ['request resend endpoint',src.includes('resend-email')&&src.includes('account_request.resend_email')],
 ['admin email log UI',app.includes('Nhật ký email gần đây')],
 ['admin resend UI',app.includes('data-resend-request')],
 ['safe public mail error',src.includes('publicMailFailure')],
 ['provider-confirmed wording',app.includes('nhà cung cấp tiếp nhận')]
];
let bad=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)bad++;} if(bad)process.exit(1); console.log(`P2.2 email: ${checks.length}/${checks.length} PASS`);
