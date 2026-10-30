import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createTopicIndex,groupResults,orderCatalogTopics,isCatalogCard,isGeneralCard,generalRequirementsCoverage,specialtyGeneralRequirements,showSpecialtyGeneralAccess,includeGeneralSearchResult,uniqueTopicCount} from '../catalog.js';

const root=new URL('../',import.meta.url);
const [app,cards,sources,definitions]=await Promise.all([
  fs.readFile(new URL('app.js',root),'utf8'),
  ...['cards','sources','topics'].map(async name=>JSON.parse(await fs.readFile(new URL(`data/${name}.json`,root),'utf8')))
]);
const originalData=JSON.stringify({cards,sources,definitions});
const topicIndex=createTopicIndex(cards,definitions.groups),sourceMap=new Map(sources.map(source=>[source.id,source]));
const names=['populateFilters','syncControls','syncSortOptions','buildIndex','filterCards','cardHTML','renderSpecialtyGeneral','renderCatalog','removeFilter','resetFilters','attachEvents'];
const code=names.map(name=>{
  const start=app.indexOf(`  function ${name}(`);assert(start>=0,name);
  const next=app.slice(start+1).search(/\n  (?:async )?function /);
  return next<0?app.slice(start):app.slice(start,start+1+next);
}).join('\n');
const priorityCode=app.slice(app.indexOf('  const priorityType ='),app.indexOf('  const sourceFor ='));
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const arr=value=>Array.isArray(value)?value:value?[value]:[];
const textOf=value=>value&&typeof value==='object'?String(value.text??value.label??''):String(value??'');
const isReturnCard=card=>/^(?:II\s*[-→a]\s*I|2\s*[-→a]\s*1)$/i.test(String(card.direction||'').trim());
function boot(options={}){
  const nodes=new Map(),saved=[],documentEvents=new Map();
  const node=selector=>{
    if(!nodes.has(selector)){
      const listeners=new Map(),attributes=new Map();let html='',value='';
      nodes.set(selector,{hidden:false,textContent:'',listeners,attributes,
        setAttribute(key,next){attributes.set(key,next);},addEventListener(type,callback){listeners.set(type,callback);},
        get innerHTML(){return html;},set innerHTML(next){html=next;},
        get value(){return value;},set value(next){value=next;}
      });
    }
    return nodes.get(selector);
  };
  const state={cards,sources,sourceMap,topicIndex,topics:topicIndex.topics,index:new Map(),favorites:new Set(),recent:[],query:'',specialty:'',scope:'',priority:'',source:'',mode:'all',sort:'name',ready:true,visible:32,filtersOpen:true,...options};
  const context={state,$:node,$$:()=>[],norm,esc,arr,textOf,isReturnCard,isCatalogCard,isGeneralCard,groupResults,orderCatalogTopics,specialtyGeneralRequirements,showSpecialtyGeneralAccess,includeGeneralSearchResult,generalRequirementsCoverage,
    sourceFor:card=>sourceMap.get(card.sourceId)||{id:card.sourceId,titulo:'Fuente documental'},
    scopeType:card=>/^N\d/.test(card.sourceId||'')||/nacional/i.test(sourceMap.get(card.sourceId)?.alcance||card.scope||'')?'national':sourceMap.get(card.sourceId)?.documentStatus==='unverified'||/por documentar/i.test(card.scope||sourceMap.get(card.sourceId)?.alcance||'')?'unverified':'regional',
    statusBadge:source=>`<span>${esc(source.id)}</span>`,icon:()=>'',shortText:(value,max=160)=>String(value||'').length>max?String(value).slice(0,max-1)+'…':String(value||''),pageLabel:card=>'Pág. '+arr(card.pages).join(', '),PAGE_SIZE:32,
    updateFavoriteCounts(){node('#favorite-count').textContent=uniqueTopicCount(state.favorites,topicIndex)||'';},
    saveCatalog:()=>saved.push({specialty:state.specialty,source:state.source,priority:state.priority,query:state.query,scope:state.scope}),
    updateNetwork(){},setMode(){},toggleFavorite(){},copyText(){},saveDetailReading(){},handleRoute(){},
    window:{addEventListener(){}},document:{addEventListener(type,callback){documentEvents.set(type,callback);}},
    localStorage:{},sessionStorage:{},safeRead(){return [];},safeWrite(){},STORE:'test',REPORT_EMAIL:'test@example.invalid'
  };
  vm.createContext(context);vm.runInContext(priorityCode+'\n'+code,context);
  for(const card of cards)state.index.set(card.id,context.buildIndex(card));
  context.populateFilters();context.attachEvents();context.renderCatalog();
  return {state,context,node,saved,change(selector,value){const control=node(selector);control.value=value;control.listeners.get('change')({target:control});}};
}

