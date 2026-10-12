// 3.100.1 — Module Curriculum: "Basic skills required on entry", filled
// from the Basic Skills of the module's tasks (Task Analysis); and the
// Helper chip, whose step follows the tab on screen.
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
