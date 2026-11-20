// Las marcas se guardan por ficha, ruta, apartado y texto documental.
export const guideStorageKey = id => 'referencias-dipssha-v1:referral-guide:' + id;

export function guideReview(card, saved = {}) {
  const {general = [], routes = [], notice = ''} = card.referralGuide;
  const checked = new Set(Array.isArray(saved?.checked) ? saved.checked : []);
  const route = routes.length === 1 ? routes[0] : routes.find(item => item.name === saved?.route);
  function sections(source, routeName) {
    return source.map(({label, pages, items = [], notes = []}) => ({
      label, pages, notes,
      entries: items.map(text => {
        const key = JSON.stringify([routeName, label, pages, text]);
        return {key, text, checked: checked.has(key)};
      })
    }));
  }
  return {
    notice, general: sections(general, null), specific: sections(route?.sections || [], route?.name),
    routes, routeName: route?.name || '', needsChoice: routes.length > 1 && !route
  };
}

export function guideClinicalCard(card, review) {
  // La orientación operativa sobre estudios corresponde a la ruta que se está leyendo.
  return {...card, criteria: [...review.general, ...review.specific].flatMap(section => [...section.notes, ...section.entries.map(entry => entry.text)]),
    checklist: [], studies: [], prior: [], notes: [], studiesNote: '', fullText: ''};
}

