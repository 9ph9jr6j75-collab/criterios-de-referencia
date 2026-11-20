import fs from 'node:fs/promises';
import path from 'node:path';
import { createTopicIndex, isCatalogCard } from '../catalog.js';

async function readJSON(root, file) {
  return JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
}

function makeCard(guide, source, metadata) {
  const {id, name, aliases, sourceId, specialty, general, routes} = guide;
  const sections = [...general, ...routes.flatMap(route => route.sections)];
  const pages = [...new Set(sections.flatMap(section => section.pages))].sort((a, b) => a - b);
  const context = guide.context || routes.map(route => route.name).join(' · ');
  const description = sections.flatMap(section => [section.label, ...section.items, ...(section.notes || [])]).join('\n');
  return {
    id, name, aliases, sourceId, specialty, pages, context,
    additionalSpecialties: guide.additionalSpecialties || [],
    direction: guide.direction || 'Según destino', scope: source.alcance,
    priority: guide.priority || '', criteria: [], studies: [], prior: [], notes: [], checklist: [],
    fullText: [name, context, description].join('\n'),
    referralGuide: {general, routes, notice: [metadata.notice, guide.notice].filter(Boolean).join(' ')}
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

export async function compileGuideCatalog(root) {
  const [cards, topics, sources, previousRelease, guides, metadata] = await Promise.all([
    'data/cards.json','data/topics.json','data/sources.json','data/release.json',
    'content/referral-guides.json','content/referral-sources.json'
  ].map(filename => readJSON(root, filename)));
  const bySource = new Map(sources.map(source => [source.id, source]));
  const byTopic = new Map(topics.groups.map(topic => [topic.id, topic]));
  const byCard = new Map(cards.map(card => [card.id, card]));
  const toRender = [];
  for (const [id, details] of Object.entries(metadata)) {
    const source = bySource.get(id);
    if (!source || !source.localPdf) throw Error('Falta el PDF de ' + id);
    source.shortLabel = details.shortLabel;
    source.indexingStatus = details.documentOnly ? 'referenceOnly' : 'indexed';
    source.estado = source.estado.replace('PDF disponible en Fuentes; fichas clínicas pendientes de revisión. ', '');
    if (details.documentStatus) source.documentStatus = details.documentStatus;
    if (details.notice) source.limites = [source.limites, details.notice].filter(Boolean).join(' ');
    if (!details.documentOnly && !source.pageImageBase) {
      source.pageImageBase = 'assets/pages/' + id + '/';
      toRender.push(id);
    }
  }
  for (const guide of guides) {
    const {id, sourceId, groupWith} = guide;
    if (byCard.has(id) || !metadata[sourceId] || metadata[sourceId].documentOnly) throw Error('Ficha sin identificación válida: ' + id);
    const card = makeCard(guide, bySource.get(sourceId), metadata[sourceId]);
    let topic;
    if (groupWith) {
      topic = byTopic.get(groupWith);
      if (!topic || topic.specialty !== card.specialty || topic.direction !== card.direction) throw Error('Tema incompatible con ' + id);
      topic.variantLabels ||= Object.fromEntries(topic.cardIds.map(key => [key, byCard.get(key).name]));
      topic.variantLabels[id] = guide.variantLabel || card.name;
      topic.cardIds.push(id);
    } else {
      topic = {id: 'topic-' + id, name: card.name, specialty: card.specialty, direction: card.direction, cardIds: [id]};
      topics.groups.push(topic);
      byTopic.set(topic.id, topic);
    }
    cards.push(card);
    byCard.set(id, card);
  }
  for (const guide of guides) {
    for (const link of guide.related || []) {
      const card = byCard.get(guide.id), other = byCard.get(link.id);
      if (!other || other.sourceId === card.sourceId) throw Error('Relación documental inválida: ' + link.id);
      if (link.searchAliases) other.aliases = [...new Set([...other.aliases, ...link.searchAliases])];
      (card.relatedCards ||= []).push({id: other.id, sourceId: other.sourceId, pages: link.pages, label: link.label});
      (other.relatedCards ||= []).push({id: card.id, sourceId: card.sourceId, pages: link.reversePages || card.pages.slice(0,1), label: card.name});
    }
  }
  const indexed = createTopicIndex(cards, topics.groups);
  const active = cards.filter(isCatalogCard);
  const activeTopics = indexed.topics.filter(topic => topic.cards.some(isCatalogCard));
  const specialtyCounts = countBy(active.flatMap(card => [...new Set([card.specialty,...(card.additionalSpecialties || [])])]));
  const release = {
    ...previousRelease, cards: active.length, registeredCards: cards.length, topics: activeTopics.length,
    sourceCounts: countBy(active.map(card => card.sourceId)), specialtyCounts,
    specialties: Object.keys(specialtyCounts).length,
    catalogTopics: activeTopics.filter(topic => topic.cards.some(card => isCatalogCard(card) && card.direction !== 'II-I')).length,
    multipleSourceTopics: activeTopics.filter(topic => new Set(topic.cards.filter(isCatalogCard).map(card => card.sourceId)).size > 1).length,
    referralGuides: guides.length
  };
  return {cards, topics, sources, release, toRender};
}
