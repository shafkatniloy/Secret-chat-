const statsDialog = document.getElementById('statsDialog');
let statsRequestId = 0;
let statsController = null;
async function requestChatStats(connection, signal) {
  const bytes = new TextEncoder().encode(`${connection.auth.username}:${connection.auth.password}`);
  const response = await fetch(BACKEND_URL + '/api/stats', {
    headers: { Authorization: 'Basic ' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) },
    cache: 'no-store', signal
  });
  if (!response.ok) throw new Error('Stats unavailable');
  return response.json();
}
function closeStats() {
  ++statsRequestId;
  statsController?.abort(); statsController = null;
  if (statsDialog.open) statsDialog.close();
  document.getElementById('statsContent').replaceChildren();
  document.getElementById('statsStatus').textContent = '';
}
function statsDate(value, dateOnly = false) {
  if (!value) return 'No messages yet';
  const date = new Date(dateOnly ? value + 'T00:00:00+06:00' : value);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
function renderStats(stats) {
  const content = document.getElementById('statsContent'); content.replaceChildren();
  function card(title, value) {
    const box = document.createElement('div'); box.className = 'stats-card';
    const label = document.createElement('span'); label.textContent = title;
    const number = document.createElement('strong'); number.textContent = String(value);
    box.append(label, number); content.appendChild(box); return box;
  }
  card('Total messages', stats.total);
  const people = card('Messages per person', stats.total ? '' : 'No messages yet');
  for (const user of stats.users) {
    const row = document.createElement('div'); row.className = 'stats-person';
    const label = document.createElement('span');
    const percent = stats.total ? Math.round(user.count / stats.total * 100) : 0;
    label.textContent = user.username + ': ' + user.count + ' (' + percent + '%)';
    const bar = document.createElement('progress'); bar.max = stats.total || 1; bar.value = user.count;
    bar.setAttribute('aria-label', user.username + ' share of messages');
    row.append(label, bar); people.appendChild(row);
  }
  card('Photos', stats.media.photos); card('Voice messages', stats.media.voice); card('Music links', stats.media.music);
  card('First conversation', statsDate(stats.firstDate));
  card('Most active day', stats.busiest ? statsDate(stats.busiest.date, true) + ' · ' + stats.busiest.count + ' messages' : 'No messages yet');
}
async function loadStats() {
  if (statsController || !currentUsername || !socket) return;
  const id = ++statsRequestId, connection = socket, username = currentUsername;
  const controller = new AbortController(); statsController = controller;
  const refresh = document.getElementById('refreshStats'); refresh.disabled = true;
  const status = document.getElementById('statsStatus'); status.textContent = 'Loading stats…';
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const stats = await requestChatStats(connection, controller.signal);
    if (id !== statsRequestId || connection !== socket || username !== currentUsername || !statsDialog.open) return;
    renderStats(stats);
    status.textContent = localPreview ? 'Offline sample stats · simulated history' : 'Updated just now';
  } catch {
    if (id === statsRequestId && statsDialog.open) status.textContent = 'Could not load stats. Tap Refresh to retry.';
  } finally {
    clearTimeout(timer);
    if (id === statsRequestId) { statsController = null; refresh.disabled = false; }
  }
}
document.getElementById('statsMenuButton').addEventListener('click', () => {
  closeIconMenu();
  if (!currentUsername) return;
  statsDialog.showModal();
  document.getElementById('refreshStats').disabled = false;
  loadStats();
});
document.getElementById('closeStats').addEventListener('click', closeStats);
document.getElementById('refreshStats').addEventListener('click', loadStats);
statsDialog.addEventListener('cancel', event => { event.preventDefault(); closeStats(); });
