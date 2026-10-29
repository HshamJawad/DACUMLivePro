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

  // 3.141.1: CUR no longer shows "Training methods" or the entry skills; CBC still does.
  await expect(page.locator('#curRoot .cur-pick[data-cur-pick$="|trainMethods"]')).toHaveCount(0);
  await expect(page.locator('#curRoot .cur-entry')).toHaveCount(0);
  await sub(page, 'cbc').click();
  await expect(page.locator('#curRoot .cur-pick[data-cur-pick$="|trainMethods"]').first()).toBeAttached();
  // 3.144.0: CBC no longer shows purpose, prerequisites, entry skills, time table or the OS link; it keeps the outcome list.
  for (const sel of ['.cur-entry', '[data-ck="purpose"]', '[data-cur-prereq]', '#curHoursBox', '.cur-oslink'])
    await expect(page.locator('#curRoot ' + sel)).toHaveCount(0);
  await expect(page.locator('#curRoot .cur-lolist')).toHaveCount(1);
  // 3.145.0: per outcome, CBC has no learning context, methodology, discussion, demonstration, practice,
  // self-directed fields and no hours; it keeps the assessment parts and the training methods.
  for (const k of ['context', 'methodology', 'discussion', 'demonstration', 'practice', 'selfDirected', 'hours'])
    await expect(page.locator(`#curRoot [data-cs="lo"][data-ck="${k}"]`)).toHaveCount(0);
  await expect(page.locator('#curRoot [data-cur-action="distribute-hours"]')).toHaveCount(0);
  await expect(page.locator('#curRoot .cur-lo-badge').first()).toHaveText(/\/3 /);
  await expect(page.locator('#curRoot .cur-list[data-ck="assessStatements"]').first()).toBeAttached();
  // ... and its own file prefix (CBC) feeding the file name; CUR keeps CUR.
  const pre = page.locator('#curRoot input[data-ck="cbcFilePrefix"]');
  await expect(pre).toHaveAttribute('placeholder', 'CBC');
  await expect(page.locator('#curFilePreview')).toHaveText(/^CBC_/);
  await pre.fill('MyCBC');
  await expect(page.locator('#curFilePreview')).toHaveText(/^MyCBC_/);
  await sub(page, 'cur').click();

  // 3.143.4: the Programme settings card is in CBC only (not on Module data, not on CUR).
  await expect(page.locator('#curRoot details.cur-settings')).toHaveCount(0);
  await sub(page, 'cbc').click();
  await expect(sub(page, 'cbc')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#curRoot details.cur-lo').first()).toBeVisible();
  await expect(page.locator('#curRoot [data-cur-action="export-this"]')).toHaveCount(0);
  await page.locator('#curRoot details.cur-settings > summary').click();
  await page.fill('#curRoot input[data-ck="programmeName"]', 'ZZ Programme');
  await sub(page, 'cur').click();
  await sub(page, 'cbc').click();
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
  // 3.143.2: file name, purpose, prerequisites, entry skills, time table, OS link and outcome list are not on Module data ...
  for (const sel of ['.cur-filename', '[data-ck="purpose"]', '[data-cur-prereq]', '#curHoursBox', '.cur-oslink', '.cur-lolist', '.cur-entry'])
    await expect(page.locator('#curRoot ' + sel)).toHaveCount(0);
  await expect(page.locator('#curRoot [data-ck="code"]')).toHaveCount(1);       // ... the code and short name stay
  await expect(page.locator('#curRoot details.cur-settings')).toHaveCount(0);   // 3.143.3: no programme-settings card here either
  // ... and CUR / CBC keep them.
  await sub(page, 'cur').click();
  for (const k of ['context', 'methodology', 'hours']) await expect(page.locator(`#curRoot [data-cs="lo"][data-ck="${k}"]`).first()).toBeAttached();
  for (const sel of ['.cur-filename', '[data-ck="purpose"]', '#curHoursBox'])
    await expect(page.locator('#curRoot ' + sel).first()).toBeVisible();
  await sub(page, 'cbc').click();
  await expect(page.locator('#curRoot input[data-ck="filePrefix"]')).toHaveCount(0);
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
