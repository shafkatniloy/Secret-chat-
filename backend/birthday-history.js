const { createHash } = require('node:crypto');
const Birthday = require('../frontend/birthday');

// Fixed ObjectIds use MongoDB's built-in unique index, even before other indexes exist.
function birthdayRows() {
  return Birthday.wishes().map(wish => ({
    _id: createHash('sha256').update('amader-kotha:' + wish.key).digest('hex').slice(0, 24),
    type: 'system', celebration: 'birthday', message: wish.text, createdAt: new Date(wish.createdAt)
  }));
}

async function ensureBirthdayHistory(Message) {
  const rows = birthdayRows();
  const operations = rows.map(({ _id, createdAt, ...fields }) => ({
    updateOne: { filter: { _id }, update: { $set: { createdAt }, $setOnInsert: fields }, upsert: true }
  }));
  try {
    await Message.bulkWrite(operations, { ordered: false });
  } catch (error) {
    // Simultaneous backend starts can race to insert the same IDs.
    if (!error.writeErrors?.length || error.writeErrors.some(item => item.code !== 11000)) throw error;
  }
  if (await Message.countDocuments({ _id: { $in: rows.map(row => row._id) } }) !== 100) {
    throw new Error('Birthday history is incomplete');
  }
}

module.exports = { birthdayRows, ensureBirthdayHistory };
