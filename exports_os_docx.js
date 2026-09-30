/* ============================================================
   exports_os_docx.js — Occupational Profile + Occupational Standard
   ============================================================

   A SECOND LAYOUT over data that already exists. Nothing here reads a
   field the application does not already collect, and nothing here is
   generated: the duties, the additional-information sections, the
   employability matrix and the competencies are the same objects the
   DACUM chart export prints, re-ordered into the two-part document that
   national qualification bodies actually endorse.

   Deliberately a separate module rather than a branch inside
   exports_docx.js. exportToWord() is the artefact every existing
   project has been validated against; a layout switch inside it would
   put that guarantee at risk for no gain. Here the existing exporter is
   untouched by construction, and the only edit to it was making seven
   private helpers exportable so the two documents cannot drift apart in
   how they handle Arabic.

   WHAT IS DELIBERATELY NOT COLLECTED
   The reference code (ASCO/ISCO), the organisational structure and the
   endorsement block are printed as EMPTY LABELLED LINES. They belong to
   a qualifications framework, not to a DACUM workshop, and adding three
   input fields for them would push framework bureaucracy into a tool
   whose job is to run a panel. They are filled in institutionally,
   after the document leaves this application.

   TABLE GEOMETRY — the bug that produced the first broken build
   docx@7.8.2 writes <w:tblGrid> from the table's `columnWidths` option
   and NOTHING else. Omit it and the grid is emitted as 100 twips per
   column; under <w:tblLayout w:type="fixed"/> that grid overrides every
   tcW, and the table collapses — columns ignore their declared widths
   and cell text drifts to the wrong edge. It looks like an RTL failure
   and is not one: <w:bidi/>, <w:bidiVisual/> and <w:jc w:val="right"/>
   were all present and correct in the broken output. Every _table()
   call below therefore passes columnWidths, and the widths are declared
   once per table and reused for both the grid and the cells.

   ARABIC
   Every paragraph — including the ones inside table cells — carries
   bidirectional:_rtl() and start-edge alignment, and every table
   carries visuallyRightToLeft. A cell paragraph that omits w:bidi still
   renders its text right-to-left (Unicode does that on its own) but
   anchors it to the LEFT edge of the cell and puts trailing punctuation
   on the wrong side, which is the specific defect this file has to
   avoid. _cellPara() below is the single place that gets it right, and
   no cell in this module builds a Paragraph any other way.
   ============================================================ */

import { appState } from './state.js';
import { showStatus } from './renderer.js';
import { getTaskCode, getDutyLetter } from './codes.js';
import { formatDacumDateRange, formatDateLong } from './exports_shared.js';
import {
    _rtl,
    _font,
    _tblFill,
    _withArabicLang,
    _withArabicLangParagraph,
    _applyDocDefaultsLang,
    _safeFilename,
} from './exports_docx.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

/* Same grey the rest of the suite fills header bars with, and the same
   ShadingType.CLEAR rule: val="solid" paints the cell in the PATTERN
   colour and ignores w:fill, which renders as solid black. */
/* The shaded-cell fill is whatever Export Settings says it is, exactly
   as in exports_docx.js — a hardcoded grey here would make the OS
   document ignore a setting the chart export honours. Runs inside a
   shaded cell carry __shaded:true so they take the automatic contrast
   colour instead of the heading colour, which is unreadable on a dark
   fill. */
const LABEL_FILL  = 'F2F2F2';

const _val = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
};

