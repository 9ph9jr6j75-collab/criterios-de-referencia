import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = (await fs.readFile(new URL('../share-card.js', import.meta.url), 'utf8')).replace(/export function /g, 'function ') + '\nglobalThis.api={shareCard,canonicalCardURL};';
const settle = () => new Promise(resolve => setImmediate(resolve));
function boot(options = {}) {
  const cfg = { supported: true, ...options }, nodes = new Map(), shares = [], copies = [], messages = [], navigations = [];
  let activation = false, execCopies = 0, focused;
  function element(tag = 'button', id = '') {
    const node = { tagName: tag.toUpperCase(), id, hidden: false, disabled: false, isConnected: false, value: '', textContent: '', events: new Map(), attributes: {},
      addEventListener(type, callback) { this.events.set(type, callback); },
      setAttribute(name, value) { this.attributes[name] = value; if (name === 'open') this.open = true; },
      removeAttribute(name) { delete this.attributes[name]; if (name === 'open') this.open = false; },
      focus() { focused = this; this.focused = true; }, select() { this.selected = true; },
      showModal() { this.open = true; }, close() { this.open = false; this.events.get('close')?.(); },
      set innerHTML(html) { this.html = html; for (const match of html.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) { const child = element(match[1], match[2]); child.isConnected = true; for (const attr of ['target', 'rel']) { const value = new RegExp('\\b' + attr + '="([^"]*)"').exec(match[0]); if (value) child[attr] = value[1]; } nodes.set(child.id, child); } },
      get innerHTML() { return this.html; }
    };
    return node;
  }
  const append = node => { node.isConnected = true; nodes.set(node.id, node); };
  const doc = { baseURI: cfg.base || 'https://app.test/referencias/index.html?antiguo=1#ficha/otra', getElementById: id => nodes.get(id), createElement: tag => element(tag), body: { append }, head: { append },
    execCommand(command) { assert.equal(command, 'copy'); execCopies++; return cfg.execCopy !== false; }, get activeElement() { return focused; } };
  const navigator = {};
  if (cfg.supported) navigator.share = payload => { shares.push({ payload, activation }); return cfg.shareResult?.() || Promise.resolve(); };
  if (cfg.canShare !== 'absent') navigator.canShare = payload => cfg.canShare === false ? false : Boolean(payload.url);
  if (cfg.clipboard !== 'absent') navigator.clipboard = { writeText(value) { copies.push({ value, activation }); return cfg.clipboard === 'denied' ? Promise.reject(Error('denegado')) : Promise.resolve(); } };
  const context = { document: doc, navigator, location: { get href() { return doc.baseURI; }, set href(value) { navigations.push(value); } }, window: { open(value) { navigations.push(value); } }, URL, Promise };
  vm.runInNewContext(source, context, { filename: 'share-card.js' });
  const trigger = element(); trigger.isConnected = true;
  function call(extra = {}) {
    activation = true;
    try { return context.api.shareCard({ card: { id: 'n19-adenoma-colorrectal-o-polipos-colonoscopia', name: 'Adenoma colorrectal o pólipos', specialty: 'Gastroenterología' }, title: 'Adenoma colorrectal o pólipos resecados', url: 'https://app.test/referencias/?screen=print&id=n19-adenoma&token=no-compartir#otra', button: trigger, onStatus: value => messages.push(value), ...extra }); }
    finally { activation = false; }
  }
  function click(id) { const node = nodes.get(id); assert(node, id); if (node.hidden || node.disabled) return; activation = true; try { return node.events.get('click')?.({ preventDefault() {} }); } finally { activation = false; } }
  return { cfg, api: context.api, doc, nodes, shares, copies, messages, navigations, trigger, call, click, element, node: id => nodes.get(id), execCopies: () => execCopies };
}

let checks = 0;
async function check(name, run) { await run(); checks++; console.log('✓ ' + name); }

