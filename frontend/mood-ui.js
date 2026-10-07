const MoodUI = (() => {
  const create = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const state = new Moods.State();
  let session = 0, busy = false, loading = false, timer = null;
  const currentUser = document.getElementById('currentUser');
  const badges = create('span', '', 'mood-badges'); badges.hidden = true;
  currentUser.parentNode.insertBefore(badges, currentUser);
  const openButton = create('button', 'Mood', 'mood-chip'); openButton.type = 'button';
  openButton.setAttribute('aria-haspopup', 'dialog'); currentUser.parentNode.insertBefore(openButton, currentUser);
  const dialog = create('dialog'); dialog.id = 'moodDialog'; dialog.setAttribute('aria-labelledby', 'moodTitle');
  const heading = create('div', '', 'mood-heading');
  const title = create('h2', 'Your mood'); title.id = 'moodTitle';
  const close = create('button', 'Close'); close.type = 'button'; close.onclick = () => dialog.close();
  heading.append(title, close); dialog.appendChild(heading);
  const summaries = create('div'); dialog.appendChild(summaries);
  dialog.appendChild(create('p', 'Choose your mood. Only you can change it. It expires after 24 hours.'));
  const grid = create('div', '', 'mood-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Choose your mood');
  const choices = [];
  for (const mood of Moods.options) {
    const button = create('button', '', 'mood-choice'); button.type = 'button'; button.dataset.mood = mood.id;
    const label = create('span', mood.emoji + ' ' + mood.label); label.lang = 'bn'; button.appendChild(label);
    button.onclick = () => save(mood.id); grid.appendChild(button); choices.push(button);
  }
  const clear = create('button', 'Clear mood'); clear.type = 'button'; clear.onclick = () => save(null);
  const retry = create('button', 'Refresh'); retry.type = 'button'; retry.onclick = () => load();
  const status = create('p'); status.id = 'moodStatus'; status.setAttribute('role', 'status');
  dialog.append(grid, clear, retry, status); document.body.appendChild(dialog);
  const chips = new Map(), rows = new Map();
  function request(connection, event, payload) {
    return new Promise((resolve, reject) => {
      connection.timeout(15000).emit(event, payload, (error, result) => {
        if (error || !result?.ok) reject(new Error('Mood request failed'));
        else resolve(result);
      });
    });
  }
  function render() {
    clearTimeout(timer);
    const username = currentUsername;
    const profiles = [...state.profiles.values()].sort((a, b) => (a.username === username ? -1 : b.username === username ? 1 : a.username.localeCompare(b.username)));
    let delay = 60000;
    for (const profile of profiles) {
      const name = profile.username;
      if (!chips.has(name)) {
        const chip = create('button', '', 'mood-chip'); chip.type = 'button';
        chip.setAttribute('aria-haspopup', 'dialog'); chip.append(create('span', name), create('span'));
        chip.onclick = open; chips.set(name, chip); badges.appendChild(chip);
        const row = create('div', '', 'mood-summary'), left = create('div');
        left.appendChild(create('strong', name + (name === username ? ' (you)' : '')));
        const age = create('small'); left.appendChild(age); const value = create('span', '', 'mood-value');
        row.append(left, value); summaries.appendChild(row); rows.set(name, { age, value });
      }
      const mood = Moods.active(profile);
      const chip = chips.get(name); chip.lastChild.textContent = mood?.emoji || '➖';
      chip.title = name + ': ' + (mood?.label || 'No mood'); chip.setAttribute('aria-label', chip.title + '. Open moods');
      const row = rows.get(name); row.value.textContent = mood ? mood.emoji + ' ' + mood.label : 'No mood'; row.value.lang = mood ? 'bn' : 'en';
      const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(profile.updatedAt)) / 60000));
      row.age.textContent = !mood ? 'Set a mood anytime' : minutes < 1 ? 'Updated just now' : minutes < 60 ? 'Updated ' + minutes + ' minutes ago' : 'Updated ' + Math.floor(minutes / 60) + ' hours ago';
      if (mood) delay = Math.min(delay, Math.max(1, Date.parse(profile.expiresAt) - Date.now()));
    }
    badges.hidden = profiles.length === 0;
    openButton.hidden = profiles.length > 0;
    currentUser.parentNode.classList.toggle('has-moods', profiles.length > 0);
    const ownMood = Moods.active(state.profiles.get(username));
    for (const choice of choices) {
      choice.setAttribute('aria-pressed', String(ownMood?.id === choice.dataset.mood));
      choice.disabled = busy || !socket?.connected;
    }
    clear.disabled = busy || !socket?.connected;
    retry.disabled = loading || busy || !socket?.connected;
    if (username) timer = setTimeout(render, delay);
  }
  function apply(profile) { state.receive(profile); render(); }
  function open() {
    if (!currentUsername) return;
    closeIconMenu(); closeAttachmentMenu(); closeMessageMenu();
    render(); dialog.showModal();
    if (!state.profiles.size) load();
  }
  openButton.onclick = open;
  async function load() {
    if (loading || !socket?.connected || !currentUsername) return;
    const connection = socket, token = session;
    loading = true; status.textContent = 'Loading moods…'; render();
    try {
      const result = await request(connection, 'get moods', {});
      if (connection !== socket || token !== session) return;
      for (const profile of result.moods || []) state.receive(profile);
      status.textContent = localPreview ? 'Offline sample moods' : '';
    } catch {
      if (connection === socket && token === session) status.textContent = 'Could not load moods. Tap Refresh to retry.';
    } finally {
      if (token === session) { loading = false; render(); }
    }
  }
  async function save(mood) {
    if (busy || !socket?.connected || !currentUsername || !Moods.valid(mood)) return;
    const connection = socket, token = session;
    busy = true; status.textContent = 'Saving your mood…'; render();
    try {
      const result = await request(connection, 'set mood', { mood });
      if (connection !== socket || token !== session) return;
      state.receive(result.profile);
      status.textContent = localPreview ? 'Mood updated · offline preview' : mood === null ? 'Your mood cleared' : 'Your mood updated';
    } catch {
      if (connection === socket && token === session) status.textContent = 'Could not confirm the update. Refresh to sync, or try again.';
    } finally {
      if (token === session) { busy = false; render(); }
    }
  }
  function reset() {
    ++session; busy = false; loading = false; clearTimeout(timer);
    state.profiles.clear(); chips.clear(); rows.clear(); badges.replaceChildren(); summaries.replaceChildren();
    badges.hidden = true; openButton.hidden = false;
    currentUser.parentNode.classList.remove('has-moods');
    status.textContent = ''; if (dialog.open) dialog.close();
  }
  function disconnect() {
    ++session; busy = false; loading = false;
    status.textContent = 'Reconnecting… moods will sync when connected.'; render();
  }
  document.addEventListener('visibilitychange', () => { if (currentUsername) render(); });
  return { apply, load, reset, disconnect };
})();
