import assert from 'node:assert/strict';
import {test} from 'node:test';
import {guideReview, guideClinicalCard, pdfPageURL} from '../referral-guide.js';

const item = 'Elemento para revisar';
const example = {
  id:'ejemplo', sourceId:'N00',
  referralGuide:{
    notice:'Nota de la edición',
    general:[{label:'Apartado general', pages:[3], items:[item]}],
    routes:[
      {name:'Ruta A', sections:[{label:'Apartado', pages:[4], items:[item], notes:['Nota A']}]},
      {name:'Ruta B', sections:[{label:'Apartado', pages:[4], items:[item], notes:['Nota B']}]},
      {name:'Tabla', sections:[{label:'Tabla original', pages:[5, 6], items:[]}]}
    ]
  }
};

test('entrada directa y ruta desconocida conservan solo los apartados generales', () => {
  for (const state of [{}, {route:'Ruta retirada'}]) {
    const review = guideReview(example, state);
    assert.equal(review.needsChoice, true);
    assert.equal(review.notice, example.referralGuide.notice);
    assert.equal(review.general.length, 1);
    assert.deepEqual(review.specific, []);
  }
});

test('los nombres idénticos de apartados y casillas conservan marcas independientes por ruta', () => {
  const a = guideReview(example, {route:'Ruta A'});
  const checked = [a.general[0].entries[0].key, a.specific[0].entries[0].key];
  const b = guideReview(example, {route:'Ruta B', checked});
  assert(b.general[0].entries[0].checked);
  assert.equal(b.specific[0].entries[0].checked, false);
  assert(guideReview(example, {route:'Ruta A', checked}).specific[0].entries[0].checked);
  assert.deepEqual(b.specific[0].notes, ['Nota B']);
  assert.deepEqual(guideClinicalCard(example, b).criteria, [item, 'Nota B', item]);
});

test('una tabla documental sin casillas mantiene las páginas de su fuente', () => {
  const table = guideReview(example, {route:'Tabla'}).specific[0];
  assert.deepEqual(table.entries, []);
  assert.deepEqual(table.pages, [5, 6]);
  assert.deepEqual(table.notes, []);
});

test('un apartado único está disponible al abrir y el PDF de respaldo conserva su página', () => {
  const only = {...example, referralGuide:{routes:example.referralGuide.routes.slice(0,1)}};
  const review = guideReview(only, {});
  assert.equal(review.routeName, 'Ruta A');
  assert.equal(review.needsChoice, false);
  const base = 'https://ejemplo.test/app/';
  assert.equal(pdfPageURL({localPdf:'assets/documents/N00.pdf'}, 4, base), base + 'assets/documents/N00.pdf#page=4');
  assert.equal(pdfPageURL({localPdf:'javascript:alert(1)'}, 4, base), '');
  assert.equal(pdfPageURL({localPdf:'documento.pdf'}, -1, base), '');
});
