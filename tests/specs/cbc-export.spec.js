// 3.101.0 — module categories (Module Mapping) and the CBC draft export.
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

test('category per module, editable list, CBC draft grouped by category', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-mapping-tab'));

  await page.selectOption('#modulesContainer .mod-cat-select', 'core');
  expect(await state(page, 's => s.moduleMappingData.modules[0].category')).toBe('core');
  await expect(page.locator('#modulesContainer .mod-cat-chip')).toHaveText('Core');

  // Rename the list: the module keeps its category (same position).
  await page.selectOption('#modulesContainer .mod-cat-select', '__edit');
  await expect(page.locator('#mmCatModal')).toBeVisible();
  await page.fill('#mmCatLines', 'Basic\nCommon\nZZ Specialised\nElective\nZZ Work placement');
  await page.click('#mmCatModal [data-cat="save"]');
  expect(await state(page, 's => s.moduleMappingData.modules[0].category')).toBe('core');
  await expect(page.locator('#modulesContainer .mod-cat-chip')).toHaveText('ZZ Specialised');
  expect(await state(page, 's => s.moduleMappingData.moduleCategories.length')).toBe(5);

  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    Object.assign(appState.moduleCurriculumData.settings, {
      courseDescription: 'ZZ course description', courseOutcomes: ['ZZ course outcome'], qualificationLevel: 'ZZ Level 2',
    });
  });
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./module_curriculum.js')).exportCbcWord())]);
  expect(dl.suggestedFilename()).toMatch(/^CBC_.*\.docx$/);
  const xml = docXml(await dl.path());
  ['COMPETENCY-BASED CURRICULUM', 'ZZ course description', 'ZZ course outcome', 'ZZ Level 2',
   'ZZ SPECIALISED', 'MODULES OF INSTRUCTION', 'Implementing Core Work'].forEach(t => expect(xml).toContain(t));
  expect(errors).toEqual([]);
});

test('CBC dialog: one file per module; course design optional; whole programme button', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    appState.moduleCurriculumData.settings.courseDescription = 'ZZ course description';
  });
  await page.click('#btnExportOS');
  const item = page.locator('#curStdMenu [data-mnu="cbc"]');
  await expect(item).toBeEnabled();
  await item.click();
  await expect(page.locator('#cbcExportModal')).toBeVisible();

  // Per module, design off by default.
  let [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#cbcExportModal [data-cbc-dl]').first().click()]);
  expect(dl.suggestedFilename()).toMatch(/^CBC_.*Implementing_Core_Work\.docx$/);
  let xml = docXml(await dl.path());
  expect(xml).toContain('MODULE OF INSTRUCTION');
  expect(xml).not.toContain('ZZ course description');

  // Design ticked → summary included (and remembered).
  await page.check('#cbcDesignOpt');
  expect(await state(page, 's => s.moduleCurriculumData.settings.cbcIncludeDesign')).toBe(true);
  [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#cbcExportModal [data-cbc-dl]').first().click()]);
  xml = docXml(await dl.path());
  expect(xml).toContain('ZZ course description');
  expect(xml).toContain('COURSE STRUCTURE');

  // Whole programme.
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cbcExportModal [data-cbc-all]')]);
  expect(dl.suggestedFilename()).toMatch(/^CBC_Maintenance/);
  expect(docXml(await dl.path())).toContain('MODULES OF INSTRUCTION');
  expect(errors).toEqual([]);
});
