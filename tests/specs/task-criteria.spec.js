// 3.109.0: "📏" on task cards — the criteria written for the task
// (Task Analysis, then the closest competency criteria), and the
// learning outcomes they reach. Read-only. Shown on the Duties & Tasks
// cards by default and on the verified chart when turned on.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const card = (page, id) => page.locator(`#task_${id}`);

test('task cards: 📏 with a count; the modal lists own and closest criteria and the outcomes', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('pilot-criteria.json'));
  await page.evaluate(() => window.switchTab('duties-tab'));
  const b11 = card(page, 'duty_1_1').locator('.tc-badge');
  await expect(b11).toBeVisible();
  const own = await page.evaluate(async () => (await import('./task_criteria.js')).getTaskCriteria('duty_1_1'));
  expect(own.own.length).toBeGreaterThan(0);
  await expect(b11).toHaveText(`📏 ${own.own.length + own.closest.length}`);

  // a task with no analysis: the closest competency criteria
  const r = await page.evaluate(async () => (await import('./task_criteria.js')).getTaskCriteria('duty_6_2'));
  expect(r.own).toEqual([]);
  expect(r.closest.length).toBeGreaterThan(0);
  expect(r.closest.length).toBeLessThan(r.closest.length + r.others.length);
  await card(page, 'duty_6_2').locator('.tc-badge').click();
  const m = page.locator('.tc-overlay');
  await expect(m).toContainText('Competency criteria');
  await expect(m.locator('.tc-tag').first()).toHaveText('closest');
  await expect(m).toContainText('Learning outcomes reached');
  await expect(m.locator('textarea, input')).toHaveCount(0);               // read-only
  await page.keyboard.press('Escape');
  await expect(m).toHaveCount(0);

  // the toolbar toggle hides them
  await page.locator('#cardViewToolbar [data-cv-action="criteria"]').click();
  await expect(page.locator('#dutiesContainer .tc-badge')).toHaveCount(0);
  await page.locator('#cardViewToolbar [data-cv-action="criteria"]').click();
  await expect(b11).toBeVisible();
  expect(errors).toEqual([]);
});

test('no criteria written anywhere: no button, no toggle', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  const data = fixture('pilot-criteria.json');
  data.taskAnalysis = {};
  data.competencyClusters.clusters.forEach(c => { c.performanceCriteria = []; });
  await loadProject(page, data);
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(page.locator('#dutiesContainer .tc-badge')).toHaveCount(0);
  await expect(page.locator('#cardViewToolbar [data-cv-action="criteria"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('verified chart: hidden by default, shown with 📏 Criteria; Arabic modal', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('pilot-criteria.json'));
  await page.evaluate(async () => (await import('./verified_chart.js')).openVerifiedChart());
  const ov = page.locator('.vc-chart');
  await expect(ov.locator('.tc-badge')).toHaveCount(0);
  await page.locator('[data-vc-act="criteria"]').click();
  await expect(ov.locator('.tc-badge').first()).toBeVisible();
  await ov.locator('.tc-badge').first().click();
  await expect(page.locator('.tc-overlay')).toContainText('معايير أداء المهمة');
  await expect(page.locator('.tc-overlay')).toHaveAttribute('dir', 'rtl');
  expect(errors).toEqual([]);
});
