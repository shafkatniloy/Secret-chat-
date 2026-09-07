const { resolveImageUpload, safeHistoryMessage } = require('./image-security');
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const objectId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);

function createMessageService({ Message, ImageUpload, cloudName, getTime }) {
  async function present(messages) {
    const result = messages.map(message => safeHistoryMessage(message, cloudName));
    const ids = [...new Set(result.filter(m => !m.deleted && m.replyTo).map(m => String(m.replyTo)))];
    const originals = ids.length ? await Message.find({ _id: { $in: ids } }) : [];
    const byId = new Map(originals.map(m => [String(m._id), m]));
    for (const m of result) {
      if (m.deleted) {
        delete m.message; delete m.imagePath; delete m.imagePublicId;
        delete m.replyTo; delete m.replyPreview; m.reactions = {};
      } else if (m.replyTo) {
        const original = byId.get(String(m.replyTo));
        m.replyPreview = {
          username: original?.username || '',
          text: !original || original.deleted ? 'Message deleted' : original.type === 'image' ? 'Photo' : String(original.message || '').slice(0, 200)
        };
      }
    }
    return result;
  }

  async function send(username, type, data) {
    if (!data || typeof data.clientId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(data.clientId)) {
      throw new Error('Refresh the chat and try again.');
    }
    // Do not accept sends until the database's deduplication index is ready.
    await Message.init();
    const key = { username, clientId: data.clientId };
    const existing = await Message.findOne(key);
    if (existing) return existing;
    const values = { ...key, type, timestamp: getTime() };
    if (type === 'message') {
      if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > 10000) {
        throw new Error('Messages must contain 1–10000 characters.');
      }
      values.message = data.message;
    } else if (type === 'image') {
      Object.assign(values, await resolveImageUpload(ImageUpload, username, data, cloudName));
    } else throw new Error('Invalid message type.');
    if (data.replyTo != null) {
      if (!objectId(data.replyTo)) throw new Error('Invalid reply target.');
      const target = await Message.findOne({ _id: data.replyTo, deleted: { $ne: true }, type: { $in: ['message', 'image'] } });
      if (!target) throw new Error('That message is no longer available to reply to.');
      values.replyTo = target._id;
    }
    try {
      return await Message.findOneAndUpdate(key, { $setOnInsert: values }, {
        upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      const saved = await Message.findOne(key);
      if (!saved) throw err;
      return saved;
    }
  }

  async function unsend(username, data) {
    if (!objectId(data?.messageId)) throw new Error('Invalid message.');
    const key = { _id: data.messageId, username, type: { $in: ['message', 'image'] } };
    const message = await Message.findOneAndUpdate({ ...key, deleted: { $ne: true } }, {
      $set: { deleted: true, reactions: {} },
      $unset: { message: '', imagePath: '', imagePublicId: '', replyTo: '' },
      $inc: { revision: 1 }
    }, { new: true });
    const result = message || await Message.findOne({ ...key, deleted: true });
    if (!result) throw new Error('You can only unsend your own messages.');
    return result;
  }

  async function react(username, data) {
    if (!objectId(data?.messageId) || (data.emoji !== null && !REACTIONS.includes(data.emoji))) {
      throw new Error('Invalid reaction.');
    }
    const field = 'reactions.' + Buffer.from(username).toString('hex');
    const update = data.emoji === null ? { $unset: { [field]: '' } }
      : { $set: { [field]: { username, emoji: data.emoji } } };
    const message = await Message.findOneAndUpdate({ _id: data.messageId, deleted: { $ne: true }, type: { $in: ['message', 'image'] } },
      { ...update, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (!message) throw new Error('That message is no longer available.');
    return message;
  }
  async function seen(username, data) {
    if (!Array.isArray(data?.messageIds) || data.messageIds.length > 50 || !data.messageIds.every(objectId)) {
      throw new Error('Invalid read receipt.');
    }
    const changed = await Promise.all([...new Set(data.messageIds)].map(async _id =>
      await Message.findOneAndUpdate({ _id, username: { $ne: username }, deleted: { $ne: true },
        type: { $in: ['message', 'image'] }, seenBy: { $ne: username } },
      { $set: { seenBy: username, seenAt: new Date() }, $inc: { revision: 1 } }, { new: true }) ||
      await Message.findOne({ _id, username: { $ne: username }, type: { $in: ['message', 'image'] } })
    ));
    return changed.filter(Boolean);
  }
  return { send, unsend, react, present, seen };
}

function registerMessageHandlers(socket, io, service) {
  const handle = (event, action, broadcastEvent) => socket.on(event, async (data, ack) => {
    try {
      const saved = await action(socket.username, data);
      const [message] = await service.present([saved]);
      io.emit(broadcastEvent, message);
      if (typeof ack === 'function') ack({ ok: true, message });
    } catch (err) {
      const rejected = /^(Refresh|Messages must|Invalid |That message|You can only)/.test(err.message);
      if (typeof ack === 'function') ack({ notConfirmed: !rejected, error: 'Could not complete this action. ' +
        (rejected ? err.message : 'Please retry.') });
    }
  });
  handle('chat message', (username, data) => service.send(username, 'message', data), 'chat message');
  handle('image message', (username, data) => service.send(username, 'image', data), 'image message');
  handle('unsend message', service.unsend, 'message updated');
  handle('react message', service.react, 'message updated');
  socket.on('messages seen', async (data, ack) => {
    try {
      const messages = await service.present(await service.seen(socket.username, data));
      for (const message of messages) io.emit('message updated', message);
      if (typeof ack === 'function') ack({ ok: true, messages });
    } catch {
      if (typeof ack === 'function') ack({ error: 'Read receipt could not be saved.' });
    }
  });
}
module.exports = { createMessageService, registerMessageHandlers, REACTIONS };
