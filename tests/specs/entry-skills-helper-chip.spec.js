// 3.100.1 — Module Curriculum: "Basic skills required on entry", filled
// from the Basic Skills of the module's tasks (Task Analysis); and the
// Helper chip, whose step follows the tab on screen.
const fs = require('fs');
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture } = require('../helpers');

test('entry skills suggested from Task Analysis basic skills', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    Object.values(appState.taskAnalysisData).forEach((r, i) => {
      r.basicReading = ['Read a wiring diagram'];        // same line in every task → offered once
      if (i === 0) r.basicMath = ['Calculate load current'];
    });
  });
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));
  await page.click('#curRoot [data-cur-subtab="cbc"]');       // 3.143.2: entry skills live in CBC only
  await page.click('[data-cur-action="suggest-entry"]');
  await expect(page.locator('#curEntryModal input[data-entry-i]')).toHaveCount(2);
  await page.locator('#curEntryModal .cur-btn-primary').click();

  const entry = await state(page, 's => s.moduleCurriculumData.byModule[s.moduleMappingData.modules[0].id].entrySkills');
  expect(entry).toEqual(['Read a wiring diagram', 'Calculate load current']);

  // A second run adds nothing new.
  await page.click('[data-cur-action="suggest-entry"]');
  await expect(page.locator('#curEntryModal input[data-entry-i]:disabled')).toHaveCount(2);
  await page.locator('#curEntryModal .cur-btn-primary').click();
  expect(await state(page, 's => s.moduleCurriculumData.byModule[s.moduleMappingData.modules[0].id].entrySkills.length')).toBe(2);
  expect(errors).toEqual([]);
});

test('Helper chip step follows the tab on screen', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('dacum:app-ready')));
  const chip = page.locator('#helperResumeChip .hw-chip-label');
  await expect(chip).toBeVisible();

  await page.evaluate(() => window.switchTab('verification-tab'));
  await expect(chip).toHaveText(/4/);
  await page.evaluate(() => window.switchTab('module-mapping-tab'));
  await expect(chip).toHaveText(/10/);
  // Help is outside the sequence: the step stays.
  await page.evaluate(() => window.switchTab('contact-tab'));
  await expect(chip).toHaveText(/10/);

  // Opening from the chip lands on that step.
  await page.click('#helperResumeChip [data-hw-resume]');
  await expect(page.locator('#helperWizard .hw-badge b')).toHaveText('10');
  expect(errors).toEqual([]);
});

test('programme requirements: edited in Programme settings, exported only when ticked', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('module-curriculum-tab'));
  await page.locator('#curRoot details.cur-settings > summary').click();
  await page.locator('.cur-list[data-cs="set"][data-ck="entryQualifications"] .cur-li-input').first().fill('ZZ intermediate school');
  await page.locator('.cur-list[data-cs="set"][data-ck="trainerQualifications"] .cur-li-input').first().fill('ZZ technical diploma');
  await page.locator('input[data-cs="set"][data-ck="trainersPerGroup"]').fill('2');
  await expect(page.locator('[data-cur-trainers-ratio]')).toContainText('2');
  expect(await state(page, 's => [s.moduleCurriculumData.settings.entryQualifications, s.moduleCurriculumData.settings.trainersPerGroup]'))
    .toEqual([['ZZ intermediate school'], 2]);

  const docText = async (tick) => {
    await page.evaluate(async (tick) => {
      const { appState } = await import('./state.js');
      appState.moduleCurriculumData.settings.exportProgReqs = tick;
    }, tick);
    const [dl] = await Promise.all([page.waitForEvent('download'),
      page.evaluate(async (tick) => (await import('./module_curriculum.js')).exportModuleCurriculumWord(null, { progReqs: tick }), tick)]);
    const buf = fs.readFileSync(await dl.path());
    return buf.toString('latin1');   // the XML is deflated; check via unzip below
  };
  const unzipXml = (latin) => {
    const buf = Buffer.from(latin, 'latin1');
    let off = 0; let out = '';
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
  };
  expect(unzipXml(await docText(false))).not.toContain('ZZ intermediate school');
  const withReqs = unzipXml(await docText(true));
  expect(withReqs).toContain('ZZ intermediate school');
  expect(withReqs).toContain('ZZ technical diploma');
  expect(errors).toEqual([]);
});
