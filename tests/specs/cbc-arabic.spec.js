// 3.140.4 — Arabic CBC export: wording (محصلات التعلم / الكفاءة) and Arabic-Indic numbering.
const fs = require('fs');
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

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

test('Arabic CBC draft: new terms and Arabic-Indic numbers; English export keeps 1. 2. 3.', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    Object.assign(appState.moduleCurriculumData.settings, {
      courseDescription: 'ZZ', courseOutcomes: ['ZZ one', 'ZZ two'], qualificationLevel: 'ZZ',
    });
  });

  // English first: the numbers stay as they were.
  let [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./module_curriculum.js')).exportCbcWord())]);
  let xml = docXml(await dl.path());
  expect(xml).toMatch(/<w:t[^>]*>1\. <\/w:t>/);
  expect(xml).not.toMatch(/<w:t[^>]*>[٠-٩]+\. <\/w:t>/);

  // The document is written in Arabic.
  await page.evaluate(() => window.i18n.setContentLangProvider(() => 'ar'));
  [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./module_curriculum.js')).exportCbcWord())]);
  xml = docXml(await dl.path());

  // New wording.
  ['المنهج القائم على الكفاءات', 'وحدات الكفاءة', 'وحدة الكفاءة', 'محصلات التعلم', 'ملخص محصلات التعلم', 'المحصلة ١.']
    .forEach(t => expect(xml).toContain(t));
  // Old wording is gone from the fixed texts.
  ['مخرجات التعلم', 'الكفاية', 'الكفايات', 'المخرج ١'].forEach(t => expect(xml).not.toContain(t));

  // Numbering: Arabic-Indic digits, none in Western digits.
  expect(xml).toMatch(/<w:t[^>]*>١\. <\/w:t>/);
  expect(xml).toMatch(/<w:t[^>]*>٢\. <\/w:t>/);
  expect(xml).not.toMatch(/<w:t[^>]*>[0-9]+\. <\/w:t>/);
  expect(errors).toEqual([]);
});
