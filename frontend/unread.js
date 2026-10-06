(function (root) {
  function unreadMessages(messages, username) {
    const ids = new Set();
    for (const message of messages) {
      if (message._id && !message.status && !message.deleted &&
          ['message', 'image', 'voice', 'music'].includes(message.type) &&
          message.username && message.username !== username && message.seenBy !== username) {
        ids.add(String(message._id));
      }
    }
    return ids;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { unreadMessages };
  else root.unreadMessages = unreadMessages;
})(typeof window !== 'undefined' ? window : globalThis);
