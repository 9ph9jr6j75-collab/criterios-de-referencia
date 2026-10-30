import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createTopicIndex,isCatalogCard,orderDocuments,generalRequirementsCoverage} from '../catalog.js';

const root=new URL('../',import.meta.url);
const [app,cards,sources,definitions]=await Promise.all([
  fs.readFile(new URL('app.js',root),'utf8'),
  ...['cards','sources','topics'].map(async name=>JSON.parse(await fs.readFile(new URL(`data/${name}.json`,root),'utf8')))
]);
const functions=['documentChoiceRequired','chooseDocument','topicSourcesHTML','renderDetail','attachEvents'].map(name=>{
  const start=app.indexOf(`  function ${name}(`);assert(start>=0,name);
  const next=app.slice(start+1).search(/\n  (?:async )?function /);
  return next<0?app.slice(start):app.slice(start,start+1+next);
}).join('\n');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const active=cards.filter(isCatalogCard),topicIndex=createTopicIndex(cards,definitions.groups);
const cataract=active.find(card=>card.id==='n09-catarata');
assert(cataract);
function boot({savedChoices=[],source='',fromCatalog=false,hash='#ficha/n09-catarata'}={}){
  const nodes=new Map(),storage=new Map(),documentEvents=new Map(),windowEvents=new Map(),analytics=[];
  class Node {
    constructor(){this.listeners={};this.dataset={};this.style={};this.hidden=false;this.attrs={};this.textContent='';}
    addEventListener(name,callback){this.listeners[name]=callback;}
    setAttribute(name,value){this.attrs[name]=String(value);}
    focus(){this.focused=true;}
    set innerHTML(value){this.html=value;for(const id of value.matchAll(/\bid="([^"]+)"/g))nodes.set('#'+id[1],new Node());}
    get innerHTML(){return this.html||'';}
  }
  const panel=new Node();nodes.set('#detail-screen',panel);
  const state={cards,sourceMap:new Map(sources.map(item=>[item.id,item])),sources,topicIndex,chosenDocuments:new Set(savedChoices),recent:[],source,navigatingFromCatalog:fromCatalog,query:'',favorites:new Set(),currentId:'',detailTab:'summary'};
  const getNode=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};
  const context={state,STORE:'test',sessionStorage:storage,localStorage:new Map(),document:{title:'',addEventListener:(name,callback)=>documentEvents.set(name,callback),querySelector:()=>null},window:{addEventListener:(name,callback)=>windowEvents.set(name,callback),scrollY:0,trackReferenceEvent:(name,fields)=>analytics.push({name,cardId:fields.card_id})},location:{hash},
    $:getNode,$$:()=>[],esc:escape,arr:value=>Array.isArray(value)?value:value?[value]:[],icon:()=>'',isCatalogCard,orderDocuments,generalRequirementsCoverage,
    sourceFor:item=>state.sourceMap.get(item.sourceId)||{id:item.sourceId,titulo:item.sourceId},scopeType:item=>/^N/.test(item.sourceId)?'national':state.sourceMap.get(item.sourceId)?.documentStatus==='unverified'?'unverified':'regional',pageLabel:item=>`Págs. ${(item.pages||[]).join(', ')}`,
    safeRead:(store,key,fallback)=>store.get(key)??fallback,safeWrite:(store,key,value)=>store.set(key,value),
    sourceTranscriptionHTML:card=>`<details id="document-transcription" data-clinical-source="${card.sourceId}">Texto documental</details>`,edusGuidanceHTML:()=>'',sourceStatusNote:()=>'<section data-document-warning="true">Aviso documental</section>',sourcePanel:()=>'',feedbackPanel:()=>'<section data-feedback="true">Reportar error</section>',statusBadge:()=>'',summaryHTML:card=>`<section data-clinical-source="${card.sourceId}">Criterios de ${card.sourceId}</section>`,generalRequirementsHTML:()=>'',checklistHTML:card=>`<aside data-review-source="${card.sourceId}"><input type="checkbox"></aside>`,
    updateDetailFavorite(){},updateChecklist(){},applyDetailTab(){},cardPriorityType:()=>'',saveDetailReading(){},detailReading:()=>({detailTab:'summary'}),getChecked:()=>new Set(),norm:value=>String(value||'').toLowerCase(),textOf:item=>item?.text||String(item||''),
    announce(){},toggleFavorite(){},shareCard(){},printCard(){},copyText(){},referenceTemplate(){},missingTemplate(){},saveCatalog(){},syncControls(){},renderCatalog(){},setMode(){},resetFilters(){},updateNetwork(){},updateFavoriteCounts(){},safeWriteTest:storage,
    clearTimeout(){},setTimeout(){},requestAnimationFrame:callback=>callback()
  };
  context.handleRoute=()=>context.renderDetail(decodeURIComponent(context.location.hash.slice(7)));
  vm.createContext(context);vm.runInContext(functions,context);
  return {context,state,panel,nodes,storage,documentEvents,analytics};
}
let count=0;const test=(name,run)=>{run();count++;console.log('✓ '+name);};

