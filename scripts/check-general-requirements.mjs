import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {isCatalogCard,isGeneralCard,isReferralCard,generalRequirementsForCard,specificRequirementsForCard,specialtyGeneralRequirements} from '../catalog.js';

const root=new URL('../',import.meta.url);
const [cards,sources]=await Promise.all(['cards','sources'].map(async name=>JSON.parse(await fs.readFile(new URL(`data/${name}.json`,root),'utf8'))));
const sourceMap=new Map(sources.map(source=>[source.id,source]));
const active=cards.filter(isCatalogCard),generals=active.filter(isGeneralCard);
const pick=(specialty,options={})=>specialtyGeneralRequirements(cards,{specialty,...options},sourceMap);
let checks=0;
function check(name,run){run();checks++;console.log('✓ '+name);}

check('Las 34 fichas generales de 26 especialidades conservan su documento y dirección de envío',()=>{
  assert.equal(generals.length,34);assert.equal(new Set(generals.map(card=>card.specialty)).size,26);
  for(const specialty of new Set(generals.map(card=>card.specialty))){
    const result=pick(specialty);assert.equal(result.length,generals.filter(card=>card.specialty===specialty).length,specialty);
    assert(result.every(card=>card.specialty===specialty&&isReferralCard(card)&&sourceMap.has(card.sourceId)));
  }
});
check('Fisiatría muestra su único requisito general de R01 y no altera la lista recibida',()=>{
  const before=cards.map(card=>card.id),result=pick('Fisiatría');
  assert.deepEqual(result.map(card=>card.id),['r01-fisiatria-requisitos-generales']);
  assert.deepEqual(cards.map(card=>card.id),before);assert.equal(result[0],cards.find(card=>card.id===result[0].id));
  assert.equal(pick('Fisiatria').length,1,'El nombre acepta tildes sin mezclar especialidades.');
});
check('Gastroenterología mantiene R01 y N19 separados y respeta filtros de fuente y alcance',()=>{
  assert.deepEqual(pick('Gastroenterología').map(card=>card.sourceId),['N19','R01']);
  assert.deepEqual(pick('Gastroenterología',{source:'R01'}).map(card=>card.sourceId),['R01']);
  assert.deepEqual(pick('Gastroenterología',{source:'N19'}).map(card=>card.sourceId),['N19']);
  assert.deepEqual(pick('Gastroenterología',{scope:'national'}).map(card=>card.sourceId),['N19']);
  assert.deepEqual(pick('Gastroenterología',{scope:'regional'}).map(card=>card.sourceId),['R01']);
  assert.deepEqual(pick('Gastroenterología',{source:'N19',scope:'regional'}),[]);
  assert.deepEqual(pick('Gastroenterología',{source:'no-existe'}),[]);
});
check('Sin especialidad seleccionada no se anteponen requisitos de otras especialidades',()=>{
  assert.deepEqual(pick(''),[]);
  for(const mode of ['all','favorites','recent'])for(const query of ['', 'adenoma'])assert.deepEqual(pick('',{query,mode}),[]);
  assert.deepEqual(pick('Psicología'),[]);
});
check('La búsqueda, favoritas y recientes conservan los requisitos de la especialidad seleccionada',()=>{
  const standard=pick('Fisiatría').map(card=>card.id);
  for(const mode of ['all','favorites','recent'])for(const query of ['amputados','sin coincidencias', '   ']){
    assert.deepEqual(pick('Fisiatría',{mode,query}).map(card=>card.id),standard);
  }
});
check('Al combinar búsqueda, prioridad y fuente se conserva solo el documento general correspondiente',()=>{
  for(const mode of ['all','favorites','recent'])for(const priority of ['urgent','priority','routine']){
    const options={query:'adenoma',mode,priority,sort:'relevance'};
    assert.deepEqual(pick('Gastroenterología',{...options,source:'N19'}).map(card=>card.sourceId),['N19']);
    assert.deepEqual(pick('Gastroenterología',{...options,source:'R01'}).map(card=>card.sourceId),['R01']);
    assert.deepEqual(pick('Gastroenterología',{...options,scope:'national'}).map(card=>card.sourceId),['N19']);
    assert.deepEqual(pick('Gastroenterología',{...options,source:'N19',scope:'regional'}),[]);
  }
});
check('La prioridad y el orden no ocultan requisitos comunes que no tienen prioridad propia',()=>{
  const standard=pick('Fisiatría').map(card=>card.id);
  for(const priority of ['urgent','priority','routine'])for(const sort of ['relevance','name','specialty'])assert.deepEqual(pick('Fisiatría',{priority,sort}).map(card=>card.id),standard);
});
check('La procedencia confirmada de HTFC incluye R03 en los documentos de servicio',()=>{
  assert.deepEqual(pick('Oftalmología',{scope:'unverified'}),[]);
  assert.deepEqual(pick('Oftalmología',{scope:'regional'}).map(card=>card.sourceId),['R01','R03']);
  assert.deepEqual(pick('Oftalmología',{scope:'national'}),[]);
  assert.deepEqual(pick('Oftalmología',{scope:'regional',source:'R03'}).map(card=>card.sourceId),['R03']);
});
check('Una procedencia pendiente sigue separada de los documentos regionales identificados',()=>{
  const fixture={...pick('Oftalmología',{source:'R03'})[0],id:'pending-general',sourceId:'P01',scope:'Procedencia por documentar'};
  const pendingSources=new Map([['P01',{id:'P01',documentStatus:'unverified',alcance:'Procedencia por documentar'}]]);
  assert.deepEqual(specialtyGeneralRequirements([fixture],{specialty:'Oftalmología',scope:'unverified'},pendingSources).map(card=>card.id),['pending-general']);
  assert.deepEqual(specialtyGeneralRequirements([fixture],{specialty:'Oftalmología',scope:'regional'},pendingSources),[]);
});
check('Una ficha solo recibe generales de su misma fuente, especialidad y dirección',()=>{
  const selected=active.find(card=>card.specialty==='Gastroenterología'&&card.sourceId==='N19'&&!isGeneralCard(card));
  assert(selected);assert.deepEqual(generalRequirementsForCard(selected,cards).map(card=>card.sourceId),['N19']);
  assert.deepEqual(generalRequirementsForCard(pick('Gastroenterología')[0],cards),[]);
  assert.deepEqual(generalRequirementsForCard({...selected,catalogStatus:'withheld'},cards),[]);
  const fakeGeneral={id:'fake-general',name:'Requisitos generales',specialty:'Otra especialidad',sourceId:selected.sourceId};
  assert.deepEqual(generalRequirementsForCard(selected,[selected,fakeGeneral]),[]);
  assert.deepEqual(generalRequirementsForCard({...selected,sourceId:'desconocido'},cards),[]);
});
check('Retornos y rutas desconocidas nunca heredan requisitos de envío al segundo nivel',()=>{
  const selected=active.find(card=>card.specialty==='Gastroenterología'&&card.sourceId==='N19'&&!isGeneralCard(card));
  for(const direction of ['II-I','II → I','II a I','2-1','2 a 1','III-I','III-II','retorno','']){
    if(!direction)continue;
    assert.equal(isReferralCard({...selected,direction}),false,direction);
    assert.deepEqual(generalRequirementsForCard({...selected,direction},cards),[],direction);
  }
  for(const direction of ['I-II','I → II','1-2',undefined])assert(isReferralCard({...selected,direction}));
  for(const card of active.filter(card=>/^II\s*[-→a]\s*I$/i.test(card.direction||'')))assert.deepEqual(generalRequirementsForCard(card,cards),[]);
});
check('Oncología conserva su ruta I-III y no mezcla generales I-II',()=>{
  const oncology=pick('Oncología');assert.equal(oncology.length,1);assert.equal(oncology[0].direction,'I-III');
  const selected=active.find(card=>card.specialty==='Oncología'&&!isGeneralCard(card));assert(selected);
  assert.deepEqual(generalRequirementsForCard(selected,cards).map(card=>card.id),oncology.map(card=>card.id));
  assert.deepEqual(generalRequirementsForCard({...selected,direction:'I-II'},cards),[]);
});
check('Los apartados retirados y las fuentes sin registro no aparecen en el bloque general',()=>{
  const general=pick('Fisiatría')[0];
  assert.deepEqual(specialtyGeneralRequirements([{...general,catalogStatus:'withheld'}],{specialty:'Fisiatría'},sourceMap),[]);
  assert.deepEqual(specialtyGeneralRequirements([general],{specialty:'Fisiatría'},new Map()),[]);
  assert.deepEqual(generalRequirementsForCard({...general,id:'selected',category:'clinical',name:'Patología'},[{...general,catalogStatus:'withheld'}]),[]);
});
check('Los generales de catarata N09 proceden de su mismo apartado sin crear un tema ni heredar R01 o R03',()=>{
  const card=cards.find(item=>item.id==='n09-catarata');assert(card);
  const before=JSON.stringify(cards),result=generalRequirementsForCard(card,cards);
  assert.equal(result.length,1);const general=result[0];
  assert.equal(general.id,card.id);assert.equal(general.sourceId,'N09');assert.equal(general.specialty,card.specialty);
  assert.equal(general.direction,card.direction);assert.equal(general.category,'general');assert.equal(general.inlineGeneral,true);
  assert.deepEqual(general.pages,[7]);assert.deepEqual(general.criteria,card.inlineGeneralRequirements.criteria);
  assert.equal(general.criteria.length,7);assert.equal(general.checklist.length,7);
  assert(general.checklist.every(item=>item.kind==='general'&&item.requirement==='required'));
  const normal=value=>String(value).replace(/\s+/gu,' ').trim();
  for(const text of general.criteria)assert(normal(card.fullText).includes(normal(text)),'El requisito general está en la transcripción de la fuente.');
  assert.deepEqual(specificRequirementsForCard(card).checklist.map(item=>item.id),['item-1','item-2','item-3','item-4','item-5','item-6']);
  assert.deepEqual(generalRequirementsForCard({...card,direction:'II-I'},cards),[]);
  assert.deepEqual(generalRequirementsForCard({...card,catalogStatus:'withheld'},cards),[]);
  assert.deepEqual(generalRequirementsForCard(general,cards),[]);
  assert.equal(JSON.stringify(cards),before,'Construir la vista general no modifica ni agrega registros de catálogo.');
  assert(!pick('Oftalmología').some(item=>item.id===card.id),'El apartado de catarata no se convierte en un requisito para todas las patologías.');
});
console.log(JSON.stringify({ok:true,checks,generalCards:generals.length,specialties:new Set(generals.map(card=>card.specialty)).size}));
