import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {File} from 'node:buffer';
import {createTextPdf} from '../printable-pdf.js';
import {isCatalogCard,generalRequirementsForCard} from '../catalog.js';

const root=new URL('../',import.meta.url);
let printSource=await fs.readFile(new URL('print.js',root),'utf8');
const release=JSON.parse(await fs.readFile(new URL('data/release.json',root),'utf8'));
const pdfURL='data:text/javascript;base64,'+Buffer.from(await fs.readFile(new URL('printable-pdf.js',root),'utf8')).toString('base64');
const catalogModule='data:text/javascript;base64,'+Buffer.from(await fs.readFile(new URL('catalog.js',root),'utf8')).toString('base64');
printSource=printSource.replace("import { APP_RELEASE } from './release.js';",`const APP_RELEASE=${JSON.stringify({updatedAt:release.updatedAt})};`).replace("'./catalog.js'",JSON.stringify(catalogModule)).replace("'./printable-pdf.js'",JSON.stringify(pdfURL))
 .replace("'./edus-guidance.js'",JSON.stringify(new URL('../edus-guidance.js',import.meta.url).href));
const {buildPrintDocument}=await import('data:text/javascript;base64,'+Buffer.from(printSource).toString('base64'));
const source=(await fs.readFile(new URL('print-session.js',root),'utf8')).replace(/^import .*;\n/gm,'').replace(/export function /g,'function ')+'\nglobalThis.api={printCard,printDocumentText};';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const fixture={
 card:{id:'ejemplo',name:'Niñez: ≥ 5 y ≤ 10',specialty:'Pediatría',sourceId:'N01',pages:[7],criteria:['Criterio de esta variante'],fullText:'Texto íntegro\nSegunda línea',checklist:[{id:'uno',text:'Revisión señalada'},{id:'dos',text:'Revisión pendiente'}]},
 sources:[{id:'N01',titulo:'Documento de prueba',alcance:'Nacional',fecha:'2026',vigencia:'Por confirmar'}],
 topics:{groups:[{name:'Tema común',cardIds:['ejemplo'],variantLabels:{ejemplo:'Variante exacta'}}]},
 checkedByCard:{ejemplo:['uno']}
};
fixture.cards=[fixture.card,{id:'general',sourceId:'N01',name:'Requisitos generales',specialty:'Pediatría',category:'general',criteria:['GENERAL DE LA MISMA FUENTE'],fullText:'Texto general íntegro'}];

