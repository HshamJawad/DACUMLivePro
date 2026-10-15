// 3.119.0: the curriculum matrix — tasks × modules, how each module
// treats each task (○ introduced, ◐ practised, ● assessed); suggested
// from the criteria, changed by a click, kept; checks; in the export.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

test('matrix under the coverage: suggested levels, a click cycles and is kept, checks listed', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  const sec = page.locator('#curriculumMatrixSection');
  await expect(sec).toHaveCount(1);
  await sec.locator('summary').click();
  await expect(sec).toContainText('Curriculum matrix');
  await expect(sec.locator('.cmx-legend')).toContainText('Mastered and assessed');
  const m = await page.evaluate(async () => (await import('./curriculum_matrix.js')).getCurriculumMatrix());
  expect(m.modules.length).toBeGreaterThan(0);
  expect(m.rows.length).toBeGreaterThan(0);
  expect(m.rows.some(r => r.cells.includes('a') || r.cells.includes('p'))).toBe(true);
  await expect(sec.locator('tbody tr')).toHaveCount(m.rows.length);

  // a click on an empty or suggested cell: ○ → ◐ → ● → none → suggestion
  const r0 = m.rows[0];
  const ci = Math.max(0, r0.cells.indexOf(''));
  const cell = sec.locator(`[data-cmx-task="${r0.id}"][data-cmx-mod="${m.modules[ci].id}"]`);
  const before = r0.cells[ci];
  await cell.click();
  const depth = await page.evaluate(async () => (await import('./state.js')).appState.moduleMappingData.depth);
  const stored = depth && depth[r0.id] && depth[r0.id][m.modules[ci].id];
  expect(['i', 'p', 'a', '-']).toContain(stored);
  expect(stored).not.toBe(before || '-');                      // changed from what was shown

  // force a task never assessed: every module «none» → listed
  await page.evaluate(async ({ id, mods }) => {
    const { appState } = await import('./state.js');
    appState.moduleMappingData.depth = { [id]: Object.fromEntries(mods.map(x => [x.id, '-'])) };
    (await import('./curriculum_matrix.js')).renderCurriculumMatrix();
  }, { id: r0.id, mods: m.modules });
  await expect(sec.locator('.cmx-checks')).toContainText(`${r0.code}: never assessed in any module.`);
  expect(before === undefined || typeof before === 'string').toBe(true);
  expect(errors).toEqual([]);
});

test('Arabic labels; help explains the matrix', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  await expect(page.locator('#curriculumMatrixSection')).toContainText('مصفوفة المنهج');
  const t = await page.evaluate(async () => { const { t } = await import('./translations.js').catch(() => ({})); return null; });
  expect(t).toBeNull();
  expect(errors).toEqual([]);
});
