const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isTrustedImageUrl, safeHistoryMessage, resolveImageUpload } = require('./image-security');

const goodUrl = 'https://res.cloudinary.com/test-cloud/image/upload/v123/secret-chat/photo.jpg';
const uploadId = '1234567890abcdef12345678';
const badUrls = [
  'javascript:alert(1)', 'data:image/svg+xml,<svg onload="alert(1)"/>',
  'x" onerror="alert(1)', goodUrl + '" onerror="alert(1)',
  goodUrl.replace('https:', 'http:'), goodUrl.replace('res.cloudinary.com', 'res.cloudinary.com.evil.test'),
  goodUrl.replace('res.cloudinary.com', 'res.cloudinary.com@evil.test'),
  goodUrl.replace('res.cloudinary.com', 'user@res.cloudinary.com'),
  goodUrl.replace('image/upload', 'raw/upload'), goodUrl.replace('.jpg', '.svg'),
  goodUrl + '?redirect=evil', goodUrl + '#fragment', '/uploads/old.jpg', null, {},
];

test('only configured Cloudinary HTTPS raster image URLs are accepted', () => {
  assert.equal(isTrustedImageUrl(goodUrl, 'test-cloud'), true);
  for (const url of badUrls) assert.equal(isTrustedImageUrl(url, 'test-cloud'), false);
  assert.equal(isTrustedImageUrl(goodUrl, 'another-cloud'), false);
  assert.equal(isTrustedImageUrl(goodUrl, undefined), false);
});

test('unsafe historical images are redacted without mutating stored messages', () => {
  const message = { type: 'image', imagePath: 'x" onerror="alert(1)' };
  assert.equal(safeHistoryMessage(message, 'test-cloud').imagePath, null);
  assert.equal(message.imagePath, 'x" onerror="alert(1)');
  assert.equal(safeHistoryMessage({ toObject: () => ({ type: 'image', imagePath: goodUrl }) }, 'test-cloud').imagePath, goodUrl);
});

test('image IDs are validated and ownership is enforced; client URLs are ignored', async () => {
  let calls = 0;
  const Upload = { findOne: async query => {
    calls++;
    return query._id === uploadId && query.username === 'Alice'
      ? { url: goodUrl, publicId: 'secret-chat/photo' } : null;
  } };
  for (const data of [null, {}, { uploadId: { $ne: null } }, { uploadId: 'invalid' }]) {
    await assert.rejects(resolveImageUpload(Upload, 'Alice', data, 'test-cloud'));
  }
  assert.equal(calls, 0);
  await assert.rejects(resolveImageUpload(Upload, 'Bob', { uploadId }, 'test-cloud'));
  await assert.rejects(resolveImageUpload(Upload, 'Alice', { uploadId: '0'.repeat(24) }, 'test-cloud'));
  assert.deepEqual(await resolveImageUpload(Upload, 'Alice', {
    uploadId, imagePath: 'javascript:alert(1)', publicId: 'fake', username: 'Bob'
  }, 'test-cloud'), { imagePath: goodUrl, imagePublicId: 'secret-chat/photo' });
});

test('image socket handler saves and broadcasts only verified data', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  let handler;
  const saved = [], emitted = [];
  const context = {
    socket: { username: 'Alice', on: (event, fn) => { handler = fn; },
      emit: (event, data) => emitted.push(data), broadcast: { emit: (event, data) => emitted.push(data) } },
    ImageUpload: { findOne: async query => query.username === 'Alice' && query._id === uploadId
      ? { url: goodUrl, publicId: 'secret-chat/photo' } : null },
    Message: class { constructor(data) { Object.assign(this, data); } async save() { saved.push(this); } },
    resolveImageUpload, process: { env: { CLOUDINARY_CLOUD_NAME: 'test-cloud' } },
    getDhakaTime: () => '12:00 PM', console: { error() {} }
  };
  vm.runInNewContext(source.slice(source.indexOf("  socket.on('image message'"), source.indexOf("  socket.on('disconnect'")), context);
  let ack;
  await handler({ uploadId, imagePath: 'javascript:alert(1)' }, result => { ack = result; });
  assert.equal(ack.ok, true);
  assert.equal(saved[0].imagePath, goodUrl);
  assert.equal(emitted.length, 2);
  await handler({ imagePath: goodUrl }, result => { ack = result; });
  assert.equal(typeof ack.error, 'string');
  assert.equal(saved.length, 1);
  assert.equal(emitted.length, 2);
});

test('upload registration uses the authenticated owner and cleans up failed records', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  let handler, record;
  const removed = [];
  const context = {
    app: { post: (path, auth, multipart, fn) => { handler = fn; } },
    requireAuth() {}, upload: { single() {} }, isTrustedImageUrl,
    process: { env: { CLOUDINARY_CLOUD_NAME: 'test-cloud' } },
    ImageUpload: { create: async data => { record = data; return { _id: uploadId }; } },
    cloudinary: { uploader: { destroy: async id => removed.push(id) } }, console: { error() {} }
  };
  vm.runInNewContext(source.slice(source.indexOf("app.post('/api/upload'"), source.indexOf('// Error handler for upload')), context);
  const req = { username: 'Alice', body: { username: 'Bob' }, file: { path: goodUrl, filename: 'secret-chat/photo' } };
  const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  await handler(req, res);
  assert.equal(record.username, 'Alice');
  assert.equal(record.publicId, 'secret-chat/photo');
  assert.equal(res.data.uploadId, uploadId);
  assert.equal(removed.length, 0);
  context.ImageUpload.create = async () => { throw new Error('database unavailable'); };
  await handler(req, res);
  assert.equal(res.code, 500);
  assert.deepEqual(removed, ['secret-chat/photo']);
});

test('frontend renders untrusted content as text and blocks unsafe image URLs', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const nodes = [];
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; }
    set innerHTML(value) { throw new Error('Untrusted HTML rendering'); }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    addEventListener() {}
  }
  const context = vm.createContext({ URL, localPreview: false, currentUsername: 'Alice',
    document: { createElement: tag => new Element(tag), getElementById: () => ({ appendChild: node => nodes.push(node) }) },
    formatDhakaTime: data => data.timestamp || '' });
  vm.runInContext(html.slice(html.indexOf('      function messageHeader('), html.indexOf('      function showError(')), context);
  const attack = '<img src=x onerror=alert(1)>';
  for (const url of badUrls) {
    context.displayImageMessage({ username: attack, timestamp: attack, imagePath: url });
    assert.equal(nodes.at(-1).children[1].textContent, 'Image unavailable');
  }
  context.displayImageMessage({ username: attack, timestamp: attack, imagePath: goodUrl });
  assert.equal(nodes.at(-1).children[1].src, goodUrl);
  assert.equal(nodes.at(-1).children[0].children[0].textContent, attack);
  assert.equal(nodes.at(-1).children[0].children[1].textContent, attack);
  context.displayMessage({ username: 'Alice', message: attack });
  assert.equal(nodes.at(-1).children[1].textContent, attack);
  context.displaySystemMessage({ message: attack, timestamp: attack });
  assert.equal(nodes.at(-1).children[0].textContent, attack);
  assert.equal(context.safeImageUrl('blob:null/example'), null);
  context.localPreview = true;
  assert.equal(context.safeImageUrl('blob:null/example'), 'blob:null/example');
});
