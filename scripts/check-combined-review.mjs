import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {generalRequirementsForCard,specificRequirementsForCard,isCatalogCard,isGeneralCard,createTopicIndex} from '../catalog.js';
import {edusGuidanceForCard} from '../edus-guidance.js';
import {reviewBuckets,reviewSupplements} from '../review-content.js';

const root=new URL('../',import.meta.url);
const [app,cards,sources,release]=await Promise.all([
  fs.readFile(new URL('app.js',root),'utf8'),
  ...['cards','sources','release'].map(async name=>JSON.parse(await fs.readFile(new URL(`data/${name}.json`,root),'utf8')))
]);
const catalogURL=new URL('../catalog.js',import.meta.url).href,pdfURL=new URL('../printable-pdf.js',import.meta.url).href;
const printSource=(await fs.readFile(new URL('print.js',root),'utf8'))
  .replace("import { APP_RELEASE } from './release.js';",`const APP_RELEASE=${JSON.stringify(release)};`)
  .replace("'./catalog.js'",JSON.stringify(catalogURL)).replace("'./printable-pdf.js'",JSON.stringify(pdfURL))
  .replace("'./edus-guidance.js'",JSON.stringify(new URL('../edus-guidance.js',import.meta.url).href));
const {checklistEntries}=await import('data:text/javascript;base64,'+Buffer.from(printSource).toString('base64'));
const index=await fs.readFile(new URL('index.html',root),'utf8');
const definitions=JSON.parse(await fs.readFile(new URL('data/topics.json',root),'utf8')).groups;
const integratedAudit=JSON.parse(await fs.readFile(new URL('audits/2026-10-29-integrated-general-requirements.json',root),'utf8'));
const names=['viewerURL','getChecked','checklist','reviewGroups','edusGuidanceHTML','reviewPageLinksHTML','reviewSupplementsHTML','checklistHTML','updateChecklist','generalRequirementsHTML','sourceTranscriptionHTML','documentChoiceRequired','applyDetailTab','renderDetail','referenceTemplate','missingTemplate','showScreen'];
const functions=names.map(name=>{
  const start=app.indexOf(`  function ${name}(`);assert(start>=0,name);
  const next=app.slice(start+1).search(/\n  (?:async )?function /);
  return next<0?app.slice(start):app.slice(start,start+1+next);
}).join('\n');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function boot(allCards=cards){
  const storage=new Map(),nodes=new Map(),inputs=[],messages=[];
  class Node {
    constructor(){this.listeners={};this.dataset={};this.style={};this.attrs={};this.textContent='';this.disabled=false;this.checked=false;this.hidden=false;this.open=false;}
    addEventListener(name,callback){this.listeners[name]=callback;}
    setAttribute(name,value){this.attrs[name]=value;}
    matches(selector){return selector==='[data-check-id]'&&Boolean(this.dataset.checkId);}
    focus(){this.focused=true;}
    scrollIntoView(){this.scrolled=true;}
    set innerHTML(value){
      this.html=value;inputs.length=0;
      for(const tag of value.matchAll(/<[^>]+>/g)){
        const id=/\bid="([^"]+)"/.exec(tag[0]);if(id){const element=new Node();element.open=/\sopen(?:\s|>)/.test(tag[0]);nodes.set('#'+id[1],element);}
        const check=/\bdata-check-id="([^"]+)"/.exec(tag[0]);
        if(check){const node=new Node();node.dataset.checkId=check[1];node.dataset.checkCardId=/\bdata-check-card-id="([^"]+)"/.exec(tag[0])?.[1];node.checked=/\schecked(?:\s|>)/.test(tag[0]);inputs.push(node);}
      }
    }
  }
  const panel=new Node(),track=new Node(),details=new Node();nodes.set('#detail-screen',panel);nodes.set('.progress-track',track);nodes.set('details',details);
  nodes.set('#catalog-screen',new Node());nodes.set('#info-screen',new Node());
  const date=new Node(),headerSupport=new Node(),header=new Node();
  date.parentElement=headerSupport;headerSupport.parentElement=header;
  nodes.set('.header-support',headerSupport);nodes.set('.app-header',header);nodes.set('.app-updated',date);
  const catalogOnly=Array.from({length:2},()=>{const entry=new Node();entry.hidden=true;return entry;});
  const state={cards:allCards,sourceMap:new Map(sources.map(item=>[item.id,item])),recent:[],pendingDocumentChoice:'',topicIndex:allCards===cards?createTopicIndex(cards,definitions):{byCard:new Map()}};
  const context={state,STORE:'test',sessionStorage:storage,localStorage:new Map(),checklistEntries,generalRequirementsForCard,specificRequirementsForCard,isCatalogCard,edusGuidanceForCard,reviewBuckets,reviewSupplements,
    $:selector=>nodes.get(selector),$$:selector=>selector==='[data-catalog-only]'?catalogOnly:selector==='[data-detail-tab]'||selector==='.utility-nav [data-nav]'?[]:inputs.filter(input=>selector.includes(':checked')?input.checked:true),
    safeRead:(store,key,fallback)=>store.get(key)??fallback,safeWrite:(store,key,value)=>store.set(key,value),
    esc:escape,arr:value=>Array.isArray(value)?value:value?[value]:[],icon:()=>'',
    pageLabel:item=>`Pág. ${(item.pages||[]).join(', ')}`,sourceFor:item=>state.sourceMap.get(item.sourceId)||{id:item.sourceId,titulo:item.sourceId},
    sourceStatusNote:()=>'<section data-test-document-warning="true">Alcance de la fuente</section>',topicSourcesHTML:()=>'',summaryHTML:()=>'',sourcePanel:()=>'',feedbackPanel:()=>'<section data-test-feedback="true">Reportar un error</section>',statusBadge:()=>'',
    updateDetailFavorite(){},cardPriorityType:()=>'',document:{title:''},location:{hash:''},window:{},
    announce:message=>messages.push(message),norm:value=>String(value||'').toLowerCase(),textOf:item=>item?.text||String(item||''),
    saveDetailReading(){},toggleFavorite(){},shareCard(){},printCard(){},copyText(){},detailReading:()=>({detailTab:'summary'})
  };
  vm.createContext(context);vm.runInContext(functions,context);
  // These content regressions inspect an explicitly selected document. The
  // unchosen-document gate is exercised separately in test-document-selection.
  const renderChosenDetail=(id,restoreReading=false)=>{state.pendingDocumentChoice=id;context.location.hash='#ficha/'+encodeURIComponent(id);context.renderDetail(id,restoreReading);};
  return {context,renderChosenDetail,storage,nodes,inputs,panel,messages,details,date,catalogOnly};
}
// Inspect hierarchy rather than matching the source template's punctuation.
function hierarchy(html){
  const root={children:[]},stack=[root],elements=[];
  const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const token of html.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)){
    const tag=token[1].toLowerCase();
    if(token[0].startsWith('</')){const index=stack.findLastIndex(node=>node.tag===tag);if(index>0){stack[index].end=token.index+token[0].length;stack.length=index;}continue;}
    const parent=stack.at(-1),node={tag,markup:token[0],parent,children:[],start:token.index,openEnd:token.index+token[0].length,end:token.index+token[0].length};
    parent.children.push(node);elements.push(node);
    if(!voids.has(tag)&&!token[0].endsWith('/>'))stack.push(node);
  }
  return {root,elements};
}
const hasClass=(node,name)=>(/\bclass="([^"]*)"/.exec(node.markup)?.[1]||'').split(/\s+/).includes(name);
const within=(node,ancestor)=>{for(let current=node.parent;current;current=current.parent)if(current===ancestor)return true;return false;};
const visibleInitially=node=>{for(let current=node;current?.tag;current=current.parent)if((current.tag==='details'&&!/\sopen(?:\s|>)/.test(current.markup))||/\shidden(?:\s|>)/.test(current.markup))return false;return true;};
const decode=value=>String(value).replace(/&(?:amp|lt|gt|quot|#39);/g,char=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'\"','&#39;':"'"}[char]));
let checks=0;
const check=(name,run)=>{run();checks++;console.log('✓ '+name);};
check('Las 652 fichas asociadas reciben generales antes de la patología sin mezclar fuentes ni rutas',()=>{
  const env=boot();let associated=0;
  for(const card of cards.filter(isCatalogCard)){
    const generals=generalRequirementsForCard(card,cards),groups=env.context.reviewGroups(card);
    assert.deepEqual(Array.from(groups,item=>item.card.id),[...generals.map(item=>item.id),card.id]);
    if(generals.length){associated++;assert(groups.slice(0,-1).every(item=>item.general&&item.card.sourceId===card.sourceId&&item.card.specialty===card.specialty));}
  }
  assert.equal(associated,652);
});
check('Las 730 fichas muestran la revisión primero, avisos antes y reporte al final',()=>{
  const env=boot();let rendered=0;
  for(const card of cards.filter(isCatalogCard)){
    env.renderChosenDetail(card.id);
    const {root,elements}=hierarchy(env.panel.html);
    const feedbacks=elements.filter(node=>node.markup.includes('data-test-feedback='));
    assert.equal(feedbacks.length,1,card.id);
    const feedback=feedbacks[0],layout=elements.find(node=>hasClass(node,'detail-layout'));
    const checklist=elements.find(node=>hasClass(node,'checklist-panel'));
    assert(layout&&checklist,card.id);assert.equal(checklist.parent,layout,card.id);
    assert.equal(layout.children[0],checklist,card.id+' La revisión precede el contenido documental.');
    const transcription=elements.find(node=>node.markup.includes('id="document-transcription"'));
    assert(transcription&&transcription.tag==='details',card.id);assert.equal(layout.children[1],transcription,card.id);
    assert(!/\sopen(?:\s|>)/.test(transcription.markup),card.id+': transcripción cerrada de inicio.');
    assert(!/reference-column|Resumen por requisito|role="tablist"/.test(env.panel.html),card.id+': una sola lectura principal.');
    assert.match(env.panel.html,/>Desmarcar todas las casillas<\/button>/,card.id);
    if(card.fullText)assert(env.panel.html.slice(transcription.start,transcription.end).includes(escape(card.fullText)),card.id+': la transcripción original permanece íntegra.');
    const guidance=edusGuidanceForCard(card,cards);
    const guidanceBlocks=elements.filter(node=>/class="edus-guidance"/.test(node.markup));
    assert.equal(guidanceBlocks.length,guidance?1:0,card.id+': una orientación EDUS cuando corresponde.');
    if(guidance){
      const block=guidanceBlocks[0],progress=elements.find(node=>hasClass(node,'checklist-progress')),items=elements.find(node=>hasClass(node,'checklist-items'));
      assert.equal(block.parent,checklist,card.id+': orientación dentro de Revise su referencia.');
      assert(progress&&items,card.id);assert.equal(progress.parent,checklist,card.id);assert.equal(items.parent,checklist,card.id);
      assert(checklist.children.indexOf(progress)<checklist.children.indexOf(block)&&checklist.children.indexOf(block)<checklist.children.indexOf(items),card.id+': EDUS visible después del progreso y antes de las casillas.');
      const heading=elements.find(node=>node.tag==='h3'&&within(node,block));
      const body=elements.find(node=>hasClass(node,'edus-guidance-body')),scope=elements.find(node=>hasClass(node,'edus-guidance-scope'));
      for(const [node,text] of [[heading,guidance.title],[body,guidance.body],[scope,guidance.scopeNote]]){
        assert(node&&within(node,block)&&visibleInitially(node),card.id+': título e instrucciones de EDUS visibles sin desplegar.');
        assert(env.panel.html.slice(node.start,node.end).includes(escape(text)),card.id+': orientación visible íntegra.');
      }
      const folded=elements.filter(node=>node.tag==='details'&&within(node,block));
      assert.equal(folded.length,1,card.id+': solo se pliega el respaldo institucional.');
      assert(hasClass(folded[0],'edus-guidance-sources'),card.id);assert(!/\sopen(?:\s|>)/.test(folded[0].markup),card.id+': respaldo institucional plegado.');
      if(guidance.originalsNote){const originals=elements.find(node=>hasClass(node,'edus-originals'));assert(originals&&visibleInitially(originals),card.id+': material original siempre visible.');}
      for(const text of [guidance.title,guidance.body,guidance.scopeNote,guidance.originalsNote].filter(Boolean))assert(env.panel.html.includes(escape(text)),card.id+': orientación íntegra y distinta del texto documental.');
      for(const source of guidance.sources)assert(env.panel.html.includes(escape(source.url)),card.id+': respaldo de la orientación.');
    }
    const warning=elements.find(node=>node.markup.includes('data-test-document-warning='));
    assert.equal(warning.parent,root,card.id);
    assert(root.children.indexOf(warning)<root.children.indexOf(layout),card.id);
    if(card.priority){
      const priority=elements.find(node=>/class="priority-panel/.test(node.markup));
      assert(priority,card.id);assert.equal(priority.parent,root,card.id);
      assert(root.children.indexOf(priority)<root.children.indexOf(layout),card.id);
    }
    assert.equal(feedback.parent,root,card.id);assert.equal(root.children.at(-1),feedback,card.id);
    assert(root.children.indexOf(layout)<root.children.indexOf(feedback),card.id);
    const generals=generalRequirementsForCard(card,cards);
    const renderedText=decode(env.panel.html.replace(/<[^>]*>/g,' ')).normalize('NFC').replace(/\s+/gu,' ').trim();
    const expectedReviews=[...generals,specificRequirementsForCard(card)].flatMap(item=>(item.checklist||[]).map((entry,index)=>({cardId:item.id,checkId:typeof entry==='string'?`c${index+1}`:entry.id||`c${index+1}`})));
    assert.deepEqual(env.inputs.map(input=>({cardId:input.dataset.checkCardId,checkId:input.dataset.checkId})),expectedReviews,card.id+': todas las casillas generales y específicas aparecen en la misma ficha, una vez y en orden.');
    for(const general of generals){
      for(const field of ['criteria','prior','studies','notes'])for(const item of general[field]||[]){
        const text=typeof item==='object'?String(item.text??item.label??''):String(item);
        if(text)assert(renderedText.includes(text.normalize('NFC').replace(/\s+/gu,' ').trim()),card.id+': texto general '+field+' incorporado sin abrir otra ficha.');
      }
      if(general.fullText)assert(env.panel.html.slice(transcription.start,transcription.end).includes(escape(general.fullText)),card.id+': transcripción general original íntegra en esta ficha.');
    }
    rendered++;
  }
  assert.equal(rendered,730);
});
check('Cada grupo conserva acceso directo a todas sus páginas y el retorno a la ficha exacta',()=>{
  const env=boot();let groupsChecked=0,linksChecked=0;
  for(const card of cards.filter(isCatalogCard)){
    env.renderChosenDetail(card.id);
    const {elements}=hierarchy(env.panel.html),checklist=elements.find(node=>hasClass(node,'checklist-panel'));
    const renderedGroups=elements.filter(node=>hasClass(node,'checklist-group')&&within(node,checklist));
    const groups=env.context.reviewGroups(card);assert.equal(renderedGroups.length,groups.length,card.id);
    groups.forEach((group,index)=>{
      const rendered=renderedGroups[index],links=elements.filter(node=>node.tag==='a'&&within(node,rendered)&&node.markup.includes('data-source-action="pages"'));
      const source=env.context.state.sourceMap.get(group.card.sourceId);
      if(!source?.pageImageBase)return;
      const expected=[...new Set(group.card.pages.map(Number))].sort((a,b)=>a-b),found=new Set();
      assert(links.length,card.id+': respaldo visible del grupo '+group.card.id);
      for(const link of links){
        assert(visibleInitially(link),card.id+': acceso al respaldo antes de abrir transcripción.');
        const href=decode(/\bhref="([^"]+)"/.exec(link.markup)?.[1]||'');
        const url=new URL(href,'https://criterios.example/app/');
        assert.equal(url.searchParams.get('screen'),'source');assert.equal(url.searchParams.get('source'),group.card.sourceId,card.id);
        const page=Number(url.searchParams.get('page'));assert(expected.includes(page),card.id+': no inventar otra página.');
        assert.equal(url.searchParams.get('return'),'#ficha/'+encodeURIComponent(card.id),card.id+': volver a la variante consultada.');
        found.add(page);linksChecked++;
      }
      assert.deepEqual([...found].sort((a,b)=>a-b),expected,card.id+': todas las páginas declaradas.');groupsChecked++;
    });
  }
  assert(groupsChecked>=730&&linksChecked>=1000);console.log(`  ${groupsChecked} grupos y ${linksChecked} enlaces de respaldo comprobados.`);
});
check('Los generales completos se leen una vez con casillas, aun cuando el texto repetido comienza con Indicaciones generales',()=>{
  const normalized=value=>String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  const covered=cards.filter(card=>isCatalogCard(card)&&isGeneralCard(card)&&card.checklist?.length&&card.criteria?.length===1&&normalized(card.criteria[0]).replace(/^Indicaciones generales\s*:?\s*/u,'')===normalized(card.checklist.map(entry=>entry.text).join(' ')));
  assert.equal(covered.length,11,'Diez generales con encabezado y Odontología ya cubierto por su propia casilla.');
  const coveredIds=new Set(covered.map(card=>card.id)),env=boot();let views=0;
  for(const card of cards.filter(isCatalogCard)){
    const generals=env.context.reviewGroups(card).filter(group=>coveredIds.has(group.card.id));if(!generals.length)continue;
    env.renderChosenDetail(card.id);const {elements}=hierarchy(env.panel.html);
    for(const general of generals){
      const group=elements.find(node=>hasClass(node,'checklist-group')&&node.markup.includes('data-review-card="'+general.card.id+'"'));assert(group,card.id);
      const visible=normalized(decode(env.panel.html.slice(group.start,group.end).replace(/<[^>]*>/g,' ')));
      for(const entry of general.entries)assert.equal(visible.split(normalized(entry.text)).length-1,1,card.id+': cada requisito general tiene una lectura visible.');
      for(const note of general.card.notes||[])assert(visible.includes(normalized(note)),card.id+': se conserva la precisión única.');
      const transcription=elements.find(node=>node.markup.includes('id="document-transcription"'));assert(transcription&&!visibleInitially(transcription),card.id);
      assert(env.panel.html.slice(transcription.start,transcription.end).includes(escape(general.card.fullText)),card.id+': el texto original completo permanece en la transcripción.');
    }
    views++;
  }
  assert.equal(views,241);
});
check('Precisiones únicas permanecen visibles y las repeticiones de Catarata y Amputados salen de la lectura abierta',()=>{
  const env=boot();
  const view=html=>{
    const {elements}=hierarchy(html),closed=elements.filter(node=>node.tag==='details'&&!/\sopen(?:\s|>)/.test(node.markup));
    let result=html;
    for(const node of closed.filter(node=>!closed.some(other=>other!==node&&within(node,other))).sort((a,b)=>b.start-a.start))result=result.slice(0,node.start)+result.slice(node.end);
    return result;
  };
  const cataract=cards.find(card=>card.id==='n09-catarata');env.renderChosenDetail(cataract.id);
  const cataractView=view(env.panel.html);
  assert(cataractView.includes('No se requiere de otros exámenes.'));
  assert(!cataractView.includes('Incluir los datos generales, antecedentes y examen físico que establece la fuente.'));
  for(const entry of cataract.checklist)assert.equal(cataractView.split(escape(entry.text)).length-1,1,entry.id+': una sola lectura abierta.');
  const amputados=cards.find(card=>card.id==='r01-fisiatria-amputados-p62');env.renderChosenDetail(amputados.id);
  const amputadosView=view(env.panel.html);
  assert.equal(amputadosView.split('Muñón doloroso traer Rx correspondiente').length-1,1,'La radiografía no vuelve a copiarse en un resumen.');
  for(const id of ['n12-hipertension-arterial-referencia-a-medicina-familiar-y-comunitaria','n12-hipertension-arterial-referencia-a-nefrologia']){
    const card=cards.find(item=>item.id===id);env.renderChosenDetail(id);const visible=view(env.panel.html);
    for(const note of card.notes.filter(text=>/no debe demorarse|no solicitar estudios complementarios adicionales/.test(text)))assert(visible.includes(escape(note)),id+': conservar excepción clínica visible.');
  }
});
check('Las etiquetas de obligatoriedad y condición de los estudios se conservan junto a sus casillas',()=>{
  const env=boot();let labels=0;
  const labelFor={required:'Obligatorio en la fuente',desirable:'Deseable según la fuente',conditional:'Según el caso o la condición descrita'};
  for(const card of cards.filter(isCatalogCard)){
    env.renderChosenDetail(card.id);
    const {elements}=hierarchy(env.panel.html),labelsHTML=elements.filter(node=>node.tag==='label'&&hasClass(node,'checklist-item'));
    const entries=env.context.reviewGroups(card).flatMap(group=>reviewBuckets(group.card).flatMap(bucket=>bucket.entries));
    assert.equal(labelsHTML.length,entries.length,card.id);
    entries.forEach((entry,index)=>{
      const text=env.panel.html.slice(labelsHTML[index].start,labelsHTML[index].end),label=labelFor[entry.sourceRequirement||entry.requirement];
      assert(text.includes(escape(entry.text)),card.id+': texto íntegro al lado de su marca.');
      if(label){assert(text.includes(label),card.id+': condición o carácter deseable conservados.');labels++;}
    });
  }
  assert(labels>100,'Se comprueban etiquetas reales de estudios y requisitos.');
});
check('Desplegar y volver a plegar la transcripción conserva el estado de lectura y las casillas',()=>{
  const env=boot();env.storage.set('test:checks:n09-catarata',['item-1']);env.renderChosenDetail('n09-catarata');
  const details=env.nodes.get('#document-transcription');assert.equal(details.open,false);assert(details.listeners.toggle);
  details.open=true;details.listeners.toggle({target:details});assert.equal(env.context.state.detailTab,'full');
  env.context.detailReading=()=>({detailTab:'full'});env.renderChosenDetail('n09-catarata',true);
  assert.equal(env.nodes.get('#document-transcription').open,true,'Volver del visor conserva el desplegado.');
  assert(env.inputs.find(input=>input.dataset.checkId==='item-1').checked);
  env.context.applyDetailTab('summary');assert.equal(env.nodes.get('#document-transcription').open,false);
  assert(env.inputs.find(input=>input.dataset.checkId==='item-1').checked,'Plegar no cambia las marcas.');
});
check('La instalación solo aparece en el inicio y la fecha permanece visible al cambiar de pantalla',()=>{
  const initialEntries=[...index.matchAll(/<[^>]*\bdata-catalog-only\b[^>]*>/g)].map(match=>match[0]);
  assert.equal(initialEntries.length,2);assert(initialEntries.every(tag=>/\shidden(?:\s|>)/.test(tag)),'La instalación empieza oculta antes de resolver un enlace directo.');
  const header=index.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0]||'';
  const footer=index.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0]||'';
  const installationEntries=[...index.matchAll(/<[^>]*\bdata-install-(?:help|app)\b[^>]*>/g)].map(match=>match[0]);
  assert.equal(installationEntries.length,2,'Solo existen instalar y ayuda en el encabezado del inicio.');
  for(const tag of installationEntries)assert(header.includes(tag),'Cada acceso de instalación pertenece al encabezado.');
  assert(!/data-install-(?:help|app)|footer-installation|Instalación de la app/.test(footer),'Ninguna ruta conserva una instalación al final.');
  const env=boot();assert(env.catalogOnly.every(entry=>entry.hidden),'Los enlaces directos no muestran instalación antes de la ruta.');
  for(const screen of ['catalog','detail','catalog','info']){
    env.context.showScreen(screen);
    assert(env.catalogOnly.every(entry=>entry.hidden===(screen!=='catalog')),screen);
    assert.equal(env.nodes.get('#catalog-screen').hidden,screen!=='catalog');
    assert.equal(env.nodes.get('#detail-screen').hidden,screen!=='detail');
    assert.equal(env.nodes.get('#info-screen').hidden,screen!=='info');
    for(let node=env.date;node;node=node.parentElement)assert.equal(node.hidden,false,'La fecha y sus contenedores permanecen visibles.');
  }
});
const selected={id:'main',name:'Patología',specialty:'Prueba',sourceId:'R01',pages:[20],checklist:[{id:'same',text:'ESPECÍFICO'}]};
const general={id:'general',name:'Requisitos generales',category:'general',specialty:'Prueba',sourceId:'R01',pages:[4],criteria:['TEXTO GENERAL'],checklist:[{id:'same',text:'GENERAL',legacyIds:['old']}]};
const foreign={...general,id:'foreign',sourceId:'N19',checklist:[{id:'foreign',text:'AJENO'}]};
check('Marcar la patología no completa el progreso cuando falta revisar generales',()=>{
  const env=boot([selected,general,foreign]);env.storage.set('test:checks:main',['same']);env.renderChosenDetail('main');
  assert.equal(env.nodes.get('#check-progress-label').textContent,'1 de 2 casillas revisadas');
  assert.equal(env.nodes.get('#check-pending-label').textContent,'1 por revisar');
  assert(env.panel.html.indexOf('GENERAL')<env.panel.html.indexOf('ESPECÍFICO'));
  assert(!env.panel.html.includes('AJENO'));assert.equal(env.nodes.get('#document-transcription').open,false);
});
check('Eventos conservan por separado casillas con igual ID y las marcas históricas',()=>{
  const env=boot([selected,general,foreign]);env.storage.set('test:checks:general',['old']);env.renderChosenDetail('main');
  const generalInput=env.inputs.find(input=>input.dataset.checkCardId==='general'),mainInput=env.inputs.find(input=>input.dataset.checkCardId==='main');
  assert(generalInput.checked);assert(!mainInput.checked);mainInput.checked=true;env.panel.onchange({target:mainInput});
  assert.deepEqual(Array.from(env.storage.get('test:checks:main')),['same']);assert.deepEqual(env.storage.get('test:checks:general'),['old']);
  generalInput.checked=false;env.panel.onchange({target:generalInput});
  assert.deepEqual(Array.from(env.storage.get('test:checks:general')),[]);assert.deepEqual(Array.from(env.storage.get('test:checks:main')),['same']);
  env.renderChosenDetail('main');assert(!env.inputs.find(input=>input.dataset.checkCardId==='general').checked);assert(env.inputs.find(input=>input.dataset.checkCardId==='main').checked);
});
check('Desmarcar todas las casillas elimina solo los grupos mostrados, sin tocar otra fuente',()=>{
  const env=boot([selected,general,foreign]);for(const id of ['main','general','foreign'])env.storage.set(`test:checks:${id}`,['same']);
  env.renderChosenDetail('main');env.nodes.get('#reset-checklist').listeners.click();
  assert.deepEqual(Array.from(env.storage.get('test:checks:main')),[]);assert.deepEqual(Array.from(env.storage.get('test:checks:general')),[]);assert.deepEqual(env.storage.get('test:checks:foreign'),['same']);
  assert.equal(env.nodes.get('#check-progress-label').textContent,'0 de 2 casillas revisadas');assert(env.nodes.get('#reset-checklist').disabled);
  assert.match(env.panel.html,/>Desmarcar todas las casillas<\/button>/);assert.match(env.messages.at(-1),/desmarcaron todas las casillas/);
});
check('Generales sin casillas siguen abiertos y no se presentan como revisión completada',()=>{
  const unstructured=cards.find(card=>isCatalogCard(card)&&isGeneralCard(card)&&!card.checklist?.length);
  assert(unstructured);const main=cards.find(card=>generalRequirementsForCard(card,cards).some(item=>item.id===unstructured.id));assert(main);
  const env=boot();env.storage.set('test:checks:'+main.id,env.context.checklist(main).map(item=>item.id));env.renderChosenDetail(main.id);
  assert.equal(env.nodes.get('#check-pending-label').textContent,'Revise también el texto general');
  const {elements}=hierarchy(env.panel.html),supplement=elements.find(node=>node.markup.includes('data-supplement-card="'+unstructured.id+'"'));
  assert(supplement&&visibleInitially(supplement),'Los generales sin casillas se leen antes de desplegar la transcripción.');
  assert(env.panel.html.slice(supplement.start,supplement.end).includes(escape(unstructured.fullText))||env.panel.html.slice(supplement.start,supplement.end).includes(escape(unstructured.criteria?.[0]||'')));
  env.context.applyDetailTab('full');assert.equal(env.nodes.get('#document-transcription').open,true);
  env.context.applyDetailTab('summary');assert.equal(env.nodes.get('#document-transcription').open,false);
  assert.match(env.context.missingTemplate(main),/Este apartado no tiene casillas separadas/);
});
check('Pendientes y esquema copiado incluyen requisitos generales y sus páginas',()=>{
  const env=boot([selected,general,foreign]),pending=env.context.missingTemplate(selected),template=env.context.referenceTemplate(selected);
  assert(pending.indexOf('REQUISITOS GENERALES')<pending.indexOf('CRITERIOS DE ESTA FICHA'));assert.match(pending,/GENERAL/);assert.match(pending,/Pág\. 4/);assert.match(pending,/Pág\. 20/);assert(!pending.includes('AJENO'));
  assert.match(template,/Revisar también los requisitos generales/);assert.match(template,/Pág\. 4/);
});
check('La orientación EDUS se conserva al copiar el esquema y los elementos por revisar',()=>{
  const env=boot();let applicable=0;
  for(const card of cards.filter(isCatalogCard)){
    const guidance=edusGuidanceForCard(card,cards);if(!guidance)continue;
    const template=env.context.referenceTemplate(card),pending=env.context.missingTemplate(card);
    assert.match(template,/Ubicación y fecha de los estudios en EDUS/,card.id);
    assert.match(template,/Asistente EDUS, indicar expresamente cuáles están en sus adjuntos/,card.id);
    for(const text of [guidance.body,guidance.scopeNote,guidance.originalsNote].filter(Boolean))assert(pending.includes(text),card.id+': copiar pendientes conserva la orientación completa.');
    applicable++;
  }
  assert.equal(applicable,617);
});
check('Catarata N09 muestra sus siete generales antes de los seis criterios conservando las marcas anteriores',()=>{
  const card=cards.find(item=>item.id==='n09-catarata'),env=boot();assert(card);
  const generalIds=card.checklist.filter(item=>item.kind==='general').map(item=>item.id);
  const specificIds=['item-1','item-2','item-3','item-4','item-5','item-6'];
  assert.equal(generalIds.length,7);assert.deepEqual(card.checklist.filter(item=>item.kind!=='general').map(item=>item.id),specificIds);
  env.storage.set('test:checks:'+card.id,specificIds);env.renderChosenDetail(card.id);
  const groups=env.context.reviewGroups(card);
  assert.deepEqual(Array.from(groups,group=>({source:group.card.sourceId,general:group.general,count:group.entries.length})),[{source:'N09',general:true,count:7},{source:'N09',general:false,count:6}]);
  assert.deepEqual(env.inputs.map(input=>input.dataset.checkId),[...generalIds,...specificIds]);
  assert.equal(new Set(env.inputs.map(input=>input.dataset.checkId)).size,13,'Cada requisito tiene una sola casilla.');
  assert(env.inputs.every(input=>input.dataset.checkCardId===card.id),'Las marcas nuevas y anteriores permanecen bajo la misma ficha.');
  assert.equal(env.nodes.get('#check-progress-label').textContent,'6 de 13 casillas revisadas');
  assert.equal(env.nodes.get('#check-pending-label').textContent,'7 por revisar');
  assert(env.inputs.slice(0,7).every(input=>!input.checked));assert(env.inputs.slice(7).every(input=>input.checked));
  const pending=env.context.missingTemplate(card);
  assert(pending.indexOf('REQUISITOS GENERALES')<pending.indexOf('CRITERIOS DE ESTA FICHA'));
  for(const text of card.inlineGeneralRequirements.criteria)assert(pending.includes(text),'El pendiente conserva cada requisito general de N09.');
  assert.match(pending,/Fuente N09\. Pág\. 7\./);assert(!/Fuente R01|Fuente R03/.test(pending));
  const template=env.context.referenceTemplate(card);assert.match(template,/Revisar también los requisitos generales/);assert.match(template,/Pág\. 7/);
  const first=env.inputs[0];first.checked=true;env.panel.onchange({target:first});
  assert.deepEqual(new Set(env.storage.get('test:checks:'+card.id)),new Set([...specificIds,generalIds[0]]));
  env.renderChosenDetail(card.id);
  assert.equal(env.nodes.get('#check-progress-label').textContent,'7 de 13 casillas revisadas');
  assert(env.inputs.find(input=>input.dataset.checkId===generalIds[0]).checked);
  for(const id of specificIds)assert(env.inputs.find(input=>input.dataset.checkId===id).checked,'Conservar la revisión específica '+id);
  const remaining=env.context.missingTemplate(card);assert(!remaining.includes(card.inlineGeneralRequirements.criteria[0]),'Un general ya revisado sale de pendientes.');
  for(const text of card.inlineGeneralRequirements.criteria.slice(1))assert(remaining.includes(text),'Conservar los demás requisitos generales pendientes.');
});
check('Las cuatro incorporaciones auditadas conservan todas las marcas específicas y la condición de cada requisito',()=>{
  const expected=new Map([
    ['n17-referencia-de-trabajo-social-del-i-al-ii-nivel',{source:'N17',general:13,specific:1}],
    ['n11-referencia-de-psicologia-a-hospitales-perifericos-o-regionales',{source:'N11',general:3,specific:3}],
    ['n12-hipertension-arterial-referencia-a-medicina-familiar-y-comunitaria',{source:'N12',general:3,specific:3}],
    ['n12-hipertension-arterial-referencia-a-medicina-interna',{source:'N12',general:1,specific:10}]
  ]);
  assert.deepEqual(integratedAudit.changes.map(change=>change.cardId).sort(),[...expected.keys()].sort());
  for(const [id,want]of expected){
    const card=cards.find(item=>item.id===id),change=integratedAudit.changes.find(item=>item.cardId===id),env=boot();assert(card&&change);
    const originals=change.before.checklist,oldIds=originals.map(item=>item.id);
    assert.equal(originals.length,want.specific);assert.deepEqual(specificRequirementsForCard(card).checklist,originals);
    env.storage.set('test:checks:'+id,oldIds);env.renderChosenDetail(id);
    const groups=env.context.reviewGroups(card);
    assert.deepEqual(Array.from(groups,group=>({source:group.card.sourceId,general:group.general,count:group.entries.length})),[{source:want.source,general:true,count:want.general},{source:want.source,general:false,count:want.specific}]);
    assert.equal(env.nodes.get('#check-progress-label').textContent,`${want.specific} de ${want.general+want.specific} casillas revisadas`);
    assert.equal(env.nodes.get('#check-pending-label').textContent,`${want.general} por revisar`);
    assert(env.inputs.slice(0,want.general).every(item=>!item.checked));assert(env.inputs.slice(want.general).every(item=>item.checked));
    const first=env.inputs[0];first.checked=true;env.panel.onchange({target:first});env.renderChosenDetail(id);
    for(const oldId of oldIds)assert(env.inputs.find(item=>item.dataset.checkId===oldId).checked,id+': revisión previa conservada.');
    assert.equal(env.nodes.get('#check-progress-label').textContent,`${want.specific+1} de ${want.general+want.specific} casillas revisadas`);
  }
  const n17=cards.find(card=>card.id==='n17-referencia-de-trabajo-social-del-i-al-ii-nivel'),n11=cards.find(card=>card.id==='n11-referencia-de-psicologia-a-hospitales-perifericos-o-regionales'),family=cards.find(card=>card.id==='n12-hipertension-arterial-referencia-a-medicina-familiar-y-comunitaria'),internal=cards.find(card=>card.id==='n12-hipertension-arterial-referencia-a-medicina-interna');
  const footnote=n17.inlineGeneralRequirements.notes[0];assert.match(footnote,/no llegar a acuerdos/);assert.match(footnote,/agotada la capacidad resolutiva/);
  assert(n17.checklist.find(item=>item.id==='n17-general-11').text.includes(footnote),'La alternativa por falta de acuerdo sigue en la casilla correspondiente.');
  const env=boot();env.renderChosenDetail(n17.id);assert(env.panel.html.includes(escape(footnote)),'La nota queda visible dentro de la misma ficha.');assert(env.context.missingTemplate(n17).includes(footnote));
  assert.equal(n11.checklist.find(item=>item.id==='n11-general-3').requirement,'desirable','La sesión técnica recomendada no se transforma en obligación.');
  assert.deepEqual(family.checklist.filter(item=>item.kind==='general').map(item=>item.requirement),['source','conditional','desirable']);
  assert(family.notes.some(note=>/no debe demorarse/.test(note)),'No retrasar una emergencia hipertensiva por completar requisitos de consulta externa.');
  assert.equal(internal.checklist.find(item=>item.id==='n12-general-1').requirement,'required');
  assert.equal(internal.checklist.find(item=>item.id==='item-10').requirement,'desirable','La radiografía de ser posible conserva su carácter deseable.');
  const renal=cards.find(card=>card.id==='n12-hipertension-arterial-referencia-a-nefrologia');
  assert(renal.criteria.some(text=>/estadio 4 o 5; no requiere estudio complementario/.test(text)));
  assert(renal.notes.some(text=>/no solicitar estudios complementarios adicionales/.test(text)));
  assert.deepEqual(generalRequirementsForCard(renal,cards),[],'No aplicar a Nefrología las listas de Medicina Familiar o Medicina Interna.');
});
console.log(JSON.stringify({ok:true,checks}));
