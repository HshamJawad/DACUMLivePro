// Select Tasks: "Is the task performed?" — the 25% rule and its New-task
// exception (3.90.0) — and Undo / Redo of the selection on the toolbar
// while Task Verification is open (3.91.0).
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture } = require('../helpers');

/* A1 I3 D3 · A2 I3 D1 · A3 I1 D3 · rest I2 F2 D2 (same as task-selection.spec.js). */
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
const excluded = (page) => state(page, 's => (s.taskSelection || {}).excluded || {}');

async function setPerf(page, key, value) {
  const f = page.locator(`[data-tsel-perf="${key}"]`);
  await f.fill(String(value));
  await f.press('Tab');
}

test('off by default; when ticked: few performers set aside, New tasks kept', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('task-selection-tab'));
  await setRatings(page);

  expect(await state(page, 's => s.taskSelection.perfRule')).toBe(false);
  await expect(page.locator('[data-tsel-perf]')).toHaveCount(0);

  await page.check('[data-tsel-perfrule]');
  await expect(page.locator('[data-tsel-perf]')).toHaveCount(12);
  await expect(page.locator('[data-tsel-new]')).toHaveCount(12);

  await setPerf(page, 'duty_1_1', 10);      // important and difficult, but rare
  await setPerf(page, 'duty_1_4', 60);
  await setPerf(page, 'duty_2_1', 5);
  await page.check('[data-tsel-new="duty_2_1"]');
  await expect(page.locator('[data-tsel-row="duty_1_1"] .tsel-perf-low')).toBeVisible();
  await expect(page.locator('[data-tsel-row="duty_2_1"] .tsel-perf-low')).toHaveCount(0);

  await page.click('[data-tsel-action="suggest"]');
  expect(await excluded(page)).toEqual({ duty_1_1: 'fewperf', duty_1_2: 'onjob', duty_1_3: 'lowimp' });

  // Threshold editable; data kept with the project.
  await page.fill('[data-tsel-perfmin]', '5');
  await page.locator('[data-tsel-perfmin]').press('Tab');
  const ts = await state(page, 's => s.taskSelection');
  expect(ts.perfMin).toBe(5);
  expect(ts.performed).toEqual({ duty_1_1: 10, duty_1_4: 60, duty_2_1: 5 });
  expect(ts.newTask).toEqual({ duty_2_1: true });

  // Unticked: the suggestion is exactly as before, the figures stay.
  await page.uncheck('[data-tsel-perfrule]');
  await page.click('[data-tsel-action="suggest"]');
  expect(await excluded(page)).toEqual({ duty_1_2: 'onjob', duty_1_3: 'lowimp' });
  expect(await state(page, 's => s.taskSelection.performed.duty_1_1')).toBe(10);

  // JSON round trip.
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./snapshots.js')).saveToJSON())]);
  const saved = JSON.stringify(JSON.parse(fs.readFileSync(await dl.path(), 'utf8')));
  expect(saved).toContain('"performed"');
  expect(saved).toContain('"newTask"');
  expect(errors).toEqual([]);
});

test('ticking New brings back a task set aside for few performers — only that reason', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('task-selection-tab'));
  await setRatings(page);
  await page.check('[data-tsel-perfrule]');
  await setPerf(page, 'duty_1_1', 10);
  await page.click('[data-tsel-action="suggest"]');
  expect((await excluded(page)).duty_1_1).toBe('fewperf');

  await page.check('[data-tsel-new="duty_1_1"]');
  expect((await excluded(page)).duty_1_1).toBeUndefined();
  await expect(page.locator('[data-tsel-key="duty_1_1"]')).toBeChecked();

  await page.check('[data-tsel-new="duty_1_3"]');                 // out for low importance
  expect((await excluded(page)).duty_1_3).toBe('lowimp');
  expect(errors).toEqual([]);
});

test('Undo / Redo on the toolbar: suggestion, Select all; other tabs keep their own history', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('task-selection-tab'));
  await setRatings(page);
  await expect(page.locator('#btnUndo')).toBeDisabled();

  await page.click('[data-tsel-action="suggest"]');
  const suggested = await excluded(page);
  expect(Object.keys(suggested)).toHaveLength(2);
  await expect(page.locator('#btnUndo')).toBeEnabled();

  await page.click('#btnUndo');
  expect(await excluded(page)).toEqual({});
  await expect(page.locator('.tsel-row.tsel-off')).toHaveCount(0);
  await page.click('#btnRedo');
  expect(await excluded(page)).toEqual(suggested);

  await page.click('[data-tsel-action="all"]');
  expect(await excluded(page)).toEqual({});
  await page.click('#btnUndo');
  expect(await excluded(page)).toEqual(suggested);

  await page.evaluate(() => window.switchTab('duties-tab'));
  await page.evaluate(() => document.getElementById('btnUndo').click());
  expect(await excluded(page)).toEqual(suggested);
  expect(errors).toEqual([]);
});

test('Arabic, 360 px: rule and fields translated, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('task-selection-tab'));
  await setRatings(page);
  await expect(page.locator('#taskSelectionSection')).toContainText('هل تُؤدّى المهمة فعلاً');
  await page.check('[data-tsel-perfrule]');
  await expect(page.locator('#taskSelectionSection')).toContainText('جديدة');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
