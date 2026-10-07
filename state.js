// ============================================================
// /state.js
// Single source of truth for all mutable application state.
// Import appState in any module that needs to read or write state.
// ============================================================

export const appState = {

  // ── Chart Info Images ──────────────────────────────────────
  producedForImage: null,
  producedByImage: null,

  // ── Duties & Tasks ─────────────────────────────────────────
  dutyCount: 0,
  taskCounts: {},          // { dutyId: number }

  // ── Additional Info ────────────────────────────────────────
  customSectionCounter: 0,

  // ── Skills Level Matrix ────────────────────────────────────
  // Seeded from i18n at first render, not here: see
  // defaultSkillsLevelData() at the foot of this file.
  skillsLevelData: [],
  // Matrix columns (levels). null = the four defaults; see skill_levels.js.
  skillsLevelColumns: null,

  // ── Task Verification ──────────────────────────────────────
  verificationRatings: {},   // { taskKey: { importance, frequency, difficulty, ... } }
  taskMetadata: {},           // { taskKey: { dutyId, dutyTitle } }
  collectionMode: 'workshop',
  workflowMode: 'standard',
  verificationDecisionMade: false,
  clusteringAllowed: false,

  // ── Task Analysis ───────────────────────────────────────────
  // Flat dictionary keyed by the SAME task inputId used by
  // verificationRatings/taskMetadata above (e.g. "duty_1_2"), not
  // nested inside dutiesData[].tasks[] — that array is rebuilt on
  // every add/remove/reorder, so a flat key survives all of that the
  // same way verification ratings already do. Records are created
  // lazily (see task_analysis.js): a task with no analysis simply has
  // no entry here, so untouched tasks never appear in saved projects.
  taskAnalysisData: {},
  /* Shape of each record (see task_analysis.js for the single source
     of truth on field lists):
     {
       performanceSteps: [], requiredKnowledge: [], requiredSkills: [],
       toolsEquipmentMaterials: [], safetyOSH: [],
       conditionsWorkEnvironment: '', decisionsCriticalPoints: [],
       performanceCriteria: [], performanceStandard: '',
       commonErrorsTroubleshooting: []
     }
  */
  // Flat dictionary { taskInputId: true } — tasks the facilitator has
  // starred as deserving detailed Task Analysis. Same key convention
  // as taskAnalysisData above.
  taskAnalysisPriority: {},
  // 3.80.0: Select Tasks for Training / Analysis (task_selection.js).
  // { excluded: { taskInputId: reasonCode }, rule, impMin, diffMin, topN }
  // null = never touched = every task selected.
  taskSelection: null,
  // Sections the user adds to every task's analysis (3.46.0): [{ id, title }].
  taskAnalysisCustomSections: [],
  // 3.75.0: AI-draft marks on the Additional Info sections —
  // { _aiDraft:{key:true}, _aiPrev:{key:text}, _aiText:{key:text} }.
  additionalInfoAI: {},
  // 3.79.0: the project's content languages (Settings → Languages) —
  // null until the user sets them; see content_lang.js for the shape.
  contentLanguages: null,

  // ── Supplementary Occupational Verification (optional) ─────
  // Occupation-level evidence (knowledge & skills, tools, behaviours,
  // trends, custom lists) verified on the same 0–3 scale as tasks but
  // kept completely separate from task results and the Priority Index.
  // Seeded by defaultSupplementaryVerification() below; owned by
  // supplementary_verification.js. Projects saved before this feature
  // simply lack the key and fall back to the default (disabled).
  supplementaryVerification: null,

  // ── Workshop Aggregated Counts ─────────────────────────────
  workshopParticipants: 10,
  priorityFormula: 'if',
  workshopCounts: {},
  workshopResults: {},

  // ── Export Modes ───────────────────────────────────────────
  tvExportMode: 'appendix',
  trainingLoadMethod: 'advanced',

  // ── Live Workshop ──────────────────────────────────────────
  lwSessionId: null,
  lwIsFinalized: false,
  lwFinalizedData: null,
  lwAggregatedResults: null,

  // ── Competency Clustering ──────────────────────────────────
  clusteringData: {
    availableTasks: [],
    clusters: [],
    clusterCounter: 0
  },

  // ── Learning Outcomes ──────────────────────────────────────
  learningOutcomesData: {
    outcomes: [],
    outcomeCounter: 0
  },

  // ── Module Mapping ─────────────────────────────────────────
  moduleMappingData: {
    modules: [],
    moduleCounter: 0
  },

  // ── Module Curriculum (CUR/CBC) ────────────────────────────
  // Owned by module_curriculum.js. Keyed by module id and LO id, never
  // by position, so data for a deleted module/outcome stays (hidden)
  // and comes back if Module Mapping's Undo restores it. Projects saved
  // before this feature simply lack the key and get the default below.
  moduleCurriculumData: null
};

