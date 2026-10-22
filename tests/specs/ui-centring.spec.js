// 3.134.3: the Live Workshop card in the AI card's colours, its links
// inside it on a phone, and the Skills Level Matrix × / ✕ buttons square
// with the glyph centred (desktop and touch).
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');
const API = 'https://live-session-backend-production.up.railway.app/api/';

const glyphOffsets = (page, sels) => page.evaluate((sels) => sels.map(sel => {
  const b = document.querySelector(sel);
  const box = b.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(b); const t = rg.getBoundingClientRect();
  return { sel, w: box.width, h: box.height, dx: Math.abs((t.left + t.width / 2) - (box.left + box.width / 2)),
           dy: Math.abs((t.top + t.height / 2) - (box.top + box.height / 2)) };
}), sels);

for (const [width, touch] of [[1280, false], [412, true]]) {
  test(`Skills Level Matrix: × / ✕ square and centred (${width} px${touch ? ', touch' : ''})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = await openApp(page, { lang: 'ar' });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('occupational-standard-tab'));
    await expect(page.locator('#skillsLevelContainer .mx-row-x').first()).toBeVisible();
    for (const o of await glyphOffsets(page, ['#skillsLevelContainer .mx-lv-x', '#skillsLevelContainer .mx-mini.mx-del', '#skillsLevelContainer .mx-row-x'])) {
      expect(o.w, o.sel).toBe(o.h);
      expect(o.dx, o.sel).toBeLessThan(1.5);
      expect(o.dy, o.sel).toBeLessThan(1.5);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('Live Workshop card: the AI card\'s colours; both links inside it on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 900 });
  await page.route(API + '**', r => r.fulfill({ json: { success: true } }));
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('verification-tab'));
  await page.evaluate(async () => (await import('./workshop.js')).lwFinalizeAndCreateSession());
  await expect(page.locator('.lw-session-card')).toBeVisible();
  const r = await page.evaluate(() => {
    const card = document.querySelector('.lw-session-card');
    const ai = document.querySelector('.ai-gen-card');
    const c = card.getBoundingClientRect();
    const inside = ['lwParticipantLink', 'lwExternalLink'].map(id => { const l = document.getElementById(id).getBoundingClientRect(); return l.left >= c.left && l.right <= c.right; });
    return { same: getComputedStyle(card).backgroundImage === getComputedStyle(ai).backgroundImage, inside };
  });
  expect(r.same).toBe(true);
  expect(r.inside).toEqual([true, true]);
  expect(errors).toEqual([]);
});
