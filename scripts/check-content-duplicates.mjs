import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isCatalogCard} from '../catalog.js';

const root=new URL('../',import.meta.url);
const [publishedCards,sources,audit,provenanceAudit,cataractAudit,integratedAudit,generalChecklistAudit]=await Promise.all(['data/cards.json','data/sources.json','audits/2026-10-29-repeated-content.json','audits/2026-10-29-r03-provenance.json','audits/2026-10-29-cataract-general-requirements.json','audits/2026-10-29-integrated-general-requirements.json','audits/2026-10-29-general-checklists.json'].map(async path=>JSON.parse(await fs.readFile(new URL(path,root),'utf8'))));
const text=value=>typeof value==='object'&&value!==null?String(value.text??value.label??''):String(value??'');
const normal=value=>text(value).normalize('NFC').replace(/\s+/gu,' ').trim();
const period=value=>normal(value).replace(/\.$/u,'');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const sha=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Esta capa estructura únicamente nueve listas generales que ya estaban
// transcritas. Se valida el cambio exacto y se restaura en memoria el estado
// anterior para someter las 808 fichas a todas las auditorías históricas.
const expectedGeneralChecklists=[
  ['r01-medicina-familiar-y-comunitaria-requisitos-generales-de-medicina-familiar-y-comunitaria','R01',[106,107],7],
  ['r01-medicina-interna-requisitos-generales-de-medicina-interna','R01',[117,118],5],
  ['r01-medicina-paliativa-y-control-del-dolor-requisitos-generales-de-medicina-paliativa-y-control-del-dolor','R01',[130],3],
  ['r01-neurologia-requisitos-generales-de-neurologia','R01',[137],4],
  ['n08-requisitos-generales-y-referencia-a-soporte-nutricional','N08',[10,11,12,13],10],
  ['r01-oftalmologia-requisitos-generales-de-oftalmologia','R01',[162,163],4],
  ['r01-oncologia-requisitos-generales-de-oncologia','R01',[175,176],3],
  ['r01-ortopedia-requisitos-generales-de-ortopedia','R01',[193],2],
  ['r01-otorrinolaringologia-requisitos-generales-de-otorrinolaringologia','R01',[184],3]
];
assert.equal(generalChecklistAudit.schemaVersion,1);
assert.equal(generalChecklistAudit.baselineCommit,'2e9c8b1fd4f2d25b75782194b3c1146dfd07357b');
assert.deepEqual(generalChecklistAudit.changedFields,['checklist','reviewNotes']);
assert.equal(generalChecklistAudit.changes.length,9);
assert.deepEqual(generalChecklistAudit.changes.map(change=>change.cardId),expectedGeneralChecklists.map(([id])=>id));
assert.equal(sha(publishedCards),generalChecklistAudit.after.cardsSha256,'La base completa coincide con el estado exacto auditado, incluidas las 799 fichas sin cambios.');
assert.equal(publishedCards.length,808);
assert.equal(generalChecklistAudit.before.registeredCards,808);assert.equal(generalChecklistAudit.after.registeredCards,808);
assert.equal(generalChecklistAudit.before.activeCards,730);assert.equal(generalChecklistAudit.after.activeCards,publishedCards.filter(isCatalogCard).length);
assert.equal(generalChecklistAudit.before.checklistItems,2202);assert.equal(generalChecklistAudit.after.checklistItems,2243);
assert.equal(publishedCards.reduce((count,card)=>count+(card.checklist?.length||0),0),generalChecklistAudit.after.checklistItems);
assert.equal(generalChecklistAudit.before.cardsSha256,integratedAudit.after.cardsSha256);
assert.equal(generalChecklistAudit.before.sourceRegistrySha256,generalChecklistAudit.after.sourceRegistrySha256);
assert.equal(sha(sources),generalChecklistAudit.after.sourceRegistrySha256);
assert.deepEqual(generalChecklistAudit.invariants,{addedCatalogueCards:0,removedCatalogueCards:0,changedSourceRecords:0,unchangedCardRecords:799,unchangedOriginalClinicalAndDocumentaryFields:true});
assert.equal(generalChecklistAudit.assessment.generalRecordsStructured,9);assert.equal(generalChecklistAudit.assessment.addedChecklistItems,41);
const cards=structuredClone(publishedCards);
const preservedGeneralFields=card=>Object.fromEntries(Object.entries(card).filter(([key])=>!['checklist','reviewNotes'].includes(key)));
for(const [index,[id,sourceId,pages,count]]of expectedGeneralChecklists.entries()){
  const change=generalChecklistAudit.changes[index],card=cards.find(card=>card.id===id);
  assert(card&&isCatalogCard(card));assert(/^Requisitos generales/i.test(card.name));
  assert.equal(change.sourceId,sourceId);assert.equal(card.sourceId,sourceId);
  assert.deepEqual(change.pages,pages);assert.deepEqual(card.pages,pages);
  assert.deepEqual(change.changedFields,['checklist','reviewNotes']);
  assert.deepEqual(Object.keys(change.before),['checklist']);assert.deepEqual(change.before.checklist,[]);
  assert.deepEqual(Object.keys(change.after),['checklist','reviewNotes']);
  assert.equal(change.after.checklist.length,count);assert(change.after.reviewNotes.length>0);
  assert.deepEqual(card.checklist,change.after.checklist);assert.deepEqual(card.reviewNotes,change.after.reviewNotes);
  assert.equal(sha(preservedGeneralFields(card)),change.preservedFieldsSha256,'Conservar criteria/fullText, páginas y todos los campos previos de '+id+'.');
  const ids=new Set();for(const entry of card.checklist){assert(entry.id&&entry.text?.trim());assert(!ids.has(entry.id));ids.add(entry.id);}
  assert(card.reviewNotes.every(note=>typeof note==='string'&&note.trim()));
  card.checklist=structuredClone(change.before.checklist);delete card.reviewNotes;
}
assert.equal(sha(cards),generalChecklistAudit.before.cardsSha256,'Solo checklist y reviewNotes de las nueve fichas autorizadas pueden diferir del estado anterior.');
const expectedGeneralEvidence=[
  ['R01','812d285ee6f512abb4c857671bf7c3a1f4c19bb7cfbdb972fa8d8f9400aba03c',[106,107,117,118,130,137,162,163,175,176,184,193]],
  ['N08','ec60920fd28e5912502fd79b71725f8bfc78397c1e7d173f16489d1d45230d72',[10,11,12,13]]
];
assert.equal(generalChecklistAudit.evidence.length,2);
for(const [index,[sourceId,hash,pages]]of expectedGeneralEvidence.entries()){
  const evidence=generalChecklistAudit.evidence[index];assert.equal(evidence.sourceId,sourceId);
  assert.equal(evidence.document,'assets/documents/'+sourceId+'.pdf');assert.equal(evidence.sha256,hash);assert.deepEqual(evidence.pages,pages);
  assert.equal(createHash('sha256').update(await fs.readFile(new URL(evidence.document,root))).digest('hex'),hash,'El PDF de respaldo sigue intacto.');
}
const sorted=[...cards].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
const byId=new Map(cards.map(card=>[card.id,card]));
const approvedPeriods=new Set(audit.normalization.finalPeriodReviewedCardIds);
const equivalents=(id,a,b)=>normal(a)===normal(b)||(approvedPeriods.has(id)&&period(a)===period(b));

