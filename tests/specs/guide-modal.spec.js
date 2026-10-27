// The "?" guide dialog: styled from the stylesheet (no inline style), Tab stays
// inside, Esc closes and focus returns to the "?" button.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

test.describe('guide dialog', () => {
  test('stylesheet-styled, focus kept inside, focus restored on close', async ({ page }) => {
    const errors = await openApp(page, { lang: 'en' });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('module-mapping-tab'));
    const btn = page.locator('.lomm-guide-btn[data-guide="mm"]').first();
    await btn.focus();
    await page.keyboard.press('Enter');
    const dlg = page.locator('#lommGuideModal');
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveClass(/lomm-guide-overlay/);
    expect(await dlg.getAttribute('style')).toBeNull();
    expect(await dlg.locator('[style]').count()).toBe(0);
    expect(await dlg.evaluate(e => getComputedStyle(e).position)).toBe('fixed');
    // Tab / Shift+Tab never leave the dialog
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#lommGuideModal'))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#lommGuideModal'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('lomm-guide-btn'))).toBe(true);
    expect(errors).toEqual([]);
  });
});
