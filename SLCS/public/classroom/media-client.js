export class SkyMediaClient {
  constructor({ classId, accessToken, api, onRemoteTrack=()=>{}, onState=()=>{}, maxVideoSubscriptions=12 }) {
    this.classId = classId;
    this.accessToken = accessToken;
    this.api = api;
    this.onRemoteTrack = onRemoteTrack;
    this.onState = onState;
    this.sessionId = '';
    this.pc = null;
    this.published = new Map();
    this.subscribed = new Set();
    this.pendingByMid = new Map();
    this.queue = Promise.resolve();
    this.closed = false;
    this.maxVideoSubscriptions = Math.max(2, Math.min(24, Number(maxVideoSubscriptions || 12)));
    this.videoSubscriptions = new Set();
    this.recovering = false;
  }

  _serial(fn) {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(()=>{});
    return next;
  }

  async init() {
    if (this.pc && this.sessionId) return this;
    const r = await this.api('/api/live/media/session/new', {
      method: 'POST',
      body: JSON.stringify({ class_id: this.classId, access_token: this.accessToken })
    });
    this.sessionId = r.session_id;
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      bundlePolicy: 'max-bundle'
    });
    this.pc.addEventListener('connectionstatechange', () => { this.onState(this.pc.connectionState); if(['failed','disconnected'].includes(this.pc.connectionState)) this.recoverIce(); });
    this.pc.addEventListener('iceconnectionstatechange', () => this.onState(`ice:${this.pc.iceConnectionState}`));
    this.pc.addEventListener('track', event => {
      const mid = event.transceiver?.mid;
      const meta = this.pendingByMid.get(mid) || {};
      if (mid) this.pendingByMid.delete(mid);
      this.onRemoteTrack(event.track, meta, event.streams?.[0] || null);
    });
    return this;
  }

  async publishTrack(track, source='camera') {
    if (!track) throw new Error('Track không hợp lệ.');
    await this.init();
    return this._serial(async () => {
      const existing = this.published.get(source);
      if (existing?.sender) {
        await existing.sender.replaceTrack(track);
        existing.track = track;
        return existing.meta;
      }
      const transceiver = this.pc.addTransceiver(track, { direction: 'sendonly' });
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const trackName = `${source}:${crypto.randomUUID()}`;
      const result = await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/tracks`, {
        method: 'POST',
        body: JSON.stringify({
          class_id: this.classId,
          access_token: this.accessToken,
          operation: 'publish',
          sessionDescription: { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp },
          tracks: [{ location: 'local', mid: transceiver.mid, trackName, kind: track.kind, source }]
        })
      });
      if (result.sessionDescription) await this.pc.setRemoteDescription(result.sessionDescription);
      const cloudTrack = result.tracks?.find(x => x.trackName === trackName) || result.tracks?.[0] || {};
      const meta = {
        sessionId: this.sessionId,
        trackName,
        mid: cloudTrack.mid ?? transceiver.mid,
        kind: track.kind,
        source
      };
      this.published.set(source, { sender: transceiver.sender, transceiver, track, meta });
      return meta;
    });
  }

  async setPublishedEnabled(source, enabled) {
    const item = this.published.get(source);
    if (!item?.track) return false;
    item.track.enabled = !!enabled;
    return true;
  }

  async unpublish(source) {
    const item = this.published.get(source);
    if (!item) return;
    try { await item.sender.replaceTrack(null); } catch {}
    this.published.delete(source);
    try {
      await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/unpublish`, {
        method: 'POST',
        body: JSON.stringify({ class_id: this.classId, access_token: this.accessToken, track_name: item.meta.trackName })
      });
    } catch {}
  }

  async subscribe(meta) {
    if (!meta?.sessionId || !meta?.trackName || meta.sessionId === this.sessionId) return;
    const key = `${meta.sessionId}:${meta.trackName}`;
    if (this.subscribed.has(key)) return;
    const isVideo = meta.kind === 'video';
    const priorityVideo = meta.source === 'screen' || ['teacher','assistant'].includes(meta.role);
    if (isVideo && !priorityVideo && this.videoSubscriptions.size >= this.maxVideoSubscriptions) return;
    this.subscribed.add(key);
    if (isVideo) this.videoSubscriptions.add(key);
    try {
      await this.init();
      await this._serial(async () => {
        const result = await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/tracks`, {
          method: 'POST',
          body: JSON.stringify({
            class_id: this.classId,
            access_token: this.accessToken,
            operation: 'subscribe',
            tracks: [{ location: 'remote', sessionId: meta.sessionId, trackName: meta.trackName }]
          })
        });
        for (const t of result.tracks || []) {
          if (t.mid != null) this.pendingByMid.set(String(t.mid), { ...meta, mid: String(t.mid) });
        }
        if (result.requiresImmediateRenegotiation && result.sessionDescription) {
          await this.pc.setRemoteDescription(result.sessionDescription);
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/renegotiate`, {
            method: 'PUT',
            body: JSON.stringify({
              class_id: this.classId,
              access_token: this.accessToken,
              sessionDescription: { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp }
            })
          });
        } else if (result.sessionDescription?.type === 'answer') {
          await this.pc.setRemoteDescription(result.sessionDescription);
        }
      });
    } catch (e) {
      this.subscribed.delete(key);
      this.videoSubscriptions.delete(key);
      throw e;
    }
  }


  setAdaptiveLimit(limit=12) {
    this.maxVideoSubscriptions = Math.max(2, Math.min(24, Number(limit || 12)));
  }

  async recoverIce() {
    if (this.closed || this.recovering || !this.pc) return;
    this.recovering = true;
    try {
      this.onState('recovering');
      this.pc.restartIce?.();
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      const result = await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/renegotiate`, {
        method: 'PUT',
        body: JSON.stringify({
          class_id: this.classId,
          access_token: this.accessToken,
          sessionDescription: { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp }
        })
      });
      if (result?.sessionDescription) await this.pc.setRemoteDescription(result.sessionDescription);
      this.onState('recovered');
    } catch (e) {
      this.onState(`recover-failed:${e?.message||'unknown'}`);
    } finally {
      setTimeout(()=>{ this.recovering=false; }, 1800);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try { this.pc?.close(); } catch {}
    if (this.sessionId) {
      try {
        await this.api(`/api/live/media/session/${encodeURIComponent(this.sessionId)}/end`, {
          method: 'POST', body: JSON.stringify({ class_id: this.classId, access_token: this.accessToken })
        });
      } catch {}
    }
  }
}
