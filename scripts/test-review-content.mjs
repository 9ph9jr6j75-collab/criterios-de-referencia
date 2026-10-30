import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewBuckets, reviewSupplements} from '../review-content.js';
import {generalRequirementsForCard, specificRequirementsForCard, isCatalogCard} from '../catalog.js';

const cards = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
const active = cards.filter(isCatalogCard);
const byId = new Map(cards.map(card => [card.id, card]));
const bare = changes => ({id:'test', name:'Ejemplo', sourceId:'TEST', specialty:'Ejemplo', direction:'I-II', criteria:[], prior:[], studies:[], notes:[], checklist:[], ...changes});
const textOf = value => value && typeof value === 'object' ? String(value.text ?? value.label ?? '') : String(value ?? '');
const key = value => textOf(value).normalize('NFC').replace(/\s+/g,' ').trim().replace(/^Documentar el criterio de referencia aplicable:\s*/i,'');
const fields = ['context','route','criteria','prior','studies','studiesNote','notes','flags'];
const values = (card, field) => (Array.isArray(card[field]) ? card[field] : [card[field]]).filter(value => value !== null && value !== undefined).map(textOf).filter(value => key(value));
const rows = card => reviewBuckets(card).flatMap(bucket => bucket.entries);
const output = (card, options) => reviewSupplements(card, options).flatMap(group => group.items);

test('los segmentos mantienen el orden, los identificadores y el texto íntegro de cada casilla', () => {
  const card = bare({checklist:[
    {id:'first', text:'Condición con umbral 20/200.', kind:'criterion', requirement:'conditional', legacyIds:['old-first']},
    {id:'second', text:'Radiografía original.', kind:'study', requirement:'source'},
    {id:'third', text:'Otra condición.', kind:'criterion', requirement:'source'}
  ]});
  assert.deepEqual(reviewBuckets(card).map(bucket => bucket.kind), ['criterion','study','criterion']);
  assert.deepEqual(rows(card).map(entry => [entry.id,entry.text,entry.requirement]), card.checklist.map(entry => [entry.id,entry.text,entry.requirement]));
  assert.deepEqual(rows(card)[0].legacyIds, ['old-first']);
  assert.notEqual(rows(card)[0], card.checklist[0]);
  assert.deepEqual(rows(bare({checklist:['Texto literal']})), [{id:'c1',text:'Texto literal',requirement:'source'}]);
  assert.equal(reviewBuckets({...card,category:'general'})[0].title,'Requisitos generales');
  assert.equal(reviewBuckets({...card,direction:'III-I'})[0].title,'Condiciones de retorno al primer nivel');
});

test('se retira solo la repetición completa, incluido el prefijo de la herramienta', () => {
  const card = bare({
    criteria:['Visión peor de 20/200 en el mejor ojo.'],
    checklist:[{id:'original',text:'Documentar el criterio de referencia aplicable: Visión peor de 20/200 en el mejor ojo.',kind:'criterion'}],
    notes:['Visión peor de 20/200 en el mejor ojo. Referir a consulta externa, no a Emergencias.']
  });
  assert.deepEqual(output(card), card.notes);
});

test('las diferencias de cifra, negación, unidad, destino y condición nunca se borran', () => {
  const originals = ['Hemoglobina menor de 11 g/dL.','No solicitar otros exámenes.','Visión peor de 20/200.','Referir a consulta externa.','Requiere radiografía si presenta dolor.'];
  for (const [index, text] of originals.entries()) {
    const changes = ['Hemoglobina menor de 10 g/dL.','Solicitar otros exámenes.','Visión peor de 20/60.','Referir a Emergencias.','Requiere radiografía.'];
    const card = bare({notes:[text],checklist:[{id:'c',text:changes[index],kind:'criterion'}]});
    assert.deepEqual(output(card),[text]);
  }
});

test('las listas de estudios concatenadas no generan una segunda lista completa', () => {
  const card = bare({studies:[{text:'Hemograma',type:'source'},{text:'EKG original (no el reporte)',type:'source'}],studiesNote:'Hemograma EKG original (no el reporte)',checklist:[{id:'h',text:'Hemograma',kind:'study'}]});
  assert.deepEqual(output(card),['EKG original (no el reporte)']);
  assert.deepEqual(output({...card,studiesNote:card.studiesNote+' y radiografía de tórax.'}), ['EKG original (no el reporte)',card.studiesNote+' y radiografía de tórax.']);
});

