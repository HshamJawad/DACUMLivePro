// 3.127.0: Task Analysis list cards — automatic bullets; Enter continues
// the list (bullets, or numbers after the 1-2-3 button); Enter on a
// marker alone removes it.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture, state } = require('../helpers');

for (const lang of ['en', 'ar']) {
  test(`automatic bullets, then numbering (${lang})`, async ({ page }) => {
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('task-analysis-tab'));
    await page.locator('[data-action="ta-select-task"][data-task-key="duty_1_1"]').click();
    const block = page.locator('[data-field-block="performanceSteps"]');
    const ta = block.locator('textarea');
    await ta.fill('');
    await ta.press('Control+End');
    await ta.pressSequentially('Receive the request');
    await ta.press('Enter');
    await ta.pressSequentially('Check the authorisation');
    await expect(ta).toHaveValue('• Receive the request\n• Check the authorisation');
    expect(await state(page, 's => s.taskAnalysisData.duty_1_1.performanceSteps'))
      .toEqual(['• Receive the request', '• Check the authorisation']);

    // switch to numbering: Enter continues with the next number
    await block.locator('[data-format-type="number"]').click();
    await expect(ta).toHaveValue('1. Receive the request\n2. Check the authorisation');
    await ta.focus();
    await ta.press('Control+End');
    await ta.press('Enter');
    await ta.pressSequentially('Issue the items');
    await expect(ta).toHaveValue('1. Receive the request\n2. Check the authorisation\n3. Issue the items');

    // Enter on a marker alone removes it
    await ta.press('Enter');
    await ta.press('Enter');
    await expect(ta).toHaveValue('1. Receive the request\n2. Check the authorisation\n3. Issue the items\n');
    expect(errors).toEqual([]);
  });
}
