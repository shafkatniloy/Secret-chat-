const Moods = require('../frontend/moods');
function createMoodService({ Setting, usernames, now = () => Date.now() }) {
  function present(username, row) {
    const active = Moods.active(row, now());
    return { username, mood: active?.id || null, updatedAt: row?.updatedAt || null,
      expiresAt: row?.expiresAt || null, revision: row?.revision || 0 };
  }
  return {
    async get() {
      const rows = await Setting.find({ _id: { $in: usernames } });
      return usernames.map(username => present(username, rows.find(row => row._id === username)));
    },
    async set(username, data) {
      if (!usernames.includes(username) || !data || typeof data !== 'object' || !Moods.valid(data.mood)) throw new Error('Invalid mood');
      const time = now();
      const update = { $set: { mood: data.mood, updatedAt: new Date(time),
        expiresAt: data.mood === null ? null : new Date(time + Moods.duration) }, $inc: { revision: 1 } };
      const options = { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: false };
      let row;
      try { row = await Setting.findOneAndUpdate({ _id: username }, update, options); }
      catch (error) {
        if (error.code !== 11000) throw error;
        row = await Setting.findOneAndUpdate({ _id: username }, update, { ...options, upsert: false });
        if (!row) throw error;
      }
      return present(username, row);
    }
  };
}
function registerMoodHandlers(socket, io, service) {
  socket.on('get moods', async (_data, ack) => {
    if (typeof ack !== 'function') return;
    try { ack({ ok: true, moods: await service.get() }); }
    catch { ack({ error: 'Could not load moods. Please retry.' }); }
  });
  socket.on('set mood', async (data, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const profile = await service.set(socket.username, data);
      io.emit('mood updated', profile);
      ack({ ok: true, profile });
    } catch { ack({ error: 'Could not save your mood. Please retry.' }); }
  });
}
module.exports = { createMoodService, registerMoodHandlers };
