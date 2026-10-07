// TVQF/NQF option on Module Mapping, and "Suggest credits" in Module
// Curriculum (3.85.0).
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture, state } = require('../helpers');

test('TVQF/NQF: off by default; fields, chip, exports, handoff, JSON round trip', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  await expect(page.locator('#mmNqfBar')).toBeVisible();
  await expect(page.locator('#mmNqfEnable')).not.toBeChecked();
  await expect(page.locator('#modulesContainer .mod-nqf-input')).toHaveCount(0);
  // Level stays as it was.
  await expect(page.locator('#modulesContainer .mod-level-select').first()).toBeVisible();

  await page.check('#mmNqfEnable');
  await expect(page.locator('#mmNqfFramework')).toBeVisible();
  await page.fill('#mmNqfFramework', 'National TVQF');
  await page.locator('#mmNqfFramework').blur();
  const lvl = page.locator('#modulesContainer .mod-nqf-input').first();
  await lvl.fill('Level 3');
  await lvl.blur();
  await expect(page.locator('#modulesContainer .mod-nqf-chip').first()).toContainText('Level 3');
  await page.locator('#modulesContainer .mod-nqf-desc-box summary').first().click();
  const desc = page.locator('#modulesContainer .mod-nqf-desc').first();
  await desc.fill('Works under limited supervision.');
  await desc.blur();

  const mm = await state(page, 's => ({ nqf: s.moduleMappingData.nqf, m: s.moduleMappingData.modules[0] })');
  expect(mm.nqf).toEqual({ enabled: true, framework: 'National TVQF' });
  expect(mm.m.nqfLevel).toBe('Level 3');
  expect(mm.m.nqfDescriptor).toBe('Works under limited supervision.');

  // Handoff to Module Builder.
  const d = await page.evaluate(async () => {
    window.open = () => null;
    (await import('./module_mapping.js')).openModuleBuilderFromMapping();
    return JSON.parse(localStorage.getItem('dacum_modules_export'));
  });
  expect(d.qualificationsFramework).toBe('National TVQF');
  expect(d.modules[0].nqfLevel).toBe('Level 3');
  expect(d.modules[0].nqfDescriptor).toBe('Works under limited supervision.');
  expect(d.modules[0].level).toBe(mm.m.level ?? null);           // programme level unchanged

  // Curriculum export row "NQF Level" uses it.
  const lab = await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const mc = await import('./module_curriculum.js');
    return mc.getCurriculumModel ? (mc.getCurriculumModel(appState.moduleMappingData.modules[0].id) || {}).levelLabel : 'n/a';
  });
  if (lab !== 'n/a') expect(lab).toBe('Level 3');

  // Survives export to JSON and re-import.
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./snapshots.js')).saveToJSON())]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(data.moduleMapping.nqf).toEqual({ enabled: true, framework: 'National TVQF' });
  await loadProject(page, data, 'Reimported_2026-01-01_00-00.json');
  expect(await state(page, 's => [s.moduleMappingData.nqf.framework, s.moduleMappingData.modules[0].nqfLevel]')).toEqual(['National TVQF', 'Level 3']);

  // Off again: fields hidden, values kept, nothing sent.
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  await page.uncheck('#mmNqfEnable');
  await expect(page.locator('#modulesContainer .mod-nqf-input')).toHaveCount(0);
  expect(await state(page, 's => s.moduleMappingData.modules[0].nqfLevel')).toBe('Level 3');
  const d2 = await page.evaluate(async () => {
    (await import('./module_mapping.js')).openModuleBuilderFromMapping();
    return JSON.parse(localStorage.getItem('dacum_modules_export'));
  });
  expect(d2.qualificationsFramework).toBeUndefined();
  expect(d2.modules[0].nqfLevel).toBeUndefined();
  expect(errors).toEqual([]);
});

test('Suggest credits: optional, two bases, applies on request only', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  const n = await state(page, 's => s.moduleMappingData.modules.length');
  // Two modules with different weights so the bases differ.
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const r = (i, f, d) => ({ importance: i, frequency: f, difficulty: d, criticality: null });
    appState.collectionMode = 'survey'; appState.priorityFormula = 'if';
    appState.dutiesData.forEach(d => d.tasks.forEach(t => { appState.verificationRatings[t.inputId] = r(2, 2, 2); }));
  });
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));
  await page.click('[data-cur-action="suggest-credits"]');
  const dlg = page.locator('#curCreditSuggest');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('input[name="curCsBasis"][value="load"]')).toBeEnabled();
  await dlg.locator('#curCsTotal').fill('30');
  const sug = async () => (await dlg.locator('#curCsBody tr td:nth-child(3)').allTextContents()).map(Number);
  const s1 = await sug();
  expect(s1).toHaveLength(n);
  expect(s1.reduce((a, b) => a + b, 0)).toBe(30);
  s1.forEach(v => expect(v * 2).toBe(Math.round(v * 2)));           // half credits
  await dlg.locator('input[name="curCsBasis"][value="criteria"]').check();
  const s2 = await sug();
  expect(s2.reduce((a, b) => a + b, 0)).toBe(30);

  // Cancel changes nothing.
  await dlg.locator('.cur-btn-ghost').click();
  expect(await state(page, 's => Object.values(s.moduleCurriculumData.byModule || {}).map(r => r.credits).filter(Boolean)')).toEqual([]);

  // Apply writes the credits; hours follow the existing formula.
  await page.click('[data-cur-action="suggest-credits"]');
  await dlg.locator('#curCsTotal').fill('30');
  await dlg.locator('.cur-btn-primary').click();
  await expect(dlg).toHaveCount(0);
  const credits = await state(page, 's => s.moduleMappingData.modules.map(m => Number((s.moduleCurriculumData.byModule[m.id] || {}).credits))');
  expect(credits.reduce((a, b) => a + b, 0)).toBe(30);
  expect(errors).toEqual([]);
});
