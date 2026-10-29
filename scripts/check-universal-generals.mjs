import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createTopicIndex,groupResults,orderCatalogTopics,isCatalogCard,isGeneralCard,isReferralCard,generalRequirementsForCard,generalRequirementsCoverage,specialtyGeneralRequirements,showSpecialtyGeneralAccess,includeGeneralSearchResult} from '../catalog.js';

const root=new URL('../',import.meta.url);
const [app,cards,sources,definitions]=await Promise.all([
  fs.readFile(new URL('app.js',root),'utf8'),
  ...['cards','sources','topics'].map(async name=>JSON.parse(await fs.readFile(new URL(`data/${name}.json`,root),'utf8')))
]);
const topicIndex=createTopicIndex(cards,definitions.groups),sourceMap=new Map(sources.map(source=>[source.id,source]));
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const arr=value=>Array.isArray(value)?value:value?[value]:[];
const textOf=value=>value&&typeof value==='object'?String(value.text??value.label??''):String(value??'');
const isReturnCard=card=>/^(?:II\s*[-→a]\s*I|2\s*[-→a]\s*1)$/i.test(String(card.direction||'').trim());
const names=['buildIndex','filterCards','cardHTML','renderSpecialtyGeneral','renderCatalog'];
const code=names.map(name=>{
  const start=app.indexOf(`  function ${name}(`);assert(start>=0,name);
  const next=app.slice(start+1).search(/\n  (?:async )?function /);
  return next<0?app.slice(start):app.slice(start,start+1+next);
}).join('\n');
function boot(options={}){
  const nodes=new Map();
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:false,innerHTML:'',textContent:'',setAttribute(){}});return nodes.get(selector);};
  const state={cards,sourceMap,topicIndex,topics:topicIndex.topics,index:new Map(),favorites:new Set(),recent:[],query:'',specialty:'',scope:'',priority:'',source:'',mode:'all',sort:'relevance',ready:true,visible:1000,...options};
  const context={state,$:node,groupResults,orderCatalogTopics,isCatalogCard,isGeneralCard,isReturnCard,specialtyGeneralRequirements,generalRequirementsCoverage,showSpecialtyGeneralAccess,includeGeneralSearchResult,norm,esc,arr,textOf,
    sourceFor:card=>sourceMap.get(card.sourceId),scopeType:card=>/^N\d/.test(card.sourceId)?'national':'regional',cardPriorityType:()=>'',statusBadge:()=>'',icon:()=>'',
    shortText:(value,max=160)=>String(value||'').length>max?String(value).slice(0,max-1)+'…':String(value||''),pageLabel:card=>'Pág. '+arr(card.pages).join(', '),syncSortOptions(){},syncControls(){},PAGE_SIZE:32};
  vm.createContext(context);vm.runInContext(code,context);
  for(const card of cards)state.index.set(card.id,context.buildIndex(card));
  context.renderCatalog();return {state,context,node};
}
let checks=0;
function check(name,run){run();checks++;console.log('✓ '+name);}
const allIncluded='Incluye requisitos generales y específicos';

check('Buscar Amputados o Catarata ofrece la ficha completa sin exigir seleccionar especialidad',()=>{
  for(const [query,specialty,id]of [['amputados','Fisiatría','r01-fisiatria-amputados-p62'],['catarata','Oftalmología','n09-catarata']]){
    const baseline=boot({query}),selected=boot({query,specialty});
    for(const env of [baseline,selected]){
      const result=env.state.filtered.find(item=>item.allCards.some(card=>card.id===id));assert(result,query);
      assert.equal(env.node('#specialty-general').hidden,true,'Una búsqueda no exige abrir una ficha general aparte.');
      assert(env.state.filtered.every(item=>item.matchingCards.every(card=>!isGeneralCard(card))),'No anteponer documentos generales encontrados por palabras de su texto.');
      assert(env.context.cardHTML(result).includes(allIncluded),query+' indica que los generales están incorporados.');
    }
    assert.deepEqual(Array.from(baseline.state.filtered,item=>item.topic.id),Array.from(selected.state.filtered,item=>item.topic.id),'Seleccionar especialidad no cambia la ficha ni sus requisitos en estos casos.');
  }
});

check('Cada filtro documental de Catarata conserva solo los requisitos de esa fuente',()=>{
  for(const source of ['N09','R01','R03'])for(const specialty of ['','Oftalmología']){
    const env=boot({query:'catarata',specialty,source});assert.equal(env.state.filtered.length,1);
    const result=env.state.filtered[0];assert(result.matchingCards.every(card=>card.sourceId===source));
    assert(env.context.cardHTML(result).includes(allIncluded));assert(env.node('#specialty-general').hidden);
    for(const card of result.matchingCards)for(const general of generalRequirementsForCard(card,cards))assert.equal(general.sourceId,source);
  }
});

