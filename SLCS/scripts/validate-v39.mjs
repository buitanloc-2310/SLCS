import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/app.js'), api=read('src/index.js'), mig=read('migrations/0020_operations_v39.sql'), pkg=JSON.parse(read('package.json'));
const checks=[
 ['safeHttpUrl runtime helper exists',/function safeHttpUrl\(/.test(app)],
 ['V39 operations route exists',app.includes("admin-operations")&&app.includes('operationsCenter')],
 ['IAM schema exists',mig.includes('custom_roles')&&mig.includes('role_permissions')&&mig.includes('user_role_assignments')],
 ['Automation schema exists',mig.includes('automation_rules')&&mig.includes('automation_runs')],
 ['Analytics schema exists',mig.includes('analytics_events')],
 ['IAM API exists',api.includes("/api/admin/v39/roles")],
 ['Automation API exists',api.includes("/api/admin/v39/automations")],
 ['Analytics API exists',api.includes("/api/admin/v39/analytics")],
 ['Organization scope enforced',api.includes('requireOrganizationContext(request,env,admin)')],
 ['V39 version',String(pkg.version).startsWith('39.0.0') || String(pkg.version).startsWith('40.0.0')]
];
let bad=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)bad++}console.log(`V39 ${checks.length-bad}/${checks.length}`);if(bad)process.exit(1);
