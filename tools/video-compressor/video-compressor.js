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
const resolutionSelect = document.getElementById('resolutionSelect');
const customResolutionWrap = document.getElementById('customResolution');
const resolutionWidthInput = document.getElementById('resolutionWidth');
const resolutionHeightInput = document.getElementById('resolutionHeight');
const videoBitrateMode = document.getElementById('videoBitrateMode');
const videoBitrateManualWrap = document.getElementById('videoBitrateManual');
const videoBitrateInput = document.getElementById('videoBitrate');
const fpsSelect = document.getElementById('fpsSelect');
const customFpsWrap = document.getElementById('customFpsWrap');
const fpsInput = document.getElementById('fpsInput');
const audioModeSelect = document.getElementById('audioMode');
const audioBitrateWrap = document.getElementById('audioBitrateWrap');
const audioBitrateInput = document.getElementById('audioBitrate');

const MB = 1024 * 1024;
const MIN_HEADROOM = 0.85;
const MAX_HEADROOM = 0.98;
const MIN_TARGET_MB = 20;
const MAX_TARGET_MB = 100;
const MIN_VIDEO_BITRATE = 250_000;
const MAX_VIDEO_BITRATE = 50_000_000;
const MIN_AUDIO_BITRATE = 32_000;
const MAX_AUDIO_BITRATE = 512_000;
const MIN_FPS = 12;
const MAX_FPS = 60;

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

  const videoBitrateNote = plan.bitrateMode === 'manual'
    ? 'Manual override — the target size slider is ignored.'
    : `Derived from a ${plan.targetMb.toFixed(0)} MB goal with ${(100 - plan.headroomPercent).toFixed(0)}% safety headroom.`;

  const resolutionNote = plan.resolutionNote || (plan.downscaled
    ? `Downscaled to keep ${(plan.bitsPerPixel || 0).toFixed(3)} bpp at ~${plan.fps.toFixed(1)} fps.`
    : 'Keeps original resolution (rounded to even dimensions).');

  const frameRateNote = plan.fpsMode === 'auto'
    ? 'Matches the detected source frame rate.'
    : plan.fpsMode === 'preset'
      ? 'Uses the preset frame rate selected above.'
      : 'Custom frame rate supplied by the user.';

  const estimatedNote = plan.bitrateMode === 'manual'
    ? 'Estimated using the manual bitrate values provided.'
    : `Leaves roughly ${(100 - plan.headroomPercent).toFixed(0)}% safety headroom.`;

  const lines = [
    { label: 'Container', value: containerLabel, note: plan.supportNote || containerNote },
    { label: 'Video codec', value: codecLabel, note: 'Powered by the browser\'s built-in MediaRecorder encoder.' },
    { label: 'Video bitrate', value: formatBitrate(plan.videoBitrate), note: videoBitrateNote },
    { label: 'Audio', value: plan.includeAudio ? formatBitrate(plan.audioBitrate) : 'Muted', note: plan.includeAudioNote },
    { label: 'Resolution', value: `${plan.outputWidth}×${plan.outputHeight}`, note: resolutionNote },
    { label: 'Frame rate', value: `${plan.fps.toFixed(2)} fps`, note: frameRateNote },
    { label: 'Bits per pixel', value: plan.bitsPerPixel ? plan.bitsPerPixel.toFixed(3) : '—', note: 'Higher values retain more detail.' },
    { label: 'Estimated output', value: `${plan.estimatedSizeMB.toFixed(1)} MB`, note: estimatedNote },
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

function syncControlVisibility() {
  const manualVideo = videoBitrateMode.value === 'manual';
  if (videoBitrateManualWrap) {
    videoBitrateManualWrap.hidden = !manualVideo;
  }
  if (videoBitrateInput) {
    videoBitrateInput.disabled = !manualVideo;
  }
  targetSizeInput.disabled = manualVideo;
  safetySlider.disabled = manualVideo;

  const showCustomResolution = resolutionSelect.value === 'custom';
  if (customResolutionWrap) {
    customResolutionWrap.hidden = !showCustomResolution;
  }
  if (resolutionWidthInput) {
    resolutionWidthInput.disabled = !showCustomResolution;
  }
  if (resolutionHeightInput) {
    resolutionHeightInput.disabled = !showCustomResolution;
  }

  const showCustomFps = fpsSelect.value === 'custom';
  if (customFpsWrap) {
    customFpsWrap.hidden = !showCustomFps;
  }
  if (fpsInput) {
    fpsInput.disabled = !showCustomFps;
  }

  const audioMuted = audioModeSelect.value === 'mute';
  if (audioBitrateWrap) {
    audioBitrateWrap.hidden = audioMuted;
  }
  if (audioBitrateInput) {
    audioBitrateInput.disabled = audioMuted;
  }
}

function determinePlan() {
  if (!selectedFile || !metadata) return null;

  const duration = Math.max(metadata.duration, 1);
  const detectedFps = metadata.fps || 30;
  const headroomPercent = clamp(Number(safetySlider.value) / 100, MIN_HEADROOM, MAX_HEADROOM);
  const targetMb = clamp(Number(targetSizeInput.value) || MAX_TARGET_MB, MIN_TARGET_MB, MAX_TARGET_MB);
  const targetBytes = targetMb * MB * headroomPercent;

  const audioMode = audioModeSelect.value;
  const includeAudio = audioMode !== 'mute' && (hasAudio || audioMode === 'force');
  let audioBitrate = includeAudio ? Number(audioBitrateInput.value) * 1_000 : 0;
  if (includeAudio) {
    if (!Number.isFinite(audioBitrate) || audioBitrate <= 0) {
      audioBitrate = clamp(metadata.duration > 900 ? 96_000 : 128_000, MIN_AUDIO_BITRATE, MAX_AUDIO_BITRATE);
    } else {
      audioBitrate = clamp(audioBitrate, MIN_AUDIO_BITRATE, MAX_AUDIO_BITRATE);
    }
  } else {
    audioBitrate = 0;
  }

  const bitrateMode = videoBitrateMode.value === 'manual' ? 'manual' : 'auto';
  let videoBitrate = Number(videoBitrateInput.value) * 1_000;
  if (bitrateMode === 'manual') {
    if (!Number.isFinite(videoBitrate) || videoBitrate <= 0) {
      videoBitrate = MIN_VIDEO_BITRATE;
    }
    videoBitrate = clamp(videoBitrate, MIN_VIDEO_BITRATE, MAX_VIDEO_BITRATE);
  } else {
    const totalBitrate = targetBytes * 8 / duration;
    const assumedAudio = includeAudio ? audioBitrate || clamp(metadata.duration > 900 ? 96_000 : 128_000, MIN_AUDIO_BITRATE, MAX_AUDIO_BITRATE) : 0;
    videoBitrate = Math.max(MIN_VIDEO_BITRATE, totalBitrate - assumedAudio);
    videoBitrate = clamp(videoBitrate, MIN_VIDEO_BITRATE, MAX_VIDEO_BITRATE);
    if (includeAudio && !audioBitrate) {
      audioBitrate = assumedAudio;
    }
  }

  const fpsSelection = fpsSelect.value;
  let fps = detectedFps || 30;
  let fpsMode = 'auto';
  if (fpsSelection === 'custom') {
    const customFps = Number(fpsInput.value);
    if (Number.isFinite(customFps) && customFps > 0) {
      fps = clamp(customFps, MIN_FPS, MAX_FPS);
    }
    fpsMode = 'custom';
  } else if (fpsSelection !== 'auto') {
    const presetFps = Number(fpsSelection);
    if (Number.isFinite(presetFps) && presetFps > 0) {
      fps = clamp(presetFps, MIN_FPS, MAX_FPS);
      fpsMode = 'preset';
    }
  }
  fps = clamp(fps, MIN_FPS, MAX_FPS);

  const containerPlan = buildContainerPlan(formatSelect.value);

  const sourceWidth = ensureEven(metadata.width || 0);
  const sourceHeight = ensureEven(metadata.height || 0);
  let targetWidth = sourceWidth || 1280;
  let targetHeight = sourceHeight || 720;
  const resolutionPreference = resolutionSelect.value;
  let resolutionMode = resolutionPreference;
  let resolutionNote = '';
  let downscaled = false;

  if (resolutionPreference === 'custom') {
    let widthValue = Number(resolutionWidthInput.value);
    let heightValue = Number(resolutionHeightInput.value);
    if (!Number.isFinite(widthValue) || widthValue <= 0) widthValue = targetWidth;
    if (!Number.isFinite(heightValue) || heightValue <= 0) heightValue = targetHeight;
    if (sourceWidth) widthValue = Math.min(widthValue, sourceWidth);
    if (sourceHeight) heightValue = Math.min(heightValue, sourceHeight);
    targetWidth = ensureEven(clamp(widthValue, 160, 7680));
    targetHeight = ensureEven(clamp(heightValue, 160, 4320));
    downscaled = !!(sourceWidth && (targetWidth < sourceWidth || targetHeight < sourceHeight));
    resolutionMode = 'custom';
    resolutionNote = 'Custom resolution supplied by the user.';
  } else if (resolutionPreference === 'source') {
    targetWidth = sourceWidth || targetWidth;
    targetHeight = sourceHeight || targetHeight;
    resolutionMode = 'source';
    downscaled = false;
    resolutionNote = 'Matches the source resolution.';
  } else if (resolutionPreference !== 'auto') {
    const option = resolutionSelect.selectedOptions?.[0];
    const optionWidth = Number(option?.dataset.width);
    const optionHeight = Number(option?.dataset.height);
    if (Number.isFinite(optionWidth) && Number.isFinite(optionHeight)) {
      if (sourceWidth && sourceHeight) {
        const ratio = Math.min(optionWidth / sourceWidth, optionHeight / sourceHeight, 1);
        const widthValue = ensureEven(clamp(Math.round(sourceWidth * ratio), 160, 7680));
        const heightValue = ensureEven(clamp(Math.round(sourceHeight * ratio), 160, 4320));
        targetWidth = widthValue || targetWidth;
        targetHeight = heightValue || targetHeight;
        downscaled = ratio < 1;
      } else {
        targetWidth = ensureEven(clamp(optionWidth, 160, 7680));
        targetHeight = ensureEven(clamp(optionHeight, 160, 4320));
        downscaled = false;
      }
      resolutionMode = 'preset';
      resolutionNote = `Preset ${option?.textContent?.trim() || resolutionPreference.toUpperCase()} selected.`;
    }
  } else {
    const threshold = containerPlan.container === 'mp4' ? 0.085 : 0.06;
    const minWidth = 640;
    const minHeight = 360;
    if (sourceWidth && sourceHeight) {
      targetWidth = ensureEven(sourceWidth);
      targetHeight = ensureEven(sourceHeight);
    }
    let bitsPerPixel = targetWidth && targetHeight ? videoBitrate / (fps * targetWidth * targetHeight) : 0;
    while (bitsPerPixel < threshold && targetWidth > minWidth && targetHeight > minHeight) {
      const nextWidth = ensureEven(targetWidth * 0.85);
      const ratio = sourceWidth ? nextWidth / sourceWidth : 0.85;
      const nextHeight = ensureEven((sourceHeight || targetHeight) * ratio);
      if (nextWidth < minWidth || nextHeight < minHeight) break;
      targetWidth = nextWidth;
      targetHeight = nextHeight;
      bitsPerPixel = targetWidth && targetHeight ? videoBitrate / (fps * targetWidth * targetHeight) : bitsPerPixel;
      downscaled = true;
    }
    resolutionMode = 'auto';
    resolutionNote = downscaled
      ? 'Auto mode reduced resolution to protect visual quality at the chosen bitrate.'
      : 'Keeps the source resolution.';
  }

  if (!Number.isFinite(targetWidth) || targetWidth <= 0) targetWidth = 1280;
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) targetHeight = 720;

  const audioBitrateKbps = includeAudio ? Math.round(audioBitrate / 1_000) : 0;
  const bitsPerPixel = targetWidth && targetHeight ? videoBitrate / (fps * targetWidth * targetHeight) : 0;
  const totalBitrate = videoBitrate + (includeAudio ? audioBitrate : 0);
  const estimatedSizeMB = totalBitrate * duration / (8 * MB);
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
    audioBitrate: includeAudio ? Math.round(audioBitrate) : 0,
    outputWidth: ensureEven(targetWidth),
    outputHeight: ensureEven(targetHeight),
    downscaled,
    bitsPerPixel,
    headroomPercent: headroomPercent * 100,
    estimatedSizeMB,
    etaSeconds,
    etaMinutes,
    etaText,
    fps,
    fpsMode,
    supported,
    supportStatus,
    fileExtension: containerPlan.container === 'mp4' ? 'mp4' : 'webm',
    includeAudio,
    audioMode,
    bitrateMode,
    resolutionMode,
    resolutionNote,
    audioBitrateKbps,
    targetMb,
    includeAudioNote: includeAudio
      ? (audioMode === 'force' && !hasAudio
        ? 'Audio will be forced even though the source track was not detected.'
        : 'Audio track will be re-encoded using the selected bitrate.')
      : 'Audio has been disabled for this encode.'
  };
}

