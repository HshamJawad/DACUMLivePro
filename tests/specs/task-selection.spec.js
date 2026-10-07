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