function boot(options={}){
 const cfg={apple:false,share:true,installed:false,...options},nodes=new Map(),listeners=new Map(),mediaListeners=new Set(),native=[],shared=[],statuses=[],navigations=[],fetches=[];
 let activation=false;
 const decode=value=>value.replace(/&(?:amp|lt|gt|quot|#39);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[x]));
 function element(tag='button'){
  const node={nodeType:1,tagName:tag.toUpperCase(),childNodes:[],events:new Map(),attributes:{},disabled:false,hidden:false,isConnected:false,
   setAttribute(name,value){this.attributes[name]=value;if(name==='id'){this.id=value;nodes.set(value,this);}if(name==='open')this.open=true;},removeAttribute(name){delete this.attributes[name];if(name==='open')this.open=false;},
   addEventListener(name,fn){this.events.set(name,fn);},focus(options){this.focused=true;this.focusOptions=options;},
   showModal(){this.open=true;},remove(){this.isConnected=false;if(this.parent){this.parent.childNodes=this.parent.childNodes.filter(item=>item!==this);}nodes.delete(this.id);},
   querySelector(selector){return nodes.get(selector.replace(/^#/,''));},
   append(child){child.isConnected=true;child.parent=this;this.childNodes.push(child);nodes.set(child.id,child);},
   get classList(){return {contains:value=>(this.attributes.class||'').split(/\s+/).includes(value)};},
   get textContent(){return this.childNodes.map(child=>child.nodeType===3?child.nodeValue:child.textContent).join('');},set textContent(value){this.childNodes=[{nodeType:3,nodeValue:String(value)}];},
   get innerHTML(){return this.html;},set innerHTML(value){
    this.html=value;this.childNodes=[];const stack=[this];
    for(const token of value.match(/<[^>]+>|[^<]+/g)||[]){
     if(token.startsWith('</')){stack.pop();continue;}
     if(token.startsWith('<')){
      const match=/^<([a-z0-9]+)/i.exec(token);if(!match)continue;const child=element(match[1]);
      for(const attr of token.matchAll(/([a-z-]+)="([^"]*)"/g))child.setAttribute(attr[1],decode(attr[2]));
      child.hidden=/\bhidden\b/.test(token);stack.at(-1).append(child);
      if(!/^<(?:br|hr|input)\b/i.test(token))stack.push(child);
     }else stack.at(-1).childNodes.push({nodeType:3,nodeValue:decode(token)});
    }
   }
  };
  return node;
 }
 const body=element('body'),html=element('html'),cardNode=element('section');cardNode.id='detail-screen';body.append(cardNode);
 const document={body,documentElement:html,createElement:element,getElementById:id=>nodes.get(id)};
 const trigger=element();trigger.id='detail-print';cardNode.append(trigger);
 const media={matches:false,addEventListener(name,fn){mediaListeners.add(fn);},removeEventListener(name,fn){mediaListeners.delete(fn);}};
 const window={scrollY:735,matchMedia:query=>query==='print'?media:{matches:cfg.installed},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
  print(){native.push({activation,article:nodes.get('reference-print-content')});if(cfg.printThrows)throw Error('print rejected');if(cfg.printEvents)event('afterprint');},
  open(url){navigations.push(url);throw Error('No window.open');}
 };
 if(cfg.noPrint)delete window.print;
 const navigator={userAgent:cfg.apple?'iPhone':'Chromium',platform:cfg.apple?'iPhone':'Linux',standalone:cfg.installed,maxTouchPoints:cfg.apple?5:0,
  canShare:()=>cfg.share,share:payload=>{shared.push({payload,activation});return cfg.shareResult?.()||Promise.resolve();}
 };
 const location={get href(){return 'https://app.test/#ficha/ejemplo';},set href(value){navigations.push(value);throw Error('No navegar');}};
 const context={document,window,navigator,location,File,Promise,buildPrintDocument,createTextPdf,fetch(...args){fetches.push(args);throw Error('No descargar para imprimir');}};
 vm.runInNewContext(source,context,{filename:'print-session.js'});
 function call(extra={}){activation=true;try{return context.api.printCard({...fixture,button:trigger,onStatus:message=>statuses.push(message),...extra});}finally{activation=false;}}
 function click(id){const node=nodes.get(id);assert(node,id);activation=true;try{return node.events.get('click')?.({preventDefault(){}});}finally{activation=false;}}
 function event(name){for(const fn of [...listeners.get(name)||[]])fn({});}
 function mediaChange(matches){media.matches=matches;for(const fn of [...mediaListeners])fn({matches});}
 return {cfg,context,api:context.api,document,window,trigger,cardNode,nodes,native,shared,statuses,navigations,fetches,call,click,event,mediaChange,node:id=>nodes.get(id),element};
}

let checks=0;
async function check(name,run){await run();checks++;console.log('✓ '+name);}
await check('Imprimir usa el toque original y la ficha sigue en el mismo documento sin descargas ni navegación',()=>{
 const app=boot();assert.equal(app.call().status,'printing');assert.equal(app.native.length,1);assert.equal(app.native[0].activation,true);assert.equal(app.document.body.childNodes[0],app.cardNode);assert.equal(app.window.scrollY,735);assert.equal(app.context.location.href,'https://app.test/#ficha/ejemplo');assert.deepEqual(app.fetches,[]);assert.deepEqual(app.navigations,[]);
 const article=app.node('reference-print-content');assert(article);assert.match(article.innerHTML,/1 de 2 elementos/);assert.match(article.innerHTML,/GENERAL DE LA MISMA FUENTE/);assert.match(article.innerHTML,/Variante exacta/);assert.match(article.innerHTML,/Texto íntegro\nSegunda línea/);
 app.event('afterprint');assert.equal(app.node('reference-print-content'),undefined);assert.equal(app.document.documentElement.attributes['data-reference-print'],undefined);assert.equal(app.document.body.childNodes[0],app.cardNode);assert.equal(app.trigger.focusOptions.preventScroll,true);
});
await check('Safari no pierde la copia si print retorna antes de afterprint y salida de medio print limpia',()=>{
 const app=boot();app.call();assert(app.node('reference-print-content'));app.mediaChange(true);app.mediaChange(false);assert.equal(app.node('reference-print-content'),undefined);assert.equal(app.window.scrollY,735);
 const immediate=boot({printEvents:true});immediate.call();assert.equal(immediate.node('reference-print-content'),undefined);
});
await check('En iPhone el PDF se comparte en el primer toque sin pantalla intermedia',async()=>{
 const app=boot({apple:true,installed:true});const result=app.call();assert.equal(app.shared.length,1);assert.equal(app.shared[0].activation,true);assert.equal(app.native.length,0);assert.equal(app.node('print-session-dialog'),undefined);const file=app.shared[0].payload.files[0];assert.equal(file.type,'application/pdf');assert.equal(await file.slice(0,5).text(),'%PDF-');assert.equal(file.name,'Criterios-ejemplo.pdf');assert.equal((await result).status,'shared');assert.equal(app.node('reference-print-content'),undefined);assert.equal(app.document.body.childNodes[0],app.cardNode);assert.deepEqual(app.navigations,[]);assert.deepEqual(app.fetches,[]);
});
await check('Texto PDF preserva párrafos, comparadores, acentos, revisión y transcripción de la variante actual',()=>{
 const app=boot();app.call();const text=app.api.printDocumentText(app.node('reference-print-content'));
 for(const value of ['Tema común','Variante exacta','Niñez: ≥ 5 y ≤ 10','Texto íntegro\nSegunda línea','1 de 2','Revisado Revisión señalada','Por revisar Revisión pendiente','GENERAL DE LA MISMA FUENTE','Texto general íntegro','Fuente: N01'])assert(text.includes(value),'Omisión/concatenación de '+value);
 assert.match(text,/Documento que respalda esta ficha\n\nFuente:/);assert.match(text,/Criterios para referir\n\n• Criterio/);
 const pre=app.element('pre');pre.textContent='A < 2\nB ≥ 5';assert.equal(app.api.printDocumentText(pre),'A < 2\nB ≥ 5');app.event('afterprint');
});
await check('Cancelar compartir regresa a la misma ficha y reintento vuelve a usar un toque válido',async()=>{
 let reject;const app=boot({apple:true,shareResult:()=>new Promise((resolve,no)=>{reject=no;})});const first=app.call();assert.equal(app.call(),first);assert.equal(app.shared.length,1);assert.equal(app.trigger.disabled,true);reject(Object.assign(Error('cancelled'),{name:'AbortError'}));assert.equal((await first).status,'cancelled');assert.equal(app.trigger.disabled,false);assert.equal(app.node('print-session-dialog'),undefined);assert.equal(app.document.body.childNodes[0],app.cardNode);app.cfg.shareResult=()=>Promise.resolve();await app.call();assert.equal(app.shared.length,2);assert.equal(app.shared[1].activation,true);
});
await check('Error de compartir ofrece reintento en diálogo sobre la ficha y no abre ni navega a un PDF',async()=>{
 const app=boot({apple:true,shareResult:()=>Promise.reject(Error('not allowed'))});assert.equal((await app.call()).status,'fallback');assert.equal(app.node('print-session-dialog').open,true);assert.match(app.node('print-session-message').textContent,/reintentar/);assert.equal(app.trigger.disabled,false);app.cfg.shareResult=()=>Promise.resolve();await app.click('print-session-retry');assert.equal(app.shared[1].activation,true);assert.equal(app.node('print-session-dialog'),undefined);assert.deepEqual(app.navigations,[]);
});
await check('Sin compartir en app iOS se explica el límite y siempre se puede cerrar sin perder la ficha',()=>{
 const app=boot({apple:true,installed:true,share:false});assert.equal(app.call().status,'fallback');assert.equal(app.native.length,0);assert.equal(app.shared.length,0);assert(app.node('print-session-retry').hidden);assert.match(app.node('print-session-message').textContent,/Safari/);app.click('print-session-close');assert.equal(app.node('print-session-dialog'),undefined);assert.equal(app.node('reference-print-content'),undefined);assert.equal(app.document.body.childNodes[0],app.cardNode);assert.deepEqual(app.navigations,[]);
});
await check('Error nativo tiene salida y la navegación normal limpia toda copia anterior',()=>{
 const app=boot({printThrows:true});assert.equal(app.call().status,'fallback');assert(app.node('print-session-dialog').open);app.cfg.printThrows=false;app.click('print-session-retry');assert.equal(app.native.length,2);assert.equal(app.native[1].activation,true);app.event('afterprint');assert.equal(app.node('print-session-dialog'),undefined);app.call();app.event('hashchange');assert.equal(app.node('reference-print-content'),undefined);assert.equal(app.document.documentElement.attributes['data-reference-print'],undefined);
});
await check('Una nueva impresión obtiene las marcas actualizadas y rechaza apartados retirados antes de acción nativa',()=>{
 const app=boot();app.call();const old=app.node('reference-print-content');app.call({checkedByCard:{ejemplo:['uno','dos']}});assert.equal(old.isConnected,false);assert.match(app.node('reference-print-content').innerHTML,/2 de 2 elementos/);assert.equal(app.native.length,2);assert.equal(app.call({card:{...fixture.card,catalogStatus:'withheld',criteria:[]}}).status,'invalid');assert.equal(app.native.length,2);assert.equal(app.node('reference-print-content'),undefined);assert.match(app.statuses.at(-1),/no establece criterios/);
 const blocked=boot();const card={...fixture.card,catalogStatus:'withheld'};
 assert.equal(blocked.call({card}).status,'invalid');assert.equal(blocked.native.length,0);assert.equal(blocked.node('reference-print-content'),undefined);assert.match(blocked.statuses.at(-1),/no establece criterios/);
});
await check('Importar el modelo de impresión en el catálogo no inicializa una pantalla ausente',async()=>{
 const fakeDocument={getElementById:()=>null};
 const modelContext={document:fakeDocument,Promise};
 const isolated=printSource.replace(/^import .*;\n/gm,'').replace(/^const APP_RELEASE=.*;\n/m,'').replace(/^const isCatalogCard=.*;\n/m,'').replace(/export function /g,'function ').replace('export const printReady','const printReady')+'\nglobalThis.start=initialisePrintDocument;';
 modelContext.APP_RELEASE={updatedAt:release.updatedAt};modelContext.isCatalogCard=isCatalogCard;modelContext.generalRequirementsForCard=generalRequirementsForCard;
 vm.runInNewContext(isolated,modelContext);await modelContext.start();
});
await settle();
console.log(JSON.stringify({ok:true,checks}));
