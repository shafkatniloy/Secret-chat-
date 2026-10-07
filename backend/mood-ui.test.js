const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Moods = require('../frontend/moods');
function fixture() {
  class Element {
    constructor(tag, document) { this.tag = tag; this.document = document; this.children = []; this.dataset = {}; this.attributes = {}; this.open = false; this.hidden = false; this.className = ''; }
    set id(value) { this.document.ids[value] = this; }
    get classList() { return { toggle() {}, remove() {} }; }
    append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentNode = this; } }
    appendChild(node) { this.append(node); }
    insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); node.parentNode = this; }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    get lastChild() { return this.children.at(-1); }
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const document = { ids: {}, createElement(tag) { return new Element(tag, this); }, getElementById(id) { return this.ids[id]; }, addEventListener() {} };
  document.body = document.createElement('body');
  const account = document.createElement('div'), user = document.createElement('span'); user.id = 'currentUser'; account.append(user);
  const calls = [];
  const context = vm.createContext({ Moods, document, currentUsername: 'Alice', localPreview: false,
    socket: { connected: true, timeout() { return this; }, emit(event, data, ack) { calls.push({ event, data, ack }); } },
    clearTimeout() {}, setTimeout() { return 1; }, closeIconMenu() {}, closeAttachmentMenu() {}, closeMessageMenu() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/mood-ui.js'), 'utf8'), context);
  return { context, account, calls, document, ui: vm.runInContext('MoodUI', context) };
}
const nodes = element => [element, ...element.children.flatMap(nodes)];
const profile = (username, mood, revision) => ({ username, mood, revision, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + Moods.duration).toISOString() });

test('live UI shows both moods, saves only a mood ID, clears it, and ignores delayed responses after logout', async () => {
  const f = fixture(), dialog = f.document.getElementById('moodDialog');
  const load = f.ui.load(); f.calls[0].ack(null, { ok: true, moods: [profile('Alice', 'happy', 1), profile('Bob', 'sleepy', 1)] }); await load;
  const badges = f.account.children[0];
  assert.equal(badges.children.length, 2); assert.equal(badges.children[1].lastChild.textContent, '😴');
  const angry = nodes(dialog).find(node => node.dataset.mood === 'angry');
  const save = angry.onclick(); assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].data)), { mood: 'angry' });
  const secondClick = angry.onclick(); assert.equal(f.calls.length, 2); await secondClick;
  f.calls[1].ack(null, { ok: true, profile: profile('Alice', 'angry', 2) }); await save;
  assert.equal(badges.children[0].lastChild.textContent, '😠'); assert.equal(angry.attributes['aria-pressed'], 'true');
  f.ui.apply(profile('Alice', 'happy', 1)); assert.equal(badges.children[0].lastChild.textContent, '😠');
  const clear = nodes(dialog).find(node => node.textContent === 'Clear mood');
  const clearing = clear.onclick(); f.calls[2].ack(null, { ok: true, profile: { ...profile('Alice', null, 3), expiresAt: null } }); await clearing;
  assert.equal(badges.children[0].lastChild.textContent, '➖');
  const pending = angry.onclick(); f.ui.reset(); f.context.currentUsername = null;
  f.calls[3].ack(null, { ok: true, profile: profile('Alice', 'angry', 4) }); await pending;
  assert.equal(badges.children.length, 0); assert.equal(dialog.open, false);
});

test('mood failures do not claim success or change the previous mood', async () => {
  const f = fixture(); f.ui.apply(profile('Alice', 'happy', 1));
  const angry = nodes(f.document.getElementById('moodDialog')).find(node => node.dataset.mood === 'angry');
  const saving = angry.onclick(); f.calls[0].ack(new Error('offline')); await saving;
  assert.equal(f.account.children[0].children[0].lastChild.textContent, '😊');
  assert.match(f.document.getElementById('moodStatus').textContent, /Could not confirm/);
  assert.equal(angry.disabled, false);
  f.context.socket.connected = false; f.ui.disconnect(); assert.equal(angry.disabled, true);
});