await check('Compartir invoca el menú dentro del toque y entrega solo la ficha canónica', async () => {
  const app = boot(), result = app.call();
  assert.equal(app.shares.length, 1); assert.equal(app.shares[0].activation, true);
  const payload = JSON.parse(JSON.stringify(app.shares[0].payload));
  assert.deepEqual(payload, { title: 'Adenoma colorrectal o pólipos resecados', text: 'Criterios de referencia · Gastroenterología', url: 'https://app.test/referencias/#ficha/n19-adenoma-colorrectal-o-polipos-colonoscopia' });
  assert.equal(app.trigger.disabled, true); assert.equal(app.copies.length, 0); assert.equal(app.nodes.size, 0);
  assert.equal((await result).status, 'shared'); assert.equal(app.trigger.disabled, false); assert.equal(app.trigger.attributes['aria-busy'], undefined);
});

await check('Cancelar compartir conserva la ficha, no copia el enlace y permite reintentar', async () => {
  let reject;
  const app = boot({ shareResult: () => new Promise((resolve, no) => { reject = no; }) }), first = app.call();
  const duplicate = app.call(); assert.equal(first, duplicate); assert.equal(app.shares.length, 1);
  reject(Object.assign(Error('cancelado'), { name: 'AbortError' })); assert.equal((await first).status, 'cancelled');
  assert.equal(app.trigger.disabled, false); assert.equal(app.copies.length, 0); assert.equal(app.nodes.size, 0);
  app.cfg.shareResult = () => Promise.resolve(); await app.call(); assert.equal(app.shares.length, 2);
});

await check('Sin Web Share ofrece copiar de forma explícita y cerrar devuelve el foco', async () => {
  const app = boot({ supported: false }); assert.equal((await app.call()).status, 'fallback');
  assert.equal(app.shares.length, 0); assert.equal(app.copies.length, 0); assert.equal(app.execCopies(), 0);
  assert.equal(app.node('share-card-dialog').open, true); assert.equal(app.node('share-card-native').hidden, true);
  assert.equal(app.node('share-card-url').value, 'https://app.test/referencias/#ficha/n19-adenoma-colorrectal-o-polipos-colonoscopia');
  await app.click('share-card-copy'); assert.equal(app.copies.length, 1); assert.equal(app.copies[0].activation, true);
  assert.match(app.node('share-card-status').textContent, /Enlace copiado/);
  app.click('share-card-close'); assert.equal(app.node('share-card-dialog').open, false); assert.equal(app.trigger.focused, true);
});

await check('El escritorio ofrece correo y WhatsApp con el enlace público y sin abrir ni enviar automáticamente', async () => {
  const app = boot({ supported: false }); await app.call();
  const expectedName = 'Adenoma colorrectal o pólipos resecados';
  const expectedURL = 'https://app.test/referencias/#ficha/n19-adenoma-colorrectal-o-polipos-colonoscopia';
  const email = app.node('share-card-email'), whatsapp = app.node('share-card-whatsapp');
  assert.equal(email.tagName, 'A'); assert.equal(whatsapp.tagName, 'A');
  const mailURL = new URL(email.href); assert.equal(mailURL.protocol, 'mailto:'); assert.equal(mailURL.pathname, '');
  assert.equal(mailURL.searchParams.get('subject'), 'Criterios de referencia: ' + expectedName);
  assert.equal(mailURL.searchParams.get('body'), expectedName + '\n' + expectedURL);
  const waURL = new URL(whatsapp.href); assert.equal(waURL.origin, 'https://wa.me'); assert.equal(waURL.pathname, '/');
  assert.equal(waURL.searchParams.get('text'), expectedName + '\n' + expectedURL);
  assert.equal(whatsapp.target, '_blank'); assert.equal(whatsapp.rel, 'noopener noreferrer');
  assert.equal(mailURL.searchParams.get('body').includes('screen='), false); assert.equal(waURL.searchParams.get('text').includes('token='), false);
  assert.equal(app.copies.length, 0); assert.equal(app.shares.length, 0); assert.deepEqual(app.navigations, []);
});

