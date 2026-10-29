import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const html=await fs.readFile(new URL('index.html',root),'utf8');
const bootstrap=html.match(/<script>\s*([\s\S]*?ReferenceDocumentEntry[\s\S]*?)<\/script>/)?.[1];
assert(bootstrap,'La entrada debe bloquear la vista equivocada antes de cargar los módulos.');
assert(html.indexOf(bootstrap)<html.indexOf('href="styles.css"'));
assert.match(html, /html\[data-document-entry\] body>:not\(#document-entry-shell\)\{display:none!important\}/);
assert(html.indexOf('id="document-entry-shell"')<html.indexOf('class="app-header'));
const source=(await fs.readFile(new URL('document-screen.js',root),'utf8'))
  .replace("import {DOCUMENT_PAGES} from './document-pages.js';",'')
  .replace('export function mountDocumentScreen','function mountDocumentScreen')
  .replace('await import(new URL(script,import.meta.url).href);','await moduleLoader(script);');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function boot(options={}){
  const nodes=new Map(),attrs=new Map(),links=[],events=[],imports=[],timers=new Map();let clock=0,bodyHTML='CATALOGO INICIAL';
  const location=new URL(options.url||'https://app.test/?screen=print&id=n19-adenoma');
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{id,hidden:id==='document-entry-retry',textContent:'',href:'./',removed:false,
      remove(){this.removed=true;nodes.delete(id);events.push('remove:'+id);}});
    return nodes.get(id);
  };
  for(const id of ['document-entry-shell','document-entry-return','document-entry-title','document-entry-status','document-entry-retry'])node(id);
  node('document-entry-shell').subtree=[...nodes.entries()].filter(([id])=>id!=='document-entry-shell');
  function style(href,loaded=false){
    const listeners=new Map();
    const item={href:new URL(href,location).href,sheet:loaded?{}:null,removed:false,rel:'stylesheet',
      addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
      removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
      fire(name){if(name==='load')this.sheet={};for(const fn of [...(listeners.get(name)||[])])fn();},
      remove(){this.removed=true;const i=links.indexOf(this);if(i>=0)links.splice(i,1);events.push('remove-css:'+this.href);}};
    return item;
  }
  links.push(style('styles.css',true),style('pdf-actions.css',true));
  const document={baseURI:location.href,title:'Criterios de referencia',
    documentElement:{setAttribute(name,value){attrs.set(name,value);},removeAttribute(name){attrs.delete(name);}},
    getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>links,
    createElement(tag){assert.equal(tag,'link');return style('');},
    head:{append(link){link.href=new URL(link.href,location).href;links.push(link);events.push('append-css:'+link.href);if(options.autoCSS!==false)queueMicrotask(()=>link.fire('load'));}},
    body:{get innerHTML(){return bodyHTML;},set innerHTML(value){bodyHTML=value;events.push('mount-body');for(const id of [...nodes.keys()])nodes.delete(id);for(const match of value.matchAll(/id="([^"]+)"/g))node(match[1]);},append(el){nodes.set(el.id,el);for(const[id,child]of el.subtree||[])nodes.set(id,child);events.push('append-shell');}}
  };
  const window={};
  const context={window,document,location,URL,URLSearchParams,Promise,Set,Error,
    DOCUMENT_PAGES:{print:{title:'Imprimir · Criterios de referencia',body:'<header><a id="return-to-card"></a></header><main id="print-content"></main>',css:['print.css'],scripts:['print.js']},source:{title:'Documento · Criterios de referencia',body:'<header><a id="return"></a></header><main id="page-image"></main>',css:['viewer.css'],scripts:['viewer.js']}},
    moduleLoader:async script=>{imports.push(script);events.push('import:'+script);assert(nodes.has(script==='print.js'?'return-to-card':'return'),'El módulo se importa después de montar su HTML.');assert(links.some(link=>link.sheet&&link.href.endsWith(script.replace('.js','.css'))),'El módulo se importa después de cargar su formato.');if(options.moduleLoader)return options.moduleLoader(script);},
    setTimeout(fn,ms){const id=++clock;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);vm.runInContext(bootstrap,context);window.ReferenceDocumentEntry?.sync();vm.runInContext(source,context);
  return {window,document,node,nodes,attrs,links,events,imports,location,
    mount:()=>context.mountDocumentScreen(),
    timer(ms){for(const[id,item]of[...timers])if(item.ms===ms){timers.delete(id);item.fn();}}};
}

let checks=0;
async function check(name,fn){await fn();checks++;console.log('✓ '+name);}
await check('El catálogo normal no se oculta y una ruta desconocida no sustituye su contenido',async()=>{
  for(const url of ['https://app.test/','https://app.test/?screen=__proto__','https://app.test/#fuentes','https://app.test/#acerca','https://app.test/#ficha/']){
    const app=boot({url});assert.equal(app.attrs.size,0);assert.equal(app.window.ReferenceDocumentEntry,undefined);assert.equal(app.mount(),false);assert.equal(app.document.body.innerHTML,'CATALOGO INICIAL');
  }
});
await check('Abrir o volver a una ficha espera su contenido y nunca revela el catálogo intermedio',async()=>{
  const app=boot({url:'https://app.test/#ficha/n19-adenoma'});
  assert.equal(app.attrs.get('data-document-entry'),'loading');assert.equal(app.window.ReferenceDocumentEntry.kind,'card');assert.match(app.node('document-entry-title').textContent,/Abriendo la ficha/);assert.equal(app.node('document-entry-return').href,'./');assert.match(app.node('document-entry-return').textContent,/Volver al catálogo/);
  assert.equal(app.mount(),false,'La entrada de ficha conserva la inicialización del catálogo y sus datos.');assert.equal(app.attrs.get('data-document-entry'),'loading');
  assert.equal(app.window.ReferenceDocumentEntry.ready(),true);assert.equal(app.attrs.size,0);assert.equal(app.nodes.has('document-entry-shell'),false);
});
await check('La carga fallida de una ficha conserva volver al catálogo y no se revela después sola',async()=>{
  const app=boot({url:'https://app.test/#ficha/n19-adenoma'});app.timer(20000);
  assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.node('document-entry-return').href,'./');assert.match(app.node('document-entry-status').textContent,/volver al catálogo/);assert.equal(app.node('document-entry-retry').href,app.location.href);assert.equal(app.node('document-entry-retry').hidden,false);
  assert.equal(app.window.ReferenceDocumentEntry.ready(),false);assert.equal(app.attrs.get('data-document-entry'),'failed');assert.equal(app.nodes.has('document-entry-shell'),true);
});
await check('La impresión conserva una carga neutra y volver desde el primer HTML hasta tener CSS y módulo',async()=>{
  const app=boot({autoCSS:false});assert.equal(app.attrs.get('data-document-entry'),'loading');assert.equal(app.node('document-entry-return').href,'./#ficha/n19-adenoma');assert.match(app.node('document-entry-title').textContent,/Preparando la ficha/);assert.equal(app.mount(),true);
  await settle();assert.equal(app.imports.length,0);assert.equal(app.attrs.get('data-document-entry'),'loading');assert.equal(app.nodes.has('document-entry-shell'),true);assert.equal(app.node('return-to-card').href,'./#ficha/n19-adenoma');
  const css=app.links.find(link=>link.href.endsWith('/print.css'));assert(css);css.fire('load');await settle();assert.deepEqual(app.imports,['print.js']);assert.equal(app.attrs.has('data-document-entry'),false);assert.equal(app.window.ReferenceDocumentEntry.state,'ready');assert.equal(app.nodes.has('document-entry-shell'),false);assert(!app.links.some(link=>link.href.endsWith('/styles.css')));
});
await check('El visor usa el mismo control de entrada y conserva el retorno a la ficha exacta',async()=>{
  const app=boot({url:'https://app.test/?screen=source&source=N19&page=20&return=%23ficha%2Fadenoma'});assert.equal(app.mount(),true);await settle();assert.equal(app.node('return').href,'./#ficha/adenoma');assert.deepEqual(app.imports,['viewer.js']);assert.equal(app.attrs.size,0);assert.match(app.document.title,/Documento/);
});
await check('Un fallo de CSS mantiene recuperación y una llegada tardía no revela ni cambia esa pantalla',async()=>{
  const app=boot({autoCSS:false});app.mount();const css=app.links.find(link=>link.href.endsWith('/print.css'));css.fire('error');await settle();assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.attrs.get('data-document-entry'),'failed');assert.equal(app.node('document-entry-retry').hidden,false);assert.equal(app.node('document-entry-retry').href,app.location.href);assert.equal(app.imports.length,0);
  css.fire('load');await settle();assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.nodes.has('document-entry-shell'),true);assert.equal(app.imports.length,0);assert.equal(app.window.ReferenceDocumentEntry.ready(),false);
});
await check('El límite de espera de CSS conserva volver y nunca se autocorrige al llegar el estilo tarde',async()=>{
  const app=boot({autoCSS:false});app.mount();app.timer(8000);await settle();assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.node('document-entry-return').href,'./#ficha/n19-adenoma');app.links.find(link=>link.href.endsWith('/print.css')).fire('load');await settle();assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.imports.length,0);
});
await check('Un módulo fallido ofrece reintentar sin mostrar primero el catálogo ni ocultar el error después',async()=>{
  const app=boot({moduleLoader:()=>Promise.reject(new Error('offline'))});app.mount();await settle();assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.attrs.get('data-document-entry'),'failed');assert.match(app.node('document-entry-title').textContent,/No se pudo abrir/);assert.equal(app.node('document-entry-retry').hidden,false);assert.equal(app.window.ReferenceDocumentEntry.ready(),false);
});
await check('Un módulo que llega después del límite global no vuelve a ocultar la recuperación',async()=>{
  let finish;const app=boot({moduleLoader:()=>new Promise(resolve=>{finish=resolve;})});app.mount();await settle();app.timer(20000);assert.equal(app.window.ReferenceDocumentEntry.state,'failed');finish();await settle();assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.attrs.get('data-document-entry'),'failed');assert.equal(app.nodes.has('document-entry-shell'),true);
});
await check('La impresión no revela otra pantalla de carga antes de terminar sus datos',async()=>{
  let finishData;const printReady=new Promise(resolve=>{finishData=resolve;});
  const app=boot({moduleLoader:()=>({printReady})});app.mount();await settle();
  assert.deepEqual(app.imports,['print.js']);assert.equal(app.window.ReferenceDocumentEntry.state,'loading');assert.equal(app.attrs.get('data-document-entry'),'loading');assert.equal(app.nodes.has('document-entry-shell'),true);
  finishData();await settle();assert.equal(app.window.ReferenceDocumentEntry.state,'ready');assert.equal(app.attrs.has('data-document-entry'),false);assert.equal(app.nodes.has('document-entry-shell'),false);
});
await check('Los datos de impresión que llegan tras el límite no ocultan la recuperación',async()=>{
  let finishData;const app=boot({moduleLoader:()=>({printReady:new Promise(resolve=>{finishData=resolve;})})});app.mount();await settle();app.timer(20000);
  assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.node('document-entry-retry').hidden,false);finishData();await settle();
  assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.attrs.get('data-document-entry'),'failed');assert.equal(app.nodes.has('document-entry-shell'),true);assert.equal(app.node('document-entry-return').href,'./#ficha/n19-adenoma');
});
await check('La vista de impresión se inicializa después del montaje aunque el módulo ya se haya importado en la ficha',async()=>{
  let started=0,finishData;
  const app=boot({moduleLoader:()=>({printReady:Promise.resolve(),initialisePrintDocument(){started++;return new Promise(resolve=>{finishData=resolve;});}})});
  app.mount();await settle();assert.equal(started,1);assert.equal(app.window.ReferenceDocumentEntry.state,'loading');
  finishData();await settle();assert.equal(app.window.ReferenceDocumentEntry.state,'ready');assert.equal(app.nodes.has('document-entry-shell'),false);
});
await check('Si el arranque principal nunca termina, el HTML inicial mantiene volver y reintentar',async()=>{
  const app=boot();app.timer(20000);assert.equal(app.window.ReferenceDocumentEntry.state,'failed');assert.equal(app.node('document-entry-return').href,'./#ficha/n19-adenoma');assert.equal(app.node('document-entry-retry').hidden,false);assert.equal(app.imports.length,0);
  const untrusted=boot({url:'https://app.test/?screen=print&return=javascript%3Aalert(1)&id=adenoma'});assert.equal(untrusted.node('document-entry-return').href,'./#ficha/adenoma');
});
console.log(JSON.stringify({ok:true,checks}));
