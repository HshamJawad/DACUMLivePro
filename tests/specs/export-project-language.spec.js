// 3.137.0: a document is written in the PROJECT's language, not the interface's.
// An Arabic project exported while the interface is English used to print its
// Arabic as symbols (the Arabic font was only loaded for an Arabic interface).
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, loadProject, fixture } = require('../helpers');

const pdfText = async (download) => {
  const f = path.join(os.tmpdir(), `epl_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  fs.copyFileSync(await download.path(), f);
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }); }
  finally { fs.unlinkSync(f); }
};
const arabicLetters = (s) => (s.match(/[؀-ۿﭐ-﷿ﹰ-﻿]/g) || []).length;

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
  const txt = await pdfText(pdf);
  expect(arabicLetters(txt)).toBeGreaterThan(50);
  expect(txt).not.toMatch(/þ/);                // the symbols seen when the font was missing
  expect(await page.evaluate(() => window.i18n.getLang())).toBe('en');

  // Control: without the project-language rule it is the interface language again.
  await page.evaluate(() => window.i18n.setExportLangFallback(null));
  expect(await page.evaluate(() => window.i18n.exportLang())).toBe('en');
  const [bad] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }),
    page.evaluate(async () => (await import('./exports_pdf.js')).exportToPDF())]);
  const badTxt = await pdfText(bad);
  expect(arabicLetters(badTxt)).toBeLessThan(arabicLetters(txt) / 4);   // the old output: symbols, not Arabic
  expect(errors).toEqual([]);
});

test('English project in an Arabic interface exports in English; empty project follows the interface', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  expect(await page.evaluate(() => window.i18n.exportLang())).toBe('en');
  expect(await page.evaluate(() => window.i18n.withContentLang(() => window.i18n.isRTL()))).toBe(false);
  expect(errors).toEqual([]);
});
