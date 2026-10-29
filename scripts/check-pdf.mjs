import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {File} from 'node:buffer';
import vm from 'node:vm';
import {createTextPdf,normalizePdfText,pdfTextLines} from '../printable-pdf.js';
import {isCatalogCard,generalRequirementsForCard,specificRequirementsForCard} from '../catalog.js';

const root=path.resolve(import.meta.dirname,'..');
const [cards,sources,topics,release]=await Promise.all(['cards','sources','topics','release'].map(async name=>JSON.parse(await fs.readFile(path.join(root,`data/${name}.json`),'utf8'))));
let printScript=await fs.readFile(path.join(root,'print.js'),'utf8');
const catalogModule='data:text/javascript;base64,'+Buffer.from(await fs.readFile(path.join(root,'catalog.js'),'utf8')).toString('base64');
const importless=printScript.replace("import { APP_RELEASE } from './release.js';",`const APP_RELEASE=${JSON.stringify(release)};`).replace("'./catalog.js'",JSON.stringify(catalogModule)).replace("import { createTextPdf } from './printable-pdf.js';",'const createTextPdf=globalThis.createTextPdf;');
const {buildPrintDocument}=await import('data:text/javascript;base64,'+Buffer.from(importless).toString('base64'));
const plain=html=>html.replace(/<(?:\/p|\/h[1-6]|\/li|\/dt|\/dd|\/pre|\/section|br)\b[^>]*>/g,'\n').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const compact=value=>String(value).replace(/\s+/g,' ').trim();
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'criterios-pdf-check-'));
try{
  const fixture='Español: áéíóú ÁÉÍÓÚ ñÑ üÜ ¿Cuándo? ¡Atención! Código · revisión.\nComparaciones: ≥ 10 y ≤ 20; Coombs (+).\n'+Array.from({length:180},(_,i)=>`Línea ${i+1}: criterio completo, revisión y observación documentada.`).join('\n')+'\nÚltima línea íntegra.';
  const selected=cards.find(card=>card.sourceId==='N19'&&/adenoma colorrectal/i.test(card.name));assert(selected,'Ficha de reproducción Gastroenterología');
  const reviewed=selected.checklist?.[0]?.id;
  const full=plain(buildPrintDocument({card:selected,cards,sources,topics,checkedByCard:{[selected.id]:reviewed?[reviewed]:[]},release}));
  for(const [name,text] of [['fixture',fixture],['gastro',full]]){
    const bytes=createTextPdf(text),buffer=Buffer.from(bytes),pdf=buffer.toString('ascii');
    assert.equal(buffer.subarray(0,8).toString(),'%PDF-1.4');
    const start=Number(pdf.match(/startxref\n(\d+)\n%%EOF/)[1]);assert.equal(pdf.slice(start,start+4),'xref','Índice PDF exacto');
    const xref=pdf.slice(start).split('\n'),count=Number(xref[1].split(' ')[1]);
    for(let id=1;id<count;id++){const offset=Number(xref[id+2].slice(0,10));assert.equal(pdf.slice(offset,offset+String(id).length+6),`${id} 0 obj`,'Referencia de objeto válida');}
    for(const match of pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)){const begin=match.index+match[0].length,length=Number(match[1]);assert.equal(pdf.slice(begin+length,begin+length+10),'\nendstream','Longitud del contenido PDF');}
    const filename=path.join(temp,name+'.pdf');await fs.writeFile(filename,bytes);
    const extracted=execFileSync('pdftotext',['-layout',filename,'-'],{encoding:'utf8'});
    const info=execFileSync('pdfinfo',[filename],{encoding:'utf8'});
    assert.match(info,/Page size:\s+595\.28 x 841\.89 pts/);
    const restored=compact(extracted.replace(/Criterios de referencia · DRIPSSHA/g,'').replace(/Página \d+ de \d+/g,''));
    const expected=compact(normalizePdfText(text).replace(/Criterios de referencia · DRIPSSHA/g,''));
    if(restored!==expected){let n=0;while(restored[n]===expected[n])n++;throw new Error(`Texto PDF ${name}, posición ${n}: ${JSON.stringify(restored.slice(n-40,n+150))} / ${JSON.stringify(expected.slice(n-40,n+150))}`);}
    if(name==='fixture'){assert.match(info,/Pages:\s+[4-9]/);assert.match(extracted,/áéíóú ÁÉÍÓÚ ñÑ üÜ/);assert.match(extracted,/>= 10 y <= 20/);}
    else{assert.ok(extracted.includes(selected.sourceId));assert.ok(extracted.includes('Revisado'));assert.ok(extracted.includes('Por revisar'));assert.ok(extracted.includes('Texto documental completo'));assert.ok(extracted.includes('Costa Rica'));}
  }
  for(const line of pdfTextLines('W'.repeat(2000)))assert(line.length<=50,'Una palabra larga no rebasa el ancho de página');
  assert.throws(()=>createTextPdf(''),/vacía/);
  assert.equal(normalizePdfText('a\u0301 n\u0303 ≥ ≤ → ↑ ✓ ☐'),'á ñ >= <=  ->   aumento  [x] [ ]');
  assert.ok(!normalizePdfText(JSON.stringify(cards)).includes('[U+'),'Todos los caracteres documentados tienen representación legible');

  // Ejercitar la página, incluidos ambos toques y la cancelación, sin navegar a un PDF.
  const run=options=>{
    const nodes=new Map(),events={},shares=[];let active=false,prints=0;
    const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,textContent:'',innerHTML:'',innerText:full,addEventListener(name,handler){this[name]=handler;}});return nodes.get(id);};
    const nav={userAgent:options?.apple?'iPhone':'Chrome',standalone:Boolean(options?.apple),canShare:()=>options?.supported!==false,share(data){shares.push({active,data});return options?.share?.()||Promise.resolve();}};
    const context={document:{getElementById:node,title:''},navigator:nav,window:{print(){prints++;}},location:{search:'?id='+encodeURIComponent(selected.id)},sessionStorage:{getItem:()=>JSON.stringify(reviewed?[reviewed]:[])},URLSearchParams,AbortController,File,Promise,createTextPdf,isCatalogCard,generalRequirementsForCard,specificRequirementsForCard,APP_RELEASE:release,setTimeout,clearTimeout,console,
      fetch:async url=>({ok:true,json:async()=>url.includes('cards')?cards:url.includes('sources')?sources:topics})};
    const script=importless.replace(/^import .*;\n/gm,'').replace(/export /g,'').replace('const createTextPdf=globalThis.createTextPdf;','');
    vm.runInNewContext(script,context);
    const click=id=>{active=true;try{return node(id).click?.();}finally{active=false;}};
    return {node,shares,click,prints:()=>prints};
  };
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const page=run();await settle();assert.equal(page.node('return-to-card').href,'./#ficha/'+selected.id);assert.equal(page.node('share-print').disabled,false);
  page.click('share-print');assert.equal(page.shares.length,0,'Preparar no abre el menú');await settle();assert.match(page.node('share-print').textContent,/Compartir ficha PDF/);
  page.click('share-print');assert.equal(page.shares.length,1);assert.equal(page.shares[0].active,true,'Compartir mantiene gesto de usuario');assert.equal(page.shares[0].data.files[0].type,'application/pdf');await settle();
  page.click('print-document');assert.equal(page.prints(),1);assert.match(page.node('print-help').textContent,/Si no aparece/);
  const cancel=run({share:()=>Promise.reject(Object.assign(new Error('cancel'),{name:'AbortError'}))});await settle();cancel.click('share-print');await settle();cancel.click('share-print');await settle();assert.match(cancel.node('pdf-status').textContent,/sigue listo/);assert.equal(cancel.node('share-print').disabled,false);cancel.click('share-print');await settle();assert.equal(cancel.shares.length,2);
  const unsupported=run({supported:false});await settle();assert.equal(unsupported.node('share-print').hidden,true);
  const iphone=run({apple:true});await settle();assert.equal(iphone.node('print-document').hidden,true,'iPhone instalado usa PDF, no un botón nativo que puede no responder');assert.equal(iphone.node('share-print').hidden,false);
  const iphoneUnsupported=run({apple:true,supported:false});await settle();assert.match(iphoneUnsupported.node('print-help').textContent,/Safari/);assert.equal(iphoneUnsupported.node('share-print').hidden,true);
  assert.ok(!/createObjectURL|window\.open|location\.href\s*=/.test(printScript),'La impresión compartida no navega al PDF');
  console.log(JSON.stringify({ok:true,checks:'PDF paginado real, xref, extracción completa, español, ficha Gastro, revisión, fechas, Share en segundo toque, cancelación y regreso'}));
}finally{await fs.rm(temp,{recursive:true,force:true});}
