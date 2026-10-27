// 3.140.1 — text in an imported project file is shown as text, never run.
// A project file can carry any heading and text for a custom section. Opening it
// must show exactly what was written and create no element from it. (The older,
// unused loader in snapshots.js, loadFromJSONLegacy, built the section as HTML
// and is escaped now too; this test covers the loader the app really uses.)
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp } = require('../helpers');

test('a custom section from an imported file is text, not markup', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-project.json'), 'utf8'));
  const heading = 'Tools <img src=x onerror="window.__pwnedHeading=1"> & more';
  const body = 'line one\n</textarea><img src=x onerror="window.__pwnedBody=1">\nline three "quoted" & <b>bold</b>';
  data.additionalInfo = Object.assign({}, data.additionalInfo, { customSections: [{ heading, content: body }] });

  await page.setInputFiles('#loadFileInput', {
    name: 'Crafted_2026-01-01_00-00.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator('#customSection1Heading')).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(500);

  expect(await page.evaluate(() => [window.__pwnedHeading, window.__pwnedBody])).toEqual([undefined, undefined]);
  // Shown exactly as written: no element was created from the text.
  expect(await page.locator('#customSection1Heading').textContent()).toBe(heading);
  expect(await page.locator('#customSection1Heading img').count()).toBe(0);
  expect(await page.locator('#customSection1Input').inputValue()).toBe(body);
  expect(await page.locator('#customSection1Input ~ img, #customSection1 img').count()).toBe(0);
  expect(errors).toEqual([]);
});
