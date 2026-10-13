// 3.104.0: the Module Builder handoff carries everything Module Builder
// uses from the recent releases — the Task Analysis basic skills and
// decisions table, the module's category, entry skills and resource
// lists, and the programme's requirements and course information.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const send = (page) => page.evaluate(async () => {
  window.open = () => null;
  (await import('./module_mapping.js')).openModuleBuilderFromMapping();
  return JSON.parse(localStorage.getItem('dacum_modules_export'));
});

test('handoff: basic skills, decisions table, category, curriculum and programme data', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));

  const before = await send(page);
  const m0 = before.modules[0];
  expect(m0.category).toBeUndefined();
  expect(before.programmeRequirements).toBeUndefined();
  const taskId = m0.sourceTaskIds.find(id => m0.taskAnalysis[id]);
  expect(taskId).toBeTruthy();

  await page.evaluate(async ({ taskId }) => {
    const { appState } = await import('./state.js');
    const r = appState.taskAnalysisData[taskId];
    r.basicReading = ['Read the wiring diagram'];
    r.basicMath = ['Calculate the load in amperes'];
    r.decisionTable = [{ decision: 'Replace or repair the part', cue: 'Wear beyond the limit', error: 'The unit fails again', expert: '' }];
    r.decisionsCriticalPoints = ['Replace or repair the part'];
    const mm = await import('./module_mapping.js');
    mm.setModuleCategory(appState.moduleMappingData.modules[0].id, 'core');
    const cur = appState.moduleCurriculumData;
    const id = appState.moduleMappingData.modules[0].id;
    cur.byModule[id] = Object.assign(cur.byModule[id] || {}, {
      entrySkills: ['Read simple texts'], tools: ['Multimeter'], ppe: ['Safety gloves'],
      facilities: [{ item: 'Workshop', qty: '1' }],
    });
    Object.assign(cur.settings, {
      entryQualifications: ['Grade 9'], trainerQualifications: ['Level 5 certificate'],
      trainersPerGroup: 2, qualificationLevel: '3', courseDescription: 'A short course.', courseOutcomes: ['Works safely'],
    });
  }, { taskId });

  const d = await send(page);
  const m = d.modules[0];
  const ta = m.taskAnalysis[taskId];
  expect(ta.basicReading).toEqual(['Read the wiring diagram']);
  expect(ta.basicMath).toEqual(['Calculate the load in amperes']);
  expect(ta.decisionTable[0]).toMatchObject({ decision: 'Replace or repair the part', cue: 'Wear beyond the limit', error: 'The unit fails again' });
  expect(m.category).toEqual({ id: 'core', label: 'Core' });
  expect(m.curriculum).toMatchObject({ entrySkills: ['Read simple texts'], tools: ['Multimeter'], ppe: ['Safety gloves'],
    facilities: [{ item: 'Workshop', qty: '1' }] });
  expect(d.programmeRequirements).toMatchObject({ entryQualifications: ['Grade 9'], trainerQualifications: ['Level 5 certificate'],
    trainersPerGroup: 2, qualificationLevel: '3', courseDescription: 'A short course.', courseOutcomes: ['Works safely'] });
  expect(errors).toEqual([]);
});