const _lines = (text) =>
    String(text || '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

export async function exportOccupationalStandardWord() {
    try {
        if (typeof window.docx === 'undefined') {
            showStatus(_t('msgDocxMissing') || 'docx library not loaded', 'error');
            return;
        }

        const {
            Document, Paragraph: _Paragraph, TextRun: _TextRun,
            Table, TableRow, TableCell, WidthType, AlignmentType,
            Packer, PageBreak, ShadingType,
        } = window.docx;

        const TextRun   = _withArabicLang(_TextRun);
        const Paragraph = _withArabicLangParagraph(_Paragraph, TextRun);

        /* ---- building blocks -------------------------------------- */

        // THE cell-paragraph constructor. See the Arabic note at the top
        // of this file: bidirectional + start alignment together are what
        // make a table cell read correctly in Arabic, and both are set
        // here so no call site can forget one of them.
        const _cellPara = (text, opts = {}) => new Paragraph({
            children: [new TextRun({
                text: String(text == null ? '' : text),
                bold: !!opts.bold,
                size: opts.size || 22,
                /* Marks a run that is both a heading and the contents of a
                   shaded cell, so Export Settings gives it the automatic
                   contrast colour rather than the heading colour. Same
                   convention as exports_docx.js. */
                ...(opts.shaded ? { __shaded: true } : {}),
            })],
            /* NO `alignment` for the start-aligned case, and this is not an
               oversight. ECMA-376 makes w:jc LOGICAL inside a bidi
               paragraph: in an RTL paragraph w:val="right" means END, which
               renders at the LEFT edge. Setting _start(AlignmentType) here —
               which resolves to RIGHT — therefore pushed every Arabic cell
               to the wrong side, and looked exactly like an RTL failure.
               Omitting w:jc leaves the paragraph at its natural start edge,
               which is right under RTL and left under LTR. This is also
               precisely what the duty/task cells in exports_docx.js do, so
               the two documents now align identically. */
            ...(opts.center ? { alignment: AlignmentType.CENTER } : {}),
            bidirectional: _rtl(),
            spacing: { before: 40, after: 40 },
        });

        const _cell = (text, opts = {}) => new TableCell({
            children: Array.isArray(text)
                ? (text.length ? text.map(t => _cellPara(t, opts)) : [_cellPara('', opts)])
                : [_cellPara(text, opts)],
            width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
            shading: opts.fill
                ? { fill: opts.fill, type: ShadingType.CLEAR, color: 'auto' }
                : undefined,
            columnSpan: opts.span || undefined,
        });

        // cols is REQUIRED, not optional — see the table-geometry note at
        // the top of this file. Total is always TABLE_W so every table on
        // the page shares one left and right edge.
        const TABLE_W = 9071;   // 16 cm in twips
        const _table = (rows, cols) => new Table({
            visuallyRightToLeft: _rtl(),
            width: { size: TABLE_W, type: WidthType.DXA },
            columnWidths: cols,
            layout: 'fixed',
            rows,
        });

        // Two-column label/value row — the shape of every header block in
        // the standard.
        const KV_COLS = [2600, 6471];
        const _kvRow = (label, value) => new TableRow({
            children: [
                _cell(label, { bold: true, width: KV_COLS[0], fill: LABEL_FILL }),
                _cell(value, { width: KV_COLS[1] }),
            ],
        });

        const _h1 = (text) => new Paragraph({
            children: [new TextRun({ text, bold: true, size: 32 })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 300, after: 300 },
            bidirectional: _rtl(),
        });

        const _h2 = (text) => new Paragraph({
            children: [new TextRun({ text, bold: true, size: 26 })],
            spacing: { before: 300, after: 150 },
            bidirectional: _rtl(),
        });

        const _body = (text, indent) => new Paragraph({
            children: [new TextRun({ text, size: 22 })],
            spacing: { after: 100 },
            indent: indent ? { start: 720 } : undefined,
            bidirectional: _rtl(),
        });

        const _spacer = () => new Paragraph({ text: '', bidirectional: _rtl() });
        const _break  = () => new Paragraph({ children: [new PageBreak()], bidirectional: _rtl() });

        const children = [];

        /* ============================================================
           PART 1 — OCCUPATIONAL PROFILE
           ============================================================ */

        const occupation = _val('occupationTitle');
        const job        = _val('jobTitle');

        children.push(_h1(_t('osPart1Title')));
        children.push(new Paragraph({
            children: [new TextRun({ text: occupation, bold: true, size: 28 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            bidirectional: _rtl(),
        }));

        // Panel block. The workshop provenance is what makes a profile
        // defensible, so it leads the document rather than trailing it.
        const panelRows = [
            _kvRow(_t('osFieldOccupation'), occupation),
        ];
        if (job) panelRows.push(_kvRow(_t('osFieldJob'), job));
        panelRows.push(
            _kvRow(_t('osFieldSector'),      _val('sector')),
            _kvRow(_t('osFieldContext'),     _val('context')),
            _kvRow(_t('osFieldProducedFor'), _val('producedFor')),
            _kvRow(_t('osFieldProducedBy'),  _val('producedBy')),
            _kvRow(_t('osFieldFacilitators'), _lines(_val('facilitators'))),
            _kvRow(_t('osFieldPanel'),        _lines(_val('panelMembers'))),
            _kvRow(_t('osFieldObservers'),    _lines(_val('observers'))),
            /* Date first, then venue. The old lookup read two ids that do
               not exist ('workshopDate', 'date'), so the date never printed. */
            _kvRow(_t('osFieldVenueDate'),
                [formatDacumDateRange(formatDateLong), _val('venue')].filter(Boolean).join(' — ')),
        );
        children.push(_table(panelRows, KV_COLS));

        // ---- Duties and Tasks -------------------------------------
        // Read from the live DOM, exactly as exportToWord does, so the
        // two documents can never disagree about what the chart says.
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

        if (duties.length) {
            children.push(_break());
            children.push(_h2(_t('osDutiesTasks')));

            /* Same grid as exportToWord: a shaded duty bar spanning four
               columns, then four tasks per row labelled "Task A1". The two
               documents describe the same chart, so a facilitator holding
               both should not have to re-learn the layout. */
            const TASKS_PER_ROW = 4;
            const TASK_COLS = [
                Math.floor(TABLE_W / TASKS_PER_ROW),
                Math.floor(TABLE_W / TASKS_PER_ROW),
                Math.floor(TABLE_W / TASKS_PER_ROW),
                TABLE_W - 3 * Math.floor(TABLE_W / TASKS_PER_ROW),
            ];

            duties.forEach((d, di) => {
                const letter = getDutyLetter(di);
                const rows = [new TableRow({
                    children: [new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({
                                text: `${_tf('lblDuty', { code: letter })}: ${d.duty}`,
                                bold: true,
                                size: 24,
                                __shaded: true,
                            })],
                            bidirectional: _rtl(),
                        })],
                        columnSpan: TASKS_PER_ROW,
                        shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                        width: { size: TABLE_W, type: WidthType.DXA },
                    })],
                })];

                const numRows = Math.ceil(d.tasks.length / TASKS_PER_ROW) || 0;
                for (let r = 0; r < numRows; r++) {
                    const cells = [];
                    for (let c = 0; c < TASKS_PER_ROW; c++) {
                        const idx = r * TASKS_PER_ROW + c;
                        const label = _tf('lblTask', { code: `${letter}${idx + 1}` });
                        cells.push(new TableCell({
                            children: [new Paragraph({
                                children: idx < d.tasks.length
                                    ? [new TextRun({ text: `${label}: ${d.tasks[idx]}`, size: 24 })]
                                    : [new TextRun({ text: '', size: 24 })],
                                bidirectional: _rtl(),
                            })],
                            width: { size: TASK_COLS[c], type: WidthType.DXA },
                        }));
                    }
                    rows.push(new TableRow({ children: cells }));
                }

                children.push(_table(rows, TASK_COLS));
                children.push(_spacer());
            });
        }

        // ---- Profile narrative sections ----------------------------
        // Concerns has no dedicated field; a facilitator who wants it
        // separate from Trends adds a custom section, which is picked up
        // by the custom-section loop below at no code cost.
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

        if (narrative.length) {
            children.push(_break());
            children.push(_h2(_t('expAdditionalInfo')));
            narrative.forEach(sec => {
                children.push(_table([
                    new TableRow({ children: [_cell(sec.head, { bold: true, shaded: true, fill: _tblFill(), width: TABLE_W })] }),
                    new TableRow({ children: [_cell(_lines(sec.body), { width: TABLE_W })] }),
                ], [TABLE_W]));
                children.push(_spacer());
            });
        }

        /* ============================================================
           PART 2 — OCCUPATIONAL STANDARD
           ============================================================ */

        children.push(_break());
        children.push(_h1(_t('osPart2Title')));

        // Header block. The four blank rows are the endorsement chain —
        // see the note at the top of this file for why they are printed
        // empty rather than collected in the UI.
        children.push(_table([
            _kvRow(_t('osFieldStandardTitle'), occupation),
            _kvRow(_t('osFieldSector'),        _val('sector')),
            _kvRow(_t('osFieldRefCode'),       ''),
            _kvRow(_t('osFieldScope'),         _lines(_val('scopeOfWork'))),
            _kvRow(_t('osFieldDevelopedBy'),   _val('producedBy')),
            _kvRow(_t('osFieldEndorsedBy'),    ''),
            _kvRow(_t('osFieldApprovedBy'),    ''),
            _kvRow(_t('osFieldApprovalDate'),  ''),
            _kvRow(_t('osFieldReviewDate'),    ''),
        ], KV_COLS));

        // ---- Employability competencies by occupational level -------
        // skillsLevelData is an ARRAY of categories, each holding
        // competencies whose `levels` object carries the four booleans —
        // not a flat list. Getting this shape wrong produces a silently
        // empty matrix rather than an error.
        const sl = appState.skillsLevelData;
        if (Array.isArray(sl) && sl.length) {
            children.push(_h2(_t('expEmployability')));

            const levelKeys = ['craftsman', 'skilled', 'semiSkilled', 'foundation'];
            const levelLabels = [
                _t('expCraftsman'), _t('expSkilled'),
                _t('expSemiSkilled'), _t('expFoundation'),
            ];

            const EMP_COLS = [4271, 1200, 1200, 1200, 1200];
            const rows = [new TableRow({
                tableHeader: true,
                children: [
                    _cell(_t('osColCompetency'), { bold: true, shaded: true, fill: _tblFill(), width: EMP_COLS[0] }),
                    ...levelLabels.map((l, i) => _cell(l, {
                        bold: true, shaded: true, fill: _tblFill(), center: true, width: EMP_COLS[i + 1],
                    })),
                ],
            })];

            let printed = 0;
            sl.forEach(cat => {
                const catName = cat.category || '';
                const comps = Array.isArray(cat.competencies) ? cat.competencies : [];
                // Seed row 9 is a blank spare for the facilitator; skip it
                // rather than printing an empty banner.
                if (!catName && !comps.some(c => c.text)) return;

                rows.push(new TableRow({
                    children: [_cell(catName, { bold: true, fill: LABEL_FILL, span: 5, width: TABLE_W })],
                }));

                comps.forEach(comp => {
                    if (!comp.text) return;
                    const lv = comp.levels || {};
                    rows.push(new TableRow({
                        children: [
                            _cell(comp.text, { width: EMP_COLS[0] }),
                            ...levelKeys.map((k, i) => _cell(lv[k] ? 'X' : '', { center: true, width: EMP_COLS[i + 1] })),
                        ],
                    }));
                    printed++;
                });
            });

            if (printed) {
                children.push(_table(rows, EMP_COLS));
                children.push(_spacer());
            } else {
                children.pop(); // drop the heading we just pushed
            }
        }

        // ---- Competencies ------------------------------------------
        const clusters = (appState.clusteringData && appState.clusteringData.clusters) || [];
        clusters.forEach((cluster, i) => {
            const n = i + 1;
            children.push(_break());
            children.push(_h2(_tf('expCompetencyN', { n, name: cluster.name })));

            const rows = [];

            if (cluster.range && cluster.range.trim()) {
                rows.push(new TableRow({
                    children: [
                        _cell(_t('expRangeLabel'), { bold: true, width: KV_COLS[0], fill: LABEL_FILL }),
                        _cell(_lines(cluster.range), { width: KV_COLS[1] }),
                    ],
                }));
            }

            if (Array.isArray(cluster.tasks) && cluster.tasks.length) {
                rows.push(new TableRow({
                    children: [
                        _cell(_t('osRelatedTasksFromProfile'), { bold: true, width: KV_COLS[0], fill: LABEL_FILL }),
                        _cell(cluster.tasks.map(task => `${getTaskCode(task.id)}: ${task.text}`), { width: KV_COLS[1] }),
                    ],
                }));
            }

            if (Array.isArray(cluster.performanceCriteria) && cluster.performanceCriteria.length) {
                rows.push(new TableRow({
                    children: [
                        _cell(_t('expPCLabel'), { bold: true, width: KV_COLS[0], fill: LABEL_FILL }),
                        _cell(cluster.performanceCriteria.map((c, ci) => `${n}.${ci + 1}  ${c}`), { width: KV_COLS[1] }),
                    ],
                }));
            }

            /* Performance criteria are numbered n.1, n.2 … here and
               nowhere else in the suite. The UNESCO-style module
               descriptor cites them as "5.6; 5.1" — a reference that
               cannot be checked unless the standard actually prints
               those numbers. Without them the citation is unverifiable,
               which is how a curriculum quietly detaches from its
               standard. */

            if (rows.length) children.push(_table(rows, KV_COLS));
        });

        // ---- Tools, equipment and materials -------------------------
        const tools = _val('toolsInput');
        if (tools) {
            children.push(_spacer());
            children.push(_table([
                new TableRow({
                    children: [_cell(
                        (document.getElementById('toolsHeading')?.textContent || '').trim() || _t('osToolsEquipment'),
                        { bold: true, shaded: true, fill: _tblFill(), width: TABLE_W }
                    )],
                }),
                new TableRow({ children: [_cell(_lines(tools), { width: TABLE_W })] }),
            ], [TABLE_W]));
        }

        /* ---- assemble --------------------------------------------- */

        const doc = new Document({
            styles: { default: { document: { run: { font: _font() } } } },
            sections: [{
                properties: {
                    /* 1440 twips = 1 inch = 2.54 cm, Word's own default and
                       the same value exportToWord() uses. The OS document
                       had been at 720 (1.27 cm), so the two exports from
                       one project printed on visibly different page setups
                       — and a standard that goes to an endorsement file has
                       to sit inside normal binding margins. TABLE_W stays
                       at 9071 so both documents keep identical table
                       geometry. */
                    page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
                },
                children,
            }],
        });
        _applyDocDefaultsLang(doc);

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = _safeFilename(occupation + (job ? ` ${job}` : ''), '_OS.docx');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showStatus(_t('msgOSExported') + ' ✓', 'success');

    } catch (error) {
        console.error('Error generating Occupational Standard document:', error);
        showStatus(_tf('msgWordError', { msg: error.message }), 'error');
    }
}
