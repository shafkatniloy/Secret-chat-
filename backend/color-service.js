const { valid } = require('../frontend/colors');
function createColorService(Setting) {
  const present = row => ({ color: valid(row?.color) ? row.color : 'purple', revision: row?.revision || 0 });
  return {
    async get() { return present(await Setting.findById('shared')); },
    async set(data) {
      if (!data || !valid(data.color)) throw new Error('Invalid color');
      const update = { $set: { color: data.color }, $inc: { revision: 1 } };
      const options = { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: false };
      try { return present(await Setting.findOneAndUpdate({ _id: 'shared' }, update, options)); }
      catch (error) {
        if (error.code !== 11000) throw error;
        const row = await Setting.findOneAndUpdate({ _id: 'shared' }, update, { ...options, upsert: false });
        if (!row) throw error;
        return present(row);
      }
    }
  };
}
function registerColorHandlers(socket, io, service) {
  socket.on('get app color', async (_data, ack) => {
    if (typeof ack !== 'function') return;
    try { ack({ ok: true, preference: await service.get() }); }
    catch { ack({ error: 'Could not load shared app color. Reconnect to retry.' }); }
  });
  socket.on('set app color', async (data, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const preference = await service.set(data);
      io.emit('app color updated', preference);
      ack({ ok: true, preference });
    } catch { ack({ error: 'Could not save shared app color. Try again.' }); }
  });
}
module.exports = { createColorService, registerColorHandlers };
