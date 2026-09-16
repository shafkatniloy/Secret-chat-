const PAGE_SIZE = 200;
function createHistoryService({ Message, present }) {
  async function page(cursor = null) {
    let query = {};
    if (cursor !== null) {
      if (!cursor || typeof cursor !== 'object' || typeof cursor.id !== 'string' || !/^[a-f0-9]{24}$/i.test(cursor.id) ||
          typeof cursor.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cursor.createdAt) ||
          !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error('Invalid history cursor');
      const date = new Date(cursor.createdAt);
      query = { $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: cursor.id } }] };
    }
    const rows = await Message.find(query).sort({ createdAt: -1, _id: -1 }).limit(PAGE_SIZE + 1);
    const hasMore = rows.length > PAGE_SIZE;
    const selected = rows.slice(0, PAGE_SIZE).reverse();
    const oldest = selected[0];
    return { messages: await present(selected), hasMore,
      cursor: oldest ? { createdAt: new Date(oldest.createdAt).toISOString(), id: String(oldest._id) } : null };
  }
  return { page };
}
function registerHistoryHandlers(socket, service) {
  let busy = false;
  socket.on('older messages', async (data, ack) => {
    if (typeof ack !== 'function') return;
    if (busy) { ack({ error: 'History is already loading.' }); return; }
    busy = true;
    try {
      if (!data || !Object.hasOwn(data, 'cursor')) throw new Error('Missing history cursor');
      ack({ ok: true, ...await service.page(data.cursor) });
    } catch { ack({ error: 'Could not load older messages. Please retry.' }); }
    finally { busy = false; }
  });
}
module.exports = { createHistoryService, registerHistoryHandlers, PAGE_SIZE };
