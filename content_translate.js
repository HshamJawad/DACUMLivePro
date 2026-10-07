// ============================================================
// /content_translate.js
// AI translation of project content (3.79.0) — batching, prompt and
// terminology. Storage, switching and the user interface are in
// content_lang.js and settings_languages.js.
//
// Cost rules:
//   • only texts with no translation yet are sent (content_lang.js
//     planTranslation); a sentence that appears in ten places is sent
//     once;
//   • texts travel as a compact JSON object with short numeric ids;
//   • a batch stays well under the backend's 4,000 output tokens, so a
//     reply is never cut off half-way (Arabic takes more tokens per
//     word than English);
//   • only the glossary terms that occur in a batch go into its prompt.
// ============================================================

import { callAI, jobFocusLines, classifyAIError } from './ai_client.js';
import { splitText } from './content_lang.js';

export const BATCH_ITEMS = 40;
export const BATCH_CHARS = 3000;

const NAMES = { en: 'English', ar: 'Arabic', fr: 'French' };

/* DACUM / TVET terminology, aligned with the app's own interface
   wording in each language (translations.js), so a translated chart
   uses the same terms as the screens and the exported headings. */
export const GLOSSARY = [
  // en                                   ar                                   fr
  ['DACUM',                               'DACUM',                             'DACUM'],
  ['Duty',                                'واجب',                              'activité'],
  ['Task',                                'مهمة',                              'tâche'],
  ['Competency Cluster',                  'تجمع كفاءات',                       'groupe de compétences'],
  ['Competency',                          'كفاءة',                             'compétence'],
  ['Performance Criteria',                'معايير الأداء',                     'critères de performance'],
  ['Performance Standard',                'معيار الأداء',                      'norme de performance'],
  ['Performance Steps',                   'خطوات الأداء',                      'étapes d’exécution'],
  ['Range',                               'المدى',                             'champ d’application'],
  ['Learning Outcome',                    'محصلة تعلم',                        'résultat d’apprentissage'],
  ['Module',                              'وحدة تعليمية',                      'module'],
  ['Task Analysis',                       'تحليل المهمة',                      'analyse de la tâche'],
  ['Occupational Standard',               'المعيار المهني',                    'norme professionnelle'],
  ['Occupational Profile',                'الملف المهني',                      'profil professionnel'],
  ['Occupation',                          'مهنة',                              'métier'],
  ['Job',                                 'وظيفة',                             'emploi'],
  ['Knowledge',                           'المعرفة',                           'savoirs'],
  ['Skills',                              'المهارات',                          'savoir-faire'],
  ['Worker Behaviors',                    'سلوكيات العامل',                    'attitudes et comportements professionnels'],
  ['Tools, Equipment, Supplies and Materials', 'الأدوات والمعدات والمستلزمات والمواد', 'outils, équipements, fournitures et matériaux'],
  ['Future Trends and Concerns',          'الاتجاهات والمخاوف المستقبلية',     'tendances et enjeux futurs'],
  ['Career Path',                         'المسار المهني',                     'cheminement de carrière'],
  ['Occupational Safety and Health',      'السلامة والصحة المهنية',            'santé et sécurité au travail'],
  ['Personal Protective Equipment',       'معدات الوقاية الشخصية',             'équipement de protection individuelle'],
  ['Safety',                              'السلامة',                           'sécurité'],
  ['Troubleshooting',                     'تحري الأعطال وإصلاحها',             'dépannage'],
  ['Maintenance',                         'الصيانة',                           'maintenance'],
  ['Assessment',                          'التقييم',                           'évaluation'],
  ['Curriculum',                          'المنهج التدريبي',                   'programme de formation'],
  ['Trainee',                             'المتدرب',                           'apprenant'],
  ['Trainer',                             'المدرب',                            'formateur'],
  ['Facilitator',                         'الميسر',                            'animateur'],
  ['Workplace',                           'مكان العمل',                        'milieu de travail'],
  ['Procedure',                           'إجراء',                             'procédure'],
  ['Specifications',                      'المواصفات',                         'spécifications'],
];
const COL = { en: 0, ar: 1, fr: 2 };

function _glossaryFor(from, to, texts) {
  const hay = texts.join('\n').toLowerCase();
  return GLOSSARY
    .filter(row => row[COL[from]] && hay.includes(row[COL[from]].toLowerCase()))
    .map(row => `  ${row[COL[from]]} = ${row[COL[to]]}`);
}

