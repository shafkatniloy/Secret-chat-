const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedVoiceUrl, resolveVoiceUpload, createVoiceUploadHandler } = require('./voice-service');
const url = 'https://res.cloudinary.com/test/video/upload/voice.mp3';
const id = 'a'.repeat(24);

test('voice references require trusted MP3 URLs, bounded duration, and authenticated upload ownership', async () => {
  assert(isTrustedVoiceUrl(url, 'test'));
  for (const bad of [url.replace('/test/', '/other/'), url.replace('.mp3', '.mp4'), url + '?x=1', 'javascript:alert(1)', url.replace('https:', 'http:'), url.replace('/video/', '/image/')]) assert(!isTrustedVoiceUrl(bad, 'test'));
  const record = { url, publicId: 'voice', duration: 30 };
  const Upload = { async findOne(query) { return query._id === id && query.username === 'Alice' ? record : null; } };
  assert.equal((await resolveVoiceUpload(Upload, 'Alice', { uploadId: id, voicePath: 'bad' }, 'test')).voicePath, url);
  await assert.rejects(resolveVoiceUpload(Upload, 'Bob', { uploadId: id }, 'test'));
  await assert.rejects(resolveVoiceUpload(Upload, 'Alice', { uploadId: {} }, 'test'));
  record.duration = 200; await assert.rejects(resolveVoiceUpload(Upload, 'Alice', { uploadId: id }, 'test'));
});

function fixture() {
  let record, failRecord = false;
  const destroyed = [], options = [];
  const asset = { secure_url: url, public_id: 'voice', resource_type: 'video', format: 'mp3', duration: 30, bytes: 1000 };
  const handler = createVoiceUploadHandler({ cloudName: 'test', Upload: {
    async findOne() { return record; }, async create(values) { if (failRecord) throw new Error('private DB detail'); record = { ...values, _id: id }; return record; }
  }, uploader: { upload_stream(opts, done) { options.push(opts); return { on() {}, end() { done(null, asset); } }; },
    async destroy(publicId, opts) { destroyed.push([publicId, opts]); } } });
  const req = { username: 'Alice', body: { clientId: 'voice-client-123456' }, file: { mimetype: 'audio/webm', size: 100, buffer: Buffer.from('sample') } };
  const res = () => ({ code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } });
  return { handler, req, res, asset, destroyed, options, fail() { failRecord = true; }, record: () => record };
}

test('upload converts to bounded MP3, records ownership, and reuses a previous successful upload', async () => {
  const f = fixture(), res = f.res(); await f.handler(f.req, res);
  assert.equal(res.data.uploadId, id); assert.equal(f.record().username, 'Alice');
  assert.equal(f.options[0].resource_type, 'video'); assert.equal(f.options[0].format, 'mp3');
  assert.equal(f.options[0].transformation[0].duration, 120);
  await f.handler(f.req, f.res()); assert.equal(f.options.length, 1);
});

test('bad file payloads are rejected before upload and invalid processed assets are deleted', async () => {
  const f = fixture(); const bad = f.res(); await f.handler({ ...f.req, file: { ...f.req.file, mimetype: 'image/png' } }, bad);
  assert.equal(bad.code, 400); assert.equal(f.options.length, 0);
  f.asset.duration = 130; const invalid = f.res(); await f.handler(f.req, invalid);
  assert.equal(invalid.code, 500); assert.equal(f.destroyed.length, 1); assert.equal(f.record(), undefined);
});

test('failed registration cleans the asset without exposing internal errors', async () => {
  const f = fixture(); f.fail(); const res = f.res(); await f.handler(f.req, res);
  assert.equal(res.code, 500); assert.equal(f.destroyed[0][1].resource_type, 'video'); assert(!res.data.error.includes('private'));
});

test('voice cleanup preserves referenced clips and uses the video resource type for unreferenced clips', async () => {
  const { createImageLifecycle } = require('./image-lifecycle');
  for (const referenced of [true, false]) {
    let destroyed = false, deleted = false;
    const lifecycle = createImageLifecycle({ cloudName: 'test', isTrustedUrl: isTrustedVoiceUrl,
      pathField: 'voicePath', publicIdField: 'voicePublicId', resourceType: 'video',
      ImageUpload: { async updateOne() {}, async findOneAndUpdate() { return { _id: id, url, publicId: 'voice' }; }, async deleteOne() { deleted = true; } },
      Setting: { async findOne() { return null; } }, Message: { async findOne(query) {
        assert.deepEqual(query, { $or: [{ voicePath: url }, { voicePublicId: 'voice' }] }); return referenced ? {} : null;
      } }, async destroy(publicId, options) { assert.equal(publicId, 'voice'); assert.equal(options.resource_type, 'video'); destroyed = true; return { result: 'ok' }; }
    });
    await lifecycle.cleanupImage(url); assert.equal(destroyed, !referenced); assert.equal(deleted, !referenced);
  }
});

test('lost database acknowledgement never deletes a successfully registered voice clip', async () => {
  let saved;
  const handler = createVoiceUploadHandler({ cloudName: 'test', Upload: {
    async findOne() { return saved; }, async create(data) { saved = { ...data, _id: id }; throw new Error('lost acknowledgement'); }
  }, uploader: {
    upload_stream(_options, done) { return { on() {}, end() { done(null, { secure_url: url, public_id: 'voice', resource_type: 'video', format: 'mp3', duration: 10, bytes: 100 }); } }; },
    async destroy() { assert.fail('Persisted asset must not be deleted'); }
  } });
  const res = { status() { return this; }, json(value) { this.data = value; } };
  await handler({ username: 'Alice', body: { clientId: 'client-1234567890' }, file: { mimetype: 'audio/webm', size: 100, buffer: Buffer.from('voice') } }, res);
  assert.equal(res.data.uploadId, id);
});
