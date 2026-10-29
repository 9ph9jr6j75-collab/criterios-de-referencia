import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isCatalogCard} from '../catalog.js';

const root = path.resolve(import.meta.dirname, '..');
const release = JSON.parse(await fs.readFile(path.join(root, 'data/release.json'), 'utf8'));
const catalogModule = 'data:text/javascript;base64,'+Buffer.from(await fs.readFile(path.join(root,'catalog.js'),'utf8')).toString('base64');
let script = (await fs.readFile(path.join(root, 'print.js'), 'utf8')).replace("import { APP_RELEASE } from './release.js';", `const APP_RELEASE = ${JSON.stringify({ updatedAt: release.updatedAt })};`).replace("'./catalog.js'",JSON.stringify(catalogModule));
const pdfModule = 'data:text/javascript;base64,'+Buffer.from(await fs.readFile(path.join(root,'printable-pdf.js'),'utf8')).toString('base64');
script=script.replace("'./printable-pdf.js'",JSON.stringify(pdfModule));
const { buildPrintDocument, generalRequirements, checklistEntries, updateLabel } = await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
const [cards, sources, topics] = await Promise.all(['cards', 'sources', 'topics'].map(async name => JSON.parse(await fs.readFile(path.join(root, `data/${name}.json`), 'utf8'))));

