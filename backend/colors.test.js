const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ChatColors = require('../frontend/colors');

test('palette preferences stay separate per user, restore on reload and reject invalid stored values', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(Object.keys(ChatColors.palettes).length, 5);
  assert.equal(ChatColors.read(storage, 'Alice'), 'purple');
  assert.equal(ChatColors.save(storage, 'Alice', 'ocean'), true);
  assert.equal(ChatColors.save(storage, 'Bob', 'rose'), true);
  assert.equal(ChatColors.read(storage, 'Alice'), 'ocean');
  assert.equal(ChatColors.read(storage, 'Bob'), 'rose');
  assert.equal(ChatColors.save(storage, 'Alice', '__proto__'), false);
  assert.equal(ChatColors.save(storage, '', 'teal'), false);
  assert.equal(ChatColors.read(storage, 'Alice'), 'ocean');
  data.set('chat-color:Alice', 'url(https://example.com)');
  assert.equal(ChatColors.read(storage, 'Alice'), 'purple');
});

test('unavailable storage does not prevent using the palette for the current session', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(ChatColors.read(storage, 'Alice'), 'purple');
  assert.equal(ChatColors.save(storage, 'Alice', 'sunset'), false);
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