// Las instrucciones integradas de N17/N11/N12 mantienen su fuente y las
// condiciones de cada ruta. Solo se autoriza añadir el bloque general y sus
// casillas, con todos los campos y marcas anteriores intactos. Se revierte esta
// capa exacta antes de comprobar N09 y las auditorías históricas.
assert.equal(integratedAudit.schemaVersion,1);
const expectedIntegrated=[
  ['N17','n17-referencia-de-trabajo-social-del-i-al-ii-nivel',[6,7],13,['required','required','conditional','required','required','required','required','source','source','conditional','conditional','required','conditional']],
  ['N11','n11-referencia-de-psicologia-a-hospitales-perifericos-o-regionales',[69,70],3,['required','required','desirable']],
  ['N12','n12-hipertension-arterial-referencia-a-medicina-familiar-y-comunitaria',[82],3,['source','conditional','desirable']],
  ['N12','n12-hipertension-arterial-referencia-a-medicina-interna',[82],1,['required']]
];
assert.equal(integratedAudit.changes.length,expectedIntegrated.length);
assert.deepEqual(integratedAudit.changes.map(change=>change.cardId),expectedIntegrated.map(([,id])=>id));
const cataractCards=structuredClone(cards);
const coordinationFootnote='La coordinación debe realizarse entre jefaturas de los servicios de Trabajo Social. En caso de no llegar a acuerdos, pueden solicitar asesoría a la supervisora de Trabajo Social de la DRIPSS o a la Coordinación Nacional de Trabajo Social, agotada la capacidad resolutiva.';
for(const [index,[sourceId,id,pages,added,requirements]]of expectedIntegrated.entries()){
  const change=integratedAudit.changes[index],before=change.before,after=change.after;
  assert.equal(change.sourceId,sourceId);assert.equal(change.cardId,id);assert.equal(change.addedChecklistItems,added);
  assert.deepEqual(change.changedFields,['checklist','inlineGeneralRequirements']);assert.deepEqual(change.pages,pages);
  assert.equal(before.id,id);assert.equal(after.id,id);assert.equal(before.sourceId,sourceId);assert.equal(after.sourceId,sourceId);
  assert(!Object.hasOwn(before,'inlineGeneralRequirements'));
  assert.deepEqual(after.inlineGeneralRequirements.pages,pages);
  assert.equal(after.inlineGeneralRequirements.criteria.length,added);
  const entries=after.checklist.slice(0,added);
  assert.deepEqual(entries.map(entry=>entry.id),Array.from({length:added},(_,i)=>sourceId.toLowerCase()+'-general-'+(i+1)));
  assert.deepEqual(entries.map(entry=>entry.kind),Array(added).fill('general'));
  assert.deepEqual(entries.map(entry=>entry.requirement),requirements,'La recomendación o condición original no se convierte en obligación.');
  for(const [i,entry]of entries.entries()){
    const expectedText=after.inlineGeneralRequirements.criteria[i]+(sourceId==='N17'&&i===10?' '+coordinationFootnote:'');
    assert.equal(entry.text,expectedText);
  }
  if(sourceId==='N17'){
    assert.deepEqual(Object.keys(after.inlineGeneralRequirements).sort(),['criteria','notes','pages']);
    assert.deepEqual(after.inlineGeneralRequirements.notes,[coordinationFootnote]);
    assert.match(after.inlineGeneralRequirements.criteria[9],/^En caso de.*cambio de domicilio/u);
    assert.match(after.inlineGeneralRequirements.criteria[10],/según acuerdo entre las partes/u);
    assert.match(after.inlineGeneralRequirements.criteria[12],/no requieren refrendo/u);
  }else assert.deepEqual(Object.keys(after.inlineGeneralRequirements).sort(),['criteria','pages']);
  const restored=structuredClone(after);
  delete restored.inlineGeneralRequirements;restored.checklist=restored.checklist.slice(added);
  assert.deepEqual(restored,before,'Conservar todo el contenido previo y los identificadores de '+id+'.');
  assert.deepEqual(byId.get(id),after,'El cambio integrado coincide exactamente con su auditoría.');
  cataractCards[cataractCards.findIndex(card=>card.id===id)]=structuredClone(before);
}
const expectedEvidence=[
  ['N17','28e22abd558ad86eafdd274f52abf7413de90907e58f2a9e6c00591bb3cb3f30',[6,7]],
  ['N11','14f0b94ab5afd05bedaafb612f3c5f0a5c0876271aaf306026d2c48e2adde61f',[69,70]],
  ['N12','60a9ce61296d96ebc3bfbea39bc9295357fe95c49dea69f91bca91c482751381',[82]]
];
assert.equal(integratedAudit.evidence.length,expectedEvidence.length);
for(const [index,[sourceId,hash,pages]]of expectedEvidence.entries()){
  const evidence=integratedAudit.evidence[index];
  assert.equal(evidence.sourceId,sourceId);assert.equal(evidence.document,'assets/documents/'+sourceId+'.pdf');
  assert.equal(evidence.sha256,hash);assert.deepEqual(evidence.pages,pages);
  assert.equal(createHash('sha256').update(await fs.readFile(new URL(evidence.document,root))).digest('hex'),hash,'La fuente PDF auditada se conserva íntegra.');
}
assert.equal(sha(cards),integratedAudit.after.cardsSha256);
assert.equal(sha(cataractCards),integratedAudit.before.cardsSha256,'No modificar otros registros al integrar instrucciones generales.');
assert.equal(sha(sources),integratedAudit.after.sourceRegistrySha256);
assert.equal(integratedAudit.before.sourceRegistrySha256,integratedAudit.after.sourceRegistrySha256);
assert.equal(integratedAudit.before.cardsSha256,cataractAudit.after.cardsSha256);
assert.equal(integratedAudit.before.checklistItems,2182);assert.equal(integratedAudit.after.checklistItems,2202);
assert.equal(cards.reduce((count,card)=>count+(card.checklist?.length||0),0),integratedAudit.after.checklistItems);
assert.equal(integratedAudit.assessment.activeRecordsReviewed,41);
assert.equal(integratedAudit.invariants.addedCatalogueCards,0);

