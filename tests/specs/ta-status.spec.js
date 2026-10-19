// 3.128.0: a task's analysis is "Completed" once its steps and its
// performance criteria are filled — the other sections are optional.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

test('status: not started → in progress → completed from steps + criteria', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  const status = (rec) => page.evaluate(async (rec) => {
    const { appState } = await import('./state.js');
    appState.taskAnalysisData = appState.taskAnalysisData || {};
    if (rec === null) delete appState.taskAnalysisData.zz_task; else appState.taskAnalysisData.zz_task = rec;
    return (await import('./task_analysis.js')).getTaskAnalysisStatus('zz_task');
  }, rec);
  expect(await status(null)).toBe('not-started');
  expect(await status({ performanceSteps: ['Receive the request'] })).toBe('in-progress');
  expect(await status({ performanceCriteria: ['Items are issued as requested'] })).toBe('in-progress');
  expect(await status({ performanceSteps: ['Receive the request', ' '], performanceCriteria: ['Items are issued as requested'] }))
    .toBe('completed');
  expect(await status({ performanceSteps: [' '], performanceCriteria: ['Items are issued as requested'] })).toBe('in-progress');
  expect(errors).toEqual([]);
});
