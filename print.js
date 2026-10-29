import { APP_RELEASE } from './release.js';
import { isCatalogCard, generalRequirementsForCard, specificRequirementsForCard } from './catalog.js';
import { createTextPdf } from './printable-pdf.js';

const STORE = 'referencias-dipssha-v1';
const arr = value => Array.isArray(value) ? value.filter(item => item !== null && item !== undefined) : value ? [value] : [];
const textOf = value => value && typeof value === 'object' ? String(value.text ?? value.label ?? '') : String(value ?? '');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pageLabel = card => arr(card.pages).length ? `${arr(card.pages).length === 1 ? 'Página' : 'Páginas'} ${arr(card.pages).join(', ')}` : 'Sección sin página identificada';

export function requirementLabel(type) {
  return type === 'required' ? 'Obligatorio en la fuente' : type === 'desirable' ? 'Deseable según la fuente' : type === 'conditional' ? 'Según el caso o la condición descrita' : 'Indicado en la fuente';
}

export function generalRequirements(card, cards) {
  return generalRequirementsForCard(card, cards);
}

export function checklistEntries(card, checked = []) {
  const checkedIds = new Set(arr(checked));
  return arr(card.checklist).map((entry, index) => {
    const item = typeof entry === 'string' ? { text: entry } : entry;
    const id = item.id || `c${index + 1}`;
    return { id, text: textOf(item), requirement: item.requirement || item.type || 'source', reviewed: checkedIds.has(id) || arr(item.legacyIds).some(oldId => checkedIds.has(oldId)) };
  }).filter(item => item.text);
}

export function updateLabel(release) {
  const date = new Date(release?.updatedAt);
  return Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : 'Fecha no disponible';
}

