(function (root) {
  // Local preview uses the complete simulated history, not just the loaded page.
  function summarize(rows) {
    const users = new Map(), dates = new Map();
    const stats = { total: 0, users: [], media: { photos: 0, voice: 0, music: 0 }, firstDate: null, busiest: null };
    for (const row of rows) {
      if (row.deleted || !['message', 'image', 'voice', 'music'].includes(row.type)) continue;
      stats.total++;
      const username = row.username || 'Unknown user'; users.set(username, (users.get(username) || 0) + 1);
      const mediaKey = { image: 'photos', voice: 'voice', music: 'music' }[row.type];
      if (mediaKey) stats.media[mediaKey]++;
      const time = new Date(row.createdAt).getTime();
      if (!row.createdAt || !Number.isFinite(time)) continue;
      const iso = new Date(time).toISOString();
      if (!stats.firstDate || iso < stats.firstDate) stats.firstDate = iso;
      const date = new Date(time + 6 * 3600000).toISOString().slice(0, 10);
      dates.set(date, (dates.get(date) || 0) + 1);
    }
    stats.users = [...users].map(([username, count]) => ({ username, count })).sort((a, b) => b.count - a.count || a.username.localeCompare(b.username));
    const day = [...dates].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (day) stats.busiest = { date: day[0], count: day[1] };
    return stats;
  }
  const ChatStats = { summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = ChatStats;
  else root.ChatStats = ChatStats;
})(typeof window !== 'undefined' ? window : globalThis);
