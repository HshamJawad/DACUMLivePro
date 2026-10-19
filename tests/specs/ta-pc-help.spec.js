// 3.124.0: Task Analysis → Performance Criteria has the same "?" as the
// criteria of the Competency Clustering tab (wording rules included).
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

for (const lang of ['en', 'ar']) {
  test(`Task Analysis criteria "?" opens the criteria guide (${lang})`, async ({ page }) => {
    if (lang !== 'en') await page.setViewportSize({ width: 360, height: 780 });
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('task-analysis-tab'));
    await page.locator('[data-action="ta-select-task"][data-task-key="duty_1_1"]').click();
    const btn = page.locator('[data-field-block="performanceCriteria"] [data-action="ta-pc-help"]');
    await expect(btn).toBeVisible();
    await btn.click();
    const modal = page.locator('#pcRangeHelpModal');
    await expect(modal).toBeVisible();
    const expected = await page.evaluate(() => window.i18n.t('helpPCTitle'));
    await expect(modal).toContainText(expected);
    await modal.locator('[data-help-close]').click();
    await expect(modal).toBeHidden();
    expect(errors).toEqual([]);
  });
}
