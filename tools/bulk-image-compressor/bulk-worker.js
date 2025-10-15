self.onmessage = async (event) => {
  const { id, buffer, type, format, quality } = event.data || {};
  if (typeof id !== 'number' || !buffer) {
    return;
  }
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      const error = new Error('Offscreen canvas is not supported in this browser.');
      error.fatal = true;
      throw error;
    }
    const sourceBlob = new Blob([buffer], { type: type || 'image/png' });
    const bitmap = await createImageBitmap(sourceBlob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      const error = new Error('Unable to obtain 2D context for worker compression.');
      error.fatal = true;
      throw error;
    }
    ctx.drawImage(bitmap, 0, 0);
    const options = {};
    if (format) options.type = format;
    if (typeof quality === 'number') options.quality = quality;
    const outputBlob = await canvas.convertToBlob(options);
    const outBuffer = await outputBlob.arrayBuffer();
    self.postMessage({ id, success: true, buffer: outBuffer, size: outputBlob.size, type: outputBlob.type }, [outBuffer]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown worker error.';
    const fatal = Boolean(err && (err.fatal || err.name === 'NotSupportedError'));
    self.postMessage({ id, success: false, error: message, fatal });
  }
};
