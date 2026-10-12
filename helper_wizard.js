// ============================================================
// /helper_wizard.js — 3.99.0
// "Helper": a guided, step-by-step walk through the tabs in the
// order the DACUM → Standard → Curriculum process follows.
//
// • Opened from the "Start the Helper" button in the Help Center
//   ([data-helper-open]).
// • One step per tab, drawn as a DACUM chart row: a blue duty-style
//   card (step number, tab) beside a yellow task-style card (what to
//   do, live status, "Go to this tab").
// • The explanation under the card is the tab's own "?" guide
//   (events.js getTabHelpGuides / module_curriculum getCurriculumGuide),
//   so the Helper never drifts from the help the tab shows.
// • Status is read live from appState — nothing is stored by the
//   Helper except the last step viewed, per project.
// ============================================================

import { appState }               from './state.js';
import { getTabHelpGuides }       from './events.js';
import { getCurriculumGuide,
         isModuleCurriculumEmpty } from './module_curriculum.js';
import { hasTaskSelection }       from './task_selection.js';
import { countTaskAnalysisRecords } from './task_analysis.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k) : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _rtl = () => !!(window.i18n && window.i18n.isRTL());

const OVERLAY_ID = 'helperWizard';
const CHIP_ID    = 'helperResumeChip';
const STORE_KEY  = 'dacum_helper_step';

let _idx = 0;
let _dir = 1;            // +1 forward, -1 back — drives the slide direction
let _keyHandler = null;
let _lastFocus = null;

// ── Status helpers ───────────────────────────────────────────
const _val = (id) => {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
};

function _duties() {
  const list = appState.dutiesData || [];
  let tasks = 0, dutiesWithTitle = 0;
  list.forEach(d => {
    if (String(d.title || '').trim()) dutiesWithTitle++;
    (d.tasks || []).forEach(t => { if (String(t.text || '').trim()) tasks++; });
  });
  return { duties: dutiesWithTitle, tasks };
}

/* The Skills Level Matrix is seeded with default rows, so it says
   nothing about whether the panel has worked on this tab. Only the
   free-text lists (fixed and custom sections) count. */
const _ADD_INFO_IDS = ['knowledgeInput', 'skillsInput', 'behaviorsInput', 'toolsInput',
                       'trendsInput', 'acronymsInput', 'careerPathInput'];
function _addInfoHasContent() {
  if (_ADD_INFO_IDS.some(id => _val(id))) return true;
  const tab = document.getElementById('additional-info-tab');
  if (!tab) return false;
  return [...tab.querySelectorAll('textarea')]
    .some(el => !_ADD_INFO_IDS.includes(el.id) &&
                !/(^|\s)(mx-|sl-)/.test(el.className) &&
                String(el.value || '').trim());
}

const S = (state, metric) => ({ state, metric });

