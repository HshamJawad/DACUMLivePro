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

  // Undo was chosen for the Arabic project: it opens again in English
  await page.locator(`.dps-card[data-project-id="${ar}"] .dps-card-body`).click();
  await page.waitForTimeout(400);
  expect(await lang(page)).toBe('en');
  // after a reload the last project is restored without switching
  await page.evaluate(async (id) => { localStorage.removeItem('dacum_follow_lang_kept'); }, ar);
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
