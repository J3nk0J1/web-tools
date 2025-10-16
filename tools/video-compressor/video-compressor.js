const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const chooseFileBtn = document.getElementById('chooseFileBtn');
const analysisPanel = document.getElementById('analysisPanel');
const settingsPanel = document.getElementById('settingsPanel');
const runPanel = document.getElementById('runPanel');
const resultPanel = document.getElementById('resultPanel');
const sourceDetails = document.getElementById('sourceDetails');
const recommendationList = document.getElementById('recommendationList');
const formatSelect = document.getElementById('formatSelect');
const targetSizeInput = document.getElementById('targetSize');
const safetySlider = document.getElementById('safetySlider');
const safetyLabel = document.getElementById('safetyLabel');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const encodeAgainBtn = document.getElementById('encodeAgain');
const runtimeWarning = document.getElementById('runtimeWarning');
const etaStrong = document.getElementById('etaStrong');
const etaCopy = document.getElementById('etaCopy');
const etaInline = document.getElementById('etaInline');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const logOutput = document.getElementById('logOutput');
const resultStats = document.getElementById('resultStats');
const downloadLink = document.getElementById('downloadLink');

const MB = 1024 * 1024;
const MIN_HEADROOM = 0.85;
const MAX_HEADROOM = 0.98;
const MIN_TARGET_MB = 20;
const MAX_TARGET_MB = 100;

let selectedFile = null;
let metadata = null;
let encodingPlan = null;
let lastObjectUrl = null;
let fpsEstimate = 30;
let hasAudio = true;

const MEDIA_RECORDER = window.MediaRecorder;
const MEDIA_RECORDER_SUPPORTED = typeof MEDIA_RECORDER !== 'undefined';
const MIME_TYPES = {
  mp4: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  webmVp9: 'video/webm;codecs=vp9,opus',
  webmVp8: 'video/webm;codecs=vp8,opus'
};

const SUPPORT_MATRIX = {
  mp4: MEDIA_RECORDER_SUPPORTED && MEDIA_RECORDER.isTypeSupported?.(MIME_TYPES.mp4),
  webmVp9: MEDIA_RECORDER_SUPPORTED && MEDIA_RECORDER.isTypeSupported?.(MIME_TYPES.webmVp9),
  webmVp8: MEDIA_RECORDER_SUPPORTED && MEDIA_RECORDER.isTypeSupported?.(MIME_TYPES.webmVp8)
};

