// 3.139.0: the tools listed in Additional Info reach Module Builder with the handoff.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

test('Additional Info tools go with the handoff, one item per line without bullets', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => {
    window.open = () => null;
    document.getElementById('toolsInput').value = '• Screwdrivers\n2- Tweezers\n\n  - Multi-meter  \nAnti-static bags';
  });
  await page.evaluate(async () => { window.switchTab('module-mapping-tab'); (await import('./module_mapping.js')).openModuleBuilderFromMapping(); });
  const sent = await page.evaluate(() => JSON.parse(localStorage.getItem('dacum_modules_export')));
  expect(sent.additionalInfoTools).toEqual(['Screwdrivers', 'Tweezers', 'Multi-meter', 'Anti-static bags']);

  await page.evaluate(() => { document.getElementById('toolsInput').value = ''; });
  await page.evaluate(async () => (await import('./module_mapping.js')).openModuleBuilderFromMapping());
  const none = await page.evaluate(() => JSON.parse(localStorage.getItem('dacum_modules_export')));
  expect('additionalInfoTools' in none).toBe(false);
  expect(errors).toEqual([]);
});
