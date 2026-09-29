import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/app.js');
const api=read('src/index.js');
const ui=read('public/ui-system.js');
const idx=read('public/index.html');
const headers=read('public/_headers');
const wrangler=JSON.parse(read('wrangler.json'));
const pkg=JSON.parse(read('package.json'));
const checks=[
  ['V40 production version',String(pkg.version).startsWith('40.0.0-p2-production')],
  ['V40 cache bust',idx.includes('/app.js?v=40.0.0')&&idx.includes('/design-system.css?v=40.0.0')&&app.includes('/ui-system.js?v=40.0.0')],
  ['safeHttpUrl runtime guard',app.indexOf('function safeHttpUrl(')>=0&&app.indexOf('function safeHttpUrl(')<app.indexOf('function footer(')&&app.includes("['http:','https:'].includes(u.protocol)")],
  ['API collection runtime hardening',app.includes('function arr(v)')&&app.includes('arr(emails.logs).slice')&&app.includes('arr(activity.activity).slice')&&app.includes('arr(diagnostics.checks).map')],
  ['Operations route uses admin shell',ui.includes("'admin-operations':'admin'")],
  ['Origin/CSRF guard',api.includes('function trustedRequestOrigin(')&&api.includes("code:'ORIGIN_NOT_ALLOWED'")],
  ['HSTS API headers',api.includes("'strict-transport-security':'max-age=31536000; includeSubDomains'")],
  ['HSTS static headers',headers.includes('Strict-Transport-Security: max-age=31536000; includeSubDomains')],
  ['PBKDF2 v2 hardening',api.includes('PASSWORD_KDF_ITERATIONS=210000')&&api.includes('passwordNeedsUpgrade')],
  ['Cryptographic join codes',api.includes("crypto.getRandomValues(a)")&&!api.includes("function slugCode(prefix='CLS') { return `${prefix}-${Math.random()")],
  ['Strong temporary password',api.includes("return `SFN@${body}!`")],
  ['Production debug logs gated',app.includes('function debugLog(')&&!app.includes('console.log(')&&!read('public/classroom/media-client.js').includes('console.log(')],
  ['No public assistant/AI surface',!/sky first ai|\/api\/ai|OPENAI_|AI_API_KEY|vplus-ai|sfn-ai|ai-compose/i.test(app+api)],
  ['No browser secrets embedded',!/RESEND_API_KEY\s*=|REALTIME_APP_SECRET\s*=|SETUP_TOKEN\s*=/.test(app+read('public/classroom/media-client.js'))],
  ['Production APP_URL',String(wrangler?.vars?.APP_URL||'').startsWith('https://')&&!String(wrangler?.vars?.APP_URL||'').includes('localhost')],
  ['Slim runtime assets',!fs.existsSync('public/email-templates/account-request-received.html')&&!fs.existsSync('public/assets/sky-first-logo.png')&&fs.existsSync('public/assets/sky-first-logo-ui.webp')]
];
let bad=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)bad++;}
console.log(`V40 PRODUCTION: ${checks.length-bad}/${checks.length} PASS`);
if(bad)process.exit(1);
