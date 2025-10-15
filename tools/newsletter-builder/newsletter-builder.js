(function(){
  const els = {
    headerTitle: document.getElementById('headerTitle'),
    headerBg: document.getElementById('headerBg'),
    emailBg: document.getElementById('emailBg'),
    bodyWidth: document.getElementById('bodyWidth'),
    intro: document.getElementById('intro'),
    footer1: document.getElementById('footer1'),
    footer2: document.getElementById('footer2'),
    footerLinkText: document.getElementById('footerLinkText'),
    footerLinkUrl: document.getElementById('footerLinkUrl'),
    articleCount: document.getElementById('articleCount'),
    articleContainer: document.getElementById('articles'),
    addArticleBtn: document.getElementById('addArticleBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    copyBtn: document.getElementById('copyBtn'),
    preview: document.getElementById('preview'),
    status: document.getElementById('statusMessage')
  };

  const state = {
    headerTitle: '',
    headerBg: '#2962ff',
    emailBg: '#f1f3f9',
    bodyWidth: 600,
    intro: '',
    footer1: '',
    footer2: '',
    footerLinkText: '',
    footerLinkUrl: '',
    articles: []
  };

  let pendingRender = null;

  const STATUS_CLASS_MAP = {
    info: 'status--info',
    success: 'status--success',
    error: 'status--error',
    warning: 'status--warning'
  };
  const STATUS_CLASSES = Object.values(STATUS_CLASS_MAP);

  function setStatus(message='', type='info'){
    if(!els.status) return;
    els.status.classList.remove(...STATUS_CLASSES);
    if(!message){
      els.status.textContent='';
      els.status.setAttribute('hidden','');
      return;
    }
    els.status.textContent = message;
    els.status.removeAttribute('hidden');
    els.status.classList.add(STATUS_CLASS_MAP[type] || STATUS_CLASS_MAP.info);
  }

  function clampBodyWidth(value){
    const numeric = Number.parseInt(value,10);
    if(Number.isNaN(numeric)) return 600;
    return Math.min(900, Math.max(480, numeric));
  }

  function escapeHtml(input=''){
    return input.replace(/[&<>"']/g, char=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    })[char] || char);
  }

  function escapeAttribute(input=''){
    return escapeHtml(input).replace(/`/g,'&#96;');
  }

  function formatMultiline(text=''){
    return escapeHtml(text).replace(/\r?\n/g,'<br />');
  }

  function addArticle(initial={}){
    const article = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      title: initial.title || '',
      url: initial.url || '',
      summary: initial.summary || '',
      imageUrl: initial.imageUrl || '',
      imageAlt: initial.imageAlt || ''
    };
    state.articles.push(article);
    renderArticles();
    schedulePreviewUpdate();
  }

  function removeArticle(id){
    state.articles = state.articles.filter(article=>article.id!==id);
    renderArticles();
    schedulePreviewUpdate();
  }

  function moveArticle(id, direction){
    const index = state.articles.findIndex(article=>article.id===id);
    if(index<0) return;
    const target = index + direction;
    if(target<0 || target>=state.articles.length) return;
    const [item] = state.articles.splice(index,1);
    state.articles.splice(target,0,item);
    renderArticles();
    schedulePreviewUpdate();
  }

  function createField({label,type='text',value='',onInput,textarea=false,placeholder='',id}){
    const field=document.createElement('div');
    field.className='field';
    const labelEl=document.createElement('label');
    labelEl.textContent=label;
    if(id) labelEl.setAttribute('for', id);
    const control=textarea?document.createElement('textarea'):document.createElement('input');
    if(!textarea) control.type=type;
    control.value=value;
    if(placeholder) control.placeholder=placeholder;
    if(id) control.id=id;
    control.addEventListener('input',evt=>{onInput?.(evt.target.value); schedulePreviewUpdate();});
    control.className='input';
    field.append(labelEl,control);
    return field;
  }

  function renderArticles(){
    if(!els.articleContainer) return;
    els.articleContainer.innerHTML='';
    if(!state.articles.length){
      const empty=document.createElement('p');
      empty.className='newsletter-empty';
      empty.textContent='No articles added yet. Use the “Add article” button to get started.';
      els.articleContainer.appendChild(empty);
    }
    state.articles.forEach((article,index)=>{
      const card=document.createElement('article');
      card.className='article-card';
      const header=document.createElement('div');
      header.className='article-card__header';
      const title=document.createElement('h3');
      title.className='article-card__title';
      title.textContent=`Article ${index+1}`;
      const actions=document.createElement('div');
      actions.className='article-card__actions';

      const upBtn=document.createElement('button');
      upBtn.type='button';
      upBtn.className='btn btn--ghost btn--small';
      upBtn.textContent='Move up';
      upBtn.disabled=index===0;
      upBtn.addEventListener('click',()=>moveArticle(article.id,-1));

      const downBtn=document.createElement('button');
      downBtn.type='button';
      downBtn.className='btn btn--ghost btn--small';
      downBtn.textContent='Move down';
      downBtn.disabled=index===state.articles.length-1;
      downBtn.addEventListener('click',()=>moveArticle(article.id,1));

      const deleteBtn=document.createElement('button');
      deleteBtn.type='button';
      deleteBtn.className='btn btn--ghost btn--small';
      deleteBtn.textContent='Delete';
      deleteBtn.addEventListener('click',()=>removeArticle(article.id));

      actions.append(upBtn,downBtn,deleteBtn);
      header.append(title,actions);

      const fields=document.createElement('div');
      fields.className='field-group';

      fields.append(
        createField({label:'Article title', value:article.title, onInput:value=>article.title=value, placeholder:'Business Unit Name update', id:`article-${article.id}-title`} ),
        createField({label:'Article link (URL)', value:article.url, onInput:value=>article.url=value, placeholder:'https://', id:`article-${article.id}-url`} ),
        createField({label:'Summary / teaser', value:article.summary, onInput:value=>article.summary=value, textarea:true, placeholder:'Key points, context, or teaser text.', id:`article-${article.id}-summary`} ),
        createField({label:'Image URL (optional)', value:article.imageUrl, onInput:value=>article.imageUrl=value, placeholder:'https://', id:`article-${article.id}-image`} ),
        createField({label:'Image alt text', value:article.imageAlt, onInput:value=>article.imageAlt=value, placeholder:'Describe the image for accessibility', id:`article-${article.id}-alt`})
      );

      card.append(header,fields);
      els.articleContainer.appendChild(card);
    });
    if(els.articleCount) els.articleCount.textContent=String(state.articles.length);
  }

  function schedulePreviewUpdate(){
    if(pendingRender!==null){
      cancelAnimationFrame(pendingRender);
    }
    pendingRender=requestAnimationFrame(()=>{
      pendingRender=null;
      updatePreview();
    });
  }

  function updatePreview(){
    state.headerTitle=els.headerTitle?.value || '';
    state.headerBg=els.headerBg?.value || '#2962ff';
    state.emailBg=els.emailBg?.value || '#f1f3f9';
    state.bodyWidth=clampBodyWidth(els.bodyWidth?.value || 600);
    state.intro=els.intro?.value || '';
    state.footer1=els.footer1?.value || '';
    state.footer2=els.footer2?.value || '';
    state.footerLinkText=els.footerLinkText?.value || '';
    state.footerLinkUrl=els.footerLinkUrl?.value || '';

    if(els.bodyWidth) els.bodyWidth.value=state.bodyWidth;

    const html=buildEmailHtml();
    if(els.preview) els.preview.srcdoc=html;
    setStatus('Preview updated.','info');
  }

  function buildEmailHtml(){
    const headerTitle=state.headerTitle.trim();
    const headerBg=state.headerBg || '#2962ff';
    const emailBg=state.emailBg || '#f1f3f9';
    const linkColour=headerBg;
    const introBlock=createIntroSection(state.intro);
    const articlesBlock=createArticlesSection(state.articles, linkColour);
    const footerBlock=createFooterSection();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(headerTitle || 'Newsletter')}</title>
<style>
  body{margin:0;padding:0;background:${emailBg};-webkit-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;}
  .container{width:100%;}
  .content{width:${state.bodyWidth}px;max-width:100%;background:#ffffff;}
  @media screen and (max-width: ${state.bodyWidth}px){
    .content{width:100% !important;}
    .article-body{padding:0 24px !important;}
  }
</style>
</head>
<body>
  <center class="container" role="presentation" style="width:100%;background:${emailBg};padding:24px 16px;">
    <table role="presentation" class="content" align="center" style="margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:${headerBg};padding:28px 24px;text-align:center;color:#ffffff;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;letter-spacing:.3px;">
          ${escapeHtml(headerTitle || '')}
        </td>
      </tr>
      ${introBlock}
      ${articlesBlock}
      ${footerBlock}
    </table>
  </center>
</body>
</html>`;
  }

  function createIntroSection(text){
    const paragraphs=text.split(/\n+/).map(part=>part.trim()).filter(Boolean);
    if(!paragraphs.length) return '';
    const content=paragraphs.map((par,index)=>{
      const isLast=index===paragraphs.length-1;
      const margin=isLast?'0':'0 0 16px';
      return `<p style="margin:${margin};font-size:15px;line-height:1.6;color:#3d3d45;">${escapeHtml(par)}</p>`;
    }).join('');
    return `<tr>
      <td class="article-body" style="padding:28px 32px 20px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
        ${content}
      </td>
    </tr>`;
  }

  function createArticlesSection(articles, linkColour){
    if(!articles.length){
      return `<tr>
        <td class="article-body" style="padding:12px 32px 32px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#5f6472;font-size:15px;line-height:1.6;">
          <p style="margin:0;">Add articles using the builder to populate this section.</p>
        </td>
      </tr>`;
    }
    return articles.map((article,index)=>createArticleRow(article,index,linkColour)).join('');
  }

  function createArticleRow(article,index,linkColour){
    const safeTitle=article.title?.trim() || `Article ${index+1}`;
    const safeUrl=article.url?.trim();
    const titleMarkup=safeUrl ? `<a href="${escapeAttribute(safeUrl)}" style="color:${linkColour};text-decoration:none;font-weight:700;">${escapeHtml(safeTitle)}</a>` : `<span style="color:${linkColour};font-weight:700;">${escapeHtml(safeTitle)}</span>`;
    const summary=article.summary?.trim() ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#3d3d45;">${formatMultiline(article.summary.trim())}</p>` : '';
    const imageUrl=article.imageUrl?.trim();
    const imageCell=imageUrl ? `<td width="180" style="width:180px;padding:0 24px 0 0;vertical-align:top;" valign="top">
          <img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(article.imageAlt?.trim() || safeTitle)}" style="display:block;width:180px;max-width:100%;height:auto;border-radius:6px;" />
        </td>` : '';
    const textCell=`<td width="100%" valign="top" style="width:100%;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#3d3d45;font-size:15px;line-height:1.6;padding:0;vertical-align:top;">
          <h3 style="margin:0;font-size:18px;line-height:1.4;">${titleMarkup}</h3>
          ${summary}
        </td>`;
    return `<tr>
      <td class="article-body" style="padding:16px 32px 24px;font-family:Segoe UI,Helvetica,Arial,sans-serif;border-top:1px solid #ebedf5;">
        <table role="presentation" width="100%" style="border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;">
          <tr>
            ${imageCell}
            ${textCell}
          </tr>
        </table>
      </td>
    </tr>`;
  }

  function createFooterSection(){
    if(!state.footer1 && !state.footer2 && !state.footerLinkText && !state.footerLinkUrl){
      return `<tr>
        <td style="padding:24px 32px;color:#7a7f8c;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;text-align:center;border-top:1px solid #ebedf5;background:#f5f6fa;">
          <p style="margin:0;">Generated with the Newsletter Builder.</p>
        </td>
      </tr>`;
    }
    const linkText=state.footerLinkText.trim();
    const linkUrl=state.footerLinkUrl.trim();
    const footerLines=[state.footer1.trim(), state.footer2.trim()].filter(Boolean).map(line=>`<div>${escapeHtml(line)}</div>`).join('');
    const linkMarkup=linkText && linkUrl ? `<a href="${escapeAttribute(linkUrl)}" style="color:${state.headerBg};text-decoration:none;font-weight:600;">${escapeHtml(linkText)}</a>` : '';
    return `<tr>
      <td style="padding:24px 32px;color:#7a7f8c;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;text-align:center;border-top:1px solid #ebedf5;background:#f5f6fa;">
        ${footerLines || ''}
        ${linkMarkup ? `<div style="margin-top:8px;">${linkMarkup}</div>` : ''}
      </td>
    </tr>`;
  }

  function copyHtml(){
    const html=buildEmailHtml();
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(html).then(()=>{
        setStatus('HTML copied to clipboard.', 'success');
      }).catch(()=>{
        fallbackCopy(html);
      });
    }else{
      fallbackCopy(html);
    }
  }

  function fallbackCopy(html){
    const textarea=document.createElement('textarea');
    textarea.value=html;
    textarea.setAttribute('readonly','');
    textarea.style.position='absolute';
    textarea.style.left='-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try{
      const success=document.execCommand('copy');
      setStatus(success?'HTML copied to clipboard.':'Unable to copy HTML automatically.', success?'success':'error');
    }catch(err){
      setStatus('Unable to copy HTML automatically.', 'error');
    }
    document.body.removeChild(textarea);
  }

  function downloadHtml(){
    const html=buildEmailHtml();
    const blob=new Blob([html],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    const date=new Date();
    const stamp=date.toISOString().slice(0,10);
    link.download=`newsletter-${stamp}.htm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus('Download started.', 'success');
  }

  function bindEvents(){
    document.getElementById('backToDashboard')?.addEventListener('click',()=>{
      window.location.href='../../index.html';
    });
    els.addArticleBtn?.addEventListener('click',()=>addArticle());
    els.refreshBtn?.addEventListener('click',()=>{
      updatePreview();
      setStatus('Preview refreshed.', 'success');
    });
    els.copyBtn?.addEventListener('click',copyHtml);
    els.downloadBtn?.addEventListener('click',downloadHtml);

    ['headerTitle','headerBg','emailBg','bodyWidth','intro','footer1','footer2','footerLinkText','footerLinkUrl'].forEach(key=>{
      const element=els[key];
      if(!element) return;
      element.addEventListener('input',schedulePreviewUpdate);
      element.addEventListener('change',schedulePreviewUpdate);
    });
  }

  function init(){
    bindEvents();
    renderArticles();
    updatePreview();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
