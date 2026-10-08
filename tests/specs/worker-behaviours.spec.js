// Task Analysis: the Worker Behaviours section (3.92.0) — after Required
// Skills, picked from the Additional Info list, saved, exported to Word
// and carried in the Module Builder handoff. Older records (no such key)
// take a first pick without error.
const fs = require('fs');
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture } = require('../helpers');

async function openTask(page, key = 'duty_1_1') {
  await page.evaluate(() => window.switchTab('task-analysis-tab'));
  await page.locator(`[data-action="ta-select-task"][data-task-key="${key}"]`).click();
}

for (const lang of ['en', 'fr', 'ar']) {
  test(`section after Skills, picked from Additional Info (${lang})`, async ({ page }) => {
    if (lang !== 'en') await page.setViewportSize({ width: 360, height: 780 });
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => {
      const t = document.getElementById('behaviorsInput');
      t.value = '• Precision and attention to detail\n• Patience with customers\n• Teamwork';
      t.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await openTask(page);

    const blocks = await page.evaluate(() => [...document.querySelectorAll('[data-field-block]')].map(e => e.getAttribute('data-field-block')));
    expect(blocks.indexOf('workerBehaviours')).toBe(blocks.indexOf('requiredSkills') + 1);
    await expect(page.locator('[data-field-block="workerBehaviours"] h3'))
      .toContainText({ en: 'Worker Behaviours', fr: 'Comportements du travailleur', ar: 'سلوكيات العامل' }[lang]);

    // The fixture's record has no workerBehaviours key: the first pick must still work.
    expect(await state(page, 's => "workerBehaviours" in s.taskAnalysisData.duty_1_1')).toBe(false);
    await page.locator('[data-field-block="workerBehaviours"] [data-action="ta-pick-from-info"]').click();
    await expect(page.locator('[data-ta-pick-item]')).toHaveCount(3);
    await page.locator('[data-ta-pick-item]').nth(0).check();
    await page.locator('[data-ta-pick-item]').nth(1).check();
    await page.click('[data-ta-pick-confirm]');
    expect(await state(page, 's => s.taskAnalysisData.duty_1_1.workerBehaviours'))
      .toEqual(['Precision and attention to detail', 'Patience with customers']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('saved, exported to Word and carried to Module Builder', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    appState.taskAnalysisData.duty_1_1.workerBehaviours = ['ZZ careful with power cables'];
  });

  const [json] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./snapshots.js')).saveToJSON())]);
  expect(fs.readFileSync(await json.path(), 'utf8')).toContain('ZZ careful with power cables');

  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  const [mb] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./modules.js')).exportModuleMappingJSON())]);
  const handoff = fs.readFileSync(await mb.path(), 'utf8');
  expect(handoff).toContain('"workerBehaviours"');
  expect(handoff).toContain('ZZ careful with power cables');

  const [doc] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    page.evaluate(async () => (await import('./exports_docx.js')).exportToWord())]);
  const buf = fs.readFileSync(await doc.path());
  expect(buf.slice(0, 2).toString()).toBe('PK');
  // document.xml is a deflated entry of the .docx (a zip): find its local
  // header and inflate it — no zip library needed.
  const xml = (() => {
    const name = Buffer.from('word/document.xml');
    for (let i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])); i >= 0; i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), i + 4)) {
      const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18);
      const nLen = buf.readUInt16LE(i + 26), xLen = buf.readUInt16LE(i + 28);
      if (!buf.slice(i + 30, i + 30 + nLen).equals(name)) continue;
      const data = buf.slice(i + 30 + nLen + xLen, i + 30 + nLen + xLen + size);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    return '';
  })();
  expect(xml).toContain('Worker Behaviours');
  expect(xml).toContain('ZZ careful with power cables');
  expect(errors).toEqual([]);
});
