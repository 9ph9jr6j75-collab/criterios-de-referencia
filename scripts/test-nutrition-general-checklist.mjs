import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reviewBuckets,reviewSupplements} from '../review-content.js';
import {generalRequirementsForCard,isCatalogCard,isGeneralCard} from '../catalog.js';

const root=new URL('../',import.meta.url);
const cards=JSON.parse(await readFile(new URL('data/cards.json',root),'utf8'));
const card=cards.find(item=>item.id==='n08-requisitos-generales-y-referencia-a-soporte-nutricional');
const normalize=value=>String(value).normalize('NFC').replace(/\s+/gu,' ').trim();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const sha=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

test('Nutrición conserva todos los campos documentales anteriores y las páginas originales',()=>{
  assert(card);
  const preserved=Object.fromEntries(Object.entries(card).filter(([key])=>!['checklist','reviewNotes'].includes(key)));
  assert.equal(sha(preserved),'5156b2a5b908ca384f79ffbb6b32208be9a53903e0349cf4e89d2d025a997201');
  assert.deepEqual(card.pages,[10,11,12,13]);
  assert.equal(card.sourceId,'N08');
  assert.equal(card.direction,'I-II');
  assert.equal(card.checklist.length,10);
  assert.equal(card.reviewNotes.length,15);
  assert(card.checklist.every(entry=>entry.requirement==='source'),'La recomendación de datos y las instrucciones condicionales conservan su redacción; no se reclasifican como obligaciones universales.');
  const clinical=cards.filter(item=>isCatalogCard(item)&&item.sourceId==='N08'&&!isGeneralCard(item));
  assert.equal(clinical.length,9);
  for(const item of clinical)assert(generalRequirementsForCard(item,cards).some(general=>general.id===card.id),item.id+': requisitos del mismo documento incluidos.');
});

test('las dieciocho disposiciones completas aparecen una sola vez en casilla o nota de lectura',()=>{
  const matches=[...card.fullText.matchAll(/^1\.(\d+)\.\s/gm)];
  assert.deepEqual(matches.map(match=>Number(match[1])),Array.from({length:18},(_,index)=>index+1));
  const displayed=[...card.checklist.map(entry=>entry.text),...card.reviewNotes];
  const numbered=new Map();
  for(const value of displayed){
    const pieces=[...value.matchAll(/(?:^|\n\n)(1\.(\d+)\.\s[\s\S]*?)(?=\n\n1\.\d+\.\s|$)/g)];
    for(const piece of pieces){
      const number=Number(piece[2]);
      assert(!numbered.has(number),'Disposición repetida 1.'+number);
      numbered.set(number,normalize(piece[1]));
    }
  }
  assert.equal(numbered.size,18);
  for(const [index,match] of matches.entries()){
    const end=matches[index+1]?.index??card.fullText.indexOf('En la tabla 1');
    assert.equal(numbered.get(Number(match[1])),normalize(card.fullText.slice(match.index,end)),'Texto completo de disposición 1.'+match[1]);
  }
  assert.match(numbered.get(3),/no requieren.*excepto/);
  assert.match(numbered.get(4),/ausentismo con justificación.*validez de 6 meses/);
  assert.match(numbered.get(11),/disfagia o sialorrea.*Terapia del Lenguaje o de Motora Oral.*En caso de no contar/);
  assert.match(numbered.get(12),/no deben ser contra referidos.*Si se decide contrarreferir/);
  assert.match(numbered.get(17),/menores de 13 años.*apartado 6\.1.*apartado 1\.18/);
  assert.match(numbered.get(18),/inicialmente valorada por el nutricionista.*en caso de no lograr.*comunicación directa/);
});

test('la tabla mantiene cuatro inclusiones y dos exclusiones separadas según la página 13',async()=>{
  // Las dos columnas se cotejaron visualmente con esta página. La extracción
  // histórica de fullText mezcla columnas y no sirve para decidir su pertenencia.
  const image=await readFile(new URL('assets/pages/N08/13.webp',root));
  assert.equal(createHash('sha256').update(image).digest('hex'),'e170be15348dffe4e4434c92f7347da93a8b434a618e3935ef4b0fc67bba7ad3');
  const inclusion=[
    'Pacientes en condición nutricional vulnerable, previamente evaluados por Nutrición, que no mejoran su estado nutricional a pesar de la intervención dietoterapéutica.',
    'Casos nuevos de pacientes con sonda para alimentación, gastrostomía o PEG, cuya dieta basada en licuados artesanales resulta insuficiente para satisfacer sus requerimientos nutricionales.',
    'Pacientes con suplementación con fórmula polimérica estándares referidos del II y III nivel de atención en salud.',
    'Pacientes con ileostomías de alto gasto, fistulas enterocutáneas, síndrome de intestino corto referidos del II y III nivel de atención en salud.'
  ];
  const exclusion=[
    'Pacientes referidos por pérdida de peso, DSN, malnutrición, DLP, DM y/o baja ingesta de alimentos, que no hayan sido valorados o reevaluados por el profesional en nutrición correspondiente.',
    'Paciente con condiciones de riesgo social o vulnerabilidad (la situación social no es indicación para suplementación, excepto casos específicos previo valoración por profesional en Trabajo Social y Nutrición).'
  ];
  assert.deepEqual(card.reviewNotes.filter(text=>text.startsWith('Tabla 1. Criterios de inclusión: ')),inclusion.map(text=>'Tabla 1. Criterios de inclusión: '+text));
  assert.deepEqual(card.reviewNotes.filter(text=>text.startsWith('Tabla 1. Criterios de exclusión: ')),exclusion.map(text=>'Tabla 1. Criterios de exclusión: '+text));
});

test('Nutrición presenta las casillas una vez y conserva las explicaciones sin repetir la prosa anterior',()=>{
  const buckets=reviewBuckets(card);
  assert.equal(buckets.length,1);
  assert.equal(buckets[0].kind,'general');
  assert.deepEqual(buckets.flatMap(bucket=>bucket.entries.map(entry=>entry.text)),card.checklist.map(entry=>entry.text));
  const supplement=reviewSupplements(card).flatMap(section=>section.items);
  assert.deepEqual(supplement,card.reviewNotes);
  for(const entry of card.checklist)assert(!supplement.some(text=>normalize(text)===normalize(entry.text)),entry.id);
  assert(!supplement.includes(card.criteria[0]),'La extracción histórica completa sigue en la transcripción, no como una segunda lista abierta.');
});
