import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { File } from 'node:buffer';

const code=await fs.readFile(new URL('../pdf-actions.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function boot(options={}){
 const cfg={pdf:'%PDF-1.7\nfixture',supported:true,userAgent:'iPhone',...options};
 const nodes=new Map(),documentEvents=new Map(),windowEvents=new Map(),timers=new Map(),fetches=[],shares=[],objects=[],revoked=[],navigations=[];
 let timerId=0,activation=false;
 function element(tag='button',id=''){
  return {tagName:tag.toUpperCase(),id,dataset:{},hidden:false,disabled:false,isConnected:false,events:new Map(),attributes:{},textContent:'',
   addEventListener(name,handler){this.events.set(name,handler);},
   setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},
   focus(){this.focused=true;},
   showModal(){this.open=true;},close(){this.open=false;this.events.get('close')?.();},
   set innerHTML(value){this.html=value;for(const match of value.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const child=element(match[1],match[3]);child.hidden=/\bhidden\b/.test(match[2]);child.disabled=/\bdisabled\b/.test(match[2]);for(const attr of ['target','rel','download']){const found=new RegExp('\\b'+attr+'(?:="([^"]*)")?').exec(match[2]);if(found)child[attr]=found[1]??'';}nodes.set(child.id,child);}},get innerHTML(){return this.html;}
  };
 }
 const doc={baseURI:'https://app.test/',getElementById:id=>nodes.get(id),createElement:tag=>element(tag),body:{append(node){node.isConnected=true;nodes.set(node.id,node);}},addEventListener(name,handler){const list=documentEvents.get(name)||[];list.push(handler);documentEvents.set(name,list);}};
 class SafeURL extends URL{
  static createObjectURL(value){const url='blob:fixture-'+(objects.length+1);objects.push({url,value});return url;}
  static revokeObjectURL(url){revoked.push(url);}
 }
 const location={origin:'https://app.test',get href(){return 'https://app.test/?screen=source';},set href(value){navigations.push(value);throw Error('La app no debe navegar al PDF');},assign(value){navigations.push(value);throw Error('Navegación prohibida');},replace(value){navigations.push(value);throw Error('Navegación prohibida');}};
 const nav={userAgent:cfg.userAgent,maxTouchPoints:cfg.maxTouchPoints||0,standalone:cfg.standalone===true,
  canShare(data){return cfg.supported&&data.files?.[0]?.type==='application/pdf';},
  share(data){shares.push({data,activation});return cfg.shareResult?.()||Promise.resolve();}
 };
 const win={location,matchMedia:()=>({matches:cfg.installed===true}),addEventListener(name,handler){windowEvents.set(name,handler);},open(value){navigations.push(value);throw Error('No abrir PDF desde la app');}};
 const context={document:doc,navigator:nav,window:win,location,URL:SafeURL,File,Blob,AbortController,
  fetch:async(url,init)=>{fetches.push({url,init});if(cfg.pending)return new Promise((resolve,reject)=>{cfg.resolvePDF=resolve;init.signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'})),{once:true});});return {ok:cfg.ok!==false,blob:async()=>new Blob([cfg.pdf],{type:'application/pdf'})};},
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}
 };
 vm.runInNewContext(code,context,{filename:'pdf-actions.js'});
 function click(id){const node=nodes.get(id);assert(node,id);if(node.disabled)return;activation=true;try{node.events.get('click')?.({preventDefault(){}});}finally{activation=false;}}
 function open(url='assets/documents/N19.pdf#page=19'){
  const trigger=element();trigger.dataset={pdfUrl:url,pdfName:'Documento N19',pdfFilename:'N19-criterios.pdf'};trigger.closest=()=>trigger;
  let prevented=false;activation=true;try{for(const handler of documentEvents.get('click')||[])handler({target:trigger,preventDefault(){prevented=true;}});}finally{activation=false;}
  return {trigger,prevented};
 }
 function timeout(ms){for(const [id,timer]of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}}
 return {cfg,nodes,fetches,shares,objects,revoked,navigations,context,win,open,click,timeout,node:id=>nodes.get(id),leave:()=>windowEvents.get('pagehide')?.(),rerun:()=>vm.runInNewContext(code,context)};
}

let checks=0;
async function check(name,fn){await fn();checks++;console.log('✓ '+name);}
await check('Preparar PDF valida el archivo sin navegar y compartir requiere un segundo toque directo',async()=>{
 const app=boot();assert.equal(app.fetches.length,0);assert.equal(app.shares.length,0);
 const opened=app.open();assert(opened.prevented);assert.equal(app.fetches.length,1);assert.equal(app.shares.length,0);
 assert.match(app.node('pdf-action-dialog').innerHTML,/>PDF completo</);assert.match(app.node('pdf-action-dialog').innerHTML,/>Abrir menú para guardar o compartir</);
 assert.equal(app.fetches[0].url,'https://app.test/assets/documents/N19.pdf');assert.equal(app.fetches[0].init.credentials,'same-origin');
 assert.equal(app.node('pdf-action-dialog').open,true);await settle();
 assert.equal(app.node('pdf-action-save').hidden,false);assert.equal(app.shares.length,0);assert.equal(app.objects.length,0);
 assert.match(app.node('pdf-action-status').textContent,/PDF listo\. Toque Abrir menú/);
 app.click('pdf-action-save');assert.equal(app.shares.length,1);assert.equal(app.shares[0].activation,true);
 assert.equal(app.shares[0].data.files[0].type,'application/pdf');assert.equal(app.shares[0].data.files[0].name,'N19-criterios.pdf');
 assert.equal(await app.shares[0].data.files[0].slice(0,5).text(),'%PDF-');await settle();assert.equal(app.fetches.length,1);assert.deepEqual(app.navigations,[]);
 app.click('pdf-action-close');assert.equal(app.node('pdf-action-dialog').open,false);assert(opened.trigger.focused);
});
await check('Cancelar el menú conserva el archivo y permite volver a compartir sin descargarlo otra vez',async()=>{
 const app=boot();app.open();await settle();let cancel;
 app.cfg.shareResult=()=>new Promise((resolve,reject)=>{cancel=reject;});app.click('pdf-action-save');assert(app.node('pdf-action-save').disabled);
 cancel(Object.assign(Error('cancelado'),{name:'AbortError'}));await settle();
 assert.equal(app.node('pdf-action-save').disabled,false);assert.match(app.node('pdf-action-status').textContent,/de nuevo/);
 app.cfg.shareResult=()=>Promise.resolve();app.click('pdf-action-save');await settle();assert.equal(app.shares.length,2);assert.equal(app.fetches.length,1);assert.equal(app.node('pdf-action-dialog').open,true);
});
await check('Un error del menú permite reintento sin abandonar la ficha',async()=>{
 const app=boot();app.open();await settle();app.cfg.shareResult=()=>Promise.reject(Error('denegado'));app.click('pdf-action-save');await settle();
 assert.equal(app.node('pdf-action-save').disabled,false);assert.match(app.node('pdf-action-status').textContent,/reintentar/);assert.deepEqual(app.navigations,[]);
});
await check('HTML y respuestas HTTP fallidas no se entregan como PDF y pueden reintentarse',async()=>{
 for(const options of [{pdf:'<html>Acceso</html>'},{ok:false}]){
  const app=boot(options);app.open();await settle();assert.equal(app.node('pdf-action-save').hidden,true);assert.equal(app.node('pdf-action-download').hidden,true);assert.match(app.node('pdf-action-prepare').textContent,/Reintentar/);
  app.cfg.pdf='%PDF-1.7\nrecuperado';app.cfg.ok=true;app.click('pdf-action-prepare');await settle();assert.equal(app.fetches.length,2);assert.equal(app.node('pdf-action-save').hidden,false);
 }
});
await check('La preparación vence a los 25 segundos y cerrar o salir aborta la descarga',async()=>{
 const app=boot({pending:true});app.open();assert.equal(app.fetches[0].init.signal.aborted,false);app.timeout(25000);await settle();
 assert.equal(app.fetches[0].init.signal.aborted,true);assert.equal(app.node('pdf-action-prepare').disabled,false);assert.match(app.node('pdf-action-prepare').textContent,/Reintentar/);
 app.cfg.pending=false;app.click('pdf-action-prepare');await settle();assert.equal(app.node('pdf-action-save').hidden,false);
 for(const method of ['close','pagehide']){const leaving=boot({pending:true});leaving.open();if(method==='close')leaving.click('pdf-action-close');else leaving.leave();await settle();assert.equal(leaving.fetches[0].init.signal.aborted,true);assert.equal(leaving.node('pdf-action-save').hidden,true);assert.deepEqual(leaving.navigations,[]);}
});
await check('iPhone, iPadOS y modo instalado sin compartir nunca navegan ni crean una descarga nativa insegura',async()=>{
 for(const options of [{userAgent:'iPhone'},{userAgent:'Macintosh',maxTouchPoints:5},{userAgent:'Chrome',standalone:true},{userAgent:'Chrome',installed:true}]){
  const app=boot({supported:false,...options});app.open();await settle();assert.equal(app.node('pdf-action-save').hidden,true);assert.equal(app.node('pdf-action-download').hidden,true);assert.equal(app.objects.length,0);assert.deepEqual(app.navigations,[]);assert.match(app.node('pdf-action-status').textContent,/no habilitó/);app.click('pdf-action-close');assert.equal(app.node('pdf-action-dialog').open,false);
 }
});
await check('El escritorio ofrece una descarga blob con destino separado y libera el archivo al cerrar',async()=>{
 const app=boot({userAgent:'Desktop Chrome',supported:false});app.open();await settle();const link=app.node('pdf-action-download');
 assert.equal(link.hidden,false);assert.match(link.href,/^blob:/);assert.equal(link.download,'N19-criterios.pdf');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener');assert.equal(app.objects.length,1);assert.deepEqual(app.navigations,[]);
 app.click('pdf-action-close');assert.deepEqual(app.revoked,[link.href]);
});
await check('No permite archivos de otro origen y una recarga del módulo no duplica sus controles',async()=>{
 const app=boot();app.open('https://otro.example/original.pdf');assert.equal(app.fetches.length,0);assert.equal(app.nodes.size,0);
 app.rerun();app.open();await settle();assert.equal(app.fetches.length,1,'El módulo se registra una sola vez');assert.equal(app.node('pdf-action-dialog').open,true);
});
console.log(JSON.stringify({ok:true,checks}));
