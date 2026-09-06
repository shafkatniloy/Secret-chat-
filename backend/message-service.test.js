const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageService, registerMessageHandlers } = require('./message-service');
const { ChatState } = require('../frontend/chat-state');

function fixture() {
  const rows = new Map();
  let serial = 0;
  const copy = obj => obj == null ? null : JSON.parse(JSON.stringify(obj));
  function match(row, query) {
    return Object.entries(query).every(([key, value]) => {
      if (value && typeof value === 'object') {
        if ('$ne' in value) return row[key] !== value.$ne;
        if ('$in' in value) return value.$in.includes(row[key]);
      }
      return row[key] === value;
    });
  }
  const Message = {
    async init() {},
    async findOne(query) { return copy([...rows.values()].find(row => match(row, query))); },
    async find(query) { return copy([...rows.values()].filter(row => match(row, query))); },
    async findOneAndUpdate(query, update, options) {
      let row = [...rows.values()].find(row => match(row, query));
      if (!row && options?.upsert) {
        row = { _id: (++serial).toString(16).padStart(24, '0'), revision: 0, reactions: {}, deleted: false, ...update.$setOnInsert };
        rows.set(row._id, row);
      }
      if (!row) return null;
      for (const [key, value] of Object.entries(update.$set || {})) {
        if (key.startsWith('reactions.')) row.reactions[key.split('.')[1]] = copy(value);
        else row[key] = copy(value);
      }
      for (const key of Object.keys(update.$unset || {})) {
        if (key.startsWith('reactions.')) delete row.reactions[key.split('.')[1]];
        else delete row[key];
      }
      for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
      return copy(row);
    }
  };
  const imageUrl = 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg';
  const ImageUpload = { findOne: async query => query.username === 'Alice' && query._id === 'f'.repeat(24)
    ? { url: imageUrl, publicId: 'photo' } : null };
  const service = createMessageService({ Message, ImageUpload, cloudName: 'test', getTime: () => '12:00 PM' });
  return { Message, rows, service, imageUrl };
}
const draft = (id, message = 'Hello') => ({ clientId: id.padEnd(20, '_'), message });

test('retry and concurrent sends with the same client ID save exactly once per user', async () => {
  const { service, rows } = fixture();
  const data = draft('same');
  const [first, second] = await Promise.all([service.send('Alice', 'message', data), service.send('Alice', 'message', data)]);
  assert.equal(first._id, second._id);
  const retry = await service.send('Alice', 'message', { ...data, message: 'Changed payload' });
  assert.equal(retry.message, 'Hello');
  assert.equal(rows.size, 1);
  await service.send('Bob', 'message', data);
  assert.equal(rows.size, 2);
});

test('database uniqueness conflicts resolve to the original message', async () => {
  const { service, Message } = fixture();
  const original = await service.send('Alice', 'message', draft('race'));
  let lookups = 0;
  Message.findOne = async () => ++lookups === 1 ? null : original;
  Message.findOneAndUpdate = async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); };
  assert.equal((await service.send('Alice', 'message', draft('race')))._id, original._id);
});

test('malformed messages and unavailable reply targets are rejected before storage', async () => {
  const { service, rows } = fixture();
  for (const data of [null, 'legacy', {}, draft('blank', ' '), draft('object', {}), draft('huge', 'x'.repeat(10001)),
    { ...draft('reply'), replyTo: { $ne: null } }, { ...draft('missing'), replyTo: 'e'.repeat(24) }]) {
    await assert.rejects(service.send('Alice', 'message', data));
  }
  assert.equal(rows.size, 0);
});

test('replies use server content, and unsending hides original content in quotes and history', async () => {
  const { service } = fixture();
  const original = await service.send('Alice', 'message', draft('original', 'Private text'));
  const reply = await service.send('Bob', 'message', { ...draft('reply'), replyTo: original._id, replyPreview: { text: 'Forged' } });
  assert.equal((await service.present([reply]))[0].replyPreview.text, 'Private text');
  await assert.rejects(service.unsend('Bob', { messageId: original._id }));
  const deleted = await service.unsend('Alice', { messageId: original._id });
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.message, undefined);
  assert.equal((await service.present([reply]))[0].replyPreview.text, 'Message deleted');
  assert.equal((await service.unsend('Alice', { messageId: original._id })).revision, deleted.revision);
  assert.equal((await service.send('Alice', 'message', draft('original'))).deleted, true);
  await assert.rejects(service.send('Bob', 'message', { ...draft('newreply'), replyTo: original._id }));
});

test('one reaction per user supports replace/remove without overwriting the other user', async () => {
  const { service } = fixture();
  const original = await service.send('Alice', 'message', draft('reaction'));
  const messageId = original._id;
  await Promise.all([service.react('Alice', { messageId, emoji: '❤️' }), service.react('Bob', { messageId, emoji: '👍' })]);
  const changed = await service.react('Alice', { messageId, emoji: '😂' });
  assert.deepEqual(Object.values(changed.reactions).map(x => x.emoji).sort(), ['👍', '😂'].sort());
  const removed = await service.react('Alice', { messageId, emoji: null });
  assert.deepEqual(Object.values(removed.reactions), [{ username: 'Bob', emoji: '👍' }]);
  await assert.rejects(service.react('Bob', { messageId, emoji: '<script>' }));
  await service.unsend('Alice', { messageId });
  await assert.rejects(service.react('Bob', { messageId, emoji: '👍' }));
});

test('images share deduplication, reply and owner-only unsend protections', async () => {
  const { service, imageUrl, rows } = fixture();
  const data = { clientId: 'image'.padEnd(20, '_'), uploadId: 'f'.repeat(24), imagePath: 'javascript:alert(1)' };
  await assert.rejects(service.send('Bob', 'image', data));
  const image = await service.send('Alice', 'image', data);
  assert.equal(image.imagePath, imageUrl);
  assert.equal((await service.send('Alice', 'image', data))._id, image._id);
  assert.equal(rows.size, 1);
  const removed = await service.unsend('Alice', { messageId: image._id });
  assert.equal(removed.imagePath, undefined);
  assert.equal(removed.imagePublicId, undefined);
});

test('storage/index failures never emit Sent acknowledgements or broadcasts', async () => {
  const { service, Message } = fixture();
  const handlers = {}, events = [];
  registerMessageHandlers({ username: 'Alice', on: (event, fn) => { handlers[event] = fn; } },
    { emit: (...args) => events.push(args) }, service);
  Message.init = async () => { throw new Error('offline'); };
  let ack;
  await handlers['chat message'](draft('fail'), result => { ack = result; });
  assert.equal(ack.ok, undefined);
  assert.equal(ack.notConfirmed, true);
  assert.equal(events.length, 0);
});

test('client reconciles acknowledgements/history, preserves pending drafts and ignores stale revisions', () => {
  const state = new ChatState('Alice');
  state.pending.set('pending', { clientId: 'pending', username: 'Alice', status: 'Sending…' });
  const saved = { _id: '1', clientId: 'pending', username: 'Alice', message: 'Hello', revision: 0 };
  state.receive({ ...saved, username: 'Bob' });
  assert.equal(state.pending.size, 1);
  state.receive(saved); state.receive(saved);
  assert.equal(state.pending.size, 0);
  assert.equal(state.messages.size, 1);
  state.receive({ ...saved, deleted: true, message: undefined, revision: 2 });
  state.receive(saved);
  assert.equal(state.messages.get('1').deleted, true);
  state.pending.set('other', { clientId: 'other', username: 'Alice' });
  state.receive({ _id: '2', username: 'Bob' });
  assert.equal(state.pending.size, 1);
});
