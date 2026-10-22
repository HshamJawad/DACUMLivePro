// ============================================================
// /verification_charts.js
// Task Verification Results — flat grouped bar chart, one per duty.
//
// Inspired by the "Task Verification Results" chart in Robert
// Norton's DACUM Handbook: one chart per duty, tasks along the x
// axis in DACUM order, rated dimensions as grouped bars. Only the
// IDEA is borrowed — every number, scale, label and respondent
// count here comes from the user's own project data. Nothing from
// the handbook's worked example is hard-coded anywhere.
//
// Deliberately flat (no 3-D extrusion): a perspective projection
// pushes bar tops away from the gridlines and hides rear bars, so
// the reader can no longer compare heights accurately — the exact
// failure mode of the era's 3-D bar charts.
//
// Rendered as hand-built SVG rather than a charting library, so
// the PWA keeps working offline without adding a large dependency
// to the service worker's precache list.
// ============================================================

import { appState } from './state.js';

/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);


// ── Series definitions ────────────────────────────────────────
// Colours echo the app's existing indigo/sky/amber accents.
const SERIES = {
  importance: { key: 'importance', labelKey: 'thImportance', color: '#4f46e5' },
  frequency:  { key: 'frequency',  labelKey: 'thFrequency',  color: '#0ea5e9' },
  difficulty: { key: 'difficulty', labelKey: 'thDifficulty', color: '#f59e0b' }
};

/* Read at draw time, not at module load: the chart is redrawn on every
   open and on every duty change, so resolving here means a language
   switch is reflected without a reload. */
const _seriesLabel = (k) => _t(SERIES[k].labelKey);

// Two views, named by the QUESTION they answer rather than by how
// many bars they draw — the point of the toggle is methodological,
// not cosmetic. "Curriculum decision" drops Frequency because a
// rarely-performed task that is important and hard still needs
// heavy training; giving frequency equal visual weight invites the
// designer to under-train exactly those tasks.
const VIEWS = {
  full:       { id: 'full',       series: ['importance', 'frequency', 'difficulty'] },
  curriculum: { id: 'curriculum', series: ['importance', 'difficulty'] }
};

const SCALE_MAX = 3;          // the app's own 0-3 scale
const PLOT_H    = 250;
const PAD       = { top: 20, right: 18, bottom: 46, left: 44 };
const BAR_W     = 17;
const BAR_GAP   = 4;
const GROUP_GAP = 26;

// ── Module state ──────────────────────────────────────────────
let _view    = 'full';
let _dutyIdx = 0;
let _duties  = [];

// ── Helpers ───────────────────────────────────────────────────

/* THE CHART ITSELF IS NOT MIRRORED — a considered choice, not an
   omission. The x-axis carries tasks in DACUM order (A1, A2, A3…) and
   the y-axis is the 0-3 scale rising upward. Both are ordinal axes, and
   a bar chart is read as a measuring instrument: reversing it would put
   task A1 on the right in Arabic but leave the y-axis unreversed, which
   is the worst of both. Every published DACUM chart, in every language,
   reads left-to-right on this axis.

   What DOES follow the language: the labels, the legend, the duty name
   and the modal chrome around the plot. */
const _rtlChart = () => (window.i18n ? window.i18n.isRTL() : false);
/* 3.122.2: the chart's own text in the interface font — Cairo in Arabic.
   Kept as an attribute (not CSS) so the PNG export still carries it. */
