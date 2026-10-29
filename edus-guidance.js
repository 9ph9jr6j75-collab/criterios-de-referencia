/* Orientación operativa de la herramienta. No modifica los criterios documentales. */
import {generalRequirementsForCard,isCatalogCard} from './catalog.js';

export const EDUS_GUIDANCE = Object.freeze({
  title:'Disponibilidad de estudios en EDUS',
  body:'Compruebe que los estudios solicitados por esta fuente o aportados durante la consulta estén disponibles para el especialista. Si ya constan en EDUS, indique su fecha y ubicación. Los resultados o informes impresos que no estén incorporados, incluidos los de servicios privados, deben digitalizarse mediante Asistente EDUS conforme al procedimiento institucional. Indique expresamente en la referencia qué estudios se encuentran en sus adjuntos y la fecha de cada uno.',
  scopeNote:'Esta orientación explica cómo disponer de los estudios solicitados o aportados; no agrega exámenes a los criterios de la fuente ni exige duplicar resultados que ya están accesibles en EDUS.',
  originalsNote:'Si la fuente solicita imágenes o material de anatomía patológica original, mantenga esa indicación. Digitalizar el informe no sustituye ese material. Una fotografía de una placa no equivale por sí sola a la imagen diagnóstica original.',
  label:'Orientación operativa de la app',
  sources:Object.freeze([
    Object.freeze({label:'CCSS · Digitalización de documentos físicos, pp. 20-21',url:'https://www.cendeisss.sa.cr/wp/wp-content/uploads/2024/10/CENDEISSS-AB-0169-2024-Informe-Seguimiento-CI-II-Semestre-2023-firmado.pdf',document:'CENDEISSS-AB-0169-2024',pages:[20,21]}),
    Object.freeze({label:'CCSS · Lineamiento de electrocardiogramas 2026, p. 12',url:'https://repositorio.binasss.sa.cr/server/api/core/bitstreams/7663901b-9e6e-4792-a8f7-6445294106d4/content',document:'L.GM.DDSS.AAIP-08012026',pages:[12]})
  ])
});

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const fieldText=value=>Array.isArray(value)?value.flatMap(fieldText):typeof value==='string'?[value]:value&&typeof value==='object'&&typeof value.text==='string'?[value.text]:[];
const segments=card=>['criteria','studies','studiesNote','prior','notes','fullText','checklist'].flatMap(key=>fieldText(card?.[key]));
const absent=/^(?:no (?:requiere(?:n)?|amerita(?:n)?|se (?:requiere(?:n)?|solicita(?:n)?|especifica(?:n)?|indica(?:n)?))|ningun[oa]s?|sin (?:estudios|examenes|laboratorios|requisitos))(?:\s+(?:de\s+)?(?:otros?\s+)?(?:examenes|estudios|laboratorios|gabinete|previos?|complementarios?|adicionales?|especificos?|requisitos|para referir))*[.\s]*$/;
// Terms denote a result, diagnostic study or report, not physical examination,
// photophobia or photoprotection. A mere mention in diagnostic prose is not an order.
const study=/\b(?:laboratorios?|gabinete|radiograf\w*|rayos? x|rx|ekg|ecg|electrocardiogr\w*|ultrason\w*|us|tac|tomograf\w*|rmn?|resonancia|mamograf\w*|densitometr\w*|endoscop\w*|gastroscop\w*|colonoscop\w*|biops\w*|citolog\w*|papanicolaou|pap|hemogram\w*|leucogram\w*|glicemi\w*|glucemi\w*|creatinin\w*|proteinur\w*|albuminur\w*|electrolit\w*|urocultiv\w*|coprocultiv\w*|serolog\w*|espirometr\w*|audiometr\w*|timpanometr\w*|snellen|ecocardiograf\w*|ecograf\w*|neuroimagen\w*|rectoscop\w*|esofagogr\w*|cistograf\w*|electromiograf\w*|espermogr\w*|hemoglob\w*|reticulocit\w*|frotis|cultivo\w*|guayaco|heces|orina|bilirrubin\w*|transaminas\w*|coagulacion|albumin\w*|coombs|prolactin\w*|insulin\w*|estradiol|progesteron\w*|testosteron\w*|colesterol|triglicer\w*|amilas\w*|ferritin\w*|pfr|pfh|pft|b12|vih|hiv|vdrl|ves|pcr|tsh|tp|tpt|inr|hba1c|hb|bun|ego|ape|psa|hcg|fsh|lh|prl|dheas|dhl|baaf)\b|\b(?:pruebas? de funcion|p\.?\s*f\.?\s*(?:renal|hepatica|tiroidea)|perfil (?:lipidico|hormonal)|ac(?:ido)?\.? urico|acido folico|sangre oculta|test (?:de ureasa|de aliento|de sullivan)|colon(?: por)?[ /]enema|grupo (?:abo|sanguineo)|niveles sericos|marcadores tumorales|agudeza visual|estudios? (?:de imagen|complementarios?|diagnosticos?)|resultados? de (?:examenes|estudios))/;
const action=/\b(?:adjunt\w*|aport\w*|incluir|inclui\w*|enviar|envia\w*|solicit\w*|llevar|lleve|traer|traiga|debe\w*|contar con|report\w*|resultad\w*|realizad\w*|previo\w*|document\w*|comprob\w*|demuest\w*|confirm\w*|estudio\w*|examenes)\b/;
const physical=/\b(?:originales?|placas?|laminas?|bloques? de biopsia|fotografias?|fotos?)\b/;
const physicalDelivery=/\b(?:originales?|llevar\w*|lleve\w*|traer\w*|traiga\w*|enviar\w*|envia\w*|adjuntar\w*|aportar\w*|aporte\w*|incluir|entregar\w*|contar con)\b/;
const negativeOrder=/^(?:no (?:requiere(?:n)?|amerita(?:n)?|solicitar|solicite|aportar|adjuntar|es necesario|son necesarios|se (?:requiere(?:n)?|solicita(?:n)?|debe(?:n)? solicitar))\b|sin indicacion de)/;
const clauses=text=>String(text||'').split(/\n|[.;]/).map(normalize).filter(Boolean);

