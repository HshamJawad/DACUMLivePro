// 3.136.0: the status message floats over the page (like Module Builder's), so it is
// seen wherever the user has scrolled, and it can be dismissed with a click.
const { test, expect } = require('@playwright/test');
const { openApp } = require('../helpers');

test('status message floats in view, restarts its timer, and a click dismisses it', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const errors = await openApp(page);
  // Scroll to the top of a long page: the old message sat far below.
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.evaluate(async () => (await import('./renderer.js')).showStatus('Saved ✓', 'success'));
  const s = page.locator('#status');
  await expect(s).toBeVisible();
  await expect(s).toHaveCSS('position', 'fixed');
  const box = await s.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(640);   // inside the viewport
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);

  // A second message replaces the first and is not cut short by the first one's timer.
  await page.evaluate(async () => {
    const { showStatus } = await import('./renderer.js');
    showStatus('first', 'success');
    await new Promise(r => setTimeout(r, 2500));
    showStatus('second', 'info');
  });
  await page.waitForTimeout(2000);                       // past the first message's 4 s
  await expect(s).toHaveText('second');
  await expect(s).toBeVisible();
  await expect(s).toHaveClass(/info/);

  // Click dismisses.
  await s.click();
  await expect(s).toBeHidden();
  expect(errors).toEqual([]);
});
