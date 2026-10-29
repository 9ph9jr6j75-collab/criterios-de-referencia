import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../sw.js',import.meta.url),'utf8');
const BASE='https://criterios.example/app/';
const {version}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
const CURRENT=`referencias-dripssha-shell-v${version}`;
const LEGACY='referencias-dripssha-shell-v1.2.1';
const address=name=>new URL(name,BASE).href;
const html=script=>`<!doctype html><title>Criterios de referencia · DRIPSSHA</title><script src="${script}.js" type="module"></script>`;

// CacheStorage conserva la lista de URL/redirecciones. Simularla es esencial:
// Response.clone() de Node no permite generar una redirección seguida sin red real.
function response(body,{url='',redirected=false,type='basic',status=200,headers={'Content-Type':'text/html'}}={}){
  const value=new Response(body,{status:status||200,headers});
  const nativeClone=value.clone.bind(value);
  const decorate=result=>{
    Object.defineProperties(result,{url:{value:url},redirected:{value:redirected},type:{value:type},status:{value:status}});
    const clone=result===value?nativeClone:result.clone.bind(result);
    Object.defineProperty(result,'clone',{value:()=>decorate(clone())});
    return result;
  };
  return decorate(value);
}

class MemoryCache {
  entries=new Map();
  puts=[];
  async match(key){return this.entries.get(String(key))?.clone();}
  async put(key,value){this.entries.set(String(key),value.clone());this.puts.push(String(key));}
  async delete(key){return this.entries.delete(String(key));}
}

function harness({fetcher=async()=>{throw new Error('Sin red');},fastTimeout=false,cacheUnavailable=false}={}){
  const listeners=new Map(),cacheMap=new Map(),requests=[];
  let claimed=0,skipped=0;
  const caches={
    async open(key){if(cacheUnavailable)throw new Error('Sin almacenamiento');if(!cacheMap.has(key))cacheMap.set(key,new MemoryCache());return cacheMap.get(key);},
    async keys(){return [...cacheMap.keys()];},
    async delete(key){return cacheMap.delete(key);}
  };
  const context={
    URL,Request,Response,Headers,TextDecoder,AbortController,caches,
    setTimeout:fastTimeout?(fn=>setTimeout(fn,0)):setTimeout,clearTimeout,
    self:{location:{href:address('sw.js')},addEventListener:(name,fn)=>listeners.set(name,fn),skipWaiting:async()=>{skipped++;},clients:{claim:async()=>{claimed++;}}},
    fetch:async(request,options)=>{requests.push({request,options});return fetcher(request,options);}
  };
  vm.runInNewContext(source,context,{filename:'sw.js'});
  return {
    caches,cacheMap,requests,get claimed(){return claimed;},get skipped(){return skipped;},
    async lifecycle(name){let pending;listeners.get(name)({waitUntil:value=>{pending=value;}});await pending;},
    async get(name='',{method='GET',mode='navigate'}={}){
      let pending;
      listeners.get('fetch')({request:{url:address(name),method,mode,redirect:'manual'},respondWith:value=>{pending=value;}});
      return pending===undefined?null:await pending;
    }
  };
}

let checks=0;
async function check(name,fn){await fn();checks++;console.log(`✓ ${name}`);}

await check('Navegación canónica: ninguna Response con redirecciones llega a Safari',async()=>{
  const app=harness({fetcher:async()=>response(html('app'),{url:BASE,redirected:true,headers:{'Content-Type':'text/html;charset=utf-8','Content-Encoding':'gzip','Content-Length':'99'}})});
  const result=await app.get('index.html?actualizar=1');
  assert.equal(result.status,200);assert.equal(result.redirected,false);assert.equal(result.url,'');
  assert((await result.text()).includes('app.js'));
  assert.equal(result.headers.get('Content-Encoding'),null);assert.equal(result.headers.get('Content-Length'),null);
  assert.equal(app.requests[0].request.url,BASE);assert.equal(app.requests[0].request.redirect,'follow');assert.equal(app.requests[0].request.mode,'same-origin');
  const cache=await app.caches.open(CURRENT);
  assert.equal((await cache.match(address('index.html'))).redirected,false);
  assert.equal(await cache.match(BASE),undefined,'Una sola clave de caché para el inicio');
});

