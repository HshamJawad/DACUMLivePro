// 3.132.0: a 👍 on each duty card and task card of the Card View. The
// facilitator presses it when the workshop panel has agreed the statement:
// it turns green, is kept with the project, survives a re-render and can
// be undone. Nothing changes in the exports.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

for (const lang of ['en', 'ar']) {
  test(`agreed mark on duty and task cards (${lang})`, async ({ page }) => {
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('duties-tab'));
    await page.evaluate(async () => (await import('./duties.js')).switchToViewMode('card'));
    const taskBtn = page.locator('.dcv-task-card .dcv-agree').first();
    const dutyBtn = page.locator('.dcv-duty-card .dcv-agree').first();
    await expect(taskBtn).toBeVisible();
    await expect(dutyBtn).toBeVisible();
    await expect(taskBtn).toHaveAttribute('aria-pressed', 'false');
    // Beside the criteria badge, at the bottom of the card.
    await expect(page.locator('.dcv-task-card .tc-badge-row').first().locator('.dcv-agree')).toHaveCount(1);
    if (lang === 'ar') await expect(taskBtn).toHaveAttribute('title', 'تأشير الاتفاق عليه من المشاركين في ورشة العمل');

    await taskBtn.click();
    await dutyBtn.click();
    await expect(taskBtn).toHaveClass(/is-on/);
    await expect(dutyBtn).toHaveClass(/is-on/);
    const bg = await taskBtn.evaluate(e => getComputedStyle(e).backgroundColor);
    expect(bg).toBe('rgb(22, 163, 74)');                         // green
    const st = await page.evaluate(async () => { const d = (await import('./state.js')).appState.dutiesData[0]; return [d.agreed, d.tasks[0].agreed]; });
    expect(st).toEqual([true, true]);

    // Kept through a re-render.
    await page.evaluate(async () => (await import('./duties.js')).renderDutiesFromState());
    await expect(page.locator('.dcv-task-card .dcv-agree').first()).toHaveClass(/is-on/);

    // Pressed again: no longer agreed.
    await page.locator('.dcv-task-card .dcv-agree').first().click();
    expect(await page.evaluate(async () => (await import('./state.js')).appState.dutiesData[0].tasks[0].agreed)).toBeUndefined();
    expect(errors).toEqual([]);
  });
}
