// ============================================================
// /exports_pdf.js
// ------------------------------------------------------------
// PDF generation: the standalone Task Verification report and the
// full DACUM chart report.
//
// Split from exports.js. Depends on jsPDF being loaded globally by
// index.html.
// ============================================================

import { appState } from './state.js';
import { showStatus } from './renderer.js';
import { getTaskCode, getDutyLetter } from './codes.js';
import { buildVerificationDataset, getVerificationCoverage } from './exports_shared.js';
import { noteExportExclusion } from './draft_unverified.js';
/* lwExportVerifiedPDF() was called on the standalone path without ever
   being imported — a ReferenceError that only fires when a facilitator
   exports verified live-workshop results as a standalone PDF, which is
   why it survived this long. Found by check_imports.js. */
import { lwExportVerifiedPDF } from './workshop.js';
import { getTaskAnalysisExportData } from './task_analysis.js';
import { getSupplementaryExportSections } from './supplementary_verification.js';
import * as ExportSettings from './export_settings.js';
import {
    ensureArabicFont,
    isArabicFontLoaded,
    installArabicRTL,
    suspendJsPdfArabicParser,
    drawTick
} from './pdf_arabic.js';


/* ── i18n + direction helpers ────────────────────────────────────────
   This file used to REFUSE outright in Arabic and point the user at
   the Word export. The reasoning was sound at the time — jsPDF's
   standard-14 fonts carry no Arabic glyphs, the library does no
   shaping, and a plausible-looking but unreadable PDF is worse than no
   PDF because it gets emailed to a ministry before anyone opens it.

   All three obstacles are now handled, none of them here:

     • Glyphs  — an embedded TTF (arabic-font.js).
     • Shaping — a contextual shaper that consults the font's own cmap,
                 so Cairo's deliberately absent isolated forms fall back
                 to the base code point instead of vanishing.
     • Layout  — pdf_arabic.js mirrors the document, so the ~145
                 absolute left-anchored coordinates in this file did
                 NOT have to be rewritten from the right margin.

   Labels below are the same i18n keys the Word exporter uses, so the
   two exports of one chart no longer disagree on wording. */
const _t   = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf  = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _rtl = ()     => (window.i18n ? window.i18n.isRTL()  : false);

/* A filename built with /[^a-z0-9]/gi turns an Arabic occupation title
   into a row of underscores — every Arabic export would arrive as
   "________.pdf". Keep Unicode letters and digits; strip only what a
   filesystem actually objects to. Same sanitiser as exports_docx.js. */
function _safeFilename(title, suffix) {
  const base = String(title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')   // illegal on Windows
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return (base || _t('fileUntitled')) + suffix;
}

/* Arabic needs the font cache warm before a single glyph is drawn, and
   warming it is a fetch. Rather than make both entry points async —
   changing their contract for every caller in the app over one network
   round trip per session — the export bails out, warms the cache, and
   re-enters itself. `retry` guards against a loop if the font is
   missing from the deployment.

   Returns true when the caller should return immediately. */
function _arabicNotReady(retry) {
  if (!_rtl() || isArabicFontLoaded()) return false;
  const { jsPDF } = window.jspdf;
  ensureArabicFont(jsPDF)
    .then(family => {
      if (!family) {
        showStatus(_t('msgPdfFontMissing'), 'error');
        return;
      }
      retry();
    })
    .catch(err => {
      console.error('[PDF] Arabic font load failed:', err);
      showStatus(_t('msgPdfFontMissing'), 'error');
    });
  showStatus(_t('msgPdfPreparingArabic'), 'info');
  return true;
}

/* Installs the Arabic layer on one document and returns the teardown.
   In English and French this is a no-op that returns a no-op, so those
   paths never touch the shaper, the mirror, or the BiDi options. */
function _beginArabic(pdf) {
  if (!_rtl()) return () => {};
  const { jsPDF } = window.jspdf;
  const restoreParser = suspendJsPdfArabicParser(pdf, jsPDF);
  installArabicRTL(pdf);
  return restoreParser;
}


/* ── Export Settings — COLOURS ONLY on this side ─────────────────────
   Both PDF writers in this file draw at fixed coordinates. Line
   heights are numeric constants derived from the point size they were
   written for (LINE_H_TASK 4.9 mm for 12 pt, LINE_H_DUTY 5.7 mm for
   14 pt), cell insets are absolute (CELL_PAD_T 4.6 mm to the first
   baseline), row height has a 15 mm floor, and the page-break test is
   `yPos + rowHeight > bottomEdge`. Enlarging the font makes
   splitTextToSize() return more lines while the per-line advance stays
   the same: the lines overlap inside the cell, spill past the rule,
   and every page break after that point lands in the wrong place.
   So sizes are a Word-only control, and nothing below touches a single
   geometric number.

   Every helper here is a NO-OP AT THE DEFAULTS — no extra colour
   operator is written into the content stream — so a default export
   produces the same drawing commands as the previous build. */

/** Heading text colour, applied by intercepting pdf.text().
 *
 *  Doing it here rather than at ~30 call sites means no heading can be
 *  missed and none of the surrounding layout code is disturbed. A draw
 *  counts as a heading when the current font is bold at 14 pt or more,
 *  which is exactly the heading band in these documents; body prose
 *  runs at 12 pt and below.
 *
 *  jsPDF's setTextColor is STICKY — it stays in force until changed —
 *  so the colour is reset to black immediately after every intercepted
 *  draw. Without that, the first coloured heading would bleed into all
 *  the body text following it.
 *
 *  Install AFTER _beginArabic(): the Arabic layer replaces pdf.text to
 *  mirror coordinates, and this wrapper must sit on top of it and
 *  delegate down, not the other way round.
 *
 *  Returns a teardown function. */
function _installHeadingColor(pdf) {
    if (ExportSettings.isHeadingColorDefault()) return () => {};

    const [hr, hg, hb] = ExportSettings.rgb(ExportSettings.headingColor());
    const origText = pdf.text.bind(pdf);

    pdf.text = function (...args) {
        let heading = false;
        try {
            const size  = pdf.internal.getFontSize();
            const style = (pdf.getFont && pdf.getFont().fontStyle) || '';
            heading = !pdf.__esSuppressHeadingColor &&
                      /bold/i.test(style) &&
                      size >= 14;
        } catch (e) {
            /* If jsPDF ever stops exposing these, fall back to the
               uncoloured draw rather than throwing mid-export. */
            heading = false;
        }
        if (!heading) return origText(...args);

        pdf.setTextColor(hr, hg, hb);
        const r = origText(...args);
        pdf.setTextColor(0, 0, 0);
        return r;
    };

    return () => { pdf.text = origText; };
}

/** Fill for the duty title bar and the "continued" bar — the two
 *  places that carried RGB(220,220,220), the same grey as the Word
 *  export's DCDCDC.
 *
 *  Deliberately NOT applied to the other three greys in this file. The
 *  section banner is 200 — DARKER than the duty bar, not lighter — and
 *  the clustering table uses 232 and 245 as progressively lighter
 *  tints. Driving all four from one control would need a ramp, and
 *  getting the direction wrong inverts a gradient that is correct
 *  today. */
function _setTableFill(pdf) {
    const [r, g, b] = ExportSettings.rgb(ExportSettings.tableHeaderHex());
    pdf.setFillColor(r, g, b);
}

/** Suppresses the heading colour for a draw that sits on a fill this
 *  feature does not control (the 200-grey section banner). The ink
 *  stays black, which is both what it is today and what WCAG contrast
 *  returns for that grey. */
function _onFixedFill(pdf, draw) {
    const was = pdf.__esSuppressHeadingColor;
    pdf.__esSuppressHeadingColor = true;
    try { return draw(); } finally { pdf.__esSuppressHeadingColor = was; }
}

/** Runs `draw` with the text colour set for legibility against the
 *  table-header fill, computed by WCAG relative luminance rather than
 *  guessed. Also suppresses the heading colour for the duration: a bar
 *  caption is both a heading and the contents of a filled shape, and
 *  a dark heading colour on a dark fill cannot be read. */
function _onTableFill(pdf, draw) {
    const wasSuppressed = pdf.__esSuppressHeadingColor;
    pdf.__esSuppressHeadingColor = true;

    const needsInk = !ExportSettings.isShadedTextDefault();
    if (needsInk) {
        const [r, g, b] = ExportSettings.rgb(
            ExportSettings.contrastOn(ExportSettings.tableHeaderHex())
        );
        pdf.setTextColor(r, g, b);
    }
    try {
        return draw();
    } finally {
        if (needsInk) pdf.setTextColor(0, 0, 0);
        pdf.__esSuppressHeadingColor = wasSuppressed;
    }
}



/* ── Supplementary Occupational Verification section ─────────────
   Shared by the standalone verification report and the main chart
   appendix. Starts on its own page and is written ONLY when the
   optional feature is enabled and holds verified items — otherwise
   nothing is added and the document is identical to before.
   Kept visually and analytically apart from task results: its own
   heading, its own ranking per category, no Priority Index. */
function _writeSupplementaryPDF(pdf, margin) {
    const sections = getSupplementaryExportSections();
    if (!sections.length) return;

    const pageWidth = pdf.internal.pageSize.getWidth();
    const bottom = () => pdf.internal.pageSize.getHeight() - margin;

    pdf.addPage();
    let y = margin + 10;

    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text(_t('svTitle'), pageWidth / 2, y, { align: 'center' });
    y += 8;

    pdf.setFontSize(9);
    pdf.setFont(undefined, 'italic');
    pdf.splitTextToSize(_t('svExpNote'), pageWidth - 2 * margin).forEach(line => {
        pdf.text(line, margin, y);
        y += 4.5;
    });
    y += 4;

    const colRank  = margin;
    const colItem  = margin + 16;
    const colScore = pageWidth - margin - 75;
    const colPct   = pageWidth - margin - 50;
    const colResp  = pageWidth - margin - 25;
    const itemW    = colScore - colItem - 4;

    const header = () => {
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text(_t('svThRank'),      colRank,  y);
        pdf.text(_t('svThItem'),      colItem,  y);
        pdf.text(_t('svThScore'),     colScore, y);
        pdf.text('%',                 colPct,   y);
        pdf.text(_t('svThResponses'), colResp,  y);
        y += 2;
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, y, pageWidth - margin, y);
        pdf.setDrawColor(0, 0, 0);
        y += 4.5;
        pdf.setFont(undefined, 'normal');
    };

    sections.forEach(sec => {
        if (y + 22 > bottom()) { pdf.addPage(); y = margin + 10; }
        pdf.setFontSize(13);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${sec.letter}. ${sec.title}`, margin, y);
        y += 7;
        header();

        sec.items.forEach(it => {
            pdf.setFontSize(10);
            pdf.setFont(undefined, 'normal');
            const lines = pdf.splitTextToSize(it.text, itemW);
            const h = lines.length * 4.8 + 1.5;
            if (y + h > bottom()) { pdf.addPage(); y = margin + 10; header(); }
            pdf.text(`#${it.rank}`, colRank, y);
            pdf.text(lines, colItem, y);
            pdf.text(it.aggregatedScore.toFixed(2), colScore, y);
            pdf.text(`${it.percentage.toFixed(1)}%`, colPct, y);
            pdf.text(String(it.responses), colResp, y);
            y += h;
        });
        y += 6;
    });
}

