// ============================================================
// /lite_import.js
// Opens DACUM Lite project files in DACUM Live Pro (3.95.0).
//
// DACUM Lite covers the first three tabs (Chart Info, Duties &
// Tasks, Additional Info). Its files are turned into the shape
// importProjectFromData() reads, so a facilitator who started in
// Lite carries on in Pro from Task Verification onwards.
//
// Two Lite shapes are read:
//   • "Export Project" (Lite 4.x):
//       { app: "DACUM Professional Tool", schemaVersion, project: {
//           name, state: { duties: [{ title, tasks: [{ text }] }],
//           chartImages }, chartInfo, additionalInfo: { fixed, custom } } }
//   • the older "Save JSON":
//       { chartInfo, duties: [{ duty, tasks: [text] }],
//         additionalInfo: { headings, knowledge, skills, … },
//         customSections: [{ heading, content }] }
//     Pro already reads its chart info and duties; only the
//     additional info, kept flat there, needs regrouping.
// Lite's snapshots are not carried over: they are its own working
// history, not part of the chart.
// ============================================================

const LITE_APP = 'DACUM Professional Tool';

// The seven fixed Additional Info sections, by their key in Pro.
const AI_KEYS = ['knowledge', 'skills', 'behaviors', 'tools', 'trends', 'acronyms', 'careerPath'];

// Lite's default headings in its three languages. A heading still at
// a default is left out, so Pro shows its own heading in the current
// language; only a heading the user renamed in Lite is carried over.
const LITE_DEFAULT_HEADINGS = new Set([
  'Knowledge Requirements', 'Skills Requirements', 'Worker Behaviors/Traits',
  'Tools, Equipment, Supplies and Materials', 'Future Trends and Concerns',
  'Acronyms', 'Career Path',
  'Connaissances requises', 'Habiletés requises', 'Comportements et traits professionnels',
  'Outils, équipements, fournitures et matériaux', 'Tendances et préoccupations futures',
  'Acronymes', 'Cheminement de carrière',
  'متطلبات المعرفة', 'متطلبات المهارات', 'سلوكيات وصفات العامل',
  'الأدوات والمعدات والمستلزمات والمواد', 'الاتجاهات والمخاوف المستقبلية',
  'المختصرات', 'المسار المهني',
]);

// Lite's default project names (Untitled / New project, three languages).
const LITE_DEFAULT_NAMES = new Set([
  'Untitled Project', 'New Project', 'Projet sans titre', 'Nouveau projet',
  'مشروع بدون اسم', 'مشروع جديد',
]);

const _str = v => (typeof v === 'string' ? v : '');
const _lines = v => Array.isArray(v)
  ? v.map(s => _str(s).trim()).filter(Boolean)
  : _str(v).split('\n').map(s => s.trim()).filter(Boolean);

/** True for a file written by DACUM Lite's "Export Project". */
export function isLiteProjectFile(data) {
  return !!(data && typeof data === 'object' && !Array.isArray(data)
    && data.app === LITE_APP
    && data.project && typeof data.project === 'object');
}

function _chartInfo(ci, images) {
  ci = (ci && typeof ci === 'object') ? ci : {};
  const multi = !!ci.multiDay;
  const fmt = ['inperson', 'online', 'hybrid'].includes(ci.workshopMode) ? ci.workshopMode : 'inperson';
  return {
    dacumDate:       _str(ci.dacumDate),
    dacumDateEnd:    multi ? _str(ci.dacumDateTo) : '',
    venue:           _str(ci.venue),
    workshopFormat:  fmt,
    producedFor:     _str(ci.producedFor),
    producedBy:      _str(ci.producedBy),
    occupationTitle: _str(ci.occupationTitle),
    scopeOfWork:     _str(ci.scopeOfWork),
    jobTitle:        _str(ci.jobTitle),
    // Lite 4.14.0 and later; empty for older Lite files.
    sector:          _str(ci.sector),
    context:         _str(ci.context),
    facilitators:    _lines(ci.facilitators),
    observers:       _lines(ci.observers),
    panelMembers:    _lines(ci.panelMembers),
    producedForImage: ci.producedForImage || images?.producedFor || null,
    producedByImage:  ci.producedByImage  || images?.producedBy  || null,
  };
}