function hasStudies(card) {
  // A named item in a study list is already a requirement from its source.
  // Sentinel values such as "No requiere" are not studies.
  const explicit=[...fieldText(card.studies),...(card.checklist||[]).filter(item=>item.kind==='study').flatMap(fieldText)];
  if(explicit.some(text=>{const t=normalize(text);return t&&!absent.test(t)&&!negativeOrder.test(t)&&(study.test(t)||/\b(?:estudios?|examenes)\b/.test(t)&&!/^requisitos? (?:y|o) examenes previos[.:\s]*$/.test(t));}))return true;
  return segments(card).some(text=>clauses(text).some(clause=>!absent.test(clause)&&study.test(clause)&&action.test(clause)&&!negativeOrder.test(clause)));
}

function hasOriginalMaterials(card) {
  return segments(card).some(text=>clauses(text).some(clause=>physical.test(clause)&&physicalDelivery.test(clause)&&(study.test(clause)||/\b(?:laminas?|bloques? de biopsia|placas?)\b/.test(clause))));
}

export function edusGuidanceForCard(card,cards=[]) {
  if(!card||!isCatalogCard(card))return null;
  const general=generalRequirementsForCard(card,cards);
  const applicable=[card,...general];
  if(!applicable.some(hasStudies))return null;
  const originals=applicable.some(hasOriginalMaterials);
  return {
    ...EDUS_GUIDANCE,
    originalsNote:originals?EDUS_GUIDANCE.originalsNote:'',
    hasOriginalMaterials:originals,
    generalSourceIds:[...new Set(general.filter(hasStudies).map(item=>item.sourceId))]
  };
}
