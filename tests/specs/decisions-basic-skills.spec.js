// Task Analysis 3.100.0: the decisions table (decision · cue ·
// consequence · optional expert strategy) and the Basic Skills card
// (SCID A-6). Older records keep working: a plain list of decisions
// opens as rows, and the list stays in step with the table.
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture } = require('../helpers');

async function openTask(page, key = 'duty_1_1') {
  await page.evaluate(() => window.switchTab('task-analysis-tab'));
  await page.locator(`[data-action="ta-select-task"][data-task-key="${key}"]`).click();
}

for (const lang of ['en', 'ar']) {
  test(`decisions table and basic skills (${lang})`, async ({ page }) => {
    if (lang !== 'en') await page.setViewportSize({ width: 360, height: 780 });
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(async () => {
      const { appState } = await import('./state.js');
      const r = appState.taskAnalysisData.duty_1_1;
      r.decisionsCriticalPoints = ['Old decision A', 'Old decision B'];
      delete r.decisionTable;
    });
    await openTask(page);

    // Old list → rows, decision column filled.
    const dec = (row, col) => page.locator(`textarea[data-action="ta-dec-edit"][data-row="${row}"][data-col="${col}"]`);
    await expect(dec(0, 'decision')).toHaveValue('Old decision A');
    await expect(dec(1, 'decision')).toHaveValue('Old decision B');

    await dec(0, 'cue').fill('Tester reading');
    await dec(0, 'error').fill('Electric shock');
    await page.click('[data-action="ta-dec-add"]');
    await dec(2, 'decision').fill('Choose breaker rating');
    await page.click('[data-action="ta-dec-expert"]');
    await dec(2, 'expert').fill('Checks the load first');

    expect(await state(page, 's => s.taskAnalysisData.duty_1_1.decisionsCriticalPoints'))
      .toEqual(['Old decision A', 'Old decision B', 'Choose breaker rating']);
    expect(await state(page, 's => s.taskAnalysisData.duty_1_1.decisionTable[0]'))
      .toEqual({ decision: 'Old decision A', cue: 'Tester reading', error: 'Electric shock', expert: '' });

    // Delete the middle row (its confirm is accepted by the test helpers).
    await page.click('[data-action="ta-dec-del"][data-row="1"]');
    expect(await state(page, 's => s.taskAnalysisData.duty_1_1.decisionsCriticalPoints'))
      .toEqual(['Old decision A', 'Choose breaker rating']);

    // Basic skills: four lists after Worker Behaviours.
    const blocks = await page.evaluate(() => [...document.querySelectorAll('.section-container[data-field-block]')].map(e => e.getAttribute('data-field-block')));
    expect(blocks.indexOf('basicSkills')).toBe(blocks.indexOf('workerBehaviours') + 1);
    await page.locator('textarea[data-field="basicMath"]').fill('Calculate load current\nConvert units');
    expect(await state(page, 's => s.taskAnalysisData.duty_1_1.basicMath'))
      .toEqual(['Calculate load current', 'Convert units']);

    // 3.121.0: each list has its own numbering / bullets buttons, and they
    // format that list only.
    await page.locator('textarea[data-field="basicReading"]').fill('Read safety signs\nRead the SDS');
    await page.click('[data-action="ta-format-list"][data-field="basicMath"][data-format-type="number"]');
    await expect(page.locator('textarea[data-field="basicMath"]')).toHaveValue('1. Calculate load current\n2. Convert units');
    await expect(page.locator('textarea[data-field="basicReading"]')).toHaveValue('Read safety signs\nRead the SDS');
    await page.click('[data-action="ta-format-list"][data-field="basicMath"][data-format-type="bullet"]');
    expect(await state(page, 's => s.taskAnalysisData.duty_1_1.basicMath'))
      .toEqual(['• Calculate load current', '• Convert units']);
    await page.click('[data-action="ta-format-list"][data-field="basicReading"][data-format-type="number"]');
    expect(await state(page, 's => s.taskAnalysisData.duty_1_1.basicReading'))
      .toEqual(['1. Read safety signs', '2. Read the SDS']);

    // The "?" explains the difference with the Skills Level Matrix.
    await page.click('[data-action="ta-basic-help"]');
    await expect(page.locator('#basicSkillsHelpModal table')).toBeVisible();
    await page.keyboard.press('Escape');

    // Export data carries the cleaned table.
    const rows = await page.evaluate(async () =>
      (await import('./task_analysis.js')).getTaskAnalysisExportData()
        .find(e => e.taskText === 'Perform task A1').record.decisionTable.length);
    expect(rows).toBe(2);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('AI decisions in "a || b || c" form fill the table; restore brings the old rows back', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await openTask(page);
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const m = await import('./task_analysis.js');
    appState.taskAnalysisData.duty_1_1.decisionsCriticalPoints = ['Kept decision'];
    delete appState.taskAnalysisData.duty_1_1.decisionTable;
    m.writeTaskAnalysisAI('duty_1_1', { decisionsCriticalPoints: ['Isolated? || Tester reading || Shock'] });
  });
  expect(await state(page, 's => s.taskAnalysisData.duty_1_1.decisionTable'))
    .toEqual([{ decision: 'Isolated?', cue: 'Tester reading', error: 'Shock', expert: '' }]);
  await page.click('[data-action="ta-ai-restore"][data-field="decisionsCriticalPoints"]');
  expect(await state(page, 's => s.taskAnalysisData.duty_1_1.decisionsCriticalPoints')).toEqual(['Kept decision']);
  expect(errors).toEqual([]);
});