const STEPS = [
  {
    tab: 'info-tab', icon: '📋', titleKey: 'tabChartInfo', sumKey: 'hcStep1', tipKey: 'hwTip1',
    guides: () => getTabHelpGuides(['jobTitle', 'team']),
    target: () => (!_val('occupationTitle') ? 'occupationTitle' : (!_val('jobTitle') ? 'jobTitle' : 'occupationTitle')),
    status() {
      const occ = _val('occupationTitle'), job = _val('jobTitle');
      if (occ && job) return S('done', _t('hwMInfoOk'));
      const miss = [];
      if (!occ) miss.push(_t('labelOccupation').replace(/[:：]\s*$/, ''));
      if (!job) miss.push(_t('labelJobTitle').replace(/[:：]\s*$/, ''));
      return S(occ || job ? 'partial' : 'todo', _tf('hwMInfoMissing', { fields: miss.join(' · ') }));
    },
  },
  {
    tab: 'duties-tab', icon: '✅', titleKey: 'tabDuties', sumKey: 'hcStep2', tipKey: 'hwTip2',
    guides: () => getTabHelpGuides(['duties']),
    target: () => 'aiGenerateBtn',
    status() {
      const { duties, tasks } = _duties();
      if (!duties && !tasks) return S('todo', _t('hwMNone'));
      return S(duties && tasks ? 'done' : 'partial', _tf('hwMDuties', { d: duties, t: tasks }));
    },
  },
  {
    tab: 'additional-info-tab', icon: '📚', titleKey: 'tabAdditionalInfo', sumKey: 'hcStep3', tipKey: 'hwTip3',
    guides: () => getTabHelpGuides(['addInfo']),
    status() {
      const has = _addInfoHasContent();
      return has ? S('done', _t('hwMAddInfo')) : S('todo', _t('hwMNone'));
    },
  },
  {
    tab: 'verification-tab', icon: '🎯', titleKey: 'tabVerification', sumKey: 'hcStep4', tipKey: 'hwTip4',
    optional: true,
    guides: () => getTabHelpGuides(['verification']),
    status() {
      const rated = Object.keys(appState.verificationRatings || {}).length;
      const ws = Object.keys(appState.workshopResults || {}).length || appState.lwAggregatedResults;
      if (rated) return S('done', _tf('hwMRated', { n: rated }));
      if (ws)    return S('done', _t('hwMWorkshop'));
      return S('todo', _t('hwMNone'));
    },
  },
  {
    tab: 'task-selection-tab', icon: '☑️', titleKey: 'tabTaskSelection', sumKey: 'hwSumTaskSel', tipKey: 'hwTip5',
    optional: true,
    guides: () => [{
      icon: '☑️', title: _t('tselTitle'),
      html: ['tselIntro', 'tselPerfHint', 'tselFoot']
        .map(k => '<p style="margin:0 0 10px;font-size:0.88em;color:#475569;line-height:1.65;">' + _esc(_t(k)) + '</p>')
        .join(''),
    }],
    status() {
      return hasTaskSelection() ? S('done', _t('hwMSel')) : S('todo', _t('hwMSelAll'));
    },
  },
  {
    tab: 'task-analysis-tab', icon: '🔬', titleKey: 'tabTaskAnalysis', sumKey: 'hcStep5', tipKey: 'hwTip6',
    optional: true,
    guides: () => getTabHelpGuides(['taskAnalysis']),
    status() {
      const n = countTaskAnalysisRecords();
      if (!n) return S('todo', _t('hwMNone'));
      const total = _duties().tasks;
      return S(total && n >= total ? 'done' : 'partial', _tf('hwMTA', { n }));
    },
  },
  {
    tab: 'clustering-tab', icon: '🧩', titleKey: 'tabClustering', sumKey: 'hcStep6', tipKey: 'hwTip7',
    guides: () => getTabHelpGuides(['clustering', 'clusterNaming', 'pcRange']),
    status() {
      const cl = (appState.clusteringData && appState.clusteringData.clusters) || [];
      if (!cl.length) return S('todo', _t('hwMNone'));
      const c = cl.filter(x => (x.performanceCriteria || []).length).length;
      return S(c === cl.length ? 'done' : 'partial', _tf('hwMClusters', { n: cl.length, c }));
    },
  },
  {
    tab: 'occupational-standard-tab', icon: '📜', titleKey: 'tabOccStandard', sumKey: 'hcStep7', tipKey: 'hwTip8',
    guides: () => getTabHelpGuides(['os']),
    status() {
      const cl = (appState.clusteringData && appState.clusteringData.clusters) || [];
      if (!cl.length) return S('todo', _t('hwMNone'));
      const c = cl.filter(x => (x.performanceCriteria || []).length).length;
      return S(c === cl.length && _val('occupationTitle') ? 'done' : 'partial', _tf('hwMOS', { n: cl.length, c }));
    },
  },
  {
    tab: 'learning-outcomes-tab', icon: '🎓', titleKey: 'tabLearningOutcomes', sumKey: 'hcStep8', tipKey: 'hwTip9',
    guides: () => getTabHelpGuides(['lo']),
    status() {
      const n = ((appState.learningOutcomesData || {}).outcomes || []).length;
      return n ? S('done', _tf('hwMLO', { n })) : S('todo', _t('hwMNone'));
    },
  },
  {
    tab: 'module-mapping-tab', icon: '📦', titleKey: 'tabModuleMapping', sumKey: 'hcStep9', tipKey: 'hwTip10',
    guides: () => getTabHelpGuides(['mm']),
    status() {
      const n = ((appState.moduleMappingData || {}).modules || []).length;
      return n ? S('done', _tf('hwMMods', { n })) : S('todo', _t('hwMNone'));
    },
  },
  {
    tab: 'module-curriculum-tab', icon: '📘', titleKey: 'tabModuleCurriculum', sumKey: 'hcStep10', tipKey: 'hwTip11',
    guides: () => { try { return [getCurriculumGuide()]; } catch (_) { return []; } },
    status() {
      let empty = true;
      try { empty = isModuleCurriculumEmpty(); } catch (_) {}
      return empty ? S('todo', _t('hwMNone')) : S('done', _t('hwMCur'));
    },
  },
  {
    tab: null, icon: '🏁', titleKey: 'hwFinishTitle', sumKey: 'hcStep11', tipKey: 'hwTip12',
    finish: true,
    status: () => S('none', ''),
  },
];

const TOTAL = STEPS.length;
const WORK_STEPS = STEPS.filter(s => !s.finish);

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _safeStatus(step) {
  try { return step.status(); } catch (_) { return S('todo', ''); }
}

