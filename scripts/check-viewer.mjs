import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const code=await fs.readFile(new URL('../viewer.js',import.meta.url),'utf8');
const markup=await fs.readFile(new URL('../viewer.html',import.meta.url),'utf8');
const markupIds=new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function boot(options={}){
 const cfg={...options},nodes=new Map(),events={},timers=new Map(),fetches=[],images=[],decodes=[],historyEntries=[],pdfOpens=[];
 let timerId=0,prints=0,reloads=0,activation=false;
 function node(id){
  assert(markupIds.has(id),'El control existe en viewer.html: '+id);
  if(!nodes.has(id))nodes.set(id,{id,hidden:false,disabled:false,dataset:{},events:{},textContent:'',value:'',
   addEventListener(name,handler){this.events[name]=handler;},
   decode(){if(cfg.pendingDecode)return new Promise((resolve,reject)=>decodes.push({resolve,reject}));return cfg.decodeError?Promise.reject(Error('decode')):Promise.resolve();}
  });return nodes.get(id);
 }
 for(const id of ['print','download'])node(id).disabled=true;
 const location=new URL(cfg.url||'https://app.test/?screen=source&source=N09&page=2&return=%23ficha%2Fn09-catarata');location.reload=()=>{reloads++;};
 const source={id:'N09',titulo:'Documento de prueba',tema:'Oftalmología',codigo:'TEST',alcance:'Nacional',vigencia:'2030',pageCount:3,localPdf:'assets/documents/N09.pdf',pageImageBase:'assets/pages/N09/',...cfg.source};
 const fetch=async(url,init={})=>{
  fetches.push({url:String(url),signal:init.signal});
  if(cfg.pendingSources)return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'})),{once:true}));
  if(String(url)!=='data/sources.json')throw Error('El visor no debe descargar el PDF');
  return {ok:cfg.sourcesOk!==false,json:async()=>cfg.unknownSource?[]:[source]};
 };
 class PageImage{
  constructor(){images.push(this);}
  set src(value){this._src=value;if(!cfg.manualImage)queueMicrotask(()=>cfg.imageError?this.onerror?.():this.onload?.());}
  get src(){return this._src;}
 }
 const doc={getElementById:node,title:''};
 const navigator={userAgent:cfg.userAgent||'Desktop Chrome',standalone:cfg.standalone===true,maxTouchPoints:cfg.maxTouchPoints||0};
 const win={matchMedia:()=>({matches:cfg.installed===true}),ReferencePDF:{open(...args){pdfOpens.push({args,activation});}},addEventListener(name,handler){events[name]=handler;},print(){prints++;assert(activation,'Imprimir se invoca desde el toque directo');}};
 vm.runInNewContext(code,{window:win,navigator,document:doc,location,history:{pushState(state,title,url){historyEntries.push({state,url:String(url)});location.href=String(url);}},fetch,Image:PageImage,URL,URLSearchParams,AbortController,Promise,
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
 const dispatch=(id,name='click')=>{const current=node(id);if(current.disabled&&name==='click')return;activation=true;try{return current.events[name]?.({preventDefault(){}});}finally{activation=false;}};
 const timeout=ms=>{for(const[id,timer]of[...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}};
 return {cfg,node,events,fetches,images,decodes,historyEntries,pdfOpens,location,dispatch,timeout,printCount:()=>prints,reloadCount:()=>reloads};
}
let checks=0;
async function check(name,fn){await fn();checks++;console.log('✓ '+name);}
await check('Abrir el visor carga una imagen, conserva volver y prepara botones seguros sin descargar PDF',async()=>{
 const app=boot();await settle();assert.equal(app.fetches.length,1);assert.equal(app.fetches[0].url,'data/sources.json');assert.equal(app.images.length,1);assert.equal(app.images[0].src,'assets/pages/N09/2.webp');
 assert.equal(app.node('return').href,'./#ficha/n09-catarata');assert.equal(app.node('page-image').hidden,false);assert.equal(app.node('print').disabled,false);app.dispatch('print');assert.equal(app.printCount(),1);
 const button=app.node('download');assert.equal(button.dataset.pdfUrl,'assets/documents/N09.pdf');assert.equal(button.dataset.pdfName,'Documento de prueba');assert.equal(button.dataset.pdfFilename,'N09-criterios-referencia.pdf');assert.equal(button.disabled,false);assert.equal(button.href,undefined,'El PDF no es un enlace que navega fuera de la app');
 assert.equal(app.node('print').hidden,false);assert.match(app.node('pdf-kind').textContent,/documento original/);
});
await check('Apple y la app instalada ofrecen una sola acción PDF; escritorio conserva imprimir esta página',async()=>{
 const actions=markup.match(/<div class="actions">([\s\S]*?)<\/div>/)[1];assert.equal([...actions.matchAll(/<button\b/g)].length,1);assert(!markupIds.has('external'));
 for(const options of [{userAgent:'iPhone'},{userAgent:'iPad'},{userAgent:'Macintosh',maxTouchPoints:5},{standalone:true},{installed:true}]){
  const app=boot({...options,pendingDecode:true});await settle();
  assert.equal(app.node('print').hidden,true);assert.equal(app.node('download').disabled,false,'El PDF completo sigue disponible aunque la imagen esté cargando');app.dispatch('print');assert.equal(app.pdfOpens.length,0);
  app.decodes[0].resolve();await settle();const initialURL=app.location.href;
  app.dispatch('print');assert.equal(app.printCount(),0,'No usa la impresión nativa del modo instalado');assert.equal(app.pdfOpens.length,0,'No duplica el botón de PDF completo');
  assert.equal(app.node('download').dataset.pdfUrl,'assets/documents/N09.pdf');
  assert.equal(app.location.href,initialURL);assert.equal(app.node('return').href,'./#ficha/n09-catarata');assert.equal(app.fetches.length,1,'El visor delega la acción; no descarga el PDF automáticamente');
 }
 const desktop=boot({pendingDecode:true});await settle();desktop.dispatch('print');assert.equal(desktop.printCount(),0);desktop.decodes[0].resolve();await settle();desktop.dispatch('print');assert.equal(desktop.printCount(),1);assert.equal(desktop.pdfOpens.length,0);
});
await check('Siguiente, anterior, entrada de página y volver del navegador cargan solo la página elegida',async()=>{
 const app=boot();await settle();app.dispatch('next');assert.equal(app.node('print').disabled,true);await settle();assert.equal(app.node('page').value,3);assert.equal(app.node('next').disabled,true);assert.equal(app.images.at(-1).src,'assets/pages/N09/3.webp');
 app.dispatch('previous');await settle();assert.equal(app.node('page').value,2);assert.equal(app.node('download').dataset.pdfUrl,'assets/documents/N09.pdf');
 app.node('page').value=999;app.dispatch('page-form','submit');await settle();assert.equal(app.node('page').value,3);
 app.location.search='?screen=source&source=N09&page=1&return=%23ficha%2Fn09-catarata';app.events.popstate();await settle();assert.equal(app.node('page').value,1);assert.equal(app.node('previous').disabled,true);assert.equal(app.node('return').href,'./#ficha/n09-catarata');
 assert.equal(app.fetches.length,1,'Cambiar de página nunca descarga el PDF completo');assert.equal(app.historyEntries.length,3,'popstate no crea otra entrada de historial');
});
await check('Un error de imagen permite reintentar y conserva el retorno a la ficha',async()=>{
 const app=boot({imageError:true});await settle();assert.equal(app.node('error').hidden,false);assert.equal(app.node('loading').hidden,true);assert.equal(app.node('print').disabled,true);assert.equal(app.node('return').href,'./#ficha/n09-catarata');
 app.cfg.imageError=false;app.dispatch('retry');await settle();assert.equal(app.node('error').hidden,true);assert.equal(app.node('print').disabled,false);assert.equal(app.images.length,2);
});
await check('Una imagen o decodificación tardía no reabre el estado fallido; reintentar recupera el visor',async()=>{
 const app=boot({pendingDecode:true});await settle();assert.equal(app.node('print').disabled,true);app.dispatch('print');assert.equal(app.printCount(),0);app.timeout(10000);assert.equal(app.node('error').hidden,false);
 app.decodes[0].resolve();await settle();assert.equal(app.node('print').disabled,true);assert.equal(app.node('error').hidden,false);
 app.dispatch('retry');await settle();assert.equal(app.decodes.length,2);app.decodes[1].resolve();await settle();assert.equal(app.node('print').disabled,false);assert.equal(app.node('error').hidden,true);
 const image=boot({manualImage:true});await settle();image.timeout(10000);image.images[0].onload();await settle();assert.equal(image.node('error').hidden,false);assert.equal(image.node('print').disabled,true);
 image.dispatch('retry');image.images[1].onload();await settle();assert.equal(image.node('error').hidden,true);assert.equal(image.node('print').disabled,false);
});
await check('Fallar la decodificación o la carga de metadatos ofrece recuperación sin perder volver',async()=>{
 const decoded=boot({decodeError:true});await settle();assert.equal(decoded.node('error').hidden,false);assert.equal(decoded.node('print').disabled,true);
 for(const options of [{unknownSource:true},{sourcesOk:false},{pendingSources:true}]){
  const app=boot(options);await settle();if(options.pendingSources){app.timeout(8000);await settle();assert.equal(app.fetches[0].signal.aborted,true);}
  assert.equal(app.node('error').hidden,false);assert.equal(app.node('return').href,'./#ficha/n09-catarata');assert.equal(app.node('print').disabled,true);app.dispatch('retry');assert.equal(app.reloadCount(),1);
 }
});
await check('Los enlaces heredados también conservan retorno y rechazan volver a otro sitio',async()=>{
 const old=boot({url:'https://app.test/viewer.html?source=N09&page=2&return=%23ficha%2Fn09-catarata'});await settle();assert.equal(old.node('return').href,'./#ficha/n09-catarata');
 const invalid=boot({url:'https://app.test/?screen=source&source=N09&return=https%3A%2F%2Fotro.example%2F'});await settle();assert.equal(invalid.node('return').href,'./');assert.equal(invalid.fetches.length,1);
});
await check('La procedencia identificada de HTFC permanece visible sin atribuir aval a la copia',async()=>{
 const sources=JSON.parse(await fs.readFile(new URL('../data/sources.json',import.meta.url),'utf8'));
 const source=sources.find(item=>item.id==='R03');
 const app=boot({url:'https://app.test/?screen=source&source=R03&page=1',source});await settle();
 assert.match(app.node('metadata').textContent,/Servicio de Oftalmología del Hospital Tony Facio/);
 assert(app.node('notice').textContent.includes(source.provenance));
 assert(app.node('notice').textContent.includes(source.approvalNote));
 assert(!app.node('notice').textContent.includes('no identifica su establecimiento'));
 assert.equal(app.node('error').hidden,true);
});
console.log(JSON.stringify({ok:true,checks}));
