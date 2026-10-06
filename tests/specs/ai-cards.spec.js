// The AI cards that write into content the user may already have
// (ai_draft.js, 3.75.0): choose what to generate, filled parts start
// unticked, an AI-draft mark, and "↶ Restore previous" until edited.
const { test, expect } = require('@playwright/test');
const { openApp, state, loadProject, fixture, mockAI } = require('../helpers');

test.describe('Task Analysis card', () => {
  test('replaces only ticked sections, offers custom sections, restores', async ({ page }) => {
    const errors = await openApp(page);
    let prompt = '';
    await mockAI(page, { overrides: { ta: (p) => { prompt = p; return { sections: {
      performanceSteps: ['AI step 1', 'AI step 2'], safetyOSH: ['AI hazard'],
      [p.match(/"(custom:[^"]+)"/)?.[1] || 'none']: ['Quality item'] } }; } } });
    const data = fixture('sample-project.json');
    data.taskAnalysisCustomSections = [{ id: 'q1', title: 'Quality Requirements' }];
    await loadProject(page, data);
    const key = (await state(page, 's => s.dutiesData[0].tasks[0].inputId'));
    await page.evaluate(() => window.switchTab('task-analysis-tab'));
    await page.click(`.ta-nav-task[data-task-key="${key}"]`);
    await page.click('.ta-ai-btn');
    const dlg = page.locator('#taAiModal');
    await expect(dlg.locator('input[data-ai-part="performanceSteps"]')).not.toBeChecked();   // filled → unticked
    await expect(dlg.locator('input[data-ai-part="custom:q1"]')).toBeChecked();
    await dlg.locator('input[data-ai-part="performanceSteps"]').check();
    await dlg.locator('[data-ai-go]').click();
    await expect.poll(() => state(page, `s => s.taskAnalysisData['${key}'].performanceSteps`)).toEqual(['AI step 1', 'AI step 2']);
    expect(prompt).toContain('Quality Requirements');
    expect(await state(page, `s => s.taskAnalysisData['${key}'].custom.q1`)).toEqual(['Quality item']);
    await page.click('[data-field-block="performanceSteps"] .ai-draft-restore');
    expect(await state(page, `s => s.taskAnalysisData['${key}'].performanceSteps`)).toEqual(['Prepare the workspace', 'Inspect the unit']);
    // the kept value never reaches Module Builder
    const rec = await page.evaluate(async (k) => (await import('./task_analysis.js')).getTaskAnalysisRecord(k), key);
    expect(rec).not.toHaveProperty('_aiPrev');
    expect(errors).toEqual([]);
  });
});

test.describe('Competency cluster card', () => {
  test('criteria only: the Range is kept and sent as context; restore works', async ({ page }) => {
    const errors = await openApp(page);
    let prompt = '';
    await mockAI(page, { overrides: { criteria: (p) => { prompt = p;
      return { clusters: [{ id: [...p.matchAll(/- id: (\S+)/g)][0][1], performanceCriteria: ['New criterion & <check>'] }] }; } } });
    const data = fixture('sample-project.json');
    const c0 = data.competencyClusters.clusters[0];
    c0.name = 'Purchase & Store <Parts>';
    c0.range = 'My panel range text.';
    c0.performanceCriteria = ['Old criterion one'];
    await loadProject(page, data);
    await page.evaluate(() => window.switchTab('clustering-tab'));
    await expect(page.locator('.cluster-title').first()).toContainText('Purchase & Store <Parts>');   // escaped, shown as text
    await page.locator('.btn-ai-cluster').first().click();
    const dlg = page.locator('#clAiModal');
    await expect(dlg.locator('input[data-ai-part="range"]')).not.toBeChecked();
    await dlg.locator('input[data-ai-part="criteria"]').check();
    await dlg.locator('[data-ai-go]').click();
    await expect.poll(() => state(page, 's => s.clusteringData.clusters[0].performanceCriteria')).toEqual(['New criterion & <check>']);
    expect(await state(page, 's => s.clusteringData.clusters[0].range')).toBe('My panel range text.');
    expect(prompt).toContain('My panel range text.');
    await page.locator('.cluster-item').first().locator('.ai-draft-restore').click();
    expect(await state(page, 's => s.clusteringData.clusters[0].performanceCriteria')).toEqual(['Old criterion one']);
    expect(errors).toEqual([]);
  });
});

test.describe('Additional Info card', () => {
  test('a filled section left unticked is never touched; restore; marks are saved', async ({ page }) => {
    const errors = await openApp(page);
    let prompt = '';
    await mockAI(page, { overrides: { info: (p) => { prompt = p;
      return Object.fromEntries(['knowledge', 'skills', 'behaviors', 'tools', 'trends', 'acronyms', 'careerPath'].map(k => [k, [`AI ${k}`]])); } } });
    await loadProject(page, fixture('sample-project.json'));
    await page.evaluate(() => window.switchTab('additional-info-tab'));
    await page.fill('#knowledgeInput', '• My own knowledge item');
    await page.fill('#toolsInput', '• My screwdriver set');
    await page.click('#aiGenerateInfoBtn');
    const dlg = page.locator('#infoAiModal');
    // the sample project has every section filled → all start unticked
    await expect(dlg.locator('input[data-ai-part="behaviors"]')).not.toBeChecked();
    for (const k of ['knowledge', 'skills', 'trends']) await dlg.locator(`input[data-ai-part="${k}"]`).check();
    await dlg.locator('input[data-ai-part="tools"]').uncheck();
    await dlg.locator('[data-ai-go]').click();
    await expect(page.locator('#knowledgeInput')).toHaveValue('• AI knowledge');
    await expect(page.locator('#toolsInput')).toHaveValue('• My screwdriver set');
    expect(prompt).toContain('GENERATE ONLY THESE SECTIONS');
    expect(prompt).toContain('My screwdriver set');
    // typing in a section drops its mark
    await page.locator('#skillsInput').press('End');
    await page.locator('#skillsInput').type(' edited');
    await expect(page.locator('.ai-draft-row[data-info-key="skills"]')).toHaveCount(0);
    await page.click('.ai-draft-row[data-info-key="knowledge"] .ai-draft-restore');
    await expect(page.locator('#knowledgeInput')).toHaveValue('• My own knowledge item');
    // marks travel with the project
    await page.evaluate(async () => { const m = await import('./dacum_projects.js'); m.saveCurrentProject();
      m.loadProject(localStorage.getItem('dacum_active_project')); });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.switchTab('additional-info-tab'));
    await expect(page.locator('.ai-draft-row[data-info-key="trends"]')).toHaveCount(1);
    await expect(page.locator('.ai-draft-row[data-info-key="behaviors"]')).toHaveCount(0);   // never generated
    expect(errors).toEqual([]);
  });
});
