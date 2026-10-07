// Content languages (3.79.0): Settings → Languages, AI translation into
// a stored version, switching without AI, and the guarantees that make
// it safe — the original comes back unchanged, ids / ratings / links
// are never touched, copies follow their source, exports and AI cards
// follow the version that is shown.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { openApp, state, loadProject, fixture, mockAI } = require('../helpers');

/** state() with a function instead of its source text. */
const st = (page, fn) => state(page, fn.toString());

/** The project as it is saved, without the language record. */
const capture = (page) => page.evaluate(async () => {
  const m = await import('./dacum_projects.js');
  const s = m.captureProjectState();
  delete s.contentLanguages;
  return JSON.stringify(s);
});

async function openLanguages(page) {
  await page.click('#dpsExportSettings');
  await page.click('[data-es-tab="languages"]');
  await expect(page.locator('#esModalBody')).toContainText('Original language');
}

/** Set the original (English) and translate into Arabic through the UI. */
async function translateToArabic(page) {
  await openLanguages(page);
  await page.click('[data-cl-act="init"]');
  await page.selectOption('#clTo', 'ar');
  await page.click('#clTranslateBtn');                    // 1st press: estimate
  await expect(page.locator('.cl-estimate')).toContainText('texts to translate');
  await page.click('#clTranslateBtn');                    // 2nd press: translate
  await expect.poll(() => state(page, 's => s.contentLanguages && s.contentLanguages.active')).toBe('ar');
}

test('a project without content languages behaves exactly as before', async ({ page }) => {
  const errors = await openApp(page, { lang: 'ar' });
  await loadProject(page, fixture('sample-project.json'));
  const r = await page.evaluate(() => ({
    content: window.i18n.contentLang(), rtl: window.i18n.isRTL(),
    directive: window.i18n.aiDirective().includes('Arabic'),
  }));
  expect(r).toEqual({ content: 'ar', rtl: true, directive: true });
  await expect(page.locator('#clBanner')).toHaveCount(0);
  expect(await state(page, 's => s.contentLanguages')).toBeNull();
  expect(errors).toEqual([]);
});

test('translate → switch → back: original identical, copies and links follow, ids untouched', async ({ page }) => {
  const errors = await openApp(page);
  const ai = await mockAI(page);
  await loadProject(page, fixture('sample-project.json'));
  const before = await capture(page);
  const ids0 = await st(page, s => s);   // whole state for id / rating comparison

  await translateToArabic(page);
  expect(ai.calls.filter(k => k === 'translate').length).toBeGreaterThan(0);
  await expect(page.locator('#clBanner')).toBeVisible();

  const ar = await st(page, s => s);
  // Primary texts translated
  expect(ar.dutiesData[0].title.startsWith('ع ')).toBe(true);
  expect(ar.dutiesData[0].tasks[0].text.startsWith('ع ')).toBe(true);
  // ids, numbering, ratings unchanged
  expect(ar.dutiesData.map(d => d.id)).toEqual(ids0.dutiesData.map(d => d.id));
  expect(ar.dutiesData.flatMap(d => d.tasks.map(t => t.inputId))).toEqual(ids0.dutiesData.flatMap(d => d.tasks.map(t => t.inputId)));
  expect(ar.verificationRatings).toEqual(ids0.verificationRatings);
  expect(ar.workshopResults && Object.keys(ar.workshopResults)).toEqual(ids0.workshopResults && Object.keys(ids0.workshopResults));
  // Copies follow their source
  const taskText = {};
  ar.dutiesData.forEach(d => d.tasks.forEach(t => { taskText[t.inputId] = t.text; }));
  ar.clusteringData.clusters.forEach(c => c.tasks.forEach(t => {
    if (taskText[t.id]) expect(t.text).toBe(taskText[t.id]);
  }));
  // Text-based links still resolve: every LO criterion key exists in the clusters
  const live = await page.evaluate(async () => {
    const m = await import('./modules.js'); const { appState } = await import('./state.js');
    const keys = new Set();
    appState.clusteringData.clusters.forEach((c, i) => m._getClusterEffectiveCriteria(c, i + 1).forEach(x => keys.add(x.key)));
    return [...keys];
  });
  ar.learningOutcomesData.outcomes.forEach(o => (o.linkedCriteria || []).forEach(lc => {
    expect(live).toContain(lc.key);
  }));

  // Back to the original: byte-identical
  await page.evaluate(() => window.dacumContentLanguages.switchTo('en'));
  expect(await capture(page)).toBe(before);
  await expect(page.locator('#clBanner')).toHaveCount(0);

  // The swap itself (before the app re-renders and re-checks links)
  // rewrites text-based link keys with their criteria.
  const unlinked = await page.evaluate(async () => {
    const CL = await import('./content_lang.js'); const m = await import('./dacum_projects.js');
    const s = CL.viewTranslation(m.captureProjectState(), 'ar');
    const pcs = new Set();
    s.clusteringData.clusters.forEach(c => (c.performanceCriteria || []).forEach(t => pcs.add(`pc|${c.id}|${t}`)));
    const bad = [];
    s.learningOutcomesData.outcomes.forEach(o => (o.linkedCriteria || []).forEach(lc => {
      if (lc.key.startsWith('pc|') && !pcs.has(lc.key)) bad.push(lc.key);
    }));
    return bad;
  });
  expect(unlinked).toEqual([]);

  // Showing the stored translation again needs no AI call
  const n = ai.calls.length;
  await page.evaluate(() => window.dacumContentLanguages.switchTo('ar'));
  expect((await st(page, s => s.dutiesData[0].title)).startsWith('ع ')).toBe(true);
  expect(ai.calls.length).toBe(n);
  expect(errors).toEqual([]);
});

