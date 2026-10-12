// 3.102.0: the large AI cards fold behind a small "✨ AI" button beside
// each tab's "?" — open while the tab is empty, folded once it has
// content; a click is remembered per tab; the Helper opens a folded card
// before it spotlights a button inside it.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const TABS = {
  'duties-tab':            { card: '#aiCard_duties',   btn: '#aiGenerateBtn' },
  'additional-info-tab':   { card: '#aiCard_addInfo',  btn: '#aiGenerateInfoBtn' },
  'clustering-tab':        { card: '#aiCard_clusters', btn: '#aiSuggestClustersBtn' },
  'learning-outcomes-tab': { card: '#aiCard_lo',       btn: '#loGenPatternCBtn' },
  'module-mapping-tab':    { card: '#aiCard_mm',       btn: '#mmGenAIBtn' },
};
const toggle = (page, tab) => page.locator(`[data-ai-toggle="${tab}"]`);

async function reopen(page) {
  await page.reload();
  await page.waitForFunction(() => !!window.i18n && typeof window.switchTab === 'function');
  await page.waitForTimeout(600);
}

test('empty tab: open; click folds and opens; the choice survives a reload', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => window.switchTab('duties-tab'));
  const t = toggle(page, 'duties-tab');

  // the button sits in the tab header, right after the "?"
  expect(await page.evaluate(() =>
    document.querySelector('#dutiesHelpBtn').nextElementSibling.getAttribute('data-ai-toggle'))).toBe('duties-tab');
  await expect(t).toHaveAttribute('aria-controls', 'aiCard_duties');
  await expect(t).toHaveAttribute('aria-expanded', 'true');
  await expect(t).toHaveClass(/is-open/);
  await expect(page.locator('#aiGenerateBtn')).toBeVisible();

  await t.click();
  await expect(t).toHaveAttribute('aria-expanded', 'false');
  await expect(t).not.toHaveClass(/is-open/);
  await expect(page.locator('#aiCard_duties')).toHaveClass(/is-collapsed/);
  await expect(page.locator('#aiGenerateBtn')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dacum_ai_cards'))['duties-tab'])).toBe('closed');

  await reopen(page);
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(t).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#aiGenerateBtn')).toBeHidden();

  await t.click();
  await expect(page.locator('#aiGenerateBtn')).toBeVisible();
  await reopen(page);
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(t).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#aiGenerateBtn')).toBeVisible();
  expect(errors).toEqual([]);
});

test('filled tabs start folded; a manual open is kept after a project load', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  for (const [tab, { card, btn }] of Object.entries(TABS)) {
    await page.evaluate(id => window.switchTab(id), tab);
    await expect(toggle(page, tab)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(card)).toHaveClass(/is-collapsed/);
    await expect(page.locator(btn)).toBeHidden();
  }
  // the large AI card stays out of the way; Task Analysis keeps its own small button
  await expect(page.locator('#task-analysis-tab [data-ai-toggle]')).toHaveCount(0);

  await page.evaluate(() => window.switchTab('clustering-tab'));
  await toggle(page, 'clustering-tab').click();
  await expect(page.locator('#aiSuggestClustersBtn')).toBeVisible();
  await expect(page.locator('#aiGenCriteriaBtn')).toBeVisible();
  await loadProject(page, fixture('sample-project.json'), 'Again_2026-01-01_00-00.json');
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await expect(toggle(page, 'clustering-tab')).toHaveAttribute('aria-expanded', 'true');
  // tabs never touched keep following their content
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  await expect(toggle(page, 'module-mapping-tab')).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
});

test('the Helper opens a folded card before spotlighting its button', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(page.locator('#aiGenerateBtn')).toBeHidden();

  await page.evaluate(async () => (await import('./helper_wizard.js')).openHelperWizard(1));
  await page.locator('#helperWizard [data-hw-go]').click();
  await expect(toggle(page, 'duties-tab')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#aiGenerateBtn')).toBeVisible();
  await expect(page.locator('#aiGenerateBtn')).toHaveClass(/hw-spot/);
  // opened for the Helper, not a choice of the user's
  expect(await page.evaluate(() => localStorage.getItem('dacum_ai_cards'))).toBeNull();
  expect(errors).toEqual([]);
});

test('Arabic, 360 px, touch: translated, fixed size, no horizontal scroll', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  for (const tab of Object.keys(TABS)) {
    await page.evaluate(id => window.switchTab(id), tab);
    const t = toggle(page, tab);
    await expect(t).toContainText('ذكاء اصطناعي');
    await expect(t).toHaveAttribute('title', 'إظهار أدوات الذكاء الاصطناعي لهذا التبويب');
    const box = await t.boundingBox();
    expect(Math.round(box.height)).toBe(26);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await t.click();
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    await expect(t).toHaveAttribute('title', 'إخفاء أدوات الذكاء الاصطناعي لهذا التبويب');
    await expect(page.locator(TABS[tab].btn)).toBeVisible();
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});
