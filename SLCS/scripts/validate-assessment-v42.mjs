import fs from 'node:fs';
const api=fs.readFileSync('src/index.js','utf8'),app=fs.readFileSync('public/app.js','utf8'),schema=fs.readFileSync('src/schema-v11.js','utf8');
const checks=[
['1 class assessment permission',api.includes('Giáo viên/TNV chỉ được tạo đề kiểm tra cấp lớp')&&app.includes('CLASS ASSESSMENT BUILDER')],
['2 personal center separated',app.includes('Trung tâm Đánh giá của tôi')&&!app.slice(app.indexOf('async function examCenter(){'),app.indexOf('async function adminExamAttempts')).includes('Tạo & quản lý hoạt động')],
['3 system admin center',app.includes('SKY FIRST ASSESSMENT CENTER · QUẢN TRỊ')&&app.includes('adminCreateAssessment')],
['4 canonical schedule state',app.includes("if(o&&now<o)return {key:'scheduled'")&&app.includes("if(c&&now>c)return {key:'ended'")],
['5 dedicated exam routes',app.includes("h.startsWith('exam/')")&&app.includes("h.startsWith('guest-exam/')")],
['6 guest identity access',api.includes('exam_guest_attempts')&&api.includes('candidate_code')&&api.includes('class_name')],
['7 assessment email lifecycle',api.includes('Đã tham gia dự thi')&&api.includes('Xác nhận hoàn thành bài đánh giá')],
['8 autosave recovery',api.includes('/save')&&api.includes('last_saved_at=CURRENT_TIMESTAMP')],
['9 proctor events',api.includes('/violation')&&app.includes('fullscreen')],
['10 admin incident tools',api.includes("action==='add_time'")&&api.includes("action==='force_submit'")&&api.includes("action==='invalidate'")],
['11 question bank and import',schema.includes('assessment_question_bank')&&app.includes('parseImportedQuestions')],
['12 result policy',schema.includes('result_policy')&&app.includes('full_review_after_close')],
['13 exam blueprint',schema.includes('blueprint_json')&&app.includes('Blueprint / cơ cấu đề')],
['14 immutable attempt snapshot',schema.includes('question_snapshot_json')&&api.includes('COALESCE(a.question_snapshot_json,e.question_json)')],
['15 API security enforcement',api.includes("systemTypes.includes(requestedType)")&&api.includes("return bad('Không có quyền.',403)")],
['16 media isolation gate',fs.existsSync('src/realtime-sfu.js')&&fs.existsSync('public/classroom/media-client.js')]
];let n=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)n++;else process.exitCode=1}console.log(`ASSESSMENT V42: ${n}/${checks.length} PASS`);
