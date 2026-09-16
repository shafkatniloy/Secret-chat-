(function (root) {
  function parse(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    const text = value.trim();
    if (!text || /[\s<>"'\\]/.test(text)) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
      if (!['https:', 'http:'].includes(url.protocol) || url.port || url.username || url.password) return null;
      const host = url.hostname.toLowerCase();
      let videoId;
      if (host === 'youtu.be') videoId = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
        videoId = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
      }
      if (!/^[\w-]{11}$/.test(videoId || '')) return null;
      const hash = new URLSearchParams(url.hash.slice(1));
      const timestamp = url.searchParams.get('t') ?? url.searchParams.get('start') ?? hash.get('t');
      let start = 0;
      if (timestamp !== null) {
        if (/^\d+$/.test(timestamp)) start = Number(timestamp);
        else {
          const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(timestamp);
          if (!parts || !parts[0]) return null;
          start = Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
        }
        if (!Number.isSafeInteger(start) || start < 0 || start > 2147483647) return null;
      }
      return { videoId, start, url: 'https://www.youtube.com/watch?v=' + videoId + (start ? '&t=' + start : '') };
    } catch { return null; }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { parse };
  else root.YouTubeLinks = { parse };
})(typeof window !== 'undefined' ? window : globalThis);
