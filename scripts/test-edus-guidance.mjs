import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {edusGuidanceForCard,EDUS_GUIDANCE} from '../edus-guidance.js';
import {generalRequirementsForCard,isCatalogCard,isGeneralCard} from '../catalog.js';

const cards=JSON.parse(await readFile(new URL('../data/cards.json',import.meta.url),'utf8'));
const active=cards.filter(isCatalogCard);
const byId=new Map(cards.map(card=>[card.id,card]));
const guide=id=>edusGuidanceForCard(byId.get(id),cards);
const bare=overrides=>({id:'synthetic',name:'Ejemplo',sourceId:'TEST',specialty:'Ejemplo',direction:'I-II',criteria:[],studies:[],prior:[],notes:[],checklist:[],fullText:'',...overrides});
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const renderStart=app.indexOf('  function edusGuidanceHTML(');
assert(renderStart>=0,'La app conserva un renderizador común de orientación EDUS.');
const renderEnd=app.indexOf('\n  function ',renderStart+1);
assert(renderEnd>renderStart);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const renderContext={state:{cards},edusGuidanceForCard,esc:escape,icon:()=>''};
vm.createContext(renderContext);vm.runInContext(app.slice(renderStart,renderEnd),renderContext);
const renderedGuidance=card=>renderContext.edusGuidanceHTML(card);
const initiallyVisible=html=>html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');

// Include every rendering field used by the catalogue, without scope/provenance metadata.
const clinicalText=card=>['criteria','studies','studiesNote','prior','notes','checklist','fullText'].flatMap(key=>{
 const values=Array.isArray(card[key])?card[key]:[card[key]];
 return values.map(value=>typeof value==='string'?value:value?.text||'');
}).join('\n');
const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const copyTerm=/(?:fotocop\w*|\bfotograf\w*|\bfotos?\b|\bcopias?\b|\bplacas?\b|\bimpres[oa]\w*)/;
const unrelatedCopyIds=new Set([
 'r01-dermatologia-cancer-no-melanoma-basocelular-epidermoide-p43',
 'r01-dermatologia-lentigos-solares-o-pecas-solares-p47',
 'n02-migrana-referencia-tras-tratamiento-en-primer-nivel',
 'r03-oftalmologia-requisitos-generales-de-oftalmologia-actualizacion-2024',
 'r01-medicina-familiar-y-comunitaria-necesidad-de-cambio-o-continuacion-de-tratamiento-que-se-encuentre-dentro-del-perfil-de-lista-oficial-de-medicamentos-para-medicina-familiar'
]);
const physicalSections=active.filter(card=>copyTerm.test(normalize(clinicalText(card)))&&!unrelatedCopyIds.has(card.id));

test('la orientación es operativa, identifica EDUS y evita duplicar resultados o pedir otros exámenes',()=>{
 assert.match(EDUS_GUIDANCE.title,/Asistente EDUS/);
 assert.match(EDUS_GUIDANCE.body,/Si ya constan en EDUS/);
 assert.match(EDUS_GUIDANCE.body,/servicios privados/);
 assert.match(EDUS_GUIDANCE.body,/Asistente EDUS/);
 assert.match(EDUS_GUIDANCE.body,/Indique expresamente en la referencia/);
 assert.match(EDUS_GUIDANCE.scopeNote,/no agrega exámenes/);
 assert.match(EDUS_GUIDANCE.scopeNote,/ni exige duplicar resultados/);
 assert.equal(EDUS_GUIDANCE.label,'Orientación operativa de la app');
 assert.equal(EDUS_GUIDANCE.sources.length,2);
 for(const source of EDUS_GUIDANCE.sources)assert.ok(source.url.startsWith('https://')&&source.document&&source.pages.length);
});

test('las instrucciones de Asistente EDUS se leen sin desplegar en todas las fichas aplicables',()=>{
 let shown=0;
 for(const card of active){
  const guidance=edusGuidanceForCard(card,cards),html=renderedGuidance(card);
  if(!guidance){assert.equal(html,'',card.id);continue;}
  const visible=initiallyVisible(html);
  for(const text of [guidance.title,guidance.label,guidance.body,guidance.scopeNote,guidance.originalsNote].filter(Boolean))assert(visible.includes(escape(text)),card.id+': orientación íntegra visible antes de abrir otro control.');
  assert.match(visible,/<h3>[^<]*Asistente EDUS<\/h3>/,card.id+': título reconocible.');
  assert.equal((html.match(/<details\b/g)||[]).length,1,card.id+': solo el respaldo institucional es desplegable.');
  assert.match(html,/<details class="edus-guidance-sources">/,card.id);
  for(const source of guidance.sources){assert(html.includes(escape(source.url)),card.id+': respaldo conservado.');assert(!visible.includes(escape(source.url)),card.id+': respaldo secundario plegado.');}
  shown++;
 }
 assert.equal(shown,617);
});

