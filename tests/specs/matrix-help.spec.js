// 3.122.0: a "?" in the title bar of the coverage matrix and of the
// curriculum matrix opens its own guide — without folding or unfolding
// the card — in every language.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const CASES = {
  en: { cov: 'How to close the gaps', cmx: 'How the tool suggests the levels' },
  fr: { cov: 'Comment combler les lacunes', cmx: 'Comment l’outil propose les degrés' },
  ar: { cov: 'كيف تعالج الفجوات', cmx: 'كيف تقترح الأداة الدرجات؟' },
};

for (const [lang, want] of Object.entries(CASES)) {
  test(`matrix help buttons (${lang})`, async ({ page }) => {
    if (lang === 'ar') await page.setViewportSize({ width: 360, height: 780 });
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('module-mapping-tab'));

    for (const [sec, guide, modal, text] of [
      ['#coverageMatrixSection', 'coverage', '#coverageHelpModal', want.cov],
      ['#curriculumMatrixSection', 'cmx', '#cmxHelpModal', want.cmx],
    ]) {
      const card = page.locator(sec);
      const det = card.locator('details').first();
      const wasOpen = await det.evaluate(d => d.open);
      const btn = card.locator(`[data-matrix-help="${guide}"]`);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
      await btn.click();
      await expect(page.locator(modal)).toBeVisible();
      await expect(page.locator(modal)).toContainText(text);
      expect(await det.evaluate(d => d.open)).toBe(wasOpen);   // the card did not fold / unfold
      await page.locator(`${modal} [data-help-close]`).click();
      await expect(page.locator(modal)).toHaveCount(0);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('the Helper wizard lists both guides on the Module Mapping step', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  const titles = await page.evaluate(async () =>
    (await import('./events.js')).getTabHelpGuides(['mm', 'coverage', 'cmx']).map(g => g.title));
  expect(titles).toHaveLength(3);
  expect(titles[1]).toContain('Performance criteria coverage');
  expect(titles[2]).toContain('Curriculum matrix');
  expect(errors).toEqual([]);
});
