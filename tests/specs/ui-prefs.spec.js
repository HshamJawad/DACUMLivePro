// 3.103.0: Settings → Misc — the Helper button and the AI cards can be
// automatic, always shown / open / folded, or hidden. In the fixed modes
// a click works for the session only; "Reset to automatic" puts both
// groups back to Automatic and clears the per-tab choices (3.103.1).
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const AI_TABS = ['duties-tab', 'additional-info-tab', 'clustering-tab', 'learning-outcomes-tab', 'module-mapping-tab'];
const toggle = (page, tab) => page.locator(`[data-ai-toggle="${tab}"]`);
const chip = (page) => page.locator('#helperResumeChip');

async function reopen(page) {
  await page.reload();
  await page.waitForFunction(() => !!window.i18n && typeof window.switchTab === 'function');
  await page.waitForTimeout(900);
}
async function openMisc(page) {
  await page.evaluate(() => window.openExportSettings({ tab: 'misc' }));
  await expect(page.locator('#esTabs [data-es-tab="misc"]')).toHaveClass(/es-tab-on/);
}
async function pick(page, name, value) {
  await openMisc(page);
  await page.locator(`input[data-ms-pref="${name}"][value="${value}"]`).check();
  await page.locator('#esModalClose').click();
}

test('Misc tab: both groups default to Automatic; Save footer hidden', async ({ page }) => {
  const errors = await openApp(page);
  await openMisc(page);
  await expect(page.locator('#esModalBody')).toContainText('Helper button');
  await expect(page.locator('input[data-ms-pref="helperChip"][value="auto"]')).toBeChecked();
  await expect(page.locator('input[data-ms-pref="aiCards"][value="auto"]')).toBeChecked();
  await expect(page.locator('input[data-ms-pref="aiCards"]')).toHaveCount(4);
  await expect(page.locator('#esModalFoot')).toBeHidden();
  await expect(page.locator('[data-ms-reset]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('AI cards "Always open": a click lasts for the session only', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await pick(page, 'aiCards', 'open');
  for (const tab of AI_TABS) {
    await page.evaluate(id => window.switchTab(id), tab);
    await expect(toggle(page, tab)).toHaveAttribute('aria-expanded', 'true');
  }
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await toggle(page, 'clustering-tab').click();
  await expect(page.locator('#aiSuggestClustersBtn')).toBeHidden();
  await page.evaluate(() => window.switchTab('duties-tab'));
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await expect(toggle(page, 'clustering-tab')).toHaveAttribute('aria-expanded', 'false');   // same session
  expect(await page.evaluate(() => localStorage.getItem('dacum_ai_cards'))).toBeNull();

  await reopen(page);
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await expect(toggle(page, 'clustering-tab')).toHaveAttribute('aria-expanded', 'true');
  expect(errors).toEqual([]);
});

test('AI cards "Always folded" on an empty project', async ({ page }) => {
  const errors = await openApp(page);
  await pick(page, 'aiCards', 'closed');
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(toggle(page, 'duties-tab')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#aiGenerateBtn')).toBeHidden();
  await toggle(page, 'duties-tab').click();
  await expect(page.locator('#aiGenerateBtn')).toBeVisible();
  // back to Automatic: the empty tab opens again, session clicks forgotten
  await pick(page, 'aiCards', 'auto');
  await expect(toggle(page, 'duties-tab')).toHaveAttribute('aria-expanded', 'true');
  expect(errors).toEqual([]);
});

test('AI cards "Hidden": no button; the Helper still opens the card and shows its button', async ({ page }) => {
  const errors = await openApp(page);
  await pick(page, 'aiCards', 'hidden');
  for (const tab of AI_TABS) await expect(toggle(page, tab)).toBeHidden();
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(page.locator('#aiGenerateBtn')).toBeHidden();

  await page.evaluate(async () => (await import('./helper_wizard.js')).openHelperWizard(1));
  await page.locator('#helperWizard [data-hw-go]').click();
  await expect(page.locator('#aiGenerateBtn')).toBeVisible();
  await expect(toggle(page, 'duties-tab')).toBeVisible();
  await expect(toggle(page, 'module-mapping-tab')).toBeHidden();

  await reopen(page);
  await expect(toggle(page, 'duties-tab')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Reset to automatic clears the per-tab choices', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => window.switchTab('duties-tab'));
  await toggle(page, 'duties-tab').click();
  await expect(toggle(page, 'duties-tab')).toHaveAttribute('aria-expanded', 'false');
  await openMisc(page);
  await page.locator('[data-ms-reset]').click();
  await expect(page.locator('.ms-reset-msg')).toContainText('back to Automatic');
  await expect(page.locator('[data-ms-reset]')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('dacum_ai_cards'))).toBeNull();
  await page.locator('#esModalClose').click();
  await expect(toggle(page, 'duties-tab')).toHaveAttribute('aria-expanded', 'true');
  expect(errors).toEqual([]);
});

test('Reset to automatic from Hidden: buttons, cards and Helper button come back', async ({ page }) => {
  const errors = await openApp(page);
  await pick(page, 'helperChip', 'hidden');
  await pick(page, 'aiCards', 'hidden');
  await expect(toggle(page, 'duties-tab')).toBeHidden();
  await expect(chip(page)).toHaveCount(0);

  await openMisc(page);
  await expect(page.locator('[data-ms-reset]')).toBeEnabled();
  await page.locator('[data-ms-reset]').click();
  await expect(page.locator('input[data-ms-pref="helperChip"][value="auto"]')).toBeChecked();
  await expect(page.locator('input[data-ms-pref="aiCards"][value="auto"]')).toBeChecked();
  await expect(page.locator('[data-ms-reset]')).toBeDisabled();
  await page.locator('#esModalClose').click();

  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(toggle(page, 'duties-tab')).toBeVisible();
  await expect(page.locator('#aiGenerateBtn')).toBeVisible();          // empty tab → open
  await expect(chip(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Helper button: Automatic, Always shown, Always hidden', async ({ page }) => {
  const errors = await openApp(page);
  // Automatic: shown at start; ✕ hides it for the session, tabs do not bring it back
  await expect(chip(page)).toBeVisible();
  await chip(page).locator('[data-hw-chip-x]').click();
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(chip(page)).toHaveCount(0);

  // Always shown: ✕ lasts until the next tab
  await pick(page, 'helperChip', 'always');
  await expect(chip(page)).toBeVisible();
  await chip(page).locator('[data-hw-chip-x]').click();
  await expect(chip(page)).toHaveCount(0);
  await page.evaluate(() => window.switchTab('additional-info-tab'));
  await expect(chip(page)).toBeVisible();

  // Always hidden: gone now and after a reload, until the Helper is opened by hand
  await pick(page, 'helperChip', 'hidden');
  await expect(chip(page)).toHaveCount(0);
  await reopen(page);
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(chip(page)).toHaveCount(0);
  await page.evaluate(() => window.switchTab('contact-tab'));
  await page.locator('[data-helper-open]').first().click();
  await page.locator('#helperWizard [data-hw-close]').first().click();
  await expect(chip(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Arabic, 360 px: Misc tab translated, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const errors = await openApp(page, { lang: 'ar' });
  await openMisc(page);
  await expect(page.locator('#esTabs [data-es-tab="misc"]')).toContainText('متنوع');
  await expect(page.locator('#esModalBody')).toContainText('بطاقات الذكاء الاصطناعي');
  await expect(page.locator('#esModalBody')).toContainText('إعادة الضبط إلى التلقائي');
  const box = page.locator('#esModalBox');
  expect(await box.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
