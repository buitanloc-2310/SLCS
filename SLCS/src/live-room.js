import { ensureV13Schema, getClassLiveSettings, logLiveEvent } from './v13-platform.js';

export class LiveRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
    this.tokenPeers = new Map();
    this.metrics = { joined: 0, left: 0, rejected: 0, rateLimited: 0, slowClients: 0 };
    this.rosterSeq = 0;
    this.roomState = { locked:false, ended:false, endedAt:null };
  }

  async fetch(request) {
    this.sweepStaleClients();
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
    // Room lifecycle is persisted in Durable Object storage when available.
    try { this.roomState = { ...this.roomState, ...((await this.state.storage?.get('roomState')) || {}) }; } catch {}
    const accessRole = String(access.role || 'guest');
    const lifecycleHost = ['teacher','school_admin','super_admin'].includes(accessRole);
    if (this.roomState.ended && !lifecycleHost) return new Response('Phiên học đã kết thúc.', { status: 410 });
    if (this.roomState.locked && !lifecycleHost) return new Response('Phòng học đang khóa người tham gia mới.', { status: 423 });
    let maxPeers = transport === 'sfu' ? 50 : 12;
    try {
      if (transport === 'sfu') {
        const profile = await this.env.DB.prepare(`SELECT capacity FROM class_profiles WHERE class_id=?`).bind(classId).first();
        const global = await this.env.DB.prepare(`SELECT value FROM system_settings WHERE key='live_room_max_participants'`).first();
        maxPeers = Math.max(4, Math.min(250, Number(profile?.capacity || global?.value || 50)));
      } else {
        const row = await this.env.DB.prepare(`SELECT value FROM system_settings WHERE key='live_mesh_max_peers'`).first();
        maxPeers = Math.max(4, Math.min(40, Number(row?.value || 12)));
      }
    } catch {}
    // Hard room limits protect the Durable Object from waiting-room floods and accidental overload.
    if (this.clients.size >= Math.max(maxPeers * 2, 80)) { this.metrics.rejected++; return new Response('Phòng học đang quá tải. Vui lòng thử lại sau.', { status: 429 }); }
    if (this.admittedClients().length >= maxPeers) { this.metrics.rejected++; return new Response('Phòng học đã đạt số người tham gia tối đa.', { status: 429 }); }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const peerId = crypto.randomUUID();
    const name = String(access.display_name || 'Guest').slice(0, 80);
    const role = accessRole.slice(0, 30);
    const isHost = ['teacher','assistant','school_admin','super_admin'].includes(role);
    const needsWaiting = !!Number(settings.waiting_room) && !isHost;

    server.accept();
    // One live socket per access token. A refresh/reconnect replaces the stale socket instead of creating a ghost participant.
    const tokenKey = String(token);
    const previousPeer = this.tokenPeers.get(tokenKey);
    if (previousPeer && this.clients.has(previousPeer)) {
      try { this.clients.get(previousPeer).ws.close(4000, 'replaced'); } catch {}
      this.clients.delete(previousPeer);
    }
    this.tokenPeers.set(tokenKey, peerId);
    this.clients.set(peerId, { ws: server, name, role, userId: access.user_id || null, tokenKey, joinedAt: Date.now(), lastSeen: Date.now(), admitted: !needsWaiting, handRaisedAt: 0, settings, rate:{window:Date.now(),messages:0,chat:0,host:0} });
    this.metrics.joined++;

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

    server.addEventListener('message', evt => {
      Promise.resolve(this.onMessage({evt,peerId,classId,name,role,maxPeers,transport})).catch(()=>{
        this.metrics.messageErrors=(this.metrics.messageErrors||0)+1;
        this.safeSend(this.clients.get(peerId),{type:'room-warning',message:'Một thao tác chưa thực hiện được. Phòng học vẫn đang hoạt động.'});
      });
    });

    const cleanup = async () => {
      const current=this.clients.get(peerId); if (!current) return;
      this.clients.delete(peerId);
      if (current.tokenKey && this.tokenPeers.get(current.tokenKey) === peerId) this.tokenPeers.delete(current.tokenKey);
      this.metrics.left++;
      if(current.admitted){ this.broadcast({ type: 'peer-left', peerId }); this.broadcastRoster(); }
      else this.broadcastToHosts({type:'waiting-left',peerId});
      await logLiveEvent(this.env,classId,'peer.left',access.user_id?`user:${access.user_id}`:`guest:${peerId}`,name,{role}).catch(()=>{});
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  admittedClients(){ return [...this.clients.entries()].filter(([,p])=>p.admitted); }

  sweepStaleClients(now=Date.now()){
    let changed=false;
    // A dead browser/network path must not remain in the roster forever.
    // 75s allows three missed 20s heartbeats plus jitter before eviction.
    for(const [id,p] of [...this.clients.entries()]){
      if(now-Number(p.lastSeen||now) <= 75_000) continue;
      try{p.ws.close(4002,'heartbeat-timeout')}catch{}
      this.clients.delete(id);
      if(p.tokenKey && this.tokenPeers.get(p.tokenKey)===id)this.tokenPeers.delete(p.tokenKey);
      this.metrics.left++; changed=true;
      if(p.admitted)this.broadcast({type:'peer-left',peerId:id},id);
      else this.broadcastToHosts({type:'waiting-left',peerId:id});
    }
    if(changed)this.broadcastRoster();
  }

  safeSend(client, payload){
    if(!client?.ws) return false;
    try{
      // A client that cannot consume messages must not build an unbounded server-side queue.
      if(Number(client.ws.bufferedAmount||0) > 1_000_000){ this.metrics.slowClients++; try{client.ws.close(1013,'slow-client')}catch{}; return false; }
      client.ws.send(typeof payload==='string'?payload:JSON.stringify(payload)); return true;
    }catch{return false}
  }

  allowMessage(sender,type){
    const now=Date.now(), rate=sender.rate||(sender.rate={window:now,messages:0,chat:0,host:0});
    if(now-rate.window>=10_000){rate.window=now;rate.messages=0;rate.chat=0;rate.host=0}
    rate.messages++; if(type==='chat')rate.chat++; if(type==='host-command')rate.host++;
    const ok=rate.messages<=80 && rate.chat<=12 && rate.host<=35;
    if(!ok)this.metrics.rateLimited++;
    return ok;
  }

  broadcastRoster(){
    const seq=++this.rosterSeq;
    const roster=this.admittedClients().map(([id,p])=>({id,name:p.name,role:p.role,handRaisedAt:p.handRaisedAt||0,media:p.media||{},network:p.network||'unknown'}));
    for(const [id,p] of this.admittedClients()){try{p.ws.send(JSON.stringify({type:'roster-state',peerId:id,roster,count:roster.length,seq}))}catch{}}
  }

  sendWelcome(peerId,classId,maxPeers,transport){
    const current=this.clients.get(peerId); if(!current)return;
    const roster=this.admittedClients().map(([id,p])=>({id,name:p.name,role:p.role,handRaisedAt:p.handRaisedAt||0,media:p.media||{},network:p.network||'unknown'}));
    this.safeSend(current,{type:'welcome',peerId,roster,seq:this.rosterSeq,room:{classId,maxPeers,locked:!!this.roomState.locked,ended:!!this.roomState.ended}});
  }

  async onMessage({evt,peerId,classId,name,role,maxPeers,transport}){
    if (typeof evt.data !== 'string' || evt.data.length > 32_000) return;
    let msg; try { msg = JSON.parse(evt.data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const sender=this.clients.get(peerId); if(!sender)return;
    sender.lastSeen=Date.now();
    if(!this.allowMessage(sender,msg.type)) { this.safeSend(sender,{type:'rate-limit',message:'Bạn đang thao tác quá nhanh. Vui lòng thử lại sau vài giây.'}); return; }
    if(msg.type==='heartbeat'){ this.sweepStaleClients(); this.safeSend(sender,{type:'heartbeat-ack',at:Date.now()}); return; }
    const host=['teacher','assistant','school_admin','super_admin'].includes(role);
    const lifecycleHost=['teacher','school_admin','super_admin'].includes(role);
    const roleRank=r=>({guest:0,student:1,assistant:2,teacher:3,school_admin:4,super_admin:5}[r]??0);
    const canModerate=targetClient=>!!targetClient && roleRank(role)>roleRank(targetClient.role);
    const roomSettings=sender.settings||{};
    if(!host){
      if(msg.type==='chat'&&!Number(roomSettings.allow_chat))return;
      if(['reaction','raise-hand','lower-hand','class-pulse'].includes(msg.type)&&!Number(roomSettings.allow_reactions))return;
      if(msg.type==='media-state'&&msg.source==='mic'&&!Number(roomSettings.allow_student_mic))return;
      if(msg.type==='media-state'&&msg.source==='camera'&&!Number(roomSettings.allow_student_camera))return;
      if(msg.type==='media-state'&&msg.source==='screen'&&!Number(roomSettings.allow_student_share))return;
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
      if(['lock-room','unlock-room','end-room'].includes(action)){
        if(!lifecycleHost){this.safeSend(sender,{type:'host-denied',message:'Chỉ giáo viên hoặc quản trị viên mới được thay đổi vòng đời phòng học.'});return;}
        if(action==='lock-room') this.roomState={...this.roomState,locked:true};
        if(action==='unlock-room') this.roomState={...this.roomState,locked:false};
        if(action==='end-room') this.roomState={locked:true,ended:true,endedAt:new Date().toISOString()};
        if(action==='end-room'){try{await this.env.DB.prepare(`UPDATE live_sessions SET status='ended', ended_at=CURRENT_TIMESTAMP WHERE class_id=? AND status IN ('scheduled','live','active')`).bind(classId).run()}catch{}}
        try{await this.state.storage?.put('roomState',this.roomState)}catch{}
        this.broadcast({type:'room-state',...this.roomState,by:name,byRole:role});
        await logLiveEvent(this.env,classId,action==='end-room'?'room.ended':'room.lock.changed',`peer:${peerId}`,name,{locked:this.roomState.locked,ended:this.roomState.ended}).catch(()=>{});
        if(action==='end-room'){
          for(const [id,p] of [...this.clients.entries()]){if(id===peerId)continue;this.safeSend(p,{type:'room-ended',message:'Giáo viên đã kết thúc phiên học.'});try{p.ws.close(4003,'room-ended')}catch{}}
        }
        return;
      }
      if(action==='remove' && target && this.clients.has(target)){const targetClient=this.clients.get(target);if(!canModerate(targetClient)){this.safeSend(sender,{type:'host-denied',message:'Bạn không thể xóa người có quyền ngang hoặc cao hơn.'});return;}await logLiveEvent(this.env,classId,'moderation.remove',`peer:${peerId}`,name,{target,target_name:targetClient.name,target_role:targetClient.role}).catch(()=>{});try{targetClient.ws.send(JSON.stringify({type:'host-command',action:'removed',from:peerId,fromName:name}));targetClient.ws.close(4001,'removed')}catch{};return;}
      if(action==='policy'){
        const incoming=msg.settings&&typeof msg.settings==='object'?msg.settings:{};
        const policy={};
        for(const k of ['allow_student_mic','allow_student_camera','allow_student_share','allow_chat','allow_reactions']) if(k in incoming) policy[k]=incoming[k]?1:0;
        for(const [,p] of this.clients) p.settings={...(p.settings||{}),...policy};
        this.broadcast({type:'host-command',action:'policy',settings:policy,from:peerId,fromName:name,fromRole:role},peerId);
        return;
      }
      if(target && this.clients.has(target)){const targetClient=this.clients.get(target);if(['mute','camera-off'].includes(action)&&!canModerate(targetClient)){this.safeSend(sender,{type:'host-denied',message:'Bạn không thể điều khiển thiết bị của người có quyền ngang hoặc cao hơn.'});return;}if(action==='lower-hand')targetClient.handRaisedAt=0;try{targetClient.ws.send(JSON.stringify({...msg,from:peerId,fromName:name,fromRole:role}));}catch{};if(action==='lower-hand')this.broadcastToHosts({type:'lower-hand',target});return;}
      // Bulk moderation must obey the same hierarchy as targeted moderation. A TA must never mute a teacher/admin.
      if(['mute','camera-off','lower-hand'].includes(action)){
        let affected=0;
        for(const [id,p] of this.admittedClients()){
          if(id===peerId || !canModerate(p))continue;
          if(action==='lower-hand')p.handRaisedAt=0;
          this.safeSend(p,{...msg,from:peerId,fromName:name,fromRole:role});
          affected++;
        }
        if(action==='lower-hand')this.broadcastRoster();
        if(['mute','camera-off'].includes(action)) await logLiveEvent(this.env,classId,`moderation.${action}`,`peer:${peerId}`,name,{scope:'bulk',affected}).catch(()=>{});
        return;
      }
      this.broadcast({...msg,from:peerId,fromName:name,fromRole:role},peerId); return;
    }

    if(!sender.admitted) return;
    const allowed = new Set(['heartbeat','offer','answer','ice','chat','reaction','raise-hand','lower-hand','presence','media-track-published','media-track-unpublished','media-state','class-pulse','whisper','ask-later','timer','poll-live','network-state']);
    if (!allowed.has(msg.type)) return;
    if(['timer','poll-live'].includes(msg.type)&&!host)return;
    if (msg.type === 'chat') msg.text = String(msg.text || '').slice(0, 2000);
    if (msg.type === 'media-track-published') { msg.sessionId=String(msg.sessionId||'').slice(0,120); msg.trackName=String(msg.trackName||'').slice(0,180); msg.kind=['audio','video'].includes(msg.kind)?msg.kind:''; msg.source=String(msg.source||'').slice(0,30); }
    if (msg.type === 'media-track-unpublished') { msg.trackName = String(msg.trackName || '').slice(0, 180); msg.source=String(msg.source||'').slice(0,30); if(msg.source==='screen'){sender.media={...(sender.media||{}),screen:false};this.broadcastRoster();} }
    if (msg.type === 'media-state') { msg.source = String(msg.source || '').slice(0,30); if(!['mic','camera','screen'].includes(msg.source))return; msg.enabled = !!msg.enabled; sender.media={...(sender.media||{}),[msg.source]:msg.enabled}; this.broadcastRoster(); }
    if (msg.type === 'network-state') { msg.tier=String(msg.tier||'unknown').slice(0,20); sender.network=msg.tier; }
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

  broadcastToHosts(payload){const raw=JSON.stringify(payload);for(const [,p] of this.clients){if(!['teacher','assistant','school_admin','super_admin'].includes(p.role))continue;this.safeSend(p,raw)}}

  broadcast(payload, exceptId = null) {
    const raw = JSON.stringify(payload);
    for (const [id, p] of this.clients.entries()) {
      if (id === exceptId || !p.admitted) continue;
      this.safeSend(p,raw);
    }
  }
}
