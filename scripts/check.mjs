import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createTopicIndex, groupResults, orderDocuments, uniqueTopicCount, isCatalogCard} from '../catalog.js';
const root=path.resolve(import.meta.dirname,'..');
const cards=JSON.parse(await fs.readFile(path.join(root,'data/cards.json'),'utf8'));
const sources=JSON.parse(await fs.readFile(path.join(root,'data/sources.json'),'utf8'));
const byId=new Map(sources.map(s=>[s.id,s]));
const definitions=JSON.parse(await fs.readFile(path.join(root,'data/topics.json'),'utf8')).groups;
const topicIndex=createTopicIndex(cards,definitions);
const grouped=groupResults(cards,topicIndex,byId);
assert.equal(grouped.length,topicIndex.topics.filter(topic=>topic.cards.some(isCatalogCard)).length,'Un resultado por tema con criterios documentados');
assert.equal(new Set(definitions.flatMap(topic=>topic.cardIds)).size,cards.length,'Conservar todas las fichas');
const cataract=topicIndex.byCard.get('n09-catarata');
assert.equal(cataract.cardIds.length,3,'Catarata debe reunir tres fuentes');
assert.equal(orderDocuments(cataract.cards,byId)[0].sourceId,'N09','Catarata nacional identificada primero');
const filteredCataract=groupResults(cataract.cards.filter(card=>card.sourceId==='R03'),topicIndex,byId);
assert.equal(filteredCataract.length,1);assert.equal(filteredCataract[0].sourceId,'R03','Respetar filtro documental');
assert.equal(filteredCataract[0].allCards.length,3,'Conservar alternativas al filtrar');
assert.equal(uniqueTopicCount(cataract.cardIds,topicIndex),1,'Favoritas de versiones cuentan un tema');
const latest=groupResults([cataract.cards.find(card=>card.sourceId==='R03'),...cataract.cards.filter(card=>card.sourceId!=='R03')],topicIndex,byId,true);
assert.equal(latest[0].sourceId,'R03','Recientes vuelve a la última fuente consultada');
assert.notEqual(topicIndex.byCard.get('r01-oftalmologia-estrabismo').id,topicIndex.byCard.get('r01-oftalmologia-estrabismo-subito').id,'No mezclar estrabismo y estrabismo súbito');
const bronchiolitis=topicIndex.topics.find(topic=>topic.name.toLowerCase()==='bronquiolitis');
assert(bronchiolitis?.cards.some(card=>card.sourceId==='N05'),'Conservar variante nacional pediátrica');
assert.equal(orderDocuments(bronchiolitis.cards,byId)[0].sourceId,'R01','Vigencia por confirmar no desplaza automáticamente al regional');
for(const topic of topicIndex.topics.filter(topic=>topic.cards.length>1))assert(topic.cards.every(card=>topic.variantLabels?.[card.id]),'Identificar cada escenario por documento');
assert(cards.length>700,'Falta la base de fichas');
assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'IDs duplicados');
let pageLinks=0,checks=0;
for(const card of cards){
 assert(card.name&&card.fullText&&card.specialty,'Ficha sin contenido: '+card.id);
 const source=byId.get(card.sourceId);assert(source?.localPdf,'Fuente sin documento: '+card.id);
 assert(card.pages.length,'Ficha sin página: '+card.id);
 for(const page of card.pages){
  assert(Number.isInteger(page)&&page>=1&&page<=source.pageCount,'Página incorrecta: '+card.id);
  await fs.access(path.join(root,source.pageImageBase,page+'.webp'));pageLinks++;
 }
 for(const check of card.checklist||[]){assert(check.text?.trim(),'Casilla vacía '+card.id);checks++;}
 assert(!/[\ue000-\uf8ff]/u.test(JSON.stringify(card)),'Glifo no legible '+card.id);
}
for(const source of sources.filter(s=>s.localPdf)){
 const bytes=await fs.readFile(path.join(root,source.localPdf));assert.equal(bytes.subarray(0,4).toString(),'%PDF','PDF inválido '+source.id);
}
assert.equal(byId.get('N07').documentStatus,'review','No ocultar revisión de vigencia Urología');
assert(cards.some(c=>c.sourceId==='R03'&&c.pages.length),'Sin páginas en Word convertido');
assert(cards.filter(c=>c.direction==='II-I').length>=5,'Faltan contrarreferencias identificadas');
const app=await fs.readFile(path.join(root,'app.js'),'utf8');
const viewer=await fs.readFile(path.join(root,'viewer.js'),'utf8');
for(const html of ['index.html','viewer.html'])assert(!/<(?:iframe|embed|object)\b/i.test(await fs.readFile(path.join(root,html),'utf8')),'No incrustar PDF en la app');
assert(!/pdfjs|pdf\.worker|arrayBuffer\(/i.test(app+viewer),'No descargar PDF completo para leer página');
const match=app.match(/const priorityType = \(value,sourceId\) => \{([\s\S]*?)\n  \};/);assert(match,'Función de prioridad no encontrada');
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const classify=new Function('norm','value','sourceId',match[1]);
for(const [input,want] of [['Con urgencia a consulta externa','priority'],['Urgencias eventos agudos Crónicos a la consulta externa','mixed'],['Servicio de Emergencias','urgent'],['Servicio de emergencias, Medicina Interna o Neurología','mixed'],['A cupo','routine'],['Cupo y prioridad según el caso','mixed'],['','']])assert.equal(classify(norm,input),want,'Prioridad no inequívoca: '+input);
assert.equal(classify(norm,'Referir al Servicio de Urgencias, según este apartado de la fuente.'),'urgent','La coletilla editorial no es una condición clínica');
assert.equal(classify(norm,'Servicio de Urgencias si hay pérdida súbita de visión'),'mixed','Conservar condiciones clínicas reales');
assert.equal(classify(norm,'Criterio de Prioridad: Grado 3 Gastroscopia por Consulta externa','N19'),'routine');
assert.equal(classify(norm,'Criterio de Prioridad: Urgente','N19'),'urgent');
assert.equal(classify(norm,'Criterio de Prioridad: Grado 1','N19'),'priority');
assert.equal(classify(norm,'Grado 2 colonoscopia por consulta externa a cupo','N19'),'mixed');
const colonFamily=cards.find(card=>card.id==='n19-antecedente-de-cancer-de-colon-en-familiar-de-primer-grado-colonoscopia');
assert(colonFamily.studies.some(study=>study.type==='source'&&/hemograma/i.test(study.text)),'Hemograma familiar de colon no es condicional');
assert(colonFamily.studies.some(study=>study.type==='conditional'&&/enema/i.test(study.text)),'Colon por enema conserva condición de disponibilidad');
assert(cards.find(card=>card.id==='n19-poliposis-familiar-y-polipos-adenomatosos-colonoscopia').requiresReview,'No ocultar discrepancia Grado 2/a cupo');
assert(cards.filter(card=>card.sourceId==='N19').every(card=>card.applicability),'Conservar exclusiones de Gastroenterología');
assert(!/G-ZF3D4DNPKB|G-H0Z84C93TL/.test(app),'No reutilizar Analytics de otra app');
console.log(JSON.stringify({ok:true,temas:grouped.length,fichas:cards.length,fichasPublicadas:cards.filter(isCatalogCard).length,apartadosSinCriterios:cards.filter(card=>!isCatalogCard(card)).length,fuentes:sources.length,enlacesDePagina:pageLinks,elementosDeRevision:checks}));
