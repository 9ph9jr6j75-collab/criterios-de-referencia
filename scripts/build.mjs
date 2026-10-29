import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
await fs.mkdir(dist,{recursive:true});
async function copy(src,dst){
 const st=await fs.stat(src);
 if(st.isDirectory()){
  await fs.mkdir(dst,{recursive:true});
  for(const e of await fs.readdir(src))await copy(path.join(src,e),path.join(dst,e));
 }else{
  const old=await fs.stat(dst).catch(()=>null);
  if(!old||old.size!==st.size||old.mtimeMs<st.mtimeMs)await fs.copyFile(src,dst);
 }
}
for(const item of ['index.html','styles.css','app.js','catalog.js','document-screen.js','share-card.js','print-session.js','print-session.css','pdf-actions.js','pdf-actions.css','printable-pdf.js','pwa.js','analytics.js','viewer.html','viewer.css','viewer.js','print.html','print.css','print.js','sw.js','manifest.webmanifest','icon.svg','data','assets']){
 const src=path.join(root,item);if(await fs.stat(src).catch(()=>null))await copy(src,path.join(dist,item));
}
// Las vistas de documentos usan el mismo inicio canónico de la app. El HTML de
// cada vista se mantiene en un solo archivo fuente, incluidos sus scripts.
const documentPages={};
for(const [screen,filename] of [['source','viewer.html'],['print','print.html']]){
 const html=await fs.readFile(path.join(root,filename),'utf8');
 const body=html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
 const title=html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
 if(!body||!title)throw Error('Vista documental incompleta: '+filename);
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]);
 const css=[...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]);
 documentPages[screen]={title,body:body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),css,scripts};
}
await fs.writeFile(path.join(dist,'document-pages.js'),'export const DOCUMENT_PAGES = '+JSON.stringify(documentPages)+';\n');
const release=JSON.parse(await fs.readFile(path.join(root,'data/release.json'),'utf8'));
if(!release.appVersion||!Number.isFinite(Date.parse(release.updatedAt)))throw Error('Falta fecha de actualización válida');
await fs.writeFile(path.join(dist,'release.js'),'export const APP_RELEASE = Object.freeze('+JSON.stringify({version:release.appVersion,updatedAt:release.updatedAt})+');\n');
await fs.writeFile(path.join(dist,'.nojekyll'),'');
console.log('Aplicación estática preparada en dist/');
