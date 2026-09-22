(function (root) {
  const start = Date.parse('2026-09-24T00:00:00+06:00');
  const end = Date.parse('2026-09-25T00:00:00+06:00');
  const emoji = ['🎂', '🎉', '🎈', '💛', '🥳', '✨', '🌸', '🎁', '💖', '🎊'];
  const Birthday = {
    start, end,
    isActive: now => now >= start && now < end,
    wishes: () => Array.from({ length: 100 }, (_, i) => ({
      key: 'birthday-2026-' + i,
      text: 'Happy Birthday Ohona ' + emoji[i % emoji.length],
      number: i + 1
    }))
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Birthday;
  else root.Birthday = Birthday;
})(typeof window !== 'undefined' ? window : globalThis);
