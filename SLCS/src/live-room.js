import { ensureV13Schema, getClassLiveSettings, logLiveEvent } from './v13-platform.js';

export class LiveRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
  }

  async fetch(request) {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade !== 'websocket') return new Response('Yêu cầu kết nối không hợp lệ.', { status: 426 });

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const classId = parts.length >= 3 ? parts[2] : '';
    const token = url.searchParams.get('token') || '';
    if (!classId || !token) return new Response('Phiên tham gia không hợp lệ.', { status: 401 });

    let access;
    try {
      access = await this.env.DB.prepare(`
        SELECT t.token,t.class_id,t.user_id,t.guest_name,t.role,t.expires_at,
               COALESCE(u.full_name,t.guest_name,'Guest') display_name
        FROM live_access_tokens t
        LEFT JOIN users u ON u.id=t.user_id
        WHERE t.token=? AND t.class_id=? AND t.expires_at>CURRENT_TIMESTAMP
        LIMIT 1
      `).bind(token,classId).first();
    } catch {
      return new Response('Phòng học đang được chuẩn bị. Vui lòng thử lại.', { status: 503 });
    }
    if (!access) return new Response('Phiên tham gia không hợp lệ.', { status: 401 });

    await ensureV13Schema(this.env).catch(()=>{});
    const settings = await getClassLiveSettings(this.env,classId).catch(()=>({waiting_room:0}));
    const transport = url.searchParams.get('mode') === 'primary' ? 'sfu' : 'mesh';
    let maxPeers = transport === 'sfu' ? 120 : 18;
    try {
      if (transport === 'sfu') {
        const profile = await this.env.DB.prepare(`SELECT capacity FROM class_profiles WHERE class_id=?`).bind(classId).first();
        const global = await this.env.DB.prepare(`SELECT value FROM system_settings WHERE key='live_room_max_participants'`).first();
        maxPeers = Math.max(4, Math.min(250, Number(profile?.capacity || global?.value || 120)));
      } else {
        const row = await this.env.DB.prepare(`SELECT value FROM system_settings WHERE key='live_mesh_max_peers'`).first();
        maxPeers = Math.max(4, Math.min(40, Number(row?.value || 18)));
      }
    } catch {}
    if (this.admittedClients().length >= maxPeers) return new Response('Phòng học đã đạt số người tham gia tối đa.', { status: 429 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const peerId = crypto.randomUUID();
    const name = String(access.display_name || 'Guest').slice(0, 80);
    const role = String(access.role || 'guest').slice(0, 30);
    const isHost = ['teacher','assistant','school_admin','super_admin'].includes(role);
    const needsWaiting = !!Number(settings.waiting_room) && !isHost;

    server.accept();
    this.clients.set(peerId, { ws: server, name, role, userId: access.user_id || null, joinedAt: Date.now(), admitted: !needsWaiting, handRaisedAt: 0, settings });

    if (needsWaiting) {
      server.send(JSON.stringify({ type:'waiting-state', status:'waiting', peerId, room:{classId,maxPeers} }));
      this.broadcastToHosts({type:'waiting-request',peer:{id:peerId,name,role}});
      await logLiveEvent(this.env,classId,'waiting.request',access.user_id?`user:${access.user_id}`:`guest:${peerId}`,name,{role}).catch(()=>{});
    } else {
      this.sendWelcome(peerId,classId,maxPeers,transport);
      this.broadcast({ type: 'peer-joined', peer: { id: peerId, name, role } }, peerId);
      this.broadcastRoster();
      if(isHost){
        const waiting=[...this.clients.entries()].filter(([,p])=>!p.admitted).map(([id,p])=>({id,name:p.name,role:p.role}));
        if(waiting.length) server.send(JSON.stringify({type:'waiting-list',waiting}));
      }
      await logLiveEvent(this.env,classId,'peer.joined',access.user_id?`user:${access.user_id}`:`guest:${peerId}`,name,{role,transport}).catch(()=>{});
    }

    server.addEventListener('message', evt => this.onMessage({evt,peerId,classId,name,role,maxPeers,transport}));

    const cleanup = async () => {
      const current=this.clients.get(peerId); if (!current) return;
      this.clients.delete(peerId);
      if(current.admitted){ this.broadcast({ type: 'peer-left', peerId }); this.broadcastRoster(); }
      else this.broadcastToHosts({type:'waiting-left',peerId});
      await logLiveEvent(this.env,classId,'peer.left',access.user_id?`user:${access.user_id}`:`guest:${peerId}`,name,{role}).catch(()=>{});
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  admittedClients(){ return [...this.clients.entries()].filter(([,p])=>p.admitted); }

  broadcastRoster(){
    const roster=this.admittedClients().map(([id,p])=>({id,name:p.name,role:p.role,handRaisedAt:p.handRaisedAt||0}));
    for(const [id,p] of this.admittedClients()){try{p.ws.send(JSON.stringify({type:'roster-state',peerId:id,roster,count:roster.length}))}catch{}}
  }

  sendWelcome(peerId,classId,maxPeers,transport){
    const current=this.clients.get(peerId); if(!current)return;
    const roster=this.admittedClients().map(([id,p])=>({id,name:p.name,role:p.role,handRaisedAt:p.handRaisedAt||0}));
    try{current.ws.send(JSON.stringify({type:'welcome',peerId,roster,room:{classId,maxPeers}}));}catch{}
  }

  async onMessage({evt,peerId,classId,name,role,maxPeers,transport}){
    if (typeof evt.data === 'string' && evt.data.length > 120000) return;
    let msg; try { msg = JSON.parse(evt.data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const sender=this.clients.get(peerId); if(!sender)return;
    const host=['teacher','assistant','school_admin','super_admin'].includes(role);
    const roomSettings=sender.settings||{};
    if(!host){
      if(msg.type==='chat'&&!Number(roomSettings.allow_chat))return;
      if(['reaction','raise-hand','lower-hand','class-pulse'].includes(msg.type)&&!Number(roomSettings.allow_reactions))return;
      if(msg.type==='media-state'&&msg.source==='mic'&&!Number(roomSettings.allow_student_mic))return;
      if(msg.type==='media-state'&&msg.source==='camera'&&!Number(roomSettings.allow_student_camera))return;
    }

    if(msg.type==='host-command'){
      if(!host)return;
      const action=String(msg.action||'').slice(0,40), target=String(msg.target||'').slice(0,80);
      if(action==='admit' && target && this.clients.has(target)){
        const p=this.clients.get(target); if(!p.admitted){p.admitted=true;this.sendWelcome(target,classId,maxPeers,transport);this.broadcast({type:'peer-joined',peer:{id:target,name:p.name,role:p.role}},target);this.broadcastRoster();this.broadcastToHosts({type:'waiting-left',peerId:target});await logLiveEvent(this.env,classId,'waiting.admitted',`peer:${peerId}`,name,{target,target_name:p.name}).catch(()=>{});} return;
      }
      if(action==='admit-all'){
        for(const [id,p] of [...this.clients.entries()]) if(!p.admitted){p.admitted=true;this.sendWelcome(id,classId,maxPeers,transport);this.broadcast({type:'peer-joined',peer:{id,name:p.name,role:p.role}},id);} this.broadcastRoster(); this.broadcastToHosts({type:'waiting-list',waiting:[]}); return;
      }
      if(action==='remove' && target && this.clients.has(target)){try{this.clients.get(target).ws.send(JSON.stringify({type:'host-command',action:'removed',from:peerId,fromName:name}));this.clients.get(target).ws.close(4001,'removed')}catch{};return;}
      if(action==='policy'){
        const incoming=msg.settings&&typeof msg.settings==='object'?msg.settings:{};
        const policy={};
        for(const k of ['allow_student_mic','allow_student_camera','allow_student_share','allow_chat','allow_reactions']) if(k in incoming) policy[k]=incoming[k]?1:0;
        for(const [,p] of this.clients) p.settings={...(p.settings||{}),...policy};
        this.broadcast({type:'host-command',action:'policy',settings:policy,from:peerId,fromName:name,fromRole:role},peerId);
        return;
      }
      if(target && this.clients.has(target)){const targetClient=this.clients.get(target);if(action==='lower-hand')targetClient.handRaisedAt=0;try{targetClient.ws.send(JSON.stringify({...msg,from:peerId,fromName:name,fromRole:role}));}catch{};if(action==='lower-hand')this.broadcastToHosts({type:'lower-hand',target});return;}
      this.broadcast({...msg,from:peerId,fromName:name,fromRole:role},peerId); return;
    }

    if(!sender.admitted) return;
    const allowed = new Set(['offer','answer','ice','chat','reaction','raise-hand','lower-hand','presence','media-track-published','media-track-unpublished','media-state','class-pulse','whisper','ask-later','timer','poll-live','network-state']);
    if (!allowed.has(msg.type)) return;
    if(['timer','poll-live'].includes(msg.type)&&!host)return;
    if (msg.type === 'chat') msg.text = String(msg.text || '').slice(0, 2000);
    if (msg.type === 'media-track-published') { msg.sessionId=String(msg.sessionId||'').slice(0,120); msg.trackName=String(msg.trackName||'').slice(0,180); msg.kind=['audio','video'].includes(msg.kind)?msg.kind:''; msg.source=String(msg.source||'').slice(0,30); }
    if (msg.type === 'media-track-unpublished') msg.trackName = String(msg.trackName || '').slice(0, 180);
    if (msg.type === 'media-state') { msg.source = String(msg.source || '').slice(0,30); msg.enabled = !!msg.enabled; }
    if (msg.type === 'class-pulse') { msg.value=String(msg.value||'').slice(0,30); msg.anonymous=!!msg.anonymous; }
    if (msg.type === 'whisper' || msg.type==='ask-later') msg.text = String(msg.text || '').slice(0, 1600);
    if(msg.type==='raise-hand'){sender.handRaisedAt=Date.now(); msg.raisedAt=sender.handRaisedAt;}
    if(msg.type==='lower-hand'){sender.handRaisedAt=0;}
    msg.from=peerId; msg.fromName=name; msg.fromRole=role;

    if(msg.type==='whisper'||msg.type==='ask-later'){
      if(msg.to&&this.clients.has(msg.to)){try{this.clients.get(msg.to).ws.send(JSON.stringify(msg));}catch{}}
      else this.broadcastToHosts(msg);
      return;
    }
    if(msg.type==='class-pulse'){this.broadcastToHosts(msg.anonymous?{...msg,from:null,fromName:'Ẩn danh'}:msg);return;}
    if (msg.to && this.clients.has(msg.to)) { try { this.clients.get(msg.to).ws.send(JSON.stringify(msg)); } catch {} }
    else this.broadcast(msg, peerId);
  }

  broadcastToHosts(payload){const raw=JSON.stringify(payload);for(const [,p] of this.clients){if(!['teacher','assistant'].includes(p.role))continue;try{p.ws.send(raw)}catch{}}}

  broadcast(payload, exceptId = null) {
    const raw = JSON.stringify(payload);
    for (const [id, p] of this.clients.entries()) {
      if (id === exceptId || !p.admitted) continue;
      try { p.ws.send(raw); } catch {}
    }
  }
}
