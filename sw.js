/* Solo se conserva la app y su catálogo; nunca PDF ni imágenes de páginas. */
const CACHE_PREFIX = 'referencias-dripssha-shell-';
const CACHE = `${CACHE_PREFIX}v1.4.14`;
const BASE = new URL('./', self.location.href);
const SHELL = ['index.html','styles.css','app.js','review-content.js','edus-guidance.js','release.js','catalog.js','pwa.js','analytics.js','icon.svg','manifest.webmanifest','viewer.html','viewer.js','viewer.css','print.html','print.js','print.css','document-screen.js','share-card.js','print-session.js','print-session.css','document-pages.js','pdf-actions.js','pdf-actions.css','printable-pdf.js'];
const ICONS = ['assets/icon-180-v12.png','assets/icon-192-v12.png','assets/icon-512-v12.png'];
const DATA_PATHS = ['data/topics.json','data/cards.json','data/sources.json','data/config.json'];
const RESOURCES = [...SHELL,...ICONS,...DATA_PATHS];
const TIMEOUT = 5000;
const keyFor = name => new URL(name,BASE).href;
// El alojamiento puede normalizar .html a una URL sin extensión. Solo estas
// tres páginas tienen alias; nunca se admite un destino arbitrario o de acceso.
const HTML_ROUTES = {
  'index.html':['', 'index.html'],
  'viewer.html':['viewer.html', 'viewer'],
  'print.html':['print.html', 'print']
};
function resourceName(relative) {
  return Object.keys(HTML_ROUTES).find(name=>HTML_ROUTES[name].includes(relative))||relative;
}

async function openCache() {
  try { return await caches.open(CACHE); } catch { return null; }
}
async function legacyCaches() {
  try { return (await caches.keys()).filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE); }
  catch { return []; }
}
async function store(cache,name,response) {
  if(!cache||/\b(?:no-store|private)\b/i.test(response.headers.get('Cache-Control')||''))return;
  try { await cache.put(keyFor(name),response.clone()); } catch { /* El límite de almacenamiento no impide abrir la app. */ }
}

function expectedType(name,type) {
  if(name.endsWith('.html'))return type==='text/html';
  if(name.endsWith('.js'))return /^(?:text|application)\/(?:java|ecma)script$/.test(type);
  if(name.endsWith('.css'))return type==='text/css';
  if(name.endsWith('.svg'))return type==='image/svg+xml';
  if(name.endsWith('.png'))return type==='image/png';
  return type==='application/json'||type==='application/manifest+json';
}

/* Safari rechaza una Response redirigida al responder a una navegación.
   Se reconstruye únicamente un recurso permitido, del mismo origen y tipo.
   No se convierte una redirección a inicio de sesión en una página sin conexión. */
