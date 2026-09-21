const schemaReadyByDb = new WeakSet();

export const VPLUS = Object.freeze({
  product: 'Sky First School',
  channel: 'VPLUS',
  edition: 'VIP PRO'
});

export const ROLE_PERMISSIONS = Object.freeze({
  student: ['ai.ask','ai.research','ai.create','class.join','class.chat','class.react'],
  guest: ['class.join','class.chat','class.react'],
  assistant: ['ai.ask','ai.research','ai.create','ai.analyze.class','ai.act.class','class.manage'],
  teacher: ['ai.ask','ai.research','ai.create','ai.analyze.class','ai.act.class','class.manage'],
  account_admin: ['ai.ask','ai.research','ai.create','accounts.manage'],
  school_admin: ['ai.ask','ai.research','ai.create','ai.analyze.school','school.manage'],
  super_admin: ['*']
});

export function hasPermission(user, permission) {
  const role=String(user?.role||'guest');
  const perms=ROLE_PERMISSIONS[role]||[];
  return perms.includes('*') || perms.includes(permission);
}

export function requirePermission(user, permission) {
  if (!hasPermission(user, permission)) throw Object.assign(new Error('FORBIDDEN'),{status:403});
  return true;
}

export function safeUserMessage(error, fallback='Đã xảy ra sự cố tạm thời. Vui lòng thử lại sau.') {
  const status=Number(error?.status||500);
  if(status===401) return 'Vui lòng đăng nhập để tiếp tục.';
  if(status===403) return 'Bạn không có quyền thực hiện thao tác này.';
  if(status===404) return 'Không tìm thấy nội dung bạn yêu cầu.';
  if(status===409) return 'Thao tác chưa thể hoàn tất do dữ liệu vừa thay đổi. Vui lòng thử lại.';
  if(status===413) return 'Tệp bạn chọn vượt quá giới hạn cho phép.';
  if(status===429) return 'Có quá nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít phút.';
  if(status>=500) return fallback;
  const msg=String(error?.publicMessage||error?.message||'').trim();
  if(!msg || /\b(D1|R2|SFU|mesh|durable|worker|websocket|ICE|binding|schema|SQL|API|HTTP)\b/i.test(msg)) return fallback;
  return msg.slice(0,400);
}

export async function ensureVPlusSchema(env){
  if(!env?.DB) return;
  if(schemaReadyByDb.has(env.DB)) return;
  const sql=[
    `CREATE TABLE IF NOT EXISTS platform_events (
      id TEXT PRIMARY KEY,
      tenant_key TEXT NOT NULL DEFAULT 'sky-first',
      class_id TEXT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      event_source TEXT NOT NULL DEFAULT 'platform',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_platform_events_class_time ON platform_events(class_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_platform_events_type_time ON platform_events(event_type,created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      class_id TEXT,
      mode TEXT NOT NULL DEFAULT 'ask',
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id,updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id,created_at)`,
    `CREATE TABLE IF NOT EXISTS ai_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      class_id TEXT,
      mode TEXT NOT NULL DEFAULT 'ask',
      action TEXT NOT NULL DEFAULT 'chat',
      status TEXT NOT NULL DEFAULT 'ok',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_audit_time ON ai_audit(created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ai_action_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      class_id TEXT,
      action_key TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      risk_level TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confirmed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_action_requests_user ON ai_action_requests(user_id,status,created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS ai_rate_limits (
      user_id TEXT NOT NULL,
      bucket TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,bucket)
    )`,
    `CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      plan TEXT NOT NULL DEFAULT 'community',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS organization_members (
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id,user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id,status)`,
    `CREATE TABLE IF NOT EXISTS organization_domains (
      domain TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS organization_settings (
      organization_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id,key)
    )`,
    `CREATE TABLE IF NOT EXISTS usage_hourly (
      organization_id TEXT NOT NULL DEFAULT 'sky-first',
      bucket TEXT NOT NULL,
      metric TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id,bucket,metric)
    )`
  ];
  for(const statement of sql) await env.DB.prepare(statement).run();
  schemaReadyByDb.add(env.DB);
}