function list(items) {
  return `<ul class="requirement-list">${arr(items).map(item => {
    const type = item && typeof item === 'object' ? item.requirement || item.type : '';
    return `<li>${esc(textOf(item))}${type ? `<span class="requirement-label">${esc(requirementLabel(type))}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

function section(title, items) { return arr(items).length ? `<h3>${esc(title)}</h3>${list(items)}` : ''; }

function statusNotes(source, card, shownApplicability) {
  const notices = [];
  const addApplicability=(value,label)=>{
    if(!value)return;
    const key=source.id+'\u0000'+String(value).normalize('NFC').replace(/\s+/g,' ').trim();
    if(shownApplicability.has(key))return;
    shownApplicability.add(key);notices.push(`<strong>${label}</strong> ${esc(value)}`);
  };
  addApplicability(card.applicability,'Aplicabilidad.');
  addApplicability(source.applicability,'Aplicabilidad del documento.');
  if (source.documentStatus === 'review') notices.push(`<strong>Verificación documental pendiente.</strong> ${esc(source.estado || 'Confirme la versión actual del documento antes de aplicar los criterios.')}`);
  if (source.documentStatus === 'unverified') notices.push('<strong>Procedencia por documentar.</strong> El establecimiento o el acto de aprobación no están identificados en la copia disponible. Este documento requiere validación para su uso en la red.');
  if (card.requiresReview || arr(card.documentIssues).length) notices.push(`<strong>Discrepancia en el documento de origen.</strong> ${esc(arr(card.documentIssues).map(textOf).join(' ') || 'Revise las condiciones y la página original antes de definir el destino o los requisitos.')}`);
  if (arr(source.documentIssues).length) notices.push(`<strong>Precisiones del documento de origen.</strong> ${list(source.documentIssues)}`);
  return notices.map(notice => `<div class="notice">${notice}</div>`).join('');
}

function reviewList(card, checked) {
  const entries = checklistEntries(card, checked), reviewed = entries.filter(entry => entry.reviewed).length;
  return `<section class="review-section"><h3>Revisión de los requisitos · ${esc(card.sourceId)}</h3>${entries.length ? `<p class="checklist-note">${reviewed} de ${entries.length} elementos marcados como revisados en esta sesión.</p><ul class="checklist">${entries.map(entry => `<li><strong class="review-state${entry.reviewed ? ' reviewed' : ''}">${entry.reviewed ? 'Revisado' : 'Por revisar'}</strong><span>${esc(entry.text)}<span class="requirement-label">${esc(requirementLabel(entry.requirement))}</span></span></li>`).join('')}</ul>` : '<p>No hay requisitos separados para marcar en esta ficha. Revise el texto de la fuente.</p>'}<p class="checklist-note">Las marcas indican revisión; no certifican pertinencia clínica ni que todos los elementos sean aplicables al caso. La app no recibe datos de pacientes.</p></section>`;
}

function clinicalContent(card, source, checked, heading = '', shownApplicability = new Set()) {
  return `${heading ? `<h3>${esc(heading)}</h3><p class="checklist-note">${esc(pageLabel(card))} · Fuente ${esc(card.sourceId)}</p>` : ''}${statusNotes(source, card, shownApplicability)}${card.context ? `<p>${esc(card.context)}</p>` : ''}${card.direction ? `<p class="checklist-note"><strong>Ruta declarada:</strong> ${esc(card.direction)}</p>` : ''}${card.priority ? `<div class="notice"><strong>Prioridad y destino según la fuente</strong><p>${esc(card.priority)}</p></div>` : ''}${card.route ? `<h3>Destino indicado en la fuente</h3><p>${esc(card.route)}</p>` : ''}${section(card.category==='general'?'Requisitos generales':card.direction==='II-I'?'Condiciones de retorno al primer nivel':'Criterios para referir', card.criteria)}${section('Antes de referir', card.prior)}${section('Estudios y valoraciones previas', card.studies)}${card.studiesNote ? `<p>${esc(card.studiesNote)}</p>` : ''}${section('Observaciones de la fuente', card.notes)}${section('Precisiones documentales', card.flags)}${reviewList(card, checked)}<h3>Texto documental completo</h3><p class="checklist-note">Transcripción de la sección de respaldo. Consulte la página original para verificar tablas, notas al pie y disposición del documento.</p><pre class="document-text">${esc(card.fullText || [...arr(card.criteria), ...arr(card.prior), ...arr(card.studies), ...arr(card.notes)].map(textOf).join('\n\n') || 'Sin transcripción disponible. Consulte el documento original.')}</pre>`;
}

function metadataRow(label, value) { return `<dt>${esc(label)}</dt><dd>${esc(value || 'No identificado en la copia')}</dd>`; }
function safeUrl(value) { try { const url = new URL(value, 'https://print.invalid/'); return /^https?:$/.test(url.protocol) ? esc(value) : ''; } catch { return ''; } }

export function buildPrintDocument({ card, cards, sources, topics, checkedByCard = {}, release = APP_RELEASE }) {
  if(!isCatalogCard(card))throw new Error('Este apartado no establece criterios de referencia. Vuelva a la ficha para consultar los criterios documentados y la fuente original.');
  const source = sources.find(item => item.id === card.sourceId);
  if (!source) throw new Error('No se encontró la fuente que respalda esta ficha.');
  const groups = Array.isArray(topics) ? topics : topics?.groups || [];
  const topic = groups.find(group => arr(group.cardIds).includes(card.id));
  const title = topic?.name || card.name;
  const variant = topic?.variantLabels?.[card.id] || card.name;
  const general = generalRequirements(card, cards), shownApplicability = new Set();
  const originalUrl = safeUrl(source.enlace);
  return `<header class="document-heading"><p class="app-name">Criterios de referencia · DRIPSSHA</p><p class="specialty">${esc(card.specialty)}</p><h1>${esc(title)}</h1>${variant !== title ? `<p class="variant-name">Documento y variante consultada: ${esc(variant)}</p>` : ''}${card.name !== variant && card.name !== title ? `<p>${esc(card.name)}</p>` : ''}<p class="updated">Actualización de la app: ${esc(updateLabel(release))} · hora de Costa Rica</p></header><section aria-labelledby="source-title"><h2 id="source-title">Documento que respalda esta ficha</h2><dl class="metadata">${metadataRow('Fuente', `${source.id} · ${source.titulo}`)}${metadataRow('Alcance', source.alcance || card.scope)}${card.scope && card.scope !== source.alcance ? metadataRow('Alcance de la ficha', card.scope) : ''}${metadataRow('Código', source.codigo)}${metadataRow('Páginas de la ficha', pageLabel(card))}${metadataRow('Fecha del documento', source.fecha)}${metadataRow('Vigencia declarada', source.vigencia)}${metadataRow('Estado documental', source.estado)}${source.limites ? metadataRow('Procedencia y límites', source.limites) : ''}${source.provenance ? metadataRow('Procedencia de la copia', source.provenance) : ''}${source.approvalNote ? metadataRow('Aprobación documental', source.approvalNote) : ''}${source.derivativeNotice ? metadataRow('Nota de procedencia', source.derivativeNotice) : ''}</dl>${originalUrl ? `<p class="source-url">Enlace de la fuente: <span>${originalUrl}</span></p>` : ''}<p class="source-url">Identificador de la ficha: ${esc(card.id)}</p></section>${general.length ? `<section aria-labelledby="general-title"><h2 id="general-title">Requisitos generales de ${esc(card.specialty)}</h2><p class="checklist-note">Proceden de la misma fuente ${esc(card.sourceId)} y especialidad. Revise las condiciones que correspondan a la persona valorada.</p>${general.map(item => `<section class="general-group">${clinicalContent(item, source, checkedByCard[item.id], item.name, shownApplicability)}</section>`).join('')}</section>` : ''}<section aria-labelledby="clinical-title"><h2 id="clinical-title">Criterios de la ficha consultada</h2>${clinicalContent(specificRequirementsForCard(card), source, checkedByCard[card.id], '', shownApplicability)}</section><footer class="document-footer"><p><strong>DRIPSSHA · Huetar Atlántica</strong><br>Dirección de Red Integrada de Prestación de Servicios de Salud Huetar Atlántica</p><p>Reportar un error: <a href="mailto:msolanoc@ccss.sa.cr">msolanoc@ccss.sa.cr</a></p><p>Actualización de la app: ${esc(updateLabel(release))} · hora de Costa Rica. Los criterios conservan el alcance y las condiciones del documento indicado.</p></footer>`;
}

function readChecks(id) {
  try { const value = JSON.parse(sessionStorage.getItem(`${STORE}:checks:${id}`) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

async function initialise() {
  const $ = id => document.getElementById(id), id = new URLSearchParams(location.search).get('id') || '';
  let controller,pdfFile,sharing=false;
  const fileSharing=()=>{try{return typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[new File(['%PDF-1.4'],'ficha.pdf',{type:'application/pdf'})]});}catch{return false;}};
  const appleDevice=/iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const installedApple=appleDevice&&(navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches||window.matchMedia?.('(display-mode: fullscreen)').matches);
  const shareStatus=text=>{$('pdf-status').textContent=text;$('pdf-status').hidden=false;};
  $('return-to-card').href = id ? `./#ficha/${encodeURIComponent(id)}` : './';
  // A fresh user gesture invokes printing. Loading never opens a dialog or popup.
  $('print-document').addEventListener('click', () => {
    $('print-help').textContent = 'Si no aparece el menú de impresión, use Preparar ficha en PDF. Después toque Compartir ficha PDF y elija Imprimir o Guardar en Archivos. Puede volver a la ficha en cualquier momento.';
    try { window.print(); } catch { /* El PDF sigue disponible aunque este navegador no permita imprimir. */ }
  });
  $('share-print').addEventListener('click',()=>{
    const button=$('share-print');if(sharing||button.disabled)return;
    if(pdfFile){
      sharing=true;button.disabled=true;
      // El PDF ya está listo: la llamada conserva el gesto de este segundo toque.
      try{Promise.resolve(navigator.share({files:[pdfFile]})).then(()=>shareStatus('Se cerró el menú de compartir. Puede volver a la ficha o compartir el PDF de nuevo.')).catch(error=>shareStatus(error.name==='AbortError'?'Se cerró el menú. El PDF sigue listo para compartir de nuevo.':'No se pudo abrir el menú. Puede reintentar; la ficha sigue disponible.')).finally(()=>{sharing=false;button.disabled=false;});}
      catch{sharing=false;button.disabled=false;shareStatus('No se pudo abrir el menú. Puede reintentar o usar las opciones del navegador.');}
      return;
    }
    button.disabled=true;button.textContent='Preparando ficha…';shareStatus('Preparando el contenido completo de esta ficha y sus marcas de revisión.');
    Promise.resolve().then(()=>{
      const content=$('print-content');if(content.hidden)throw new Error('La ficha aún no está disponible.');
      pdfFile=new File([createTextPdf(content.innerText)],`Criterios-${id.replace(/[^a-zA-Z0-9_-]/g,'-')}.pdf`,{type:'application/pdf'});
      if(!navigator.canShare({files:[pdfFile]})){pdfFile=null;throw new Error('Este dispositivo no permite compartir archivos PDF.');}
      button.textContent='Compartir ficha PDF';shareStatus('PDF listo. Toque Compartir ficha PDF y elija Imprimir o Guardar en Archivos para seleccionar la carpeta.');
    }).catch(error=>{button.textContent='Reintentar preparación del PDF';shareStatus(error.message||'No se pudo preparar el PDF. Vuelva a intentarlo.');}).finally(()=>{button.disabled=false;});
  });
  async function load() {
    controller?.abort();
    controller = new AbortController();
    const current = controller, timer = setTimeout(() => current.abort(), 8000);
    const canShare=fileSharing();
    pdfFile=null;$('share-print').disabled=true;$('share-print').hidden=!canShare;$('share-print').textContent='Preparar ficha en PDF';$('pdf-status').hidden=true;
    $('print-document').hidden=Boolean(installedApple&&canShare);
    $('print-help').textContent=canShare?'Prepare la ficha en PDF y después toque Compartir ficha PDF. Elija Imprimir o Guardar en Archivos. El documento conserva el contenido y las marcas de revisión; la app permanece abierta para volver a la ficha.':installedApple?'Este dispositivo no ofrece compartir archivos PDF desde la app. Para imprimir, abra la ficha en Safari y use sus opciones de impresión. Puede volver a la ficha sin perder su revisión.':'Use Imprimir con el navegador para elegir una impresora o guardar esta ficha como PDF.';
    $('print-document').disabled = true; $('print-content').hidden = true; $('print-help').hidden = true; $('load-error').hidden = true; $('load-status').hidden = false;
    try {
      if (!id) throw new Error('No se indicó una ficha. Vuelva a la app y seleccione Imprimir ficha.');
      const [cards, sources, topics] = await Promise.all(['cards', 'sources', 'topics'].map(async name => {
        const response = await fetch(`data/${name}.json`, { signal: current.signal });
        if (!response.ok) throw new Error('No se pudieron cargar los documentos de la ficha. Compruebe la conexión.');
        return response.json();
      }));
      if (current !== controller) return;
      const card = cards.find(item => item.id === id);
      if (!card) throw new Error('Esta ficha no se encontró. Vuelva a la app y seleccione una ficha disponible.');
      const relevant = [card, ...generalRequirements(card, cards)], checkedByCard = Object.fromEntries(relevant.map(item => [item.id, readChecks(item.id)]));
      $('print-content').innerHTML = buildPrintDocument({ card, cards, sources, topics, checkedByCard });
      document.title = `${card.name} · Imprimir · Criterios de referencia`;
      $('print-content').hidden = false; $('print-help').hidden = false; $('print-document').disabled = false;$('share-print').disabled=false;
    } catch (error) {
      if (current !== controller) return;
      $('error-message').textContent = error.name === 'AbortError' ? 'La carga tardó demasiado. Compruebe la conexión y vuelva a intentarlo.' : error.message || 'Compruebe la conexión y vuelva a intentarlo.';
      $('load-error').hidden = false;
    } finally { clearTimeout(timer); if (current === controller) $('load-status').hidden = true; }
  }
  $('retry').addEventListener('click', load);
  await load();
}

let printRoot, printInitialisation;
export function initialisePrintDocument() {
  const root = typeof document !== 'undefined' && document.getElementById('print-document');
  if (!root) return Promise.resolve();
  if (root !== printRoot) {
    printRoot = root;
    printInitialisation = initialise();
  }
  return printInitialisation;
}
export const printReady = initialisePrintDocument();
