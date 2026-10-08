// Select Tasks for Training / Analysis (3.80.0): the optional SCID step
// at the foot of Task Verification, and Task Analysis following it.
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture, state } = require('../helpers');

/* Distinct ratings so both rules have something to separate:
   A1 I3 D3 (PI 9) · A2 I3 D1 (PI 6) · A3 I1 D3 (PI 2) · rest I2 F2 D2 (PI 4). */
async function setRatings(page) {
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const r = (i, f, d) => ({ importance: i, frequency: f, difficulty: d, criticality: null });
    appState.collectionMode = 'survey';
    appState.priorityFormula = 'if';
    appState.verificationRatings = {};
    appState.dutiesData.forEach(d => d.tasks.forEach(t => { appState.verificationRatings[t.inputId] = r(2, 2, 2); }));
    appState.verificationRatings.duty_1_1 = r(3, 3, 3);
    appState.verificationRatings.duty_1_2 = r(3, 2, 1);
    appState.verificationRatings.duty_1_3 = r(1, 2, 3);
    (await import('./task_selection.js')).renderTaskSelection();
  });
}

const sel = (page) => state(page, 's => Object.keys((s.taskSelection || {}).excluded || {}).sort()');

test('optional: every task selected until changed; Task Analysis unchanged', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('verification-tab'));
  await expect(page.locator('#taskSelectionSection .tsel-count')).toHaveText('12 of 12 tasks selected');
  // Drafted ratings (stored under the pre-3.80 key) now reach the table.
  await expect(page.locator('#score_duty_1_1')).toHaveText('5');
  await page.evaluate(() => window.switchTab('task-analysis-tab'));
  await expect(page.locator('#taskAnalysisNav .ta-nav-task')).toHaveCount(12);
  await expect(page.locator('#taskAnalysisNav .ta-sel-bar')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('suggest by Importance and Difficulty, then Top N; Task Analysis follows', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('verification-tab'));
  await setRatings(page);

  // Default rule: Importance ≥ 2 and Difficulty ≥ 2 → A2 (D1) and A3 (I1) out.
  await page.click('[data-tsel-action="suggest"]');
  expect(await sel(page)).toEqual(['duty_1_2', 'duty_1_3']);
  const ex = await state(page, 's => s.taskSelection.excluded');
  expect(ex).toEqual({ duty_1_2: 'onjob', duty_1_3: 'lowimp' });
  await expect(page.locator('#tselCount')).toHaveText('10 of 12 tasks selected');
  await expect(page.locator('[data-tsel-reason="duty_1_2"]')).toBeVisible();
  await expect(page.locator('[data-tsel-reason="duty_1_1"]')).toBeHidden();

  // Top N by Priority Index: N=2 → A1 (9), A2 (6).
  await page.check('input[name="tselRule"][value="topn"]');
  await page.fill('[data-tsel-field="topN"]', '2');
  await page.locator('[data-tsel-field="topN"]').blur();
  await page.click('[data-tsel-action="suggest"]');      // confirm() is accepted by openApp
  await expect(page.locator('#tselCount')).toHaveText('2 of 12 tasks selected');

  // Manual tick.
  await page.check('[data-tsel-key="duty_2_1"]');
  await expect(page.locator('#tselCount')).toHaveText('3 of 12 tasks selected');

  await page.evaluate(() => window.switchTab('task-analysis-tab'));
  await expect(page.locator('#taskAnalysisNav .ta-nav-task')).toHaveCount(3);
  await expect(page.locator('#taskAnalysisNav .ta-sel-summary')).toHaveText('3 of 12 tasks selected for analysis');

  // Show the unselected ones: greyed, with a banner and a way back in.
  await page.check('[data-action="ta-show-unselected"]');
  await expect(page.locator('#taskAnalysisNav .ta-nav-task')).toHaveCount(12);
  await page.click('.ta-nav-task[data-task-key="duty_1_3"]');
  await expect(page.locator('.ta-excluded-banner')).toContainText('Low priority score');
  await page.click('.ta-excluded-select');
  await expect(page.locator('.ta-excluded-banner')).toHaveCount(0);
  await expect(page.locator('#taskAnalysisNav .ta-sel-summary')).toHaveText('4 of 12 tasks selected for analysis');

  // The ☑ in the list leaves a task out and it stays visible.
  await page.click('.ta-nav-sel[data-task-key="duty_1_1"]');
  await expect(page.locator('.ta-nav-row.ta-nav-unselected .ta-nav-task[data-task-key="duty_1_1"]')).toBeVisible();

  // Survives a save to JSON and re-import.
  const before = await sel(page);
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./snapshots.js')).saveToJSON())]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(Object.keys(data.taskSelection.excluded).sort()).toEqual(before);
  await loadProject(page, data, 'Reimported_2026-01-01_00-00.json');
  expect(await sel(page)).toEqual(before);

  // Clearing the Verification tab returns every task to selected.
  await page.evaluate(async () => (await import('./projects.js')).clearCurrentTab('verification-tab'));
  expect(await sel(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('renders in Arabic without errors', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('verification-tab'));
  await expect(page.locator('#taskSelectionSection h3')).toContainText('اختيار المهام للتدريب والتحليل');
  await setRatings(page);
  await page.click('[data-tsel-action="none"]');
  await page.evaluate(() => window.switchTab('task-analysis-tab'));
  await expect(page.locator('.ta-sel-empty')).toBeVisible();
  expect(errors).toEqual([]);
});

// ── Phase 2 (3.81.0): the later tabs follow the selection ──────────
const { mockAI } = require('../helpers');
const { execFileSync } = require('child_process');

test('clusters, clustering AI, trace map and exports follow the selection', async ({ page }) => {
  const errors = await openApp(page);
  let prompt = '';
  await mockAI(page, { overrides: { clusters: (p) => {
    prompt = p;
    const t = [...p.split('OUTPUT FORMAT')[0].matchAll(/- id: (\S+)/g)].map(m => m[1]);
    const h = Math.floor(t.length / 2);
    return { clusters: [{ name: 'One', taskIds: t.slice(0, h) }, { name: 'Two', taskIds: t.slice(h) }] };
  } } });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const S = await import('./task_selection.js');
    S.setTaskSelected('duty_1_3', false, 'rare');
    const { appState } = await import('./state.js');
    appState.taskAnalysisData.duty_1_3 = { performanceSteps: ['Step on a left-out task'] };
  });

  // Clustering AI: the left-out task is not sent, and it stays in the pool.
  expect(await page.evaluate(async () => (await import('./clustering_ai.js')).suggestClustersAI())).toBe(true);
  expect(prompt).toContain('duty_1_1');
  expect(prompt).not.toContain('duty_1_3');
  const cd = await state(page, 's => ({ avail: s.clusteringData.availableTasks.map(t => t.id), inC: s.clusteringData.clusters.flatMap(c => c.tasks.map(t => t.id)) })');
  expect(cd.avail).toContain('duty_1_3');
  expect(cd.inC).not.toContain('duty_1_3');

  // Clusters tab: folded group for the left-out task; badge once placed by hand.
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await expect(page.locator('#availableTasksList .cl-unsel-group .task-checkbox-item')).toHaveCount(1);
  await expect(page.locator('#availableTasksList .cl-unsel-group summary')).toHaveText('Not selected for training (1)');
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const cd = appState.clusteringData;
    const i = cd.availableTasks.findIndex(t => t.id === 'duty_1_3');
    cd.clusters[0].tasks.push(cd.availableTasks.splice(i, 1)[0]);
    const m = await import('./clusters.js'); m.renderAvailableTasks(); m.renderClusters();
  });
  await expect(page.locator('.cluster-task-row[data-task-id="duty_1_3"] .cluster-unsel-badge')).toBeVisible();

  // Trace map data: flagged, never counted as a gap.
  const tg = await page.evaluate(async () => {
    const g = (await import('./module_mapping.js')).getTraceGraph();
    return g.duties.flatMap(d => d.tasks).filter(t => t.id === 'duty_1_3' || t.id === 'duty_1_1').map(t => [t.id, t.unselected]);
  });
  expect(tg).toEqual([['duty_1_1', false], ['duty_1_3', true]]);

  // Task Analysis export: the left-out task's analysis is not exported,
  // and the summary names it with its reason.
  const ex = await page.evaluate(async () => ({
    ta:  (await import('./task_analysis.js')).getTaskAnalysisExportData().map(e => e.taskCode),
    sum: (await import('./task_selection.js')).getTaskSelectionExportSummary(),
  }));
  expect(ex.ta).not.toContain('A3');
  expect(ex.sum).toEqual({ selected: 11, total: 12, excluded: [{ code: 'A3', text: 'Perform task A3', reason: 'Rarely performed' }] });

  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    page.evaluate(async () => (await import('./exports_docx.js')).exportToWord())]);
  const xml = execFileSync('python3', ['-c',
    'import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode())', await dl.path()]).toString();
  expect(xml).toContain('Tasks selected for training and analysis: 11 of 12');
  expect(xml).toContain('A3 — Perform task A3 (Rarely performed)');
  expect(xml).not.toContain('Step on a left-out task');
  expect(errors).toEqual([]);
});

