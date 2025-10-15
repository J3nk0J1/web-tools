// video-player.js — offline local playback with verbose codec diagnostics
(function(){
  const backBtn=document.getElementById('backToDashboard');
  backBtn?.addEventListener('click',()=>{ window.location.href='../../index.html'; });

  const dropzone=document.getElementById('dropzone');
  const uploadSection=document.getElementById('uploadSection');
  const chooseFile=document.getElementById('chooseFile');
  const fileInput=document.getElementById('fileInput');
  const playerPanel=document.getElementById('playerPanel');
  const playerShell=document.getElementById('playerShell');
  const video=document.getElementById('video');
  const overlayPlay=document.getElementById('overlayPlay');
  const playPause=document.getElementById('playPause');
  const muteToggle=document.getElementById('muteToggle');
  const volumeSlider=document.getElementById('volumeSlider');
  const seekBar=document.getElementById('seekBar');
  const progressPlayed=document.getElementById('progressPlayed');
  const progressBuffered=document.getElementById('progressBuffered');
  const progressHandle=document.getElementById('progressHandle');
  const currentTimeLabel=document.getElementById('currentTime');
  const durationLabel=document.getElementById('duration');
  const speedButton=document.getElementById('speedButton');
  const speedMenu=document.getElementById('speedMenu');
  const pipButton=document.getElementById('pipButton');
  const fullscreenButton=document.getElementById('fullscreenButton');
  const fileMeta=document.getElementById('fileMeta');
  const infoName=document.getElementById('infoName');
  const infoResolution=document.getElementById('infoResolution');
  const infoDuration=document.getElementById('infoDuration');
  const infoCodec=document.getElementById('infoCodec');
  const codecTableBody=document.getElementById('codecTableBody');
  const chooseNewVideo=document.getElementById('chooseNewVideo');

  let objectURL=null; let hideControlsTimeout=null; let isScrubbing=false; let lastVolume=1;

  const CODEC_PROBES=[
    {label:'H.264 (AVC1 Baseline)', type:'video/mp4; codecs="avc1.42E01E"'},
    {label:'H.264 (AVC1 High)', type:'video/mp4; codecs="avc1.640028"'},
    {label:'H.265 / HEVC', type:'video/mp4; codecs="hvc1.1.6.L123.B0"'},
    {label:'VP8 (WebM)', type:'video/webm; codecs="vp8"'},
    {label:'VP9 Profile 0', type:'video/webm; codecs="vp09.00.10.08"'},
    {label:'VP9 Profile 2 (10-bit)', type:'video/webm; codecs="vp09.02.10.10"'},
    {label:'AV1 Main', type:'video/mp4; codecs="av01.0.08M.08"'},
    {label:'AV1 Main 10-bit', type:'video/mp4; codecs="av01.0.10M.10"'},
    {label:'MPEG-2 Transport', type:'video/mp2t; codecs="mpgv"'},
    {label:'Theora (Ogg)', type:'video/ogg; codecs="theora"'}
  ];

  chooseFile?.addEventListener('click',()=>fileInput?.click());
  fileInput?.addEventListener('change',e=>{const file=e.target.files?.[0]; if(file) loadFile(file);});
  chooseNewVideo?.addEventListener('click',resetPlayerView);

  if(dropzone){
    ['dragenter','dragover','dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt,evt=>{evt.preventDefault(); evt.stopPropagation();}));
    dropzone.addEventListener('dragenter',()=>dropzone.classList.add('highlight'));
    dropzone.addEventListener('dragover',()=>dropzone.classList.add('highlight'));
    dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('highlight'));
    dropzone.addEventListener('drop',e=>{dropzone.classList.remove('highlight'); const file=e.dataTransfer?.files?.[0]; if(file) loadFile(file);});
    dropzone.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault(); fileInput?.click();}});
  }

  function loadFile(file){
    if(!isVideoFile(file)){ alert('Please select a video file.'); return; }
    revokeObjectURL();
    objectURL=URL.createObjectURL(file);
    video.src=objectURL;
    video.currentTime=0;
    video.playbackRate=1;
    playerPanel.hidden=false;
    uploadSection?.setAttribute('hidden','');
    dropzone?.classList.remove('highlight');
    playerShell.dataset.state='paused';
    playerShell.dataset.controls='visible';
    updatePlayIcon();
    volumeSlider.value=video.volume.toString();
    infoName.textContent=file.name||'Untitled video';
    infoResolution.textContent='—';
    infoDuration.textContent='—';
    infoCodec.textContent=describeCodec(file);
    fileMeta.textContent=`Loaded ${file.name||'video'} • ${(file.size/1024/1024).toFixed(2)} MB • ${file.type||'unknown type'}`;
    renderCodecTable();
  }

  function resetPlayerView(){
    video.pause();
    video.removeAttribute('src');
    video.load();
    revokeObjectURL();
    if(fileInput) fileInput.value='';
    infoName.textContent='—';
    infoResolution.textContent='—';
    infoDuration.textContent='—';
    infoCodec.textContent='—';
    fileMeta.textContent='No file loaded.';
    playerPanel.hidden=true;
    uploadSection?.removeAttribute('hidden');
    playerShell.dataset.state='paused';
    playerShell.dataset.controls='visible';
    updatePlayIcon();
  }

  function isVideoFile(file){
    if(!file) return false;
    if(file.type && file.type.startsWith('video/')) return true;
    const name=(file.name||'').toLowerCase();
    return /(\.mp4|\.webm|\.mkv|\.mov|\.m4v|\.avi|\.mpg|\.mpeg|\.ogv)$/i.test(name);
  }

  function describeCodec(file){
    if(file.type) return file.type;
    const name=(file.name||'').toLowerCase();
    if(name.endsWith('.mkv')) return 'Matroska container';
    if(name.endsWith('.mov')) return 'QuickTime / MOV container';
    if(name.endsWith('.avi')) return 'AVI container';
    if(name.endsWith('.mp4')||name.endsWith('.m4v')) return 'MP4 container (likely H.264/H.265/AV1)';
    if(name.endsWith('.webm')) return 'WebM container (likely VP8/VP9/AV1)';
    if(name.endsWith('.ogv')) return 'Ogg container (likely Theora/VP8)';
    if(name.endsWith('.mpg')||name.endsWith('.mpeg')) return 'MPEG program stream';
    return 'Unknown container';
  }

  async function renderCodecTable(){
    if(!codecTableBody) return;
    codecTableBody.innerHTML='';
    for(const probe of CODEC_PROBES){
      const {status,label}=await checkCodec(probe.type);
      const tr=document.createElement('tr');
      const tdLabel=document.createElement('td'); tdLabel.textContent=probe.label; tr.appendChild(tdLabel);
      const tdStatus=document.createElement('td');
      tdStatus.innerHTML=badgeFor(status,label);
      tr.appendChild(tdStatus);
      codecTableBody.appendChild(tr);
    }
  }

  async function checkCodec(type){
    let mse=null, cpt=null, mc=null;
    try{ if(typeof MediaSource!=='undefined' && typeof MediaSource.isTypeSupported==='function'){ mse=MediaSource.isTypeSupported(type); } }
    catch(e){ mse=null; }
    try{ cpt=video.canPlayType(type); } catch(e){ cpt=''; }
    if('mediaCapabilities' in navigator && typeof navigator.mediaCapabilities.decodingInfo==='function'){
      try{
        const info=await navigator.mediaCapabilities.decodingInfo({type:'file', video:{contentType:type, width:1920, height:1080, bitrate:8000000, framerate:30}});
        mc=info.supported;
      }catch(e){ mc=null; }
    }
    const labelParts=[];
    if(mse!==null){ labelParts.push(`MSE: ${mse||'no'}`); }
    if(cpt){ labelParts.push(`canPlayType: ${cpt}`); }
    if(mc!==null){ labelParts.push(`MediaCapabilities: ${mc?'supported':'no'}`); }
    const summary=labelParts.join(' • ')||'No signal';
    let status='no';
    const likely=mse==='probably'||cpt==='probably'||mc===true;
    const maybe=mse==='maybe'||cpt==='maybe'||mc===null && (mse||cpt);
    if(likely) status='ok'; else if(maybe) status='maybe';
    return {status,label:summary};
  }

  function badgeFor(status,label){
    const cls=status==='ok'?'badge badge--ok':status==='maybe'?'badge badge--maybe':'badge badge--no';
    const text=status==='ok'?'Supported':status==='maybe'?'Limited/Uncertain':'Not supported';
    return `<span class="${cls}" title="${label}">${text}</span>`;
  }

  video.addEventListener('loadedmetadata',()=>{
    const width=video.videoWidth||0; const height=video.videoHeight||0;
    if(width&&height){ infoResolution.textContent=`${width} × ${height}px`; }
    else infoResolution.textContent='Unknown';
    const duration=isFinite(video.duration)?video.duration:0;
    if(duration){ durationLabel.textContent=formatTime(duration); infoDuration.textContent=formatTime(duration); }
    else { durationLabel.textContent='0:00'; infoDuration.textContent='Unknown'; }
    updateTimeline();
  });

  video.addEventListener('timeupdate',()=>{ if(!isScrubbing) updateTimeline(); });
  video.addEventListener('progress',updateBuffered);
  video.addEventListener('play',()=>{ playerShell.dataset.state='playing'; updatePlayIcon(); scheduleHideControls(); });
  video.addEventListener('pause',()=>{ playerShell.dataset.state='paused'; updatePlayIcon(); playerShell.dataset.controls='visible'; clearHideControls(); });
  video.addEventListener('click',togglePlayback);

  overlayPlay?.addEventListener('click',togglePlayback);
  playPause?.addEventListener('click',togglePlayback);

  function togglePlayback(){
    if(video.paused) video.play().catch(()=>{}); else video.pause();
  }

  function updatePlayIcon(){
    const isPlaying=!video.paused && !video.ended;
    const playIcon='<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const pauseIcon='<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    if(playPause) playPause.innerHTML=isPlaying?pauseIcon:playIcon;
    if(overlayPlay) overlayPlay.innerHTML=isPlaying?pauseIcon:playIcon;
    overlayPlay?.setAttribute('aria-label',isPlaying?'Pause video':'Play video');
    playPause?.setAttribute('aria-label',isPlaying?'Pause':'Play');
  }

  function updateTimeline(){
    const duration=isFinite(video.duration)?video.duration:0;
    if(duration<=0){ seekBar.value='0'; progressPlayed.style.width='0%'; progressHandle.style.left='0%'; currentTimeLabel.textContent='0:00'; return; }
    const ratio=video.currentTime/duration; const pct=Math.min(1,Math.max(0,ratio));
    seekBar.value=(pct*1000).toFixed(0);
    progressPlayed.style.width=`${pct*100}%`;
    progressHandle.style.left=`${pct*100}%`;
    currentTimeLabel.textContent=formatTime(video.currentTime);
  }

  function updateBuffered(){
    if(video.buffered.length){
      const duration=isFinite(video.duration)?video.duration:0;
      const bufferedEnd=video.buffered.end(video.buffered.length-1);
      const pct=duration>0?Math.min(1,bufferedEnd/duration):0;
      progressBuffered.style.width=`${pct*100}%`;
    } else {
      progressBuffered.style.width='0%';
    }
  }

  seekBar.addEventListener('input',()=>{
    const duration=isFinite(video.duration)?video.duration:0;
    if(duration<=0) return;
    const pct=parseFloat(seekBar.value)/1000;
    progressPlayed.style.width=`${pct*100}%`;
    progressHandle.style.left=`${pct*100}%`;
    currentTimeLabel.textContent=formatTime(pct*duration);
  });

  seekBar.addEventListener('change',()=>{
    const duration=isFinite(video.duration)?video.duration:0;
    if(duration<=0) return;
    const pct=parseFloat(seekBar.value)/1000;
    video.currentTime=pct*duration;
  });

  seekBar.addEventListener('pointerdown',()=>{ isScrubbing=true; clearHideControls(); playerShell.dataset.controls='visible'; });
  document.addEventListener('pointerup',()=>{ if(isScrubbing){ isScrubbing=false; scheduleHideControls(); } });

  muteToggle?.addEventListener('click',()=>{
    if(video.muted || video.volume===0){ video.muted=false; video.volume=lastVolume||0.5; }
    else { lastVolume=video.volume; video.muted=true; }
    syncVolumeUI();
  });

  volumeSlider?.addEventListener('input',()=>{
    video.muted=false;
    video.volume=parseFloat(volumeSlider.value);
    lastVolume=video.volume;
    syncVolumeUI();
  });

  function syncVolumeUI(){
    const isMuted=video.muted||video.volume===0;
    if(volumeSlider) volumeSlider.value=isMuted?'0':video.volume.toFixed(2);
    const mutedIcon='<svg viewBox="0 0 24 24"><path d="M16 7.82v8.36c0 .79-.92 1.24-1.54.74l-3.12-2.6H8a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h3.34l3.12-2.6c.62-.5 1.54-.05 1.54.74ZM19 12a7 7 0 0 1-2.05 4.95l-1.4-1.42A5 5 0 0 0 17 12c0-1.3-.5-2.48-1.45-3.53l1.4-1.42A7 7 0 0 1 19 12Zm-3.17 7.17-1.41-1.41A6.97 6.97 0 0 1 12 19a6.97 6.97 0 0 1-4.95-2.05l-1.4 1.42A8.97 8.97 0 0 0 12 21c1.93 0 3.71-.61 5.17-1.66ZM6.34 4.93 5 6.28 7.73 9H6v6h4l3.74 3.12c.1.08.2.14.31.18l1.62 1.62 1.34-1.34-11-11Z"/></svg>';
    const volumeIcon='<svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 5V4l-5 5H5zm13.5 3a4.5 4.5 0 0 0-2.25-3.89v7.78A4.49 4.49 0 0 0 18.5 12zm-2.25-7.73v2.11A6.5 6.5 0 0 1 20.5 12a6.5 6.5 0 0 1-4.25 5.62v2.11A8.5 8.5 0 0 0 22.5 12a8.5 8.5 0 0 0-6.25-7.73z"/></svg>';
    muteToggle.innerHTML=isMuted?mutedIcon:volumeIcon;
    muteToggle.setAttribute('aria-label',isMuted?'Unmute':'Mute');
  }

  pipButton?.addEventListener('click',async()=>{
    if(!document.pictureInPictureEnabled || typeof video.requestPictureInPicture!=='function'){ return; }
    try{
      if(document.pictureInPictureElement){ await document.exitPictureInPicture(); }
      else { await video.requestPictureInPicture(); }
    }catch(e){ console.warn('PiP error',e); }
  });

  if(!document.pictureInPictureEnabled || typeof video.requestPictureInPicture!=='function'){
    pipButton?.setAttribute('disabled','true');
    pipButton?.setAttribute('title','Picture-in-Picture not available in this browser');
  }

  fullscreenButton?.addEventListener('click',toggleFullscreen);
  playerShell?.addEventListener('dblclick',toggleFullscreen);

  function toggleFullscreen(){
    if(!playerShell) return;
    const request=playerShell.requestFullscreen||playerShell.webkitRequestFullscreen||playerShell.msRequestFullscreen;
    const exit=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;
    const isFull=Boolean(document.fullscreenElement||document.webkitFullscreenElement||document.msFullscreenElement);
    if(!isFull){ request?.call(playerShell); }
    else { exit?.call(document); }
  }

  function syncFullscreenState(){
    const isFull=Boolean(document.fullscreenElement||document.webkitFullscreenElement||document.msFullscreenElement);
    if(isFull) playerShell.classList.add('fullscreen'); else playerShell.classList.remove('fullscreen');
    const enterIcon='<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3Zm12 3h-3v2h5v-5h-2v3ZM7 7h3V5H5v5h2V7Zm9-2v2h3v3h2V5h-5Z"/></svg>';
    const exitIcon='<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2Zm11 3h2v-3h3v-2h-5v5Zm3-11V5h-2v5h5V8h-3ZM10 5H8v3H5v2h5V5Z"/></svg>';
    fullscreenButton.innerHTML=isFull?exitIcon:enterIcon;
    fullscreenButton.setAttribute('aria-label',isFull?'Exit fullscreen':'Enter fullscreen');
  }

  document.addEventListener('fullscreenchange',syncFullscreenState);
  document.addEventListener('webkitfullscreenchange',syncFullscreenState);
  document.addEventListener('msfullscreenchange',syncFullscreenState);

  speedButton?.addEventListener('click',()=>{
    const expanded=speedButton.getAttribute('aria-expanded')==='true';
    setSpeedMenu(!expanded);
  });

  document.addEventListener('click',e=>{
    if(!speedMenu || !speedButton) return;
    if(!speedMenu.contains(e.target) && !speedButton.contains(e.target)){ setSpeedMenu(false); }
  });

  speedMenu?.querySelectorAll('button[data-speed]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const speed=parseFloat(btn.dataset.speed||'1');
      video.playbackRate=speed;
      speedMenu.querySelectorAll('button[data-speed]').forEach(b=>b.classList.toggle('is-active',b===btn));
      setSpeedMenu(false);
    });
  });

  function setSpeedMenu(open){
    speedButton?.setAttribute('aria-expanded',open?'true':'false');
    if(speedMenu){ speedMenu.setAttribute('aria-hidden',open?'false':'true'); }
  }

  playerShell?.addEventListener('mousemove',()=>{ playerShell.dataset.controls='visible'; scheduleHideControls(); });
  playerShell?.addEventListener('mouseleave',()=>{ if(!video.paused) scheduleHideControls(); });

  function scheduleHideControls(){
    if(video.paused) return;
    clearHideControls();
    hideControlsTimeout=window.setTimeout(()=>{ playerShell.dataset.controls='hidden'; }, 2500);
  }

  function clearHideControls(){
    if(hideControlsTimeout){ clearTimeout(hideControlsTimeout); hideControlsTimeout=null; }
  }

  document.addEventListener('keydown',e=>{
    if(document.activeElement && ['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    switch(e.key){
      case ' ': case 'k': e.preventDefault(); togglePlayback(); break;
      case 'ArrowRight': video.currentTime=Math.min(video.duration||0, video.currentTime+5); break;
      case 'ArrowLeft': video.currentTime=Math.max(0, video.currentTime-5); break;
      case 'ArrowUp': e.preventDefault(); adjustVolume(0.05); break;
      case 'ArrowDown': e.preventDefault(); adjustVolume(-0.05); break;
      case 'm': muteToggle?.click(); break;
      case 'f': toggleFullscreen(); break;
      case 'p': pipButton?.click(); break;
    }
  });

  function adjustVolume(delta){
    let vol=Math.min(1,Math.max(0,video.volume+delta));
    video.volume=vol; video.muted=vol===0; lastVolume=vol;
    syncVolumeUI();
  }

  function formatTime(seconds){
    const s=Math.max(0,Math.floor(seconds));
    const hrs=Math.floor(s/3600);
    const mins=Math.floor((s%3600)/60);
    const secs=s%60;
    if(hrs>0) return `${hrs}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    return `${mins}:${secs.toString().padStart(2,'0')}`;
  }

  function revokeObjectURL(){ if(objectURL){ URL.revokeObjectURL(objectURL); objectURL=null; } }

  window.addEventListener('beforeunload',revokeObjectURL);
  syncFullscreenState();
  renderCodecTable();
})();
