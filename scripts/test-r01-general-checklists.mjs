import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {edusGuidanceForCard} from '../edus-guidance.js';

const cards = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
const byId = new Map(cards.map(card => [card.id, card]));
const normalize = value => String(value).normalize('NFC').replace(/\s+/gu, ' ').trim();
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expected = [
  ['r01-medicina-familiar-y-comunitaria-requisitos-generales-de-medicina-familiar-y-comunitaria', 2, 8, 'cc0392086deaad24a83e08e8142f8debea0c968af911f9edf5875852c67796f0', ['source', 'conditional', 'source', 'conditional', 'conditional', 'conditional', 'desirable']],
  ['r01-medicina-interna-requisitos-generales-de-medicina-interna', 2, 6, '65985a56c69bbf8fd776e9132fafc2453b428b504b03f784ec13534727a5f8af', ['source', 'conditional', 'source', 'conditional', 'conditional']],
  ['r01-medicina-paliativa-y-control-del-dolor-requisitos-generales-de-medicina-paliativa-y-control-del-dolor', 2, 4, '42c6441d6610114545caac0edfcf67ad8d1edaaca009062f3a53486f566e67a8', ['source', 'conditional', 'source']],
  ['r01-neurologia-requisitos-generales-de-neurologia', 2, 5, '6c1adb942775106c1ce6d0abe68de460599bcd66622738094f10d3515b77c4ac', ['source', 'conditional', 'source', 'conditional']],
  ['r01-oftalmologia-requisitos-generales-de-oftalmologia', 2, 5, 'eee48b1df06b7856409f4a45aa9a5a373ad466ae3b2a117db5684a1501b20504', ['source', 'source', 'conditional', 'conditional']],
  ['r01-oncologia-requisitos-generales-de-oncologia', 2, 4, 'f7f395a321cced466b1ed69fc329917e7dcf0c767d6e4bec3e05876844e94164', ['source', 'source', 'source']],
  ['r01-ortopedia-requisitos-generales-de-ortopedia', 6, 7, 'b892073af8d85fa31a9620685df8173f0f3f366b294475bf32660ce82ef52965', ['source', 'conditional']],
  ['r01-otorrinolaringologia-requisitos-generales-de-otorrinolaringologia', 2, 4, 'a658bd7ecdd5d630505acb5149943febe8ea51cf7b072e259cbc862352dbd033', ['source', 'conditional', 'source']]
];

test('ocho generales R01 conservan íntegros los datos documentales y clínicos anteriores', () => {
  for (const [id, first, last, hash, requirements] of expected) {
    const card = byId.get(id);
    assert(card, id);
    const preserved = Object.fromEntries(Object.entries(card).filter(([key]) => !['checklist', 'reviewNotes'].includes(key)));
    assert.equal(sha(preserved), hash, id + ': no modificar criteria, fullText, páginas ni otros campos existentes');
    assert.equal(card.sourceId, 'R01');
    assert.equal(card.checklist.length, last - first + 1);
    assert.deepEqual(card.checklist.map(entry => Number(/^general-(\d+)-/.exec(entry.id)?.[1])), Array.from({length: last - first + 1}, (_, index) => first + index));
    assert.deepEqual(card.checklist.map(entry => Number(/^(\d+)\./.exec(entry.text)?.[1])), Array.from({length: last - first + 1}, (_, index) => first + index));
    assert(card.checklist.every(entry => entry.kind === (/-studies(?:-|$)|-conditional-studies$/.test(entry.id) ? 'study' : 'general')));
    assert.deepEqual(card.checklist.map(entry => entry.requirement), requirements);
    assert(Array.isArray(card.reviewNotes) && card.reviewNotes.length > 0);
  }
  assert.equal(expected.reduce((sum, [,, last,, requirements]) => sum + requirements.length, 0), 31);
});

test('cada numeral completo aparece una vez en casilla o nota de lectura, sin perder condiciones', () => {
  for (const [id] of expected) {
    const card = byId.get(id);
    const numberedSource = normalize(card.fullText.split('Indicaciones generales\n')[1]);
    const numberedPresentation = normalize([...card.reviewNotes.filter(note => /^\d+\./.test(note)), ...card.checklist.map(entry => entry.text)].join(' '));
    const editorialHeading = id.includes('-oftalmologia-') ? ' Patologías que debe ser Referida al Servicio de Emergencias' : '';
    assert.equal(numberedPresentation + editorialHeading, numberedSource, id + ': conservar toda la secuencia numerada, incluidas cifras, negaciones y materiales originales');
    assert(card.reviewNotes.some(note => /cumplir con los lineamientos/.test(note)), id + ': mantener el contexto normativo sin una casilla de cumplimiento genérico');
  }
  const family = byId.get(expected[0][0]);
  assert(family.reviewNotes.some(note => note.startsWith('La Medicina Familiar y Comunitaria es una especialidad dedicada')));
  assert.equal(family.checklist.at(-1).requirement, 'desirable');
  assert.match(family.checklist.at(-1).text, /es deseable/);
  const orthopedics = byId.get('r01-ortopedia-requisitos-generales-de-ortopedia');
  assert.match(orthopedics.checklist[0].text, /exploración articular con descripción adecuada/);
  assert.match(orthopedics.checklist[1].text, /NO ES NECESARIO EL REPORTE ESCRITO/);
  const orl = byId.get('r01-otorrinolaringologia-requisitos-generales-de-otorrinolaringologia');
  assert.match(orl.checklist[1].text, /Si es posible dependiendo de la patología/);
  assert.equal(orl.checklist[1].requirement, 'conditional');
});

test('la digitalización mediante Asistente EDUS y las salvedades del material original siguen visibles cuando corresponde', () => {
  for (const [id] of expected.filter(([id]) => !id.includes('-oftalmologia-'))) {
    const guidance = edusGuidanceForCard(byId.get(id), cards);
    assert(guidance, id);
    assert.match(guidance.body, /Asistente EDUS/);
  }
  for (const id of ['r01-oncologia-requisitos-generales-de-oncologia']) {
    const guidance = edusGuidanceForCard(byId.get(id), cards);
    assert(guidance.hasOriginalMaterials, id);
    assert.match(guidance.originalsNote, /Digitalizar el informe no sustituye ese material/);
  }
});