export function exportTaskVerificationPDF() {
    // Tell the user WHY the appendix is missing rather than
    // shipping a report that is quietly short a section.
    noteExportExclusion();

    if (_arabicNotReady(exportTaskVerificationPDF)) return;

    let _endArabic = () => {};
    let _endHeadingColor = () => {};
    try {
        // See exportTaskVerificationWord: same adapter, same reasoning.
        const tvResults = buildVerificationDataset();

        const validResults = Object.keys(tvResults).filter(key =>
            tvResults[key] && tvResults[key].valid
        );

        if (validResults.length === 0) {
            alert(_t('msgNoTaskRated'));
            return;
        }

        const tvCoverage = getVerificationCoverage(tvResults);
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Arabic: suspend jsPDF's own shaper and mirror the document.
        // Everything below keeps writing left-to-right coordinates.
        _endArabic = _beginArabic(pdf);

        // Heading colour sits ON TOP of the Arabic layer and delegates
        // down to it, so mirrored coordinates are unaffected.
        _endHeadingColor = _installHeadingColor(pdf);

        const margin = 10;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        let yPos = margin + 10;
        
        // Get occupation title
        const occupationTitleInput = document.getElementById('occupationTitle');
        const occupationTitle = occupationTitleInput ? occupationTitleInput.value : 'Unknown Occupation';
        
        // Title Page
        pdf.setFontSize(18);
        pdf.setFont(undefined, 'bold');
        pdf.text(_t('expTaskVerification'), pageWidth / 2, yPos, { align: 'center' });
        yPos += 12;
        
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text(_tf('expOccupation', { v: occupationTitle }), pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;
        
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'normal');
        const today = _today();
        pdf.text(_tf('expDateOfAnalysis', { v: today }), pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'italic');
        pdf.text(_tf('expBasedOn', { v: occupationTitle }), pageWidth / 2, yPos, { align: 'center' });
        yPos += 15;
        
        // Methodology Summary
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text(_t('expMethodologySummary'), margin, yPos);
        yPos += 8;
        
        pdf.setFontSize(11);
        pdf.setFont(undefined, 'normal');
        pdf.text(_tf('expCollectionMode', { v: _t(appState.collectionMode === 'workshop' ? 'modeWorkshop' : 'expIndividualSurvey') }), margin, yPos);
        yPos += 6;
        // Only meaningful when a panel produced the numbers.
        if (appState.collectionMode === 'workshop') {
            pdf.text(_tf('expParticipants', { v: appState.workshopParticipants }), margin, yPos);
            yPos += 6;
        }
        pdf.text(_tf('expWorkflowMode', { v: _t(appState.workflowMode === 'standard' ? 'modeStandard' : 'modeExtended') }), margin, yPos);
        yPos += 6;
        pdf.text(_tf('expPriorityFormula', { v: _t(appState.priorityFormula === 'if' ? 'formulaIF' : 'formulaIFD') }), margin, yPos);
        yPos += 6;

        // Coverage, in red when partial — see the Word report for why.
        if (!tvCoverage.complete) pdf.setTextColor(185, 28, 28);
        const covLines = pdf.splitTextToSize(`Coverage: ${tvCoverage.label}`, pdf.internal.pageSize.getWidth() - margin * 2);
        pdf.text(covLines, margin, yPos);
        yPos += 6 * covLines.length;
        pdf.setTextColor(0, 0, 0);
        yPos += 6;
        
        // Priority Rankings Table
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text(_t('expPriorityRankings'), margin, yPos);
        yPos += 8;
        
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
        
        // Table headers
        const colWidths = [15, 50, 75, 25, 25, 25, 25];
        const headers = [_t('expRank'), _t('expDutyLabel'), _t('expTaskLabel'),
                         _t('expMeanI'), _t('expMeanF'), _t('expMeanD'), _t('expPriority')];
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        let xPos = margin;
        headers.forEach((header, i) => {
            pdf.text(header, xPos, yPos);
            xPos += colWidths[i];
        });
        yPos += 6;
        
        // Table rows
        pdf.setFont(undefined, 'normal');
        sortedResults.forEach((row, index) => {
            if (yPos > pageHeight - 20) {
                pdf.addPage();
                yPos = margin + 10;
            }
            
            xPos = margin;
            pdf.text(`#${index + 1}`, xPos, yPos);
            xPos += colWidths[0];
            
            const dutyTrunc = row.duty.length > 20 ? row.duty.substring(0, 17) + '...' : row.duty;
            pdf.text(dutyTrunc, xPos, yPos);
            xPos += colWidths[1];
            
            const taskTrunc = row.task.length > 40 ? row.task.substring(0, 37) + '...' : row.task;
            pdf.text(taskTrunc, xPos, yPos);
            xPos += colWidths[2];
            
            pdf.text(row.meanI !== null ? row.meanI.toFixed(2) : 'N/A', xPos, yPos);
            xPos += colWidths[3];
            pdf.text(row.meanF !== null ? row.meanF.toFixed(2) : 'N/A', xPos, yPos);
            xPos += colWidths[4];
            pdf.text(row.meanD !== null ? row.meanD.toFixed(2) : 'N/A', xPos, yPos);
            xPos += colWidths[5];
            pdf.text(row.priority !== null ? row.priority.toFixed(2) : 'N/A', xPos, yPos);
            
            yPos += 5;
        });
        
        yPos += 10;
        
        // Duty-Level Summary Section
        if (yPos > pageHeight - 30) {
            pdf.addPage();
            yPos = margin + 10;
        }
        
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text(_t('expDutyLevelSummary'), margin, yPos);
        yPos += 5;
        
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'italic');
        pdf.text(_tf('expTrainingLoadMethod', { v: _t(appState.trainingLoadMethod === 'advanced' ? 'expAdvancedMethod' : 'expSimpleMethod') }), margin, yPos);
        yPos += 8;
        
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
                    dutyMap[dutyId] = {
                        dutyTitle: dutyTitle,
                        validTasks: 0,
                        prioritySum: 0,
                        difficultySum: 0,
                        tasks: []
                    };
                }
                
                dutyMap[dutyId].validTasks++;
                dutyMap[dutyId].prioritySum += result.priorityIndex;
                dutyMap[dutyId].difficultySum += result.meanDifficulty;
                dutyMap[dutyId].tasks.push({
                    priorityIndex: result.priorityIndex,
                    meanDifficulty: result.meanDifficulty
                });
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
            
            dutyResults.push({
                dutyTitle: duty.dutyTitle,
                validTasks: duty.validTasks,
                avgPriority: avgPriority,
                trainingLoad: trainingLoad
            });
        });
        
        dutyResults.sort((a, b) => b.avgPriority - a.avgPriority);
        
        // Duty table headers
        const dutyColWidths = [80, 30, 40, 45];
        const dutyHeaders = [_t('expDutyTitle'), _t('expTasks'),
                             _t('expAvgPriority'), _t('expTrainingLoad')];
        
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'bold');
        let dutyXPos = margin;
        dutyHeaders.forEach((header, i) => {
            pdf.text(header, dutyXPos, yPos);
            dutyXPos += dutyColWidths[i];
        });
        yPos += 6;
        
        // Duty table rows
        pdf.setFont(undefined, 'normal');
        dutyResults.forEach((duty) => {
            if (yPos > pageHeight - 20) {
                pdf.addPage();
                yPos = margin + 10;
            }
            
            dutyXPos = margin;
            const dutyTitleTrunc = duty.dutyTitle.length > 35 ? duty.dutyTitle.substring(0, 32) + '...' : duty.dutyTitle;
            pdf.text(dutyTitleTrunc, dutyXPos, yPos);
            dutyXPos += dutyColWidths[0];
            
            pdf.text(duty.validTasks.toString(), dutyXPos, yPos);
            dutyXPos += dutyColWidths[1];
            
            pdf.text(duty.avgPriority.toFixed(2), dutyXPos, yPos);
            dutyXPos += dutyColWidths[2];
            
            pdf.text(duty.trainingLoad.toFixed(2), dutyXPos, yPos);
            
            yPos += 5;
        });
        
        yPos += 10;
        
        // Notes section
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'bold');
        pdf.text(_t('expNotesMethodology'), margin, yPos);
        yPos += 7;
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
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
            if (yPos > pageHeight - 15) {
                pdf.addPage();
                yPos = margin + 10;
            }
            pdf.text(`• ${note}`, margin, yPos);
            yPos += 5;
        });
        
        // Supplementary Occupational Verification (only when enabled + used)
        _writeSupplementaryPDF(pdf, margin);

        // Save PDF
        pdf.save(_safeFilename(occupationTitle, '_Task_Verification.pdf'));
        showStatus(_t('msgTVPdfExported'), 'success');
        
    } catch (error) {
        console.error('Error generating Task Verification PDF:', error);
        showStatus(_tf('msgTVPdfError', { msg: error.message }), 'error');
    } finally {
        /* processArabic is suspended on the jsPDF CLASS, not on this
           document. Leaving it detached would break Arabic for any
           other code that uses the library afterwards, so the restore
           runs even when generation throws. */
        _endHeadingColor();
        _endArabic();
    }
}