test('Un enlace directo multifuentе pide elección sin criterios, casillas, herramientas ni reciente',()=>{
  const env=boot();env.context.renderDetail(cataract.id);
  assert.match(env.panel.innerHTML,/Elija el documento para esta referencia/);
  assert(!/data-review-source|data-clinical-source|id="detail-print"|id="detail-share"|type="checkbox"/.test(env.panel.innerHTML));
  assert(!/aria-current="true"|is-selected/.test(env.panel.innerHTML),'ninguna fuente aparece elegida por defecto');
  assert.equal(env.state.recent.length,0);assert.equal(env.state.currentId,'');assert.equal(env.analytics.length,0,'La elección pendiente no se registra como apertura de una fuente.');
  for(const id of ['N09','R01','R03'])assert(env.panel.innerHTML.includes(id));
  assert.match(env.panel.innerHTML,/Nacional CCSS/);assert.match(env.panel.innerHTML,/Regional \/ servicio/);assert.match(env.panel.innerHTML,/Hospital Tony Facio/);
  assert.match(env.panel.innerHTML,/Ámbito:/);assert.match(env.panel.innerHTML,/Vigencia declarada:/);assert.match(env.panel.innerHTML,/no demuestra por sí mismo que sustituya/);
  assert(!/<details class="topic-sources"/.test(env.panel.innerHTML));
});

test('Clic de elección en el mismo enlace abre sólo N09 y mantiene el selector visible',()=>{
  const env=boot();env.context.attachEvents();env.context.renderDetail(cataract.id);
  let prevented=false;
  env.documentEvents.get('click')({target:{closest:selector=>selector==='[data-source-choice]'?{dataset:{sourceChoice:cataract.id}}:null},preventDefault:()=>{prevented=true;}});
  assert(prevented);assert(env.state.chosenDocuments.has(cataract.id));
  assert.deepEqual(Array.from(env.storage.get('test:chosen-documents')),[cataract.id]);
  assert.match(env.panel.innerHTML,/data-review-source="N09"/);assert(!/data-review-source="R01"|data-review-source="R03"/.test(env.panel.innerHTML));
  assert.match(env.panel.innerHTML,/id="detail-print"/);assert.match(env.panel.innerHTML,/Documento elegido: N09/);assert.deepEqual(env.analytics,[{name:'reference_open',cardId:cataract.id}]);
  const local=topicIndex.byCard.get(cataract.id).cards.find(card=>card.sourceId==='R03');assert(local);assert(env.panel.innerHTML.includes(`data-source-choice="${local.id}"`));
});

test('Cambiar a HTFC conserva identidad y revisión separadas de N09',()=>{
  const env=boot({savedChoices:[cataract.id]});
  const local=topicIndex.byCard.get(cataract.id).cards.find(card=>card.sourceId==='R03');assert(local);
  env.context.chooseDocument(local.id);assert.equal(env.context.location.hash,'#ficha/'+encodeURIComponent(local.id));
  env.context.handleRoute();assert.match(env.panel.innerHTML,/data-review-source="R03"/);assert(!/data-review-source="N09"/.test(env.panel.innerHTML));
  assert.match(env.panel.innerHTML,/Documento elegido: R03/);assert.match(env.panel.innerHTML,/Hospital Tony Facio/);
  assert.match(env.panel.innerHTML,/data-document-warning="true"/);
});

