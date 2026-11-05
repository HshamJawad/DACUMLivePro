// 3.145.2: Module Builder lives at https://modules.dacumtools.com/, another
// site than this app, so the handoff is also posted to its tab. Here that
// address is answered by a stub page that asks for the handoff the way
// Module Builder does ("mb-ready") and confirms it ("mb-imported").
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture } = require('../helpers');

const STUB = `<!doctype html><title>mb stub</title><script>
  window.__got = null;
  window.addEventListener('message', function (ev) {
    if (ev.data && ev.data.type === 'dacum-modules-export') {
      window.__got = ev.data;
      ev.source.postMessage({ type: 'mb-imported', id: ev.data.id }, ev.origin);
    }
  });
  if (window.opener) window.opener.postMessage({ type: 'mb-ready' }, '*');
</script>`;

test('the handoff is posted to the Module Builder tab on its own address', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.context().route('https://modules.dacumtools.com/**', route => route.fulfill({ contentType: 'text/html', body: STUB }));

  const [mb] = await Promise.all([
    page.context().waitForEvent('page'),
    page.evaluate(async () => { (await import('./module_mapping.js')).openModuleBuilderFromMapping(); }),
  ]);
  await mb.waitForLoadState();
  await expect.poll(() => mb.evaluate(() => window.__got && window.__got.payload.modules.length), { timeout: 15_000 }).toBeGreaterThan(0);
  const got = await mb.evaluate(() => window.__got);
  expect(got.type).toBe('dacum-modules-export');
  expect(got.payload.scope).toBe('all');
  // Confirmed: the copy left in this site's localStorage is dropped.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dacum_modules_export')), { timeout: 15_000 }).toBeNull();
  expect(errors).toEqual([]);
});
