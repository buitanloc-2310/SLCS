export class SkyMediaClient {
  constructor({ classId, accessToken, api, onRemoteTrack=()=>{}, onState=()=>{}, maxVideoSubscriptions=12 }) {
    this.classId=classId; this.accessToken=accessToken; this.api=api; this.onRemoteTrack=onRemoteTrack; this.onState=onState;
    this.sessionId=''; this.pc=null; this.published=new Map(); this.subscribed=new Set(); this.subscribing=new Set();
    this.queue=Promise.resolve(); this.closed=false; this.maxVideoSubscriptions=Math.max(2,Math.min(24,Number(maxVideoSubscriptions||12)));
    this.videoSubscriptions=new Set(); this.recovering=false; this.remoteMetaByMid=new Map(); this.remoteWaitersByMid=new Map(); this.remoteStreamsBySession=new Map();
  }
  _serial(fn){const next=this.queue.then(fn,fn);this.queue=next.catch(()=>{});return next}
  _waitForConnected(timeoutMs=8000){
    const pc=this.pc;if(!pc)return Promise.reject(new Error('MEDIA_PC_MISSING'));
    if(pc.connectionState==='connected'||pc.iceConnectionState==='connected'||pc.iceConnectionState==='completed')return Promise.resolve();
    return new Promise((resolve,reject)=>{let done=false;const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);pc.removeEventListener('connectionstatechange',check);pc.removeEventListener('iceconnectionstatechange',check);err?reject(err):resolve()};const check=()=>{if(pc.connectionState==='connected'||pc.iceConnectionState==='connected'||pc.iceConnectionState==='completed')finish();else if(pc.connectionState==='failed'||pc.iceConnectionState==='failed')finish(new Error('MEDIA_ICE_FAILED'))};const timer=setTimeout(()=>finish(new Error('MEDIA_CONNECT_TIMEOUT')),timeoutMs);pc.addEventListener('connectionstatechange',check);pc.addEventListener('iceconnectionstatechange',check)})
  }
  _waitForRemoteMid(mid,timeoutMs=8000){
    mid=String(mid);const existing=this.remoteWaitersByMid.get(mid);if(existing)return existing.promise;
    let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});const timer=setTimeout(()=>{this.remoteWaitersByMid.delete(mid);reject(new Error('MEDIA_REMOTE_TRACK_TIMEOUT'))},timeoutMs);
    this.remoteWaitersByMid.set(mid,{promise,resolve:(track)=>{clearTimeout(timer);this.remoteWaitersByMid.delete(mid);resolve(track)},reject});return promise;
  }
  async init(){
    if(this.pc&&this.sessionId&&!this.closed)return this;
    this.closed=false;const r=await this.api('/api/live/media/session/new',{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken})});
    if(!r?.session_id)throw new Error('MEDIA_SESSION_MISSING');this.sessionId=r.session_id;
    this.pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],bundlePolicy:'max-bundle'});
    this.pc.addEventListener('connectionstatechange',()=>{this.onState(this.pc.connectionState);if(this.pc.connectionState==='failed')this.recoverIce()});
    this.pc.addEventListener('iceconnectionstatechange',()=>this.onState(`ice:${this.pc.iceConnectionState}`));
    this.pc.addEventListener('track',event=>{
      const track=event.track;
      const mid=event.transceiver?.mid!=null?String(event.transceiver.mid):'';
      let meta=this.remoteMetaByMid.get(mid)||null;
      // Cloudflare normally returns the receiver MID used in the subsequent offer.
      // If a browser/SFU remaps it, only fall back when there is exactly one unresolved
      // subscription of the same media kind. Never guess between multiple participants.
      if(!meta){
        const candidates=[...this.remoteMetaByMid.entries()].filter(([candidateMid,candidate])=>{
          if(this.remoteWaitersByMid.get(candidateMid)==null)return false;
          return !candidate?.kind||candidate.kind===track.kind;
        });
        if(candidates.length===1){
          const [mappedMid,mappedMeta]=candidates[0];
          meta=mappedMeta;
          if(mid&&mid!==mappedMid){
            this.remoteMetaByMid.set(mid,{...mappedMeta,mid});
            console.warn('[P0][MID_REMAP]',{expectedMid:mappedMid,actualMid:mid,trackId:track.id,kind:track.kind});
          }
        }
      }
      meta=meta||{};
      const sessionKey=String(meta.sessionId||mid||track.id||'remote');
      let stream=this.remoteStreamsBySession.get(sessionKey);
      if(!stream){stream=new MediaStream();this.remoteStreamsBySession.set(sessionKey,stream)}
      if(!stream.getTracks().some(t=>t.id===track.id))stream.addTrack(track);
      const waiter=this.remoteWaitersByMid.get(mid)||([...this.remoteWaitersByMid.entries()].find(([candidateMid])=>this.remoteMetaByMid.get(candidateMid)?.sessionId===meta.sessionId&&this.remoteMetaByMid.get(candidateMid)?.trackName===meta.trackName)?.[1]);
      if(waiter)waiter.resolve(track);
      console.log('[P0][ONTRACK]',{mid,trackId:track.id,kind:track.kind,readyState:track.readyState,muted:track.muted,sessionId:meta.sessionId||'UNKNOWN',trackName:meta.trackName||'UNKNOWN'});
      this.onRemoteTrack(track,meta,stream);
    });
    return this;
  }
  async publishTrack(track,source='camera'){
    if(!track)throw new Error('Track không hợp lệ.');await this.init();
    return this._serial(async()=>{
      const existing=this.published.get(source);if(existing?.sender){await existing.sender.replaceTrack(track);existing.track=track;return existing.meta}
      // A Cloudflare Realtime Session maps 1:1 to this PeerConnection.  Every SDP
      // mutation is serialized by _serial(); never start a local publish while a
      // server-offer subscription is still being answered.
      if(this.pc.signalingState!=='stable')throw new Error('MEDIA_SIGNALING_NOT_STABLE');
      const transceiver=this.pc.addTransceiver(track,{direction:'sendonly'});
      const offer=await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      // Use the description actually installed on the PeerConnection.  On mobile
      // Chromium this is important after prior SFU renegotiations because it is the
      // browser's canonical MID/m-section state for the current negotiation.
      const localOffer=this.pc.localDescription;
      const mid=transceiver.mid;if(mid==null)throw new Error('MEDIA_PUBLISH_MID_MISSING');
      if(localOffer?.type!=='offer'||!localOffer.sdp)throw new Error('MEDIA_PUBLISH_OFFER_MISSING');
      const trackName=`${source}:${track.id||crypto.randomUUID()}`;
      console.log('[P0.2][PUBLISH_OFFER]',{source,kind:track.kind,mid,signalingState:this.pc.signalingState,transceivers:this.pc.getTransceivers().map(t=>({mid:t.mid,direction:t.direction,currentDirection:t.currentDirection,kind:t.sender?.track?.kind||t.receiver?.track?.kind||''}))});
      const result=await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/tracks`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,operation:'publish',sessionDescription:{type:localOffer.type,sdp:localOffer.sdp},tracks:[{location:'local',mid,trackName,kind:track.kind,source}]})});
      if(result?.sessionDescription?.type!=='answer'||!result.sessionDescription?.sdp)throw new Error('MEDIA_PUBLISH_ANSWER_MISSING');
      try{
        await this.pc.setRemoteDescription(result.sessionDescription);
      }catch(error){
        console.error('[P0.2][PUBLISH_ANSWER_REJECTED]',{source,kind:track.kind,mid,signalingState:this.pc.signalingState,error:error?.message||String(error)});
        // Do not leave a failed sender feeding media locally.  A failed SFU answer
        // must be treated as a failed publish rather than pretending the camera is live.
        try{await transceiver.sender.replaceTrack(null)}catch{}
        try{transceiver.stop()}catch{}
        throw new Error('MEDIA_PUBLISH_NEGOTIATION_FAILED');
      }
      console.log('[P0.2][PUBLISH_ANSWER_OK]',{source,kind:track.kind,mid,signalingState:this.pc.signalingState});
      await this._waitForConnected();
      const cloudTrack=result.tracks?.find(x=>x.trackName===trackName)||result.tracks?.[0];if(!cloudTrack?.trackName)throw new Error('MEDIA_PUBLISH_TRACK_MISSING');
      const meta={sessionId:this.sessionId,trackName:cloudTrack.trackName,mid:cloudTrack.mid??mid,kind:track.kind,source};this.published.set(source,{sender:transceiver.sender,transceiver,track,meta});return meta;
    })
  }
  async setPublishedEnabled(source,enabled){const item=this.published.get(source);if(!item?.track)return false;item.track.enabled=!!enabled;return true}
  async heartbeat(){if(this.closed||!this.sessionId)return false;await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/heartbeat`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken})});return true}
  async unpublish(source){const item=this.published.get(source);if(!item)return;try{await item.sender.replaceTrack(null)}catch{};this.published.delete(source);try{await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/unpublish`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,track_name:item.meta.trackName})})}catch{}}
  async subscribe(meta){
    if(!meta?.sessionId||!meta?.trackName||meta.sessionId===this.sessionId)return;const key=`${meta.sessionId}:${meta.trackName}`;
    if(this.subscribed.has(key)||this.subscribing.has(key))return;const isVideo=meta.kind==='video',priorityVideo=meta.source==='screen'||['teacher','assistant'].includes(meta.role);if(isVideo&&!priorityVideo&&this.videoSubscriptions.size>=this.maxVideoSubscriptions)return;
    this.subscribing.add(key);
    try{await this.init();await this._serial(async()=>{
      const result=await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/tracks`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,operation:'subscribe',tracks:[{location:'remote',sessionId:meta.sessionId,trackName:meta.trackName}]})});
      console.log('[P0][SUBSCRIBE_REQUEST]',{localSessionId:this.sessionId,remoteSessionId:meta.sessionId,trackName:meta.trackName,kind:meta.kind,source:meta.source});
      const pulled=result.tracks||[];if(!pulled.length)throw new Error('MEDIA_SUBSCRIBE_TRACK_MISSING');
      console.log('[P0][SUBSCRIBE_RESPONSE]',{tracks:pulled,requiresImmediateRenegotiation:!!result.requiresImmediateRenegotiation,sdpType:result.sessionDescription?.type||''});
      // Populate all MID metadata synchronously before setRemoteDescription(). setRemoteDescription
      // is the point at which the browser may dispatch `track` events.
      const waits=[];for(const t of pulled){if(t.mid==null)throw new Error('MEDIA_SUBSCRIBE_MID_MISSING');const mid=String(t.mid);const mapped={...meta,sessionId:t.sessionId||t.session_id||meta.sessionId,trackName:t.trackName||t.track_name||meta.trackName,kind:t.kind||meta.kind,source:t.source||meta.source,ownerName:t.ownerName||t.owner_name||meta.ownerName,mid};this.remoteMetaByMid.set(mid,mapped);waits.push(this._waitForRemoteMid(mid));console.log('[P0][MID_MAPPED]',{mid,sessionId:mapped.sessionId,trackName:mapped.trackName,kind:mapped.kind,source:mapped.source})}
      if(result.requiresImmediateRenegotiation||result.sessionDescription?.type==='offer'){
        if(result.sessionDescription?.type!=='offer'||!result.sessionDescription?.sdp)throw new Error('MEDIA_SUBSCRIBE_OFFER_MISSING');
        await this.pc.setRemoteDescription(result.sessionDescription);console.log('[P0][REMOTE_DESCRIPTION]',{signalingState:this.pc.signalingState});const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);console.log('[P0][LOCAL_ANSWER]',{signalingState:this.pc.signalingState});
        const rr=await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/renegotiate`,{method:'PUT',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,sessionDescription:{type:'answer',sdp:answer.sdp}})});if(rr?.errorCode)throw new Error(rr.errorDescription||'MEDIA_RENEGOTIATE_FAILED');
      } else if(result.sessionDescription?.type==='answer'&&this.pc.signalingState==='have-local-offer') await this.pc.setRemoteDescription(result.sessionDescription);
      await this._waitForConnected();await Promise.all(waits);
    });this.subscribed.add(key);if(isVideo)this.videoSubscriptions.add(key)
    }catch(e){this.subscribed.delete(key);this.videoSubscriptions.delete(key);throw e}finally{this.subscribing.delete(key)}
  }
  setAdaptiveLimit(limit=12){this.maxVideoSubscriptions=Math.max(2,Math.min(24,Number(limit||12)))}
  async recoverIce(){if(this.closed||this.recovering||!this.pc||!this.sessionId)return;this.recovering=true;try{this.onState('recovering');this.pc.restartIce?.();const offer=await this.pc.createOffer({iceRestart:true});await this.pc.setLocalDescription(offer);const result=await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/renegotiate`,{method:'PUT',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,sessionDescription:{type:'offer',sdp:offer.sdp}})});if(result?.sessionDescription?.sdp)await this.pc.setRemoteDescription(result.sessionDescription);await this._waitForConnected();this.onState('recovered')}catch(e){this.onState(`recover-failed:${e?.message||'unknown'}`)}finally{setTimeout(()=>{this.recovering=false},1800)}}
  async close({keepalive=false}={}){if(this.closed)return;this.closed=true;this.remoteStreamsBySession.clear();try{this.pc?.close()}catch{};if(this.sessionId){try{if(keepalive){fetch(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/end`,{method:'POST',credentials:'include',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({class_id:this.classId,access_token:this.accessToken})}).catch(()=>{})}else await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/end`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken})})}catch{}}}
}