test('una lista completa ya representada por una sola casilla no se repite', () => {
  const card = bare({criteria:['Primera condición.','Segunda condición.'],checklist:[{id:'combined',kind:'criterion',text:'Primera condición.\nSegunda condición.'}]});
  assert.deepEqual(output(card),[]);
  assert.deepEqual(output({...card,criteria:[...card.criteria,'Excepción que corresponde al caso.']}), [...card.criteria,'Excepción que corresponde al caso.']);
});

test('Catarata conserva sus 13 casillas y la precisión sobre otros exámenes', () => {
  const card = byId.get('n09-catarata');
  const generals = generalRequirementsForCard(card,cards);
  const specific = specificRequirementsForCard(card);
  const visible = [...generals,specific].flatMap(rows);
  assert.equal(visible.length,13);
  assert.deepEqual(visible.map(entry=>entry.id),card.checklist.map(entry=>entry.id));
  assert.deepEqual(reviewBuckets(specific).map(bucket=>bucket.title),['Criterios para referir','Estudios y valoraciones previas']);
  const supplement = output(specific,{representedTexts:visible.map(entry=>entry.text),hasGeneral:true});
  assert(supplement.includes('No se requiere de otros exámenes.'));
  assert(!supplement.includes('Incluir los datos generales, antecedentes y examen físico que establece la fuente.'));
  assert(output(specific).includes('Incluir los datos generales, antecedentes y examen físico que establece la fuente.'));
});

test('los requisitos generales sin casillas mantienen íntegro su contenido', () => {
  const generals = active.filter(card=>/^requisitos generales/i.test(card.name)&&!(card.checklist||[]).length);
  assert.equal(generals.length,9);
  for (const card of generals) {
    const visible = output(card).map(key);
    for (const field of fields) for (const text of values(card,field)) assert(visible.includes(key(text)),card.id+' '+field);
  }
  const fallback = bare({fullText:'Criterio solo transcrito: con todas sus condiciones.'});
  assert.deepEqual(output(fallback),[fallback.fullText]);
});

test('las 69 diferencias de etiqueta conservan 68 tipos de estudio y la condición propia de Hepatitis', () => {
  let recovered = 0;
  for (const card of active) for (const entry of rows(card)) {
    const source = (card.studies||[]).find(study=>key(study)===key(entry.text));
    if (entry.requirement==='source'&&['required','conditional','desirable'].includes(source?.type)) {
      recovered++;
      assert.equal(entry.sourceRequirement,source.type,card.id+' '+entry.id);
    }
  }
  assert.equal(recovered,68);
  const hepatitis=rows(byId.get('n19-hepatitis-aguda-consulta-de-gastroenterologia-o-emergencias')).find(entry=>entry.id==='item-3');
  assert.equal(hepatitis.requirement,'conditional');
  assert.equal(hepatitis.sourceRequirement,undefined);
  const conditional = bare({studies:[{text:'Hemograma',type:'source'}],checklist:[{id:'original',text:'Hemograma',kind:'study',requirement:'conditional'}]});
  assert.equal(rows(conditional)[0].requirement,'conditional');
  assert.equal(rows(conditional)[0].sourceRequirement,undefined);
});

test('los detalles de Hidrocele y lipomas permanecen aunque una parte coincida', () => {
  for (const id of ['r01-cirugia-pediatrica-hidrocele-p30','r01-cirugia-general-tumoraciones-de-tejidos-blandos-p26']) {
    const card=byId.get(id);
    assert(card,id);
    const visible=[...rows(card).map(entry=>entry.text),...output(card)];
    for (const note of card.notes||[]) assert(visible.some(text=>key(text)===key(note)),id+' '+note);
  }
});


test('Hidrocele no repite los requisitos generales en un recuadro de precisiones', () => {
  const hidrocele=byId.get('r01-cirugia-pediatrica-hidrocele-p30');
  const [general]=generalRequirementsForCard(hidrocele,cards);
  assert.equal(general.id,'r01-cirugia-pediatrica-requisitos-generales');
  assert.equal(rows(general).length,3);
  assert.deepEqual(output(general),[]);
  assert.match(general.fullText,/Indicaciones generales/);
  assert.match(general.fullText,/fotocopia/);
});

