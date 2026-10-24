// 3.129.0: "Regenerate from here" only in tabs the Full Draft generated;
// the Task Analysis status explains "Completed".
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture, mockAI, fillJob, skipGenSetup } = require('../helpers');

test('Regenerate from here: hidden for typed content', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await expect(page.locator('#duties-tab')).toBeAttached();
  await expect(page.locator('#regenHost_duties [data-regen]')).toHaveCount(0);   // content, but no draft
  expect(errors).toEqual([]);
});

test('Regenerate from here: shown after a draft, kept with the project', async ({ page }) => {
  const errors = await openApp(page);
  await mockAI(page, { messy: true });
  await fillJob(page);
  await page.evaluate(async () => (await import('./draft_ui.js')).openDraftModal());
  await page.waitForSelector('#dgOverlay .dg-dialog');
  await page.click('#dgStart');
  await skipGenSetup(page);
  await page.waitForFunction(() => ['done', 'error'].includes(document.querySelector('#dgOverlay')?.getAttribute('data-phase')), null, { timeout: 60_000 });
  const drafted = await state(page, 's => s.draftStages');
  expect(drafted).toContain('duties');
  await expect(page.locator('#regenHost_duties [data-regen]')).toHaveCount(1);
  const saved = await page.evaluate(async () => (await import('./dacum_projects.js')).captureProjectState().draftStages);
  expect(saved).toEqual(drafted);

  // another project without a draft: no button
  await loadProject(page, fixture('sample-project.json'));
  await expect(page.locator('#regenHost_duties [data-regen]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const lang of ['en', 'ar']) {
  test(`Task Analysis: "Completed" explained on the pill and in the guide (${lang})`, async ({ page }) => {
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('task-analysis-tab'));
    await page.locator('[data-action="ta-select-task"][data-task-key="duty_1_1"]').click();
    const tip = await page.evaluate(() => window.i18n.t('taStatusTip'));
    await expect(page.locator('#taskAnalysisStatusPill')).toHaveAttribute('title', tip);
    await page.locator('#taskAnalysisHelpBtn').click();
    const key = await page.evaluate(() => window.i18n.t('helpTAK8'));
    await expect(page.locator('#taskAnalysisHelpModal')).toContainText(key);
    expect(errors).toEqual([]);
  });
}
