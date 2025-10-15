
// app.js — theme toggle & ripple
(function(){
  const root=document.documentElement; const toggle=document.getElementById('themeToggle'); const icon=document.getElementById('themeIcon');
  const apply=(m)=>{root.setAttribute('data-theme',m==='dark'?'dark':'light'); localStorage.setItem('theme',m); setIcon(m);} ;
  const setIcon=(m)=>{ if(!icon) return; const dark=m==='dark'; icon.innerHTML = dark?`<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9.37 5.51a7 7 0 0 0 9.12 9.12 8 8 0 1 1-9.12-9.12z"/></svg>`:`<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79L3.17 4.83l1.79 1.8 1.8-1.79zm10.48 0l1.79-1.79 1.79 1.79-1.79 1.8-1.79-1.8zM12 2v3m0 14v3M4 13H1v-2h3m19 0h-3v-2h3M6.76 19.16l-1.8 1.79-1.79-1.79 1.79-1.8 1.8 1.8zM19.24 19.16l1.79 1.79 1.79-1.79-1.79-1.8-1.79 1.8zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>`; };
  const saved=localStorage.getItem('theme'); const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches; apply(saved|| (prefersDark?'dark':'light'));
  toggle?.addEventListener('click',()=>{const cur=root.getAttribute('data-theme')==='dark'?'dark':'light'; apply(cur==='dark'?'light':'dark');});
  const rippleTargets=new WeakSet();
  function attachRipple(el){
    if(!el || rippleTargets.has(el)) return;
    rippleTargets.add(el);
    const ripple=document.createElement('span');
    ripple.className='ripple';
    el.appendChild(ripple);
    let timeout=null;
    const trigger=(event)=>{
      if(el.disabled||el.getAttribute?.('aria-disabled')==='true') return;
      const rect=el.getBoundingClientRect();
      const size=Math.hypot(rect.width,rect.height);
      let x=rect.width/2; let y=rect.height/2;
      if(event && 'clientX' in event){
        x=event.clientX-rect.left;
        y=event.clientY-rect.top;
      }
      ripple.style.setProperty('--ripple-size',`${size*2}px`);
      ripple.style.setProperty('--ripple-x',`${x}px`);
      ripple.style.setProperty('--ripple-y',`${y}px`);
      ripple.classList.remove('is-active');
      // force reflow to restart animation
      void ripple.offsetWidth;
      ripple.classList.add('is-active');
      if(timeout){ cancelAnimationFrame(timeout); timeout=null; }
      timeout=requestAnimationFrame(()=>{
        window.setTimeout(()=>ripple.classList.remove('is-active'),450);
      });
    };
    el.addEventListener('pointerdown',trigger,{ passive:true });
    el.addEventListener('keydown',evt=>{
      if(evt.key==='Enter'||evt.key===' '){ trigger(); }
    });
  }

  function hydrateRipples(root=document){
    root.querySelectorAll?.('.btn,[data-ripple],.icon-btn').forEach(attachRipple);
  }

  hydrateRipples();
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      mutation.addedNodes.forEach(node=>{
        if(!(node instanceof Element)) return;
        if(node.matches('.btn,[data-ripple],.icon-btn')) attachRipple(node);
        hydrateRipples(node);
      });
    }
  });
  if(document.body){ observer.observe(document.body,{childList:true,subtree:true}); }

  document.querySelectorAll('[data-card-link]').forEach(card=>{
    const href=card.getAttribute('data-card-link');
    if(!href) return;
    card.setAttribute('role','link');
    card.setAttribute('tabindex','0');
    card.classList.add('card--interactive');
    card.addEventListener('click',evt=>{
      if(evt.target instanceof Element && evt.target.closest('a,button')) return;
      window.location.href=href;
    });
    card.addEventListener('keydown',evt=>{
      if(evt.key==='Enter'||evt.key===' '){ evt.preventDefault(); window.location.href=href; }
    });
  });
})();
