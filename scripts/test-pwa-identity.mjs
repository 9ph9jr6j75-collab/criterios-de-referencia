import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';

// W3C manifest §1.11: id is resolved against the start URL's ORIGIN,
// unlike start_url, scope and icon src, which use the manifest URL.
// https://www.w3.org/TR/appmanifest/#id-member
// Peer identity fields reviewed from the three published apps, 2026-11-04.
// Embedded peers keep this check runnable in the Criterios-only CI checkout.
// Optional paths exercise the actual peer manifests before publishing together:
// node scripts/test-pwa-identity.mjs --hospital-manifest ../epss-hospitales/dist/manifest.webmanifest --areas-manifest ../epss-a-la-mano/dist/manifest.webmanifest
const peers = {
  hospital: {
    name:'EPSS a la mano · Hospitales · DRIPSSHA',short_name:'EPSS Hospitales',
    start_url:'./#evaluacion',scope:'./',display:'standalone',
    icons:[{src:'assets/icon-192.png',sizes:'192x192',type:'image/png'},{src:'assets/icon-512.png',sizes:'512x512',type:'image/png'}]
  },
  areas: {
    id:'/epss-a-la-mano/',name:'EPSS a la mano · Fichas técnicas · DRIPSSHA',short_name:'EPSS a la mano',
    start_url:'./',scope:'./',display:'standalone',
    icons:[{src:'assets/icon-192.png',sizes:'192x192',type:'image/png'},{src:'assets/icon-512.png',sizes:'512x512',type:'image/png'}]
  }
};
const paths = new Map();
for(let i=2;i<process.argv.length;i+=2){
  const flag=process.argv[i],path=process.argv[i+1];
  assert(['--reference-manifest','--hospital-manifest','--areas-manifest'].includes(flag)&&path,'Expected a supported manifest flag and path');
  assert(!paths.has(flag),'Duplicate manifest option');paths.set(flag,path);
}
async function readManifest(flag,fallback){
  return paths.has(flag)?JSON.parse(await fs.readFile(pathToFileURL(resolve(paths.get(flag))),'utf8')):fallback;
}
const apps = [
  {key:'reference',path:'criterios-de-referencia',site:'criterios-de-referencia',siteId:'/',name:/^Criterios de referencia/,manifest:await readManifest('--reference-manifest',JSON.parse(await fs.readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8')))},
  {key:'hospital',path:'epss-hospitales',site:'epss-hospitales-dripssha',siteId:'/',name:/Hospitales/,manifest:await readManifest('--hospital-manifest',peers.hospital)},
  {key:'areas',path:'epss-a-la-mano',site:'epss-dripssha',siteId:'/epss-a-la-mano/',name:/Fichas técnicas/,manifest:await readManifest('--areas-manifest',peers.areas)}
];
const github='https://9ph9jr6j75-collab.github.io';
function processManifest(manifest,manifestURL){
  const start=new URL(manifest.start_url,manifestURL);
  let id=new URL(start);
  if(typeof manifest.id==='string'&&manifest.id!==''){
    try{const candidate=new URL(manifest.id,`${start.origin}/`);if(candidate.origin===start.origin)id=candidate;}catch{/* Invalid identifiers fall back to start_url. */}
  }
  id.hash='';
  const scope=new URL(manifest.scope,manifestURL);scope.hash='';scope.search='';
  return {id:id.href,start,scope,icons:manifest.icons.map(icon=>new URL(icon.src,manifestURL))};
}
function githubManifestURL(app){return `${github}/${app.path}/manifest.webmanifest`;}

test('the former ./ identifiers collide across distinct GitHub project paths',()=>{
  const old=apps.filter(app=>app.key!=='areas').map(app=>processManifest({...app.manifest,id:'./'},githubManifestURL(app)));
  assert.equal(new Set(old.map(app=>app.id)).size,1);
  assert.equal(old[0].id,`${github}/`);
  assert.notEqual(old[0].start.pathname,old[1].start.pathname,'Distinct launch pages did not prevent the identity collision');
  assert.notEqual(new URL('./',githubManifestURL(apps[0])).href,old[0].id,'Resolving id against the manifest path would miss the actual browser defect');
});

test('three published GitHub apps have three distinct installation identities',()=>{
  const processed=apps.map(app=>processManifest(app.manifest,githubManifestURL(app)));
  assert.deepEqual(processed.map(app=>app.id),apps.map(app=>`${github}/${app.path}/`));
  assert.equal(new Set(processed.map(app=>app.id)).size,3,'Each app must be independently installable');
});

test('launch URLs, scopes and icons stay within their own project, without nested scopes',()=>{
  const processed=apps.map(app=>processManifest(app.manifest,githubManifestURL(app)));
  for(let i=0;i<apps.length;i++){
    const app=apps[i],actual=processed[i],base=`/${app.path}/`;
    assert.match(app.manifest.name,app.name);
    assert.equal(app.manifest.display,'standalone');
    assert.equal(actual.scope.href,`${github}${base}`);
    assert.equal(actual.start.origin,github);
    assert(actual.start.pathname.startsWith(base),'Launching an app must not escape to another project');
    assert(actual.icons.length>=2);
    for(const icon of actual.icons){assert.equal(icon.origin,github);assert(icon.pathname.startsWith(base),'Icons belong to this app, not an origin-wide shared path');}
    for(let j=0;j<apps.length;j++)if(i!==j){assert(!processed[j].scope.pathname.startsWith(base),'Scopes must not contain another app');assert(!actual.scope.pathname.startsWith(processed[j].scope.pathname),'Scopes must not be nested in another app');}
  }
});

test('the fix preserves every existing identity on the three separate Sites hosts',()=>{
  for(const app of apps){
    const origin=`https://${app.site}.solanocorella.chatgpt.site`;
    const actual=processManifest(app.manifest,`${origin}/manifest.webmanifest`);
    assert.equal(actual.id,`${origin}${app.siteId}`,`${app.key}: do not create a replacement Sites installation`);
    assert.equal(actual.scope.href,`${origin}/`);
    const before=app.key==='areas'?peers.areas:{...app.manifest,id:'./'};
    assert.equal(actual.id,processManifest(before,`${origin}/manifest.webmanifest`).id);
  }
});

test('default identities discard launch fragments and survive version updates',()=>{
  const fragment={...peers.hospital};delete fragment.id;
  assert.equal(processManifest(fragment,`${github}/epss-hospitales/manifest.webmanifest`).id,`${github}/epss-hospitales/`);
  assert.equal(processManifest({...fragment,id:''},`${github}/epss-hospitales/manifest.webmanifest`).id,`${github}/epss-hospitales/`);
  assert.equal(processManifest({...fragment,id:'/epss-hospitales/#ignored'},`${github}/epss-hospitales/manifest.webmanifest`).id,`${github}/epss-hospitales/`);
  for(const app of apps){
    const manifestURL=githubManifestURL(app),before=processManifest(app.manifest,manifestURL);
    const next={...app.manifest,version:'999.0.0',description:'Updated content',theme_color:'#245477'};
    assert.equal(processManifest(next,manifestURL).id,before.id,'A normal publication must keep its installation identity');
  }
});
