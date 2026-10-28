// 3.143.0 — CUR sub-tab: a «Personal protective equipment» card of its own, and the CUR
// Word export printing ONE tools list and the PPE list (heading row, then content row).
const fs = require('fs');
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture } = require('../helpers');

function docXml(file) {
  const buf = fs.readFileSync(file);
  let off = 0, out = '';
  while ((off = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), off)) !== -1) {
    const nameLen = buf.readUInt16LE(off + 26), extra = buf.readUInt16LE(off + 28);
    const comp = buf.readUInt32LE(off + 18), method = buf.readUInt16LE(off + 8);
    const name = buf.slice(off + 30, off + 30 + nameLen).toString();
    const start = off + 30 + nameLen + extra;
    if (name === 'word/document.xml') {
      const data = buf.slice(start, start + comp);
      out = method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
    }
    off = start;
  }
  return out;
}
const ppeTa = page => page.locator('#curRoot textarea[data-ck="ppeText"]');
const ppeAct = (page, a) => page.locator(`#curRoot [data-cur-list="ppeText"] [data-cur-action="${a}"]`);

test('PPE card: own list, bullets, clear; CBC untouched; handoff carries ppeText', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));
  await page.locator('#curRoot [data-cur-subtab="cur"]').click();
  const m = await state(page, 's => s.moduleMappingData.modules[0].id');
  await expect(page.locator('#curRoot .cur-ppe-card')).toHaveCount(1);
  await ppeTa(page).fill('Gloves\nGoggles');
  await ppeAct(page, 'tools-style').first().click();
  await ppeAct(page, 'tools-style').nth(1).click();
  const r = await state(page, `s => s.moduleCurriculumData.byModule['${m}']`);
  expect(r.ppeText).toBe('▪ Gloves\n▪ Goggles');
  expect(r.toolsText || '').toBe('');                       // the other list is not touched
  const h = await page.evaluate(async id => (await import('./module_curriculum.js')).getCurriculumHandoff(id), m);
  expect(h.ppeText).toBe('▪ Gloves\n▪ Goggles');
  await page.locator('#curRoot [data-cur-subtab="cbc"]').click();
  await expect(page.locator('#curRoot .cur-ppe-card')).toHaveCount(0);
  await page.locator('#curRoot [data-cur-subtab="cur"]').click();
  await ppeAct(page, 'tools-clear').click();
  expect((await state(page, `s => s.moduleCurriculumData.byModule['${m}'].ppeText`))).toBe('');
  expect(errors).toEqual([]);
});

test('CUR Word: one tools list and the PPE list, each under its heading, in one table', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  const m = await state(page, 's => s.moduleMappingData.modules[0].id');
  await page.evaluate(async id => {
    const { appState } = await import('./state.js');
    const r = appState.moduleCurriculumData.byModule[id] || (appState.moduleCurriculumData.byModule[id] = {});
    r.toolsText = '1- ZZHammer\n2- ZZSaw'; r.ppeText = '▪ ZZGloves';
    r.tools = ['OLDTOOL']; r.ppe = ['OLDPPE'];
  }, m);
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async id => (await import('./module_curriculum.js')).exportModuleCurriculumWord(id), m)]);
  const xml = docXml(await dl.path());
  expect(xml).toContain('ZZHammer'); expect(xml).toContain('ZZSaw'); expect(xml).toContain('ZZGloves');
  expect(xml).toContain('1- ');
  expect(xml).not.toContain('OLDTOOL'); expect(xml).not.toContain('OLDPPE');
  expect(xml.indexOf('Tools, equipment and materials needed')).toBeLessThan(xml.indexOf('ZZHammer'));
  expect(xml.indexOf('ZZSaw')).toBeLessThan(xml.indexOf('Personal protective equipment'));
  expect(xml.indexOf('Personal protective equipment')).toBeLessThan(xml.indexOf('ZZGloves'));
  expect(errors).toEqual([]);
});

test('Arabic interface: an empty list box reads right-to-left, a typed one follows its text', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));
  await page.locator('#curRoot [data-cur-subtab="cur"]').click();
  const box = ppeTa(page);
  expect(await box.evaluate(e => getComputedStyle(e).direction)).toBe('rtl');
  expect(await box.evaluate(e => e.hasAttribute('dir'))).toBe(false);
  await box.fill('Gloves');
  expect(await box.getAttribute('dir')).toBe('auto');
  expect(errors).toEqual([]);
});