const STYLE = {
  ar: 'Write Modern Standard Arabic (الفصحى) in a formal, professional register. ' +
      'Task and duty statements start with a verbal noun (مصدر), e.g. «معايرة مقياس متعدد رقمي» — not a conjugated verb. ' +
      'Performance criteria stay passive statements of a result («تُنفَّذ …», «يُتحقَّق من …»).',
  fr: 'Write professional French. Task and duty statements start with an infinitive verb. ' +
      'Performance criteria stay statements of a result in the passive or present tense. ' +
      'Use the typographic apostrophe (’) and French spacing before : ; ? !',
  en: 'Write clear professional English. Task and duty statements start with an action verb. ' +
      'Performance criteria stay passive statements of a result.',
};

export function buildPrompt(from, to, batch) {
  const src = {};
  batch.forEach((it, i) => { src[String(i + 1)] = it.src; });
  const terms = _glossaryFor(from, to, batch.map(b => b.src));
  return `You are a professional translator specialised in TVET (technical and vocational education and training) and DACUM occupational analysis.
Translate each value of the SOURCE object from ${NAMES[from]} into ${NAMES[to]}.

RULES
- Translate the meaning faithfully and completely. Do not add, drop, explain, merge or summarise anything.
- Keep numbers, units, codes, standards (e.g. ISO 9001), abbreviations (e.g. PLC, CNC), brand and model names unchanged, in Latin script with Western digits.
- Keep line breaks, bullets and list numbering exactly as in the source.
- ${STYLE[to] || ''}
- A value that is a proper name or is already in ${NAMES[to]} is returned unchanged.
${terms.length ? '- Use this terminology consistently:\n' + terms.join('\n') + '\n' : ''}
CONTEXT (for meaning only — do not translate):
${jobFocusLines()}

SOURCE
${JSON.stringify(src)}

OUTPUT FORMAT
Return ONLY a JSON object with exactly the same ids: {"t":{"1":"<translation>","2":"<translation>"}}`;
}

export function makeBatches(items, maxItems = BATCH_ITEMS, maxChars = BATCH_CHARS) {
  const out = [];
  let cur = [], chars = 0;
  items.forEach(it => {
    const n = String(it.src).length;
    if (cur.length && (cur.length >= maxItems || chars + n > maxChars)) { out.push(cur); cur = []; chars = 0; }
    cur.push(it); chars += n;
  });
  if (cur.length) out.push(cur);
  return out;
}

/* A text is sent without its bullet or number, and written back with
   them; a line break in the translation of a one-line text would split
   an Additional Info item in two. So: one line stays one line, and a
   bullet or number the model added is dropped. */
export function tidyTranslation(src, t) {
  let v = String(t).trim();
  if (String(src).indexOf('\n') === -1) v = v.replace(/\s*\n\s*/g, ' ');
  const [p, c] = splitText(v);
  if (p && !splitText(String(src))[0] && c) v = c;
  return v;
}

/** One AI call. Returns [{ h, t, was? }] for the ids it answered. */
export async function translateBatch(batch, from, to) {
  const reply = await callAI(buildPrompt(from, to, batch), { lang: false });
  const t = (reply && (reply.t || reply.translations)) || {};
  const out = [];
  batch.forEach((it, i) => {
    const v = t[String(i + 1)];
    if (typeof v !== 'string' || !v.trim()) return;
    out.push({ h: it.h, t: tidyTranslation(it.src, v), ...(it.was !== undefined ? { was: it.was } : {}) });
  });
  if (!out.length) throw new Error('AI reply contained no translations');
  return out;
}

/** Sends every batch in turn. onBatch(results) is called after each
 *  answered batch (the caller stores it at once, so a stopped or failed
 *  run keeps what was done). Stops early when the service is
 *  unreachable, out of credit or misconfigured. */
export async function runTranslation({ items, from, to, onBatch, onProgress, isCancelled }) {
  const batches = makeBatches(items);
  let done = 0, failed = 0, lastError = null, stopped = false;
  for (let i = 0; i < batches.length; i++) {
    if (isCancelled && isCancelled()) { stopped = true; break; }
    if (onProgress) onProgress(i, batches.length, done);
    try {
      const res = await translateBatch(batches[i], from, to);
      done += res.length;
      if (onBatch) onBatch(res);
    } catch (err) {
      failed++;
      lastError = err;
      const kind = classifyAIError(err);
      if (kind === 'offline' || kind === 'credit' || kind === 'auth') break;
    }
  }
  if (onProgress) onProgress(batches.length, batches.length, done);
  return { batches: batches.length, translated: done, failed, lastError, stopped };
}
