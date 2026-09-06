(function (root) {
  class ChatState {
    constructor(username) {
      this.username = username;
      this.messages = new Map();
      this.pending = new Map();
    }
    receive(message) {
      if (!message?._id) return;
      const key = String(message._id);
      const old = this.messages.get(key);
      if (!old || Number(message.revision || 0) >= Number(old.revision || 0)) this.messages.set(key, message);
      if (message.username === this.username && message.clientId) this.pending.delete(message.clientId);
    }
    list() {
      return [...this.messages.values(), ...this.pending.values()].sort((a, b) =>
        new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || String(a._id || a.clientId).localeCompare(String(b._id || b.clientId)));
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { ChatState };
  else root.ChatState = ChatState;
})(typeof window !== 'undefined' ? window : globalThis);
