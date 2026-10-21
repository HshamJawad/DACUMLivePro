// 3.134.0: Task Verification — the participant count follows the opened
// project; participants outside the workshop (typed estimate, counted
// from the external live link); the supplementary rows' buttons and the
// results tables in Arabic.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const API = 'https://live-session-backend-production.up.railway.app/api/';

/** The sample project with a workshop panel of 8, optionally 20 outside. */
function project({ external } = {}) {
  const p = fixture('sample-project.json');
  p.verification = { ...(p.verification || {}), collectionMode: 'workshop', workflowMode: 'standard',
    workshopParticipants: 8, priorityFormula: 'if', workshopCounts: {}, workshopResults: {} };
  if (external != null) p.verification.externalParticipants = external;
  return p;
}

test('the participant count follows the opened project (8, not the default 10)', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, project());
  await page.evaluate(() => window.switchTab('verification-tab'));
  await expect(page.locator('#workshopParticipants')).toHaveValue('8');
  await expect(page.locator('#mode-workshop')).toBeChecked();
  await expect(page.locator('#formula-if')).toBeChecked();
  // a second project with another count
  const p2 = project(); p2.verification.workshopParticipants = 12; p2.verification.priorityFormula = 'ifd';
  await loadProject(page, p2, 'Second_2026-01-02_00-00.json');
  await page.evaluate(() => window.switchTab('verification-tab'));
  await expect(page.locator('#workshopParticipants')).toHaveValue('12');
  await expect(page.locator('#formula-ifd')).toBeChecked();
  expect(errors).toEqual([]);
});

test('outside the workshop: typed, saved in the file, printed in Word', async ({ page }) => {
  const errors = await openApp(page, { lang: 'en' });
  await loadProject(page, project({ external: 20 }));
  await page.evaluate(() => window.switchTab('verification-tab'));
  await expect(page.locator('#externalParticipants')).toHaveValue('20');
  await expect(page.locator('#externalParticipantsChip')).toHaveText('estimate');
  await page.locator('#externalParticipants').fill('25');
  await page.locator('#externalParticipants').dispatchEvent('change');
  expect(await page.evaluate(async () => (await import('./state.js')).appState.externalParticipants)).toBe(25);
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./snapshots.js')).saveToJSON())]);
  const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(saved.verification.workshopParticipants).toBe(8);
  expect(saved.verification.externalParticipants).toBe(25);
  // one task rated by the panel, so the verification report has results
  await page.evaluate(async () => {
    const T = await import('./tasks.js');
    for (const dim of ['importance', 'frequency', 'difficulty']) { T.updateWorkshopCount('duty_1_1', dim, 3, 5); T.updateWorkshopCount('duty_1_1', dim, 2, 3); }
  });
  const [w] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    page.evaluate(async () => (await import('./exports_docx.js')).exportTaskVerificationWord())]);
  const xml = execFileSync('unzip', ['-p', await w.path(), 'word/document.xml']).toString('utf8');
  expect(xml).toContain('Number of Participants: 8 in the workshop · 25 outside the workshop');
  // a project without anyone outside writes no key and prints the old line
  await loadProject(page, project(), 'Plain_2026-01-03_00-00.json');
  await page.evaluate(() => window.switchTab('verification-tab'));
  await expect(page.locator('#externalParticipants')).toHaveValue('');
  await expect(page.locator('#externalParticipantsChip')).toBeHidden();
  const [dl2] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./snapshots.js')).saveToJSON())]);
  expect(JSON.parse(fs.readFileSync(await dl2.path(), 'utf8')).verification.externalParticipants).toBeUndefined();
  expect(errors).toEqual([]);
});

test('live: a second link for outside the workshop, and its voters counted', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  let created = null;
  await page.route(API + '**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/create-session')) { created = JSON.parse(route.request().postData()); return route.fulfill({ json: { success: true } }); }
    if (url.includes('/get-results/')) {
      const taskResults = {};
      Object.values(created.data.duties).forEach(d => d.tasks.forEach(t => {
        taskResults[t.id] = { avgImportance: 2.5, avgFrequency: 2, avgDifficulty: 2, priorityIndex: 5 }; }));
      return route.fulfill({ json: { success: true, data: { totalVotes: 31, taskResults, groupCounts: { workshop: 8, external: 23 } } } });
    }
    return route.fulfill({ json: { success: true } });
  });
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, project({ external: 20 }));
  await page.evaluate(() => window.switchTab('verification-tab'));
  await page.evaluate(async () => (await import('./workshop.js')).lwFinalizeAndCreateSession());
  const ext = page.locator('#lwExternalLinkBox');
  await expect(ext).toBeVisible();
  await expect(ext.locator('.lw-ext-title')).toContainText('رابط المشاركين من خارج الورشة');
  const extUrl = await page.locator('#lwExternalLink').getAttribute('data-full-url');
  const wsUrl = await page.locator('#lwParticipantLink').getAttribute('data-full-url');
  expect(extUrl).toBe(wsUrl + '&grp=ext');
  await ext.locator('[data-lw-ext="copy"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(extUrl);
  await ext.locator('[data-lw-ext="qr"]').click();
  await expect(page.locator('#lwQRModal')).toBeVisible();
  await expect.poll(() => page.locator('#qrCodeContainer img, #qrCodeContainer canvas').count()).toBeGreaterThan(0);
  await page.evaluate(async () => (await import('./workshop.js')).lwCloseQRModal());
  // the votes come in: 23 voted through the external link
  await page.evaluate(async () => (await import('./workshop.js')).lwFetchResults());
  await expect(page.locator('#externalParticipants')).toHaveValue('23');
  await expect(page.locator('#externalParticipantsChip')).toHaveText('✓ صوّت 23 عبر الرابط الخارجي (عدد فعلي)');
  await expect(page.locator('#lwResultsContainer .lw-votes-split')).toHaveText('8 في الورشة · 23 من خارجها');
  expect(errors).toEqual([]);
});

