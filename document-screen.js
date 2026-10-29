import {DOCUMENT_PAGES} from './document-pages.js';

// La dirección principal es común al catálogo, al visor y a la impresión.
// No se abandona la app para abrir un archivo ni se depende de /viewer.html.
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function returnURL(params) {
  const hash=params.get('return')||'';
  const id=params.get('id')||'';
  if(/^#[a-zA-Z0-9_\-/%.?=&]*$/.test(hash))return './'+hash;
  return id?'./#ficha/'+encodeURIComponent(id):'./';
}

function readyStylesheet(href) {
  const absolute=new URL(href,document.baseURI).href;
  let link=[...document.querySelectorAll('link[rel="stylesheet"]')].find(item=>item.href===absolute);
  if(link?.sheet)return Promise.resolve(link);
  const fresh=!link;
  if(fresh){link=document.createElement('link');link.rel='stylesheet';link.href=href;}
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);link.removeEventListener('load',loaded);link.removeEventListener('error',failed);};
    const loaded=()=>{cleanup();resolve(link);};
    const failed=()=>{cleanup();reject(new Error('No se pudo cargar el formato del documento.'));};
    const timer=setTimeout(failed,8000);
    link.addEventListener('load',loaded,{once:true});link.addEventListener('error',failed,{once:true});
    if(fresh)document.head.append(link);
  });
}

export function mountDocumentScreen() {
  const params=new URLSearchParams(location.search);
  const screen=params.get('screen');
  const page=['source','print'].includes(screen)?DOCUMENT_PAGES[screen]:null;
  if(!page)return false;
  const back=returnURL(params);
  const entry=window.ReferenceDocumentEntry;
  const shell=document.getElementById('document-entry-shell');
  document.title=page.title;
  document.body.innerHTML=page.body;
  if(shell)document.body.append(shell);
  // El enlace queda operativo antes de cargar datos, imágenes o módulos.
  const returnLink=document.getElementById(screen==='source'?'return':'return-to-card');
  if(returnLink)returnLink.href=back;
  (async()=>{
    // La vista conserva su pantalla de carga hasta tener el formato correcto.
    // No se pinta primero el catálogo ni se muestra HTML sin estilos.
    const styles=await Promise.all([...new Set([...page.css,'pdf-actions.css'])].map(readyStylesheet));
    if(entry?.state==='failed')return;
    for(const stylesheet of document.querySelectorAll('link[rel="stylesheet"]'))if(!styles.includes(stylesheet))stylesheet.remove();
    for(const script of page.scripts){
      if(!/^(?:\.\/)?[a-z0-9-]+\.js$/i.test(script))throw Error('Script documental inválido');
      const imported=await import(new URL(script,import.meta.url).href);
      // El módulo puede haberse importado antes para imprimir desde una ficha.
      // Inicialice la vista recién montada, aunque el módulo esté en memoria.
      if(imported?.initialisePrintDocument)await imported.initialisePrintDocument();
      else if(imported?.printReady)await imported.printReady;
      if(entry?.state==='failed')return;
    }
    entry?.ready();
  })().catch(()=>{
    if(entry){entry.fail();return;}
    document.body.innerHTML=`<header class="print-toolbar viewer-header"><a class="button back" href="${escapeHTML(back)}">← Volver a la ficha</a></header><main><section class="doc-heading status"><h1>No se pudo abrir esta vista</h1><p>La ficha sigue disponible. Puede volver o reintentar la carga.</p><a class="button" href="${escapeHTML(location.href)}">Reintentar</a></section></main>`;
  });
  return true;
}
