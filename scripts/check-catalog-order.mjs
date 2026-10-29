import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createTopicIndex,groupResults,isCatalogCard,specialtyGeneralRequirements,orderCatalogTopics} from '../catalog.js';

const root=new URL('../',import.meta.url);
const [cards,sources,definitions]=await Promise.all(['cards','sources','topics'].map(async name=>JSON.parse(await fs.readFile(new URL(`data/${name}.json`,root),'utf8'))));
const sourceMap=new Map(sources.map(source=>[source.id,source]));
const topicIndex=createTopicIndex(cards,definitions.groups);
const title=card=>card.topic?.name||card.name||'';
const specialty=card=>card.topic?.specialty||card.specialty||'';
const isReturn=card=>/^(?:II\s*[-→a]\s*I|2\s*[-→a]\s*1)$/i.test(String(card.direction||'').trim());
function resultsFor(selected='') {
  const pinned=new Set(specialtyGeneralRequirements(cards,{specialty:selected},sourceMap).map(card=>card.id));
  const matching=cards.filter(card=>isCatalogCard(card)&&!isReturn(card)&&!pinned.has(card.id)&&(!selected||card.specialty===selected));
  matching.sort((a,b)=>a.name.localeCompare(b.name,'es')||a.specialty.localeCompare(b.specialty,'es'));
  return groupResults(matching,topicIndex,sourceMap);
}
function inversions(results,compare) {
  return results.slice(1).filter((card,index)=>compare(results[index],card)>0).length;
}

const all=resultsFor();
assert(inversions(all,(a,b)=>title(a).localeCompare(title(b),'es'))>0,'La prueba debe reproducir el orden incorrecto de nombres de variantes antes de agrupar.');
for(const selected of ['', 'Gastroenterología', 'Fisiatría']) {
  const results=resultsFor(selected),before=[...results];
  const byName=orderCatalogTopics(results,{sort:'name'});
  assert.equal(inversions(byName,(a,b)=>title(a).localeCompare(title(b),'es')),0,`${selected||'Todas'}: nombres visibles en A a Z.`);
  const bySpecialty=orderCatalogTopics(results,{sort:'specialty'});
  assert.equal(inversions(bySpecialty,(a,b)=>specialty(a).localeCompare(specialty(b),'es')||title(a).localeCompare(title(b),'es')),0,`${selected||'Todas'}: especialidad y nombre visible.`);
  assert.deepEqual(results,before,'No modificar el orden recibido ni las fichas.');
  assert.notEqual(byName,results);
  assert.equal(byName.length,results.length);
  assert.equal(new Set(byName.map(card=>card.topic.id)).size,results.length);
}

// Una posición alta por coincidencia o por fecha debe conservarse aunque el
// nombre visible del tema sea distinto del nombre de su documento preferido.
const ranked=[...all].reverse();
for(const state of [{mode:'recent',sort:'name'},{mode:'recent',sort:'relevance',query:'catarata'},{sort:'relevance',query:'catarata'}]) {
  const ordered=orderCatalogTopics(ranked,state);
  assert.notEqual(ordered,ranked);
  assert.deepEqual(ordered.map(card=>card.topic.id),ranked.map(card=>card.topic.id));
  assert(ordered.every((card,index)=>card===ranked[index]),'Conservar las fuentes y variantes elegidas.');
}
const fallback=orderCatalogTopics([{id:'z',name:'Zeta',specialty:'Uno'},{id:'a',name:'Alfa',specialty:'Dos'}]);
assert.deepEqual(fallback.map(card=>card.id),['a','z'],'Los resultados sin tema usan su nombre propio.');
console.log(JSON.stringify({ok:true,topics:all.length,orders:['name','specialty'],specialties:['Todas','Gastroenterología','Fisiatría'],recentAndSearchRankingPreserved:true}));
