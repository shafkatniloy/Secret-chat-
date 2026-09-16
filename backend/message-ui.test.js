const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ChatState } = require('../frontend/chat-state');

function fixture() {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const storage = new Map(), calls = [];
  const state = new ChatState('Alice');
  const context = vm.createContext({
    chatState: state, currentUsername: 'Alice', connectionReady: true, replyTarget: null, ChatState,
    sessionStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) },
    socket: { connected: true, timeout() { return this; }, emit(event, data, callback) { calls.push({ event, data, callback }); } }
  });
  vm.runInContext(html.slice(html.indexOf('      function openChatState('), html.indexOf('      function formatDhakaTime(')), context);
  context.renderChat = () => {};
  context.setReply = () => {};
  return { context, calls, state, storage };
}

test('lost confirmation preserves draft and reuses its ID on retry', async () => {
  const { context, calls, state } = fixture();
  const draft = { clientId: 'test-id', type: 'message', message: 'Hello', username: 'Alice' };
  state.pending.set(draft.clientId, draft);
  await context.sendDraft(draft);
  assert.equal(draft.status, 'Sending…');
  calls[0].callback(new Error('timeout'));
  assert.equal(draft.status, 'Not confirmed');
  assert.equal(state.pending.size, 1);
  await context.sendDraft(draft);
  assert.equal(calls[0].data.clientId, calls[1].data.clientId);
  calls[1].callback(null, { ok: true, message: { ...draft, _id: 'server-id', status: undefined } });
  assert.equal(state.pending.size, 0);
  assert.equal(state.messages.size, 1);
});

test('explicit failure, disconnect, and reloading keep retryable text', async () => {
  const { context, calls, state } = fixture();
  const draft = { clientId: 'test-id', type: 'message', message: 'Keep this text', username: 'Alice' };
  state.pending.set(draft.clientId, draft);
  await context.sendDraft(draft);
  calls[0].callback(null, { error: 'Rejected' });
  assert.equal(draft.status, 'Failed');
  context.socket.connected = false;
  await context.sendDraft(draft);
  assert.equal(draft.status, 'Not confirmed');
  context.chatState = null;
  context.openChatState('Alice');
  const restored = context.chatState.pending.get('test-id');
  assert.equal(restored.message, 'Keep this text');
  assert.equal(restored.busy, false);
  context.openChatState('Bob');
  assert.equal(context.chatState.pending.size, 0);
});

test('image retry reuses the verified upload instead of uploading again', async () => {
  const { context, state, calls } = fixture();
  let uploads = 0;
  context.uploadDraft = async draft => { uploads++; draft.uploadId = 'verified-upload'; };
  const draft = { clientId: 'image-id', type: 'image', username: 'Alice' };
  state.pending.set(draft.clientId, draft);
  await context.sendDraft(draft);
  calls[0].callback(new Error('timeout'));
  await context.sendDraft(draft);
  assert.equal(uploads, 1);
  assert.equal(calls[1].data.uploadId, 'verified-upload');
});

test('an old callback cannot change another user’s conversation', async () => {
  const { context, state, calls } = fixture();
  const draft = { clientId: 'test-id', type: 'message', message: 'Hello', username: 'Alice' };
  state.pending.set(draft.clientId, draft);
  await context.sendDraft(draft);
  context.chatState = new ChatState('Bob');
  calls[0].callback(null, { ok: true, message: { ...draft, _id: 'server-id' } });
  assert.equal(context.chatState.messages.size, 0);
});

test('message handlers and disconnect cleanup are registered before history awaits', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const connection = server.slice(server.indexOf("io.on('connection'"));
  assert(connection.indexOf('registerMessageHandlers(') < connection.indexOf('await historyService.page()'));
  assert(connection.indexOf("socket.on('disconnect'") < connection.indexOf('await historyService.page()'));
});

