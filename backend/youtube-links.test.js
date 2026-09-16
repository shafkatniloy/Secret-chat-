const test = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../frontend/youtube-links');
const id = 'dQw4w9WgXcQ';

test('supported YouTube link forms preserve second and h/m/s timestamps', () => {
  for (const [url, start] of [
    [`https://www.youtube.com/watch?v=${id}`, 0], [`https://youtu.be/${id}?t=90`, 90],
    [`https://music.youtube.com/watch?v=${id}&t=1m30s`, 90], [`youtube.com/watch?v=${id}#t=2m`, 120],
    [`https://m.youtube.com/shorts/${id}?start=12`, 12], [`https://www.youtube.com/embed/${id}?start=3600`, 3600],
    [`https://youtube.com/live/${id}?t=1h2m3s`, 3723], [`https://youtu.be/${id}?si=abc&t=0`, 0]
  ]) {
    const result = parse(url);
    assert.equal(result.videoId, id); assert.equal(result.start, start);
    assert.equal(parse(result.url).start, start);
  }
});

test('unsupported, malformed, injected, and misleading URLs are not playable', () => {
  for (const url of [null, {}, '', 'hello', 'javascript:alert(1)', 'https://example.com/song',
    `https://youtube.com.evil.test/watch?v=${id}`, `https://youtube.com@evil.test/watch?v=${id}`,
    `https://evil@youtube.com/watch?v=${id}`, `https://youtu.be/${id}/extra`,
    `https://youtube.com:444/watch?v=${id}`, 'https://youtube.com/watch?v=bad',
    `https://youtu.be/${id}?t=-5`, `https://youtu.be/${id}?t=NaN`, `https://youtu.be/${id}?t=9999999999999999`,
    `https://youtu.be/${id}?t=`, `https://youtu.be/${id}?t=1mgarbage`, `https://youtu.be/${id}" onload="bad`,
    'https://youtube.com/playlist?list=abc', 'x'.repeat(2049)]) assert.equal(parse(url), null, String(url));
});