/**
 * jsPDF needs the real encoding of a data URL. Both logo slots used to
 * be passed as 'JPEG' unconditionally, which silently mis-declares a
 * PNG — and since transparent logos are now deliberately kept as PNG
 * by storage.js's compressor, that assumption would start failing.
 */
/* Dates in the exported document follow the EXPORT language, not the
   browser's locale — those are frequently different, and a report is a
   deliverable that must be internally consistent. Same rule as
   exports_docx.js. */
const _today = () => new Date().toLocaleDateString(
  window.i18n ? window.i18n.getLang() : undefined
);

function _imageFormat(dataUrl) {
  return /^data:image\/png/i.test(dataUrl || '') ? 'PNG' : 'JPEG';
}

export function exportToPDF() {
    // Tell the user WHY the appendix is missing rather than
    // shipping a report that is quietly short a section.
    noteExportExclusion();

    if (_arabicNotReady(exportToPDF)) return;

    // ============ CHECK FOR VERIFIED LIVE WORKSHOP RESULTS ============
    const hasVerifiedResults = typeof appState.lwFinalizedData !== 'undefined' && appState.lwFinalizedData && 
                                typeof appState.lwAggregatedResults !== 'undefined' && appState.lwAggregatedResults;
    
    // ============ VERIFIED LIVE WORKSHOP STANDALONE EXPORT ============
    if (hasVerifiedResults && appState.tvExportMode === 'standalone') {
        lwExportVerifiedPDF();
        return;
    }
    
    // ============ REGULAR TASK VERIFICATION STANDALONE EXPORT ============
    if (!hasVerifiedResults && appState.tvExportMode === 'standalone') {
        exportTaskVerificationPDF();
        return;
    }
    
    // ============ NORMAL DACUM EXPORT (with optional appendix) ============
    let _endArabic = () => {};
    let _endHeadingColor = () => {};
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Arabic: suspend jsPDF's own shaper and mirror the document.
        _endArabic = _beginArabic(pdf);
        _endHeadingColor = _installHeadingColor(pdf);

        // Get input values
        const dacumDateInput = document.getElementById('dacumDate');
        let dacumDateFormatted = '';
        if (dacumDateInput.value) {
            const dateObj = new Date(dacumDateInput.value + 'T00:00:00');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const year = dateObj.getFullYear();
            dacumDateFormatted = `${month}-${day}-${year}`;
        }
        const producedForInput = document.getElementById('producedFor');
        const producedByInput = document.getElementById('producedBy');
        const occupationTitleInput = document.getElementById('occupationTitle');
        const jobTitleInput = document.getElementById('jobTitle');
        const toolsInput = document.getElementById('toolsInput');
        const trendsInput = document.getElementById('trendsInput');
        const acronymsInput = document.getElementById('acronymsInput');
        
        // Validation — Occupation Title required; Job Title optional
        if (!occupationTitleInput.value) {
            alert(_t('msgOccupationRequiredExport'));
            showStatus(_t('msgOccupationRequiredExportStatus'), 'error');
            return;
        }
        
        const margin = 10;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        let yPos = margin + 10;
        
        // ============ TITLE PAGE ============
        pdf.setFontSize(18); // 18pt for main title
        pdf.setFont(undefined, 'bold');
        pdf.text(`${_t('expDacumChart')} — ${occupationTitleInput.value}`, pageWidth / 2, yPos, { align: 'center' });
        yPos += 15;
        
        // Two column layout for title page
        const leftColX = margin + 10;
        const rightColX = pageWidth / 2 + 10;
        let leftY = yPos;
        let rightY = yPos;
        
        // Left column - Produced For/By
        if (producedForInput.value) {
            pdf.setFontSize(16); // 16pt for labels
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expProducedForLabel'), leftColX, leftY);
            leftY += 7;
            
            // Add logo if exists
            if (appState.producedForImage) {
                try {
                    const imgWidth = 30;
                    const imgHeight = 20;
                    pdf.addImage(appState.producedForImage, _imageFormat(appState.producedForImage), leftColX, leftY, imgWidth, imgHeight);
                    leftY += imgHeight + 5;
                } catch (e) {
                    console.error('Error adding Produced For image:', e);
                }
            }
            
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(14); // 14pt for content
            pdf.text(producedForInput.value, leftColX, leftY);
            leftY += 15;
        }
        
        if (producedByInput.value) {
            pdf.setFontSize(16); // 16pt for labels
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expProducedByLabel'), leftColX, leftY);
            leftY += 7;
            
            // Add logo if exists
            if (appState.producedByImage) {
                try {
                    const imgWidth = 30;
                    const imgHeight = 20;
                    pdf.addImage(appState.producedByImage, _imageFormat(appState.producedByImage), leftColX, leftY, imgWidth, imgHeight);
                    leftY += imgHeight + 5;
                } catch (e) {
                    console.error('Error adding Produced By image:', e);
                }
            }
            
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(14); // 14pt for content
            pdf.text(producedByInput.value, leftColX, leftY);
            leftY += 10;
        }
        
        if (dacumDateFormatted) {
            pdf.setFontSize(14); // 14pt for date
            pdf.setFont(undefined, 'bold');
            pdf.text(dacumDateFormatted, leftColX, leftY);
            leftY += 7;
        }
        
        // Add venue if exists
        const venueInput = document.getElementById('venue');
        if (venueInput && venueInput.value) {
            pdf.setFontSize(14);
            pdf.setFont(undefined, 'bold');
            const venueLabel = _t('expVenueLabel') + ' ';
            pdf.text(venueLabel, leftColX, leftY);
            const venueLabelW = pdf.getTextWidth(venueLabel) + 1;
            pdf.setFont(undefined, 'normal');
            pdf.text(venueInput.value, leftColX + venueLabelW, leftY);
        }
        
        // Right column - Job info
        //
        // Label offsets are MEASURED, not hard-coded. The previous
        // fixed +30mm / +15mm offsets were narrower than the bold 16pt
        // labels themselves, so the value printed on top of the label
        // ("Occupation:Furniture Carpenter"). getTextWidth returns the
        // real width at the current font+size, so the gap is always
        // correct whatever the label or font.
        //
        // Values also wrap now: a long occupation title used to run off
        // the right edge of the page instead of flowing to a new line.
        const rightColMaxW = pageWidth - margin - rightColX;
        const LABEL_GAP    = 3;   // mm between label and value

        const drawLabelledValue = (label, value) => {
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(label, rightColX, rightY);
            const labelW = pdf.getTextWidth(label) + LABEL_GAP;

            pdf.setFontSize(14);
            pdf.setFont(undefined, 'normal');
            const valueLines = pdf.splitTextToSize(value, Math.max(20, rightColMaxW - labelW));
            pdf.text(valueLines, rightColX + labelW, rightY);
            rightY += Math.max(7, valueLines.length * 5.7);
        };

        // NOTE: these two were previously crossed over — the
        // "Occupation:" line printed jobTitleInput.value and the "Job:"
        // line printed occupationTitleInput.value. Corrected here.
        drawLabelledValue(_t('expOccupationLabel'), occupationTitleInput.value);

        // Job line — only if filled (skips orphan "Job:" label with empty value)
        if (jobTitleInput.value && jobTitleInput.value.trim()) {
            drawLabelledValue(_t('expJobLabel'), jobTitleInput.value.trim());
        }
        
        // Workshop Roles Section
        const facilitatorsInput = document.getElementById('facilitators');
        const observersInput = document.getElementById('observers');
        const panelMembersInput = document.getElementById('panelMembers');
        
        let workshopY = Math.max(leftY, rightY) + 15;
        const tableWidth = pageWidth - (2 * margin) - 20;
        const tableX = margin + 10;

        /* Vertical rhythm for the Facilitators / Observers / Panel Members
           block.
           
           workshopY is a BASELINE cursor for text but a TOP edge for
           pdf.rect(). After a name box the cursor sits exactly on the
           box's bottom rule, so a following heading — drawn from its
           baseline — rises its whole cap height back INTO that box. At
           14 pt the caps stand about 3.5 mm above the baseline, and the
           gap between groups was 4 mm, which left roughly half a
           millimetre of air: the headings read as glued to the box
           above them. The Word export never showed this because Word
           lays out paragraphs by their own line boxes.
           
           GROUP_GAP is therefore the white space the reader should see,
           and HEAD_ASCENT is the cap height the heading needs above its
           baseline. Both are named so the two roles cannot be collapsed
           back into one number by mistake. */
        /* The document OPENS landscape (210 mm tall) and every overflow
           page in this block is added as portrait (297 mm tall). The
           pageHeight above is read once, from page 1, so these portrait
           pages were being measured against the landscape height —
           every continuation page broke at 200 mm on a sheet with 297,
           throwing away roughly a third of it and splitting a long
           panel list across more pages than it needed. Read the height
           of the page actually being drawn on instead.
           
           Deliberately scoped to this block: it is the only part of the
           export that mixes orientations. Everything after the chart
           uses a bare pdf.addPage(), which inherits landscape, where
           the outer pageHeight is already correct. */
        const _bottom = () => pdf.internal.pageSize.getHeight() - margin;

        const HEAD_ASCENT  = 5;   // mm reserved above a 14pt heading baseline
        const GROUP_GAP    = 5;   // mm of visible space between groups
        const HEAD_TO_BOX  = 5;   // mm from heading baseline to first box top
        const BOX_H        = 6;   // mm — unchanged row height

        // ─── Scope of Work / Occupational Definition (full-width, optional) ───
        // Rendered below the two-column Produced For/By + Job block, before
        // the Facilitators section.  Wrapped with splitTextToSize so long
        // definitions flow across lines cleanly.  Paginates if the paragraph
        // would overflow the current page.
        const scopeOfWorkInput    = document.getElementById('scopeOfWork');
        const scopeOfWorkValuePDF = scopeOfWorkInput ? scopeOfWorkInput.value.trim() : '';
        if (scopeOfWorkValuePDF) {
            if (workshopY + 20 > _bottom()) {
                pdf.addPage('a4', 'portrait');
                workshopY = margin + 10;
            }
            pdf.setFontSize(14);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expScopeOfWork'), tableX, workshopY);
            workshopY += 6;

            pdf.setFontSize(11);
            pdf.setFont(undefined, 'normal');
            const scopeLines = pdf.splitTextToSize(scopeOfWorkValuePDF, tableWidth);
            scopeLines.forEach(line => {
                if (workshopY + 5 > _bottom()) {
                    pdf.addPage('a4', 'portrait');
                    workshopY = margin + 10;
                }
                pdf.text(line, tableX, workshopY);
                workshopY += 5;
            });
            workshopY += 6;
        }
        
        if (facilitatorsInput && facilitatorsInput.value.trim()) {
            const facilitatorNames = facilitatorsInput.value.split('\n').map(s => s.trim()).filter(s => s);
            if (facilitatorNames.length > 0) {
                /* Break BEFORE the ascent is added, and require room for
                   the heading plus its first row — a heading alone at the
                   foot of a page with its names overleaf reads as an
                   error, and the 20 mm here is what buys that. */
                if (workshopY + HEAD_ASCENT + 20 > _bottom()) {
                    pdf.addPage('a4', 'portrait');
                    workshopY = margin + 10;
                } else {
                    workshopY += HEAD_ASCENT;   // clear the box above before the caps rise
                }
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expFacilitators'), tableX, workshopY);
                workshopY += HEAD_TO_BOX;
                pdf.setFont(undefined, 'normal');
                pdf.setFontSize(12);
                
                facilitatorNames.forEach(name => {
                    if (workshopY + 7 > _bottom()) {
                        pdf.addPage('a4', 'portrait');
                        workshopY = margin + 10;
                    }
                    pdf.rect(tableX, workshopY, tableWidth, BOX_H, 'S');
                    pdf.text(name, tableX + 2, workshopY + 4);
                    workshopY += BOX_H;
                });
                workshopY += GROUP_GAP;
            }
        }
        
        if (observersInput && observersInput.value.trim()) {
            const observerNames = observersInput.value.split('\n').map(s => s.trim()).filter(s => s);
            if (observerNames.length > 0) {
                /* Break BEFORE the ascent is added, and require room for
                   the heading plus its first row — a heading alone at the
                   foot of a page with its names overleaf reads as an
                   error, and the 20 mm here is what buys that. */
                if (workshopY + HEAD_ASCENT + 20 > _bottom()) {
                    pdf.addPage('a4', 'portrait');
                    workshopY = margin + 10;
                } else {
                    workshopY += HEAD_ASCENT;   // clear the box above before the caps rise
                }
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expObservers'), tableX, workshopY);
                workshopY += HEAD_TO_BOX;
                pdf.setFont(undefined, 'normal');
                pdf.setFontSize(12);
                
                observerNames.forEach(name => {
                    if (workshopY + 7 > _bottom()) {
                        pdf.addPage('a4', 'portrait');
                        workshopY = margin + 10;
                    }
                    pdf.rect(tableX, workshopY, tableWidth, BOX_H, 'S');
                    pdf.text(name, tableX + 2, workshopY + 4);
                    workshopY += BOX_H;
                });
                workshopY += GROUP_GAP;
            }
        }
        
        if (panelMembersInput && panelMembersInput.value.trim()) {
            const panelMemberNames = panelMembersInput.value.split('\n').map(s => s.trim()).filter(s => s);
            if (panelMemberNames.length > 0) {
                /* Break BEFORE the ascent is added, and require room for
                   the heading plus its first row — a heading alone at the
                   foot of a page with its names overleaf reads as an
                   error, and the 20 mm here is what buys that. */
                if (workshopY + HEAD_ASCENT + 20 > _bottom()) {
                    pdf.addPage('a4', 'portrait');
                    workshopY = margin + 10;
                } else {
                    workshopY += HEAD_ASCENT;   // clear the box above before the caps rise
                }
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expPanelMembers'), tableX, workshopY);
                workshopY += HEAD_TO_BOX;
                pdf.setFont(undefined, 'normal');
                pdf.setFontSize(12);
                
                panelMemberNames.forEach(name => {
                    if (workshopY + 7 > _bottom()) {
                        pdf.addPage('a4', 'portrait');
                        workshopY = margin + 10;
                    }
                    pdf.rect(tableX, workshopY, tableWidth, BOX_H, 'S');
                    pdf.text(name, tableX + 2, workshopY + 4);
                    workshopY += BOX_H;
                });
            }
        }
        
        // ============ DACUM CHART GRID ============
        pdf.addPage('a4', 'landscape');
        yPos = margin + 5;
        
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
        
        if (duties.length === 0) {
            showStatus(_t('msgNeedOneDuty'), 'error');
            return;
        }
        
        // DUTIES AND TASKS header
        // Fill stays 200 — the section banner is the DARKEST of the four
        // greys in this file, darker than the 220 duty bar, and the
        // table-header setting deliberately drives only the 220 sites.
        // Its caption is still exempted from the heading colour: it is
        // text on a filled shape, so it takes the automatic contrast
        // ink like every other bar caption.
        pdf.setFillColor(200, 200, 200);
        pdf.rect(margin, yPos, pageWidth - (margin * 2), 8, 'FD');
        pdf.setFontSize(14); // 14pt for heading
        pdf.setFont(undefined, 'bold');
        _onFixedFill(pdf, () =>
            pdf.text(_t('expDutiesAndTasks'), pageWidth / 2, yPos + 5.5, { align: 'center' }));
        yPos += 8;
        
        // ── DUTIES AND TASKS grid — horizontal (Word-style) layout ──
        //
        // Each duty gets its OWN full-width table: a shaded title bar
        // spanning the page, with that duty's tasks flowing left-to-
        // right in rows of four beneath it (A1 A2 A3 A4 / A5 A6 A7 A8 …).
        //
        // This replaces the previous layout, which placed four DUTIES
        // side by side as columns and ran their tasks vertically down
        // each column. The horizontal arrangement is the conventional
        // DACUM chart form and matches the Word master document, so the
        // two exports of the same chart no longer disagree on structure.
        // Colours are unchanged: 220-grey duty bars, outlined task cells.
        const TASK_COLS  = 4;
        const chartWidth = pageWidth - (margin * 2);
        const colWidth   = chartWidth / TASK_COLS;

        // ── Cell metrics ───────────────────────────────────────────
        // jsPDF renders multi-line text at fontSize x lineHeightFactor
        // (1.15 by default): 12pt -> 4.87mm per line, 14pt -> 5.68mm.
        const LINE_H_TASK = 4.9;   // 12pt
        const LINE_H_DUTY = 5.7;   // 14pt
        const CELL_PAD_X  = 2.5;   // left/right inset
        const CELL_PAD_T  = 4.6;   // top inset to the FIRST BASELINE
        const CELL_PAD_B  = 2.5;   // breathing room under the last line
        const DUTY_GAP    = 5;     // vertical space between duty tables

        const bottomEdge = pageHeight - margin;

        // Repeat the section banner after every page break so a reader
        // landing mid-chart still knows what they are looking at.
        const drawSectionBanner = (text) => {
            pdf.setFillColor(200, 200, 200);
            pdf.rect(margin, yPos, chartWidth, 8, 'FD');
            pdf.setFontSize(14);
            pdf.setFont(undefined, 'bold');
            _onFixedFill(pdf, () =>
                pdf.text(text, pageWidth / 2, yPos + 5.5, { align: 'center' }));
            yPos += 8;
        };

        const newChartPage = () => {
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            drawSectionBanner(_tf('expContinued', { v: _t('expDutiesAndTasks') }));
        };

        duties.forEach((duty, dutyIdx) => {
            const letter = getDutyLetter(dutyIdx);

            // ── Duty title bar (full width) ───────────────────────
            pdf.setFontSize(14);
            pdf.setFont(undefined, 'bold');
            const headerText  = `${_tf('lblDuty', { code: letter })}: ${duty.duty}`;
            const headerLines = pdf.splitTextToSize(headerText, chartWidth - (CELL_PAD_X * 2));
            const headerH     = Math.max(
                10,
                headerLines.length * LINE_H_DUTY + CELL_PAD_T + CELL_PAD_B
            );

            // Keep the bar with at least one task row — a title stranded
            // alone at the foot of a page reads as an error.
            if (yPos + headerH + 15 > bottomEdge) newChartPage();

            _setTableFill(pdf);
            pdf.rect(margin, yPos, chartWidth, headerH, 'FD');
            _onTableFill(pdf, () =>
                pdf.text(headerLines, margin + CELL_PAD_X, yPos + CELL_PAD_T + 0.6));
            yPos += headerH;

            // ── Task rows, four per row ───────────────────────────
            const tasks = duty.tasks || [];
            for (let i = 0; i < tasks.length; i += TASK_COLS) {
                const rowTasks = tasks.slice(i, i + TASK_COLS);

                // Row height = tallest cell in the row
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'normal');
                let rowHeight = 15;
                const cellLines = rowTasks.map((taskText, c) => {
                    const label = `${_tf('lblTask', { code: `${letter}${i + c + 1}` })}:`;
                    const lines = pdf.splitTextToSize(
                        `${label}\n${taskText}`, colWidth - (CELL_PAD_X * 2)
                    );
                    rowHeight = Math.max(
                        rowHeight,
                        lines.length * LINE_H_TASK + CELL_PAD_T + CELL_PAD_B
                    );
                    return lines;
                });

                if (yPos + rowHeight > bottomEdge) {
                    newChartPage();
                    // Restate which duty these rows belong to
                    _setTableFill(pdf);
                    pdf.rect(margin, yPos, chartWidth, 8, 'FD');
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    _onTableFill(pdf, () =>
                        pdf.text(_tf('expContinued', { v: _tf('lblDuty', { code: letter }) }), margin + CELL_PAD_X, yPos + 5.5));
                    yPos += 8;
                }

                // Draw all four cells — empty trailing cells are still
                // outlined so the table keeps a clean rectangular edge,
                // exactly as in the Word master.
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'normal');
                for (let c = 0; c < TASK_COLS; c++) {
                    const x = margin + (c * colWidth);
                    pdf.rect(x, yPos, colWidth, rowHeight, 'S');
                    if (cellLines[c]) {
                        pdf.text(cellLines[c], x + CELL_PAD_X, yPos + CELL_PAD_T);
                    }
                }

                yPos += rowHeight;
            }

            yPos += DUTY_GAP;
        });
        
        // ============ KNOWLEDGE, SKILLS, BEHAVIORS ============
        const knowledgeText = document.getElementById('knowledgeInput').value.trim();
        const skillsText = document.getElementById('skillsInput').value.trim();
        const behaviorsText = document.getElementById('behaviorsInput').value.trim();
        
        if (knowledgeText || skillsText || behaviorsText) {
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            
            pdf.setFontSize(14); // 14pt for main heading
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expGeneralKnowledgeSkills'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 8;
            
            // ── Three-column layout ────────────────────────────────
            // Each item is now WRAPPED to its own column width. The old
            // code drew every line at full length with no width limit,
            // so any item longer than a third of the page ran straight
            // across the neighbouring column — the overlap seen in the
            // exported chart. A gutter keeps adjacent columns from
            // touching even when both are full.
            const COL_GUTTER  = 6;                                   // mm between columns
            const thirdWidth  = (pageWidth - (margin * 2)) / 3;
            const colTextW    = thirdWidth - COL_GUTTER;
            const LINE_H_ITEM = 4.9;                                 // 12pt
            const bottomLimit = pageHeight - margin;

            const drawColumn = (text, headingId, colX) => {
                if (!text) return;
                let y = yPos;

                const headingEl = document.getElementById(headingId);
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(
                    pdf.splitTextToSize(headingEl ? headingEl.textContent : '', colTextW),
                    colX, y
                );
                y += 7;

                pdf.setFontSize(12);
                pdf.setFont(undefined, 'normal');

                text.split('\n').filter(line => line.trim()).forEach(item => {
                    const clean = item.trim().replace(/^[•\-*]\s*/, '');
                    const lines = pdf.splitTextToSize(clean, colTextW);
                    lines.forEach(line => {
                        if (y > bottomLimit) return;   // clip rather than spill off-page
                        pdf.text(line, colX, y);
                        y += LINE_H_ITEM;
                    });
                    y += 1;                            // small gap between items
                });
            };

            drawColumn(knowledgeText, 'knowledgeHeading', margin);
            drawColumn(skillsText,    'skillsHeading',    margin + thirdWidth);
            drawColumn(behaviorsText, 'behaviorsHeading', margin + (thirdWidth * 2));
        }
        
        // ============ TOOLS AND TRENDS ============
        const tools = toolsInput.value.trim() ? toolsInput.value.split('\n').filter(line => line.trim()) : [];
        const trends = trendsInput.value.trim() ? trendsInput.value.split('\n').filter(line => line.trim()) : [];
        
        if (tools.length > 0 || trends.length > 0) {
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            
            // Same wrapping treatment as the Knowledge/Skills page —
            // tool and material names are often long enough to cross
            // into the neighbouring column when drawn unconstrained.
            const halfWidth   = (pageWidth - (margin * 2) - 5) / 2;
            const colTextW2   = halfWidth - 6;
            const LINE_H_ITEM2 = 4.9;
            const bottomLimit2 = pageHeight - margin;

            const drawList = (items, headingId, colX) => {
                if (!items.length) return;
                let y = yPos;

                const headingEl = document.getElementById(headingId);
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(
                    pdf.splitTextToSize(headingEl ? headingEl.textContent : '', colTextW2),
                    colX, y
                );
                y += 7;

                pdf.setFontSize(12);
                pdf.setFont(undefined, 'normal');
                items.forEach(item => {
                    const clean = item.trim().replace(/^[•\-*]\s*/, '');
                    pdf.splitTextToSize(clean, colTextW2).forEach(line => {
                        if (y > bottomLimit2) return;
                        pdf.text(line, colX, y);
                        y += LINE_H_ITEM2;
                    });
                    y += 1;
                });
            };

            drawList(tools,  'toolsHeading',  margin);
            drawList(trends, 'trendsHeading', margin + halfWidth + 5);
        }
        
        // ============ ACRONYMS ============
        if (acronymsInput.value.trim()) {
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            
            const heading = document.getElementById('acronymsHeading').textContent;
            pdf.setFontSize(14); // 14pt for section heading
            pdf.setFont(undefined, 'bold');
            pdf.text(heading, margin, yPos);
            yPos += 6;
            
            pdf.setFontSize(12); // 12pt for content
            pdf.setFont(undefined, 'normal');
            const acronyms = acronymsInput.value.split('\n').filter(line => line.trim());
            const fullTextW = pageWidth - (margin * 2);
            acronyms.forEach(acronym => {
                const clean = acronym.trim().replace(/^[•\-*]\s*/, '');
                pdf.splitTextToSize(clean, fullTextW).forEach(line => {
                    if (yPos > pageHeight - margin) {
                        pdf.addPage('a4', 'landscape');
                        yPos = margin + 5;
                    }
                    pdf.text(line, margin, yPos);
                    yPos += 4.9;
                });
            });
        }
        
        // ============ CAREER PATH ============
        const careerPathInput = document.getElementById('careerPathInput');
        if (careerPathInput && careerPathInput.value.trim()) {
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            
            const heading = document.getElementById('careerPathHeading').textContent;
            pdf.setFontSize(14); // 14pt for section heading
            pdf.setFont(undefined, 'bold');
            pdf.text(heading, margin, yPos);
            yPos += 6;
            
            pdf.setFontSize(12); // 12pt for content
            pdf.setFont(undefined, 'normal');
            const careerPathItems = careerPathInput.value.split('\n').filter(line => line.trim());
            const fullTextW = pageWidth - (margin * 2);
            careerPathItems.forEach(item => {
                const clean = item.trim().replace(/^[•\-*]\s*/, '');
                pdf.splitTextToSize(clean, fullTextW).forEach(line => {
                    if (yPos > pageHeight - margin) {
                        pdf.addPage('a4', 'landscape');
                        yPos = margin + 5;
                    }
                    pdf.text(line, margin, yPos);
                    yPos += 4.9;
                });
            });
        }
        
        // ============ CUSTOM SECTIONS ============
        const customSectionsContainer = document.getElementById('customSectionsContainer');
        const customSectionDivs = customSectionsContainer.querySelectorAll('.section-container');
        customSectionDivs.forEach(sectionDiv => {
            const headingElement = sectionDiv.querySelector('h3');
            const textareaElement = sectionDiv.querySelector('textarea');
            
            if (headingElement && textareaElement && textareaElement.value.trim()) {
                pdf.addPage('a4', 'landscape');
                yPos = margin + 5;
                
                pdf.setFontSize(14); // 14pt for section heading
                pdf.setFont(undefined, 'bold');
                pdf.text(headingElement.textContent, margin, yPos);
                yPos += 6;
                
                pdf.setFontSize(12); // 12pt for content
                pdf.setFont(undefined, 'normal');
                const items = textareaElement.value.split('\n').filter(line => line.trim());
                const customTextW = pageWidth - (margin * 2);
                items.forEach(item => {
                    const clean = item.trim().replace(/^[•\-*]\s*/, '');
                    pdf.splitTextToSize(clean, customTextW).forEach(line => {
                        if (yPos > pageHeight - margin) {
                            pdf.addPage('a4', 'landscape');
                            yPos = margin + 5;
                        }
                        pdf.text(line, margin, yPos);
                        yPos += 4.9;
                    });
                });
            }
        });
        
        // ============ SKILLS LEVEL MATRIX (PDF EXPORT) ============
        const hasSkillsLevelData = appState.skillsLevelData?.some(category =>
            category.competencies.some(comp =>
                Object.values(comp.levels).some(v => v === true)
            )
        );

        if (hasSkillsLevelData) {
            // Add new page for Skills Level Matrix
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            
            // Main heading
            pdf.setFontSize(14);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expEmployability'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;

            // Process each category
            appState.skillsLevelData.forEach(category => {
                // Skip empty categories
                if (category.category.trim() === '' && category.competencies.every(c => c.text.trim() === '')) {
                    return;
                }

                // Check if we need a new page
                if (yPos > pageHeight - 40) {
                    pdf.addPage('a4', 'landscape');
                    yPos = margin + 5;
                }

                // Category header
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.setFillColor(232, 232, 232);
                pdf.rect(margin, yPos - 4, pageWidth - (margin * 2), 6, 'F');
                pdf.text(category.category || _tf('expCategoryN', { n: category.id }), margin + 2, yPos);
                yPos += 8;

                // Column headers
                pdf.setFontSize(10);
                const colWidth = (pageWidth - (margin * 2)) / 5;
                pdf.setFillColor(245, 245, 245);
                pdf.rect(margin, yPos - 4, pageWidth - (margin * 2), 6, 'F');
                pdf.text(_t('expCompetency'), margin + 2, yPos);
                pdf.text(_t('expCraftsman'), margin + colWidth * 1 + 2, yPos);
                pdf.text(_t('expSkilled'), margin + colWidth * 2 + 2, yPos);
                pdf.text(_t('expSemiSkilled'), margin + colWidth * 3 + 2, yPos);
                pdf.text(_t('expFoundation'), margin + colWidth * 4 + 2, yPos);
                yPos += 8;

                // Competency rows
                pdf.setFont(undefined, 'normal');
                category.competencies
                    .filter(comp => comp.text.trim() !== '')
                    .forEach(competency => {
                        // Check if we need a new page
                        if (yPos > pageHeight - 20) {
                            pdf.addPage('a4', 'landscape');
                            yPos = margin + 5;
                            
                            // Repeat column headers on new page
                            pdf.setFontSize(10);
                            pdf.setFont(undefined, 'bold');
                            pdf.setFillColor(245, 245, 245);
                            pdf.rect(margin, yPos - 4, pageWidth - (margin * 2), 6, 'F');
                            pdf.text(_t('expCompetency'), margin + 2, yPos);
                            pdf.text(_t('expCraftsman'), margin + colWidth * 1 + 2, yPos);
                            pdf.text(_t('expSkilled'), margin + colWidth * 2 + 2, yPos);
                            pdf.text(_t('expSemiSkilled'), margin + colWidth * 3 + 2, yPos);
                            pdf.text(_t('expFoundation'), margin + colWidth * 4 + 2, yPos);
                            yPos += 8;
                            pdf.setFont(undefined, 'normal');
                        }

                        // Competency text
                        const competencyText = `${competency.id}. ${competency.text}`;
                        const textLines = pdf.splitTextToSize(competencyText, colWidth - 4);
                        const lineHeight = 5;
                        const cellHeight = Math.max(lineHeight * textLines.length, 6);

                        // Draw cell borders
                        pdf.rect(margin, yPos - 4, colWidth, cellHeight);
                        pdf.rect(margin + colWidth, yPos - 4, colWidth, cellHeight);
                        pdf.rect(margin + colWidth * 2, yPos - 4, colWidth, cellHeight);
                        pdf.rect(margin + colWidth * 3, yPos - 4, colWidth, cellHeight);
                        pdf.rect(margin + colWidth * 4, yPos - 4, colWidth, cellHeight);

                        // Competency text
                        textLines.forEach((line, idx) => {
                            pdf.text(line, margin + 2, yPos + (idx * lineHeight));
                        });

                        // Checkmarks (centered in cells)
                        const checkY = yPos + (cellHeight / 2) - 2;
                        // Drawn as strokes, not as the character U+2713:
                        // that glyph is in neither Helvetica nor Cairo, and
                        // jsPDF drops unmapped characters silently, so the
                        // matrix was printing blank cells in every language.
                        if (competency.levels.craftsman) {
                            drawTick(pdf, margin + colWidth * 1 + (colWidth / 2), checkY);
                        }
                        if (competency.levels.skilled) {
                            drawTick(pdf, margin + colWidth * 2 + (colWidth / 2), checkY);
                        }
                        if (competency.levels.semiSkilled) {
                            drawTick(pdf, margin + colWidth * 3 + (colWidth / 2), checkY);
                        }
                        if (competency.levels.foundation) {
                            drawTick(pdf, margin + colWidth * 4 + (colWidth / 2), checkY);
                        }

                        yPos += cellHeight + 2;
                    });

                yPos += 5; // Extra space after category
            });
        }
        
        // ============ TASK VERIFICATION APPENDIX (if mode = 'appendix') ============
        if (appState.tvExportMode === 'appendix' && appState.collectionMode === 'workshop') {
            // Check if we have valid results to include
            const validResults = Object.keys(appState.workshopResults).filter(key => 
                appState.workshopResults[key] && appState.workshopResults[key].valid
            );
            
            if (validResults.length > 0) {
                // Start new page for appendix
                pdf.addPage();
                yPos = margin + 10;
                
                // Appendix title
                pdf.setFontSize(16);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expTaskVerifAppendix'), pageWidth / 2, yPos, { align: 'center' });
                yPos += 12;
                
                // Methodology Summary
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expMethodologySummary'), margin, yPos);
                yPos += 8;
                
                pdf.setFontSize(11);
                pdf.setFont(undefined, 'normal');
                pdf.text(_tf('expCollectionMode', { v: _t(appState.collectionMode === 'workshop' ? 'modeWorkshop' : 'expIndividualSurvey') }), margin, yPos);
                yPos += 6;
                pdf.text(_tf('expParticipants', { v: appState.workshopParticipants }), margin, yPos);
                yPos += 6;
                pdf.text(_tf('expWorkflowMode', { v: _t(appState.workflowMode === 'standard' ? 'modeStandard' : 'modeExtended') }), margin, yPos);
                yPos += 6;
                pdf.text(_tf('expPriorityFormula', { v: _t(appState.priorityFormula === 'if' ? 'formulaIF' : 'formulaIFD') }), margin, yPos);
                yPos += 12;
                
                // Priority Rankings Table
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expPriorityRankings'), margin, yPos);
                yPos += 8;
                
                // Get sorted results
                const sortedResults = [];
                validResults.forEach(taskKey => {
                    const result = appState.workshopResults[taskKey];
                    
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
                
                // Sort by priority descending
                sortedResults.sort((a, b) => b.priority - a.priority);
                
                // Table headers
                const colWidths = [15, 50, 75, 25, 25, 25, 25];
                const headers = [_t('expRank'), _t('expDutyLabel'), _t('expTaskLabel'),
                                 _t('expMeanI'), _t('expMeanF'), _t('expMeanD'), _t('expPriority')];
                
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'bold');
                let xPos = margin;
                headers.forEach((header, i) => {
                    pdf.text(header, xPos, yPos);
                    xPos += colWidths[i];
                });
                yPos += 6;
                
                // Table rows
                pdf.setFont(undefined, 'normal');
                sortedResults.forEach((row, index) => {
                    if (yPos > pageHeight - 20) {
                        pdf.addPage();
                        yPos = margin + 10;
                    }
                    
                    xPos = margin;
                    pdf.text(`#${index + 1}`, xPos, yPos);
                    xPos += colWidths[0];
                    
                    // Truncate long text
                    const dutyTrunc = row.duty.length > 20 ? row.duty.substring(0, 17) + '...' : row.duty;
                    pdf.text(dutyTrunc, xPos, yPos);
                    xPos += colWidths[1];
                    
                    const taskTrunc = row.task.length > 40 ? row.task.substring(0, 37) + '...' : row.task;
                    pdf.text(taskTrunc, xPos, yPos);
                    xPos += colWidths[2];
                    
                    pdf.text(row.meanI !== null ? row.meanI.toFixed(2) : 'N/A', xPos, yPos);
                    xPos += colWidths[3];
                    pdf.text(row.meanF !== null ? row.meanF.toFixed(2) : 'N/A', xPos, yPos);
                    xPos += colWidths[4];
                    pdf.text(row.meanD !== null ? row.meanD.toFixed(2) : 'N/A', xPos, yPos);
                    xPos += colWidths[5];
                    pdf.text(row.priority !== null ? row.priority.toFixed(2) : 'N/A', xPos, yPos);
                    
                    yPos += 5;
                });
                
                yPos += 8;
                
                // Duty-Level Summary Section
                if (yPos > pageHeight - 30) {
                    pdf.addPage();
                    yPos = margin + 10;
                }
                
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expDutyLevelSummary'), margin, yPos);
                yPos += 5;
                
                pdf.setFontSize(9);
                pdf.setFont(undefined, 'italic');
                pdf.text(_tf('expTrainingLoadMethod', { v: _t(appState.trainingLoadMethod === 'advanced' ? 'expAdvancedMethod' : 'expSimpleMethod') }), margin, yPos);
                yPos += 8;
                
                // Aggregate duty-level data
                const dutyMap = {};
                Object.keys(appState.workshopResults).forEach(taskKey => {
                    const result = appState.workshopResults[taskKey];
                    if (result && result.valid) {
                        let dutyId = result.dutyId || taskKey.split('_task_')[0];
                        let dutyTitle = result.dutyTitle;
                        
                        if (!dutyTitle) {
                            const dutyInput = document.querySelector(`input[data-duty-id="${dutyId}"], textarea[data-duty-id="${dutyId}"]`);
                            dutyTitle = dutyInput ? dutyInput.value.trim() : 'Unassigned';
                        }
                        
                        if (!dutyMap[dutyId]) {
                            dutyMap[dutyId] = {
                                dutyTitle: dutyTitle,
                                validTasks: 0,
                                prioritySum: 0,
                                difficultySum: 0,
                                tasks: []
                            };
                        }
                        
                        dutyMap[dutyId].validTasks++;
                        dutyMap[dutyId].prioritySum += result.priorityIndex;
                        dutyMap[dutyId].difficultySum += result.meanDifficulty;
                        dutyMap[dutyId].tasks.push({
                            priorityIndex: result.priorityIndex,
                            meanDifficulty: result.meanDifficulty
                        });
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
                    
                    dutyResults.push({
                        dutyTitle: duty.dutyTitle,
                        validTasks: duty.validTasks,
                        avgPriority: avgPriority,
                        trainingLoad: trainingLoad
                    });
                });
                
                dutyResults.sort((a, b) => b.avgPriority - a.avgPriority);
                
                // Duty table headers
                const dutyColWidths = [80, 30, 40, 45];
                const dutyHeaders = [_t('expDutyTitle'), _t('expTasks'),
                                     _t('expAvgPriority'), _t('expTrainingLoad')];
                
                pdf.setFontSize(9);
                pdf.setFont(undefined, 'bold');
                let dutyXPos = margin;
                dutyHeaders.forEach((header, i) => {
                    pdf.text(header, dutyXPos, yPos);
                    dutyXPos += dutyColWidths[i];
                });
                yPos += 6;
                
                // Duty table rows
                pdf.setFont(undefined, 'normal');
                dutyResults.forEach((duty) => {
                    if (yPos > pageHeight - 20) {
                        pdf.addPage();
                        yPos = margin + 10;
                    }
                    
                    dutyXPos = margin;
                    const dutyTitleTrunc = duty.dutyTitle.length > 35 ? duty.dutyTitle.substring(0, 32) + '...' : duty.dutyTitle;
                    pdf.text(dutyTitleTrunc, dutyXPos, yPos);
                    dutyXPos += dutyColWidths[0];
                    
                    pdf.text(duty.validTasks.toString(), dutyXPos, yPos);
                    dutyXPos += dutyColWidths[1];
                    
                    pdf.text(duty.avgPriority.toFixed(2), dutyXPos, yPos);
                    dutyXPos += dutyColWidths[2];
                    
                    pdf.text(duty.trainingLoad.toFixed(2), dutyXPos, yPos);
                    
                    yPos += 5;
                });
                
                yPos += 8;
                
                // Notes
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expNotes'), margin, yPos);
                yPos += 6;
                
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'normal');
                const notes = [
                    'Weighted Mean = Σ(value × count) ÷ total responses',
                    'Priority Index calculated using selected formula',
                    'Higher priority values indicate greater training importance',
                    'Results based on DACUM methodology'
                ];
                notes.forEach(note => {
                    if (yPos > pageHeight - 15) {
                        pdf.addPage();
                        yPos = margin + 10;
                    }
                    pdf.text(`• ${note}`, margin, yPos);
                    yPos += 5;
                });
            }
        }
        
        // ============ VERIFIED LIVE WORKSHOP RESULTS APPENDIX ============
        if (appState.tvExportMode === 'appendix' && hasVerifiedResults) {
            // Start new page for verified results appendix
            pdf.addPage();
            yPos = margin + 10;
            
            // Appendix title
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expPostVoteResults'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 12;
            
            // Metadata
            pdf.setFontSize(11);
            pdf.setFont(undefined, 'normal');
            pdf.text(_tf('expOccupation', { v: appState.lwFinalizedData.occupation }), margin, yPos);
            yPos += 6;
            pdf.text(_tf('expJobTitle', { v: appState.lwFinalizedData.jobTitle }), margin, yPos);
            yPos += 6;
            pdf.text(_tf('expDate', { v: _today() }), margin, yPos);
            yPos += 6;
            const vFormula = appState.lwFinalizedData.appState.priorityFormula || 'if';
            const vFormulaText = _t(vFormula === 'ifd' ? 'formulaIFD' : 'formulaIF');
            pdf.text(`Priority Formula: ${vFormulaText}`, margin, yPos);
            yPos += 6;
            pdf.text(_tf('expTotalParticipants', { v: appState.lwAggregatedResults.totalVotes }), margin, yPos);
            yPos += 12;
            
            // Collect all verified tasks with metrics
            const verifiedTasks = [];
            Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
                const duty = appState.lwFinalizedData.duties[dutyId];
                duty.tasks.forEach(task => {
                    if (task.priorityIndex !== undefined) {
                        verifiedTasks.push({
                            dutyTitle: duty.title,
                            taskText: task.text,
                            meanImportance: task.meanImportance,
                            meanFrequency: task.meanFrequency,
                            meanDifficulty: task.meanDifficulty,
                            priorityIndex: task.priorityIndex,
                            rank: task.rank
                        });
                    }
                });
            });
            
            verifiedTasks.sort((a, b) => a.rank - b.rank);
            
            // Table header
            pdf.setFontSize(10);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expRank'),      margin,       yPos);
            pdf.text(_t('expDutyLabel'), margin + 15,  yPos);
            pdf.text(_t('expTaskLabel'), margin + 60,  yPos);
            pdf.text(_t('expInitialI'),  margin + 140, yPos);
            pdf.text(_t('expInitialF'),  margin + 150, yPos);
            pdf.text(_t('expInitialD'),  margin + 160, yPos);
            pdf.text(_t('expPI'),        margin + 170, yPos);
            yPos += 5;
            pdf.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 3;
            
            // Table rows
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(8);
            
            verifiedTasks.forEach(task => {
                // Check if need new page
                if (yPos + 8 > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin;
                }
                
                pdf.text(String(task.rank), margin, yPos);
                const dutyLines = pdf.splitTextToSize(task.dutyTitle, 40);
                pdf.text(dutyLines[0] || '', margin + 15, yPos);
                const taskLines = pdf.splitTextToSize(task.taskText, 75);
                pdf.text(taskLines[0] || '', margin + 60, yPos);
                pdf.text(task.meanImportance.toFixed(2), margin + 140, yPos);
                pdf.text(task.meanFrequency.toFixed(2), margin + 150, yPos);
                pdf.text(task.meanDifficulty.toFixed(2), margin + 160, yPos);
                pdf.text(task.priorityIndex.toFixed(2), margin + 170, yPos);
                yPos += 6;
            });
        }
        
        // ============ SUPPLEMENTARY OCCUPATIONAL VERIFICATION ============
        // Follows the task verification appendices and stays separate
        // from them. Writes nothing when the feature is off or unused.
        _writeSupplementaryPDF(pdf, margin);

        // ============ TASK ANALYSIS APPENDIX ============
        // Sits between Task Verification and Competency Clusters in the
        // export, matching the on-screen tab order. Included whenever any
        // task has analysis content — independent of tvExportMode, since
        // that setting only governs the verification RATINGS appendix.
        {
            const taData = getTaskAnalysisExportData();
            if (taData.length > 0) {
                pdf.addPage();
                yPos = margin + 5;

                pdf.setFontSize(16);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expTaskAnalysisAppendix'), pageWidth / 2, yPos, { align: 'center' });
                yPos += 12;

                const _ensureRoom = (need) => {
                    if (yPos + need > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                };

                const _hasMarker = (s) => /^(\d+[.\)]|[•\-\*○●])\s+/.test(s);

                const _writeList = (labelKey, items) => {
                    if (!items || !items.length) return;
                    _ensureRoom(10);
                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_t(labelKey), margin + 4, yPos);
                    yPos += 5.5;
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    // Respect whatever the user already chose in the app
                    // (Number/Bullet buttons bake the marker into the text
                    // itself) — only auto-number lines that carry no marker
                    // of their own, so a bulleted list stays bulleted.
                    let autoNum = 0;
                    items.forEach((item) => {
                        const text = _hasMarker(item) ? item : `${++autoNum}. ${item}`;
                        const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin - 10);
                        lines.forEach(line => {
                            _ensureRoom(5);
                            pdf.text(line, margin + 8, yPos);
                            yPos += 5;
                        });
                    });
                    yPos += 2;
                };

                const _writeText = (labelKey, value) => {
                    if (!value || !value.trim()) return;
                    _ensureRoom(10);
                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_t(labelKey), margin + 4, yPos);
                    yPos += 5.5;
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    const lines = pdf.splitTextToSize(value, pageWidth - 2 * margin - 10);
                    lines.forEach(line => {
                        _ensureRoom(5);
                        pdf.text(line, margin + 8, yPos);
                        yPos += 5;
                    });
                    yPos += 2;
                };

                taData.forEach((entry, idx) => {
                    _ensureRoom(18);
                    if (idx > 0) yPos += 4;

                    pdf.setFontSize(9);
                    pdf.setFont(undefined, 'bold');
                    pdf.setTextColor(100, 100, 100);
                    pdf.text(`${_t('expDutyLabel')}: ${entry.dutyLetter} — ${entry.dutyTitle}`, margin, yPos);
                    pdf.setTextColor(0, 0, 0);
                    yPos += 6;

                    pdf.setFontSize(13);
                    pdf.setFont(undefined, 'bold');
                    const taskLines = pdf.splitTextToSize(`${entry.taskCode}. ${entry.taskText}`, pageWidth - 2 * margin);
                    taskLines.forEach(line => { _ensureRoom(7); pdf.text(line, margin, yPos); yPos += 7; });
                    yPos += 1;

                    const r = entry.record;
                    _writeList('taLblSteps',      r.performanceSteps);
                    _writeList('taLblKnowledge',  r.requiredKnowledge);
                    _writeList('taLblSkills',     r.requiredSkills);
                    _writeList('taLblTools',      r.toolsEquipmentMaterials);
                    _writeList('taLblSafety',     r.safetyOSH);
                    _writeText('taLblConditions', r.conditionsWorkEnvironment);
                    _writeList('taLblDecisions',  r.decisionsCriticalPoints);
                    _writeList('taLblCriteria',   r.performanceCriteria);
                    _writeText('taLblStandard',   r.performanceStandard);
                    _writeList('taLblErrors',     r.commonErrorsTroubleshooting);

                    _ensureRoom(4);
                    pdf.setDrawColor(220, 220, 220);
                    pdf.line(margin, yPos, pageWidth - margin, yPos);
                    yPos += 4;
                });
            }
        }

        // ============ COMPETENCY CLUSTERS SECTION ============
        if (appState.clusteringData.clusters && appState.clusteringData.clusters.length > 0) {
            pdf.addPage();
            yPos = margin + 5;
            
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expClusters'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;
            
            appState.clusteringData.clusters.forEach((cluster, clusterIndex) => {
                const clusterNumber = clusterIndex + 1;
                
                // Check if need new page
                if (yPos + 20 > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin + 5;
                }
                
                // Cluster header
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_tf('expCompetencyN', { n: clusterNumber, name: cluster.name }), margin, yPos);
                yPos += 7;
                
                // Range section
                if (cluster.range && cluster.range.trim()) {
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_t('expRangeLabel'), margin, yPos);
                    yPos += 5;
                    
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    const rangeLines = pdf.splitTextToSize(cluster.range, pageWidth - 2 * margin - 5);
                    rangeLines.forEach(line => {
                        if (yPos + 5 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        pdf.text(line, margin + 5, yPos);
                        yPos += 5;
                    });
                    yPos += 3;
                }
                
                // Related Tasks section
                if (cluster.tasks && cluster.tasks.length > 0) {
                    if (yPos + 10 > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                    
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_t('expRelatedTasks'), margin, yPos);
                    yPos += 5;
                    
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    
                    cluster.tasks.forEach(task => {
                        if (yPos + 6 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        
                        const taskCode = getTaskCode(task.id);
                        const taskText = `- ${taskCode}: ${task.text}`;
                        const lines = pdf.splitTextToSize(taskText, pageWidth - 2 * margin - 5);
                        
                        lines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 5, yPos);
                            yPos += 5;
                        });
                    });
                    yPos += 3;
                }
                
                // Performance Criteria section
                if (cluster.performanceCriteria && cluster.performanceCriteria.length > 0) {
                    if (yPos + 10 > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                    
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_t('expPCLabel'), margin, yPos);
                    yPos += 5;
                    
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    
                    cluster.performanceCriteria.forEach((criterion, idx) => {
                        if (yPos + 6 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        
                        const criterionText = `${clusterNumber}-${idx + 1} ${criterion}`;
                        const lines = pdf.splitTextToSize(criterionText, pageWidth - 2 * margin - 5);
                        
                        lines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 5, yPos);
                            yPos += 5;
                        });
                    });
                }
                
                yPos += 8;
            });
        }
        
        // ============ LEARNING OUTCOMES SECTION ============
        if (appState.learningOutcomesData.outcomes && appState.learningOutcomesData.outcomes.length > 0) {
            pdf.addPage();
            yPos = margin + 5;
            
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expLearningOutcomes'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;
            
            // Group LOs by cluster
            const losByCluster = {};
            appState.learningOutcomesData.outcomes.forEach(lo => {
                lo.linkedCriteria.forEach(pc => {
                    if (!losByCluster[pc.clusterNumber]) {
                        losByCluster[pc.clusterNumber] = [];
                    }
                    if (!losByCluster[pc.clusterNumber].includes(lo)) {
                        losByCluster[pc.clusterNumber].push(lo);
                    }
                });
            });
            
            // Sort cluster numbers
            const clusterNumbers = Object.keys(losByCluster).sort((a, b) => parseInt(a) - parseInt(b));
            
            clusterNumbers.forEach(clusterNum => {
                const clusterIndex = parseInt(clusterNum) - 1;
                const cluster = appState.clusteringData.clusters[clusterIndex];
                const los = losByCluster[clusterNum];
                
                if (yPos + 20 > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin + 5;
                }
                
                // Cluster header
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(`${cluster.name}`, margin, yPos);
                yPos += 7;
                
                // Learning Outcomes for this cluster
                los.forEach(lo => {
                    if (yPos + 15 > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                    
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(`${lo.number}:`, margin + 5, yPos);
                    yPos += 5;
                    
                    if (lo.statement && lo.statement.trim()) {
                        pdf.setFontSize(10);
                        pdf.setFont(undefined, 'normal');
                        const statementLines = pdf.splitTextToSize(lo.statement, pageWidth - 2 * margin - 10);
                        statementLines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 10, yPos);
                            yPos += 5;
                        });
                    }
                    
                    yPos += 2;
                    
                    // Mapped Performance Criteria
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'italic');
                    pdf.text(_t('expMappedPC'), margin + 10, yPos);
                    yPos += 5;
                    
                    pdf.setFont(undefined, 'normal');
                    pdf.setFontSize(9);
                    lo.linkedCriteria.forEach(pc => {
                        if (yPos + 5 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        const pcText = `- ${pc.id}: ${pc.text}`;
                        const pcLines = pdf.splitTextToSize(pcText, pageWidth - 2 * margin - 15);
                        pcLines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 15, yPos);
                            yPos += 5;
                        });
                    });
                    
                    yPos += 5;
                });
                
                yPos += 3;
            });
        }
        
        // ============ MODULE MAPPING SECTION ============
        if (appState.moduleMappingData.modules && appState.moduleMappingData.modules.length > 0) {
            pdf.addPage();
            yPos = margin + 5;
            
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expModuleMapping'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;
            
            appState.moduleMappingData.modules.forEach(module => {
                if (yPos + 20 > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin + 5;
                }
                
                // Module title
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(module.title, margin, yPos);
                yPos += 7;
                
                // Learning Outcomes in this module
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expLOsLabel'), margin + 5, yPos);
                yPos += 5;
                
                module.learningOutcomes.forEach(lo => {
                    if (yPos + 15 > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                    
                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(`${lo.number}:`, margin + 10, yPos);
                    yPos += 5;
                    
                    if (lo.statement && lo.statement.trim()) {
                        pdf.setFontSize(10);
                        pdf.setFont(undefined, 'normal');
                        const statementLines = pdf.splitTextToSize(lo.statement, pageWidth - 2 * margin - 15);
                        statementLines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 15, yPos);
                            yPos += 5;
                        });
                    }
                    
                    yPos += 2;
                    
                    // Referenced Performance Criteria
                    pdf.setFontSize(9);
                    pdf.setFont(undefined, 'italic');
                    pdf.text(_t('expReferencedPC'), margin + 15, yPos);
                    yPos += 4;
                    
                    pdf.setFont(undefined, 'normal');
                    pdf.setFontSize(8);
                    lo.linkedCriteria.forEach(pc => {
                        if (yPos + 4 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        const pcText = `- ${pc.id}: ${pc.text}`;
                        const pcLines = pdf.splitTextToSize(pcText, pageWidth - 2 * margin - 20);
                        pcLines.forEach(line => {
                            if (yPos + 4 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 20, yPos);
                            yPos += 4;
                        });
                    });
                    
                    yPos += 3;
                });
                
                yPos += 5;
            });
        }
        
        // ============ ASSESSMENT PLAN SECTION ============
        //
        // Mirror of the Word appendix — see exports_docx.js for the full
        // reasoning. Every criterion below is pc.text copied verbatim from
        // Competency Clustering, so an assessment sheet can never drift
        // away from the standard it is supposed to measure.
        //
        // Laid out with plain pdf.text at fixed left offsets rather than a
        // bordered table, matching every other section in this file. Under
        // Arabic the whole document is mirrored by _beginArabic, so all
        // offsets here stay left-to-right and need no special casing.
        const _apModules = (appState.moduleMappingData.modules || []).filter(m =>
            (m.learningOutcomes || []).some(lo => (lo.linkedCriteria || []).length)
        );

        if (_apModules.length > 0) {
            pdf.addPage();
            yPos = margin + 5;

            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expAssessmentPlan'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 8;

            pdf.setFontSize(9);
            pdf.setFont(undefined, 'italic');
            pdf.splitTextToSize(_t('expAssessmentPlanNote'), pageWidth - 2 * margin).forEach(line => {
                pdf.text(line, margin, yPos);
                yPos += 4;
            });
            yPos += 4;

            // Landscape A4 is 297 mm wide, so 172 mm of criterion text still
            // leaves room for a source column and a writable verdict field.
            const _apColText    = margin + 5;
            const _apColSource  = margin + 185;
            const _apColVerdict = margin + 240;
            const _apTextWidth  = 172;

            const _apHeaderRow = () => {
                pdf.setFontSize(9);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expAssessmentCriterion'), _apColText, yPos);
                pdf.text(_t('expCriterionSource'),     _apColSource, yPos);
                pdf.text(_t('expVerdict'),             _apColVerdict, yPos);
                yPos += 5;
                pdf.setFont(undefined, 'normal');
            };

            _apModules.forEach(module => {
                if (yPos + 20 > pageHeight - margin) { pdf.addPage(); yPos = margin + 5; }

                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(module.title, margin, yPos);
                yPos += 7;

                (module.learningOutcomes || []).forEach(lo => {
                    const pcs = lo.linkedCriteria || [];
                    if (!pcs.length) return;

                    if (yPos + 20 > pageHeight - margin) { pdf.addPage(); yPos = margin + 5; }

                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(`${lo.number}:`, margin + 5, yPos);
                    yPos += 5;

                    if (lo.statement && lo.statement.trim()) {
                        pdf.setFontSize(10);
                        pdf.setFont(undefined, 'normal');
                        pdf.splitTextToSize(lo.statement, pageWidth - 2 * margin - 15).forEach(line => {
                            if (yPos + 5 > pageHeight - margin) { pdf.addPage(); yPos = margin + 5; }
                            pdf.text(line, margin + 10, yPos);
                            yPos += 5;
                        });
                    }
                    yPos += 2;

                    // Repeated per outcome so a criterion landing on a fresh
                    // page is never left unlabelled.
                    _apHeaderRow();

                    /* Not de-duplicated across outcomes — see the Word
                       exporter for why a repeated criterion is correct. */
                    pdf.setFontSize(9);
                    pcs.forEach(pc => {
                        const pcLines = pdf.splitTextToSize(pc.text || '', _apTextWidth);
                        const blockHeight = Math.max(pcLines.length, 1) * 4.5 + 2;

                        if (yPos + blockHeight > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                            _apHeaderRow();
                            pdf.setFontSize(9);
                        }

                        // Source and the blank verdict rule sit on the first
                        // line, so a wrapped criterion still reads as one row.
                        const rowTop = yPos;
                        pcLines.forEach(line => {
                            pdf.text(line, _apColText, yPos);
                            yPos += 4.5;
                        });
                        pdf.setFontSize(8);
                        pdf.text(_tf('expCriterionSourceValue', { c: pc.clusterNumber, id: pc.id }), _apColSource, rowTop);
                        /* Blank field rather than a checkbox glyph: the Arabic
                           face here is a simple TrueType file that may not
                           carry U+2610, and a missing-glyph box in the verdict
                           column would be worse than no mark at all. */
                        pdf.text('__________________', _apColVerdict, rowTop);
                        pdf.setFontSize(9);

                        yPos += 2;
                    });

                    yPos += 3;
                });

                if (yPos + 14 > pageHeight - margin) { pdf.addPage(); yPos = margin + 5; }
                pdf.setFontSize(9);
                pdf.setFont(undefined, 'normal');
                pdf.text(_t('expTeacherSignature'), margin + 5, yPos);
                yPos += 5;
                pdf.text(_t('expLearnerSignature'), margin + 5, yPos);
                yPos += 8;
            });
        }

        const _pdfJobVal = (jobTitleInput.value || '').trim();
        pdf.save(_safeFilename(
            occupationTitleInput.value + (_pdfJobVal ? ' ' + _pdfJobVal : ''),
            '_DACUM_Chart.pdf'
        ));
        showStatus(_t('msgPdfExported'), 'success');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        showStatus(_tf('msgPdfError', { msg: error.message }), 'error');
    } finally {
        // See exportTaskVerificationPDF: the parser is suspended on the
        // class, so it must be restored even on failure.
        _endHeadingColor();
        _endArabic();
    }
}