const _svgFont = () => (_rtlChart() ? "Cairo, Segoe UI, system-ui, sans-serif" : 'Segoe UI, system-ui, sans-serif');

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Values come from a different place in each collection mode, but
// both yield three numbers per task, so the chart works in both.
// What changes is the MEANING of a bar: one person's judgement in
// survey mode, a panel mean in workshop mode. The meta line under
// the title states which, so the reader is never left guessing.
function _readValues(taskKey) {
  const blank = { importance: null, frequency: null, difficulty: null, rated: false, n: null };

  if (appState.collectionMode === 'workshop') {
    const r = appState.workshopResults[taskKey];
    if (!r || !r.valid) return blank;
    const rc = r.responseCount || {};
    const counts = [rc.importance, rc.frequency, rc.difficulty].filter(v => typeof v === 'number' && v > 0);
    return {
      importance: r.meanImportance,
      frequency:  r.meanFrequency,
      difficulty: r.meanDifficulty,
      rated: true,
      n: counts.length ? counts : null
    };
  }

  const r = appState.verificationRatings[taskKey];
  if (!r || r.importance === null || r.frequency === null || r.difficulty === null) return blank;
  return {
    importance: r.importance,
    frequency:  r.frequency,
    difficulty: r.difficulty,
    rated: true,
    n: null
  };
}

// Read the duties straight out of the rendered accordion instead of
// rebuilding them from state. That guarantees the chart shows the
// same duties, the same tasks and the same DACUM ordering the user
// is looking at, with no second source of truth to drift out of sync.
function _collectDuties() {
  const cont = document.getElementById('verificationAccordionContainer');
  const out  = [];
  if (!cont) return out;

  cont.querySelectorAll('.duty-accordion').forEach(acc => {
    const header = acc.querySelector('.duty-accordion-header');
    const title  = (acc.querySelector('.duty-title')?.textContent || '').trim();
    const tasks  = [];

    acc.querySelectorAll('tbody tr[data-task-key]').forEach(tr => {
      const key   = tr.getAttribute('data-task-key');
      const label = (tr.querySelector('.task-text')?.textContent || '').trim();
      const dot   = label.indexOf('.');
      const code  = dot > -1 ? label.slice(0, dot).trim() : label;
      const text  = dot > -1 ? label.slice(dot + 1).trim() : '';
      tasks.push(Object.assign({ key, code, text }, _readValues(key)));
    });

    out.push({
      id: header ? header.getAttribute('data-duty') : '',
      title: title || _t('chartUntitledDuty'),
      tasks
    });
  });

  return out;
}

// Describes where the numbers came from. Respondent counts are read
// from the project's own responseCount data and omitted entirely when
// unavailable — never substituted with a placeholder figure.
function _sourceLine(duty) {
  if (appState.collectionMode !== 'workshop') {
    return _tf('chartSrcSurvey', { max: SCALE_MAX });
  }
  const all = [];
  duty.tasks.forEach(t => { if (t.rated && t.n) all.push.apply(all, t.n); });
  if (!all.length) {
    return _tf('chartSrcWorkshop', { max: SCALE_MAX });
  }
  const lo = Math.min.apply(null, all);
  const hi = Math.max.apply(null, all);
  const n  = lo === hi ? _tf(lo === 1 ? 'chartResp1' : 'chartRespN', { n: lo })
                       : _tf('chartRespRange', { lo, hi });
  return _tf('chartSrcWorkshopN', { n, max: SCALE_MAX });
}

// ── SVG chart builder ─────────────────────────────────────────

