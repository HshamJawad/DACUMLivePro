// ============================================================
// /exports_docx.js
// ------------------------------------------------------------
// Word (.docx) generation: the standalone Task Verification report
// and the full DACUM chart report.
//
// Split from exports.js. Depends on the `docx` library being loaded
// globally by index.html.
// ============================================================

import { getSkillLevelColumns } from './skill_levels.js';
import { appState } from './state.js';
import { showStatus } from './renderer.js';
import { buildVerificationDataset, getVerificationCoverage, formatDacumDateRange, formatVenueWithMode } from './exports_shared.js';
import { noteExportExclusion } from './draft_unverified.js';
import { getSupplementaryExportSections } from './supplementary_verification.js';
import * as ExportSettings from './export_settings.js';
import { buildLevelsDocxBlock } from './modules.js';
// 3.77.0: the chart-report sections live in exports_docx_sections.js.
// 3.77.0: was called below without being imported (the standalone branch is
// unreachable today — tvExportMode is forced to 'appendix' — but would throw).
import { lwExportVerifiedDOCX } from './workshop.js';
import { _docxAdditionalInfo, _docxClusters, _docxCustomSections, _docxDuties, _docxLearningOutcomes, _docxModules, _docxSkillsMatrix, _docxTaskAnalysis, _docxVerificationAppendix, _docxVerifiedResults } from './exports_docx_sections.js';


/* ── i18n + direction helpers ────────────────────────────────────────
   Every paragraph in this file used to carry `bidirectional: false`
   with the comment "Force LTR" — 152 of them. That was correct while
   the app was English-only and it is the single thing that made an
   Arabic Word export unusable: with an LTR base direction, an Arabic
   paragraph renders right-aligned text with its punctuation, brackets
   and any Latin fragments resolved against the wrong base, so a line
   ending in a full stop puts the stop on the left.

   What `bidirectional` sets is the paragraph's BASE direction, not the
   script. Word still runs the Unicode bidi algorithm inside the
   paragraph, so a Latin tool name or an ISO code inside Arabic prose
   comes out correctly either way. Basing it on the export language is
   therefore both sufficient and correct. */
export const _t   = (k)    => (window.i18n ? window.i18n.t(k)     : k);
export const _tf  = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
export const _rtl = ()     => (window.i18n ? window.i18n.isRTL()  : false);

/* Start/end alignment. AlignmentType has no logical START, so it is
   resolved here rather than at 48 call sites. */
export const _start = (A) => (_rtl() ? A.RIGHT : A.LEFT);

/* Arabic needs a face that actually carries the glyphs. Word falls back
   silently when it cannot find one, which is how a document ends up
   full of boxes on a machine without the original font. Amiri and
   Cairo are common on Arabic systems; Arial ships everywhere and has
   full Arabic coverage, so it is the safe default rather than the
   pretty one. */
export const _font = () => (_rtl() ? 'Arial' : 'Calibri');


/* ── Proofing language (w:lang) ──────────────────────────────────────
   docx@7.8.2 has NO `language` option on a run: RunProperties never
   emits <w:lang>, so every exported run inherited Word's UI language
   and Arabic came out underlined in red as misspelled English. This is
   a separate concern from direction — `bidi` / `bidirectional` set the
   READING ORDER, `w:lang` sets the DICTIONARY. Both are required.

   OOXML splits the proofing language in two:
     w:val  → language of the Latin ("low ANSI") text in the run
     w:bidi → language of the complex-script (Arabic) text in the run
   So Arabic runs get ar-IQ on both, while the document default keeps
   en-US for w:val — otherwise Word would check the English fragments
   (tool names, ISO codes, "N/A") against an Arabic dictionary and just
   move the red underlines somewhere else. Set _LANG_LATIN to 'ar-IQ'
   if a literal w:val="ar-IQ" default is ever required. */
const _LANG_AR    = 'ar-IQ';
const _LANG_LATIN = 'en-US';

/* Arabic + Arabic Supplement/Extended + Presentation Forms A/B. */
const _ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const _hasArabic = (s) => _ARABIC_RE.test(String(s ?? ''));

/* The library exposes no class for <w:lang>, but its serializer passes
   any non-XmlComponent child straight through to the XML writer, so a
   plain node in the writer's own shape is a supported escape hatch and
   needs no fork of the library. */
const _langNode = (val, bidi) => ({
  'w:lang': { _attr: { 'w:val': val, 'w:bidi': bidi } },
});

/* Text carried by a run, whether given as `text` or as string children. */
function _runText(o) {
  const kids = Array.isArray(o.children) ? o.children.filter((c) => typeof c === 'string') : [];
  return [o.text || '', ...kids].join(' ');
}

/* ── Export Settings, applied at the single point every run passes ───
   Both Word exporters in this file build their runs through the
   wrapper below, so transforming the options object here reaches all
   ~91 explicitly-sized runs without editing a single call site — and,
   like the Arabic tagging above, covers any run added later.

   Two rules, both written so that DEFAULT SETTINGS EMIT NOTHING NEW.
   At the defaults this function returns the options object unchanged
   and document.xml is byte-identical to the previous build.

   1. SIZE — a relative offset, never an absolute value.
      Only runs that already carry an explicit `size` are touched.
      Runs without one (the ~30 bold header cells) inherit from
      docDefaults, and writing an explicit size for them would mean
      guessing what Word's default is on the reader's machine.

   2. HEADING COLOUR — bold runs at 12 pt (size 24) or larger.
      That is the heading band in this document: the 32 / 28 / 24
      groups. Body prose sits at 22 and below and is left black.
      A run that already sets its own colour (the coverage warning at
      B91C1C) is never overridden.

      `__shaded: true` opts a run OUT of the heading colour. It marks
      the three runs that are simultaneously a heading and the contents
      of a shaded cell — a duty title bar, for example. Those take the
      automatic contrast colour instead, because a dark heading colour
      on a dark fill is unreadable. */
