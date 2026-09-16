const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistoryService, registerHistoryHandlers, PAGE_SIZE } = require('./history-service');

function fixture(count) {
  const rows = Array.from({ length: count }, (_, i) => ({ _id: (i + 1).toString(16).padStart(24, '0'),
    createdAt: new Date(1700000000000 + Math.floor(i / 7) * 1000), message: String(i) }));
  const service = createHistoryService({ Message: { find(query) {
    let result = rows.filter(row => !query.$or || row.createdAt < query.$or[0].createdAt.$lt ||
      (+row.createdAt === +query.$or[1].createdAt && row._id < query.$or[1]._id.$lt));
    return { sort(order) {
      assert.deepEqual(order, { createdAt: -1, _id: -1 });
      result.sort((a, b) => b.createdAt - a.createdAt || b._id.localeCompare(a._id));
      return { async limit(size) { assert.equal(size, PAGE_SIZE + 1); return result.slice(0, size); } };
    } };
  } }, present: async values => values });
  return { service, rows };
}

test('cursor pages cover the entire history once, including equal timestamps and new live inserts', async () => {
  const { service, rows } = fixture(451);
  const first = await service.page();
  assert.equal(first.messages.length, 200); assert.equal(first.hasMore, true);
  rows.push({ _id: 'f'.repeat(24), createdAt: new Date(), message: 'live' });
  const second = await service.page(first.cursor);
  const third = await service.page(second.cursor);
  assert.equal(second.messages.length, 200); assert.equal(third.messages.length, 51);
  assert.equal(third.hasMore, false);
  const ids = [...first.messages, ...second.messages, ...third.messages].map(row => row._id);
  assert.equal(new Set(ids).size, 451);
  assert.equal(third.messages[0]._id, '0'.repeat(23) + '1');
  assert.equal((await service.page(third.cursor)).messages.length, 0);
});

test('empty and exactly full histories report no extra page; malformed cursors are rejected', async () => {
  assert.equal((await fixture(0).service.page()).cursor, null);
  assert.equal((await fixture(200).service.page()).hasMore, false);
  for (const cursor of ['bad', {}, { id: { $lt: '' }, createdAt: new Date().toISOString() },
    { id: 'a'.repeat(24), createdAt: 'bad' }]) await assert.rejects(fixture(0).service.page(cursor));
});

test('socket pagination prevents overlapping reads and permits retry after a failure', async () => {
  let handler, release, calls = 0;
  registerHistoryHandlers({ on(event, fn) { assert.equal(event, 'older messages'); handler = fn; } },
    { page: () => { calls++; return new Promise((resolve, reject) => { release = reject; }); } });
  let first, second;
  const pending = handler({ cursor: null }, result => { first = result; });
  await handler({ cursor: null }, result => { second = result; });
  assert.match(second.error, /already loading/); assert.equal(calls, 1);
  release(new Error('private DB error')); await pending;
  assert.equal(first.ok, undefined); assert(!first.error.includes('private'));
  const retry = handler({ cursor: null }, () => {});
  assert.equal(calls, 2); release(new Error('retry failed')); await retry;
});
