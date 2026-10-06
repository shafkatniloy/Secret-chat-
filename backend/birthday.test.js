const test = require('node:test');
const assert = require('node:assert/strict');
const { birthdayRows, ensureBirthdayHistory } = require('./birthday-history');

function store() {
  const rows = new Map();
  return { rows,
    async bulkWrite(operations, options) {
      assert.equal(options.ordered, false);
      for (const { updateOne: op } of operations) {
        if (!rows.has(op.filter._id)) rows.set(op.filter._id, { _id: op.filter._id, ...op.update.$setOnInsert });
      }
    },
    async countDocuments(filter) { return filter._id.$in.filter(id => rows.has(id)).length; }
  };
}

test('100 app-generated wishes have stable unique IDs and insertion dates, with no user impersonation', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const rows = birthdayRows(now);
  assert.equal(rows.length, 100);
  assert.equal(new Set(rows.map(row => row._id)).size, 100);
  assert.deepEqual(rows.map(row => row._id), birthdayRows().map(row => row._id));
  assert(rows.every(row => /^[a-f0-9]{24}$/.test(row._id) && row.type === 'system' && !row.username && row.createdAt === now && row.message.startsWith('Happy Birthday Ohona ')));
});

test('restarts and partial retries do not duplicate wishes or change saved dates or content', async () => {
  const db = store();
  const first = birthdayRows(new Date('2026-10-06T12:00:00Z'))[0];
  db.rows.set(first._id, first);
  await ensureBirthdayHistory(db);
  const saved = JSON.stringify([...db.rows.values()]);
  await ensureBirthdayHistory(db, new Date('2027-01-01'));
  assert.equal(db.rows.size, 100);
  assert.equal(JSON.stringify([...db.rows.values()]), saved);
  assert.equal(db.rows.get(first._id), first);
});

test('concurrent startup duplicate errors are accepted only with all wishes stored', async () => {
  const db = store(); await ensureBirthdayHistory(db);
  db.bulkWrite = async () => { throw { writeErrors: [{ code: 11000 }] }; };
  await ensureBirthdayHistory(db);
  db.rows.clear();
  await assert.rejects(ensureBirthdayHistory(db), /incomplete/);
  db.bulkWrite = async () => { throw new Error('Unavailable'); };
  await assert.rejects(ensureBirthdayHistory(db), /Unavailable/);
});

test('birthday wishes use special boxes without subtitles while normal system notices keep dates', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const list = { children: [], appendChild(node) { this.children.push(node); } };
  const context = vm.createContext({
    formatDhakaTime: () => 'Today, 12:00 PM',
    document: {
      getElementById: () => list,
      createElement: () => ({ children: [], appendChild(node) { this.children.push(node); } })
    }
  });
  vm.runInContext(html.slice(html.indexOf('      function displaySystemMessage('), html.indexOf('      function showError(')), context);
  context.displaySystemMessage(birthdayRows()[0]);
  assert.equal(list.children[0].className, 'system birthday-wish');
  assert.equal(list.children[0].children.length, 1);
  assert.match(list.children[0].children[0].textContent, /^Happy Birthday Ohona /);
  context.displaySystemMessage({ type: 'system', message: 'Someone joined the chat' });
  assert.equal(list.children[1].className, 'system');
  assert.equal(list.children[1].children.length, 2);
});
