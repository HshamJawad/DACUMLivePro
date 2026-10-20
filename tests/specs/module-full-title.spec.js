// 3.131.0: each module card in Module Mapping has a «Full module title»
// beside its working title. It is kept, sent to Module Builder with the
// category, and printed as the module title in the curriculum documents.
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

for (const lang of ['en', 'ar']) {
  test(`full module title: edited on the card, in the handoff and the curriculum (${lang})`, async ({ page }) => {
    if (lang === 'ar') await page.setViewportSize({ width: 360, height: 800 });
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('module-mapping-tab'));
    const input = page.locator('#modulesContainer .mod-fulltitle-input').first();
    await expect(input).toBeVisible();
    if (lang === 'ar') await expect(page.locator('#modulesContainer .mod-fulltitle-field span').first()).toHaveText('العنوان الكامل للوحدة');
    await input.fill('Implementing core work processes in a residential workshop');
    await input.press('Enter');
    const m = await page.evaluate(async () => (await import('./state.js')).appState.moduleMappingData.modules[0]);
    expect(m.fullTitle).toBe('Implementing core work processes in a residential workshop');

    // A category too, so both reach Module Builder.
    await page.locator('#modulesContainer .mod-cat-select').first().selectOption('core');

    const [dl] = await Promise.all([page.waitForEvent('download'),
      page.evaluate(async () => (await import('./modules.js')).exportModuleMappingJSON())]);
    const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    expect(json.modules[0].fullTitle).toBe('Implementing core work processes in a residential workshop');
    expect(json.modules[0].category.id).toBe('core');
    expect(json.modules[0].moduleTitle).toBe(m.title);

    const cm = await page.evaluate(async (id) => (await import('./module_curriculum.js')).getCurriculumModel(id), m.id);
    expect(cm.title).toBe('Implementing core work processes in a residential workshop');

    // Emptied: back to the working title.
    await page.locator('#modulesContainer .mod-fulltitle-input').first().fill('');
    await page.locator('#modulesContainer .mod-fulltitle-input').first().press('Enter');
    expect(await page.evaluate(async () => (await import('./state.js')).appState.moduleMappingData.modules[0].fullTitle)).toBeUndefined();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
