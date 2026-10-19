// 3.126.0: the collapsed side navigation (icon rail) scrolls on a short
// window, and its tooltips are drawn outside it, beside the icon.
const { test, expect } = require('@playwright/test');
const { openApp } = require('../helpers');

for (const lang of ['en', 'ar']) {
  test(`collapsed rail scrolls; tooltip beside the icon (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    const errors = await openApp(page, { lang });
    const sb = page.locator('.dps-sidebar');
    if (!(await sb.evaluate(el => el.classList.contains('dps-collapsed')))) await page.click('#dpsCollapseBtn');
    await expect(sb).toHaveClass(/dps-collapsed/);
    const m = await sb.evaluate(el => ({ oy: getComputedStyle(el).overflowY, over: el.scrollHeight > el.clientHeight }));
    expect(m).toEqual({ oy: 'auto', over: true });
    await sb.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await sb.evaluate(el => el.scrollTop)).toBeGreaterThan(0);

    const last = page.locator('.dps-sidebar .dps-nav-item[data-tooltip]').last();
    await last.scrollIntoViewIfNeeded();
    await last.hover();
    const tip = page.locator('.dps-rail-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(await last.getAttribute('data-tooltip'));
    const [t, s] = [await tip.boundingBox(), await sb.boundingBox()];
    if (lang === 'ar') expect(t.x + t.width).toBeLessThanOrEqual(s.x + 1);
    else expect(t.x).toBeGreaterThanOrEqual(s.x + s.width - 1);
    await page.mouse.move(700, 300);
    await expect(tip).toBeHidden();
    expect(errors).toEqual([]);
  });
}
