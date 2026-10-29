import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createTopicIndex,groupResults,orderDocuments,uniqueTopicCount,isCatalogCard} from '../catalog.js';

const root=path.resolve(import.meta.dirname,'..');
const [cards,sources,topics,release]=await Promise.all(['cards','sources','topics','release'].map(async name=>JSON.parse(await fs.readFile(path.join(root,`data/${name}.json`),'utf8'))));
const byId=new Map(cards.map(card=>[card.id,card])),sourceMap=new Map(sources.map(source=>[source.id,source]));
const index=createTopicIndex(cards,topics.groups),active=cards.filter(isCatalogCard),withheld=cards.filter(card=>!isCatalogCard(card));
const get=id=>{const card=byId.get(id);assert(card,`Ficha de regresión no encontrada: ${id}`);return card};
const text=items=>(items||[]).map(item=>typeof item==='string'?item:item.text||'').join('\n');
const pendingRegressions=[];
const oldIds=['applicability',...Array.from({length:300},(_,i)=>[`item-${i+1}`,`c${i+1}`,`study-${i+1}`]).flat()];

// These source rows give a destination, not the clinical conditions for referral.
for(const id of ['r01-cirugia-pediatrica-constipacion-p34','r01-cirugia-pediatrica-constipacion-del-lactante-o-mayor-p34']){
 const card=get(id);assert.equal(isCatalogCard(card),false,'No volver a publicar la ruta de Cirugía como criterio de estreñimiento');
 assert.deepEqual(card.criteria,[]);assert.deepEqual(card.checklist,[]);assert.match(card.fullText,/Pediatría/);
 assert(card.relatedCardIds.includes('n05-estrenimiento'));
 assert(card.relatedCardIds.includes('r01-pediatria-estrenimiento-cronico'));
 assert(card.relatedCardIds.every(id=>isCatalogCard(get(id))),'Enlaces de orientación deben llevar a fichas activas');
}
const national=get('n05-estrenimiento'),regional=get('r01-pediatria-estrenimiento-cronico');
assert(isCatalogCard(national)&&isCatalogCard(regional));
for(const pattern of [/menor de un año/,/mayor de un año.*no mejora/s,/impactación fecal.*seguimiento/s,/primer mes de vida/,/sangre.*fisuras anales/s,/ganancia de peso/,/vómitos biliosos.*distensión abdominal.*Urgencias/s])assert.match(text(national.criteria),pattern,'Conservar criterio o alarma de N05p19');
assert(national.criteria.length>=5,'Desglosar alternativas y ruta de urgencias');
assert.match(text(regional.criteria),/más de 3 meses/);assert.match(text(regional.criteria),/no haya mejorado/);
assert(!text(national.criteria).includes('3 meses'),'No transferir umbral regional a la fuente nacional');
assert.deepEqual(national.pages,[19]);assert.deepEqual(regional.pages,[206]);

// An included diagnostic list must not become 23 fabricated checklists.
const eisam=cards.filter(card=>card.specialty==='EISAM'&&card.category!=='general');
assert.equal(eisam.length,23);assert(eisam.every(card=>!isCatalogCard(card)&&!card.criteria.length&&!card.checklist.length));
const eisamGeneral=get('r01-eisam-requisitos-generales');assert(isCatalogCard(eisamGeneral));assert.equal(eisamGeneral.category,'general');
assert.match(text(eisamGeneral.criteria),/referencia.*incluir/s);

// A return to primary care must remain a return, including on paper.
const breastReturn=get('r01-clinica-de-mamas-antecedente-de-ca-de-mama-p39');
assert(isCatalogCard(breastReturn));assert.equal(breastReturn.direction,'II-I');
assert.match(text(breastReturn.criteria),/10 años.*devueltas a EBAIS/s);
assert(index.byCard.get(breastReturn.id).cards.every(card=>card.direction==='II-I'),'No mezclar ida y retorno en un tema');

// Conditional criteria recovered from other source columns must be operative.
const rh=get('r01-ginecoobstetricia-rh-negativo-p101');
assert.match(text(rh.criteria),/Coombs positivo.*prioridad/);
assert.match(text(rh.prior),/Coombs indirecto por trimestre/);
assert(!text(rh.studies).includes('positivo'),'Resultado positivo no es un estudio para solicitar');
const hematuria=get('n07-hematuria');
assert.match(text(hematuria.criteria),/microscópica:.*anomalía/s);
assert.match(text(hematuria.criteria),/macroscópica:.*emergencia/s);
assert(hematuria.studies.every(study=>study.type==='conditional'&&study.text.startsWith('Hematuria microscópica:')),'No trasladar los estudios de microscópica a la ruta macroscópica');

