// ============================================================
// /exports_cbc_docx.js — 3.101.0
// Competency-Based Curriculum (CBC) for the whole programme, as a Word
// DRAFT to be finished by hand. Model: getCbcModel() in
// module_curriculum.js. Loaded on first use.
//
//   Cover        title, sector, qualification, produced by
//   Part 1       Course design: title, nominal duration, level,
//                description, outcomes, entry requirements, course
//                structure (grouped by module category), assessment
//                methods, delivery, resources, instructors
//   Part 2       Modules of instruction, by category: one block per
//                module, then per learning outcome its assessment
//                criteria, contents, conditions, methodologies and
//                assessment methods
//
// Empty fields print a light "—" so the gaps to fill are visible.
// Same Word conventions as exports_cur_docx.js (RTL, fixed tables).
// ============================================================

import { showStatus } from './renderer.js';
import { _rtl, _font, _tblFill, _withArabicLang, _withArabicLangParagraph, _applyDocDefaultsLang } from './exports_docx.js';

const _inContentLang = (fn) =>
  (window.i18n && window.i18n.withContentLang) ? window.i18n.withContentLang(fn) : fn();
const _t  = (k)    => (window.i18n ? window.i18n.t(k) : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134;
const TABLE_W = PAGE_W - 2 * MARGIN;
const LABEL_FILL = 'F2F2F2';
const DASH = '—', DASH_COLOR = 'A6A6A6';

export function exportCbcDocx(m) { return _inContentLang(() => _build(m)); }

async function _build(m) {
  try {
    if (typeof window.docx === 'undefined') {
      showStatus(_t('msgDocxMissing') || 'docx library not loaded', 'error');
      return false;
    }
    const D = window.docx;
    const TextRun = _withArabicLang(D.TextRun);
    const Paragraph = _withArabicLangParagraph(D.Paragraph, TextRun);
    const { Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType, Footer, PageNumber, TabStopType } = D;
    const rtl = _rtl();

    const run = (text, o = {}) => new TextRun({
      text: String(text == null ? '' : text), bold: !!o.bold, italics: !!o.italics,
      size: o.size || 21, ...(o.color ? { color: o.color } : {}),
    });
    const para = (children, o = {}) => new Paragraph({
      children, bidirectional: rtl,
      ...(o.center ? { alignment: AlignmentType.CENTER } : {}),
      spacing: { before: o.before != null ? o.before : 40, after: o.after != null ? o.after : 40 },
      ...(o.indent ? { indent: { start: o.indent } } : {}),
      ...(o.keepNext ? { keepNext: true } : {}),
      ...(o.pageBreakBefore ? { pageBreakBefore: true } : {}),
    });
    const value = (text, o = {}) => {
      const s = String(text == null ? '' : text).trim();
      return s ? run(s, o) : run(DASH, { ...o, bold: false, color: DASH_COLOR });
    };
    const txt = (text, o = {}) => para([value(text, o)], o);
    const heading = (text, o = {}) => para([run(text, { bold: true, size: o.size || 26, color: o.color || '1F3864' })],
      { before: o.before != null ? o.before : 240, after: 100, keepNext: true, pageBreakBefore: o.pageBreakBefore });
    const sub = (text) => para([run(text, { bold: true, size: 22 })], { before: 160, after: 60, keepNext: true });
    const labelled = (label, val) => para([run(label + ': ', { bold: true }), value(val)], { before: 60, after: 60 });
    const list = (items, numbered = true, indent = 360) => (items && items.length)
      ? items.map((t, i) => para([run(numbered ? `${i + 1}. ` : '• ', { bold: numbered }), run(t)], { indent }))
      : [para([value('')], { indent })];

    const cell = (children, o = {}) => new TableCell({
      children: Array.isArray(children) && children.length ? children : [para([run('')])],
      width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
      columnSpan: o.span || undefined,
      shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
    });
    const table = (rows, cols) => new Table({
      visuallyRightToLeft: rtl, width: { size: TABLE_W, type: WidthType.DXA },
      columnWidths: cols, layout: 'fixed', rows,
    });
    const headCell = (text, w, o = {}) => cell([para([run(text, { bold: true })], { center: o.center })], { width: w, fill: _tblFill(), span: o.span });
    const labelCell = (text, w) => cell([para([run(text, { bold: true })])], { width: w, fill: LABEL_FILL });
    const cellList = (items, w, numbered) => cell(
      (items && items.length) ? items.map((t, i) => para([run(numbered ? `${i + 1}. ` : '• '), run(t)])) : [txt('')], { width: w });

    const children = [];

    /* ── Cover ─────────────────────────────────────────────── */
    children.push(para([run(_t('cbcDocTitle'), { bold: true, size: 40, color: '1F3864' })], { center: true, before: 1800, after: 600 }));
    const CC = [2800, TABLE_W - 2800];
    children.push(table([
      new TableRow({ children: [labelCell(_t('cbcSector'), CC[0]), cell([txt(m.sector)], { width: CC[1] })] }),
      new TableRow({ children: [labelCell(_t('cbcQualification'), CC[0]),
        cell([txt([m.title, m.qualificationLevel].filter(Boolean).join(' — '))], { width: CC[1] })] }),
      new TableRow({ children: [labelCell(_t('cbcProducedBy'), CC[0]), cell([txt(m.producedBy)], { width: CC[1] })] }),
      ...(m.single ? [
        new TableRow({ children: [labelCell(_t('cbcModuleTitle'), CC[0]),
          cell([txt([m.single.code, m.single.title].filter(Boolean).join(' '), { bold: true })], { width: CC[1] })] }),
        new TableRow({ children: [labelCell(_t('lblModuleCategory'), CC[0]),
          cell([txt(m.single.categoryLabel)], { width: CC[1] })] }),
      ] : []),
    ], CC));
    children.push(para([run(_t('cbcDraftNote'), { italics: true, size: 18, color: '7F7F7F' })], { center: true, before: 600 }));

    /* ── Part 1: Course design (whole programme, or when ticked) ── */
    if (m.includeDesign) {
    children.push(heading(_t('cbcCourseDesign'), { size: 30, pageBreakBefore: true, before: 0 }));
    children.push(labelled(_t('cbcCourseTitle'), m.title));
    children.push(labelled(_t('cbcNominalDuration'), m.nominalHours ? _tf('cbcHoursN', { n: m.nominalHours }) : ''));
    children.push(labelled(_t('cbcQualLevel'), m.qualificationLevel));
    children.push(sub(_t('cbcCourseDesc')));
    children.push(txt(m.description, { indent: 360 }));
    children.push(sub(_t('cbcCourseOutcomes')));
    children.push(para([run(_t('cbcOutcomesLead'))], { indent: 360 }));
    list(m.outcomes).forEach(p => children.push(p));
    children.push(sub(_t('cbcEntryReq')));
    list(m.entry, false).forEach(p => children.push(p));

    // Course structure, grouped by category.
    children.push(heading(_t('cbcCourseStructure')));
    const SC = [2600, 2600, TABLE_W - 2600 - 2600 - 1100, 1100];
    const srows = [new TableRow({ tableHeader: true, children: [
      headCell(_t('cbcColUnits'), SC[0]), headCell(_t('cbcColModule'), SC[1]),
      headCell(_t('cbcColLOs'), SC[2]), headCell(_t('cbcColHours'), SC[3], { center: true }),
    ] })];
    m.groups.forEach(g => {
      srows.push(new TableRow({ children: [cell([para([run(g.label.toUpperCase(), { bold: true, color: '1F3864' })])],
        { span: 4, width: TABLE_W, fill: 'DEEAF6' })] }));
      g.modules.forEach(mod => {
        srows.push(new TableRow({ cantSplit: false, children: [
          cellList(mod.competencies, SC[0], false),
          cell([txt([mod.code, mod.title].filter(Boolean).join(' '))], { width: SC[1] }),
          cell(mod.los.length ? mod.los.map(l => para([run(`${l.n}. `, { bold: true }), run(l.statement)])) : [txt('')], { width: SC[2] }),
          cell([para([value(mod.hours)], { center: true })], { width: SC[3] }),
        ] }));
      });
    });
    srows.push(new TableRow({ children: [
      cell([para([run(_t('cbcTotal'), { bold: true })])], { span: 3, width: SC[0] + SC[1] + SC[2], fill: LABEL_FILL }),
      cell([para([value(m.nominalHours, { bold: true })], { center: true })], { width: SC[3], fill: LABEL_FILL }),
    ] }));
    children.push(table(srows, SC));

    children.push(sub(_t('cbcAssessMethods')));
    list(m.assessMethods).forEach(p => children.push(p));
    children.push(sub(_t('cbcDelivery')));
    list(m.delivery).forEach(p => children.push(p));

    children.push(sub(_t('cbcResources')));
    const RC = [TABLE_W / 2, TABLE_W / 2];
    const resBlock = (pairs) => pairs.flatMap(([label, items]) => [
      para([run(label, { bold: true })], { before: 80 }),
      ...((items && items.length) ? items.map(t => para([run('• ' + t)], { indent: 200 })) : [para([value('')], { indent: 200 })]),
    ]);
    children.push(table([new TableRow({ children: [
      cell(resBlock([[_t('cbcEquipment'), m.resources.equipment], [_t('cbcTools'), m.resources.tools]]), { width: RC[0] }),
      cell(resBlock([[_t('cbcMaterials'), m.resources.materials], [_t('cbcPPE'), m.resources.ppe]]), { width: RC[1] }),
    ] })], RC));

    children.push(sub(_t('cbcInstructors')));
    list(m.instructors).forEach(p => children.push(p));
    if (m.trainers) children.push(para([run(m.trainers, { italics: true })], { indent: 360, before: 80 }));
    }

    /* ── Part 2: Modules of instruction ────────────────────── */
    children.push(heading(_t(m.single ? 'cbcModuleOfInstruction' : 'cbcModulesOfInstruction'), { size: 30, pageBreakBefore: true, before: 0 }));
    const MC = [2800, TABLE_W - 2800];
    let firstModule = true;
    m.instructionGroups.forEach(g => {
      children.push(heading(g.label.toUpperCase(), { size: 24, before: firstModule ? 120 : 360, color: '2E74B5' }));
      g.modules.forEach(mod => {
        if (!firstModule) children.push(para([run('')], { pageBreakBefore: true, before: 0, after: 0 }));
        firstModule = false;
        const row = (label, content) => new TableRow({ children: [labelCell(label, MC[0]), cell(content, { width: MC[1] })] });
        children.push(table([
          row(_t('cbcUnitOfCompetency'), (mod.competencies.length ? mod.competencies : ['']).map(c => txt(c))),
          row(_t('cbcModuleTitle'), [txt([mod.code, mod.title].filter(Boolean).join(' '), { bold: true })]),
          row(_t('cbcModuleDescriptor'), [txt(mod.descriptor)]),
          row(_t('cbcNominalDuration'), [txt(mod.hours ? _tf('cbcHoursN', { n: mod.hours }) : '')]),
          row(_t('cbcQualLevel'), [txt(mod.level || m.qualificationLevel)]),
          row(_t('cbcPrerequisite'), (mod.prerequisites.length ? mod.prerequisites : ['']).map(p => txt(p))),
        ], MC));

        children.push(sub(_t('cbcSummaryLOs')));
        children.push(para([run(_t('cbcLOsLead'))], { indent: 360 }));
        (mod.los.length ? mod.los : [{ n: 1, statement: '' }]).forEach(l =>
          children.push(para([run(`${_tf('cbcLOn', { n: l.n })} `, { bold: true }), value(l.statement)], { indent: 360 })));

        mod.los.forEach(l => {
          children.push(para([run(`${_tf('cbcLOn', { n: l.n })} ${l.statement}`.trim(), { bold: true, size: 22, color: '1F3864' })],
            { before: 240, after: 80, keepNext: true }));
          [['cbcAssessCriteria', l.criteria, true], ['cbcContents', l.contents, true],
           ['cbcConditions', l.conditions.length ? l.conditions : [...mod.resources.equipment, ...mod.resources.tools].slice(0, 10), true],
           ['cbcMethodologies', l.methodologies, true], ['cbcAssessMethodsLO', l.assessMethods, true]]
            .forEach(([k, items, num]) => {
              children.push(para([run(_t(k), { bold: true })], { before: 100, after: 40, keepNext: true }));
              list(items, num, 540).forEach(p => children.push(p));
            });
        });
        // 3.101.1: a module file carries its own resources and instructors.
        if (m.single) {
          children.push(sub(_t('cbcResources')));
          const RC1 = [TABLE_W / 2, TABLE_W / 2];
          const block = (pairs) => pairs.flatMap(([label, items]) => [
            para([run(label, { bold: true })], { before: 80 }),
            ...((items && items.length) ? items.map(t => para([run('• ' + t)], { indent: 200 })) : [para([value('')], { indent: 200 })]),
          ]);
          children.push(table([new TableRow({ children: [
            cell(block([[_t('cbcEquipment'), mod.resources.equipment], [_t('cbcTools'), mod.resources.tools]]), { width: RC1[0] }),
            cell(block([[_t('cbcMaterials'), mod.resources.materials], [_t('cbcPPE'), mod.resources.ppe]]), { width: RC1[1] }),
          ] })], RC1));
          if (!m.includeDesign) {
            children.push(sub(_t('cbcInstructors')));
            list(m.instructors).forEach(p => children.push(p));
            if (m.trainers) children.push(para([run(m.trainers, { italics: true })], { indent: 360, before: 80 }));
          }
        }
      });
    });

    const footer = new Footer({ children: [new Paragraph({
      bidirectional: rtl,
      tabStops: [{ type: TabStopType.RIGHT, position: TABLE_W }],
      children: [run(`CBC — ${m.single ? [m.single.code, m.single.title].filter(Boolean).join(' ') : (m.title || '')}`, { bold: true, size: 18 }),
                 new TextRun({ children: ['\t', PageNumber.CURRENT], size: 18, bold: true })],
    })] });

    const doc = new D.Document({
      styles: { default: { document: { run: { font: _font() } } } },
      sections: [{
        properties: { page: { size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
        footers: { default: footer },
        children,
      }],
    });
    _applyDocDefaultsLang(doc);
    const blob = await D.Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = m.fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch (error) {
    console.error('Error generating CBC document:', error);
    showStatus(_tf('msgWordError', { msg: error.message }), 'error');
    return false;
  }
}