for (const grp of ['ext', null]) {
  test(`participant page: the vote says where it came from (${grp ? 'external' : 'workshop'})`, async ({ page }) => {
    let sent = null;
    await page.route(API + '**', async (route) => {
      const url = route.request().url();
      if (url.includes('/get-session/')) return route.fulfill({ json: { success: true, data: { occupation: 'Technician', jobTitle: 'PC technician',
        duties: { d1: { title: 'Duty one', tasks: [{ id: 't1', text: 'Task one' }] } } } } });
      if (url.endsWith('/submit-vote')) { sent = JSON.parse(route.request().postData()); return route.fulfill({ json: { success: true, totalVotes: 1 } }); }
      return route.fulfill({ json: { success: true } });
    });
    await page.goto('/DACUM_LiveWorkshop_Participant.html?lwsession=s1&lang=ar' + (grp ? '&grp=' + grp : ''));
    await expect(page.locator('#votingSection')).toBeVisible();
    if (grp) await expect(page.locator('#ptExternalNote')).toContainText('أنت تشارك من خارج الورشة');
    else await expect(page.locator('#ptExternalNote')).toBeHidden();
    for (const dim of ['importance', 'frequency', 'difficulty']) {
      await page.locator(`input[type="radio"][name*="${dim}"][value="2"]`).first().check();
    }
    await page.locator('#btnSubmitVotes').click();
    await expect.poll(() => sent && sent.group).toBe(grp ? 'external' : 'workshop');
  });
}

test('Arabic: supplementary buttons centred (also touch), results items at the start, % centred', async ({ browser }) => {
  for (const [width, touch] of [[1280, false], [412, true]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = await openApp(page, { lang: 'ar' });
    const p = project();
    p.supplementaryVerification = { enabled: true, itemCounter: 2, categoryCounter: 0, categories: [{ id: 'knowledgeSkills', key: 'svCatKnowledgeSkills',
      name: '', enabled: true, renameable: false, items: [
        { id: 'sv_item_1', text: 'البحث عن المعلومات', counts: { 0: 0, 1: 1, 2: 3, 3: 4 }, rating: null },
        { id: 'sv_item_2', text: 'التواصل', counts: { 0: 0, 1: 0, 2: 1, 3: 7 }, rating: null }] }] };
    await loadProject(page, p);
    await page.evaluate(() => window.switchTab('verification-tab'));
    await expect(page.locator('#svResults .sv-res-item').first()).toBeVisible();
    const r = await page.evaluate(() => {
      const icons = [...document.querySelectorAll('.sv-icon')].map(b => {
        const box = b.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(b); const t = rg.getBoundingClientRect();
        return { w: Math.round(box.width), h: Math.round(box.height),
          dx: Math.abs((t.left + t.width / 2) - (box.left + box.width / 2)), dy: Math.abs((t.top + t.height / 2) - (box.top + box.height / 2)) };
      });
      const td = document.querySelector('#svResults td.sv-res-item');
      const rg = document.createRange(); rg.selectNodeContents(td);
      const cell = td.getBoundingClientRect(), text = rg.getBoundingClientRect();
      const th = [...document.querySelectorAll('#svResults th')].find(x => x.textContent.trim() === '%');
      const rg2 = document.createRange(); rg2.selectNodeContents(th);
      const hb = th.getBoundingClientRect(), ht = rg2.getBoundingClientRect();
      return { icons, gapRight: cell.right - text.right, gapLeft: text.left - cell.left,
        pctOff: Math.abs((ht.left + ht.width / 2) - (hb.left + hb.width / 2)) };
    });
    for (const i of r.icons) { expect(i.w).toBe(i.h); expect(i.dx).toBeLessThan(1.5); expect(i.dy).toBeLessThan(1.5); }
    expect(r.gapRight).toBeLessThan(r.gapLeft);            // the item starts at the right
    expect(r.pctOff).toBeLessThan(1.5);                    // «%» in the middle of its heading
    expect(errors).toEqual([]);
    await ctx.close();
  }
});