export async function recordPlatformEvent(env,{classId=null,userId=null,type,source='platform',detail={}}={}){
  if(!type||!env?.DB) return;
  try{
    await ensureVPlusSchema(env);
    await env.DB.prepare(`INSERT INTO platform_events(id,class_id,user_id,event_type,event_source,detail_json,created_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(crypto.randomUUID(),classId,userId,type,source,JSON.stringify(detail||{})).run();
  }catch{}
}

export async function auditAi(env,{userId=null,classId=null,mode='ask',action='chat',status='ok',detail={}}={}){
  try{
    await ensureVPlusSchema(env);
    await env.DB.prepare(`INSERT INTO ai_audit(id,user_id,class_id,mode,action,status,detail_json,created_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(crypto.randomUUID(),userId,classId,mode,action,status,JSON.stringify(detail||{})).run();
  }catch{}
}

export function aiProviderConfig(env){
  const rawProvider=String(env?.AI_PROVIDER||'').trim().toLowerCase();
  const rawUrl=String(env?.AI_API_URL||'').trim();
  let provider=rawProvider;
  if(!provider){
    if(/api\.openai\.com/i.test(rawUrl)||(!rawUrl&&env?.AI_API_KEY)) provider='openai_responses';
    else provider='openai_compatible';
  }
  if(provider==='openai') provider='openai_responses';
  const isOpenAI=provider==='openai_responses';
  const url=rawUrl||(isOpenAI?'https://api.openai.com/v1/responses':'');
  const model=String(env?.AI_MODEL||(isOpenAI?'gpt-5.6-luna':'')).trim();
  const timeoutMs=Math.min(60000,Math.max(5000,Number(env?.AI_TIMEOUT_MS||30000)));
  const nativeWebSearch=isOpenAI && String(env?.AI_ENABLE_WEB_SEARCH??'1')!=='0';
  return {provider,url,model,timeoutMs,nativeWebSearch,configured:!!(url&&model&&String(env?.AI_API_KEY||'').trim())};
}

export function aiConfigured(env){
  return aiProviderConfig(env).configured;
}

export function aiSupportsNativeResearch(env){
  const c=aiProviderConfig(env); return c.configured&&c.nativeWebSearch;
}

export async function consumeAiQuota(env,userId,{limit=40,windowMinutes=10}={}){
  await ensureVPlusSchema(env);
  const ms=Math.max(1,windowMinutes)*60*1000;
  const bucket=new Date(Math.floor(Date.now()/ms)*ms).toISOString();
  const row=await env.DB.prepare(`SELECT count FROM ai_rate_limits WHERE user_id=? AND bucket=?`).bind(userId,bucket).first();
  const count=Number(row?.count||0);
  if(count>=limit) throw Object.assign(new Error('AI_RATE_LIMIT'),{status:429,publicMessage:'Bạn đang gửi yêu cầu quá nhanh. Vui lòng chờ một chút rồi thử lại.'});
  await env.DB.prepare(`INSERT INTO ai_rate_limits(user_id,bucket,count,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id,bucket) DO UPDATE SET count=count+1,updated_at=CURRENT_TIMESTAMP`).bind(userId,bucket).run();
  return {remaining:Math.max(0,limit-count-1)};
}

export async function fetchResearchSources(env,query){
  const endpoint=String(env?.AI_RESEARCH_URL||'').trim();
  if(!endpoint||!query) return [];
  try{
    const headers={'content-type':'application/json'};
    if(env.AI_RESEARCH_API_KEY) headers.authorization=`Bearer ${env.AI_RESEARCH_API_KEY}`;
    const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({query:String(query).slice(0,1000),limit:6}),signal:AbortSignal.timeout(12000)});
    if(!r.ok)return [];
    const data=await r.json();
    const arr=Array.isArray(data)?data:(data.results||data.items||data.web?.results||[]);
    return arr.slice(0,6).map((x,i)=>({index:i+1,title:String(x.title||x.name||`Nguồn ${i+1}`).slice(0,180),url:String(x.url||x.link||'').slice(0,1200),snippet:String(x.snippet||x.description||x.text||'').slice(0,700)})).filter(x=>/^https?:\/\//i.test(x.url));
  }catch{return []}
}

export function parseAiAction(text=''){
  let raw=String(text).trim();
  const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/i); if(fenced) raw=fenced[1].trim();
  try{
    const obj=JSON.parse(raw);
    if(!obj||typeof obj!=='object')return null;
    const action=obj.action&&typeof obj.action==='object'?obj.action:null;
    if(!action||!['create_poll','add_resource','update_class_policy'].includes(String(action.key)))return null;
    return {message:String(obj.message||'Mình đã chuẩn bị thao tác này.').slice(0,1000),action:{key:String(action.key),payload:action.payload&&typeof action.payload==='object'?action.payload:{}}};
  }catch{return null}
}

