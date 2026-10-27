// 3.140.2 — "too many outcomes in one module?": a calm note on the module card
// (from 7 outcomes) and a section in the Module Mapping guide, EN / FR / AR.
// The note is a suggestion: it blocks nothing and changes no data.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture, state } = require('../helpers');

/** Give the sample project's first module `n` outcomes (the fixture has 3). */
async function setOutcomeCount(page, n) {
  await page.evaluate(async (n) => {
    const { appState } = await import('./state.js');
    const lo = appState.learningOutcomesData;
    const base = lo.outcomes[0];
    while (lo.outcomes.length < n) {
      const k = lo.outcomes.length + 1;
      lo.outcomes.push(Object.assign(JSON.parse(JSON.stringify(base)), { id: 'lo_' + k, number: 'LO' + k, statement: 'Perform outcome ' + k }));
    }
    appState.moduleMappingData.modules[0].learningOutcomes = lo.outcomes.slice(0, n).map(o => ({ id: o.id }));
    (await import('./learning_outcomes.js')).renderModules();
  }, n);
}

test('the module card says nothing at 3 or 6 outcomes and speaks from 7', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  const note = page.locator('#modulesContainer .mod-size-note');

  await expect(note).toHaveCount(0);                       // 3 outcomes: the fixture as it is
  await setOutcomeCount(page, 6);
  await expect(page.locator('#modulesContainer .module-los-list > *')).toHaveCount(6);
  await expect(note).toHaveCount(0);                       // 6 is still fine

  await setOutcomeCount(page, 7);
  await expect(note).toHaveCount(1);
  await expect(note).toContainText('This module has 7 learning outcomes; 2–4 is usual.');
  await expect(note).toContainText('Merge:');
  await expect(note).toContainText('Split:');

  // It blocks nothing and changes nothing: the seven outcomes are still there and editable.
  expect(await state(page, 's => s.moduleMappingData.modules[0].learningOutcomes.length')).toBe(7);
  await expect(page.locator('#modulesContainer .btn-remove-lo').first()).toBeEnabled();

  // Back to 4 (e.g. after splitting): the note goes away on its own.
  await setOutcomeCount(page, 4);
  await expect(note).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const [lang, head, mergeWord, helpHead] of [
  ['fr', 'Taille du module', 'Fusionner', 'Trop de résultats dans un module ?'],
  ['ar', 'حجم الوحدة', 'الدمج', 'محصلات كثيرة في وحدة واحدة؟'],
]) {
  test(`the note and the guide section are translated (${lang})`, async ({ page }) => {
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('module-mapping-tab'));
    await setOutcomeCount(page, 8);
    const note = page.locator('#modulesContainer .mod-size-note');
    await expect(note).toContainText(head);
    await expect(note).toContainText(mergeWord);
    await expect(note).toContainText('8');

    // Phone width: the note stays inside its card.
    await page.setViewportSize({ width: 360, height: 900 });
    const fits = await page.evaluate(() => {
      const n = document.querySelector('#modulesContainer .mod-size-note').getBoundingClientRect();
      const c = document.querySelector('#modulesContainer .module-item').getBoundingClientRect();
      return n.left >= c.left - 1 && n.right <= c.right + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    expect(fits).toBe(true);

    await page.locator('.lomm-guide-btn[data-guide="mm"]').first().click();
    await expect(page.locator('#lommGuideModal')).toContainText(helpHead);
    expect(errors).toEqual([]);
  });
}

test('the guide section is in English too', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  await page.locator('.lomm-guide-btn[data-guide="mm"]').first().click();
  const modal = page.locator('#lommGuideModal');
  await expect(modal).toContainText('Too many outcomes in one module?');
  await expect(modal).toContainText('Try merging first.');
  await expect(modal).toContainText('Do not split just to reach a number');
  expect(errors).toEqual([]);
});