test('the mapping path (no snapshot) also restores the original exactly', async ({ page }) => {
  const errors = await openApp(page);
  await mockAI(page);
  await loadProject(page, fixture('sample-project.json'));
  const before = await capture(page);
  await translateToArabic(page);
  // Forget the "nothing changed" marker so the texts are mapped back
  // one by one (the path taken after any edit).
  await page.evaluate(async () => { (await import('./state.js')).appState.contentLanguages.view.appliedHash = null; });
  await page.evaluate(() => window.dacumContentLanguages.switchTo('en'));
  expect(await capture(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('edits in a translation stay in it; added items are kept and can be translated back', async ({ page }) => {
  const errors = await openApp(page);
  await mockAI(page);
  await loadProject(page, fixture('sample-project.json'));
  const origTitle = await st(page, s => s.dutiesData[0].title);
  await translateToArabic(page);
  await page.click('#esModalClose');

  // Edit a duty title and add a task while Arabic is shown
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    appState.dutiesData[0].title = 'واجب معدّل يدوياً';
    const d = appState.dutiesData[1];
    d.tasks.push({ divId: 'task_x', inputId: d.id + '_99', num: 99, text: 'مهمة جديدة' });
    const r = await import('./renderer.js'); (await import('./duties.js')).renderDutiesFromState();
  });
  await page.evaluate(() => window.dacumContentLanguages.switchTo('en'));
  expect(await st(page, s => s.dutiesData[0].title)).toBe(origTitle);           // original kept
  const added = await st(page, s => s.dutiesData[1].tasks.at(-1).text);
  expect(added).toBe('مهمة جديدة');                                                // kept as typed
  const tm = await st(page, s => s.contentLanguages.versions.ar.tm);
  expect(Object.values(tm).some(e => e.t === 'واجب معدّل يدوياً' && e.e === 1)).toBe(true);

  // Arabic again: the edit is there
  await page.evaluate(() => window.dacumContentLanguages.switchTo('ar'));
  expect(await st(page, s => s.dutiesData[0].title)).toBe('واجب معدّل يدوياً');
  await page.evaluate(() => window.dacumContentLanguages.switchTo('en'));

  // The added task is listed and translated back into English
  await openLanguages(page);
  await expect(page.locator('#esModalBody')).toContainText('not yet in English');
  await page.click('[data-cl-act="back"]');
  await expect.poll(() => st(page, s => s.dutiesData[1].tasks.at(-1).text)).toBe('en مهمة جديدة');
  await page.evaluate(() => window.dacumContentLanguages.switchTo('ar'));
  expect(await st(page, s => s.dutiesData[1].tasks.at(-1).text)).toBe('مهمة جديدة');
  expect(errors).toEqual([]);
});

test('re-translating sends only new or changed texts', async ({ page }) => {
  await openApp(page);
  const ai = await mockAI(page);
  await loadProject(page, fixture('sample-project.json'));
  await translateToArabic(page);
  await page.evaluate(() => window.dacumContentLanguages.switchTo('en'));
  await page.evaluate(async () => {
    const { appState } = await import('./state.js');
    appState.dutiesData[0].tasks[0].text = 'A changed task statement';
    (await import('./duties.js')).renderDutiesFromState();
  });
  const plan = await page.evaluate(async () => {
    const CL = await import('./content_lang.js'); const m = await import('./dacum_projects.js');
    return CL.planTranslation(m.captureProjectState(), { from: 'en', to: 'ar' }).items.map(i => i.src);
  });
  expect(plan).toEqual(['A changed task statement']);
  expect(ai.calls.length).toBeGreaterThan(0);
});

test('exports and AI cards follow the content shown, not the interface', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openApp(page);                     // interface: English
  await mockAI(page);
  await loadProject(page, fixture('sample-project.json'));
  await translateToArabic(page);
  await page.click('#esModalClose');
  const r = await page.evaluate(() => ({
    ui: window.i18n.getLang(), content: window.i18n.contentLang(), uiRTL: window.i18n.isRTL(),
    directive: window.i18n.aiDirective().includes('Arabic'),
    label: window.i18n.withContentLang(() => window.i18n.t('setTitle')),
  }));
  expect(r).toEqual({ ui: 'en', content: 'ar', uiRTL: false, directive: true, label: 'الإعدادات' });

  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }),
    page.evaluate(async () => (await import('./exports_docx.js')).exportToWord())]);
  const xml = execFileSync('unzip', ['-p', await dl.path(), 'word/document.xml']).toString('utf8');
  expect(xml).toContain('<w:bidi/>');                    // right-to-left document
  expect(xml).toContain('ع ');                           // the Arabic version of the content
  // PDF: the Arabic font is loaded for the content, not the interface
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }),
    page.evaluate(async () => (await import('./exports_pdf.js')).exportToPDF())]);
  const pbuf = fs.readFileSync(await pdf.path());
  expect(pbuf.slice(0, 5).toString()).toBe('%PDF-');
  expect(pbuf.toString('latin1')).toContain('/FontName /Cairo');          // the embedded Arabic font
  // After the export the interface is still English
  expect(await page.evaluate(() => [window.i18n.getLang(), window.i18n.isRTL(), window.i18n.t('setTitle')]))
    .toEqual(['en', false, 'Settings']);
  expect(errors).toEqual([]);
});

