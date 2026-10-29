/* Compartir el enlace de una ficha no envía información de pacientes. */
let dialog, fallbackContext, lastTrigger, nativePending;

function announce(callback, message) {
  try { callback?.(message); } catch { /* El estado del mensaje no bloquea compartir. */ }
}

export function canonicalCardURL(card, value) {
  if (!card?.id) throw new Error('No se indicó la ficha que desea compartir.');
  const base = document.baseURI || location.href;
  const requested = new URL(value || base, base);
  if (!/^https?:$/.test(requested.protocol) || requested.origin !== new URL(base).origin) throw new Error('El enlace de la ficha no pertenece a esta app.');
  const canonical = new URL('./', requested);
  canonical.search = '';
  canonical.hash = 'ficha/' + encodeURIComponent(card.id);
  return canonical.href;
}

function canUseNative(payload) {
  try {
    return typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(payload));
  } catch { return false; }
}

function releaseDialog() {
  fallbackContext = null;
  const target = lastTrigger;
  lastTrigger = null;
  if (target?.isConnected !== false && !target?.disabled) target?.focus?.({ preventScroll: true });
}

function closeDialog() {
  if (!dialog?.open) return;
  if (typeof dialog.close === 'function') dialog.close();
  else { dialog.removeAttribute('open'); releaseDialog(); }
}

