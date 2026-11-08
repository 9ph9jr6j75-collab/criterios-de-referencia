import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectWebP,auditSourcePages,assertSourcePages} from './check-source-pages.mjs';

// Utilizar un WebP real del documento, no una cabecera fabricada que solo
// satisfaga el validador. Las pruebas corruptas parten de esos mismos bytes.
const valid=await fs.readFile(new URL('../assets/pages/R01/144.webp',import.meta.url));
const source={id:'T01',pageCount:2,pageImageBase:'assets/pages/T01/'};
async function fixture(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reference-pages-'));
  const directory=path.join(root,source.pageImageBase);
  await fs.mkdir(directory,{recursive:true});
  await Promise.all([1,2].map(page=>fs.writeFile(path.join(directory,`${page}.webp`),valid)));
  const audit=options=>auditSourcePages(root,{sources:[source],cards:[{id:'test-card',sourceId:'T01',pages:[1]}],...options});
  try{await run({root,directory,audit});}finally{await fs.rm(root,{recursive:true,force:true});}
}

test('Un WebP real tiene contenedor completo y dimensiones positivas',()=>{
  const result=inspectWebP(valid);
  assert(result.width>0&&result.height>0);assert.equal(result.bytes,valid.length);
  assert.throws(()=>inspectWebP(Buffer.alloc(0)),/vacío/);
  assert.throws(()=>inspectWebP(Buffer.from('<html>página de error<\/html>')),/Firma/);
});

test('Rechazar truncamiento aunque se ajuste el tamaño externo del RIFF',()=>{
  assert.throws(()=>inspectWebP(valid.subarray(0,valid.length-2)),/Tamaño RIFF/);
  const cut=Buffer.from(valid.subarray(0,valid.length-2));cut.writeUInt32LE(cut.length-8,4);
  assert.throws(()=>inspectWebP(cut),/truncado/);
  const dimensions=Buffer.from(valid);dimensions.writeUInt16LE(0,26);
  assert.throws(()=>inspectWebP(dimensions),/Dimensiones VP8 nulas/);
});

test('Comprobar todas las páginas declaradas aunque la ficha solo enlace la primera',async()=>fixture(async({audit})=>{
  const report=await audit();assert.equal(report.pages,2);assert.equal(report.validPages,2);assert.equal(report.cardPageLinks,1);assertSourcePages(report);
}));

test('Una página vacía no enlazada por fichas bloquea la publicación',async()=>fixture(async({directory,audit})=>{
  await fs.writeFile(path.join(directory,'2.webp'),Buffer.alloc(0));
  const report=await audit();assert.equal(report.ok,false);assert.equal(report.failures.length,1);assert.equal(report.failures[0].page,2);assert.match(report.failures[0].message,/vacío/);assert.throws(()=>assertSourcePages(report),/2\.webp/);
}));

test('Una página ausente o truncada no pasa por existir el resto de la fuente',async()=>fixture(async({directory,audit})=>{
  await fs.rm(path.join(directory,'2.webp'));const missing=await audit();assert.equal(missing.failures[0].code,'missing');
  await fs.writeFile(path.join(directory,'2.webp'),valid.subarray(0,24));const truncated=await audit();assert.equal(truncated.failures[0].code,'invalid_webp');
}));

test('Rechazar archivos y enlaces de fichas fuera del rango de la fuente',async()=>fixture(async({directory,audit})=>{
  await fs.writeFile(path.join(directory,'3.webp'),valid);
  const report=await audit({cards:[{id:'outside-card',sourceId:'T01',pages:[3]}]});
  assert(report.failures.some(failure=>failure.code==='unexpected_page'&&failure.path.endsWith('/3.webp')));
  assert(report.failures.some(failure=>failure.code==='invalid_card_page'&&failure.cardId==='outside-card'));
}));

test('Los PDF sin visor no crean páginas ficticias y las rutas no salen del proyecto',async()=>fixture(async({root,audit})=>{
  const pdfOnly={id:'PDF',pageCount:40,localPdf:'assets/documents/PDF.pdf'};
  const report=await audit({sources:[source,pdfOnly]});assert.equal(report.sources,1);assert.equal(report.pages,2);assertSourcePages(report);
  const unsafe=await auditSourcePages(root,{sources:[{...source,pageImageBase:'../outside/'}],cards:[]});
  assert.equal(unsafe.failures[0].code,'invalid_metadata');assert.equal(unsafe.pages,0);
}));