// ── 3.82.0: move left-out tasks out of clusters; "Selected" column ──
test('one click moves left-out tasks out of the competencies', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const S = await import('./task_selection.js');
    S.setTaskSelected('duty_1_3', false, 'rare');
    S.setTaskSelected('duty_3_4', false, '');
  });
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await expect(page.locator('.cl-unsel-bar')).toContainText('2 task(s) in the competencies below are not selected for training.');
  await page.click('.cl-unsel-move');                     // confirm() is accepted by openApp
  await expect(page.locator('[data-tsel-move-out]')).toHaveCount(0);   // only the Undo bar remains
  const cd = await state(page, 's => ({ avail: s.clusteringData.availableTasks.map(t => t.id).sort(), inC: s.clusteringData.clusters.flatMap(c => c.tasks.map(t => t.id)) })');
  expect(cd.avail).toEqual(['duty_1_3', 'duty_3_4']);
  expect(cd.inC).not.toContain('duty_1_3');
  expect(cd.inC).toHaveLength(10);
  await expect(page.locator('#availableTasksList .cl-unsel-group .task-checkbox-item')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('verification report: "Selected for training" column only when a task was left out', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  const docXml = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
      page.evaluate(async () => (await import('./exports_docx.js')).exportTaskVerificationWord())]);
    return execFileSync('python3', ['-c',
      'import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode())', await dl.path()]).toString();
  };
  expect(await docXml()).not.toContain('Selected for training');
  await page.evaluate(async () => (await import('./task_selection.js')).setTaskSelected('duty_1_3', false, 'rare'));
  const xml = await docXml();
  expect(xml).toContain('Selected for training');
  expect(xml).toContain('No — Rarely performed');
  expect(xml).not.toContain('Unassigned');
  expect(xml).toContain('across 3 duties');
  expect((xml.match(/>Yes</g) || []).length).toBe(11);

  // PDF report builds with the extra column.
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    page.evaluate(async () => (await import('./exports_pdf.js')).exportTaskVerificationPDF())]);
  expect(fs.readFileSync(await pdf.path()).slice(0, 5).toString()).toBe('%PDF-');
  expect(errors).toEqual([]);
});