function _buildChartSVG(duty) {
  const keys  = VIEWS[_view].series;
  const tasks = duty.tasks;
  const rated = tasks.filter(t => t.rated);

  if (!tasks.length) {
    return '<p class="tvc-empty">' + _esc(_t('chartNoTasks')) + '</p>';
  }
  if (!rated.length) {
    return '<p class="tvc-empty">' + _esc(_t('chartNoRatings')) + '</p>';
  }

  const groupW = keys.length * BAR_W + (keys.length - 1) * BAR_GAP;
  const plotW  = tasks.length * groupW + (tasks.length - 1) * GROUP_GAP;
  const width  = PAD.left + plotW + PAD.right;
  const height = PAD.top + PLOT_H + PAD.bottom;
  const yFor   = v => PAD.top + PLOT_H - (v / SCALE_MAX) * PLOT_H;

  let svg = '<svg class="tvc-svg" viewBox="0 0 ' + width + ' ' + height + '" ' +
            'width="' + width + '" height="' + height + '" ' +
            'xmlns="http://www.w3.org/2000/svg" role="img" ' +
            'aria-label="' + _esc(_tf('chartPlotAria', { t: duty.title })) + '">';

  svg += '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="#ffffff"/>';

  // Gridlines: solid at whole numbers, hairline at halves. The halves
  // matter in workshop mode, where means land between integers.
  for (let v = 0; v <= SCALE_MAX * 2; v++) {
    const val   = v / 2;
    const y     = yFor(val);
    const major = v % 2 === 0;
    svg += '<line x1="' + PAD.left + '" y1="' + y + '" x2="' + (width - PAD.right) + '" y2="' + y +
           '" stroke="' + (major ? '#cbd5e1' : '#eef2f7') + '" stroke-width="1"/>';
    if (major) {
      svg += '<text x="' + (PAD.left - 10) + '" y="' + (y + 4) + '" text-anchor="end" ' +
             'font-family="' + _svgFont() + '" font-size="11" fill="#64748b">' + val + '</text>';
    }
  }

  // Duty average across every value actually drawn — a quick read of
  // which tasks sit above the duty's own centre of gravity. Anchored to
  // the right edge over an opaque plate: placed at the left it collided
  // with the first bar groups and became unreadable.
  let sum = 0, cnt = 0;
  rated.forEach(t => keys.forEach(k => { sum += t[k]; cnt++; }));
  const avg    = cnt ? sum / cnt : 0;
  const avgY   = yFor(avg);
  const avgTxt = _tf('chartDutyAverage', { v: avg.toFixed(2) });
  const plateW = avgTxt.length * (_rtlChart() ? 6.6 : 5.4) + 10;
  let avgMarkup = '';
  avgMarkup += '<line x1="' + PAD.left + '" y1="' + avgY + '" x2="' + (width - PAD.right) + '" y2="' + avgY +
         '" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 4"/>';
  avgMarkup += '<rect x="' + (width - PAD.right - plateW) + '" y="' + (avgY - 17) + '" width="' + plateW +
         '" height="14" rx="3" fill="#ffffff" fill-opacity="0.92"/>';
  avgMarkup += '<text x="' + (width - PAD.right - 5) + '" y="' + (avgY - 6.5) + '" text-anchor="end" ' +
         'font-family="' + _svgFont() + '" font-size="10" font-weight="700" ' +
         'fill="#dc2626">' + avgTxt + '</text>';

  // Bars
  const showValues = tasks.length <= 9;
  tasks.forEach((t, i) => {
    const gx = PAD.left + i * (groupW + GROUP_GAP);

    if (!t.rated) {
      svg += '<rect x="' + gx + '" y="' + PAD.top + '" width="' + groupW + '" height="' + PLOT_H +
             '" fill="#f8fafc"/>';
      svg += '<text x="' + (gx + groupW / 2) + '" y="' + (PAD.top + PLOT_H / 2) +
             '" text-anchor="middle" font-family="' + _svgFont() + '" ' +
             'font-size="10" fill="#94a3b8">' + _esc(_t('chartNotRated')) + '</text>';
    } else {
      keys.forEach((k, j) => {
        const s = SERIES[k];
        const x = gx + j * (BAR_W + BAR_GAP);
        const y = yFor(t[k]);
        const h = Math.max(PAD.top + PLOT_H - y, t[k] > 0 ? 1.5 : 0);
        svg += '<rect x="' + x + '" y="' + y + '" width="' + BAR_W + '" height="' + h +
               '" fill="' + s.color + '"><title>' + _esc(t.code) + ' — ' + _seriesLabel(s.key) + ': ' +
               t[k].toFixed(2) + '</title></rect>';
        if (showValues && t[k] > 0) {
          svg += '<text x="' + (x + BAR_W / 2) + '" y="' + (y - 4) + '" text-anchor="middle" ' +
                 'font-family="' + _svgFont() + '" font-size="9.5" ' +
                 'fill="#475569">' + t[k].toFixed(1) + '</text>';
        }
      });
    }

    svg += '<text x="' + (gx + groupW / 2) + '" y="' + (PAD.top + PLOT_H + 18) +
           '" text-anchor="middle" font-family="' + _svgFont() + '" ' +
           'font-size="11.5" font-weight="700" fill="#334155">' + _esc(t.code) + '</text>';
  });

  // Emitted after the bars: SVG has no z-index, so painting the
  // average line last is the only way to keep it and its label on top.
  svg += avgMarkup;

  // Axes
  svg += '<line x1="' + PAD.left + '" y1="' + (PAD.top + PLOT_H) + '" x2="' + (width - PAD.right) +
         '" y2="' + (PAD.top + PLOT_H) + '" stroke="#334155" stroke-width="1.5"/>';
  svg += '<line x1="' + PAD.left + '" y1="' + PAD.top + '" x2="' + PAD.left +
         '" y2="' + (PAD.top + PLOT_H) + '" stroke="#334155" stroke-width="1.5"/>';
  svg += '<text x="' + (PAD.left + plotW / 2) + '" y="' + (height - 12) + '" text-anchor="middle" ' +
         'font-family="' + _svgFont() + '" font-size="11" font-weight="600" ' +
         'fill="#64748b">' + _esc(_t('chartAxisTasks')) + '</text>';

  svg += '</svg>';
  return svg;
}

