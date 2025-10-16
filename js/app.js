// app.js — shared UI behaviours, theme switching, and card hydration
(function(){
  const root=document.documentElement;
  const body=document.body;
  const dataset=body?.dataset ?? {};
  const base=normalizeBase(dataset.root || '.');
  const protocolRegex=/^[a-z]+:/i;

  const rawTools=Array.isArray(window.INTRANET_TOOLS)?window.INTRANET_TOOLS:[];
  const tools=rawTools.map(tool=>{
    const keywords=Array.isArray(tool.keywords)?tool.keywords:[];
    const searchTokens=[tool.name,tool.description,tool.category||'',...keywords]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return {
      ...tool,
      href:resolvePath(tool.href),
      icon:resolvePath(tool.icon),
      search:searchTokens
    };
  });

  const cardRegistry=new WeakSet();
  const rippleTargets=new WeakSet();
  let filterController=null;

  initSidebar();
  initThemeToggle();
  buildSidebarToolLinks(tools);
  buildToolGrid(tools);
  initToolSearch();
  buildFeaturedTools(tools);
  buildCategoryChips(tools);
  hydrateToolLede(tools);
  initCardNavigation();
  initAboutDialog();
  initRippleObserver();

  function normalizeBase(value){
    if(!value||value==='.'||value==='./') return '.';
    return value.replace(/\/+$/,'');
  }

  function resolvePath(path){
    if(!path) return '#';
    const value=String(path);
    if(protocolRegex.test(value) || value.startsWith('#')){
      return value;
    }
    if(value.startsWith('/')){
      return value;
    }
    const cleaned=value.replace(/^\.\/+/, '').replace(/^\/+/, '');
    if(base==='.'){
      return cleaned ? `./${cleaned}`.replace(/^\.\//,'./') : '.';
    }
    if(!cleaned){
      return base;
    }
    return `${base}/${cleaned}`.replace(/\/{2,}/g,'/');
  }

  function initThemeToggle(){
    const toggle=document.getElementById('themeToggle');
    const icon=document.getElementById('themeIcon');
    if(!toggle || !root) return;

    const sunIcon='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m6.36 1.64-1.42 1.42M22 12h-2m-1.64 6.36-1.42-1.42M12 20v2M6.36 18.36 4.94 19.78M4 12H2m3.64-6.36L7.06 7.06"/></svg>';
    const moonIcon='<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79z"/></svg>';

    const applyTheme=mode=>{
      const theme=mode==='dark'?'dark':'light';
      root.setAttribute('data-theme',theme);
      localStorage.setItem('theme',theme);
      if(icon){
        icon.innerHTML=theme==='dark'?moonIcon:sunIcon;
      }
      toggle.setAttribute('aria-pressed',theme==='dark'?'true':'false');
      toggle.setAttribute('title',theme==='dark'?'Switch to light theme':'Switch to dark theme');
    };

    const saved=localStorage.getItem('theme');
    const prefersDark=window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark?'dark':'light'));

    toggle.addEventListener('click',()=>{
      const current=root.getAttribute('data-theme')==='dark'?'dark':'light';
      applyTheme(current==='dark'?'light':'dark');
    });
  }

  function initSidebar(){
    if(!body) return;
    const sidebar=document.querySelector('[data-sidebar]');
    const toggles=Array.from(document.querySelectorAll('[data-sidebar-toggle]'));
    const overlay=document.querySelector('[data-sidebar-overlay]');
    if(!sidebar || toggles.length===0){
      body.dataset.sidebarCollapsed='false';
      return;
    }

    const mq=window.matchMedia ? window.matchMedia('(max-width: 1024px)') : null;

    const readStored=()=>{
      try{
        return localStorage.getItem('sidebar-collapsed');
      }catch(error){
        return null;
      }
    };

    const writeStored=value=>{
      try{
        localStorage.setItem('sidebar-collapsed',value?'true':'false');
      }catch(error){
        /* noop */
      }
    };

    const isMobile=()=>mq?mq.matches:false;

    const syncAria=collapsed=>{
      toggles.forEach(btn=>{
        btn.setAttribute('aria-expanded',collapsed?'false':'true');
      });
    };

    const applyState=(collapsed,{persist}={persist:!isMobile()})=>{
      const next=collapsed?'true':'false';
      body.dataset.sidebarCollapsed=next;
      if(persist) writeStored(collapsed);
      syncAria(collapsed);
    };

    const initial=(()=>{
      if(isMobile()) return true;
      const stored=readStored();
      if(stored==null) return false;
      return stored==='true';
    })();

    applyState(initial);

    toggles.forEach(btn=>{
      btn.addEventListener('click',event=>{
        event.preventDefault();
        const current=body.dataset.sidebarCollapsed==='true';
        const persist=!isMobile();
        applyState(!current,{persist});
      });
    });

    if(overlay){
      overlay.addEventListener('click',()=>{
        applyState(true,{persist:false});
      });
    }

    const handleMediaChange=event=>{
      if(event.matches){
        applyState(true,{persist:false});
      }else{
        const stored=readStored();
        if(stored==null){
          applyState(false);
        }else{
          applyState(stored==='true');
        }
      }
    };

    if(mq){
      if(typeof mq.addEventListener==='function'){
        mq.addEventListener('change',handleMediaChange);
      }else if(typeof mq.addListener==='function'){
        mq.addListener(handleMediaChange);
      }
    }
  }

  function buildSidebarToolLinks(toolset){
    const list=document.querySelector('[data-sidebar-tool-list]');
    if(!list) return;

    list.innerHTML='';

    const currentPage=dataset.page || '';
    let currentPath=null;
    try{
      currentPath=new URL(window.location.href).pathname.replace(/\/+$/,'');
    }catch(error){
      currentPath=null;
    }

    const sorted=[...toolset].sort((a,b)=>{
      return a.name.localeCompare(b.name,'en',{sensitivity:'base'});
    });

    sorted.forEach(tool=>{
      const item=document.createElement('li');
      item.className='sidebar-list__item';

      const link=document.createElement('a');
      link.className='sidebar-link';
      link.href=tool.href;
      link.setAttribute('data-ripple','');

      const iconWrap=document.createElement('span');
      iconWrap.className='sidebar-link__icon';
      const icon=document.createElement('img');
      icon.src=tool.icon;
      icon.alt='';
      icon.setAttribute('aria-hidden','true');
      icon.loading='lazy';
      iconWrap.appendChild(icon);

      const label=document.createElement('span');
      label.className='sidebar-link__label';
      label.textContent=tool.name;

      link.append(iconWrap,label);

      if(currentPage==='tool' && currentPath){
        try{
          const targetPath=new URL(tool.href, window.location.href).pathname.replace(/\/+$/,'');
          if(targetPath===currentPath){
            link.classList.add('sidebar-link--active');
            link.setAttribute('aria-current','page');
          }
        }catch(error){
          /* ignore */
        }
      }

      item.appendChild(link);
      list.appendChild(item);
    });
  }

  function buildToolGrid(toolset){
    const grid=document.querySelector('[data-tool-grid]');
    if(!grid || !toolset.length) return;
    grid.innerHTML='';
    const fragment=document.createDocumentFragment();

    toolset.forEach(tool=>{
      const card=document.createElement('article');
      card.className='tool-card';
      card.setAttribute('data-tool-card','');
      card.setAttribute('data-card-link',tool.href);
      card.dataset.search=tool.search;
      card.dataset.category=(tool.category||'tool').toLowerCase();
      card.innerHTML=`
        <header class="tool-card__header">
          <span class="tool-card__icon"><img src="${tool.icon}" alt="${tool.name} icon" loading="lazy" /></span>
          <div class="tool-card__meta">
            <h3 class="tool-card__title">${tool.name}</h3>
            <p class="tool-card__category">${tool.category || 'Tool'}</p>
          </div>
        </header>
        <p class="tool-card__description">${tool.description}</p>
        <a class="btn btn--surface tool-card__action" data-ripple href="${tool.href}">Open tool</a>
      `;
      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
    hydrateRipples(grid);
    initCardNavigation(grid);
    updateToolCount(toolset.length);
  }

  function updateToolCount(count){
    const countLabel=document.querySelector('[data-tool-count]');
    if(!countLabel) return;
    const value=Number.isFinite(count)?count:0;
    countLabel.textContent=`${value} tool${value===1?'':'s'}`;
  }

  function hydrateToolLede(toolset){
    const lede=document.querySelector('[data-tool-lede]');
    if(!lede) return;
    const toolId=lede.getAttribute('data-tool-id');
    const tool=toolset.find(item=>item.id===toolId);
    if(!tool){
      lede.remove();
      return;
    }
    lede.innerHTML=`
      <span class="tool-lede__icon" aria-hidden="true"><img src="${tool.icon}" alt="" /></span>
      <div class="tool-lede__content">
        <span class="badge badge--category">${tool.category || 'Tool'}</span>
        <h1 class="tool-lede__title">${tool.name}</h1>
        <p class="tool-lede__description">${tool.description}</p>
      </div>
    `;
    const iconImg=lede.querySelector('img');
    if(iconImg){
      iconImg.alt=`${tool.name} icon`;
      iconImg.decoding='async';
    }
  }

  function initToolSearch(){
    const searchInput=document.querySelector('[data-tool-search]');
    const emptyState=document.querySelector('[data-search-empty]');
    const cards=Array.from(document.querySelectorAll('[data-tool-card]'));

    if(!searchInput){
      filterController=createNoopFilterController();
      return;
    }

    const state={
      search:searchInput.value || '',
      category:'all'
    };
    const listeners=new Set();
    let lastVisible=cards.length;

    const notify=()=>{
      const snapshot={...state,visibleCount:lastVisible};
      listeners.forEach(listener=>{
        try{
          listener(snapshot);
        }catch(error){
          console.error(error);
        }
      });
    };

    const applyFilter=()=>{
      const searchTerm=(state.search||'').trim().toLowerCase();
      const activeCategory=(state.category||'all').toLowerCase();
      let visible=0;
      cards.forEach(card=>{
        const text=card.dataset.search || '';
        const category=(card.dataset.category || '').toLowerCase();
        const matchesSearch=!searchTerm || text.includes(searchTerm);
        const matchesCategory=activeCategory==='all' || category===activeCategory;
        const match=matchesSearch && matchesCategory;
        card.hidden=!match;
        if(match) visible+=1;
      });
      lastVisible=visible;
      if(emptyState){
        emptyState.hidden=visible!==0;
      }
      updateToolCount(visible);
      notify();
    };

    filterController={
      setSearch(value){
        state.search=typeof value==='string'?value:(value==null?'':String(value));
        if(searchInput.value!==state.search){
          searchInput.value=state.search;
        }
        applyFilter();
      },
      setCategory(value){
        const normalized=typeof value==='string'?value.toLowerCase():'all';
        state.category=normalized && normalized!=='all'?normalized:'all';
        applyFilter();
      },
      getState(){
        return {...state,visibleCount:lastVisible};
      },
      subscribe(fn){
        if(typeof fn!=='function') return()=>{};
        listeners.add(fn);
        fn({...state,visibleCount:lastVisible});
        return()=>listeners.delete(fn);
      }
    };

    searchInput.addEventListener('input',()=>{
      state.search=searchInput.value;
      applyFilter();
    });

    applyFilter();
  }

  function createNoopFilterController(){
    return{
      setSearch(){},
      setCategory(){},
      getState(){
        return{search:'',category:'all',visibleCount:0};
      },
      subscribe(){
        return()=>{};
      }
    };
  }

  function buildFeaturedTools(toolset){
    const carousel=document.querySelector('[data-featured-grid]');
    if(!carousel || !toolset.length) return;

    carousel.innerHTML='';
    const preferred=toolset.filter(tool=>tool.featured);
    const candidates=(preferred.length?preferred:toolset).slice(0,4);
    const fragment=document.createDocumentFragment();
    const cards=[];

    candidates.forEach(tool=>{
      const card=document.createElement('article');
      card.className='tool-card tool-card--featured';
      card.dataset.category=(tool.category||'tool').toLowerCase();
      card.setAttribute('data-card-link',tool.href);
      card.innerHTML=`
        <header class="tool-card__header">
          <span class="tool-card__icon"><img src="${tool.icon}" alt="${tool.name} icon" loading="lazy" /></span>
          <div class="tool-card__meta">
            <h3 class="tool-card__title">${tool.name}</h3>
            <p class="tool-card__category">${tool.category || 'Tool'}</p>
          </div>
        </header>
        <p class="tool-card__description">${tool.description}</p>
        <a class="btn tool-card__action" data-ripple href="${tool.href}">Open tool</a>
      `;
      fragment.appendChild(card);
      cards.push(card);
    });

    carousel.appendChild(fragment);
    hydrateRipples(carousel);
    initCardNavigation(carousel);

    const syncState=state=>{
      const active=(state?.category||'all').toLowerCase();
      cards.forEach(card=>{
        const category=card.dataset.category || '';
        const matches=active==='all' || category===active;
        card.dataset.dimmed=matches?'false':'true';
      });
    };

    if(filterController && typeof filterController.subscribe==='function'){
      filterController.subscribe(syncState);
    }else{
      syncState({category:'all'});
    }
  }

  function buildCategoryChips(toolset){
    const container=document.querySelector('[data-category-chips]');
    if(!container || !toolset.length) return;

    const categories=Array.from(new Set(toolset.map(tool=>tool.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    container.innerHTML='';

    const chips=[];

    const createChip=(label,value)=>{
      const chip=document.createElement('button');
      chip.type='button';
      chip.className='filter-chip';
      chip.dataset.category=value;
      chip.setAttribute('aria-pressed','false');
      chip.textContent=label;
      chip.setAttribute('data-ripple','');
      chip.addEventListener('click',()=>{
        if(!filterController) return;
        const current=filterController.getState?.().category || 'all';
        const next=current===value?'all':value;
        filterController.setCategory(next);
      });
      container.appendChild(chip);
      chips.push(chip);
      return chip;
    };

    createChip('All tools','all');
    categories.forEach(category=>{
      createChip(category,category.toLowerCase());
    });

    hydrateRipples(container);

    const syncActive=state=>{
      const active=(state?.category||'all').toLowerCase();
      chips.forEach(chip=>{
        const value=chip.dataset.category || 'all';
        const isActive=active===value;
        chip.dataset.active=isActive?'true':'false';
        chip.setAttribute('aria-pressed',isActive?'true':'false');
      });
    };

    if(filterController && typeof filterController.subscribe==='function'){
      filterController.subscribe(syncActive);
    }else{
      syncActive({category:'all'});
    }
  }

  function initCardNavigation(scope=document){
    scope.querySelectorAll?.('[data-card-link]').forEach(card=>{
      if(!(card instanceof HTMLElement)) return;
      if(cardRegistry.has(card)) return;
      cardRegistry.add(card);
      const href=card.getAttribute('data-card-link');
      if(!href) return;
      card.setAttribute('role','link');
      card.setAttribute('tabindex','0');
      card.classList.add('is-interactive');
      card.addEventListener('click',event=>{
        if(event.target instanceof Element && event.target.closest('a,button')) return;
        window.location.href=href;
      });
      card.addEventListener('keydown',event=>{
        if(event.key==='Enter' || event.key===' '){
          event.preventDefault();
          window.location.href=href;
        }
      });
    });
  }

  function initAboutDialog(){
    if(dataset.page!=='dashboard') return;
    const trigger=document.querySelector('[data-about-open]');
    const dialog=document.getElementById('aboutDialog');
    if(!(trigger instanceof HTMLElement)) return;
    if(!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal!=='function') return;

    trigger.setAttribute('aria-haspopup','dialog');
    trigger.setAttribute('aria-expanded','false');

    const closeDialog=()=>{
      if(dialog.open){
        dialog.close();
        window.setTimeout(()=>{
          try{
            trigger.focus({preventScroll:true});
          }catch(error){
            // focus errors can be ignored
          }
        },0);
      }
    };

    const syncState=()=>{
      trigger.setAttribute('aria-expanded',dialog.open?'true':'false');
    };

    trigger.addEventListener('click',()=>{
      if(dialog.open){
        closeDialog();
        return;
      }
      dialog.showModal();
      syncState();
    });

    dialog.addEventListener('cancel',event=>{
      event.preventDefault();
      closeDialog();
      syncState();
    });

    dialog.addEventListener('close',syncState);

    dialog.addEventListener('click',event=>{
      if(event.target===dialog){
        closeDialog();
      }
    });

    dialog.querySelectorAll?.('[data-about-close]').forEach(btn=>{
      btn.addEventListener('click',event=>{
        event.preventDefault();
        closeDialog();
      });
    });
  }

  function initRippleObserver(){
    hydrateRipples();
    const observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        mutation.addedNodes.forEach(node=>{
          if(!(node instanceof Element)) return;
          hydrateRipples(node);
          initCardNavigation(node);
        });
      }
    });
    if(document.body){
      observer.observe(document.body,{childList:true,subtree:true});
    }
  }

  function hydrateRipples(scope=document){
    scope.querySelectorAll?.('.btn,[data-ripple],.icon-btn').forEach(attachRipple);
  }

  function attachRipple(el){
    if(!el || rippleTargets.has(el)) return;
    rippleTargets.add(el);
    const ripple=document.createElement('span');
    ripple.className='ripple';
    el.appendChild(ripple);
    let timeout=null;
    const trigger=event=>{
      if(el.disabled || el.getAttribute?.('aria-disabled')==='true') return;
      const rect=el.getBoundingClientRect();
      const size=Math.hypot(rect.width,rect.height);
      let x=rect.width/2;
      let y=rect.height/2;
      if(event && 'clientX' in event){
        x=event.clientX-rect.left;
        y=event.clientY-rect.top;
      }
      ripple.style.setProperty('--ripple-size',`${size*2}px`);
      ripple.style.setProperty('--ripple-x',`${x}px`);
      ripple.style.setProperty('--ripple-y',`${y}px`);
      ripple.classList.remove('is-active');
      void ripple.offsetWidth;
      ripple.classList.add('is-active');
      if(timeout){
        cancelAnimationFrame(timeout);
        timeout=null;
      }
      timeout=requestAnimationFrame(()=>{
        window.setTimeout(()=>ripple.classList.remove('is-active'),450);
      });
    };
    el.addEventListener('pointerdown',trigger,{passive:true});
    el.addEventListener('keydown',evt=>{
      if(evt.key==='Enter' || evt.key===' '){
        trigger();
      }
    });
  }
})();
