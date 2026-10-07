# DACUM Live Pro — Changelog

Newest first. Moved out of `index.html` in 3.35.0, where it had grown to
about 44 KB inside an inline script that every visit downloaded. The
version constants (`APP_VERSION`, `APP_RELEASED`, `EXPECTED_SW`) stay in
`index.html`; bump them together with `CACHE_VERSION` in `sw.js`.
This file is documentation only — it is not loaded or cached by the app.

```text
── 3.82.0 — 2026-10-07 — ✅ "Selected for training" column; move left-out tasks out of clusters
MINOR. clusters.js, task_selection.js, exports_docx.js,
exports_docx_sections.js, exports_pdf.js, exports_pdf_sections.js,
exports_shared.js, translations.js, dacum-components.css, index.html,
sw.js (v198), tests/specs/task-selection.spec.js.
New     Competency Clusters: when competencies hold tasks left out of
        training, a bar above them says how many and offers "Move them
        out of the competencies (N)". After a confirmation they go back
        to the Available list ("Not selected for training" group) —
        the same as removing each by hand; nothing is deleted and an
        emptied competency stays for the expert to decide.
New     Verification results tables (standalone Word / PDF report, the
        appendix of the main export, live-workshop results) get a
        "Selected for training" column: Yes / No (Word adds the
        reason). Printed only when at least one task was left out, so
        reports of projects without a selection are unchanged.
Fixed   Survey ratings with no task metadata (AI draft ratings) showed
        every duty as "Unassigned" in the verification report and
        counted each task as a duty of its own in the coverage line;
        duty and task are now read from the profile.

── 3.81.0 — 2026-10-07 — ✅ Task selection, phase 2: the later tabs follow it
MINOR. clusters.js, clustering_ai.js, module_mapping.js, trace_map.js,
task_analysis.js, task_selection.js, exports_docx_sections.js,
exports_pdf_sections.js, translations.js, dacum-components.css,
index.html, sw.js (v197), tests/specs/task-selection.spec.js.
Changed Competency Clusters: tasks left out in Task Verification →
        Select Tasks are listed after the others in a folded group "Not
        selected for training (N)". They stay in the pool and can still
        be placed by hand; a placed one carries a "Not selected for
        training" badge (tooltip gives the reason).
        AI clustering (and the Full Draft clusters stage) groups the
        selected tasks only; the others go back to the Available list
        and the status message says how many were left out.
        Learning Outcomes and Modules are built from the clusters, so
        they follow without changes of their own.
        Traceability Map: a left-out task is greyed with "Not selected
        for training" and is no longer counted as a gap.
        Word / PDF: the Task Analysis section exports selected tasks
        only and opens with "Tasks selected for training and analysis:
        N of M" and the tasks left out with their reasons.
Kept    DACUM chart, Occupational Standard and the verification results
        still list every task: they describe the occupation.
Note    The selection is only shown when at least one task was left out;
        projects that never used it look and export exactly as before.

── 3.80.0 — 2026-10-07 — ✅ Select Tasks for Training / Analysis (SCID)
MINOR. task_selection.js (new), task_analysis.js, tasks.js,
draft_ratings.js, state.js, app.js, projects.js, dacum_projects.js,
snapshots.js, translations.js, dacum-components.css, index.html,
sw.js (v196), tests/specs/task-selection.spec.js (new).
New     Optional SCID step at the foot of Task Verification: tick the
        tasks that will be trained and analysed in detail. Every task
        is selected until the user changes it, so skipping the step
        changes nothing. "Suggest selection" applies the rule the user
        picks: Importance ≥ x and Difficulty ≥ y (default 2 / 2), or
        the top N tasks by Priority Index (ties at the cut-off are
        kept). Unrated tasks are left as they are. Each task left out
        can carry a reason (low priority, low importance, learned on
        the job, rarely performed, already mastered, other); the rule
        fills one in. Select all / Clear all, and a one-off button to
        turn the old ★ marks into a selection.
Changed Task Analysis lists the selected tasks only, with
        "N of M selected" and "Show unselected" (greyed). An unselected
        task shows a banner with its reason and a button to select it.
        The ★ toggle in its list is replaced by ☑ (same state as the
        Verification section); saved ★ marks are kept.
        Phase 1: clusters, outcomes, modules, the DACUM chart and the
        exports still include every task.
Fixed   Ratings from the AI full draft were saved under
        "<dutyId>_task_<index>", a key nothing reads: the verification
        table, chart and exports showed them as unrated, and a Refresh
        could call them orphans. They are now saved under the task id;
        ratings of projects drafted earlier are moved on load (a rating
        entered by hand always wins).
Saved   appState.taskSelection { excluded: { taskId: reason }, rule,
        impMin, diffMin, topN }. Written to JSON only when used; old
        files load with every task selected. Clear This Tab on Task
        Verification resets it.

── 3.79.5 — 2026-10-07 — 🎨 AI-card blue for the start-up splash
PATCH. index.html, sw.js (v195).
Changed The start-up splash screen behind the "DACUM Live Pro" card,
        its loading bar and its Reload button now use the AI-card blue
        (#0ea5e9 → #0284c7) instead of the indigo/purple gradient.

── 3.79.4 — 2026-10-07 — 🎨 AI-card blue for update bar, format switch, welcome backdrop
PATCH. index.html, dacum_projects.js, sw.js (v194).
Changed The "A new version is available" bar, the selected Workshop
        format button (In person / Online / Hybrid) and the backdrop of
        the "create a project" welcome overlay now use the AI-card blue
        gradient #0ea5e9 → #0284c7 instead of indigo/purple. The update
        bar's "Update now" text is #0369a1; unselected format buttons
        get a light-blue hover.

── 3.79.3 — 2026-10-07 — 🌐 language badge on project cards
PATCH. dacum_projects.js, settings_languages.js, translations.js,
sw.js (v193), index.html, tests/specs/content-languages.spec.js.
New     A project with content languages shows "🌐 EN · AR" on its
        sidebar card: the version shown in bold, an amber dot when a
        version still has untranslated texts (the tooltip gives the
        count). Clicking it opens the project if needed, then
        Settings → Languages. Projects without content languages: the
        card is unchanged. The badge refreshes whenever the languages
        change.
Tested  New test (badge absent → "EN · AR" with AR bold → opens the
        Languages tab); EN and AR interface checked visually. Full
        suite 30/30.

── 3.79.2 — 2026-10-07 — Translations travel to Module Builder
PATCH. content_lang.js, module_mapping.js, sw.js (v192), index.html,
tests/specs/content-languages.spec.js.
New     The Module Builder handoff (and the Module Mapping JSON download)
        carries contentLanguages: for every other language of the
        project, pairs [text as handed over, text in that language].
        Module Builder 3.16+ shows and exports the handed-over texts
        (outcomes, criteria, Task Analysis, curriculum…) in its content
        and export languages. Absent when the project has no
        translations, so other handoffs are unchanged.
How     handoffTranslations() in content_lang.js; when a translation is
        shown, the record is read after viewOriginal() on a copy, so
        edits made on screen are included. Nothing on screen changes.
Tested  New test: with Arabic shown, the handoff carries the texts in
        Arabic and their English originals. With Module Builder 3.16.0,
        both ways (English shown / Arabic shown): outcomes and criteria
        on screen and the Arabic Word export in the right language.
        Full suite 29/29.

── 3.79.1 — 2026-10-07 — Touch-screen button shapes; clearer label
PATCH. dacum-components.css, renderer.js, dacum_projects.js,
translations.js, sw.js (v191), index.html.
Fixed   On touch screens (PWA, tablets, phones) every <button> gets
        min-height 44px (dacum-responsive.css), which stretched small
        square/round buttons into tall ovals: the card colour swatches
        (Duties & Tasks → 🎨 Colours and Settings → Export), the level
        "×" and row/category delete buttons of the Skills Level Matrix,
        the project rename/delete icons in the sidebar and the Settings
        close button. Each now declares its own min-height. A scan of
        every tab at 390 px with touch emulation finds no stretched
        button left.
Changed Settings → Languages: the re-translate option now reads
        "Re-translate all AI-translated texts (your manual edits are
        kept)" (FR/AR likewise) — it re-sends texts already translated
        by the AI; by default only new or changed texts are sent.

── 3.79.0 — 2026-10-07 — Content languages and AI translation
MINOR. content_lang.js, content_translate.js, settings_languages.js (new),
export_settings.js, translations.js, exports_docx.js, exports_pdf.js,
exports_os_docx.js, exports_cur_docx.js, workshop.js, module_curriculum.js,
dacum_projects.js, snapshots.js, autosave.js, workshop_snapshots.js,
projects.js, state.js, i18n_defaults.js, app.js, dacum-components.css,
DACUM_Live_Pro_User_Guide.html, sw.js (v190), index.html,
tests/specs/content-languages.spec.js (new), tests/helpers.js,
tests/README.md.
New     Settings (the sidebar ⚙️ entry, formerly Export Settings) has two
        tabs: Export (unchanged) and Languages. Languages holds the
        language of the project's CONTENT, separate from the interface
        switcher: set the original language, translate with AI
        (From → To), choose the version shown, review side by side,
        mark Reviewed, delete a version.
        The project keeps its original and every translation
        (appState.contentLanguages, saved with the project and in the
        JSON file). Switching versions makes no AI call.
        Translation memory is keyed by the original text: a sentence is
        sent once wherever it appears, and only texts with no
        translation yet are sent — after a task changes, only that task.
        Batches of at most 40 texts / 3,000 characters; built-in
        DACUM/TVET glossary (EN/AR/FR, the app's own interface terms),
        only the terms present in a batch go into its prompt.
        Edits made while a translation is shown go into that
        translation (marked edited, never overwritten by a re-run).
        Texts added there are kept and listed, with "Translate them
        into <original>". A text whose source changed after it was
        edited by hand shows the earlier wording to the reviewer.
        A banner over the tabs says which version is shown.
Changed Exports (Word, PDF, Standard, Curriculum, verified results) and
        the AI cards' output language follow the CONTENT language shown,
        not the interface. A project with no content language set has
        none, and everything follows the interface exactly as before.
        Default seeded wording (Skills Matrix rows, untouched Additional
        Info headings) follows the content language too.
How     Switching captures the project, swaps its texts and applies it
        through the same path that opens a project. Units are the places
        a text is written (ids or list positions); every other string —
        cluster task lists, outcome criteria, "pc|…|text" link keys,
        verification titles — is mapped with them, so copies and links
        always match. Ids, numbers, ratings, priorities and settings are
        never touched. Going back restores the snapshot taken when the
        translation was shown when nothing changed, otherwise maps each
        text back (items moved, edited, added or deleted are paired by
        place and text).
Tested  Existing projects (no content language), EN and AR interface:
        Word, PDF, Standard, Curriculum and Task Verification exports of
        two projects — all 20 identical to 3.78.0.
        Real project: 257 texts → 7 requests; back to the original
        byte-identical by both paths, with edits made in Arabic kept in
        the translation; no stale outcome links.
        New spec (8 tests): identity round trip, copies/links, ids and
        ratings untouched, edits/additions, only changed texts re-sent,
        Word RTL + Arabic PDF font with an English interface, JSON
        round trip, and the reviewer's pairing cases. Full suite 28/28.

── 3.78.0 — 2026-10-07 — PDF export broken up (no behaviour change)
MINOR (internal). exports_pdf.js, exports_pdf_sections.js (new), sw.js
(v189), index.html, tests/specs/curriculum.spec.js, tests/helpers.js,
tests/README.md.
Changed exportToPDF() was one 1,643-line function. Nine report sections
        (knowledge and skills, tools and trends, skills matrix, two
        verification appendices, Task Analysis, clusters, learning
        outcomes, modules) are now functions in exports_pdf_sections.js.
        Each receives the exportToPDF() locals it reads and returns the
        new yPos (the page cursor), which exportToPDF() stores; the
        section code itself is unchanged. exports_pdf.js 1,355 lines,
        exports_pdf_sections.js 1,023.
Kept    The duties chart section stays inside exportToPDF(): it calls
        newChartPage(), a helper that moves exportToPDF()'s own cursor,
        so moved out it would draw at the wrong place. The first attempt
        did move it and the PDF comparison caught the difference; the
        extraction now refuses any block that uses such a helper.
        Re-checked against the 3.77.0 Word extraction: no section there
        used one.
Tested  PDF chart report and Task Verification report (two projects ×
        EN/AR): all 8 identical to 3.77.0 apart from the creation date
        and file ID. New behaviour tests: PDF export in EN and AR (20).

── 3.77.0 — 2026-10-06 — Word export and Module Curriculum broken up (no behaviour change)
MINOR (internal). exports_docx.js, exports_docx_sections.js (new),
module_curriculum.js, module_curriculum_text.js (new), sw.js (v188),
index.html, tests/specs/curriculum.spec.js, tests/README.md.
Changed exportToWord() was one 2,040-line function. Its ten report
        sections (duties, additional info, custom sections, skills
        matrix, two verification appendices, Task Analysis, clusters,
        learning outcomes, modules) are now functions of their own in
        exports_docx_sections.js, each receiving the exportToWord()
        locals it reads and writing none (checked by scope analysis;
        blocks with return / await / outer writes would have been left).
        exportToWord() is 681 lines; exports_docx.js 1,474,
        exports_docx_sections.js 1,430.
Changed module_curriculum.js keeps the logic (1,332 lines); its text
        tables — interface strings, export labels, the two guidance
        texts — moved to module_curriculum_text.js (622 lines).
Fixed   exports_docx.js called lwExportVerifiedDOCX() without importing
        it (unreachable today: tvExportMode is forced to 'appendix'; it
        would have thrown). Imported from workshop.js.
Tested  Word chart report and Task Verification report (two projects ×
        EN/AR) and the Module Curriculum tab, its data model and its
        Word export (two projects × EN/FR/AR): all 26 outputs identical
        to 3.76.0, part by part. New behaviour test for the Module
        Curriculum tab and export (18 tests).

── Tests — 2026-10-06 — behaviour tests run on every push (app unchanged)
No app change; APP_VERSION / CACHE_VERSION stay at 3.76.0 / v187.
tests/ (new), .github/workflows/tests.yml (new).
Added   17 browser tests (Playwright, Chromium) with the AI backend
        replaced by a stand-in: start-up in EN/FR/AR and every tab; how
        an AI reply is read; the Full Draft (all seven stages on a new
        project; on a filled project with the AI down: confirm, snapshot,
        stop at stage 1, nothing changed); Job Title rules; the Task
        Analysis, cluster and Additional Info AI cards (only ticked parts
        change, restore, marks saved); outcome Undo, coverage filter,
        Module Builder handoff, Word export. Synthetic sample project in
        tests/fixtures. Run by GitHub Actions → "Tests" on every push.
Checked Putting back three bugs fixed in 3.72–3.74 (Full Draft criteria
        check, cluster pool not refreshed, Job Title not required) makes
        the matching test fail each time.

── 3.76.0 — 2026-10-06 — modules.js split into four files (no behaviour change)
MINOR (internal). modules.js, modules_shared.js (new), clusters.js (new),
learning_outcomes.js (new), module_mapping.js (new), sw.js (v187),
index.html.
Changed modules.js (4,544 lines) is split, code moved unchanged, into
        modules_shared.js (helpers, criteria lookups, store writer,
        LO / MM Undo-Redo, 832 lines), clusters.js (1,372),
        learning_outcomes.js (1,153) and module_mapping.js (1,240).
        modules.js now only re-exports the four, so every other file
        still imports from it and none had to change.
How     Done by script on the parsed source: all 192 top-level
        statements present exactly once, comments kept; each file's
        imports and exports computed from what it uses; ESLint no-undef
        clean. Two edits only: _t / _tf became function declarations
        (hoisted, safe across files), and the coverage "gaps only" flag
        is set through setCoverageGapsOnly() instead of being assigned
        from the clusters code.
Tested  On a real project (41 outcomes, 16 modules): the rendered
        Clusters, Learning Outcomes and Module Mapping tabs, the Module
        Builder JSON and the Word export text are identical to 3.75.0;
        LO delete → undo, coverage filter, Full Draft (7 stages), the
        cluster, Task Analysis and Additional Info AI cards all pass.

── 3.75.0 — 2026-10-06 — One AI-draft component; Additional Info gets it
MINOR. ai_draft.js (new), task_analysis.js, task_analysis_ai.js,
clustering_ai.js, modules.js, additional_info_ai.js, events.js, state.js,
dacum_projects.js, projects.js, dacum-styles.css, translations.js,
index.html, sw.js (v186).
Changed ai_draft.js holds what Task Analysis (3.70) and Competency
        Clusters (3.71) each carried a copy of: the "choose what to
        generate" dialog, the AI-draft mark with "↶ Restore previous",
        and the keep / clear / restore logic. Both now use it; their
        behaviour and saved data (_aiDraft / _aiPrev) are unchanged.
        One set of styles (.ai-draft-*) replaces .ta-ai-badge* and
        .cl-ai-*.
Added   Additional Info: the ✨ button asks which sections to generate.
        Filled sections start unticked and are never touched unless
        ticked; their content goes to the AI as agreed context (do not
        repeat). Each generated section shows "✨ AI draft — review",
        and "↶ Restore previous" where it replaced text; the mark goes
        when the section is edited (typing, Numbering/Bullets, Clear).
        Saved with the project (appState.additionalInfoAI). The Full
        Draft still generates all sections.
Note    Learning Outcomes and Training Modules are left as they are:
        their tabs already lend the toolbar a full Undo (3.31.1).
        EN/FR/AR.

── 3.74.0 — 2026-10-06 — One AI call path; the preflight check runs
MINOR (internal). ai_client.js, projects.js, additional_info_ai.js,
clustering_ai.js, learning_outcomes_ai.js, module_mapping_ai.js,
task_analysis_ai.js, draft_ratings.js, occupation_check.js,
.github/workflows/preflight.yml (moved), index.html, sw.js (v185).
Changed One way to call the AI: callAI() / parseAIReply() in
        ai_client.js. The eight files that each repeated fetch → error
        check → read → strip fences → JSON.parse now call it. It reads
        every text block (some read only the first), survives prose or
        fences around the JSON (most failed on it), reports a reply cut
        off at the output limit as "incomplete", and appends the
        language directive (occupation check: lang:false, as before).
        Prompts and what each card does with the result are unchanged.
Fixed   Full Draft stopped at "Competency Clusters" on a new project: the
        task pool was filled only when the Clusters tab was opened, which
        a run never does, so it read "not enough tasks". On a filled
        project the pool still held the OLD tasks of duties the run had
        just regenerated. suggestClustersAI() now refreshes the pool from
        Duties & Tasks first (the same calls the tab makes) and suggests
        only tasks that exist now.
Fixed   The preflight workflow never ran: it sat in the repository root
        (GitHub reads .github/workflows/ only) and called scripts in a
        tools/ folder that does not exist. Moved and corrected; it runs
        on every push.
Tested  Full Draft end to end (all seven stages) with replies wrapped in
        prose and split across blocks: completes. 3.73.0 failed at stage
        1 on such replies, and at stage 3 even on clean ones.

── 3.73.0 — 2026-10-06 — Full Draft: real stage checks, confirm before replacing
MINOR. draft_agent.js, draft_ui.js, dacum-draft.css, translations.js,
index.html, sw.js (v184).
Fixed   False green ticks: on a filled project with the AI service down,
        Duties & Tasks, Competency Clusters and Range & Criteria failed
        silently, kept the old work, and were marked done because their
        check only asked "is there content?" (the run then stopped at
        Learning Outcomes, the first stage that compared before/after).
        Every stage now takes a snapshot and must have CHANGED its tab,
        and a run that returns false is a failure — with the service
        down the draft stops at the first stage. A failed optional stage
        is an error, not "skipped".
Fixed   Draft Task Verification marked the panel's own ratings as
        unverified AI drafts even when its call failed; it now marks
        them only after they really changed.
Added   Confirm step on Start when the run would overwrite existing
        work: the tabs at stake listed by name, with "📸 Save snapshot &
        start" (recommended; the run does not start if the snapshot
        cannot be saved), "Start without a snapshot" and "Back".
Changed The "Existing content will be replaced" note moved to the top of
        the setup view (it sat at the bottom, under five other blocks).
Fixed   The tab list in that note used the Arabic comma in every
        language. EN/FR/AR.

── 3.72.0 — 2026-10-06 — The Job Title is required: DACUM analyses the job
MINOR. projects.js, draft_ui.js, draft_agent.js, occupation_check.js,
ai_client.js, additional_info_ai.js, clustering_ai.js,
learning_outcomes_ai.js, module_mapping_ai.js, task_analysis_ai.js,
dacum-draft.css, translations.js, index.html,
DACUM_Live_Pro_User_Guide.html, sw.js (v183).
Changed Job Title is required for AI generation (Duties & Tasks card,
        "Generate Anyway", Full Draft): a DACUM chart describes a job —
        the duties and tasks of the people who hold it — not the whole
        occupation. It may equal the Occupation Title when the
        occupation is a single job (said under the field). Manual work,
        exports and older projects without one are not blocked.
Changed Duties & Tasks prompt: the job is the UNIT OF ANALYSIS and the
        occupation context only; never tasks of other jobs in the same
        occupation. Removed "assume a generic role" and "generate for the
        full occupation". Same job-first wording in the Additional Info,
        Clusters, Learning Outcomes, Module Mapping and Task Analysis
        prompts (ai_client.js jobFocusLines(); a project without a Job
        Title tells the model to infer the job from the chart).
Added   The title check also judges the Job Title in the same call: a
        real job, and one that belongs to the occupation. The same
        warning card (Duties & Tasks, Full Draft) then offers the
        suggestion, "Edit the Job Title" or "Generate anyway"; the bypass
        is per occupation + job pair.
Changed Chart Info: * on Occupation Title and Job Title, a line under Job
        Title, help text and AI-card hint updated; Full Draft lists both
        as needed first. User Guide updated.
Changed Full Draft "Start Generating" / "Save & Continue" in the AI-card
        blue (was indigo #4f46e5), stage ticks too.
Fixed   Full Draft stopped at "Range & Criteria" every time: its check read
        cluster.criteria, which does not exist (the field is
        performanceCriteria), so the stage always looked empty; the
        overwrite warning never listed it either. EN/FR/AR.

── 3.71.0 — 2026-10-06 — Competency Clusters: the card AI button ───
MINOR. clustering_ai.js, modules.js, events.js, dacum-styles.css,
translations.js, index.html, sw.js (v182).
Added   The card button opens a dialog: Range and/or Performance
        Criteria. A part that already has content starts unticked, so a
        Range written with the panel is not replaced by asking for
        criteria. The dialog names the Task Analysis lines it will use,
        the learning outcomes linked to the criteria, and the restore.
        The part not generated is sent as context for the other.
Added   "↶ Restore previous" beside "✨ AI draft — review" on a generated
        Range or criteria set: puts back what it replaced. Kept in
        cluster._aiPrev until the user edits that part (a blur without a
        change keeps it). Also after "Range & Criteria" and Full Draft.
Changed Prompt: per cluster, the Task Analysis tools, conditions and
        safety lines of its tasks (the source of a Range, deduplicated
        and capped), sector and country; never invent standard numbers.
Fixed   The reply was read from the first text block only and failed on
        a line of prose around the JSON; now every block, with a {...}
        fallback.
Fixed   Cluster name, Range and criteria were written into the card
        unescaped: a "<" or "&" could break the card. Now escaped.
Changed The button: "✨ Generate with AI" in the sky-blue of the AI
        cards (it shared the purple Rename class, with 🤖); the three
        card buttons keep their text on one line and wrap as whole
        buttons; the title wraps beside them.
Fixed   Arabic: a long competency name, and a Task Analysis added-section
        title (3.70.0), did not wrap and ran over the buttons — they were
        in <bdi>, which dacum-rtl.css keeps on one line for codes (A1).
        Now <span dir="auto">. EN/FR/AR, RTL.

── 3.70.1 — 2026-10-06 — Task Analysis: selected task on hover ─────
PATCH. index.html, sw.js (v181).
Fixed   Task Analysis navigator: hovering the selected task turned its
        background pale under white text, so the task seemed to vanish
        (.ta-nav-task:hover outranked .ta-nav-task-active). The selected
        task now stays blue on hover, a shade darker (#0369a1).
Changed Hover on the other tasks in the sky-blue family (#f0f9ff /
        #7dd3fc, was indigo); keyboard focus ring added.

── 3.70.0 — 2026-10-06 — Task Analysis AI: restore, added sections ──
MINOR. task_analysis.js, task_analysis_ai.js, ai_client.js,
additional_info_ai.js, clustering_ai.js, draft_ratings.js,
learning_outcomes_ai.js, module_mapping_ai.js, occupation_check.js,
projects.js, translations.js, index.html, sw.js (v180).
Added   "↶ Restore previous" beside "✨ AI draft — review" on a section
        whose content the AI replaced: puts the old content back. Kept
        in record._aiPrev[key] until the user edits, clears or restores
        the section (toolbar Undo covers Duties & Tasks only). A second
        run keeps the user's original, not the first draft. Never sent
        to the exports or to Module Builder. The dialog says so when a
        filled section is ticked.
Added   The sections the user added ("➕ Add section", 3.46.0) are now
        offered in the AI dialog under "Your added sections", their
        title standing in for the rule (2–8 items), and their filled
        lines are sent as context like the standard sections. Deleting
        a section drops its AI marks.
Changed ✨ Generate with AI: the sky-blue of the AI cards (was the last
        inline purple gradient), now a CSS class (.ta-ai-btn) with the
        same geometry as 🗑️ Clear Analysis; the dialog header, ticks and
        "Generate selected" and the AI-draft mark follow in blue.
Changed One backend address: BACKEND_URL is exported from ai_client.js
        and imported by the eight files that each repeated it.
        EN/FR/AR, RTL.

── 3.69.0 — 2026-10-06 — Task Verification in the AI-card blue ─────
MINOR. dacum-components.css, index.html, tasks.js, workshop.js,
sw.js (v179).
Changed Task Verification & Training Priority: every purple bar and
        button uses the sky-blue of the AI cards, gradients kept as
        gradients (#0ea5e9 → #0284c7; hover → #0369a1): duty accordion
        headers (open / hover), verification and results table headers,
        the Results Dashboard header, 📊 View Results Chart, 🔒 Finalize
        & Create Live Voting Session, the Supplementary Verification
        buttons. Purple accents in the tab (Priority Index and score
        numbers, section titles, Duty-Level Summary, Live Workshop
        headings and borders, voting-results summary) follow in
        #0284c7. Rules are scoped to #verification-tab, so the same
        classes elsewhere are unchanged.

── 3.68.0 — 2026-10-06 — Table View task delete as a soft ✕ ────────
MINOR. duties.js, dacum-components.css, index.html, sw.js (v178).
Changed Duties & Tasks → Table View: each task's 🗑️ red button is now
        the soft rose square with a red ✕ used for list rows in Module
        Curriculum (#fff5f5 / #fecaca / #b91c1c; hover #fee2e2), the ✕
        an inline SVG. Same data-action, so delete and undo are
        unchanged. The duty-level buttons are not touched.

── 3.67.0 — 2026-10-06 — Card / Table switch on the bar ────────────
MINOR. duties.js, events.js, dacum-components.css, translations.js,
index.html, sw.js (v177).
Changed The Card / Table switch moved into the Duties & Tasks bar, at
        its start: [🃏 Card | 📋 Table] ✕ Exit · 🔍− 100% 🔍+ ⟲ Reset ·
        🎨 Colours 🖨 Print 🖥 Fullscreen. The separate row with
        "Card View — Duties & Tasks" and the switch is gone (one line
        of height saved; the tab has its own title).
        - Everything fits on one line with icons and labels on desktop
          (≈ 860 px needed; the bar is 900 px at 1280 px with the
          sidebar open, wider when it is folded). On a narrower window
          the bar wraps to a second line — labels are never dropped.
        - Table View: the bar shows the switch only (the other tools act
          on the cards).
        - Presentation (fullscreen): the switch is hidden.
Removed The legacy hidden #btnToggleDutiesView, the #dutiesViewHeading
        line and their strings (headingCardView, headingTableView).

── 3.66.0 — 2026-10-06 — Card colours ──────────────────────────────
MINOR. card_colors.js (new), duties.js, export_settings.js,
dacum-components.css, translations.js, index.html, sw.js (v176).
Added   🎨 Colours on the Card View bar (next to 🖨 Print): a small
        panel under the button with two rows, Duty cards / Task cards —
        the default chip (blue / yellow) and eight colours (DACUM Lite
        set: blue, teal, green, amber, orange, rose, purple, slate).
        One click recolours the cards at once. The card becomes a LIGHT
        tint of the pick (pale background, the colour on the border, a
        dark shade for label and text), so text stays readable.
        - From the bar the change is TEMPORARY: it lasts until the tool
          is closed (sessionStorage dacum_card_colors_tmp), then the
          saved colours — or the defaults — return.
        - "⚙️ Keep these colours" opens Settings with the pick staged;
          Save keeps it on this device (localStorage dacum_card_colors)
          and clears the temporary pick.
        - Settings (⚙️ Export Settings panel) has a "🃏 Card colours"
          section (badge: Screen) with the same swatches and a preview;
          it shares the panel's draft, Save, Cancel and Reset.
        - Applies on screen, in the presentation (fullscreen) view and
          in Card View print-outs. Word / PDF exports never read it.
        - Click outside or Esc closes the panel (Esc then does not end a
          presentation). EN / FR / AR, RTL, 360 px.

── 3.65.0 — 2026-10-06 — Wall View merged into Card View ───────────
MINOR. duties.js, drag_drop.js, events.js, dacum-components.css,
dacum-rtl.css, translations.js, index.html,
DACUM_Live_Pro_User_Guide.html, sw.js (v175).
Changed 🖥 Fullscreen in Card View is now the presentation view the Wall
        used to be: app chrome hidden, and each duty's tasks WRAP onto
        as many lines as needed, so the whole chart is on screen with
        no sideways scrolling (zoom 25–150 % still works). Normal Card
        View keeps its one-line scroll strips for editing; print wraps
        as before. Where the page cannot go fullscreen (iPhone Safari,
        or a refused request) the same view opens inside the window, so
        the button works on every device. Leave with Esc, ✕ Exit, the
        button again, or by switching tab.
Removed Wall View: the 🧱 Wall switch, its renderer, toolbar, auto-zoom,
        Ctrl +/− shortcuts and sticky-note skin (duties.js ~400 lines,
        dacum-components.css ~25 KB), its RTL rules, and its unused
        strings (viewWall, ttViewWall, headingWallView, emptyWall*,
        ttWvExit, ttWvZoomReset, ttWvPrint, ttWvFullscreen). A stored
        view mode of 'wall' opens Card View. drag_drop.js now wires
        Card View only. The .wall-toolbar / #wallPrintHeader names stay
        (used by Card View).
Fixed   Phones (≤480 px): with ＋ and ✕ in the header (3.63.0) the
        140 px task card clipped "المهمة ب10" / "Tâche B10". Task cards
        are 150 px there, the header buttons 20 px and the label tighter
        — no label clipped in EN / FR / AR at 360–480 px, and two cards
        still fit per line in the presentation view.
Docs    User Guide, Card view: paragraph on the bar and the ＋ / ✕ card
        buttons (k639, EN / FR / AR).

── 3.64.0 — 2026-10-06 — Card View zooms out to 25 % ───────────────
MINOR. duties.js, index.html, sw.js (v174).
Changed Card View zoom now goes down to 25 % (was 50 %), so a large
        chart fits on one screen. Steps follow Wall View: 5 points
        below 50 % (50 → 45 → … → 25), 10 points above. Upper limit
        stays 150 %.

── 3.63.0 — 2026-10-06 — Card View: Exit, ＋ / ✕ on every card ─────
MINOR. duties.js, dacum-components.css, translations.js, index.html,
sw.js (v173).
Added   "✕ Exit" at the start of the Card View bar, as in Wall View:
        leaves fullscreen and returns the zoom to 100 %. Greyed out
        while there is nothing to leave (normal screen at 100 %).
Added   Every card carries the Wall View square buttons in its header:
        ＋ on a duty card adds a duty, ＋ on a task card adds a task to
        that duty; ✕ removes (light lavender ＋ / light rose ✕,
        24 px). Same data-action hooks as Wall View, so history, undo
        and drag & drop are unchanged. Hidden in print. The "＋ Task"
        pill at the end of each row stays.

── 3.62.0 — 2026-10-06 — Card View tools ───────────────────────────
MINOR. duties.js, dacum-components.css, translations.js, index.html,
sw.js (v172).
Added   Duties & Tasks → Card View has the Wall View tools in a bar
        above the cards: 🔍− / % / 🔍+ zoom (50–150 %, step 10, kept for
        the session in sessionStorage dacum_card_zoom), ⟲ Reset (100 %),
        🖨 Print and 🖥 Fullscreen. Same .wall-toolbar look.
        - Zoom is CSS zoom on each .duty-row (--cv-zoom): editing, the
          sticky duty card and drag & drop work at any zoom.
        - Print: the print header (occupation, job title, date), then
          every duty with ALL its tasks (the strip wraps instead of
          scrolling); no ✕ / ＋ / drag handles; card colours kept.
        - Fullscreen: only the bar and the cards; Esc or the button
          exits; leaving Card View exits it too.
        The bar sits outside #dutiesContainer, so drag_drop.js and the
        Wall / Table views are unchanged. Tooltips EN / FR / AR.

── 3.61.0 — 2026-10-06 — Proceed buttons in sky-blue ───────────────
MINOR. dacum-components.css, index.html, sw.js (v171).
Changed Every "Proceed to …" button (.btn-next-step) uses the sky-blue
        gradient of the AI cards (#0ea5e9 → #0284c7; hover #0284c7 →
        #0369a1) instead of #667eea. The grey "Skip to Competency
        Clustering", the amber emphasis buttons and the disabled state
        are unchanged.

── 3.60.0 — 2026-10-06 — Task Verification cards recoloured ────────
MINOR. dacum-styles.css, index.html, sw.js (v170).
Changed Task Verification: the "Data Collection Mode" and "Workflow
        Mode" cards use the sky-blue of the AI cards (#0ea5e9 →
        #0284c7) instead of purple; the "👥 Number of Workshop
        Participants" card is slate (#f1f5f9, hairline #cbd5e1, heading
        #475569, hint #64748b) instead of green.

── 3.59.0 — 2026-10-06 — Skills Level Matrix bar in slate ──────────
MINOR. dacum-styles.css, index.html, sw.js (v169).
Changed The "📊 Skills Level Matrix" collapsible bar (Additional Info)
        is slate instead of green: open #f1f5f9 / #475569 with a
        #cbd5e1 rule, hover #e2e8f0 / #1e293b.

── 3.58.0 — 2026-10-05 — Green buttons in slate ────────────────────
MINOR. dacum-styles.css, dacum-components.css, index.html, sw.js (v168).
Changed Every green button now uses the slate of the Additional Info
        section buttons (#f1f5f9 / #475569, hairline #cbd5e1; hover
        #e2e8f0 / #1e293b / #94a3b8): + Add Duty, + Add Task (list and
        card views), Add Section, Save, Create Cluster, Create Learning
        Outcome, Create Module, Export Dashboard, Add Category, Add
        Competency, the QR dialog's green button, and the Live Workshop
        Copy Link / Export CSV. Disabled Create buttons are lighter
        still (#f8fafc / #94a3b8). Badges, status marks and success
        flashes stay green. Behaviour unchanged.

── 3.57.0 — 2026-10-05 — Logo buttons like the section buttons ─────
MINOR. dacum-styles.css, index.html, sw.js (v167).
Changed Chart Info "Add Logo" and "Remove" now look like the Additional
        Info section buttons: Add Logo slate (#f1f5f9 / #475569, hairline
        #cbd5e1), Remove red tint (#fef2f2 / #b91c1c) turning solid red
        on hover. Behaviour unchanged.

── 3.56.0 — 2026-10-05 — Page background in the Module Builder grey ─
MINOR. dacum-styles.css, index.html, sw.js (v166).
Changed The page background behind the content is Module Builder's
        warm grey #E8E9E6 instead of the purple gradient.

── 3.55.0 — 2026-10-05 — Sidebar in the Module Builder silver ──────
MINOR. dacum_projects.js, index.html, sw.js (v165).
Changed The sidebar (navigation + projects) uses Module Builder's
        silver rail instead of the dark theme: gradient #EFF0EE →
        #DADCDE → #CDD0D2, hairline #BFC4C9, ink #3F464D (labels
        #6B7379), active entry on #FCFCFB with a #6E767D spine and a
        soft shadow, "+ New" in #6E767D, light search box and project
        cards. Brand title and section labels in the same ink.
        Layout, sizes, collapse and mobile drawer unchanged.

── 3.54.0 — 2026-10-05 — Full Draft card in the same blue ──────────
MINOR. dacum-draft.css, index.html, sw.js (v164).
Changed The "✨ Generate Full Draft" card (Chart Info) uses the same
        sky-blue gradient as the other AI cards (#0ea5e9 → #0284c7);
        its button text is #0284c7. The generator dialog is unchanged.

── 3.53.0 — 2026-10-05 — AI cards in the Module Builder blue ───────
MINOR. index.html, sw.js (v163).
Changed The five AI generation cards (Duties & Tasks, Additional Info,
        Competency Clusters, Learning Outcomes, Module Mapping) use the
        sky-blue gradient of Module Builder's Module Management card
        (#0ea5e9 → #0284c7, shadow rgba(14,165,233,.3)) instead of the
        purple one; their white primary buttons use #0284c7 text. Same
        layout, ids and behaviour; class ai-gen-card added as a hook.

── 3.52.0 — 2026-10-05 — Competency criteria from two sources ──────
MINOR. modules.js, events.js, translations.js, index.html,
DACUM_Live_Pro_User_Guide.html, sw.js (v162).
Fixed   The Task Analysis criteria shown above a competency's criteria
        box had no heading (the "From Task Analysis (read-only here)"
        string existed but was never rendered). The block now carries
        "🔬 From Task Analysis …" on a light background. Their text is
        now HTML-escaped.
Added   A guidance line inside the criteria box: with Task Analysis
        criteria, "add only criteria for the integrated performance —
        do not repeat them"; without, "write them here or per task in
        Task Analysis".
Added   Duplicate warning under the box: a typed criterion that repeats
        a Task Analysis criterion of the same competency (same text,
        ignoring case, spaces and end punctuation) is flagged ⚠ with
        both numbers — it would be counted twice. Updated on blur;
        never blocks saving.
Added   Renumbering notice in Competency Clusters: when the number of
        Task Analysis criteria of a competency changes, its typed
        criteria shift (e.g. 3-1 → 3-25); a notice gives the new range
        and says learning outcomes follow (they are linked by text).
        Dismissable; kept until dismissed or reload. The count is kept
        in cluster.taCriteriaCount (new, optional; older projects get
        it silently on first view, without a notice).
Docs    PC & Range help: "Two sources, one list" note. Module Mapping
        guide: numbering item. User Guide: paragraph k638 in
        "Competency criteria and their tasks". EN / FR / AR.

── 3.51.0 — 2026-10-05 — Import without a Skills Level Matrix ──────
MINOR. dacum_projects.js, renderer.js, snapshots.js,
workshop_snapshots.js, sw.js (v161).
Fixed   Importing a JSON file that has no skillsLevelMatrix (a hand-made
        file, or one from another tool) failed with ERR-WORKSHOP-001
        ("Cannot read properties of undefined (reading 'push')") in
        renderSkillsLevel. The matrix is now always an array when a
        project is imported, opened or restored from a snapshot; an
        empty one is seeded with the default categories, as for a new
        project. A project already stored without a matrix by the failed
        import opens again. Files exported by the tool are unaffected.

── 3.50.0 — 2026-10-05 — Criterion-to-task links removed ───────────
MINOR. modules.js, events.js, trace_map.js, translations.js,
module_curriculum.js, index.html, DACUM_Live_Pro_User_Guide.html,
sw.js (v160).
Removed The optional criterion-to-task links (added in 3.47.0): the
        panel under a competency's criteria, its chips and "↺ Clear",
        the "[🔗 A3]" tag in the Learning Outcomes source list, the 🔗
        mark and its legend item in the Traceability Map, the help and
        User Guide text that explained it, and its CSS and strings.
        It confused users for little benefit.
Changed Tracing is back to the pre-3.47.0 rule everywhere (Task
        Analysis "Used in modules", Module Builder handoff
        sourceTaskIds / performanceCriteria[].sourceTaskIds, Module
        Curriculum related tasks, Traceability Map): a Task Analysis
        criterion traces to its own task; a competency criterion to
        every task of its competency. In the Traceability Map the
        dashed line and 🔬 now mark Task Analysis criteria only.
Compat  Projects saved by 3.47.0–3.49.0 may still hold
        a per-criterion task map on each competency. It is left in
        the data, no longer read anywhere; no migration.

── 3.49.0 — 2026-10-05 — Programme id in the Module Builder handoff ──
MINOR. modules.js, index.html, sw.js (v159).
Added   The Module Builder handoff (localStorage dacum_modules_export)
        now says which project its modules come from: handoffVersion 2,
        programId (the active project's id, stable after a rename),
        programName (the project's sidebar name, else the occupation)
        and dacumVersion. Module Builder 3.12+ keeps one project per
        programme with these, so two programmes never mix in its
        module library. Older Module Builder builds ignore the fields.
Fixed   Sending one module ("Build in Module Builder") while modules of
        ANOTHER project were still waiting in the handoff merged the
        two programmes into one payload; those waiting modules are now
        replaced instead.

── 3.48.0 — 2026-10-04 — Traceability Map ─────────────────────────
MINOR. trace_map.js (new), modules.js, events.js, translations.js,
index.html, DACUM_Live_Pro_User_Guide.html, sw.js (v158).
Added   "🧭 Traceability Map" (button in Competency Clusters and in
        Module Mapping): a read-only picture of the whole chain in five
        columns — Occupational Profile (duties and tasks), Competencies,
        Performance criteria, Learning outcomes, Modules — joined by
        lines. Data from modules.js getTraceGraph(), which uses the same
        tracing as the coverage matrix and the Module Builder handoff
        (Task Analysis criterion → its task; competency criterion → its
        linked tasks, else every task of the competency).
        Click a box: its chain lights up and the rest fades (a dashed
        line shows a criterion tied to specific tasks); the bar below
        lists the chain; "🔍 Show only this chain" keeps just that
        chain on screen; click again / Esc to clear, Esc again to close.
        Filters by duty, competency or module; any column can be hidden
        (lines bridge across it, at least two columns stay); "Show
        gaps" marks tasks in no competency, competencies without
        criteria, criteria in no outcome, outcomes in no module, with a
        count. Outcomes and modules are ordered to cross the fewest
        lines. Under 760 px the map becomes a list of tasks, each
        opening onto its chain, plus a folded list of the other gaps.
        Nothing is written to the project. Loaded on demand; precached.
        EN/FR/AR, RTL (the chain runs right to left), 360 px.
Changed User Guide (Module Mapping): the Traceability Map.

── 3.47.0 — 2026-10-04 — Competency criteria linked to tasks ────────
MINOR. modules.js, module_curriculum.js, events.js, translations.js,
index.html, DACUM_Live_Pro_User_Guide.html, sw.js (v157).
Added   "🔗 Link criteria to specific tasks (optional)" under the
        criteria of each competency (2+ tasks): one row per criterion
        typed for the competency, one toggle per task. A linked
        criterion traces to the ticked tasks only (e.g. 5S → A3);
        unlinked, to every task of its competency as before. The same
        tracing drives Task Analysis "Used in modules", the module's
        Related Tasks, the Module Builder handoff (sourceTaskIds,
        performanceCriteria[].sourceTaskIds, taskAnalysis) and the
        Module Curriculum standard links. Stored as
        cluster.criterionTasks {"<criterion text>": [taskId…]} inside
        the cluster (project, JSON, import — no new key). A re-typed
        criterion keeps its link; a deleted one drops it. The Learning
        Outcomes source list marks linked criteria [🔗 A3].
        Ticking every task is the same as no link, so nothing is stored
        and the row reads "all tasks"; a linked row has "↺ Clear" to go
        back to all tasks. The panel stays open while you work in it.
        EN/FR/AR, RTL, 360 px.
Added   Help. Module Mapping "?" guidelines: "Can a task be taught in
        more than one module?" (conditions: every criterion taught at
        least once, deliberate repetition, assessed formally in one
        module) and "Task criteria or competency criteria?". Task
        Analysis "?": "Modules and criteria". Performance Criteria /
        Range "?": a note on competency vs task criteria and the links.
        User Guide (Competency Clusters): the same, in a short card.

── 3.46.0 — 2026-10-04 — Task Analysis: order and added sections ─────
MINOR. task_analysis.js, exports_docx.js, exports_pdf.js, projects.js,
dacum_projects.js, snapshots.js, state.js, translations.js, index.html,
DACUM_Live_Pro_User_Guide.html, sw.js (v156).
Changed Task Analysis sections ordered by importance: Performance Steps,
        Required Knowledge, Required Skills, Performance Criteria,
        Performance Standard, Tools/Equipment/Materials, Safety/OSH,
        Decisions/Critical Points, Conditions/Work Environment, Common
        Errors. One list (TA_FIELD_SPECS) now drives the form, the AI
        dialog and the Task Analysis appendix of the Word and PDF chart.
        Data unchanged (fields are keyed, not positional).
Added   "➕ Add section" under the last card: a section with the user's
        own title (suggested: "Quality Requirements"), added to every
        task of the project; ✏️ renames it, "✕ Delete section" removes
        it after confirming (naming how many tasks have content in it).
        Same list card as the others (numbering, bullets, clear). Stored
        as appState.taskAnalysisCustomSections [{id, title}] (project,
        JSON — written only when not empty — and import); each task's
        lines in record.custom[id]. Printed after the standard sections
        in the Word / PDF appendix; sent to Module Builder as
        customSections [{title, items}]. Counts toward "in progress";
        not generated by the AI. EN/FR/AR, RTL, 360 px.
Fixed   A new project (and Clear All) kept the previous project's Task
        Analysis and priority stars: they are keyed by task id
        (duty_1_1 …), so they reappeared on the new project's tasks.
        Both are now reset, with the added sections.
Changed User Guide: the Task Analysis table follows the new order and
        explains "Add section".

── 3.45.0 — 2026-10-04 — Task Analysis: where it goes ────────────────
MINOR. task_analysis.js, modules.js, translations.js, index.html,
sw.js (v155). Pairs with Module Builder 3.10.0 ("Where is the Task
Analysis?"); each works without the other.
Added   Task Analysis tab: under the task title, "📦 Used in modules:"
        with the code of every module whose outcomes trace back to the
        task (a Task Analysis criterion to its own task, a competency
        criterion to every task of its competency — the same tracing as
        the Module Builder handoff). "Not used in any module yet" when
        none does; nothing before modules exist. EN/FR/AR, RTL, 360 px.
        New export getModulesUsingTask(taskId) in modules.js.
Fixed   Task labels in French and Arabic read "TASK Tâche A1" /
        "TASK المهمة أ1" — on module cards ("Related Tasks"), in the
        criteria and coverage lists, and in the codes sent to Module
        Builder: the translated label was prefixed with "TASK" again.
        English keeps "TASK A1"; French and Arabic use their own label
        ("Tâche A1", "المهمة أ1").

── 3.44.0 — 2026-10-04 — Module Builder handoff: tasks and more fields ─
MINOR. modules.js, sw.js (v154). Pairs with Module Builder 3.9.0, which
reads the new fields; an older Module Builder ignores them safely.
Fixed   Module Builder received NO source tasks and no Task Analysis for
        a module whose outcomes use competency criteria — almost every
        module: those criteria carry no taskId (only Task Analysis
        criteria do), and the tasks were collected from taskId alone.
        Verified on a 16-module project: 0 → 16 modules with source
        tasks; a task's analysis now reaches its module. A criterion now
        traces to the tasks of its competency (a Task Analysis criterion
        still to its own task).
Added   In the payload (additive; same localStorage key):
        • per criterion: sourceTaskIds (the tasks it traces to);
        • per outcome: loId (DACUM's id, so an outcome sent again is
          updated, not duplicated);
        • per module: sourceTasks [{id, code, text, dutyTitle}] — every
          source task, analysed or not — and curriculum (from Module
          Curriculum: credits, total and split hours, purpose,
          prerequisites, outcome hours; null when nothing was entered);
        • top level: occupationTitle, jobTitle, sector, labelMode.
        The Module Mapping JSON download carries the same module shape.
Unchanged Module code and short name (sent since 3.34), level, track,
        outcomes, criteria, occupational reference data.

── 3.43.0 — 2026-10-03 — User Guide updated (EN / FR / AR) ────────────
MINOR. DACUM_Live_Pro_User_Guide.html, index.html, translations.js,
dacum-rtl.css, sw.js (v153). No change to application behaviour.
Changed User Guide brought up to 3.43 (last revised for 3.23, August):
        • New sections: Quick Start (the eleven Help-tab steps, each
          linked to its section), The complete path (stage → output →
          what it feeds), Task Analysis, Occupational Standard, Module
          Curriculum CUR/CBC.
        • Rewritten: What's New (Sept–Oct releases), Learning Outcomes
          (source list, inline statements, numbering, ⚠ links, undo,
          guidelines), Module Mapping (levels, track / code / short
          name, coverage, AI options, Module Builder), Skills Level
          Matrix (editable levels, one table; moved after Additional
          Info, where it lives).
        • Updated: overview, projects (large storage + backup warning),
          toolbar (Standard menu; Undo / Redo follow the tab), Duties &
          Tasks (Refine Results; ids never reused), AI cards (Task
          Analysis row; no daily limit), Additional Info, Task
          Verification (results chart, report appendix, Supplementary
          Verification), Competency Clusters, exports (OS, CUR;
          Assessment Plan removed), offline (exports offline, loading
          screen), tips. Stale statements removed (daily allowance,
          evidence requirements / assessment plan).
        • Arabic follows the interface terms: اسم المهنة / اسم العمل
          (no longer المسمى المهني / المسمى الوظيفي); French follows the
          interface (Intitulé du métier, Titre du poste, Groupes de
          compétences).
        • Same single file and DICT format (613 keys, every key in all
          three languages), same ?lang= links and QR code. Tables wrap
          inside their cells on phones (360 px: no horizontal scroll).
Fixed   Help tab in Arabic: the header and the card titles (Quick Start,
        User Guide, About the Creator) sat at the far left, away from
        their icon — dacum-rtl.css used space-between for .hc-header /
        .hc-card-head. Now icon then title from the right edge, as in
        LTR from the left (phones unchanged: header stacks).
Fixed   Help tab e-mail showed "[email protected]" and linked to
        /cdn-cgi/l/email-protection, a Cloudflare path left over from a
        page saved from a Cloudflare host; it does not exist on GitHub
        Pages (dead link + a 404 script on every load). Now a plain
        mailto: link showing the address; the decoder script is removed.
Changed Help tab: Quick Start has 11 steps covering Task Analysis,
        Occupational Standard and Module Curriculum (EN/FR/AR); the User
        Guide card no longer promises screenshots.

── 3.42.1 — 2026-10-03 — Additional Information AI card ──────────────
PATCH. additional_info_ai.js, translations.js, sw.js (v152).
Fixed   Conflicting language rules: the prompt said "use the language of
        the Occupation Title" while an Arabic/French interface appended
        "write in Arabic/French" — an English title under an AR/FR
        interface could return mixed-language lists (also the Full Draft
        language lock). The title rule now applies only when the
        interface adds no language directive (English), as in the other
        AI cards.
Fixed   The overwrite question listed the sections in English in every
        language; it now uses the headings as shown in the tab
        (translated default, or the name the user gave it).
Fixed   The success message mixed in English ("derived from your duties
        & tasks", the trimmed-lists note); now translated EN/FR/AR.
Changed Generated items are written as "• " bullet lines, the format of
        the tab's Bullets button (bullets/numbers the model adds are
        still stripped first, so never doubled). Readers (exports,
        Occupational Standard, Supplementary Verification, Task
        Analysis picker) already strip bullets.
Changed Skills Requirements no longer repeat the Skills Level Matrix:
        when the matrix lists employability competencies (the project's
        rows, or the default rows of a fresh project), they are sent as
        "already covered" and the Skills section asks for
        occupation-specific technical skills only; an item identical to
        a matrix competency is dropped in code. With no matrix
        competencies the previous "technical + employability" wording is
        kept.

── 3.42.0 — 2026-10-03 — Assessment Plan removed from the exports ────
MINOR. exports_docx.js, exports_pdf.js, sw.js (v151).
Removed The "Assessment Plan" appendix (added in 3.24.0) is no longer
        printed by the Word or the PDF export. Assessment forms per
        learning outcome are produced in Module Builder, and the linked
        performance criteria are still printed in the Learning Outcomes
        and Module Mapping sections of the same document.
        Verified: with modules, the only change is that final section
        gone (Word: its blocks deleted from the end; PDF: one page
        fewer, every remaining page identical), EN and AR. Without
        modules both files are byte-identical to 3.41.1.
Unchanged Learning Outcomes, Module Mapping, Levels & Coverage, the
        Module Curriculum (CUR) export with its own assessment
        statements, and the hand-off to Module Builder.

── 3.41.1 — 2026-10-03 — Matrix on a new page in Word ────
PATCH. exports_docx.js, exports_os_docx.js, sw.js (v150).
Changed "Employability Competencies by Occupational Level" starts on a
        new page in both Word exports: the chart document (the empty
        spacer paragraph before it became a page break) and the
        Occupational Standard (a page break before the heading, like the
        other sections of Part 2). Verified: that is the only change in
        either file (EN and AR); rendered, the heading is the first line
        of its page. The PDF export already started it on a new page.

── 3.41.0 — 2026-10-03 — Skills Level Matrix as one table ────
MINOR. renderer.js, skill_levels.js, export_settings.js,
exports_os_docx.js, translations.js, sw.js (v149).
Changed Additional Info → Skills Level Matrix is now ONE card holding a
        table laid out like the exported one: header row = Competency +
        one column per level (name edited in place, wraps; × removes;
        "＋ Level" adds, disabled at 6), a shaded row per category (name
        edited in place, "＋ Competency", ✕ remove), a row per competency
        (number, text edited in the cell, a checkbox in each level cell,
        ✕ remove). "Restore default levels" and "Reset All Selections"
        sit in the card's top bar; "Add Category" stays below it. The
        competency column stays in view while level columns scroll on
        narrow screens (360 px: the table scrolls inside the card).
        Replaces the per-category cards and the separate 3.40 levels row.
Changed The header takes the table header colour (and its contrast text
        colour) from Export Settings and repaints when it is changed.
Changed Occupational Standard (Word): ticks in the matrix are "✓" instead
        of "X", like the chart Word / PDF exports and the screen.
Unchanged Data, project / JSON storage, the chart Word and PDF exports
        (verified byte-identical) and the OS document apart from ✓.

── 3.40.0 — 2026-10-03 — Editable Skills Level Matrix levels ────
MINOR. New skill_levels.js; renderer.js, state.js, dacum_projects.js,
autosave.js, snapshots.js, workshop_snapshots.js, projects.js,
exports_docx.js, exports_pdf.js, exports_os_docx.js, os_model.js,
occupational_standard.js, translations.js, sw.js (v148).
Added   Additional Info → Skills Level Matrix: a "Levels (columns)" row
        to rename, add (up to 6) or remove (down to 1) the occupational
        levels, e.g. Chief Programmer / Technician / Assistant. Renaming
        keeps the ticks; removing a level asks first (naming how many
        ticks go with it); "Restore default levels" returns to the four
        defaults. Default names follow the interface language; typed
        names stay as typed. The legend of the four defaults hides each
        level once it is renamed or removed. EN/FR/AR, RTL, 360 px.
Changed The levels are project data (appState.skillsLevelColumns; null =
        the four defaults, which keep their historic ids so existing
        projects and JSON files keep their ticks). Saved with the project,
        in crash backups, workshop snapshots and the JSON file (written
        only when not the defaults). Clear This Tab resets them.
Changed The chart Word and PDF exports, the Occupational Standard (Word
        and tab) all read the levels from skill_levels.js; column widths
        follow the number of levels. With the default levels all six
        outputs (Word, PDF, OS × EN/AR) were verified byte-identical
        before and after (PDF compared without its creation date).
Fixed   A new project (and Clear All) inherited the previous project's
        Skills Level Matrix ticks. Both now reset the matrix and its levels
        to the defaults.

── 3.39.0 — 2026-10-03 — Occupational Standard tab ────
MINOR. New os_model.js and occupational_standard.js; exports_os_docx.js,
index.html, dacum_projects.js, projects.js, tabs.js, translations.js,
sw.js (v147).
Added   "Occupational Standard" tab in the sidebar, after Competency
        Clusters: a view of the Occupational Profile & Standard document
        (Part 1: panel, duties & tasks, additional information; Part 2:
        identification, employability matrix, competencies with range,
        related tasks and numbered criteria, tools). The institutional
        rows (reference code, endorsement, approval, review) show as
        "filled in institutionally after export". View only: each section
        has an "Edit in <tab>" link. Top bar with a completeness pill —
        opens the list of what is still missing, each with its link —
        and "Export Occupational Standard (Word)". EN/FR/AR, RTL, 360 px.
        Nothing new is stored: everything shown is already in the project
        and its JSON file.
Changed exports_os_docx.js now reads its content from os_model.js — the
        same model the tab shows — so view and file cannot drift apart.
        Output verified byte-identical (word/document.xml, EN and AR)
        before and after the change.
Unchanged The toolbar "Standard" menu (OS / CUR / CBC) stays as it was.

── 3.38.0 — 2026-10-03 — Loading screen; libraries self-hosted ────
MINOR. index.html, app.js, sw.js (v146); new vendor/ folder.
Added   Loading screen painted before anything else: DACUM Live Pro,
        version and date (read from APP_VERSION / APP_RELEASED via
        window.DACUM_BUILD), one-line description, progress bar,
        "Developed by Husham Jawad — TVET Expert". EN/FR/AR from the
        saved language, RTL, reduced-motion aware, inline styles only.
        Removed when app.js fires 'dacum:app-ready' (end of boot), after
        at least 600 ms. "Slow connection" note at 6 s; Reload / Continue
        at 20 s, or at once on a script error during boot.
Changed jsPDF 2.5.1, docx 7.8.2 and SortableJS 1.15.3 are served from
        vendor/ (same versions, unmodified, MIT; sources and checksums in
        vendor/README.md) instead of cdnjs / jsDelivr, loaded with
        `defer` so they no longer block the first paint, and precached:
        Word and PDF export now work offline.

── 3.37.2 — 2026-10-03 — AI cards: Duties, Clusters, Task Analysis ────
PATCH. projects.js, dacum_projects.js, clustering_ai.js,
task_analysis_ai.js, modules.js, translations.js.
Duties & Tasks AI card
Fixed   The request had no output-language directive (the only AI card
        without one): an Arabic/French interface could get duties and
        tasks in English, and the Full Draft language lock missed its
        first stage.
Fixed   Regenerating restarted task ids at duty_1_1, so each new task
        inherited the Task Analysis, verification ratings, workshop
        votes and cluster place of the old task with the same id. Ids
        now continue after every duty number still used by task-keyed
        data; old records stay saved but attach to nothing, and
        clusters flag their old tasks ⚠ as removed. A chart without
        such data still starts at duty_1. Codes (A1, B3…) unchanged.
Changed The overwrite question lists the work tied to the current
        tasks (votes, ratings, Task Analysis, clusters, outcomes,
        modules) when there is any.
Fixed   JSON import recounted dutyCount / taskCounts from the NUMBER of
        duties and tasks: after a deletion the next "Add" could create a
        duplicate id. Now taken from the highest id number.
Competency Clusters AI card
Fixed   "Suggest clusters" and "Range & criteria" now save the project
        after a run (as the LO / module generators do since 3.29/3.30).
Changed Both confirmations name the learning outcomes (and modules)
        that use the criteria about to be replaced.
Changed The criteria prompt lists the Task Analysis criteria of each
        cluster's tasks and asks for complementary competency-level
        criteria; exact repeats are dropped in code (both sources share
        the Learning Outcomes source list).
Fixed   Result notes were English only; now EN/FR/AR.
Task Analysis AI card
Added   Warning in the dialog when a filled "Performance Criteria"
        section is ticked and learning outcomes use those criteria.

── 3.37.1 — 2026-10-03 — Full Draft follows the LO / module changes ────
PATCH. draft_agent.js, draft_ui.js, learning_outcomes_ai.js,
module_mapping_ai.js, modules.js, translations.js.
Fixed   Learning Outcomes stage did nothing on a project that already
        had outcomes: since 3.29 the generator covers only criteria not
        yet used (or the ticked ones) and ADDS outcomes, so every
        criterion counted as used and the old outcomes were reported as
        the new draft. In a Full Draft run it now uses every criterion,
        ignores ticks in the LO tab, and REPLACES the outcomes once the
        new set exists (a failed call leaves the old ones).
Fixed   A failed Learning Outcomes / Training Modules stage could pass
        as done because the check was only "count > 0". Both stages now
        also require their content to have changed.
Fixed   Rebuilt modules reused ids (module_1…) that still owned Module
        Curriculum records (3.33+), so a new module inherited the old
        one's purpose, credits, resources and hours. Ids with curriculum
        records are now skipped (also for the standalone generators).
Fixed   Undo / Redo on the LO and Module Mapping tabs (3.31) could rewind
        a whole draft; their history is now dropped when a Full Draft
        stage rebuilds those tabs.
Added   Full Draft dialog: Module Curriculum is named in the overwrite
        warning when the current modules carry curriculum work, with a
        note that it is kept but not shown on the new modules; a warning
        when outcomes are rebuilt without Training Modules while modules
        exist. EN/FR/AR.

── 3.37.0 — 2026-10-03 — Large storage (IndexedDB) for projects ────
MINOR. New project_store.js; dacum_projects.js, app.js, autosave.js,
snapshots.js, tasks.js, translations.js, sw.js (v143), index.html.
Added  project_store.js is now the single owner of the project list
       (`dacum_projects`). localStorage stays the default; IndexedDB
       (`dacum_projects_db`) is a safety net, using the image_store.js
       pattern: in-memory copy for synchronous reads, coalesced
       background writes. Backend flag: `dacum_store_backend`.
Added  Automatic move to IndexedDB when a save hits the quota (after
       the session-backup reclaim fails) or the list passes 3.5 MB.
       Copy → read back and verify → flip flag → only then remove the
       localStorage copy. One status message (EN/FR/AR). If the move
       fails, the existing quota dialog / warning appears as before.
Added  "💾 Storage" line under the project list (hidden on the
       collapsed rail): shows where projects live and their size;
       dialog to move them to large storage and back. Moving back is
       refused (with the reason) when the data is over 3.5 MB or does
       not fit.
Added  Locked state: flag says IndexedDB but the browser refuses it →
       warning, nothing loaded destructively, every write refused (no
       empty list can overwrite the real one); no auto-created project.
Added  Cross-tab sync in IndexedDB mode (BroadcastChannel), flush of
       queued writes on pagehide / hidden, navigator.storage.persist()
       when switching, boot recovery if the flag write was lost.
Changed The six direct `localStorage.getItem('dacum_projects')` reads
       (autosave.js, snapshots.js, tasks.js ×3, dacum_projects.js Live
       Workshop panel) now go through readProjects().
Unchanged dacum_active_project, dacum_session_backup and UI keys stay
       in localStorage; image_store.js untouched.

── 3.36.1 — 2026-10-03 — Credits field in the Time table ────
PATCH. module_curriculum.js + dacum-curriculum.css.
Changed The Credits field moved into the Time table's first line:
        "Credits [3] × [25] h per credit = 75 h". The separate
        Credits field above it was removed (same data, data-ck
        "credits"); Prerequisites now use the full width.

── 3.36.0 — 2026-10-03 — One place for hours & percentages ────
MINOR. module_curriculum.js + dacum-curriculum.css.
Changed The module's Time table is now the only place where hours and
        percentages are seen and edited:
        • "3 credits × [25] h per credit = 75 h" — hours per credit
          is edited inline (still one value for all modules).
        • Each row (Theory, Practical, Formative, Industry practice,
          Summative) has its % field next to its hours.
        • "Percentages: ◉ Same for all modules ○ This module only"
          replaces both "Default time split" and "Use different
          percentages for this module" (same data, same behaviour).
        • Sum ≠ 100 % warning shown inside the card.
        Programme settings now holds only the programme name and the
        learners per group.
Kept    Saved data, calculation, LO auto-hours and CUR export are
        unchanged; old projects open as before.

── 3.35.1 — 2026-10-03 — LO hours filled by default ────
PATCH. module_curriculum.js + dacum-curriculum.css.
Fixed   Outcome hours showed nothing until the button was pressed
        (and nothing at all when the credits were still empty).
        Now every outcome shows an AUTOMATIC value as soon as the
        credits are known: the institutional time left after any
        typed values, shared by performance criteria (whole hours,
        exact total). Typing makes a value manual; clearing it
        returns to auto. Values update live when credits, hours per
        credit or percentages change. The export uses the same values.
Changed "⚖️ Distribute automatically" and its "?" moved next to the
        Duration field of each outcome; the button returns all the
        module's outcomes to automatic values. A hint under the field
        says whether the value is automatic or typed, or that the
        credits are needed first.

── 3.35.0 — 2026-10-03 — LO hours: automatic distribution ─
MINOR. module_curriculum.js + dacum-curriculum.css.
Added   "⚖️ Distribute hours automatically" in Module Curriculum
        (section 2): shares the module's institutional time over its
        learning outcomes in proportion to their linked performance
        criteria (minimum 1), whole hours by largest remainder, ties
        to the earlier outcome (90 h over 1/1/2 → 23/22/45). Asks
        before replacing hours already typed. A "?" beside it explains
        how to adjust: size, complexity, practical intensity,
        learners' starting point, resources. EN/FR/AR.
Changed index.html: this changelog moved to CHANGELOG.md (−44 KB).

── 3.34.2 — 2026-10-03 — exported file name ───────────
PATCH. module_curriculum.js / exports_cur_docx.js / state.js /
dacum-curriculum.css: in Module Curriculum, under the code and
short name, "Prefix for exported file" (typed by the user, e.g.
CUR or CBC; default CUR), "Level in file name" (L1 / Level 1)
and a live preview. File name keeps spaces:
"CUR_CMCN 1-1 Hardware L1 En.docx"; the footer reads
"CUR: CMCN 1-1 Hardware L1". Code and short name still come from
the module card. The prefix moved here from Programme settings.

── 3.34.1 — 2026-10-03 — module card fields on one line ─
PATCH. modules.js: Level, Track / code prefix, Code and Short
name sit on one line on the module card (narrower fields).

── 3.34.0 — 2026-10-03 — module codes and short names ──
MINOR. modules.js + module_curriculum.js.
Added   Each module card in Module Mapping has a Code (auto:
        track/prefix + level + position within the level, e.g.
        "CMT 1-1"; with no track, the Job Title initials; once
        typed it is kept, ↺ returns to auto; duplicates are
        flagged) and a Short name (for file names). The track
        field is now "Track / code prefix".
        "Show modules as": Code / Number (M1) / Both — one
        setting, followed by the cards, lists, coverage matrix,
        Module Curriculum tab and the Word/PDF exports.
        Code and short name are sent to Module Builder
        (moduleCode, shortName) and saved in JSON.
        Module Curriculum: "File name prefix" in Programme
        settings (default CUR) — file and footer use it.
Changed Code / short name typed in the Module Curriculum tab
        (3.33.x) move onto the module itself on first open;
        both tabs now edit the same fields.

── 3.33.2 — 2026-10-02 — CUR: one outcome per page ─────
PATCH. exports_cur_docx.js: in the exported CUR, every
learning-outcome table (Learning outcome 1, 2 …) starts on a
new page. The module header stays on page 1; resources follow
the last outcome.

── 3.33.1 — 2026-10-02 — curriculum guidelines wording ──
PATCH. module_curriculum.js: the "?" guidelines on the Module
Curriculum tab use a general example module (EN/FR/AR) and no
longer refer to any earlier project file or its author; each
field explains what to write, with one example.

── 3.33.0 — 2026-10-02 — Module Curriculum CUR/CBC ──────
MINOR. Additive only; projects without the new data load and
export exactly as before.

Added
  module_curriculum.js  NEW tab "📘 Module Curriculum CUR/CBC"
                        after Module Mapping (one i18n key,
                        tabModuleCurriculum). Per module: code
                        (suggested from track + level +
                        position, or the job-title initials),
                        purpose, credits, pre-requisites
                        (checkboxes), a COMPUTED time table
                        (credits × hours per credit, split by
                        %, largest-remainder rounding so the
                        parts always add up — the expert
                        file's 77-for-67 cannot recur), link to
                        the Occupational Standard, LO list.
                        Per LO: context, methodology,
                        discussion, demonstration, practice,
                        self-directed learning, numbered
                        formative statements ("Suggest from
                        criteria"), methods, optional hours
                        (warns when they do not match the
                        institutional time), "x/8 filled".
                        Resources: tools, equipment, PPE,
                        materials ("Suggest from Task
                        Analysis" picker — no duplicates,
                        nothing overwritten), recommended
                        resources, facilities table. Programme
                        settings (name, hours per credit 25,
                        group 15, default split 10/45/5/35/5).
                        Guidelines "?" (EN/FR/AR). Data keyed
                        by module/LO ids; orphans kept so
                        Module Mapping undo restores them.
  exports_cur_docx.js   NEW. CUR Word export after the expert
                        template, A4, RTL in Arabic, "—" for
                        empty fields, optional blank template.
                        File CUR_<code>_<short>_L<n>_<lang>.docx.
  dacum-curriculum.css  NEW, scoped styles (precached + warmed).
Changed
  events.js           the "Standard" toolbar button opens a
                      menu: Occupational Standard (Word) — the
                      unchanged export — / Module Curriculum —
                      CUR (Word)… / CBC (TESDA, coming soon).
                      Keyboard, Esc, RTL and phone aware. CUR
                      export is one module per click (no batch
                      downloads for a browser to block).
  index.html          tab markup; Module Mapping's step row now
                      proceeds to the new tab.
  state.js / dacum_projects.js / snapshots.js /
  workshop_snapshots.js / projects.js / tabs.js
                      new key moduleCurriculumData saved and
                      restored by projects, snapshots and JSON
                      export/import; old files default safely.
                      Clear This Tab clears curriculum only.
                      Sidebar entry added.
  snapshots.js / dacum_projects.js
                      JSON export/import now also carries the
                      programme's levelCount (it was dropped).
  sw.js               v132 → v133, precaches the three files.

── 3.32.4 — 2026-10-02 — index.html closed properly ─────
PATCH. No behaviour change.

Fixed
  index.html          the file ended mid-comment ("<!-") after
                      the Snapshot modal, with no </body> or
                      </html>. Browsers closed the document
                      themselves, so nothing visible broke, but
                      any later edit appended after that point
                      would have been swallowed by the open
                      comment. The stray fragment is removed and
                      the document is closed explicitly. Checked:
                      every script the page needs is loaded
                      above that point or imported by app.js /
                      snapshots.js (error-handler.js).
  sw.js               v131 → v132, bumped with EXPECTED_SW.

── 3.32.3 — 2026-10-02 — plain-text key hint ───────────
PATCH. modules.js: the LO card shortcut hint is plain text
("Press Enter: next outcome · Press Shift+Enter: new line");
the key-cap boxes looked like buttons.

── 3.32.2 — 2026-10-02 — levels field in the heading ───
PATCH. modules.js: the levels field sits on the "Modules"
heading line, centred between the title and its "?" (on phones
it drops just under them).

── 3.32.1 — 2026-10-02 — levels field above Modules ────
PATCH. modules.js: "Number of levels in the programme" now also
sits centred at the top of the Modules section — the same
setting as the AI card and the coverage matrix, all in sync.

── 3.32.0 — 2026-10-02 — design guidelines ─────────────
MINOR. modules.js: a "?" at the far end of "Performance
Criteria (Source)" (Learning Outcomes) and of "Modules" (Module
Mapping) opens guidelines — grouping criteria into outcomes
(one-to-one vs grouping, limits, cross-competency, writing the
statement) and building modules / assigning levels
(prerequisites, complexity & autonomy, perform→check→diagnose,
specialisation, spiral, reference framework). EN/FR/AR.

── 3.31.2 — 2026-10-02 — Module Mapping polish ─────────
PATCH. modules.js: "Specialisation" sits on the same line as its
field; the two options in the AI card are white.

── 3.31.1 — 2026-10-02 — one Undo/Redo in the toolbar ───
PATCH. history.js + events.js + modules.js. The toolbar Undo /
Redo now follow the visible tab: on Learning Outcomes and
Module Mapping they undo/redo those tabs' steps (scope lent by
modules.js via registerHistoryScope; tooltip names the step);
everywhere else they work on the Duties & Tasks history as
before. Ctrl+Z / Ctrl+Y work on those two tabs too (outside
text fields). The extra Undo bar inside the tabs is removed;
the 7-second Undo toast stays.

── 3.31.0 — 2026-10-02 — undo/redo for LOs & modules ───
MINOR. modules.js.
Added   Undo / Redo for the Learning Outcomes and Module Mapping
        tabs (separate from the Duties & Tasks history): delete
        module, delete outcome, remove outcome from module,
        unlink criterion. A toast offers Undo for 7 s; a bar at
        the top of each tab and Ctrl+Z / Ctrl+Y (outside text
        fields) do the same. History is dropped on project
        change or when the data is replaced elsewhere; undo
        asks first if other changes were made since.
Changed Module cards restyled (light violet), scoped to the
        modules list.

── 3.30.2 — 2026-10-02 — coverage matrix ──────────────
PATCH. modules.js: the coverage matrix is removed when there
are no modules (so "Clear This Tab" and deleting the last
module empty it), and is now a collapsible bar — closed by
default, showing Taught / Not taught; the open/closed choice
is remembered on this device.

── 3.30.1 — 2026-10-02 — levels count in the AI card ──
PATCH. modules.js: the number of levels can be set right in
the module-generation card (same value as the field above the
coverage matrix, kept in sync; never below the highest level
in use). With a single-level programme the level suggestion
switches off automatically.

── 3.30.0 — 2026-10-02 — AI module generation ──────────
MINOR. module_mapping_ai.js + modules.js.
Fixed   Titles no longer carry a baked "Module N:" (shown twice
        as "M3 — Module 3: …" and wrong after any reorder);
        old titles are cleaned on open. Saves after a run.
        Result notes translated (EN/FR/AR).
Added   Two options in the card: "Keep existing modules" (only
        outcomes not yet in a module are grouped; new modules
        are added — default on once modules exist) and
        "Suggest a level for each module" (level 1..N and a
        track code, using prerequisite / complexity / spiral /
        specialisation rules; clamped in code). The model's
        rationale is shown under each module title.
Changed Guidance 2-4 outcomes per module (1 allowed for a large
        stand-alone outcome); ceiling of 6 still enforced.

── 3.29.0 — 2026-10-02 — AI learning outcomes ──────────
MINOR. learning_outcomes_ai.js + modules.js.
Fixed   The generator used its own "C5-PC2" criterion ids,
        which no longer matched the list ("5-2"): ticked
        criteria were reported as empty, used criteria were
        generated again, task-analysis criteria were ignored.
        It now reads the same list as the screen
        (getLearningOutcomeCriteria) and saves after a run.
Changed Pattern C rules: integrate consecutive steps of one
        performance, criteria assessed in one task, or a
        criterion too small to stand alone; prefer the same
        competency, cross-competency only for one integrated
        performance — always flagged for review. Ceiling of 5
        criteria per outcome enforced in code (2-3 typical).
        Outcomes start with an imperative action verb.
        Result notes translated (EN/FR/AR).

── 3.28.2 — 2026-10-02 — hint wording ─────────────────
PATCH. modules.js: "saved automatically" removed from the
per-card keyboard hint.

── 3.28.1 — 2026-10-02 — LO tab polish ─────────────────
PATCH. modules.js: the criteria list hands the wheel back to
the page at its ends (no more stuck scrolling); the Edit
button is removed from LO cards (text is edited inline); each
card shows its keyboard hints (Enter / Shift+Enter, autosave).

── 3.28.0 — 2026-10-02 — inline learning outcome text ──
MINOR. modules.js: each Learning Outcome statement is an
always-editable field, saved automatically (no Edit → Save).
Empty statements are flagged on the card and counted above
the list with a "Next empty" jump; Enter moves to the next
outcome; "Use criterion text" pre-fills an empty one. The
Edit button stays and now focuses the field.

── 3.27.0 — 2026-10-02 — criteria source list ──────────
MINOR. modules.js, Learning Outcomes tab: the Performance
Criteria (Source) list scrolls on its own with sticky
competency headings; "Hide used criteria" + unused count; a
selection bar sticks to the screen bottom while criteria are
ticked (Clear / Create LO). The bar clicks the original
#btnCreateLO, which is unchanged.

── 3.26.1 — 2026-10-01 — learning outcome numbering ────
PATCH. modules.js: LO numbers follow position (LO1, LO2 …) and
renumber after a delete; ids are unchanged. Saved projects that
started at e.g. LO8 are shown from LO1 on open.

── 3.26.0 — 2026-10-01 — clusters, levels & coverage ───
MINOR. Additive only; projects without the new data export
and render exactly as before.

Added
  modules.js          Competence Cluster task controls (move
                      up/down, delete, + Add Task with its own
                      ID and "competency-clustering" source),
                      automatic sync with Duties & Tasks, and
                      Learning Outcome renumbering after
                      cluster changes. Module level + track,
                      levels count, and a performance-criteria
                      coverage matrix.
  exports_docx.js     "Programme Structure by Level" table and
  exports_pdf.js      the coverage matrix after Module Mapping;
                      module titles carry their level/track.
Fixed
  app.js              Active project is reopened on start-up
                      instead of being overwritten by the blank
                      boot screen.

── 3.24.0 — 2026-08-31 — assessment traceability ────────
MINOR. Two additions, both of which appear only when the data
they describe exists. Default output is unchanged.

Added
  exports_docx.js     "Assessment Plan" appendix. Per module,
  exports_pdf.js      per learning outcome, a table of its
                      linked performance criteria — reproduced
                      VERBATIM, never reworded. An assessment
                      sheet written from the content instead of
                      the standard is how a qualification
                      silently detaches from the occupational
                      standard it claims to measure; deriving
                      it from pc.text makes that drift
                      impossible rather than discouraged.
                      Emitted only when a module has an outcome
                      carrying linked criteria, so a chart-only
                      project exports byte-identically to
                      3.23.3.

  exports_os_docx.js  NEW. Second DOCX layout over existing
                      data: Occupational Profile + Occupational
                      Standard. Reads no field the app did not
                      already collect. Reference code and the
                      endorsement chain print as blank labelled
                      lines — they belong to a qualifications
                      framework, not to a DACUM workshop.
                      Performance criteria are numbered n.1,
                      n.2 here and nowhere else, so a module
                      descriptor citing "5.6" points at
                      something a reader can find. Kept
                      separate from exports_docx.js: that
                      exporter is the artefact every existing
                      project was validated against.

  index.html          Inline hint under Job Title, and an "OS"
                      toolbar button beside Word.

Changed
  exports_docx.js     Seven private helpers (_rtl, _start,
                      _font, _tblFill, _withArabicLang,
                      _withArabicLangParagraph,
                      _applyDocDefaultsLang, _safeFilename)
                      are now exported. Bodies untouched —
                      visibility only, so both DOCX documents
                      share one Arabic path and one Export
                      Settings path.

  sw.js               v87 → v88, precaching exports_os_docx.js.

Fixed
  index.html          EXPECTED_SW had drifted to v83 while
                      sw.js reached v87, so every load saw a
                      mismatch and offered an update that was
                      already installed. Both now read v88.

── 3.23.3 — 2026-08-17 — quota display removed ──────────
PATCH. The daily allowance is enforced exactly as before;
only its unsolicited display is gone.

Removed
  draft_ui.js         the cost card at the foot of the Full
                      Draft dialog ("this run will use 7 of
                      your 30 daily generations", plus a
                      second line repeating the remaining
                      count). It appeared on every open to
                      report a limit that, in the case where
                      it actually binds, already announces
                      itself: _quotaBlock() still renders the
                      dgQuotaTitle/dgQuotaBody warning and the
                      start button is still disabled by the
                      same quotaCheck(). A number the reader
                      can act on stays; one they cannot does
                      not, and it was competing with the two
                      notes above it that DO need a decision.
  draft_regen.js      the same sentence at the end of the
                      "Regenerate from here" confirmation, for
                      the same reason — rgQuotaShort already
                      refuses the run when the allowance is
                      short. {n} and {max} no longer passed.
  draft_ui.js         estimatedCalls import, unused once the
                      cost card went.
  translations.js     dgCostLabel and dgQuotaRemaining, all
                      three languages. Removed in THIS commit
                      and not earlier: t() falls back to the
                      English section and then to the key
                      name, so deleting a key still rendered
                      somewhere prints "dgCostLabel" on screen.

Kept
  dgQuotaTitle / dgQuotaBody   the blocking warning, which
                      names the shortfall and suggests
                      reducing how far the chain goes.
  rgQuotaShort        its equivalent for regeneration.

── 3.23.2 — 2026-08-14 — user guide, three languages ────
PATCH. No change to application behaviour.

Fixed
  Help tab            the two guide buttons pointed at an
                      absolute URL containing the repository
                      name (…/DACUM-Live-Pro-V3.1/…). Renaming
                      the repository broke both silently, with
                      nothing on screen to explain why. Now
                      relative, so the link resolves against
                      whatever URL the app is served from.
  Help tab            the second button was a duplicate of the
                      first — same href, same target. Replaced
                      with three direct language links.
  Help tab            the QR image was absolute for the same
                      reason and is now relative too.

Added
  DACUM_Live_Pro_User_Guide.html
                      rewritten as ONE file carrying English,
                      French and Arabic, with a switcher in the
                      page header. English text sits in the
                      markup and the dictionary holds all three,
                      so the page still reads correctly if the
                      script fails. Arabic flips dir=rtl and
                      uses fonts/Cairo.woff2 — the same file the
                      interface already precaches, which is why
                      the guide belongs at the repository root
                      and not in a subfolder.
  Help tab            the primary button passes the active
                      interface language through as ?lang=, so a
                      user working in Arabic gets the Arabic
                      guide without a second click.
  sw.js               the guide and its QR image precached (SW
                      bumped to v82). networkFirst() strips the
                      query before the cache lookup, so one
                      entry covers all three languages.

── 3.23.1 — 2026-08-14 — native dialogs, part 2 ─────────
PATCH. Completes 3.23.0 across the remaining modules.

Fixed (23 more strings)
  additional_info_ai.js  the reported message — "enter an
                         Occupation Title in Chart Info to
                         generate the supporting information"
                         — plus the replace-sections confirm
  tasks.js               orphaned-ratings confirm
  clustering_ai.js       replace Range/Criteria confirm
  module_mapping_ai.js   replace-modules confirm
  workshop.js            QR-not-found alert
  storage.js             invalid image type, unreadable image,
                         upload success, remove-logo confirm,
                         logo removed, "No image" placeholder,
                         daily-limit button tooltip
  projects.js            eight "<tab> cleared" messages and
                         "tab already empty"
  renderer.js            nothing-to-format, formatted-with-
                         numbering/bullets, section removed
  exports_pdf.js         "add at least one duty with tasks"

Plural forms
  Counted dialogs were assembled as 'rating' + (n===1?'':'s')
  and `${n} cluster${n>1?'s':''}`. That is English grammar
  written into the code: it cannot express Arabic's dual and
  cannot reorder a French sentence. Each is now two keys
  (...One / ...Many) with the count passed through {n}.

Reuse over duplication
  The eight "<tab> cleared" messages became one msgTabCleared
  with {v} filled from the tab-name keys that already existed,
  rather than eight near-identical sentences per language.

Added
  23 i18n keys x 3 languages. storage.js gained the _t/_tf
  helpers it had never had.

Verified
  All 300 keys referenced by _t()/_tf() across the twelve
  reviewed modules resolve in English, French and Arabic. The
  only remaining literals beside a dialog call are emoji
  prefixes on already-translated keys.

── 3.23.0 — 2026-08-14 — native dialogs follow the UI ────
MINOR. Reported from the PWA: an Arabic interface showing an
English alert.

Why this class of string was missed
  applyTranslations() walks [data-i18n] in the DOM. alert(),
  confirm() and showStatus() are called from JS at the moment
  of the action and never enter the DOM, so they are invisible
  to it. Each one has to resolve its own key at CALL TIME. A
  hard-coded English literal there survives every language
  switch — which is exactly what happened.

Fixed in this pass (18 strings)
  renderer.js     min-category, min-competency, remove-category,
                  remove-section
  projects.js     verification-gate alert, clear-tab confirm,
                  clear-tab-with-downstream confirm, AI
                  overwrite confirm, AI cancelled / success /
                  failed, daily limit (x2), all-data-cleared,
                  occupation-required alert
  exports_docx.js / exports_pdf.js
                  no-task-rated, occupation-required-for-export
                  and its status line

Added
  16 i18n keys x 3 languages. Multi-line dialogs keep their
  line breaks; the downstream-clear confirm takes the affected
  stage list through a {list} placeholder rather than being
  assembled from English fragments.

Still outstanding
  The message in the report — "Please enter an Occupation
  Title in Chart Info to generate the supporting information"
  — lives in additional_info_ai.js, which has not been
  reviewed. The same audit is owed to the other AI modules,
  duties.js, tasks.js, modules.js, storage.js, snapshots.js
  and workshop.js.

── 3.22.1 — 2026-08-14 — section buttons on phones ──────
PATCH. Follow-up to 3.21.0, reported from the installed PWA.

The cause was not the new button styles — those fit on one
line at 380px. It was three rules in dacum-responsive.css,
all correct for the FOUR TEXT BUTTONS they were written for
and all wrong for three icons plus one short label:
  • 900px  — flex-wrap: wrap on the header and the group.
  • 768px  — width:100% on the group and flex:1 on each
             button, stretching four buttons across the row.
             Those were the wide gaps in the screenshot.
  • 480px  — display:grid, 1fr 1fr. That was the 2x2 block.

Now
  • Above 480px: one row, buttons at their natural size, the
    heading takes the slack.
  • At/below 480px: the heading gets its own full-width line
    and all four buttons sit on ONE row beneath it. Sharing a
    line does not survive a 380px screen — the buttons need
    ~180px of it, which squeezed the heading hard enough to
    break "comportements" mid-word.
  • Clear is tightened (8px 12px, 0.78em) but keeps its label.

Verified by rendering the real markup at 360 and 380px in
Arabic, English and French: one button row in every case.

── 3.22.0 — 2026-08-14 — occupation-title sanity gate ────
MINOR.

The problem
  Every AI path in this app is rooted in one free-text field,
  and the only guard on it was that .trim() was non-empty. One
  character passed. "asdf" passed. A typo passed.
  A model completes; it does not verify. The generation prompt
  labels the title "BASE CONTEXT" — an assumed fact — and then
  demands "valid JSON format only", so even a doubtful model
  had no channel to object: the sole permitted output is a
  duties array. Post-response validation checked shape only
  (Array.isArray, length > 0), then reported a green tick and
  a duty count. The tool could not distinguish generation from
  invention.
  The dangerous case is not gibberish but the typo that lands
  on a NEIGHBOURING REAL occupation: a chart that is internally
  perfect, about the wrong job, with nothing in it to betray
  the drift.

Added
  • occupation_check.js — one short classification call before
    any generation. Verdicts: known / likely_typo / unknown.
    Caches per title+language; a likely_typo with no suggestion
    is demoted to unknown rather than shown unactionable.
  • Gate in generateAIDacum() (duties tab) and, for Full Draft,
    at Start in draft_ui.js — before quotaCheck() spends the
    day's allowance on a seven-stage chain rooted in the typo.
  • Warning card offering: use the suggestion / edit the title /
    generate anyway. Styled to match the Scope card.
  • 11 i18n keys x 3 languages.

Design decisions
  • NEVER auto-corrects. A curriculum expert may enter a local
    Iraqi or Gulf trade name the model has not met; silently
    replacing it would destroy their intent with confidence —
    worse than the typo. The field is written only by an
    explicit click on "Use ...".
  • FAILS OPEN. Backend down, bad JSON, unrecognised verdict →
    "unchecked" and generation proceeds. A sanity check that
    can block the app when it breaks is the larger liability.
  • The prompt treats dialect and emerging occupations as
    valid, and is strict only about typos and noise. A gate
    that fires on legitimate input teaches users to click
    through it, which is how a gate stops working.
  • "Generate anyway" is remembered per string, unlike the
    Scope card which re-asks every time. Scope asks you to ADD
    something; this asks you to confirm a judgement already
    made, and re-asking would train the click-through.

Not verified here
  The backend host is outside this environment's egress
  allowlist, so the live endpoint could not be exercised. The
  call reuses /api/generate-dacum with a different prompt and
  the same request shape as the existing generation call; if
  that endpoint constrains prompts server-side, this is the one
  thing to check first.

── 3.21.0 — 2026-08-14 — Additional Info action buttons ──
MINOR. Visual + accessibility work on the section header rows.

Changed
  • The four action buttons above every section were four
    saturated gradients — amber, two purples and a red — on a
    row of SECONDARY controls, out-shouting the section
    heading itself. Rename / Number / Bullet now use the same
    neutral slate token set as .btn-back-step: same padding,
    radius, border width, weight and transition.
  • Clear stays the only coloured one, because it is the only
    destructive one. Toned to a red tint at rest, solid red on
    hover. It also KEEPS its text label while the other three
    went icon-only: the control that wipes a section should be
    the clearest thing in the row, not the most cryptic.
  • Number / Bullet / Rename are now inline SVG instead of
    🔢 • ✏️. Emoji render as different artwork per platform,
    cannot take the button's colour, and sit on the text
    baseline rather than centring. These use currentColor and
    follow hover, focus and pressed states for free.
  • Rename uses an I-beam text cursor, not a pencil: a pencil
    reads as "edit the content", but this button edits the
    HEADING.
  • .btn-remove-section lost its inline gradient (custom
    sections only) and now shares the Clear styling.

Accessibility
  • Icon-only buttons carry title AND aria-label — without the
    latter they are silent to a screen reader, having no text.
  • Rename is a toggle, so it now sets aria-pressed and styles
    the pressed state. Previously nothing indicated that the
    heading had entered edit mode.
  • :focus-visible rings added; icon-only buttons were
    invisible to keyboard navigation.

Fixed
  • data-i18n-attr now accepts a comma-separated list, so one
    key can feed both title and aria-label. Passing
    "title,aria-label" previously reached setAttribute() as a
    single attribute name and threw InvalidCharacterError.
  • toggleEditHeading()'s hard-coded 'Heading updated! ✓' now
    uses msgHeadingUpdated.

Not done, on purpose
  • The list icons are NOT mirrored under RTL. scaleX(-1)
    moves the markers correctly but also mirrors the 1-2-3
    glyphs, and cancelling that per-glyph collapsed them to
    slivers in Chromium. A second set of RTL artwork is not
    worth it: an unmirrored list icon is unambiguous either
    way. See dacum-rtl.css.

Added
  2 i18n keys x 3 languages: ttRenameHeading, msgHeadingUpdated.

── 3.20.1 — 2026-08-14 — dead info-box code removed ──────
PATCH.

Removed
  • toggleInfoBox() (renderer.js) and its btnToggleInfoBox
    wiring and import (events.js). The info box it drove no
    longer exists: #infoBoxContent, .btn-toggle-info and
    #btnToggleInfoBox are all absent from index.html. _on()
    skips missing elements, so the handler was never attached
    and the function was never reached — had it been, it would
    have thrown on `infoBoxContent.style` (null).
    It carried hard-coded 'Hide' / 'Show' strings. Adding two
    i18n keys would have translated unreachable code; deleting
    it is the fix.

Fixed
  • exports_docx.js: the "Category N" fallback now uses
    expCategoryN, matching the PDF exporter. Applied to the
    current version of that file, which is 151 lines ahead of
    the copy in the project knowledge (it carries the w:lang
    proofing-language work) — the earlier 3.20.0 attempt had
    patched the stale copy and is superseded.

── 3.20.0 — 2026-08-14 — Skills Level Matrix in ar / fr ──
MINOR. The matrix showed a translated title and info box over
an entirely English body. Two different causes, fixed
differently, because they are two different KINDS of string.

Interface chrome — retranslates on language switch
  renderSkillsLevel() built its markup from English literals:
  "Category N", "Remove Category", "Competencies",
  "+ Add Competency", both placeholders, and the four level
  labels. All now resolve through i18n. The checkbox labels
  reuse lvlCraftsman/lvlSkilled/lvlSemiSkilled/lvlFoundation —
  the same keys as the legend above the matrix — so the two
  cannot drift apart in translation.

Seed data — resolved ONCE, then left alone
  The 33 default category and competency strings are DATA:
  they live in appState.skillsLevelData and the user can edit
  every one of them. They are now generated from i18n keys in
  the current interface language when a matrix is first
  created (fresh project, or an explicit Reset), and are NOT
  re-translated on later language switches. Rewriting wording
  a facilitator had adapted for their own sector is a worse
  failure than an English row in an Arabic chart.
  Consequence, by design: a project started in English keeps
  its English rows after switching to Arabic. Reset regenerates
  them in the current language.

Fixed along the way
  • The seed existed TWICE — once in state.js, once again as
    literals inside resetSkillsLevel() in renderer.js, already
    drifting in whitespace. Both now come from one spec.
  • defaultSkillsLevelData() deep-cloned the LIVE array rather
    than the defaults, so it returned edited data whenever it
    was called after an edit. It had no callers, which is the
    only reason this never surfaced. It has callers now.
  • The Word exporter's untranslated "Category N" fallback now
    uses expCategoryN, matching the PDF exporter.

Added
  40 i18n keys x 3 languages: slCat1-8, slComp1_1-8_2, plus
  matrix chrome and the reset confirm/status messages.

── 3.19.1 — 2026-08-13 — Arabic PDF: font never embedded ──
PATCH. Fixes a regression shipped in 3.19.0 that made Arabic
PDFs render as Latin letters and symbols.

Root cause
  jsPDF's VFS and font table are PER-INSTANCE, not global.
  3.19.0 warmed the font cache on a THROWAWAY probe document
  (ensureArabicFont) and never called addFileToVFS/addFont on
  the document it actually drew into. isArabicFontLoaded()
  answered true — the bytes WERE cached — so nothing looked
  wrong. setFont('Cairo') then failed its lookup, jsPDF logged
  a console warning and silently fell back to the standard-14
  Times-Roman, whose WinAnsi single-byte encoding maps every
  Arabic presentation form onto an arbitrary Latin character.
  Verified in the output PDF: no /FontFile2, no /Type0, only
  /WinAnsiEncoding.

Fixed
  • installArabicRTL() now registers the font on the document
    it is installing onto, and THROWS if the family is absent
    from pdf.getFontList() afterwards. The 3.19.0 failure was
    silent; that is what let it reach a user at all.

Not the cause (checked, ruled out)
  • The TTF is valid TrueType (sfnt 0x00010000), not WOFF2 and
    not an HTML 404 body.
  • base64 conversion is chunked and intact.
  • No double processing: exports_pdf.js contains ZERO calls to
    shapeArabic/bidiVisual/arabicVisual. The single pipeline
    lives in pdf_arabic.js's pdf.text() wrapper (Model B).
  • Not a Service Worker cache artefact.
  • Cairo itself is fine — Latin, base code points, shaping and
    bidi all verified stage by stage in arabic-pdf-diagnostic.pdf.

── 3.19.0 — 2026-08-13 — Arabic PDF export ──────────────
MINOR, not PATCH: PDF export in Arabic goes from refused to
supported. Nothing changes for English or French.

Added
  • pdf_arabic.js — the Arabic layer for jsPDF. Suspends the
    library's own shaper, neutralises its BiDi engine through
    the engine's documented options, and mirrors one document
    instance (text/rect/line/addImage/splitTextToSize/
    getTextWidth/setFont).
  • arabic-font.js — TTF loader, cmap coverage reader,
    contextual shaper, BiDi reorderer. Shared with DACUM Lite.
  • 14 i18n keys x 3 languages for the PDF's own labels.

Changed
  • exports_pdf.js no longer refuses in Arabic. _blockArabicPDF()
    is gone; the file now warms the font cache, installs the
    mirror, and restores the suspended parser in a finally.
  • PDF labels now use the SAME i18n keys as the Word exporter,
    so the two exports of one chart stop disagreeing on wording.
  • PDF filenames use the Unicode-safe sanitiser from
    exports_docx.js. The old /[^a-z0-9]/gi turned every Arabic
    occupation title into a row of underscores.

Fixed
  • Skills-level matrix ticks were the character U+2713, which
    is in NEITHER Helvetica NOR Cairo. jsPDF drops unmapped
    characters silently, so those cells have been printing
    blank in English too. Now drawn as two strokes.
  • EXPECTED_SW had drifted to v71 while sw.js reached v72, so
    every VERSION_REPLY compared unequal and the app re-checked
    for updates on every message. Both are v73.

Removed
  • msgPdfArabicUnsupported (en/fr/ar). Its only caller is gone,
    and a string asserting that Arabic PDF is impossible would
    mislead the next reader of this codebase.

Why the mirror instead of RTL coordinates
  exports_pdf.js positions ~145 pdf.text() calls absolutely from
  the LEFT edge. Rewriting each from the right margin would have
  meant maintaining two parallel coordinate systems forever. The
  mirror is exact, so borders and the text inside them move
  together — and the four task columns reverse (A1 on the right)
  as a consequence of the geometry rather than as a special case.

Deployment note
  fonts/Cairo-Regular.ttf MUST be present. The woff2 already in
  the repo is for the screen; jsPDF can only embed a TTF. Both
  the loader and the font file are precached in sw.js — caching
  one without the other only moves the offline failure one step
  later.
```
