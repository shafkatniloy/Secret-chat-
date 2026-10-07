(function (root) {
  const palettes = {
    purple: { name: 'Purple · original', start: '#667eea', end: '#764ba2', rgb: '102,126,234', soft: '#e8eaff', darkStart: '#303977', darkEnd: '#49316b', darkSoft: '#37366b', lightAccent: '#bdc6ff' },
    ocean: { name: 'Ocean Blue', start: '#2563b8', end: '#164e78', rgb: '37,99,184', soft: '#e0efff', darkStart: '#183759', darkEnd: '#123e50', darkSoft: '#233f60', lightAccent: '#add8ff' },
    teal: { name: 'Teal', start: '#087f80', end: '#176349', rgb: '8,127,128', soft: '#dff4ee', darkStart: '#174745', darkEnd: '#1b4030', darkSoft: '#234b43', lightAccent: '#9de2d3' },
    rose: { name: 'Rose', start: '#bd3568', end: '#823e83', rgb: '189,53,104', soft: '#fbe5ee', darkStart: '#56263c', darkEnd: '#462947', darkSoft: '#543044', lightAccent: '#ffb9d3' },
    sunset: { name: 'Sunset', start: '#b95420', end: '#a32d50', rgb: '185,84,32', soft: '#fcebdd', darkStart: '#553421', darkEnd: '#502636', darkSoft: '#543c30', lightAccent: '#ffd0a6' }
  };
  function valid(id) { return typeof id === 'string' && Object.hasOwn(palettes, id); }
  const ChatColors = { palettes, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = ChatColors;
  else root.ChatColors = ChatColors;
})(typeof window !== 'undefined' ? window : globalThis);
