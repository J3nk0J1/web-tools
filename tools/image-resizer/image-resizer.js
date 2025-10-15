
// image-resizer.js — hover zoom (synchronous), no modal/slider; previews render immediately
(function() {
  document.getElementById('backToDashboard')?.addEventListener('click', () => { window.location.href='../../index.html'; });
  const panel1=document.getElementById('panel1'), panel2=document.getElementById('panel2'), panel3=document.getElementById('panel3'), panel4=document.getElementById('panel4');
  const chooseFileBtn=document.getElementById('chooseFileBtn'), fileInput=document.getElementById('fileInput'), dropzone=document.getElementById('dropzone');
  const origCanvas=document.getElementById('origCanvas'), originalMeta=document.getElementById('originalMeta'), outputMeta=document.getElementById('outputMeta');
  const outCanvas=document.getElementById('canvas'), downloadBtn=document.getElementById('downloadBtn'), resetBtn=document.getElementById('resetBtn');
  const targetWidth=document.getElementById('targetWidth'), targetHeight=document.getElementById('targetHeight'), keepAspect=document.getElementById('keepAspect');
  const alwaysDownscale=document.getElementById('alwaysDownscale');
  const fitMode=document.getElementById('fitMode'), formatSel=document.getElementById('format'), jpegQualityField=document.getElementById('jpegQualityField');
  const jpegQuality=document.getElementById('jpegQuality'), qualityLabel=document.getElementById('qualityLabel'), bgColorField=document.getElementById('bgColorField');
  const bgColor=document.getElementById('bgColor');
  const noSavingsNotice=document.getElementById('noSavingsNotice');
  const noSavingsText=noSavingsNotice?.querySelector('[data-role="notice-text"]');

  let img=new Image(); let imgURL=null; let baseW=0, baseH=0; const outBuffer=document.createElement('canvas'); const originalBuffer=document.createElement('canvas'); let originalBaseName='image'; const HOVER_ZOOM=1.6;
  let renderPending=false; let estimateToken=0; let syncingDimensions=false;
  let originalBytes=0;

  chooseFileBtn.addEventListener('click',()=>fileInput.click());
  const prevent=e=>{e.preventDefault(); e.stopPropagation();}; ['dragenter','dragover','dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt,prevent));
  dropzone.addEventListener('dragenter',()=>dropzone.classList.add('highlight')); dropzone.addEventListener('dragover',()=>dropzone.classList.add('highlight'));
  dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('highlight')); dropzone.addEventListener('drop',()=>dropzone.classList.remove('highlight'));
  dropzone.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0]; if(f) loadFile(f);}); dropzone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault(); fileInput.click();}});
  fileInput.addEventListener('change',e=>{const f=e.target.files?.[0]; if(f) loadFile(f);});

  function loadFile(file){
    if(!file.type.startsWith('image/')){alert('Please select an image file.'); return;}
    try{const name=file.name||'image'; const idx=name.lastIndexOf('.'); originalBaseName=(idx>0?name.substring(0,idx):name).trim();}catch(e){originalBaseName='image';}
    originalBytes=file.size||0;
    hideSavingsNotice();
    cleanupImage(); const url=URL.createObjectURL(file); img=new Image();
    img.onload=()=>{
      renderMeta(originalMeta,img.naturalWidth,img.naturalHeight,file.size);
      panel1.hidden=true;
      panel2.hidden=false;
      panel3.hidden=false;
      panel4.hidden=false;
      enforceDownscaleBounds('width');
      enforceDownscaleBounds('height');
      if(keepAspect.checked){ syncDimensions('width'); }
      scheduleRender();
    };
    img.onerror=()=>alert('Unable to load image.'); img.src=url; imgURL=url;
  }
  function cleanupImage(){ if(imgURL){ URL.revokeObjectURL(imgURL); imgURL=null; } }
  function renderMeta(el,w,h,sizeBytes){ const sizeKB=(sizeBytes/1024).toFixed(1); el.textContent=`Dimensions: ${w}×${h}px • Aspect: ${(w/h).toFixed(3)} • File size: ${sizeKB} KB`; }

  targetWidth.addEventListener('input',()=>{ enforceDownscaleBounds('width'); syncDimensions('width'); scheduleRender(); });
  targetHeight.addEventListener('input',()=>{ enforceDownscaleBounds('height'); syncDimensions('height'); scheduleRender(); });
  keepAspect.addEventListener('change',()=>{ if(keepAspect.checked){ syncDimensions('width'); } scheduleRender(); });
  alwaysDownscale?.addEventListener('change',()=>{ if(alwaysDownscale.checked){ enforceDownscaleBounds('width'); enforceDownscaleBounds('height'); if(keepAspect.checked){ syncDimensions('width'); } } scheduleRender(); });
  fitMode.addEventListener('change',scheduleRender);
  formatSel.addEventListener('change',()=>{ const isJPEG=formatSel.value==='image/jpeg'; jpegQualityField.style.display=isJPEG?'block':'none'; bgColorField.style.display=isJPEG?'block':'none'; scheduleRender(); });
  jpegQuality.addEventListener('input',()=>{ qualityLabel.textContent=jpegQuality.value; scheduleRender(); });
  bgColor.addEventListener('input',scheduleRender);
  document.querySelectorAll('[data-preset]').forEach(btn=>{ btn.addEventListener('click',()=>{ const [w,h]=btn.getAttribute('data-preset').split('x').map(Number); targetWidth.value=w; targetHeight.value=h; enforceDownscaleBounds('width'); enforceDownscaleBounds('height'); if(keepAspect.checked){ syncDimensions('width'); } scheduleRender(); }); });
  formatSel.dispatchEvent(new Event('change'));

  resetBtn.addEventListener('click',()=>{
    fileInput.value='';
    clearCanvas(origCanvas);
    clearCanvas(outCanvas);
    clearCanvas(outBuffer);
    clearCanvas(originalBuffer);
    cleanupImage();
    downloadBtn.disabled=true;
    estimateToken++;
    outputMeta.textContent='';
    originalBytes=0;
    hideSavingsNotice();
    originalMeta.textContent='';
    panel1.hidden=false;
    panel2.hidden=true;
    panel3.hidden=true;
    panel4.hidden=true;
    fitMode.value='contain';
    formatSel.value='image/png';
    keepAspect.checked=true;
    if(alwaysDownscale) alwaysDownscale.checked=true;
    targetWidth.value='1024';
    targetHeight.value='768';
    jpegQuality.value='80';
    qualityLabel.textContent='80';
    bgColor.value='#ffffff';
    formatSel.dispatchEvent(new Event('change'));
  });

  downloadBtn.addEventListener('click', async ()=>{
    const mime=formatSel.value||'image/png'; const quality=Math.min(100,Math.max(0,parseInt(jpegQuality.value||80,10)))/100;
    const blob=await canvasToBlob(outCanvas,mime,mime==='image/jpeg'?quality:undefined); const ext=mime==='image/jpeg'?'jpg':'png';
    const safeBase=originalBaseName.replace(/[^\w\-. ]+/g,'').replace(/\s+/g,' ');
    const outName=`${safeBase}-${outCanvas.width}x${outCanvas.height}.${ext}`; triggerDownload(blob,outName);
  });

  function scheduleRender(){ if(!img||!img.src) return; if(renderPending) return; renderPending=true; requestAnimationFrame(()=>{ renderPending=false; performRender(); }); }

  async function performRender(){ if(!img||!img.src) return; const widthVal=clamp(parseInt(targetWidth.value,10)||1,1,8000); const heightVal=clamp(parseInt(targetHeight.value,10)||1,1,8000);
    const {outW,outH}=computeOutputSize(
      img.naturalWidth,
      img.naturalHeight,
      widthVal,
      heightVal,
      fitMode.value,
      keepAspect.checked,
      !!alwaysDownscale?.checked
    );
    baseW=outW; baseH=outH;
    drawScaled(origCanvas,img,outW,outH);
    copyCanvas(origCanvas,originalBuffer);
    const isJPEG=formatSel.value==='image/jpeg';
    drawOutput(outCanvas,img,outW,outH,isJPEG?(bgColor.value||'#ffffff'):null);
    copyCanvas(outCanvas,outBuffer);
    outputMeta.textContent=`Output: ${outW}×${outH}px • Aspect: ${(outW/outH).toFixed(3)} • Approx size: calculating…`;
    hideSavingsNotice();
    downloadBtn.disabled=false;
    await updateEstimate(isJPEG);
  }

  function computeOutputSize(sw,sh,tw,th,mode,keep,forceDownscale){
    if(mode==='exact'&&!keep){
      let outW=tw;
      let outH=th;
      if(forceDownscale){
        outW=Math.min(outW,sw);
        outH=Math.min(outH,sh);
      }
      return {outW:Math.max(1,Math.round(outW)), outH:Math.max(1,Math.round(outH))};
    }
    const scaleW=tw/sw;
    const scaleH=th/sh;
    let scale=mode==='contain'?Math.min(scaleW,scaleH):Math.max(scaleW,scaleH);
    if(forceDownscale){
      scale=Math.min(scale,1);
    }
    let outW=Math.max(1,Math.round(sw*scale));
    let outH=Math.max(1,Math.round(sh*scale));
    if(forceDownscale){
      outW=Math.min(outW,sw);
      outH=Math.min(outH,sh);
    }
    return {outW,outH};
  }
  function drawScaled(cv,image,outW,outH){ cv.width=outW; cv.height=outH; const ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; ctx.clearRect(0,0,outW,outH); ctx.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,0,0,outW,outH); }
  function drawOutput(cv,image,outW,outH,bgFill=null){ cv.width=outW; cv.height=outH; const ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; if(bgFill){ ctx.fillStyle=bgFill; ctx.fillRect(0,0,outW,outH);} else { ctx.clearRect(0,0,outW,outH);} let tmp=document.createElement('canvas'); tmp.width=image.naturalWidth; tmp.height=image.naturalHeight; let tctx=tmp.getContext('2d'); tctx.drawImage(image,0,0); const scaleFactor=Math.min(outW/image.naturalWidth,outH/image.naturalHeight); if(scaleFactor<0.5){ let w=tmp.width,h=tmp.height; while(w*0.5>outW && h*0.5>outH){ const half=document.createElement('canvas'); half.width=Math.max(1,Math.round(w*0.5)); half.height=Math.max(1,Math.round(h*0.5)); const hctx=half.getContext('2d'); hctx.imageSmoothingEnabled=true; hctx.imageSmoothingQuality='high'; hctx.drawImage(tmp,0,0,w,h,0,0,half.width,half.height); tmp=half; tctx=hctx; w=half.width; h=half.height; } } ctx.drawImage(tmp,0,0,tmp.width,tmp.height,0,0,outW,outH); }

  function attachHoverZoom(canvasEl){ canvasEl.addEventListener('mousemove',e=>{ if(!baseW||!baseH) return; const rect=canvasEl.getBoundingClientRect(); const xRatio=(e.clientX-rect.left)/rect.width; const yRatio=(e.clientY-rect.top)/rect.height; const cx=Math.round(baseW*clamp(xRatio,0,1)); const cy=Math.round(baseH*clamp(yRatio,0,1)); drawZoomAt(cx,cy); }); canvasEl.addEventListener('mouseleave',()=>{ if(baseW&&baseH) restoreFull(); }); }
  function drawZoomAt(cx,cy){ if(!baseW||!baseH) return; const sw=Math.max(1,Math.round(baseW/HOVER_ZOOM)); const sh=Math.max(1,Math.round(baseH/HOVER_ZOOM)); const sx=Math.max(0,Math.min(baseW-sw,Math.round(cx-sw/2))); const sy=Math.max(0,Math.min(baseH-sh,Math.round(cy-sh/2))); const octx=origCanvas.getContext('2d'); octx.imageSmoothingEnabled=true; octx.imageSmoothingQuality='high'; octx.clearRect(0,0,baseW,baseH); octx.drawImage(originalBuffer,sx,sy,sw,sh,0,0,baseW,baseH); const ctx=outCanvas.getContext('2d'); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; ctx.clearRect(0,0,baseW,baseH); ctx.drawImage(outBuffer,sx,sy,sw,sh,0,0,baseW,baseH); }
  function restoreFull(){ if(!baseW||!baseH) return; const octx=origCanvas.getContext('2d'); octx.clearRect(0,0,baseW,baseH); octx.drawImage(originalBuffer,0,0,baseW,baseH,0,0,baseW,baseH); const ctx=outCanvas.getContext('2d'); ctx.clearRect(0,0,baseW,baseH); ctx.drawImage(outBuffer,0,0,baseW,baseH,0,0,baseW,baseH); }

  attachHoverZoom(origCanvas); attachHoverZoom(outCanvas);
  async function updateEstimate(isJPEG){
    const token=++estimateToken;
    const blob=await canvasToBlob(outCanvas,isJPEG?'image/jpeg':'image/png', isJPEG?(parseInt(jpegQuality.value,10)/100):undefined);
    if(token!==estimateToken) return;
    if(!baseW||!baseH) return;
    const approxKB=formatKB(blob.size);
    let details=`Output: ${baseW}×${baseH}px • Aspect: ${(baseW/baseH).toFixed(3)} • Approx size: ${approxKB} KB`;
    if(originalBytes){
      const diff=blob.size-originalBytes;
      if(diff<0){
        const pct=Math.abs(diff)/originalBytes*100;
        details+=` • Savings: ${formatKB(Math.abs(diff))} KB (${pct.toFixed(1)}% smaller)`;
      } else if(diff>0){
        const pct=originalBytes?diff/originalBytes*100:0;
        details+=` • +${formatKB(diff)} KB (${pct.toFixed(1)}% larger)`;
      } else {
        details+=' • No change in file size';
      }
    }
    outputMeta.textContent=details;
    updateSavingsNotice(blob.size);
  }
  function copyCanvas(source,target){ target.width=source.width; target.height=source.height; const tctx=target.getContext('2d'); tctx.clearRect(0,0,target.width,target.height); tctx.drawImage(source,0,0); }
  function syncDimensions(source){ if(!keepAspect.checked||!img||!img.naturalWidth||!img.naturalHeight) return; if(syncingDimensions) return; syncingDimensions=true; const ratio=img.naturalWidth/img.naturalHeight; if(source==='width'){ const w=clamp(parseInt(targetWidth.value,10)||img.naturalWidth,1,8000); const newHeight=Math.max(1,Math.round(w/ratio)); targetHeight.value=newHeight; } else if(source==='height'){ const h=clamp(parseInt(targetHeight.value,10)||img.naturalHeight,1,8000); const newWidth=Math.max(1,Math.round(h*ratio)); targetWidth.value=newWidth; } syncingDimensions=false; }
  function enforceDownscaleBounds(source){ if(!alwaysDownscale?.checked||!img||!img.naturalWidth||!img.naturalHeight) return; if(source==='width'){ const maxW=img.naturalWidth; const currentW=parseInt(targetWidth.value,10); if(currentW>maxW){ targetWidth.value=maxW; } } else if(source==='height'){ const maxH=img.naturalHeight; const currentH=parseInt(targetHeight.value,10); if(currentH>maxH){ targetHeight.value=maxH; } } }
  function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
  function clearCanvas(cv){ const ctx=cv.getContext('2d'); ctx.clearRect(0,0,cv.width||0,cv.height||0); }
  function canvasToBlob(c,type='image/png',quality){ return new Promise(resolve=>{ if(c.toBlob){ c.toBlob(b=>resolve(b),type,quality);} else { const dataURL=c.toDataURL(type,quality); resolve(dataURLToBlob(dataURL)); } }); }
  function dataURLToBlob(dataURL){ const parts=dataURL.split(','); const byteString=atob(parts[1]); const mimeString=parts[0].match(/:(.*?);/)[1]; const ia=new Uint8Array(byteString.length); for(let i=0;i<byteString.length;i++) ia[i]=byteString.charCodeAt(i); return new Blob([ia],{type:mimeString}); }
  function triggerDownload(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},500); }
  function updateSavingsNotice(estimateBytes){ if(!noSavingsNotice||!noSavingsText){ return; } if(!originalBytes||estimateBytes<originalBytes){ hideSavingsNotice(); return; } const overBytes=estimateBytes-originalBytes; const pct=originalBytes?overBytes/originalBytes*100:0; noSavingsText.textContent=`No file size reduction: estimated output ${formatKB(estimateBytes)} KB vs original ${formatKB(originalBytes)} KB (+${pct.toFixed(1)}%). Try reducing the target dimensions or export as JPEG for stronger compression.`; noSavingsNotice.setAttribute('aria-hidden','false'); }
  function hideSavingsNotice(){ if(!noSavingsNotice) return; noSavingsNotice.setAttribute('aria-hidden','true'); }
  function formatKB(bytes){ return (bytes/1024).toFixed(1); }
})();
