const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChatColors = require('../frontend/colors');

test('only the five predefined shared palettes are accepted', () => {
  assert.equal(Object.keys(ChatColors.palettes).length, 5);
  for (const id of Object.keys(ChatColors.palettes)) assert.equal(ChatColors.valid(id), true);
  for (const id of ['__proto__', 'invalid', null, {}, 'url(https://example.com)']) assert.equal(ChatColors.valid(id), false);
});

test('applying every palette preserves dark mode and exposes the selected color accessibly', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const buttons = Object.keys(ChatColors.palettes).map(color => ({ dataset: { color }, setAttribute(key, value) { this[key] = value; } }));
  const variables = new Map();
  const body = { dataset: { theme: 'dark' } };
  const context = vm.createContext({ ChatColors, colorOptions: { querySelectorAll: () => buttons },
    document: { body, documentElement: { style: { setProperty: (key, value) => variables.set(key, value) } } } });
  vm.runInContext(html.slice(html.indexOf('      function applyColor('), html.indexOf('      function closeColorOptions(')), context);
  for (const [id, palette] of Object.entries(ChatColors.palettes)) {
    context.applyColor(id);
    assert.equal(body.dataset.theme, 'dark');
    assert.equal(body.dataset.color, id);
    assert.equal(variables.get('--brand-start'), palette.start);
    assert.equal(variables.get('--brand-dark-start'), palette.darkStart);
    assert.deepEqual(buttons.filter(button => button['aria-pressed'] === 'true').map(button => button.dataset.color), [id]);
  }
  context.applyColor('invalid'); assert.equal(body.dataset.color, 'purple');
});

const { createColorService, registerColorHandlers } = require('./color-service');
test('shared palette persists across service instances and ignores client-supplied revision or user', async () => {
  let row = null;
  const Setting = { findById: async id => { assert.equal(id, 'shared'); return row; },
    async findOneAndUpdate(filter, update) {
      assert.deepEqual(filter, { _id: 'shared' });
      row = { color: update.$set.color, revision: (row?.revision || 0) + update.$inc.revision };
      return row;
    } };
  const service = createColorService(Setting);
  assert.deepEqual(await service.get(), { color: 'purple', revision: 0 });
  await assert.rejects(service.set({ color: 'invalid' }), /Invalid/);
  assert.equal(row, null);
  assert.deepEqual(await service.set({ color: 'teal', revision: 900, username: 'Other' }), { color: 'teal', revision: 1 });
  assert.deepEqual(await createColorService(Setting).get(), { color: 'teal', revision: 1 });
  assert.deepEqual(await service.set({ color: 'rose' }), { color: 'rose', revision: 2 });
});

test('first-save duplicate races retry the shared row without a second upsert', async () => {
  let calls = 0;
  const service = createColorService({ async findOneAndUpdate(filter, update, options) {
    if (++calls === 1) { assert.equal(options.upsert, true); throw { code: 11000 }; }
    assert.equal(options.upsert, false); return { color: 'ocean', revision: 2 };
  } });
  assert.deepEqual(await service.set({ color: 'ocean' }), { color: 'ocean', revision: 2 });
});

test('successful changes broadcast to both users; storage failures never broadcast', async () => {
  const handlers = {}, events = [];
  let fail = false, reply;
  registerColorHandlers({ username: 'Alice', on: (event, handler) => { handlers[event] = handler; } },
    { emit: (...args) => events.push(args) },
    { async set() { if (fail) throw new Error('private database detail'); return { color: 'teal', revision: 4 }; } });
  await handlers['set app color']({ color: 'teal' }, data => { reply = data; });
  assert.equal(reply.ok, true); assert.deepEqual(events[0], ['app color updated', reply.preference]);
  fail = true;
  await handlers['set app color']({ color: 'rose' }, data => { reply = data; });
  assert.equal(events.length, 1); assert.equal(reply.ok, undefined);
  assert.doesNotMatch(reply.error, /private database/);
});

test('late load or save responses cannot overwrite newer shared colors', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const applied = [];
  const context = vm.createContext({ ChatColors, colorRevision: -1, applyColor: id => applied.push(id) });
  vm.runInContext(html.slice(html.indexOf('      function applySharedColor('), html.indexOf('      function sharedColorRequest(')), context);
  context.applySharedColor({ color: 'rose', revision: 3 });
  context.applySharedColor({ color: 'purple', revision: 0 });
  context.applySharedColor({ color: 'invalid', revision: 4 });
  context.applySharedColor({ color: 'teal', revision: 4 });
  assert.deepEqual(applied, ['rose', 'teal']);
});