check('Favoritas y recientes conservan los requisitos incorporados sin anteponer un panel ajeno',()=>{
  for(const id of ['r01-fisiatria-amputados-p62','n09-catarata','r03-oftalmologia-cataratas']){
    const card=cards.find(item=>item.id===id);assert(card);
    for(const mode of ['favorites','recent'])for(const query of ['',id.includes('amputados')?'amputados':'catarata']){
      const env=boot({mode,query,specialty:card.specialty,favorites:new Set([id]),recent:[id]});
      assert.equal(env.state.filtered.length,1);assert(env.node('#specialty-general').hidden);
      const result=env.state.filtered[0];assert(env.context.cardHTML(result).includes(allIncluded));
      if(mode==='recent')assert.equal(result.id,id,'Recientes abre la variante realmente consultada.');
      assert(generalRequirementsForCard(card,cards).length>0);
    }
  }
});

check('La consulta general sigue disponible al explorar una especialidad o buscarla expresamente',()=>{
  const browse=boot({specialty:'Fisiatría'});assert.equal(browse.node('#specialty-general').hidden,false);
  assert(browse.node('#specialty-general').innerHTML.includes('Consulta adicional de la especialidad'));
  assert(browse.node('#specialty-general').innerHTML.includes('r01-fisiatria-requisitos-generales'));
  const explicit=boot({query:'requisitos generales',specialty:'Fisiatría'});
  assert(explicit.state.filtered.some(item=>item.matchingCards.some(card=>card.id==='r01-fisiatria-requisitos-generales')));
  assert.equal(explicit.node('#specialty-general').hidden,true,'La búsqueda expresa utiliza el resultado habitual.');
  assert.equal(showSpecialtyGeneralAccess({specialty:'Fisiatría',query:'  ',mode:'all'}),true);
  for(const state of [{specialty:''},{specialty:'Fisiatría',query:'amputados'},{specialty:'Fisiatría',mode:'favorites'},{specialty:'Fisiatría',mode:'recent'}])assert.equal(showSpecialtyGeneralAccess(state),false);
});

check('No se anuncia una lista general inexistente ni se hereda de otra fuente al filtrar',()=>{
  const card=cards.find(item=>item.id==='r02-neurologia-epilepsia');assert(card);
  const env=boot({query:'epilepsia',source:'R02'});const result=env.state.filtered.find(item=>item.matchingCards.some(member=>member.id===card.id));assert(result);
  assert.equal(generalRequirementsCoverage(result.matchingCards,cards).included,0);
  assert(!env.context.cardHTML(result).includes(allIncluded),'R01 no presta su lista general a R02.');
  const mixed=boot({query:'epilepsia'}).state.filtered.find(item=>item.allCards.some(member=>member.id===card.id));assert(mixed);
  const coverage=generalRequirementsCoverage(mixed.matchingCards,cards);
  assert(coverage.included>0&&coverage.included<coverage.total,'Ejercitar un tema real con fuentes de cobertura diferente.');
  assert.equal(coverage.label,'Requisitos generales según documento');
  for(const excluded of [cards.find(isGeneralCard),{...card,direction:'II-I'},{...card,catalogStatus:'withheld'}])assert.equal(generalRequirementsCoverage([excluded],cards).label,'');
});

check('Todas las variantes anuncian cobertura según sus documentos, sin alterar los registros',()=>{
  const before=JSON.stringify(cards),results=groupResults(cards.filter(isCatalogCard),topicIndex,sourceMap);
  let withGeneral=0,withoutGeneral=0;
  for(const result of results){
    for(const subset of [result.matchingCards,...result.matchingCards.map(card=>[card])]){
      const coverage=generalRequirementsCoverage(subset,cards),eligible=subset.filter(card=>isReferralCard(card)&&!isGeneralCard(card));
      const included=eligible.filter(card=>generalRequirementsForCard(card,cards).length>0).length;
      assert.equal(coverage.total,eligible.length);assert.equal(coverage.included,included);
      if(coverage.label===allIncluded)assert(included>0&&included===eligible.length);
      if(coverage.label==='Requisitos generales según documento')assert(included>0&&included<eligible.length);
    }
  }
  for(const card of cards.filter(card=>isCatalogCard(card)&&isReferralCard(card)&&!isGeneralCard(card))){
    const general=generalRequirementsForCard(card,cards);
    if(general.length)withGeneral++;else withoutGeneral++;
    for(const item of general){assert.equal(item.sourceId,card.sourceId);assert.equal(item.specialty,card.specialty);assert.equal(item.direction||'I-II',card.direction||'I-II');}
  }
  assert(withGeneral>600&&withoutGeneral>0,'Ejercitar fichas reales con y sin listas generales identificadas.');
  assert.equal(JSON.stringify(cards),before,'La presentación no modifica los criterios ni crea nuevas fichas.');
});
console.log(JSON.stringify({ok:true,checks,catalogTopics:topicIndex.topics.filter(topic=>topic.cards.some(card=>isCatalogCard(card)&&!isReturnCard(card))).length}));
