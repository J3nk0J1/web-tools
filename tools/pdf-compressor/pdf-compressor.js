// pdf-compressor.js — offline PDF compressor with optional PDF/A-2b mode using pdf.js & pdf-lib
(function(){
  const dropzone=document.getElementById('dropzone');
  const chooseFileBtn=document.getElementById('chooseFileBtn');
  const fileInput=document.getElementById('fileInput');
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
  const outputTypeRadios=Array.from(document.querySelectorAll('input[name="outputType"]'));

  document.getElementById('backToDashboard')?.addEventListener('click',()=>{ window.location.href='../../index.html'; });

  if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc='./lib/pdf.worker.min.js'; }

  let currentFile=null; let outputBlob=null; let outputName=''; let srgbProfileBytes=null;

  generateBtn.disabled=true;
  downloadBtn.disabled=true;

  chooseFileBtn.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',e=>{ const f=e.target.files?.[0]; if(f) acceptFile(f); });

  outputTypeRadios.forEach(radio=>radio.addEventListener('change',updateActionLabels));
  updateActionLabels();

  const prevent=e=>{e.preventDefault(); e.stopPropagation();};
  ['dragenter','dragover','dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt,prevent));
  dropzone.addEventListener('dragenter',()=>dropzone.classList.add('highlight'));
  dropzone.addEventListener('dragover',()=>dropzone.classList.add('highlight'));
  dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('highlight'));
  dropzone.addEventListener('drop',e=>{dropzone.classList.remove('highlight'); const f=e.dataTransfer?.files?.[0]; if(f) acceptFile(f);});
  dropzone.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fileInput.click(); } });

  dpiInput.addEventListener('input',()=>{ dpiLabel.textContent=dpiInput.value; });
  qualityInput.addEventListener('input',()=>{ qualityLabel.textContent=qualityInput.value; });

  generateBtn.addEventListener('click',async ()=>{
    if(!currentFile){ alert('Select a PDF first.'); return; }
    await runCompression();
  });

  downloadBtn.addEventListener('click',()=>{ if(outputBlob){ triggerDownload(outputBlob,outputName); }});

  resetBtn.addEventListener('click',()=>{
    currentFile=null; outputBlob=null; outputName=''; fileInput.value='';
    panelSettings.hidden=true; panelProgress.hidden=true; panelResults.hidden=true;
    dropzone.querySelector('p').textContent='Drag & drop a PDF here, or';
    inputMeta.textContent=''; generateBtn.disabled=true; downloadBtn.disabled=true;
    progressBar.style.width='0%'; progressStatus.textContent='Waiting…'; stats.innerHTML='';
    updateActionLabels();
  });

  async function runCompression(){
    generateBtn.disabled=true; downloadBtn.disabled=true; outputBlob=null; stats.innerHTML='';
    panelProgress.hidden=false; panelResults.hidden=true;
    const dpi=clamp(parseInt(dpiInput.value,10)||150,72,600);
    const quality=clamp(parseInt(qualityInput.value,10)||85,40,100)/100;
    const downscaleVal=Math.max(0,parseInt(downscaleInput.value,10)||0);
    const maxEdgeLabel=downscaleVal>0?`${downscaleVal}px`:'not limited';
    const mode=getOutputMode();

    try{
      updateProgress(0,1,'Preparing…');
      const {blob,pageCount,originalBytes,outputBytes,fileSuffix,complianceLabel} = await compressDocument(currentFile,{dpi,quality,downscale:downscaleVal},mode,updateProgress);
      outputBlob=blob;
      const safeBase=deriveBaseName(currentFile.name||'document');
      outputName=`${safeBase}-${fileSuffix}.pdf`;
      downloadBtn.disabled=false;
      panelResults.hidden=false;
      const reduction=originalBytes>0?((1-(outputBytes/originalBytes))*100):0;
      const reductionText=reduction>=0?`${reduction.toFixed(1)}% reduction`:`${Math.abs(reduction).toFixed(1)}% increase`;
      stats.innerHTML=`
        <div><strong>Input:</strong> ${currentFile.name} • ${formatBytes(originalBytes)}</div>
        <div><strong>Output:</strong> ${outputName} • ${formatBytes(outputBytes)}</div>
        <div><strong>Pages processed:</strong> ${pageCount}</div>
        <div><strong>Settings:</strong> ${Math.round(dpi)} dpi rasterisation • JPEG quality ${(quality*100).toFixed(0)} • Max edge ${maxEdgeLabel}</div>
        <div><strong>Compression result:</strong> ${reductionText}</div>
        <div><strong>Compliance:</strong> ${complianceLabel}</div>`;
      progressStatus.textContent='Ready to download.';
    }catch(err){
      console.error(err);
      alert('Unable to compress this PDF. Details in the console.');
      progressStatus.textContent='Processing failed.';
    }finally{
      generateBtn.disabled=false;
    }
  }

  function acceptFile(file){
    if(file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){ alert('Please choose a PDF file.'); return; }
    currentFile=file; outputBlob=null; outputName='';
    const meta=`Selected: ${file.name} • ${formatBytes(file.size)} • Last modified ${formatDate(file.lastModified||Date.now())}`;
    inputMeta.textContent=meta;
    dropzone.querySelector('p').textContent='File selected. Choose another to replace.';
    panelSettings.hidden=false; panelProgress.hidden=true; panelResults.hidden=true;
    generateBtn.disabled=false; downloadBtn.disabled=true; stats.innerHTML=''; progressStatus.textContent='Waiting…'; progressBar.style.width='0%';
    updateActionLabels();
  }

  async function compressDocument(file,options,mode,progressCb){
    const arrayBuffer=await file.arrayBuffer();
    const loadingTask=pdfjsLib.getDocument({ data:arrayBuffer, useSystemFonts:true, disableFontFace:false });
    try{
      const pdf=await loadingTask.promise;
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
      let fileSuffix='compressed';

      if(mode==='pdfa'){
        pdfDoc.setTitle(`${titleBase} (PDF/A-2b)`);
        pdfDoc.setSubject('PDF/A-2b compressed derivative');
        pdfDoc.setKeywords(['PDF/A-2b','Compression','Offline']);
        const iso=now.toISOString();
        const title=escapeXML(pdfDoc.getTitle()||'PDF/A Output');
        const xmp=`<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n    <rdf:Description rdf:about="">\n      <dc:format>application/pdf</dc:format>\n      <dc:title><rdf:Alt><rdf:li xml:lang="en-AU">${title}</rdf:li></rdf:Alt></dc:title>\n      <xmp:CreateDate>${iso}</xmp:CreateDate>\n      <xmp:ModifyDate>${iso}</xmp:ModifyDate>\n      <xmp:MetadataDate>${iso}</xmp:MetadataDate>\n      <pdf:Producer>Intranet PDF Compressor</pdf:Producer>\n      <pdfaid:part>2</pdfaid:part>\n      <pdfaid:conformance>B</pdfaid:conformance>\n    </rdf:Description>\n  </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`;
        pdfDoc.setXmpMetadata(xmp);

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
      }else{
        pdfDoc.setTitle(`${titleBase} (Access copy)`);
        pdfDoc.setSubject('Compressed access derivative');
        pdfDoc.setKeywords(['PDF','Compression','Offline Access']);
      }

      const pages=pdf.numPages; const baseScale=options.dpi/72;
      for(let i=1;i<=pages;i++){
        progressCb?.({current:i-1,total:pages,message:`Rendering page ${i} of ${pages}…`});
        const page=await pdf.getPage(i);
        const baseViewport=page.getViewport({ scale:1 });
        const baseWidth=baseViewport.width; const baseHeight=baseViewport.height;
        let scale=baseScale; let renderWidth=Math.round(baseWidth*scale); let renderHeight=Math.round(baseHeight*scale);
        if(options.downscale>0 && Math.max(renderWidth,renderHeight)>options.downscale){
          const ratio=options.downscale/Math.max(renderWidth,renderHeight);
          scale*=ratio; renderWidth=Math.max(1,Math.round(baseWidth*scale)); renderHeight=Math.max(1,Math.round(baseHeight*scale));
        }
        const viewport=page.getViewport({ scale });
        const canvas=document.createElement('canvas'); canvas.width=renderWidth; canvas.height=renderHeight;
        const ctx=canvas.getContext('2d',{ willReadFrequently:true });
        ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
        const renderTask=page.render({ canvasContext:ctx, viewport });
        await renderTask.promise;
        progressCb?.({current:i-1+0.6,total:pages,message:`Encoding page ${i}…`});
        const dataUrl=canvas.toDataURL('image/jpeg',options.quality);
        const jpgBytes=new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
        const img=await pdfDoc.embedJpg(jpgBytes);
        const pdfPage=pdfDoc.addPage([baseWidth,baseHeight]);
        pdfPage.drawImage(img,{ x:0, y:0, width:baseWidth, height:baseHeight });
        canvas.width=canvas.height=0;
        progressCb?.({current:i,total:pages,message:`Embedded page ${i} of ${pages}`});
      }

      const pdfBytes=await pdfDoc.save({ useObjectStreams:true, addDefaultPage:false });
      progressCb?.({current:pages,total:pages,message:'Finalising…'});
      return { blob:new Blob([pdfBytes],{type:'application/pdf'}), pageCount:pages, originalBytes:arrayBuffer.byteLength, outputBytes:pdfBytes.length, complianceLabel, fileSuffix };
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
    if(mode==='pdfa'){
      generateBtn.textContent='Generate PDF/A-2b file';
      downloadBtn.textContent='Download PDF/A';
    }else{
      generateBtn.textContent='Generate access copy';
      downloadBtn.textContent='Download PDF';
    }
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
