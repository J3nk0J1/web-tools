(function(){
  const htmlInput=document.getElementById('htmlInput');
  const cssInput=document.getElementById('cssInput');
  const jsInput=document.getElementById('jsInput');
  const statusList=document.getElementById('statusList');
  const previewFrame=document.getElementById('previewFrame');
  const resetButton=document.getElementById('resetButton');

  if(!htmlInput||!cssInput||!jsInput||!statusList||!previewFrame) return;

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

  const debounce=(fn,delay=180)=>{
    let t; return (...args)=>{clearTimeout(t); t=setTimeout(()=>fn(...args),delay);};
  };

  function escapeScript(content){
    return content.replace(/<\/(script)/gi,'<\\/$1');
  }

  function updatePreview(){
    const doc=`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${state.css}</style></head><body>${state.html}<script>${escapeScript(state.js)}<\/script></body></html>`;
    previewFrame.srcdoc=doc;
  }

  function setStatus(items){
    statusList.innerHTML='';
    const fragment=document.createDocumentFragment();
    items.forEach(item=>{
      const li=document.createElement('li');
      li.className=`status-item ${item.ok?'ok':'error'}`;
      const iconSpan=document.createElement('span');
      iconSpan.setAttribute('aria-hidden','true');
      iconSpan.textContent=item.ok?'✅':'⚠️';
      const textWrap=document.createElement('div');
      const strong=document.createElement('strong');
      strong.textContent=item.title;
      const messageSpan=document.createElement('span');
      messageSpan.textContent=item.message;
      textWrap.append(strong,messageSpan);
      li.append(iconSpan,textWrap);
      fragment.appendChild(li);
    });
    statusList.appendChild(fragment);
  }

  function validateHTML(markup){
    try{
      const parser=new DOMParser();
      const parsed=parser.parseFromString(markup,'text/html');
      const errorNode=parsed.querySelector('parsererror');
      if(errorNode){
        return [{ok:false,title:'HTML issue',message:errorNode.textContent.trim()}];
      }
      return [{ok:true,title:'HTML looks good',message:'No parsing issues detected.'}];
    }catch(err){
      return [{ok:false,title:'HTML issue',message:err.message||'Unable to parse HTML.'}];
    }
  }

  function validateCSS(css){
    if(!css.trim()){
      return [{ok:true,title:'CSS is empty',message:'Add styles to enhance your page.'}];
    }
    if('CSSStyleSheet' in window){
      try{
        const sheet=new CSSStyleSheet();
        sheet.replaceSync(css);
        return [{ok:true,title:'CSS looks good',message:'Parsed without syntax errors.'}];
      }catch(err){
        return [{ok:false,title:'CSS issue',message:err.message||'Unable to parse CSS.'}];
      }
    }
    try{
      document.createElement('style').textContent=css;
      return [{ok:true,title:'CSS looks good',message:'No syntax errors detected.'}];
    }catch(err){
      return [{ok:false,title:'CSS issue',message:err.message||'Unable to parse CSS.'}];
    }
  }

  function validateJS(code){
    if(!code.trim()){
      return [{ok:true,title:'JavaScript is empty',message:'Add script to bring interactivity.'}];
    }
    try{
      new Function(code);
      return [{ok:true,title:'JavaScript looks good',message:'Parsed without syntax errors.'}];
    }catch(err){
      return [{ok:false,title:'JavaScript issue',message:err.message||'Unable to parse JavaScript.'}];
    }
  }

  function refresh(){
    const messages=[...validateHTML(state.html),...validateCSS(state.css),...validateJS(state.js)];
    setStatus(messages);
    updatePreview();
  }

  const runRefresh=debounce(refresh,120);

  htmlInput.value=state.html;
  cssInput.value=state.css;
  jsInput.value=state.js;

  htmlInput.addEventListener('input',()=>{state.html=htmlInput.value; runRefresh();});
  cssInput.addEventListener('input',()=>{state.css=cssInput.value; runRefresh();});
  jsInput.addEventListener('input',()=>{state.js=jsInput.value; runRefresh();});

  resetButton?.addEventListener('click',()=>{
    htmlInput.value=state.html=DEFAULT_HTML;
    cssInput.value=state.css=DEFAULT_CSS;
    jsInput.value=state.js=DEFAULT_JS;
    refresh();
  });

  refresh();
})();
