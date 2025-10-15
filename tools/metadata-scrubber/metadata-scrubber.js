(function(){
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const chooseFileBtn = document.getElementById('chooseFileBtn');
  const status = document.getElementById('status');
  const originalPreview = document.getElementById('originalPreview');
  const scrubbedPreview = document.getElementById('scrubbedPreview');
  const fileNameChip = document.getElementById('fileNameChip');
  const fileSizeChip = document.getElementById('fileSizeChip');
  const fileTypeChip = document.getElementById('fileTypeChip');
  const dimensionsChip = document.getElementById('dimensionsChip');
  const metadataList = document.getElementById('metadataList');
  const removedList = document.getElementById('removedList');
  const noMetadata = document.getElementById('noMetadata');
  const nothingRemoved = document.getElementById('nothingRemoved');
  const panelOriginal = document.getElementById('panelOriginal');
  const panelScrubbed = document.getElementById('panelScrubbed');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const scrubbedSizeChip = document.getElementById('scrubbedSizeChip');
  const scrubbedTypeChip = document.getElementById('scrubbedTypeChip');
  const exportMetadataBtn = document.getElementById('exportMetadataBtn');
  const safeHint = document.getElementById('safeHint');

  const safeSelections = new Map();
  let metadataEntries = [];
  let removedEntries = [];
  let metadataId = 0;
  let originalFileName = '';
  const WORK_YIELD_INTERVAL = 250;
  let workCounter = 0;
  const utf8 = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  let currentOriginalUrl = null;
  let currentScrubbedUrl = null;

  document.getElementById('backToDashboard')?.addEventListener('click', () => {
    window.location.href = '../../index.html';
  });

  chooseFileBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      handleFile(file);
    }
  });

  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('highlight');
  });

  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('highlight'));
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('highlight');
    const file = event.dataTransfer?.files && event.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  });

  dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });

  resetBtn?.addEventListener('click', () => {
    fileInput.value = '';
    cleanup();
    panelOriginal.hidden = true;
    panelScrubbed.hidden = true;
    hideStatus();
  });

  function cleanup(){
    if (currentOriginalUrl) {
      URL.revokeObjectURL(currentOriginalUrl);
      currentOriginalUrl = null;
    }
    if (currentScrubbedUrl) {
      URL.revokeObjectURL(currentScrubbedUrl);
      currentScrubbedUrl = null;
    }
    if (originalPreview) originalPreview.removeAttribute('src');
    if (scrubbedPreview) scrubbedPreview.removeAttribute('src');
    if (downloadBtn) {
      downloadBtn.removeAttribute('href');
      downloadBtn.removeAttribute('download');
    }
    metadataList.innerHTML = '';
    removedList.innerHTML = '';
    noMetadata.hidden = true;
    nothingRemoved.hidden = true;
    safeHint && (safeHint.hidden = true);
    safeSelections.clear();
    metadataEntries = [];
    removedEntries = [];
    metadataId = 0;
    updateSafeExportState();
  }

  function showStatus(message, type = 'info'){
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
    status.classList.remove('status--error', 'status--success', 'status--info', 'status--warning');
    const className = type === 'error' ? 'status--error' : type === 'success' ? 'status--success' : type === 'warning' ? 'status--warning' : 'status--info';
    status.classList.add(className);
  }

  function hideStatus(){
    if (!status) return;
    status.hidden = true;
    status.textContent = '';
    status.classList.remove('status--error', 'status--success', 'status--info', 'status--warning');
  }

  async function handleFile(file){
    cleanup();
    if (!file.type.startsWith('image/')) {
      showStatus('Only image files are supported.', 'error');
      return;
    }
    originalFileName = file.name || 'image';
    try {
      showStatus('Reading file…', 'info');
      currentOriginalUrl = URL.createObjectURL(file);
      originalPreview.src = currentOriginalUrl;

      fileNameChip.textContent = `Name: ${file.name}`;
      fileSizeChip.textContent = `Size: ${formatBytes(file.size)}`;
      fileTypeChip.textContent = `Type: ${file.type || 'unknown'}`;

      const [buffer, dims] = await Promise.all([
        file.arrayBuffer(),
        loadImageDimensions(file)
      ]);
      dimensionsChip.textContent = `Dimensions: ${dims.width} × ${dims.height}`;

      workCounter = 0;
      showStatus('Parsing metadata…', 'info');
      const metadata = await extractMetadata(buffer, file.type);
      metadataEntries = metadata.entries;
      removedEntries = metadata.removed;
      renderMetadata(metadata);
      panelOriginal.hidden = false;
      panelScrubbed.hidden = true;

      showStatus('Generating scrubbed copy…', 'info');
      const { url, type, size } = await generateScrubbedCopy(file);
      currentScrubbedUrl = url;
      scrubbedPreview.src = url;
      scrubbedSizeChip.textContent = `Size: ${formatBytes(size)}`;
      scrubbedTypeChip.textContent = `Type: ${type}`;
      downloadBtn.href = url;
      downloadBtn.download = buildDownloadName(file.name, type);
      panelScrubbed.hidden = false;
      showStatus('Scrub complete. Review results before downloading.', 'success');
      updateSafeExportState();
    } catch (error) {
      console.error(error);
      showStatus(error instanceof Error ? error.message : 'Something went wrong while processing the image.', 'error');
    }
  }

  function loadImageDimensions(file){
    return new Promise((resolve, reject) => {
      const img = new Image();
      const tempUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(tempUrl);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
        reject(new Error('Unable to read image dimensions.'));
      };
      img.src = tempUrl;
    });
  }

  function generateScrubbedCopy(file){
    return new Promise((resolve, reject) => {
      const img = new Image();
      const tempUrl = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const preferredType = pickOutputType(file.type);
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to create scrubbed copy.'));
              return;
            }
            const url = URL.createObjectURL(blob);
            resolve({ url, blob, type: blob.type || preferredType, size: blob.size });
          }, preferredType, preferredType === 'image/jpeg' ? 0.92 : undefined);
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(tempUrl);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
        reject(new Error('Unable to render image to canvas.'));
      };
      img.src = tempUrl;
    }).then((result) => {
      return result;
    });
  }

  function pickOutputType(type){
    if (type === 'image/png' || type === 'image/webp' || type === 'image/jpeg') {
      return type;
    }
    return 'image/png';
  }

  function createEntry(label, value){
    return { id: `meta-${metadataId++}`, label, value };
  }

  function sanitizeBaseName(name){
    return (name || '').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9 _.-]+/g, '').trim().replace(/\s+/g, '-');
  }

  async function maybeYield(){
    workCounter++;
    if (workCounter % WORK_YIELD_INTERVAL === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  function buildDownloadName(originalName, mime){
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : 'png';
    const base = sanitizeBaseName(originalName);
    return `${base || 'scrubbed-image'}-scrubbed.${ext}`;
  }

  function formatBytes(bytes){
    if (!Number.isFinite(bytes)) return '0 B';
    const units = ['B','KB','MB','GB'];
    let idx = 0;
    let size = bytes;
    while (size >= 1024 && idx < units.length - 1) {
      size /= 1024;
      idx++;
    }
    return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function updateSafeExportState(){
    if (!exportMetadataBtn) return;
    const hasSelections = safeSelections.size > 0;
    exportMetadataBtn.disabled = !hasSelections;
    exportMetadataBtn.setAttribute('aria-disabled', hasSelections ? 'false' : 'true');
  }

  exportMetadataBtn?.addEventListener('click', () => {
    if (!safeSelections.size) return;
    const safeFields = Array.from(safeSelections.values());
    const payload = {
      sourceFile: originalFileName,
      generatedAt: new Date().toISOString(),
      safeFields
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeBaseName(originalFileName) || 'image'}-metadata.json`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 400);
  });

  function renderMetadata(metadata){
    metadataList.innerHTML = '';
    removedList.innerHTML = '';
    safeSelections.clear();
    updateSafeExportState();
    const entries = metadata.entries;
    const removed = metadata.removed;
    if (!entries.length) {
      noMetadata.hidden = false;
      safeHint && (safeHint.hidden = true);
    } else {
      noMetadata.hidden = true;
      safeHint && (safeHint.hidden = false);
      for (const item of entries) {
        const li = document.createElement('li');
        const labelEl = document.createElement('label');
        labelEl.className = 'meta-list__label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = item.id;
        checkbox.dataset.entryId = item.id;
        const labelText = document.createElement('span');
        labelText.textContent = item.label;
        labelEl.append(checkbox, labelText);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            safeSelections.set(item.id, { label: item.label, value: item.value });
          } else {
            safeSelections.delete(item.id);
          }
          updateSafeExportState();
        });
        li.appendChild(labelEl);
        const value = document.createElement('span');
        value.textContent = item.value;
        li.appendChild(value);
        metadataList.appendChild(li);
      }
    }

    if (!removed.length) {
      nothingRemoved.hidden = false;
    } else {
      nothingRemoved.hidden = true;
      for (const item of removed) {
        const li = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = item.label;
        li.appendChild(title);
        const value = document.createElement('span');
        value.textContent = item.value;
        li.appendChild(value);
        removedList.appendChild(li);
      }
    }
  }

  async function extractMetadata(buffer, mime){
    const entries = [];
    const removed = [];
    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      const data = await parseExif(buffer);
      entries.push(...data.entries);
      removed.push(...data.removed);
    } else if (mime === 'image/png') {
      const data = await parsePngChunks(buffer);
      entries.push(...data.entries);
      removed.push(...data.removed);
    } else {
      entries.push(createEntry('Notice', 'No parsers available for this file type. A clean re-encode will still remove metadata.'));
      removed.push({ label: 'All metadata', value: 'Re-encoding strips embedded data for unsupported formats.' });
    }
    return { entries, removed };
  }

  async function parseExif(buffer){
    const entries = [];
    const removed = [];
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) {
      return { entries, removed };
    }
    let offset = 2;
    const length = view.byteLength;
    while (offset < length) {
      await maybeYield();
      if (view.getUint8(offset) !== 0xFF) break;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2);
      if (marker === 0xE1) {
        const markerStart = offset + 4;
        if (readString(view, markerStart, 4) === 'Exif') {
          const parsed = await parseTiff(view, markerStart + 6);
          entries.push(...parsed.entries);
          removed.push(...parsed.removed);
          break;
        }
      }
      if (marker === 0xDA) break;
      offset += 2 + size;
    }
    return { entries, removed };
  }

  async function parseTiff(view, start){
    const entries = [];
    const removed = [];
    const byteOrder = view.getUint16(start);
    const little = byteOrder === 0x4949;
    if (!little && byteOrder !== 0x4D4D) {
      return { entries, removed };
    }
    const getUint16 = (off) => view.getUint16(off, little);
    const getUint32 = (off) => view.getUint32(off, little);

    const tagMap = {
      0x010F: 'Camera Make',
      0x0110: 'Camera Model',
      0x0132: 'Last Modified',
      0x9003: 'Date Taken',
      0x9004: 'Digitized',
      0x829A: 'Exposure Time',
      0x829D: 'F Number',
      0x8827: 'ISO',
      0x920A: 'Focal Length',
      0x9209: 'Flash',
      0xA002: 'Pixel Width',
      0xA003: 'Pixel Height',
      0xA405: '35mm Equivalent Focal Length'
    };

    async function readIFD(ifdOffset){
      if (ifdOffset <= 0) return;
      const entriesCount = getUint16(ifdOffset);
      for (let i = 0; i < entriesCount; i++) {
        await maybeYield();
        const entryOffset = ifdOffset + 2 + i * 12;
        const tag = getUint16(entryOffset);
        const type = getUint16(entryOffset + 2);
        const count = getUint32(entryOffset + 4);
        const valueOffset = entryOffset + 8;
        const value = readExifValue(view, start, type, count, valueOffset, little);

        if (tag === 0x8769 && typeof value === 'number') {
          await readIFD(start + value);
          continue;
        }
        if (tag === 0x8825 && typeof value === 'number') {
          const gps = await parseGpsIFD(start + value, start, little, view);
          entries.push(...gps.entries);
          removed.push(...gps.removed);
          continue;
        }
        if (tagMap[tag]) {
          entries.push(createEntry(tagMap[tag], formatExifValue(tag, value)));
          removed.push({ label: tagMap[tag], value: 'Removed' });
        }
      }
      const nextOffset = getUint32(ifdOffset + 2 + entriesCount * 12);
      if (nextOffset) {
        await readIFD(start + nextOffset);
      }
    }

    await readIFD(start + getUint32(start + 4));
    return { entries, removed };
  }

  async function parseGpsIFD(ifdOffset, start, little, view){
    const entries = [];
    const removed = [];
    const getUint16 = (off) => view.getUint16(off, little);
    const getUint32 = (off) => view.getUint32(off, little);
    const count = getUint16(ifdOffset);
    const data = {};
    for (let i = 0; i < count; i++) {
      await maybeYield();
      const entryOffset = ifdOffset + 2 + i * 12;
      const tag = getUint16(entryOffset);
      const type = getUint16(entryOffset + 2);
      const valCount = getUint32(entryOffset + 4);
      const valueOffset = entryOffset + 8;
      data[tag] = readExifValue(view, start, type, valCount, valueOffset, little);
    }
    if (data[1] && data[2]) {
      entries.push(createEntry('GPS Latitude', formatGps(data[2], data[1])));
      removed.push({ label: 'GPS Latitude', value: 'Removed' });
    }
    if (data[3] && data[4]) {
      entries.push(createEntry('GPS Longitude', formatGps(data[4], data[3])));
      removed.push({ label: 'GPS Longitude', value: 'Removed' });
    }
    if (data[6]) {
      entries.push(createEntry('GPS Altitude', `${Array.isArray(data[6]) ? data[6][0] : data[6]} m`));
      removed.push({ label: 'GPS Altitude', value: 'Removed' });
    }
    return { entries, removed };
  }

  function readExifValue(view, start, type, count, valueOffset, little){
    const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1;
    const totalSize = typeSize * count;
    let dataOffset;
    if (totalSize <= 4) {
      dataOffset = valueOffset;
    } else {
      const relative = view.getUint32(valueOffset, little);
      dataOffset = start + relative;
    }
    if (type === 2) {
      let str = '';
      for (let i = 0; i < count; i++) {
        const char = view.getUint8(dataOffset + i);
        if (char === 0) break;
        str += String.fromCharCode(char);
      }
      return str.trim();
    }
    if (type === 3) {
      if (count === 1) return view.getUint16(dataOffset, little);
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push(view.getUint16(dataOffset + i * 2, little));
      }
      return arr;
    }
    if (type === 4) {
      if (count === 1) return view.getUint32(dataOffset, little);
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push(view.getUint32(dataOffset + i * 4, little));
      }
      return arr;
    }
    if (type === 5 || type === 10) {
      const arr = [];
      for (let i = 0; i < count; i++) {
        const numerator = type === 5 ? view.getUint32(dataOffset + i * 8, little) : view.getInt32(dataOffset + i * 8, little);
        const denominator = type === 5 ? view.getUint32(dataOffset + i * 8 + 4, little) : view.getInt32(dataOffset + i * 8 + 4, little);
        if (denominator === 0) {
          arr.push(numerator);
        } else {
          arr.push(numerator / denominator);
        }
      }
      return count === 1 ? arr[0] : arr;
    }
    if (type === 7 || type === 1) {
      if (count === 1) return view.getUint8(dataOffset);
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push(view.getUint8(dataOffset + i));
      }
      return arr;
    }
    if (type === 9) {
      if (count === 1) return view.getInt32(dataOffset, little);
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push(view.getInt32(dataOffset + i * 4, little));
      }
      return arr;
    }
    return null;
  }

  function formatExifValue(tag, value){
    if (Array.isArray(value)) {
      return value.map((v) => typeof v === 'number' ? roundNumber(v) : String(v)).join(', ');
    }
    if (typeof value === 'number') {
      return roundNumber(value);
    }
    return value || '—';
  }

  function roundNumber(num){
    if (!Number.isFinite(num)) return String(num);
    if (Math.abs(num) >= 10) return num.toFixed(0);
    if (Math.abs(num) >= 1) return num.toFixed(2);
    return num.toFixed(4);
  }

  function formatGps(value, ref){
    if (!Array.isArray(value)) return `${value}° ${ref || ''}`.trim();
    const [deg = 0, min = 0, sec = 0] = value;
    let decimal = deg + min / 60 + sec / 3600;
    if (ref === 'S' || ref === 'W') {
      decimal *= -1;
    }
    return `${decimal.toFixed(6)}° (${deg.toFixed(0)}° ${min.toFixed(0)}′ ${sec.toFixed(2)}″ ${ref || ''})`;
  }

  async function parsePngChunks(buffer){
    const entries = [];
    const removed = [];
    const view = new DataView(buffer);
    if (view.byteLength < 8) return { entries, removed };
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < signature.length; i++) {
      if (view.getUint8(i) !== signature[i]) {
        return { entries, removed };
      }
    }
    let offset = 8;
    while (offset + 8 < view.byteLength) {
      await maybeYield();
      const length = view.getUint32(offset);
      const type = readString(view, offset + 4, 4);
      const dataStart = offset + 8;
      if (type === 'tEXt') {
        const chunk = new Uint8Array(buffer, dataStart, length);
        const separator = chunk.indexOf(0);
        if (separator > 0) {
          const decoder = utf8 || new TextDecoder();
          const key = decoder.decode(chunk.slice(0, separator));
          const value = decoder.decode(chunk.slice(separator + 1));
          entries.push(createEntry(key, value));
          removed.push({ label: key, value: 'Removed' });
        }
      } else if (type === 'iTXt') {
        const chunk = new Uint8Array(buffer, dataStart, length);
        const separator = chunk.indexOf(0);
        if (separator > 0) {
          const decoder = utf8 || new TextDecoder();
          const key = decoder.decode(chunk.slice(0, separator));
          let cursor = separator + 1;
          const compressionFlag = chunk[cursor] || 0;
          cursor += 2; // flag + compression method
          while (cursor < chunk.length && chunk[cursor] !== 0) cursor++;
          if (cursor < chunk.length) cursor++; // skip null terminator
          while (cursor < chunk.length && chunk[cursor] !== 0) cursor++;
          if (cursor < chunk.length) cursor++; // skip translated keyword terminator
          const textBytes = chunk.slice(cursor);
          if (compressionFlag === 0) {
            const value = decoder.decode(textBytes);
            entries.push(createEntry(key, value));
            removed.push({ label: key, value: 'Removed' });
          } else {
            entries.push(createEntry(key, 'Compressed metadata (not previewed)'));
            removed.push({ label: key, value: 'Removed' });
          }
        }
      } else if (type === 'zTXt') {
        const chunk = new Uint8Array(buffer, dataStart, length);
        const separator = chunk.indexOf(0);
        if (separator > 0) {
          const decoder = utf8 || new TextDecoder();
          const key = decoder.decode(chunk.slice(0, separator));
          entries.push(createEntry(key, 'Compressed text chunk (not previewed)'));
          removed.push({ label: key, value: 'Removed' });
        }
      }
      offset += 12 + length;
      if (type === 'IEND') break;
    }
    return { entries, removed };
  }

  function readString(view, start, length){
    let result = '';
    for (let i = 0; i < length; i++) {
      const code = view.getUint8(start + i);
      if (code === 0) break;
      result += String.fromCharCode(code);
    }
    return result;
  }
})();