// Distinct variants and review states must survive printing without bringing in
// clinical criteria from another source or specialty.
const selected = { id: 'selected', name: 'Variante seleccionada', specialty: 'Oftalmología', sourceId: 'one', pages: [7, 8], criteria: [{ text: 'Criterio requerido <valor>', type: 'required' }], prior: ['Tratamiento previo completo'], studies: [{ text: 'Estudio deseable', type: 'desirable' }, { text: 'Estudio condicional', type: 'conditional' }], studiesNote: 'Nota de estudios única', notes: ['Observación única'], flags: ['Precisión única'], fullText: 'Texto original íntegro\nSegunda línea', applicability: 'Aplicación delimitada', requiresReview: true, documentIssues: ['Discrepancia única'], checklist: [{ id: 'a', text: 'Revisión A', requirement: 'required' }, { id: 'b', text: 'Revisión B', requirement: 'conditional' }] };
const general = { id: 'general', name: 'Requisitos generales', specialty: 'Oftalmología', sourceId: 'one', category: 'general', criteria: ['GENERAL CORRECTO'], fullText: 'ORIGINAL GENERAL' };
const fixtureCards = [selected, general, { ...general, id: 'foreign', sourceId: 'two', criteria: ['NO DEBE IMPRIMIRSE OTRA FUENTE'] }, { ...general, id: 'specialty', specialty: 'Urología', criteria: ['NO DEBE IMPRIMIRSE OTRA ESPECIALIDAD'] }];
fixtureCards.push({...general,id:'different-direction',direction:'I-III',criteria:['NO DEBE IMPRIMIRSE OTRA DIRECCIÓN']},{...general,id:'return-general',direction:'II-I',criteria:['NO DEBE IMPRIMIRSE PARA RETORNO']});
const html = buildPrintDocument({ card: selected, cards: fixtureCards, sources: [{ id: 'one', titulo: 'Fuente seleccionada', alcance: 'Regional', codigo: 'ABC', fecha: '2026', vigencia: 'Pendiente', limites: 'Procedencia única', documentStatus: 'unverified' }], topics: { groups: [{ name: 'Tema compartido', cardIds: ['selected'], variantLabels: { selected: 'Ruta y variante exactas' } }] }, checkedByCard: { selected: ['a'] }, release: { updatedAt: '2026-10-28T23:09:47Z' } });
for (const text of ['Tema compartido', 'Ruta y variante exactas', 'Variante seleccionada', 'Obligatorio en la fuente', 'Deseable según la fuente', 'Según el caso o la condición descrita', 'Revisado', 'Por revisar', '1 de 2', 'no certifican pertinencia clínica', 'GENERAL CORRECTO', 'ORIGINAL GENERAL', 'Texto original íntegro', 'Segunda línea', 'Aplicación delimitada', 'Discrepancia única', 'Procedencia única', 'Nota de estudios única', 'Tratamiento previo completo', 'Observación única', 'Precisión única', 'DRIPSSHA', '28/10/2026', '17:09']) assert.ok(html.includes(text), `Falta en impresión: ${text}`);
assert.ok(html.includes('Criterio requerido &lt;valor&gt;'));
assert.ok(!html.includes('NO DEBE IMPRIMIRSE'));
assert.equal(generalRequirements(selected, fixtureCards).length, 1);
assert.equal(generalRequirements(general, fixtureCards).length, 0);
for(const direction of ['II-I','II→I','II a I','2-1']){
  const returning={...selected,id:'returning',direction,criteria:['Condición de retorno propia'],fullText:'TRANSCRIPCIÓN DEL RETORNO'};
  assert.deepEqual(generalRequirements(returning,fixtureCards),[],'No adjuntar requisitos de envío a una contrarreferencia.');
  const printed=buildPrintDocument({card:returning,cards:[returning,...fixtureCards],sources:[{id:'one',titulo:'Fuente de retorno'}],topics:[]});
  assert(printed.includes('Condición de retorno propia')&&printed.includes('TRANSCRIPCIÓN DEL RETORNO'));
  assert(!printed.includes('GENERAL CORRECTO')&&!printed.includes('NO DEBE IMPRIMIRSE'));
}
const tertiary={...selected,id:'tertiary',direction:'I-III'};
assert.deepEqual(generalRequirements(tertiary,fixtureCards).map(item=>item.id),['different-direction'],'Conservar los requisitos del envío I-III sin mezclarlos con I-II.');
assert.deepEqual(checklistEntries(selected, ['a']).map(item => item.reviewed), [true, false]);
const mergedChecklist={...selected,checklist:[{id:'current',text:'Única revisión',legacyIds:['older'],requirement:'conditional'}]};
assert.deepEqual(checklistEntries(mergedChecklist,['older']).map(item=>({id:item.id,reviewed:item.reviewed,requirement:item.requirement})),[{id:'current',reviewed:true,requirement:'conditional'}],'Conservar las revisiones marcadas antes de fusionar una casilla duplicada');
assert.equal(checklistEntries(mergedChecklist,[])[0].reviewed,false);
const noticeDocument=buildPrintDocument({card:selected,cards:[selected,{...general,applicability:selected.applicability}],sources:[{id:'one',titulo:'Fuente única',applicability:selected.applicability}],checkedByCard:{selected:['a']}});
assert.equal(noticeDocument.split('Aplicación delimitada').length-1,1,'El alcance común a la ficha y a los requisitos generales aparece una sola vez en el resumen impreso');
assert.equal(updateLabel({ updatedAt: 'invalid' }), 'Fecha no disponible');
assert.throws(() => buildPrintDocument({ card: selected, cards: fixtureCards, sources: [], topics }), /fuente/);

// Inline requirements belong to N09 itself and retain the six earlier marks.
const cataract=cards.find(card=>card.id==='n09-catarata');assert(cataract);
const cataractGeneral=generalRequirements(cataract,cards);assert.equal(cataractGeneral.length,1);assert.equal(cataractGeneral[0].sourceId,'N09');
const earlierIds=['item-1','item-2','item-3','item-4','item-5','item-6'];
const cataractPrint=buildPrintDocument({card:cataract,cards,sources,topics,checkedByCard:{[cataract.id]:earlierIds}});
assert(cataractPrint.indexOf('id="general-title"')<cataractPrint.indexOf('id="clinical-title"'),'La impresión presenta generales antes de los criterios específicos.');
const cataractReviewLists=[...cataractPrint.matchAll(/<ul class="checklist">([\s\S]*?)<\/ul>/g)].map(match=>match[1]);
assert.equal(cataractReviewLists.length,2);assert.equal((cataractReviewLists[0].match(/<li>/g)||[]).length,7);assert.equal((cataractReviewLists[1].match(/<li>/g)||[]).length,6);
assert.equal((cataractReviewLists.join('').match(/class="review-state reviewed"/g)||[]).length,6,'Las seis revisiones anteriores conservan su estado.');
const escapeCataract=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
for(const item of cataract.checklist)assert.equal(cataractReviewLists.join('').split(escapeCataract(item.text)).length-1,1,'Cada casilla N09 se imprime una sola vez.');
assert(!/Fuente R01|Fuente R03/.test(cataractReviewLists.join('')),'La impresión mantiene separados otros documentos.');

