// ============================================================
// /dashboard_xlsx.js — 3.99.6
// Task Verification → "Export Dashboard as Excel".
// Builds a real .xlsx workbook with ExcelJS (vendor/exceljs-4.4.0),
// loaded on first use so the ~0.9 MB library never slows start-up.
//
// Sheets:
//   1. Task Priorities — every valid task, ranked by Priority Index
//   2. Duty Summary    — the duty-level table exactly as the
//                        dashboard computes it (same sort, same method)
// Numbers are stored as numbers (2 decimals shown), headers are
// frozen and filterable, and the sheets run right-to-left in Arabic.
// ============================================================

import { appState } from './state.js';

const LIB_SRC = 'vendor/exceljs-4.4.0/exceljs.min.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k) : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _rtl = () => !!(window.i18n && window.i18n.isRTL());

/* Some header keys carry <br> or entities for the on-screen table. */
function _plain(s) {
  const d = document.createElement('div');
  d.innerHTML = String(s == null ? '' : s).replace(/<br\s*\/?>/gi, ' ');
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
const _h = (k) => _plain(_t(k));

let _libPromise = null;
function _loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_libPromise) return _libPromise;
  _libPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIB_SRC;
    s.async = true;
    s.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS did not initialise'));
    s.onerror = () => { _libPromise = null; reject(new Error('Could not load ' + LIB_SRC)); };
    document.head.appendChild(s);
  });
  return _libPromise;
}

// ── Styling ──────────────────────────────────────────────────
const C = {
  head:   'FF0284C7',
  headTx: 'FFFFFFFF',
  title:  'FF0F172A',
  sub:    'FF64748B',
  zebra:  'FFF0F9FF',
  border: 'FFCBD5E1',
  accent: 'FF0369A1',
  topBg:  'FFE0F2FE',
};
const THIN = { style: 'thin', color: { argb: C.border } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function _sheetBase(ws, title, colCount, metaLines) {
  ws.views = [{ rightToLeft: _rtl(), state: 'frozen', ySplit: metaLines.length + 3 }];
  ws.properties.defaultRowHeight = 18;

  ws.mergeCells(1, 1, 1, colCount);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 15, color: { argb: C.title } };
  t.alignment = { vertical: 'middle', horizontal: _rtl() ? 'right' : 'left' };
  ws.getRow(1).height = 26;

  metaLines.forEach((line, i) => {
    const r = 2 + i;
    ws.mergeCells(r, 1, r, colCount);
    const c = ws.getCell(r, 1);
    c.value = line;
    c.font = { size: 10, color: { argb: C.sub } };
    c.alignment = { horizontal: _rtl() ? 'right' : 'left' };
  });
  return metaLines.length + 3;          // header row index (one blank row before it)
}

function _header(ws, rowIdx, labels) {
  const row = ws.getRow(rowIdx);
  labels.forEach((label, i) => {
    const c = row.getCell(i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: C.headTx } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = BORDER;
  });
  row.height = 34;
}

function _body(ws, firstRow, rows, numCols, centerCols) {
  rows.forEach((vals, i) => {
    const row = ws.getRow(firstRow + i);
    vals.forEach((v, j) => {
      const c = row.getCell(j + 1);
      c.value = v;
      c.border = BORDER;
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      if (numCols.includes(j)) {
        c.numFmt = '0.00';
        c.alignment = { horizontal: 'center', vertical: 'top' };
      } else if (centerCols.includes(j)) {
        c.alignment = { horizontal: 'center', vertical: 'top' };
      } else {
        c.alignment = { vertical: 'top', wrapText: true, horizontal: _rtl() ? 'right' : 'left' };
      }
    });
  });
}

function _num(v) { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : null; }

