const test = require('node:test');
const assert = require('node:assert/strict');
const Moods = require('../frontend/moods');
const { createMoodService, registerMoodHandlers } = require('./mood-service');

function store() {
  const rows = new Map();
  return { rows, async find({ _id }) { return [...rows.values()].filter(row => _id.$in.includes(row._id)); },
    async findOneAndUpdate(filter, update) {
      const row = { _id: filter._id, ...update.$set, revision: (rows.get(filter._id)?.revision || 0) + update.$inc.revision };
      rows.set(row._id, row); return row;
    } };
}
test('moods save under authenticated identity, persist across sessions and expire at exactly 24 hours', async () => {
  const Setting = store(); let now = Date.parse('2026-10-07T12:00:00.123Z');
  const args = { Setting, usernames: ['Alice', 'Bob'], now: () => now };
  const service = createMoodService(args);
  assert.deepEqual((await service.get()).map(row => row.mood), [null, null]);
  const saved = await service.set('Alice', { mood: 'angry', username: 'Bob', revision: 999, expiresAt: '2099-01-01' });
  assert.equal(saved.username, 'Alice'); assert.equal(saved.revision, 1);
  assert.equal(saved.expiresAt.getTime(), now + Moods.duration);
  assert.equal((await createMoodService(args).get())[0].mood, 'angry');
  assert.equal((await service.get())[1].mood, null);
  now += Moods.duration - 1;
  assert.equal((await service.get())[0].mood, 'angry');
  now++;
  assert.equal((await service.get())[0].mood, null);
  await service.set('Alice', { mood: 'happy' });
  const cleared = await service.set('Alice', { mood: null });
  assert.equal(cleared.mood, null); assert.equal(cleared.expiresAt, null); assert.equal(cleared.revision, 3);
});

test('invalid users and mood payloads cannot write profile data', async () => {
  const Setting = store(); const service = createMoodService({ Setting, usernames: ['Alice'] });
  for (const data of [null, {}, { mood: 'unknown' }, { mood: {} }, { mood: '__proto__' }]) await assert.rejects(service.set('Alice', data));
  await assert.rejects(service.set('Mallory', { mood: 'happy' }));
  assert.equal(Setting.rows.size, 0);
});

test('simultaneous first saves retry the same user record', async () => {
  let calls = 0;
  const service = createMoodService({ usernames: ['Alice'], Setting: { async findOneAndUpdate(filter, update, options) {
    assert.equal(filter._id, 'Alice');
    if (++calls === 1) throw { code: 11000 };
    assert.equal(options.upsert, false);
    return { ...update.$set, revision: 2 };
  } } });
  assert.equal((await service.set('Alice', { mood: 'talk' })).revision, 2);
});

test('socket handlers use socket identity and broadcast only saved moods', async () => {
  const handlers = {}, events = []; let failure = false, identity, response;
  registerMoodHandlers({ username: 'Alice', on: (event, handler) => { handlers[event] = handler; } },
    { emit: (...args) => events.push(args) }, { async set(username) { identity = username; if (failure) throw new Error('secret'); return { username, mood: 'sad', revision: 1 }; } });
  await handlers['set mood']({ username: 'Bob', mood: 'sad' }, result => { response = result; });
  assert.equal(identity, 'Alice'); assert.equal(response.ok, true);
  assert.deepEqual(events[0], ['mood updated', response.profile]);
  failure = true; await handlers['set mood']({ mood: 'happy' }, result => { response = result; });
  assert.equal(events.length, 1); assert.doesNotMatch(response.error, /secret/);
});

test('client merges per-user revisions and never restores an expired mood', () => {
  const state = new Moods.State();
  const profile = { username: 'Alice', mood: 'relaxed', revision: 2, expiresAt: '2026-10-08T12:00:00.123Z' };
  state.receive(profile); state.receive({ ...profile, mood: 'angry', revision: 1 });
  state.receive({ username: 'Bob', mood: 'sleepy', revision: 1, expiresAt: profile.expiresAt });
  assert.equal(state.profiles.get('Alice').mood, 'relaxed'); assert.equal(state.profiles.size, 2);
  const expires = Date.parse(profile.expiresAt);
  assert.equal(Moods.active(profile, expires - 1).id, 'relaxed');
  assert.equal(Moods.active(profile, expires), null);
  state.receive({ ...profile, mood: null, revision: 3 }); state.receive(profile);
  assert.equal(Moods.active(state.profiles.get('Alice'), expires - 1), null);
});