function _applyExportSettings(o) {
  const shaded = o.__shaded === true;
  let out = o;

  if (typeof out.size === 'number' && !ExportSettings.isSizeDefault()) {
    out = { ...out, size: ExportSettings.docxSize(out.size) };
  }

  if (!shaded &&
      out.bold === true &&
      typeof out.size === 'number' &&
      out.size >= 24 &&
      out.color === undefined &&
      !ExportSettings.isHeadingColorDefault()) {
    out = { ...out, color: ExportSettings.headingColor() };
  }

  if (shaded && out.color === undefined && !ExportSettings.isShadedTextDefault()) {
    out = { ...out, color: ExportSettings.contrastOn(ExportSettings.tableHeaderHex()) };
  }

  if (out.__shaded !== undefined) {
    /* Never reaches the library — it is our marker, not an option. */
    const { __shaded, ...clean } = out;
    out = clean;
  }
  return out;
}

/* The fill for every shaded cell in this document — 30 sites that all
   carried the literal 'DCDCDC'. Only the VALUE is centralised; each
   shading object keeps its original shape (some pass ShadingType.CLEAR
   explicitly, some do not), so nothing about the emitted <w:shd>
   changes at the default. */
export const _tblFill = () => ExportSettings.tableHeaderHex();

/* Wraps TextRun so every run holding Arabic is tagged at the source.
   Doing it here rather than at ~150 call sites means a run added later
   is covered automatically and cannot be forgotten. */
export function _withArabicLang(BaseRun) {
  return class extends BaseRun {
    constructor(options) {
      let o = (typeof options === 'string') ? { text: options } : (options || {});
      o = _applyExportSettings(o);
      const isAr = _rtl() && _hasArabic(_runText(o));
      /* w:rtl marks the run as complex script, which is what makes Word
         read w:bidi (not w:val) as the proofing language and apply the
         w:cs font. Without it the tag is easy for Word to ignore. */
      super(isAr ? { ...o, rightToLeft: true } : o);
      if (isAr) {
        try {
          /* Appended last, which is also where <w:lang> belongs in the
             EG_RPrBase sequence — after w:rtl and w:cs. */
          this.properties.addChildElement(_langNode(_LANG_AR, _LANG_AR));
        } catch (e) {
          console.warn('w:lang not applied to run:', e);
        }
      }
    }
  };
}

/* `new Paragraph({ text: '...' })` builds its run internally with the
   library's own TextRun, bypassing the wrapper above. Rewriting the
   shorthand into an explicit child keeps those 20-odd paragraphs from
   being the one gap. */
export function _withArabicLangParagraph(BaseParagraph, WrappedRun) {
  return class extends BaseParagraph {
    constructor(options) {
      const o = (typeof options === 'string') ? { text: options } : (options || {});
      if (_rtl() && o.text && _hasArabic(o.text)) {
        const { text, ...rest } = o;
        super({ ...rest, children: [new WrappedRun({ text }), ...(o.children || [])] });
      } else {
        super(options);
      }
    }
  };
}

/* Document-level fallback: <w:lang> inside docDefaults/rPrDefault, so
   anything not produced through the wrappers — and any text the user
   types into the exported file afterwards — still gets the right
   dictionary. docx@7.8.2 builds docDefaults from
   `styles.default.document.run`, which also has no language option, so
   the node is added to the tree the library already built. The walk is
   by rootKey and tolerates the structure moving in a future version. */
export function _applyDocDefaultsLang(doc) {
  if (!_rtl()) return;
  try {
    const find = (node, key) => {
      if (!node || typeof node !== 'object') return null;
      if (node.rootKey === key) return node;
      if (!Array.isArray(node.root)) return null;
      for (const child of node.root) {
        const hit = find(child, key);
        if (hit) return hit;
      }
      return null;
    };
    const defaults = find(doc.Styles, 'w:docDefaults');
    const rPr = defaults && find(defaults, 'w:rPr');
    if (rPr) rPr.addChildElement(_langNode(_LANG_LATIN, _LANG_AR));
  } catch (e) {
    /* Per-run tags already carry the fix; a missed default is cosmetic. */
    console.warn('w:lang not applied to docDefaults:', e);
  }
}

/* Dates in the exported document follow the EXPORT language, not the
   browser's locale — those are frequently different, and a report is a
   deliverable that must be internally consistent. */
export const _today = () => new Date().toLocaleDateString(
  window.i18n ? window.i18n.getLang() : undefined
);


/* A filename built with /[^a-z0-9]/gi turns an Arabic occupation title
   into a row of underscores — every Arabic export arrived as
   "________.docx". Keep Unicode letters and digits; strip only what a
   filesystem actually objects to. */
