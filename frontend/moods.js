(function (root) {
  const options = [
    { id: 'happy', emoji: '😊', label: 'মন ভালো' }, { id: 'sad', emoji: '😔', label: 'মন খারাপ' },
    { id: 'sleepy', emoji: '😴', label: 'ঘুম পাচ্ছে' }, { id: 'stressed', emoji: '😰', label: 'চাপে আছি' },
    { id: 'relaxed', emoji: '😌', label: 'শান্ত লাগছে' }, { id: 'talk', emoji: '💬', label: 'কথা বলতে চাই' },
    { id: 'angry', emoji: '😠', label: 'রাগ লাগছে' }
  ];
  const valid = id => id === null || options.some(option => option.id === id);
  const active = (profile, now = Date.now()) => profile && new Date(profile.expiresAt).getTime() > now
    ? options.find(option => option.id === profile.mood) || null : null;
  class State {
    constructor() { this.profiles = new Map(); }
    receive(profile) {
      if (!profile || typeof profile.username !== 'string' || !valid(profile.mood) ||
          !Number.isSafeInteger(profile.revision) || profile.revision < 0) return;
      const old = this.profiles.get(profile.username);
      if (!old || profile.revision >= old.revision) this.profiles.set(profile.username, profile);
    }
  }
  const Moods = { options, valid, active, State, duration: 24 * 3600000 };
  if (typeof module !== 'undefined' && module.exports) module.exports = Moods;
  else root.Moods = Moods;
})(typeof window !== 'undefined' ? window : globalThis);
