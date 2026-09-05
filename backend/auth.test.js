const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('./auth');

const { requireAuth, isValidUser } = createAuth({ alice: 'test:password', 'নাম': 'গোপন' });
const basic = value => 'Basic ' + Buffer.from(value).toString('base64');

function request(header) {
  let proceeded = false;
  const req = { get: () => header };
  const res = {
    set(name, value) { this[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  requireAuth(req, res, () => { proceeded = true; });
  return { req, res, proceeded };
}

test('missing, malformed, and incorrect credentials cannot reach protected handlers', () => {
  for (const header of [undefined, '', 'Bearer abc', 'Basic !!!', basic('alice'),
    basic('alice:wrong'), basic('unknown:test:password'), basic('alice:'), basic(':password')]) {
    const result = request(header);
    assert.equal(result.proceeded, false);
    assert.equal(result.res.statusCode, 401);
    assert.deepEqual(result.res.body, { error: 'Unauthorized' });
    assert.match(result.res['WWW-Authenticate'], /^Basic /);
  }
});

test('valid credentials support password colons and UTF-8', () => {
  for (const [username, password] of [['alice', 'test:password'], ['নাম', 'গোপন']]) {
    const result = request(basic(`${username}:${password}`));
    assert.equal(result.proceeded, true);
    assert.equal(result.req.username, username);
  }
});

test('socket validation rejects inherited keys and non-string credentials', () => {
  assert.equal(isValidUser('alice', 'test:password'), true);
  assert.equal(isValidUser('toString', Object.prototype.toString), false);
  assert.equal(isValidUser(['alice'], 'test:password'), false);
  assert.equal(isValidUser('alice', null), false);
});
