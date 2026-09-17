export function createScreenShareController({
  getDisplayMedia,
  publish = async () => null,
  unpublish = async () => {},
  onPreview = () => {},
  onState = () => {},
  onStopped = () => {},
  onError = () => {}
} = {}) {
  let track = null;
  let meta = null;
  let starting = null;
  let stopping = null;
  let endedHandler = null;

  const snapshot = () => ({ active: !!track, track, meta });
  const emit = reason => onState({ ...snapshot(), reason });

  async function start() {
    if (track) return snapshot();
    if (starting) return starting;
    starting = (async () => {
      let next = null;
      try {
        const stream = await getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
        next = stream?.getVideoTracks?.()[0] || null;
        if (!next) throw new Error('Không nhận được luồng trình chiếu.');
        track = next;
        endedHandler = () => { stop('browser', { notify: false }).catch(onError); };
        next.addEventListener?.('ended', endedHandler, { once: true });
        if (!next.addEventListener) next.onended = endedHandler;
        onPreview(next);
        emit('started-local');
        meta = await publish(next);
        emit('started');
        return snapshot();
      } catch (error) {
        if (next) {
          try { next.removeEventListener?.('ended', endedHandler); } catch {}
          try { next.onended = null; next.stop?.(); } catch {}
        }
        track = null; meta = null; endedHandler = null;
        onPreview(null); emit('start-failed'); onError(error);
        throw error;
      } finally {
        starting = null;
      }
    })();
    return starting;
  }

  async function stop(reason = 'user', { notify = true } = {}) {
    if (stopping) return stopping;
    if (!track && !meta) { onPreview(null); emit(reason); return false; }
    stopping = (async () => {
      const oldTrack = track;
      const oldMeta = meta;
      track = null;
      meta = null;
      try {
        if (oldTrack) {
          try { oldTrack.removeEventListener?.('ended', endedHandler); } catch {}
          try { oldTrack.onended = null; } catch {}
          if (oldTrack.readyState !== 'ended') { try { oldTrack.stop?.(); } catch {} }
        }
        endedHandler = null;
        await unpublish(oldMeta, reason);
      } finally {
        onPreview(null);
        emit(reason);
        if (notify) onStopped(reason);
      }
      return true;
    })().catch(error => { onError(error); throw error; }).finally(() => { stopping = null; });
    return stopping;
  }

  async function toggle() { return track ? stop('user') : start(); }
  async function destroy() { try { await stop('leave', { notify: false }); } catch {} }

  return {
    start, stop, toggle, destroy,
    get active() { return !!track; },
    get track() { return track; },
    get meta() { return meta; }
  };
}
