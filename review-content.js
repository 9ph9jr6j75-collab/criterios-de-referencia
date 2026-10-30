/* Una sola lectura operativa; el texto documental completo se conserva aparte. */
const arr = value => Array.isArray(value) ? value.filter(item => item !== null && item !== undefined) : value ? [value] : [];
const textOf = value => value && typeof value === 'object' ? String(value.text ?? value.label ?? '') : String(value ?? '');
const genericGeneralNote = 'Incluir los datos generales, antecedentes y examen físico que establece la fuente.';

// No se eliminan signos, cifras, unidades, tildes ni cláusulas. Solo se ignora
// el espacio de presentación y el prefijo que añade la propia herramienta.
function comparisonText(value) {
  return textOf(value).normalize('NFC').replace(/\s+/g, ' ').trim()
    .replace(/^Documentar el criterio de referencia aplicable:\s*/i, '');
}

function normalizedEntries(card) {
  const studies = arr(card?.studies);
  return arr(card?.checklist).map((entry, index) => {
    const item = typeof entry === 'string' ? {text: entry} : {...entry};
    const text = item.text || item.label || '';
    const requirement = item.requirement || item.type || 'source';
    const study = studies.find(value => comparisonText(value) === comparisonText(text));
    // El antiguo resumen mostraba el tipo del estudio. Se conserva en la misma
    // fila cuando la casilla todavía tiene la etiqueta genérica "source".
    const sourceRequirement = requirement === 'source' && ['required', 'conditional', 'desirable'].includes(study?.type) ? study.type : null;
    return {...item, id: item.id || `c${index + 1}`, text, requirement, ...(sourceRequirement ? {sourceRequirement} : {})};
  }).filter(entry => entry.text);
}

function entryGroup(card, entry) {
  if (card?.inlineGeneral || card?.category === 'general' || /^requisitos generales/i.test(card?.name || '') || entry.kind === 'general') {
    return ['general', 'Requisitos generales'];
  }
  switch (entry.kind) {
    case 'study': return ['study', 'Estudios y valoraciones previas'];
    case 'prior': return ['prior', 'Antes de referir'];
    case 'history': return ['history', 'Información para la referencia'];
    case 'treatment': return ['treatment', 'Tratamiento previo'];
    case 'criterion': return ['criterion', /^(?:II|III|2|3)\s*(?:-|→|A)\s*(?:I|1)$/i.test(card?.direction || '') ? 'Condiciones de retorno al primer nivel' : 'Criterios para referir'];
    default: return ['other', 'Aspectos por revisar'];
  }
}

/** Consecutive segments preserve the original checklist order and identities. */
export function reviewBuckets(card) {
  const buckets = [];
  for (const entry of normalizedEntries(card)) {
    const [kind, title] = entryGroup(card, entry);
    let bucket = buckets.at(-1);
    if (!bucket || bucket.kind !== kind) {
      bucket = {key: `${kind}-${buckets.length + 1}`, kind, title, entries: []};
      buckets.push(bucket);
    }
    bucket.entries.push(entry);
  }
  return buckets;
}

/**
 * Clinical content not already present in this document's checklist.
 * representedTexts must come only from the selected source and associated
 * general requirements. Scope, direction, priority and document warnings stay
 * in their existing dedicated notices, outside this function.
 */
export function reviewSupplements(card, {representedTexts = [], hasGeneral = false} = {}) {
  const entries = normalizedEntries(card);
  const general = card?.inlineGeneral || card?.category === 'general' || /^requisitos generales/i.test(card?.name || '');
  const checklistSequence = entries.map(entry => comparisonText(entry.text)).join(' ');
  // Algunas listas generales conservan un encabezado antes de la misma
  // secuencia íntegra de casillas. Se admite solo ese encabezado editorial;
  // la numeración y todos los signos y términos clínicos deben coincidir.
  const coveredGeneralSequence = text => Boolean(general && checklistSequence &&
    comparisonText(text).replace(/^Indicaciones generales(?:\s*:\s*|\s+)/i, '') === checklistSequence);
  const shown = new Set([...entries.map(entry => entry.text), ...arr(representedTexts)].map(comparisonText).filter(Boolean));
  const output = [];
  const candidates = [
    ['Contexto de la fuente', arr(card?.context)],
    ['Destino indicado en la fuente', arr(card?.route)],
    // Solo las fichas generales revisadas expresamente pueden sustituir la
    // antigua extracción en prosa por notas de lectura. Sus instrucciones
    // completas están en las casillas y la transcripción permanece íntegra.
    [general ? 'Precisiones de requisitos generales' : 'Criterios documentados', general && Array.isArray(card?.reviewNotes) ? card.reviewNotes : arr(card?.criteria)],
    ['Antes de referir', arr(card?.prior)],
    ['Estudios y valoraciones previas', arr(card?.studies)],
    ['Precisiones sobre estudios', arr(card?.studiesNote)],
    ['Observaciones de la fuente', arr(card?.notes)],
    ['Precisiones documentales', arr(card?.flags)]
  ];
  for (const [title, values] of candidates) {
    const texts = values.map(textOf).filter(text => comparisonText(text));
    // A whole structured list may already be one unchanged checklist entry.
    // This is exact complete-list equality, never a substring match.
    const wholeListCovered = texts.length > 1 && shown.has(comparisonText(texts.join('\n')));
    const items = [];
    for (const text of texts) {
      const key = comparisonText(text);
      const generalReminder = hasGeneral && key === comparisonText(genericGeneralNote);
      if (!wholeListCovered && !shown.has(key) && !generalReminder && !coveredGeneralSequence(text)) items.push(text);
      shown.add(key);
    }
    if (items.length) output.push({title, items});
    // StudiesNote often contains the entire ordered study list as one line.
    // Every study is now either shown as a checkbox or preserved above.
    if (title === 'Estudios y valoraciones previas' && texts.length) shown.add(comparisonText(texts.join('\n')));
  }
  const hasStructuredContent = candidates.some(([, values]) => values.some(value => comparisonText(value)));
  if (!entries.length && !hasStructuredContent && comparisonText(card?.fullText)) {
    output.push({title: 'Criterio documentado', items: [String(card.fullText)]});
  }
  return output;
}