test('EDUS sigue visible cuando procede de generales, en Hidrocele y en el apartado que menciona cistocele',()=>{
 const inherited=byId.get('r01-cirugia-pediatrica-hidrocele-p30');
 assert(inherited);assert.equal(edusGuidanceForCard(inherited,[inherited]),null,'Hidrocele no pide estudios propios.');
 const guidance=guide(inherited.id);assert(guidance);assert.deepEqual(guidance.generalSourceIds,['R01']);
 const cistocele=byId.get('r01-radiologia-e-imagenes-medicas-us-pelvis-y-via-urinaria');
 assert(cistocele&&/cistocele/i.test(cistocele.fullText));
 for(const card of [inherited,cistocele]){
  const visible=initiallyVisible(renderedGuidance(card));
  assert(visible.includes(escape(guide(card.id).body)),card.id);
  assert.match(visible,/Asistente EDUS/);assert.match(visible,/Indique expresamente en la referencia/);
 }
 assert.equal(inherited.studiesNote,'No requiere','Se conserva la excepción clínica de la fuente.');
});

test('un estudio listado activa la orientación sin alterar su requisito',()=>{
 const card=bare({studies:[{text:'Hemograma',type:'conditional'}]});
 const before=JSON.stringify(card);
 assert.ok(edusGuidanceForCard(card,[card]));
 assert.equal(JSON.stringify(card),before);
 assert.equal(card.studies[0].type,'conditional');
});

test('centinelas de ausencia no se convierten en estudios requeridos',()=>{
 for(const text of ['No requiere','No requiere.','Ninguno','Ninguno.','No amerita','No se requieren exámenes','Sin estudios previos','No solicitar hemograma','No se debe solicitar laboratorio','No es necesario aportar radiografías']){
  const card=bare({studies:[{text}],studiesNote:text,fullText:`Requisitos y exámenes previos:\n${text}`});
  assert.equal(edusGuidanceForCard(card,[card]),null,text);
 }
});

test('fotofobia, fotoprotección y examen físico no activan orientación de estudios',()=>{
 for(const text of ['Foto y fonofobia; náuseas y vómitos','Su tratamiento es con foto-protección','Lesiones en áreas foto-expuestas','Examen físico completo','Ficha de identificación y antecedentes quirúrgicos']){
  const card=bare({criteria:[text],fullText:text});
  assert.equal(edusGuidanceForCard(card,[card]),null,text);
 }
});

test('los requisitos administrativos o de tratamiento no se interpretan como estudios',()=>{
 for(const text of ['Boleta VE - 01 registrada en EDUS.','Denuncia enviada al Ministerio Público.','Referencia enviada al PANI.','Historia clínica y justificación del fármaco','Debe recibir tratamiento previo con Terramicina']){
  const card=bare({studies:[{text}],checklist:[{id:'original',kind:'study',text}]});
  assert.equal(edusGuidanceForCard(card,[card]),null,text);
 }
 assert.equal(guide('r01-trabajo-social-contrarreferencia-en-personas-menores-de-edad-abuso-por-negligencia-o-abandono-t740-abuso-fisico-t741-abuso-sexual-t742-'),null);
});

test('Coombs y estudios abreviados se reconocen como resultados diagnósticos',()=>{
 for(const text of ['Coombs indirecto por trimestre','PFR','PFT','EGO','Hb glicosilada','B12','FSH/LH/Estradiol/Progesterona','Ácido úrico']){
  const card=bare({studies:[{text}]});
  assert.ok(edusGuidanceForCard(card,[card]),text);
 }
 assert.ok(guide('r01-ginecoobstetricia-rh-negativo-p101'));
});

test('proveniencia de una copia no se interpreta como estudio clínico',()=>{
 const card=bare({notes:['La copia no identifica oficio de aprobación formal.']});
 assert.equal(edusGuidanceForCard(card,[card]),null);
});

test('las solicitudes fuera de studies también se reconocen',()=>{
 for(const field of ['criteria','prior','notes','checklist','fullText','studiesNote']){
  const text='Adjuntar copia de resultados de laboratorio y gabinete efectuados.';
  const value=field==='fullText'||field==='studiesNote'?text:field==='checklist'?[{id:'original',kind:'general',text}]:[text];
  const card=bare({[field]:value});
  assert.ok(edusGuidanceForCard(card,[card]),field);
 }
});