function _buildLegend() {
  return VIEWS[_view].series.map(k =>
    '<span class="tvc-legend-item"><i style="background:' + SERIES[k].color + '"></i>' +
    _esc(_seriesLabel(k)) + '</span>'
  ).join('') +
  '<span class="tvc-legend-item"><i class="tvc-legend-dash"></i>' + _esc(_t('chartLegendAvg')) + '</span>';
}

// Task statements are listed under the chart rather than crammed onto
// the x axis — the same split Norton uses, and the only way to keep
// long TVET task statements readable at any width.
function _buildTaskList(duty) {
  if (!duty.tasks.length) return '';
  return '<ol class="tvc-task-list">' + duty.tasks.map(t =>
    '<li><span class="tvc-task-code">' + _esc(t.code) + '</span>' +
    '<span class="tvc-task-text">' + _esc(t.text) + '</span>' +
    (t.rated ? '' : '<span class="tvc-task-flag">' + _esc(_t('chartNotRated')) + '</span>') + '</li>'
  ).join('') + '</ol>';
}

// ── Rendering into the open modal ─────────────────────────────

function _renderBody() {
  const duty = _duties[_dutyIdx];
  if (!duty) return;

  const label = document.getElementById('tvcDutyLabel');
  if (label) label.textContent = duty.title;

  const meta = document.getElementById('tvcSourceLine');
  if (meta) meta.textContent = _sourceLine(duty);

  const plot = document.getElementById('tvcPlot');
  if (plot) plot.innerHTML = _buildChartSVG(duty);

  const legend = document.getElementById('tvcLegend');
  if (legend) legend.innerHTML = _buildLegend();

  const list = document.getElementById('tvcTaskList');
  if (list) list.innerHTML = _buildTaskList(duty);

  const prev = document.getElementById('tvcPrevDuty');
  const next = document.getElementById('tvcNextDuty');
  if (prev) prev.disabled = _dutyIdx <= 0;
  if (next) next.disabled = _dutyIdx >= _duties.length - 1;

  const pos = document.getElementById('tvcDutyPos');
  if (pos) pos.textContent = (_dutyIdx + 1) + ' / ' + _duties.length;
}

