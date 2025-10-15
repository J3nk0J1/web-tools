
// app.js — theme toggle & ripple
(function(){
  const root=document.documentElement; const toggle=document.getElementById('themeToggle'); const icon=document.getElementById('themeIcon');
  const apply=(m)=>{root.setAttribute('data-theme',m==='dark'?'dark':'light'); localStorage.setItem('theme',m); setIcon(m);} ;
  const setIcon=(m)=>{ if(!icon) return; const dark=m==='dark'; icon.innerHTML = dark?`<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9.37 5.51a7 7 0 0 0 9.12 9.12 8 8 0 1 1-9.12-9.12z"/></svg>`:`<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79L3.17 4.83l1.79 1.8 1.8-1.79zm10.48 0l1.79-1.79 1.79 1.79-1.79 1.8-1.79-1.8zM12 2v3m0 14v3M4 13H1v-2h3m19 0h-3v-2h3M6.76 19.16l-1.8 1.79-1.79-1.79 1.79-1.8 1.8 1.8zM19.24 19.16l1.79 1.79 1.79-1.79-1.79-1.8-1.79 1.8zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>`; };
  const saved=localStorage.getItem('theme'); const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches; apply(saved|| (prefersDark?'dark':'light'));
  toggle?.addEventListener('click',()=>{const cur=root.getAttribute('data-theme')==='dark'?'dark':'light'; apply(cur==='dark'?'light':'dark');});
  function ripple(el){ el.addEventListener('click',e=>{const r=document.createElement('span'); const rect=el.getBoundingClientRect(); const size=Math.max(rect.width,rect.height); r.className='ripple'; r.style.width=r.style.height=size+'px'; r.style.left=(e.clientX-rect.left-size/2)+'px'; r.style.top=(e.clientY-rect.top-size/2)+'px'; el.appendChild(r); setTimeout(()=>r.remove(),600);}); }
  document.querySelectorAll('.btn,[data-ripple],.icon-btn').forEach(ripple);
})();
