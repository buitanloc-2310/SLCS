import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const idx=read('src/index.js'), sfu=read('src/realtime-sfu.js'), media=read('public/classroom/media-client.js'), app=read('public/app.js'), room=read('src/live-room.js'), css=read('public/styles.css');
const count=(s,re)=>(s.match(re)||[]).length;
const checks=[
 ['Assessment V42 readiness fields',/assessment_type,time_limit_enabled,public_access,public_token,hide_schedule,require_email_verify,shuffle_questions,shuffle_options,updated_at,version_no,blueprint_json,result_policy,scope_level/.test(idx)],
 ['Guest attempt readiness table',/SELECT access_key,full_name,email,candidate_code,class_name,status,answers_json,event_log_json,question_snapshot_json,extra_time_minutes,invalidated_at FROM exam_guest_attempts LIMIT 0/.test(idx)],
 ['Runtime schema repair before auth',/await ensureRuntimeSchema\(env\);/.test(idx)],
 ['Media status requires live token',/\/api\/live\/media\/status/.test(idx)&&/requireLiveAccess\(env,classId,b\.access_token\)/.test(idx)],
 ['SFU credentials server-side only',/REALTIME_APP_SECRET/.test(sfu)&&!/REALTIME_APP_SECRET/.test(media)],
 ['SFU ICE gathering helper',/_waitForIceGathering/.test(media)&&/iceGatheringState==='complete'/.test(media)],
 ['Publish waits ICE and sends localDescription',/setLocalDescription\(offer\);[\s\S]{0,180}_waitForIceGathering\(\);[\s\S]{0,120}localOffer=this\.pc\.localDescription/.test(media)],
 ['Subscribe waits ICE and sends gathered local answer',/setLocalDescription\(answer\);await this\._waitForIceGathering\(\);const localAnswer=this\.pc\.localDescription/.test(media)&&/sdp:localAnswer\.sdp/.test(media)],
 ['ICE recovery waits gathering',/createOffer\(\{iceRestart:true\}\)[\s\S]{0,180}_waitForIceGathering\(\)/.test(media)],
 ['Forced SFU track close uses MID',/tracks: clean, force: true/.test(sfu)&&/map\(t=>String\(t\?\.mid/.test(sfu)],
 ['Per-track SFU failures surfaced',/trackFailures=.*errorCode/.test(idx)&&/REALTIME_TRACK_ERROR/.test(idx)],
 ['Live connection status visible',/id="connectionLabel"/.test(app)&&/const setConnection=\(label=/.test(app)&&!/#connectionLabel,.meeting-live-dot\{display:none/.test(css)],
 ['Speaker output errors surfaced',/applyOutputDevice/.test(app)&&/Không thể chuyển sang loa đã chọn/.test(app)&&!/setSinkId\(e\.target\.value\)\}catch\{\}/.test(app)],
 ['Heartbeat failures surfaced and recover',/heartbeatFailures/.test(app)&&/recover after heartbeat/.test(app)],
 ['Same account devices receive unique peer keys',/user:\$\{row\.user_id\}:\$\{tokenDevice\}/.test(idx)],
 ['D1 signaling fallback advertised',/signaling_transport:env\.LIVE_ROOM\?'websocket':'pages-d1'/.test(idx)&&/signalingTransport==='pages-d1'/.test(app)],
 ['Fallback supports classroom V13 events',/class-pulse','whisper','ask-later','timer','poll-live','network-state/.test(idx)],
 ['Fallback whisper/pulse restricted to hosts',/delivered_to_hosts/.test(idx)&&/role IN \('teacher','assistant','school_admin','super_admin'\)/.test(idx)],
 ['All host roles receive DO host messages',/\['teacher','assistant','school_admin','super_admin'\]\.includes\(p\.role\)/.test(room)],
 ['Guest violations can terminate',/guest_attempt\.terminated/.test(idx)&&/status='terminated'/.test(idx)],
 ['Guest expiry persisted',/UPDATE exam_guest_attempts SET status='expired'/.test(idx)],
 ['Guest extra time applied',/Number\(a\.extra_time_minutes\|\|0\)/.test(idx)&&/Number\(old\.extra_time_minutes\|\|0\)/.test(idx)],
 ['Guest max attempts enforced',/SELECT COUNT\(\*\) n FROM exam_guest_attempts[\s\S]{0,220}max_attempts/.test(idx)],
 ['Assessment snapshots and shuffle active',/function examQuestionSnapshot/.test(idx)&&/shuffleQuestions\?cryptoShuffle/.test(idx)&&count(idx,/examQuestionSnapshot\(e\.question_json,e\.shuffle_questions,e\.shuffle_options\)/g)>=2],
 ['Strict/fullscreen/terminate stored independently',/b\.strict_mode\?1:0/.test(idx)&&/b\.fullscreen_required\?1:0,b\.terminate_on_exit\?1:0/.test(idx)&&/fullscreenRequired=!!exam\.fullscreen_required,terminateOnExit=!!exam\.terminate_on_exit/.test(app)],
 ['Result policy enforced and response redacted',/function assessmentScoreVisible/.test(idx)&&/score:visible\?score:null,max_score:visible\?max:null/.test(idx)],
 ['Publish-later has admin publication action',/publish_results===true/.test(idx)&&/data-admin-publish-results/.test(app)],
 ['Only one notifications GET route',count(idx,/path==='\/api\/notifications' && method==='GET'/g)===1],
];
let n=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)n++;}
console.log(`MEDIA + ASSESSMENT REPAIR: ${n}/${checks.length} PASS`);if(n!==checks.length)process.exit(1);
