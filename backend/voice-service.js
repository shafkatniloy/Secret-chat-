const MAX_VOICE_BYTES = 5 * 1024 * 1024;
const VOICE_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']);
function isTrustedVoiceUrl(value, cloudName) {
  if (typeof value !== 'string' || !cloudName || /[\s<>"'\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && !url.port && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname.startsWith(`/${cloudName}/video/upload/`) && /\.mp3$/i.test(url.pathname);
  } catch { return false; }
}
async function resolveVoiceUpload(Upload, username, data, cloudName) {
  if (typeof data?.uploadId !== 'string' || !/^[a-f0-9]{24}$/i.test(data.uploadId)) throw new Error('Invalid voice upload');
  const upload = await Upload.findOne({ _id: data.uploadId, username, deletionPending: { $ne: true } });
  if (!upload || !isTrustedVoiceUrl(upload.url, cloudName) || !Number.isFinite(upload.duration) || upload.duration <= 0 || upload.duration > 120.5) throw new Error('Invalid voice upload');
  return { voicePath: upload.url, voicePublicId: upload.publicId, voiceDuration: upload.duration };
}
function createVoiceUploadHandler({ Upload, uploader, cloudName, warn = console.warn }) {
  return async (req, res) => {
    const clientId = req.body?.clientId;
    if (!req.file || !VOICE_TYPES.has(req.file.mimetype) || !req.file.size || req.file.size > MAX_VOICE_BYTES ||
        typeof clientId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(clientId)) {
      return res.status(400).json({ error: 'Invalid voice recording. Maximum upload size is 5 MB.' });
    }
    let asset;
    try {
      const previous = await Upload.findOne({ username: req.username, clientId });
      if (previous) {
        if (previous.deletionPending) return res.status(400).json({ error: 'This recording is no longer available. Record it again.' });
        return res.json({ uploadId: String(previous._id) });
      }
      asset = await new Promise((resolve, reject) => {
        const stream = uploader.upload_stream({ resource_type: 'video', folder: 'secret-chat/voice', format: 'mp3',
          transformation: [{ duration: 120, audio_codec: 'mp3', bit_rate: '64k' }] },
        (error, result) => error ? reject(error) : resolve(result));
        stream.on('error', reject); stream.end(req.file.buffer);
      });
      if (!isTrustedVoiceUrl(asset?.secure_url, cloudName) || !asset.public_id || asset.resource_type !== 'video' || asset.format !== 'mp3' ||
          !Number.isFinite(asset.duration) || asset.duration <= 0 || asset.duration > 120.5 || !asset.bytes || asset.bytes > MAX_VOICE_BYTES) throw new Error('Invalid processed voice');
      const record = await Upload.create({ username: req.username, clientId, url: asset.secure_url, publicId: asset.public_id, duration: asset.duration });
      res.json({ uploadId: String(record._id) });
    } catch (error) {
      // A database write may have succeeded even if its acknowledgement was lost.
      let saved;
      try { saved = await Upload.findOne({ username: req.username, clientId }); }
      catch {
        warn('Voice upload registration could not be confirmed; asset retained for review.');
        return res.status(500).json({ error: 'Could not confirm voice upload. Please retry.' });
      }
      if (asset?.public_id && saved?.publicId !== asset.public_id) {
        try { await uploader.destroy(asset.public_id, { resource_type: 'video', invalidate: true }); }
        catch { warn('Could not clean up an unregistered voice upload.'); }
      }
      if (saved && !saved.deletionPending) return res.json({ uploadId: String(saved._id) });
      res.status(500).json({ error: 'Could not upload voice recording. Please retry.' });
    }
  };
}
module.exports = { MAX_VOICE_BYTES, VOICE_TYPES, isTrustedVoiceUrl, resolveVoiceUpload, createVoiceUploadHandler };
