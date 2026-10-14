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

test('no criteria written yet: "📏 0" leads to Task Analysis, cursor in Performance Criteria', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  const data = fixture('pilot-criteria.json');
  data.taskAnalysis = {};
  data.competencyClusters.clusters.forEach(c => { c.performanceCriteria = []; });
  await loadProject(page, data);
  await page.evaluate(() => window.switchTab('duties-tab'));
  const b = card(page, 'duty_6_2').locator('.tc-badge');
  await expect(b).toHaveText('📏 0');
  await expect(b).toHaveClass(/tc-zero/);
  await expect(page.locator('#cardViewToolbar [data-cv-action="criteria"]')).toHaveCount(1);
  await b.click();
  const m = page.locator('.tc-overlay');
  await expect(m).toContainText('No performance criteria have been written for this task yet.');
  await m.locator('[data-tc-go="ta"]').click();
  await expect(page.locator('#task-analysis-tab')).toHaveClass(/active/);
  await expect(page.locator('#taskAnalysisNav .ta-nav-task[data-task-key="duty_6_2"]')).toHaveClass(/ta-nav-active|active/);
  await expect(page.locator('#task-analysis-tab [data-field-block="performanceCriteria"] textarea')).toBeFocused();
  expect(errors).toEqual([]);
});

test('"Competency criteria" leads to the competency of the task, cursor in its criteria', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('pilot-criteria.json'));
  await page.evaluate(() => window.switchTab('duties-tab'));
  await card(page, 'duty_6_2').locator('.tc-badge').click();
  const cid = await page.evaluate(async () => (await import('./task_criteria.js')).getTaskCriteria('duty_6_2').clusterId);
  await page.locator('.tc-overlay [data-tc-go="cluster"]').click();
  await expect(page.locator('#clustering-tab')).toHaveClass(/active/);
  await expect(page.locator(`#criteria_${cid}`)).toBeFocused();
  expect(errors).toEqual([]);
});

test('the verified chart button is under the chart, at the end opposite ＋ Add Duty', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('pilot-criteria.json'));
  await page.evaluate(() => window.switchTab('duties-tab'));
  const foot = page.locator('#dutiesFootRow');
  await expect(foot.locator('#btnAddDutyCard')).toBeVisible();
  await expect(foot.locator('.vc-launch')).toBeVisible();
  const [add, vc, chart] = await Promise.all([foot.locator('#btnAddDutyCard').boundingBox(), foot.locator('.vc-launch').boundingBox(),
    page.locator('#dutiesContainer').boundingBox()]);
  expect(vc.y).toBeGreaterThan(chart.y + chart.height - 1);           // below the chart
  expect(vc.x).toBeGreaterThan(add.x + add.width);                    // the other end (LTR)
  expect(await page.locator('#duties-tab .vc-launch').count()).toBe(1);
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

// 3.111.0: "↩ Duties & Tasks" on the Performance Criteria card of Task
// Analysis — back to the chart, on the task card the user came from.
test('Task Analysis → "↩ Duties & Tasks" returns to the task card that was opened', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('pilot-criteria.json'));
  await page.evaluate(() => window.switchTab('duties-tab'));
  await card(page, 'duty_6_2').locator('.tc-badge').click();
  await page.locator('.tc-overlay [data-tc-go="ta"]').click();
  const back = page.locator('#task-analysis-tab [data-field-block="performanceCriteria"] [data-tc-back]');
  await expect(back).toBeVisible();
  // first of the card's buttons
  const first = await page.locator('#task-analysis-tab [data-field-block="performanceCriteria"] .section-header-editable button').first().getAttribute('data-tc-back');
  expect(first).not.toBeNull();
  await back.click();
  await expect(page.locator('#duties-tab')).toHaveClass(/active/);
  await expect(card(page, 'duty_6_2')).toHaveClass(/tc-flash/);
  await expect(card(page, 'duty_6_2')).toBeInViewport();
  expect(errors).toEqual([]);
});

// 3.111.0: Settings → Misc → Chart terms.
test('chart terms: the user\'s own terms name the tab, DACUM name underneath; back to DACUM', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('pilot-criteria.json'));
  await page.evaluate(async () => (await import('./export_settings.js')).openExportSettings({ tab: 'misc' }));
  await page.locator('input[name="ms_terms"][value="custom"]').check();
  await page.locator('[data-ms-term="duty"]').fill('General Areas of Competence');
  await page.locator('[data-ms-term="task"]').fill('Skills');
  await expect(page.locator('#dutiesViewHeadingLegacy')).toContainText('General Areas of Competence and Skills');
  await expect(page.locator('#dutiesTermsSub')).toHaveText('(Duties and Tasks)');
  await expect(page.locator('#dpsSidebarNav [data-target-tab="duties-tab"] .dps-nav-text')).toHaveText('General Areas of Competence and Skills');
  await page.evaluate(() => window.i18n.setLang('ar'));
  await expect(page.locator('#dutiesTermsSub')).toHaveText('(الواجبات والمهام)');
  await expect(page.locator('#dpsSidebarNav [data-target-tab="duties-tab"] .dps-nav-text')).toHaveText('General Areas of Competence وSkills');
  await page.evaluate(async () => (await import('./chart_terms.js')).setChartTerms({ mode: 'dacum' }));
  await expect(page.locator('#dutiesViewHeadingLegacy')).toHaveText('الواجبات والمهام');
  await expect(page.locator('#dutiesTermsSub')).toHaveCount(0);
  // the cards keep their labels
  await expect(page.locator('#task_duty_1_1 .dcv-task-label')).toContainText('المهمة');
  expect(errors).toEqual([]);
});
