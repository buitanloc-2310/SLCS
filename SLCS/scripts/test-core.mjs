import fs from 'node:fs';
import { renderMarkdownSafe } from '../public/core/markdown.js';
import { createScreenShareController } from '../public/classroom/screen-share.js';
let pass=0, fail=0;
const test=(name,ok,detail='')=>{if(ok){pass++;console.log('PASS',name)}else{fail++;console.error('FAIL',name,detail)}};
const md=[
 ['bold',renderMarkdownSafe('**Lộc nào**').includes('<strong>Lộc nào</strong>')],
 ['italic',renderMarkdownSafe('*Tọa Đàm*').includes('<em>Tọa Đàm</em>')],
 ['bold italic',renderMarkdownSafe('***Sky First***').includes('<strong><em>Sky First</em></strong>')],
 ['escaped markers',!renderMarkdownSafe('\\*\\*Lộc\\*\\*').includes('**') && renderMarkdownSafe('\\*\\*Lộc\\*\\*').includes('<strong>Lộc</strong>')],
 ['xss escaped',!renderMarkdownSafe('<img src=x onerror=alert(1)>').includes('<img')]
];
for(const [n,ok] of md)test('AI markdown: '+n,ok);
const app=fs.readFileSync('public/app.js','utf8');
const live=fs.readFileSync('src/live-room.js','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
test('System Admin role precedence',app.includes("['super_admin','school_admin'].includes(accountRole)?accountRole"));
test('Panel closed by default',app.includes('meeting-panel panel-hidden'));
test('Participant density state',app.includes("stage.dataset.density=total<=1?'solo':total<=4?'small':total<=12?'medium':'large'"));
test('Host broadcasts include admins',live.includes("['teacher','assistant','school_admin','super_admin'].includes(p.role)"));
test('SFU room default target is 50',live.includes("transport === 'sfu' ? 50"));
test('Light-sky design foundation',css.includes('--sfn-page:') && css.includes('background:var(--sfn-page)!important'));
test('Large-room visual density exists',css.includes('.meeting-stage[data-density="large"]'));

test('Realtime payload capped at 32KB',live.includes("evt.data.length > 32_000"));
test('Realtime per-client rate limiter',live.includes('allowMessage(sender,msg.type)'));
test('Slow websocket backpressure guard',live.includes('bufferedAmount||0) > 1_000_000'));
test('Reconnect replaces same-token ghost',live.includes('this.tokenPeers.get(tokenKey)'));
test('Client heartbeat every 20s',app.includes("type:'heartbeat'") && app.includes('20000'));
const media=fs.readFileSync('public/classroom/media-client.js','utf8');
test('Media recovery circuit breaker',media.includes('this.failureCount>=3'));
test('ICE recovery cooldown',media.includes('now-this.lastRecoveryAt<5000'));

test('Adaptive media budget by network',app.includes('function mediaBudget()') && app.includes('effectiveType') && app.includes('saveData'));
test('SFU discovery prioritizes screen and hosts',app.includes("t.source==='screen'?0") && app.includes("['super_admin','school_admin','teacher','assistant'].includes(t.role)"));
test('Roster renders in one fragment',app.includes('document.createDocumentFragment()'));
test('Roster role labels are human readable',app.includes('roleLabel(p.role'));
test('Presentation layout prioritizes screen',css.includes('.meeting-stage:has(.screen-tile)'));
test('Large room tiles use content visibility',css.includes('content-visibility:auto'));
test('SFU can unsubscribe stale video tracks',media.includes('async unsubscribe(metaOrKey)') && media.includes("operation: 'unsubscribe'"));
test('SFU rebalances subscriptions after network budget changes',media.includes('rebalanceVideoSubscriptions') && media.includes('this.rebalanceVideoSubscriptions().catch'));
test('Classroom supports pinned media focus',app.includes('pinnedMediaKey') && app.includes('applyStageFocus()'));
test('Large camera sets are paged',app.includes('VIDEO_PAGE_SIZE=') && app.includes('live_video_page_size') && app.includes('applyVideoPage()'));
test('SFU discovery prunes non-selected video',app.includes('rebalanceVideoSubscriptions(seen)'));
test('Duplicate live access assignment removed',!app.includes('access=guestName\n      access=guestName'));

test('Stale realtime clients are evicted',live.includes('sweepStaleClients') && live.includes('75_000') && live.includes('heartbeat-timeout'));
test('Attendance is visible to system and school admins',fs.readFileSync('src/index.js','utf8').includes("['teacher','assistant','school_admin','super_admin'].includes(member.role)) attendance="));
test('SFU samples WebRTC network health',media.includes('sampleNetworkHealth') && media.includes("type==='inbound-rtp'") && media.includes('currentRoundTripTime'));
test('SFU has graceful quality tiers',media.includes("critical:2,low:4,balanced:8,normal:12") && media.includes('setQualityTier'));
test('Hidden tabs reduce video budget',app.includes('document.hidden?2:mediaBudget()') && app.includes('visibilitychange'));
test('Classroom periodically adapts to network health',app.includes('sampleClassroomNetwork') && app.includes('8000'));


test('Room message faults are isolated per client',live.includes('messageErrors') && live.includes("type:'room-warning'"));
test('Host moderation obeys role hierarchy',live.includes('const canModerate=') && live.includes("type:'host-denied'"));
test('Roster carries media and network state',live.includes('media:p.media||{}') && live.includes("network:p.network||'unknown'"));
test('Clients publish network tier to room',app.includes("type:'network-state',tier:health.tier"));
test('People panel shows live device/network state',app.includes('const media=p.media||{}') && app.includes("net==='critical'"));
const plus=fs.readFileSync('public/classroom/classroom-plus.js','utf8');
test('Host panel renders attendance data',plus.includes('v13AttendanceList') && plus.includes('r.attendance||[]'));



test('Roster updates carry monotonic sequence',live.includes('this.rosterSeq') && live.includes("count:roster.length,seq"));
test('Stale roster snapshots are ignored by client',app.includes('lastRosterSeq') && app.includes('Number(m.seq)<lastRosterSeq'));
test('Bulk moderation respects role hierarchy',live.includes("['mute','camera-off','lower-hand'].includes(action)") && live.includes('!canModerate(p)'));
test('Active speaker uses local WebRTC audio stats',media.includes('sampleActiveSpeaker') && media.includes('audioLevel') && media.includes('remoteMidToKey'));
test('Active speaker does not override manual pin',app.includes("!pinnedMediaKey&&key===activeSpeakerKey"));
test('Network online event triggers immediate reconnect',app.includes("addEventListener('online',onNetworkOnline)") && app.includes('connectRealtime()'));
test('Stale sweep only rebroadcasts roster after change',live.includes('if(changed)this.broadcastRoster()'));



test('Room lifecycle persists lock/end state',live.includes("storage?.put('roomState'") && live.includes("action==='end-room'"));
test('Locked room rejects non-host joins',live.includes("this.roomState.locked && !lifecycleHost") && live.includes("status: 423"));
test('Ended room rejects non-host joins',live.includes("this.roomState.ended && !lifecycleHost") && live.includes("status: 410"));
test('Only teacher/admin can end or lock room',live.includes("const lifecycleHost=['teacher','school_admin','super_admin'].includes(role)"));
test('Host UI exposes room lifecycle controls',plus.includes('data-host="lock-room"') && plus.includes('data-host="end-room"'));
test('SFU host priority includes system/school admins',media.includes("['super_admin','school_admin','teacher','assistant'].includes(meta.role)"));




test('Student screen share permission is server-enforced',live.includes("msg.source==='screen'&&!Number(roomSettings.allow_student_share)"));
test('Realtime media-state only accepts known sources',live.includes("!['mic','camera','screen'].includes(msg.source)"));
test('Bulk mic/camera actions require confirmation',plus.includes("confirm('Tắt micro") && plus.includes("confirm('Tắt camera"));
test('Dangerous moderation actions are audited',live.includes("moderation.${action}") && live.includes("moderation.remove"));
test('AI and class content share the Markdown renderer',fs.readFileSync('public/ai/vplus-ai.js','utf8').includes("../core/markdown.js") && app.includes("./core/markdown.js"));
test('Public content blocks are configurable from Admin',app.includes('public_teacher_title') && app.includes('public_show_safety') && app.includes('public_cta_title'));
test('Class workspace presentation is configurable',app.includes('class_show_sidebar') && app.includes('class_default_tab'));
test('Sky First AI can be disabled without editing source',fs.readFileSync('src/index.js','utf8').includes("getSystemSetting(env,'ai_enabled','1')") && app.includes("state.site?.ai_enabled!=='0'"));
test('Email template has no embedded megabyte base64 logo',!fs.readFileSync('public/email-templates/account-request-received.html','utf8').includes('data:image/png;base64'));

// Real lifecycle unit test for screen sharing: start -> app stop -> restart -> browser stop -> restart -> leave.
let publishCount=0,unpublishCount=0,previewCount=0,stateEvents=[];
function fakeTrack(){
  const handlers=new Map();
  return {readyState:'live',onended:null,addEventListener:(n,fn)=>handlers.set(n,fn),removeEventListener:(n,fn)=>{if(handlers.get(n)===fn)handlers.delete(n)},stop(){this.readyState='ended'},end(){this.readyState='ended';(handlers.get('ended')||this.onended)?.()}};
}
let currentTrack=null;
const screen=createScreenShareController({
  getDisplayMedia:async()=>{currentTrack=fakeTrack();return {getVideoTracks:()=>[currentTrack]};},
  publish:async()=>{publishCount++;return {sessionId:'s',trackName:'t'+publishCount,source:'screen'}},
  unpublish:async()=>{unpublishCount++},
  onPreview:t=>{previewCount+=t?1:0},
  onState:s=>stateEvents.push(s.reason)
});
await screen.start();
test('Screen lifecycle start activates controller',screen.active&&publishCount===1);
await screen.stop('user');
test('Screen lifecycle app stop unpublishes and resets',!screen.active&&unpublishCount===1);
await screen.start();currentTrack.end();await new Promise(r=>setTimeout(r,0));
test('Screen lifecycle browser stop unpublishes and resets',!screen.active&&unpublishCount===2);
await screen.start();await screen.destroy();
test('Screen lifecycle leave cleanup is idempotent',!screen.active&&unpublishCount===3);
await screen.destroy();
test('Screen lifecycle duplicate cleanup does not double-unpublish',unpublishCount===3);
console.log(`CORE TESTS: ${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
