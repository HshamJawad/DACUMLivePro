// 3.138.0: before the AI builds modules it asks how many levels the programme has and
// whether it splits into streams (Skip keeps things as they are). The answers reach the
// AI's instructions, and its stream codes are kept to the programme's own.
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture, mockAI } = require('../helpers');

async function openAiModules(page) {
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    appState.moduleMappingData.modules = [];      // nothing built yet
    appState.moduleMappingData.moduleCounter = 0;
    delete appState.moduleMappingData.streamsAsked;
    delete appState.moduleMappingData.tracks;
  });
}
const generate = (page) => page.evaluate(() => import('./module_mapping_ai.js').then(m => m.generateModulesAI()));

test('the question is asked once; Skip keeps things as they are', async ({ page }) => {
  const errors = await openApp(page);
  let prompt = '';
  await mockAI(page, { overrides: { modules: (p) => { prompt = p; return { modules: [{ title: 'Core work', rationale: 'r', level: 1, track: 'ZZ',
    outcomeIds: [...p.split('OUTPUT FORMAT')[0].matchAll(/- id: (\S+)/g)].map(m => m[1]) }] }; } } });
  await openAiModules(page);
  const run = generate(page);
  await expect(page.locator('#mmGenSetup')).toBeVisible();
  await page.locator('#mmGenSetup [data-gs="skip"]').click();
  await run;
  expect(await state(page, 's => s.moduleMappingData.streamsAsked')).toBe(true);
  expect(await state(page, 's => s.moduleMappingData.tracks || null')).toBeNull();
  // Without streams the AI's own track is kept, as before.
  expect(await state(page, 's => s.moduleMappingData.modules[0].track')).toBe('ZZ');
  // Not asked again.
  await openAiModules(page);
  await page.evaluate(async () => { const { appState } = await import('./state.js'); appState.moduleMappingData.streamsAsked = true; });
  await generate(page);
  await expect(page.locator('#mmGenSetup')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('streams, levels and where they split reach the AI; its stream codes are kept to the programme\'s', async ({ page }) => {
  const errors = await openApp(page);
  let prompt = '';
  await mockAI(page, { overrides: { modules: (p) => { prompt = p; const ids = [...p.split('OUTPUT FORMAT')[0].matchAll(/- id: (\S+)/g)].map(m => m[1]);
    return { modules: [
      { title: 'Common work', rationale: 'r', level: 1, track: 'CN', outcomeIds: ids.slice(0, 1) },   // a stream at a common level → common
      { title: 'Network work', rationale: 'r', level: 3, track: 'CN', outcomeIds: ids.slice(1, 2) },
      { title: 'Stray', rationale: 'r', level: 3, track: 'QQ', outcomeIds: ids.slice(2) },             // not a stream of this programme → common
    ] }; } } });
  await openAiModules(page);
  const run = generate(page);
  await expect(page.locator('#mmGenSetup')).toBeVisible();
  await page.fill('#mmGenSetup #gsLevels', '3');
  await page.locator('#mmGenSetup #gsHas').check();
  await page.fill('#mmGenSetup #gsStreams', 'CM = Computer Maintenance\nCN = Computer Networks');
  await page.fill('#mmGenSetup #gsCommon', 'CMCN');
  // The highest level is ticked by default.
  await expect(page.locator('#mmGenSetup #gsSplit input:checked')).toHaveCount(1);
  await expect(page.locator('#mmGenSetup #gsSplit input:checked')).toHaveValue('3');
  await page.locator('#mmGenSetup [data-gs="apply"]').click();
  await run;
  const mm = await state(page, 's => s.moduleMappingData');
  expect(mm.tracks.map(t => t.code)).toEqual(['CM', 'CN']);
  expect(mm.commonTrack).toBe('CMCN');
  expect(mm.streamLevels).toEqual([3]);
  expect(prompt).toContain('CM = Computer Maintenance');
  expect(prompt).toContain('ONLY at level(s) 3');
  expect(mm.modules.map(m => [m.level, m.track])).toEqual([[1, 'CMCN'], [3, 'CN'], [3, 'CMCN']]);
  expect(errors).toEqual([]);
});

test('closing the question cancels the run', async ({ page }) => {
  const errors = await openApp(page);
  const ai = await mockAI(page, {});
  await openAiModules(page);
  const run = generate(page);
  await expect(page.locator('#mmGenSetup')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await run).toBe(false);
  expect(ai.calls.filter(c => c === 'modules')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('Full Draft asks before the run starts, so nothing waits in the middle of it', async ({ page }) => {
  const errors = await openApp(page);
  const ai = await mockAI(page, { messy: true });
  const { fillJob } = require('../helpers');
  await fillJob(page);
  await page.evaluate(async () => (await import('./draft_ui.js')).openDraftModal());
  await page.waitForSelector('#dgOverlay .dg-dialog');
  await page.click('#dgStart');
  await expect(page.locator('#mmGenSetup')).toBeVisible();
  expect(ai.calls.filter(c => c !== 'check')).toHaveLength(0);        // no stage has started
  await page.locator('#mmGenSetup [data-gs="skip"]').click();
  await page.waitForFunction(() => ['done', 'error'].includes(document.querySelector('#dgOverlay')?.getAttribute('data-phase')), null, { timeout: 60_000 });
  expect(await page.getAttribute('#dgOverlay', 'data-phase')).toBe('done');
  expect(errors).toEqual([]);
});