const ensureEven = (value) => Math.max(2, Math.round(value / 2) * 2);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, exponent);
  const decimals = exponent === 0 ? 0 : size < 10 ? 2 : 1;
  return `${size.toFixed(decimals)} ${units[exponent]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'Unknown';
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.round(total % 60);
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

function formatBitrate(bitsPerSecond) {
  if (bitsPerSecond <= 0) return '—';
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
  if (bitsPerSecond >= 1_000) return `${(bitsPerSecond / 1_000).toFixed(0)} Kbps`;
  return `${bitsPerSecond.toFixed(0)} bps`;
}

function estimateFps(video) {
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    try {
      let lastTimestamp = null;
      return new Promise((resolve) => {
        const finish = (fps) => {
          try {
            video.pause();
          } catch (_) {
            /* noop */
          }
          resolve(fps || 30);
        };
        const handle = (_now, frameMeta) => {
          lastTimestamp = frameMeta.expectedDisplayTime;
          if (frameMeta.presentedFrames >= 30 || frameMeta.expectedDisplayTime > 2_000_000) {
            const seconds = lastTimestamp / 1_000_000;
            const fps = seconds > 0 ? frameMeta.presentedFrames / seconds : 30;
            finish(fps);
          } else {
            video.requestVideoFrameCallback(handle);
          }
        };
        video.requestVideoFrameCallback(handle);
        video.play().catch(() => finish(30));
        setTimeout(() => finish(30), 1_500);
      });
    } catch (_) {
      return Promise.resolve(30);
    }
  }
  return Promise.resolve(30);
}

function renderMetaList(target, items) {
  target.innerHTML = items
    .map((item) => {
      const note = item.note ? `<div class="hint">${item.note}</div>` : '';
      return `<li><div class="meta-list__label">${item.label}</div><div class="meta-list__value">${item.value}</div>${note}</li>`;
    })
    .join('');
}

function buildContainerPlan(preference) {
  let container = preference;
  let codec = 'vp9';
  let mimeType = MIME_TYPES.webmVp9;
  let supportNote = '';

  if (preference === 'auto') {
    if (SUPPORT_MATRIX.webmVp9) {
      container = 'webm';
      codec = 'vp9';
      mimeType = MIME_TYPES.webmVp9;
    } else if (SUPPORT_MATRIX.webmVp8) {
      container = 'webm';
      codec = 'vp8';
      mimeType = MIME_TYPES.webmVp8;
      supportNote = 'VP9 encoder unavailable, falling back to VP8.';
    } else if (SUPPORT_MATRIX.mp4) {
      container = 'mp4';
      codec = 'h264';
      mimeType = MIME_TYPES.mp4;
    } else {
      container = 'webm';
      codec = 'vp8';
      mimeType = MIME_TYPES.webmVp8;
      supportNote = 'MediaRecorder support is limited — outputs VP8/WebM if available.';
    }
  } else if (preference === 'mp4') {
    if (SUPPORT_MATRIX.mp4) {
      container = 'mp4';
      codec = 'h264';
      mimeType = MIME_TYPES.mp4;
    } else if (SUPPORT_MATRIX.webmVp9 || SUPPORT_MATRIX.webmVp8) {
      container = 'webm';
      codec = SUPPORT_MATRIX.webmVp9 ? 'vp9' : 'vp8';
      mimeType = SUPPORT_MATRIX.webmVp9 ? MIME_TYPES.webmVp9 : MIME_TYPES.webmVp8;
      supportNote = 'MP4/H.264 capture is not supported on this device; using WebM instead.';
    } else {
      container = 'mp4';
      codec = 'h264';
      mimeType = MIME_TYPES.mp4;
    }
  } else {
    if (SUPPORT_MATRIX.webmVp9) {
      container = 'webm';
      codec = 'vp9';
      mimeType = MIME_TYPES.webmVp9;
    } else if (SUPPORT_MATRIX.webmVp8) {
      container = 'webm';
      codec = 'vp8';
      mimeType = MIME_TYPES.webmVp8;
    } else if (SUPPORT_MATRIX.mp4) {
      container = 'mp4';
      codec = 'h264';
      mimeType = MIME_TYPES.mp4;
      supportNote = 'WebM capture is not supported on this device; using MP4/H.264 instead.';
    } else {
      container = 'webm';
      codec = 'vp8';
      mimeType = MIME_TYPES.webmVp8;
    }
  }

  const supported = MEDIA_RECORDER_SUPPORTED && MEDIA_RECORDER.isTypeSupported?.(mimeType);

  return {
    container,
    codec,
    mimeType,
    supported,
    supportNote
  };
}

function renderPlan(plan) {
  const containerLabel = plan.container === 'mp4' ? 'MP4' : 'WebM';
  const codecLabel = plan.codec === 'h264' ? 'H.264' : plan.codec.toUpperCase();
  const containerNote = plan.container === 'mp4'
    ? 'Greatest compatibility with Windows media players when supported by the browser.'
    : plan.codec === 'vp9'
      ? 'Patent-free VP9 is recommended for web delivery and offline playback.'
      : 'Fallback VP8 is used when VP9 is unavailable on this device.';

  const lines = [
    { label: 'Container', value: containerLabel, note: plan.supportNote || containerNote },
    { label: 'Video codec', value: codecLabel, note: 'Powered by the browser\'s built-in MediaRecorder encoder.' },
    { label: 'Target video bitrate', value: formatBitrate(plan.videoBitrate) },
    { label: 'Audio bitrate', value: plan.audioBitrate ? formatBitrate(plan.audioBitrate) : 'Muted' },
    { label: 'Resolution', value: `${plan.outputWidth}×${plan.outputHeight}`, note: plan.downscaled ? `Downscaled to keep ${(plan.bitsPerPixel).toFixed(3)} bpp at ~${plan.fps.toFixed(1)} fps.` : 'Keeps original resolution (rounded to even dimensions).' },
    { label: 'Estimated output', value: `${plan.estimatedSizeMB.toFixed(1)} MB`, note: `Leaves roughly ${(100 - plan.headroomPercent).toFixed(0)}% safety headroom.` },
    { label: 'Recorder support', value: plan.supported ? 'Available' : 'Unavailable', note: plan.supported ? 'Encoding can proceed in this browser.' : plan.supportStatus }
  ];

  renderMetaList(recommendationList, lines);
  etaStrong.textContent = `Encoding estimate: ${plan.etaText}`;
  etaCopy.textContent = plan.supported
    ? `Plan assumes MediaRecorder runs near real-time on a thin client (~${plan.etaMinutes.toFixed(1)} minutes).`
    : plan.supportStatus;
  etaInline.textContent = plan.etaText;
}

function updateHeadroomLabel() {
  const reserve = 100 - Number(safetySlider.value);
  safetyLabel.textContent = reserve.toString();
}

function determinePlan() {
  if (!selectedFile || !metadata) return null;

  const duration = Math.max(metadata.duration, 1);
  const fps = metadata.fps || 30;
  const headroomPercent = clamp(Number(safetySlider.value) / 100, MIN_HEADROOM, MAX_HEADROOM);
  const targetMb = clamp(Number(targetSizeInput.value) || MAX_TARGET_MB, MIN_TARGET_MB, MAX_TARGET_MB);
  const targetBytes = targetMb * MB * headroomPercent;
  const assumedAudio = hasAudio ? clamp(metadata.duration > 900 ? 96_000 : 128_000, 64_000, 160_000) : 0;
  const totalBitrate = targetBytes * 8 / duration;
  const videoBitrate = Math.max(320_000, totalBitrate - assumedAudio);

  const containerPlan = buildContainerPlan(formatSelect.value);

  let targetWidth = ensureEven(metadata.width || 640);
  let targetHeight = ensureEven(metadata.height || 360);
  let downscaled = false;
  const minWidth = 640;
  const minHeight = 360;
  const threshold = containerPlan.container === 'mp4' ? 0.085 : 0.06;
  let bitsPerPixel = videoBitrate / (fps * targetWidth * targetHeight);

  while (bitsPerPixel < threshold && targetWidth > minWidth && targetHeight > minHeight) {
    targetWidth = ensureEven(targetWidth * 0.85);
    const ratio = targetWidth / (metadata.width || targetWidth);
    targetHeight = ensureEven((metadata.height || targetHeight) * ratio);
    bitsPerPixel = videoBitrate / (fps * targetWidth * targetHeight);
    downscaled = true;
  }

  const estimatedSizeMB = (videoBitrate + assumedAudio) * duration / (8 * MB);
  const etaSeconds = Math.max(duration * 1.4, (selectedFile.size / MB) * 25);
  const etaMinutes = etaSeconds / 60;
  const etaText = etaMinutes >= 1 ? `${etaMinutes.toFixed(1)} minutes` : `${Math.ceil(etaSeconds)} seconds`;

  const supported = containerPlan.supported;
  const supportStatus = MEDIA_RECORDER_SUPPORTED
    ? `MediaRecorder cannot encode ${containerPlan.mimeType} on this device.`
    : 'MediaRecorder API is unavailable in this browser.';

  return {
    ...containerPlan,
    videoBitrate: Math.round(videoBitrate),
    audioBitrate: hasAudio ? Math.round(assumedAudio) : 0,
    outputWidth: targetWidth,
    outputHeight: targetHeight,
    downscaled,
    bitsPerPixel,
    headroomPercent: headroomPercent * 100,
    estimatedSizeMB,
    etaSeconds,
    etaMinutes,
    etaText,
    fps,
    supported,
    supportStatus,
    fileExtension: containerPlan.container === 'mp4' ? 'mp4' : 'webm'
  };
}

function updatePlan() {
  if (!selectedFile || !metadata) return;
  updateHeadroomLabel();
  encodingPlan = determinePlan();
  if (!encodingPlan) return;
  renderPlan(encodingPlan);
  startBtn.disabled = !encodingPlan.supported;
  runtimeWarning.hidden = !encodingPlan.supported;
}

function resetState() {
  selectedFile = null;
  metadata = null;
  encodingPlan = null;
  startBtn.disabled = true;
  analysisPanel.hidden = true;
  settingsPanel.hidden = true;
  runPanel.hidden = true;
  resultPanel.hidden = true;
  runtimeWarning.hidden = true;
  progressWrap.setAttribute('aria-hidden', 'true');
  progressBar.style.width = '0%';
  logOutput.textContent = '';
  downloadLink.href = '#';
  etaStrong.textContent = 'Encoding estimate: —';
  etaCopy.textContent = 'Load a video to calculate an estimated time to completion.';
  etaInline.textContent = '—';
  updateHeadroomLabel();
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }
}

function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  logOutput.textContent += `[${timestamp}] ${message}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function handleFile(file) {
  if (!file) return;
  resetState();
  selectedFile = file;
  hasAudio = true;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.src = url;

  const cleanup = () => URL.revokeObjectURL(url);
  const onError = () => {
    cleanup();
    appendLog('Unable to read metadata from the selected file.');
  };

  video.addEventListener('error', onError, { once: true });
  video.addEventListener('loadedmetadata', async () => {
    metadata = {
      duration: video.duration || 0,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      fps: fpsEstimate
    };
    let audioDetected;
    if (typeof video.mozHasAudio === 'boolean') {
      audioDetected = video.mozHasAudio;
    } else if (typeof video.webkitAudioDecodedByteCount === 'number') {
      audioDetected = video.webkitAudioDecodedByteCount > 0;
    } else if (video.audioTracks && typeof video.audioTracks.length === 'number') {
      audioDetected = video.audioTracks.length > 0;
    }
    if (audioDetected !== undefined) {
      hasAudio = audioDetected;
    }
    fpsEstimate = await estimateFps(video).catch(() => 30);
    metadata.fps = fpsEstimate;
    cleanup();

    const sourceItems = [
      { label: 'Filename', value: file.name },
      { label: 'Size', value: formatBytes(file.size) },
      { label: 'Duration', value: formatDuration(metadata.duration) },
      { label: 'Resolution', value: metadata.width && metadata.height ? `${metadata.width}×${metadata.height}` : 'Unknown' },
      { label: 'Estimated frame rate', value: `${metadata.fps.toFixed(1)} fps` },
      { label: 'Audio track', value: hasAudio ? 'Assumed present' : 'Not detected', note: 'Browsers cannot always confirm audio. Adjust target bitrate manually if necessary.' }
    ];

    renderMetaList(sourceDetails, sourceItems);
    analysisPanel.hidden = false;
    settingsPanel.hidden = false;
    runPanel.hidden = false;
    updatePlan();
  }, { once: true });
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    preventDefaults(e);
    dropzone.classList.add('highlight');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    preventDefaults(e);
    dropzone.classList.remove('highlight');
  });
});

dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (evt) => {
  if (evt.key === 'Enter' || evt.key === ' ') {
    evt.preventDefault();
    fileInput.click();
  }
});

chooseFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

formatSelect.addEventListener('change', updatePlan);

const syncTargetSize = () => {
  const value = clamp(Number(targetSizeInput.value) || MAX_TARGET_MB, MIN_TARGET_MB, MAX_TARGET_MB);
  if (Number(targetSizeInput.value) !== value) {
    targetSizeInput.value = String(value);
  }
  updatePlan();
};

targetSizeInput.addEventListener('input', syncTargetSize);
targetSizeInput.addEventListener('change', syncTargetSize);

safetySlider.addEventListener('input', () => {
  updateHeadroomLabel();
  updatePlan();
});

resetBtn.addEventListener('click', () => {
  resetState();
  fileInput.value = '';
});

encodeAgainBtn?.addEventListener('click', () => {
  resetState();
  fileInput.value = '';
});

async function runEncoding() {
  if (!selectedFile || !encodingPlan) return;

  if (!MEDIA_RECORDER_SUPPORTED) {
    appendLog('MediaRecorder API is unavailable in this browser; encoding cannot proceed.');
    return;
  }
  if (!MEDIA_RECORDER.isTypeSupported?.(encodingPlan.mimeType)) {
    appendLog(`MediaRecorder cannot encode ${encodingPlan.mimeType} on this device.`);
    return;
  }

  startBtn.disabled = true;
  progressBar.style.width = '0%';
  progressWrap.setAttribute('aria-hidden', 'false');
  runtimeWarning.hidden = false;
  appendLog(`Preparing to capture ${encodingPlan.container.toUpperCase()} output…`);

  const sourceUrl = URL.createObjectURL(selectedFile);
  const video = document.createElement('video');
  video.src = sourceUrl;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.controls = false;
  video.muted = false;
  video.volume = 0.0001;

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Unable to decode the source video.'));
    });
  } catch (error) {
    appendLog(`❌ ${error.message}`);
    URL.revokeObjectURL(sourceUrl);
    startBtn.disabled = false;
    return;
  }

  const outputWidth = encodingPlan.outputWidth || ensureEven(video.videoWidth || metadata?.width || 640);
  const outputHeight = encodingPlan.outputHeight || ensureEven(video.videoHeight || metadata?.height || 360);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const fps = clamp(Math.round(encodingPlan.fps || 30), 12, 60);
  const canvasStream = canvas.captureStream(fps);

  let audioTracks = [];
  let audioStream = null;
  if (hasAudio && typeof video.captureStream === 'function') {
    try {
      await video.play();
      audioStream = video.captureStream();
      audioTracks = audioStream.getAudioTracks();
      video.pause();
      video.currentTime = 0;
      if (audioTracks.length === 0) {
        appendLog('No audio track detected during capture; output will be silent.');
      } else {
        appendLog('Audio track attached from source stream.');
      }
    } catch (error) {
      appendLog(`Audio capture unavailable (${error.message}); continuing without audio.`);
      audioTracks = [];
    }
  } else if (hasAudio) {
    appendLog('Browser does not expose captureStream(); audio will be omitted.');
  }

  audioTracks.forEach((track) => canvasStream.addTrack(track));

  const recorderOptions = {
    mimeType: encodingPlan.mimeType,
    videoBitsPerSecond: Math.round(encodingPlan.videoBitrate)
  };
  if (audioTracks.length && encodingPlan.audioBitrate > 0) {
    recorderOptions.audioBitsPerSecond = Math.round(encodingPlan.audioBitrate);
    recorderOptions.bitsPerSecond = Math.round(encodingPlan.videoBitrate + encodingPlan.audioBitrate);
  }

  let recorder;
  try {
    recorder = new MEDIA_RECORDER(canvasStream, recorderOptions);
  } catch (error) {
    appendLog(`❌ Unable to start MediaRecorder: ${error.message}`);
    canvasStream.getTracks().forEach((track) => track.stop());
    if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(sourceUrl);
    startBtn.disabled = false;
    return;
  }

  const chunks = [];
  let stopResolve;
  let stopReject;
  const stopPromise = new Promise((resolve, reject) => {
    stopResolve = resolve;
    stopReject = reject;
  });

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) {
      chunks.push(event.data);
    }
  };
  recorder.onerror = (event) => {
    stopReject(event.error || new Error('MediaRecorder error occurred.'));
  };
  recorder.onstop = () => stopResolve();

  let animationFrameId = null;
  const drawFrame = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (!video.paused && !video.ended) {
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(drawFrame);
      } else {
        animationFrameId = requestAnimationFrame(drawFrame);
      }
    }
  };

  const trackProgress = () => {
    const ratio = video.duration ? video.currentTime / video.duration : 0;
    progressBar.style.width = `${Math.min(100, ratio * 100).toFixed(1)}%`;
    if (!video.paused && !video.ended) {
      setTimeout(trackProgress, 250);
    } else {
      progressBar.style.width = '100%';
    }
  };

  appendLog(`Starting capture at ${formatBitrate(encodingPlan.videoBitrate + (encodingPlan.audioBitrate || 0))} target bitrate…`);
  recorder.start(1000);

  video.currentTime = 0;
  const playbackPromise = video.play()
    .then(() => {
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(drawFrame);
      } else {
        animationFrameId = requestAnimationFrame(drawFrame);
      }
      trackProgress();
    })
    .catch((error) => {
      stopReject(error);
    });

  video.onended = () => {
    appendLog('Playback finished, finalising recording…');
    if (recorder.state === 'recording') {
      try {
        recorder.stop();
      } catch (_) {
        /* noop */
      }
    }
  };

  try {
    await Promise.all([stopPromise, playbackPromise]);
  } catch (error) {
    appendLog(`❌ Recording failed: ${error.message || error}`);
    try {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    } catch (_) {
      /* noop */
    }
    canvasStream.getTracks().forEach((track) => track.stop());
    if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(sourceUrl);
    startBtn.disabled = false;
    return;
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  canvasStream.getTracks().forEach((track) => track.stop());
  if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
  video.src = '';
  URL.revokeObjectURL(sourceUrl);

  const blob = new Blob(chunks, { type: encodingPlan.mimeType });
  if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
  lastObjectUrl = URL.createObjectURL(blob);
  downloadLink.href = lastObjectUrl;
  const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
  downloadLink.download = `${baseName}-compressed.${encodingPlan.fileExtension}`;

  const finalSize = blob.size / MB;
  const saved = (selectedFile.size / MB) - finalSize;
  const deltaMessage = saved >= 0
    ? `Saved ${saved.toFixed(1)} MB compared with the original.`
    : 'Output is slightly larger — consider lowering the target size.';

  resultStats.innerHTML = `
    <p><strong>Estimated bitrate:</strong> ${formatBitrate(encodingPlan.videoBitrate + (encodingPlan.audioBitrate || 0))}</p>
    <p><strong>Output size:</strong> ${finalSize.toFixed(1)} MB (goal ≤ ${clamp(Number(targetSizeInput.value) || MAX_TARGET_MB, MIN_TARGET_MB, MAX_TARGET_MB)} MB)</p>
    <p><strong>Note:</strong> ${deltaMessage}</p>
  `;

  resultPanel.hidden = false;
  appendLog('Ready — download using the button above.');
  startBtn.disabled = false;
}

startBtn.addEventListener('click', async () => {
  if (!encodingPlan) return;
  const confirmation = confirm(`Encoding will occupy the browser for roughly ${encodingPlan.etaText}. Proceed?`);
  if (!confirmation) {
    appendLog('Compression cancelled by user before starting.');
    return;
  }
  await runEncoding();
});

document.getElementById('backToDashboard')?.addEventListener('click', () => {
  window.location.href = '../../index.html';
});

resetState();
