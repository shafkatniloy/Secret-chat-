const MemoryJar = (() => {
  const dialog = document.getElementById('memoryDialog');
  const list = document.getElementById('memoryList');
  const status = document.getElementById('memoryStatus');
  const more = document.getElementById('moreMemories');
  const suppressed = new Set();
  let generation = 0, busy = false, cursor = null;
  const create = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
  function controls() {
    for (const button of dialog.querySelectorAll('button:not(#closeMemories)')) button.disabled = busy;
  }
  function pauseMedia(container = list) { for (const audio of container.querySelectorAll('audio')) audio.pause(); }
  function clear() { pauseMedia(); list.replaceChildren(); cursor = null; more.hidden = true; }
  function close() { ++generation; busy = false; clear(); status.textContent = ''; if (dialog.open) dialog.close(); scheduleReadReceipts(); }
  function reset() { close(); suppressed.clear(); }
  function show() {
    if (!currentUsername) return false;
    closeIconMenu(); closeMessageMenu(); closeAttachmentMenu();
    if (!dialog.open) dialog.showModal();
    return true;
  }
  async function run(event, payload, onSuccess) {
    if (busy) return false;
    if (!socket?.connected || !currentUsername) { status.textContent = 'Reconnect to use the memory jar.'; return false; }
    const connection = socket, token = generation;
    busy = true; controls(); status.textContent = 'Loading…';
    try {
      const result = await new Promise((resolve, reject) => {
        connection.timeout(15000).emit(event, payload, (error, data) => {
          if (error || !data?.ok) reject(new Error('Memory request failed'));
          else resolve(data);
        });
      });
      if (token !== generation || connection !== socket || !dialog.open) return false;
      onSuccess(result); return true;
    } catch {
      if (token === generation) status.textContent = 'Could not confirm the request. Tap Refresh to sync, or try again.';
      return false;
    } finally { if (token === generation) { busy = false; controls(); } }
  }
  function addCard(entry) {
    const data = entry.message;
    const id = String(entry.messageId);
    if (!data || data.deleted || suppressed.has(id) || [...list.children].some(node => node.dataset.messageId === id)) return;
    const card = create('article'); card.className = 'memory-card'; card.dataset.messageId = id;
    card.appendChild(create('h3', data.username || 'Message'));
    card.appendChild(create('small', formatDhakaTime(data)));
    if (data.type === 'image') {
      const url = safeImageUrl(data.imagePath);
      if (url) { const image = create('img'); image.src = url; image.alt = 'Saved photo'; image.loading = 'lazy'; card.appendChild(image); }
      else card.appendChild(create('p', 'Photo unavailable'));
    } else if (data.type === 'voice') {
      const url = safeVoiceUrl(data.voicePath);
      if (url) {
        const audio = create('audio'); audio.controls = true; audio.preload = 'none'; audio.src = url;
        audio.setAttribute('aria-label', 'Saved voice message');
        audio.addEventListener('play', () => { stopMusicPlayback(); stopVoicePlayback(); for (const other of list.querySelectorAll('audio')) if (other !== audio) other.pause(); });
        card.appendChild(audio);
      } else card.appendChild(create('p', 'Voice message unavailable'));
    } else if (data.type === 'music') {
      const video = YouTubeLinks.parse(data.message);
      if (video) { const link = create('a', 'Open saved music on YouTube'); link.href = video.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.appendChild(link); }
      else card.appendChild(create('p', 'Music link unavailable'));
    } else {
      const text = create('p', data.message || ''); text.className = 'memory-text'; card.appendChild(text);
    }
    card.appendChild(create('small', 'Saved by ' + entry.savedBy + ' · ' + formatDhakaTime({ createdAt: entry.savedAt })));
    const remove = create('button', 'Remove from jar'); remove.type = 'button';
    remove.onclick = () => run('remove memory', { messageId: id }, () => {
      updated({ action: 'removed', messageId: id }); status.textContent = 'Removed from the jar. The chat message is unchanged.';
    });
    card.appendChild(remove); list.appendChild(card);
  }
  async function load(append = false, random = false) {
    if (busy) return;
    await run(random ? 'random memory' : 'get memories', { cursor: append ? cursor : null }, result => {
      if (!append) clear();
      for (const entry of result.entries || []) addCard(entry);
      cursor = result.cursor; more.hidden = random || !result.hasMore || !cursor;
      status.textContent = list.children.length ? (random ? 'A memory to revisit 💛' : localPreview ? 'Offline sample memories' : 'Your shared memories')
        : 'No memories here yet. Save a message from its three-dot menu.';
    });
  }
  async function save(data) {
    if (!data?._id || data.deleted || data.type === 'system' || !show()) return;
    const ok = await run('save memory', { messageId: String(data._id) }, () => { suppressed.delete(String(data._id)); status.textContent = 'Saved to your shared memory jar.'; });
    if (ok) await load();
  }
  function updated(data) {
    const id = String(data?.messageId || '');
    if (!id) return;
    if (data.action === 'removed') {
      suppressed.add(id);
      for (const card of [...list.children]) if (card.dataset.messageId === id) { pauseMedia(card); card.remove(); }
    } else if (data.action === 'saved') suppressed.delete(id);
    if (dialog.open) status.textContent = 'The shared jar changed. Tap Refresh to see the latest memories.';
  }
  function messageUpdated(data) { if (data?.deleted && data._id) updated({ action: 'removed', messageId: String(data._id) }); }
  document.getElementById('memoryMenuButton').addEventListener('click', () => { if (show()) load(); });
  document.getElementById('refreshMemories').addEventListener('click', () => load());
  document.getElementById('randomMemory').addEventListener('click', () => load(false, true));
  more.addEventListener('click', () => load(true));
  document.getElementById('closeMemories').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseMedia(); });
  return { save, updated, messageUpdated, reset, close };
})();
