const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { statsPipeline, getChatStats } = require('./stats-service');
const { summarize } = require('../frontend/chat-stats');

test('offline stats count every real message type, exclude notices/unsent, and use Dhaka dates', () => {
  const stats = summarize([
    { type: 'message', username: 'Alice', createdAt: '2026-10-06T17:59:59Z' },
    { type: 'image', username: 'Bob', createdAt: '2026-10-06T18:00:00Z' },
    { type: 'voice', username: 'Alice', createdAt: '2026-10-06T18:01:00Z' },
    { type: 'music', username: 'Bob', createdAt: '2026-10-06T18:02:00Z' },
    { type: 'message', username: 'Bob', deleted: true },
    { type: 'system', celebration: 'birthday' }, { type: 'system' }
  ]);
  assert.equal(stats.total, 4);
  assert.deepEqual(stats.users, [{ username: 'Alice', count: 2 }, { username: 'Bob', count: 2 }]);
  assert.deepEqual(stats.media, { photos: 1, voice: 1, music: 1 });
  assert.equal(stats.firstDate, '2026-10-06T17:59:59.000Z');
  assert.deepEqual(stats.busiest, { date: '2026-10-07', count: 3 });
  assert.equal(summarize([]).firstDate, null); assert.equal(summarize([]).busiest, null);
});

test('database aggregation filters before counting, uses Dhaka grouping and deterministic busiest-day ties', async () => {
  const pipeline = statsPipeline();
  assert.deepEqual(pipeline[0], { $match: { type: { $in: ['message', 'image', 'voice', 'music'] }, deleted: { $ne: true } } });
  assert.equal(pipeline[1].$facet.busiest[1].$group._id.$dateToString.timezone, 'Asia/Dhaka');
  assert.deepEqual(pipeline[1].$facet.busiest[2], { $sort: { count: -1, _id: 1 } });
  let options;
  const Message = { aggregate(value) {
    assert.deepEqual(value, pipeline);
    return { option(value) { options = value; return Promise.resolve([{ total: [{ count: 3 }], users: [{ _id: 'Alice', count: 3 }], media: [{ _id: 'image', count: 2 }], first: [{ date: '2026-01-01' }], busiest: [{ _id: '2026-01-01', count: 3 }] }]); } };
  } };
  const result = await getChatStats(Message);
  assert.equal(options.maxTimeMS, 10000);
  assert.deepEqual(result.media, { photos: 2, voice: 0, music: 0 });
  assert.deepEqual(result.users, [{ username: 'Alice', count: 3 }]);
  assert.equal(result.total, 3);
  const empty = await getChatStats({ aggregate: () => ({ option: async () => [] }) });
  assert.equal(empty.total, 0); assert.equal(empty.busiest, null);
});

test('stats endpoint requires authentication and avoids caching private results', () => {
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/stats'"), source.indexOf("app.get('/api/preferences'"));
  assert.match(route, /requireAuth/);
  assert.match(route, /Cache-Control', 'no-store'/);
  assert.match(route, /getChatStats\(Message\)/);
  assert.doesNotMatch(route, /req\.(body|query)\.username/);
});

test('stats panel prevents overlapping loads and discards responses after closing or switching users', async () => {
  const vm = require('node:vm');
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { open: id === 'statsDialog', disabled: false, textContent: '',
      addEventListener() {}, replaceChildren() {}, close() { this.open = false; }, showModal() { this.open = true; } });
    return elements.get(id);
  }
  const context = vm.createContext({ currentUsername: 'Alice', socket: {}, localPreview: false, AbortController,
    setTimeout: () => 1, clearTimeout() {}, closeIconMenu() {},
    document: { getElementById: element } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/stats-ui.js'), 'utf8'), context);
  let resolve, calls = 0, renders = 0;
  context.requestChatStats = async () => { calls++; return new Promise(done => { resolve = done; }); };
  context.renderStats = () => { renders++; };
  const first = context.loadStats(); await context.loadStats(); assert.equal(calls, 1);
  context.closeStats(); resolve({}); await first; assert.equal(renders, 0);
  element('statsDialog').open = true;
  const second = context.loadStats(); context.currentUsername = 'Bob'; resolve({}); await second;
  assert.equal(renders, 0);
  const third = context.loadStats(); resolve({}); await third;
  assert.equal(renders, 1); assert.equal(element('refreshStats').disabled, false);
  context.requestChatStats = async () => { throw new Error('Network failure'); };
  await context.loadStats(); assert.match(element('statsStatus').textContent, /Refresh to retry/);
  assert.equal(element('refreshStats').disabled, false);
});
