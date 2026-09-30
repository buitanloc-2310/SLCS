import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const idx=read('src/index.js'), sfu=read('src/realtime-sfu.js'), media=read('public/classroom/media-client.js'), app=read('public/app.js');
const checks=[
 ['Assessment V40 readiness fields',/assessment_type,time_limit_enabled,public_access,public_token,hide_schedule,require_email_verify,shuffle_questions,shuffle_options,updated_at/.test(idx)],
 ['Guest attempt readiness table',/SELECT access_key,full_name,email,candidate_code,class_name,status,answers_json,event_log_json(?:,[^`]+)? FROM exam_guest_attempts LIMIT 0/.test(idx)],
 ['Runtime schema repair before auth',/await ensureRuntimeSchema\(env\);/.test(idx)],
 ['Duplicate-column repair tolerated',/duplicate column name/i.test(idx)],
 ['Media status requires live token',/\/api\/live\/media\/status/.test(idx)&&/requireLiveAccess\(env,classId,b\.access_token\)/.test(idx)],
 ['Media access token minted',/\/api\/live\/access-token/.test(app)],
 ['Media status sends minted token',/media\/status[\s\S]{0,180}access_token:access\.token/.test(app)],
 ['SFU credentials server-side only',/REALTIME_APP_SECRET/.test(sfu)&&!/REALTIME_APP_SECRET/.test(media)],
 ['SFU session create',/sessions\/new/.test(sfu)&&/media\/session\/new/.test(media)],
 ['SFU publish and subscribe',/operation:'publish'/.test(media)&&/operation:'subscribe'/.test(media)],
 ['ICE recovery',/restartIce/.test(media)&&/recoverIce/.test(media)],
 ['Media heartbeat',/heartbeat/.test(media)],
];
let n=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)n++;}
console.log(`MEDIA + ASSESSMENT HOTFIX: ${n}/${checks.length} PASS`);if(n!==checks.length)process.exit(1);