// Both copies explicitly rule out colonoscopy for these findings.
for(const id of ['r01-gastroenterologia-situaciones-que-no-deben-enviarse-a-colonoscopia-p73','n19-alteraciones-de-colon-por-enema-sin-indicacion-de-colonoscopia','r01-medicina-interna-bocio-difuso-o-bmn-eutiroideo-o-con-hipofuncion-leve'])if(isCatalogCard(get(id)))pendingRegressions.push(`No publicar una no indicación como criterio positivo: ${id}`);

// All catalogue entry points exclude withheld source rows, even with old IDs.
assert.deepEqual(groupResults(withheld,index,sourceMap),[]);
assert.equal(uniqueTopicCount(withheld.map(card=>card.id),index),0);
for(const preferFirst of [true,false]){
 for(const row of groupResults(cards,index,sourceMap,preferFirst)){
  assert(isCatalogCard(row));assert(row.matchingCards.every(isCatalogCard));assert(row.allCards.every(isCatalogCard));
 }
}
for(const topic of index.topics)assert(orderDocuments(topic.cards,sourceMap).every(isCatalogCard),'No ofrecer apartados retirados en selector');
for(const card of withheld){assert.deepEqual(card.criteria,[]);assert.deepEqual(card.checklist,[]);assert(card.catalogNote);assert(card.fullText,'Preservar evidencia documental');}

// Rendering the old deep link produces an explanation, source and alternatives.
const app=await fs.readFile(path.join(root,'app.js'),'utf8');
const renderBody=app.slice(app.indexOf('  function renderDetail('),app.indexOf('  function referenceTemplate('));
const panel={innerHTML:''},documentStub={title:''};
const invokeWithheld=new Function('state','$','detailReading','isCatalogCard','arr','sourceFor','esc','statusBadge','pageLabel','icon','sourcePanel','feedbackPanel','document',`${renderBody};return renderDetail;`)(
 {cards,topicIndex:index,currentId:'',detailTab:'summary'},()=>panel,()=>({detailTab:'full'}),isCatalogCard,value=>Array.isArray(value)?value:value?[value]:[],card=>sourceMap.get(card.sourceId),String,()=>'',()=>'',()=>'',()=>'<section>Fuente original</section>',()=>'',documentStub
);
for(const card of withheld){invokeWithheld(card.id,true);assert.match(panel.innerHTML,/Este apartado no establece criterios de referencia/);assert(!/data-check-id|detail-print|copy-reference|summary-content/.test(panel.innerHTML),'Deep link retirado no ofrece casillas, impresión ni esquema clínico');}

// BFCache and update handlers may run on the explanation instead of a checklist.
for(const [name,next] of [['updateChecklist','sourceStatusNote'],['applyDetailTab','renderDetail']]){
 const body=app.slice(app.indexOf(`  function ${name}(`),app.indexOf(`  function ${next}(`));
 const invoke=new Function('$',`${body};return ${name};`)(()=>null);
 assert.doesNotThrow(()=>invoke(name==='updateChecklist'?get('r01-cirugia-pediatrica-constipacion-p34'):'full'));
}

const script=(await fs.readFile(path.join(root,'print.js'),'utf8')).replace("'./printable-pdf.js'",JSON.stringify(new URL('../printable-pdf.js',import.meta.url).href)).replace("import { APP_RELEASE } from './release.js';",`const APP_RELEASE=${JSON.stringify(release)};`).replace("'./catalog.js'",JSON.stringify(new URL('../catalog.js',import.meta.url).href));
const {buildPrintDocument,checklistEntries}=await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
for(const card of withheld)assert.throws(()=>buildPrintDocument({card,cards,sources,topics}),/no establece criterios/);
assert.match(buildPrintDocument({card:breastReturn,cards,sources,topics}),/Condiciones de retorno al primer nivel/);
const revised=active.filter(card=>card.checklistRevision);
assert(revised.length>0);
for(const card of revised){
 assert(checklistEntries(card,oldIds).every(item=>!item.reviewed),`Las marcas antiguas no validan texto corregido: ${card.id}`);
 assert(card.checklist.every(item=>item.id&&!oldIds.includes(item.id)),'No reutilizar identificadores ordinales tras modificar criterios');
}
const currentTopics=groupResults(active,index,sourceMap).length;
const firstLevelTopics=groupResults(active.filter(card=>card.direction!=='II-I'),index,sourceMap).length;
assert.deepEqual(pendingRegressions,[], 'Regresiones pendientes de corregir');
console.log(JSON.stringify({ok:true,rawCards:cards.length,rawTopics:topics.groups.length,activeCards:active.length,withheld:withheld.length,activeTopics:currentTopics,defaultTopics:firstLevelTopics,revisedChecklists:revised.length}));