function extractOpenAIResponseText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim()) return data.output_text.trim();
  const parts=[];
  for(const item of Array.isArray(data?.output)?data.output:[]){
    for(const c of Array.isArray(item?.content)?item.content:[]){
      if((c?.type==='output_text'||c?.type==='text')&&typeof c?.text==='string') parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}

function extractOpenAIResponseSources(data){
  const found=[]; const seen=new Set();
  const add=(a)=>{const url=String(a?.url||'').trim();if(!/^https?:\/\//i.test(url)||seen.has(url))return;seen.add(url);found.push({title:String(a?.title||new URL(url).hostname).slice(0,180),url:url.slice(0,1200),snippet:''})};
  for(const item of Array.isArray(data?.output)?data.output:[]){
    for(const c of Array.isArray(item?.content)?item.content:[]){
      for(const a of Array.isArray(c?.annotations)?c.annotations:[]){if(a?.type==='url_citation'||a?.url)add(a)}
    }
  }
  return found.slice(0,8).map((x,i)=>({index:i+1,...x}));
}


export async function aiKeyDiagnostic(env){
  return {present:!!String(env?.AI_API_KEY||'').trim()};
}

async function probeOpenAIEndpoint(url,apiKey,timeoutMs){
  let r;
  try{
    r=await fetch(url,{method:'GET',headers:{'authorization':`Bearer ${apiKey}`},signal:AbortSignal.timeout(Math.min(timeoutMs,15000))});
  }catch(e){
    return {ok:false,status:0,code:e?.name==='TimeoutError'?'AI_AUTH_TIMEOUT':'AI_AUTH_NETWORK',detail:String(e?.message||e).slice(0,600)};
  }
  let detail='',errorCode='';
  if(!r.ok){
    try{
      const text=(await r.text()).slice(0,1200); detail=text;
      try{errorCode=String(JSON.parse(text)?.error?.code||'').slice(0,120)}catch{}
    }catch{}
  } else {try{await r.body?.cancel?.()}catch{}}
  return {ok:r.ok,status:r.status,code:r.ok?'AUTH_OK':'AUTH_FAILED',error_code:errorCode||null,detail};
}

export async function testAiAuthentication(env){
  const cfg=aiProviderConfig(env);
  const apiKey=String(env?.AI_API_KEY||'').trim();
  const key=await aiKeyDiagnostic(env);
  if(!apiKey) return {ok:false,status:0,code:'AI_KEY_MISSING',detail:'',key,me:null,models:null};
  if(cfg.provider!=='openai_responses') return {ok:true,status:null,code:'AUTH_TEST_NOT_APPLICABLE',detail:'',key,me:null,models:null};

  // Two independent OpenAI auth probes. /v1/me is the documented account-info test;
  // /v1/models is used as a second check so a single endpoint cannot misdiagnose the secret.
  const me=await probeOpenAIEndpoint('https://api.openai.com/v1/me',apiKey,cfg.timeoutMs);
  const models=me.ok?null:await probeOpenAIEndpoint('https://api.openai.com/v1/models',apiKey,cfg.timeoutMs);
  const fallbackOk=!!models?.ok;
  return {
    ok:me.ok||fallbackOk,
    status:me.ok?me.status:(fallbackOk?models.status:(models?.status||me.status)),
    code:(me.ok||fallbackOk)?'AUTH_OK':'AUTH_FAILED',
    detail:me.ok?'':(fallbackOk?'':String(models?.detail||me.detail||'').slice(0,600)),
    error_code:me.ok?null:(fallbackOk?null:(models?.error_code||me.error_code||null)),
    key,me,models
  };
}

export async function callAiProvider(env,{messages,temperature=.35,maxTokens=1200,webSearch=false}={}){
  const cfg=aiProviderConfig(env);
  if(!cfg.configured) throw Object.assign(new Error('AI_NOT_READY'),{status:503,publicMessage:'Sky First AI đang được chuẩn bị. Vui lòng quay lại sau.'});
  const apiKey=String(env?.AI_API_KEY||'').trim();
  const headers={'authorization':`Bearer ${apiKey}`,'content-type':'application/json'};
  const makeBody=(useWeb)=>{
    if(cfg.provider==='openai_responses'){
      const body={model:cfg.model,input:(Array.isArray(messages)?messages:[]).map(m=>({role:m.role==='system'?'developer':(m.role||'user'),content:String(m.content||'')})),max_output_tokens:maxTokens};
      if(useWeb&&cfg.nativeWebSearch)body.tools=[{type:'web_search'}];
      return body;
    }
    return {model:cfg.model,messages,temperature,max_tokens:maxTokens};
  };
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const requestOnce=async(useWeb)=>{
    let r;
    try{r=await fetch(cfg.url,{method:'POST',headers,body:JSON.stringify(makeBody(useWeb)),signal:AbortSignal.timeout(cfg.timeoutMs)})}
    catch(e){throw Object.assign(new Error(e?.name==='TimeoutError'?'AI_PROVIDER_TIMEOUT':'AI_PROVIDER_NETWORK'),{status:503,publicMessage:'Sky First AI đang mất nhiều thời gian hơn bình thường. Vui lòng thử lại sau.',internalDetail:String(e?.message||e)})}
    return r;
  };
  let usedWeb=!!(webSearch&&cfg.nativeWebSearch),r=await requestOnce(usedWeb);
  // Research must never become unusable only because the provider temporarily rejects its web-search tool.
  if(usedWeb&&[400,404,422].includes(r.status)){try{r.body?.cancel?.()}catch{}usedWeb=false;r=await requestOnce(false)}
  // One short retry for provider-side transient failures. Do not retry auth/quota/client errors.
  if([500,502,503,504].includes(r.status)){try{r.body?.cancel?.()}catch{}await sleep(180);r=await requestOnce(usedWeb)}
  if(!r.ok){let detail='';try{detail=(await r.text()).slice(0,1600)}catch{};let publicMessage='Sky First AI tạm thời chưa thể phản hồi. Vui lòng thử lại sau.';if(r.status===429)publicMessage='Sky First AI đang có nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít phút.';throw Object.assign(new Error('AI_PROVIDER_FAILED'),{status:r.status===429?429:503,providerStatus:r.status,internalDetail:detail,publicMessage})}
  let data;try{data=await r.json()}catch{throw Object.assign(new Error('AI_PROVIDER_INVALID_JSON'),{status:503,publicMessage:'Sky First AI tạm thời chưa thể phản hồi. Vui lòng thử lại sau.'})}
  const text=cfg.provider==='openai_responses'?extractOpenAIResponseText(data):String(data?.choices?.[0]?.message?.content ?? data?.output_text ?? data?.response ?? '').trim();
  if(!text) throw Object.assign(new Error('AI_EMPTY'),{status:503,publicMessage:'Sky First AI chưa thể tạo câu trả lời lúc này. Vui lòng thử lại.'});
  return {text,providerId:String(data?.id||''),sources:cfg.provider==='openai_responses'?extractOpenAIResponseSources(data):[],provider:cfg.provider,model:cfg.model,webSearchUsed:usedWeb};
}

export function moderateAiInput(text='') {
  const raw=String(text||'').slice(0,12000);
  const n=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const educational=/(giao duc gioi tinh|suc khoe sinh san|sinh hoc|phong chong xam hai|y khoa|medical|biology|sexual health|sex education|bao cao hoc thuat|nghien cuu)/i.test(n);
  const minorSex=/(tre em|tre vi thanh nien|hoc sinh cap 1|duoi 18|minor|child|underage).{0,80}(quan he tinh duc|khieu dam|nude|sex|porn|goi duc|groom)/i.test(n)||/(quan he tinh duc|khieu dam|nude|sex|porn|groom|du do tinh duc|khai thac tinh duc).{0,80}(tre em|tre vi thanh nien|minor|child|underage|duoi 18)/i.test(n);
  const explicit=/(porn|khieu dam|sex chat|erotic roleplay|truyen sex|anh nude|anh khoa than|noi dung 18\+|lam tinh|quan he tinh duc chi tiet)/i.test(n);
  if(minorSex) return {allowed:false,category:'minor_sexual_safety',message:'Sky First AI không thể hỗ trợ nội dung tình dục liên quan đến người chưa thành niên. Nếu đây là nội dung giáo dục hoặc bảo vệ trẻ em, hãy diễn đạt theo hướng học tập, sức khỏe hoặc phòng chống xâm hại.'};
  if(explicit&&!educational) return {allowed:false,category:'explicit_sexual',message:'Sky First AI không hỗ trợ tạo nội dung tình dục hoặc khiêu dâm. Nội dung giáo dục giới tính, sinh học và sức khỏe vẫn có thể được hỗ trợ khi có mục đích học tập rõ ràng.'};
  return {allowed:true,category:educational?'educational_sensitive':'general'};
}

export function buildAiSystemPrompt({user,classInfo=null,mode='ask',contextText=''}={}){
  const role=String(user?.role||'student');
  const modeGuide={
    ask:'Trả lời rõ ràng, ưu tiên nội dung học tập và ngữ cảnh hiện có.',
    research:'Nghiên cứu có hệ thống. Phân biệt dữ kiện, suy luận và phần chưa đủ nguồn. Không giả vờ đã truy cập nguồn mà hệ thống chưa cung cấp.',
    create:'Tạo đầu ra thực dụng, có cấu trúc, có thể dùng ngay.',
    analyze:'Phân tích dữ liệu được cung cấp, nêu xu hướng và giới hạn của dữ liệu. Không suy diễn đặc điểm nhạy cảm của người học.',
    act:'Nếu yêu cầu có thể thực hiện bằng một trong các hành động được hỗ trợ, chỉ trả JSON hợp lệ dạng {\"message\":\"...\",\"action\":{\"key\":\"create_poll|add_resource|update_class_policy\",\"payload\":{...}}}. create_poll cần question, options (2-8 mục), anonymous; add_resource cần title,url; update_class_policy chỉ dùng allow_student_mic, allow_student_camera, allow_student_share, allow_chat, allow_reactions. Nếu không phù hợp, trả lời văn bản bình thường. Không tuyên bố đã thực hiện trước khi người dùng xác nhận.'
  }[mode]||'';
  return `Bạn là Sky First AI, trợ lý số thuộc hệ sinh thái Sky First Network và hoạt động trong Trung tâm Học tập số Sky First Network.\nVai trò người dùng: ${role}.\n${classInfo?`Lớp hiện tại: ${classInfo.name||classInfo.id||''}.`:''}\n${modeGuide}\nNguyên tắc bắt buộc: đây là trợ lý HỌC TẬP trước khi là công cụ tìm kiếm. Hãy xác định người học đang muốn hiểu, luyện tập, kiểm tra hay tạo sản phẩm; ưu tiên giải thích theo trình độ thể hiện trong câu hỏi; khi phù hợp hãy đặt một câu kiểm tra hiểu hoặc đề nghị một bước luyện tập ngắn. Không làm thay toàn bộ khi mục tiêu rõ ràng là học; ưu tiên gợi ý, phản hồi và cho người học thử lại. Phân biệt rõ dữ liệu nội bộ của lớp, nguồn chính thức Sky First, nguồn web và suy luận của AI. Nếu ngữ cảnh không chứa một thông tin nội bộ thì nói rõ chưa có dữ liệu đó thay vì suy đoán. Không tiết lộ hạ tầng nội bộ, secret, database, storage, transport, log kỹ thuật hoặc dữ liệu ngoài quyền người dùng; không bịa nguồn; nếu thiếu dữ liệu nội bộ nhưng được cấp công cụ web search thì hãy chủ động tra cứu thay vì dừng ngay. Với thông tin về Sky First Network, ưu tiên tên miền skyfirst.io.vn và các kênh chính thức được cung cấp trong ngữ cảnh, sau đó mới dùng nguồn web khác để đối chiếu. Không xem thông tin web chưa xác minh là kiến thức vĩnh viễn. Nếu các nguồn mâu thuẫn, nêu rõ và ưu tiên nguồn chính thức. Không tạo nội dung tình dục hoặc khiêu dâm rõ ràng, không hỗ trợ grooming hay khai thác tình dục người chưa thành niên. Vẫn hỗ trợ nội dung giáo dục giới tính, sinh học, sức khỏe sinh sản và phòng chống xâm hại khi ngữ cảnh là giáo dục hoặc an toàn.\n${contextText?`Ngữ cảnh được phép sử dụng:\n${contextText}`:''}`;
}