test('the version shown survives export to JSON and re-import', async ({ page }) => {
  const errors = await openApp(page);
  await mockAI(page);
  await loadProject(page, fixture('sample-project.json'));
  await translateToArabic(page);
  await page.click('#esModalClose');
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.evaluate(async () => (await import('./snapshots.js')).saveToJSON())]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(data.contentLanguages.active).toBe('ar');
  await loadProject(page, data, 'Reimported_2026-01-01_00-00.json');
  await expect(page.locator('#clBanner')).toBeVisible();
  await page.evaluate(() => window.dacumContentLanguages.switchTo('en'));
  expect((await st(page, s => s.dutiesData[0].title)).startsWith('ع ')).toBe(false);
  expect(errors).toEqual([]);
});

test('switching back keeps structural edits and never mis-pairs texts', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const CL = await import('./content_lang.js');
    const T = await import('./content_translate.js');
    const tr = { 'Open cover': 'A1', 'Remove filter': 'A2', 'Wash filter': 'A3',
                 'Area is clean': 'T', 'Area is tidy': 'T', 'Cluster one': 'C1', 'Do work': 'W' };
    const base = () => ({
      dutiesData: [{ id: 'duty_1', title: 'Do work', tasks: [] }],
      taskAnalysisData: { duty_1_1: { performanceSteps: ['1. Open cover', '2. Remove filter', '3. Wash filter'] } },
      clusteringData: { clusters: [{ id: 'cluster_1', name: 'Cluster one', tasks: [],
        performanceCriteria: ['Area is clean', 'Area is tidy'] }] },
      learningOutcomesData: { outcomes: [{ id: 'lo_1', statement: 'Do work', linkedCriteria: [
        { id: '1-1', text: 'Area is clean', clusterId: 'cluster_1', key: 'pc|cluster_1|Area is clean' },
        { id: '1-2', text: 'Area is tidy', clusterId: 'cluster_1', key: 'pc|cluster_1|Area is tidy' }] }] },
    });
    const withTM = (s) => {
      s.contentLanguages = CL.storeTranslations(CL.newCL('en'), 'ar',
        Object.entries(tr).map(([k, v]) => ({ h: CL.hashText(k), t: v })));
      return s;
    };
    const out = {};
    // 1. delete the 2nd step and add one at the end, while Arabic is shown
    let s = CL.viewTranslation(withTM(base()), 'ar');
    s.taskAnalysisData.duty_1_1.performanceSteps = ['1. A1', '2. A3', '3. NEW'];
    let b = CL.viewOriginal(s);
    out.steps = b.state.taskAnalysisData.duty_1_1.performanceSteps;
    out.tmRemove = b.state.contentLanguages.versions.ar.tm[CL.hashText('Remove filter')];
    out.tmWash = b.state.contentLanguages.versions.ar.tm[CL.hashText('Wash filter')];
    // 1b. an edited item while another is deleted or moved
    const steps = async (live) => { const t = CL.viewTranslation(withTM(base()), 'ar');
      t.taskAnalysisData.duty_1_1.performanceSteps = live; return CL.viewOriginal(t).state.taskAnalysisData.duty_1_1.performanceSteps; };
    out.mixed = [await steps(['1. A2', '2. A3 ok']), await steps(['1. A3', '2. A1 ok', '3. A2'])];
    // 2. reorder only
    s = CL.viewTranslation(withTM(base()), 'ar');
    s.taskAnalysisData.duty_1_1.performanceSteps = ['1. A3', '2. A1', '3. A2'];
    out.reorder = CL.viewOriginal(s).state.taskAnalysisData.duty_1_1.performanceSteps;
    // 3. two originals with the same translation; an unrelated edit forces the slow path
    s = CL.viewTranslation(withTM(base()), 'ar');
    s.dutiesData[0].title = 'W edited';
    b = CL.viewOriginal(s);
    out.links = b.state.learningOutcomesData.outcomes[0].linkedCriteria.map(l => [l.text, l.key]);
    out.lo = b.state.learningOutcomesData.outcomes[0].statement;
    // 4. a criterion edited in the cluster: its copies return to the original
    s = CL.viewTranslation(withTM(base()), 'ar');
    s.clusteringData.clusters[0].performanceCriteria[0] = 'T edited';
    b = CL.viewOriginal(s);
    out.edited = [b.state.clusteringData.clusters[0].performanceCriteria[0],
                  b.state.learningOutcomesData.outcomes[0].linkedCriteria[0].key];
    // 5. a renamed key never overwrites another
    out.keys = Object.keys(CL.remapCopies({ criterionTasks: { A: [1], T: [2] } }, new Map([['A', 'T']]), new Map()).criterionTasks);
    // 6. one line stays one line; no added bullet
    out.tidy = [T.tidyTranslation('Hammer', 'H1\nH2'), T.tidyTranslation('Hammer', '- مطرقة'), T.tidyTranslation('a\nb', 'x\ny')];
    return out;
  });
  expect(r.steps).toEqual(['1. Open cover', '2. Wash filter', '3. NEW']);
  expect(r.tmRemove).toEqual({ t: 'A2' });                 // untouched
  expect(r.tmWash).toEqual({ t: 'A3' });
  expect(r.mixed).toEqual([['1. Remove filter', '2. Wash filter'], ['1. Wash filter', '2. Open cover', '3. Remove filter']]);
  expect(r.reorder).toEqual(['1. Wash filter', '2. Open cover', '3. Remove filter']);
  expect(r.links).toEqual([['Area is clean', 'pc|cluster_1|Area is clean'], ['Area is tidy', 'pc|cluster_1|Area is tidy']]);
  expect(r.lo).toBe('Do work');
  expect(r.edited).toEqual(['Area is clean', 'pc|cluster_1|Area is clean']);
  expect(r.keys).toEqual(['A', 'T']);
  expect(r.tidy).toEqual(['H1 H2', 'مطرقة', 'x\ny']);
});
