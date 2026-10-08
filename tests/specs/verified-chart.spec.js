// Verified DACUM chart (3.86.0): read-only, rebuilt from the project;
// buttons in Task Analysis and Duties & Tasks; Word / PDF section.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

async function setup(page) {
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const r = (i, f, d) => ({ importance: i, frequency: f, difficulty: d, criticality: null });
    appState.collectionMode = 'survey'; appState.priorityFormula = 'if';
    appState.dutiesData.forEach(d => d.tasks.forEach(t => { appState.verificationRatings[t.inputId] = r(1, 1, 1); }));
    appState.verificationRatings.duty_1_1 = r(3, 3, 3);   // PI 9 → #1, high
    appState.verificationRatings.duty_1_2 = r(2, 2, 2);   // PI 4 → #2
    (await import('./task_selection.js')).setTaskSelected('duty_1_3', false, 'rare');
  });
}

test('chart from Task Analysis: priority, rank, selection, filter; read-only', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await setup(page);
  await page.evaluate(() => window.switchTab('task-analysis-tab'));
  const btn = page.locator('#task-analysis-tab .vc-launch');
  await expect(btn).toBeVisible();
  await expect(btn).not.toHaveClass(/vc-pending/);            // always the full button here
  await btn.click();
  const ov = page.locator('.vc-overlay');
  await expect(ov).toBeVisible();
  await expect(ov.locator('.vc-status')).toContainText('Verification: 12/12 tasks rated');
  await expect(ov.locator('.vc-status')).toContainText('Selected for training: 11/12');
  const a1 = ov.locator('.vc-task', { hasText: 'Perform task A1' });
  await expect(a1).toHaveClass(/vc-pri-high/);
  await expect(a1.locator('.vc-rank')).toHaveText('#1');
  await expect(ov.locator('.vc-task', { hasText: 'Perform task A2' }).locator('.vc-rank')).toHaveText('#2');
  const a3 = ov.locator('.vc-task', { hasText: 'Perform task A3' });
  await expect(a3).toHaveClass(/vc-off/);
  await expect(a3).toContainText('Rarely performed');
  await expect(ov.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);   // read-only
  await expect(ov.locator('.vc-task')).toHaveCount(12);
  await ov.locator('[data-vc-filter="selected"]').click();
  await expect(ov.locator('.vc-task')).toHaveCount(11);
  await page.keyboard.press('Escape');
  await expect(ov).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Duties & Tasks button: pending until complete, never locked', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await setup(page);
  await page.evaluate(() => window.switchTab('duties-tab'));
  const btn = page.locator('#duties-tab .vc-launch');
  await expect(btn).toHaveClass(/vc-pending/);                // Task Analysis not complete
  await btn.click();
  await expect(page.locator('#vcPending')).toContainText('Task Analysis: 1/11');
  await page.locator('#vcPending [data-vc-anyway]').click();
  await expect(page.locator('.vc-overlay')).toBeVisible();
  // "Edit the selection" leads to Task Verification.
  await page.locator('.vc-overlay [data-vc-act="edit-selection"]').click();
  await expect(page.locator('#verification-tab')).toBeVisible();

  // Mark every selected task's analysis complete → the button is ready.
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    const full = { performanceSteps: ['a'], requiredKnowledge: ['a'], requiredSkills: ['a'], performanceCriteria: ['a'],
      toolsEquipmentMaterials: ['a'], safetyOSH: ['a'], decisionsCriticalPoints: ['a'], commonErrorsTroubleshooting: ['a'],
      conditionsWorkEnvironment: 'a', performanceStandard: 'a' };
    appState.dutiesData.forEach(d => d.tasks.forEach(t => { appState.taskAnalysisData[t.inputId] = JSON.parse(JSON.stringify(full)); }));
  });
  await page.evaluate(() => window.switchTab('duties-tab'));
  await expect(btn).not.toHaveClass(/vc-pending/);
  await btn.click();
  await expect(page.locator('.vc-overlay')).toBeVisible();
  await expect(page.locator('#vcPending')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Word and PDF exports carry the verified chart', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await setup(page);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    page.evaluate(async () => (await import('./exports_docx.js')).exportToWord())]);
  const xml = execFileSync('python3', ['-c',
    'import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode())', await dl.path()]).toString();
  expect(xml).toContain('Verified DACUM Chart');
  expect(xml).toContain('No — Rarely performed');
  expect(xml).toContain('#1');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }),
    page.evaluate(async () => (await import('./exports_pdf.js')).exportToPDF())]);
  expect(fs.readFileSync(await pdf.path()).slice(0, 5).toString()).toBe('%PDF-');
  expect(errors).toEqual([]);
});
