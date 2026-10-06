const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { unreadMessages } = require('../frontend/unread');
const { ChatState } = require('../frontend/chat-state');
const incoming = { _id: 'one', type: 'message', username: 'Bob', createdAt: '2026-10-06T12:00:00Z' };

test('unread messages exclude own messages, system wishes, deleted and already seen messages', () => {
  const rows = [incoming, incoming, { ...incoming, _id: 'own', username: 'Alice' },
    { ...incoming, _id: 'birthday', type: 'system', celebration: 'birthday' },
    { ...incoming, _id: 'seen', seenBy: 'Alice' }, { ...incoming, _id: 'deleted', deleted: true },
    { ...incoming, _id: 'pending', status: 'Sending…' },
    ...['image', 'voice', 'music'].map(type => ({ ...incoming, _id: type, type }))];
  assert.deepEqual([...unreadMessages(rows, 'Alice')], ['one', 'image', 'voice', 'music']);
});

test('duplicate deliveries and stale updates do not recreate unread messages; accounts are independent', () => {
  const state = new ChatState('Alice');
  state.receive(incoming); state.receive(incoming);
  assert.equal(unreadMessages(state.list(), 'Alice').size, 1);
  assert.equal(unreadMessages(state.list(), 'Bob').size, 0);
  state.receive({ ...incoming, seenBy: 'Alice', revision: 2 });
  state.receive(incoming);
  assert.equal(unreadMessages(state.list(), 'Alice').size, 0);
});

test('new-message indicator responds to focus, scroll position, count and jump-to-latest', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const state = new ChatState('Alice'); state.receive(incoming);
  const list = { scrollHeight: 1000, scrollTop: 100, clientHeight: 300 };
  const bar = { hidden: true }, button = { textContent: '', setAttribute() {} };
  let focused = true, scheduled = 0;
  const context = vm.createContext({ chatState: state, unreadMessages,
    scheduleReadReceipts() { scheduled++; },
    document: { visibilityState: 'visible', hasFocus: () => focused,
      getElementById(id) { return { messages: list, newMessagesBar: bar, newMessagesButton: button }[id]; } }
  });
  vm.runInContext(html.slice(html.indexOf('      function scrollToBottom('), html.indexOf("      document.getElementById('newMessagesButton').addEventListener")), context);
  context.updateNewMessagesIndicator(); assert.equal(bar.hidden, false);
  assert.equal(button.textContent, '1 new message ↓');
  state.receive({ ...incoming, _id: 'two' }); context.updateNewMessagesIndicator();
  assert.equal(button.textContent, '2 new messages ↓');
  list.scrollTop = 700; context.updateNewMessagesIndicator(); assert.equal(bar.hidden, true);
  focused = false; context.updateNewMessagesIndicator(); assert.equal(bar.hidden, false);
  focused = true; list.scrollTop = 100;
  context.scrollToBottom(); assert.equal(list.scrollTop, 1000); assert.equal(bar.hidden, true);
  assert.equal(scheduled, 1);
  // Jumping does not fabricate read receipts for messages skipped above the viewport.
  assert.equal(unreadMessages(state.list(), 'Alice').size, 2);
  state.messages.clear(); list.scrollTop = 100; context.updateNewMessagesIndicator(); assert.equal(bar.hidden, true);
});