export function _safeFilename(title, suffix) {
  const base = String(title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')   // illegal on Windows
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return (base || _t('fileUntitled')) + suffix;
}



/* ── Supplementary Occupational Verification section ─────────────
   Returns the paragraphs/tables for the optional supplementary block,
   or [] when the feature is off or holds no verified items — in which
   case the document is byte-identical to previous builds. `lib` must
   carry the WRAPPED Paragraph/TextRun so Arabic keeps its w:lang. */
function _supplementaryDocxBlock(lib) {
    const sections = getSupplementaryExportSections();
    if (!sections.length) return [];

    const { Paragraph, TextRun, Table, TableRow, TableCell,
            WidthType, AlignmentType, ShadingType, PageBreak } = lib;
    const cols = [900, 5071, 1100, 1000, 1000];   // = 9071 twips (16 cm)
    const out = [];

    out.push(new Paragraph({ children: [new PageBreak()], bidirectional: _rtl() }));
    out.push(new Paragraph({
        children: [new TextRun({ text: _t('svTitle'), bold: true, size: 32 })],
        spacing: { before: 200, after: 200 },
        alignment: AlignmentType.CENTER,
        bidirectional: _rtl(),
    }));
    out.push(new Paragraph({
        children: [new TextRun({ text: _t('svExpNote'), italics: true, size: 20 })],
        spacing: { after: 300 },
        bidirectional: _rtl(),
    }));

    const head = (txt, i) => new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ text: txt, bold: true, size: 20, __shaded: true })],
            ...(i === 1 ? {} : { alignment: AlignmentType.CENTER }),
            bidirectional: _rtl(),
        })],
        width: { size: cols[i], type: WidthType.DXA },
        shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
    });
    const cell = (txt, i) => new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ text: txt, size: 20 })],
            ...(i === 1 ? {} : { alignment: AlignmentType.CENTER }),
            bidirectional: _rtl(),
        })],
        width: { size: cols[i], type: WidthType.DXA },
    });

    sections.forEach(sec => {
        out.push(new Paragraph({
            children: [new TextRun({ text: `${sec.letter}. ${sec.title}`, bold: true, size: 26 })],
            spacing: { before: 240, after: 120 },
            bidirectional: _rtl(),
        }));
        const rows = [new TableRow({
            tableHeader: true,
            children: [head(_t('svThRank'), 0), head(_t('svThItem'), 1),
                       head(_t('svThScore'), 2), head('%', 3), head(_t('svThResponses'), 4)],
        })];
        sec.items.forEach(it => rows.push(new TableRow({
            children: [cell(`#${it.rank}`, 0), cell(it.text, 1),
                       cell(it.aggregatedScore.toFixed(2), 2),
                       cell(`${it.percentage.toFixed(1)}%`, 3),
                       cell(String(it.responses), 4)],
        })));
        out.push(new Table({
            visuallyRightToLeft: _rtl(),
            width: { size: 9071, type: WidthType.DXA },
            columnWidths: cols,
            layout: 'fixed',
            rows,
        }));
    });
    return out;
}

