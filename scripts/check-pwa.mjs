import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Event-level checks. Layout, native dialogs and browser installation remain UI QA.
const source = await fs.readFile(new URL('../pwa.js', import.meta.url),'utf8');
function boot(options={}) {
  const ids=new Map(), entries=[], queries=[], copied=[];
  let doc;
  class Node {
    constructor(tag='div') { this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.events={};this.hidden=false;this.disabled=false;this.isConnected=true;this.open=false;this.style={};const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}; }
    set innerHTML(html) {
      for(const match of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
        const node=new Node(match[1]), attrs=match[2];
        const id=attrs.match(/\bid="([^"]+)"/);if(id){node.id=id[1];ids.set(node.id,node);}
        for(const attr of attrs.matchAll(/\bdata-([\w-]+)="([^"]*)"/g))node.dataset[attr[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attr[2];
        node.hidden=/\shidden(?:\s|$)/.test(attrs);this.children.push(node);
      }
    }
    setAttribute(name,value) { this.attrs[name]=value;if(name==='open')this.open=true; }
    removeAttribute(name) { delete this.attrs[name];if(name==='open')this.open=false; }
    addEventListener(name,callback) { (this.events[name]??=[]).push(callback); }
    async fire(name,event={}) { await Promise.all((this.events[name]||[]).map(callback=>callback({target:this,preventDefault(){},...event}))); }
    closest(selector) { return selector==='[data-install-app]'&&'installApp' in this.dataset||selector==='[data-install-help]'&&'installHelp' in this.dataset||selector==='[data-install-device]'&&'installDevice' in this.dataset?this:null; }
    querySelector(selector) { return selector==='[data-install-label]'?this.label:null; }
    querySelectorAll(selector) { return this.children.filter(node=>selector==='[data-install-device]'?'installDevice' in node.dataset:selector==='[data-install-panel]'?'installPanel' in node.dataset:false); }
    append(node) { this.children.push(node);if(node.id)ids.set(node.id,node); }
    focus() { doc.activeElement=this; }
    showModal() { this.open=true; }
    close() { this.open=false;for(const callback of this.events.close||[])callback(); }
  }
  const header=new Node('button'), footer=new Node('button'), help=new Node('button');
  help.dataset.installHelp='';
  for(const entry of [header,footer]) { entry.dataset.installApp='';entry.label=new Node('span');entry.children.push(entry.label);entries.push(entry); }
  const brand=new Node('a'), body=new Node('body');
  doc=new Node('document');Object.assign(doc,{body,baseURI:'https://example.test/criterios/index.html?private=omit#ficha/n09-catarata',hidden:false});
  doc.getElementById=id=>ids.get(id)||null;doc.createElement=tag=>new Node(tag);
  doc.querySelectorAll=selector=>selector==='[data-install-app]'?entries:[];doc.querySelector=selector=>selector==='.brand'?brand:null;
  const win=new Node('window'), media=new Node('media');media.matches=Boolean(options.standalone);
  win.matchMedia=query=>{queries.push(query);if(query==='(display-mode: standalone)')return media;return {matches:Boolean(options.fullscreen),addEventListener(){}};};
  win.isSecureContext=true;
  const nav={userAgent:'Mozilla/5.0 Chrome/130.0',platform:'Linux',maxTouchPoints:0,standalone:options.iosStandalone,clipboard:{writeText:async value=>copied.push(value)}};
  vm.runInNewContext(source,{window:win,document:doc,navigator:nav,URL});
  return {doc,win,media,entries,header,footer,help,ids,queries,copied};
}

