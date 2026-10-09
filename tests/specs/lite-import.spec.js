// 3.95.0 — DACUM Lite project files open in DACUM Live Pro.
// fixtures/lite-project.json is a real export from DACUM Lite 4.13.3
// ("Export Project"), Arabic content, Lite interface in English.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp, state } = require('../helpers');

async function importFile(page, file) {
  await page.setInputFiles('#loadFileInput', file);
  await page.waitForTimeout(1500);
}

test('a DACUM Lite export opens as a Pro project', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await importFile(page, path.join(__dirname, '..', 'fixtures', 'lite-project.json'));

  await expect(page.locator('#status')).toContainText('DACUM Lite');

  // Duties & tasks — order kept, the empty Lite task dropped.
  const duties = await state(page, 's => s.dutiesData.map(d => [d.title, d.tasks.map(t => t.text)])');
  expect(duties).toEqual([
    ['تخطيط العمل', ['قراءة المخططات', 'تحديد المواد']],
    ['تنفيذ اللحام', ['تجهيز ماكينة اللحام', 'لحام الوصلات التناكبية']],
  ]);

  // Chart info, workshop fields and people.
  const v = id => page.locator('#' + id).inputValue();
  expect(await v('occupationTitle')).toBe('لحّام');
  expect(await v('jobTitle')).toBe('لحّام قوس كهربائي');
  expect(await v('dacumDate')).toBe('2026-09-20');
  expect(await v('dacumDateEnd')).toBe('2026-09-22');
  expect(await v('workshopFormat')).toBe('hybrid');
  expect(await v('venue')).toBe('بغداد');
  expect(await v('producedFor')).toBe('وزارة العمل');
  expect(await v('facilitators')).toBe('هشام جواد\nميسّر ثانٍ');
  expect(await v('panelMembers')).toBe('خبير 1\nخبير 2\nخبير 3');

  // Additional info: texts, a renamed heading kept, Lite's default
  // English heading not forced onto the Arabic interface.
  expect(await v('knowledgeInput')).toBe('قراءة الرسم الهندسي\nأنواع الأقطاب');
  expect(await v('toolsInput')).toBe('ماكينة لحام\nقناع واقٍ');
  expect(await page.locator('#skillsHeading').textContent()).toBe('المهارات الفنية');
  expect(await page.locator('#knowledgeHeading').textContent()).not.toBe('Knowledge Requirements');

  // Named after the occupation, not Lite's "Untitled Project".
  const names = await page.evaluate(async () => {
    const ps = (await import('./project_store.js')).readProjects();
    return (Array.isArray(ps) ? ps : (ps.projects || [])).map(p => p.name);
  });
  expect(names).toContain('لحّام');
  expect(names).not.toContain('Untitled Project');

  // The work carries on: Task Verification lists the four tasks.
  await page.evaluate(() => window.switchTab('verification-tab'));
  await page.waitForTimeout(600);
  await expect(page.locator('#verificationAccordionContainer')).toContainText('لحام الوصلات التناكبية');
  expect(errors).toEqual([]);
});

test('an older DACUM Lite "Save JSON" file keeps its additional info', async ({ page }) => {
  const errors = await openApp(page);
  const old = {
    version: '1.0', savedDate: '2026-01-10T10:00:00.000Z',
    chartInfo: { dacumDate: '2026-01-05', producedFor: '', producedBy: '', occupationTitle: 'Electrician', jobTitle: 'Building Electrician', producedForImage: null, producedByImage: null },
    duties: [{ duty: 'Install wiring', tasks: ['Read the drawing', 'Pull cables'] }],
    additionalInfo: {
      headings: { knowledge: 'Knowledge Requirements', skills: 'Hands-on skills', behaviors: 'Worker Behaviors/Traits', tools: 'Tools, Equipment, Supplies and Materials', trends: 'Future Trends and Concerns', acronyms: 'Acronyms', careerPath: 'Career Path' },
      knowledge: 'Ohm law', skills: 'Stripping wires', behaviors: '', tools: 'Multimeter', trends: '', acronyms: '', careerPath: '',
    },
    customSections: [{ heading: 'Safety', content: 'Lock out, tag out' }],
  };
  const file = { name: 'Electrician_2026-01-10.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) };
  await importFile(page, file);

  expect(await page.locator('#occupationTitle').inputValue()).toBe('Electrician');
  expect(await page.locator('#knowledgeInput').inputValue()).toBe('Ohm law');
  expect(await page.locator('#toolsInput').inputValue()).toBe('Multimeter');
  expect(await page.locator('#skillsHeading').textContent()).toBe('Hands-on skills');
  await expect(page.locator('#customSectionsContainer')).toContainText('Safety');
  const duties = await state(page, 's => s.dutiesData.map(d => d.tasks.length)');
  expect(duties).toEqual([2]);
  expect(errors).toEqual([]);
});

test('a Pro file still imports unchanged', async ({ page }) => {
  await openApp(page);
  const { adaptImportedFile } = await page.evaluate(async () => {
    const m = await import('./lite_import.js');
    const pro = { chartInfo: { occupationTitle: 'X' }, duties: [], additionalInfo: { headings: { knowledge: 'K' }, content: { knowledge: 'k' }, customSections: [] } };
    const r = m.adaptImportedFile(pro, 'X.json');
    return { adaptImportedFile: { same: r.data === pro, fromLite: r.fromLite, fileName: r.fileName } };
  });
  expect(adaptImportedFile).toEqual({ same: true, fromLite: false, fileName: 'X.json' });
});
