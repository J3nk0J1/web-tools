(function(){
  const backBtn=document.getElementById('backToDashboard');
  backBtn?.addEventListener('click',()=>{window.location.href='../../index.html';});

  const htmlInput=document.getElementById('htmlInput');
  const cssInput=document.getElementById('cssInput');
  const jsInput=document.getElementById('jsInput');
  const previewFrame=document.getElementById('previewFrame');
  const resetButton=document.getElementById('resetButton');

  if(!htmlInput||!cssInput||!jsInput||!previewFrame||!resetButton) return;

  const DEFAULT_HTML=`<main class="preview">
  <h1>Hello, playground!</h1>
  <p>Edit the panels to see changes instantly.</p>
  <button id="clicker">Click me</button>
</main>`;
  const DEFAULT_CSS=`:root {
  font-family: system-ui, sans-serif;
  color: #222;
}

body {
  padding: 2rem;
  background: radial-gradient(circle at top, #f5f7ff, #e0e7ff);
}

.preview {
  max-width: 32rem;
  margin: 0 auto;
  padding: 2rem;
  border-radius: 1rem;
  background: white;
  box-shadow: 0 1.25rem 2.5rem -1.5rem rgba(41, 98, 255, 0.8);
  display: grid;
  gap: 1rem;
}

#clicker {
  padding: 0.75rem 1.5rem;
  border-radius: 999px;
  background: #2962ff;
  color: white;
  border: none;
  font-weight: 600;
  cursor: pointer;
}

#clicker:hover {
  filter: brightness(1.1);
}`;
  const DEFAULT_JS=`const button = document.getElementById('clicker');
if (button) {
  button.addEventListener('click', () => {
    button.textContent = 'Clicked!';
  });
}`;

  const state={html:DEFAULT_HTML,css:DEFAULT_CSS,js:DEFAULT_JS};

  const escapeScript=content=>content.replace(/<\/(script)/gi,'<\\/$1');

  function updatePreview(){
    const doc=`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${state.css}</style></head><body>${state.html}<script>${escapeScript(state.js)}<\/script></body></html>`;
    previewFrame.srcdoc=doc;
  }

  function updateLineNumbers(textarea,lineNumbers){
    const totalLines=(textarea.value.match(/\n/g)||[]).length+1;
    let output='';
    for(let i=1;i<=totalLines;i+=1){
      output+=`${i}\n`;
    }
    lineNumbers.textContent=output;
    lineNumbers.scrollTop=textarea.scrollTop;
  }

  function syncLineNumberHeight(shell,lineNumbers){
    const height=shell.clientHeight||shell.offsetHeight;
    if(height){
      lineNumbers.style.height=`${height}px`;
    }
  }

  function bindEditor(panel){
    const textarea=panel.querySelector('textarea');
    const lineNumbers=panel.querySelector('.editor-line-numbers');
    const toggle=panel.querySelector('.panel-toggle');
    const body=panel.querySelector('.editor-panel__body');
    const shell=panel.querySelector('.editor-shell');
    if(!textarea||!lineNumbers||!toggle||!body||!shell) return;

    const language=panel.dataset.language||textarea.id.replace('Input','').toLowerCase();
    const labelId=`${language}PanelLabel`;
    toggle.id=labelId;
    textarea.setAttribute('aria-labelledby',labelId);

    const refresh=()=>{
      updateLineNumbers(textarea,lineNumbers);
      syncLineNumberHeight(shell,lineNumbers);
    };

    textarea.addEventListener('input',()=>{
      state[language]=textarea.value;
      refresh();
      updatePreview();
    });

    textarea.addEventListener('scroll',()=>{
      lineNumbers.scrollTop=textarea.scrollTop;
    });

    if(typeof ResizeObserver!=='undefined'){
      const observer=new ResizeObserver(()=>syncLineNumberHeight(shell,lineNumbers));
      observer.observe(shell);
    }else{
      window.addEventListener('resize',()=>syncLineNumberHeight(shell,lineNumbers));
    }

    toggle.addEventListener('click',()=>{
      const collapsed=panel.classList.toggle('collapsed');
      body.hidden=collapsed;
      toggle.setAttribute('aria-expanded',(!collapsed).toString());
      if(!collapsed){
        requestAnimationFrame(refresh);
      }
    });

    const collapsed=panel.classList.contains('collapsed');
    body.hidden=collapsed;
    toggle.setAttribute('aria-expanded',(!collapsed).toString());
    refresh();
  }

  document.querySelectorAll('.editor-panel').forEach(bindEditor);

  function loadDefaults(){
    htmlInput.value=state.html=DEFAULT_HTML;
    cssInput.value=state.css=DEFAULT_CSS;
    jsInput.value=state.js=DEFAULT_JS;
    document.querySelectorAll('.editor-panel').forEach(panel=>{
      const textarea=panel.querySelector('textarea');
      const lineNumbers=panel.querySelector('.editor-line-numbers');
      const shell=panel.querySelector('.editor-shell');
      if(textarea&&lineNumbers&&shell){
        updateLineNumbers(textarea,lineNumbers);
        syncLineNumberHeight(shell,lineNumbers);
      }
    });
    updatePreview();
  }

  resetButton.addEventListener('click',()=>{
    loadDefaults();
  });

  loadDefaults();
})();
