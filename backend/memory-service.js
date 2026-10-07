const TYPES = ['message', 'image', 'voice', 'music'];
const PAGE_SIZE = 20;
const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
function createMemoryService({ Memory, Message, present, toId }) {
  const eligible = { type: { $in: TYPES }, deleted: { $ne: true } };
  const lookup = [
    { $lookup: { from: Message.collection.name, localField: 'messageId', foreignField: '_id', as: 'message' } },
    { $unwind: '$message' },
    { $match: { 'message.type': { $in: TYPES }, 'message.deleted': { $ne: true } } }
  ];
  async function entries(rows) {
    const messages = await present(rows.map(row => row.message));
    return rows.map((row, index) => ({ _id: String(row._id), messageId: String(row.messageId),
      savedBy: row.savedBy, savedAt: row.savedAt, message: messages[index] }));
  }
  return {
    async save(username, data) {
      if (!validId(data?.messageId)) throw new Error('Invalid message');
      const message = await Message.findOne({ _id: data.messageId, ...eligible });
      if (!message) throw new Error('Message unavailable');
      try {
        await Memory.updateOne({ messageId: message._id }, {
          $setOnInsert: { messageId: message._id, savedBy: username, savedAt: new Date() }
        }, { upsert: true, runValidators: true });
      } catch (error) { if (error.code !== 11000) throw error; }
      return { messageId: String(message._id) };
    },
    async remove(data) {
      if (!validId(data?.messageId)) throw new Error('Invalid message');
      await Memory.deleteOne({ messageId: data.messageId });
      return { messageId: data.messageId };
    },
    async page(data = {}) {
      const cursor = data.cursor ?? null;
      if (cursor !== null && !validId(cursor)) throw new Error('Invalid cursor');
      const rows = await Memory.aggregate([
        ...(cursor ? [{ $match: { _id: { $lt: toId(cursor) } } }] : []),
        { $sort: { _id: -1 } }, ...lookup, { $limit: PAGE_SIZE + 1 }
      ]).option({ maxTimeMS: 10000 });
      const selected = rows.slice(0, PAGE_SIZE);
      return { entries: await entries(selected), hasMore: rows.length > PAGE_SIZE,
        cursor: selected.length ? String(selected.at(-1)._id) : null };
    },
    async random() {
      const rows = await Memory.aggregate([...lookup, { $sample: { size: 1 } }]).option({ maxTimeMS: 10000 });
      return { entries: await entries(rows), hasMore: false, cursor: null };
    }
  };
}
function registerMemoryHandlers(socket, io, service) {
  let busy = false;
  const handlers = {
    'save memory': data => service.save(socket.username, data),
    'remove memory': data => service.remove(data),
    'get memories': data => service.page(data),
    'random memory': () => service.random()
  };
  for (const [event, action] of Object.entries(handlers)) {
    socket.on(event, async (data, ack) => {
      if (typeof ack !== 'function') return;
      if (busy) { ack({ error: 'A memory request is already running. Please retry.' }); return; }
      busy = true;
      try {
        const result = await action(data);
        if (event === 'save memory' || event === 'remove memory') {
          io.emit('memory jar updated', { action: event === 'save memory' ? 'saved' : 'removed', messageId: result.messageId });
        }
        ack({ ok: true, ...result });
      } catch { ack({ error: 'Could not update or load the memory jar. The message may be unavailable; please retry.' }); }
      finally { busy = false; }
    });
  }
}
module.exports = { createMemoryService, registerMemoryHandlers, PAGE_SIZE };
