(function(){
  document.getElementById('backToDashboard')?.addEventListener('click', () => {
    window.location.href='../../index.html';
  });

  const htmlInput=document.getElementById('htmlInput');
  const cssInput=document.getElementById('cssInput');
  const jsInput=document.getElementById('jsInput');
  const statusDetails=document.getElementById('statusDetails');
  const statusSummary=document.getElementById('statusSummary');
  const previewFrame=document.getElementById('previewFrame');
  const resetButton=document.getElementById('resetButton');

  if(!htmlInput||!cssInput||!jsInput||!statusDetails||!statusSummary||!previewFrame) return;

  const summaryCards=Array.from(statusSummary.querySelectorAll('.summary-card')).reduce((acc,card)=>{
    const key=(card.dataset.lang||'').toLowerCase();
    if(key) acc[key]=card;
    return acc;
  },{});

  const lineNumberUpdaters=[];

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
    statusDetails.innerHTML='';
    const iconMap={warn:'⚠︎',error:'✖︎'};
    const severityRank={ok:0,warn:1,error:2};
    const summaryDefaults={
      html:{label:'HTML',level:'ok',message:'',detail:''},
      css:{label:'CSS',level:'ok',message:'',detail:''},
      js:{label:'JavaScript',level:'ok',message:'',detail:''}
    };

    const fallbackMessage={
      html:'Parsed without syntax errors.',
      css:'Parsed without syntax errors.',
      js:'Parsed without syntax errors.'
    };

    items.forEach(item=>{
      const rawTitle=(item.title||'').toLowerCase();
      const key=rawTitle.includes('java')?'js':rawTitle;
      if(!summaryDefaults[key]) return;
      const level=item.level||(item.ok===false?'error':'ok');
      const current=summaryDefaults[key];
      if(severityRank[level]>severityRank[current.level]){
        summaryDefaults[key]={
          label:current.label,
          level,
          message:item.message||fallbackMessage[key],
          detail:item.detail||''
        };
        return;
      }
      if(!current.message&&item.message){
        current.message=item.message;
      }
      if(!current.detail&&item.detail){
        current.detail=item.detail;
      }
    });

    Object.entries(summaryDefaults).forEach(([key,data])=>{
      const card=summaryCards[key];
      if(!card) return;
      const level=data.level||'ok';
      const statusText=level==='error'?'Errors found':level==='warn'?'Check warnings':'Looks good';
      const messageText=data.message||fallbackMessage[key];
      card.classList.remove('ok','warn','error');
      card.classList.add(level);
      const statusEl=card.querySelector('.summary-status');
      const detailEl=card.querySelector('.summary-detail');
      if(statusEl) statusEl.textContent=statusText;
      if(detailEl) detailEl.textContent=messageText;
    });

    const issues=items.filter(item=>{
      const level=item.level||(item.ok===false?'error':'ok');
      return level==='warn'||level==='error';
    });

    if(!issues.length){
      const empty=document.createElement('li');
      empty.className='status-empty';
      empty.textContent='No validation issues detected.';
      statusDetails.appendChild(empty);
      return;
    }

    const fragment=document.createDocumentFragment();
    issues.forEach(item=>{
      const level=item.level||(item.ok===false?'error':'warn');
      const li=document.createElement('li');
      li.className=`status-item ${level}`;
      li.setAttribute('data-check',item.id||(item.title||'').toLowerCase().replace(/\s+/g,'-'));

      const iconSpan=document.createElement('span');
      iconSpan.className='status-icon';
      iconSpan.setAttribute('aria-hidden','true');
      iconSpan.textContent=item.icon||iconMap[level]||'•';

      const labelSpan=document.createElement('span');
      labelSpan.className='status-label';
      labelSpan.textContent=item.title||'';

      const messageSpan=document.createElement('span');
      messageSpan.className='status-message';
      messageSpan.textContent=item.message||'';

      li.append(iconSpan,labelSpan,messageSpan);

      if(item.detail){
        const detail=document.createElement('code');
        detail.className='status-detail';
        detail.textContent=item.detail;
        li.appendChild(detail);
      }

      fragment.appendChild(li);
    });
    statusDetails.appendChild(fragment);
  }

  function setupEditorPanels(){
    const panels=document.querySelectorAll('.editor-panel');
    panels.forEach(panel=>{
      const textarea=panel.querySelector('textarea');
      const lineNumbers=panel.querySelector('.editor-line-numbers');
      const toggle=panel.querySelector('.panel-toggle');
      const body=panel.querySelector('.editor-panel__body');
      const shell=panel.querySelector('.editor-shell');
      if(!textarea||!lineNumbers||!toggle||!body||!shell) return;

      const labelId=`${panel.dataset.language||textarea.id}PanelLabel`;
      toggle.id=labelId;
      textarea.setAttribute('aria-labelledby',labelId);

      const syncHeight=()=>{
        const measured=shell.clientHeight||textarea.clientHeight;
        lineNumbers.style.height=measured?`${measured}px`:'';
      };

      const updateLineNumbers=()=>{
        const totalLines=textarea.value.split('\n').length||1;
        let output='';
        for(let i=1;i<=totalLines;i+=1){
          output+=`${i}\n`;
        }
        lineNumbers.textContent=output;
        lineNumbers.scrollTop=textarea.scrollTop;
        syncHeight();
      };

      const updatePanelMetrics=()=>{
        updateLineNumbers();
      };

      lineNumberUpdaters.push(updatePanelMetrics);

      textarea.addEventListener('input',()=>{
        updatePanelMetrics();
      });

      textarea.addEventListener('scroll',()=>{
        lineNumbers.scrollTop=textarea.scrollTop;
      });

      if(typeof ResizeObserver!=='undefined'){
        const observer=new ResizeObserver(()=>syncHeight());
        observer.observe(shell);
      }else{
        window.addEventListener('resize',syncHeight);
        shell.addEventListener('mouseup',syncHeight);
      }

      toggle.addEventListener('click',()=>{
        const isCollapsed=panel.classList.toggle('collapsed');
        body.hidden=isCollapsed;
        toggle.setAttribute('aria-expanded',(!isCollapsed).toString());
        if(!isCollapsed){
          requestAnimationFrame(()=>{
            updatePanelMetrics();
          });
        }
      });

      const initiallyCollapsed=panel.classList.contains('collapsed');
      body.hidden=initiallyCollapsed;
      toggle.setAttribute('aria-expanded',(!initiallyCollapsed).toString());
      updatePanelMetrics();
    });
  }

  const styleProbe=document.createElement('div').style;

  function formatLocation(index,source){
    if(typeof index!=='number'||index<0||!source) return '';
    let line=1; let column=1;
    for(let i=0;i<index;i+=1){
      if(source[i]==='\n'){ line+=1; column=1; }
      else { column+=1; }
    }
    return `Line ${line}, column ${column}`;
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
        const parsedError=parseHTMLParserError(errorNode.textContent||'');
        return [{level:'error',title:'HTML',message:parsedError.message,detail:parsedError.detail}];
      }
      const messages=[{level:'ok',title:'HTML',message:'Parsed without syntax errors.'}];
      const ids=new Set();
      const duplicateIds=new Set();
      parsed.querySelectorAll('[id]').forEach(el=>{
        const id=(el.getAttribute('id')||'').trim();
        if(!id) return;
        if(ids.has(id)) duplicateIds.add(`#${id}`);
        else ids.add(id);
      });
      if(duplicateIds.size){
        messages.push({level:'warn',title:'HTML',message:'Duplicate id attributes detected.',detail:Array.from(duplicateIds).join(', ')});
      }
      const missingAlt=[];
      parsed.querySelectorAll('img').forEach(img=>{
        const alt=img.getAttribute('alt');
        if(alt===null||alt.trim()===''){
          const src=img.getAttribute('src');
          missingAlt.push(src?`<img src="${src}">`:'<img>');
        }
      });
      if(missingAlt.length){
        messages.push({level:'warn',title:'HTML',message:'Images missing descriptive alt text.',detail:missingAlt.slice(0,4).join(', ')+(missingAlt.length>4?` …and ${missingAlt.length-4} more`:'')});
      }
      const anchorIssues=[];
      parsed.querySelectorAll('a').forEach(anchor=>{
        const href=anchor.getAttribute('href');
        if(href===null||href.trim()===''){
          const text=collapseWhitespace(anchor.textContent||'');
          anchorIssues.push(text?`<a>${text}</a>`:'<a>…</a>');
        }
      });
      if(anchorIssues.length){
        messages.push({level:'warn',title:'HTML',message:'Anchor tags missing href attributes.',detail:anchorIssues.slice(0,4).join(', ')+(anchorIssues.length>4?` …and ${anchorIssues.length-4} more`:'')});
      }
      return messages;
    }catch(err){
      const message=err&&err.message?err.message:'Unable to parse HTML.';
      return [{level:'error',title:'HTML',message}];
    }
  }

  function checkCssDeclarations(css){
    const declarationRegex=/(?:^|[;{])\s*([\-\w]+)\s*:\s*([^;}{]+)/g;
    const unknownProps=[];
    const invalidValues=[];
    let match;
    while((match=declarationRegex.exec(css))){
      const property=(match[1]||'').trim();
      const canonicalProperty=property.toLowerCase();
      if(!canonicalProperty||canonicalProperty.startsWith('--')||canonicalProperty.startsWith('@')||canonicalProperty.startsWith('-')) continue;
      const rawValue=(match[2]||'').trim();
      const value=rawValue.replace(/\s*!important\s*$/i,'');
      const propertyIndex=match.index + match[0].indexOf(match[1]);
      const valueIndex=match.index + match[0].indexOf(match[2]);
      let propertyKnown=true;
      if(styleProbe){
        styleProbe.removeProperty(canonicalProperty);
        styleProbe.setProperty(canonicalProperty,'initial');
        propertyKnown=styleProbe.getPropertyValue(canonicalProperty)!=='';
        styleProbe.removeProperty(canonicalProperty);
        if(!propertyKnown&&typeof CSS!=='undefined'&&CSS.supports){
          try{propertyKnown=CSS.supports(`${canonicalProperty}: initial`);}catch(_){/* ignore */}
        }
      }
      if(!propertyKnown){
        unknownProps.push({property,index:propertyIndex});
        continue;
      }
      if(styleProbe&&value){
        styleProbe.setProperty(canonicalProperty,value);
        const applied=styleProbe.getPropertyValue(canonicalProperty);
        let supported=!!applied;
        if(!supported&&typeof CSS!=='undefined'&&CSS.supports){
          try{supported=CSS.supports(`${canonicalProperty}: ${value}`);}catch(_){/* ignore */}
        }
        if(!supported){
          invalidValues.push({property,value:rawValue,index:valueIndex});
        }
        styleProbe.removeProperty(canonicalProperty);
      }
    }
    return {unknownProps,invalidValues};
  }

  function validateCSS(css){
    if(!css.trim()){
      return [{level:'ok',title:'CSS',message:'Stylesheet is empty — add styles to enhance your page.'}];
    }
    if('CSSStyleSheet' in window){
      try{
        const sheet=new CSSStyleSheet();
        sheet.replaceSync(css);
      }catch(err){
        const parsed=parseCssError(err);
        return [{level:'error',title:'CSS',message:parsed.message,detail:parsed.detail}];
      }
    }else{
      try{
        document.createElement('style').textContent=css;
      }catch(err){
        const parsed=parseCssError(err);
        return [{level:'error',title:'CSS',message:parsed.message,detail:parsed.detail}];
      }
    }
    const messages=[{level:'ok',title:'CSS',message:'Parsed without syntax errors.'}];
    const {unknownProps,invalidValues}=checkCssDeclarations(css);
    if(unknownProps.length){
      const detail=unknownProps.map(item=>`${item.property} (${formatLocation(item.index,css)})`).join(', ');
      messages.push({level:'warn',title:'CSS',message:'Unrecognised property names detected.',detail});
    }
    if(invalidValues.length){
      const detail=invalidValues.map(item=>`${item.property}: ${collapseWhitespace(item.value)} (${formatLocation(item.index,css)})`).join(', ');
      messages.push({level:'warn',title:'CSS',message:'Values that the browser cannot apply were found.',detail});
    }
    return messages;
  }

  const JS_TYPO_RULES=[
    {regex:/\.lenght\b/gi,message:'Property ".lenght" looks like a typo.',suggestion:'Did you mean ".length"?'},
    {regex:/getElementByID\b/gi,message:'`getElementByID` uses the wrong casing.',suggestion:'Use `getElementById`.'},
    {regex:/querySeletor(All)?\b/gi,message:'`querySeletor` is misspelled.',suggestion:'Use `querySelector`/`querySelectorAll`.'},
    {regex:/addEventLister\b/gi,message:'`addEventLister` is misspelled.',suggestion:'Use `addEventListener`.'},
    {regex:/addeventlistener\b/gi,message:'`addeventlistener` should be camelCased.',suggestion:'Use `addEventListener`.'},
    {regex:/console\.(?:lo{2}g|logg)\b/gi,message:'`console.log` seems to be misspelled.',suggestion:'Use `console.log`.'},
    {regex:/setTimout\b/gi,message:'`setTimout` is misspelled.',suggestion:'Use `setTimeout`.'}
  ];

  function detectJsTypos(code){
    const warnings=[];
    JS_TYPO_RULES.forEach(rule=>{
      rule.regex.lastIndex=0;
      let match;
      while((match=rule.regex.exec(code))){
        const location=formatLocation(match.index,code);
        warnings.push({level:'warn',title:'JavaScript',message:rule.message,detail:location?`${location} · ${rule.suggestion}`:rule.suggestion});
      }
    });
    return warnings;
  }

  function validateJS(code){
    if(!code.trim()){
      return [{level:'ok',title:'JavaScript',message:'Script panel is empty — add code to bring interactivity.'}];
    }
    try{
      // Syntax check
      new Function(code);
    }catch(err){
      const parsed=parseJsError(err);
      return [{level:'error',title:'JavaScript',message:parsed.message,detail:parsed.detail}];
    }
    const messages=[{level:'ok',title:'JavaScript',message:'Parsed without syntax errors.'}];
    const typoWarnings=detectJsTypos(code);
    if(typoWarnings.length){
      messages.push(...typoWarnings);
    }
    return messages;
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

  setupEditorPanels();
  lineNumberUpdaters.forEach(fn=>fn());

  htmlInput.addEventListener('input',()=>{state.html=htmlInput.value; runRefresh();});
  cssInput.addEventListener('input',()=>{state.css=cssInput.value; runRefresh();});
  jsInput.addEventListener('input',()=>{state.js=jsInput.value; runRefresh();});

  resetButton?.addEventListener('click',()=>{
    htmlInput.value=state.html=DEFAULT_HTML;
    cssInput.value=state.css=DEFAULT_CSS;
    jsInput.value=state.js=DEFAULT_JS;
    lineNumberUpdaters.forEach(fn=>fn());
    refresh();
  });

  refresh();
})();
