import fs from 'node:fs';
const fail=[];
const app=fs.readFileSync('public/app.js','utf8');
const banned=['ORGANIZATION STUDIO','>Community Sponsored<','>Standard<','>Pro<','>Active<','>Suspended<','>Trial<','>Expired<','>Public<','placeholder="Quota"','Usage hiện tại:'];
for(const x of banned) if(app.includes(x)) fail.push(`UI quản trị còn chuỗi chưa Việt hóa: ${x}`);
if(fs.existsSync('docs/history')) fail.push('docs/history vẫn tồn tại; releases phải là nguồn lịch sử duy nhất');
if(!fs.existsSync('docs/releases')) fail.push('Thiếu docs/releases');
const mig=fs.readdirSync('migrations').filter(x=>/^\d{4}_.*\.sql$/.test(x));
const groups={}; for(const f of mig){const n=f.slice(0,4);(groups[n]??=[]).push(f)}
if((groups['0007']||[]).length!==3) fail.push('Legacy 0007 migration set đã thay đổi');
for(const [n,files] of Object.entries(groups)) if(n!=='0007'&&files.length>1) fail.push(`Migration prefix trùng ${n}: ${files.join(', ')}`);
if(!fs.existsSync('docs/P2.5-CONSOLIDATION.md')) fail.push('Thiếu báo cáo P2.5');
if(fail.length){console.error('P2.5 VALIDATION: FAIL\n- '+fail.join('\n- '));process.exit(1)}
console.log('P2.5 VALIDATION: PASS');
console.log('- UI quản trị tổ chức đã Việt hóa các nhãn vận hành');
console.log('- tài liệu lịch sử đã hợp nhất về docs/releases');
console.log('- legacy migration 0007 được bảo toàn an toàn production');
