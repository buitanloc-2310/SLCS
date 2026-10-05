import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8'), api=fs.readFileSync('src/index.js','utf8'), mig=fs.readFileSync('migrations/0022_assessment_center_complete.sql','utf8');
const checks={
'public assessment invitation':api.includes('publicAssessment=path.match')&&app.includes('publicAssessmentInvite'),
'guest identity fields':['full_name','email','candidate_code','class_name'].every(x=>app.includes(`name="${x}"`)),
'guest start email':api.includes('Thông báo từ Trung tâm Đánh giá Sky First'),
'guest submit receipt email':api.includes('Xác nhận hoàn thành bài đánh giá'),
'flexible no time limit':mig.includes('time_limit_enabled')&&app.includes('Không giới hạn thời gian'),
'public schedule privacy':mig.includes('hide_schedule')&&api.includes('hide_schedule?null'),
'public link token':mig.includes('public_token')&&app.includes('Sao chép link thi'),
'guest autosave API':api.includes('(save|submit|violation)')&&app.includes("examApi('/save')"),
'responsive exam CSS':fs.readFileSync('public/styles.css','utf8').includes('@media(max-width:760px)'),
'custom modal start':app.includes('slcConfirm')&&!app.includes("if(!confirm('Bắt đầu hoạt động đánh giá?"),
'exam delete archive lifecycle':api.includes("status='archived'")&&app.includes('data-delete-exam'),
'300 question import':app.includes('found.slice(0,300)')&&api.includes('questions.slice(0,300)'),
};let n=0;for(const [k,v] of Object.entries(checks)){console.log(v?'PASS':'FAIL',k);if(v)n++;}console.log(`ASSESSMENT CENTER: ${n}/${Object.keys(checks).length} PASS`);if(n!==Object.keys(checks).length)process.exit(1);