// N09 ya contenía estos siete requisitos en su transcripción original. La
// actualización solo los estructura y añade casillas antes de las seis existentes.
// Se valida el cambio exacto y se revierte en memoria antes de auditar el estado
// anterior de procedencia R03 y, después, la deduplicación histórica.
const n09GeneralTexts=[
  'Nombre del centro de procedencia, nombre del médico que refiere y fecha.',
  'Ficha de identificación del usuario, edad, estado civil, condición laboral, escolaridad',
  'Antecedentes patológicos, sintomatología tiempo de evolución y tratamiento recibido',
  'Antecedentes personales no patológicos, transfusiones realizadas, uso de drogas ilícitas, alergia a medicamentos.',
  'Antecedentes heredo familiares',
  'Antecedentes quirúrgicos',
  'Examen físico completo con descripción adecuada.'
];
assert.equal(cataractAudit.schemaVersion,1);assert.equal(cataractAudit.sourceId,'N09');assert.equal(cataractAudit.cardId,'n09-catarata');
assert.deepEqual(cataractAudit.card.changedFields,['checklist','inlineGeneralRequirements']);
const cataractBefore=cataractAudit.card.before,cataractAfter=cataractAudit.card.after;
assert.equal(cataractBefore.id,'n09-catarata');assert.equal(cataractBefore.sourceId,'N09');
assert.equal(cataractAfter.id,cataractBefore.id);assert.equal(cataractAfter.sourceId,'N09');
assert(!Object.hasOwn(cataractBefore,'inlineGeneralRequirements'));
assert.deepEqual(cataractAfter.inlineGeneralRequirements,{pages:[7],criteria:n09GeneralTexts});
assert(n09GeneralTexts.every(value=>normal(cataractBefore.fullText).includes(normal(value))),'Cada requisito general está respaldado por la transcripción original de N09.');
assert.equal(cataractBefore.checklist.length,6);
assert.deepEqual(cataractAfter.checklist.slice(0,7),n09GeneralTexts.map((value,index)=>({id:`n09-general-${index+1}`,text:value,kind:'general',requirement:'required'})));
assert.deepEqual(cataractAfter.checklist.slice(7),cataractBefore.checklist,'Conservar íntegros los seis elementos específicos y sus identificadores.');
const cataractProtected=structuredClone(cataractAfter);
delete cataractProtected.inlineGeneralRequirements;cataractProtected.checklist=cataractProtected.checklist.slice(7);
assert.deepEqual(cataractProtected,cataractBefore,'Ningún otro campo de N09 cambia al estructurar sus requisitos generales.');
assert.deepEqual(byId.get('n09-catarata'),cataractAfter,'La ficha N09 coincide exactamente con el cambio auditado.');
assert.equal(sha(cataractCards),cataractAudit.after.cardsSha256);
assert.equal(sha(sources),cataractAudit.after.sourceRegistrySha256);
assert.equal(cataractAudit.before.sourceRegistrySha256,cataractAudit.after.sourceRegistrySha256);
assert.equal(cataractAudit.before.cardsSha256,provenanceAudit.after.cardsSha256,'La nueva auditoría parte del estado R03 ya identificado.');
assert.equal(cataractAudit.before.checklistItems,2175);assert.equal(cataractAudit.after.checklistItems,2182);
assert.equal(cataractCards.reduce((count,card)=>count+(card.checklist?.length||0),0),cataractAudit.after.checklistItems);
const provenanceCards=structuredClone(cataractCards);
provenanceCards[provenanceCards.findIndex(card=>card.id==='n09-catarata')]=structuredClone(cataractBefore);
assert.equal(sha(provenanceCards),cataractAudit.before.cardsSha256,'Los demás registros permanecen idénticos.');