test('read receipts require focus and visible incoming message bubbles', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const state = new ChatState('Alice');
  state.receive({ _id: 'visible', username: 'Bob', type: 'message' });
  state.receive({ _id: 'offscreen', username: 'Bob', type: 'image' });
  state.receive({ _id: 'own', username: 'Alice', type: 'message' });
  state.receive({ _id: 'deleted', username: 'Bob', type: 'message', deleted: true });
  let focused = true;
  const calls = [];
  const context = vm.createContext({ chatState: state, currentUsername: 'Alice', receiptBusy: false,
    connectionReady: true, window: { innerHeight: 600 }, renderChat() {}, scheduleReadReceipts() {},
    socket: { connected: true, timeout() { return this; }, emit(event, payload, callback) { calls.push({ event, payload, callback }); } },
    document: { visibilityState: 'hidden', hasFocus: () => focused, getElementById(id) {
      if (id === 'chatScreen') return { style: { display: 'flex' } };
      return { getBoundingClientRect: () => id === 'messages' ? { top: 100, bottom: 500 }
        : id === 'message-offscreen' ? { top: 600, bottom: 650, height: 50 } : { top: 120, bottom: 170, height: 50 } };
    } }
  });
  vm.runInContext(html.slice(html.indexOf('      function sendReadReceipts('), html.indexOf('      function decorateMessage(')), context);
  context.sendReadReceipts(); assert.equal(calls.length, 0);
  context.document.visibilityState = 'visible'; focused = false;
  context.sendReadReceipts(); assert.equal(calls.length, 0);
  focused = true; context.sendReadReceipts();
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0].payload.messageIds), ['visible']);
  calls[0].callback(null, { ok: true, messages: [{ _id: 'visible', username: 'Bob', type: 'message', seenBy: 'Alice', revision: 1 }] });
  context.sendReadReceipts(); assert.equal(calls.length, 1);
});

test('delivery icons use distinct SVG paths without visible status text', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const context = vm.createContext({ document: { createElementNS(ns, tag) {
    return { tag, attributes: {}, children: [], setAttribute(key, value) { this.attributes[key] = value; }, appendChild(child) { this.children.push(child); } };
  } } });
  vm.runInContext(html.slice(html.indexOf('      function deliveryIcon('), html.indexOf('      function scheduleReadReceipts(')), context);
  const paths = new Set();
  for (const state of ['sending', 'sent', 'seen', 'failed']) {
    const icon = context.deliveryIcon(state);
    assert.equal(icon.attributes['aria-hidden'], 'true');
    assert.equal(icon.attributes.class, 'delivery-icon delivery-' + state);
    paths.add(icon.children[0].attributes.d);
    assert.equal(icon.textContent, undefined);
  }
  assert.equal(paths.size, 4);
});

test('message popup stays within mobile and desktop viewport edges', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  for (const viewport of [{ width: 320, height: 480, offsetLeft: 0, offsetTop: 0 },
    { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 },
    { width: 320, height: 250, offsetLeft: 10, offsetTop: 80 }]) {
    for (const nearBottom of [false, true]) {
      const anchor = { right: viewport.offsetLeft + 60, top: viewport.offsetTop + (nearBottom ? viewport.height - 40 : 12) };
      anchor.bottom = anchor.top + 28;
      const menu = { style: {}, getBoundingClientRect: () => ({ width: 288, height: 180 }) };
      const details = { querySelector: selector => selector === '.message-menu' ? menu : { getBoundingClientRect: () => anchor } };
      const context = vm.createContext({ window: { visualViewport: viewport } });
      vm.runInContext(html.slice(html.indexOf('      function positionMessageMenu('), html.indexOf('      function closeMessageMenu(')), context);
      context.positionMessageMenu(details);
      const x = parseFloat(menu.style.left), y = parseFloat(menu.style.top);
      assert(x >= viewport.offsetLeft + 8);
      assert(x + 288 <= viewport.offsetLeft + viewport.width - 8);
      assert(y >= viewport.offsetTop + 8);
      assert(y + 180 <= viewport.offsetTop + viewport.height - 8);
    }
  }
});

test('music retries retain the link and use the music event with the same client ID', async () => {
  const { context, calls, state } = fixture();
  const draft = { clientId: 'music-client-id', type: 'music', message: 'https://youtu.be/dQw4w9WgXcQ?t=90', username: 'Alice' };
  state.pending.set(draft.clientId, draft);
  await context.sendDraft(draft);
  assert.equal(calls[0].event, 'music message');
  calls[0].callback(new Error('timeout'));
  context.openChatState('Bob'); context.openChatState('Alice');
  const restored = context.chatState.pending.get(draft.clientId);
  assert.equal(restored.message, draft.message);
  await context.sendDraft(restored);
  assert.equal(calls[1].event, 'music message');
  assert.equal(calls[1].data.clientId, calls[0].data.clientId);
});
