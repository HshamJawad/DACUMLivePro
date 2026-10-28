// 3.140.5 — ready-made assessment / training methods per learning outcome, and the
// "course structure" heading of the CBC draft starting on its own page.
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

async function firstLo(page) {
  const ids = await state(page, 's => ({ m: s.moduleMappingData.modules[0].id, lo: s.moduleMappingData.modules[0].learningOutcomes[0].id })');
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));
  await page.locator('#curRoot [data-cur-subtab="cbc"]').click();    // 3.141.1: training methods live in the CBC sub-tab
  const card = page.locator('#curRoot details.cur-lo').first();
  if ((await card.getAttribute('open')) === null) await card.locator('.cur-lo-sum').click();
  return ids;
}
const tick = async (page, field, id) => {
  const pick = page.locator(`#curRoot details.cur-lo >> nth=0 >> details[data-cur-pick$="|${field}"]`);
  if ((await pick.getAttribute('open')) === null) await pick.locator('> summary').click();
  await pick.locator(`input[data-cur-method="${id}"]`).click();
};
const rec = (page, ids) => state(page, `s => s.moduleCurriculumData.byModule['${ids.m}'].byLO['${ids.lo}']`);

test('tick assessment and training methods: stored in the outcome, exported, un-tick removes, own text kept', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  const ids = await firstLo(page);

  await tick(page, 'assessMethods', 'demonstration');
  await tick(page, 'assessMethods', 'portfolio');
  await tick(page, 'trainMethods', 'groupWork');
  let r = await rec(page, ids);
  expect(r.assessMethods).toEqual(['Demonstration', 'Portfolio']);
  expect(r.trainMethods).toEqual(['Group work']);
  // the picker being used stays open while ticking; the other one closes (a click outside); both show their count
  await expect(page.locator('#curRoot details[data-cur-pick$="|trainMethods"]').first()).toHaveAttribute('open', '');
  await expect(page.locator('#curRoot details[data-cur-pick$="|assessMethods"]').first()).not.toHaveAttribute('open', '');
  await expect(page.locator('#curRoot details[data-cur-pick$="|assessMethods"] .cur-pick-count').first()).toHaveText('2 selected');
  await expect(page.locator('#curRoot details[data-cur-pick$="|trainMethods"] .cur-pick-count').first()).toHaveText('1 selected');

  // a method typed by hand is kept next to the ticked ones
  await page.evaluate(async ({ m, lo }) => {
    const { appState } = await import('./state.js');
    appState.moduleCurriculumData.byModule[m].byLO[lo].assessMethods.push('My own method');
  }, ids);

  // the CBC draft carries both lists
  let [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./module_curriculum.js')).exportCbcWord())]);
  let xml = docXml(await dl.path());
  ['Demonstration', 'Portfolio', 'Group work', 'My own method'].forEach(t => expect(xml).toContain(t));

  // un-tick removes only that method
  await tick(page, 'assessMethods', 'demonstration');
  r = await rec(page, ids);
  expect(r.assessMethods).toEqual(['Portfolio', 'My own method']);
  expect(errors).toEqual([]);
});

test('a tick is written in the document language and recognised in any wording', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.i18n.setContentLangProvider(() => 'ar'));
  const ids = await firstLo(page);

  await tick(page, 'trainMethods', 'lecture');
  await tick(page, 'assessMethods', 'oral');
  let r = await rec(page, ids);
  expect(r.trainMethods).toEqual(['محاضرة (Lecture)']);
  expect(r.assessMethods).toEqual(['اختبار شفهي (Oral Test)']);

  // still ticked although the screen is English; un-tick removes the Arabic wording
  await expect(page.locator('#curRoot input[data-cur-method="lecture"]').first()).toBeChecked();
  await tick(page, 'trainMethods', 'lecture');
  r = await rec(page, ids);
  expect(r.trainMethods).toEqual([]);

  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./module_curriculum.js')).exportCbcWord())]);
  const xml = docXml(await dl.path());
  expect(xml).toContain('اختبار شفهي (Oral Test)');
  expect(errors).toEqual([]);
});

test('CBC draft: "Course structure" starts on a new page', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./module_curriculum.js')).exportCbcWord())]);
  const xml = docXml(await dl.path());
  expect(xml).toMatch(/<w:p>(?:(?!<\/w:p>).)*?<w:pageBreakBefore\/>(?:(?!<\/w:p>).)*?COURSE STRUCTURE(?:(?!<\/w:p>).)*?<\/w:p>/);
  expect(errors).toEqual([]);
});