export async function exportTaskVerificationWord() {
    // Tell the user WHY the appendix is missing rather than
    // shipping a report that is quietly short a section.
    noteExportExclusion();

            try {
                // Works in BOTH collection modes. The old guard rejected
                // anything that was not workshop mode before inspecting
                // the data at all, so Individual/Survey could never be
                // exported however complete it was.
                const tvResults = buildVerificationDataset();

                const validResults = Object.keys(tvResults).filter(key =>
                    tvResults[key] && tvResults[key].valid
                );

                // One fully-rated task is enough. A partial export is a
                // normal thing to want mid-analysis; the coverage line
                // below states plainly how partial it is.
                if (validResults.length === 0) {
                    alert(_t('msgNoTaskRated'));
                    return;
                }

                const tvCoverage = getVerificationCoverage(tvResults);
                
                if (typeof window.docx === 'undefined') {
                    showStatus(_t('msgDocxLibMissing'), 'error');
                    return;
                }

                const { Document, Paragraph: _Paragraph, TextRun: _TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType, Packer } = window.docx;
                /* Runs and shorthand paragraphs are created through the
                   wrappers so Arabic carries <w:lang>. */
                const TextRun   = _withArabicLang(_TextRun);
                const Paragraph = _withArabicLangParagraph(_Paragraph, TextRun);

                showStatus(_t('msgGeneratingTVWord'), 'success');

                const children = [];
                
                const occupationTitleInput = document.getElementById('occupationTitle');
                const occupationTitle = occupationTitleInput ? occupationTitleInput.value : 'Unknown Occupation';
                
                // Title
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _t('expTaskVerification'),
                            bold: true,
                            size: 32,
                        }),
                    ],
                    spacing: { after: 300 },
                    bidirectional: _rtl(),
                }));
                
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _tf('expOccupation', { v: occupationTitle }),
                            bold: true,
                            size: 28,
                        }),
                    ],
                    spacing: { after: 200 },
                    bidirectional: _rtl(),
                }));
                
                const today = _today();
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _tf('expDateOfAnalysis', { v: today }),
                            size: 24,
                        }),
                    ],
                    spacing: { after: 200 },
                    bidirectional: _rtl(),
                }));
                
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _tf('expBasedOn', { v: occupationTitle }),
                            italics: true,
                            size: 20,
                        }),
                    ],
                    spacing: { after: 400 },
                    bidirectional: _rtl(),
                }));
                
                // Methodology Summary
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _t('expMethodologySummary'),
                            bold: true,
                            size: 28,
                        }),
                    ],
                    spacing: { after: 200 },
                    bidirectional: _rtl(),
                }));
                
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _tf('expCollectionMode', { v: _t(appState.collectionMode === 'workshop' ? 'modeWorkshop' : 'expIndividualSurvey') }),
                            size: 22,
                        }),
                    ],
                    spacing: { after: 100 },
                    bidirectional: _rtl(),
                }));
                
                // Participant count only exists when there was a panel.
                // Printing appState.workshopParticipants in Individual /
                // Survey mode would state an evidence base that does not
                // exist for these numbers.
                if (appState.collectionMode === 'workshop') {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _tf('expParticipants', { v: appState.workshopParticipants }),
                                size: 22,
                            }),
                        ],
                        spacing: { after: 100 },
                        bidirectional: _rtl(),
                    }));
                }

                // Coverage. Bold and red when partial, so a work-in-progress
                // export can never be mistaken for a completed verification.
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _tf('expCoverage', { v: tvCoverage.label }),
                            size: 22,
                            bold: !tvCoverage.complete,
                            color: tvCoverage.complete ? '000000' : 'B91C1C',
                        }),
                    ],
                    spacing: { after: 100 },
                    bidirectional: _rtl(),
                }));
                
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _tf('expWorkflowMode', { v: _t(appState.workflowMode === 'standard' ? 'modeStandard' : 'modeExtended') }),
                            size: 22,
                        }),
                    ],
                    spacing: { after: 100 },
                    bidirectional: _rtl(),
                }));
                
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _tf('expPriorityFormula', { v: _t(appState.priorityFormula === 'if' ? 'formulaIF' : 'formulaIFD') }),
                            size: 22,
                        }),
                    ],
                    spacing: { after: 400 },
                    bidirectional: _rtl(),
                }));
                
                // Priority Rankings
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _t('expPriorityRankings'),
                            bold: true,
                            size: 28,
                        }),
                    ],
                    spacing: { after: 200 },
                    bidirectional: _rtl(),
                }));
                
                // Get and sort results
                const sortedResults = [];
                validResults.forEach(taskKey => {
                    const result = tvResults[taskKey];
                    
                    // Use stored duty and task titles (with backward compatibility)
                    let dutyText = result.dutyTitle;
                    let taskText = result.taskTitle;
                    
                    // Backward compatibility: if not stored, look up from DOM
                    if (!dutyText || !taskText) {
                        const taskParts = taskKey.split('_task_');
                        const dutyId = taskParts[0];
                        
                        if (!dutyText) {
                            const dutyInput = document.querySelector(`input[data-duty-id="${dutyId}"], textarea[data-duty-id="${dutyId}"]`);
                            dutyText = dutyInput ? dutyInput.value.trim() : 'Unassigned';
                        }
                        
                        if (!taskText) {
                            const taskInput = document.querySelector(`input[data-task-id="${taskKey}"], textarea[data-task-id="${taskKey}"]`);
                            taskText = taskInput ? taskInput.value.trim() : 'Unassigned';
                        }
                    }
                    
                    sortedResults.push({
                        duty: dutyText,
                        task: taskText,
                        meanI: result.meanImportance,
                        meanF: result.meanFrequency,
                        meanD: result.meanDifficulty,
                        priority: result.priorityIndex
                    });
                });
                
                sortedResults.sort((a, b) => b.priority - a.priority);
                
                // Create table
                const tableRows = [];
                
                // Header row
                tableRows.push(new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expRank'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                            shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expDutyLabel'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                            shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expTaskLabel'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                            shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expMeanI'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                            shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expMeanF'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                            shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expMeanD'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                            shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expPriority'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                            shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                        }),
                    ],
                }));
                
                // Data rows
                sortedResults.forEach((row, index) => {
                    tableRows.push(new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `#${index + 1}` })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ text: row.duty, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ text: row.task, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.meanI !== null ? row.meanI.toFixed(2) : 'N/A' })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.meanF !== null ? row.meanF.toFixed(2) : 'N/A' })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.meanD !== null ? row.meanD.toFixed(2) : 'N/A' })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.priority !== null ? row.priority.toFixed(2) : 'N/A' })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                        ],
                    }));
                });
                
                children.push(new Table({
                    visuallyRightToLeft: _rtl(),
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: tableRows,
                }));
                
                // Duty-Level Summary section
                children.push(new Paragraph({ spacing: { after: 400 } }));
                
                children.push(new Paragraph({
                    children: [new TextRun({ text: _t('expDutyLevelSummary'), bold: true, size: 28 })],
                    spacing: { after: 200 },
                    bidirectional: _rtl(),
                }));
                
                children.push(new Paragraph({
                    children: [new TextRun({ text: _tf('expTrainingLoadMethod', { v: _t(appState.trainingLoadMethod === 'advanced' ? 'expAdvancedMethod' : 'expSimpleMethod') }), size: 20, italics: true })],
                    spacing: { after: 200 },
                    bidirectional: _rtl(),
                }));
                
                // Aggregate duty-level data
                const dutyMap = {};
                Object.keys(tvResults).forEach(taskKey => {
                    const result = tvResults[taskKey];
                    if (result && result.valid) {
                        let dutyId = result.dutyId || taskKey.split('_task_')[0];
                        let dutyTitle = result.dutyTitle;
                        
                        if (!dutyTitle) {
                            const dutyInput = document.querySelector(`input[data-duty-id="${dutyId}"], textarea[data-duty-id="${dutyId}"]`);
                            dutyTitle = dutyInput ? dutyInput.value.trim() : 'Unassigned';
                        }
                        
                        if (!dutyMap[dutyId]) {
                            dutyMap[dutyId] = { dutyTitle: dutyTitle, validTasks: 0, prioritySum: 0, tasks: [] };
                        }
                        
                        dutyMap[dutyId].validTasks++;
                        dutyMap[dutyId].prioritySum += result.priorityIndex;
                        dutyMap[dutyId].tasks.push({ priorityIndex: result.priorityIndex, meanDifficulty: result.meanDifficulty });
                    }
                });
                
                const dutyResults = [];
                Object.keys(dutyMap).forEach(dutyId => {
                    const duty = dutyMap[dutyId];
                    const avgPriority = duty.prioritySum / duty.validTasks;
                    let trainingLoad = 0;
                    if (appState.trainingLoadMethod === 'advanced') {
                        trainingLoad = duty.tasks.reduce((sum, t) => sum + (t.priorityIndex * t.meanDifficulty), 0);
                    } else {
                        trainingLoad = avgPriority * duty.validTasks;
                    }
                    dutyResults.push({ dutyTitle: duty.dutyTitle, validTasks: duty.validTasks, avgPriority: avgPriority, trainingLoad: trainingLoad });
                });
                
                dutyResults.sort((a, b) => b.avgPriority - a.avgPriority);
                
                // Duty table
                const dutyTableRows = [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expDutyTitle'), bold: true })], alignment: _start(AlignmentType), bidirectional: _rtl() })], shading: { fill: _tblFill() } }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expTasks'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })], shading: { fill: _tblFill() } }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expAvgPriority'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })], shading: { fill: _tblFill() } }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expTrainingLoad'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })], shading: { fill: _tblFill() } }),
                        ],
                    })
                ];
                
                dutyResults.forEach(duty => {
                    dutyTableRows.push(new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: duty.dutyTitle, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: duty.validTasks.toString() })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: duty.avgPriority.toFixed(2) })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: duty.trainingLoad.toFixed(2), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                        ],
                    }));
                });
                
                children.push(new Table({
                    visuallyRightToLeft: _rtl(),
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: dutyTableRows,
                }));
                
                // Notes section
                children.push(new Paragraph({ spacing: { after: 400 } }));
                
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _t('expNotesMethodology'),
                            bold: true,
                            size: 24,
                        }),
                    ],
                    spacing: { after: 200 },
                    bidirectional: _rtl(),
                }));
                
                const notes = [
                    'Weighted Mean = Σ(value × count) ÷ total responses',
                    'Importance scale: 0=Not Important, 1=Somewhat, 2=Important, 3=Critical',
                    'Frequency scale: 0=Rarely, 1=Sometimes, 2=Often, 3=Daily',
                    'Difficulty scale: 0=Easy, 1=Moderate, 2=Challenging, 3=Very Difficult',
                    `Priority Index = ${appState.priorityFormula === 'if' ? 'Mean Importance × Mean Frequency' : 'Mean Importance × Mean Frequency × Mean Difficulty'}`,
                    'Higher priority values indicate greater training importance',
                    'Results follow DACUM (Developing A Curriculum) methodology'
                ];
                
                notes.forEach(note => {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: `• ${note}`,
                                size: 20,
                            }),
                        ],
                        spacing: { after: 100 },
                        bidirectional: _rtl(),
                    }));
                });
                
                // Supplementary Occupational Verification (only when enabled + used)
                children.push(..._supplementaryDocxBlock({
                    Paragraph, TextRun, Table, TableRow, TableCell,
                    WidthType, AlignmentType, ShadingType,
                    PageBreak: window.docx.PageBreak,
                }));

                // Create document
                const doc = new Document({
                    styles: {
                        default: {
                            document: { run: { font: _font() } },
                        },
                    },
                    sections: [{
                        properties: {
                            /* NO-OP — kept only so the intent is not lost.
                               docx has no `bidi` option on section
                               properties in v7.8.2 (nor in v9): it appears
                               in the library source as an XSD comment only,
                               and the generated <w:sectPr> contains no
                               <w:bidi/>. Verified against the packed output.

                               Nothing depends on it. RTL is already carried
                               where it counts: `visuallyRightToLeft` on each
                               Table emits <w:bidiVisual/> for column order,
                               and `bidirectional` on each Paragraph emits
                               <w:bidi/> for reading order. The only thing
                               still missing is the section-level default for
                               automatic list numbering — if numbered lists
                               are ever added, inject <w:bidi/> into sectPr
                               the way _applyDocDefaultsLang injects w:lang,
                               or upgrade the library. */
                            bidi: _rtl(),
                            page: {
                                margin: {
                                    top: 1440,
                                    right: 1440,
                                    bottom: 1440,
                                    left: 1440,
                                },
                            },
                        },
                        children: children,
                    }],
                });

                /* <w:lang> in docDefaults — the safety net under the
                   per-run tags, and what makes text typed into the
                   exported file later behave as well. */
                _applyDocDefaultsLang(doc);

                // Generate and download
                const blob = await Packer.toBlob(doc);
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = _safeFilename(occupationTitle, '_Task_Verification.docx');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                showStatus(_t('msgWordExported') + ' ✓', 'success');

            } catch (error) {
                console.error('Error generating Task Verification Word document:', error);
                showStatus(_tf('msgTVWordError', { msg: error.message }), 'error');
            }
        }

