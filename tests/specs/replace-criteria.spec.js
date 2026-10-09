// "Replace with Task Analysis criteria" (3.98.0): a competency whose
// criteria were typed first, and whose tasks were analysed later, holds
// both kinds. The card says so, previews the replacement (with the
// outcomes' links suggested from the closest task), replaces, updates
// the learning outcomes, and Undo / Redo treat it as one step.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture, state } = require('../helpers');

/* The sample project, made realistic: competency 1 has typed criteria
   linked to outcomes, then two of its tasks got Task Analysis criteria. */
function project() {
  const data = fixture('sample-project.json');
  data.dutiesData[0].tasks[0].text = 'Assemble computer hardware components';
  data.dutiesData[0].tasks[1].text = 'Install printers and scanners';
  const c1 = data.competencyClusters.clusters[0];
  c1.tasks[0].text = 'Assemble computer hardware components';
  c1.tasks[1].text = 'Install printers and scanners';
  c1.performanceCriteria = [
    "Hardware components are assembled according to manufacturer's specifications.",
    'Printer is installed and tested according to procedures.',
    'Workplace is cleaned after work.',
  ];
  data.taskAnalysis = data.taskAnalysis || {};
  data.taskAnalysis.duty_1_1 = { ...(data.taskAnalysis.duty_1_1 || {}),
    performanceCriteria: ['1. Components are assembled in the correct order', '2. The assembled unit powers on'] };
  data.taskAnalysis.duty_1_2 = { performanceCriteria: ['1. Printer driver is installed', '2. A test page is printed'] };
  const pc = (t) => ({ id: '', text: t, clusterNumber: 1, taskId: null, clusterId: 'cluster_1', key: `pc|cluster_1|${t}` });
  const los = data.learningOutcomes.outcomes;
  los[0].linkedCriteria = [pc(c1.performanceCriteria[0]), pc(c1.performanceCriteria[2]),
    { id: '', text: 'Work is checked against specifications 3', clusterNumber: 2, taskId: null, clusterId: 'cluster_2',
      key: 'pc|cluster_2|Work is checked against specifications 3' }];
  los[1].linkedCriteria = [pc(c1.performanceCriteria[1])];
  los[2].linkedCriteria = [];
  return data;
}

const snap = (page) => state(page, `s => ({
  pc: s.clusteringData.clusters[0].performanceCriteria,
  lo: s.learningOutcomesData.outcomes.map(o => o.linkedCriteria.map(l => l.key + (l.stale ? ' ⚠' : '')))
})`);

test('button and note, preview, replace, outcomes, Undo / Redo', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, project());
  await page.evaluate(() => window.switchTab('clustering-tab'));

  // Only competency 1 has both kinds of criteria.
  const cards = page.locator('#clustersContainer .cluster-item');
  await expect(cards.nth(0).locator('.crit-mix-note')).toContainText('typed criteria and criteria from Task Analysis');
  await expect(cards.nth(1).locator('.crit-mix-note')).toHaveCount(0);
  const before = await snap(page);

  // Preview: counts, warning, each outcome before → after; nothing changed yet.
  await cards.nth(0).locator('[data-crit-replace]').click();
  const dlg = page.locator('#critReplaceModal');
  await expect(dlg.locator('.crr-count')).toContainText('3 typed criteria will be deleted, and the 4 criteria from Task Analysis');
  await expect(dlg.locator('.crr-warn')).toBeVisible();
  await expect(dlg.locator('.crr-lo')).toHaveCount(2);
  const lo1 = dlg.locator('.crr-lo').nth(0);
  // LO1: the hardware criterion suggests the assembly task's criteria; the
  // "cleaned" one matches nothing (no suggestion of its own).
  await expect(lo1.locator('input[data-crr-key="ta|duty_1_1|Components are assembled in the correct order"]')).toBeChecked();
  await expect(lo1.locator('input[data-crr-key="ta|duty_1_1|The assembled unit powers on"]')).toBeChecked();
  await expect(lo1.locator('input[data-crr-key="ta|duty_1_2|Printer driver is installed"]')).not.toBeChecked();
  const lo2 = dlg.locator('.crr-lo').nth(1);
  await expect(lo2.locator('input[data-crr-key="ta|duty_1_2|Printer driver is installed"]')).toBeChecked();
  expect(await snap(page)).toEqual(before);

  // The user edits a suggestion: LO2 keeps only the driver criterion.
  await lo2.locator('input[data-crr-key="ta|duty_1_2|A test page is printed"]').uncheck();
  await dlg.locator('[data-crr="ok"]').click();
  await expect(dlg).toHaveCount(0);

  const after = await snap(page);
  expect(after.pc).toEqual([]);
  expect(after.lo[0]).toEqual([
    'pc|cluster_2|Work is checked against specifications 3',
    'ta|duty_1_1|Components are assembled in the correct order',
    'ta|duty_1_1|The assembled unit powers on',
  ]);
  expect(after.lo[1]).toEqual(['ta|duty_1_2|Printer driver is installed']);
  await expect(cards.nth(0).locator('.crit-mix-note')).toHaveCount(0);

  // The outcome tab follows (links shown with the Task Analysis criteria).
  await page.evaluate(() => window.switchTab('learning-outcomes-tab'));
  await expect(page.locator('#learning-outcomes-tab')).toContainText('Printer driver is installed');
  await page.evaluate(() => window.switchTab('clustering-tab'));

  // One step, named; Undo restores criteria AND outcome links; Redo again.
  await expect(page.locator('#btnUndo')).toHaveAttribute('title', /Replace with Task Analysis criteria/);
  await page.click('#btnUndo');
  expect(await snap(page)).toEqual(before);
  await expect(cards.nth(0).locator('.crit-mix-note')).toHaveCount(1);
  await page.click('#btnRedo');
  expect(await snap(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test('an outcome left without a choice keeps its old link, marked ⚠', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, project());
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await page.locator('#clustersContainer .cluster-item').nth(0).locator('[data-crit-replace]').click();
  const lo2 = page.locator('#critReplaceModal .crr-lo').nth(1);
  while (await lo2.locator('input:checked').count()) await lo2.locator('input:checked').first().uncheck();
  await page.click('#critReplaceModal [data-crr="ok"]');
  const s = await snap(page);
  expect(s.lo[1]).toEqual(['pc|cluster_1|Printer is installed and tested according to procedures. ⚠']);
  expect(errors).toEqual([]);
});

test('competencies without both kinds of criteria are unchanged', async ({ page }) => {
  const errors = await openApp(page);
  const data = fixture('sample-project.json');
  Object.values(data.taskAnalysis || {}).forEach(r => { r.performanceCriteria = []; });   // typed criteria only
  await loadProject(page, data);
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await expect(page.locator('#clustersContainer .crit-mix-note')).toHaveCount(0);
  await expect(page.locator('[data-crit-replace]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