test('Tras elegir, el selector compacto cambia de fuente sin repetir la pantalla inicial',()=>{
  const env=boot({savedChoices:[cataract.id]});env.context.renderDetail(cataract.id);
  const local=topicIndex.byCard.get(cataract.id).cards.find(card=>card.sourceId==='R03');assert(local);
  assert.match(env.panel.innerHTML,/<section class="topic-sources document-switcher"/);
  assert.match(env.panel.innerHTML,/<select id="detail-source-select" aria-label="Cambiar documento consultado">/);
  assert.match(env.panel.innerHTML,/<details class="document-comparison">/,'Las tarjetas completas se consultan al desplegar la comparación.');
  assert(!/<details class="document-comparison"[^>]*\bopen(?:\s|>)/.test(env.panel.innerHTML));
  assert(!/source-choice-required|Elija el documento para esta referencia/.test(env.panel.innerHTML));
  assert(env.panel.innerHTML.indexOf('id="detail-source-select"')<env.panel.innerHTML.indexOf('data-review-source="N09"'));
  const select=env.nodes.get('#detail-source-select');assert(select?.listeners.change,'El selector tiene cambio enlazado.');
  select.listeners.change({target:{value:local.id}});
  assert.equal(env.context.location.hash,'#ficha/'+encodeURIComponent(local.id));env.context.handleRoute();
  assert.match(env.panel.innerHTML,/data-review-source="R03"/);assert(!/data-review-source="N09"/.test(env.panel.innerHTML));
  assert(env.panel.innerHTML.includes(`<option value="${local.id}" selected>`));
  assert(!/source-choice-required|Elija el documento para esta referencia/.test(env.panel.innerHTML));
  assert.match(env.panel.innerHTML,/<details class="document-comparison">/);
  assert.deepEqual(env.analytics.map(event=>event.cardId),[cataract.id,local.id]);
});

test('Fuente única abre directamente; elegir previamente no bloquea visitas posteriores ni retorno del visor',()=>{
  const single=active.find(card=>new Set(topicIndex.byCard.get(card.id).cards.filter(isCatalogCard).map(item=>item.sourceId)).size===1);assert(single);
  const env=boot();env.context.renderDetail(single.id);assert.match(env.panel.innerHTML,/data-review-source/);
  const chosen=boot({savedChoices:[cataract.id]});chosen.context.renderDetail(cataract.id);assert.match(chosen.panel.innerHTML,/data-review-source="N09"/);
  const restored=boot();restored.context.renderDetail(cataract.id,true);assert.match(restored.panel.innerHTML,/data-review-source="N09"/);
});

test('Sólo un filtro explícito por fuente desde el catálogo puede evitar la elección inicial',()=>{
  for(const fromCatalog of [false,true]){
    const env=boot({source:'N09',fromCatalog});env.context.renderDetail(cataract.id);
    assert.equal(/data-review-source="N09"/.test(env.panel.innerHTML),fromCatalog);
  }
  const env=boot({fromCatalog:true});env.state.scope='national';env.context.renderDetail(cataract.id);
  assert(!/data-review-source/.test(env.panel.innerHTML),'el alcance nacional no elige un documento');
  assert.equal(env.state.navigatingFromCatalog,false);
});

test('Una elección de otra fuente no autoriza silenciosamente el documento predeterminado',()=>{
  const local=topicIndex.byCard.get(cataract.id).cards.find(card=>card.sourceId==='R03');
  const env=boot({savedChoices:[local.id]});env.context.renderDetail(cataract.id);assert(!/data-review-source/.test(env.panel.innerHTML));
  assert(env.state.chosenDocuments.has(local.id));assert(!env.state.chosenDocuments.has(cataract.id));
});

test('Todas las variantes de temas multifuentе exigen elección inicial y cada elección permite su lectura',()=>{
  const env=boot();let gated=0,direct=0;
  for(const card of active){
    env.state.chosenDocuments.clear();
    const multiple=new Set(topicIndex.byCard.get(card.id).cards.filter(isCatalogCard).map(item=>item.sourceId)).size>1;
    assert.equal(env.context.documentChoiceRequired(card,topicIndex.byCard.get(card.id)),multiple,card.id);
    env.state.chosenDocuments.add(card.id);
    assert.equal(env.context.documentChoiceRequired(card,topicIndex.byCard.get(card.id)),false,card.id);
    if(multiple)gated++;else direct++;
  }
  assert(gated>0&&direct>0);console.log(`  ${gated} variantes protegidas; ${direct} variantes de fuente única.`);
});

console.log(`Selección de documentos: ${count} pruebas correctas.`);
