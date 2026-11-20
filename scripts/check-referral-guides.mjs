import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import * as catalog from '../catalog.js';
import {guideReview, guideStorageKey, pdfPageURL} from '../referral-guide.js';
import {compileGuideCatalog} from './guide-catalog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFile(path.join(root, name), 'utf8');
const [{cards, sources, topics, release}, definitions, app, screen] = await Promise.all([
  compileGuideCatalog(root), read('content/referral-guides.json').then(JSON.parse),
  read('app.js'), read('document-screen.js')
]);
const byId = new Map(cards.map(card => [card.id, card]));
const bySource = new Map(sources.map(source => [source.id, source]));
const topicsByCard = catalog.createTopicIndex(cards, topics.groups);
const guides = cards.filter(card => card.referralGuide);
const guideSources = ['N18', ...Array.from({length:16}, (_, i) => 'N' + (i + 20))];
const base = 'https://example.test/criterios-de-referencia/';
assert.equal(cards.length, byId.size, 'Identificadores de ficha únicos');
assert.equal(sources.length, bySource.size, 'Identificadores de fuente únicos');
assert.equal(release.referralGuides, guides.length);
assert.deepEqual(new Set(guides.map(c => c.id)), new Set(definitions.map(d => d.id)));
assert.deepEqual(new Set(guides.map(c => c.sourceId)), new Set(guideSources));
assert.equal(bySource.get('N15').indexingStatus, 'referenceOnly');
assert(!cards.some(c => c.sourceId === 'N15' && catalog.isCatalogCard(c)), 'N15 es documental');