await check('Caché heredada redirigida se reconstruye aun sin conexión',async()=>{
  const app=harness();
  const cache=await app.caches.open(CURRENT);
  await cache.put(address('index.html'),response(html('app'),{url:BASE,redirected:true}));
  const result=await app.get('');
  assert.equal(result.status,200);assert.equal(result.redirected,false);assert.equal(result.url,'');
  assert.equal((await cache.match(address('index.html'))).redirected,false);
  assert.equal(app.requests.length,0,'El catálogo ya disponible abre sin red');
});

await check('La precarga guarda inicio, visor, impresión e iconos con tipos correctos y sin redirecciones',async()=>{
  const app=harness({fetcher:async request=>{
    const name=new URL(request.url).pathname.slice(new URL(BASE).pathname.length)||'index.html';
    const type=name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':name.endsWith('.webmanifest')?'application/manifest+json':'application/json';
    const body=name.endsWith('.html')?html(name==='index.html'?'app':name.split('.')[0]):type.includes('json')?'{}':'recurso';
    return response(body,{url:request.url,redirected:name==='index.html',headers:{'Content-Type':type}});
  }});
  await app.lifecycle('install');
  const cache=await app.caches.open(CURRENT);
  for(const name of ['index.html','viewer.html','print.html','app.js','edus-guidance.js','print.js','print.css','document-screen.js','document-pages.js','print-session.js','print-session.css','pdf-actions.js','pdf-actions.css','printable-pdf.js','assets/icon-192-v12.png','data/cards.json']){
    const stored=await cache.match(address(name));
    assert(stored,name);assert.equal(stored.redirected,false,name);assert.equal(stored.url,'',name);
  }
  assert.equal(cache.entries.size,31);
  assert(app.requests.every(({request})=>request.cache==='reload'));
});

await check('Una instalación sin red conserva la versión anterior y nunca mezcla módulos heredados',async()=>{
  const app=harness();
  const old=await app.caches.open(LEGACY);
  await old.put(address('index.html'),response(html('app'),{url:BASE,redirected:true}));
  await old.put(address('app.js'),response('/* app anterior */',{headers:{'Content-Type':'text/javascript'}}));
  await old.put(address('data/cards.json'),response('[{"id":"ejemplo"}]',{headers:{'Content-Type':'application/json'}}));
  await assert.rejects(app.lifecycle('install'));
  assert.equal(app.skipped,0);assert.equal(app.claimed,0);assert.equal(app.cacheMap.has(LEGACY),true);
  assert.equal(await (await old.match(address('app.js'))).text(),'/* app anterior */');
  assert.equal(app.cacheMap.has(CURRENT),false,'La actualización ni siquiera escribe antes de validar toda la red');
  await assert.rejects(app.lifecycle('activate'));
  assert.equal(app.claimed,0);assert.equal(app.cacheMap.has(LEGACY),true,'Ni una activación incompleta puede purgar la versión anterior');
});

await check('Faltar un módulo nuevo aborta la actualización completa y deja intacta la caché anterior',async()=>{
 for(const missingModule of ['document-screen.js','edus-guidance.js']){
  const app=harness({fetcher:async request=>{
    const name=new URL(request.url).pathname.slice(new URL(BASE).pathname.length)||'index.html';
    if(name===missingModule)throw Error('Módulo nuevo no disponible: '+missingModule);
    const type=name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':name.endsWith('.webmanifest')?'application/manifest+json':'application/json';
    return response(name.endsWith('.html')?html(name==='index.html'?'app':name.split('.')[0]):type.includes('json')?'{}':'recurso nuevo',{url:request.url,headers:{'Content-Type':type}});
  }});
  const old=await app.caches.open(LEGACY);
  await old.put(address('app.js'),response('/* versión anterior operativa */',{headers:{'Content-Type':'text/javascript'}}));
  await old.put(address(missingModule),response('/* no reutilizar este módulo anterior */',{headers:{'Content-Type':'text/javascript'}}));
  await assert.rejects(app.lifecycle('install'),/Módulo nuevo/);
  assert.equal(app.skipped,0);assert.equal(app.claimed,0);assert.equal(app.cacheMap.has(CURRENT),false);assert.equal(app.cacheMap.has(LEGACY),true);
  assert.equal(await (await old.match(address('app.js'))).text(),'/* versión anterior operativa */');
  assert.equal(old.entries.size,2,'No se modifica ningún recurso anterior');
 }
});

