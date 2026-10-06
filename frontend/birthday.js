(function (root) {
  const emoji = ['🎂', '🎉', '🎈', '💛', '🥳', '✨', '🌸', '🎁', '💖', '🎊'];
  const Birthday = {
    wishes: () => Array.from({ length: 100 }, (_, i) => ({
      key: 'birthday-2026-' + i,
      text: 'Happy Birthday Ohona ' + emoji[i % emoji.length],
      number: i + 1
    }))
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Birthday;
  else root.Birthday = Birthday;
})(typeof window !== 'undefined' ? window : globalThis);
