/* Un tema en el catálogo; cada documento conserva sus propios criterios. */
export const isCatalogCard = card => card?.catalogStatus !== 'withheld';

export const isGeneralCard = card => Boolean(card && (card.category === 'general' || /^requisitos generales/i.test(card.name || '')));
const specialtyKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function referralDirection(card) {
  const value=String(card?.direction || 'I-II').trim().toUpperCase().replace(/\s+/g,'').replace(/[–—]/g,'-');
  const match=/^(I{1,3}|[123])(?:-|→|A)(I{1,3}|[123])$/.exec(value);
  if(!match)return null;
  const level=value=>({I:1,II:2,III:3}[value]||Number(value));
  return [level(match[1]),level(match[2])];
}

// Oncología conserva la ruta I-III declarada en su documento. La asociación
// exige la misma ruta; nunca se trasladan requisitos de envío a un retorno.
export function isReferralCard(card) {
  if(!card)return false;
  const direction=referralDirection(card);
  return Boolean(direction&&direction[0]===1&&direction[1]>direction[0]);
}

export function generalRequirementsForCard(card,cards) {
  if(!isCatalogCard(card)||!isReferralCard(card)||isGeneralCard(card))return [];
  const direction=referralDirection(card).join('-');
  const general=cards.filter(other=>isCatalogCard(other)&&isGeneralCard(other)&&isReferralCard(other)&&other.id!==card.id&&other.sourceId===card.sourceId&&specialtyKey(other.specialty)===specialtyKey(card.specialty)&&referralDirection(other).join('-')===direction);
  const inline=card.inlineGeneralRequirements;
  if(inline?.criteria?.length)general.push({id:card.id,sourceId:card.sourceId,specialty:card.specialty,direction:card.direction,category:'general',inlineGeneral:true,name:`Requisitos generales de ${card.specialty}`,pages:inline.pages,criteria:inline.criteria,notes:inline.notes||[],checklist:(card.checklist||[]).filter(item=>item.kind==='general'),fullText:inline.criteria.join('\n\n')});
  return general;
}

export function specificRequirementsForCard(card) {
  return card.inlineGeneralRequirements?.criteria?.length?{...card,checklist:(card.checklist||[]).filter(item=>item.kind!=='general')}:card;
}

export function generalRequirementsCoverage(members,cards) {
  const clinical=members.filter(card=>isCatalogCard(card)&&isReferralCard(card)&&!isGeneralCard(card));
  const included=clinical.filter(card=>generalRequirementsForCard(card,cards).length>0).length;
  return {total:clinical.length,included,label:included&&included===clinical.length?'Incluye requisitos generales y específicos':included?'Requisitos generales según documento':''};
}

export function showSpecialtyGeneralAccess({specialty,query='',mode='all'}={}) {
  return Boolean(specialty&&!String(query).trim()&&mode==='all');
}

export function includeGeneralSearchResult(card,{query=''}={}) {
  return !isGeneralCard(card)||!String(query).trim()||/\brequisitos\b|\bindicaciones generales\b/i.test(String(query));
}

function scopeForCard(card,sourceMap) {
  const source=sourceMap.get(card.sourceId)||{};
  if(/^N\d/.test(card.sourceId||'')||/nacional/i.test(source.alcance||card.scope||''))return 'national';
  if(source.documentStatus==='unverified'||/por documentar/i.test(card.scope||source.alcance||''))return 'unverified';
  return 'regional';
}

export function specialtyGeneralRequirements(cards,{specialty,source='',scope=''}={},sourceMap=new Map()) {
  // Una búsqueda o una lista personal reduce las patologías, no los requisitos
  // comunes del documento. Solo la especialidad, la fuente y el alcance los acotan.
  if(!specialty)return [];
  return orderDocuments(cards.filter(card=>isCatalogCard(card)&&isGeneralCard(card)&&isReferralCard(card)&&specialtyKey(card.specialty)===specialtyKey(specialty)&&sourceMap.has(card.sourceId)&&(!source||card.sourceId===source)&&(!scope||scopeForCard(card,sourceMap)===scope)),sourceMap);
}

export function createTopicIndex(cards, definitions) {
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const byCard = new Map(), byId = new Map();
  for (const definition of definitions) {
    const members = definition.cardIds.map(id => cardsById.get(id));
    if (!members.length || members.some(card => !card)) throw Error('Tema sin respaldo documental');
    if (byId.has(definition.id)) throw Error('Tema duplicado');
    const topic = {...definition, cards:members};
    byId.set(topic.id, topic);
    for (const card of members) {
      if (byCard.has(card.id) || card.specialty !== topic.specialty || (card.direction||'I-II') !== topic.direction) throw Error('Agrupación documental incorrecta');
      byCard.set(card.id, topic);
    }
  }
  if (byCard.size !== cards.length) throw Error('Hay fichas sin tema');
  return {byCard, byId, topics:[...byId.values()]};
}

export function documentRank(card, sourceMap) {
  const source = sourceMap.get(card.sourceId) || {};
  if (source.documentStatus === 'unverified') return 4;
  if (source.documentStatus === 'review') return 3;
  if (/^N\d/.test(card.sourceId)) return 0;
  return 1;
}

export function orderDocuments(cards, sourceMap) {
  return cards.filter(isCatalogCard).sort((a,b) => documentRank(a,sourceMap)-documentRank(b,sourceMap) || a.sourceId.localeCompare(b.sourceId,'es') || a.name.localeCompare(b.name,'es'));
}

export function groupResults(matchingCards, topicIndex, sourceMap, preferFirst = false) {
  const matches = new Map();
  for (const card of matchingCards) {
    if (!isCatalogCard(card)) continue;
    const topic = topicIndex.byCard.get(card.id);
    if (!matches.has(topic.id)) matches.set(topic.id,{topic,members:[]});
    matches.get(topic.id).members.push(card);
  }
  return [...matches.values()].map(({topic,members}) => ({
    ...(preferFirst ? members[0] : orderDocuments(members,sourceMap)[0]),
    topic, matchingCards:members, allCards:topic.cards.filter(isCatalogCard)
  }));
}

export function uniqueTopicCount(ids, topicIndex) {
  return new Set([...ids].map(id => {
    const topic=topicIndex.byCard.get(id);
    return topic?.cards.some(card=>card.id===id&&isCatalogCard(card))?topic.id:null;
  }).filter(Boolean)).size;
}

// El catálogo muestra el nombre del tema agrupado, no el de una variante.
// Los órdenes por coincidencia y consulta reciente ya llegan calculados.
export function orderCatalogTopics(results,{sort='name',query='',mode='all'}={}) {
  const ordered=[...results];
  if(mode==='recent'||(sort==='relevance'&&String(query||'').trim()))return ordered;
  const title=card=>card.topic?.name||card.name||'';
  const specialty=card=>card.topic?.specialty||card.specialty||'';
  ordered.sort((a,b)=>sort==='name'
    ?title(a).localeCompare(title(b),'es')||specialty(a).localeCompare(specialty(b),'es')
    :specialty(a).localeCompare(specialty(b),'es')||title(a).localeCompare(title(b),'es'));
  return ordered;
}
