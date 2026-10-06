(function (root) {
  const emoji = ['🎂', '🎉', '🎈', '💛', '🥳', '✨', '🌸', '🎁', '💖', '🎊'];
  const Birthday = {
    wishes: () => Array.from({ length: 100 }, (_, i) => ({
      key: 'birthday-2026-' + i,
      createdAt: new Date(Date.parse('2026-09-24T00:00:00+06:00') + i).toISOString(),
      text: 'Happy Birthday Ohona ' + emoji[i % emoji.length],
      number: i + 1
    }))
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Birthday;
  else root.Birthday = Birthday;
})(typeof window !== 'undefined' ? window : globalThis);
