const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ChatState } = require('../frontend/chat-state');
const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
function fixture() {
  const calls = [], renders = [];
  const context = vm.createContext({ historyState: { ready: true, busy: false, hasMore: true, cursor: { id: 'cursor' }, error: '' },
    chatState: new ChatState('Alice'), socket: { connected: true, timeout() { return this; }, emit(event, payload, ack) { calls.push({ event, payload, ack }); } },
    updateHistoryControl() {}, renderChat(preserve) { renders.push(preserve); } });
  vm.runInContext(html.slice(html.indexOf('      async function loadOlderMessages('), html.indexOf("      document.getElementById('historyButton').addEventListener")), context);
  return { context, calls, renders };
}

test('history UI makes one request, merges by revision, and preserves the reading position', async () => {
  const { context, calls, renders } = fixture();
  context.chatState.receive({ _id: 'same', revision: 2, deleted: true });
  const pending = context.loadOlderMessages(); await context.loadOlderMessages();
  assert.equal(calls.length, 1); assert.equal(calls[0].event, 'older messages');
  calls[0].ack(null, { ok: true, messages: [{ _id: 'same', revision: 1 }, { _id: 'older' }], cursor: null, hasMore: false });
  await pending;
  assert.equal(context.chatState.messages.size, 2);
  assert.equal(context.chatState.messages.get('same').deleted, true);
  assert.deepEqual(renders, [true]);
  await context.loadOlderMessages(); assert.equal(calls.length, 1);
});

test('failed history requests retain their cursor and can retry', async () => {
  const { context, calls } = fixture();
  const first = context.loadOlderMessages(); calls[0].ack(new Error('timeout')); await first;
  assert.equal(context.historyState.busy, false); assert.equal(context.historyState.error, 'retry');
  assert.equal(context.historyState.cursor.id, 'cursor');
  const second = context.loadOlderMessages();
  calls[1].ack(null, { ok: true, messages: [], cursor: null, hasMore: false }); await second;
  assert.equal(context.historyState.error, '');
});

test('logout/reconnect invalidates a pending history response', async () => {
  const { context, calls, renders } = fixture();
  const pending = context.loadOlderMessages();
  context.historyState = { ready: false }; context.chatState = new ChatState('Bob');
  calls[0].ack(null, { ok: true, messages: [{ _id: 'old-session' }], cursor: null, hasMore: false }); await pending;
  assert.equal(context.chatState.messages.size, 0); assert.equal(renders.length, 0);
});
