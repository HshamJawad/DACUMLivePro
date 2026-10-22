// 3.134.5: the Task Verification results (dashboard summary, results
// chart, live voting results) in the interface language — no English left
// in Arabic; and the Duties & Tasks cards growing with long text in
// browsers without CSS field-sizing (e.g. Chrome on Windows 7).
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');
const API = 'https://live-session-backend-production.up.railway.app/api/';

/** Visible text in `root` with an English word (names of products and
 *  the method excepted). */
const english = (page, root) => page.evaluate((root) => {
  const ok = /^(DACUM|PI|PDF|Word|Excel|PNG|JSON|CSV|DOCX|QR|I × F( × D)?)$/;
  const out = [];
  const r = document.querySelector(root);
  const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement;
    if (!el || !el.getClientRects().length) continue;
    const t = n.textContent.replace(/Microsoft Office|DACUM_LiveWorkshop_Participant\S*|DACUM|PDF|Word|Excel|PNG|JSON|CSV|DOCX|QR|PI\b/g, '').trim();
    if (/[A-Za-z]{3,}/.test(t) && !ok.test(t)) out.push(t);
  }
  return out;
}, root);

async function rated(page) {
  const p = fixture('sample-project.json');
  // Arabic content too: the check is about the tool's own words
  p.dutiesData.forEach((d, i) => { d.title = 'الواجب رقم ' + (i + 1); d.tasks.forEach((t, j) => { t.text = 'المهمة رقم ' + (j + 1); }); });
  if (Array.isArray(p.duties)) p.duties = p.dutiesData.map(d => ({ duty: d.title, tasks: d.tasks.map(t => t.text) }));
  if (p.verification && p.verification.taskMetadata) p.verification.taskMetadata = {};
  p.verification = { ...(p.verification || {}), collectionMode: 'workshop', workflowMode: 'standard', workshopParticipants: 8, priorityFormula: 'if' };
  await loadProject(page, p);
  await page.evaluate(() => window.switchTab('verification-tab'));
  await page.evaluate(async () => {
    const T = await import('./tasks.js');
    for (const k of ['duty_1_1', 'duty_1_2', 'duty_1_3'])
      for (const dim of ['importance', 'frequency', 'difficulty']) { T.updateWorkshopCount(k, dim, 3, 5); T.updateWorkshopCount(k, dim, 2, 3); }
  });
}

test('Arabic: dashboard summary, results chart and live results have no English', async ({ page }) => {
  await page.route(API + '**', r => {
    if (r.request().url().includes('/get-results/')) return r.fulfill({ json: { success: true, data: { totalVotes: 8,
      taskResults: { duty_1_1: { avgImportance: 2.5, avgFrequency: 2, avgDifficulty: 2, priorityIndex: 5 } }, groupCounts: { workshop: 8, external: 0 } } } });
    return r.fulfill({ json: { success: true } });
  });
  const errors = await openApp(page, { lang: 'ar' });
  await rated(page);
  await page.click('#btnToggleDashboard');
  await expect(page.locator('#dashboardSummary .summary-card')).toHaveCount(4);
  expect(await english(page, '#dashboardSummary')).toEqual([]);
  await expect(page.locator('#dashboardSummary')).toContainText('متوسط مؤشر الأولوية');
  await page.click('#btnTVChart');
  await expect(page.locator('#tvcModal')).toBeVisible();
  expect(await english(page, '#tvcModal')).toEqual([]);
  await expect(page.locator('#tvcModal')).toContainText('وضع الورشة');
  await expect(page.locator('#tvcModal')).toContainText('عبارات المهام');
  await expect(page.locator('#tvcPlot svg').first()).toContainText('المهام (بترتيب DACUM)');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => (await import('./workshop.js')).lwFinalizeAndCreateSession());
  await page.evaluate(async () => (await import('./workshop.js')).lwFetchResults());
  await expect(page.locator('#lwResultsContainer')).toContainText('ملخص نتائج التصويت');
  expect(await english(page, '#lwResultsContainer')).toEqual([]);
  // the help button's name for screen readers follows the language
  await expect(page.locator('#taskVerifyHelpBtn')).not.toHaveAttribute('aria-label', /[A-Za-z]{4,}/);
  expect(errors).toEqual([]);
});

for (const native of [true, false]) {
  test(`Duties & Tasks cards grow with long text (${native ? 'field-sizing' : 'older browser'})`, async ({ page }) => {
    if (!native) await page.addInitScript(() => {
      window.__dacumNoFieldSizing = true;
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style'); st.textContent = '*{field-sizing:fixed!important}'; document.head.appendChild(st); });
    });
    const errors = await openApp(page, { lang: 'ar' });
    const p = fixture('sample-project.json');
    p.dutiesData[0].tasks[0].text = 'نص محفوظ طويل '.repeat(25);
    await loadProject(page, p);
    await page.evaluate(() => window.switchTab('duties-tab'));       // opened after the project
    const fits = (loc) => loc.evaluate(e => e.getBoundingClientRect().height + 1 >= e.scrollHeight && e.scrollHeight > 100);
    const saved = page.locator('#dutiesContainer .dcv-task-input').first();
    await expect.poll(() => fits(saved)).toBe(true);
    const card = await saved.evaluate(e => e.closest('.dcv-task-card').getBoundingClientRect().height);
    expect(card).toBeGreaterThan(200);
    const typed = page.locator('#dutiesContainer .dcv-task-input').nth(2);
    await typed.click();
    await typed.fill('نص طويل جداً '.repeat(25));
    await expect.poll(() => fits(typed)).toBe(true);
    expect(errors).toEqual([]);
  });
}
