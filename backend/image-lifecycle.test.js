const test = require('node:test');
const assert = require('node:assert/strict');
const { createImageLifecycle } = require('./image-lifecycle');
const id = 'a'.repeat(24);
const url = 'https://res.cloudinary.com/test/image/upload/photo.jpg';

function fixture() {
  let row = { _id: id, username: 'Alice', url, publicId: 'photo', activeUses: 0 };
  let current = false, message = false, failDestroy = false;
  const destroyed = [], warnings = [];
  function matches(query) {
    return row && Object.entries(query).every(([key, value]) => {
      if (key === '$or') return value.some(matches);
      if (value && typeof value === 'object') {
        if ('$ne' in value) return row[key] !== value.$ne;
        if ('$exists' in value) return (row[key] !== undefined) === value.$exists;
      }
      return row[key] === value;
    });
  }
  function update(query, changes) {
    if (!matches(query)) return null;
    Object.assign(row, changes.$set);
    for (const [key, value] of Object.entries(changes.$inc || {})) row[key] = (row[key] || 0) + value;
    return { ...row };
  }
  const lifecycle = createImageLifecycle({ cloudName: 'test', warn: message => warnings.push(message),
    ImageUpload: { async findOneAndUpdate(query, changes) { return update(query, changes); },
      async updateOne(query, changes) { return update(query, changes); },
      async deleteOne(query) { if (matches(query)) row = null; } },
    Setting: { async findOne() { return current ? {} : null; } },
    Message: { async findOne(query) {
      assert.deepEqual(query, { $or: [{ imagePath: url }, { imagePublicId: 'photo' }] });
      return message ? {} : null;
    } },
    async destroy(publicId, options) {
      destroyed.push(publicId);
      assert.equal(options.invalidate, true);
      if (failDestroy) throw new Error('private failure');
      return { result: 'ok' };
    }
  });
  return { ...lifecycle, destroyed, warnings, row: () => row,
    current(value) { current = value; }, message(value) { message = value; }, fail() { failDestroy = true; } };
}

test('unused retired image is deleted along with its upload record', async () => {
  const f = fixture();
  await f.cleanupImage(url);
  assert.deepEqual(f.destroyed, ['photo']);
  assert.equal(f.row(), null);
});

test('current background and message-referenced images are preserved', async () => {
  for (const kind of ['current', 'message']) {
    const f = fixture(); f[kind](true);
    await f.cleanupImage(url);
    assert.equal(f.destroyed.length, 0);
    assert.equal(f.row().deletionPending, false);
  }
});

test('concurrent use defers cleanup until completion; a saved reference protects the image', async () => {
  for (const saved of [false, true]) {
    const f = fixture();
    await f.withImageUse('Alice', { uploadId: id }, async () => {
      await f.cleanupImage(url);
      assert.equal(f.destroyed.length, 0);
      if (saved) f.message(true);
    });
    assert.equal(f.destroyed.length, saved ? 0 : 1);
  }
});

test('cleanup failure retains a blocked record and does not throw or expose details', async () => {
  const f = fixture(); f.fail();
  await f.cleanupImage(url);
  assert.equal(f.row().deletionPending, true);
  await assert.rejects(f.withImageUse('Alice', { uploadId: id }, () => assert.fail('Must not reuse')));
  assert.equal(f.warnings.length, 1);
  assert(!f.warnings[0].includes('private'));
});

test('use guard enforces ownership and releases after failed saves', async () => {
  const f = fixture();
  await assert.rejects(f.withImageUse('Bob', { uploadId: id }, () => assert.fail('Wrong owner')));
  await assert.rejects(f.withImageUse('Alice', { uploadId: 'invalid' }, () => assert.fail('Bad ID')));
  await assert.rejects(f.withImageUse('Alice', { uploadId: id }, async () => { throw new Error('save failed'); }));
  assert.equal(f.row().activeUses, 0);
  assert.equal(f.destroyed.length, 0);
});
