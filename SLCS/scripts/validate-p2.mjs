import fs from 'node:fs'; import path from 'node:path';
const fail=[];
const exists=p=>fs.existsSync(p);
for(const legacy of ['public/classroom/v13-classroom.js','public/classroom/sfu-client.js']) if(exists(legacy)) fail.push(`Legacy module vẫn tồn tại: ${legacy}`);
const app=fs.readFileSync('public/app.js','utf8');
if(!/import\(\s*[\"']\/classroom\/classroom-plus\.js(?:\?[^\"']*)?[\"']\s*\)/.test(app)) fail.push('classroom-plus chưa là classroom module duy nhất');
if(!/import\(\s*[\"']\/classroom\/media-client\.js(?:\?[^\"']*)?[\"']\s*\)/.test(app)) fail.push('media-client chưa là media module duy nhất');
const mig=fs.readdirSync('migrations').filter(x=>/^\d{4}_.*\.sql$/.test(x));
const groups={}; for(const f of mig){const n=f.slice(0,4);(groups[n]??=[]).push(f)}
for(const [n,files] of Object.entries(groups)) if(files.length>1 && n!=='0007') fail.push(`Migration prefix trùng mới ${n}: ${files.join(', ')}`);
if((groups['0007']||[]).length!==3) fail.push('Legacy 0007 migration set đã bị thay đổi; cần migration compatibility review');
const root=fs.readdirSync('.').filter(x=>/^(V\d|VPLUS|UPGRADE)/.test(x)); if(root.length) fail.push(`Historical release docs còn ở root: ${root.join(', ')}`);
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); if(!String(pkg.version).includes('p2')) fail.push('Package chưa mang P2 release marker');
if(fail.length){console.error('P2 VALIDATION: FAIL\n- '+fail.join('\n- '));process.exit(1)}
console.log('P2 VALIDATION: PASS');
console.log(`- ${mig.length} migrations audited; legacy 0007 set frozen`);
console.log('- legacy classroom/SFU frontend modules removed');
console.log('- release documentation archived under docs/releases');
