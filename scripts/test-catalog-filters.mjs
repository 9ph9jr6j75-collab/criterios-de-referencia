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

// Endodoncia conserva las fichas existentes, pero debe encontrarse tanto por
// nombre de especialidad como por diagnóstico, alias y el filtro real de UI.
const dentalPrefix='r01-odontologia-especializada-';
const expectedEndodonticIds=['pulpitis-sintomatica-k040','pulpitis-asintomatica-k040','periodontitis-apical-sintomatica-k045','periodontitis-apical-asintomatica-k045','absceso-apical-agudo-k047','absceso-apical-cronico-k046','lesiones-de-encia-y-de-la-zona-edentula-asociadas-con-traumatismo-k062'].map(suffix=>dentalPrefix+suffix).sort();
const matchingIds=env=>Array.from(env.state.filtered).flatMap(result=>Array.from(result.matchingCards,card=>card.id)).sort();
assert(baseline.node('#specialty-filter').innerHTML.includes('value="Endodoncia"'),'Ofrecer Endodoncia como especialidad.');
assert(baseline.node('#specialty-filter').innerHTML.includes('value="Odontología general avanzada"'),'Conservar OGA como especialidad propia.');
assert(!baseline.node('#specialty-filter').innerHTML.includes('value="Odontología especializada"'),'No ocultar ambos apartados bajo el encabezado general.');
for(const query of ['endodoncia','ENDODONCIA']){
  const env=boot({query});assert.deepEqual(matchingIds(env),expectedEndodonticIds);
  assert(env.state.filtered.every(result=>env.context.cardHTML(result).includes('Endodoncia')));
  assert(env.state.filtered.every(result=>env.context.cardHTML(result).includes('Incluye requisitos generales y específicos')),'La búsqueda directa conserva la revisión completa.');
}
const dentalFilter=boot();dentalFilter.change('#specialty-filter','Endodoncia');
assert.deepEqual(matchingIds(dentalFilter),expectedEndodonticIds);
assert.equal(dentalFilter.node('#specialty-filter').value,'Endodoncia');
assert.equal(dentalFilter.saved.at(-1).specialty,'Endodoncia');
assert.equal(dentalFilter.node('#specialty-general').hidden,false,'Los requisitos generales también están al explorar Endodoncia.');
assert(dentalFilter.node('#specialty-general').innerHTML.includes(dentalPrefix+'requisitos-generales-de-odontologia-especializada'));
dentalFilter.change('#source-filter','N09');assert.equal(dentalFilter.state.filtered.length,0,'Un filtro de otro documento no conserva criterios ajenos.');
assert.equal(dentalFilter.node('#specialty-general').hidden,true);
const oga=boot({specialty:'Odontología general avanzada',query:'OGA'});
assert.equal(oga.state.filtered.length,20,'OGA conserva sus veinte temas clínicos, aparte del requisito general.');
assert(oga.state.filtered.every(result=>result.specialty==='Odontología general avanzada'));
for(const query of ['pulpitis','K040']){
  const env=boot({specialty:'Endodoncia',query});assert.equal(env.state.filtered.length,2);
  assert(env.state.filtered.every(result=>result.specialty==='Endodoncia'));
}
// Reproducir la búsqueda reportada: ningún criterio clínico coincide, pero
// la lista común de Endodoncia sigue disponible con los filtros de su fuente.
const dentalGeneralId=dentalPrefix+'requisitos-generales-de-odontologia-especializada';
const reportedDentalSearch=boot({specialty:'Endodoncia',scope:'regional',query:'Quiste Apical Lateral'});
assert.equal(reportedDentalSearch.state.filtered.length,0,'No inventar un criterio clínico para una búsqueda ausente de la fuente.');
assert.equal(reportedDentalSearch.node('#specialty-general').hidden,false,'Una búsqueda sin coincidencias conserva los requisitos generales de la especialidad.');
assert.equal((reportedDentalSearch.node('#specialty-general').innerHTML.match(/class="specialty-general-source"/g)||[]).length,1,'Mostrar una sola lista general de la fuente aplicable.');
assert(reportedDentalSearch.node('#specialty-general').innerHTML.includes(dentalGeneralId));
assert.match(reportedDentalSearch.node('#result-count').textContent,/0 temas.*1 documento de requisitos generales/);
reportedDentalSearch.change('#source-filter','N09');
assert.equal(reportedDentalSearch.node('#specialty-general').hidden,true,'La búsqueda no conserva requisitos de R01 cuando se selecciona otro documento.');
const wrongScopeDentalSearch=boot({specialty:'Endodoncia',scope:'national',query:'Quiste Apical Lateral'});
assert.equal(wrongScopeDentalSearch.node('#specialty-general').hidden,true,'El alcance nacional no hereda los requisitos regionales de Endodoncia.');
const lateralCyst=boot({query:'Quiste Lateral'});
assert.deepEqual(matchingIds(lateralCyst),[dentalPrefix+'quistes-odontogenicos-y-de-la-region-bucal-k090-k098']);
assert.equal(lateralCyst.state.filtered[0].specialty,'Odontología general avanzada');
const lateralCystEndodontics=boot({query:'Quiste Lateral',specialty:'Endodoncia',scope:'regional'});
assert.equal(lateralCystEndodontics.state.filtered.length,0,'No trasladar criterios de OGA a Endodoncia al buscar.');
assert.equal(lateralCystEndodontics.node('#specialty-general').hidden,false);
assert(lateralCystEndodontics.node('#specialty-general').innerHTML.includes(dentalGeneralId));
const routineEndodonticIds=['pulpitis-asintomatica-k040','periodontitis-apical-asintomatica-k045','absceso-apical-cronico-k046'].map(suffix=>dentalPrefix+suffix).sort();
const priorityEndodonticIds=expectedEndodonticIds.filter(id=>!routineEndodonticIds.includes(id));
const routineEndodontics=boot({specialty:'Endodoncia',priority:'routine'});
assert.deepEqual(matchingIds(routineEndodontics),routineEndodonticIds,'No Urgente y A Cupo corresponden a consulta a cupo, sin confundirse por la palabra urgente.');
const priorityEndodontics=boot({specialty:'Endodoncia',priority:'priority'});
assert.deepEqual(matchingIds(priorityEndodontics),priorityEndodonticIds,'Solo las cuatro fichas con Cita Urgente se incluyen como consulta prioritaria.');
const urgentEndodontics=boot({specialty:'Endodoncia',priority:'urgent'});
assert.equal(urgentEndodontics.state.filtered.length,0,'Cita Urgente no equivale a remisión al Servicio de Urgencias.');
const dentalFavoriteId=dentalPrefix+'pulpitis-sintomatica-k040';
const dentalFavorite=boot({specialty:'Endodoncia',mode:'favorites',favorites:new Set([dentalFavoriteId])});
assert.deepEqual(matchingIds(dentalFavorite),[dentalFavoriteId],'La reclasificación conserva las favoritas por ID.');
assert.equal(dentalFavorite.node('#specialty-general').hidden,true,'No anteponer una lista general independiente a las favoritas.');
const dentalRecent=boot({specialty:'Endodoncia',mode:'recent',recent:[dentalFavoriteId]});
assert.deepEqual(matchingIds(dentalRecent),[dentalFavoriteId],'Las recientes siguen abriendo la ficha anterior.');
assert.equal(dentalRecent.node('#specialty-general').hidden,true,'No anteponer una lista general independiente a las recientes.');
assert.equal(JSON.stringify({cards,sources,definitions}),originalData,'La interfaz no altera la documentación clínica.');
console.log(JSON.stringify({ok:true,indexedDocuments:20,registeredDocuments:40,topics:567,sourcePredicates:20,sourceSelectionEvents:3,endodonticSearchAndFilter:7,ogaClinicalTopics:20,emptySpecialties:['Alergología','Nefrología','Psicología']}));