/* ── Module Curriculum defaults ───────────────────────────────
   Kept here (no imports) so every save/load path — projects, JSON,
   snapshots — can normalise the block without importing the tab's
   module. */
export const CUR_DEFAULT_SPLIT = Object.freeze({ theory: 10, practical: 45, formative: 5, practice: 35, summative: 5 });

export function defaultModuleCurriculumData() {
  return {
    settings: {
      programmeName: '',
      filePrefix: '',
      levelStyle: 'short',
      hoursPerCredit: 25,
      groupSize: 15,
      split: { ...CUR_DEFAULT_SPLIT }
    },
    byModule: {}
  };
}

/** Returns a well-formed curriculum block from anything (null, an old
 *  or partial object). Never throws; unknown extra keys are kept. */
export function normalizeModuleCurriculumData(d) {
  const def = defaultModuleCurriculumData();
  if (!d || typeof d !== 'object' || Array.isArray(d)) return def;
  const s = (d.settings && typeof d.settings === 'object') ? d.settings : {};
  const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fb; };
  const split = { ...CUR_DEFAULT_SPLIT };
  if (s.split && typeof s.split === 'object') {
    Object.keys(split).forEach(k => {
      const n = Number(s.split[k]);
      if (Number.isFinite(n) && n >= 0) split[k] = n;
    });
  }
  return {
    ...d,
    settings: {
      ...s,
      programmeName: typeof s.programmeName === 'string' ? s.programmeName : '',
      filePrefix: typeof s.filePrefix === 'string' ? s.filePrefix : '',
      levelStyle: s.levelStyle === 'long' ? 'long' : 'short',
      hoursPerCredit: num(s.hoursPerCredit, def.settings.hoursPerCredit),
      groupSize: num(s.groupSize, def.settings.groupSize),
      split
    },
    byModule: (d.byModule && typeof d.byModule === 'object' && !Array.isArray(d.byModule)) ? d.byModule : {}
  };
}

/* ── Skills Level Matrix defaults ─────────────────────────────
   The seed used to be written out twice as English literals: once in
   this file and once again, verbatim, inside resetSkillsLevel() in
   renderer.js. Two copies of the same 33 strings is one copy too many
   — the second had already drifted in whitespace — so both are now
   generated from this single spec.

   Only the STRUCTURE lives here. The wording is resolved from i18n at
   call time, which is what makes the matrix appear in Arabic or French
   instead of English.

   Category 9 is deliberately empty: it is the blank row a facilitator
   fills in themselves, so it has no key and stays empty in every
   language. */
const SKILLS_SEED = [
  { id: 1, key: 'slCat1', comps: ['slComp1_1', 'slComp1_2'] },
  { id: 2, key: 'slCat2', comps: ['slComp2_1', 'slComp2_2', 'slComp2_3', 'slComp2_4', 'slComp2_5'] },
  { id: 3, key: 'slCat3', comps: ['slComp3_1', 'slComp3_2', 'slComp3_3'] },
  { id: 4, key: 'slCat4', comps: ['slComp4_1', 'slComp4_2', 'slComp4_3'] },
  { id: 5, key: 'slCat5', comps: ['slComp5_1', 'slComp5_2', 'slComp5_3', 'slComp5_4', 'slComp5_5'] },
  { id: 6, key: 'slCat6', comps: ['slComp6_1', 'slComp6_2'] },
  { id: 7, key: 'slCat7', comps: ['slComp7_1', 'slComp7_2'] },
  { id: 8, key: 'slCat8', comps: ['slComp8_1', 'slComp8_2'] },
  { id: 9, key: null,     comps: [null, null] },
];

const _t = (k) => (k && window.i18n ? window.i18n.t(k) : '');

const _levels = () => ({ craftsman: false, skilled: false, semiSkilled: false, foundation: false });

