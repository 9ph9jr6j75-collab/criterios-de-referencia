/* Medición exclusiva de esta app. Nunca se envían búsquedas libres ni datos de pacientes. */
(() => {
 'use strict';
 const allowed=new Set(['reference_open','source_page','source_open','source_download','reference_print','reference_template_copy','review_copy','favorite_change','catalog_search','reference_share','installation_help']);
 const modes=new Set(['pages','download','summary','full','all','favorites','recent']);
 const actions=new Set(['add','remove']);
 const pending=[];
 let active=false,loading=true,version='',cards=new Map(),sources=new Map();
 const currentCard=()=>{
  if(!location.hash.startsWith('#ficha/'))return '';
  try {const id=decodeURIComponent(location.hash.slice(7));return cards.has(id)?id:'';}catch{return '';}
 };
 function send(event,params={}) {
  if(!active||!allowed.has(event))return;
  const card=cards.get(params.card_id),source=sources.get(params.source_id||card?.sourceId);
  if(['reference_open','reference_template_copy','review_copy','favorite_change','reference_share'].includes(event)&&!card)return;
  if(['source_page','source_open','source_download'].includes(event)&&!source)return;
  if(event==='reference_print'&&!card&&!source)return;
  const output={app_name:'criterios_de_referencia',app_version:version};
  if(card)output.card_id=card.id;
  if(source)output.source_id=source.id;
  if(modes.has(params.mode))output.mode=params.mode;
  if(actions.has(params.action))output.action=params.action;
  if(event==='source_page'&&Number.isInteger(params.page_number)&&params.page_number>=1&&params.page_number<=source.pageCount)output.page_number=params.page_number;
  if(event==='catalog_search'&&Number.isInteger(params.result_count)&&params.result_count>=0&&params.result_count<=cards.size)output.result_count=params.result_count;
  window.gtag('event',event,output);
 }
 window.trackReferenceEvent=(event,params={})=>{
  if(!allowed.has(event))return;
  if(loading){if(pending.length<30)pending.push([event,{...params}]);return;}
  send(event,params);
 };
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 const json=async path=>{const response=await fetch(path,{signal:controller.signal});if(!response.ok)throw Error('analytics resource');return response.json();};
 json('data/config.json').then(async config=>{
  const analytics=config?.analytics;
  if(config?.appId!=='criterios-de-referencia'||analytics?.enabled!==true||!/^G-[A-Z0-9]+$/.test(analytics.measurementId||'')||location.protocol!=='https:')return;
  const site=Array.isArray(analytics.allowedSites)&&analytics.allowedSites.find(entry=>
   entry&&typeof entry.host==='string'&&entry.host===location.hostname&&typeof entry.pathPrefix==='string'&&
   /^\/(?:[a-zA-Z0-9_\-/]*\/)?$/.test(entry.pathPrefix)&&location.pathname.startsWith(entry.pathPrefix));
  if(!site)return;
  const [release,cardList,sourceList]=await Promise.all([json('data/release.json'),json('data/cards.json'),json('data/sources.json')]);
  if(!/^\d+\.\d+\.\d+(?:[.-][a-zA-Z0-9]+)*$/.test(release?.appVersion||'')||!Array.isArray(cardList)||!Array.isArray(sourceList))return;
  version=release.appVersion;
  cards=new Map(cardList.filter(card=>card?.catalogStatus!=='withheld'&&typeof card?.id==='string').map(card=>[card.id,card]));
  sources=new Map(sourceList.filter(source=>typeof source?.id==='string').map(source=>[source.id,source]));
  const canonical=location.origin+site.pathPrefix,id=analytics.measurementId;
  window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};
  window.gtag('js',new Date());
  window.gtag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_title:'Criterios de referencia',page_location:canonical,page_referrer:''});
  const loader=document.createElement('script');loader.async=true;loader.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);document.head.append(loader);
  active=true;loading=false;
  window.gtag('event','page_view',{page_title:'Criterios de referencia',page_location:canonical,page_referrer:''});
  pending.splice(0).forEach(([event,params])=>send(event,params));
  // La app confirma la apertura después de elegir documento. Un hash de ficha
  // también puede mostrar solo el selector y no acredita que se leyó la fuente.
  document.addEventListener('click',event=>{
   const element=event.target.closest?.('button,a,[data-favorite]');if(!element)return;
   const card_id=element.dataset?.favorite||currentCard();
   let source_id='';
   try {const candidate=new URL(element.href||location.href).searchParams.get('source');if(sources.has(candidate))source_id=candidate;}catch{}
   if(!source_id&&element.dataset?.pdfFilename){const candidate=element.dataset.pdfFilename.split('-')[0];if(sources.has(candidate))source_id=candidate;}
   const params={card_id,source_id};
   const events={'detail-print':'reference_print','copy-reference':'reference_template_copy','copy-missing':'review_copy','detail-favorite':'favorite_change','detail-share':'reference_share','print':'reference_print'};
   if(events[element.id])send(events[element.id],params);
   else if(element.dataset?.favorite)send('favorite_change',params);
   if(element.dataset?.sourceAction)send(element.dataset.sourceAction==='download'?'source_download':'source_open',{...params,mode:element.dataset.sourceAction});
   if(element.hasAttribute?.('data-install-help'))send('installation_help');
  });
 }).catch(()=>{}).finally(()=>{loading=false;pending.length=0;clearTimeout(timeout);});
})();
