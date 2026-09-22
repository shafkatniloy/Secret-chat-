const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Birthday = require('../frontend/birthday');

test('birthday starts and ends exactly at Bangladesh midnight, for 2026 only', () => {
  assert.equal(Birthday.isActive(Date.parse('2026-09-23T17:59:59.999Z')), false);
  assert.equal(Birthday.isActive(Date.parse('2026-09-23T18:00:00Z')), true);
  assert.equal(Birthday.isActive(Date.parse('2026-09-24T17:59:59.999Z')), true);
  assert.equal(Birthday.isActive(Date.parse('2026-09-24T18:00:00Z')), false);
  assert.equal(Birthday.isActive(Date.parse('2027-09-24T00:00:00+06:00')), false);
});

test('exactly 100 stable birthday wishes prevent duplication across renders', () => {
  const wishes = Birthday.wishes();
  assert.equal(wishes.length, 100);
  assert.equal(new Set(wishes.map(w => w.key)).size, 100);
  assert.deepEqual(wishes, Birthday.wishes());
  assert(wishes.every(w => w.text.startsWith('Happy Birthday Ohona ')));
});

test('date preview is restricted to offline mode and expiry restores normal styling', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  let now = Birthday.start - 1;
  let delay, renders = 0;
  const banner = { hidden: true };
  const body = { dataset: {} };
  const context = vm.createContext({ Birthday, localPreview: false, birthdayPreviewTime: null,
    birthdayTimer: null, birthdayActive: false, chatState: {}, Date: { now: () => now },
    clearTimeout() {}, setTimeout(fn, ms) { delay = ms; return 1; }, renderChat() { renders++; },
    document: { body, getElementById: () => banner } });
  vm.runInContext(html.slice(html.indexOf('      function refreshBirthday()'), html.indexOf('      let countdownInterval')), context);
  context.setBirthdayPreview('birthday');
  assert.equal(context.birthdayPreviewTime, null);
  context.refreshBirthday(); assert.equal(delay, 1);
  now = Birthday.start; context.refreshBirthday();
  assert.equal(body.dataset.birthday, 'true'); assert.equal(banner.hidden, false);
  context.refreshBirthday(); assert.equal(renders, 1);
  now = Birthday.end; context.refreshBirthday();
  assert.equal(body.dataset.birthday, 'false'); assert.equal(banner.hidden, true);
  context.localPreview = true; context.setBirthdayPreview('birthday');
  assert.equal(body.dataset.birthday, 'true');
  context.setBirthdayPreview('after'); assert.equal(body.dataset.birthday, 'false');
});