// El registro histórico de deduplicación es inmutable. Solo se revierten en
// memoria los cambios posteriores de procedencia que se validan aquí, campo
// por campo; todos los demás datos siguen sujetos a sus hashes originales.
const r03Scope='Servicio de Oftalmología del Hospital Tony Facio (HTFC)';
const r03GeneralId='r03-oftalmologia-requisitos-generales-de-oftalmologia-actualizacion-2024';
const editorialBefore='El documento identifica autores y año 2024, pero no identifica establecimiento ni oficio de aprobación.';
const editorialAfter='Procedencia identificada: Servicio de Oftalmología del Hospital Tony Facio (HTFC), actualización 2024. La copia no identifica oficio de aprobación formal.';
const protectedCards=value=>value.map(card=>{
  const copy=structuredClone(card);
  if(copy.sourceId==='R03')copy.scope='[audited R03 scope]';
  if(copy.id===r03GeneralId)copy.notes[0]='[audited R03 editorial provenance note]';
  return copy;
});
const changedSourceFields=['alcance','approvalNote','documentStatus','estado','limites','provenance','shortLabel','titulo'];
assert.equal(provenanceAudit.schemaVersion,1);
assert.equal(provenanceAudit.sourceId,'R03');
assert.deepEqual(provenanceAudit.source.changedFields,changedSourceFields);
const sourceBefore=provenanceAudit.source.before,sourceAfter=provenanceAudit.source.after;
assert.equal(sourceBefore.id,'R03');assert.equal(sourceAfter.id,'R03');
assert.equal(sourceBefore.documentStatus,'unverified');assert.equal(sourceAfter.documentStatus,'regional');
assert.equal(sourceBefore.alcance,'No identifica establecimiento o red en el contenido');
assert.equal(sourceAfter.alcance,r03Scope);assert.equal(sourceAfter.shortLabel,'HTFC · Oftalmología');
assert.equal(sourceAfter.titulo,'Guías de referencia del Servicio de Oftalmología del Hospital Tony Facio (HTFC), actualización 2024');
assert.equal(sourceAfter.vigencia,'No consta periodo ni oficio de aprobación');
assert.match(sourceAfter.provenance,/confirmada por el aportante.*29\/10\/2026/u);
assert.match(sourceAfter.approvalNote,/no identifica periodo de vigencia ni oficio de aprobación formal/u);
const actualChangedFields=[...new Set([...Object.keys(sourceBefore),...Object.keys(sourceAfter)])].filter(key=>JSON.stringify(sourceBefore[key])!==JSON.stringify(sourceAfter[key])).sort();
assert.deepEqual(actualChangedFields,changedSourceFields,'La auditoría solo autoriza los campos de procedencia indicados.');
assert.deepEqual(sources.find(source=>source.id==='R03'),sourceAfter,'R03 coincide exactamente con el registro auditado.');
assert.equal(provenanceAudit.cardScopes.length,32);
assert.equal(new Set(provenanceAudit.cardScopes.map(change=>change.cardId)).size,32);
assert.deepEqual(provenanceAudit.cardScopes.map(change=>change.cardId).sort(),cards.filter(card=>card.sourceId==='R03').map(card=>card.id).sort());
const baselineCards=structuredClone(provenanceCards),baselineSources=structuredClone(sources);
for(const change of provenanceAudit.cardScopes){
  assert.equal(change.before,'No identifica establecimiento o red en el contenido');assert.equal(change.after,r03Scope);
  const card=baselineCards.find(item=>item.id===change.cardId);
  assert(card&&card.sourceId==='R03');assert.equal(card.scope,change.after);
  card.scope=change.before;
}
assert.equal(provenanceAudit.editorialNotes.length,1);
const editorial=provenanceAudit.editorialNotes[0];
assert.equal(editorial.cardId,r03GeneralId);assert.equal(editorial.field,'notes');assert.equal(editorial.index,0);
assert.equal(editorial.before,editorialBefore);assert.equal(editorial.after,editorialAfter);
const general=baselineCards.find(card=>card.id===r03GeneralId);
assert.equal(general.sourceId,'R03');assert.deepEqual(general.notes,[editorialAfter]);
general.notes[0]=editorialBefore;
baselineSources[baselineSources.findIndex(source=>source.id==='R03')]=structuredClone(sourceBefore);
assert.equal(sha(sources),provenanceAudit.after.sourceRegistrySha256);
assert.equal(sha(provenanceCards),provenanceAudit.after.cardsSha256,'No cambiar campos clínicos ni otros registros junto con la procedencia.');
assert.equal(sha(baselineSources),provenanceAudit.before.sourceRegistrySha256);
assert.equal(sha(baselineCards),provenanceAudit.before.cardsSha256);
assert.equal(sha(protectedCards(baselineCards)),provenanceAudit.before.protectedCardFieldsSha256);
assert.equal(sha(protectedCards(provenanceCards)),provenanceAudit.after.protectedCardFieldsSha256);
assert.equal(provenanceAudit.before.protectedCardFieldsSha256,provenanceAudit.after.protectedCardFieldsSha256,'Los campos clínicos y todos los demás valores ajenos a los cambios de procedencia permanecen idénticos.');
assert.equal(provenanceAudit.before.sourceRegistrySha256,audit.before.sourceRegistrySha256);