// ── PNG export ────────────────────────────────────────────────
// The SVG carries no external CSS — every colour and font is an
// attribute on the element — so it serialises to a canvas cleanly
// without the styles dropping out.
function _exportPNG() {
  const svgEl = document.querySelector('#tvcPlot svg');
  const duty  = _duties[_dutyIdx];
  if (!svgEl || !duty) return;

  const btn = document.getElementById('tvcExportPng');
  const xml = new XMLSerializer().serializeToString(svgEl);
  const w   = parseFloat(svgEl.getAttribute('width'));
  const h   = parseFloat(svgEl.getAttribute('height'));
  const img = new Image();

  img.onload = function () {
    const scale  = 2;                       // 2x for a crisp print/paste
    const canvas = document.createElement('canvas');
    canvas.width  = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const a = document.createElement('a');
    a.download = duty.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 60) +
                 '_verification_chart.png';
    a.href = canvas.toDataURL('image/png');
    a.click();

    if (btn) { btn.textContent = '\u2713 ' + _t('chartSaved'); setTimeout(() => { btn.textContent = '\u2b07 ' + _t('chartExportPng'); }, 1800); }
  };
  img.onerror = function () {
    if (btn) { btn.textContent = '\u2715 ' + _t('chartExportFailed'); setTimeout(() => { btn.textContent = '\u2b07 ' + _t('chartExportPng'); }, 2200); }
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}

// ── Modal ─────────────────────────────────────────────────────

function _closeModal() {
  const m = document.getElementById('tvcModal');
  if (m) m.remove();
  document.removeEventListener('keydown', _onKeydown);
}

function _onKeydown(e) {
  if (e.key === 'Escape')     { _closeModal(); return; }
  if (e.key === 'ArrowRight') { _step(1); }
  if (e.key === 'ArrowLeft')  { _step(-1); }
}

function _step(delta) {
  const next = _dutyIdx + delta;
  if (next < 0 || next >= _duties.length) return;
  _dutyIdx = next;
  _renderBody();
}

