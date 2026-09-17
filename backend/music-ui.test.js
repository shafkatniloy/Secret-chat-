const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('../frontend/youtube-links');
const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');

function fixture(preview = false) {
  let detachments = 0;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.className = ''; this.clientWidth = 300; this.scrollTop = 0; this.scrollHeight = 500; this.clientHeight = 500; }
    get isConnected() { return this.tag === 'ul' || !!this.parent?.isConnected; }
    getBoundingClientRect() {
      const top = this.parent ? this.parent.children.indexOf(this) * 100 - this.parent.scrollTop : 0;
      return { top, bottom: top + (this.tag === 'ul' ? this.clientHeight : 100) };
    }
    get classList() { return { contains: value => this.className.split(' ').includes(value) }; }
    get firstChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children.at(-1); }
    get nextSibling() { return this.parent?.children[this.parent.children.indexOf(this) + 1] || null; }
    append(...nodes) { for (const node of nodes) this.appendChild(node); }
    appendChild(node) { this.insertBefore(node, null); }
    prepend(node) { this.insertBefore(node, this.firstChild); }
    insertBefore(node, before) {
      if (node === before) return;
      node.remove();
      const index = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(index, 0, node); node.parent = this;
    }
    remove() {
      if (!this.parent) return;
      if (this.tag === 'iframe' || this.querySelector('iframe')) detachments++;
      this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null;
    }
    replaceChildren(...nodes) { for (const node of [...this.children]) node.remove(); this.append(...nodes); }
    querySelector(selector) {
      for (const node of this.children) {
        if (selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : node.tag === selector) return node;
        const nested = node.querySelector(selector); if (nested) return nested;
      }
      return null;
    }
  }
  const list = new Element('ul');
  let rows = [];
  const context = vm.createContext({ YouTubeLinks: { parse }, localPreview: preview, currentUsername: 'Alice', activeMusicPlayback: null,
    chatState: { messages: new Map(), list: () => rows },
    document: { createElement: tag => new Element(tag), getElementById: () => list },
    messageHeader: () => new Element('header'), decorateMessage() {}, formatDhakaTime: () => '12:00',
    scheduleReadReceipts() {}, scrollToBottom() {},
    displayMessage(data) { const node = new Element('li'); node.textContent = data.message; list.appendChild(node); },
    displaySystemMessage() {}, displayImageMessage() {}
  });
  vm.runInContext(html.slice(html.indexOf('      function displayMusicMessage('), html.indexOf('      let activeMusicPlayback')), context);
  vm.runInContext(html.slice(html.indexOf('      function stopMusicPlayback('), html.indexOf("      document.addEventListener('visibilitychange', () => { if (document.hidden) stopMusicPlayback();")), context);
  vm.runInContext(html.slice(html.indexOf('      function renderChat('), html.indexOf('      function setReply(')), context);
  return { context, list, setRows(value) { rows = value; }, detachments: () => detachments };
}

const song = { _id: 'song', clientId: 'client-song', type: 'music', username: 'Alice', message: 'https://youtu.be/dQw4w9WgXcQ?t=90' };

test('music loads YouTube only on click, with a canonical timestamped embed URL', () => {
  const f = fixture(); f.setRows([song]); f.context.renderChat();
  assert.equal(f.list.querySelector('iframe'), null);
  f.list.querySelector('button').onclick();
  const frame = f.list.querySelector('iframe');
  assert.equal(frame.src, 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&start=90');
  assert.equal(frame.referrerPolicy, 'strict-origin-when-cross-origin');
});

test('incoming messages and music revisions do not detach or restart the player; unsend stops it', () => {
  const f = fixture(); f.setRows([song]); f.context.renderChat(); f.list.querySelector('button').onclick();
  const frame = f.list.querySelector('iframe');
  const other = { _id: 'other', type: 'message', username: 'Bob', message: 'Hello' };
  f.setRows([song, other]); f.context.renderChat();
  f.setRows([{ ...song, revision: 1, seenBy: 'Bob' }, other]); f.context.renderChat();
  assert.equal(f.list.querySelector('iframe'), frame);
  assert.equal(f.detachments(), 0);
  f.setRows([{ ...song, deleted: true, message: undefined }, other]); f.context.renderChat();
  assert.equal(f.list.querySelector('iframe'), null);
  assert.equal(f.context.activeMusicPlayback, null);
});

test('unsupported links are inert text; offline preview never loads a player', () => {
  const f = fixture(); f.setRows([{ ...song, message: 'javascript:alert(1)' }]); f.context.renderChat();
  assert.equal(f.list.querySelector('iframe'), null); assert.equal(f.list.querySelector('a'), null);
  assert.match(f.list.querySelector('.music-label').textContent, /Not playable/);
  const preview = fixture(true); preview.setRows([song]); preview.context.renderChat();
  preview.list.querySelector('button').onclick();
  assert.equal(preview.list.querySelector('iframe'), null);
  assert.match(preview.list.querySelector('.music-label').textContent, /Offline preview/);
});


test('prepending older history preserves the visible anchor and attached music player', () => {
  const f = fixture(); f.setRows([song]); f.context.renderChat(); f.list.querySelector('button').onclick();
  const item = f.list.firstChild, frame = f.list.querySelector('iframe');
  f.list.scrollTop = 40;
  const before = item.getBoundingClientRect().top;
  f.setRows([{ _id: 'older', type: 'message', username: 'Bob', message: 'Earlier' }, song]);
  f.context.renderChat(true);
  assert.equal(item.getBoundingClientRect().top, before);
  assert.equal(f.list.scrollTop, 140);
  assert.equal(f.list.querySelector('iframe'), frame);
  assert.equal(f.detachments(), 0);
});
