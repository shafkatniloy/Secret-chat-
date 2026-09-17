const test = require('node:test');
const assert = require('node:assert/strict');
const { VoiceRecorder } = require('../frontend/voice-recorder');

function fixture(options = {}) {
  let time = 0, stopped = 0, stopEvents = 0;
  const states = [], revoked = [], callbacks = {};
  const stream = { getTracks: () => [{ stop() { stopped++; }, addEventListener() {} }] };
  class Recorder {
    static isTypeSupported(type) { return type === (options.mime || 'audio/webm;codecs=opus'); }
    constructor(_stream, opts) { this.mimeType = opts.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive'; stopEvents++;
      this.ondataavailable({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop();
    }
  }
  const recorder = new VoiceRecorder({ Recorder, mediaDevices: { getUserMedia: options.getUserMedia || (async () => stream) },
    now: () => time, createURL: () => 'blob:preview', revokeURL: url => revoked.push(url), onChange: state => states.push(state),
    timers: { setInterval(fn) { callbacks.interval = fn; return 1; }, clearInterval() {}, setTimeout(fn, ms) { assert.equal(ms, 120000); callbacks.timeout = fn; return 2; }, clearTimeout() {} } });
  return { recorder, states, revoked, callbacks, stream, advance(ms) { time += ms; }, stopped: () => stopped, stopEvents: () => stopEvents };
}

test('tap record/stop creates a local preview, releases the microphone, and cancel revokes it', async () => {
  const f = fixture(); await f.recorder.start();
  assert.equal(f.recorder.state.phase, 'recording');
  f.advance(4000); f.recorder.stop();
  assert.equal(f.recorder.state.phase, 'ready'); assert.equal(f.recorder.state.elapsed, 4);
  assert(f.recorder.state.blob.size > 0); assert(f.stopped() > 0);
  f.recorder.cancel(); assert.equal(f.recorder.state.phase, 'idle'); assert.deepEqual(f.revoked, ['blob:preview']);
});

test('two-minute limit automatically stops; Safari-compatible MP4 can be selected', async () => {
  const f = fixture({ mime: 'audio/mp4' }); await f.recorder.start(); f.advance(120000); f.callbacks.timeout();
  assert.equal(f.recorder.state.phase, 'ready'); assert.equal(f.recorder.state.elapsed, 120);
  assert.equal(f.recorder.state.blob.type, 'audio/mp4'); assert.equal(f.stopEvents(), 1);
});

test('cancel while permission is pending releases a later microphone grant without recording', async () => {
  let resolve;
  const f = fixture({ getUserMedia: () => new Promise(done => { resolve = done; }) });
  const pending = f.recorder.start(); f.recorder.cancel(); resolve(f.stream); await pending;
  assert.equal(f.recorder.state.phase, 'idle'); assert.equal(f.stopEvents(), 0); assert(f.stopped() > 0);
});

test('permission denial and recorder failure leave no active microphone or preview', async () => {
  const denied = fixture({ getUserMedia: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); } });
  await denied.recorder.start(); assert.equal(denied.recorder.state.phase, 'error'); assert.match(denied.recorder.state.error, /permission/);
  const f = fixture(); await f.recorder.start(); f.recorder.recorder.onerror();
  assert.equal(f.recorder.state.phase, 'error'); assert.equal(f.recorder.state.url, undefined); assert(f.stopped() > 0);
});

test('oversized recordings are discarded locally', async () => {
  const f = fixture(); await f.recorder.start();
  f.recorder.recorder.ondataavailable({ data: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]) });
  assert.equal(f.recorder.state.phase, 'error'); assert.equal(f.recorder.state.blob, undefined);
});