function buildDialog() {
  if (dialog?.isConnected) return;
  if (!document.getElementById('share-card-styles')) {
    const style = document.createElement('style');
    style.id = 'share-card-styles';
    style.textContent = '.share-card-dialog{font:16px/1.6 system-ui,-apple-system,sans-serif;color:#244e6c;background:#fff;border:1px solid #c8dce9;border-radius:16px;width:min(540px,calc(100% - 28px));max-height:calc(100dvh - 40px);overflow:auto;padding:24px;box-shadow:0 18px 70px #10283b40}.share-card-dialog::backdrop{background:#18374e66}.share-card-dialog h2{font-size:23px;line-height:1.3;margin:0 0 14px}.share-card-dialog label{display:block;font-weight:650;margin:15px 0 6px}.share-card-dialog input{box-sizing:border-box;width:100%;font:inherit;min-height:46px;padding:10px;border:1px solid #8cacc5;border-radius:8px;color:#244e6c;background:#f5f8fc}.share-card-dialog p{overflow-wrap:anywhere;margin:0 0 14px}.share-card-dialog .share-card-buttons{display:flex;flex-wrap:wrap;gap:10px;margin-top:17px}.share-card-dialog button,.share-card-dialog .share-card-buttons a{box-sizing:border-box;display:inline-flex;align-items:center;font:inherit;min-height:44px;padding:10px 15px;background:#285d83;color:white;border:1px solid #285d83;border-radius:8px;cursor:pointer;touch-action:manipulation;text-decoration:none}.share-card-dialog #share-card-close{background:#eef4f9;color:#245477;border-color:#c8dce9}.share-card-dialog button:disabled{opacity:.55}.share-card-dialog :focus-visible{outline:3px solid #66a6d4;outline-offset:3px}.share-card-dialog [hidden]{display:none!important}.share-card-dialog #share-card-status{font-size:14px;margin-top:15px}@media print{.share-card-dialog{display:none!important}}';
    document.head.append(style);
  }
  dialog = document.createElement('dialog');
  dialog.id = 'share-card-dialog';
  dialog.className = 'share-card-dialog';
  dialog.setAttribute('aria-labelledby', 'share-card-title');
  dialog.setAttribute('aria-describedby', 'share-card-help');
  dialog.innerHTML = '<h2 id="share-card-title">Compartir ficha</h2><p id="share-card-help"></p><label for="share-card-url">Enlace de la ficha</label><input id="share-card-url" type="text" readonly spellcheck="false"><div class="share-card-buttons"><button id="share-card-native" type="button">Abrir menú de compartir</button><a id="share-card-email">Compartir por correo</a><a id="share-card-whatsapp" target="_blank" rel="noopener noreferrer">Compartir por WhatsApp</a><button id="share-card-copy" type="button">Copiar enlace</button><button id="share-card-close" type="button">Volver a la ficha</button></div><p id="share-card-status" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const node = id => document.getElementById(id);
  node('share-card-close').addEventListener('click', closeDialog);
  node('share-card-native').addEventListener('click', () => {
    if (fallbackContext) invokeNative(fallbackContext, node('share-card-native'));
  });
  node('share-card-copy').addEventListener('click', async () => {
    if (!fallbackContext) return;
    const current = fallbackContext, button = node('share-card-copy');
    button.disabled = true;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(current.payload.url);
      else {
        node('share-card-url').focus(); node('share-card-url').select();
        if (!document.execCommand?.('copy')) throw new Error('clipboard');
      }
      if (fallbackContext !== current) return;
      node('share-card-status').textContent = 'Enlace copiado. Puede pegarlo en la aplicación que elija.';
      announce(current.onStatus, 'Enlace de la ficha copiado.');
    } catch {
      if (fallbackContext !== current) return;
      node('share-card-url').focus(); node('share-card-url').select();
      node('share-card-status').textContent = 'El navegador no permitió copiar. El enlace está seleccionado para que pueda copiarlo manualmente.';
    } finally { if (fallbackContext === current) button.disabled = false; }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('close', releaseDialog);
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
    if (event.key !== 'Tab') return;
    const available = [node('share-card-url'), node('share-card-native'), node('share-card-email'), node('share-card-whatsapp'), node('share-card-copy'), node('share-card-close')].filter(element => !element.hidden && !element.disabled);
    const first = available[0], last = available.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

function showFallback(context, failed = false) {
  if (context.button?.isConnected === false) return;
  buildDialog();
  fallbackContext = context;
  lastTrigger = context.button;
  const node = id => document.getElementById(id);
  node('share-card-url').value = context.payload.url;
  const message = context.payload.title + '\n' + context.payload.url;
  node('share-card-email').href = 'mailto:?subject=' + encodeURIComponent('Criterios de referencia: ' + context.payload.title) + '&body=' + encodeURIComponent(message);
  node('share-card-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(message);
  node('share-card-status').textContent = '';
  node('share-card-copy').disabled = false;
  node('share-card-native').disabled = false;
  node('share-card-native').hidden = !canUseNative(context.payload);
  node('share-card-help').textContent = failed ? 'No se pudo abrir el menú del dispositivo. Puede reintentarlo o elegir una opción para compartir el enlace.' : 'El menú del dispositivo no está disponible en este navegador. Elija una opción para compartir el enlace.';
  if (!dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); }
  }
  node('share-card-close').focus();
}

function invokeNative(context, button = context.button) {
  if (nativePending) return nativePending;
  const previousDisabled = button?.disabled === true;
  if (button) { button.disabled = true; button.setAttribute?.('aria-busy', 'true'); }
  const reset = () => { if (button) { button.disabled = previousDisabled; button.removeAttribute?.('aria-busy'); } };
  let result;
  try {
    // La llamada sucede dentro del toque, sin copiar, descargar ni esperar datos.
    result = navigator.share(context.payload);
  } catch (error) {
    reset();
    if (error?.name === 'AbortError') { announce(context.onStatus, 'Se cerró el menú de compartir.'); return Promise.resolve({ status: 'cancelled' }); }
    showFallback(context, true);
    return Promise.resolve({ status: 'fallback' });
  }
  nativePending = Promise.resolve(result).then(() => {
    closeDialog();
    announce(context.onStatus, 'Se cerró el menú de compartir.');
    return { status: 'shared' };
  }).catch(error => {
    if (error?.name === 'AbortError') {
      announce(context.onStatus, 'Se cerró el menú de compartir.');
      return { status: 'cancelled' };
    }
    showFallback(context, true);
    return { status: 'fallback' };
  }).finally(() => { nativePending = null; reset(); });
  return nativePending;
}

export function shareCard({ card, title, url, button, onStatus } = {}) {
  if (nativePending) return nativePending;
  let address;
  try { address = canonicalCardURL(card, url); }
  catch (error) { announce(onStatus, error.message); return Promise.resolve({ status: 'invalid' }); }
  const name = title || card.name || 'Ficha de criterios de referencia';
  const payload = { title: name, text: 'Criterios de referencia' + (card.specialty ? ' · ' + card.specialty : ''), url: address };
  const context = { payload, button, onStatus };
  if (!canUseNative(payload)) { showFallback(context); return Promise.resolve({ status: 'fallback' }); }
  return invokeNative(context);
}
