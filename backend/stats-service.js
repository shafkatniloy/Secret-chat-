const MESSAGE_TYPES = ['message', 'image', 'voice', 'music'];
function statsPipeline() {
  return [
    { $match: { type: { $in: MESSAGE_TYPES }, deleted: { $ne: true } } },
    { $facet: {
      total: [{ $count: 'count' }],
      users: [{ $group: { _id: '$username', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }],
      media: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
      first: [{ $match: { createdAt: { $type: 'date' } } }, { $group: { _id: null, date: { $min: '$createdAt' } } }],
      busiest: [{ $match: { createdAt: { $type: 'date' } } },
        { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Asia/Dhaka' } }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }, { $limit: 1 }]
    } }
  ];
}
async function getChatStats(Message) {
  const [result] = await Message.aggregate(statsPipeline()).option({ maxTimeMS: 10000 });
  const media = Object.fromEntries((result?.media || []).map(row => [row._id, row.count]));
  return {
    total: result?.total?.[0]?.count || 0,
    users: (result?.users || []).map(row => ({ username: row._id || 'Unknown user', count: row.count })),
    media: { photos: media.image || 0, voice: media.voice || 0, music: media.music || 0 },
    firstDate: result?.first?.[0]?.date || null,
    busiest: result?.busiest?.[0] ? { date: result.busiest[0]._id, count: result.busiest[0].count } : null
  };
}
module.exports = { statsPipeline, getChatStats };
