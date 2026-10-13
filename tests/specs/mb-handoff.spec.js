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

// 3.105.0: one language per text. The decisions table and the lines of
// added Task Analysis sections are translated with the rest; the handoff
// says which language its texts are in; missing translations are named
// before sending.
const { mockAI } = require('../helpers');

test('handoff languages: decisions and added sections translated, text language sent', async ({ page }) => {
  const errors = await openApp(page);
  await mockAI(page);
  await loadProject(page, fixture('sample-project.json'));
  const taskId = await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const id = Object.keys(appState.taskAnalysisData)[0];
    const r = appState.taskAnalysisData[id];
    r.decisionTable = [{ decision: 'Repair or replace the part', cue: 'Wear beyond the limit', error: 'The unit fails again', expert: 'Checks the service history' }];
    r.decisionsCriticalPoints = ['Repair or replace the part'];
    appState.taskAnalysisCustomSections = [{ id: 'q1', title: 'Quality notes' }];
    r.custom = { q1: ['Record the serial number'] };
    return id;
  });
  expect((await send(page)).contentLanguage).toBe('en');

  // translate the project into Arabic (stand-in AI tags each Arabic text with «ع»)
  await page.click('#dpsExportSettings');
  await page.click('[data-es-tab="languages"]');
  await page.click('[data-cl-act="init"]');
  await page.selectOption('#clTo', 'ar');
  await page.click('#clTranslateBtn');
  await page.click('#clTranslateBtn');
  await expect.poll(() => page.evaluate(async () => (await import('./state.js')).appState.contentLanguages?.active)).toBe('ar');
  await page.keyboard.press('Escape');

  const d = await send(page);
  expect(d.contentLanguage).toBe('ar');
  const ta = d.modules[0].taskAnalysis[taskId];
  expect(ta.decisionTable[0].cue).toMatch(/^ع Wear beyond the limit/);
  expect(ta.decisionTable[0].expert).toMatch(/^ع /);
  expect(ta.customSections[0].items[0]).toMatch(/^ع Record the serial number/);
  // the English originals travel as pairs
  const en = d.contentLanguages.tables.find(t => t.lang === 'en');
  expect(en.pairs.some(p => p[1] === 'Wear beyond the limit')).toBe(true);
  expect(errors).toEqual([]);
});

test('missing translations are named before sending', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    appState.contentLanguages = { original: 'en', active: 'en', versions: { ar: { tm: {}, keys: {} } }, foreign: {}, view: null };
  });
  const messages = [];
  page.on('dialog', dl => messages.push(dl.message()));
  const d = await send(page);                       // the helper answers OK: sent anyway
  expect(messages.join('\n')).toMatch(/not translated yet \(العربية: \d+\)/);
  expect(d.contentLanguage).toBe('en');
  expect(errors).toEqual([]);
});