await check('Una instalación íntegra activa y reclama clientes solo después de conservar los 31 recursos',async()=>{
  const app=harness({fetcher:async request=>{
    const name=new URL(request.url).pathname.slice(new URL(BASE).pathname.length)||'index.html';
    const type=name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':name.endsWith('.webmanifest')?'application/manifest+json':'application/json';
    return response(name.endsWith('.html')?html(name==='index.html'?'app':name.split('.')[0]):type.includes('json')?'{}':'recurso',{url:request.url,headers:{'Content-Type':type}});
  }});
  await app.caches.open(LEGACY);await app.caches.open('otra-app');
  await app.lifecycle('install');assert.equal(app.skipped,1);assert.equal(app.claimed,0);assert.equal(app.cacheMap.has(LEGACY),true);
  assert.equal((await app.caches.open(CURRENT)).entries.size,31);
  await app.lifecycle('activate');assert.equal(app.claimed,1);assert.equal(app.cacheMap.has(LEGACY),false);assert.equal(app.cacheMap.has('otra-app'),true);
});

await check('No se sirve ni guarda HTML de autenticación, destinos ajenos o tipos opacos',async()=>{
  for(const bad of [
    ()=>response(html('app'),{url:'https://login.example/',redirected:true}),
    ()=>response(html('app'),{url:address('login'),redirected:true}),
    ()=>response('<title>Inicio de sesión</title><form>Acceso</form>',{url:BASE}),
    ()=>response(html('app'),{url:BASE,type:'opaqueredirect',status:0}),
    ()=>response(html('app'),{url:BASE,type:'opaque',status:0}),
    ()=>response(html('app'),{url:BASE,headers:{'Content-Type':'text/html','WWW-Authenticate':'Basic'}})
  ]){
    const app=harness({fetcher:async()=>bad()});
    assert.equal((await app.get('')).status,503);
    assert.equal(await (await app.caches.open(CURRENT)).match(address('index.html')),undefined);
  }
});

await check('JSON de red inválido usa respaldo JSON válido; sin respaldo devuelve JSON 503',async()=>{
  for(const bad of [
    ()=>response('<h1>Login</h1>',{url:address('data/cards.json')}),
    ()=>response('{roto',{url:address('data/cards.json'),headers:{'Content-Type':'application/json'}})
  ]){
    const app=harness({fetcher:async()=>bad()});
    const cache=await app.caches.open(CURRENT);
    await cache.put(address('data/cards.json'),response('[{"id":"guardado"}]',{headers:{'Content-Type':'application/json'}}));
    assert.deepEqual(await (await app.get('data/cards.json',{mode:'cors'})).json(),[{id:'guardado'}]);
  }
  const offline=harness();
  const result=await offline.get('data/cards.json',{mode:'cors'});
  assert.equal(result.status,503);assert.match(result.headers.get('Content-Type'),/^application\/json/);assert((await result.json()).error);
});

await check('Los módulos conservan MIME de JavaScript y jamás reciben la página de acceso',async()=>{
  const app=harness({fetcher:async()=>response('export const ok=true;',{url:address('app.js'),headers:{'Content-Type':'application/javascript;charset=utf-8'}})});
  const result=await app.get('app.js',{mode:'cors'});
  assert.equal(result.status,200);assert.match(result.headers.get('Content-Type'),/javascript/);assert.match(await result.text(),/export const/);
  const bad=harness({fetcher:async()=>response('<title>Acceso</title>',{url:address('app.js')})});
  const fallback=await bad.get('app.js',{mode:'cors'});
  assert.equal(fallback.status,503);assert.match(fallback.headers.get('Content-Type'),/javascript/);assert(!/<title>/.test(await fallback.text()));
});

