(function (root) {
  const decorations = { moon: ['🌙', 'Moon'], stars: ['✨', 'Stars'], cloud: ['☁️', 'Cloud'], flower: ['🌸', 'Flower'], tree: ['🌳', 'Tree'], heart: ['💛', 'Heart'], text: ['T', 'Text'] };
  const validOwner = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
  const validId = value => typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
  const validPosition = value => Number.isFinite(value) && value >= 0 && value <= 100;
  const validText = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
  const clamp = value => Math.max(5, Math.min(95, value));
  class World {
    constructor(rows = []) {
      this.items = [];
      for (const row of rows.slice(0, 30)) {
        if (row && typeof row.id === 'string' && /^[\w-]{1,64}$/.test(row.id) && !this.items.some(item => item.id === row.id) &&
            Object.hasOwn(decorations, row.type) && (row.type !== 'text' || validText(row.text)) && validOwner(row.owner) && Number.isFinite(row.x) && Number.isFinite(row.y)) {
          this.items.push({ id: row.id, type: row.type, owner: row.owner, x: clamp(row.x), y: clamp(row.y), ...(row.type === 'text' ? { text: row.text.trim() } : {}) });
        }
      }
    }
    add(id, owner, type, x, y, text = '') {
      if (!validId(id) || (type === 'text' && !validText(text)) || this.items.length >= 30 || !validOwner(owner) || !Object.hasOwn(decorations, type) || !Number.isFinite(x) || !Number.isFinite(y) || this.items.some(item => item.id === id)) return false;
      this.items.push({ id, owner, type, x: clamp(x), y: clamp(y), ...(type === 'text' ? { text: text.trim() } : {}) }); return true;
    }
    move(id, actor, x, y) {
      const item = this.items.find(row => row.id === id);
      if (!item || item.owner !== actor || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      item.x = clamp(x); item.y = clamp(y); return true;
    }
    remove(id, actor) {
      const index = this.items.findIndex(row => row.id === id && row.owner === actor);
      if (index < 0) return false;
      this.items.splice(index, 1); return true;
    }
  }
  const LittleWorld = { World, decorations, validId, validPosition, validText, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = LittleWorld;
  else root.LittleWorld = LittleWorld;
})(typeof window !== 'undefined' ? window : globalThis);
