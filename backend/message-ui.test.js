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
  assert(connection.indexOf('registerMessageHandlers(') < connection.indexOf('await Message.find()'));
  assert(connection.indexOf("socket.on('disconnect'") < connection.indexOf('await Message.find()'));
});