const env=boot({fullscreen:true});
assert.equal(env.header.disabled,false,'Browser fullscreen is not an installed app');
assert.deepEqual(env.queries,['(display-mode: standalone)']);
assert.equal(env.ids.has('install-dialog'),false,'No unsolicited installation dialog');
await env.doc.fire('click',{target:env.header});
const dialog=env.ids.get('install-dialog'), native=env.ids.get('install-native');
assert.equal(dialog.open,true);assert.equal(native.hidden,true,'Manual guidance works without a native prompt');
let calls=0, prevented=false, resolveChoice;
const prompt={prompt:async()=>{calls++;},userChoice:new Promise(resolve=>{resolveChoice=resolve;})};
await env.win.fire('beforeinstallprompt',{...prompt,preventDefault(){prevented=true;}});
assert.equal(prevented,true);assert.equal(native.hidden,false);assert.equal(calls,0,'Advertising installation must not invoke the prompt');
const firstClick=native.fire('click');
await native.fire('click');
assert.equal(calls,1,'Double click cannot reuse the native event');
resolveChoice({outcome:'accepted'});await firstClick;
assert.equal(env.header.disabled,false,'Accepted is not installation confirmation');
await native.fire('click');assert.equal(calls,1,'A consumed event stays consumed');
await env.ids.get('install-copy-link').fire('click');
assert.deepEqual(env.copied,['https://example.test/criterios/index.html'],'Shared app link excludes query and diagnosis');
await env.win.fire('appinstalled');
assert(env.entries.every(entry=>entry.disabled),'Confirmation updates both installation entries');
assert.equal(dialog.open,false,'Confirmed installation closes its instructions');
assert(env.entries.every(entry=>entry.label.textContent==='App instalada'));
const standalone=boot({standalone:true});assert(standalone.entries.every(entry=>entry.disabled));
const ios=boot({iosStandalone:true});assert(ios.entries.every(entry=>entry.disabled));
const transitioned=boot();transitioned.media.matches=true;await transitioned.media.fire('change');assert(transitioned.entries.every(entry=>entry.disabled));
for(const app of [env,standalone,ios,transitioned]){
  assert.equal(app.help.disabled,false,'La ayuda permanece disponible cuando la app está instalada.');
  await app.doc.fire('click',{target:app.help});
  const helpDialog=app.ids.get('install-dialog');
  assert.equal(helpDialog.open,true,'Las instrucciones se pueden consultar después de instalar.');
  assert(app.entries.every(entry=>entry.disabled&&entry.label.textContent==='App instalada'),'Consultar la ayuda no reactiva los botones de instalación.');
  const nativeButton=app.ids.get('install-native');assert.equal(nativeButton.hidden,true,'La ayuda instalada no ofrece instalar de nuevo.');
  let unexpectedPrompts=0;
  await app.win.fire('beforeinstallprompt',{prompt:async()=>{unexpectedPrompts++;},preventDefault(){}});
  await nativeButton.fire('click');assert.equal(unexpectedPrompts,0,'La ayuda nunca dispara instalación en un dispositivo ya instalado.');
  const android=helpDialog.children.find(node=>node.dataset.installDevice==='android');
  await helpDialog.fire('click',{target:android});
  assert.equal(android.attrs['aria-pressed'],'true','Puede consultar las instrucciones de otro dispositivo.');
  assert.equal(helpDialog.children.find(node=>node.dataset.installPanel==='android').hidden,false);
  assert(helpDialog.children.filter(node=>'installPanel' in node.dataset&&node.dataset.installPanel!=='android').every(node=>node.hidden));
  await app.ids.get('install-copy-link').fire('click');assert.equal(app.copied.at(-1),'https://example.test/criterios/index.html','La ayuda conserva el enlace general para compartirlo con otra persona.');
  await app.ids.get('install-close').fire('click');assert.equal(helpDialog.open,false);assert.equal(app.doc.activeElement,app.help,'Cerrar devuelve el foco al acceso permanente de ayuda.');
}
const browserHelp=boot();await browserHelp.doc.fire('click',{target:browserHelp.help});assert.equal(browserHelp.ids.get('install-dialog').open,true,'La ayuda también funciona antes de instalar.');
assert(browserHelp.entries.every(entry=>!entry.disabled),'La ayuda no cambia el estado real de instalación.');
console.log(JSON.stringify({ok:true,checks:'PWA prompt lifecycle, installation confirmation, standalone modes, safe share URL and persistent installation help'}));
