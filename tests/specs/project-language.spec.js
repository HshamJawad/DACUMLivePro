// 3.107.0: a project says its language. Its card in the Projects sidebar
// carries the language; opening it switches the interface to that
// language (Settings → Misc, on by default) with Undo; saved files carry
// the language in their name.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const lang = (page) => page.evaluate(() => window.i18n.getLang());
const badge = (page, id) => page.locator(`.dps-card[data-project-id="${id}"] .dps-lang-badge`);
const projectIds = (page) => page.evaluate(async () => {
  const ps = (await import('./project_store.js')).readProjects();
  return (Array.isArray(ps) ? ps : ps.projects).map(p => p.id);
});

test('cards show the language; opening an Arabic project switches the interface, with Undo', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en', followProjectLang: 'on' });
  await loadProject(page, fixture('sample-project.json'), 'Sample_2026-01-01_00-00.json');
  await loadProject(page, fixture('pilot-ar.json'), 'Pilot_AR_2026-10-13_21-40.json');
  const [en, ar] = (await projectIds(page)).slice(-2);
  await expect(badge(page, en)).toContainText('EN');
  await expect(badge(page, ar)).toContainText('AR');
  // the tag of the file name is not part of the project name
  const names = await page.evaluate(async () => (await import('./project_store.js')).readProjects().map(p => p.name));
  expect(names).toContain('Pilot');

  expect(await lang(page)).toBe('ar');                       // loadProject opened the Arabic one
  const note = page.locator('#dpsLangNote');
  await expect(note).toContainText('العربية');
  await note.locator('[data-dps-undo]').click();
  expect(await lang(page)).toBe('en');
  await expect(note).toHaveCount(0);

  // back to the English project: the interface is English already — no note
  await page.locator(`.dps-card[data-project-id="${en}"] .dps-card-body`).click();
  await page.waitForTimeout(400);
  expect(await lang(page)).toBe('en');
  await expect(page.locator('#dpsLangNote')).toHaveCount(0);

  // Undo is for that opening only: going back and forth switches every time
  for (let i = 0; i < 2; i++) {
    await page.locator(`.dps-card[data-project-id="${ar}"] .dps-card-body`).click();
    await page.waitForTimeout(400);
    expect(await lang(page)).toBe('ar');
    await page.locator(`.dps-card[data-project-id="${en}"] .dps-card-body`).click();
    await page.waitForTimeout(400);
    expect(await lang(page)).toBe('en');
  }
  await page.locator(`.dps-card[data-project-id="${ar}"] .dps-card-body`).click();
  await page.waitForTimeout(400);
  // after a reload the last project is restored without switching
  await page.evaluate(() => window.i18n.setLang('en'));
  await page.reload();
  await page.waitForFunction(() => !!window.i18n && typeof window.switchTab === 'function');
  await page.waitForTimeout(800);
  expect(await lang(page)).toBe('en');
  expect(errors).toEqual([]);
});

test('Settings → Misc "Keep the current interface language": no switch', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en', followProjectLang: 'on' });
  await page.evaluate(async () => (await import('./ui_prefs.js')).setPref('followProjectLang', 'off'));
  await loadProject(page, fixture('pilot-ar.json'));
  expect(await lang(page)).toBe('en');
  await expect(page.locator('#dpsLangNote')).toHaveCount(0);
  // turned on again in Settings → Misc: the open project's language, at once
  await page.evaluate(async () => (await import('./ui_prefs.js')).setPref('followProjectLang', 'on'));
  expect(await lang(page)).toBe('ar');
  expect(errors).toEqual([]);
});

test('saved project files carry the language in their name', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await page.evaluate(async () => (await import('./ui_prefs.js')).setPref('followProjectLang', 'off'));
  await loadProject(page, fixture('pilot-ar.json'), 'Pilot_2026-10-13_21-40.json');
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./snapshots.js')).saveToJSON())]);
  expect(dl.suggestedFilename()).toMatch(/^Pilot_AR_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/);
  expect(errors).toEqual([]);
});

// 3.108.0: Settings → Misc — Latin duty letters in the Arabic interface.
test('Arabic interface: duty letters Arabic by default, Latin when chosen in Misc', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('pilot-ar.json'));
  const code = () => page.evaluate(async () => (await import('./codes.js')).getTaskCodeShort('duty_6_1'));
  expect(await code()).toBe('و1');
  await page.evaluate(async () => (await import('./ui_prefs.js')).setPref('codeLetters', 'latin'));
  expect(await code()).toBe('F1');
  await expect(page.locator('body')).toContainText('F1');          // redrawn at once
  await page.evaluate(async () => (await import('./export_settings.js')).openExportSettings({ tab: 'misc' }));
  await expect(page.locator('input[data-ms-pref="codeLetters"][value="latin"]')).toBeChecked();
  expect(errors).toEqual([]);
});

// 3.129.2: a new project has no text yet — its card shows the interface
// language (not EN), and opening it never switches the interface.
for (const ui of ['ar', 'fr', 'en']) {
  test(`new empty project: card shows the interface language, no switch (${ui})`, async ({ page }) => {
    const errors = await openApp(page, { lang: ui, followProjectLang: 'on' });
    const id = await page.evaluate(async () => (await import('./dacum_projects.js')).createProject('Empty'));
    await expect(badge(page, id)).toContainText(ui.toUpperCase());
    // open another project, then come back to the empty one: no switch, no note
    await loadProject(page, fixture(ui === 'ar' ? 'pilot-ar.json' : 'sample-project.json'));
    const back = await lang(page);
    await page.locator(`.dps-card[data-project-id="${id}"] .dps-card-body`).click();
    await page.waitForTimeout(400);
    expect(await lang(page)).toBe(back);
    await expect(page.locator('#dpsLangNote')).toHaveCount(0);
    await expect(badge(page, id)).toContainText(back.toUpperCase());
    expect(errors).toEqual([]);
  });
}
