// 3.142.0 — CUR sub-tab: one «tools, equipment and materials» list + recommended resources,
// both sent to Module Builder; the CBC sub-tab keeps its four lists.
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture } = require('../helpers');

const sub = (page, k) => page.locator(`#curRoot [data-cur-subtab="${k}"]`);
const ta = page => page.locator('#curRoot textarea.cur-tools-text');
const act = (page, a, extra = '') => page.locator(`#curRoot [data-cur-action="${a}"]${extra}`);

async function open(page) {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));
  await sub(page, 'cur').click();
  const m = await state(page, 's => s.moduleMappingData.modules[0].id');
  return { errors, m };
}
const rec = (page, m) => state(page, `s => (s.moduleCurriculumData.byModule['${m}'] || {})`);

test('CUR has the one list; CBC keeps the four lists and no single list', async ({ page }) => {
  const { errors } = await open(page);
  await expect(ta(page)).toBeVisible();
  for (const k of ['tools', 'equipment', 'ppe', 'materials']) await expect(page.locator(`#curRoot .cur-list[data-ck="${k}"]`)).toHaveCount(0);
  await expect(page.locator('#curRoot .cur-list[data-ck="resources"]')).toHaveCount(1);     // recommended resources stay
  await expect(page.locator('#curRoot .cur-fac')).toHaveCount(1);                           // facilities stay
  await expect(act(page, 'suggest-ta')).toBeVisible();

  await sub(page, 'cbc').click();
  await expect(ta(page)).toHaveCount(0);
  for (const k of ['tools', 'equipment', 'ppe', 'materials', 'resources']) await expect(page.locator(`#curRoot .cur-list[data-ck="${k}"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('list: typing, numbering, bullets, paste, clear; recommended resources; both go to Module Builder', async ({ page }) => {
  const { errors, m } = await open(page);

  await ta(page).fill('Hammer\nSaw');
  expect((await rec(page, m)).toolsText).toBe('Hammer\nSaw');

  await act(page, 'tools-style', '[data-style="num"]').click();
  await expect(ta(page)).toHaveValue('1- Hammer\n2- Saw');
  await act(page, 'tools-style', '[data-style="num"]').click();             // pressed again: layout off
  await expect(ta(page)).toHaveValue('Hammer\nSaw');
  await act(page, 'tools-style', '[data-style="bul"]').click();
  await expect(ta(page)).toHaveValue('▪ Hammer\n▪ Saw');

  // paste: the clipboard cannot be read here, so a box opens; markers go, duplicates are skipped, layout kept
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { readText: () => Promise.reject(new Error('no')) }, configurable: true }));
  await act(page, 'tools-paste').click();
  await expect(page.locator('#curToolsPasteModal')).toBeVisible();
  await page.fill('#curToolsPasteTa', '1- Pliers\n• saw\n- Drill');
  await page.locator('#curToolsPasteModal [data-cur-btn="1"]').click();
  await expect(ta(page)).toHaveValue('▪ Hammer\n▪ Saw\n▪ Pliers\n▪ Drill');

  // recommended resources
  await page.locator('#curRoot .cur-list[data-ck="resources"] .cur-li-input').first().fill('https://example.org/guide');

  // what Module Builder receives
  const h = await page.evaluate(async (id) => (await import('./module_curriculum.js')).getCurriculumHandoff(id), m);
  expect(h.toolsText).toBe('▪ Hammer\n▪ Saw\n▪ Pliers\n▪ Drill');
  expect(h.resources).toEqual(['https://example.org/guide']);

  // clear (the confirm box is accepted by the test helper)
  await act(page, 'tools-clear').click();
  await expect(ta(page)).toHaveValue('');
  const h2 = await page.evaluate(async (id) => (await import('./module_curriculum.js')).getCurriculumHandoff(id), m);
  expect(h2.toolsText).toBeUndefined();
  expect(h2.resources).toEqual(['https://example.org/guide']);
  expect(errors).toEqual([]);
});

test('suggest from Task Analysis: adds the ticked items to the one list', async ({ page }) => {
  const { errors, m } = await open(page);
  await act(page, 'suggest-ta').click();
  const modal = page.locator('#curTAModal');
  if (await modal.count()) {
    await expect(modal).toBeVisible();
    await modal.locator('[data-cur-btn="1"]').click();
    const r = await rec(page, m);
    expect(String(r.toolsText || '').trim().length).toBeGreaterThan(0);
    // not into the four lists of the CBC sub-tab
    for (const k of ['tools', 'equipment', 'ppe', 'materials']) expect((r[k] || []).length).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('the single list counts for the module progress', async ({ page }) => {
  const { errors, m } = await open(page);
  const before = await page.evaluate(async (id) => { const c = await import('./module_curriculum.js'); const { appState } = await import('./state.js'); return c.moduleCompleteness(appState.moduleMappingData.modules.find(x => x.id === id)); }, m);
  await ta(page).fill('Hammer');
  const after = await page.evaluate(async (id) => { const c = await import('./module_curriculum.js'); const { appState } = await import('./state.js'); return c.moduleCompleteness(appState.moduleMappingData.modules.find(x => x.id === id)); }, m);
  expect(after).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});
