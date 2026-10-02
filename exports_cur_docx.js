/* ============================================================
   exports_cur_docx.js — Module Curriculum (CUR) Word document
   ============================================================

   One .docx per module, laid out after the expert template
   (CUR_CMCN_1-1_Hardware_L1_En.docx):

     Table 1  module header — code/title, purpose, NQF level | credits,
              pre-requisites, the time block, the program, link to the
              occupational standard, learning outcomes
     Table n  one per learning outcome — context, the five teaching
              sub-headings in a single cell, statements | methods
     Table z  resources — tools, equipment, PPE, materials, recommended
              resources, physical facilities | quantity

   It receives a ready MODEL from module_curriculum.js
   (getCurriculumModel) and reads nothing from the page itself, so the
   data rules live in one place and this file only draws.

   Deliberate corrections over the expert sample:
     • labels are always the same wording (no "Directed self-learning",
       no "Learners will train");
     • "learning units", not "learning modules";
     • every hour is computed — never typed;
     • an empty field prints a light "—", never the label on its own.
   With model.blank (the "blank template" option) user fields print as
   empty boxes for experts to fill by hand instead.

   Arabic and table geometry follow exports_os_docx.js exactly: every
   paragraph carries bidirectional:_rtl() with NO w:jc for start-aligned
   text, every table carries visuallyRightToLeft and explicit
   columnWidths (docx@7.8.2 writes <w:tblGrid> only from columnWidths).
   ============================================================ */

import { showStatus } from './renderer.js';
import {
    _rtl,
    _font,
    _tblFill,
    _withArabicLang,
    _withArabicLangParagraph,
    _applyDocDefaultsLang,
} from './exports_docx.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

const LABEL_FILL = 'F2F2F2';
const DASH       = '—';
const DASH_COLOR = 'A6A6A6';
const PAGE_W = 11906, PAGE_H = 16838;          // A4 in twips
const MARGIN = 1134;                           // 2 cm
const TABLE_W = PAGE_W - 2 * MARGIN;           // 9638

/**
 * Builds and downloads the document. Returns true on success.
 * @param {object} m  model from getCurriculumModel()
 */
