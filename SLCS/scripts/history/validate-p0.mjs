import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/app.js'), cls=read('public/classroom/classroom-plus.js'), api=read('src/index.js'), live=read('src/live-room.js'), v13=read('src/v13-platform.js'), wr=JSON.parse(read('wrangler.json'));
const checks=[
 ['stable external join landing',app.includes('/join.html?class=')&&fs.existsSync('public/join.html')],
 ['fresh token after prejoin',app.indexOf('await runClassroomPrejoin')<app.indexOf("access=guestName")],
 ['Pages realtime fallback endpoint',api.includes('live_signal_events')&&api.includes("transport:'pages-d1'")],
 ['Pages realtime fallback client',app.includes('startRealtimeFallback')&&app.includes('/events?token=')],
 ['websocket failure falls back',app.includes('ws.onerror=()=>')&&app.includes('startRealtimeFallback()')],
 ['reconnect refreshes access',app.includes('async function refreshLiveAccess')],
 ['media capability guard',cls.includes('mediaSupported')&&cls.includes('window.isSecureContext')],
 ['in-app browser guidance',cls.includes('inAppBrowser')&&cls.includes('Chrome/Safari')],
 ['server resource URL whitelist',api.includes("https?:\\/\\//i.test(urlv)")],
 ['client resource URL whitelist',cls.includes('safeHttpUrl')&&cls.includes("['http:','https:'].includes")],
 ['independent reaction/hand/pulse controls',v13.includes('allow_hand_raise')&&v13.includes('allow_class_pulse')&&cls.includes('v13HandRaise')&&cls.includes('v13ClassPulse')],
 ['websocket hand permission independent',live.includes("['raise-hand','lower-hand'].includes(msg.type)&&!Number(roomSettings.allow_hand_raise)")&&live.includes("msg.type==='class-pulse'&&!Number(roomSettings.allow_class_pulse)")],
 ['fallback hand permission independent',api.includes("['raise-hand','lower-hand'].includes(type)&&!Number(liveSettings.allow_hand_raise)")&&api.includes("type==='class-pulse'&&!Number(liveSettings.allow_class_pulse)")],
 ['live admin organization isolation',api.includes("if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,classId); const member")&&api.includes("if(['school_admin','super_admin'].includes(u.role))await requireClassOrganizationAccess(request,env,u,classId); const m")],
 ['live schema fails closed',live.includes('Không thể khởi tạo dữ liệu phòng học')&&live.includes('Không thể tải thiết lập phòng học')],
 ['live entitlement verification fails closed',live.includes('Không thể xác minh quyền sử dụng phòng học')],
];
let bad=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)bad++}if(bad){console.error(`${bad} P0 checks failed`);process.exit(1)}console.log(`${checks.length}/${checks.length} P0 hardening checks passed`);
