import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/app.js'), api=read('src/index.js'), css=read('public/styles.css'), media=read('public/classroom/media-client.js'), live=read('src/live-room.js'), classroom=read('public/classroom/classroom-plus.js');
let migrationPass=true,migrationCount=0,migrationIntegrity='unknown';
try{const db=new DatabaseSync(':memory:');const migrations=fs.readdirSync('migrations').filter(x=>/^\d+.*\.sql$/.test(x)).sort();migrationCount=migrations.length;for(const f of migrations)db.exec(read(`migrations/${f}`));migrationIntegrity=db.prepare('PRAGMA integrity_check').get()?.integrity_check||'unknown';migrationPass=migrationIntegrity==='ok';db.close()}catch(e){migrationPass=false;console.error('Migration gate:',e.message)}
const checks=[
 ['Public home',/function publicHome|public-hero/.test(app)],['Account request',/reqForm/.test(app)&&/account-requests/.test(api)],['Request lookup',/lookup/.test(app)],['Login',/login/.test(app)],['Dashboard',/dashboard/.test(app)],['Classes',/class-grid|class-card/.test(app)],['Calendar',/calendar/.test(app)],['Resources',/resources/.test(app)],['Support',/support/.test(app)],['Notifications',/notifications/.test(app)],['Account/profile',/account-chip/.test(app)],['Admin',/data-go="admin"/.test(app)],['Live room',/async function liveRoom/.test(app)],['Guest live',/guestLiveEntry/.test(app)],['Mic/camera',/micSelect/.test(app)&&/camSelect/.test(app)],['Screen share',/screen-share|screenShare|shareScreen/i.test(app)],['Chat',/chatInput/.test(app)],['People panel',/panelPeople/.test(app)],['Teacher control',/teacherControlBtn/.test(app)],['Confidence camera',/confidenceMirror/.test(app)],['Panic hide',/panicHide/.test(app)],['Beauty gated',/beautyAllowed/.test(app)],['Exam flow',/submitExam/.test(app)],
 ['Adaptive video runtime',/_adaptiveTick/.test(media)&&/setParameters/.test(media)&&/adaptiveMeshTick/.test(app)],
 ['Anonymous pulse enforced',/allow_anonymous_pulse/.test(live)&&/pulseSettings/.test(api)&&/v13AnonymousAllowed/.test(classroom)],
 ['Support conversation runtime',/support_ticket_messages/.test(api)&&/data-ticket-open/.test(app)&&/data-admin-ticket-chat/.test(app)],
 ['Certificate verify + revoke',/publicCertificate/.test(api)&&/revokeCertificate/.test(api)&&/verify-certificate/.test(app)],
 ['Public settings allowlist',/PUBLIC_SETTING_KEYS/.test(api)&&/publicSettings/.test(api)],
 ['Password KDF v3',/PASSWORD_KDF_VERSION='v3'/.test(api)&&/PASSWORD_KDF_ITERATIONS=100000/.test(api)&&/parsePasswordSaltSpec/.test(api)],
 ['Grade change audit',/INSERT INTO grade_change_log/.test(api)],
 ['Assessment receipts runtime',/INSERT INTO assessment_receipts/.test(api)],
 ['Scoped grants runtime',/FROM scoped_role_grants/.test(api)],
 ['Private file organization scope',/x\.file_id=\? AND COALESCE\(x\.organization_id/.test(api)],
 ['Class organization isolation',/requireClassOrganizationAccess\(request,env,u,id\)/.test(api)&&/organization_members WHERE organization_id=\? AND user_id=\?/.test(api)],
 ['Join code organization guard',/Lớp không thuộc tổ chức hiện tại/.test(api)&&/access_mode FROM class_settings/.test(api)],
 ['Attendance starts unmarked',/status,marked_by\) VALUES\(\?,\?,'unmarked',NULL\)/.test(api)],
 ['Fresh DB migrations',migrationPass&&migrationCount===28&&migrationIntegrity==='ok'],['Canonical final UX',/FINAL UX CANONICAL LAYER/.test(css)]
];
let fail=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++} console.log(`FINAL FEATURE PRESERVATION: ${checks.length-fail}/${checks.length}`); if(fail)process.exit(1);
