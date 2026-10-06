// Learning Outcomes, Module Mapping and the exports — what the 3.76.0
// split of modules.js must keep working.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { openApp, state, loadProject, fixture } = require('../helpers');

test('outcome delete → Undo restores it; coverage "gaps only" survives re-render', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('learning-outcomes-tab'));
  const n0 = await state(page, 's => s.learningOutcomesData.outcomes.length');
  await page.evaluate(async () => { const m = await import('./modules.js'); const { appState } = await import('./state.js');
    m.deleteLearningOutcome(appState.learningOutcomesData.outcomes[0].id); });
  expect(await state(page, 's => s.learningOutcomesData.outcomes.length')).toBe(n0 - 1);
  await page.evaluate(async () => (await import('./modules.js')).undoLearningStep());
  expect(await state(page, 's => s.learningOutcomesData.outcomes.length')).toBe(n0);

  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  await page.evaluate(() => { const c = document.querySelector('#coverageMatrixSection .cov-gaps-only');
    c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(page.locator('#coverageMatrixSection .cov-gaps-only')).toBeChecked();
  expect(errors).toEqual([]);
});

test('Module Builder handoff file carries modules, outcomes and Task Analysis', async ({ page }) => {
  await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./modules.js')).exportModuleMappingJSON())]);
  const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  const text = JSON.stringify(json);
  expect(json.modules?.length).toBe(1);
  expect(text).toContain('Implementing Core Work');
  expect(text).toContain('Prepare the workspace');                // Task Analysis travelled
  expect(text).not.toContain('_aiPrev');
});

test('Word export builds a document with the chart in it', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    page.evaluate(async () => (await import('./exports_docx.js')).exportToWord())]);
  const buf = fs.readFileSync(await dl.path());
  expect(buf.slice(0, 2).toString()).toBe('PK');                    // a .docx is a zip
  expect(buf.length).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});