export function openVerificationChart(startIndex) {
  _duties = _collectDuties();

  if (!_duties.length) {
    alert(_t('chartNoDuties'));
    return;
  }

  if (typeof startIndex === 'number' && startIndex >= 0 && startIndex < _duties.length) {
    _dutyIdx = startIndex;
  } else {
    // Global button: open on the first duty that actually has ratings,
    // so the chart is never blank on first sight when data exists.
    const firstRated = _duties.findIndex(d => d.tasks.some(t => t.rated));
    _dutyIdx = firstRated > -1 ? firstRated : 0;
  }

  _closeModal();

  const overlay = document.createElement('div');
  overlay.id = 'tvcModal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', _t('chartAriaLabel'));
  overlay.innerHTML =
    '<div class="tvc-dialog">' +
      '<div class="tvc-head">' +
        '<div class="tvc-head-text">' +
          '<p class="tvc-title">\ud83d\udcca ' + _esc(_t('chartTitle')) + '</p>' +
          '<p class="tvc-duty" id="tvcDutyLabel"></p>' +
        '</div>' +
        // Icons are inline SVG, not text glyphs. A glyph is positioned by
        // the font's own side bearings and baseline, which differ per
        // font and per character, so ✕ / ◀ / ▶ sat visibly off-centre
        // inside their buttons. An SVG path is centred by its viewBox,
        // which is identical everywhere and on every platform.
        '<button type="button" class="tvc-close" id="tvcClose" aria-label="' + _esc(_t('chartClose')) + '">' +
          '<svg viewBox="0 0 16 16" aria-hidden="true">' +
            '<path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" ' +
              'stroke-width="1.9" stroke-linecap="round" fill="none"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +

      '<div class="tvc-controls">' +
        '<div class="tvc-duty-nav">' +
          '<button type="button" id="tvcPrevDuty" aria-label="' + _esc(_t('chartPrevDuty')) + '">' +
            '<svg viewBox="0 0 16 16" aria-hidden="true">' +
              '<path d="M10.5 3 L5.5 8 L10.5 13" stroke="currentColor" stroke-width="2" ' +
                'stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
            '</svg>' +
          '</button>' +
          '<span id="tvcDutyPos"></span>' +
          '<button type="button" id="tvcNextDuty" aria-label="' + _esc(_t('chartNextDuty')) + '">' +
            '<svg viewBox="0 0 16 16" aria-hidden="true">' +
              '<path d="M5.5 3 L10.5 8 L5.5 13" stroke="currentColor" stroke-width="2" ' +
                'stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
        '<div class="tvc-view-toggle" role="radiogroup" aria-label="' + _esc(_t('chartViewLabel')) + '">' +
          '<label><input type="radio" name="tvcView" value="full"' +
            (_view === 'full' ? ' checked' : '') + '> ' + _esc(_t('chartViewFull')) + ' ' +
            '<small>' + _esc(_t('chartViewFullSub')) + '</small></label>' +
          '<label><input type="radio" name="tvcView" value="curriculum"' +
            (_view === 'curriculum' ? ' checked' : '') + '> ' + _esc(_t('chartViewCurriculum')) + ' ' +
            '<small>' + _esc(_t('chartViewCurriculumSub')) + '</small></label>' +
        '</div>' +
      '</div>' +

      '<p class="tvc-source" id="tvcSourceLine"></p>' +
      '<p class="tvc-note">' + _esc(_t('chartViewNote')) + '</p>' +

      '<div class="tvc-legend" id="tvcLegend"></div>' +
      '<div class="tvc-plot-scroll"><div id="tvcPlot"></div></div>' +

      '<p class="tvc-list-title">' + _esc(_t('chartTaskStatements')) + '</p>' +
      '<div id="tvcTaskList"></div>' +

      '<div class="tvc-foot">' +
        '<button type="button" class="tvc-btn-ghost" id="tvcCloseFoot">' + _esc(_t('chartCloseBtn')) + '</button>' +
        '<button type="button" class="tvc-btn-primary" id="tvcExportPng">\u2b07 ' + _esc(_t('chartExportPng')) + '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) _closeModal(); });
  document.getElementById('tvcClose').addEventListener('click', _closeModal);
  document.getElementById('tvcCloseFoot').addEventListener('click', _closeModal);
  document.getElementById('tvcPrevDuty').addEventListener('click', () => _step(-1));
  document.getElementById('tvcNextDuty').addEventListener('click', () => _step(1));
  document.getElementById('tvcExportPng').addEventListener('click', _exportPNG);
  overlay.querySelectorAll('input[name="tvcView"]').forEach(r => {
    r.addEventListener('change', function () {
      if (this.checked) { _view = this.value; _renderBody(); }
    });
  });
  document.addEventListener('keydown', _onKeydown);

  _renderBody();
}

// ── Wiring ────────────────────────────────────────────────────
// One delegated listener on the accordion container, which is a
// permanent element in index.html. Its children are rebuilt every
// time the mode changes, so listeners bound to the per-duty buttons
// themselves would be lost on each re-render.
export function initVerificationCharts() {
  const cont = document.getElementById('verificationAccordionContainer');
  if (cont) {
    // Capture phase, not bubble. The chart button sits INSIDE
    // .duty-accordion-header, which carries its own click handler that
    // expands/collapses the duty (attachAccordionListeners in tasks.js).
    // On the bubble phase that handler would already have run by the
    // time this one fires, so the accordion would toggle on every chart
    // click. Capturing on the container lets this run first and stop
    // the event before it ever reaches the header.
    cont.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action="show-duty-chart"]');
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      openVerificationChart(parseInt(btn.getAttribute('data-duty-index'), 10));
    }, true);
  }

  const global = document.getElementById('btnTVChart');
  if (global) global.addEventListener('click', () => openVerificationChart());
}