await check('Visor e impresión conservan parámetros en la navegación y utilizan caché de página segura',async()=>{
  for(const name of ['viewer','print']){
    const app=harness({fetcher:async request=>response(html(name),{url:request.url,redirected:true})});
    const result=await app.get(`${name}.html?source=N09&page=7`);
    assert.equal(result.status,200);assert.equal(result.redirected,false);
    assert.equal(app.requests[0].request.url,address(`${name}.html`));
    assert.match(await result.text(),new RegExp(`${name}\\.js`));
  }
});

await check('El visor y la impresión aceptan su URL canónica sin extensión, incluida la precarga',async()=>{
  for(const name of ['viewer','print']){
    const app=harness({fetcher:async()=>response(html(name),{url:address(name),redirected:true})});
    for(const route of [name+'.html',name]){
      const result=await app.get(route+'?source=N19&page=19&return=%23ficha%2Fprueba');
      assert.equal(result.status,200,route);assert.equal(result.redirected,false);assert.equal(result.url,'');
      assert.match(await result.text(),new RegExp(name+'\\.js'));
    }
    assert.equal(app.requests.length,1,'Los alias comparten una clave segura de caché');
    assert((await (await app.caches.open(CURRENT)).match(address(name+'.html'))));
  }
  const preloaded=harness({fetcher:async request=>{
    const name=new URL(request.url).pathname.slice(new URL(BASE).pathname.length)||'index.html';
    if(name==='viewer.html'||name==='print.html')return response(html(name.split('.')[0]),{url:address(name.replace('.html','')),redirected:true});
    const type=name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':name.endsWith('.webmanifest')?'application/manifest+json':'application/json';
    return response(name.endsWith('.html')?html('app'):type.includes('json')?'{}':'recurso',{url:request.url,headers:{'Content-Type':type}});
  }});
  await preloaded.lifecycle('install');
  const cache=await preloaded.caches.open(CURRENT);
  for(const name of ['viewer','print'])assert(await cache.match(address(name+'.html')),name+' disponible aun si el host normaliza la ruta');
});

await check('La entrada raíz de visor e impresión usa el índice seguro y conserva los parámetros de la página',async()=>{
  let online=true;
  const app=harness({fetcher:async request=>{
    if(!online)throw Error('Sin red');
    assert.equal(request.url,BASE,'La red solo pide el shell canónico, sin confundir los parámetros con archivos');
    return response(html('app'),{url:BASE,redirected:true});
  }});
  const routes=['?screen=source&source=N19&page=19&return=%23ficha%2Fn19-adenoma','?screen=print&id=n19-adenoma'];
  for(const route of routes){
    const result=await app.get(route);
    assert.equal(result.status,200);assert.equal(result.url,'');assert.equal(result.redirected,false);
    assert.match(await result.text(),/app\.js/);
  }
  assert.equal(app.requests.length,1,'Ambas entradas comparten el índice, sin redirecciones que alteren la URL visible');
  online=false;
  for(const route of routes){
    const result=await app.get(route);
    assert.equal(result.status,200);assert.equal(result.url,'');assert.equal(result.redirected,false);
    assert.match(await result.text(),/app\.js/);
  }
  assert.equal(app.requests.length,1,'El índice de las pantallas funciona desde caché sin conexión');
  assert.equal((await app.caches.open(CURRENT)).entries.size,1);
  for(const route of routes){
    const result=await harness().get(route),body=await result.text();
    assert.equal(result.status,503);assert.match(result.headers.get('Content-Type'),/^text\/html/);
    assert(body.includes('href="'+BASE+'#ficha/n19-adenoma"'));
    assert(body.includes('href="'+BASE+route.replaceAll('&','&amp;')+'"'),'Reintentar conserva la entrada raíz y sus parámetros');
    assert(!/<script|onclick|javascript:/i.test(body));
  }
  const noReturn=await (await harness().get('?screen=source&source=N19&page=19')).text();
  assert(noReturn.includes('href="'+BASE+'#fuentes"'));
});

