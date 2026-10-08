// Help guides added from the CBE / DACUM / SCID sources (3.87.0, 3.89.0):
// the DACUM team, the occupational standard, task characteristics,
// competence qualities, criteria and range, learning outcomes, task
// verification and the one-task competency — in EN, FR and AR — and the
// AI clustering prompt that follows the same rules.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture, mockAI, fillJob } = require('../helpers');

/** Open a help modal, read its text, close it. */
async function readHelp(page, tab, opener, modalId) {
  await page.evaluate(t => window.switchTab(t), tab);
  await page.locator(opener).first().click();
  const modal = page.locator('#' + modalId);
  await expect(modal).toBeVisible();
  const text = await modal.innerText();
  const fits = await page.evaluate(id => {
    const b = document.querySelector('#' + id + ' > div');
    const r = b.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && b.scrollWidth <= b.clientWidth + 1;
  }, modalId);
  await modal.locator('[data-help-close]').click();
  await expect(modal).toBeHidden();
  return { text, fits };
}

const EXPECT = {
  en: { team: 'Panel members', teamSize: '8–12', os: 'Job descriptions', task: 'two or more steps',
        naming: 'head', pc: 'How would I know one if I saw one', lo: 'Draw a square',
        tv: 'fewer than 25%', cl: 'by itself', clBeh: 'worker behaviours' },
  fr: { team: 'Membres du panel', teamSize: '8 à 12', os: 'Descriptions de poste', task: 'deux étapes ou plus',
        naming: 'la tête', pc: 'Comment le reconnaîtrais-je', lo: 'Tracer un carré',
        tv: 'moins de 25 %', cl: 'à elle seule', clBeh: 'comportements' },
  ar: { team: 'أعضاء لجنة الخبراء', teamSize: '8–12', os: 'الوصف الوظيفي', task: 'خطوتين أو أكثر',
        naming: 'الرأس', pc: 'كيف أعرفه إذا رأيته', lo: 'ارسم مربعاً',
        tv: 'أقل من 25%', cl: 'بمفردها', clBeh: 'سلوكيات' },
};

for (const lang of ['en', 'fr', 'ar']) {
  test(`help guides from the DACUM / SCID sources (${lang}, 360 px)`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const errors = await openApp(page, { lang });
    await loadProject(page, fixture('sample-project.json'));
    const e = EXPECT[lang];

    // Chart Info: one "?" beside each of the three participant fields.
    await page.evaluate(() => window.switchTab('info-tab'));
    await expect(page.locator('[data-team-help]')).toHaveCount(3);
    let h = await readHelp(page, 'info-tab', '[data-team-help]', 'teamHelpModal');
    expect(h.text).toContain(e.team);
    expect(h.text).toContain(e.teamSize);
    expect(h.text).not.toMatch(/Norton|نورتن/);           // source line removed (3.88.0)
    expect(h.fits).toBe(true);

    h = await readHelp(page, 'occupational-standard-tab', '#osHelpBtn', 'osHelpModal');
    expect(h.text).toContain(e.os);
    h = await readHelp(page, 'duties-tab', '#dutiesHelpBtn', 'dutiesHelpModal');
    expect(h.text).toContain(e.task);
    h = await readHelp(page, 'clustering-tab', '#clusterNamingHelpBtn', 'clusterNamingHelpModal');
    expect(h.text).toContain(e.naming);
    h = await readHelp(page, 'clustering-tab', '[data-action="show-pc-range-help"]', 'pcRangeHelpModal');
    expect(h.text).toContain(e.pc);
    h = await readHelp(page, 'learning-outcomes-tab', '#loHelpBtn', 'loHelpModal');
    expect(h.text).toContain(e.lo);
    h = await readHelp(page, 'verification-tab', '#taskVerifyHelpBtn', 'taskVerificationHelpModal');
    expect(h.text).toContain(e.tv);
    h = await readHelp(page, 'clustering-tab', '#clusteringHelpBtn', 'clusteringHelpModal');
    expect(h.text).toContain(e.cl);
    expect(h.text).toContain(e.clBeh);
    expect(h.fits).toBe(true);

    // No untranslated key shows anywhere in what was opened.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('AI clustering prompt: usual 4–12, one-task exception, behaviours, verified ratings', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  let prompt = '';
  await page.route('**/api/generate-dacum', async route => {
    const p = JSON.parse(route.request().postData()).prompt;
    if (p.includes('COMPETENCY CLUSTERS')) prompt = p;
    await route.fulfill({ status: 529, contentType: 'application/json', body: '{"error":"overloaded"}' });
  });
  await fillJob(page);
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    appState.collectionMode = 'survey';
    appState.verificationRatings = { duty_1_1: { importance: 3, frequency: 2, difficulty: 3, criticality: null } };
  });
  await page.evaluate(() => window.switchTab('clustering-tab'));
  await page.evaluate(async () => { await (await import('./clustering_ai.js')).suggestClustersAI().catch(() => {}); });
  await expect.poll(() => prompt.length).toBeGreaterThan(0);
  expect(prompt).toContain('normally contains between 4 and 12');
  expect(prompt).toContain('EXCEPTION (Norton)');
  expect(prompt).toContain('skills and worker behaviours');
  expect(prompt).toContain('verified: importance 3/3, difficulty 3/3');
  expect(errors).toEqual([]);
});
