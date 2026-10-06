// Behaviour tests for DACUM Live Pro — see tests/README.md.
// The app is served as static files from the repository root; the AI
// backend is never called (every test mocks /api/generate-dacum).
const { defineConfig } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 1000 },
    // The service worker would cache files between tests and hide changes.
    serviceWorkers: 'block',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