test('los generales se asocian por fuente, especialidad y ruta',()=>{
 const card=bare({id:'pathology'});
 const general=bare({id:'general',name:'Requisitos generales de Ejemplo',criteria:['Adjuntar resultados de laboratorio.']});
 assert.ok(edusGuidanceForCard(card,[card,general]));
 for(const change of [{sourceId:'OTHER'},{specialty:'Otra'},{direction:'II-I'},{catalogStatus:'withheld'}]){
  assert.equal(edusGuidanceForCard(card,[card,{...general,...change}]),null,JSON.stringify(change));
 }
});

test('No requiere conserva su sentido ante generales condicionales del mismo documento',()=>{
 const card=byId.get('r01-cirugia-pediatrica-hidrocele-p30');
 assert.equal(card.studiesNote,'No requiere');
 const guidance=guide(card.id);
 assert.ok(guidance);
 assert.deepEqual(guidance.generalSourceIds,['R01']);
 assert.match(guidance.scopeNote,/no agrega exámenes/);
 assert.equal(card.studiesNote,'No requiere');
});

test('los resultados propios de Catarata y la excepción renal quedan intactos',()=>{
 assert.ok(guide('n09-catarata'));
 assert.equal(guide('n09-catarata').hasOriginalMaterials,false);
 const renal=byId.get('n12-hipertension-arterial-referencia-a-nefrologia');
 assert.ok(guide(renal.id));
 assert.match(renal.criteria[0],/no requiere estudio complementario aparte/);
 assert.match(renal.notes.join(' '),/no solicitar estudios complementarios adicionales/);
});

test('las placas y los materiales de anatomía patológica conservan su excepción',()=>{
 for(const id of ['r01-oncologia-requisitos-generales-de-oncologia','r01-oncologia-tumor-de-cervix-y-vagina-carcinoma-invasor','r01-clinica-de-mamas-masas-mamarias-p38','r01-fisiatria-requisitos-generales']){
  const guidance=guide(id);
  assert.ok(guidance?.hasOriginalMaterials,id);
  assert.match(guidance.originalsNote,/Digitalizar el informe no sustituye ese material/);
  assert.match(guidance.originalsNote,/fotografía de una placa no equivale/);
 }
});

test('cada uno de los 46 apartados físicos auditados recibe orientación',()=>{
 assert.equal(physicalSections.length,46);
 for(const card of physicalSections)assert.ok(edusGuidanceForCard(card,cards),card.id);
});

test('las 344 agrupaciones afectadas por copias reciben orientación en sus variantes aplicables',async()=>{
 const physicalIds=new Set(physicalSections.map(card=>card.id));
 const affected=active.filter(card=>!isGeneralCard(card)&&(physicalIds.has(card.id)||generalRequirementsForCard(card,cards).some(general=>physicalIds.has(general.id))));
 const groups=JSON.parse(await readFile(new URL('../data/topics.json',import.meta.url),'utf8')).groups;
 const ids=new Set(affected.map(card=>card.id));
 const topics=groups.filter(group=>group.cardIds.some(id=>ids.has(id)));
 assert.equal(affected.length,393);
 assert.equal(topics.length,344);
 for(const card of affected)assert.ok(edusGuidanceForCard(card,cards),card.id);
});

test('las 730 variantes activas se evalúan sin mutar texto clínico ni casillas',()=>{
 const before=JSON.stringify(cards);
 assert.equal(active.length,730);
 for(const card of active){
  const guidance=edusGuidanceForCard(card,cards);
  if(guidance){
   assert.equal(guidance.title,EDUS_GUIDANCE.title);
   assert.equal(guidance.originalsNote!=='' ,guidance.hasOriginalMaterials);
   assert.ok(guidance.generalSourceIds.every(source=>source===card.sourceId));
  }
 }
 assert.equal(JSON.stringify(cards),before);
 for(const card of cards.filter(card=>!isCatalogCard(card)))assert.equal(edusGuidanceForCard(card,cards),null);
});

const included=active.filter(card=>edusGuidanceForCard(card,cards));
console.log(JSON.stringify({active:active.length,withGuidance:included.length,withOriginalMaterials:included.filter(card=>edusGuidanceForCard(card,cards).hasOriginalMaterials).length,physicalSections:physicalSections.length}));
