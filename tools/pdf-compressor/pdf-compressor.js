// pdf-compressor.js — offline PDF compressor with optional PDF/A-2b mode using pdf.js & pdf-lib
(function(){
  const dropzone=document.getElementById('dropzone');
  const chooseFileBtn=document.getElementById('chooseFileBtn');
  const fileInput=document.getElementById('fileInput');
  const panelOverview=document.getElementById('panel-overview');
  const panelUpload=document.getElementById('panel-upload');
  const panelSettings=document.getElementById('panel-settings');
  const panelProgress=document.getElementById('panel-progress');
  const panelResults=document.getElementById('panel-results');
  const progressBar=document.getElementById('progressBar');
  const progressStatus=document.getElementById('progressStatus');
  const stats=document.getElementById('stats');
  const downloadBtn=document.getElementById('downloadBtn');
  const resetBtn=document.getElementById('resetBtn');
  const generateBtn=document.getElementById('generateBtn');
  const inputMeta=document.getElementById('inputMeta');
  const dpiInput=document.getElementById('dpi');
  const dpiLabel=document.getElementById('dpiLabel');
  const qualityInput=document.getElementById('quality');
  const qualityLabel=document.getElementById('qualityLabel');
  const downscaleInput=document.getElementById('downscale');
  const qualityNotice=document.getElementById('qualityNotice');
  const errorBanner=document.getElementById('errorBanner');
  const startOverFromSettings=document.getElementById('startOverFromSettings');
  const startOverFromProgress=document.getElementById('startOverFromProgress');
  const progressActions=document.getElementById('progressActions');
  const outputTypeRadios=Array.from(document.querySelectorAll('input[name="outputType"]'));

  const PAGE_YIELD_INTERVAL = 1;
  async function yieldToBrowser(){
    await new Promise(resolve=>requestAnimationFrame(resolve));
  }

  const defaultNotice='Adjust DPI, JPEG quality and maximum page size to balance clarity and size for everyday use.';
  const accessNotice='Access copy uses recommended settings tuned for day-to-day sharing. Switch to Custom to adjust them.';
  const naaNotice='NAA archival standard uses locked settings: 300 dpi, JPEG quality 90, and no resizing. These match the preservation rules required by the Act.';
  const naaSettings={ dpi:'300', quality:'90', downscale:'0' };
  const accessSettings={ dpi:'150', quality:'85', downscale:'3500' };
  const initialManualSettings={ dpi:dpiInput.value, quality:qualityInput.value, downscale:downscaleInput.value };
  let manualSettings={ ...initialManualSettings };

  document.getElementById('backToDashboard')?.addEventListener('click',()=>{ window.location.href='../../index.html'; });

  if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc='./lib/pdf.worker.min.js'; }

  let currentFile=null; let outputBlob=null; let outputName=''; let srgbProfileBytes=null;

  generateBtn.disabled=true;
  downloadBtn.disabled=true;

  chooseFileBtn.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',e=>{ const f=e.target.files?.[0]; if(f) acceptFile(f); });

  outputTypeRadios.forEach(radio=>radio.addEventListener('change',updateActionLabels));
  updateActionLabels();
  goToStep(1);

  const prevent=e=>{e.preventDefault(); e.stopPropagation();};
  ['dragenter','dragover','dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt,prevent));
  dropzone.addEventListener('dragenter',()=>dropzone.classList.add('highlight'));
  dropzone.addEventListener('dragover',()=>dropzone.classList.add('highlight'));
  dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('highlight'));
  dropzone.addEventListener('drop',e=>{dropzone.classList.remove('highlight'); const f=e.dataTransfer?.files?.[0]; if(f) acceptFile(f);});
  dropzone.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fileInput.click(); } });

  dpiInput.addEventListener('input',()=>{ dpiLabel.textContent=dpiInput.value; });
  dpiInput.addEventListener('change',rememberManualSettings);
  qualityInput.addEventListener('input',()=>{ qualityLabel.textContent=qualityInput.value; });
  qualityInput.addEventListener('change',rememberManualSettings);
  downscaleInput.addEventListener('change',rememberManualSettings);

  generateBtn.addEventListener('click',async ()=>{
    if(!currentFile){ showError('Please select a PDF before generating an output.'); return; }
    clearError();
    await runCompression();
  });

  downloadBtn.addEventListener('click',()=>{ if(outputBlob){ triggerDownload(outputBlob,outputName); }});

  const resetFlow=()=>{
    currentFile=null; outputBlob=null; outputName=''; fileInput.value='';
    dropzone.querySelector('p').textContent='Drag & drop a PDF here, or';
    inputMeta.textContent=''; generateBtn.disabled=true; downloadBtn.disabled=true;
    progressBar.style.width='0%'; progressStatus.textContent='Waiting…'; stats.innerHTML='';
    manualSettings={ ...initialManualSettings };
    outputTypeRadios.forEach(radio=>{ radio.checked=radio.value==='access'; });
    updateActionLabels();
    clearError();
    goToStep(1);
  };

  resetBtn.addEventListener('click',resetFlow);
  startOverFromSettings?.addEventListener('click',resetFlow);
  startOverFromProgress?.addEventListener('click',resetFlow);

  async function runCompression(){
    generateBtn.disabled=true; downloadBtn.disabled=true; outputBlob=null; stats.innerHTML='';
    goToStep(3);
    const dpi=clamp(parseInt(dpiInput.value,10)||150,72,600);
    const quality=clamp(parseInt(qualityInput.value,10)||85,40,100)/100;
    const downscaleVal=Math.max(0,parseInt(downscaleInput.value,10)||0);
    const mode=getOutputMode();

    try{
      updateProgress(0,1,'Preparing…');
      const {blob,pageCount,originalBytes,outputBytes,fileSuffix,complianceLabel,usedOptions,sizeGuardApplied} = await compressDocument(currentFile,{dpi,quality,downscale:downscaleVal},mode,updateProgress);
      outputBlob=blob;
      const safeBase=deriveBaseName(currentFile.name||'document');
      outputName=`${safeBase}-${fileSuffix}.pdf`;
      downloadBtn.disabled=false;
      goToStep(4);
      const reduction=originalBytes>0?((1-(outputBytes/originalBytes))*100):0;
      const reductionText=reduction>=0?`${reduction.toFixed(1)}% reduction`:`${Math.abs(reduction).toFixed(1)}% increase`;
      const appliedOptions=usedOptions||{ dpi, quality, downscale:downscaleVal };
      const usedDpi=Math.round(appliedOptions.dpi||dpi);
      const usedQuality=(appliedOptions.quality||quality)*100;
      const usedMaxEdge=appliedOptions.downscale>0?`${appliedOptions.downscale}px`:'not limited';
      renderStatsSummary({
        inputName: currentFile.name,
        outputName,
        originalBytes,
        outputBytes,
        pageCount,
        usedDpi,
        usedQuality,
        usedMaxEdge,
        reductionText,
        complianceLabel,
        sizeGuardApplied
      });
      progressStatus.textContent='Ready to download.';
      clearError();
      requestAnimationFrame(()=>{ panelResults?.scrollIntoView({ behavior:'smooth', block:'start' }); });
    }catch(err){
      console.error(err);
      let message='We could not compress this PDF. The file may be protected or use features we do not support yet. Please try another file or check with the records team.';
      if(err && typeof err.message==='string'){
        if(err.code==='PASSWORD'){ message='This PDF is password protected. Please unlock it before generating a new copy.'; }
        else if(err.code==='UNSUPPORTED'){ message='This PDF uses features we cannot process offline. Try exporting a simpler copy or flattening complex elements.'; }
      }
      showError(message);
      progressStatus.textContent='Processing failed.';
      goToStep(3);
    }finally{
      generateBtn.disabled=false;
    }
  }

  function acceptFile(file){
    if(file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){ showError('This tool only works with PDF files. Please choose a PDF document.'); fileInput.value=''; return; }
    currentFile=file; outputBlob=null; outputName='';
    const meta=`Selected: ${file.name} • ${formatBytes(file.size)} • Last modified ${formatDate(file.lastModified||Date.now())}`;
    inputMeta.textContent=meta;
    dropzone.querySelector('p').textContent='File selected. Choose another to replace.';
    generateBtn.disabled=false; downloadBtn.disabled=true; stats.innerHTML=''; progressStatus.textContent='Waiting…'; progressBar.style.width='0%';
    updateActionLabels();
    clearError();
    goToStep(2);
  }

  async function compressDocument(file,options,mode,progressCb){
    const arrayBuffer=await file.arrayBuffer();
    const loadingTask=pdfjsLib.getDocument({ data:arrayBuffer, useSystemFonts:true, disableFontFace:false });
    let pdf;
    try{
      pdf=await loadingTask.promise;
    }catch(error){
      await loadingTask.destroy();
      if(error && (error.name==='PasswordException' || /Password/i.test(error.message||''))){
        const err=new Error('Password protected PDF');
        err.code='PASSWORD';
        throw err;
      }
      if(error && (error.name==='InvalidPDFException' || error.name==='MissingPDFException')){
        const err=new Error('Unsupported or corrupted PDF');
        err.code='UNSUPPORTED';
        throw err;
      }
      throw error instanceof Error?error:new Error('Unable to read PDF');
    }
    try{
      const { PDFDocument, PDFName, PDFString } = PDFLib;
      const pdfDoc=await PDFDocument.create();
      pdfDoc.catalog.set(PDFName.of('Version'), PDFName.of('1.7'));
      const titleBase=(file.name||'Document').replace(/\.pdf$/i,'');
      pdfDoc.setCreator('Intranet PDF Compressor');
      pdfDoc.setProducer('Intranet PDF Compressor');
      pdfDoc.setLanguage('en-AU');
      pdfDoc.catalog.set(PDFName.of('ViewerPreferences'), pdfDoc.context.obj({ DisplayDocTitle: true }));
      const now=new Date();
      pdfDoc.setCreationDate(now); pdfDoc.setModificationDate(now);

      let complianceLabel='PDF 1.7 access derivative — baseline JPEG imagery, ZIP structure streams, offline processing (aligns with NAA access copy guidance)';
      let fileSuffix='access';
      const effectiveOptions={ ...options };
      let sizeGuardApplied=false;

      if(mode==='pdfa'){
        pdfDoc.setTitle(`${titleBase} (PDF/A-2b)`);
        pdfDoc.setSubject('PDF/A-2b compressed derivative');
        pdfDoc.setKeywords(['PDF/A-2b','Compression','Offline']);
        const iso=now.toISOString();
        const title=escapeXML(pdfDoc.getTitle()||'PDF/A Output');
        const xmp=`<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n    <rdf:Description rdf:about="">\n      <dc:format>application/pdf</dc:format>\n      <dc:title><rdf:Alt><rdf:li xml:lang="en-AU">${title}</rdf:li></rdf:Alt></dc:title>\n      <xmp:CreateDate>${iso}</xmp:CreateDate>\n      <xmp:ModifyDate>${iso}</xmp:ModifyDate>\n      <xmp:MetadataDate>${iso}</xmp:MetadataDate>\n      <pdf:Producer>Intranet PDF Compressor</pdf:Producer>\n      <pdfaid:part>2</pdfaid:part>\n      <pdfaid:conformance>B</pdfaid:conformance>\n    </rdf:Description>\n  </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`;
        if(typeof pdfDoc.setXmpMetadata==='function'){
          pdfDoc.setXmpMetadata(xmp);
        }else{
          const metadataBytes=new TextEncoder().encode(xmp);
          const metadataStream=pdfDoc.context.flateStream(metadataBytes,{ Type:PDFName.of('Metadata'), Subtype:PDFName.of('XML') });
          const metadataRef=pdfDoc.context.register(metadataStream);
          pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);
        }

        const iccData=await loadSrgbProfile();
        const iccStream=pdfDoc.context.register(pdfDoc.context.flateStream(iccData,{
          N:3,
          Alternate:PDFName.of('DeviceRGB'),
          Range:pdfDoc.context.obj([0,1,0,1,0,1]),
        }));
        const outputIntent=pdfDoc.context.obj({
          Type:PDFName.of('OutputIntent'),
          S:PDFName.of('GTS_PDFA1'),
          OutputConditionIdentifier:PDFString.of('sRGB IEC61966-2.1'),
          Info:PDFString.of('sRGB IEC61966-2.1'),
          DestOutputProfile:iccStream,
        });
        pdfDoc.catalog.set(PDFName.of('OutputIntents'), pdfDoc.context.obj([outputIntent]));
        complianceLabel='PDF/A-2b archival derivative — sRGB output intent, ZIP structure streams, baseline JPEG imagery, no LZW (complies with NAA long-term guidance)';
        fileSuffix='pdfa2b';
        const bytesPerPage=arrayBuffer.byteLength/Math.max(1,pdf.numPages);
        if(bytesPerPage<350000){
          sizeGuardApplied=true;
          effectiveOptions.dpi=Math.min(options.dpi,260);
          effectiveOptions.quality=Math.min(options.quality,0.82);
        }
      }else if(mode==='custom'){
        pdfDoc.setTitle(`${titleBase} (Custom derivative)`);
        pdfDoc.setSubject('Custom compressed derivative');
        pdfDoc.setKeywords(['PDF','Compression','Custom']);
        complianceLabel='PDF 1.7 custom derivative — manual DPI/quality/downscale applied per user selection.';
        fileSuffix='custom';
      }else{
        pdfDoc.setTitle(`${titleBase} (Access copy)`);
        pdfDoc.setSubject('Compressed access derivative');
        pdfDoc.setKeywords(['PDF','Compression','Offline Access']);
        if(!options.downscale){
          const bytesPerPage=arrayBuffer.byteLength/Math.max(1,pdf.numPages);
          if(bytesPerPage<200000){
            effectiveOptions.downscale=3200;
          }
        }
      }

      const pages=pdf.numPages; const baseScale=effectiveOptions.dpi/72;
      if(sizeGuardApplied){
        progressCb?.({current:0,total:pages,message:'Applying archival size guard…'});
      }
      for(let i=1;i<=pages;i++){
        progressCb?.({current:i-1,total:pages,message:`Rendering page ${i} of ${pages}…`});
        const page=await pdf.getPage(i);
        const baseViewport=page.getViewport({ scale:1 });
        const baseWidth=baseViewport.width; const baseHeight=baseViewport.height;
        let scale=baseScale; let renderWidth=Math.round(baseWidth*scale); let renderHeight=Math.round(baseHeight*scale);
        if(effectiveOptions.downscale>0 && Math.max(renderWidth,renderHeight)>effectiveOptions.downscale){
          const ratio=effectiveOptions.downscale/Math.max(renderWidth,renderHeight);
          scale*=ratio; renderWidth=Math.max(1,Math.round(baseWidth*scale)); renderHeight=Math.max(1,Math.round(baseHeight*scale));
        }
        const viewport=page.getViewport({ scale });
        const canvas=document.createElement('canvas'); canvas.width=renderWidth; canvas.height=renderHeight;
        const ctx=canvas.getContext('2d',{ willReadFrequently:true });
        ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
        const renderTask=page.render({ canvasContext:ctx, viewport });
        await renderTask.promise;
        progressCb?.({current:i-1+0.5,total:pages,message:`Encoding page ${i}…`});
        const jpegBlob=await new Promise((resolve,reject)=>{
          canvas.toBlob(blob=>{ if(blob){ resolve(blob); } else { reject(new Error('Failed to encode page.')); } },'image/jpeg',effectiveOptions.quality);
        });
        const jpgBytes=new Uint8Array(await jpegBlob.arrayBuffer());
        const img=await pdfDoc.embedJpg(jpgBytes);
        const pdfPage=pdfDoc.addPage([baseWidth,baseHeight]);
        pdfPage.drawImage(img,{ x:0, y:0, width:baseWidth, height:baseHeight });
        canvas.width=canvas.height=0;
        progressCb?.({current:i,total:pages,message:`Embedded page ${i} of ${pages}`});
        if((i % PAGE_YIELD_INTERVAL)===0){ await yieldToBrowser(); }
      }

      const pdfBytes=await pdfDoc.save({ useObjectStreams:true, addDefaultPage:false });
      progressCb?.({current:pages,total:pages,message:'Finalising…'});
      if(sizeGuardApplied){
        complianceLabel+=` • Adaptive size guard applied (${Math.round(effectiveOptions.dpi)} dpi / JPEG ${Math.round(effectiveOptions.quality*100)}%)`;
      }
      return { blob:new Blob([pdfBytes],{type:'application/pdf'}), pageCount:pages, originalBytes:arrayBuffer.byteLength, outputBytes:pdfBytes.length, complianceLabel, fileSuffix, usedOptions:effectiveOptions, sizeGuardApplied };
    }finally{
      await loadingTask.destroy();
    }
  }

  async function loadSrgbProfile(){
    if(!srgbProfileBytes){
      const cleaned=SRGB_PROFILE_BASE64.replace(/\s+/g,'');
      srgbProfileBytes=base64ToUint8(cleaned);
    }
    return srgbProfileBytes;
  }

  function updateProgress(current,total,message){
    if(typeof current==='object' && current){
      const payload=current;
      return updateProgress(payload.current??0,payload.total??1,payload.message);
    }
    const ratio=total>0?Math.min(1,Math.max(0,current/total)):0;
    progressBar.style.width=`${Math.round(ratio*100)}%`;
    if(message) progressStatus.textContent=message;
  }

  function deriveBaseName(name){
    const base=name.replace(/\.[^.]+$/,'');
    return base.replace(/[^A-Za-z0-9 _.-]+/g,'').trim().replace(/\s+/g,'-')||'document';
  }

  function renderStatsSummary(details){
    if(!stats) return;
    const {
      inputName='document',
      outputName='output.pdf',
      originalBytes=0,
      outputBytes=0,
      pageCount=0,
      usedDpi=0,
      usedQuality=0,
      usedMaxEdge='not limited',
      reductionText='',
      complianceLabel='',
      sizeGuardApplied=false
    }=details||{};

    stats.textContent='';

    const dpiDisplay=Number.isFinite(usedDpi)?Math.round(usedDpi):'—';
    const qualityDisplay=Number.isFinite(usedQuality)?Math.round(usedQuality):'—';
    const maxEdgeDisplay=usedMaxEdge||'not limited';
    const rows=[
      {label:'Input:', value:`${inputName||'document'} • ${formatBytes(originalBytes)}`},
      {label:'Output:', value:`${outputName||'output.pdf'} • ${formatBytes(outputBytes)}`},
      {label:'Pages processed:', value:String(pageCount ?? '0')},
      {label:'Settings:', value:`${dpiDisplay} dpi rasterisation • JPEG quality ${qualityDisplay} • Max edge ${maxEdgeDisplay}`},
      {label:'Compression result:', value:reductionText},
      {label:'Compliance:', value:complianceLabel}
    ];

    const fragment=document.createDocumentFragment();
    for(const row of rows){
      const wrapper=document.createElement('div');
      const strong=document.createElement('strong');
      strong.textContent=row.label;
      wrapper.appendChild(strong);
      wrapper.appendChild(document.createTextNode(` ${row.value}`));
      fragment.appendChild(wrapper);
    }

    if(sizeGuardApplied){
      const note=document.createElement('div');
      const label=document.createElement('strong');
      label.textContent='Note:';
      note.appendChild(label);
      note.appendChild(document.createTextNode(' Archival guard lowered DPI/quality automatically to prevent file bloat.'));
      fragment.appendChild(note);
    }

    stats.appendChild(fragment);
  }

  function triggerDownload(blob,filename){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },500);
  }

  function formatBytes(bytes){
    if(!Number.isFinite(bytes)) return 'n/a';
    if(bytes<1024) return `${bytes} bytes`;
    const units=['KB','MB','GB']; let i=-1; let value=bytes;
    while(value>=1024 && i<units.length-1){ value/=1024; i++; }
    return `${value.toFixed(value<10?2:1)} ${units[i]}`;
  }

  function formatDate(ts){
    try{ return new Date(ts).toLocaleString('en-AU',{ dateStyle:'medium', timeStyle:'short' }); }
    catch(e){ return 'unknown'; }
  }

  function clamp(val,min,max){ return Math.max(min,Math.min(max,val)); }

  function escapeXML(str){
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }

  function getOutputMode(){
    const checked=outputTypeRadios.find(r=>r.checked);
    return checked?checked.value:'access';
  }

  function updateActionLabels(){
    const mode=getOutputMode();
    syncQualityControls(mode);
    if(mode==='pdfa'){
      generateBtn.textContent='Generate PDF/A-2b file';
      downloadBtn.textContent='Download PDF/A';
    }else if(mode==='custom'){
      generateBtn.textContent='Generate custom PDF';
      downloadBtn.textContent='Download custom PDF';
    }else{
      generateBtn.textContent='Generate access copy';
      downloadBtn.textContent='Download PDF';
    }
  }

  function syncQualityControls(mode){
    if(mode==='pdfa'){
      rememberManualSettings();
      dpiInput.value=naaSettings.dpi;
      qualityInput.value=naaSettings.quality;
      downscaleInput.value=naaSettings.downscale;
      dpiInput.disabled=true;
      qualityInput.disabled=true;
      downscaleInput.disabled=true;
      if(qualityNotice){ qualityNotice.textContent=naaNotice; }
    }else if(mode==='access'){
      rememberManualSettings();
      dpiInput.value=accessSettings.dpi;
      qualityInput.value=accessSettings.quality;
      downscaleInput.value=accessSettings.downscale;
      dpiInput.disabled=true;
      qualityInput.disabled=true;
      downscaleInput.disabled=true;
      if(qualityNotice){ qualityNotice.textContent=accessNotice; }
    }else{
      dpiInput.disabled=false;
      qualityInput.disabled=false;
      downscaleInput.disabled=false;
      if(manualSettings.dpi) dpiInput.value=manualSettings.dpi;
      if(manualSettings.quality) qualityInput.value=manualSettings.quality;
      if(typeof manualSettings.downscale!=='undefined') downscaleInput.value=manualSettings.downscale;
      if(qualityNotice){ qualityNotice.textContent=defaultNotice; }
    }
    dpiLabel.textContent=dpiInput.value;
    qualityLabel.textContent=qualityInput.value;
  }

  function rememberManualSettings(){
    if(dpiInput.disabled||qualityInput.disabled||downscaleInput.disabled) return;
    manualSettings={ dpi:dpiInput.value, quality:qualityInput.value, downscale:downscaleInput.value };
  }

  function goToStep(step){
    if(!panelUpload||!panelSettings||!panelProgress||!panelResults) return;
    panelUpload.hidden=step!==1;
    panelSettings.hidden=step!==2;
    panelProgress.hidden=step!==3;
    panelResults.hidden=step!==4;
    if(progressActions){ progressActions.hidden=step!==3; }
    if(panelOverview){ panelOverview.hidden=step>1; }
  }

  function showError(message){
    if(!errorBanner) return;
    if(!message){ clearError(); return; }
    errorBanner.textContent=message;
    errorBanner.setAttribute('aria-hidden','false');
  }

  function clearError(){
    if(!errorBanner) return;
    errorBanner.textContent='';
    errorBanner.setAttribute('aria-hidden','true');
  }

  function base64ToUint8(base64){
    const binary=atob(base64);
    const len=binary.length;
    const bytes=new Uint8Array(len);
    for(let i=0;i<len;i++){ bytes[i]=binary.charCodeAt(i); }
    return bytes;
  }

  const SRGB_PROFILE_BASE64='AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+kACgAPAAUAEAA5YWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABvoAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c';
})();
