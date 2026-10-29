/* Visor de fuente: una imagen por página; sin motores PDF ni modales. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 const sourceId=params.get('source');
 let source,page=1,loadNumber=0,timer;
 const back=params.get('return')||'';
 $('return').href='./'+(/^#[a-zA-Z0-9_\-/%.?=&]*$/.test(back)?back:'');
 const installed=()=>navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
 const apple=()=>/iPad|iPhone|iPod/.test(navigator.userAgent||'')||(/Macintosh/.test(navigator.userAgent||'')&&navigator.maxTouchPoints>1);
 $('print').hidden=apple()||installed();
 $('print').addEventListener('click',()=>{if($('print').disabled||$('print').hidden)return;window.print();});
 async function fetchSources(){const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);try{const r=await fetch('data/sources.json',{signal:c.signal});if(!r.ok)throw Error('sources');return await r.json();}finally{clearTimeout(t)}}
 function showError(){clearTimeout(timer);loadNumber++;$('loading').hidden=true;$('page-image').hidden=true;$('error').hidden=false;$('print').disabled=true;}
 function renderPage(n,push=true){
  if(!source)return;page=Math.max(1,Math.min(source.pageCount,Math.floor(Number(n)||1)));
  $('page').value=page;$('previous').disabled=page<=1;$('next').disabled=page>=source.pageCount;
  $('print').disabled=true;
  const url=new URL(location.href);url.searchParams.set('page',page);if(push)history.pushState({page},'',url);
  $('page-image').hidden=true;$('error').hidden=true;$('loading').hidden=false;
  const seq=++loadNumber,img=new Image();clearTimeout(timer);timer=setTimeout(()=>{if(seq===loadNumber)showError()},10000);
  img.onload=()=>{if(seq!==loadNumber)return;const shown=$('page-image');shown.src=img.src;shown.alt='Página '+page+' de '+source.titulo;shown.hidden=false;$('loading').hidden=true;$('error').hidden=true;Promise.resolve(shown.decode?shown.decode():undefined).then(()=>{if(seq===loadNumber){clearTimeout(timer);$('print').disabled=false}}).catch(()=>{if(seq===loadNumber)showError()});};
  img.onerror=()=>{if(seq===loadNumber)showError()};
  img.src=source.pageImageBase+page+'.webp';
  document.title='Página '+page+' · '+source.tema+' · Criterios de referencia';
  if(typeof window.trackReferenceEvent==='function')window.trackReferenceEvent('source_page',{source_id:source.id,page_number:page});
 }
 $('previous').addEventListener('click',()=>renderPage(page-1));$('next').addEventListener('click',()=>renderPage(page+1));
 $('page-form').addEventListener('submit',e=>{e.preventDefault();renderPage($('page').value)});$('retry').addEventListener('click',()=>source?renderPage(page,false):location.reload());
 window.addEventListener('popstate',()=>renderPage(new URLSearchParams(location.search).get('page'),false));
 fetchSources().then(sources=>{
  source=sources.find(s=>s.id===sourceId&&s.localPdf&&s.pageCount&&s.pageImageBase);
  if(!source)throw Error('unknown source');
  $('title').textContent=source.titulo;$('metadata').textContent=[source.codigo,'Fuente: '+source.alcance,'Vigencia declarada: '+source.vigencia].join(' · ');
  $('total').textContent='de '+source.pageCount;$('page').max=source.pageCount;
  const download=$('download');download.dataset.pdfUrl=source.localPdf;download.dataset.pdfName=source.titulo;download.dataset.pdfFilename=source.id+'-criterios-referencia.pdf';download.disabled=false;
  $('pdf-kind').textContent=source.derivativeNotice?'El PDF completo corresponde a la versión de lectura del documento.':'El PDF completo corresponde al documento original de esta fuente.';
  if(source.originalDocx){$('word').href=source.originalDocx;$('word').hidden=false;}
  const notice=[source.derivativeNotice,source.documentStatus==='review'?'El periodo impreso o la versión de esta fuente requiere confirmación.':null,source.provenance,source.approvalNote].filter(Boolean).join(' ');
  if(notice){$('notice').textContent=notice;$('notice').hidden=false;}
  renderPage(params.get('page'),false);
 }).catch(()=>{$('title').textContent='Documento no disponible';showError()});
})();
