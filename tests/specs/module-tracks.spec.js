// 3.135.0: tracks (specialisations) with alternative modules — the CMCN
// pattern: levels 1 and 2 common, level 3 common except ONE place where
// Computer Maintenance and Computer Networks each have a module of their own.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const { openApp, loadProject, fixture, state } = require('../helpers');

/* Five modules typed in by hand (so nothing reconciles them away):
   three common, and at level 3 one for each track. */
const seedModules = () => {
  const mk = (n, level, track, title) => ({
    id: 'mt_' + n, title, manual: true, level, ...(track ? { track } : {}),
    learningOutcomes: [{ id: `mt_${n}_lo1`, number: 'LO1', statement: 'Do ' + title, manual: true,
      linkedCriteria: [{ id: '1.1', text: 'Done well: ' + title, taskId: null, manual: true }] }],
  });
  return [mk(1, 1, '', 'Hardware basics'), mk(2, 2, '', 'Operating systems'), mk(3, 3, '', 'Troubleshooting'),
          mk(4, 3, 'CM', 'Repair of PCs'), mk(5, 3, 'CN', 'Network setup')];
};

async function openWithModules(page, { replace = true, lang } = {}) {
  const errors = await openApp(page, { lang });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async ({ mods, replace }) => {
    window.switchTab('module-mapping-tab');
    const { appState } = await import('./state.js');
    const mm = appState.moduleMappingData;
    // The two level-3 modules start WITHOUT a track: the test types them in.
    const fresh = mods.map(m => { const c = JSON.parse(JSON.stringify(m)); return c; });
    mm.modules = replace ? fresh : [...mm.modules, ...fresh];
    mm.moduleCounter = mm.modules.length;
    mm.levelCount = 3;
    delete mm.tracks;
    (await import('./learning_outcomes.js')).renderModules();
  }, { mods: seedModules().map(m => (m.id === 'mt_4' || m.id === 'mt_5') ? { ...m, track: undefined } : m), replace });
  return errors;
}

const card = (page, id) => page.locator(`#modulesContainer .module-item[data-module-id="${id}"]`);
const modules = (page) => state(page, 's => s.moduleMappingData.modules');

async function setTrack(page, id, value) {
  const f = card(page, id).locator('.mod-track-input');
  await f.fill(value);
  await f.blur();
}

