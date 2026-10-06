// 3.72.0: DACUM analyses the job, so AI generation needs the Job Title,
// and the title check also asks whether the job fits the occupation.
const { test, expect } = require('@playwright/test');
const { openApp, mockAI, fillJob } = require('../helpers');

test('no Job Title: nothing is sent to the AI', async ({ page }) => {
  await openApp(page);
  const ai = await mockAI(page);
  await fillJob(page, { job: '' });
  await page.evaluate(() => window.switchTab('duties-tab'));
  await page.click('#aiGenerateBtn');
  await page.waitForTimeout(800);
  expect(ai.calls).toEqual([]);
});

test('a job from another occupation is questioned before generating', async ({ page }) => {
  await openApp(page);
  const ai = await mockAI(page, { overrides: { check: () => ({ verdict: 'known', job_verdict: 'not_in_occupation' }) } });
  await fillJob(page, { job: 'Accountant' });
  await page.evaluate(() => window.switchTab('duties-tab'));
  await page.click('#aiGenerateBtn');
  await expect(page.locator('#occupationWarning')).toContainText('Maintenance Technician');
  expect(ai.calls).toEqual(['check']);
  // the generation prompt puts the job first, the occupation as context
  await page.click('#btnOccAnyway');
  await expect.poll(() => ai.calls.length).toBe(2);
});

test('the duties prompt analyses the job, not the occupation', async ({ page }) => {
  await openApp(page);
  let prompt = '';
  await mockAI(page, { overrides: { duties: (p) => { prompt = p; return { duties: [{ title: 'Duty A', tasks: ['Replace RAM'] }] }; } } });
  await fillJob(page);
  await page.evaluate(() => window.switchTab('duties-tab'));
  await page.click('#aiGenerateBtn');
  await expect.poll(() => prompt.length).toBeGreaterThan(0);
  expect(prompt.indexOf('Job Title (UNIT OF ANALYSIS')).toBeLessThan(prompt.indexOf('Occupation (CONTEXT ONLY'));
  expect(prompt).not.toContain('generic role');
});
