// The app starts, in each language, without a script error, and the
// main tabs render with a project loaded.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

for (const lang of ['en', 'fr', 'ar']) {
  test(`starts cleanly in ${lang}`, async ({ page }) => {
    const errors = await openApp(page, { lang });
    if (lang === 'ar') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(errors).toEqual([]);
  });
}

test('every main tab renders with a project loaded', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  const tabs = ['info-tab', 'duties-tab', 'additional-info-tab', 'verification-tab', 'task-analysis-tab',
                'clustering-tab', 'occupational-standard-tab', 'learning-outcomes-tab', 'module-mapping-tab',
                'module-curriculum-tab'];
  for (const t of tabs) {
    await page.evaluate(id => window.switchTab(id), t);
    await expect(page.locator('#' + t)).toBeVisible();
  }
  await expect(page.locator('#clustersContainer .cluster-item')).toHaveCount(2);
  expect(errors).toEqual([]);
});