await check('Los alias no permiten otra página, rutas anidadas, barra final ni autenticación',async()=>{
  for(const name of ['viewer','print'])for(const bad of ['login',name+'/',name+'/login',name+'-backup','other.html']){
    const app=harness({fetcher:async()=>response(html(name),{url:address(bad),redirected:true})});
    assert.equal((await app.get(name+'.html')).status,503,name+' → '+bad);
    assert.equal(await (await app.caches.open(CURRENT)).match(address(name+'.html')),undefined);
  }
  const clean=harness();
  for(const route of ['viewer/','print/','index','app/viewer','login'])assert.equal(await clean.get(route),null,route);
});

await check('Una navegación sin red ofrece volver y reintentar, conserva la ficha y no requiere scripts',async()=>{
  for(const route of ['viewer.html','viewer','print.html','print']){
    const params=route.startsWith('viewer')?'source=N19&page=19&return=%23ficha%2Fn19-adenoma':'id=n19-adenoma';
    const app=harness();
    const result=await app.get(route+'?'+params);
    assert.equal(result.status,503);assert.match(result.headers.get('Content-Type'),/^text\/html/);
    assert.equal(result.headers.get('Cache-Control'),'no-store');
    const body=await result.text();
    assert.match(body,/Volver a la app/);assert.match(body,/Reintentar/);
    assert(body.includes('href="'+BASE+'#ficha/n19-adenoma"'));
    assert(!/<script|stylesheet|onclick|javascript:/i.test(body));
    assert(body.includes(route.startsWith('viewer')?'viewer.html?source=N19&amp;page=19&amp;return=%23ficha%2Fn19-adenoma':'print.html?id=n19-adenoma'));
  }
  const root=await (await harness().get('')).text();assert(root.includes('href="'+BASE+'"'));
  const external=await (await harness().get('viewer.html?return=https%3A%2F%2Fevil.example%2F')).text();
  assert(external.includes('href="'+BASE+'#fuentes"'));assert(!external.includes('href="https://evil.example/"'));
  const injected=await (await harness().get('print.html?id=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')).text();
  assert(!/<script/i.test(injected));assert(injected.includes('href="'+BASE+'"'));
});

await check('PDF, Word, páginas WebP, imágenes de documentos y otros orígenes quedan fuera del SW',async()=>{
  const app=harness();
  for(const name of ['fuentes/original.pdf','fuentes/original.docx','assets/pages/N09/7.webp','assets/scan.png','assets/scan.jpg','desconocida.html','https://otro.example/index.html'])assert.equal(await app.get(name),null,name);
  assert.equal(await app.get('index.html',{method:'POST'}),null);
  assert.equal(app.requests.length,0);
});

await check('La red tiene límite y el catálogo sin conexión responde sin colgarse',async()=>{
  const app=harness({fastTimeout:true,fetcher:async(request,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Abortado')),{once:true}))});
  const result=await app.get('data/cards.json',{mode:'cors'});
  assert.equal(result.status,503);assert.equal(app.requests[0].options.signal.aborted,true);assert((await result.json()).error);
});

await check('La falta de almacenamiento o Cache-Control privado no bloquea ni guarda la app',async()=>{
  const app=harness({cacheUnavailable:true,fetcher:async()=>response(html('app'),{url:BASE})});
  assert.equal((await app.get('')).status,200);
  const privateApp=harness({fetcher:async()=>response(html('app'),{url:BASE,headers:{'Content-Type':'text/html','Cache-Control':'private, no-store'}})});
  assert.equal((await privateApp.get('')).status,200);
  assert.equal(await (await privateApp.caches.open(CURRENT)).match(address('index.html')),undefined);
});

console.log(JSON.stringify({ok:true,checks,cache:CURRENT}));
