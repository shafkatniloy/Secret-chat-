const { isTrustedImageUrl } = require('./image-security');

// MongoDB guards coordinate image reuse and deletion, including across server processes.
function createImageLifecycle({ ImageUpload, Message, Setting, destroy, cloudName, warn = console.warn }) {
  async function withImageUse(username, data, work) {
    if (typeof data?.uploadId !== 'string' || !/^[a-f0-9]{24}$/i.test(data.uploadId)) throw new Error('Invalid image upload');
    const upload = await ImageUpload.findOneAndUpdate(
      { _id: data.uploadId, username, deletionPending: { $ne: true } },
      { $inc: { activeUses: 1 } }, { new: true }
    );
    if (!upload) throw new Error('Invalid image upload');
    try {
      if (!isTrustedImageUrl(upload.url, cloudName)) throw new Error('Invalid image upload');
      return await work();
    } finally {
      try {
        const released = await ImageUpload.findOneAndUpdate({ _id: upload._id }, { $inc: { activeUses: -1 } }, { new: true });
        if (released?.cleanupRequested && released.activeUses === 0) await cleanupImage(released.url);
      } catch { warn('Image use guard could not be released; retained upload needs review.'); }
    }
  }

  async function cleanupImage(imagePath) {
    if (!isTrustedImageUrl(imagePath, cloudName)) return;
    try {
      // A concurrent use defers deletion until its final guard is released.
      await ImageUpload.updateOne({ url: imagePath }, { $set: { cleanupRequested: true } });
      const upload = await ImageUpload.findOneAndUpdate({ url: imagePath, deletionPending: { $ne: true },
        $or: [{ activeUses: 0 }, { activeUses: { $exists: false } }]
      }, { $set: { deletionPending: true } }, { new: true });
      if (!upload) return;
      const references = { $or: [{ imagePath: upload.url }, { imagePublicId: upload.publicId }] };
      // Query after claiming: new uses cannot start until this decision is complete.
      if (await Setting.findOne({ imagePath: upload.url }) || await Message.findOne(references)) {
        await ImageUpload.updateOne({ _id: upload._id }, { $set: { deletionPending: false } });
        return;
      }
      if (!upload.publicId) throw new Error('Missing asset identifier');
      const result = await destroy(upload.publicId, { resource_type: 'image', invalidate: true });
      if (!['ok', 'not found'].includes(result?.result)) throw new Error('Deletion not confirmed');
      await ImageUpload.deleteOne({ _id: upload._id, deletionPending: true });
    } catch {
      // Keep the record blocked from reuse after uncertain deletion; never undo a saved setting.
      warn('Background image cleanup incomplete; retained upload record needs a cleanup retry.');
    }
  }
  return { withImageUse, cleanupImage };
}
module.exports = { createImageLifecycle };
