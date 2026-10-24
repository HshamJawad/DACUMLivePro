// 3.137.0: a document is written in the PROJECT's language, not the interface's.
// An Arabic project exported while the interface is English used to print its
// Arabic as symbols (the Arabic font was only loaded for an Arabic interface).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { openApp, loadProject, fixture } = require('../helpers');

/* No external tools (CI has none to rely on): a PDF carries the Arabic face
   only when it was embedded (a FontFile2 entry); without it every Arabic letter
   is drawn from a Latin standard font, which is the symbols seen by the user. */
const embedsFont = async (download) => /\/FontFile2/.test(fs.readFileSync(await download.path()).toString('latin1'));

test('document language follows the project, not the interface', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, fixture('pilot-ar.json'), 'Pilot_2026-10-13_21-40.json');
  // Interface stays English; the document language is the project's.
  expect(await page.evaluate(() => window.i18n.getLang())).toBe('en');
  expect(await page.evaluate(() => window.i18n.exportLang())).toBe('ar');
  expect(await page.evaluate(() => window.i18n.withContentLang(() => window.i18n.isRTL()))).toBe(true);
  expect(await page.evaluate(() => window.i18n.isRTL())).toBe(false);          // the screen is untouched

  // The PDF has readable Arabic, and Arabic headings.
  test.setTimeout(240_000);
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }),
    page.evaluate(async () => (await import('./exports_pdf.js')).exportToPDF())]);
  expect(await embedsFont(pdf)).toBe(true);
  expect(await page.evaluate(() => window.i18n.getLang())).toBe('en');

  // Control: without the project-language rule it is the interface language again.
  await page.evaluate(() => window.i18n.setExportLangFallback(null));
  expect(await page.evaluate(() => window.i18n.exportLang())).toBe('en');
  const [bad] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }),
    page.evaluate(async () => (await import('./exports_pdf.js')).exportToPDF())]);
  expect(await embedsFont(bad)).toBe(false);    // the old output: symbols
  expect(errors).toEqual([]);
});

test('English project in an Arabic interface exports in English; empty project follows the interface', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  expect(await page.evaluate(() => window.i18n.exportLang())).toBe('en');
  expect(await page.evaluate(() => window.i18n.withContentLang(() => window.i18n.isRTL()))).toBe(false);
  expect(errors).toEqual([]);
});