function updatePlan() {
  syncControlVisibility();
  if (!selectedFile || !metadata) return;
  updateHeadroomLabel();
  encodingPlan = determinePlan();
  if (!encodingPlan) return;

  if (videoBitrateMode.value !== 'manual' && videoBitrateInput) {
    videoBitrateInput.value = Math.round(encodingPlan.videoBitrate / 1_000).toString();
  }
  if (encodingPlan.includeAudio && audioModeSelect.value === 'auto' && audioBitrateInput && audioBitrateInput.dataset.userModified !== 'true') {
    audioBitrateInput.value = Math.max(32, encodingPlan.audioBitrateKbps || 0).toString();
  }

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
  videoBitrateMode.value = 'auto';
  if (videoBitrateInput) {
    videoBitrateInput.value = '2500';
    delete videoBitrateInput.dataset.userModified;
  }
  targetSizeInput.disabled = false;
  safetySlider.disabled = false;
  audioModeSelect.value = 'auto';
  if (audioBitrateInput) {
    audioBitrateInput.value = '128';
    delete audioBitrateInput.dataset.userModified;
  }
  resolutionSelect.value = 'auto';
  if (resolutionWidthInput) {
    resolutionWidthInput.value = '';
  }
  if (resolutionHeightInput) {
    resolutionHeightInput.value = '';
  }
  fpsSelect.value = 'auto';
  if (fpsInput) {
    fpsInput.value = '30';
  }
  syncControlVisibility();
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

    if (resolutionWidthInput) {
      resolutionWidthInput.value = metadata.width ? ensureEven(metadata.width).toString() : '';
    }
    if (resolutionHeightInput) {
      resolutionHeightInput.value = metadata.height ? ensureEven(metadata.height).toString() : '';
    }
    if (fpsInput) {
      fpsInput.value = Math.round(metadata.fps || 30).toString();
    }
    if (audioBitrateInput && audioModeSelect.value === 'auto' && audioBitrateInput.dataset.userModified !== 'true') {
      const defaultAudio = metadata.duration > 900 ? 96 : 128;
      audioBitrateInput.value = defaultAudio.toString();
    }
    if (videoBitrateInput && videoBitrateMode.value !== 'manual' && videoBitrateInput.dataset.userModified !== 'true') {
      const durationSeconds = Math.max(metadata.duration, 1);
      const approximate = Math.max(MIN_VIDEO_BITRATE, (selectedFile.size * 8) / durationSeconds);
      videoBitrateInput.value = Math.round(approximate / 1_000).toString();
    }

    const sourceItems = [
      { label: 'Filename', value: file.name },
      { label: 'Size', value: formatBytes(file.size) },
      { label: 'Duration', value: formatDuration(metadata.duration) },
      { label: 'Resolution', value: metadata.width && metadata.height ? `${metadata.width}×${metadata.height}` : 'Unknown' },
      { label: 'Estimated frame rate', value: `${metadata.fps.toFixed(1)} fps` },
      { label: 'Audio track', value: hasAudio ? 'Assumed present' : 'Not detected', note: 'Browsers cannot always confirm audio. Use the audio controls below to force include or mute.' }
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

resolutionSelect.addEventListener('change', () => {
  if (resolutionSelect.value !== 'custom') {
    syncControlVisibility();
  }
  updatePlan();
});

resolutionWidthInput?.addEventListener('input', () => {
  syncControlVisibility();
  updatePlan();
});

resolutionHeightInput?.addEventListener('input', () => {
  syncControlVisibility();
  updatePlan();
});

videoBitrateMode.addEventListener('change', () => {
  if (videoBitrateMode.value !== 'manual' && videoBitrateInput) {
    delete videoBitrateInput.dataset.userModified;
  }
  updatePlan();
});

videoBitrateInput?.addEventListener('input', () => {
  videoBitrateInput.dataset.userModified = 'true';
  updatePlan();
});

fpsSelect.addEventListener('change', () => {
  if (fpsSelect.value !== 'custom' && fpsInput) {
    fpsInput.value = fpsInput.value || '30';
  }
  updatePlan();
});

fpsInput?.addEventListener('input', () => {
  updatePlan();
});

audioModeSelect.addEventListener('change', () => {
  if (!audioBitrateInput) {
    updatePlan();
    return;
  }
  if (audioModeSelect.value === 'auto') {
    delete audioBitrateInput.dataset.userModified;
  } else {
    audioBitrateInput.dataset.userModified = 'true';
  }
  updatePlan();
});

audioBitrateInput?.addEventListener('input', () => {
  audioBitrateInput.dataset.userModified = 'true';
  updatePlan();
});

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
  const shouldIncludeAudio = !!encodingPlan.includeAudio;
  video.muted = !shouldIncludeAudio;
  video.volume = shouldIncludeAudio ? 0.0001 : 0;

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

  const fps = clamp(Math.round(encodingPlan.fps || 30), MIN_FPS, 60);
  const canvasStream = canvas.captureStream(fps);

  let audioTracks = [];
  let audioStream = null;
  let audioContext = null;
  let audioDestination = null;
  let mediaElementSource = null;
  let silentGain = null;

  if (shouldIncludeAudio && typeof video.captureStream === 'function') {
    try {
      await video.play();
      audioStream = video.captureStream();
      audioTracks = audioStream.getAudioTracks();
      video.pause();
      video.currentTime = 0;
      if (audioTracks.length) {
        appendLog('Audio track attached from source stream.');
        audioTracks.forEach((track) => canvasStream.addTrack(track));
      } else {
        appendLog('No audio track detected during capture; will try Web Audio fallback.');
      }
    } catch (error) {
      appendLog(`Audio capture unavailable (${error.message}); trying Web Audio fallback.`);
      audioTracks = [];
    }
  } else if (shouldIncludeAudio) {
    appendLog('Browser does not expose captureStream(); attempting Web Audio fallback.');
  } else {
    appendLog('Audio muted per settings — output will be silent.');
  }

  if (shouldIncludeAudio && audioTracks.length === 0) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (typeof AudioCtx === 'function') {
      try {
        audioContext = new AudioCtx();
        await audioContext.resume().catch(() => {});
        mediaElementSource = audioContext.createMediaElementSource(video);
        audioDestination = audioContext.createMediaStreamDestination();
        silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        mediaElementSource.connect(audioDestination);
        mediaElementSource.connect(silentGain);
        silentGain.connect(audioContext.destination);
        audioTracks = audioDestination.stream.getAudioTracks();
        if (audioTracks.length) {
          audioTracks.forEach((track) => canvasStream.addTrack(track));
          appendLog('Audio bridged via AudioContext capture.');
        } else {
          appendLog('Audio bridge failed to expose any tracks; output will be silent.');
        }
      } catch (error) {
        appendLog(`Unable to initialise AudioContext capture (${error.message}); output will be silent.`);
      }
    } else {
      appendLog('Web Audio API is unavailable; audio cannot be captured in this browser.');
    }
  }

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
  if (mediaElementSource) {
    try { mediaElementSource.disconnect(); } catch (_) { /* noop */ }
  }
  if (silentGain) {
    try { silentGain.disconnect(); } catch (_) { /* noop */ }
  }
  if (audioDestination) {
    try { audioDestination.disconnect(); } catch (_) { /* noop */ }
  }
  if (audioContext) {
    try { audioContext.close(); } catch (_) { /* noop */ }
  }
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

  const goalText = encodingPlan.bitrateMode === 'manual'
    ? ''
    : ` (goal ≤ ${encodingPlan.targetMb.toFixed(0)} MB)`;
  const audioDescriptor = encodingPlan.includeAudio
    ? `${formatBitrate(encodingPlan.audioBitrate)} ${encodingPlan.audioMode === 'force' && !hasAudio ? '(forced include)' : '(re-encoded)'}`
    : 'Muted';

  resultStats.innerHTML = `
    <p><strong>Estimated total bitrate:</strong> ${formatBitrate(encodingPlan.videoBitrate + (encodingPlan.audioBitrate || 0))}</p>
    <p><strong>Video bitrate:</strong> ${formatBitrate(encodingPlan.videoBitrate)} (${encodingPlan.bitrateMode === 'manual' ? 'manual' : 'auto'})</p>
    <p><strong>Audio:</strong> ${audioDescriptor}</p>
    <p><strong>Output size:</strong> ${finalSize.toFixed(1)} MB${goalText}</p>
    <p><strong>Resolution &amp; frame rate:</strong> ${encodingPlan.outputWidth}×${encodingPlan.outputHeight} @ ${encodingPlan.fps.toFixed(2)} fps</p>
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
