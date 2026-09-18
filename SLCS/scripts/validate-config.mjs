import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync('wrangler.json','utf8'));
const errors=[];
const has=(arr,b)=>Array.isArray(arr)&&arr.some(x=>x.binding===b);
if(!has(cfg.d1_databases,'DB')) errors.push('Thiếu D1 binding DB');
if(!has(cfg.r2_buckets,'FILES')) errors.push('Thiếu R2 binding FILES');
if(!has(cfg.services,'LIVE_SERVICE')) errors.push('Thiếu service binding LIVE_SERVICE');
if(!cfg.vars?.APP_URL?.startsWith('https://')) errors.push('APP_URL phải dùng HTTPS');
for(const secret of ['AI_API_KEY','REALTIME_APP_SECRET','SETUP_TOKEN']) if(Object.prototype.hasOwnProperty.call(cfg.vars||{},secret)) errors.push(`Không được hard-code secret ${secret} trong wrangler.json`);
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('CONFIG VALIDATION: PASS');
