const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorldService, registerWorldHandlers } = require('./world-service');
function fixture() {
  let row = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const Setting = {
    async updateOne(filter, update) { if (!row) row = { _id: filter._id, ...clone(update.$setOnInsert) }; },
    async findById() { return row && clone(row); },
    async findOneAndUpdate(filter, update) {
      if (!row) return null;
      if (update.$push) {
        assert.equal(filter['items.29'].$exists, false);
        if (row.items.length >= 30 || row.items.some(item => item.id === filter['items.id'].$ne)) return null;
        row.items.push(clone(update.$push.items));
      } else {
        const match = filter.items.$elemMatch;
        const index = row.items.findIndex(item => item.id === match.id && item.owner === match.owner);
        if (index < 0) return null;
        if (update.$pull) row.items.splice(index, 1);
        else { row.items[index].x = update.$set['items.$.x']; row.items[index].y = update.$set['items.$.y']; }
      }
      row.revision += update.$inc.revision; return clone(row);
    }
  };
  return { Setting, service: createWorldService({ Setting, usernames: ['Alice', 'Bob'] }) };
}
const add = (id, extra = {}) => ({ action: 'add', id, type: 'moon', x: 30, y: 30, ...extra });

test('server assigns ownership, preserves text and persists shared state across service instances', async () => {
  const f = fixture();
  const world = await f.service.change('Alice', add('note', { owner: 'Bob', type: 'text', text: ' আমাদের কথা 💛 ' }));
  assert.equal(world.items[0].owner, 'Alice'); assert.equal(world.items[0].text, 'আমাদের কথা 💛');
  assert.deepEqual(await createWorldService({ Setting: f.Setting, usernames: ['Alice', 'Bob'] }).get(), world);
  await assert.rejects(f.service.change('Bob', { action: 'move', id: 'note', x: 40, y: 40 }));
  await assert.rejects(f.service.change('Bob', { action: 'remove', id: 'note' }));
  const moved = await f.service.change('Alice', { action: 'move', id: 'note', x: 0, y: 100 });
  assert.deepEqual([moved.items[0].x, moved.items[0].y], [5, 95]);
});

test('concurrent additions enforce the 30-piece bound and retry IDs do not duplicate', async () => {
  const { service } = fixture();
  for (let i = 0; i < 29; i++) await service.change('Alice', add('piece-' + i));
  const results = await Promise.allSettled([service.change('Alice', add('last-a')), service.change('Bob', add('last-b'))]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  const world = await service.get(); assert.equal(world.items.length, 30);
  const duplicate = await service.change('Alice', add('piece-0')); assert.equal(duplicate.revision, world.revision);
  await service.change('Alice', { action: 'remove', id: 'piece-0' });
  await service.change('Alice', { action: 'remove', id: 'piece-0' });
  assert.equal((await service.get()).items.length, 29);
});

test('malformed coordinates, unknown actions, blank/long text and invalid identities cannot mutate the scene', async () => {
  const { service } = fixture();
  for (const data of [add('x',{x:NaN}), add('x',{x:101}), add('x',{type:'__proto__'}), add('x',{type:'text',text:''}),
    add('x',{type:'text',text:'a'.repeat(81)}), {action:'reset',id:'x'}, {action:'remove',id:{$ne:null}}]) await assert.rejects(service.change('Alice', data));
  await assert.rejects(service.change('Other', add('x')));
  assert.deepEqual(await service.get(), { items: [], revision: 0 });
});

test('broadcasts follow saved state and use authenticated identity, with bounded in-flight mutations', async () => {
  const handlers = {}, events = []; let release, actor;
  registerWorldHandlers({ username: 'Alice', on: (event, fn) => { handlers[event] = fn; } }, { emit: (...args) => events.push(args) },
    { async change(username) { actor = username; await new Promise(resolve => { release = resolve; }); return { items: [], revision: 1 }; } });
  let response, overlapping;
  const saving = handlers['change world']({ owner:'Bob' }, value => { response = value; });
  await handlers['change world']({}, value => { overlapping = value; });
  assert(overlapping.error); release(); await saving;
  assert.equal(actor,'Alice'); assert.equal(response.ok,true);
  assert.deepEqual(events,[['world updated',response.world]]);
});
