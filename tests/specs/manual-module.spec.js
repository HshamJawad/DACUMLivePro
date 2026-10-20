// 3.133.0: a whole module typed in by hand on the Module Mapping tab (from
// an existing curriculum), and the card's 🚀 sending that one module only.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const handoff = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dacum_modules_export')));
const modules = (page) => page.evaluate(async () => (await import('./state.js')).appState.moduleMappingData.modules);

for (const lang of ['en', 'ar']) {
  test(`manual module: typed in, kept by regeneration, sent alone (${lang})`, async ({ page }) => {
    if (lang === 'ar') await page.setViewportSize({ width: 360, height: 800 });
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => { window.switchTab('module-mapping-tab'); window.open = () => null; window.prompt = () => 'Electrical installation (2019)'; });
    const before = (await modules(page)).length;

    await page.click('#btnAddManualModule');
    const card = page.locator('#modulesContainer .module-item.mm-manual');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.mm-lo-statement')).toBeFocused();
    await card.locator('.mm-lo-statement').fill('Install a distribution board');
    await card.locator('.mm-lo-statement').blur();
    await card.locator('.mm-pc-text').first().fill('Board is fixed level and secure');
    await card.locator('.mm-pc-text').first().press('Enter');            // Enter adds the next criterion
    await expect(card.locator('.mm-pc-text')).toHaveCount(2);
    await expect(card.locator('.mm-pc-text').nth(1)).toBeFocused();
    await card.locator('.mm-pc-text').nth(1).fill('Circuits are labelled');
    await card.locator('.mm-pc-text').nth(1).blur();
    // optional task link on the first criterion
    const taskId = await card.locator('.mm-pc-task').first().locator('option').nth(1).getAttribute('value');
    await card.locator('.mm-pc-task').first().selectOption(taskId);
    // a second outcome, moved above the first
    await page.locator('#modulesContainer .mm-manual [data-action="mm-add-lo"]').click();
    await page.locator('#modulesContainer .mm-manual .mm-lo-statement').nth(1).fill('Test the installation');
    await page.locator('#modulesContainer .mm-manual .mm-lo-statement').nth(1).blur();
    await page.locator('#modulesContainer .mm-manual [data-action="mm-move-lo"][data-dir="-1"]').nth(1).click();

    let m = (await modules(page)).find(x => x.manual);
    expect(m.title).toBe('Electrical installation (2019)');
    expect(m.learningOutcomes.map(o => [o.number, o.statement])).toEqual([['LO1', 'Test the installation'], ['LO2', 'Install a distribution board']]);
    expect(m.learningOutcomes[1].linkedCriteria.map(pc => [pc.id, pc.text, pc.taskId])).toEqual([
      ['2.1', 'Board is fixed level and secure', taskId], ['2.2', 'Circuits are labelled', null]]);

    // Not a Learning Outcome of the chart; named in the coverage matrix.
    const loIds = await page.evaluate(async () => (await import('./state.js')).appState.learningOutcomesData.outcomes.map(o => o.id));
    expect(loIds.some(id => m.learningOutcomes.some(o => o.id === id))).toBe(false);
    await expect(page.locator('#coverageMatrixSection .cov-manual-note')).toHaveCount(1);

    // "Send all", then the manual card's 🚀: only that module goes.
    await page.evaluate(async () => (await import('./module_mapping.js')).openModuleBuilderFromMapping());
    expect((await handoff(page)).modules.length).toBe(before + 1);
    await card.locator('[data-action="build-module-in-builder"]').click();
    const one = await handoff(page);
    expect(one.scope).toBe('module');
    expect(one.modules.map(x => x.moduleId)).toEqual([m.id]);
    expect(one.modules[0].source).toBe('manual');
    expect(one.modules[0].learningOutcomes[1].performanceCriteria.map(pc => pc.text)).toEqual(['Board is fixed level and secure', 'Circuits are labelled']);
    expect(one.modules[0].sourceTaskIds).toEqual([taskId]);

    // A chart module's 🚀 also sends that module alone.
    const first = (await modules(page)).find(x => !x.manual);
    await page.locator(`#modulesContainer [data-action="build-module-in-builder"][data-module-id="${first.id}"]`).click();
    expect((await handoff(page)).modules.map(x => x.moduleId)).toEqual([first.id]);

    // "One module per outcome", replacing modules: the chart's are
    // replaced, never this one.
    await page.evaluate(async () => {
      const cb = document.getElementById('mmOptKeep');
      cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
      (await import('./module_mapping_ai.js')).generateOneModulePerOutcome();
    });
    await expect.poll(async () => (await modules(page)).filter(x => !x.manual).length)
      .toBe(loIds.length);
    m = (await modules(page)).find(x => x.manual);
    expect(m && m.learningOutcomes.length).toBe(2);
    const ids = (await modules(page)).map(x => x.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Deleting a criterion.
    await page.locator('#modulesContainer .mm-manual [data-action="mm-del-pc"]').last().click();
    expect((await modules(page)).find(x => x.manual).learningOutcomes[1].linkedCriteria.length).toBe(1);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
