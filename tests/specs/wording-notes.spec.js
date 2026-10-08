// Wording notes (3.88.0): soft suggestions under a competency name, its
// typed performance criteria and each learning outcome. They never block
// or change anything. Grammar checks run on English content only; the
// repeat / length checks run in every language.
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture } = require('../helpers');

test('the rules (English content)', async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(async () => {
    const m = await import('./wording_check.js');
    const { appState } = await import('./state.js');
    appState.contentLanguages = null;
    const n = (a) => a.length;
    const out = {
      loOk:      n(m.outcomeIssues('Batch concrete according to specifications')),
      loWill:    n(m.outcomeIssues('The learner will be able to install cables')),
      loKnow:    n(m.outcomeIssues('Understand safety rules on site')),
      loGerund:  n(m.outcomeIssues('Installing cable trays to drawings')),
      loBring:   n(m.outcomeIssues('Bring materials to the work area safely')),
      loPurpose: n(m.outcomeIssues('Clean the mixer to ensure quality')),
      loLong:    n(m.outcomeIssues('Mix ' + 'concrete '.repeat(22))),
      loArabic:  n(m.outcomeIssues('يفهم قواعد السلامة')),
      pcOk:      n(m.criterionIssues('Concrete is mixed manually according to mix design')),
      pcActive:  n(m.criterionIssues('Uses tools safely')),
      pcKnow:    n(m.criterionIssues('Worker understands the drawings')),
      nameOk:    n(m.competencyNameIssues([{ name: 'Batch concrete according to specifications' }], 0)),
      nameDup:   n(m.competencyNameIssues([{ name: 'Batch concrete' }, { name: 'batch  concrete.' }], 1)),
      nameDupAr: n(m.competencyNameIssues([{ name: 'تجهيز الخرسانة' }, { name: 'تجهيز الخرسانة' }], 1)),
      namePh:    n(m.competencyNameIssues([{ name: 'Cluster 3' }], 0)),
      nameGer:   n(m.competencyNameIssues([{ name: 'Implementing Hardware Procedures' }], 0)),
    };
    // A French content language switches the grammar checks off.
    appState.contentLanguages = { original: 'en', active: 'fr', versions: {}, foreign: {}, view: null };
    out.frSkips = n(m.outcomeIssues('The learner will understand'));
    appState.contentLanguages = null;
    return out;
  });
  expect(r).toEqual({ loOk: 0, loWill: 1, loKnow: 1, loGerund: 1, loBring: 0, loPurpose: 1, loLong: 1, loArabic: 0,
    pcOk: 0, pcActive: 1, pcKnow: 1, nameOk: 0, nameDup: 1, nameDupAr: 1, namePh: 0, nameGer: 1, frSkips: 0 });
  expect(errors).toEqual([]);
});

test('notes on screen: criteria, competency name, learning outcome — nothing blocked', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('clustering-tab'));
  const cid = await state(page, 's => s.clusteringData.clusters[0].id');
  await expect(page.locator(`#wcrit_${cid}`)).toBeHidden();             // fixture criteria are fine

  // A criterion not written as a result → a note with its number.
  const ta = page.locator(`#criteria_${cid}`);
  const before = await ta.inputValue();
  await ta.fill(before + '\nUses tools safely');
  await ta.blur();
  await expect(page.locator(`#wcrit_${cid}`)).toBeVisible();
  await expect(page.locator(`#wcrit_${cid}`)).toContainText('is/are');
  expect(JSON.stringify(await state(page, 's => s.clusteringData.clusters[0].performanceCriteria'))).toContain('Uses tools safely');

  // Same name as C1 → noted under C2, gone once fixed.
  const cid1 = await state(page, 's => s.clusteringData.clusters[1].id');
  await page.evaluate(async () => {
    const { appState } = await import('./state.js'); const c = appState.clusteringData.clusters;
    c[1].__n = c[1].name; c[1].name = c[0].name; (await import('./clusters.js')).renderClusters();
  });
  await expect(page.locator(`#wname_${cid1}`)).toContainText('C1');
  await page.evaluate(async () => {
    const { appState } = await import('./state.js'); const c = appState.clusteringData.clusters[1];
    c.name = c.__n; delete c.__n; (await import('./clusters.js')).renderClusters();
  });
  await expect(page.locator(`#wname_${cid1}`)).toBeHidden();

  // Learning outcome: refreshed when the field is left.
  await page.evaluate(() => window.switchTab('learning-outcomes-tab'));
  const lid = await state(page, 's => s.learningOutcomesData.outcomes[0].id');
  const lo = page.locator(`#textarea_${lid}`);
  await lo.fill('The learner will be able to batch concrete');
  await lo.blur();
  await expect(page.locator(`#wlo_${lid}`)).toContainText('The learner will be able to');
  expect(await state(page, 's => s.learningOutcomesData.outcomes[0].statement')).toBe('The learner will be able to batch concrete');
  await lo.fill('Batch concrete according to specifications');
  await lo.blur();
  await expect(page.locator(`#wlo_${lid}`)).toBeHidden();
  expect(errors).toEqual([]);
});

test('Arabic interface, 360 px: notes translated, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('learning-outcomes-tab'));
  const lid = await state(page, 's => s.learningOutcomesData.outcomes[0].id');
  const lo = page.locator(`#textarea_${lid}`);
  await lo.fill('Understand concrete mixing');
  await lo.blur();
  await expect(page.locator(`#wlo_${lid}`)).toContainText('ملاحظة صياغة');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
