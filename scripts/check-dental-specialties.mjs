import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTopicIndex,isCatalogCard,isGeneralCard,generalRequirementsForCard,specialtyGeneralRequirements,generalRequirementsCoverage} from '../catalog.js';

const root=new URL('../',import.meta.url);
const [cards,sources,definitions,audit,priorAudit]=await Promise.all(['data/cards.json','data/sources.json','data/topics.json','audits/2026-11-07-dental-specialties.json','audits/2026-10-29-general-checklists.json'].map(async file=>JSON.parse(await fs.readFile(new URL(file,root),'utf8'))));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const sha=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const metadataKeys=['specialty','aliases','appliesToSpecialties'];
const metadata=card=>Object.fromEntries(metadataKeys.filter(key=>Object.hasOwn(card,key)).map(key=>[key,card[key]]));
const preserved=card=>Object.fromEntries(Object.entries(card).filter(([key])=>!metadataKeys.includes(key)));
const prefix='r01-odontologia-especializada-';
const expectedEndodonticPages=new Map([
  ['pulpitis-sintomatica-k040',[160]],
  ['pulpitis-asintomatica-k040',[160]],
  ['periodontitis-apical-sintomatica-k045',[160]],
  ['periodontitis-apical-asintomatica-k045',[160]],
  ['absceso-apical-agudo-k047',[160]],
  ['absceso-apical-cronico-k046',[161]],
  ['lesiones-de-encia-y-de-la-zona-edentula-asociadas-con-traumatismo-k062',[161]]
].map(([suffix,pages])=>[prefix+suffix,pages]));
const dental=cards.filter(card=>card.id.startsWith(prefix));
const sourceMap=new Map(sources.map(source=>[source.id,source]));
const topicIndex=createTopicIndex(cards,definitions.groups);
const generalId=prefix+'requisitos-generales-de-odontologia-especializada';
const general=cards.find(card=>card.id===generalId);
let checks=0;
function check(name,run){run();checks++;console.log('✓ '+name);}

check('La reclasificación conserva las 808 fichas y los temas existentes',()=>{
  assert.equal(cards.length,808);assert.equal(cards.filter(isCatalogCard).length,730);
  assert.equal(topicIndex.topics.length,639,'Conservar también los temas de apartados retirados.');
  assert.equal(topicIndex.topics.filter(topic=>topic.cards.some(isCatalogCard)).length,574);
  assert.equal(topicIndex.topics.filter(topic=>topic.cards.some(card=>isCatalogCard(card)&&card.direction!=='II-I')).length,567);
  assert.equal(dental.length,28);assert.equal(new Set(cards.map(card=>card.id)).size,808);
  assert.equal(new Set(cards.filter(isCatalogCard).map(card=>card.specialty)).size,30);
  assert(!cards.some(card=>card.specialty==='Odontología especializada'),'El nombre general deja de ocultar el apartado Endodoncia.');
});

check('Endodoncia reúne exactamente las siete fichas de sus páginas originales',()=>{
  const endodontics=cards.filter(card=>card.specialty==='Endodoncia');
  assert.deepEqual(endodontics.map(card=>card.id).sort(),[...expectedEndodonticPages.keys()].sort());
  for(const card of endodontics){
    assert.equal(card.sourceId,'R01');assert.equal(card.direction,'I-II');assert(isCatalogCard(card));
    assert.deepEqual(card.pages,expectedEndodonticPages.get(card.id));
    assert(card.aliases.includes('Endodoncia')&&card.aliases.includes('Odontología especializada'));
    assert(card.notes.some(note=>/No Validado por Nivel Central/i.test(note)),'Conservar el estado documental de Endodoncia.');
    const topic=topicIndex.byCard.get(card.id);assert(topic);assert.equal(topic.specialty,'Endodoncia');
    assert.equal(topic.id,'topic-'+card.id);assert.deepEqual(topic.cardIds,[card.id]);
  }
});

check('Odontología general avanzada conserva sus 21 fichas y sus alias',()=>{
  const oga=cards.filter(card=>card.specialty==='Odontología general avanzada');assert.equal(oga.length,21);
  assert(oga.includes(general));assert.equal(oga.filter(isGeneralCard).length,1);
  for(const card of oga){
    assert.equal(card.sourceId,'R01');assert(!expectedEndodonticPages.has(card.id));
    assert(card.aliases.includes('OGA')&&card.aliases.includes('Odontología general avanzada')&&card.aliases.includes('Odontología especializada'));
    assert.equal(topicIndex.byCard.get(card.id).specialty,card.specialty);
  }
});