// ── Persistence (last step viewed, per project) ──────────────
function _storeKey() {
  let pid = 'default';
  try { pid = localStorage.getItem('dacum_active_project') || 'default'; } catch (_) {}
  return STORE_KEY + ':' + pid;
}
function _saveIdx() { try { localStorage.setItem(_storeKey(), String(_idx)); } catch (_) {} }
function _loadIdx() {
  try {
    const v = localStorage.getItem(_storeKey());
    if (v !== null && !isNaN(+v)) return Math.min(Math.max(0, +v), TOTAL - 1);
  } catch (_) {}
  // Never opened for this project: start at the first required step not done.
  const i = STEPS.findIndex(s => !s.finish && !s.optional && _safeStatus(s).state !== 'done');
  return i === -1 ? TOTAL - 1 : i;
}

// ── Styles (injected once; the app's stylesheets stay untouched) ──
function _injectCSS() {
  if (document.getElementById('helperWizardStyles')) return;
  const st = document.createElement('style');
  st.id = 'helperWizardStyles';
  st.textContent = `
#${OVERLAY_ID}{position:fixed;inset:0;z-index:999990;display:flex;align-items:center;justify-content:center;
  padding:18px;background:rgba(15,23,42,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
  animation:hwFade .2s ease;font-family:inherit}
#${OVERLAY_ID} *{box-sizing:border-box}
.hw-box{background:#f8fafc;border-radius:20px;width:100%;max-width:820px;max-height:92vh;display:flex;
  flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4);animation:hwPop .25s ease}
.hw-head{background:linear-gradient(135deg,#0f172a 0%,#312e81 55%,#4338ca 100%);color:#fff;padding:16px 20px 14px;flex-shrink:0}
.hw-head-row{display:flex;align-items:center;gap:12px}
.hw-logo{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.14);display:flex;align-items:center;
  justify-content:center;font-size:1.45em;flex-shrink:0}
.hw-title{margin:0;font-size:1.08em;font-weight:800;line-height:1.3}
.hw-sub{margin:2px 0 0;font-size:.8em;color:#c7d2fe;line-height:1.45}
.hw-x{min-height:34px!important;max-height:34px;min-width:34px!important;max-width:34px;padding:0!important;margin-inline-start:auto;background:rgba(255,255,255,.12);border:none;color:#fff;width:34px;height:34px;
  border-radius:10px;font-size:1.05em;cursor:pointer;flex-shrink:0;transition:background .15s}
/* Close buttons: the icon is an SVG centred by flex — the ✕ glyph's own
   side bearings, plus the app's RTL button spacing, pushed it off-centre. */
#${OVERLAY_ID} .hw-x,#${CHIP_ID} .hw-chip-x{display:inline-flex!important;align-items:center!important;justify-content:center!important;
  padding:0!important;gap:0!important;line-height:1!important;text-indent:0!important;letter-spacing:0!important;box-sizing:border-box!important}
#${OVERLAY_ID} .hw-x{width:34px!important;height:34px!important;flex:0 0 34px}
#${OVERLAY_ID} .hw-x svg,#${CHIP_ID} .hw-chip-x svg{margin:0!important;flex:none}
.hw-x:hover{background:rgba(255,255,255,.25)}
.hw-prog{display:flex;align-items:center;gap:10px;margin-top:12px}
.hw-bar{flex:1;height:6px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden}
.hw-bar>span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#34d399,#10b981);
  transition:width .45s ease}
.hw-prog-txt{font-size:.76em;color:#e0e7ff;white-space:nowrap;font-weight:600}
.hw-steps{display:flex;gap:0;overflow-x:auto;padding:12px 4px 4px;scrollbar-width:thin;scroll-behavior:smooth}
.hw-dot-wrap{display:flex;align-items:center;flex:1 0 auto}
.hw-dot-wrap:last-child .hw-line{display:none}
/* Fixed box on every side: dacum-responsive.css gives every <button>
   min-height:44px, which stretched the 30px circles into ovals. */
#${OVERLAY_ID} .hw-dot{width:30px!important;height:30px!important;min-width:30px!important;max-width:30px!important;
  min-height:30px!important;max-height:30px!important;aspect-ratio:1/1;line-height:1;box-sizing:border-box!important;
  padding:0!important;margin:0!important}
.hw-dot{width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:transparent;
  color:#e0e7ff;font-size:.74em;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;
  flex-shrink:0;transition:transform .15s,background .2s,border-color .2s;font-family:inherit;padding:0}
.hw-dot:hover{transform:scale(1.12)}
.hw-dot.is-done{background:#10b981;border-color:#10b981;color:#fff}
.hw-dot.is-partial{border-color:#fbbf24;color:#fde68a}
.hw-dot.is-opt{border-style:dashed}
.hw-dot.is-current{background:#fff;border-color:#fff;color:#4338ca;box-shadow:0 0 0 4px rgba(165,180,252,.45);transform:scale(1.12)}
.hw-line{height:2px;min-width:10px;flex:1;background:rgba(255,255,255,.22);margin:0 2px}
.hw-line.is-done{background:#10b981}
.hw-body{flex:1;overflow-y:auto;padding:18px 20px 8px}
.hw-stage{animation:hwSlideF .32s ease}
.hw-stage.hw-back{animation:hwSlideB .32s ease}
.hw-badge{display:inline-flex;align-items:center;gap:8px;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;
  border-radius:99px;padding:5px 14px 5px 6px;font-size:.82em;font-weight:800;margin-bottom:12px}
.hw-badge b{background:#4338ca;color:#fff;border-radius:99px;min-width:24px;height:24px;display:inline-flex;
  align-items:center;justify-content:center;font-size:.92em;padding:0 6px}
.hw-opt-tag{font-weight:600;color:#64748b;background:#fff;border:1px dashed #94a3b8;border-radius:99px;padding:1px 8px;font-size:.88em}
.hw-row{display:flex;gap:12px;align-items:stretch}
.hw-duty{flex:0 0 200px;background:linear-gradient(145deg,#bfdbfe,#93c5fd);border:2px solid #60a5fa;border-radius:14px;
  padding:12px 14px;box-shadow:0 3px 10px rgba(96,165,250,.25);display:flex;flex-direction:column;gap:6px;position:relative}
.hw-duty-lbl{font-size:.7em;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#1e40af}
.hw-duty-ico{font-size:2em;line-height:1}
.hw-duty-name{font-size:1.02em;font-weight:800;color:#1e3a8a;line-height:1.35}
.hw-task{flex:1;min-width:0;background:linear-gradient(145deg,#fef9c3,#fef08a);border:2px solid #facc15;border-radius:14px;
  padding:12px 14px;box-shadow:0 3px 10px rgba(250,204,21,.22);display:flex;flex-direction:column;gap:10px}
.hw-task-lbl{font-size:.7em;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#a16207}
.hw-sum{font-size:.92em;line-height:1.65;color:#422006}
.hw-sum strong{color:#713f12}
.hw-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.8em}
.hw-chip{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:3px 10px;font-weight:800;white-space:nowrap}
.hw-chip.done{background:#d1fae5;color:#065f46}
.hw-chip.partial{background:#fef3c7;color:#92400e;border:1px solid #fcd34d}
.hw-chip.todo{background:#fff;color:#64748b;border:1px solid #e2e8f0}
.hw-metric{color:#713f12}
.hw-go{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;background:#1e3a8a;color:#fff;border:none;
  border-radius:10px;padding:8px 14px;font-weight:700;font-size:.85em;cursor:pointer;font-family:inherit;
  transition:transform .15s,box-shadow .15s,background .15s;margin-top:auto}
.hw-go:hover{background:#1e40af;transform:translateY(-1px);box-shadow:0 6px 16px rgba(30,58,138,.3)}
.hw-tip{display:flex;gap:10px;background:#fff;border:1px solid #e2e8f0;border-inline-start:4px solid #10b981;
  border-radius:12px;padding:11px 14px;margin:14px 0 4px;font-size:.86em;line-height:1.6;color:#334155}
.hw-tip-ico{font-size:1.2em;line-height:1.3}
.hw-tip strong{display:block;color:#065f46;font-size:.92em;margin-bottom:2px}
.hw-explain-h{display:flex;align-items:center;gap:8px;margin:18px 0 10px;font-size:.84em;font-weight:800;color:#475569;
  text-transform:uppercase;letter-spacing:.05em}
.hw-explain-h::after{content:"";flex:1;height:1px;background:#e2e8f0}
.hw-guide{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;overflow:hidden}
.hw-guide>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:11px 14px;
  font-weight:700;font-size:.9em;color:#3730a3;background:linear-gradient(135deg,#eef2ff,#f5f3ff)}
.hw-guide>summary::-webkit-details-marker{display:none}
.hw-guide>summary::after{content:"▾";margin-inline-start:auto;transition:transform .2s;color:#6366f1}
.hw-guide:not([open])>summary::after{transform:rotate(-90deg)}
html[dir="rtl"] .hw-guide:not([open])>summary::after,#${OVERLAY_ID}[dir="rtl"] .hw-guide:not([open])>summary::after{transform:rotate(90deg)}
.hw-guide-body{padding:12px 16px 4px}
.hw-sumlist{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.hw-sumlist li{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;
  padding:8px 10px;font-size:.82em;cursor:pointer;transition:border-color .15s,box-shadow .15s}
.hw-sumlist li:hover{border-color:#a5b4fc;box-shadow:0 2px 8px rgba(99,102,241,.15)}
.hw-sumlist .hw-sl-name{flex:1;min-width:0;font-weight:700;color:#1e293b}
.hw-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.hw-act{display:inline-flex;align-items:center;gap:6px;border:none;border-radius:10px;padding:9px 14px;font-weight:700;
  font-size:.85em;cursor:pointer;font-family:inherit;color:#fff;transition:transform .15s,filter .15s}
.hw-act:hover{transform:translateY(-1px);filter:brightness(1.07)}
.hw-act.indigo{background:linear-gradient(135deg,#6366f1,#4338ca)}
.hw-act.emerald{background:linear-gradient(135deg,#10b981,#047857)}
.hw-act.red{background:linear-gradient(135deg,#ef4444,#b91c1c)}
.hw-foot{display:flex;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid #e2e8f0;background:#fff;flex-shrink:0}
.hw-foot-mid{flex:1;text-align:center;font-size:.74em;color:#94a3b8;line-height:1.4}
.hw-nav{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:10px 20px;font-weight:800;font-size:.9em;
  cursor:pointer;font-family:inherit;transition:transform .15s,box-shadow .15s,background .15s;min-width:110px;justify-content:center}
.hw-prev{background:#fff;color:#334155;border:1.5px solid #cbd5e1}
.hw-prev:hover:not(:disabled){background:#f1f5f9}
.hw-prev:disabled{opacity:.4;cursor:default}
.hw-next{margin-inline-start:auto;background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;border:none;box-shadow:0 6px 16px rgba(67,56,202,.32)}
.hw-next:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(67,56,202,.4)}
.hw-next.is-finish{background:linear-gradient(135deg,#10b981,#047857);box-shadow:0 6px 16px rgba(4,120,87,.3)}
.hw-arrow{display:inline-block}
#${OVERLAY_ID}[dir="rtl"] .hw-arrow{transform:scaleX(-1)}
#${CHIP_ID}{position:fixed;bottom:84px;inset-inline-end:22px;z-index:99990;display:flex;align-items:center;gap:2px;
  background:linear-gradient(135deg,#312e81,#4338ca);color:#fff;border-radius:99px;box-shadow:0 10px 26px rgba(49,46,129,.4);
  animation:hwChipIn .35s ease;font-family:inherit}
#${CHIP_ID} button{background:none;border:none;color:#fff;cursor:pointer;font-family:inherit}
#${CHIP_ID} .hw-chip-main{display:flex;align-items:center;gap:8px;padding:10px 6px 10px 16px;font-weight:800;font-size:.86em}
#${CHIP_ID}[dir="rtl"] .hw-chip-main{padding:10px 16px 10px 6px}
#${CHIP_ID} .hw-chip-x{width:30px;height:30px;min-height:30px!important;max-height:30px;min-width:30px;padding:0!important;margin-inline-end:6px;border-radius:50%;font-size:.85em;opacity:.8}
#${CHIP_ID} .hw-chip-x:hover{background:rgba(255,255,255,.18);opacity:1}
#${CHIP_ID} .hw-chip-pulse{width:9px;height:9px;border-radius:50%;background:#34d399;box-shadow:0 0 0 0 rgba(52,211,153,.7);
  animation:hwPulse 1.8s infinite}
.hw-spot{position:relative;z-index:5;animation:hwSpot 1s ease 3;border-radius:10px}
.tab.hw-spot-tab{animation:hwSpot 1s ease 3}
@keyframes hwFade{from{opacity:0}to{opacity:1}}
@keyframes hwPop{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
@keyframes hwSlideF{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
@keyframes hwSlideB{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
#${OVERLAY_ID}[dir="rtl"] .hw-stage{animation-name:hwSlideB}
#${OVERLAY_ID}[dir="rtl"] .hw-stage.hw-back{animation-name:hwSlideF}
@keyframes hwChipIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes hwPulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.7)}70%{box-shadow:0 0 0 9px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
@keyframes hwSpot{0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0)}50%{box-shadow:0 0 0 6px rgba(99,102,241,.55)}}
@media (max-width:640px){
  #${OVERLAY_ID}{padding:0;align-items:stretch}
  .hw-box{max-height:100vh;height:100%;border-radius:0}
  .hw-row{flex-direction:column}
  .hw-duty{flex:none;flex-direction:row;align-items:center;gap:12px}
  .hw-duty-ico{font-size:1.6em}
  .hw-body{padding:14px 14px 6px}
  .hw-foot{padding:10px 12px}
  .hw-nav{min-width:0;padding:10px 14px}
  .hw-foot-mid{display:none}
  .hw-sub{display:none}
}
@media (prefers-reduced-motion:reduce){
  #${OVERLAY_ID},.hw-box,.hw-stage,#${CHIP_ID},.hw-spot,.tab.hw-spot-tab{animation:none!important}
}`;
  document.head.appendChild(st);
}

