const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function fixture() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.open = false; this.paused = false; }
    appendChild(node) { this.children.push(node); node.parent = this; }
    replaceChildren() { this.children = []; }
    querySelectorAll(selector) {
      return this.children.flatMap(node => [(selector === 'audio' ? node.tag === 'audio' : node.tag === 'button' && node.id !== 'closeMemories') ? node : null, ...node.querySelectorAll(selector)]).filter(Boolean);
    }
    addEventListener(name, handler) { this.events[name] = handler; }
    setAttribute(name, value) { this[name] = value; }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    pause() { this.paused = true; }
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const ids = {};
  for (const id of ['memoryDialog','memoryList','memoryStatus','moreMemories','closeMemories','refreshMemories','randomMemory','memoryMenuButton']) {
    ids[id] = new Element(id.endsWith('Memories') || ['randomMemory','memoryMenuButton'].includes(id) ? 'button' : 'div'); ids[id].id = id;
    if (id !== 'memoryDialog') ids.memoryDialog.appendChild(ids[id]);
  }
  const calls = [];
  const context = vm.createContext({ currentUsername: 'Alice', localPreview: false,
    socket: { connected: true, timeout() { return this; }, emit(event, payload, ack) { calls.push({ event, payload, ack }); } },
    document: { getElementById: id => ids[id], createElement: tag => new Element(tag), addEventListener() {} },
    closeIconMenu() {}, closeMessageMenu() {}, closeAttachmentMenu() {}, scheduleReadReceipts() {},
    formatDhakaTime: () => 'Today, 12:00 PM', safeImageUrl: () => null, safeVoiceUrl: value => value,
    YouTubeLinks: { parse: () => null }, stopVoicePlayback() {}, stopMusicPlayback() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/memory-jar.js'), 'utf8'), context);
  return { context, calls, ids, jar: vm.runInContext('MemoryJar', context) };
}
const entry = { _id: 'entry', messageId: 'message', savedBy: 'Alice', savedAt: '2026-10-07',
  message: { _id: 'message', type: 'message', username: 'Bob', message: '<img src=x onerror=bad>' } };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('jar renders untrusted text safely, deduplicates cards and removes unsent content during an in-flight refresh', async () => {
  const f = fixture(); f.ids.memoryMenuButton.events.click();
  f.calls[0].ack(null, { ok: true, entries: [entry, entry], hasMore: false }); await flush();
  assert.equal(f.ids.memoryList.children.length, 1);
  const text = f.ids.memoryList.children[0].children.find(node => node.className === 'memory-text');
  assert.equal(text.textContent, entry.message.message); assert.equal(text.children.length, 0);
  f.ids.refreshMemories.events.click(); f.jar.messageUpdated({ _id: 'message', deleted: true });
  assert.equal(f.ids.memoryList.children.length, 0);
  f.calls[1].ack(null, { ok: true, entries: [entry], hasMore: false }); await flush();
  assert.equal(f.ids.memoryList.children.length, 0);
});

test('closing the jar invalidates pending data and pauses audio', async () => {
  const f = fixture(); f.ids.memoryMenuButton.events.click(); f.jar.close();
  f.calls[0].ack(null, { ok: true, entries: [entry] }); await flush();
  assert.equal(f.ids.memoryList.children.length, 0); assert.equal(f.ids.memoryDialog.open, false);
  f.ids.memoryMenuButton.events.click();
  f.calls[1].ack(null, { ok: true, entries: [{ ...entry, message: { ...entry.message, type: 'voice', voicePath: 'safe.mp3' } }] }); await flush();
  const audio = f.ids.memoryList.querySelectorAll('audio')[0]; assert(audio);
  f.jar.close(); assert.equal(audio.paused, true);
});

test('removing a memory calls only the jar action and random selection uses its own bounded request', async () => {
  const f = fixture(); f.ids.memoryMenuButton.events.click();
  f.calls[0].ack(null, { ok: true, entries: [entry] }); await flush();
  const remove = f.ids.memoryList.children[0].children.find(node => node.tag === 'button'); remove.onclick();
  assert.equal(f.calls[1].event, 'remove memory');
  f.calls[1].ack(null, { ok: true }); await flush(); assert.equal(f.ids.memoryList.children.length, 0);
  f.ids.randomMemory.events.click(); assert.equal(f.calls[2].event, 'random memory');
  f.calls[2].ack(new Error('offline')); await flush();
  assert.match(f.ids.memoryStatus.textContent, /Could not confirm/);
  assert.equal(f.ids.randomMemory.disabled, false);
});