assert.equal(cards.length,audit.before.registeredCards);
assert.equal(cards.filter(isCatalogCard).length,audit.before.activeCards);
assert.equal(new Set(cards.map(card=>card.sourceId)).size,audit.before.sourcesWithCards);
assert.equal(sources.length,audit.before.registrySources);
assert.equal(sha(baselineSources),audit.before.sourceRegistrySha256,'El registro histórico de fuentes solo cambia mediante la actualización de procedencia auditada.');
assert.equal(sha(sorted.map(card=>[card.id,card.fullText||''])),audit.before.fullTextSha256,'Conservar toda la transcripción documental.');
assert.equal(sha(sorted.map(card=>[card.id,card.studies||[]])),audit.before.studiesSha256,'Conservar estudios y tipo de requisito de cada fuente.');
assert.equal(sha(baselineCards.filter(card=>!isCatalogCard(card))),audit.before.withheldCardsSha256,'No modificar el respaldo de los apartados retirados salvo su procedencia auditada.');
assert.equal(sha(baselineCards.map(card=>Object.fromEntries(Object.entries(card).filter(([key])=>!['criteria','notes','checklist'].includes(key))))),audit.before.otherCardFieldsSha256,'No modificar otros campos clínicos o documentales salvo su procedencia auditada.');
for(const key of ['fullTextSha256','studiesSha256','withheldCardsSha256','otherCardFieldsSha256','sourceRegistrySha256'])assert.equal(audit.before[key],audit.after[key],key+' idéntico antes y después.');