export function pdfPageURL(source, page, base) {
  if (!source.localPdf || !Number.isInteger(page) || page <= 0) return '';
  try {
    const url = new URL(source.localPdf, base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = 'page=' + page;
    return url.href;
  } catch { return ''; }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountReferralGuide(root, {card, source, saved, save, pageLink, guidanceHTML, copyText, referenceTemplate, announce}) {
  const checked = new Set(Array.isArray(saved?.checked) ? saved.checked : []);
  let chosen = saved?.route || '';
  let review;
  const data = () => ({route: chosen, checked: [...checked]});
  const sections = () => [...review.general, ...review.specific];
  root.innerHTML = `<header class="checklist-header"><h2>Revise su referencia</h2><p class="guide-intro"></p></header>
    <div class="guide-notice document-status-note" hidden></div>
    <div class="checklist-progress"><div class="progress-caption" role="status" aria-live="polite"></div></div>
    <div class="guide-edus"></div>
    <div class="checklist-items"><div class="guide-general"></div><fieldset class="guide-routes" hidden><legend>Elija la ruta que corresponde a esta referencia</legend></fieldset><div class="guide-specific"></div></div>
    <div class="checklist-actions no-print">
      <button type="button" class="button button-primary" data-guide-copy>Copiar esquema de referencia</button>
      <button type="button" class="button button-secondary" data-guide-pending>Copiar elementos por revisar</button>
      <p class="checklist-footnote">Las marcas indican qué aspectos revisó en esta sesión. Aplique los criterios según el caso.</p>
      <div class="checklist-reset"><button type="button" data-guide-reset>Desmarcar las casillas visibles</button></div>
    </div>`;
  const find = selector => root.querySelector(selector);
  const choices = find('.guide-routes');
  const pendingButton = find('[data-guide-pending]');
  const reset = find('[data-guide-reset]');
  const copy = find('[data-guide-copy]');

  function renderSection(section) {
    const group = element('section', 'checklist-group');
    group.append(element('h3', 'checklist-group-title', section.label));
    const links = element('div', 'review-page-links');
    links.append(element('span', '', 'Fuente ' + source.id));
    section.pages.forEach(page => {
      const link = element('a', '', 'Pág. ' + page);
      const href = source.pageImageBase ? pageLink(page) : pdfPageURL(source, page, document.baseURI);
      if (!href) return;
      link.href = href;
      link.setAttribute('aria-label', 'Ver página ' + page + ' de la fuente ' + source.id);
      if (source.pageImageBase) link.dataset.sourceAction = 'pages';
      else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      links.append(link);
    });
    group.append(links);
    section.notes.forEach(text => group.append(element('p', 'guide-note', text)));
    if (!section.entries.length && !section.notes.length) group.append(element('p', 'guide-original', 'Consulte este apartado en las páginas originales indicadas.'));
    section.entries.forEach(({key, text, checked: marked}) => {
      const label = element('label', 'checklist-item');
      const input = element('input');
      input.type = 'checkbox';
      input.checked = marked;
      input.addEventListener('change', () => {
        if (input.checked) checked.add(key);
        else checked.delete(key);
        save(data());
        refreshProgress();
      });
      label.append(input, element('span', 'checklist-text', text));
      group.append(label);
    });
    return group;
  }

  function refreshProgress() {
    review = guideReview(card, data());
    const visible = sections();
    const entries = visible.flatMap(section => section.entries);
    const marked = entries.filter(entry => entry.checked).length;
    const status = [];
    if (entries.length) status.push(marked + ' de ' + entries.length + ' casillas revisadas.');
    if (review.needsChoice) status.push('Falta elegir la ruta.');
    if (visible.some(section => !section.entries.length && !section.notes.length)) status.push('Hay apartados de consulta directa en la fuente.');
    find('.progress-caption').textContent = status.join(' ');
    reset.disabled = !marked;
    pendingButton.disabled = !visible.length && !review.needsChoice;
    copy.disabled = review.needsChoice;
  }

  function renderReading() {
    refreshProgress();
    find('.guide-general').replaceChildren(...review.general.map(renderSection));
    const specific = find('.guide-specific');
    specific.replaceChildren();
    if (review.routeName) {
      specific.append(element('h3', 'guide-route-name', review.routeName), ...review.specific.map(renderSection));
    }
    find('.guide-edus').innerHTML = guidanceHTML(guideClinicalCard(card, review));
  }

  renderReading();
  find('.guide-intro').textContent = review.general.length ?
    'Revise primero los apartados generales de la fuente ' + source.id + '.' :
    'Consulte los criterios de la fuente ' + source.id + '.';
  if (review.notice) {
    const notice = find('.guide-notice');
    notice.textContent = review.notice;
    notice.hidden = false;
  }
  if (review.routes.length > 1) {
    choices.hidden = false;
    review.routes.forEach(route => {
      const label = element('label', 'guide-route-option');
      const radio = element('input');
      radio.type = 'radio';
      radio.name = 'guide-route';
      radio.value = route.name;
      radio.checked = route.name === chosen;
      radio.addEventListener('change', () => {
        chosen = route.name;
        save(data());
        renderReading();
      });
      label.append(radio, element('span', '', route.name));
      choices.append(label);
    });
  }

  reset.addEventListener('click', () => {
    sections().forEach(section => section.entries.forEach(entry => checked.delete(entry.key)));
    save(data());
    renderReading();
    announce('Se desmarcaron las casillas visibles.');
  });
  copy.addEventListener('click', () => {
    const lines = [referenceTemplate(guideClinicalCard(card, review))];
    if (review.routeName) lines.push('Ruta consultada: ' + review.routeName);
    if (review.notice) lines.push(review.notice);
    sections().forEach(section => lines.push(section.label + ' · ' + pageCitation(section), ...section.notes));
    copyText(lines.join('\n'), 'Esquema de referencia copiado.');
  });
  function pageCitation(section) {
    return 'Fuente ' + source.id + ', pág. ' + section.pages.join(', ') + '.';
  }
  pendingButton.addEventListener('click', () => {
    const lines = [card.name, source.id + ' · ' + source.titulo];
    if (review.notice) lines.push(review.notice);
    if (review.routeName) lines.push('Ruta consultada: ' + review.routeName);
    if (review.needsChoice) lines.push('Falta elegir la ruta.');
    for (const section of sections()) {
      const pending = section.entries.filter(item => !item.checked);
      if (pending.length || !section.entries.length || section.notes.length) {
        lines.push(section.label + ' · ' + pageCitation(section));
        lines.push(...section.notes, ...pending.map(item => '• ' + item.text));
        if (!section.entries.length && !section.notes.length) lines.push('Consultar el apartado en las páginas originales.');
      }
    }
    if (!review.needsChoice && sections().every(section => section.entries.length && section.entries.every(item => item.checked))) {
      lines.push('Todas las casillas visibles están marcadas como revisadas.');
    }
    copyText(lines.join('\n'), 'Elementos por revisar copiados.');
  });
  return {snapshot: data};
}
