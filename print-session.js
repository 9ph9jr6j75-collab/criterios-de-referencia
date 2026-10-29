import { buildPrintDocument } from './print.js';
import { createTextPdf } from './printable-pdf.js';

// Se prepara una copia para imprimir. La ficha visible conserva sus nodos,
// posición y revisión; nunca se navega a otra página para imprimirla.
let active;
const appleDevice = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches;
const blockTags = new Set(['P','DIV','SECTION','HEADER','FOOTER','H1','H2','H3','H4','UL','OL','DL']);

// textContent loses the boundaries between adjacent paragraphs. innerText on a
// screen-hidden article is also unreliable. Walk the document without layout.
export function printDocumentText(root) {
  function read(node) {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1 && node.nodeType !== 11) return '';
    const tag = node.tagName || '';
    if (tag === 'SCRIPT' || tag === 'STYLE') return '';
    if (tag === 'BR') return '\n';
    if (tag === 'PRE') return '\n\n' + node.textContent + '\n\n';
    const value = [...node.childNodes].map(read).join('');
    if (tag === 'LI') return '\n• ' + value.trim() + '\n';
    if (tag === 'DT') return '\n' + value.trim() + ': ';
    if (tag === 'DD') return value.trim() + '\n';
    if (node.classList?.contains('requirement-label')) return '\n' + value + '\n';
    if (tag === 'STRONG') return value + ' ';
    return blockTags.has(tag) ? '\n\n' + value + '\n\n' : value;
  }
  return read(root).replace(/[^\S\n]+\n/g, '\n').replace(/\n[^\S\n]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function tell(session, text) { try { session.options.onStatus?.(text); } catch { /* El aviso no bloquea la acción. */ } }
function busy(session, value) {
  if (!session.options.button) return;
  session.options.button.disabled = value;
  if (value) session.options.button.setAttribute('aria-busy', 'true');
  else session.options.button.removeAttribute('aria-busy');
}
function clean(session, focus = false) {
  if (!session || session.closed) return;
  session.closed = true;
  window.removeEventListener('afterprint', session.afterPrint);
  window.removeEventListener('hashchange', session.leave);
  window.removeEventListener('pagehide', session.leave);
  session.media?.removeEventListener?.('change', session.mediaChange);
  session.media?.removeListener?.(session.mediaChange);
  session.article?.remove();
  session.dialog?.remove();
  document.documentElement.removeAttribute('data-reference-print');
  busy(session, false);
  if (focus) session.options.button?.focus?.({ preventScroll: true });
  if (active === session) active = undefined;
}

function canShare(file) {
  try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); }
  catch { return false; }
}

function fallback(session, message) {
  if (session.closed) return { status: 'closed' };
  busy(session, false);
  tell(session, message);
  if (!session.dialog) {
    const dialog = document.createElement('dialog');
    dialog.id = 'print-session-dialog';
    dialog.className = 'print-session-dialog';
    dialog.setAttribute('aria-labelledby', 'print-session-title');
    dialog.innerHTML = '<h2 id="print-session-title">Imprimir ficha</h2><p id="print-session-message" role="status"></p><div class="print-session-actions"><button id="print-session-retry" type="button">Reintentar impresión</button><button id="print-session-close" type="button">Volver a la ficha</button></div>';
    document.body.append(dialog);
    session.dialog = dialog;
    const close = () => { clean(session, true); };
    dialog.querySelector('#print-session-close').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', close);
    dialog.querySelector('#print-session-retry').addEventListener('click', () => {
      if (session.sharing || session.closed) return;
      if (session.file && canShare(session.file)) return share(session);
      return nativePrint(session);
    });
  }
  session.dialog.querySelector('#print-session-message').textContent = message;
  const retry = session.dialog.querySelector('#print-session-retry');
  retry.hidden = session.unsupported;
  retry.textContent = session.file ? 'Abrir opciones del PDF de la ficha' : 'Reintentar impresión';
  if (!session.dialog.open) {
    if (typeof session.dialog.showModal === 'function') session.dialog.showModal();
    else session.dialog.setAttribute('open', '');
  }
  session.dialog.querySelector('#print-session-close').focus({ preventScroll: true });
  return { status: 'fallback' };
}

function share(session) {
  if (session.sharing || session.closed) return session.pending;
  session.sharing = true;
  busy(session, true);
  // Deliberadamente antes de cualquier await: es el mismo toque del botón.
  let result;
  try { result = navigator.share({ files: [session.file] }); }
  catch (error) { result = Promise.reject(error); }
  session.pending = Promise.resolve(result).then(() => {
    clean(session, true);
    tell(session, 'Se cerraron las opciones de la ficha. La revisión permanece abierta.');
    return { status: 'shared' };
  }, error => {
    if (session.closed) return { status: 'closed' };
    if (error?.name === 'AbortError') {
      clean(session, true);
      return { status: 'cancelled' };
    }
    return fallback(session, 'No se pudo abrir el menú del dispositivo. Puede reintentar o volver a la ficha; su revisión se conserva.');
  }).finally(() => { session.sharing = false; busy(session, false); });
  return session.pending;
}

function nativePrint(session) {
  if (session.closed) return { status: 'closed' };
  try {
    if (typeof window.print !== 'function') throw new Error('print unavailable');
    // Retain the article until afterprint / print-media exit. Safari can return
    // from print() before its native preview has finished reading the page.
    window.print();
    return { status: 'printing' };
  } catch {
    return fallback(session, 'El navegador no pudo abrir la impresión. Reintente desde aquí o use Imprimir en las opciones del navegador. La ficha permanece abierta.');
  }
}

export function printCard(options) {
  if (active?.sharing) return active.pending;
  clean(active);
  const session = { options, closed: false, sharing: false };
  active = session;
  try {
    // This throws for an unavailable/withheld card before any native action.
    const html = buildPrintDocument(options);
    const article = document.createElement('article');
    article.id = 'reference-print-content';
    article.setAttribute('aria-hidden', 'true');
    article.innerHTML = html;
    session.article = article;
    document.body.append(article);
    document.documentElement.setAttribute('data-reference-print', '');
    session.afterPrint = () => clean(session, true);
    session.leave = () => clean(session);
    session.mediaChange = event => { if (event.matches) session.enteredPrint = true; else if (session.enteredPrint) clean(session, true); };
    window.addEventListener('afterprint', session.afterPrint);
    window.addEventListener('hashchange', session.leave);
    window.addEventListener('pagehide', session.leave);
    session.media = window.matchMedia?.('print');
    if (session.media?.addEventListener) session.media.addEventListener('change', session.mediaChange);
    else session.media?.addListener?.(session.mediaChange);
    if (appleDevice()) {
      session.file = new File([createTextPdf(printDocumentText(article))], `Criterios-${String(options.card.id).replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`, { type: 'application/pdf' });
      if (canShare(session.file)) return share(session);
      session.file = undefined;
      if (installed()) {
        session.unsupported = true;
        return fallback(session, 'Este dispositivo no permite abrir las opciones de un archivo desde la app instalada. Abra la ficha en Safari y use Imprimir en sus opciones. Puede cerrar este aviso sin perder su revisión.');
      }
    }
    return nativePrint(session);
  } catch (error) {
    clean(session, true);
    tell(session, error?.message || 'No se pudo preparar la ficha para imprimir.');
    return { status: 'invalid' };
  }
}