test('solo un encabezado editorial puede diferir de una secuencia clínica completa', () => {
  const entries=[
    {id:'one',text:'1. Hemoglobina menor de 11 g/dL.',kind:'general'},
    {id:'two',text:'2. No solicitar otros exámenes. Referir a consulta externa.',kind:'general'}
  ];
  const repeated='Indicaciones generales '+entries.map(entry=>entry.text).join(' ');
  const card=bare({category:'general',checklist:entries,criteria:[repeated]});
  assert.deepEqual(output(card),[]);
  assert.deepEqual(output({...card,criteria:[repeated.replace('Indicaciones generales ','Indicaciones generales: ')]}),[]);
  for(const changed of [
    repeated.replace('11 g/dL','10 g/dL'),
    repeated.replace('11 g/dL','11 mg/dL'),
    repeated.replace('No solicitar','Solicitar'),
    repeated.replace('consulta externa','Emergencias'),
    repeated+' Excepto si presenta dolor.',
    repeated.replace('2. No solicitar','3. No solicitar'),
    repeated.replace('2. No solicitar','2. no solicitar'),
    repeated.replace('Indicaciones generales','Indicaciones generales para menores de cinco años')
  ]) assert.deepEqual(output({...card,criteria:[changed]}),[changed],changed);
  assert.deepEqual(output({...card,category:undefined,name:'Patología específica'}),[repeated]);
  assert.deepEqual(output({...card,criteria:[repeated.replace('2. No solicitar otros exámenes. Referir a consulta externa.','')]}),[repeated.replace('2. No solicitar otros exámenes. Referir a consulta externa.','')]);
});

test('los diez generales con encabezado repetido muestran sus casillas una sola vez', () => {
  const repeated=active.filter(card => (card.category==='general'||/^requisitos generales/i.test(card.name)) && rows(card).length &&
    values(card,'criteria').some(text=>/^Indicaciones generales(?:\s*:\s*|\s+)/i.test(key(text))&&key(text).replace(/^Indicaciones generales(?:\s*:\s*|\s+)/i,'')===rows(card).map(entry=>key(entry.text)).join(' ')));
  assert.equal(repeated.length,10);
  for(const card of repeated){
    assert(!reviewSupplements(card).some(group=>group.title==='Precisiones de requisitos generales'),card.id);
    assert(rows(card).length>0,card.id);
    assert(card.fullText,card.id);
  }
});

test('auditoría de las 730 fichas: todo texto clínico está en casilla o suplemento sin mutar los datos', () => {
  const before=JSON.stringify(cards);
  let supplementCount=0,fieldCount=0;
  for (const card of active) {
    const generals=generalRequirementsForCard(card,cards),groupCards=[...generals,specificRequirementsForCard(card)];
    const representedTexts=groupCards.flatMap(item=>rows(item).map(entry=>entry.text));
    for (const groupCard of groupCards) {
      const rendered=output(groupCard,{representedTexts,hasGeneral:generals.length>0});
      const visibleKeys=new Set([...representedTexts,...rendered].map(key));
      const ownRows=rows(groupCard);
      const sourceRows=(groupCard.checklist||[]).filter(entry=>textOf(entry));
      assert.equal(ownRows.length,sourceRows.length,groupCard.id);
      assert.deepEqual(ownRows.map(entry=>entry.id),sourceRows.map((entry,index)=>typeof entry==='string'?`c${index+1}`:entry.id||`c${index+1}`),groupCard.id);
      supplementCount+=rendered.length;
      for (const field of fields) {
        const list=values(groupCard,field),wholeList=key(list.join('\n'));
        for (const text of list) {
          fieldCount++;
          const studiesCombined=field==='studiesNote'&&key(text)===key(values(groupCard,'studies').join('\n'));
          const generic=generals.length>0&&text==='Incluir los datos generales, antecedentes y examen físico que establece la fuente.';
          const sameGeneralSequence=(groupCard.category==='general'||groupCard.inlineGeneral||/^requisitos generales/i.test(groupCard.name))&&ownRows.length>0&&key(text).replace(/^Indicaciones generales(?:\s*:\s*|\s+)/i,'')===ownRows.map(entry=>key(entry.text)).join(' ');
          assert(visibleKeys.has(key(text))||visibleKeys.has(wholeList)||studiesCombined||generic||sameGeneralSequence,groupCard.id+' '+field+': '+text);
        }
      }
    }
  }
  assert.equal(active.length,730);
  // Inline general rows are counted with their own real card below.
  assert.equal(active.flatMap(rows).length,2202);
  assert.equal(JSON.stringify(cards),before);
  console.log(JSON.stringify({active:active.length,checklistRows:active.flatMap(rows).length,auditedClinicalValues:fieldCount,preservedSupplementItems:supplementCount}));
});