await check('Un error del menú ofrece reintento nativo sin copiar automáticamente', async () => {
  const app = boot({ shareResult: () => Promise.reject(Object.assign(Error('no permitido'), { name: 'NotAllowedError' })) });
  assert.equal((await app.call()).status, 'fallback'); assert.equal(app.trigger.disabled, false); assert.equal(app.copies.length, 0);
  assert.equal(app.node('share-card-native').hidden, false); assert.match(app.node('share-card-help').textContent, /No se pudo/);
  app.cfg.shareResult = () => Promise.resolve(); const again = app.click('share-card-native');
  assert.equal(app.shares.length, 2); assert.equal(app.shares[1].activation, true); await again; await settle();
  assert.equal(app.node('share-card-dialog').open, false); assert.equal(app.copies.length, 0);
});

await check('Errores síncronos y canShare denegado ofrecen un enlace usable', async () => {
  for (const cfg of [{ shareResult() { throw Object.assign(Error('permiso'), { name: 'NotAllowedError' }); } }, { canShare: false }]) {
    const app = boot(cfg); assert.equal((await app.call()).status, 'fallback'); assert.equal(app.node('share-card-dialog').open, true); assert.equal(app.trigger.disabled, false); assert.equal(app.copies.length, 0);
  }
  const legacy = boot({ canShare: 'absent' }); assert.equal((await legacy.call()).status, 'shared'); assert.equal(legacy.shares[0].activation, true);
});

await check('Copiar usa el gesto explícito y si se deniega permite seleccionar el enlace', async () => {
  const denied = boot({ supported: false, clipboard: 'denied' }); await denied.call(); assert.equal(denied.copies.length, 0);
  await denied.click('share-card-copy'); assert.equal(denied.node('share-card-url').selected, true); assert.equal(denied.node('share-card-url').focused, true); assert.match(denied.node('share-card-status').textContent, /copiarlo manualmente/); assert.equal(denied.node('share-card-copy').disabled, false);
  const legacy = boot({ supported: false, clipboard: 'absent' }); await legacy.call(); assert.equal(legacy.execCopies(), 0); await legacy.click('share-card-copy'); assert.equal(legacy.execCopies(), 1); assert.equal(legacy.node('share-card-url').selected, true);
});

await check('Escape cierra, el diálogo atrapa el foco y los errores del estado no bloquean compartir', async () => {
  const app = boot({ supported: false }); await app.call();
  app.node('share-card-close').focus(); let prevented = false;
  app.node('share-card-dialog').events.get('keydown')({ key: 'Tab', preventDefault() { prevented = true; } }); assert.equal(prevented, true); assert.equal(app.doc.activeElement, app.node('share-card-url'));
  app.node('share-card-dialog').events.get('keydown')({ key: 'Escape', preventDefault() {} }); assert.equal(app.node('share-card-dialog').open, false); assert.equal(app.trigger.focused, true);
  const native = boot(); assert.equal((await native.call({ onStatus() { throw Error('mensaje'); } })).status, 'shared');
});

await check('La ficha es necesaria y el enlace nunca comparte otro origen ni parámetros de la app', async () => {
  const app = boot(); assert.equal((await app.call({ card: {} })).status, 'invalid'); assert.equal((await app.call({ url: 'https://ajeno.test/' })).status, 'invalid'); assert.equal((await app.call({ url: 'javascript:alert(1)' })).status, 'invalid'); assert.equal(app.shares.length, 0); assert.equal(app.nodes.size, 0);
  assert.equal(app.api.canonicalCardURL({ id: 'identificador con /' }, 'https://app.test/referencias/index.html?screen=source&source=N19'), 'https://app.test/referencias/#ficha/identificador%20con%20%2F');
});

console.log(JSON.stringify({ ok: true, checks }));
