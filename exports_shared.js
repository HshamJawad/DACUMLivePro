// ============================================================
// /exports_shared.js
// ------------------------------------------------------------
// Data preparation shared by the PDF and DOCX exporters.
//
// Split out of the former 4,107-line exports.js, which held four
// exported entry points and had grown to 18% of the whole codebase.
// Size was not the only problem: the "standalone verification"
// mode switch that silently hijacked the main PDF/Word buttons sat
// buried in there for a long time precisely because nobody could
// read the file end to end.
//
// Only genuinely shared logic belongs here. The Word and PDF
// generators overlap by ~14%, so merging them would be inventing
// commonality that does not exist — they are separate files.
// ============================================================

import { appState } from './state.js';
import { mayExportVerification } from './draft_unverified.js';


// ── Verification dataset adapter ──────────────────────────────
//
// The standalone verification reports were written against the shape
// of appState.workshopResults — meanImportance / meanFrequency /
// meanDifficulty / priorityIndex / valid. Individual-Survey mode does
// not produce that shape: it stores raw 0-3 integers in
// appState.verificationRatings with no means and no priority index.
//
// Rather than block that mode outright (which is what the old guard
// did — it refused BEFORE looking at any data, so even a fully
// completed individual survey could never be exported), this adapter
// normalises either source into the one shape the reports already
// consume. A single respondent's rating IS its own mean, so the raw
// value maps straight onto the mean field.
//
// priorityIndex is computed with the SAME formula tasks.js uses for
// workshop mode, honouring appState.priorityFormula, so a given task
// never shows one ranking on screen and a different one in the report.
export function buildVerificationDataset() {
  /* Single choke point. Every exporter — PDF, Word, CSV, the
     standalone verification report and the appendices — reaches the
     ratings through this function, so refusing here is the one place
     that cannot be bypassed by adding a new export path later.

     Returns empty rather than throwing: an exporter that finds no
     verification data simply omits the section, which is exactly the
     desired outcome. */
  if (!mayExportVerification()) return {};

  if (appState.collectionMode === 'workshop') {
    return appState.workshopResults || {};
  }

  const out     = {};
  const ratings = appState.verificationRatings || {};

  Object.keys(ratings).forEach(taskKey => {
    const r = ratings[taskKey];
    if (!r) return;

    // Same completeness test as the chart and the dashboard: all three
    // dimensions set. Extended mode's criticality stays optional here,
    // exactly as it is elsewhere.
    if (r.importance === null || r.importance === undefined ||
        r.frequency  === null || r.frequency  === undefined ||
        r.difficulty === null || r.difficulty === undefined) return;

    const meta = appState.taskMetadata[taskKey] || {};
    const mI = r.importance, mF = r.frequency, mD = r.difficulty;

    out[taskKey] = {
      dutyId:     meta.dutyId || taskKey.split('_task_')[0],
      dutyTitle:  meta.dutyTitle || '',
      taskTitle:  meta.taskTitle || '',
      meanImportance: mI,
      meanFrequency:  mF,
      meanDifficulty: mD,
      meanCriticality: (r.criticality === null || r.criticality === undefined) ? 0 : r.criticality,
      priorityIndex: appState.priorityFormula === 'ifd' ? mI * mF * mD : mI * mF,
      valid: true,
      // Deliberately absent: responseCount. There is no panel in this
      // mode, and printing a fabricated count would misrepresent the
      // evidence base of the report.
      responseCount: null
    };
  });

  return out;
}

// How much of the chart this report actually covers. A partial export
// is legitimate mid-analysis, but handing a verification committee a
// report that silently looks complete is not — so the reports print
// this instead of leaving the reader to assume full coverage.
export function getVerificationCoverage(results) {
  const ratedKeys = Object.keys(results || {}).filter(k => results[k] && results[k].valid);

  let totalTasks = 0;
  const totalDuties = new Set();
  document.querySelectorAll('input[data-duty-id], textarea[data-duty-id]').forEach(dutyInput => {
    const dutyId = dutyInput.getAttribute('data-duty-id');
    if (!(dutyInput.value || '').trim()) return;
    totalDuties.add(dutyId);
    document.querySelectorAll(
      `input[data-task-id^="${dutyId}_"], textarea[data-task-id^="${dutyId}_"]`
    ).forEach(t => { if ((t.value || '').trim()) totalTasks++; });
  });

  const ratedDuties = new Set();
  ratedKeys.forEach(k => {
    const r = results[k];
    ratedDuties.add((r && r.dutyId) || k.split('_task_')[0]);
  });

  const ratedTasks = ratedKeys.length;
  const complete   = totalTasks > 0 && ratedTasks >= totalTasks;

  return {
    ratedTasks,
    totalTasks,
    ratedDuties: ratedDuties.size,
    totalDuties: totalDuties.size,
    complete,
    label: complete
      ? `Complete: all ${ratedTasks} tasks rated across ${ratedDuties.size} duties.`
      : `PARTIAL REPORT — ${ratedTasks} of ${totalTasks || ratedTasks} tasks rated, ` +
        `covering ${ratedDuties.size} of ${totalDuties.size || ratedDuties.size} duties. ` +
        `Unrated tasks are omitted from the tables below.`
  };
}


// ── DACUM workshop date (single day or from – to) ─────────────
// Both date inputs hold ISO yyyy-mm-dd. `fmt` turns one ISO date into
// display text, so each exporter keeps its own established style.
export function formatDacumDateRange(fmt) {
  const start = (document.getElementById('dacumDate')?.value || '').trim();
  const end   = (document.getElementById('dacumDateEnd')?.value || '').trim();
  if (!start) return '';
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} \u2013 ${fmt(end)}`;
}

/** Long, localised date in the export language — Latin digits kept. */
export function formatDateLong(iso) {
  const lang = window.i18n ? window.i18n.getLang() : 'en';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  try {
    return d.toLocaleDateString(lang + '-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (_) { return iso; }
}


// ── Venue with workshop format (in person / online / hybrid) ──
// In person prints the venue as typed. Online/hybrid prefix the
// format so "Zoom" reads as "Online — Zoom"; with no venue typed
// the format alone is printed.
export function formatVenueWithMode() {
  const venue = (document.getElementById('venue')?.value || '').trim();
  const fmt   = (document.getElementById('workshopFormat')?.value || 'inperson').trim();
  if (fmt !== 'online' && fmt !== 'hybrid') return venue;
  const key = fmt === 'online' ? 'fmtOnline' : 'fmtHybrid';
  const t = window.i18n ? window.i18n.t(key) : key;
  const label = (t && t !== key) ? t : (fmt === 'online' ? 'Online' : 'Hybrid');
  return venue ? `${label} \u2014 ${venue}` : label;
}
