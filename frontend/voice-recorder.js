(function (root) {
  class VoiceRecorder {
    constructor({ mediaDevices = root.navigator?.mediaDevices, Recorder = root.MediaRecorder,
      onChange = () => {}, now = () => root.performance?.now() ?? Date.now(), createURL = blob => root.URL.createObjectURL(blob), revokeURL = url => root.URL.revokeObjectURL(url),
      timers = root } = {}) {
      Object.assign(this, { mediaDevices, Recorder, onChange, now, createURL, revokeURL, timers });
      this.session = 0; this.state = { phase: 'idle', elapsed: 0 }; this.chunks = [];
    }
    emit(phase, extra = {}) { this.state = { ...this.state, phase, ...extra }; this.onChange(this.state); }
    clearTimers() { this.timers.clearInterval(this.interval); this.timers.clearTimeout(this.timeout); }
    cancel() {
      ++this.session; this.clearTimers();
      const recorder = this.recorder; this.recorder = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      if (this.state.url) this.revokeURL(this.state.url);
      this.chunks = []; this.state = { phase: 'idle', elapsed: 0 }; this.onChange(this.state);
    }
    fail(message) { this.cancel(); this.emit('error', { error: message }); }
    async start() {
      this.cancel();
      if (!this.mediaDevices?.getUserMedia || !this.Recorder) { this.emit('error', { error: 'Voice recording needs a supported browser on HTTPS.' }); return; }
      const session = this.session;
      this.emit('requesting');
      try {
        const stream = await this.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
        if (session !== this.session) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream;
        const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => this.Recorder.isTypeSupported(type));
        if (!mimeType) { this.fail('This browser cannot record a supported audio format.'); return; }
        const recorder = new this.Recorder(stream, { mimeType, audioBitsPerSecond: 64000 });
        this.recorder = recorder; let bytes = 0;
        recorder.ondataavailable = event => {
          if (session !== this.session || !event.data?.size) return;
          bytes += event.data.size;
          if (bytes > 5 * 1024 * 1024) { this.fail('Recording is too large. Please record a shorter message.'); return; }
          this.chunks.push(event.data);
        };
        recorder.onerror = () => { if (session === this.session) this.fail('Recording failed. Please try again.'); };
        recorder.onstop = () => {
          if (session !== this.session) return;
          this.clearTimers(); stream.getTracks().forEach(track => track.stop()); this.stream = null; this.recorder = null;
          const blob = new Blob(this.chunks, { type: recorder.mimeType || mimeType }); this.chunks = [];
          if (!blob.size) { this.fail('No audio was captured. Please record again.'); return; }
          this.emit('ready', { blob, url: this.createURL(blob), elapsed: Math.min(120, (this.now() - this.startedAt) / 1000) });
        };
        stream.getTracks().forEach(track => track.addEventListener('ended', () => { if (session === this.session) this.stop(); }));
        this.startedAt = this.now(); recorder.start(250); this.emit('recording', { elapsed: 0 });
        this.interval = this.timers.setInterval(() => {
          if (session !== this.session || this.state.phase !== 'recording') return;
          const elapsed = Math.min(120, (this.now() - this.startedAt) / 1000);
          this.emit('recording', { elapsed }); if (elapsed >= 120) this.stop();
        }, 250);
        this.timeout = this.timers.setTimeout(() => this.stop(), 120000);
      } catch (error) {
        if (session === this.session) this.fail(error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser and try again.' : 'Could not access the microphone. Check your device and try again.');
      }
    }
    stop() {
      if (!this.recorder || this.recorder.state === 'inactive' || this.state.phase !== 'recording') return;
      this.clearTimers(); this.emit('stopping'); this.recorder.stop();
      this.stream?.getTracks().forEach(track => track.stop());
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { VoiceRecorder };
  else root.VoiceRecorder = VoiceRecorder;
})(typeof window !== 'undefined' ? window : globalThis);
