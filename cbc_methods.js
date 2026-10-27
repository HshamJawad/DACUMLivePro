// ============================================================
// /cbc_methods.js — 3.140.5
// Ready-made choices for the two method lists of a learning outcome in
// the Module Curriculum tab (and so in the CBC / CUR Word files):
//
//   • assessment methods  (طرق التقييم)
//   • training methods    (أساليب التدريب)
//
// The user ticks the methods that apply; the tick adds the method's
// wording to the outcome's own list, un-ticking removes it. The list
// stays an ordinary list of texts, so anything typed by hand still
// works and is exported with the rest.
//
// Each method has its wording in the three languages of the tool. A
// tick stores the wording of the DOCUMENT language (export language), so
// an Arabic project gets Arabic wording even from an English screen;
// the check mark is recognised in any of the three wordings.
// ============================================================

// Arabic wording carries the English term in brackets, as in the
// curricula of the region ("الاستعراض (Demonstration)").
export const ASSESS_METHODS = [
  { id: 'demonstration', en: 'Demonstration',        fr: 'Démonstration',                ar: 'الاستعراض (Demonstration)' },
  { id: 'observation',   en: 'Observation',          fr: 'Observation',                  ar: 'الملاحظة (Observation)' },
  { id: 'portfolio',     en: 'Portfolio',            fr: 'Portfolio (dossier de travaux)', ar: 'سجل الأعمال (Portfolio)' },
  { id: 'thirdParty',    en: 'Third-party report',   fr: 'Rapport d’un tiers',           ar: 'تقرير طرف ثالث (Third-Party Report)' },
  { id: 'written',       en: 'Written test',         fr: 'Test écrit',                   ar: 'اختبار كتابي (Written Test)' },
  { id: 'oral',          en: 'Oral test',            fr: 'Test oral',                    ar: 'اختبار شفهي (Oral Test)' },
  // added
  { id: 'practicalTest', en: 'Practical test',       fr: 'Test pratique',                ar: 'اختبار عملي (Practical Test)', more: true },
  { id: 'productEval',   en: 'Product evaluation',   fr: 'Évaluation du produit réalisé', ar: 'تقييم المنتج (Product Evaluation)', more: true },
  { id: 'project',       en: 'Project',              fr: 'Projet',                       ar: 'مشروع (Project)', more: true },
  { id: 'simulation',    en: 'Simulation',           fr: 'Simulation',                   ar: 'المحاكاة (Simulation)', more: true },
  { id: 'selfAssess',    en: 'Self-assessment',      fr: 'Auto-évaluation',              ar: 'التقييم الذاتي (Self-Assessment)', more: true },
];

export const TRAIN_METHODS = [
  { id: 'demonstration', en: 'Demonstration',        fr: 'Démonstration',                ar: 'استعراض (Demonstration)' },
  { id: 'lecture',       en: 'Lecture',              fr: 'Exposé',                       ar: 'محاضرة (Lecture)' },
  { id: 'discussion',    en: 'Discussion',           fr: 'Discussion',                   ar: 'مناقشة (Discussion)' },
  { id: 'dual',          en: 'Dual training',        fr: 'Formation en alternance',      ar: 'تدريب مزدوج (Dual Training)' },
  { id: 'distance',      en: 'Distance learning',    fr: 'Formation à distance',         ar: 'تدريب عن بعد (Distance Learning)' },
  { id: 'groupWork',     en: 'Group work',           fr: 'Travail en groupes',           ar: 'عمل مجموعات (Group Work)' },
  { id: 'practical',     en: 'Practical activities', fr: 'Activités pratiques',          ar: 'أنشطة عملية (Practical Activities)' },
  { id: 'modular',       en: 'Modular / self-paced', fr: 'Modulaire / à son rythme',     ar: 'نمطي / ذاتي الإيقاع (Modular / Self-Paced)' },
  { id: 'rolePlay',      en: 'Role play',            fr: 'Jeu de rôle',                  ar: 'لعب الأدوار (Role Play)' },
  { id: 'caseStudy',     en: 'Case study',           fr: 'Étude de cas',                 ar: 'دراسة حالة (Case Study)' },
  { id: 'brainstorm',    en: 'Brainstorming',        fr: 'Remue-méninges',               ar: 'العصف الذهني (Brainstorming)' },
  { id: 'games',         en: 'Games and exercises',  fr: 'Jeux et exercices',            ar: 'الألعاب والتمارين (Games & Exercises)' },
  { id: 'reporting',     en: 'Reporting',            fr: 'Rédaction d’un rapport',       ar: 'إعداد تقرير (Reporting)' },
  // added
  { id: 'fieldVisit',    en: 'Field visit',          fr: 'Visite de terrain',            ar: 'زيارة ميدانية (Field Visit)', more: true },
  { id: 'projectBased',  en: 'Project-based learning', fr: 'Apprentissage par projet',   ar: 'التعلم بالمشاريع (Project-Based Learning)', more: true },
  { id: 'problemSolving', en: 'Problem solving',     fr: 'Résolution de problèmes',      ar: 'حل المشكلات (Problem Solving)', more: true },
  { id: 'simulation',    en: 'Simulation',           fr: 'Simulation',                   ar: 'المحاكاة (Simulation)', more: true },
  { id: 'coaching',      en: 'Coaching / mentoring', fr: 'Coaching / tutorat',           ar: 'التدريب الفردي والإرشاد (Coaching)', more: true },
];

export const METHOD_SETS = { assessMethods: ASSESS_METHODS, trainMethods: TRAIN_METHODS };

const LANGS = ['en', 'fr', 'ar'];
const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

/** The wording of a method in a language (English when missing). */
export const methodLabel = (m, lang) => m[lang] || m.en;

/** The language a stored wording is written in: the document's. */
export function storeLang(fallback) {
  const I = window.i18n;
  const l = I && I.exportLang ? I.exportLang() : fallback;
  return LANGS.includes(l) ? l : (LANGS.includes(fallback) ? fallback : 'en');
}

/** Does a stored text stand for this method, in any of the three wordings? */
export const matchesMethod = (m, text) => {
  const t = norm(text);
  return !!t && LANGS.some(l => norm(m[l]) === t);
};

/** Is the method in the list (ticked)? */
export const hasMethod = (m, list) => (Array.isArray(list) ? list : []).some(x => matchesMethod(m, x));

/** The list without the method, whatever wording it was stored in. */
export const withoutMethod = (m, list) => (Array.isArray(list) ? list : []).filter(x => !matchesMethod(m, x));
