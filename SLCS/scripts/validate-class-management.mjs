import fs from 'node:fs';
const api=fs.readFileSync('src/index.js','utf8');
const ui=fs.readFileSync('public/app.js','utf8');
const checks=[
 ['class member ids exposed for moderation',/SELECT cm\.user_id,cm\.role,u\.sfn_id/],
 ['class-local add member API',/classMemberManage[\s\S]*method==='POST'/],
 ['class-local remove member API',/classMemberManage[\s\S]*method==='DELETE'/],
 ['owner protected from member removal',/Không thể xóa giáo viên sở hữu lớp/],
 ['class delete API',/classDelete[\s\S]*method==='DELETE'/],
 ['class delete owner\/admin guard',/Chỉ giáo viên sở hữu lớp hoặc quản trị được xóa lớp/],
 ['deleted class hidden from my classes',/cm\.status='active' AND c\.status!='deleted'/],
 ['deleted class hidden from admin list',/WHERE c\.status!='deleted' ORDER BY c\.created_at/],
 ['deleted class GET returns 404',/if\(!cls\) return bad\('Không tìm thấy lớp\.',404\)/],
 ['member management UI',/id="classAddMember"/],
 ['remove member UI',/data-remove-class-member/],
 ['delete class UI',/id="deleteClassBtn"/],
 ['destructive confirmation',/Nhập XOA để xác nhận/],
];
let pass=0;for(const [name,re] of checks){const ok=re.test(name.includes('UI')||name.includes('confirmation')?ui:api)||(re.test(ui));console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}
console.log(`CLASS MANAGEMENT: ${pass}/${checks.length}`);if(pass!==checks.length)process.exit(1);