/**
 * Build a fresh default matrix IN THE CURRENT INTERFACE LANGUAGE.
 *
 * Called when a new matrix is generated: first render of an empty
 * project, or an explicit Reset. It is deliberately NOT called on
 * language switch — once these strings are in appState they are data,
 * and the rows are user-editable. Re-translating them later would
 * overwrite wording a facilitator had adjusted for their own sector,
 * which is a worse failure than an English row in an Arabic chart.
 *
 * The old version of this function deep-cloned appState.skillsLevelData
 * — the LIVE array — so calling it after any edit returned the edited
 * data, not the defaults. It had no callers, which is the only reason
 * that never surfaced as a bug.
 */
export function defaultSkillsLevelData() {
  return SKILLS_SEED.map(cat => ({
    id: cat.id,
    category: _t(cat.key),
    competencies: cat.comps.map((compKey, i) => ({
      id: `${cat.id}.${i + 1}`,
      text: _t(compKey),
      levels: _levels()
    }))
  }));
}

/** True when the matrix has never been populated (fresh project). */
export function skillsLevelIsEmpty() {
  return !Array.isArray(appState.skillsLevelData) || appState.skillsLevelData.length === 0;
}


/* ── Supplementary Occupational Verification defaults ─────────
   Labels are i18n KEYS, not strings: a default category shows in the
   interface language until the user renames it (only "Other" and
   custom categories are renameable). `source` lists the Additional
   Info fields a category can import its items from. */
export const SV_DEFAULT_CATEGORIES = [
  { id: 'knowledgeSkills', key: 'svCatKnowledgeSkills', enabled: true,  source: ['knowledgeInput', 'skillsInput'] },
  { id: 'toolsEquipment',  key: 'svCatTools',           enabled: true,  source: ['toolsInput'] },
  { id: 'workBehaviours',  key: 'svCatBehaviours',      enabled: true,  source: ['behaviorsInput'] },
  { id: 'futureTrends',    key: 'svCatTrends',          enabled: true,  source: ['trendsInput'] },
  { id: 'other',           key: 'svCatOther',           enabled: false, source: [], renameable: true },
];

export function defaultSupplementaryVerification() {
  return {
    enabled: false,
    itemCounter: 0,
    categoryCounter: 0,
    categories: SV_DEFAULT_CATEGORIES.map(c => ({
      id: c.id, key: c.key, name: '', enabled: c.enabled,
      renameable: !!c.renameable, source: c.source.slice(), items: []
    }))
  };
}


/* ── Keep DEFAULT seed text in the interface language ─────────
   The matrix rows are seeded from i18n and then stored as data, so a
   project created while the UI was Arabic kept Arabic rows after a
   switch to English (and vice versa). This walks every seeded row and,
   ONLY where the stored text is still exactly the default wording in
   one of the supported languages, swaps it for the active language.
   Anything the facilitator typed or edited matches no default wording
   and is left untouched. Returns true when something changed. */
/* 3.79.0: true when `text` is the default wording of any seeded matrix
   row, in any language. Content translation leaves such rows to
   retranslateSkillsLevelData() (built-in wording) instead of the AI. */
export function isSeededSkillText(text) {
  const I = window.i18n;
  if (!I || !I.tIn) return false;
  const v = String(text == null ? '' : text).trim();
  if (!v) return false;
  const langs = I.languages ? I.languages() : ['en', 'fr', 'ar'];
  return SKILLS_SEED.some(seed =>
    [seed.key, ...(seed.comps || [])].some(key =>
      key && langs.some(l => (I.tIn(key, l) || '').trim() === v)));
}

export function retranslateSkillsLevelData() {
  const I = window.i18n;
  if (!I || !I.tIn || !Array.isArray(appState.skillsLevelData)) return false;
  const langs = I.languages ? I.languages() : ['en', 'fr', 'ar'];
  const isDefault = (text, key) => {
    const v = String(text == null ? '' : text).trim();
    return !!v && langs.some(l => (I.tIn(key, l) || '').trim() === v);
  };
  let changed = false;
  appState.skillsLevelData.forEach(cat => {
    const seed = SKILLS_SEED.find(s => s.id === cat.id);
    if (!seed || !seed.key) return;
    if (isDefault(cat.category, seed.key)) {
      const now = I.tc ? I.tc(seed.key) : I.t(seed.key);   // 3.79.0: content language
      if (now !== cat.category) { cat.category = now; changed = true; }
    }
    (cat.competencies || []).forEach(comp => {
      const idx = parseInt(String(comp.id || '').split('.')[1], 10) - 1;
      const key = seed.comps[idx];
      if (!key || !isDefault(comp.text, key)) return;
      const now = I.tc ? I.tc(key) : I.t(key);
      if (now !== comp.text) { comp.text = now; changed = true; }
    });
  });
  return changed;
}
