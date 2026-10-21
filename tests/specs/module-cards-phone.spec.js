// 3.133.1: Module Mapping cards on a phone — wide enough to use, and
// nothing inside a card (fields, lists, buttons) past its edge.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

for (const lang of ['en', 'ar']) {
  for (const width of [360, 412]) {
    test(`module cards fit a ${width} px phone (${lang})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors = await openApp(page, { lang });
      await loadProject(page, fixture('sample-project.json'));
      await page.evaluate(() => { window.switchTab('module-mapping-tab'); window.open = () => null; window.prompt = () => 'Module 1'; });
      await page.click('#btnAddManualModule');                    // a hand-typed card has the most controls
      await expect(page.locator('#modulesContainer .module-item.mm-manual')).toHaveCount(1);
      const r = await page.evaluate(() => {
        const out = [];
        let minW = Infinity;
        document.querySelectorAll('#modulesContainer .module-item').forEach(c => {
          const b = c.getBoundingClientRect();
          minW = Math.min(minW, b.width);
          c.querySelectorAll('button, select, input, textarea').forEach(e => {
            const x = e.getBoundingClientRect();
            if (x.width && (x.left < b.left - 1 || x.right > b.right + 1)) out.push(e.className || e.tagName);
          });
        });
        return { out, minW, sw: document.documentElement.scrollWidth, vw: window.innerWidth };
      });
      expect(r.out).toEqual([]);
      expect(r.minW).toBeGreaterThan(r.vw * 0.7);                   // was about 60 % of the screen
      expect(r.sw).toBeLessThanOrEqual(r.vw + 1);
      // each label above its own field: the category list as wide as the code box
      const cat = await page.locator('#modulesContainer .mm-manual .mod-cat-select').boundingBox();
      const code = await page.locator('#modulesContainer .mm-manual .mod-code-input').boundingBox();
      expect(Math.abs(cat.width - code.width)).toBeLessThan(2);
      expect(errors).toEqual([]);
    });
  }
}

test('desktop: the module fields stay on one line as before', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => { window.switchTab('module-mapping-tab'); });
  const f = page.locator('#modulesContainer .module-item').first().locator('.mod-meta-field').filter({ has: page.locator('.mod-code-input') });
  const label = await f.locator('> span').boundingBox();
  const input = await f.locator('.mod-code-input').boundingBox();
  expect(Math.abs((label.y + label.height / 2) - (input.y + input.height / 2))).toBeLessThan(8);
  expect(errors).toEqual([]);
});