for (const lang of ['en', 'ar']) {
  test(`tracks: type a track, link alternatives, one programme per track (${lang})`, async ({ page }) => {
    if (lang === 'ar') await page.setViewportSize({ width: 360, height: 800 });
    const errors = await openWithModules(page, { lang });

    // Nothing track-related shows until a module has a track.
    await expect(page.locator('#mmTracksBar')).toHaveCount(0);
    await expect(page.locator('#trackSummarySection')).toHaveCount(0);
    await expect(page.locator('#modulesContainer .mod-slot-select')).toHaveCount(0);

    await setTrack(page, 'mt_4', 'CM');
    await setTrack(page, 'mt_5', 'CN');
    await expect(page.locator('#mmTracksBar .trk-chip')).toHaveCount(4);   // all, common, CM, CN

    // "Alternative to": offered on a track's module, listing the other track's module.
    const sel = card(page, 'mt_4').locator('.mod-slot-select');
    await expect(sel).toHaveCount(1);
    await expect(sel.locator('option')).toHaveCount(2);                    // none + the CN module
    await expect(card(page, 'mt_3').locator('.mod-slot-select')).toHaveCount(0);   // common modules have none
    await sel.selectOption('mt_5');
    let mods = await modules(page);
    expect(mods[3].slot).toBeTruthy();
    expect(mods[3].slot).toBe(mods[4].slot);
    expect(mods[2].slot).toBeUndefined();
    await expect(card(page, 'mt_5').locator('.mod-slot-chip')).toHaveCount(1);

    // The two alternatives take ONE place in level 3: CM 3-2 and CN 3-2, not 3-2 and 3-3.
    const codes = await page.evaluate(async () => {
      const mm = await import('./module_mapping.js');
      const { appState } = await import('./state.js');
      return appState.moduleMappingData.modules.map(m => mm.getModuleCode(m));
    });
    expect(codes[3]).toBe('CM 3-2');
    expect(codes[4]).toBe('CN 3-2');

    // Programme view: a track's programme is the common modules plus its own.
    const shown = async () => page.locator('#modulesContainer .module-item').evaluateAll(els => els.map(e => e.getAttribute('data-module-id')));
    expect(await shown()).toEqual(['mt_1', 'mt_2', 'mt_3', 'mt_4', 'mt_5']);
    await page.click('#mmTracksBar [data-trk-filter="CM"]');
    expect(await shown()).toEqual(['mt_1', 'mt_2', 'mt_3', 'mt_4']);
    await page.click('#mmTracksBar [data-trk-filter="CN"]');
    expect(await shown()).toEqual(['mt_1', 'mt_2', 'mt_3', 'mt_5']);
    await page.click('#mmTracksBar [data-trk-filter="common"]');
    expect(await shown()).toEqual(['mt_1', 'mt_2', 'mt_3']);
    await page.click('#mmTracksBar [data-trk-filter="all"]');
    expect((await shown()).length).toBe(5);

    // Summary under the coverage matrix: each track's programme, and the alternatives side by side.
    const tables = await page.evaluate(async () => (await import('./module_tracks.js')).getTracksExportTables());
    expect(tables.programme.rows).toHaveLength(3);                          // common, CM, CN
    const head4 = r => r.slice(0, 4);
    const last3 = r => r.slice(-3);                                         // modules per level 1..3
    expect([head4(tables.programme.rows[0]).slice(1), last3(tables.programme.rows[0])]).toEqual([['3', '3', '3'], ['1', '1', '1']]);
    expect([head4(tables.programme.rows[1]).slice(1), last3(tables.programme.rows[1])]).toEqual([['4', '4', '4'], ['1', '1', '2']]);
    expect([head4(tables.programme.rows[2]).slice(1), last3(tables.programme.rows[2])]).toEqual([['4', '4', '4'], ['1', '1', '2']]);
    expect(tables.slots.rows).toHaveLength(1);
    expect(tables.slots.rows[0].slice(1)).toEqual(['CM 3-2 — Repair of PCs (1)', 'CN 3-2 — Network setup (1)']);
    expect(tables.issues).toEqual([]);
    await expect(page.locator('#trackSummarySection .trk-table')).toHaveCount(2);

    // Name the tracks.
    await page.click('#mmTracksBar [data-trk-edit]');
    await page.fill('#mmTrkLines', 'CM = Computer Maintenance\nCN = Computer Networks');
    await page.click('#mmTrkModal [data-trk-act="save"]');
    await expect(page.locator('#mmTrkModal')).toHaveCount(0);
    expect(await state(page, 's => s.moduleMappingData.tracks')).toEqual([
      { code: 'CM', name: 'Computer Maintenance' }, { code: 'CN', name: 'Computer Networks' }]);
    await expect(page.locator('#mmTracksBar [data-trk-filter="CM"]')).toContainText('Computer Maintenance');

    // Unlinking one alternative leaves neither in a slot.
    await card(page, 'mt_4').locator('.mod-slot-select').selectOption('');
    mods = await modules(page);
    expect(mods[3].slot).toBeUndefined();
    expect(mods[4].slot).toBeUndefined();
    await expect(page.locator('#trackSummarySection .trk-table')).toHaveCount(1);

    // A module that stops having a track stops being anybody's alternative.
    await card(page, 'mt_4').locator('.mod-slot-select').selectOption('mt_5');
    await setTrack(page, 'mt_5', '');
    mods = await modules(page);
    expect(mods[3].slot).toBeUndefined();
    expect(mods[4].slot).toBeUndefined();
    expect(mods[4].track).toBeUndefined();

    if (lang === 'ar') {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
}

test('tracks: a slot with the same track twice, or two levels, is reported', async ({ page }) => {
  const errors = await openWithModules(page);
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const m = appState.moduleMappingData.modules;
    m[3].track = 'CM'; m[4].track = 'CM'; m[3].slot = m[4].slot = 'slot_1';          // same track twice
    (await import('./learning_outcomes.js')).renderModules();
  });
  let issues = await page.evaluate(async () => (await import('./module_tracks.js')).getTracksExportTables().issues);
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain('different stream');
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const m = appState.moduleMappingData.modules;
    m[4].track = 'CN'; m[4].level = 2;                                                // two levels
    (await import('./learning_outcomes.js')).renderModules();
  });
  issues = await page.evaluate(async () => (await import('./module_tracks.js')).getTracksExportTables().issues);
  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain('different levels');
  await expect(page.locator('#trackSummarySection .trk-issues li')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('tracks: without tracks the old behaviour is unchanged (no slots, same codes)', async ({ page }) => {
  const errors = await openWithModules(page);
  const codes = await page.evaluate(async () => {
    const mm = await import('./module_mapping.js');
    const { appState } = await import('./state.js');
    return appState.moduleMappingData.modules.map(m => mm.getModuleCode(m));
  });
  // Without tracks or slots, level 3 numbers its modules one by one, as before.
  expect(codes[2].endsWith(' 3-1')).toBe(true);
  expect(codes[3].endsWith(' 3-2')).toBe(true);
  expect(codes[4].endsWith(' 3-3')).toBe(true);
  expect(await page.evaluate(async () => (await import('./module_tracks.js')).getTracksExportData())).toBeNull();
  await expect(page.locator('#mmTracksBar')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tracks: common code (CMCN) + "Alternative for another stream" adds the CN card', async ({ page }) => {
  const errors = await openWithModules(page);
  // Real projects give the common modules a code too: CMCN.
  await setTrack(page, 'mt_1', 'CMCN');
  await setTrack(page, 'mt_2', 'CMCN');
  await setTrack(page, 'mt_3', 'CMCN');
  await setTrack(page, 'mt_4', 'CM');
  await page.evaluate(async () => (await import('./module_tracks.js')).saveTrackRegistry('CM = Computer Maintenance\nCN = Computer Networks', 'CMCN'));
  expect(await state(page, 's => s.moduleMappingData.commonTrack')).toBe('CMCN');
  // CMCN is not a stream; CM and CN are.
  const codesOf = await page.evaluate(async () => (await import('./module_tracks.js')).getProgrammeTracks().map(t => t.code));
  expect(codesOf).toEqual(['CM', 'CN']);

  // The CM view = CMCN modules + CM modules.
  await page.locator('#mmTracksBar [data-trk-filter="CM"]').click();
  await expect(card(page, 'mt_1')).toBeVisible();
  await expect(card(page, 'mt_4')).toBeVisible();
  await page.locator('#mmTracksBar [data-trk-filter="all"]').click();

  // Add the CN version of the CM module.
  await card(page, 'mt_4').locator('.trk-alt-btn').first().click();
  // CN is the only other stream, so the card is added straight away (no chooser).
  await expect(page.locator('#mmAltModal')).toHaveCount(0);
  const mods = await modules(page);
  const cm = mods.find(m => m.id === 'mt_4');
  const cn = mods.find(m => m.id !== 'mt_4' && m.track === 'CN' && m.title === cm.title);
  expect(cn).toBeTruthy();
  expect(cn.level).toBe(cm.level);
  expect(cn.slot).toBeTruthy();
  expect(cn.slot).toBe(cm.slot);
  expect(cn.learningOutcomes.length).toBe(cm.learningOutcomes.length);
  // Manual outcomes are copied, so editing the CN ones does not touch CM's.
  expect(cn.learningOutcomes[0]).not.toBe(cm.learningOutcomes[0]);
  expect(cn.learningOutcomes[0].id).not.toBe(cm.learningOutcomes[0].id);

  // The pair takes ONE place in level 3.
  const codes = await page.evaluate(async () => {
    const mm = await import('./module_mapping.js');
    const { appState } = await import('./state.js');
    return appState.moduleMappingData.modules.map(m => mm.getModuleCode(m));
  });
  const cmCode = codes[mods.indexOf(cm)], cnCode = codes[mods.indexOf(cn)];
  expect(cmCode.split(' ')[1]).toBe(cnCode.split(' ')[1]);
  expect(errors).toEqual([]);
});

test('tracks: kept in a saved project, and slot + track reach Module Builder', async ({ page }) => {
  const errors = await openApp(page);
  const data = fixture('sample-project.json');
  const mods = seedModules();
  mods[3].slot = mods[4].slot = 'slot_1';
  data.moduleMapping = { modules: mods, moduleCounter: 5, levelCount: 3,
    tracks: [{ code: 'CM', name: 'Computer Maintenance' }, { code: 'CN', name: 'Computer Networks' }] };
  await loadProject(page, data);
  expect(await state(page, 's => s.moduleMappingData.tracks')).toEqual(data.moduleMapping.tracks);
  expect((await modules(page)).map(m => m.slot)).toEqual([undefined, undefined, undefined, 'slot_1', 'slot_1']);

  await page.evaluate(() => { window.switchTab('module-mapping-tab'); window.open = () => null; });
  await expect(page.locator('#mmTracksBar [data-trk-filter="CN"]')).toContainText('Computer Networks');
  await page.evaluate(async () => (await import('./module_mapping.js')).openModuleBuilderFromMapping());
  const sent = await page.evaluate(() => JSON.parse(localStorage.getItem('dacum_modules_export')));
  expect(sent.modules.map(m => [m.track, m.slot || ''])).toEqual([['', ''], ['', ''], ['', ''], ['CM', 'slot_1'], ['CN', 'slot_1']]);
  expect(errors).toEqual([]);
});

test('tracks: Word and PDF exports hold every track in one file', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openWithModules(page, { replace: false });
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const m = appState.moduleMappingData.modules;
    const a = m[m.length - 2], b = m[m.length - 1];
    a.track = 'CM'; b.track = 'CN'; a.slot = b.slot = 'slot_1';
    appState.moduleMappingData.tracks = [{ code: 'CM', name: 'Computer Maintenance' }, { code: 'CN', name: 'Computer Networks' }];
  });
  const [word] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    page.evaluate(async () => (await import('./exports_docx.js')).exportToWord())]);
  const wordPath = await word.path();
  const xml = execFileSync('unzip', ['-p', wordPath, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  expect(xml).toContain('Programmes by stream');
  expect(xml).toContain('Computer Maintenance programme');
  expect(xml).toContain('Computer Networks programme');
  expect(xml).toContain('Repair of PCs');
  expect(xml).toContain('Network setup');

  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }),
    page.evaluate(async () => (await import('./exports_pdf.js')).exportToPDF())]);
  const buf = fs.readFileSync(await pdf.path());
  expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  expect(buf.length).toBeGreaterThan(10_000);

  const [json] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }),
    page.evaluate(async () => (await import('./modules.js')).exportModuleMappingJSON())]);
  const out = JSON.parse(fs.readFileSync(await json.path(), 'utf8'));
  expect(out.tracks.programmes.map(p => p.code)).toEqual(['CM', 'CN']);
  expect(out.tracks.slots).toHaveLength(1);
  expect(errors).toEqual([]);
});
