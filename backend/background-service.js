const { resolveImageUpload } = require('./image-security');

function createBackgroundService({ Setting, ImageUpload, cloudName, withImageUse = (_username, _data, work) => work(), cleanupImage = async () => {} }) {
  const present = row => ({ preset: row?.preset || 'current', imagePath: row?.imagePath || null, revision: row?.revision || 0 });
  return {
    async get() { return present(await Setting.findById('shared')); },
    async set(username, data) {
      if (!data || typeof data !== 'object' || !['current', 'dark', 'light', 'gallery'].includes(data.preset)) {
        throw new Error('Invalid background');
      }
      const save = async () => {
        const image = data.preset === 'gallery' ? await resolveImageUpload(ImageUpload, username, data, cloudName) : null;
        const update = {
          $set: { preset: data.preset, imagePath: image?.imagePath || null }, $inc: { revision: 1 }
        };
        const options = { upsert: true, new: false, runValidators: true, setDefaultsOnInsert: false };
        let row;
        try { row = await Setting.findOneAndUpdate({ _id: 'shared' }, update, options); }
        catch (error) {
          // Two first-time saves may race to create the singleton; retry the existing row.
          if (error.code !== 11000) throw error;
          row = await Setting.findOneAndUpdate({ _id: 'shared' }, update, { ...options, upsert: false });
          if (!row) throw error;
        }
        const saved = present({ ...update.$set, revision: (row?.revision || 0) + 1 });
        return { saved, previous: row?.preset === 'gallery' ? row.imagePath : null };
      };
      const { saved, previous } = data.preset === 'gallery'
        ? await withImageUse(username, data, save) : await save();
      if (previous && previous !== saved.imagePath) await cleanupImage(previous);
      return saved;
    }
  };
}

function registerBackgroundHandlers(socket, io, service) {
  socket.on('get background', async (_data, ack) => {
    if (typeof ack !== 'function') return;
    try { ack({ ok: true, background: await service.get() }); }
    catch { ack({ error: 'Could not load chat background. Try reconnecting.' }); }
  });
  socket.on('set background', async (data, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const background = await service.set(socket.username, data);
      io.emit('background updated', background);
      ack({ ok: true, background });
    } catch { ack({ error: 'Could not save chat background. Try again.' }); }
  });
}
module.exports = { createBackgroundService, registerBackgroundHandlers };
