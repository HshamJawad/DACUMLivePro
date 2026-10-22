// 3.134.4: Live Workshop — when the live voting server cannot be used,
// or the project is not ready, the facilitator is told in a window (not
// in the status line at the foot of the page), with what is safe and
// what to do.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');
const API = 'https://live-session-backend-production.up.railway.app/api/';

const modal = (page) => page.locator('#lwServiceErrorModal');
const create = (page) => page.evaluate(async () => (await import('./workshop.js')).lwFinalizeAndCreateSession());

async function ready(page, lang = 'ar') {
  const errors = await openApp(page, { lang });
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('verification-tab'));
  return errors;
}

test('server unreachable: a window says so, nothing was created, the button works again', async ({ page }) => {
  await page.route(API + '**', r => r.abort('connectionrefused'));
  const errors = await ready(page);
  await create(page);
  await expect(modal(page)).toBeVisible();
  await expect(modal(page)).toHaveAttribute('dir', 'rtl');
  await expect(modal(page)).toContainText('خدمة التصويت الحي غير متوفرة');
  await expect(modal(page)).toContainText('لم تُنشأ أي جلسة');
  await expect(modal(page)).toContainText('أدخل أصوات لجنة الورشة يدوياً');
  await expect(page.locator('#lwStep2-session')).toBeHidden();
  await expect(page.locator('#btnLWFinalize')).toBeEnabled();
  expect(await page.evaluate(async () => (await import('./state.js')).appState.lwSessionId)).toBe(null);
  await page.keyboard.press('Escape');
  await expect(modal(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('server error (503) and no answer in time: each named', async ({ page }) => {
  let mode = 503;
  await page.route(API + '**', r => mode === 503 ? r.fulfill({ status: 503, body: 'down' }) : new Promise(() => {}));
  await ready(page, 'en');
  await create(page);
  await expect(modal(page)).toContainText('The live voting server reported an error');
  await expect(modal(page).locator('details')).toContainText('HTTP 503');
  await modal(page).locator('[data-lw-modal-close]').click();
  await expect(modal(page)).toHaveCount(0);
  mode = 'hang';
  await page.evaluate(() => { window.__lwTimeoutMs = 400; });
  const btn = page.locator('#btnLWFinalize');
  const p = create(page);
  await expect(btn).toHaveText(/Creating the session/);       // says it is working
  await p;
  await expect(modal(page)).toContainText('The live voting server is not answering');
  await expect(btn).toBeEnabled();
  await expect(btn).not.toHaveText(/Creating the session/);
});

test('offline: named as such', async ({ page, context }) => {
  await ready(page, 'fr');
  await context.setOffline(true);
  await create(page);
  await expect(modal(page)).toContainText('Pas de connexion Internet');
  await context.setOffline(false);
});

test('results: a session the server no longer has is named, with what to do', async ({ page }) => {
  await page.route(API + '**', r => r.request().url().endsWith('/create-session')
    ? r.fulfill({ json: { success: true } }) : r.fulfill({ status: 404, json: { success: false, error: 'Session not found' } }));
  const errors = await ready(page);
  await create(page);
  await expect(page.locator('#lwStep2-session')).toBeVisible();
  await page.evaluate(async () => (await import('./workshop.js')).lwFetchResults());
  await expect(modal(page)).toContainText('الجلسة غير موجودة على الخادم');
  await expect(modal(page)).toContainText('أنشئ جلسة جديدة');
  await expect(modal(page)).toContainText('النتائج التي جُلبت سابقاً لم تتغير');
  expect(errors).toEqual([]);
});

test('not ready: what is missing is listed in the window', async ({ page }) => {
  await page.route(API + '**', r => r.fulfill({ json: { success: true } }));
  await ready(page);
  await page.evaluate(() => { document.getElementById('occupationTitle').value = ''; });
  await create(page);
  await expect(modal(page)).toContainText('لا يمكن إنشاء الجلسة الحية بعد');
  await expect(modal(page).locator('li')).toHaveCount(1);
  await expect(page.locator('#lwStep2-session')).toBeHidden();
});

test('phone: the window fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.route(API + '**', r => r.abort('connectionrefused'));
  await ready(page);
  await create(page);
  const box = await modal(page).locator('> div').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(box.y + box.height).toBeLessThanOrEqual(740);
});
