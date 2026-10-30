import {APP_RELEASE} from './release.js';
import {mountDocumentScreen} from './document-screen.js';
import {shareCard} from './share-card.js';
import {printCard} from './print-session.js';
import {checklistEntries} from './print.js';
import {edusGuidanceForCard} from './edus-guidance.js';
import {reviewBuckets,reviewSupplements} from './review-content.js';
import {createTopicIndex, orderDocuments, groupResults, uniqueTopicCount, isCatalogCard, specialtyGeneralRequirements, generalRequirementsForCard, specificRequirementsForCard, generalRequirementsCoverage, showSpecialtyGeneralAccess, includeGeneralSearchResult, orderCatalogTopics} from './catalog.js';
/* Criterios de referencia. La revisión se realiza en el navegador; no se envían datos clínicos. */
if (!mountDocumentScreen()) (() => {
  'use strict';
  const VERSION = APP_RELEASE.version;
  const UPDATED_LABEL = new Intl.DateTimeFormat('es-CR',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(APP_RELEASE.updatedAt));
  const REPORT_EMAIL = 'msolanoc@ccss.sa.cr';
  const STORE = 'referencias-dipssha-v1';
  const PAGE_SIZE = 32;
  const $ = (selector, base = document) => base.querySelector(selector);
  const $$ = (selector, base = document) => [...base.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const arr = value => Array.isArray(value) ? value.filter(x => x !== null && x !== undefined) : value ? [value] : [];
  const textOf = value => typeof value === 'object' && value ? String(value.text ?? value.label ?? '') : String(value ?? '');
  const safeRead = (storage, key, fallback) => { try { const value = storage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } };
  const safeWrite = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); } catch { /* La app sigue operativa si el navegador no permite almacenamiento. */ } };
  const saved = safeRead(sessionStorage, `${STORE}:catalog`, {});
  const state = {
    cards: [], topics: [], topicIndex: null, sources: [], sourceMap: new Map(), index: new Map(), filtered: [], visible: Math.max(PAGE_SIZE,Number(saved.visible)||PAGE_SIZE),
    favorites: new Set(safeRead(localStorage, `${STORE}:favorites`, [])),
    recent: safeRead(localStorage, `${STORE}:recent`, []),
    pendingDocumentChoice: '',
    query: saved.query || '', specialty: saved.specialty || '', scope: saved.scope || '',
    priority: saved.priority || '', source: saved.source || '', mode: saved.mode || 'all',
    sort: saved.sort || (norm(saved.query)?'relevance':'name'), filtersOpen: saved.filtersOpen !== false,
    scroll: Number(saved.scroll) || 0, ready: false, currentId: '', detailTab: 'summary',
    lastScreen: '', debounce: 0, toastTimer: 0, navigatingFromCatalog: false
  };
  const icons = {
    arrow:'<path d="M4 10h12m-5-5 5 5-5 5"/>', back:'<path d="M16 10H4m5-5-5 5 5 5"/>',
    star:'<path d="m10 2 2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76L10 2Z"/>',
    print:'<path d="M5 7V2h10v5M5 14H3V7h14v7h-2M5 11h10v7H5v-7Z"/><path d="M14 9h1"/>',
    copy:'<rect x="7" y="6" width="10" height="12" rx="1.5"/><path d="M4 14H3V2h10v1"/>',
    external:'<path d="M12 2h6v6m0-6L9 11M8 4H3v13h13v-5"/>',
    book:'<path d="M2 3.5c3-1 5.5-.5 8 1 2.5-1.5 5-2 8-1V17c-3-1-5.5-.5-8 1-2.5-1.5-5-2-8-1V3.5ZM10 5v13"/>',
    download:'<path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4"/>',
    clock:'<circle cx="10" cy="10" r="8"/><path d="M10 5v5l3 2"/>',
    check:'<path d="m4 10 4 4 8-9"/>',
    info:'<circle cx="10" cy="10" r="8"/><path d="M10 9v5m0-8v.2"/>',
    share:'<path d="M10 12V2m-4 4 4-4 4 4M5 8H3v10h14V8h-2"/>'
  };
  const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
  const priorityType = (value,sourceId) => {
    const n = norm(String(value || '').replace(/,?\s*según este apartado de la fuente\.?/gi, ''));
    if (!n || /contradict|ver criterio|segun patologia/.test(n)) return '';
    if(sourceId==='N19') {
      const urgent=/\burgente\b|\burgencia\b|emergencias/.test(n), grade3=/\bgrado 3\b/.test(n), grade12=/\bgrado [12]\b/.test(n);
      if((urgent&&(grade3||grade12||/consulta externa/.test(n)))||(grade3&&grade12)||(grade12&&/a cupo/.test(n)))return 'mixed';
      if(urgent)return 'urgent';
      if(grade3)return 'routine';
      if(grade12)return 'priority';
      if(/segun caso/.test(n))return 'mixed';
    }
    const outpatient = /consulta externa|consultas externas/.test(n);
    const acuteService = /urgencias|emergencias|servicio de emergencia|servicio emergencia/.test(n);
    const priority = /prioridad|prioritari|preferent/.test(n) || (!acuteService&&/\burgente\b/.test(n)) || (outpatient && /urgencia|urgente/.test(n));
    const routine = /cupo|ordinari|rutina|rutinari/.test(n);
    const conditional = /\bsi\b|segun|depend|cuando|en caso|en los casos|en aquellos|alternativa|\bo\b/.test(n);
    // El destino debe ser inequívoco: urgencia de consulta externa no significa Servicio de Urgencias.
    if (acuteService && (outpatient || routine || priority || conditional || n.length > 90)) return 'mixed';
    if (routine && priority) return 'mixed';
    if (acuteService) return 'urgent';
    if (priority) return 'priority';
    if (routine) return 'routine';
    return '';
  };
  function cardPriorityType(card) {
    const criteria=arr(card.criteria).map(textOf);
    const directUrgencies=criteria.length===1&&/^(?:referir|referencia|se refieren) (?:a|al) (?:servicio de )?(?:urgencias|emergencias)\.?$/.test(norm(criteria[0]));
    return priorityType([directUrgencies?'Servicio de Urgencias':card.route,card.priority].filter(Boolean).join('. '),card.sourceId);
  }
  const sourceFor = card => state.sourceMap.get(card.sourceId) || {id:card.sourceId || '', titulo:'Fuente documental', documentStatus:'unverified', alcance:card.scope || ''};
  function scopeType(card) {
    const source = sourceFor(card);
    if (/^N\d/.test(card.sourceId || '') || /nacional/i.test(source.alcance || card.scope || '')) return 'national';
    if (source.documentStatus === 'unverified' || /por documentar/i.test(card.scope || source.alcance || '')) return 'unverified';
    return 'regional';
  }
  function isReturnCard(card) { return /^(?:II\s*[-→a]\s*I|2\s*[-→a]\s*1)$/i.test(String(card.direction || '').trim()); }
  function statusBadge(source, card) {
    const status = source.documentStatus || (/^R/.test(source.id || '') ? 'regional' : 'review');
    const scope = card ? scopeType(card) : /^N/.test(source.id || '') ? 'national' : status === 'unverified' ? 'unverified' : 'regional';
    let html = `<span class="badge ${scope === 'regional' ? 'badge-regional' : scope === 'unverified' ? 'badge-unverified' : ''}">${scope === 'national' ? 'Nacional CCSS' : scope === 'unverified' ? 'Procedencia por documentar' : esc(source.shortLabel || 'Regional / servicio')}</span>`;
    if (status === 'review') html += '<span class="badge badge-review" title="Verifique la continuidad o actualización del documento antes de aplicar sus criterios.">Vigencia por confirmar</span>';
    if(!card&&source.indexingStatus==='documentOnly')html += '<span class="badge badge-review">PDF disponible · sin fichas clínicas todavía</span>';
    if (isReturnCard(card || {})) html += '<span class="badge badge-regional">Retorno a primer nivel</span>';
    return html;
  }
  const shortText = (value, max = 160) => { const v = String(value || '').replace(/\s+/g, ' ').trim(); return v.length > max ? v.slice(0, max - 1).trimEnd() + '…' : v; };
  const pageLabel = card => arr(card.pages).length ? `${arr(card.pages).length === 1 ? 'Pág.' : 'Págs.'} ${arr(card.pages).join(', ')}` : 'Ver sección en la fuente';
  function validURL(value) { try { const u = new URL(value, document.baseURI); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } }
  function viewerURL(source, card) {
    const page = arr(card?.pages).find(p => Number.isInteger(Number(p)) && Number(p) > 0) || 1;
    return `./?screen=source&source=${encodeURIComponent(source.id)}&page=${encodeURIComponent(page)}&return=${encodeURIComponent(location.hash || '#fuentes')}`;
  }
  function saveCatalog(scroll = state.scroll) {
    state.scroll = scroll;
    safeWrite(sessionStorage, `${STORE}:catalog`, {
      query:state.query,specialty:state.specialty,scope:state.scope,priority:state.priority,source:state.source,
      mode:state.mode,sort:state.sort,filtersOpen:state.filtersOpen,scroll:state.scroll,visible:state.visible
    });
  }
  function announce(message) {
    const toast = $('#toast'); clearTimeout(state.toastTimer);
    toast.textContent = message; toast.hidden = false;
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 3700);
  }
  function setMode(mode) {
    state.mode = mode; state.visible = PAGE_SIZE;
    $$('[data-list-mode]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.listMode === mode)));
    renderCatalog(); saveCatalog(0);
  }
  function populateFilters() {
    const counts = new Map();
    for (const topic of state.topics) if (topic.cards.some(card => isCatalogCard(card)&&!isReturnCard(card))) counts.set(topic.specialty, (counts.get(topic.specialty) || 0) + 1);
    const specialities = [...counts.keys()].filter(Boolean).sort((a,b) => a.localeCompare(b, 'es'));
    $('#specialty-filter').innerHTML = '<option value="">Todas las especialidades</option>' + specialities.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    const usedSources = new Set(state.cards.filter(isCatalogCard).map(card => card.sourceId));
    const scopes = new Set(state.cards.filter(isCatalogCard).map(scopeType));
    $('#scope-filter').innerHTML = '<option value="">Todos los alcances</option>' + [['national','Nacional CCSS'],['regional','Regional y de servicio'],['unverified','Procedencia por documentar']].filter(([value])=>scopes.has(value)).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    if(state.scope&&!scopes.has(state.scope))state.scope='';
    if(state.source&&!usedSources.has(state.source))state.source='';
    $('#source-filter').innerHTML = `<option value="">Todos (${usedSources.size} con fichas)</option>` + state.sources.filter(s => usedSources.has(s.id)).map(s => `<option value="${esc(s.id)}">${esc(s.id+' · '+(s.shortLabel || s.tema || shortText(s.titulo, 45)))}</option>`).join('');
    $('#source-coverage-label').textContent = `${usedSources.size} documentos tienen fichas en el buscador. El registro completo contiene ${state.sources.length}; los ${state.sources.length-usedSources.size} restantes no tienen fichas incorporadas.`;
    $('#source-registry-link').textContent = `Ver el registro de los ${state.sources.length} documentos y su disponibilidad`;
    $('#header-source-count').textContent = state.sources.length;
    $('#all-count').textContent = state.topics.filter(topic => topic.cards.some(c => isCatalogCard(c)&&!isReturnCard(c))).length;
    syncControls(); updateFavoriteCounts();
  }
  function syncControls() {
    syncSortOptions();
    $('#search').value = state.query; $('#specialty-filter').value = state.specialty;
    $('#scope-filter').value = state.scope; $('#priority-filter').value = state.priority;
    $('#source-filter').value = state.source; $('#sort-order').value = state.sort;
    $('#filter-toggle').setAttribute('aria-expanded', String(state.filtersOpen));
    $('#filter-fields').hidden = !state.filtersOpen;
    $('#clear-search').hidden = !state.query;
    $$('[data-list-mode]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.listMode === state.mode)));
  }
  function syncSortOptions() {
    const search=Boolean(norm(state.query)), recent=state.mode==='recent';
    if(!recent&&((state.sort==='relevance'&&!search)||(state.sort==='specialty'&&state.specialty)))state.sort='name';
    $('#sort-order').innerHTML=(search?'<option value="relevance">Coincidencia</option>':'')+(!state.specialty?'<option value="specialty">Especialidad</option>':'')+'<option value="name">Patología A a Z</option>';
    $('#sort-order').value=state.sort;
    const fixed=recent||(!search&&Boolean(state.specialty));
    $('#sort-control').hidden=fixed;$('#sort-fixed').hidden=!fixed;
    $('#sort-fixed').textContent=recent?'Últimas consultadas':'Patología A a Z';
  }
  function buildIndex(card) {
    const title = norm(card.name);
    const specialty = norm(card.specialty);
    const topic=state.topicIndex.byCard.get(card.id);
    const aliases = norm([...arr(card.aliases),topic?.name,...(topic?.cards||[]).map(member=>member.name)].join(' '));
    const full = norm([card.name,card.specialty,aliases,card.priority,...arr(card.criteria).map(textOf),...arr(card.studies).map(textOf),...arr(card.prior).map(textOf),...arr(card.notes).map(textOf),card.fullText,card.context].filter(Boolean).join(' '));
    return {title,specialty,aliases,full};
  }
  function filterCards(overrides = {}) {
    const selected = {...state,...overrides};
    const query = norm(selected.query), tokens = query.split(' ').filter(Boolean);
    const pinnedIds=new Set(showSpecialtyGeneralAccess(selected)?specialtyGeneralRequirements(selected.cards,selected,selected.sourceMap).map(card=>card.id):[]);
    const recentOrder = new Map(selected.recent.map((id,i) => [id,i]));
    const favoriteTopics=new Set([...selected.favorites].filter(id=>selected.cards.some(card=>card.id===id&&isCatalogCard(card))).map(id=>selected.topicIndex.byCard.get(id)?.id));
    let cards = selected.cards.filter(card => {
      if (!isCatalogCard(card)) return false;
      if (!includeGeneralSearchResult(card,selected)) return false;
      if (pinnedIds.has(card.id)) return false;
      if (isReturnCard(card) && !selected.source) return false;
      if (selected.mode === 'favorites' && !favoriteTopics.has(selected.topicIndex.byCard.get(card.id)?.id)) return false;
      if (selected.mode === 'recent' && !recentOrder.has(card.id)) return false;
      if (selected.specialty && card.specialty !== selected.specialty) return false;
      if (selected.scope && scopeType(card) !== selected.scope) return false;
      if (selected.source && card.sourceId !== selected.source) return false;
      if (selected.priority && cardPriorityType(card) !== selected.priority && !(cardPriorityType(card) === 'mixed' && (selected.priority === 'urgent' ? /urgenc|emergenc|inmediat/ : selected.priority === 'priority' ? /prioridad|prioritari|preferent/ : /cupo|ordinari|rutina|rutinari/).test(norm(card.priority)))) return false;
      const idx = selected.index.get(card.id);
      return !query || tokens.every(t => idx.full.includes(t));
    });
    const scores = new Map();
    if (tokens.length) for (const card of cards) {
      const idx = selected.index.get(card.id);
      scores.set(card.id, (idx.title === query ? 1000 : 0) + (idx.title.startsWith(query) ? 300 : 0) + (idx.title.includes(query) ? 200 : 0) + tokens.reduce((score,t) => score+(idx.title.includes(t)?45:0)+(idx.aliases.includes(t)?30:0)+(idx.specialty.includes(t)?20:0),0));
    }
    cards.sort((a,b) => {
      if (selected.mode === 'recent') return recentOrder.get(a.id) - recentOrder.get(b.id);
      if (selected.sort === 'relevance' && query) return (scores.get(b.id)-scores.get(a.id)) || a.name.localeCompare(b.name,'es');
      if (selected.sort === 'name') return a.name.localeCompare(b.name,'es') || a.specialty.localeCompare(b.specialty,'es');
      return a.specialty.localeCompare(b.specialty,'es') || a.name.localeCompare(b.name,'es') || a.sourceId.localeCompare(b.sourceId,'es');
    });
    return orderCatalogTopics(groupResults(cards,selected.topicIndex,selected.sourceMap,selected.mode==='recent'),selected);
  }
  function cardHTML(card) {
    const topic=card.topic, members=state.source?card.matchingCards:card.allCards, multiple=members.length>1;
    const source = sourceFor(card), priority = cardPriorityType(card);
    const coverage=generalRequirementsCoverage(card.matchingCards,state.cards);
    const favoriteId=card.allCards.find(member=>state.favorites.has(member.id))?.id, favorite=Boolean(favoriteId);
    const excerpt = multiple ? 'Seleccione el documento según el destino de su referencia. Cada fuente conserva sus propios criterios.' : card.context || textOf(arr(card.criteria)[0]) || textOf(arr(card.prior)[0]) || shortText(card.fullText);
    const sourceCount=new Set(members.map(member=>member.sourceId)).size;
    const matchedCount=card.matchingCards.length;
    const label=sourceCount>1?`${sourceCount} documentos`:`${members.length} apartados`;
    const priorityLabel = priority === 'urgent' ? 'Urgencias' : priority === 'priority' ? 'Atención prioritaria' : priority === 'routine' ? 'A cupo' : priority === 'mixed' ? 'Ver prioridad según el caso' : '';
    const badges=multiple?`<span class="badge">${label}</span><span class="badge badge-review">Elegir documento</span>`:`${statusBadge(source,card)}${priorityLabel ? `<span class="badge badge-${priority}">${priorityLabel}</span>`:''}`;
    return `<article class="result-card"><a class="card-main" href="#ficha/${encodeURIComponent(card.id)}" data-card-link="${esc(card.id)}"><div class="card-specialty"><span class="specialty-dot"></span>${esc(topic.specialty)}</div><h3>${esc(topic.name)}</h3>${excerpt ? `<p class="card-excerpt">${esc(shortText(excerpt,185))}</p>` : ''}<div class="card-badges">${badges}</div>${coverage.label?`<p class="requirements-included">${icon('check')}${esc(coverage.label)}</p>`:''}${multiple?`<p class="topic-source-summary">Una entrada para este tema. ${matchedCount<members.length?`${matchedCount} de ${members.length} apartados coinciden con los filtros.`:'Los documentos se consultan por separado.'}</p>`:''}</a><button type="button" class="favorite-toggle${favorite?' is-favorite':''}" data-favorite="${esc(favoriteId||card.id)}" aria-label="${favorite?'Quitar de favoritas':'Guardar en favoritas'}: ${esc(topic.name)}" aria-pressed="${favorite}">${icon('star')}</button><div class="card-footer"><span>${multiple?esc([...new Set(members.map(member=>member.sourceId))].join(' · ')):`${esc(card.sourceId)} · ${esc(pageLabel(card))}`}</span><a class="open-card" href="#ficha/${encodeURIComponent(card.id)}" data-card-link="${esc(card.id)}">${multiple?'Consultar criterios':'Revisar ficha'} ${icon('arrow')}</a></div></article>`;
  }
  function renderSpecialtyGeneral(cards) {
    const panel=$('#specialty-general');
    panel.hidden=!cards.length;
    if(!cards.length){panel.innerHTML='';return;}
    panel.innerHTML=`<div class="specialty-general-heading">${icon('book')}<div><p class="eyebrow">Antes de preparar la referencia</p><h3 id="specialty-general-title">Requisitos generales de ${esc(state.specialty)}</h3></div></div><p class="specialty-general-intro">Consulta adicional de la especialidad. Estos requisitos también se incluyen dentro de cada ficha que utiliza el mismo documento y la misma ruta de referencia.</p><div class="specialty-general-sources">${cards.map(card=>{
      const source=sourceFor(card);
      return `<article class="specialty-general-source"><div class="specialty-general-source-header"><h4>Fuente ${esc(source.id)}</h4><div class="card-badges">${statusBadge(source,card)}</div></div><p>${esc(shortText(source.titulo,180))}</p><p class="specialty-general-pages">${esc(pageLabel(card))}${card.direction&&card.direction!=='I-II'?` · Ruta ${esc(card.direction)}`:''}</p><a class="button button-secondary" href="#ficha/${encodeURIComponent(card.id)}" data-card-link="${esc(card.id)}">Revisar requisitos ${icon('arrow')}</a></article>`;
    }).join('')}</div>`;
  }
  function renderCatalog(append = false) {
    if (!state.ready) return;
    syncSortOptions();
    if (!append) state.filtered = filterCards();
    const grid = $('#results-grid'), visible = state.filtered.slice(0,state.visible);
    grid.innerHTML = visible.map(cardHTML).join(''); grid.setAttribute('aria-busy','false');
    const count = state.filtered.length, total = state.topics.filter(topic => topic.cards.some(c => isCatalogCard(c)&&!isReturnCard(c))).length;
    const name = state.mode === 'favorites' ? 'Sus fichas favoritas' : state.mode === 'recent' ? 'Consultadas recientemente' : state.specialty || 'Criterios de referencia';
    $('#results-title').textContent = name;
    const general=showSpecialtyGeneralAccess(state)?specialtyGeneralRequirements(state.cards,state,state.sourceMap):[];
    renderSpecialtyGeneral(general);
    $('#result-count').textContent = general.length?`${count.toLocaleString('es-CR')} ${count===1?'tema':'temas'} · ${general.length} ${general.length===1?'documento de requisitos generales':'documentos de requisitos generales'}`:count === 1 ? '1 tema disponible' : `${count.toLocaleString('es-CR')} temas${count !== total ? ' encontrados' : ' disponibles'}`;
    $('#empty-state').hidden = count > 0; grid.hidden = count === 0;
    const priorityLabels={urgent:'Urgencias',priority:'Consulta prioritaria',routine:'Consulta a cupo'};
    const withoutPriority=!count&&state.priority?filterCards({priority:''}).length:0;
    $('#empty-remove-priority').hidden=!withoutPriority;
    $('#empty-remove-priority').textContent=`Quitar ${priorityLabels[state.priority]||'filtro de atención'} y ver ${withoutPriority} ${withoutPriority===1?'tema':'temas'}`;
    if (state.mode === 'favorites') {
      $('#empty-title').textContent = 'Sus favoritas, a un toque';
      $('#empty-copy').textContent = state.favorites.size ? 'No hay favoritas que coincidan con estos filtros.' : 'Marque la estrella de una ficha para encontrarla aquí cuando la necesite.';
    } else if (state.mode === 'recent') {
      $('#empty-title').textContent = 'Aquí verá sus últimas consultas';
      $('#empty-copy').textContent = state.recent.length ? 'Ninguna ficha reciente coincide con estos filtros.' : 'Abra una ficha y quedará disponible en esta sección.';
    } else {
      $('#empty-title').textContent = [state.specialty,state.scope,state.priority,state.source].some(Boolean)?'No hay temas con estos filtros':'No encontramos esa búsqueda';
      $('#empty-copy').textContent = withoutPriority?`El filtro ${priorityLabels[state.priority]} está activo. Al quitarlo ${withoutPriority===1?'aparece':'aparecen'} ${withoutPriority} ${withoutPriority===1?'tema':'temas'}; se conservan la búsqueda y los demás filtros. Las fichas sin prioridad explícita no aparecen al filtrar por tipo de atención.`:'Pruebe con otro término o quite algún filtro. Una ausencia en el catálogo no determina que la referencia no corresponda.';
    }
    $('#load-more').hidden = count <= state.visible;
    $('#load-more').textContent = `Mostrar ${Math.min(PAGE_SIZE,count-state.visible)} criterios más`;
    const filters = [state.specialty,state.scope,state.priority,state.source].filter(Boolean).length;
    $('#active-filters-count').textContent = filters; $('#active-filters-count').hidden = !filters;
    $('#reset-filters').hidden = !filters && !state.query;
    const activeFilters=[['query','Búsqueda',state.query],['specialty','Especialidad',state.specialty],['scope','Alcance',({national:'Nacional CCSS',regional:'Regional y de servicio',unverified:'Procedencia por documentar'})[state.scope]],['priority','Atención',priorityLabels[state.priority]],['source','Documento',state.source?`${state.source} · ${sourceFor({sourceId:state.source}).shortLabel||shortText(sourceFor({sourceId:state.source}).titulo,48)}`:'']].filter(([, ,value])=>value);
    $('#active-filter-list').hidden=!activeFilters.length;
    $('#active-filter-list').innerHTML=activeFilters.map(([key,label,value])=>`<button type="button" class="active-filter" data-remove-filter="${key}" aria-label="Quitar filtro de ${esc(label.toLowerCase())}: ${esc(value)}"><span>${esc(label)}: <strong>${esc(value)}</strong></span><span aria-hidden="true">×</span></button>`).join('');
    syncControls();
  }
  function updateFavoriteCounts() { $('#favorite-count').textContent = uniqueTopicCount(state.favorites,state.topicIndex) || ''; }
  function toggleFavorite(id) {
    const members=state.topicIndex.byCard.get(id)?.cards.filter(isCatalogCard) || [{id}];
    const wasFavorite=members.some(card=>state.favorites.has(card.id));
    if(wasFavorite)members.forEach(card=>state.favorites.delete(card.id));else state.favorites.add(id);
    safeWrite(localStorage, `${STORE}:favorites`, [...state.favorites]); updateFavoriteCounts();
    if (!$('#detail-screen').hidden) updateDetailFavorite();
    if (!$('#catalog-screen').hidden) renderCatalog();
    announce(!wasFavorite ? 'Tema guardado en favoritas.' : 'Tema retirado de favoritas.');
  }
  function updateDetailFavorite() {
    const button = $('#detail-favorite'); if (!button) return;
    const favorite = state.topicIndex.byCard.get(state.currentId)?.cards.some(card=>isCatalogCard(card)&&state.favorites.has(card.id));
    button.classList.toggle('is-favorite',favorite);button.setAttribute('aria-pressed',String(favorite));
    button.setAttribute('aria-label',favorite?'Quitar de favoritas':'Guardar en favoritas');button.title=favorite?'Quitar de favoritas':'Guardar en favoritas';
  }
  function getChecked(id) {
    const card=state.cards.find(item=>item.id===id);
    if(!card)return new Set();
    return new Set(checklistEntries(card,safeRead(sessionStorage, `${STORE}:checks:${id}`, [])).filter(entry=>entry.reviewed).map(entry=>entry.id));
  }
  function checklist(card) {
    return arr(card.checklist).map((entry,index) => typeof entry === 'string' ? {id:`c${index+1}`,text:entry,requirement:'source'} : {...entry,id:entry.id || `c${index+1}`,text:entry.text || entry.label || ''}).filter(entry => entry.text);
  }
  function reviewGroups(card) {
    return [...generalRequirementsForCard(card,state.cards).map(item=>({card:item,general:true})),{card:specificRequirementsForCard(card),general:false}].map(group=>({...group,entries:checklist(group.card),checked:getChecked(group.card.id)}));
  }
  function edusGuidanceHTML(card) {
    const guidance=edusGuidanceForCard(card,state.cards);
    if(!guidance)return '';
    return `<section class="edus-guidance" aria-label="Orientación operativa sobre estudios en EDUS"><p class="edus-guidance-label">Orientación operativa de la app</p><h3>${esc(guidance.title)}</h3><p class="edus-guidance-body">${esc(guidance.body)}</p><p class="edus-guidance-scope">${esc(guidance.scopeNote)}</p>${guidance.originalsNote?`<p class="edus-originals"><strong>Material original.</strong> ${esc(guidance.originalsNote)}</p>`:''}<details class="edus-guidance-sources"><summary>Consultar respaldo institucional</summary><ul>${guidance.sources.map(source=>`<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ${icon('external')}</a></li>`).join('')}</ul></details></section>`;
  }
  function reviewPageLinksHTML(card) {
    const source=sourceFor(card),pages=[...new Set(arr(card.pages).map(Number).filter(page=>Number.isInteger(page)&&page>0))];
    return `<div class="review-page-links"><span>Fuente ${esc(card.sourceId)}</span>${source.pageImageBase?pages.map(page=>`<a href="${esc(viewerURL(source,{...card,pages:[page]}))}" data-source-action="pages" aria-label="Ver página original ${page} de la fuente ${esc(card.sourceId)}">${icon('book')}Pág. ${page}</a>`).join(''):`<span>${esc(pageLabel(card))}</span>`}</div>`;
  }
  function reviewSupplementsHTML(card,options={}) {
    const sections=reviewSupplements(card,options);
    if(!sections.length)return '';
    return `<section class="review-supplements" data-supplement-card="${esc(card.id)}" aria-label="Precisiones de la fuente ${esc(card.sourceId)}">${sections.map(section=>`<div class="review-supplement"><h4>${esc(section.title)}</h4><ul>${section.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div>`).join('')}</section>`;
  }
  function checklistHTML(card) {
    const groups=reviewGroups(card),total=groups.reduce((sum,group)=>sum+group.entries.length,0),hasGeneral=groups.some(group=>group.general);
    const representedTexts=groups.flatMap(group=>group.entries.map(entry=>entry.text));
    const itemHTML=(entry,group)=>{
      const type=entry.sourceRequirement||entry.requirement;
      const label=type==='required'?'Obligatorio en la fuente':type==='desirable'?'Deseable según la fuente':type==='conditional'?'Según el caso o la condición descrita':'';
      return `<label class="checklist-item"><input type="checkbox" data-check-card-id="${esc(group.card.id)}" data-check-id="${esc(entry.id)}" ${group.checked.has(entry.id)?'checked':''}><span class="checklist-text">${esc(entry.text)}${label?`<small class="checklist-tag">${esc(label)}</small>`:''}</span></label>`;
    };
    const groupHTML=group=>{
      const buckets=reviewBuckets(group.card),heading=group.general?`Requisitos generales de ${group.card.specialty}`:'';
      const extraScope=group.general&&group.card.applicability&&String(group.card.applicability).trim()!==String(card.applicability||'').trim()?`<div class="document-status-note"><strong>Alcance de estos requisitos.</strong> ${esc(group.card.applicability)}</div>`:'';
      return `<section class="checklist-group" data-review-card="${esc(group.card.id)}">${heading?`<h3 class="checklist-group-title">${esc(heading)}</h3>${reviewPageLinksHTML(group.card)}`:''}${extraScope}${buckets.map(bucket=>`<div class="review-bucket">${group.general?(buckets.length>1?`<h4 class="review-subtitle">${esc(bucket.title)}</h4>`:''):`<h3 class="checklist-group-title">${esc(bucket.title)}</h3>${reviewPageLinksHTML(group.card)}`}${bucket.entries.map(entry=>itemHTML(entry,group)).join('')}</div>`).join('')}${!buckets.length&&!group.general?`<h3 class="checklist-group-title">Criterios de esta ficha</h3>${reviewPageLinksHTML(group.card)}`:''}${reviewSupplementsHTML(group.card,{representedTexts,hasGeneral})}</section>`;
    };
    return `<section class="checklist-panel" aria-labelledby="checklist-title"><div class="checklist-header"><p class="checklist-eyebrow">Antes de enviar</p><h2 id="checklist-title">Revise su referencia</h2><p>${hasGeneral?'Revise primero los requisitos generales y después los criterios de esta ficha.':'Compruebe los elementos de esta ficha.'} Las casillas indican aspectos revisados; los criterios se aplican según el caso. Fuente <strong>${esc(card.sourceId)}</strong>.</p></div><div class="checklist-progress"><div class="progress-caption"><span id="check-progress-label"></span><strong id="check-pending-label"></strong></div><div class="progress-track" role="progressbar" aria-label="Casillas revisadas" aria-valuemin="0" aria-valuemax="${total || 1}" aria-valuenow="0"><span id="check-progress-bar"></span></div></div>${edusGuidanceHTML(card)}<div class="checklist-items">${groups.map(groupHTML).join('')}</div><div class="checklist-actions no-print"><button type="button" class="button button-primary" id="copy-reference">${icon('copy')}Copiar esquema de referencia</button><button type="button" class="button button-secondary" id="copy-missing">${icon('copy')}Copiar elementos por revisar</button><p class="checklist-footnote">${hasGeneral?'La revisión incluye los requisitos generales y los específicos de esta fuente. ':''}Las marcas no certifican pertinencia clínica. Se conservan en esta sesión. La app no recibe datos de pacientes.</p><div class="checklist-reset"><button type="button" id="reset-checklist">Desmarcar todas las casillas</button></div></div></section>`;
  }
  function updateChecklist(card) {
    if (!$('#check-progress-label')) return;
    const groups=reviewGroups(card),total=groups.reduce((sum,group)=>sum+group.entries.length,0),count=groups.reduce((sum,group)=>sum+group.entries.filter(entry=>group.checked.has(entry.id)).length,0),generalWithoutChecks=groups.some(group=>group.general&&!group.entries.length);
    $('#check-progress-label').textContent = `${count} de ${total} casillas revisadas`;
    $('#check-pending-label').textContent = total-count ? `${total-count} por revisar` : generalWithoutChecks?'Revise también el texto general':total?'Casillas marcadas como revisadas':'';
    $('#check-progress-bar').style.width = `${total ? count/total*100 : 0}%`;
    $('.progress-track').setAttribute('aria-valuenow',count);
    $('#copy-missing').disabled = !total&&!generalWithoutChecks;
    $('#reset-checklist').disabled = !count;
  }
  function sourceStatusNote(source,card) {
    let html=card?.applicability?`<div class="document-status-note applicability-note"><strong>Alcance de este lineamiento.</strong> ${esc(card.applicability)} <a href="./?screen=source&source=${esc(source.id)}&page=4&return=${encodeURIComponent(location.hash)}">Ver aplicación en la fuente</a></div>`:'';
    if (source.documentStatus === 'review') html += `<div class="document-status-note"><strong>Verificación documental pendiente.</strong> ${esc(source.vigencia ? `Vigencia declarada: ${source.vigencia}. ` : '')}${esc(source.estado || 'Confirme la versión actual del documento.')}</div>`;
    if (source.documentStatus === 'unverified') html += '<div class="document-status-note unverified"><strong>Procedencia por documentar.</strong> El establecimiento o el acto de aprobación no están identificados en la copia disponible. Este documento requiere validación para su uso en la red.</div>';
    if(card?.requiresReview) html += `<div class="document-status-note"><strong>Discrepancia en el documento de origen.</strong> ${esc(arr(card.documentIssues).map(textOf).join(' ') || 'Revise las condiciones y la página original antes de definir el destino o los requisitos.')}</div>`;
    return html;
  }
  function documentChoiceRequired(card,topic,restoreReading=false) {
    // La elección sólo autoriza la apertura que sigue al clic o al cambio de fuente.
    // Una nueva visita al tema vuelve a pedir el documento, aunque ya se consultara.
    const explicitlyChosen=state.pendingDocumentChoice===card.id;
    state.pendingDocumentChoice='';
    const members=(topic?.cards||[card]).filter(isCatalogCard);
    if(new Set(members.map(item=>item.sourceId)).size<2)return false;
    if(explicitlyChosen||restoreReading)return false;
    // Un filtro de documento elegido desde el catálogo es una elección expresa.
    // El alcance, la búsqueda o una preferencia de orden no eligen el documento.
    const filtered=members.filter(item=>item.sourceId===state.source);
    if(state.navigatingFromCatalog&&state.source===card.sourceId&&filtered.length===1){
      return false;
    }
    return true;
  }
  function chooseDocument(id) {
    const card=state.cards.find(item=>item.id===id);
    if(!card||!isCatalogCard(card))return;
    state.pendingDocumentChoice=id;
    state.navigatingFromCatalog=false;
    const hash='#ficha/'+encodeURIComponent(id);
    if(location.hash===hash)handleRoute();else location.hash=hash;
  }
  function topicSourcesHTML(topic,card,choosing=false) {
    if(!topic)return '';
    const ordered=orderDocuments(topic.cards,state.sourceMap);
    if(ordered.length<2)return '';
    const sourceCount=new Set(ordered.map(item=>item.sourceId)).size;
    const comparisonLabel=sourceCount>1?`${sourceCount} documentos para este tema`:`${ordered.length} apartados del mismo documento`;
    const option=item=>{
      const source=sourceFor(item),selected=!choosing&&item.id===card.id;
      const scope=scopeType(item),label=scope==='national'?'Nacional CCSS':scope==='unverified'?'Procedencia por documentar':'Regional / servicio';
      const included=generalRequirementsCoverage([item],state.cards).label;
      const limits=[source.approvalNote,source.limites,source.derivativeNotice].filter(Boolean);
      return `<a class="source-choice${selected?' is-selected':''}${scope==='unverified'?' source-choice-unverified':''}" href="#ficha/${encodeURIComponent(item.id)}" data-source-choice="${esc(item.id)}" ${selected?'aria-current="true"':''}><span class="source-choice-label">${esc(label)}${scope==='regional'&&source.shortLabel?' · '+esc(source.shortLabel):''}${source.documentStatus==='review'?' · vigencia por confirmar':''}</span><strong>${esc(source.id)} · ${esc(topic.variantLabels?.[item.id]||item.name)}</strong><span class="source-choice-document">${esc(source.titulo||'Documento de respaldo')}</span><span><b>Ámbito:</b> ${esc(source.alcance||item.scope||'No identificado en la copia')}</span><span><b>Fecha:</b> ${esc(source.fecha||'No identificada')} · ${esc(pageLabel(item))}</span><span><b>Vigencia declarada:</b> ${esc(source.vigencia||'Sin periodo declarado')}</span>${source.estado?`<span class="source-choice-status">${esc(source.estado)}</span>`:''}${limits.length?`<span class="source-choice-limits">${esc(limits.join(' '))}</span>`:''}${item.priority?`<span class="source-choice-priority"><b>Prioridad y destino:</b> ${esc(item.priority)}</span>`:''}${included?`<span class="requirements-included">${esc(included)}</span>`:''}<span class="source-choice-action">${selected?'Documento elegido':'Elegir este documento'} ${icon('arrow')}</span></a>`;
    };
    if(!choosing){
      const selectedSource=sourceFor(card);
      return `<section class="topic-sources document-switcher" aria-label="Documento consultado"><label for="detail-source-select">Documento consultado</label><select id="detail-source-select" aria-label="Cambiar documento consultado">${ordered.map(item=>{const source=sourceFor(item),scope=scopeType(item);return `<option value="${esc(item.id)}" ${item.id===card.id?'selected':''}>${esc(source.id)} · ${esc(scope==='national'?'Nacional CCSS':scope==='unverified'?'Procedencia por documentar':source.shortLabel||'Regional / servicio')} · ${esc(topic.variantLabels?.[item.id]||item.name)}</option>`;}).join('')}</select><p><strong>Ámbito:</strong> ${esc(selectedSource.alcance||card.scope||'No identificado en la copia')}</p><details class="document-comparison"><summary>Comparar los ${sourceCount>1?sourceCount+' documentos':ordered.length+' apartados'}</summary><p>Consulte el ámbito y la vigencia antes de aplicar otro documento. La fecha por sí sola no acredita que sustituya a los demás.</p><div class="source-options">${ordered.map(option).join('')}</div></details></section>`;
    }
    return `<section class="topic-sources${choosing?' source-choice-required':''}" aria-labelledby="topic-sources-title"><div class="topic-intro"><p class="eyebrow">${comparisonLabel}</p><h2 id="topic-sources-title">${choosing?'Elija el documento para esta referencia':sourceCount>1?'Documento elegido y otras fuentes':'Apartados de la fuente'}</h2><p>Elija según el destino de la referencia y el ámbito del documento. Que una fuente sea nacional, regional o más reciente no demuestra por sí mismo que sustituya a las otras.</p></div><div class="source-selection-note">${esc(topic.note||'Los documentos pueden diferir en condiciones, estudios, prioridad o destino. Revise el documento aplicable al establecimiento receptor.')} Las listas de revisión permanecen separadas por documento.</div><div class="source-options">${ordered.map(option).join('')}</div></section>`;
  }
  function generalRequirementsHTML(card) {
    const general = generalRequirementsForCard(card,state.cards);
    if (!general.length) return '';
    return `<section class="general-requirements" id="general-requirements-text"><h3>Requisitos generales de ${esc(card.specialty)}</h3>${general.map(item=>`<section class="general-transcription"><h4>${esc(item.name)}</h4>${reviewPageLinksHTML(item)}<pre class="full-source-text">${esc(item.fullText||[...arr(item.criteria),...arr(item.prior),...arr(item.studies),...arr(item.notes)].map(textOf).join('\n\n'))}</pre></section>`).join('')}</section>`;
  }
  function sourceTranscriptionHTML(card) {
    const content=card.fullText||[...arr(card.criteria),...arr(card.prior),...arr(card.studies),...arr(card.notes)].map(textOf).join('\n\n');
    return `<details class="documentary-text" id="document-transcription"><summary>Consultar transcripción completa de la fuente</summary><div class="documentary-text-body"><p class="source-navigation-note">Transcripción de las secciones de respaldo. Consulte las páginas originales para verificar tablas, notas al pie y disposición del documento.</p>${generalRequirementsHTML(card)}<section class="specific-transcription"><h3>${esc(card.name)}</h3>${reviewPageLinksHTML(card)}<pre class="full-source-text">${esc(content)}</pre></section></div></details>`;
  }
  function sourceActions(source,card) {
    const viewer = source.pageImageBase ? viewerURL(source,card) : '';
    const download = source.localPdf ? validURL(source.localPdf) : '';
    let html = '';
    if (viewer) html += `<a class="button button-primary" href="${esc(viewer)}" data-source-action="pages">${icon('book')}Ver páginas de la fuente</a>`;
    if (download) html += `<button type="button" class="button button-secondary" data-pdf-url="${esc(download)}" data-pdf-name="${esc(source.titulo)}" data-pdf-filename="${esc(source.id)}-criterios-referencia.pdf" data-source-action="download">${icon('download')}Guardar o compartir PDF completo</button>`;
    if (source.originalDocx) html += `<a class="button button-subtle" href="${esc(validURL(source.originalDocx))}" download>${icon('download')}Documento Word original</a>`;
    return html;
  }
  function reportText(card) {
    const source=card?sourceFor(card):null;
    const url=new URL('index.html',document.baseURI);
    url.search='';url.hash=card?'ficha/'+encodeURIComponent(card.id):'acerca';
    return [
      'CRITERIOS DE REFERENCIA · OBSERVACIÓN O MEJORA',
      `Correo de contacto: ${REPORT_EMAIL}`,
      `Versión de la herramienta: ${VERSION}`,
      card?`Ficha: ${card.name}`:'Consulta general de la herramienta',
      card?`Identificador: ${card.id}`:'',
      card?`Especialidad: ${card.specialty}`:'',
      source?`Documento: ${source.id} · ${source.titulo}`:'',
      source?`Código documental: ${source.codigo || 'No identificado'}`:'',
      card?`Página de respaldo: ${pageLabel(card)}`:'',
      `Enlace consultado: ${url.href}`,
      '',
      'Observación, error detectado o propuesta de mejora:',
      '',
      'Describa el problema de la herramienta o del texto documental. No incluya nombres, cédulas, expedientes ni información clínica de pacientes.'
    ].filter(line=>line!==null&&line!==undefined).join('\n');
  }
  function reportHref(card) {
    const subject='Criterios de referencia · observación o mejora'+(card?` · ${card.sourceId}`:'');
    return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportText(card))}`;
  }
  function feedbackPanel(card) {
    return `<section class="info-panel feedback-panel no-print" aria-label="Reportar un error o sugerir una mejora"><p class="eyebrow">Observaciones y mejoras</p><h2>${card?'Reportar un error de esta ficha':'Reportar un error o sugerir una mejora'}</h2><p>${card?'El borrador identifica esta ficha, su documento y las páginas de respaldo.':'Indique la ficha, el documento o la función de la app que desea señalar.'} Escriba a <a href="${esc(reportHref(card))}" data-feedback>${REPORT_EMAIL}</a>.</p><div class="feedback-actions"><a class="button button-secondary" href="${esc(reportHref(card))}" data-feedback>${icon('external')}${card?'Reportar error de esta ficha':'Escribir una observación'}</a><button class="button button-subtle" type="button" data-copy-email>${icon('copy')}Copiar correo</button><button class="button button-subtle" type="button" data-copy-report>${icon('copy')}Copiar datos del reporte</button></div><p class="source-navigation-note">El enlace abre un borrador en su aplicación de correo. Usted lo revisa y decide si lo envía. Si no se abre, copie el correo y los datos del reporte. No incluya datos de pacientes.</p></section>`;
  }
  function sourcePanel(source,card) {
    return `<section class="source-panel" aria-label="Documento de respaldo"><p class="eyebrow">Fuente que respalda esta ficha · ${esc(source.id)}</p><h3>${esc(source.titulo)}</h3><div class="source-metadata"><span>${esc(source.codigo || 'Sin código identificado')}</span><span>${esc(source.fecha || 'Fecha no identificada')}</span><span>${esc(pageLabel(card))}</span></div>${source.provenance?`<p class="source-navigation-note"><strong>Procedencia:</strong> ${esc(source.provenance)}</p>`:''}${source.approvalNote?`<p class="source-navigation-note"><strong>Aprobación documental:</strong> ${esc(source.approvalNote)}</p>`:''}${source.derivativeNotice?`<p class="source-navigation-note">${esc(source.derivativeNotice)}</p>`:''}<div class="source-actions no-print">${sourceActions(source,card)}</div><p class="source-navigation-note">Consulte las páginas en el visor para volver a esta ficha. El botón de PDF prepara ${source.derivativeNotice?'la versión de lectura del documento':'el documento original completo'}; después toque Abrir menú para guardar o compartir. En iPhone, elija Guardar en Archivos para seleccionar la carpeta.</p><p class="print-source-url" hidden>${esc(source.enlace || '')}</p></section>`;
  }
  function saveDetailReading() {
    if(!state.currentId || $('#detail-screen').hidden)return;
    safeWrite(sessionStorage,`${STORE}:detail:${state.currentId}`,{scrollY:Math.max(0,window.scrollY),detailTab:state.detailTab==='full'?'full':'summary'});
  }
  function detailReading(id) {
    const saved=safeRead(sessionStorage,`${STORE}:detail:${id}`,{})||{};
    return {scrollY:Math.max(0,Number(saved.scrollY)||0),detailTab:saved.detailTab==='full'?'full':'summary'};
  }
  function applyDetailTab(tabName) {
    const transcription=$('#document-transcription');
    if(!transcription)return;
    state.detailTab=tabName==='full'?'full':'summary';
    transcription.open=state.detailTab==='full';
  }
  function renderDetail(id,restoreReading=false) {
    const card = state.cards.find(c => c.id === id), panel = $('#detail-screen');
    if (!card) {
      panel.innerHTML = `<a class="back-link" href="#">${icon('back')}Volver al catálogo</a><div class="empty-state"><h1>Esta ficha no está disponible</h1><p>Busque nuevamente la patología en el catálogo.</p></div>`;return;
    }
    state.currentId = id; state.detailTab = restoreReading?detailReading(id).detailTab:'summary';
    if(!isCatalogCard(card)){
      const source=sourceFor(card),topic=state.topicIndex.byCard.get(id);
      const relatedIds=new Set([...arr(card.relatedCardIds),...(topic?.cards||[]).filter(other=>other.id!==id&&isCatalogCard(other)).map(other=>other.id)]);
      const related=[...relatedIds].map(id=>state.cards.find(item=>item.id===id)).filter(item=>item&&isCatalogCard(item));
      panel.innerHTML=`<a class="back-link" href="#">${icon('back')}Volver al catálogo</a><div class="detail-title-row"><p class="detail-specialty">${esc(card.specialty)}</p><h1 id="detail-title" tabindex="-1">${esc(topic?.name||card.name)}</h1><div class="card-badges">${statusBadge(source,card)}<span class="badge">${esc(card.sourceId)} · ${esc(pageLabel(card))}</span></div></div><section class="info-panel document-status-note"><h2>Este apartado no establece criterios de referencia</h2><p>${esc(card.catalogNote||'La fuente no define en este apartado las condiciones clínicas para referir. Consulte el documento y los criterios de la especialidad correspondiente.')}</p><p>No se utiliza como lista de revisión para preparar una referencia.</p></section>${related.length?`<section class="info-panel"><h2>Consultar criterios documentados</h2>${related.map(item=>`<p><a class="button button-secondary" href="#ficha/${encodeURIComponent(item.id)}">${esc(item.specialty)} · ${esc(item.name)} · ${esc(item.sourceId)} ${icon('arrow')}</a></p>`).join('')}<p class="source-navigation-note">Cada enlace conserva el alcance y la vigencia de su propia fuente.</p></section>`:''}${sourcePanel(source,card)}${feedbackPanel(card)}`;
      document.title=`${card.name} · Respaldo documental · Criterios de referencia`;
      return;
    }
    const choiceTopic=state.topicIndex.byCard.get(id);
    const choosing=documentChoiceRequired(card,choiceTopic,restoreReading);
    state.navigatingFromCatalog=false;
    if(choosing){
      state.currentId='';panel.onchange=null;
      panel.innerHTML=`<div class="detail-topbar no-print"><a class="back-link" href="#" id="back-to-results">${icon('back')}Volver a resultados</a></div><div class="detail-title-row"><p class="detail-specialty"><span class="specialty-dot"></span>${esc(card.specialty)}</p><h1 id="detail-title" tabindex="-1">${esc(choiceTopic?.name||card.name)}</h1><p class="document-choice-intro">Este tema reúne documentos distintos. Seleccione uno para consultar sus requisitos generales y sus criterios específicos.</p></div>${topicSourcesHTML(choiceTopic,card,true)}`;
      document.title=`${choiceTopic?.name||card.name} · Elegir documento · Criterios de referencia`;
      return;
    }
    state.recent = [id,...state.recent.filter(x => x !== id)].slice(0,30);
    safeWrite(localStorage, `${STORE}:recent`, state.recent);
    const source = sourceFor(card), ptype = cardPriorityType(card);
    const topic = state.topicIndex.byCard.get(id);
    panel.innerHTML = `<div class="detail-topbar no-print"><a class="back-link" href="#" id="back-to-results">${icon('back')}Volver a resultados</a><div class="detail-tools"><button class="icon-button" id="detail-favorite" type="button" title="Guardar en favoritas" aria-label="Guardar en favoritas">${icon('star')}</button><button class="icon-button" id="detail-share" type="button" title="Compartir ficha" aria-label="Compartir ficha">${icon('share')}</button><button class="icon-button" id="detail-print" type="button" title="Imprimir ficha" aria-label="Imprimir ficha">${icon('print')}</button></div></div><div class="detail-title-row"><p class="detail-specialty"><span class="specialty-dot"></span>${esc(card.specialty)}</p><h1 id="detail-title" tabindex="-1">${esc(topic?.name||card.name)}</h1><div class="card-badges">${statusBadge(source,card)}<span class="badge">Fuente ${esc(card.sourceId)} · ${esc(pageLabel(card))}</span></div></div>${topicSourcesHTML(topic,card)}<div class="active-document-label"><strong>Documento elegido: ${esc(source.id)}</strong><span>${esc(card.name)} · ${esc(source.titulo)}</span><span><b>Ámbito:</b> ${esc(source.alcance||card.scope||'No identificado en la copia')}</span></div>${sourceStatusNote(source,card)}${card.priority ? `<section class="priority-panel ${ptype}">${icon(ptype === 'urgent' ? 'info' : 'clock')}<div><strong>Prioridad y destino según la fuente</strong><p>${esc(card.priority)}</p></div></section>` : ''}<div class="detail-layout single-reading">${checklistHTML(card)}${sourceTranscriptionHTML(card)}${sourcePanel(source,card)}</div>${feedbackPanel(card)}`;
    $('#detail-source-select')?.addEventListener('change',event=>chooseDocument(event.target.value));
    updateDetailFavorite(); updateChecklist(card); applyDetailTab(state.detailTab);
    window.trackReferenceEvent?.('reference_open',{card_id:card.id});
    document.title = `${card.name} · Criterios de referencia`;
    $('#detail-print').addEventListener('click',() => {
      saveDetailReading();
      const checkedByCard=Object.fromEntries(state.cards.filter(item=>item.sourceId===card.sourceId&&norm(item.specialty)===norm(card.specialty)).map(item=>[item.id,[...getChecked(item.id)]]));
      printCard({card,cards:state.cards,sources:state.sources,topics:state.topics,checkedByCard,button:$('#detail-print'),onStatus:announce});
    });
    $('#detail-favorite').addEventListener('click',() => toggleFavorite(id));
    $('#detail-share').addEventListener('click',() => shareCard({card,title:topic?.name||card.name,url:location.href,button:$('#detail-share'),onStatus:announce}));
    $('#copy-reference').addEventListener('click',() => copyText(referenceTemplate(card),'Esquema copiado. Complete los datos clínicos en el expediente.'));
    $('#copy-missing').addEventListener('click',() => copyText(missingTemplate(card),'Elementos por revisar copiados.'));
    $('#reset-checklist').addEventListener('click',() => {
      reviewGroups(card).forEach(group=>safeWrite(sessionStorage,`${STORE}:checks:${group.card.id}`,[]));
      $$('[data-check-id]',panel).forEach(input => input.checked=false);updateChecklist(card);announce('Se desmarcaron todas las casillas de esta ficha y de sus requisitos generales.');
    });
    panel.onchange = event => {
      if (!event.target.matches('[data-check-id]')) return;
      const reviewId=event.target.dataset.checkCardId;
      if(!reviewGroups(card).some(group=>group.card.id===reviewId))return;
      const checked = $$('[data-check-id]:checked',panel).filter(input=>input.dataset.checkCardId===reviewId).map(input => input.dataset.checkId);
      safeWrite(sessionStorage,`${STORE}:checks:${reviewId}`,checked);updateChecklist(card);
    };
    $('#document-transcription')?.addEventListener('toggle',event=>{state.detailTab=event.target.open?'full':'summary';saveDetailReading();});
  }
  function referenceTemplate(card) {
    const source = sourceFor(card);
    const general=generalRequirementsForCard(card,state.cards);
    return [
      'ESQUEMA PARA COMPLETAR LA REFERENCIA',
      `Especialidad consultada: ${card.specialty}`,
      `Patología consultada en la guía: ${card.name}`,
      '',
      'Motivo de la referencia:\n',
      'Criterio aplicable documentado:\n',
      'Evolución, antecedentes y examen físico pertinentes:\n',
      'Estudios aportados y sus resultados:\n',
      edusGuidanceForCard(card,state.cards)?'Ubicación y fecha de los estudios en EDUS. Si se incorporaron documentos mediante Asistente EDUS, indicar expresamente cuáles están en sus adjuntos:\n':'',
      'Tratamiento previo y respuesta:\n',
      'Prioridad y destino sustentados en la valoración:\n',
      'Justificación clínica de la referencia:\n',
      'Completar únicamente con la información de la persona valorada y los criterios que correspondan a su caso.',
      general.length?`Revisar también los requisitos generales de ${card.specialty}, de esta misma fuente: ${general.map(item=>`${item.name} (${pageLabel(item)})`).join('; ')}.`:'',
      `Fuente consultada: ${source.titulo}`,
      `${source.codigo || source.id}. ${pageLabel(card)}.`,
      source.documentStatus==='review'?`Verificar continuidad del documento. Vigencia declarada: ${source.vigencia || 'no confirmada'}.`:''
    ].join('\n').trim();
  }
  function missingTemplate(card) {
    const source=sourceFor(card),groups=reviewGroups(card);
    const sections=groups.map(group=>{
      const pending=group.entries.filter(item=>!group.checked.has(item.id));
      const title=group.general?'REQUISITOS GENERALES':'CRITERIOS DE ESTA FICHA';
      const body=pending.length?pending.map(item=>`- ${item.text}${item.requirement==='desirable'?' (deseable según la fuente)':item.requirement==='conditional'?' (según el caso)':''}`).join('\n'):group.entries.length?'Las casillas de este apartado están marcadas como revisadas.':'Este apartado no tiene casillas separadas. Revise el texto de la fuente antes de enviar.';
      return `${title}: ${group.card.name}\nFuente ${group.card.sourceId}. ${pageLabel(group.card)}.\n${body}`;
    });
    return [`ASPECTOS PENDIENTES DE REVISAR O DOCUMENTAR`,`${card.specialty}: ${card.name}`,'',sections.join('\n\n'),'',`Las casillas sin marcar indican aspectos pendientes de revisión en esta sesión. No prueban que falte información en una referencia ni que todos los criterios se apliquen al caso. Las marcas no certifican pertinencia clínica.`,edusGuidanceForCard(card,state.cards)?'ORIENTACIÓN OPERATIVA SOBRE ESTUDIOS EN EDUS\n'+edusGuidanceForCard(card,state.cards).body+'\n'+edusGuidanceForCard(card,state.cards).scopeNote+(edusGuidanceForCard(card,state.cards).originalsNote?'\n'+edusGuidanceForCard(card,state.cards).originalsNote:''):'',`Fuente: ${source.titulo}`].join('\n');
  }
  async function copyText(text,message) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.cssText='position:fixed;left:0;top:0;opacity:0;pointer-events:none';document.body.append(area);area.focus();area.select();
        const success=document.execCommand('copy');area.remove();if(!success) throw Error('clipboard');
      }
      announce(message);
    } catch { announce('El navegador no permitió copiar. Seleccione el texto de la ficha para copiarlo.'); }
  }
  function renderSources() {
    const groups = [{title:'Fuentes nacionales',items:state.sources.filter(s => /^N/.test(s.id))},{title:'Documentos regionales y de servicio',items:state.sources.filter(s => /^R/.test(s.id))},{title:'Documentos identificados por obtener',items:state.sources.filter(s => !/^[NR]/.test(s.id))}];
    return `<a class="back-link" href="#">${icon('back')}Volver al catálogo</a><div class="info-page-heading"><p class="eyebrow">Respaldo documental</p><h1>Fuentes y versiones</h1><p>Cada ficha conserva el documento y la página de origen. El alcance regional, los periodos impresos y los documentos por obtener se mantienen visibles. Los complementos marcados “sin fichas clínicas todavía” se ofrecen como PDF y aún no forman parte de la búsqueda por diagnóstico.</p></div>${groups.map(group => group.items.length ? `<h2 class="source-group-title">${esc(group.title)}</h2>${group.items.map(source => `<article class="source-card"><div class="source-card-header"><div><span class="source-card-id">${esc(source.id)}${source.tema?' · '+esc(source.tema):''}</span><h2>${esc(source.titulo)}</h2></div></div><div class="card-badges">${statusBadge(source)}</div><div class="source-metadata" style="margin-top:12px"><span>${esc(source.codigo || 'Sin código identificado')}</span><span>${esc(source.fecha || 'Sin fecha confirmada')}</span>${source.pageCount?`<span>${esc(source.pageCount)} páginas</span>`:''}</div><p><strong>Alcance:</strong> ${esc(source.alcance || 'Por documentar')}<br><strong>Vigencia declarada:</strong> ${esc(source.vigencia || 'No confirmada')}</p>${source.estado?`<p>${esc(source.estado)}</p>`:''}${source.limites?`<p>${esc(source.limites)}</p>`:''}<div class="source-actions">${source.localPdf||source.pageImageBase?sourceActions(source):source.enlace?`<a class="button button-secondary" href="${esc(validURL(source.enlace))}" target="_blank" rel="noopener noreferrer">${icon('external')}Ver respaldo de la identificación</a>`:''}</div></article>`).join('')}`:'').join('')}`;
  }
  function renderGuide() {
    const steps=[
      ['Busque la patología','Escriba el diagnóstico, un síntoma o una palabra del criterio. Puede reducir los resultados por especialidad, alcance o documento. El catálogo inicial reúne las referencias hacia atención especializada; los criterios de retorno se consultan desde su documento.'],
      ['Elija el documento aplicable','La ficha identifica si el criterio es nacional, regional o de un servicio. Si un tema reúne varias fuentes, elija el documento según el destino de la referencia y su ámbito antes de consultar las casillas. La fuente nacional o más reciente no sustituye automáticamente a las otras. Un filtro explícito por documento se respeta al abrir desde el catálogo. Las marcas permanecen separadas por documento.'],
      ['Compruebe los requisitos','Revise los criterios clínicos, el manejo previo y los estudios. La lista distingue los requisitos deseables o condicionados. Las marcas se conservan durante esta sesión y pueden limpiarse para una nueva revisión.'],
      ['Consigne la información en el expediente','Puede copiar un esquema para completar la referencia en el sistema institucional. La app no recibe nombres ni información clínica de pacientes. El esquema no reemplaza la valoración ni la justificación del profesional.'],
      ['Disponga de los estudios en EDUS','Si los estudios ya están disponibles en EDUS, indique su fecha y ubicación. Si recibe resultados o informes impresos que no constan en el expediente, incorpórelos mediante Asistente EDUS conforme al procedimiento institucional e indique cuáles están en sus adjuntos. Conserve las exigencias de imágenes y materiales originales que establezca la fuente.'],
      ['Consulte la página original','“Ver páginas de la fuente” abre el documento con un botón para volver a la ficha. “Guardar o compartir PDF” prepara el archivo para el menú de su dispositivo. En iPhone, elija Guardar en Archivos o Imprimir. Los documentos completos se preparan únicamente cuando usted lo solicita.'],
      ['Use favoritas, impresión y revisión de filtro','La estrella guarda sus fichas frecuentes en este dispositivo. El botón de impresora prepara una copia legible. El médico filtrador puede copiar elementos por revisar; una casilla sin marcar no demuestra que una referencia esté incompleta.']
    ];
    return `<a class="back-link" href="#">${icon('back')}Volver al catálogo</a><div class="info-page-heading"><p class="eyebrow">Una consulta, una referencia mejor sustentada</p><h1>Cómo usarla</h1><p>Una herramienta de consulta para Medicina General y para la revisión de referencias, con acceso a los documentos que respaldan cada criterio.</p></div><div class="guide-grid">${steps.map((step,i)=>`<section class="guide-card"><span class="section-number">${i+1}</span><h2>${esc(step[0])}</h2><p>${esc(step[1])}</p></section>`).join('')}</div>`;
  }
  function renderAbout() {
    return `<a class="back-link" href="#">${icon('back')}Volver al catálogo</a><div class="info-page-heading"><p class="eyebrow">Iniciativa de la DRIPSSHA · Huetar Atlántica</p><h1>Créditos y contacto</h1><p>Criterios de referencia: los documentos de respaldo disponibles en el momento de la consulta.</p></div><div class="credits-grid"><section class="info-panel about-panel"><h2>Iniciativa regional</h2><p><strong>Dirección de Red Integrada de Prestación de Servicios de Salud Huetar Atlántica</strong><br>DRIPSSHA · Caja Costarricense de Seguro Social</p><p>Iniciativa de la herramienta y organización del contenido para facilitar la consulta de los criterios de referencia.</p></section><section class="info-panel about-panel"><h2>Documentos de respaldo</h2><p>Los documentos institucionales corresponden a la CCSS y a los equipos autores identificados en cada fuente. La app organiza su consulta, conserva sus condiciones y enlaza las páginas de respaldo.</p><p>La autoría, el alcance, el aval identificado y la vigencia declarada se presentan en <a href="#fuentes">Fuentes y versiones</a>. Los documentos regionales, de servicio o de procedencia pendiente mantienen esa identificación.</p><p>La disponibilidad de un documento en esta app no confirma por sí misma su vigencia ni sustituye el aval institucional de sus criterios.</p></section></div><section class="info-panel about-panel"><h2>El propósito</h2><p>Facilitar la consulta de los criterios institucionales para preparar referencias completas desde el primer nivel y apoyar su revisión. Cada ficha reúne las condiciones documentadas para referir, con los requisitos y su fuente.</p><h2>Actualización del contenido</h2><p>Actualizada: <time datetime="${esc(APP_RELEASE.updatedAt)}">${esc(UPDATED_LABEL)}</time> · Costa Rica.</p><p>Corte documental: 28 de octubre de 2026. Las fichas se basan en las copias identificadas en Fuentes. Los documentos con periodos impresos concluidos o procedencia pendiente se identifican como tales.</p><p>Favoritas y consultas recientes se guardan en este dispositivo. Las marcas de revisión se conservan durante la sesión del navegador. Esta versión está disponible para revisión de su contenido y funcionamiento.</p></section>${feedbackPanel()}`;
  }
  function renderUpdateDate() {
    $$('[data-app-updated]').forEach(item=>{
      item.dateTime=APP_RELEASE.updatedAt;
      item.textContent=UPDATED_LABEL;
    });
  }
  function showScreen(name) {
    $('#catalog-screen').hidden=name!=='catalog';$('#detail-screen').hidden=name!=='detail';$('#info-screen').hidden=name!=='info';
    $$('[data-catalog-only]').forEach(entry=>entry.hidden=name!=='catalog');
    $$('.utility-nav [data-nav]').forEach(link=>{ if(location.hash==='#'+link.dataset.nav) link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    state.lastScreen=name;
  }
  function handleRoute() {
    if(!state.ready)return;
    const hash=location.hash.replace(/^#/,'');
    if(state.lastScreen==='catalog') saveCatalog(window.scrollY);
    if(state.lastScreen==='detail') saveDetailReading();
    if(hash.startsWith('ficha/')){
      let id;try{id=decodeURIComponent(hash.slice(6));}catch{id='';}
      const returnMarker=safeRead(sessionStorage,`${STORE}:returnDetail`,null),restoreReading=returnMarker?.id===id;
      if(returnMarker)safeWrite(sessionStorage,`${STORE}:returnDetail`,null);
      showScreen('detail');renderDetail(id,restoreReading);
      const reading=restoreReading?detailReading(id):{scrollY:0};
      requestAnimationFrame(()=>{$('#detail-title')?.focus({preventScroll:true});window.scrollTo(0,reading.scrollY);});
    }else if(['guia','fuentes','acerca','cambios'].includes(hash)){
      state.currentId='';showScreen('info');$('#info-screen').innerHTML=hash==='fuentes'?renderSources():hash==='guia'?renderGuide():renderAbout();
      document.title=`${hash==='fuentes'?'Fuentes y versiones':hash==='guia'?'Cómo usarla':'Créditos y contacto'} · Criterios de referencia`;window.scrollTo(0,0);
    }else{
      state.currentId='';showScreen('catalog');renderCatalog();document.title='Criterios de referencia · DRIPSSHA';
      requestAnimationFrame(()=>window.scrollTo(0,state.scroll));
    }
  }
  function resetFilters() {
    state.query='';state.specialty='';state.scope='';state.priority='';state.source='';state.visible=PAGE_SIZE;
    syncControls();renderCatalog();saveCatalog(0);
  }
  function removeFilter(key) {
    if(!['query','specialty','scope','priority','source'].includes(key))return;
    state[key]='';state.visible=PAGE_SIZE;renderCatalog();saveCatalog(0);
  }
  function attachEvents() {
    $('#search').addEventListener('input',event=>{const hadQuery=Boolean(norm(state.query));state.query=event.target.value;if(!hadQuery&&norm(state.query))state.sort='relevance';state.visible=PAGE_SIZE;clearTimeout(state.debounce);state.debounce=setTimeout(()=>{renderCatalog();saveCatalog(0);},120);});
    $('#clear-search').addEventListener('click',()=>{state.query='';state.visible=PAGE_SIZE;$('#search').value='';renderCatalog();saveCatalog(0);$('#search').focus();});
    for(const [id,key] of [['specialty-filter','specialty'],['scope-filter','scope'],['priority-filter','priority'],['source-filter','source'],['sort-order','sort']]) $('#'+id).addEventListener('change',event=>{state[key]=event.target.value;state.visible=PAGE_SIZE;renderCatalog();saveCatalog(0);});
    $('#filter-toggle').addEventListener('click',()=>{state.filtersOpen=!state.filtersOpen;syncControls();saveCatalog();});
    $$('[data-list-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.listMode)));
    $('#reset-filters').addEventListener('click',resetFilters);
    $('#active-filter-list').addEventListener('click',event=>{const button=event.target.closest('[data-remove-filter]');if(button)removeFilter(button.dataset.removeFilter);});
    $('#empty-remove-priority').addEventListener('click',()=>removeFilter('priority'));
    $('#empty-reset').addEventListener('click',()=>{state.mode='all';resetFilters();});
    $('#load-more').addEventListener('click',()=>{state.visible+=PAGE_SIZE;renderCatalog(true);saveCatalog(window.scrollY);});
    $('#catalog-screen').addEventListener('click',event=>{const favorite=event.target.closest('[data-favorite]');if(favorite){toggleFavorite(favorite.dataset.favorite);return;}if(event.target.closest('[data-card-link]')){saveCatalog(window.scrollY);state.navigatingFromCatalog=true;}});
    document.addEventListener('click',event=>{
      const sourceChoice=event.target.closest('[data-source-choice]');
      if(sourceChoice){event.preventDefault();chooseDocument(sourceChoice.dataset.sourceChoice);return;}
      if(state.currentId&&!$('#detail-screen').hidden&&event.target.closest('a[data-source-action="pages"],a[href^="./?screen=source"]')){saveDetailReading();safeWrite(sessionStorage,`${STORE}:returnDetail`,{id:state.currentId});}
      if(event.target.closest('[data-copy-email]')){copyText(REPORT_EMAIL,'Correo de contacto copiado.');return;}
      if(event.target.closest('[data-copy-report]')){const card=state.cards.find(item=>item.id===state.currentId);copyText(reportText(card),'Datos del reporte copiados. Complete su observación en el correo.');return;}
    });
    document.addEventListener('keydown',event=>{if(event.key==='/'&&!document.querySelector('dialog[open]')&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();if($('#catalog-screen').hidden)location.hash='';requestAnimationFrame(()=>$('#search').focus());}});
    window.addEventListener('hashchange',handleRoute);
    window.addEventListener('pagehide',()=>{if(!$('#catalog-screen').hidden)saveCatalog(window.scrollY);else saveDetailReading();});
    window.addEventListener('pageshow',event=>{if(event.persisted&&state.ready){
      if(!$('#catalog-screen').hidden){syncControls();renderCatalog();}
      if(state.currentId){
        const card=state.cards.find(c=>c.id===state.currentId);if(card)updateChecklist(card);
        const marker=safeRead(sessionStorage,`${STORE}:returnDetail`,null);
        if(marker?.id===state.currentId){const reading=detailReading(state.currentId);safeWrite(sessionStorage,`${STORE}:returnDetail`,null);applyDetailTab(reading.detailTab);requestAnimationFrame(()=>window.scrollTo(0,reading.scrollY));}
      }
    }});
    window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
    window.addEventListener('storage',event=>{if(event.key===`${STORE}:favorites`){state.favorites=new Set(safeRead(localStorage,`${STORE}:favorites`,[]).filter(id=>state.cards.some(card=>card.id===id&&isCatalogCard(card))));updateFavoriteCounts();if(!$('#catalog-screen').hidden)renderCatalog();if(state.currentId)updateDetailFavorite();}});
  }
  function updateNetwork(){ $('#offline-note').hidden=navigator.onLine; }
  async function fetchJSON(url) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(url,{signal:controller.signal,cache:'no-cache'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();if(!data||typeof data!=='object')throw new Error('Formato de datos incorrecto');return data;
    }finally{clearTimeout(timer);}
  }
  async function loadData() {
    $('#results-grid').setAttribute('aria-busy','true');
    try{
      const [cards,sources,topics]=await Promise.all([fetchJSON('data/cards.json'),fetchJSON('data/sources.json'),fetchJSON('data/topics.json')]);
      if(!Array.isArray(cards)||!Array.isArray(sources)||!Array.isArray(topics.groups))throw new Error('Formato de datos incorrecto');
      state.sources=sources;state.sourceMap=new Map(sources.map(source=>[source.id,source]));
      state.cards=cards.filter(card=>card&&card.id&&card.name&&card.specialty).map(card=>({...card,aliases:arr(card.aliases),criteria:arr(card.criteria),studies:arr(card.studies),prior:arr(card.prior),notes:arr(card.notes),pages:arr(card.pages)}));
      state.topicIndex=createTopicIndex(state.cards,topics.groups);state.topics=state.topicIndex.topics;
      state.index=new Map(state.cards.map(card=>[card.id,buildIndex(card)]));state.ready=true;
      const activeIds=new Set(state.cards.filter(isCatalogCard).map(card=>card.id));
      state.favorites=new Set([...state.favorites].filter(id=>activeIds.has(id)));state.recent=state.recent.filter(id=>activeIds.has(id));
      populateFilters();handleRoute();window.ReferenceDocumentEntry?.ready();
    }catch(error){
      window.ReferenceDocumentEntry?.fail();
      $('#results-grid').innerHTML=`<div class="data-error" style="grid-column:1/-1"><strong>No se pudo cargar el catálogo.</strong><br>${error.name==='AbortError'?'La conexión tardó más de lo previsto.':'Compruebe su conexión e inténtelo de nuevo.'}<br><button id="retry-data" class="button button-secondary" type="button" style="margin-top:12px">Reintentar carga</button></div>`;
      $('#results-grid').setAttribute('aria-busy','false');$('#result-count').textContent='Catálogo pendiente de carga';$('#retry-data').addEventListener('click',loadData);
    }
  }
  async function installServiceWorker() {
    if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;
    try{const hadController=Boolean(navigator.serviceWorker.controller);let refreshed=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!refreshed){refreshed=true;location.reload();}});await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});}catch{ /* La consulta no depende del registro sin conexión. */ }
  }
  renderUpdateDate();attachEvents();updateNetwork();loadData();installServiceWorker();
})();
