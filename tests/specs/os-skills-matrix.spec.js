// 3.115.0: the Skills Level Matrix (employability competencies by
// occupational level) is edited in the Occupational Standard tab only —
// no longer in Additional Info, and no "Edit in Additional Info" link.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

test('the matrix is edited in the Occupational Standard, not in Additional Info', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));

  await page.evaluate(() => window.switchTab('additional-info-tab'));
  await expect(page.locator('#additional-info-tab #skillsLevelContainer')).toHaveCount(0);
  await expect(page.locator('#additional-info-tab .skills-level-accordion')).toHaveCount(0);

  await page.evaluate(() => window.switchTab('occupational-standard-tab'));
  const slot = page.locator('#osMatrixSlot');
  await expect(slot.locator('#skillsLevelContainer table.mx-table')).toBeVisible();
  await expect(page.locator('#osRoot [data-os-goto="additional-info-tab"]', { hasText: /Skills|Employab/ })).toHaveCount(0);
  // the Employability section has no "Edit in …" button any more
  const empSec = page.locator('#osRoot .os-sec', { has: page.locator('#osMatrixSlot') });
  await expect(empSec.locator('.os-edit')).toHaveCount(0);

  // tick a level, re-render the tab (language change): kept, still editable
  const box = slot.locator('td.mx-c-lv input[type="checkbox"]').first();
  const was = await box.isChecked();
  await box.click();
  await page.evaluate(() => window.i18n.setLang('fr'));
  await page.waitForTimeout(200);
  await expect(page.locator('#osMatrixSlot td.mx-c-lv input[type="checkbox"]').first()).toBeChecked({ checked: !was });
  await page.locator('#osMatrixSlot #btnAddSkillsCategory').click();
  const cats = await page.evaluate(async () => (await import('./state.js')).appState.skillsLevelData.length);
  expect(cats).toBeGreaterThan(1);

  // clearing Additional Info leaves the matrix alone
  const before = await page.evaluate(async () => JSON.stringify((await import('./state.js')).appState.skillsLevelData));
  await page.evaluate(() => window.switchTab('additional-info-tab'));
  await page.evaluate(async () => (await import('./projects.js')).clearCurrentTab('additional-info-tab'));
  const after = await page.evaluate(async () => JSON.stringify((await import('./state.js')).appState.skillsLevelData));
  expect(after).toBe(before);
  expect(errors).toEqual([]);
});

test('Arabic, 360 px: the matrix in the standard fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('occupational-standard-tab'));
  await expect(page.locator('#osMatrixSlot #skillsLevelContainer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