export async function exportToWord() {
    // Tell the user WHY the appendix is missing rather than
    // shipping a report that is quietly short a section.
    noteExportExclusion();

    // ── TABLE SHADING ──────────────────────────────────────────
    // Every shaded cell in this document uses DCDCDC = RGB(220,220,220),
    // the same grey the PDF exporter fills duty bars with. This export
    // previously mixed four tints (667eea purple headers, E8E8E8,
    // F5F5F5 and DCDCDC), so the Word and PDF versions of the same
    // chart read as two different documents.
    //
    // IMPORTANT — always use ShadingType.CLEAR here, never SOLID.
    // In OOXML, w:shd carries BOTH a background (w:fill) and a pattern
    // foreground (w:color). val="solid" means "paint the cell 100% in
    // the PATTERN colour", so w:fill is ignored entirely — and where no
    // colour was given it defaulted to "auto", i.e. black. That is why
    // these bars rendered as solid black blocks regardless of the fill
    // value set. val="clear" means "no pattern", which lets w:fill show
    // through as an ordinary background. Cell text stays black.
            // ============ CHECK FOR VERIFIED LIVE WORKSHOP RESULTS ============
            const hasVerifiedResults = typeof appState.lwFinalizedData !== 'undefined' && appState.lwFinalizedData && 
                                        typeof appState.lwAggregatedResults !== 'undefined' && appState.lwAggregatedResults;
            
            // ============ VERIFIED LIVE WORKSHOP STANDALONE EXPORT ============
            if (hasVerifiedResults && appState.tvExportMode === 'standalone') {
                await lwExportVerifiedDOCX();
                return;
            }
            
            // ============ REGULAR TASK VERIFICATION STANDALONE EXPORT ============
            if (!hasVerifiedResults && appState.tvExportMode === 'standalone') {
                await exportTaskVerificationWord();
                return;
            }
            
            // ============ NORMAL DACUM EXPORT (with optional appendix) ============
            try {
                if (typeof window.docx === 'undefined') {
                    showStatus(_t('msgDocxLibMissing'), 'error');
                    return;
                }

                const { Document, Paragraph: _Paragraph, TextRun: _TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Packer, PageBreak, convertInchesToTwip, ShadingType, TextDirection, ImageRun } = window.docx;
                /* Runs and shorthand paragraphs are created through the
                   wrappers so Arabic carries <w:lang>. */
                const TextRun   = _withArabicLang(_TextRun);
                const Paragraph = _withArabicLangParagraph(_Paragraph, TextRun);

                // Get all input values
                const dacumDate = formatDacumDateRange(iso => {
                    const dateObj = new Date(iso + 'T00:00:00');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const year = dateObj.getFullYear();
                    return `${month}/${day}/${year}`;
                });
                const producedFor = document.getElementById('producedFor').value;
                const producedBy = document.getElementById('producedBy').value;
                const occupationTitle = document.getElementById('occupationTitle').value;
                const jobTitle = document.getElementById('jobTitle').value;

                if (!occupationTitle) {
                    alert(_t('msgOccupationRequiredExport'));
                    showStatus(_t('msgOccupationRequiredExport'), 'error');
                    return;
                }

                showStatus(_t('msgGeneratingWord'), 'success');

                const children = [];

                // ============ TITLE PAGE ============
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: _tf('expOccupationTitle', { v: occupationTitle }),
                            bold: true,
                            size: 28, // 14pt
                        }),
                    ],
                    spacing: { after: 200 },
                    bidirectional: _rtl(),
                }));

                // Scope of Work / Occupational Definition (optional)
                const scopeOfWorkEl    = document.getElementById('scopeOfWork');
                const scopeOfWorkValue = (scopeOfWorkEl ? scopeOfWorkEl.value : '').trim();
                if (scopeOfWorkValue) {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _t('expScopeOfWork'),
                                bold: true,
                                size: 24, // 12pt
                            }),
                        ],
                        spacing: { before: 80, after: 80 },
                        bidirectional: _rtl(),
                    }));
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: scopeOfWorkValue,
                                size: 22, // 11pt
                            }),
                        ],
                        spacing: { after: 200 },
                        bidirectional: _rtl(),
                    }));
                }

                // Job Title is optional — skip the paragraph entirely when empty
                if (jobTitle && jobTitle.trim()) {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _tf('expJobTitle', { v: jobTitle }),
                                bold: true,
                                size: 28, // 14pt
                            }),
                        ],
                        spacing: { after: 200 },
                        bidirectional: _rtl(),
                    }));
                }

                // Add DACUM Date if exists
                if (dacumDate) {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _tf('expDacumDate', { v: dacumDate }),
                                bold: true,
                                size: 24, // 12pt
                            }),
                        ],
                        spacing: { after: 200 },
                        bidirectional: _rtl(),
                    }));
                }
                
                // Add Venue if exists
                const venueValue = formatVenueWithMode();
                if (venueValue) {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _tf('expVenue', { v: venueValue }),
                                bold: true,
                                size: 24, // 12pt
                            }),
                        ],
                        spacing: { after: 200 },
                        bidirectional: _rtl(),
                    }));
                }

                // Add Produced For if exists
                if (producedFor) {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _tf('expProducedFor', { v: producedFor }),
                                bold: true,
                                size: 24, // 12pt
                            }),
                        ],
                        spacing: { after: 200 },
                        bidirectional: _rtl(),
                    }));
                    
                    // Add Produced For logo if exists
                    if (appState.producedForImage) {
                        try {
                            const base64Data = appState.producedForImage.split(',')[1];
                            
                            children.push(new Paragraph({
                                children: [
                                    new ImageRun({
                                        data: Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)),
                                        transformation: {
                                            width: 94, // 2.5cm = 94 points approximately
                                            height: 94,
                                        },
                                    }),
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 200 },
                            }));
                        } catch (imgError) {
                            console.error('Error adding Produced For image:', imgError);
                        }
                    }
                }

                // Add Produced By if exists
                if (producedBy) {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _tf('expProducedBy', { v: producedBy }),
                                bold: true,
                                size: 24, // 12pt
                            }),
                        ],
                        spacing: { after: 200 },
                        bidirectional: _rtl(),
                    }));
                    
                    // Add Produced By logo if exists
                    if (appState.producedByImage) {
                        try {
                            const base64Data = appState.producedByImage.split(',')[1];
                            
                            children.push(new Paragraph({
                                children: [
                                    new ImageRun({
                                        data: Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)),
                                        transformation: {
                                            width: 94, // 2.5cm = 94 points approximately
                                            height: 94,
                                        },
                                    }),
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 400 },
                            }));
                        } catch (imgError) {
                            console.error('Error adding Produced By image:', imgError);
                        }
                    }
                } else {
                    // Add extra spacing if no Produced By section
                    children.push(new Paragraph({ spacing: { after: 200 } }));
                }

                // Workshop Roles Section
                const facilitatorsText = document.getElementById('facilitators')?.value.trim();
                const observersText = document.getElementById('observers')?.value.trim();
                const panelMembersText = document.getElementById('panelMembers')?.value.trim();
                
                if (facilitatorsText) {
                    const facilitatorNames = facilitatorsText.split('\n').map(s => s.trim()).filter(s => s);
                    if (facilitatorNames.length > 0) {
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _t('expFacilitators'),
                                    bold: true,
                                    size: 24, // 12pt
                                }),
                            ],
                            spacing: { before: 200, after: 100 },
                            bidirectional: _rtl(),
                        }));
                        
                        const facilitatorRows = facilitatorNames.map(name => 
                            new TableRow({
                                children: [
                                    new TableCell({
                                        children: [
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: name,
                                                        size: 22, // 11pt
                                                    }),
                                                ],
                                                bidirectional: _rtl(),
                                            }),
                                        ],
                                    }),
                                ],
                            })
                        );
                        
                        children.push(new Table({
                            visuallyRightToLeft: _rtl(),
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            /* Single full-width column. Declared so <w:tblGrid> matches
                               the cell instead of the library's 100-twip placeholder —
                               harmless under auto layout, fatal the day someone adds
                               layout:"fixed" here. */
                            columnWidths: [9071],
                            rows: facilitatorRows,
                        }));
                    }
                }
                
                if (observersText) {
                    const observerNames = observersText.split('\n').map(s => s.trim()).filter(s => s);
                    if (observerNames.length > 0) {
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _t('expObservers'),
                                    bold: true,
                                    size: 24, // 12pt
                                }),
                            ],
                            spacing: { before: 200, after: 100 },
                            bidirectional: _rtl(),
                        }));
                        
                        const observerRows = observerNames.map(name => 
                            new TableRow({
                                children: [
                                    new TableCell({
                                        children: [
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: name,
                                                        size: 22, // 11pt
                                                    }),
                                                ],
                                                bidirectional: _rtl(),
                                            }),
                                        ],
                                    }),
                                ],
                            })
                        );
                        
                        children.push(new Table({
                            visuallyRightToLeft: _rtl(),
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            /* Single full-width column. Declared so <w:tblGrid> matches
                               the cell instead of the library's 100-twip placeholder —
                               harmless under auto layout, fatal the day someone adds
                               layout:"fixed" here. */
                            columnWidths: [9071],
                            rows: observerRows,
                        }));
                    }
                }
                
                if (panelMembersText) {
                    const panelMemberNames = panelMembersText.split('\n').map(s => s.trim()).filter(s => s);
                    if (panelMemberNames.length > 0) {
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _t('expPanelMembers'),
                                    bold: true,
                                    size: 24, // 12pt
                                }),
                            ],
                            spacing: { before: 200, after: 100 },
                            bidirectional: _rtl(),
                        }));
                        
                        const panelMemberRows = panelMemberNames.map(name => 
                            new TableRow({
                                children: [
                                    new TableCell({
                                        children: [
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: name,
                                                        size: 22, // 11pt
                                                    }),
                                                ],
                                                bidirectional: _rtl(),
                                            }),
                                        ],
                                    }),
                                ],
                            })
                        );
                        
                        children.push(new Table({
                            visuallyRightToLeft: _rtl(),
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            /* Single full-width column. Declared so <w:tblGrid> matches
                               the cell instead of the library's 100-twip placeholder —
                               harmless under auto layout, fatal the day someone adds
                               layout:"fixed" here. */
                            columnWidths: [9071],
                            rows: panelMemberRows,
                        }));
                    }
                }

                // ============ DUTIES AND TASKS (NEW PAGE) ============
                children.push(new Paragraph({
                    children: [
                        new PageBreak(),
                        new TextRun({
                            text: _t('expDutiesAndTasks'),
                            bold: true,
                            size: 28, // 14pt
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 },
                    bidirectional: _rtl(),
                }));

                // Collect duties and tasks
                const dutyInputs = document.querySelectorAll('input[data-duty-id], textarea[data-duty-id]');
                const duties = [];
                
                dutyInputs.forEach(dutyInput => {
                    const dutyText = dutyInput.value.trim();
                    if (dutyText) {
                        const dutyId = dutyInput.getAttribute('data-duty-id');
                        const taskInputs = document.querySelectorAll(`input[data-task-id^="${dutyId}_"], textarea[data-task-id^="${dutyId}_"]`);
                        const tasks = [];
                        
                        taskInputs.forEach(taskInput => {
                            const taskText = taskInput.value.trim();
                            if (taskText) {
                                tasks.push(taskText);
                            }
                        });
                        
                        duties.push({
                            duty: dutyText,
                            tasks: tasks
                        });
                    }
                });

                // Create a table for each duty
                _docxDuties({ Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, children, duties });

                // ============ ADDITIONAL INFORMATION (NEW PAGE) ============
                children.push(new Paragraph({
                    children: [
                        new PageBreak(),
                        new TextRun({
                            text: _t('expAdditionalInfo'),
                            bold: true,
                            size: 24, // 12pt
                        }),
                    ],
                    spacing: { after: 300 },
                    bidirectional: _rtl(),
                }));

                // Create 2-column tables for additional info
                const additionalInfoSections = [
                    {
                        heading1: document.getElementById('knowledgeHeading').textContent,
                        content1: document.getElementById('knowledgeInput').value.trim(),
                        heading2: document.getElementById('behaviorsHeading').textContent,
                        content2: document.getElementById('behaviorsInput').value.trim(),
                    },
                    {
                        heading1: document.getElementById('skillsHeading').textContent,
                        content1: document.getElementById('skillsInput').value.trim(),
                        heading2: '', // Empty for single column
                        content2: '',
                    },
                    {
                        heading1: document.getElementById('toolsHeading').textContent,
                        content1: document.getElementById('toolsInput').value.trim(),
                        heading2: document.getElementById('trendsHeading').textContent,
                        content2: document.getElementById('trendsInput').value.trim(),
                    },
                    {
                        heading1: document.getElementById('acronymsHeading').textContent,
                        content1: document.getElementById('acronymsInput').value.trim(),
                        heading2: document.getElementById('careerPathHeading').textContent,
                        content2: document.getElementById('careerPathInput').value.trim(),
                    },
                ];

                /* Builds the 30/70 "label cell + content cell" table used
                   by the Acronyms block. Extracted so Career Path can be
                   rendered the same way instead of being dropped — see the
                   note in the index === 3 branch below. */
                const _labelledTable = (headingText, contentText) => {
                    const row = new TableRow({
                        children: [
                            // First cell: heading only, on the shaded fill
                            new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({ __shaded: true,
                                                text: headingText,
                                                bold: true,
                                                size: 24, // 12pt
                                            }),
                                        ],
                                        bidirectional: _rtl(),
                                    }),
                                ],
                                shading: {
                                    fill: _tblFill(), // RGB(220,220,220) — matches the duty bar
                                    type: ShadingType.CLEAR,
                                    color: "auto",
                                },
                                width: { size: 30, type: WidthType.PERCENTAGE },
                            }),
                            // Second cell: content only
                            new TableCell({
                                children: contentText.split('\n').filter(line => line.trim()).map(line =>
                                    new Paragraph({
                                        children: [
                                            new TextRun({
                                                text: line.trim().replace(/^[•\-*]\s*/, '• '),
                                                size: 24, // 12pt
                                            }),
                                        ],
                                        bidirectional: _rtl(),
                                    })
                                ),
                                width: { size: 70, type: WidthType.PERCENTAGE },
                            }),
                        ],
                    });

                    children.push(
                        new Table({
                            visuallyRightToLeft: _rtl(),
                            width: { size: 9071, type: WidthType.DXA }, // 16cm in twips
                            /* columnWidths is what docx@7.8.2 builds
                               <w:tblGrid> from — and the ONLY thing. Omit it
                               and the grid is written as 100 twips per
                               column; under <w:tblLayout w:type="fixed"/>
                               that grid outranks every tcW and the table
                               collapses. It survived here only because the
                               cells are sized in PERCENTAGE, which Word
                               happens to honour anyway; the moment a cell
                               moves to DXA the table breaks. Values below
                               are the same proportions the cells declare,
                               resolved against the 9071-twip (16 cm) width.
                               Two columns at 30% / 70%. */
                            columnWidths: [2721, 6350],
                            layout: "fixed",
                            rows: [row],
                        })
                    );
                    children.push(new Paragraph({ spacing: { after: 200 } }));
                };

                _docxAdditionalInfo({ Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, _labelledTable, additionalInfoSections, children });

                // Add custom sections
                const customSectionsContainer = document.getElementById('customSectionsContainer');
                const customSectionDivs = customSectionsContainer.querySelectorAll('.section-container');
                
                _docxCustomSections({ Paragraph, Table, TableCell, TableRow, TextRun, WidthType, children, customSectionDivs });

                // ============ SKILLS LEVEL MATRIX EXPORT ============
                // Check if there's any meaningful data in Skills Level Matrix
                // Columns are the project's levels (skill_levels.js, 3.40.0).
                // With the four defaults every width and label below is the
                // same as before, so those documents are unchanged.
                const slCols = getSkillLevelColumns();
                const slN = slCols.length;
                const slPct = Math.floor(60 / slN);              // 4 → 15 %
                const slCompW = 3629;                             // 40 % of 9071
                const slLevelW = (() => {                         // 4 → 1361,1361,1360,1360
                    const rest = 9071 - slCompW, base = Math.floor(rest / slN), rem = rest - base * slN;
                    return slCols.map((_, i) => base + (i < rem ? 1 : 0));
                })();
                const hasSkillsLevelData = appState.skillsLevelData?.some(category =>
                    category.competencies.some(comp =>
                        slCols.some(col => (comp.levels || {})[col.id] === true)
                    )
                );

                _docxSkillsMatrix({ AlignmentType, PageBreak, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, children, hasSkillsLevelData, slCols, slCompW, slLevelW, slN, slPct });

                // ============ TASK VERIFICATION APPENDIX (if mode = 'appendix') ============
                _docxVerificationAppendix({ AlignmentType, PageBreak, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, children });

                // ============ VERIFIED LIVE WORKSHOP RESULTS APPENDIX ============
                _docxVerifiedResults({ PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, children, hasVerifiedResults });

                // ============ SUPPLEMENTARY OCCUPATIONAL VERIFICATION ============
                // Separate from the task verification appendices above;
                // adds nothing when the optional feature is off or unused.
                children.push(..._supplementaryDocxBlock({
                    Paragraph, TextRun, Table, TableRow, TableCell,
                    WidthType, AlignmentType, ShadingType, PageBreak,
                }));

                // ============ TASK ANALYSIS APPENDIX ============
                // Sits between Task Verification and Competency Clusters,
                // matching the on-screen tab order. Included whenever any
                // task has analysis content — independent of tvExportMode,
                // which only governs the verification RATINGS appendix.
                _docxTaskAnalysis({ AlignmentType, PageBreak, Paragraph, TextRun, children });

                // ============ COMPETENCY CLUSTERS SECTION ============
                _docxClusters({ AlignmentType, PageBreak, Paragraph, TextRun, children });

                // ============ LEARNING OUTCOMES SECTION ============
                _docxLearningOutcomes({ AlignmentType, PageBreak, Paragraph, TextRun, children });

                // ============ MODULE MAPPING SECTION ============
                _docxModules({ AlignmentType, PageBreak, Paragraph, TextRun, children });

                // ============ LEVELS & COVERAGE MATRIX ============
                // Programme structure by level + performance-criteria
                // coverage matrix. Built in modules.js (single source,
                // same data as the on-screen matrix); returns [] when the
                // project has no modules, so older projects are unchanged.
                try {
                    children.push(...buildLevelsDocxBlock({ Paragraph, TextRun, Table, TableRow, TableCell,
                        WidthType, AlignmentType, ShadingType, PageBreak, fill: _tblFill(), rtl: _rtl() }));
                } catch (e) { console.warn('[export docx] levels/coverage block skipped:', e); }

                /* The "Assessment Plan" appendix (3.24.0) was removed in 3.42.0:
                   assessment forms per learning outcome are produced in Module
                   Builder, and the linked criteria are already printed above in
                   the Learning Outcomes and Module Mapping sections. */

                // Create document
                const doc = new Document({
                    styles: {
                        default: {
                            document: { run: { font: _font() } },
                        },
                    },
                    sections: [{
                        properties: {
                            /* NO-OP — kept only so the intent is not lost.
                               docx has no `bidi` option on section
                               properties in v7.8.2 (nor in v9): it appears
                               in the library source as an XSD comment only,
                               and the generated <w:sectPr> contains no
                               <w:bidi/>. Verified against the packed output.

                               Nothing depends on it. RTL is already carried
                               where it counts: `visuallyRightToLeft` on each
                               Table emits <w:bidiVisual/> for column order,
                               and `bidirectional` on each Paragraph emits
                               <w:bidi/> for reading order. The only thing
                               still missing is the section-level default for
                               automatic list numbering — if numbered lists
                               are ever added, inject <w:bidi/> into sectPr
                               the way _applyDocDefaultsLang injects w:lang,
                               or upgrade the library. */
                            bidi: _rtl(),
                            page: {
                                margin: {
                                    top: 1440,
                                    right: 1440,
                                    bottom: 1440,
                                    left: 1440,
                                },
                            },
                        },
                        children: children,
                    }],
                });

                /* <w:lang> in docDefaults — the safety net under the
                   per-run tags, and what makes text typed into the
                   exported file later behave as well. */
                _applyDocDefaultsLang(doc);

                // Generate and download
                const blob = await Packer.toBlob(doc);
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                /* Was /[^a-z0-9]/gi, which erased every Arabic character —
                   the file arrived as "______.docx". */
                const _jobPart = (jobTitle && jobTitle.trim()) ? ` ${jobTitle}` : '';
                link.download = _safeFilename(occupationTitle + _jobPart, '_DACUM_Chart.docx');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                showStatus(_t('msgWordExported') + ' ✓', 'success');

            } catch (error) {
                console.error('Error generating Word document:', error);
                showStatus(_tf('msgWordError', { msg: error.message }), 'error');
            }
        }
