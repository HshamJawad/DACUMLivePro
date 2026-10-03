// ============================================================
// /os_model.js
// The Occupational Profile + Occupational Standard as DATA.
//
// One function, getOccupationalStandardModel(), gathers everything the
// standard prints — read from the same DOM fields and appState objects
// exports_os_docx.js used to read inline. Both consumers use it:
//   • exports_os_docx.js  — turns the model into the Word document;
//   • occupational_standard.js — shows the same model in its tab.
// Because there is one reader, what the tab shows and what the file
// prints cannot drift apart.
//
// Pure: no rendering, no writes. Labels are resolved in the active
// language at call time, exactly as the exporter did.
// ============================================================

import { appState } from './state.js';
import { getSkillLevelColumns } from './skill_levels.js';
import { getTaskCode, getDutyLetter } from './codes.js';
import { formatDacumDateRange, formatDateLong, formatVenueWithMode } from './exports_shared.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

const _val = (id) => {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
};

export const _lines = (text) =>
  String(text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

/* Where each part of the standard is edited — used by the tab's
   "Edit in …" links and by the completeness list. */
export const OS_SOURCE_TAB = {
  panel:         'info-tab',
  duties:        'duties-tab',
  narrative:     'additional-info-tab',
  header:        'info-tab',
  employability: 'additional-info-tab',
  competencies:  'clustering-tab',
  tools:         'additional-info-tab',
};

/**
 * @returns the full standard as plain data. Field values are either a
 * string or an array of lines; `institutional: true` marks the rows the
 * document prints EMPTY on purpose (filled in after export).
 */
export function getOccupationalStandardModel() {
  const occupation = _val('occupationTitle');
  const job        = _val('jobTitle');

  // ── Part 1: panel block ─────────────────────────────────────
  const panel = [{ key: 'occupation', label: _t('osFieldOccupation'), value: occupation }];
  if (job) panel.push({ key: 'job', label: _t('osFieldJob'), value: job });
  panel.push(
    { key: 'sector',       label: _t('osFieldSector'),       value: _val('sector') },
    { key: 'context',      label: _t('osFieldContext'),      value: _val('context') },
    { key: 'producedFor',  label: _t('osFieldProducedFor'),  value: _val('producedFor') },
    { key: 'producedBy',   label: _t('osFieldProducedBy'),   value: _val('producedBy') },
    { key: 'facilitators', label: _t('osFieldFacilitators'), value: _lines(_val('facilitators')) },
    { key: 'panel',        label: _t('osFieldPanel'),        value: _lines(_val('panelMembers')) },
    { key: 'observers',    label: _t('osFieldObservers'),    value: _lines(_val('observers')) },
    /* Date first, then venue. */
    { key: 'venueDate',    label: _t('osFieldVenueDate'),
      value: [formatDacumDateRange(formatDateLong), formatVenueWithMode()].filter(Boolean).join(' — ') },
  );

  // ── Part 1: duties and tasks — read from the live DOM, exactly as
  // exportToWord does, so the two documents never disagree.
  const duties = [];
  document.querySelectorAll('input[data-duty-id], textarea[data-duty-id]').forEach(dutyInput => {
    const dutyText = String(dutyInput.value || '').trim();
    if (!dutyText) return;
    const dutyId = dutyInput.getAttribute('data-duty-id');
    const tasks = [];
    document.querySelectorAll(
      `input[data-task-id^="${dutyId}_"], textarea[data-task-id^="${dutyId}_"]`
    ).forEach(taskInput => {
      const t = String(taskInput.value || '').trim();
      if (t) tasks.push(t);
    });
    duties.push({ duty: dutyText, tasks });
  });
  duties.forEach((d, di) => {
    d.letter = getDutyLetter(di);
    d.taskCodes = d.tasks.map((_, i) => `${d.letter}${i + 1}`);
  });

  // ── Part 1: profile narrative sections ──────────────────────
  const profileSections = [
    ['behaviorsHeading',  'behaviorsInput'],
    ['knowledgeHeading',  'knowledgeInput'],
    ['skillsHeading',     'skillsInput'],
    ['trendsHeading',     'trendsInput'],
    ['careerPathHeading', 'careerPathInput'],
    ['acronymsHeading',   'acronymsInput'],
  ];
  const narrative = [];
  profileSections.forEach(([headId, inputId]) => {
    const head = document.getElementById(headId);
    const body = _val(inputId);
    if (!body) return;
    narrative.push({ head: head ? head.textContent.trim() : inputId, body });
  });
  const customContainer = document.getElementById('customSectionsContainer');
  if (customContainer) {
    customContainer.querySelectorAll('.section-container').forEach(div => {
      const h = div.querySelector('input[type="text"], .section-heading');
      const t = div.querySelector('textarea');
      const head = h ? String(h.value || h.textContent || '').trim() : '';
      const body = t ? String(t.value || '').trim() : '';
      if (head && body) narrative.push({ head, body });
    });
  }

  // ── Part 2: header block (four institutional rows printed empty) ─
  const header = [
    { key: 'standardTitle', label: _t('osFieldStandardTitle'), value: occupation },
    { key: 'sector',        label: _t('osFieldSector'),        value: _val('sector') },
    { key: 'refCode',       label: _t('osFieldRefCode'),       value: '', institutional: true },
    { key: 'scope',         label: _t('osFieldScope'),         value: _lines(_val('scopeOfWork')) },
    { key: 'developedBy',   label: _t('osFieldDevelopedBy'),   value: _val('producedBy') },
    { key: 'endorsedBy',    label: _t('osFieldEndorsedBy'),    value: '', institutional: true },
    { key: 'approvedBy',    label: _t('osFieldApprovedBy'),    value: '', institutional: true },
    { key: 'approvalDate',  label: _t('osFieldApprovalDate'),  value: '', institutional: true },
    { key: 'reviewDate',    label: _t('osFieldReviewDate'),    value: '', institutional: true },
  ];

  // ── Part 2: employability competencies by occupational level ──
  // skillsLevelData is an ARRAY of categories, each holding competencies
  // whose `levels` object carries the four booleans. A category with no
  // name and no competency text (the blank spare row) is skipped; a
  // competency without text is skipped. If nothing at all prints, the
  // section is omitted (null).
  let employability = null;
  const sl = appState.skillsLevelData;
  if (Array.isArray(sl) && sl.length) {
    const levelCols = getSkillLevelColumns();   // the project's levels (3.40.0)
    const categories = [];
    let printed = 0;
    sl.forEach(cat => {
      const catName = cat.category || '';
      const comps = Array.isArray(cat.competencies) ? cat.competencies : [];
      if (!catName && !comps.some(c => c.text)) return;
      const rows = [];
      comps.forEach(comp => {
        if (!comp.text) return;
        const lv = comp.levels || {};
        rows.push({ text: comp.text, levels: levelCols.map(c => !!lv[c.id]) });
        printed++;
      });
      categories.push({ name: catName, competencies: rows });
    });
    if (printed) {
      employability = {
        levelLabels: levelCols.map(c => c.exportLabel),
        categories,
        count: printed,
      };
    }
  }

  // ── Part 2: competencies (clusters) ─────────────────────────
  const clusters = (appState.clusteringData && appState.clusteringData.clusters) || [];
  const competencies = clusters.map((cluster, i) => {
    const n = i + 1;
    return {
      n,
      id: cluster.id,
      name: cluster.name,
      title: _tf('expCompetencyN', { n, name: cluster.name }),
      range: (cluster.range && cluster.range.trim()) ? _lines(cluster.range) : [],
      tasks: Array.isArray(cluster.tasks)
        ? cluster.tasks.map(task => `${getTaskCode(task.id)}: ${task.text}`) : [],
      /* Numbered n.1, n.2 … — the reference a module descriptor cites. */
      criteria: Array.isArray(cluster.performanceCriteria)
        ? cluster.performanceCriteria.map((c, ci) => `${n}.${ci + 1}  ${c}`) : [],
    };
  });

  // ── Part 2: tools, equipment and materials ──────────────────
  const toolsText = _val('toolsInput');
  const tools = toolsText ? {
    head: (document.getElementById('toolsHeading')?.textContent || '').trim() || _t('osToolsEquipment'),
    lines: _lines(toolsText),
  } : null;

  return {
    occupation,
    job,
    subtitle: job || occupation,
    part1: { title: _t('osPart1Title'), panel, duties, narrative },
    part2: { title: _t('osPart2Title'), header, employability, competencies, tools },
  };
}

/**
 * What a complete standard still needs. Each item names the tab that
 * fixes it. Institutional rows are not counted — they are filled in
 * after export by design.
 */
export function getOccupationalStandardChecklist(model) {
  const m = model || getOccupationalStandardModel();
  const has = v => Array.isArray(v) ? v.length > 0 : !!String(v || '').trim();
  const field = k => (m.part1.panel.find(r => r.key === k) || {}).value;
  const hdr   = k => (m.part2.header.find(r => r.key === k) || {}).value;

  const items = [
    { key: 'occupation',   ok: has(m.occupation),            tab: 'info-tab' },
    { key: 'scope',        ok: has(hdr('scope')),            tab: 'info-tab' },
    { key: 'sector',       ok: has(field('sector')),         tab: 'info-tab' },
    { key: 'producedBy',   ok: has(field('producedBy')),     tab: 'info-tab' },
    { key: 'panel',        ok: has(field('panel')),          tab: 'info-tab' },
    { key: 'venueDate',    ok: has(field('venueDate')),      tab: 'info-tab' },
    { key: 'duties',       ok: m.part1.duties.some(d => d.tasks.length), tab: 'duties-tab' },
    { key: 'narrative',    ok: m.part1.narrative.length > 0, tab: 'additional-info-tab' },
    { key: 'employability', ok: !!m.part2.employability,     tab: 'additional-info-tab' },
    { key: 'competencies', ok: m.part2.competencies.length > 0, tab: 'clustering-tab' },
    { key: 'tools',        ok: !!m.part2.tools,              tab: 'additional-info-tab' },
  ];
  // Per competency: a standard without a range or criteria cannot be
  // assessed against, so each gap is listed by name.
  m.part2.competencies.forEach(c => {
    items.push({ key: 'compRange',    ok: c.range.length > 0,    tab: 'clustering-tab', n: c.n, name: c.name });
    items.push({ key: 'compCriteria', ok: c.criteria.length > 0, tab: 'clustering-tab', n: c.n, name: c.name });
  });
  const done = items.filter(i => i.ok).length;
  return { items, done, total: items.length, percent: items.length ? Math.round(done * 100 / items.length) : 0 };
}
