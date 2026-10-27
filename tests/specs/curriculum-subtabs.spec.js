// 3.141.0 — sub-tabs of the Module Curriculum tab: Module data / CUR / CBC.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const sub = (page, k) => page.locator(`#curRoot [data-cur-subtab="${k}"]`);

test('three sub-tabs; CUR and CBC keep the existing cards and share one store; each has its own export', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));

  // CUR is the tab shown first; it still has all the cards and its own export button.
  await expect(sub(page, 'cur')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#curRoot details.cur-lo').first()).toBeVisible();
  await expect(page.locator('#curRoot [data-cur-action="export-this"]')).toBeVisible();
  await expect(page.locator('#curRoot [data-cur-action="export-cbc"]')).toHaveCount(0);

  // Same data in both: a programme name typed under CUR is there under CBC.
  await page.locator('#curRoot details.cur-settings > summary').click();
  await page.fill('#curRoot input[data-ck="programmeName"]', 'ZZ Programme');
  await sub(page, 'cbc').click();
  await expect(sub(page, 'cbc')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#curRoot details.cur-lo').first()).toBeVisible();
  await expect(page.locator('#curRoot [data-cur-action="export-this"]')).toHaveCount(0);
  await page.locator('#curRoot details.cur-settings > summary').click();
  await expect(page.locator('#curRoot input[data-ck="programmeName"]')).toHaveValue('ZZ Programme');

  // CBC's button opens the CBC dialog.
  await page.click('#curRoot [data-cur-action="export-cbc"]');
  await expect(page.locator('#cbcExportModal')).toBeVisible();
  await page.keyboard.press('Escape');

  // Module data: what both files share, with the Basic Information values; no export button.
  await sub(page, 'data').click();
  await expect(page.locator('#curRoot .cur-basic')).toBeVisible();
  const occ = await page.inputValue('#occupationTitle');
  if (occ) await expect(page.locator('#curRoot .cur-basic')).toContainText(occ);
  await expect(page.locator('#curRoot .cur-export-btn')).toHaveCount(0);
  await expect(page.locator('#curRoot .cur-topbar')).toBeVisible();      // module selector stays above every sub-tab
  expect(errors).toEqual([]);
});

test('sub-tabs: arrow keys, remembered choice, Arabic order', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));

  await sub(page, 'cur').focus();
  await page.keyboard.press('ArrowRight');
  await expect(sub(page, 'cbc')).toHaveAttribute('aria-selected', 'true');
  await expect(sub(page, 'cbc')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(sub(page, 'data')).toHaveAttribute('aria-selected', 'true');

  // remembered: leave the tab and come back
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));
  await expect(sub(page, 'data')).toHaveAttribute('aria-selected', 'true');

  // Arabic: the right arrow now moves to the previous sub-tab (the strip is mirrored)
  await page.evaluate(() => window.i18n.setLang('ar'));
  await sub(page, 'cbc').click();
  await sub(page, 'cbc').focus();
  await page.keyboard.press('ArrowRight');
  await expect(sub(page, 'cur')).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});
