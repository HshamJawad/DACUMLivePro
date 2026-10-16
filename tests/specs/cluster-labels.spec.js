// 3.120.0: Settings → Misc → competency labels. C1 by default; in the
// Arabic interface, the user's pattern ({n}, {ord}, {ordm}).
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

test('ordinals and patterns', async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(async () => {
    const m = await import('./cluster_labels.js');
    return {
      o: [1, 2, 10, 11, 12, 20, 21, 33].map(n => m.arabicOrdinal(n)),
      om: [1, 11, 22].map(n => m.arabicOrdinal(n, true)),
      n: m.formatClusterLabel('الكفاءة {n}', 3),
      ord: m.formatClusterLabel('الكفاءة {ord}', 2),
      bare: m.formatClusterLabel('الكفاءة', 4),
      empty: m.formatClusterLabel('', 5),
      enUi: (m.setClusterLabelPref({ mode: 'custom', pattern: 'الكفاءة {n}' }), m.clusterLabel(1)),
    };
  });
  expect(r).toEqual({
    o: ['الأولى', 'الثانية', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة', 'العشرون', 'الحادية والعشرون', 'الثالثة والثلاثون'],
    om: ['الأول', 'الحادي عشر', 'الثاني والعشرون'],
    n: 'الكفاءة 3', ord: 'الكفاءة الثانية', bare: 'الكفاءة 4', empty: 'C5', enUi: 'C1',
  });
  expect(errors).toEqual([]);
});

test('Arabic interface: C1 by default; the chosen titles from Settings → Misc, drawn at once', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('clustering-tab'));
  const title = page.locator('#clustersContainer .cluster-title bdi').first();
  await expect(title).toHaveText('C1');
  await page.evaluate(async () => (await import('./export_settings.js')).openExportSettings({ tab: 'misc' }));
  await page.locator('input[name="ms_cllabel"][value="custom"]').check();
  await expect(title).toHaveText('الكفاءة 1');
  await page.locator('[data-ms-cl-pick="الكفاءة {ord}"]').click();
  await expect(title).toHaveText('الكفاءة الأولى');
  await expect(page.locator('.ms-cl-preview')).toContainText('الكفاءة الأولى، الكفاءة الثانية، الكفاءة الثالثة');
  await page.locator('[data-ms-cl-pattern]').fill('التجمع {ordm}');
  await expect(title).toHaveText('التجمع الأول');
  // English interface keeps C1
  await page.evaluate(() => window.i18n.setLang('en'));
  await expect(page.locator('#clustersContainer .cluster-title bdi').first()).toHaveText('C1');
  // back to the default
  await page.evaluate(() => window.i18n.setLang('ar'));
  await expect(page.locator('#clustersContainer .cluster-title bdi').first()).toHaveText('التجمع الأول');
  await page.locator('input[name="ms_cllabel"][value="code"]').check();
  await expect(page.locator('#clustersContainer .cluster-title bdi').first()).toHaveText('C1');
  expect(errors).toEqual([]);
});
