const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAuth } = require('./auth');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const config = source.slice(source.indexOf('const validUsers ='), source.indexOf('const { isValidUser, requireAuth }'));
const loadUsers = env => vm.runInNewContext(config + '\nvalidUsers', { process: { env } });

test('missing or incomplete credentials fail closed', () => {
  for (const env of [{}, { USER_1_NAME: 'Alice' }, { USER_1_PASSWORD: 'test-only' },
    { USER_1_NAME: 'Alice', USER_1_PASSWORD: '' }]) {
    assert.throws(() => loadUsers(env), /No chat users configured/);
  }
});

test('only explicitly configured user credentials enable login', () => {
  const users = loadUsers({ USER_1_NAME: 'Alice', USER_1_PASSWORD: 'test-only-1',
    USER_2_NAME: 'Bob', USER_2_PASSWORD: 'test-only-2' });
  assert.deepEqual(Object.keys(users), ['Alice', 'Bob']);
  const { isValidUser } = createAuth(users);
  assert.equal(isValidUser('Alice', 'test-only-1'), true);
  assert.equal(isValidUser('Bob', 'test-only-2'), true);
  assert.equal(isValidUser('Alice', 'wrong'), false);
  const secondOnly = loadUsers({ USER_2_NAME: 'Bob', USER_2_PASSWORD: 'test-only-2' });
  assert.deepEqual(Object.keys(secondOnly), ['Bob']);
});