async function safeResponse(response,name) {
  if(!response||response.status!==200||!['basic','default'].includes(response.type))return null;
  if(response.headers.has('WWW-Authenticate'))return null;
  if(response.url){
    const finalURL=new URL(response.url);
    const expected=new URL(name,BASE);
    const allowed=HTML_ROUTES[name]?.map(relative=>new URL(relative,BASE).pathname)||[expected.pathname];
    if(finalURL.origin!==BASE.origin||finalURL.username||finalURL.password||!allowed.includes(finalURL.pathname))return null;
  }
  const type=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
  if(!expectedType(name,type))return null;
  const body=await response.arrayBuffer();
  if(name.endsWith('.html')){
    const script=name==='index.html'?'app':name==='viewer.html'?'viewer':'print';
    const html=new TextDecoder().decode(body);
    const ownScript=new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*(["'])(?:\\./)?${script}\\.js(?:\\?[^"']*)?\\1`,'i');
    if(!ownScript.test(html)||!/<title>[^<]*Criterios de referencia/i.test(html))return null;
  } else if(name.endsWith('.json')||name.endsWith('.webmanifest')){
    try { const value=JSON.parse(new TextDecoder().decode(body));if(!value||typeof value!=='object')return null; }
    catch { return null; }
  }
  const headers=new Headers(response.headers);
  // Fetch ya entregó el cuerpo decodificado: no conservar metadatos de transporte.
  headers.delete('Content-Encoding');headers.delete('Content-Length');headers.delete('Location');
  return new Response(body,{status:200,statusText:response.statusText,headers});
}

async function cachedResponse(cache,name) {
  if(!cache)return null;
  try {
    const cached=await cache.match(keyFor(name));
    if(!cached)return null;
    if(/\b(?:no-store|private)\b/i.test(cached.headers.get('Cache-Control')||'')){
      await cache.delete(keyFor(name));return null;
    }
    const safe=await safeResponse(cached,name);
    if(!safe){await cache.delete(keyFor(name));return null;}
    if(cached.redirected||cached.url)await store(cache,name,safe);
    return safe;
  } catch { return null; }
}

async function networkResponse(name,reload=false) {
  const controller=new AbortController();
  // Instalar ocurre en segundo plano: permitir una red móvil más lenta para
  // el catálogo completo sin ampliar las esperas de navegación habituales.
  const timer=setTimeout(()=>controller.abort(),reload?20000:TIMEOUT);
  try {
    // Pedir la URL canónica evita index.html -> ./; no reutilizar redirect=manual de la navegación.
    const url=name==='index.html'?BASE:new URL(name,BASE);
    const request=new Request(url,{credentials:'same-origin',mode:'same-origin',redirect:'follow',cache:reload?'reload':'no-cache'});
    const response=await fetch(request,{signal:controller.signal});
    const safe=await safeResponse(response,name);
    if(!safe)throw new Error('Respuesta ajena al recurso esperado');
    return safe;
  } finally { clearTimeout(timer); }
}

function unavailable(name,requestURL) {
  const text='No se pudo cargar este contenido. Compruebe la conexión e intente de nuevo.';
  if(DATA_PATHS.includes(name))return new Response(JSON.stringify({error:text}),{status:503,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'}});
  if(name.endsWith('.html')){
    // Una pérdida de red nunca debe sustituir la app por texto sin salida.
    // Esta página no depende de CSS ni JavaScript externos para poder volver.
    const requested=new URL(requestURL||keyFor(name));
    const params=requested.searchParams, back=new URL(BASE);
    const hash=params.get('return')||'';
    if(/^#(?:ficha\/(?:[a-zA-Z0-9_-]|%[a-fA-F0-9]{2})+|fuentes|creditos)$/.test(hash))back.hash=hash;
    else if((name==='print.html'||name==='index.html'&&params.get('screen')==='print')&&/^[a-zA-Z0-9_-]+$/.test(params.get('id')||''))back.hash='#ficha/'+params.get('id');
    else if(name==='viewer.html'||name==='index.html'&&params.get('screen')==='source')back.hash='#fuentes';
    const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const retry=new URL(name==='index.html'?'':name,BASE);retry.search=requested.search;
    const body=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#245477"><title>Contenido no disponible · Criterios de referencia</title><style>body{margin:0;background:#f3f6fa;color:#244e6c;font:18px/1.6 system-ui,sans-serif}main{max-width:38rem;margin:8vh auto;padding:1.5rem}h1{font-size:1.6rem}nav{display:flex;gap:1rem;flex-wrap:wrap}a{display:inline-block;background:#245477;color:white;padding:.8rem 1rem;border-radius:.6rem;font-weight:650;text-decoration:none}a:focus{outline:3px solid #dfac52;outline-offset:4px}</style><main><p>Criterios de referencia</p><h1>No se pudo cargar esta página</h1><p>${escape(text)}</p><p>Puede volver a la ficha y continuar la revisión.</p><nav aria-label="Recuperar la navegación"><a href="${escape(back.href)}">← Volver a la app</a><a href="${escape(retry.href)}">Reintentar</a></nav></main></html>`;
    return new Response(body,{status:503,headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}});
  }
  const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/plain';
  return new Response(type==='text/plain'?text:`/* ${text} */`,{status:503,headers:{'Content-Type':`${type};charset=utf-8`,'Cache-Control':'no-store'}});
}

async function serve(name,networkFirst=false,requestURL) {
  const cache=await openCache();
  if(!networkFirst){const cached=await cachedResponse(cache,name);if(cached)return cached;}
  try { const response=await networkResponse(name);await store(cache,name,response);return response; }
  catch { return (networkFirst&&await cachedResponse(cache,name))||unavailable(name,requestURL); }
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    // Cada versión es un conjunto inseparable: app.js importa otros módulos.
    // No se activa una app nueva con dependencias heredadas o faltantes.
    // Validar toda la red antes de tocar la caché de esta versión.
    const responses=await Promise.all(RESOURCES.map(name=>networkResponse(name,true)));
    const cache=await openCache();
    if(!cache)throw new Error('No se pudo conservar la actualización completa');
    for(let i=0;i<RESOURCES.length;i++){
      const response=responses[i];
      if(/\b(?:no-store|private)\b/i.test(response.headers.get('Cache-Control')||''))throw new Error('La actualización no se puede conservar sin conexión');
      // Aquí no se ocultan errores de cuota/escritura: la versión anterior
      // debe seguir activa si no cabe el conjunto completo de recursos.
      await cache.put(keyFor(RESOURCES[i]),response.clone());
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const cache=await openCache();
    const complete=cache&&(await Promise.all(RESOURCES.map(name=>cachedResponse(cache,name)))).every(Boolean);
    if(!complete)throw new Error('La actualización está incompleta; se conserva la versión anterior');
    await Promise.all((await legacyCaches()).map(async key=>{try{await caches.delete(key);}catch{/* Reintentar la limpieza en la próxima activación. */}}));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  const relative=url.pathname.slice(BASE.pathname.length);
  const name=resourceName(relative);
  // Una lista cerrada deja pasar PDF, Word e imágenes de documentos directamente a la red.
  if(!RESOURCES.includes(name))return;
  if(request.mode==='navigate'&&!name.endsWith('.html'))return;
  event.respondWith(serve(name,DATA_PATHS.includes(name),url.href));
});