// Comparar los metadatos con el árbol de páginas real del PDF evita aceptar números impresos con otro desfase.
const documents = new Map();
for (const id of new Set([...guideSources,'N15', ...cards.flatMap(c => (c.relatedCards || []).map(link => link.sourceId))])) {
  const source = bySource.get(id);
  assert.equal(source.localPdf, `assets/documents/${id}.pdf`);
  documents.set(id, path.join(root,source.localPdf));
}
const countPDFPages = `import json, sys, pymupdf\ncounts={}\nfor key, filename in json.load(sys.stdin).items():\n    with pymupdf.open(filename) as pdf:\n        counts[key]=len(pdf)\nprint(json.dumps(counts))`;
const pdfCounts = JSON.parse(execFileSync('python3',['-c',countPDFPages], {
  input:JSON.stringify(Object.fromEntries(documents)), encoding:'utf8'
}));
for (const [id, count] of Object.entries(pdfCounts)) assert.equal(bySource.get(id).pageCount,count,id);
function checkPages(id,pages) {
  assert(pages.length > 0 && new Set(pages).size === pages.length, 'Páginas repetidas o ausentes en '+id);
  for (const page of pages) assert(Number.isInteger(page) && page > 0 && page <= pdfCounts[id], `${id}, pág. ${page}`);
}
function sections(card) { return [...card.referralGuide.general,...card.referralGuide.routes.flatMap(r => r.sections)]; }
const seenKeys = new Set();
for (const card of guides) {
  const guide = card.referralGuide;
  assert.match(card.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert(card.id.startsWith(card.sourceId.toLowerCase()+'-'), card.id);
  assert(catalog.isCatalogCard(card));
  assert.equal(bySource.get(card.sourceId).indexingStatus,'indexed');
  assert(!seenKeys.has(guideStorageKey(card.id))); seenKeys.add(guideStorageKey(card.id));
  assert(guide.routes.length > 0 && new Set(guide.routes.map(r => r.name)).size === guide.routes.length,card.id);
  assert.deepEqual(card.pages, [...new Set(sections(card).flatMap(s => s.pages))].sort((a,b) => a-b), card.id);
  for (const s of sections(card)) {
    assert(s.label.trim(),card.id);
    checkPages(card.sourceId,s.pages);
    for (const page of s.pages) {
      const url = new URL(pdfPageURL(bySource.get(card.sourceId),page,base));
      assert.equal(url.href,base + `assets/documents/${card.sourceId}.pdf#page=${page}`);
    }
  }
  const initial = guideReview(card);
  assert.equal(initial.needsChoice,guide.routes.length > 1,card.id);
  assert.equal(initial.routeName,guide.routes.length === 1 ? guide.routes[0].name : '',card.id);
  if (initial.needsChoice) {
    assert.deepEqual(initial.specific,[]);
    assert(guideReview(card,{route:'ruta obsoleta'}).needsChoice);
  }
  for (const route of guide.routes) {
    assert(route.name.trim() && route.sections.length, card.id);
    const review = guideReview(card,{route:route.name});
    assert.equal(review.routeName,route.name);
    assert(!review.needsChoice);
    const selected = [...review.general,...review.specific];
    const expected = [...guide.general,...route.sections];
    assert.equal(selected.length,expected.length,card.id);
    const keys = [];
    for (const [i,s] of selected.entries()) {
      assert.equal(s.label,expected[i].label);
      assert.deepEqual(s.pages,expected[i].pages);
      assert.deepEqual(s.entries.map(e => e.text),expected[i].items);
      assert.deepEqual(s.notes,expected[i].notes || []);
      assert(!s.entries.some(e => e.checked || s.notes.includes(e.text)),`${card.id}, ${s.label}`);
      keys.push(...s.entries.map(e => e.key));
    }
    assert.equal(keys.length,new Set(keys).size,card.id+' '+route.name);
  }
}
for (const card of cards) for (const link of card.relatedCards || []) {
  const target = byId.get(link.id);
  assert(target && catalog.isCatalogCard(target) && target.sourceId === link.sourceId,card.id);
  assert.notEqual(card.sourceId,target.sourceId);
  assert.notEqual(topicsByCard.byCard.get(card.id),topicsByCard.byCard.get(target.id));
  assert(target.relatedCards.some(back => back.id === card.id && back.sourceId === card.sourceId));
  checkPages(target.sourceId,link.pages);
  assert(link.pages.every(p => target.pages.includes(p)),`${card.id} → ${target.id}`);
}

const hip = byId.get('n21-artrosis-de-cadera');
assert.equal(hip.name,'Artrosis de cadera');
assert(hip.aliases.includes('Coxartrosis') && hip.aliases.includes('Osteoartrosis de cadera'));
assert.match(hip.referralGuide.notice,/borrador/i);
const regional = byId.get('r01-ortopedia-coxalgias');
assert.deepEqual(hip.relatedCards.find(link => link.id === regional.id)?.pages,[197]);
const routeNames = hip.referralGuide.routes.map(r => r.name);
assert.deepEqual(routeNames.map(n => n.split(' (')[0]),['Fisiatría','Control del Dolor','Ortopedia','Terapia Física','Trabajo Social']);
const ortho = guideReview(hip,{route:'Ortopedia'});
const orthoText = ortho.specific.flatMap(s => s.entries.map(e => e.text)).join('\n');
assert.match(orthoText,/dolor superior a 5/i);
const priority = ortho.specific.find(s => s.label.includes('tabla 4'));
assert.deepEqual(priority.pages,[11,12]);
assert.equal(priority.entries.length,0);
assert(priority.notes.some(t => t.includes('365 días')));
const generalKey = ortho.general[0].entries[0].key;
const routeKey = ortho.specific.flatMap(s => s.entries)[0].key;
const checked = [generalKey,routeKey];
const other = guideReview(hip,{route:'Fisiatría',checked});
assert(other.general[0].entries[0].checked);
assert(!other.specific.flatMap(s => s.entries).some(e => e.checked));
assert(guideReview(hip,{route:'Ortopedia',checked}).specific.flatMap(s => s.entries).some(e => e.key === routeKey && e.checked));
const renal = byId.get('n24-enfermedad-renal-cronica');
for (const s of guideReview(renal).general.filter(s => /alcance|aclaración/i.test(s.label))) {
  assert(s.notes.length > 0 && !s.entries.length, 'Vigencia y discrepancias visibles fuera de casillas');
}
const renalProtocol = byId.get('n28-enfermedad-renal-cronica-adultos');
assert.deepEqual(renal.relatedCards.find(link => link.id === renalProtocol.id)?.pages, [57,58]);
const conflicts = sections(renal).find(s => s.label.includes('aclaración'));
assert(conflicts.notes.some(t => t.includes('G1A3')));

// Ejecutar las funciones de navegación de la app con el catálogo compilado.
function productionFunction(script,name) {
  const match = script.match(new RegExp(`^([ \\t]*)function ${name}\\([^]*?^\\1\\}`, 'm'));
  assert(match, 'Función de interfaz ausente: '+name);
  return match[0];
}
const state = {cards,topicIndex:topicsByCard,sourceMap:bySource,mode:'all',sort:'relevance',query:'',recent:[],favorites:new Set()};
const location = {hash:'#ficha/'+hip.id};
const arr = value => Array.isArray(value) ? value : value == null ? [] : [value];
const ui = vm.createContext({...catalog,state,location,arr,norm:value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim(),textOf:value=>value?.text||String(value||'')});
for (const fn of ['buildIndex','filterCards','isReturnCard','viewerURL','documentChoiceRequired']) vm.runInContext(productionFunction(app,fn),ui);
vm.runInContext(productionFunction(screen,'returnURL'),ui);
state.index = new Map(cards.map(c => [c.id,ui.buildIndex(c)]));
for (const query of ['artrosis de cadera','coxartrosis','osteoartrosis de cadera']) {
  const found = ui.filterCards({query});
  assert(found.some(hit => hit.matchingCards.some(c => c.id === hip.id)),query);
  if (query === hip.name.toLowerCase()) assert.equal(found[0].id,hip.id,'Coincidencia exacta primero');
  assert.deepEqual([...ui.filterCards({query,source:'N21'})].map(hit => hit.id),[hip.id]);
}
assert.equal(ui.documentChoiceRequired(hip,topicsByCard.byCard.get(hip.id)),false);
const grouped = definitions.filter(g => g.groupWith);
const sharedTopics = [
  ['n22-escoliosis-pediatrica', 'r01-fisiatria-escoliosis-de-0-a-18-anos-p59'],
  ['n23-asma-bronquial-pediatrica', 'n05-asma', 'r01-pediatria-asma-bronquial'],
  ['n29-celiaquia-menores-13', 'n05-enfermedad-celiaca']
];
for (const [guideId, ...previousCards] of sharedTopics) {
  const topic = topicsByCard.byCard.get(guideId);
  assert(topic && previousCards.every(id => topic.cardIds.includes(id)),guideId);
}
for (const def of grouped) {
  const card = byId.get(def.id), topic = topicsByCard.byCard.get(card.id);
  assert.equal(topic.id,def.groupWith);
  assert(topic.cards.some(c => c.sourceId !== card.sourceId));
  assert.equal(ui.documentChoiceRequired(card,topic),true);
  state.pendingDocumentChoice = card.id;
  assert.equal(ui.documentChoiceRequired(card,topic),false);
  assert.equal(ui.documentChoiceRequired(card,topic),true,'La elección se consume');
  assert.equal(ui.documentChoiceRequired(card,topic,true),false,'El regreso desde la fuente conserva la lectura');
}
for (const page of [8,11,13]) {
  const link = new URL(ui.viewerURL(bySource.get('N21'),{pages:[page]}),base);
  assert.equal(link.searchParams.get('source'),'N21');
  assert.equal(link.searchParams.get('page'),String(page));
  assert.equal(link.searchParams.get('screen'),'source');
  assert.equal(new URL(ui.returnURL(link.searchParams),base).hash,'#ficha/'+hip.id);
}
console.log(`✓ Guías de referencia: ${guides.length} fichas de ${guideSources.length} fuentes clínicas, N15 documental, páginas físicas, fuentes agrupadas y regreso a la ruta de artrosis.`);
