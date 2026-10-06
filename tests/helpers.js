// Shared helpers for the behaviour tests.
const fs = require('fs');
const path = require('path');

/** Open the app and wait for it to finish starting. Collects page errors. */
async function openApp(page, { lang } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept());          // confirm()/alert() → OK
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.i18n && typeof window.switchTab === 'function');
  await page.waitForTimeout(600);
  if (lang) await page.evaluate(l => window.i18n.setLang(l), lang);
  return errors;
}

/** Read appState (or a part of it) from the page. */
function state(page, expr = 's => s') {
  return page.evaluate(async (src) => {
    const { appState } = await import('./state.js');
    return JSON.parse(JSON.stringify((0, eval)(src)(appState)));
  }, expr);
}

/** Load a project object into the app the way an imported file is. */
async function loadProject(page, data, fileName = 'Sample_2026-01-01_00-00.json') {
  await page.evaluate(async ({ data, fileName }) => {
    const m = await import('./dacum_projects.js');
    m.importProjectFromData(data, fileName);
    await new Promise(r => setTimeout(r, 400));
    const ps = (await import('./project_store.js')).readProjects();
    const list = Array.isArray(ps) ? ps : (ps.projects || []);
    m.loadProject(list[list.length - 1].id);
  }, { data, fileName });
  await page.waitForTimeout(900);
}

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

/** Wrap a JSON reply the awkward way models sometimes answer: prose and
 *  fences around it, split across two text blocks. */
function messyReply(obj) {
  const txt = 'Sure, here it is:\n```json\n' + JSON.stringify(obj) + '\n```\nLet me know.';
  const h = Math.floor(txt.length / 2);
  return { content: [{ type: 'text', text: txt.slice(0, h) }, { type: 'text', text: txt.slice(h) }], stop_reason: 'end_turn' };
}
const cleanReply = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn' });

const ids = (prompt, re = /- id: (\S+)/g) => [...prompt.split('OUTPUT FORMAT')[0].matchAll(re)].map(m => m[1]);

/** A stand-in for the AI that answers every card of the app. Returns
 *  { calls } — the kind of each request, in order. */
async function mockAI(page, { messy = true, fail = false, overrides = {} } = {}) {
  const calls = [];
  await page.route('**/api/generate-dacum', async route => {
    const prompt = JSON.parse(route.request().postData()).prompt;
    const kind = kindOf(prompt);
    calls.push(kind);
    if (fail && kind !== 'check') {
      return route.fulfill({ status: 529, contentType: 'application/json', body: '{"error":"overloaded"}' });
    }
    const obj = overrides[kind] ? overrides[kind](prompt) : answer(kind, prompt);
    await route.fulfill({ json: (messy ? messyReply : cleanReply)(obj) });
  });
  return { calls };
}

function kindOf(p) {
  const out = p.split('OUTPUT FORMAT').pop();
  if (p.includes('validating a single input field')) return 'check';
  if (p.includes('DATA-INFORMED DACUM DRAFT')) return 'duties';
  if (p.includes('SUPPORTING INFORMATION')) return 'info';
  if (p.includes('DACUM TASK ANALYSIS for ONE task')) return 'ta';
  if (out.includes('"taskIds"')) return 'clusters';
  if (out.includes('"criterionIds"')) return 'outcomes';
  if (out.includes('"outcomeIds"')) return 'modules';
  if (out.includes('"ratings"')) return 'ratings';
  if (out.includes('"range"') || out.includes('"performanceCriteria"')) return 'criteria';
  return 'unknown';
}

function answer(kind, p) {
  switch (kind) {
    case 'check': return { verdict: 'known', suggestion: '', standard_name: '', reason: '', job_verdict: 'fits', job_suggestion: '', job_reason: '' };
    case 'duties': return { duties: ['A', 'B', 'C'].map(d => ({ title: `Duty ${d}`, tasks: [1, 2, 3, 4].map(t => `Perform task ${d}${t}`) })) };
    case 'info': return {
      ...Object.fromEntries(['knowledge', 'skills', 'behaviors', 'tools', 'trends'].map(k => [k, [`${k} item 1`, `${k} item 2`]])),
      acronyms: ['PC - Personal Computer'], careerPath: ['Entry Level: Assistant'],
    };
    case 'clusters': { const t = ids(p); const h = Math.floor(t.length / 2);
      return { clusters: [{ name: 'Maintain hardware components', taskIds: t.slice(0, h) }, { name: 'Configure software systems', taskIds: t.slice(h) }] }; }
    case 'criteria': return { clusters: ids(p, /- id: (\S+)/g).map(id => ({ id, range: 'Applies across workshop and on-site settings.',
                      performanceCriteria: [1, 2, 3, 4].map(n => `Work is checked against specifications ${n}`) })) };
    case 'outcomes': { const c = ids(p); return { outcomes: [0, 1, 2].filter(i => c[i]).map(i => ({ statement: `Perform outcome ${i}`, criterionIds: c.filter((_, j) => j % 3 === i) })) }; }
    case 'modules': return { modules: [{ title: 'Implementing Core Work', rationale: 'Groups the core outcomes.', outcomeIds: ids(p) }] };
    case 'ratings': { const codes = [...new Set([...p.split('OUTPUT FORMAT')[0].matchAll(/\b([A-Z]\d{1,2})\b/g)].map(m => m[1]))];
      return { ratings: codes.map(code => ({ code, importance: 2, frequency: 2, difficulty: 1 })) }; }
    case 'ta': return { sections: { performanceSteps: ['Inspect the work area', 'Wear PPE'], safetyOSH: ['Slip hazards'] } };
    default: return {};
  }
}

/** Fill the Chart Info fields the AI cards need. */
async function fillJob(page, { occ = 'Maintenance Technician', job = 'Computer Maintenance Technician',
                               scope = 'Repairs and maintains desktop and laptop computers in a service workshop.' } = {}) {
  await page.evaluate(() => window.switchTab('info-tab'));
  await page.fill('#occupationTitle', occ);
  await page.fill('#jobTitle', job);
  await page.fill('#scopeOfWork', scope);
}

module.exports = { openApp, state, loadProject, fixture, mockAI, fillJob, messyReply, cleanReply };