const baseline=boot();
assert.equal(baseline.state.filtered.length,567,'Conservar el catálogo visible actual.');
assert(!baseline.node('#scope-filter').innerHTML.includes('unverified'),'No ofrecer un alcance sin fichas.');
assert(baseline.node('#scope-filter').innerHTML.includes('national'));
assert(baseline.node('#scope-filter').innerHTML.includes('regional'));
assert.match(baseline.node('#source-filter').innerHTML,/Todos \(20 con fichas\)/);
assert.match(baseline.node('#source-coverage-label').textContent,/20 documentos.*40.*20 restantes/);
assert.match(baseline.node('#source-registry-link').textContent,/registro.*40 documentos/);
const stale=boot({scope:'unverified',source:'E01'});
assert.equal(stale.state.scope,'');assert.equal(stale.state.source,'');

// Probar el predicado real para cada documento, incluso si otros filtros dan cero.
for(const source of new Set(cards.filter(isCatalogCard).map(card=>card.sourceId))){
  const matches=baseline.context.filterCards({source});assert(matches.length,source);
  assert(matches.every(result=>result.matchingCards.every(card=>card.sourceId===source)),source+' no mezcla documentos');
}
for(const source of ['N09','R01','R03']){
  const env=boot({query:'catarata'});env.change('#source-filter',source);
  assert.equal(env.state.source,source);assert.equal(env.node('#source-filter').value,source);
  assert.equal(env.state.filtered.length,1);
  const result=env.state.filtered[0],html=env.context.cardHTML(result);
  assert.equal(result.sourceId,source);assert.equal(result.allCards.length,3,'Conservar las alternativas al abrir la ficha.');
  assert(result.matchingCards.every(card=>card.sourceId===source));
  assert(!html.includes('3 documentos'),'El resultado filtrado no anuncia tres documentos como seleccionados.');
  assert(!html.includes('N09 · R01 · R03'),'El pie identifica solo el documento filtrado.');
  assert(html.includes(`data-card-link="${result.id}"`),'Abrir la variante del documento elegido.');
  assert(env.node('#active-filter-list').innerHTML.includes(`Documento: <strong>${source}`));
  assert.equal(env.saved.at(-1).source,source);
}

for(const specialty of ['Alergología','Nefrología','Psicología']){
  const env=boot({specialty,priority:'priority'});
  assert.equal(env.state.filtered.length,0,specialty+' no tiene prioridad explícita en las fichas disponibles.');
  assert.equal(env.node('#empty-remove-priority').hidden,false);
  assert.match(env.node('#empty-copy').textContent,/Consulta prioritaria.*1 tema/);
  assert(env.node('#active-filter-list').innerHTML.includes('Atención: <strong>Consulta prioritaria'));
  env.node('#empty-remove-priority').listeners.get('click')();
  assert.equal(env.state.priority,'');assert.equal(env.state.specialty,specialty);
  assert.equal(env.state.filtered.length,1,specialty+' reaparece sin perder la especialidad.');
}
const retained=boot({specialty:'Nefrología',source:'N12',priority:'priority',query:'hipertensión'});
retained.node('#empty-remove-priority').listeners.get('click')();
assert.equal(retained.state.source,'N12');assert.equal(retained.state.query,'hipertensión');assert.equal(retained.state.specialty,'Nefrología');assert.equal(retained.state.filtered.length,1);
const chips=boot({specialty:'Oftalmología',source:'R03',priority:'priority',query:'catarata'});
chips.node('#active-filter-list').listeners.get('click')({target:{closest:()=>({dataset:{removeFilter:'source'}})}});
assert.equal(chips.state.source,'');assert.equal(chips.state.specialty,'Oftalmología');assert.equal(chips.state.query,'catarata');assert.equal(chips.state.priority,'priority');
chips.context.removeFilter('cards');assert.equal(chips.state.cards,cards,'No aceptar nombres arbitrarios como filtros.');
const favorite=boot({query:'catarata',source:'R03',favorites:new Set(['n09-catarata'])});
assert(favorite.context.cardHTML(favorite.state.filtered[0]).includes('aria-pressed="true"'),'La favorita sigue siendo del tema aunque se filtre otra variante.');
assert.equal(JSON.stringify({cards,sources,definitions}),originalData,'La interfaz no altera la documentación clínica.');
console.log(JSON.stringify({ok:true,indexedDocuments:20,registeredDocuments:40,topics:567,sourcePredicates:20,sourceSelectionEvents:3,emptySpecialties:['Alergología','Nefrología','Psicología']}));
