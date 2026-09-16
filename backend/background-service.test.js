const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackgroundService, registerBackgroundHandlers } = require('./background-service');

function fixture() {
  let row = null;
  const uploads = new Map();
  const service = createBackgroundService({ cloudName: 'test-cloud',
    Setting: {
      async findById() { return row; },
      async findOneAndUpdate(filter, update) {
        assert.equal(filter._id, 'shared');
        row = { ...update.$set, revision: (row?.revision || 0) + update.$inc.revision };
        return row;
      }
    },
    ImageUpload: { async findOne(query) {
      const upload = uploads.get(query._id);
      return upload?.username === query.username ? upload : null;
    } }
  });
  return { service, uploads };
}

test('background is shared, persists across reads, and revisions increase', async () => {
  const { service } = fixture();
  assert.deepEqual(await service.get(), { preset: 'current', imagePath: null, revision: 0 });
  assert.equal((await service.set('Alice', { preset: 'dark' })).revision, 1);
  assert.equal((await service.set('Bob', { preset: 'light' })).revision, 2);
  assert.deepEqual(await service.get(), { preset: 'light', imagePath: null, revision: 2 });
  assert.equal((await service.set('Alice', { preset: 'current' })).imagePath, null);
});

test('gallery requires an owned, verified upload; arbitrary URLs and invalid payloads fail', async () => {
  const { service, uploads } = fixture();
  const uploadId = 'a'.repeat(24);
  const url = 'https://res.cloudinary.com/test-cloud/image/upload/example.jpg';
  uploads.set(uploadId, { username: 'Alice', url, publicId: 'example' });
  for (const payload of [null, 'dark', {}, { preset: 'unknown' }, { preset: 'gallery', imagePath: url }, { preset: 'gallery', uploadId: 'bad' }]) {
    await assert.rejects(service.set('Alice', payload));
  }
  await assert.rejects(service.set('Bob', { preset: 'gallery', uploadId, username: 'Alice' }));
  assert.equal((await service.set('Alice', { preset: 'gallery', uploadId })).imagePath, url);
  assert.equal((await service.set('Bob', { preset: 'current' })).imagePath, null);
  uploads.get(uploadId).url = 'https://example.com/evil.jpg';
  await assert.rejects(service.set('Alice', { preset: 'gallery', uploadId }));
});

test('socket handler uses authenticated identity and broadcasts saved settings to both users', async () => {
  const handlers = {}, broadcasts = [];
  let identity;
  const background = { preset: 'dark', revision: 1, imagePath: null };
  registerBackgroundHandlers({ username: 'Alice', on(event, handler) { handlers[event] = handler; } },
    { emit(...args) { broadcasts.push(args); } },
    { async set(username) { identity = username; return background; }, async get() { return background; } });
  let reply;
  await handlers['set background']({ preset: 'dark', username: 'Bob' }, result => { reply = result; });
  assert.equal(identity, 'Alice');
  assert.deepEqual(reply, { ok: true, background });
  assert.deepEqual(broadcasts, [['background updated', background]]);
  await handlers['get background']({}, result => { reply = result; });
  assert.deepEqual(reply.background, background);
});

test('failed saves do not broadcast or expose internal errors', async () => {
  const handlers = {};
  registerBackgroundHandlers({ username: 'Alice', on(event, handler) { handlers[event] = handler; } },
    { emit() { assert.fail('No broadcast on failure'); } },
    { async set() { throw new Error('private database details'); } });
  let reply;
  await handlers['set background']({ preset: 'dark' }, result => { reply = result; });
  assert.equal(reply.error, 'Could not save chat background. Try again.');
});

test('simultaneous first saves recover from the singleton creation race', async () => {
  let calls = 0;
  const service = createBackgroundService({ Setting: { async findOneAndUpdate(filter, update, options) {
    if (++calls === 1) throw Object.assign(new Error('duplicate'), { code: 11000 });
    assert.equal(options.upsert, false);
    return { ...update.$set, revision: 2 };
  } } });
  assert.deepEqual(await service.set('Alice', { preset: 'dark' }), { preset: 'dark', imagePath: null, revision: 2 });
});