// ── Rendering ────────────────────────────────────────────────
function _statusChip(state) {
  if (state === 'done')    return `<span class="hw-chip done">✓ ${_esc(_t('hwDone'))}</span>`;
  if (state === 'partial') return `<span class="hw-chip partial">◐ ${_esc(_t('hwPartial'))}</span>`;
  if (state === 'todo')    return `<span class="hw-chip todo">○ ${_esc(_t('hwTodo'))}</span>`;
  return '';
}

/* Tab names carry a leading emoji in some languages — drop it, the
   card already shows the step's icon. */
function _stepName(step) {
  return String(_t(step.titleKey)).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function _renderHeader(statuses) {
  const done = WORK_STEPS.filter(s => statuses[STEPS.indexOf(s)].state === 'done').length;
  const pct = Math.round(done / WORK_STEPS.length * 100);
  const dots = STEPS.map((s, i) => {
    const st = statuses[i].state;
    const cls = ['hw-dot',
      i === _idx ? 'is-current' : '',
      st === 'done' ? 'is-done' : '',
      st === 'partial' ? 'is-partial' : '',
      s.optional ? 'is-opt' : ''].filter(Boolean).join(' ');
    const label = s.finish ? '🏁' : (st === 'done' && i !== _idx ? '✓' : String(i + 1));
    const tip = _tf('hwJump', { n: i + 1, name: _stepName(s) });
    const lineDone = st === 'done' ? ' is-done' : '';
    return `<div class="hw-dot-wrap"><button type="button" class="${cls}" data-hw-jump="${i}"
      title="${_esc(tip)}" aria-label="${_esc(tip)}"${i === _idx ? ' aria-current="step"' : ''}>${label}</button>
      <span class="hw-line${lineDone}"></span></div>`;
  }).join('');
  return `
    <div class="hw-head-row">
      <div class="hw-logo" aria-hidden="true">🧭</div>
      <div>
        <p class="hw-title" id="hwTitle">${_esc(_t('hwTitle'))}</p>
        <p class="hw-sub">${_esc(_t('hwSubtitle'))}</p>
      </div>
      <button type="button" class="hw-x" data-hw-close title="${_esc(_t('hwClose'))}" aria-label="${_esc(_t('hwClose'))}"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" style="display:block"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="hw-prog">
      <div class="hw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <span class="hw-prog-txt">${_esc(_tf('hwProgress', { done, total: WORK_STEPS.length }))}</span>
    </div>
    <div class="hw-steps" role="list">${dots}</div>`;
}

function _renderGuides(step) {
  let guides = [];
  try { guides = (step.guides && step.guides()) || []; } catch (_) { guides = []; }
  if (!guides.length) return '';
  return `<div class="hw-explain-h">📖 ${_esc(_t('hwGuide'))}</div>` +
    guides.map((g, i) => `
      <details class="hw-guide"${i === 0 ? ' open' : ''}>
        <summary><span aria-hidden="true">${g.icon || '❓'}</span><span>${g.title || ''}</span></summary>
        <div class="hw-guide-body">${g.html || ''}</div>
      </details>`).join('');
}

function _renderFinish(statuses) {
  const items = WORK_STEPS.map(s => {
    const i = STEPS.indexOf(s);
    return `<li data-hw-jump="${i}" title="${_esc(_tf('hwJump', { n: i + 1, name: _stepName(s) }))}">
      <span aria-hidden="true">${s.icon}</span>
      <span class="hw-sl-name">${_esc(_stepName(s))}</span>
      ${_statusChip(statuses[i].state)}</li>`;
  }).join('');
  return `
    <div class="hw-explain-h">📊 ${_esc(_t('hwFinishLead'))}</div>
    <ul class="hw-sumlist">${items}</ul>
    <div class="hw-explain-h">💾 ${_esc(_t('hwFinishActions'))}</div>
    <div class="hw-actions">
      <button type="button" class="hw-act indigo"  data-hw-click="btnSaveJSON">💾 ${_esc(_t('hwSaveJson'))}</button>
      <button type="button" class="hw-act red"     data-hw-click="btnExportPDF">📄 ${_esc(_t('hwExportPdf'))}</button>
      <button type="button" class="hw-act emerald" data-hw-click="btnExportWord">📝 ${_esc(_t('hwExportWord'))}</button>
    </div>`;
}

function _renderStage(step, status) {
  const n = STEPS.indexOf(step) + 1;
  const ord = _t('hwOrd' + n);
  return `
    <div class="hw-badge"><b>${n}</b>${_esc(ord)}
      ${step.optional ? `<span class="hw-opt-tag">${_esc(_t('hwOptional'))}</span>` : ''}</div>
    <div class="hw-row">
      <div class="hw-duty">
        <span class="hw-duty-ico" aria-hidden="true">${step.icon}</span>
        <div>
          <div class="hw-duty-lbl">${_esc(_tf('hwStepOf', { n, total: TOTAL }))}</div>
          <div class="hw-duty-name">${_esc(_stepName(step))}</div>
        </div>
      </div>
      <div class="hw-task">
        <div class="hw-task-lbl">${_esc(_t('hwWhatToDo'))}</div>
        <div class="hw-sum">${_t(step.sumKey)}</div>
        ${step.finish ? '' : `<div class="hw-status">${_statusChip(status.state)}
          ${status.metric ? `<span class="hw-metric">${_esc(status.metric)}</span>` : ''}</div>`}
        ${step.tab ? `<button type="button" class="hw-go" data-hw-go>↗ ${_esc(_t('hwGoTo'))}</button>` : ''}
      </div>
    </div>
    <div class="hw-tip"><span class="hw-tip-ico" aria-hidden="true">💡</span>
      <div><strong>${_esc(_t('hwTipLabel'))}</strong>${_esc(_t(step.tipKey))}</div></div>
    ${step.finish ? '' : _renderGuides(step)}`;
}

function _render(animate) {
  const ov = document.getElementById(OVERLAY_ID);
  if (!ov) return;
  ov.setAttribute('dir', _rtl() ? 'rtl' : 'ltr');
  const statuses = STEPS.map(_safeStatus);
  const step = STEPS[_idx];

  ov.querySelector('.hw-head').innerHTML = _renderHeader(statuses);

  const body = ov.querySelector('.hw-body');
  body.innerHTML = `<div class="hw-stage${_dir < 0 ? ' hw-back' : ''}"${animate ? '' : ' style="animation:none"'}>` +
    _renderStage(step, statuses[_idx]) + (step.finish ? _renderFinish(statuses) : '') + '</div>';
  body.scrollTop = 0;

  const last = _idx === TOTAL - 1;
  const prev = ov.querySelector('[data-hw-prev]');
  const next = ov.querySelector('[data-hw-next]');
  prev.disabled = _idx === 0;
  prev.innerHTML = `<span class="hw-arrow" aria-hidden="true">←</span> ${_esc(_t('hwBack'))}`;
  next.classList.toggle('is-finish', last);
  next.innerHTML = last
    ? `✓ ${_esc(_t('hwFinish'))}`
    : `${_esc(_t('hwNext'))} <span class="hw-arrow" aria-hidden="true">→</span>`;
  ov.querySelector('.hw-foot-mid').textContent = _t('hwKeys');

  // Keep the current dot in view on narrow screens.
  const cur = ov.querySelector('.hw-dot.is-current');
  if (cur && cur.scrollIntoView) {
    try { cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: animate ? 'smooth' : 'auto' }); } catch (_) {}
  }
  _saveIdx();
}

