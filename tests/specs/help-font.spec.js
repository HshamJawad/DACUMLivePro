// 3.122.1: help windows and the other built-in dialogs use the
// interface font (Cairo in Arabic) — the same as the tabs — instead of
// a hard-coded 'Segoe UI'.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const fontOf = (page, sel) => page.locator(sel).first().evaluate(e => getComputedStyle(e).fontFamily);

for (const lang of ['ar', 'en']) {
  test(`help windows use the tabs' font (${lang})`, async ({ page }) => {
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    const tabFont = await fontOf(page, '.tab[data-tab="verification-tab"]');
    if (lang === 'ar') expect(tabFont).toContain('Cairo');

    // A tab guide (shared help window) and a card guide (matrix "?").
    await page.evaluate(async () => (await import('./events.js')).openHelpGuide('verification'));
    await expect(page.locator('#taskVerificationHelpModal p').first()).toBeVisible();
    expect(await fontOf(page, '#taskVerificationHelpModal p')).toBe(tabFont);
    expect(await fontOf(page, '#taskVerificationHelpModal [data-help-close]')).toBe(tabFont);
    await page.locator('#taskVerificationHelpModal [data-help-close]').click();

    await page.evaluate(() => window.switchTab('module-mapping-tab'));
    await page.locator('[data-matrix-help="cmx"]').click();
    expect(await fontOf(page, '#cmxHelpModal li')).toBe(tabFont);
    expect(errors).toEqual([]);
  });
}
