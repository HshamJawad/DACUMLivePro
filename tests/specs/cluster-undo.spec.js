// Competency Clusters: toolbar Undo / Redo (3.84.0), and Create Cluster
// picking the ticked tasks when left-out tasks are listed last.
const { test, expect } = require('@playwright/test');
const { openApp, loadProject, fixture, state } = require('../helpers');

const layout = (page) => state(page, 's => ({ c: s.clusteringData.clusters.map(c => [c.name, c.range, c.tasks.map(t => t.id)]), a: s.clusteringData.availableTasks.map(t => t.id) })');

test('toolbar Undo / Redo on Competency Clusters', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(() => window.switchTab('clustering-tab'));
  const before = await layout(page);
  await expect(page.locator('#btnUndo')).toBeDisabled();

  // Delete a competency → Undo brings it back → Redo deletes it again.
  await page.evaluate(async () => (await import('./clusters.js')).deleteCluster('cluster_2'));
  const deleted = await layout(page);
  expect(deleted.c).toHaveLength(1);
  await expect(page.locator('#btnUndo')).toBeEnabled();
  await expect(page.locator('#btnUndo')).toHaveAttribute('title', /Delete a competency/);
  await page.click('#btnUndo');
  expect(await layout(page)).toEqual(before);
  await page.click('#btnRedo');
  expect(await layout(page)).toEqual(deleted);

  // Ctrl+Z outside a text field.
  await page.locator('#clustering-tab h2').first().click();
  await page.keyboard.press('Control+z');
  expect(await layout(page)).toEqual(before);

  // A committed Range edit is one step.
  const range = page.locator('#range_cluster_1');
  await range.fill('Workshop and on-site');
  await range.blur();
  expect((await layout(page)).c[0][1]).toBe('Workshop and on-site');
  await page.click('#btnUndo');
  expect(await layout(page)).toEqual(before);

  // Another tab keeps its own history: nothing to undo on Learning Outcomes.
  await page.evaluate(() => window.switchTab('learning-outcomes-tab'));
  await expect(page.locator('#btnUndo')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('Create Cluster takes the ticked tasks even with left-out tasks listed last', async ({ page }) => {
  const errors = await openApp(page);
  await loadProject(page, fixture('sample-project.json'));
  await page.evaluate(async () => {
    (await import('./task_selection.js')).setTaskSelected('duty_2_3', false, '');
    await (await import('./clusters.js')).deleteCluster('cluster_2');   // its 6 tasks go back to the pool
  });
  await page.evaluate(() => window.switchTab('clustering-tab'));
  // duty_2_3 is first in the pool but drawn last, in the folded group.
  await page.locator('#availableTasksList .task-checkbox-item', { hasText: 'Perform task B4' }).locator('input').check();
  await page.click('#btnCreateCluster');
  const c = await layout(page);
  expect(c.c[c.c.length - 1][2]).toEqual(['duty_2_4']);
  expect(c.a).toContain('duty_2_3');
  expect(errors).toEqual([]);
});