// ── Public ───────────────────────────────────────────────────
export async function exportDashboardXlsx({ taskRows, dutyRows, occupation, fileBase }) {
  const ExcelJS = await _loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DACUM Live Pro';
  wb.created = new Date();

  const today = new Date().toISOString().split('T')[0];
  const method = _t(appState.trainingLoadMethod === 'advanced' ? 'methodAdvanced' : 'methodSimple');
  const meta = [
    _tf('xlMetaOccupation', { v: occupation }),
    _tf('xlMetaDate', { v: today }),
    _tf('xlMetaCounts', { t: taskRows.length, d: dutyRows.length }),
  ];

  // Sheet 1 — tasks
  const ws1 = wb.addWorksheet(_plain(_t('xlSheetTasks')).slice(0, 31) || 'Tasks');
  const cols1 = [_h('thRank'), _h('xlDutyCode'), _h('thDuty'), _h('xlTaskCode'), _h('thTask'),
                 _h('thMeanImportance'), _h('thMeanFrequency'), _h('thMeanDifficulty'), _h('thPriorityIndex')];
  const h1 = _sheetBase(ws1, _t('xlTitleTasks'), cols1.length, meta);
  _header(ws1, h1, cols1);
  _body(ws1, h1 + 1, taskRows.map((r, i) => [
    i + 1, r.dutyCode || '', r.duty || '', r.taskCode || '', r.task || '',
    _num(r.meanImportance), _num(r.meanFrequency), _num(r.meanDifficulty), _num(r.priorityIndex),
  ]), [5, 6, 7, 8], [0, 1, 3]);
  [7, 10, 34, 10, 52, 13, 13, 13, 13].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });
  if (taskRows.length) {
    ws1.autoFilter = { from: { row: h1, column: 1 }, to: { row: h1 + taskRows.length, column: cols1.length } };
    // Priority Index column in bold accent, as on screen.
    for (let r = h1 + 1; r <= h1 + taskRows.length; r++) {
      ws1.getCell(r, 9).font = { bold: true, color: { argb: C.accent } };
    }
  }

  // Sheet 2 — duties
  const ws2 = wb.addWorksheet(_plain(_t('xlSheetDuties')).slice(0, 31) || 'Duties');
  const cols2 = [_h('xlDutyCode'), _h('thDutyTitle'), _h('thTotalTasks'), _h('thValidTasks'),
                 _h('thAvgImportance'), _h('thAvgFrequency'), _h('thAvgDifficulty'),
                 _h('thAvgPriority'), _h('thHighPriorityTasks'), _h('thTrainingLoad')];
  const h2 = _sheetBase(ws2, _t('xlTitleDuties'), cols2.length,
    [meta[0], meta[1], _tf('xlMetaMethod', { v: method })]);
  _header(ws2, h2, cols2);
  _body(ws2, h2 + 1, dutyRows.map(d => [
    d.dutyCode || '', d.dutyTitle || '', d.totalTasks, d.validTasks,
    _num(d.avgImportance), _num(d.avgFrequency), _num(d.avgDifficulty),
    _num(d.avgPriority), d.highPriorityCount, _num(d.trainingLoad),
  ]), [4, 5, 6, 7, 9], [0, 2, 3, 8]);
  [10, 40, 11, 11, 13, 13, 13, 13, 13, 14].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });
  if (dutyRows.length) {
    ws2.autoFilter = { from: { row: h2, column: 1 }, to: { row: h2 + dutyRows.length, column: cols2.length } };
    for (let r = h2 + 1; r <= h2 + dutyRows.length; r++) {
      ws2.getCell(r, 10).font = { bold: true, color: { argb: C.accent } };
    }
  }

  // Empty dashboards still produce a valid, explained file.
  [[ws1, h1, taskRows, cols1.length], [ws2, h2, dutyRows, cols2.length]].forEach(([ws, h, rows, n]) => {
    if (rows.length) return;
    ws.mergeCells(h + 1, 1, h + 1, n);
    const c = ws.getCell(h + 1, 1);
    c.value = _t('msgNoDutyData');
    c.font = { italic: true, color: { argb: C.sub } };
    c.alignment = { horizontal: 'center' };
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileBase + '.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
