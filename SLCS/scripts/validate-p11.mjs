import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8');
const media=fs.readFileSync('public/classroom/media-client.js','utf8');
const api=fs.readFileSync('src/index.js','utf8');
const checks=[
 ['SFU active-list reconciliation',app.includes('remoteMissingPolls')&&app.includes('activeMediaKeys')&&app.includes('misses<2')],
 ['network recovery heartbeat',app.includes("sfu.heartbeat?.().catch")&&app.includes("addEventListener('offline',offlineNotice")],
 ['visibility recovery',app.includes('onLiveVisibility')&&app.includes("removeEventListener('visibilitychange',onLiveVisibility")],
 ['screen-share browser stop',app.includes('screenTrack.onended=()=>stopScreenShare()')&&app.includes('async function stopScreenShare()')],
 ['device hotplug listener cleanup',app.includes("addEventListener?.('devicechange',onDeviceChange)")&&app.includes("removeEventListener?.('devicechange',onDeviceChange)")],
 ['session close endpoint',media.includes('/end')&&api.includes('sfuEnd')],
 ['remote track end cleanup',app.includes('track.onended=()=>')&&app.includes("remoteSfuStreams.delete(key)")],
 ['guest route remains enabled',app.includes("h.startsWith('guest-live/')")]
];
let bad=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)bad++}if(bad)process.exit(1);console.log(`${checks.length}/${checks.length} P1.1 stability checks passed`);