function _go(i) {
  if (i < 0 || i >= TOTAL || i === _idx) return;
  _dir = i > _idx ? 1 : -1;
  _idx = i;
  _render(true);
}

// ── Open / close ─────────────────────────────────────────────
export function openHelperWizard(startAt) {
  _injectCSS();
  _hideChip();
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  _idx = (typeof startAt === 'number') ? Math.min(Math.max(0, startAt), TOTAL - 1) : _loadIdx();
  _dir = 1;
  _lastFocus = document.activeElement;

  const ov = document.createElement('div');
  ov.id = OVERLAY_ID;
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-labelledby', 'hwTitle');
  ov.innerHTML = `
    <div class="hw-box">
      <div class="hw-head"></div>
      <div class="hw-body" aria-live="polite"></div>
      <div class="hw-foot">
        <button type="button" class="hw-nav hw-prev" data-hw-prev></button>
        <div class="hw-foot-mid"></div>
        <button type="button" class="hw-nav hw-next" data-hw-next></button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  _render(false);

  ov.addEventListener('click', _onClick);
  _keyHandler = _onKey;
  document.addEventListener('keydown', _keyHandler, true);
  const nx = ov.querySelector('[data-hw-next]');
  if (nx) nx.focus();
}

export function closeHelperWizard({ restoreFocus = true } = {}) {
  const ov = document.getElementById(OVERLAY_ID);
  if (ov) ov.remove();
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler, true); _keyHandler = null; }
  if (restoreFocus && _lastFocus && _lastFocus.focus) { try { _lastFocus.focus(); } catch (_) {} }
}

function _onKey(e) {
  if (!document.getElementById(OVERLAY_ID)) return;
  // Another dialog opened on top (e.g. an export) keeps its own keys.
  const topDialog = [...document.querySelectorAll('[role="dialog"]')].pop();
  if (topDialog && topDialog.id !== OVERLAY_ID) return;
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeHelperWizard(); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const forward = (e.key === 'ArrowRight') !== _rtl();
    _go(_idx + (forward ? 1 : -1));
  }
}

function _onClick(e) {
  const ov = document.getElementById(OVERLAY_ID);
  if (e.target === ov) { closeHelperWizard(); return; }
  const t = e.target.closest('button, [data-hw-jump]');
  if (!t) return;
  if (t.hasAttribute('data-hw-close')) { closeHelperWizard(); return; }
  if (t.hasAttribute('data-hw-prev'))  { _go(_idx - 1); return; }
  if (t.hasAttribute('data-hw-next')) {
    if (_idx === TOTAL - 1) closeHelperWizard();
    else _go(_idx + 1);
    return;
  }
  if (t.hasAttribute('data-hw-jump')) { _go(+t.getAttribute('data-hw-jump')); return; }
  if (t.hasAttribute('data-hw-go'))   { _goToTab(STEPS[_idx]); return; }
  if (t.hasAttribute('data-hw-click')) {
    const btn = document.getElementById(t.getAttribute('data-hw-click'));
    closeHelperWizard({ restoreFocus: false });
    if (btn) btn.click();
    _showChip();
  }
}

// ── "Go to this tab": navigate, spotlight, leave a way back ──
function _goToTab(step) {
  if (!step || !step.tab) return;
  closeHelperWizard({ restoreFocus: false });
  if (typeof window.switchTab === 'function') window.switchTab(step.tab);
  else {
    const tabBtn = document.querySelector(`.tab[data-tab="${step.tab}"]`);
    if (tabBtn) tabBtn.click();
  }

  const tabBtn = document.querySelector(`.tab[data-tab="${step.tab}"]`);
  if (tabBtn) {
    try { tabBtn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (_) {}
    _spot(tabBtn, 'hw-spot-tab');
  }

  const pane = document.getElementById(step.tab);
  let target = null;
  const tid = step.target && step.target();
  if (tid) target = document.getElementById(tid);
  if (!target && pane) target = pane.querySelector('.tab-title-with-help, .tab-header-row, h2');

  setTimeout(() => {
    if (target && target.offsetParent !== null) {
      try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      _spot(target, 'hw-spot');
      if (/INPUT|TEXTAREA/.test(target.tagName) && !String(target.value || '').trim()) {
        try { target.focus({ preventScroll: true }); } catch (_) {}
      }
    } else if (pane) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, 120);

  _showChip();
}

function _spot(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;            // restart the animation if re-applied
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 3200);
}

// ── Resume chip ──────────────────────────────────────────────
function _showChip() {
  _injectCSS();
  _hideChip();
  const chip = document.createElement('div');
  chip.id = CHIP_ID;
  chip.setAttribute('dir', _rtl() ? 'rtl' : 'ltr');
  chip.innerHTML = `
    <button type="button" class="hw-chip-main" data-hw-resume title="${_esc(_t('hwResumeTip'))}">
      <span class="hw-chip-pulse" aria-hidden="true"></span>🧭 ${_esc(_tf('hwResume', { n: _idx + 1 }))}
    </button>
    <button type="button" class="hw-chip-x" data-hw-chip-x title="${_esc(_t('hwClose'))}" aria-label="${_esc(_t('hwClose'))}"><svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true" focusable="false" style="display:block"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>`;
  chip.addEventListener('click', (e) => {
    if (e.target.closest('[data-hw-chip-x]')) { _hideChip(); return; }
    if (e.target.closest('[data-hw-resume]')) openHelperWizard(_idx);
  });
  document.body.appendChild(chip);
}

function _hideChip() {
  const c = document.getElementById(CHIP_ID);
  if (c) c.remove();
}

// ── Init ─────────────────────────────────────────────────────
export function initHelperWizard() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-helper-open]');
    if (!b) return;
    e.preventDefault();
    openHelperWizard();
  });
  // Re-draw in the new language if it changes while the Helper is open.
  window.addEventListener('dacum:langchange', () => {
    if (document.getElementById(OVERLAY_ID)) _render(false);
    const chip = document.getElementById(CHIP_ID);
    if (chip) _showChip();
  });
  // A different project → the chip's step number no longer applies.
  window.addEventListener('dacum:project-loaded', _hideChip);
  window.openHelperWizard = openHelperWizard;
}