check('La lista general compartida mantiene fuente, dirección y páginas',()=>{
  assert(general&&isGeneralCard(general));assert.equal(audit.generalCardId,generalId);
  assert.deepEqual(general.pages,[142,143]);
  assert.deepEqual(general.appliesToSpecialties,['Odontología general avanzada','Endodoncia']);
  const before=JSON.stringify(cards);
  for(const specialty of general.appliesToSpecialties){
    for(const options of [{},{source:'R01'},{scope:'regional'},{source:'R01',scope:'regional'}]){
      assert.deepEqual(specialtyGeneralRequirements(cards,{specialty,...options},sourceMap).map(card=>card.id),[generalId]);
    }
    assert.deepEqual(specialtyGeneralRequirements(cards,{specialty,source:'N09'},sourceMap),[]);
    assert.deepEqual(specialtyGeneralRequirements(cards,{specialty,scope:'national'},sourceMap),[]);
    for(const card of dental.filter(card=>card.specialty===specialty&&!isGeneralCard(card))){
      assert.deepEqual(generalRequirementsForCard(card,cards).map(card=>card.id),[generalId],card.id);
      assert.equal(generalRequirementsCoverage([card],cards).included,1);
      assert.deepEqual(generalRequirementsForCard({...card,sourceId:'N09'},cards),[]);
      assert.deepEqual(generalRequirementsForCard({...card,direction:'II-I'},cards),[]);
    }
  }
  const other=cards.find(card=>card.specialty==='Dermatología'&&card.sourceId==='R01'&&!isGeneralCard(card));assert(other);
  assert(!generalRequirementsForCard(other,cards).some(card=>card.id===generalId),'No extender requisitos odontológicos a otras especialidades.');
  assert.equal(JSON.stringify(cards),before,'Consultar generales no muta el contenido.');
});

check('La auditoría limita todos los cambios a metadatos de las 28 fichas dentales',()=>{
  assert.equal(audit.schemaVersion,1);assert.equal(audit.changes.length,28);
  assert.deepEqual(audit.changes.map(change=>change.cardId).sort(),dental.map(card=>card.id).sort());
  assert.equal(sha(cards),audit.after.cardsSha256);assert.equal(audit.before.cardsSha256,priorAudit.after.cardsSha256);
  const restored=structuredClone(cards);
  for(const change of audit.changes){
    const card=restored.find(card=>card.id===change.cardId);assert(card);
    assert.deepEqual(metadata(card),change.after);assert.equal(change.before.specialty,'Odontología especializada');
    assert.equal(sha(preserved(card)),change.preservedFieldsSha256,'Los criterios, casillas, páginas y transcripción conservan el contenido auditado.');
    assert.deepEqual(Object.keys(change.before).sort(),['aliases','specialty']);
    assert.deepEqual(Object.keys(change.after).sort(),card.id===generalId?['aliases','appliesToSpecialties','specialty']:['aliases','specialty']);
    assert(change.before.aliases.every(alias=>card.aliases.includes(alias)),'Conservar alias previos.');
    for(const key of metadataKeys)delete card[key];Object.assign(card,structuredClone(change.before));
  }
  assert.equal(sha(restored),audit.before.cardsSha256,'Los otros 780 registros y todos los campos clínicos permanecen idénticos.');
});

const evidence=Array.isArray(audit.evidence)?audit.evidence:[audit.evidence];
assert.equal(evidence.length,1);assert(evidence[0]);
assert.equal(evidence[0].sourceId,'R01');assert.equal(evidence[0].document,'assets/documents/R01.pdf');
assert.equal(evidence[0].sha256,'812d285ee6f512abb4c857671bf7c3a1f4c19bb7cfbdb972fa8d8f9400aba03c');
for(const page of [142,143,159,160,161])assert(evidence[0].pages.includes(page));
assert.equal(createHash('sha256').update(await fs.readFile(new URL(evidence[0].document,root))).digest('hex'),evidence[0].sha256,'El documento fuente permanece intacto.');
for(const page of [142,143,159,160,161])await fs.access(new URL(sourceMap.get('R01').pageImageBase+page+'.webp',root));
console.log(JSON.stringify({ok:true,checks,dentalCards:28,ogaCards:21,endodonticCards:7,clinicalContentUnchanged:true,sourcePdfUnchanged:true}));
