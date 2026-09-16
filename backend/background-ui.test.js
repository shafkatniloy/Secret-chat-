const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');

test('background UI ignores stale responses and unsafe gallery URLs; current clears the image', () => {
  const list = { style: {} };
  const buttons = ['current', 'dark', 'light', 'gallery'].map(preset => ({ dataset: { background: preset },
    setAttribute(name, value) { this[name] = value; } }));
  const context = vm.createContext({ backgroundRevision: -1, localPreview: false, URL,
    backgroundPresets: { current: '', dark: 'assets/bg_dark.jpeg', light: 'assets/bg_light.jpeg' },
    backgroundMenu: { querySelectorAll: () => buttons }, document: { getElementById: () => list } });
  vm.runInContext(html.slice(html.indexOf('      function safeImageUrl('), html.indexOf('      function displayImageMessage(')), context);
  vm.runInContext(html.slice(html.indexOf('      function applyBackground('), html.indexOf('      function backgroundRequest(')), context);
  context.applyBackground({ preset: 'dark', revision: 3 });
  assert.equal(list.style.backgroundImage, 'url("assets/bg_dark.jpeg")');
  context.applyBackground({ preset: 'light', revision: 2 });
  assert.equal(context.backgroundRevision, 3);
  assert.equal(list.style.backgroundImage, 'url("assets/bg_dark.jpeg")');
  for (const imagePath of ['javascript:alert(1)', 'https://example.com/image.jpg', 'data:image/svg+xml,bad']) {
    context.applyBackground({ preset: 'gallery', revision: 4, imagePath });
    assert.equal(context.backgroundRevision, 3);
  }
  context.applyBackground({ preset: 'gallery', revision: 4, imagePath: 'https://res.cloudinary.com/test-cloud/image/upload/example.jpg' });
  assert.equal(buttons[3]['aria-pressed'], 'true');
  context.applyBackground({ preset: 'current', revision: 5 });
  assert.equal(list.style.backgroundImage, '');
  assert.equal(buttons[0]['aria-pressed'], 'true');
});

test('preset background assets exist', () => {
  for (const file of ['bg_dark.jpeg', 'bg_light.jpeg']) {
    assert(fs.statSync(path.join(__dirname, '../frontend/assets', file)).size > 0);
  }
});

test('background submenu opens to the right on desktop and stays visible on mobile', () => {
  const source = html.slice(html.indexOf('      function positionBackgroundMenu('), html.indexOf("      backgroundMenuButton.addEventListener('click'"));
  for (const viewport of [{ width: 1200, height: 800, offsetTop: 0, offsetLeft: 0 },
    { width: 320, height: 480, offsetTop: 0, offsetLeft: 0 },
    { width: 320, height: 230, offsetTop: 40, offsetLeft: 5 }]) {
    const anchor = { left: viewport.offsetLeft + 8, right: viewport.offsetLeft + 258, top: viewport.offsetTop + 64, bottom: viewport.offsetTop + 124 };
    const menu = { style: {}, getBoundingClientRect: () => ({ width: 288, height: 250 }) };
    const context = vm.createContext({ window: { visualViewport: viewport },
      iconMenu: { getBoundingClientRect: () => anchor }, backgroundMenu: menu });
    vm.runInContext(source, context);
    context.positionBackgroundMenu();
    const x = parseFloat(menu.style.left), y = parseFloat(menu.style.top), maxHeight = parseFloat(menu.style.maxHeight);
    assert(x >= viewport.offsetLeft + 8);
    assert(x + 288 <= viewport.offsetLeft + viewport.width - 8);
    assert(y >= viewport.offsetTop + 8);
    assert(y + maxHeight <= viewport.offsetTop + viewport.height - 8);
    if (viewport.width === 1200) { assert.equal(x, anchor.right + 8); assert.equal(y, anchor.top); }
    else assert(y >= anchor.bottom);
  }
});
