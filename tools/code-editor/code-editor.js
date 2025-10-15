(function(){
  document.getElementById('backToDashboard')?.addEventListener('click', () => {
    window.location.href='../../index.html';
  });

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
      li.setAttribute('data-check',item.title.toLowerCase());

      const iconSpan=document.createElement('span');
      iconSpan.className='status-icon';
      iconSpan.setAttribute('aria-hidden','true');
      iconSpan.textContent=item.ok?'✔︎':'⚠︎';

      const labelSpan=document.createElement('span');
      labelSpan.className='status-label';
      labelSpan.textContent=item.title;

      const messageSpan=document.createElement('span');
      messageSpan.className='status-message';
      messageSpan.textContent=item.message;

      li.append(iconSpan,labelSpan,messageSpan);

      if(item.detail){
        const detail=document.createElement('code');
        detail.className='status-detail';
        detail.textContent=item.detail;
        li.appendChild(detail);
      }

      fragment.appendChild(li);
    });
    statusList.appendChild(fragment);
  }

  const collapseWhitespace=str=>str.replace(/\s+/g,' ').trim();

  function parseHTMLParserError(raw){
    if(!raw) return {message:'Unable to parse HTML.'};
    const lines=raw.split('\n').map(line=>line.trim()).filter(Boolean);
    const messageLine=lines.find(line=>/^Error:/i.test(line))||lines[0];
    const message=messageLine?messageLine.replace(/^Error:\s*/i,'').trim():'Unable to parse HTML.';
    const lineInfo=lines.find(line=>/^Line(\s|:)/i.test(line));
    const columnInfo=lines.find(line=>/^Column(\s|:)/i.test(line));
    const sourceInfo=lines.find(line=>/^Source/i.test(line));
    const detailParts=[];
    if(lineInfo) detailParts.push(lineInfo.replace(/^Line\s*:?/i,'Line ').trim());
    if(columnInfo) detailParts.push(columnInfo.replace(/^Column\s*:?/i,'Column ').trim());
    if(sourceInfo){
      const snippet=collapseWhitespace(sourceInfo.replace(/^Source\s*:?/i,'').trim());
      if(snippet) detailParts.push(`Source: ${snippet.length>120?`${snippet.slice(0,117)}…`:snippet}`);
    }
    return {message,detail:detailParts.join(' · ')||undefined};
  }

  function parseCssError(err){
    const rawMessage=err&&err.message?err.message:'Unable to parse CSS.';
    const cleaned=rawMessage.replace(/CSSStyleSheet\\.replaceSync:\s*/,'').trim();
    const detailParts=[];
    const locationMatch=cleaned.match(/line\s*(\d+)(?:[,\s]+column\s*(\d+))?/i);
    if(locationMatch){
      detailParts.push(`Line ${locationMatch[1]}`);
      if(locationMatch[2]) detailParts.push(`Column ${locationMatch[2]}`);
    }
    const snippetMatch=cleaned.match(/Failed to parse:?\s*([\s\S]+)/i);
    if(snippetMatch){
      const snippet=collapseWhitespace(snippetMatch[1]);
      if(snippet) detailParts.push(snippet.length>120?`${snippet.slice(0,117)}…`:snippet);
    }
    const message=cleaned.replace(/Failed to parse:?\s*[\s\S]*/i,'').trim()||'CSS contains a syntax error.';
    return {message,detail:detailParts.join(' · ')||undefined};
  }

  function parseJsError(err){
    const message=err&&err.message?err.message:'JavaScript contains a syntax error.';
    let detail;
    if(err&&err.stack){
      const match=err.stack.match(/anonymous:(\d+):(\d+)/);
      if(match){
        detail=`Line ${match[1]}, column ${match[2]}`;
      }
    }
    return {message,detail};
  }

  function validateHTML(markup){
    try{
      const parser=new DOMParser();
      const parsed=parser.parseFromString(markup,'text/html');
      const errorNode=parsed.querySelector('parsererror');
      if(errorNode){
        const parsed=parseHTMLParserError(errorNode.textContent||'');
        return [{ok:false,title:'HTML',message:parsed.message,detail:parsed.detail}];
      }
      return [{ok:true,title:'HTML',message:'No parsing issues detected.'}];
    }catch(err){
      const message=err&&err.message?err.message:'Unable to parse HTML.';
      return [{ok:false,title:'HTML',message}];
    }
  }

  function validateCSS(css){
    if(!css.trim()){
      return [{ok:true,title:'CSS',message:'Stylesheet is empty — add styles to enhance your page.'}];
    }
    if('CSSStyleSheet' in window){
      try{
        const sheet=new CSSStyleSheet();
        sheet.replaceSync(css);
        return [{ok:true,title:'CSS',message:'Parsed without syntax errors.'}];
      }catch(err){
        const parsed=parseCssError(err);
        return [{ok:false,title:'CSS',message:parsed.message,detail:parsed.detail}];
      }
    }
    try{
      document.createElement('style').textContent=css;
      return [{ok:true,title:'CSS',message:'No syntax errors detected.'}];
    }catch(err){
      const parsed=parseCssError(err);
      return [{ok:false,title:'CSS',message:parsed.message,detail:parsed.detail}];
    }
  }

  function validateJS(code){
    if(!code.trim()){
      return [{ok:true,title:'JavaScript',message:'Script panel is empty — add code to bring interactivity.'}];
    }
    try{
      new Function(code);
      return [{ok:true,title:'JavaScript',message:'Parsed without syntax errors.'}];
    }catch(err){
      const parsed=parseJsError(err);
      return [{ok:false,title:'JavaScript',message:parsed.message,detail:parsed.detail}];
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
