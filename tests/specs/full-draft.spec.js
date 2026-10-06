// The Full Draft (draft_agent.js / draft_ui.js). Guards the failures
// found in 3.72–3.74: a stage that never ran shown green, a run that
// stopped at Competency Clusters on every new project, and starting to
// overwrite a filled project without a clear confirmation.
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture, mockAI, fillJob } = require('../helpers');

async function openDraft(page, { allExtras = false } = {}) {
  await page.evaluate(async () => (await import('./draft_ui.js')).openDraftModal());
  await page.waitForSelector('#dgOverlay .dg-dialog');
  if (allExtras) {
    for (let i = 0; i < 5; i++) {
      const box = await page.$('#dgOverlay input[data-extra]:not(:checked)');
      if (!box) break;
      await box.click(); await page.waitForTimeout(200);
    }
  }
}
const phase = (page) => page.getAttribute('#dgOverlay', 'data-phase');
async function waitEnd(page) {
  await page.waitForFunction(() => ['done', 'error'].includes(document.querySelector('#dgOverlay')?.getAttribute('data-phase')), null, { timeout: 60_000 });
}
const stages = (page) => page.$$eval('#dgOverlay .dg-prog-item', els => els.map(e => (e.className.match(/is-(\w+)/) || [])[1]));

test('new project: all seven stages complete, even with untidy AI replies', async ({ page }) => {
  const errors = await openApp(page);
  const ai = await mockAI(page, { messy: true });
  await fillJob(page);
  await openDraft(page, { allExtras: true });
  await page.click('#dgStart');
  await waitEnd(page);
  expect(await phase(page)).toBe('done');
  expect(await stages(page)).toEqual(Array(7).fill('done'));
  expect(ai.calls).toEqual(['check', 'duties', 'info', 'clusters', 'criteria', 'outcomes', 'ratings', 'modules']);
  const s = await state(page, `s => ({ d: s.dutiesData.length, c: s.clusteringData.clusters.length,
      pc: s.clusteringData.clusters.every(c => c.performanceCriteria.length > 0),
      lo: s.learningOutcomesData.outcomes.length, mm: s.moduleMappingData.modules.length })`);
  expect(s).toEqual({ d: 3, c: 2, pc: true, lo: 3, mm: 1 });
  expect(errors).toEqual([]);
});

test('filled project + AI down: confirm with snapshot, stop at stage 1, nothing changed', async ({ page }) => {
  await openApp(page);
  await mockAI(page, { fail: true });
  await loadProject(page, fixture('sample-project.json'));
  const before = await state(page, `s => [s.dutiesData, s.clusteringData.clusters.map(c => [c.name, c.range, c.performanceCriteria]),
                                          s.learningOutcomesData.outcomes.length, s.moduleMappingData.modules.length]`);
  await openDraft(page);
  // the overwrite note is at the top of the setup view
  await expect(page.locator('#dgOverlay .dg-body .dg-note-warn').first()).toContainText(/replaced/i);
  await page.click('#dgStart');
  await expect.poll(() => phase(page)).toBe('confirm');
  await expect(page.locator('#dgOverlay .dg-clash-list li')).not.toHaveCount(0);
  await page.click('#dgSnapStart');
  await waitEnd(page);
  await page.locator('#aiServiceErrorClose').click().catch(() => {});
  const st = await stages(page);
  expect(st[0]).toBe('error');
  expect(st.slice(1).every(x => x === 'idle')).toBe(true);
  const snaps = await page.evaluate(async () => (await import('./workshop_snapshots.js')).getSnapshots().map(s => s.name));
  expect(snaps[0]).toMatch(/Full Draft/);
  const after = await state(page, `s => [s.dutiesData, s.clusteringData.clusters.map(c => [c.name, c.range, c.performanceCriteria]),
                                         s.learningOutcomesData.outcomes.length, s.moduleMappingData.modules.length]`);
  expect(after).toEqual(before);
});
