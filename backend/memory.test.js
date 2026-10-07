const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryService, registerMemoryHandlers, PAGE_SIZE } = require('./memory-service');
const { safeHistoryMessage } = require('./image-security');
const id = n => n.toString(16).padStart(24, '0');
function fixture() {
  const saved = new Map(), messages = new Map(); let query, pipeline, options;
  const Message = { collection: { name: 'messages' }, async findOne(filter) {
    query = filter; const row = messages.get(filter._id);
    return row && !row.deleted && filter.type.$in.includes(row.type) ? row : null;
  } };
  const Memory = {
    async updateOne(filter, update) { if (!saved.has(filter.messageId)) saved.set(filter.messageId, { _id: id(saved.size + 100), ...update.$setOnInsert }); },
    async deleteOne(filter) { saved.delete(filter.messageId); },
    aggregate(stages) { pipeline = stages; return { async option(value) {
      options = value;
      let rows = [...saved.values()].map(row => ({ ...row, message: messages.get(row.messageId) }))
        .filter(row => row.message && !row.message.deleted && ['message', 'image', 'voice', 'music'].includes(row.message.type))
        .sort((a,b) => b._id.localeCompare(a._id));
      const cursor = stages.find(stage => stage.$match?._id)?.$match._id.$lt;
      if (cursor) rows = rows.filter(row => row._id < cursor);
      return rows.slice(0, stages.some(stage => stage.$sample) ? 1 : PAGE_SIZE + 1);
    } }; }
  };
  const service = createMemoryService({ Memory, Message, toId: value => value,
    present: async rows => rows.map(row => safeHistoryMessage(row, 'test')) });
  return { service, saved, messages, query: () => query, pipeline: () => pipeline, options: () => options };
}

test('saving references the existing message, preserves the first saver, and ignores client content', async () => {
  const f = fixture(); f.messages.set(id(1), { _id: id(1), type: 'message', username: 'Bob', message: 'Original' });
  await f.service.save('Alice', { messageId: id(1), savedBy: 'Bob', message: 'Fake' });
  await f.service.save('Bob', { messageId: id(1) });
  assert.equal(f.saved.size, 1); assert.equal(f.saved.get(id(1)).savedBy, 'Alice');
  assert.equal(f.saved.get(id(1)).message, undefined);
  assert.equal((await f.service.page()).entries[0].message.message, 'Original');
  for (const data of [{}, { messageId: { $ne: null } }, { messageId: 'bad' }]) await assert.rejects(f.service.save('Alice', data));
  f.messages.set(id(2), { _id: id(2), type: 'system' });
  await assert.rejects(f.service.save('Alice', { messageId: id(2) }));
  f.messages.set(id(3), { _id: id(3), type: 'message', deleted: true });
  await assert.rejects(f.service.save('Alice', { messageId: id(3) }));
});

test('pagination is bounded, malformed cursors fail, and unsafe media is sanitized', async () => {
  const f = fixture();
  for (let n = 1; n <= 23; n++) {
    f.messages.set(id(n), { _id: id(n), type: 'image', imagePath: 'javascript:bad' });
    await f.service.save('Alice', { messageId: id(n) });
  }
  const first = await f.service.page(); assert.equal(first.entries.length, 20); assert.equal(first.hasMore, true);
  assert(first.entries.every(row => row.message.imagePath === null));
  const second = await f.service.page({ cursor: first.cursor }); assert.equal(second.entries.length, 3);
  assert.equal(new Set([...first.entries, ...second.entries].map(row => row._id)).size, 23);
  assert.equal(f.options().maxTimeMS, 10000);
  await assert.rejects(f.service.page({ cursor: { $gt: '' } }));
});

test('unsent or missing messages disappear from list and random; removal never deletes chat', async () => {
  const f = fixture(); f.messages.set(id(1), { _id: id(1), type: 'message', message: 'Keep' });
  await f.service.save('Alice', { messageId: id(1) });
  assert.equal((await f.service.random()).entries.length, 1);
  const pipeline = f.pipeline();
  assert(pipeline.findIndex(stage => stage.$match) < pipeline.findIndex(stage => stage.$sample));
  f.messages.get(id(1)).deleted = true;
  assert.equal((await f.service.page()).entries.length, 0); assert.equal((await f.service.random()).entries.length, 0);
  await f.service.remove({ messageId: id(1) }); assert.equal(f.saved.size, 0); assert.equal(f.messages.size, 1);
  await f.service.remove({ messageId: id(1) });
});

test('socket identity is authoritative; changes broadcast only after success and overlapping calls are bounded', async () => {
  const handlers = {}, events = []; let release, response, identity;
  registerMemoryHandlers({ username: 'Alice', on: (event, handler) => { handlers[event] = handler; } },
    { emit: (...data) => events.push(data) }, {
      async save(username) { identity = username; await new Promise(resolve => { release = resolve; }); return { messageId: id(1) }; },
      async remove() { throw new Error('private database details'); }
    });
  const first = handlers['save memory']({ username: 'Bob' }, value => { response = value; });
  let overlap; await handlers['save memory']({}, value => { overlap = value; });
  assert.match(overlap.error, /already running/); release(); await first;
  assert.equal(identity, 'Alice'); assert.equal(response.ok, true); assert.equal(events.length, 1);
  await handlers['remove memory']({}, value => { response = value; });
  assert.equal(events.length, 1); assert.doesNotMatch(response.error, /private/);
});
