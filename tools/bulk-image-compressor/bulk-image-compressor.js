(function(){
  const MAX_FILES = 10;
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const chooseFilesBtn = document.getElementById('chooseFilesBtn');
  const formatSelect = document.getElementById('format');
  const qualityWrap = document.getElementById('qualityWrap');
  const qualityRange = document.getElementById('quality');
  const qualityValue = document.getElementById('qualityValue');
  const compressBtn = document.getElementById('compressBtn');
  const clearBtn = document.getElementById('clearBtn');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const statusMessage = document.getElementById('statusMessage');
  const fileList = document.getElementById('fileList');
  const panelResults = document.getElementById('panelResults');

  const queue = [];
  const rippleElements = new Set();
  let isCompressing = false;

  document.getElementById('backToDashboard')?.addEventListener('click', () => {
    window.location.href = '../../index.html';
  });

  chooseFilesBtn?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (event) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length) {
      addFiles(files);
      fileInput.value = '';
    }
  });

  dropzone?.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button')) {
      return;
    }
    fileInput?.click();
  });

  dropzone?.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dropzone.classList.add('highlight');
  });

  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('highlight');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('highlight');
  });

  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('highlight');
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    if (files.length) {
      addFiles(files);
    }
  });

  dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });

  formatSelect?.addEventListener('change', () => {
    toggleQuality();
    if (queue.some(item => item.status === 'done')) {
      showStatus('Output format changed. Re-run compression to generate new downloads.', 'info');
    }
  });

  qualityRange?.addEventListener('input', () => {
    if (qualityValue) {
      qualityValue.textContent = qualityRange.value;
    }
  });

  compressBtn?.addEventListener('click', async () => {
    if (!queue.length) return;
    await compressAll();
  });

  clearBtn?.addEventListener('click', () => {
    resetQueue();
    clearStatus();
  });

  downloadAllBtn?.addEventListener('click', () => {
    queue.filter(item => item.status === 'done' && item.downloadUrl).forEach(triggerDownload);
  });

  toggleQuality();
  refreshControls();

  function addFiles(files){
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      showStatus('Only image files (JPG, JPEG, PNG) can be compressed.', 'error');
      return;
    }

    const availableSlots = MAX_FILES - queue.length;
    if (availableSlots <= 0) {
      showStatus(`You already have ${MAX_FILES} images queued. Remove some before adding more.`, 'warning');
      return;
    }

    const toAdd = imageFiles.slice(0, availableSlots);
    const skipped = imageFiles.length - toAdd.length;

    toAdd.forEach(file => {
      const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      queue.push({
        id,
        file,
        status: 'pending',
        originalSize: file.size,
        outputSize: null,
        downloadUrl: null,
        outputName: null,
        error: null
      });
    });

    if (skipped > 0) {
      showStatus(`Added ${toAdd.length} image(s). ${skipped} file(s) skipped to maintain the ${MAX_FILES}-image limit.`, 'warning');
    } else {
      showStatus(`Added ${toAdd.length} image(s) to the queue.`, 'success');
    }

    renderList();
  }

  function resetQueue(){
    queue.forEach(item => {
      if (item.downloadUrl) {
        URL.revokeObjectURL(item.downloadUrl);
      }
    });
    queue.length = 0;
    renderList();
  }

  async function compressAll(){
    isCompressing = true;
    if (compressBtn) {
      compressBtn.disabled = true;
      compressBtn.textContent = 'Compressing…';
    }
    if (clearBtn) {
      clearBtn.disabled = true;
    }
    if (downloadAllBtn) {
      downloadAllBtn.disabled = true;
    }
    showStatus('Compressing images. Downloads will begin automatically.', 'info');

    for (const item of queue) {
      if (item.status === 'done' && item.downloadUrl) {
        continue;
      }
      item.status = 'processing';
      item.error = null;
      renderList();
      try {
        const blob = await compressFile(item.file);
        item.outputSize = blob.size;
        item.outputName = buildFileName(item.file.name, getSelectedFormat());
        if (item.downloadUrl) {
          URL.revokeObjectURL(item.downloadUrl);
        }
        item.downloadUrl = URL.createObjectURL(blob);
        item.status = 'done';
        renderList();
        triggerDownload(item);
      } catch (error) {
        console.error(error);
        item.status = 'error';
        item.error = error instanceof Error ? error.message : 'Unknown compression error.';
        renderList();
      }
    }

    if (compressBtn) {
      compressBtn.textContent = 'Compress images';
    }
    isCompressing = false;
    refreshControls();

    if (queue.every(item => item.status === 'done')) {
      showStatus('Compression complete. All downloads are ready.', 'success');
    } else if (queue.some(item => item.status === 'error')) {
      showStatus('Finished with some errors. Retry the failed files.', 'warning');
    } else {
      clearStatus();
    }
  }

  function triggerDownload(item){
    if (!item.downloadUrl || !item.outputName) return;
    const link = document.createElement('a');
    link.href = item.downloadUrl;
    link.download = item.outputName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function renderList(){
    if (!fileList) return;
    fileList.innerHTML = '';

    queue.forEach(item => {
      const li = document.createElement('li');
      li.className = 'file-item';

      const meta = document.createElement('div');
      meta.className = 'file-item__meta';

      const name = document.createElement('p');
      name.className = 'file-name';
      name.textContent = item.file.name;

      const status = document.createElement('span');
      status.className = 'file-status';
      status.textContent = buildStatusText(item);

      const sizes = document.createElement('div');
      sizes.className = 'file-sizes';
      const originalSize = document.createElement('span');
      originalSize.textContent = `Original: ${formatBytes(item.originalSize)}`;
      sizes.appendChild(originalSize);
      if (item.status === 'done' && typeof item.outputSize === 'number') {
        const compressedSize = document.createElement('span');
        compressedSize.textContent = `Compressed: ${formatBytes(item.outputSize)}`;
        sizes.appendChild(compressedSize);
        if (item.originalSize > 0) {
          const ratio = document.createElement('span');
          const pct = Math.round((item.outputSize / item.originalSize) * 100);
          ratio.textContent = `≈ ${pct}% of original`;
          sizes.appendChild(ratio);
        }
      }

      meta.append(name, status, sizes);

      const chip = document.createElement('span');
      chip.className = 'chip';
      const chipDot = document.createElement('span');
      chipDot.className = 'chip__dot';
      const chipLabel = document.createTextNode((item.file.type || 'image').replace('image/', '').toUpperCase());
      chip.append(chipDot, chipLabel);

      li.append(meta, chip);

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      if (item.status === 'done' && item.downloadUrl && item.outputName) {
        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'btn btn--outline';
        downloadBtn.href = item.downloadUrl;
        downloadBtn.download = item.outputName;
        downloadBtn.textContent = 'Download';
        actions.appendChild(downloadBtn);
        enhanceRipple(downloadBtn);
      } else if (item.status === 'error') {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn btn--outline';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => retryItem(item));
        actions.appendChild(retryBtn);
        enhanceRipple(retryBtn);
      }

      if (actions.childElementCount) {
        li.appendChild(actions);
      }

      fileList.appendChild(li);
    });

    panelResults.hidden = queue.length === 0;
    refreshControls();
  }

  function retryItem(item){
    item.status = 'pending';
    item.error = null;
    if (item.downloadUrl) {
      URL.revokeObjectURL(item.downloadUrl);
      item.downloadUrl = null;
    }
    item.outputSize = null;
    item.outputName = null;
    renderList();
    compressAll();
  }

  function refreshControls(){
    const hasFiles = queue.length > 0;
    if (compressBtn) {
      compressBtn.disabled = !hasFiles || isCompressing;
    }
    if (clearBtn) {
      clearBtn.disabled = !hasFiles || isCompressing;
    }
    if (downloadAllBtn) {
      downloadAllBtn.disabled = isCompressing || !queue.some(item => item.status === 'done' && item.downloadUrl);
    }
  }

  function buildStatusText(item){
    if (item.status === 'processing') return 'Compressing…';
    if (item.status === 'done') return `Ready • ${item.outputName}`;
    if (item.status === 'error') return `Error: ${item.error || 'Unable to compress file.'}`;
    return 'Queued';
  }

  function compressFile(file){
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.decoding = 'async';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const format = getSelectedFormat();
          const quality = format === 'image/jpeg' ? Number(qualityRange?.value || 80) / 100 : undefined;
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error('Unable to produce compressed output.'));
              return;
            }
            resolve(blob);
          }, format, quality);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Unable to read image data.'));
      };
      img.src = url;
    });
  }

  function buildFileName(originalName, format){
    const base = originalName.replace(/\.[^/.]+$/, '');
    const extension = format === 'image/png' ? '.png' : '.jpg';
    return `${base}-compressed${extension}`;
  }

  function getSelectedFormat(){
    return formatSelect?.value || 'image/png';
  }

  function toggleQuality(){
    if (!qualityWrap) return;
    const show = getSelectedFormat() === 'image/jpeg';
    qualityWrap.style.display = show ? 'flex' : 'none';
  }

  function showStatus(message, type = 'warning'){
    if (!statusMessage) return;
    statusMessage.hidden = false;
    statusMessage.textContent = message;
    if (type === 'error') {
      statusMessage.style.color = 'var(--error)';
    } else if (type === 'success') {
      statusMessage.style.color = 'var(--success)';
    } else if (type === 'info') {
      statusMessage.style.color = 'var(--text-muted)';
    } else {
      statusMessage.style.color = 'var(--warning-text)';
    }
  }

  function clearStatus(){
    if (!statusMessage) return;
    statusMessage.hidden = true;
    statusMessage.textContent = '';
  }

  function formatBytes(bytes){
    if (!Number.isFinite(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let value = bytes;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function enhanceRipple(element){
    if (!element || rippleElements.has(element)) return;
    element.addEventListener('click', createRipple);
    rippleElements.add(element);
  }

  function createRipple(event){
    const button = event.currentTarget;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }
})();