function _duties(list) {
  return (Array.isArray(list) ? list : [])
    .map(d => ({
      duty:  _str(d && d.title).trim(),
      tasks: (Array.isArray(d && d.tasks) ? d.tasks : [])
        .map(t => _str(t && t.text).trim()).filter(Boolean),
    }))
    .filter(d => d.duty || d.tasks.length);
}

function _additionalInfo(ai) {
  const out = { headings: {}, content: {}, customSections: [] };
  if (!ai || typeof ai !== 'object') return out;
  (Array.isArray(ai.fixed) ? ai.fixed : []).forEach(f => {
    const key = _str(f && f.inputId).replace(/Input$/, '');
    if (!AI_KEYS.includes(key)) return;
    out.content[key] = _str(f.content);
    const h = _str(f.heading).trim();
    if (h && !LITE_DEFAULT_HEADINGS.has(h)) out.headings[key] = h;
  });
  (Array.isArray(ai.custom) ? ai.custom : []).forEach(c => {
    if (c && (_str(c.heading).trim() || _str(c.content).trim())) {
      out.customSections.push({ heading: _str(c.heading).trim(), content: _str(c.content) });
    }
  });
  return out;
}

/** A Lite "Export Project" file in the shape Pro's import reads. */
export function liteProjectToPro(data) {
  const p = data.project;
  const st = (p.state && typeof p.state === 'object') ? p.state : {};
  return {
    version:   '1.0',
    savedDate: data.exportedAt || new Date().toISOString(),
    importedFrom: { app: 'DACUM Lite', schemaVersion: _str(data.schemaVersion) },
    chartInfo: _chartInfo(p.chartInfo, st.chartImages),
    duties:    _duties(st.duties),
    additionalInfo: _additionalInfo(p.additionalInfo),
  };
}

/**
 * Regroup the older Lite "Save JSON" additional info: section texts
 * flat beside the headings, custom sections at the top level. Pro
 * files already carry `content`, so they pass through unchanged.
 */
function _regroupFlatAdditionalInfo(data) {
  const ai = data.additionalInfo;
  if (!ai || typeof ai !== 'object' || ai.content) return data;
  if (!AI_KEYS.some(k => typeof ai[k] === 'string')) return data;
  const content = {};
  AI_KEYS.forEach(k => { if (typeof ai[k] === 'string') content[k] = ai[k]; });
  const custom = Array.isArray(ai.customSections) ? ai.customSections
               : Array.isArray(data.customSections) ? data.customSections : [];
  const headings = {};
  if (ai.headings && typeof ai.headings === 'object') {
    AI_KEYS.forEach(k => {
      const h = _str(ai.headings[k]).trim();
      if (h && !LITE_DEFAULT_HEADINGS.has(h)) headings[k] = h;
    });
  }
  return {
    ...data,
    additionalInfo: {
      headings,
      content,
      customSections: custom
        .filter(c => c && (_str(c.heading).trim() || _str(c.content).trim()))
        .map(c => ({ heading: _str(c.heading).trim(), content: _str(c.content) })),
    },
  };
}

/**
 * Prepare a parsed file for importProjectFromData().
 * Returns { data, fileName, fromLite }: a Lite project gets its own
 * name as the file name, so the sidebar shows "Welder", not
 * "Welder dacum" from Lite's "Welder_dacum.json".
 */
export function adaptImportedFile(data, fileName) {
  if (isLiteProjectFile(data)) {
    // Lite's default project names say nothing; the occupation does.
    let name = _str(data.project.name).trim();
    if (LITE_DEFAULT_NAMES.has(name)) name = '';
    name = name
      || _str(data.project.chartInfo?.occupationTitle).trim()
      || _str(data.project.chartInfo?.jobTitle).trim()
      || _str(fileName).replace(/\.json$/i, '').replace(/_dacum$/i, '');
    return { data: liteProjectToPro(data), fileName: (name || 'DACUM Lite') + '.json', fromLite: true };
  }
  return { data: _regroupFlatAdditionalInfo(data), fileName, fromLite: false };
}
