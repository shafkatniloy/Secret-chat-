const { decorations, validId, validPosition, validText, clamp } = require('../frontend/little-world');
function createWorldService({ Setting, usernames }) {
  const present = row => ({ items: row?.items || [], revision: row?.revision || 0 });
  let ready = null;
  async function ensure() {
    if (!ready) ready = Setting.updateOne({ _id: 'shared' }, { $setOnInsert: { items: [], revision: 0 } }, { upsert: true })
      .catch(error => { if (error.code !== 11000) { ready = null; throw error; } });
    await ready;
  }
  return {
    async get() { return present(await Setting.findById('shared')); },
    async change(username, data) {
      if (!usernames.includes(username) || !data || !validId(data.id) || !['add', 'move', 'remove'].includes(data.action)) throw new Error('Invalid world action');
      if (data.action !== 'remove' && (!validPosition(data.x) || !validPosition(data.y))) throw new Error('Invalid position');
      if (data.action === 'add' && (typeof data.type !== 'string' || !Object.hasOwn(decorations, data.type) || (data.type === 'text' && !validText(data.text)))) throw new Error('Invalid decoration');
      await ensure();
      let filter, update;
      if (data.action === 'add') {
        const item = { id: data.id, owner: username, type: data.type, x: clamp(data.x), y: clamp(data.y), ...(data.type === 'text' ? { text: data.text.trim() } : {}) };
        filter = { _id: 'shared', 'items.id': { $ne: data.id }, 'items.29': { $exists: false } };
        update = { $push: { items: item }, $inc: { revision: 1 } };
      } else {
        filter = { _id: 'shared', items: { $elemMatch: { id: data.id, owner: username } } };
        update = data.action === 'move'
          ? { $set: { 'items.$.x': clamp(data.x), 'items.$.y': clamp(data.y) }, $inc: { revision: 1 } }
          : { $pull: { items: { id: data.id, owner: username } }, $inc: { revision: 1 } };
      }
      const row = await Setting.findOneAndUpdate(filter, update, { new: true, runValidators: true });
      if (row) return present(row);
      const current = await Setting.findById('shared');
      // Lost acknowledgements can safely retry the same addition or removal.
      if (data.action === 'add' && current?.items.some(item => item.id === data.id && item.owner === username)) return present(current);
      if (data.action === 'remove' && !current?.items.some(item => item.id === data.id)) return present(current);
      throw new Error('The world is full, or that piece is unavailable or belongs to the other user.');
    }
  };
}
function registerWorldHandlers(socket, io, service) {
  let busy = false;
  socket.on('get world', async (_data, ack) => {
    if (typeof ack !== 'function') return;
    try { ack({ ok: true, world: await service.get() }); }
    catch { ack({ error: 'Could not load your world. Please refresh.' }); }
  });
  socket.on('change world', async (data, ack) => {
    if (typeof ack !== 'function') return;
    if (busy) { ack({ error: 'A world update is still saving. Please retry.' }); return; }
    busy = true;
    try {
      const world = await service.change(socket.username, data);
      io.emit('world updated', world); ack({ ok: true, world });
    } catch { ack({ error: 'Could not save. The world may be full or the piece unavailable. Refresh and try again.' }); }
    finally { busy = false; }
  });
}
module.exports = { createWorldService, registerWorldHandlers };
