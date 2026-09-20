export class SkyMediaClient {
  constructor({ classId, accessToken, api, onRemoteTrack=()=>{}, onState=()=>{}, maxVideoSubscriptions=12 }) {
    this.classId=classId; this.accessToken=accessToken; this.api=api; this.onRemoteTrack=onRemoteTrack; this.onState=onState;
    this.sessionId=''; this.pc=null; this.published=new Map(); this.subscribed=new Set(); this.subscribing=new Set();
    this.queue=Promise.resolve(); this.closed=false; this.maxVideoSubscriptions=Math.max(2,Math.min(24,Number(maxVideoSubscriptions||12)));
    this.videoSubscriptions=new Set(); this.recovering=false; this.remoteMetaByMid=new Map(); this.remoteWaitersByMid=new Map();
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
    this.pc.addEventListener('track',event=>{const mid=event.transceiver?.mid!=null?String(event.transceiver.mid):'';const meta=this.remoteMetaByMid.get(mid)||{};const waiter=this.remoteWaitersByMid.get(mid);if(waiter)waiter.resolve(event.track);this.onRemoteTrack(event.track,meta,event.streams?.[0]||null)});
    return this;
  }
  async publishTrack(track,source='camera'){
    if(!track)throw new Error('Track không hợp lệ.');await this.init();
    return this._serial(async()=>{
      const existing=this.published.get(source);if(existing?.sender){await existing.sender.replaceTrack(track);existing.track=track;return existing.meta}
      const transceiver=this.pc.addTransceiver(track,{direction:'sendonly'});
      const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);
      const mid=transceiver.mid;if(mid==null)throw new Error('MEDIA_PUBLISH_MID_MISSING');
      const trackName=`${source}:${track.id||crypto.randomUUID()}`;
      // Follow Cloudflare's reference flow exactly: send the SDP returned by createOffer().
      const result=await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/tracks`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,operation:'publish',sessionDescription:{type:'offer',sdp:offer.sdp},tracks:[{location:'local',mid,trackName,kind:track.kind,source}]})});
      if(result?.sessionDescription?.type!=='answer'||!result.sessionDescription?.sdp)throw new Error('MEDIA_PUBLISH_ANSWER_MISSING');
      await this.pc.setRemoteDescription(result.sessionDescription);await this._waitForConnected();
      const cloudTrack=result.tracks?.find(x=>x.trackName===trackName)||result.tracks?.[0];if(!cloudTrack?.trackName)throw new Error('MEDIA_PUBLISH_TRACK_MISSING');
      const meta={sessionId:this.sessionId,trackName:cloudTrack.trackName,mid:cloudTrack.mid??mid,kind:track.kind,source};this.published.set(source,{sender:transceiver.sender,transceiver,track,meta});return meta;
    })
  }
  async setPublishedEnabled(source,enabled){const item=this.published.get(source);if(!item?.track)return false;item.track.enabled=!!enabled;return true}
  async unpublish(source){const item=this.published.get(source);if(!item)return;try{await item.sender.replaceTrack(null)}catch{};this.published.delete(source);try{await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/unpublish`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,track_name:item.meta.trackName})})}catch{}}
  async subscribe(meta){
    if(!meta?.sessionId||!meta?.trackName||meta.sessionId===this.sessionId)return;const key=`${meta.sessionId}:${meta.trackName}`;
    if(this.subscribed.has(key)||this.subscribing.has(key))return;const isVideo=meta.kind==='video',priorityVideo=meta.source==='screen'||['teacher','assistant'].includes(meta.role);if(isVideo&&!priorityVideo&&this.videoSubscriptions.size>=this.maxVideoSubscriptions)return;
    this.subscribing.add(key);
    try{await this.init();await this._serial(async()=>{
      const result=await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/tracks`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,operation:'subscribe',tracks:[{location:'remote',sessionId:meta.sessionId,trackName:meta.trackName}]})});
      const pulled=result.tracks||[];if(!pulled.length)throw new Error('MEDIA_SUBSCRIBE_TRACK_MISSING');
      const waits=[];for(const t of pulled){if(t.mid==null)throw new Error('MEDIA_SUBSCRIBE_MID_MISSING');const mid=String(t.mid);this.remoteMetaByMid.set(mid,{...meta,mid});waits.push(this._waitForRemoteMid(mid))}
      if(result.requiresImmediateRenegotiation||result.sessionDescription?.type==='offer'){
        if(result.sessionDescription?.type!=='offer'||!result.sessionDescription?.sdp)throw new Error('MEDIA_SUBSCRIBE_OFFER_MISSING');
        await this.pc.setRemoteDescription(result.sessionDescription);const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);
        const rr=await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/renegotiate`,{method:'PUT',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,sessionDescription:{type:'answer',sdp:answer.sdp}})});if(rr?.errorCode)throw new Error(rr.errorDescription||'MEDIA_RENEGOTIATE_FAILED');
      } else if(result.sessionDescription?.type==='answer'&&this.pc.signalingState==='have-local-offer') await this.pc.setRemoteDescription(result.sessionDescription);
      await this._waitForConnected();await Promise.all(waits);
    });this.subscribed.add(key);if(isVideo)this.videoSubscriptions.add(key)
    }catch(e){this.subscribed.delete(key);this.videoSubscriptions.delete(key);throw e}finally{this.subscribing.delete(key)}
  }
  setAdaptiveLimit(limit=12){this.maxVideoSubscriptions=Math.max(2,Math.min(24,Number(limit||12)))}
  async recoverIce(){if(this.closed||this.recovering||!this.pc||!this.sessionId)return;this.recovering=true;try{this.onState('recovering');this.pc.restartIce?.();const offer=await this.pc.createOffer({iceRestart:true});await this.pc.setLocalDescription(offer);const result=await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/renegotiate`,{method:'PUT',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken,sessionDescription:{type:'offer',sdp:offer.sdp}})});if(result?.sessionDescription?.sdp)await this.pc.setRemoteDescription(result.sessionDescription);await this._waitForConnected();this.onState('recovered')}catch(e){this.onState(`recover-failed:${e?.message||'unknown'}`)}finally{setTimeout(()=>{this.recovering=false},1800)}}
  async close(){if(this.closed)return;this.closed=true;try{this.pc?.close()}catch{};if(this.sessionId){try{await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/end`,{method:'POST',body:JSON.stringify({class_id:this.classId,access_token:this.accessToken})})}catch{}}}
}
