import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const [source,cards,sources,release]=await Promise.all([
 fs.readFile(new URL('analytics.js',root),'utf8'),
 ...['cards','sources','release'].map(async name=>JSON.parse(await fs.readFile(new URL(`data/${name}.json`,root),'utf8')))
]);
const card=cards.find(item=>item.catalogStatus!=='withheld'&&item.sourceId==='N19'&&item.category!=='general');
assert(card);
const standard={appId:'criterios-de-referencia',analytics:{enabled:true,measurementId:'G-TEST12345',allowedSites:[{host:'9ph9jr6j75-collab.github.io',pathPrefix:'/criterios-de-referencia/'},{host:'criterios-de-referencia.solanocorella.chatgpt.site',pathPrefix:'/'}]}};
async function boot({url='https://9ph9jr6j75-collab.github.io/criterios-de-referencia/',config=standard,fail='',early=null}={}){
 const location=new URL(url),listeners=new Map(),documentListeners=new Map(),scripts=[],requests=[];
 const window={};
 const context={window,location,URL,AbortController,Date,setTimeout,clearTimeout,
  fetch:async(path,options)=>{requests.push(path);if(path===fail)throw Error('offline');return {ok:true,json:async()=>({'data/config.json':config,'data/release.json':release,'data/cards.json':cards,'data/sources.json':sources}[path])};},
  addEventListener:(name,callback)=>listeners.set(name,callback),
  document:{createElement:tag=>({tagName:tag}),head:{append:node=>scripts.push(node)},addEventListener:(name,callback)=>documentListeners.set(name,callback)}
 };
 vm.runInNewContext(source,context,{filename:'analytics.js'});
 if(early)early(window);
 await new Promise(setImmediate);
 const calls=()=>Array.from(window.dataLayer||[],args=>Array.from(args));
 const events=()=>calls().filter(args=>args[0]==='event');
 return {window,location,listeners,documentListeners,scripts,requests,calls,events,click:element=>documentListeners.get('click')?.({target:{closest:()=>element}})};
}
let checks=0;
async function check(name,run){await run();checks++;console.log('✓ '+name);}
await check('Propiedad propia solo en sus hosts y rutas; otras apps y vistas locales no cargan Google',async()=>{
 for(const url of ['https://9ph9jr6j75-collab.github.io/epss-a-la-mano/','https://9ph9jr6j75-collab.github.io/criterios-de-referencia-copia/','http://terminal.local:4173/','http://9ph9jr6j75-collab.github.io/criterios-de-referencia/','https://example.test/criterios-de-referencia/']){
  const env=await boot({url});assert.equal(env.scripts.length,0,url);assert.equal(env.events().length,0,url);assert.deepEqual(env.requests,['data/config.json']);
 }
 for(const url of ['https://9ph9jr6j75-collab.github.io/criterios-de-referencia/','https://criterios-de-referencia.solanocorella.chatgpt.site/']){
  const env=await boot({url});assert.equal(env.scripts.length,1);assert.match(env.scripts[0].src,/id=G-TEST12345$/);assert.equal(env.events().filter(call=>call[1]==='page_view').length,1);
 }
});
await check('Las visitas no incluyen query, hash ni títulos clínicos y la versión corresponde a la entrega',async()=>{
 const env=await boot({url:'https://9ph9jr6j75-collab.github.io/criterios-de-referencia/viewer.html?paciente=nombre-secreto#diagnostico-no-enviar'});
 const config=env.calls().find(call=>call[0]==='config')[2];
 assert.equal(config.send_page_view,false);assert.equal(config.allow_google_signals,false);assert.equal(config.allow_ad_personalization_signals,false);
 assert.equal(config.page_location,'https://9ph9jr6j75-collab.github.io/criterios-de-referencia/');assert.equal(config.page_referrer,'');assert.equal(config.page_title,'Criterios de referencia');
 env.window.trackReferenceEvent('reference_open',{card_id:card.id,query:'NO ENVIAR',patient_name:'NO ENVIAR',mode:'valor libre'});
 const event=env.events().at(-1);assert.equal(event[2].app_version,release.appVersion);assert.equal(event[2].card_id,card.id);assert(!JSON.stringify(env.calls()).includes('secreto'));assert(!JSON.stringify(env.calls()).includes('NO ENVIAR'));assert(!('mode' in event[2]));
});
await check('El hash no registra aperturas; solo una apertura confirmada de una ficha activa cuenta',async()=>{
 const selector=await boot({url:'https://9ph9jr6j75-collab.github.io/criterios-de-referencia/#ficha/'+encodeURIComponent(card.id)});
 assert.equal(selector.events().filter(event=>event[1]==='reference_open').length,0,'Llegar al selector no abre una fuente');
 assert(!selector.listeners.has('hashchange'),'La URL no confirma una selección de documento');
 const env=await boot({url:'https://9ph9jr6j75-collab.github.io/criterios-de-referencia/#ficha/nombre-clinico-inventado'});
 const initial=env.events().length;
 env.window.trackReferenceEvent('reference_open',{card_id:'persona_secreta'});
 env.window.trackReferenceEvent('source_download',{source_id:'persona_secreta'});
 env.window.trackReferenceEvent('evento_arbitrario',{query:'secreto'});
 assert.equal(env.events().length,initial);
 env.location.hash='#ficha/%E0%A4%A';assert.doesNotThrow(()=>env.listeners.get('hashchange')?.());assert.equal(env.events().length,initial);
 env.location.hash='#ficha/'+encodeURIComponent(card.id);env.listeners.get('hashchange')?.();
 assert.equal(env.events().length,initial,'Un cambio de URL no registra lectura');
 env.window.trackReferenceEvent('reference_open',{card_id:card.id});
 assert.equal(env.events().at(-1)[1],'reference_open');assert.equal(env.events().at(-1)[2].card_id,card.id);assert.equal(env.events().at(-1)[2].source_id,'N19');
 const before=env.events().length,withheld=cards.find(item=>item.catalogStatus==='withheld').id;
 env.location.hash='#ficha/'+withheld;env.listeners.get('hashchange')?.();
 env.window.trackReferenceEvent('reference_open',{card_id:withheld});assert.equal(env.events().length,before);
});
await check('Una apertura confirmada antes de terminar la carga se conserva una sola vez',async()=>{
 const env=await boot({url:'https://9ph9jr6j75-collab.github.io/criterios-de-referencia/#ficha/'+encodeURIComponent(card.id),early:window=>window.trackReferenceEvent('reference_open',{card_id:card.id,patient_name:'NO ENVIAR'})});
 const opened=env.events().filter(event=>event[1]==='reference_open');
 assert.equal(opened.length,1);assert.equal(opened[0][2].card_id,card.id);assert.equal(opened[0][2].source_id,'N19');assert(!JSON.stringify(env.calls()).includes('NO ENVIAR'));
});
await check('Eventos tempranos del visor y acciones reales conservan solo parámetros admitidos',async()=>{
 const env=await boot({early:window=>window.trackReferenceEvent('source_page',{source_id:'N19',page_number:4,search:'dato privado'})});
 assert.equal(env.events().filter(event=>event[1]==='source_page').length,1);assert.equal(env.events().find(event=>event[1]==='source_page')[2].page_number,4);
 env.location.hash='#ficha/'+card.id;
 for(const [id,event] of [['detail-print','reference_print'],['copy-reference','reference_template_copy'],['copy-missing','review_copy'],['detail-share','reference_share']]){
  env.click({id,dataset:{},hasAttribute:()=>false});assert.equal(env.events().at(-1)[1],event);assert.equal(env.events().at(-1)[2].card_id,card.id);
 }
 env.click({id:'',dataset:{favorite:card.id},hasAttribute:()=>false});assert.equal(env.events().at(-1)[1],'favorite_change');
 env.location.hash='#fuentes';env.click({id:'',dataset:{sourceAction:'download',pdfFilename:'N19-criterios-referencia.pdf'},hasAttribute:()=>false});assert.equal(env.events().at(-1)[1],'source_download');assert.equal(env.events().at(-1)[2].source_id,'N19');
 env.click({id:'',dataset:{},hasAttribute:name=>name==='data-install-help'});assert.equal(env.events().at(-1)[1],'installation_help');
 env.window.trackReferenceEvent('catalog_search',{result_count:3,query:'privado'});assert.equal(env.events().at(-1)[2].result_count,3);assert(!JSON.stringify(env.calls()).includes('privado'));
});
await check('Configuraciones incompletas, desactivadas o de otra app no activan medición',async()=>{
 for(const config of [null,{}, {...standard,appId:'epss-hospitales'}, {...standard,analytics:{...standard.analytics,enabled:false}}, {...standard,analytics:{...standard.analytics,measurementId:'G-INVALID<script>'}}, {...standard,analytics:{...standard.analytics,allowedSites:null}}, {...standard,analytics:{...standard.analytics,allowedSites:[{host:'9ph9jr6j75-collab.github.io',pathPrefix:'/criterios-de-referencia'}]}}]){
  const env=await boot({config});assert.equal(env.scripts.length,0);env.window.trackReferenceEvent('reference_open',{card_id:card.id});assert.equal(env.events().length,0);
 }
});
await check('La falta de red o de datos no rompe la app ni deja eventos pendientes para enviar',async()=>{
 for(const fail of ['data/config.json','data/release.json','data/cards.json','data/sources.json']){
  const env=await boot({fail,early:window=>window.trackReferenceEvent('reference_open',{card_id:card.id})});assert.equal(env.scripts.length,0);assert.equal(env.events().length,0);assert.doesNotThrow(()=>env.window.trackReferenceEvent('reference_open',{card_id:card.id}));assert.equal(env.events().length,0);
 }
});
console.log(JSON.stringify({ok:true,checks,measurementIsolation:'host + app path',appVersion:release.appVersion}));