for(const card of cards.filter(isCatalogCard)){
  const seen=new Map();
  for(const field of ['criteria','prior','studies','notes','flags'])for(const [index,value]of(card[field]||[]).entries()){
    const key=period(value);if(!key)continue;
    assert(!seen.has(key),`${card.id}: ${field}[${index}] repite ${seen.get(key)}.`);
    seen.set(key,`${field}[${index}]`);
  }
  if(card.applicability)for(const [index,value]of(card.notes||[]).entries())assert.notEqual(normal(value),normal(card.applicability),`${card.id}: notes[${index}] repite el alcance.`);
  const checks=new Set(),ids=new Set();
  for(const item of card.checklist||[]){
    const key=period(item);assert(!checks.has(key),card.id+': casilla repetida.');checks.add(key);
    assert(!ids.has(item.id),card.id+': identificador de casilla repetido.');ids.add(item.id);
  }
  for(const item of card.checklist||[])for(const legacy of item.legacyIds||[])assert(!ids.has(legacy),card.id+': alias histórico aún existe como casilla distinta.');
}

for(const removal of audit.removals){
  const card=byId.get(removal.cardId);assert(card&&isCatalogCard(card));
  const kept=removal.retained;
  const current=kept.field==='applicability'?card.applicability:card[kept.field]?.[kept.index];
  assert.deepEqual(current,kept.value,removal.cardId+': la ubicación retenida sigue íntegra.');
  assert(equivalents(card.id,removal.removedValue,current),card.id+': ninguna frase clínica distinta se elimina.');
}
for(const alias of audit.checklistAliases){
  const items=byId.get(alias.cardId).checklist;
  assert(!items.some(item=>item.id===alias.fromId));
  assert(items.find(item=>item.id===alias.toId)?.legacyIds?.includes(alias.fromId),'Conservar la equivalencia de las marcas guardadas.');
}
const thyroid=byId.get('r01-medicina-familiar-y-comunitaria-nodulos-tiroideos-con-sospecha-de-malignidad');
assert.equal(thyroid.studies[1].type,'conditional','La condición del ultrasonido sigue explícita.');
assert.match(thyroid.studies[1].text,/sin US como requisito.*sin factores de riesgo con US/u);
const n19=byId.get('n19-requisitos-generales-y-aplicacion-del-lineamiento-de-gastroscopias-y-colonoscopias');
assert(n19.applicability,'Conservar el alcance de Gastroenterología para mostrarlo en su aviso.');
assert.equal(n19.checklist.find(item=>item.id==='applicability').requirement,'conditional');
assert.equal(provenanceCards.reduce((count,card)=>count+(card.checklist?.length||0),0),audit.after.checklistItems);
assert.equal(audit.summary.removedOccurrences,audit.removals.length);
assert.equal(audit.summary.affectedCards,new Set(audit.removals.map(item=>item.cardId)).size);
console.log(JSON.stringify({ok:true,activeCards:cards.filter(isCatalogCard).length,...audit.summary,checklistItems:generalChecklistAudit.after.checklistItems,newlyStructuredGeneralRequirements:9,newGeneralChecklistItems:41,documentaryTextUnchanged:true,studiesUnchanged:true}));
