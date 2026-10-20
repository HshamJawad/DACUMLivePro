// 3.130.0: the Helper wizard's Task Analysis step follows "Completed"
// (steps and criteria filled, 3.128.0), lists the Performance Criteria
// guide (3.124.0), and its tips name the completion rule and the two
// Module Mapping matrices — in EN / FR / AR.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const WANT = {
  en: { done: 'completed', tip6: 'Completed', tip10: 'curriculum matrix' },
  fr: { done: 'terminées', tip6: 'Terminé',   tip10: 'matrice du programme' },
  ar: { done: 'مكتملة',     tip6: 'مكتمل',     tip10: 'مصفوفة المنهج' },
};

for (const [lang, want] of Object.entries(WANT)) {
  test(`Helper wizard: Task Analysis step and tips (${lang})`, async ({ page }) => {
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));

    // One task with content but no criteria: analysed, not completed.
    await page.evaluate(async () => {
      const { appState } = await import('./state.js');
      appState.taskAnalysisData = { duty_1_1: { performanceSteps: ['Step one'], knowledgeRequired: ['K'] } };
    });
    await page.evaluate(() => window.switchTab('task-analysis-tab'));
    await page.evaluate(() => window.openHelperWizard());
    const wiz = page.locator('#helperWizard');
    await expect(wiz).toBeVisible();
    await expect(wiz).toContainText(want.done);
    await expect(wiz).toContainText(want.tip6);
    await expect(wiz.locator('.hw-chip.partial').first()).toBeVisible();

    const ta = await page.evaluate(async () => {
      const m = await import('./task_analysis.js');
      return { n: m.countTaskAnalysisRecords(), k: m.countTaskAnalysisCompleted() };
    });
    expect(ta).toEqual({ n: 1, k: 0 });

    // Steps and criteria filled → that task counts as completed.
    const k = await page.evaluate(async () => {
      const { appState } = await import('./state.js');
      appState.taskAnalysisData.duty_1_1.performanceCriteria = ['Done to spec'];
      return (await import('./task_analysis.js')).countTaskAnalysisCompleted();
    });
    expect(k).toBe(1);

    // The Performance Criteria guide is offered on this step.
    const titles = await page.evaluate(async () =>
      (await import('./events.js')).getTabHelpGuides(['taskAnalysis', 'basicSkills', 'pcRange']).length);
    expect(titles).toBe(3);

    const tip10 = await page.evaluate(() => window.i18n.t('hwTip10'));
    expect(tip10).toContain(want.tip10);
    expect(errors).toEqual([]);
  });
}
