// 3.123.0: Settings → Misc → learning outcome labels. LO1 by default; in
// the Arabic interface, the user's pattern ({n}, {ord}, {ordm}). The
// stored number stays LO1.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture, state } = require('../helpers');

test('patterns and the label of an outcome', async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(async () => {
    const m = await import('./lo_labels.js');
    const enUi = (m.setLoLabelPref({ mode: 'custom', pattern: 'محصلة التعلم {n}' }), m.loLabel({ number: 'LO1' }));
    window.i18n.setLang('ar');
    return {
      n: m.formatLoLabel('محصلة التعلم {n}', 3),
      ord: m.formatLoLabel('محصلة التعلم {ord}', 2),
      bare: m.formatLoLabel('محصلة التعلم', 4),
      empty: m.formatLoLabel('', 5),
      enUi,
      arUi: m.loLabel({ number: 'LO2' }),
      str: m.loLabel('LO3'),
      other: m.loLabel({ number: 'X9' }),
      off: (m.setLoLabelPref({ mode: 'code' }), m.loLabel({ number: 'LO2' })),
    };
  });
  expect(r).toEqual({
    n: 'محصلة التعلم 3', ord: 'محصلة التعلم الثانية', bare: 'محصلة التعلم 4', empty: 'LO5',
    enUi: 'LO1', arUi: 'محصلة التعلم 2', str: 'محصلة التعلم 3', other: 'X9', off: 'LO2',
  });
  expect(errors).toEqual([]);
});

test('Arabic interface: LO1 by default; the chosen titles from Settings → Misc, drawn at once', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('learning-outcomes-tab'));
  const title = page.locator('#loBlocksContainer .lo-number bdi').first();
  await expect(title).toHaveText('LO1');
  await page.evaluate(async () => (await import('./export_settings.js')).openExportSettings({ tab: 'misc' }));
  await page.locator('input[name="ms_lolabel"][value="custom"]').check();
  await expect(title).toHaveText('محصلة التعلم 1');
  await page.locator('[data-ms-lo-pick="محصلة التعلم {ord}"]').click();
  await expect(title).toHaveText('محصلة التعلم الأولى');
  await expect(page.locator('.ms-lo-preview')).toContainText('محصلة التعلم الأولى، محصلة التعلم الثانية، محصلة التعلم الثالثة');
  // the project keeps LO1
  expect(await state(page, 's => s.learningOutcomesData.outcomes[0].number')).toBe('LO1');
  // English interface keeps LO1
  await page.evaluate(() => window.i18n.setLang('en'));
  await expect(page.locator('#loBlocksContainer .lo-number bdi').first()).toHaveText('LO1');
  await page.evaluate(() => window.i18n.setLang('ar'));
  await expect(page.locator('#loBlocksContainer .lo-number bdi').first()).toHaveText('محصلة التعلم الأولى');
  // back to the default
  await page.locator('input[name="ms_lolabel"][value="code"]').check();
  await expect(page.locator('#loBlocksContainer .lo-number bdi').first()).toHaveText('LO1');
  expect(errors).toEqual([]);
});