const integratedAudit=JSON.parse(await fs.readFile(path.join(root,'audits/2026-10-29-integrated-general-requirements.json'),'utf8'));
for(const change of integratedAudit.changes){
  const card=cards.find(item=>item.id===change.cardId),oldIds=change.before.checklist.map(item=>item.id);
  const printed=buildPrintDocument({card,cards,sources,topics,checkedByCard:{[card.id]:oldIds}});
  const reviews=[...printed.matchAll(/<ul class="checklist">([\s\S]*?)<\/ul>/g)].map(match=>match[1]);
  assert(printed.indexOf('id="general-title"')<printed.indexOf('id="clinical-title"'),card.id+': primero los requisitos generales.');
  assert.equal(reviews.length,2);assert.equal((reviews[0].match(/<li>/g)||[]).length,change.addedChecklistItems);assert.equal((reviews[1].match(/<li>/g)||[]).length,oldIds.length);
  assert.equal((reviews[0].match(/class="review-state reviewed"/g)||[]).length,0,'Las nuevas casillas no se marcan por revisiones anteriores.');
  assert.equal((reviews[1].match(/class="review-state reviewed"/g)||[]).length,oldIds.length,'Conservar todas las revisiones específicas anteriores.');
  for(const entry of card.checklist)assert.equal(reviews.join('').split(escapeCataract(entry.text)).length-1,1,card.id+': cada casilla se imprime una vez.');
  for(const note of card.inlineGeneralRequirements.notes||[])assert(printed.includes(escapeCataract(note)),card.id+': nota de respaldo general conservada en impresión.');
}

// Every real card must render all source text and the same-source general cards.
for (const card of cards) {
  if(!isCatalogCard(card)){
    assert.throws(()=>buildPrintDocument({card,cards,sources,topics}),/no establece criterios/,'No imprimir orientaciones como criterios clínicos');
    continue;
  }
  const printed = buildPrintDocument({ card, cards, sources, topics });
  const source = sources.find(item => item.id === card.sourceId);
  assert.ok(printed.includes(card.sourceId), `Fuente perdida: ${card.id}`);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  if (card.fullText) assert.ok(printed.includes(escape(card.fullText)), `Texto documental omitido: ${card.id}`);
  for (const key of ['provenance', 'applicability']) if (source[key]) assert.ok(printed.includes(escape(source[key])), `Metadato ${key} omitido: ${card.id}`);
  for (const issue of source.documentIssues || []) assert.ok(printed.includes(escape(issue)), `Precisión documental omitida: ${card.id}`);
  for (const item of generalRequirements(card, cards)) {
    assert.equal(item.sourceId, card.sourceId);
    if (item.fullText) assert.ok(printed.includes(escape(item.fullText)), `Requisitos generales omitidos: ${card.id}`);
  }
  if(card.direction==='II-I'){
    assert.equal(generalRequirements(card,cards).length,0,card.id+': retorno sin requisitos de envío.');
    assert(!printed.includes('id="general-title"'),card.id+': no anexar la sección general de envío.');
  }
}
assert(cards.filter(card=>isCatalogCard(card)&&card.direction==='II-I').length>0,'Ejercitar contrarreferencias reales.');
const htmlShell = await fs.readFile(path.join(root, 'print.html'), 'utf8');
assert.match(htmlShell, /id="print-document"[^>]*disabled/);
assert.ok(!/window\.open|<iframe|<embed|<object|onload\s*=.*print\(/.test(script + htmlShell));
console.log(`Impresión verificada: ${cards.filter(isCatalogCard).length} fichas y bloqueo de ${cards.filter(card=>!isCatalogCard(card)).length} apartados sin criterios.`);
