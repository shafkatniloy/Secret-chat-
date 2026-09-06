function isTrustedImageUrl(value, cloudName) {
  if (typeof value !== 'string' || !cloudName || /[\s<>"'\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' &&
      !url.port && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname.startsWith(`/${cloudName}/image/upload/`) &&
      /\.(jpg|jpeg|png|gif|webp)$/i.test(url.pathname);
  } catch { return false; }
}

function safeHistoryMessage(message, cloudName) {
  const data = typeof message.toObject === 'function' ? message.toObject() : { ...message };
  if (data.type === 'image' && !isTrustedImageUrl(data.imagePath, cloudName)) data.imagePath = null;
  return data;
}

async function resolveImageUpload(Upload, username, data, cloudName) {
  if (!data || typeof data.uploadId !== 'string' || !/^[a-f0-9]{24}$/i.test(data.uploadId)) {
    throw new Error('Invalid image upload');
  }
  const upload = await Upload.findOne({ _id: data.uploadId, username });
  if (!upload || !isTrustedImageUrl(upload.url, cloudName)) throw new Error('Invalid image upload');
  return { imagePath: upload.url, imagePublicId: upload.publicId };
}

module.exports = { isTrustedImageUrl, safeHistoryMessage, resolveImageUpload };