export async function exportCurriculumDocx(m) {
    try {
        if (typeof window.docx === 'undefined') {
            showStatus(_t('msgDocxMissing') || 'docx library not loaded', 'error');
            return false;
        }
        const {
            Document, Paragraph: _Paragraph, TextRun: _TextRun, Table, TableRow, TableCell,
            WidthType, AlignmentType, Packer, ShadingType, Footer, PageNumber,
            TabStopType, ExternalHyperlink, VerticalAlign,
        } = window.docx;
        const TextRun   = _withArabicLang(_TextRun);
        const Paragraph = _withArabicLangParagraph(_Paragraph, TextRun);
        const L = m.L;
        const rtl = _rtl();

        /* ---- runs & paragraphs ------------------------------------ */
        const run = (text, o = {}) => new TextRun({
            text: String(text == null ? '' : text),
            bold: !!o.bold, italics: !!o.italics, size: o.size || 21,
            ...(o.color ? { color: o.color } : {}),
            ...(o.shaded ? { __shaded: true } : {}),
        });
        // A value: the text, or a light dash, or (blank template) nothing.
        const valueRuns = (text, o = {}) => {
            const s = String(text == null ? '' : text).trim();
            if (s) return [run(s, o)];
            return m.blank ? [run('', o)] : [run(DASH, { ...o, bold: false, color: DASH_COLOR })];
        };
        const para = (children, o = {}) => new Paragraph({
            children,
            ...(o.center ? { alignment: AlignmentType.CENTER } : {}),
            bidirectional: rtl,
            spacing: { before: o.before != null ? o.before : 40, after: o.after != null ? o.after : 40 },
            ...(o.indent ? { indent: { start: o.indent } } : {}),
            ...(o.keepNext ? { keepNext: true } : {}),
        });
        const txt = (text, o = {}) => para(valueRuns(text, o), o);
        // "Label: value" in one paragraph — the template's sub-heading style.
        const labelled = (label, value, o = {}) => para([
            run(label + (rtl ? ': ' : ': '), { bold: true }), ...valueRuns(value)], o);
        const linkPara = (text) => {
            const s = String(text || '').trim();
            if (/^https?:\/\//i.test(s) && ExternalHyperlink) {
                return para([new ExternalHyperlink({
                    link: s, children: [new TextRun({ text: s, size: 19, color: '1F4E79', underline: {} })] })]);
            }
            return txt(s);
        };
        // Empty lines for the blank template.
        const blankLines = (n) => Array.from({ length: n }, () => para([run('')], { before: 60, after: 60 }));

        /* ---- cells & tables --------------------------------------- */
        const cell = (children, o = {}) => new TableCell({
            children: Array.isArray(children) && children.length ? children : [para([run('')])],
            width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
            columnSpan: o.span || undefined,
            shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
            verticalAlign: o.vcenter && VerticalAlign ? VerticalAlign.CENTER : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
        });
        const labelCell = (text, o = {}) => cell([para([run(text, { bold: true, shaded: true })], { center: o.center })],
                                                { ...o, fill: o.fill || LABEL_FILL });
        const headCell = (text, o = {}) => cell([para([run(text, { bold: true, size: 22, shaded: true })], { center: o.center })],
                                                { ...o, fill: _tblFill() });
        const table = (rows, cols) => new Table({
            visuallyRightToLeft: rtl,
            width: { size: TABLE_W, type: WidthType.DXA },
            columnWidths: cols,
            layout: 'fixed',
            rows,
        });
        const spacer = () => para([run('')], { before: 0, after: 160 });
        /* Each learning-outcome table starts on a new page (3.33.2). A
           near-zero-height paragraph with pageBreakBefore, rather than a
           PageBreak run, so no blank line is left at the top of the page. */
        const newPage = () => new Paragraph({
            children: [new TextRun({ text: '', size: 2 })],
            pageBreakBefore: true,
            bidirectional: rtl,
            spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' },
        });
        const listParas = (items, n0, blankCount) => {
            if (items.length) return items.map(t => txt(t));
            return m.blank ? blankLines(blankCount || 3) : [txt('')];
        };
        const children = [];

        /* ============================================================
           TABLE 1 — module header (6-column grid)
           ============================================================ */
        const C6 = [1606, 1606, 1606, 1606, 1606, 1608];
        const span = (a, b) => C6.slice(a, b).reduce((x, y) => x + y, 0);
        const h = m.hours;
        const hv = v => (h ? String(v) : (m.blank ? '' : DASH));
        const hc = (v, o = {}) => cell([para(h ? [run(v, { bold: !!o.bold })] : (m.blank ? [run('')] : [run(DASH, { color: DASH_COLOR })]), { center: true })],
                                        { width: o.width, span: o.span, fill: o.fill, vcenter: true });
        const r1 = [];
        r1.push(new TableRow({ children: [headCell(`${L('curModule')} ${m.code}: ${m.title}`, { span: 6, width: TABLE_W })] }));
        r1.push(new TableRow({ children: [
            labelCell(L('curPurpose'), { span: 2, width: span(0, 2) }),
            cell(m.blank ? blankLines(2) : [txt(m.purpose)], { span: 4, width: span(2, 6) }),
        ] }));
        r1.push(new TableRow({ children: [
            labelCell(L('curNqfLevel'), { span: 2, width: span(0, 2) }),
            cell([txt(m.levelLabel)], { width: C6[2] }),
            labelCell(L('curCredits'), { span: 2, width: span(3, 5) }),
            cell([m.blank && !m.credits ? para([run('')]) : txt(m.credits)], { width: C6[5] }),
        ] }));
        r1.push(new TableRow({ children: [
            labelCell(L('curPrereq'), { span: 2, width: span(0, 2) }),
            cell(listParas(m.prerequisites, 0, 2), { span: 4, width: span(2, 6) }),
        ] }));
        // Time block
        r1.push(new TableRow({ children: [
            labelCell(L('curInstTime'), { span: 3, width: span(0, 3), center: true }),
            labelCell(L('curIndTime'), { span: 2, width: span(3, 5), center: true }),
            labelCell(L('curTotal100'), { width: C6[5], center: true }),
        ] }));
        r1.push(new TableRow({ children: [
            hc(h ? `${h.institutional} ${L('curHours')}` : '', { span: 3, width: span(0, 3), bold: true }),
            hc(h ? `${h.industry} ${L('curHours')}` : '', { span: 2, width: span(3, 5), bold: true }),
            hc(h ? `${h.total} ${L('curHours')}` : '', { width: C6[5], bold: true }),
        ] }));
        const pk = ['theory', 'practical', 'formative', 'practice', 'summative'];
        const pl = { theory: 'curTheory', practical: 'curPractical', formative: 'curFormative', practice: 'curPractice', summative: 'curSummative' };
        const pctOf = k => (h ? h.pct[k] : m.pct[k]);
        r1.push(new TableRow({ children: [
            ...pk.map((k, i) => labelCell(`${L(pl[k])} ${pctOf(k)}%`, { width: C6[i], center: true })),
            labelCell(L('curTotal100').replace(/\s*100\s*%/, '').trim() || 'Total', { width: C6[5], center: true }),
        ] }));
        r1.push(new TableRow({ children: [
            ...pk.map((k, i) => hc(hv(h ? h.parts[k] : ''), { width: C6[i] })),
            hc(hv(h ? h.total : ''), { width: C6[5], bold: true }),
        ] }));
        r1.push(new TableRow({ children: [
            labelCell(L('curProgram'), { span: 2, width: span(0, 2) }),
            cell([txt(m.programme)], { span: 4, width: span(2, 6) }),
        ] }));
        r1.push(new TableRow({ children: [
            labelCell(L('curOSLink'), { span: 2, width: span(0, 2) }),
            cell([
                para([run(L('curOSLinkLead'))]),
                para([run(L('curOSTask'), { bold: true })]),
                ...(m.osLink.length ? m.osLink.map(l => txt(l, { indent: 240 })) : [txt('')]),
            ], { span: 4, width: span(2, 6) }),
        ] }));
        r1.push(new TableRow({ children: [headCell(`${L('curLOs')}:`, { span: 6, width: TABLE_W })] }));
        r1.push(new TableRow({ children: [cell([para([run(L('curLOsLead'), { bold: true })])], { span: 6, width: TABLE_W })] }));
        (m.los.length ? m.los : [{ n: 1, statement: '' }]).forEach(o => {
            r1.push(new TableRow({ children: [cell([para([run(`${o.n}. `, { bold: true }), ...valueRuns(o.statement)])], { span: 6, width: TABLE_W })] }));
        });
        children.push(table(r1, C6));

        /* ============================================================
           ONE TABLE PER LEARNING OUTCOME
           ============================================================ */
        const CM = 3662;                               // methods column
        const C3 = [2400, TABLE_W - 2400 - CM, CM];
        m.los.forEach(o => {
            children.push(newPage());
            const rows = [];
            rows.push(new TableRow({ cantSplit: true, children: [
                headCell(L('curLOn', { n: o.n }), { width: C3[0] }),
                cell([para([run(o.statement || '', { bold: true })])], { span: 2, width: C3[1] + C3[2] }),
            ] }));
            rows.push(new TableRow({ children: [cell([labelled(L('curContext'), o.context)], { span: 3, width: TABLE_W })] }));
            const sub = [
                ['curMethodology', o.methodology], ['curDiscussion', o.discussion], ['curDemonstration', o.demonstration],
                ['curPracticeL', o.practice], ['curSelfDirected', o.selfDirected],
            ];
            rows.push(new TableRow({ children: [cell(
                sub.flatMap(([k, v]) => m.blank
                    ? [para([run(L(k) + ': ', { bold: true })], { before: 80 }), ...blankLines(2)]
                    : [labelled(L(k), v, { before: 80, after: 60 })]),
                { span: 3, width: TABLE_W })] }));
            rows.push(new TableRow({ cantSplit: true, children: [
                labelCell(L('curAssessStatements'), { span: 2, width: C3[0] + C3[1] }),
                labelCell(L('curAssessMethods'), { width: C3[2] }),
            ] }));
            const stm = o.assessStatements.length ? o.assessStatements.map(s => txt(s))
                : (m.blank ? Array.from({ length: 4 }, (_, k) => para([run(`${o.n}-${k + 1} `, { bold: true })], { before: 80, after: 80 })) : [txt('')]);
            const mth = o.assessMethods.length ? o.assessMethods.map(s => txt(s, { italics: true })) : (m.blank ? blankLines(4) : [txt('')]);
            rows.push(new TableRow({ children: [
                cell(stm, { span: 2, width: C3[0] + C3[1] }),
                cell(mth, { width: C3[2] }),
            ] }));
            if (o.hours !== '' && o.hours != null) {
                rows.push(new TableRow({ children: [cell([labelled(L('curDurationH'), String(o.hours))], { span: 3, width: TABLE_W })] }));
            }
            children.push(table(rows, C3));
            children.push(spacer());
        });

        /* ============================================================
           RESOURCES (3-column grid)
           ============================================================ */
        const COL3 = [3213, 3213, 3212];
        const rr = [];
        const sectionHead = (text) => new TableRow({ children: [headCell(text, { span: 3, width: TABLE_W })] });
        rr.push(sectionHead(L('curTools') + ':'));
        rr.push(new TableRow({ children: threeColsWith(m.tools) }));
        rr.push(sectionHead(L('curEquipment') + ':'));
        rr.push(new TableRow({ children: threeColsWith(m.equipment) }));
        rr.push(sectionHead(L('curPPE') + ':'));
        rr.push(new TableRow({ children: threeColsWith(m.ppe) }));
        rr.push(sectionHead(L('curMaterials') + ':'));
        rr.push(new TableRow({ children: threeColsWith(m.materials) }));
        rr.push(sectionHead(L('curResources') + ':'));
        rr.push(new TableRow({ children: [cell([
            para([run(L('curLearnerGuide') + ':', { bold: true })]),
            ...(m.resources.length ? m.resources.map(linkPara) : (m.blank ? blankLines(3) : [txt('')])),
        ], { span: 3, width: TABLE_W })] }));
        rr.push(new TableRow({ cantSplit: true, children: [
            headCell(L('curFacilities', { n: m.groupSize }) + ':', { span: 2, width: COL3[0] + COL3[1] }),
            headCell(L('curQty'), { width: COL3[2], center: true }),
        ] }));
        const fac = m.facilities.length ? m.facilities
            : (m.blank ? Array.from({ length: 6 }, () => ({ item: '', qty: '' })) : [{ item: '', qty: '' }]);
        fac.forEach(f => rr.push(new TableRow({ children: [
            cell([m.blank && !f.item ? para([run('')], { before: 80, after: 80 }) : txt(f.item)], { span: 2, width: COL3[0] + COL3[1] }),
            cell([m.blank && !f.qty ? para([run('')]) : para(valueRuns(f.qty), { center: true })], { width: COL3[2] }),
        ] })));
        children.push(table(rr, COL3));

        function threeColsWith(items) {
            if (!items.length) return [cell(m.blank ? blankLines(3) : [txt('')], { span: 3, width: TABLE_W })];
            const per = Math.ceil(items.length / 3);
            return [0, 1, 2].map(c => cell(
                items.slice(c * per, c * per + per).map(t => txt(t)), { width: COL3[c] }));
        }
        /* ---- footer: "CUR: <code> <short> L<n> V 0.1" + page ------- */
        const footer = new Footer({ children: [new Paragraph({
            bidirectional: rtl,
            tabStops: [{ type: TabStopType.RIGHT, position: TABLE_W }],
            children: [
                run(`CUR: ${m.code} ${m.shortName}${m.level ? ` L${m.level}` : ''}`, { bold: true, size: 18 }),
                new TextRun({ children: ['\t', PageNumber.CURRENT], size: 18, bold: true }),
            ],
        })] });

        const doc = new Document({
            styles: { default: { document: { run: { font: _font() } } } },
            sections: [{
                properties: {
                    page: {
                        size: { width: PAGE_W, height: PAGE_H },
                        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
                    },
                },
                footers: { default: footer },
                children,
            }],
        });
        _applyDocDefaultsLang(doc);

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = m.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        return true;
    } catch (error) {
        console.error('Error generating CUR document:', error);
        showStatus(_tf('msgWordError', { msg: error.message }), 'error');
        return false;
    }
}