test('Undo after the move puts every task back in its competency, same position', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  const layout = () => state(page, 's => ({ c: s.clusteringData.clusters.map(c => c.tasks.map(t => t.id)), a: s.clusteringData.availableTasks.map(t => t.id) })');
  await page.evaluate(async () => {
    const S = await import('./task_selection.js');
    ['duty_1_1', 'duty_1_3', 'duty_3_4'].forEach(k => S.setTaskSelected(k, false, ''));
  });
  await page.evaluate(() => window.switchTab('clustering-tab'));
  const before = await layout();
  await page.click('[data-tsel-move-out]');
  await expect(page.locator('.cl-unsel-done')).toContainText('3 task(s) moved out of the competencies.');
  expect((await layout()).a.sort()).toEqual(['duty_1_1', 'duty_1_3', 'duty_3_4']);
  await page.click('[data-tsel-move-undo]');
  await expect(page.locator('.cl-unsel-done')).toHaveCount(0);
  expect(await layout()).toEqual(before);
  // The move bar is back, since the tasks are in their competencies again.
  await expect(page.locator('[data-tsel-move-out]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Module Builder handoff carries the tasks left out, with reasons', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  const send = () => page.evaluate(async () => {
    window.open = () => null;
    (await import('./module_mapping.js')).openModuleBuilderFromMapping();
    return JSON.parse(localStorage.getItem('dacum_modules_export'));
  });
  expect((await send()).taskSelection).toBeUndefined();          // no selection → no field
  await page.evaluate(async () => (await import('./task_selection.js')).setTaskSelected('duty_1_3', false, 'rare'));
  const d = await send();
  expect(d.taskSelection).toEqual({ selected: 11, total: 12, excluded: [
    { taskId: 'duty_1_3', code: 'A3', text: 'Perform task A3', reasonCode: 'rare', reason: 'Rarely performed' }] });
  const st = d.modules.flatMap(m => m.sourceTasks);
  expect(st.find(t => t.id === 'duty_1_3').selected).toBe(false);
  expect(st.find(t => t.id === 'duty_1_1').selected).toBeUndefined();
  expect(errors).toEqual([]);
});

test('"Not rated yet" opens the task\'s rating row', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    appState.collectionMode = 'survey';
    delete appState.verificationRatings.duty_2_3;
  });
  await page.evaluate(() => window.switchTab('verification-tab'));
  await page.evaluate(async () => (await import('./task_selection.js')).renderTaskSelection());
  const link = page.locator('[data-tsel-goto="duty_2_3"]');
  await expect(link).toContainText('Not rated yet');
  await expect(page.locator('[data-tsel-goto]')).toHaveCount(1);
  await link.click();
  const row = page.locator('#verificationAccordionContainer tr[data-task-key="duty_2_3"]');
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/tsel-flash/);
  await expect(page.locator('.duty-accordion-header[data-duty="duty_2"]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});
