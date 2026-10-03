# DACUM Live Pro — Changelog

Newest first. Moved out of `index.html` in 3.35.0, where it had grown to
about 44 KB inside an inline script that every visit downloaded. The
version constants (`APP_VERSION`, `APP_RELEASED`, `EXPECTED_SW`) stay in
`index.html`; bump them together with `CACHE_VERSION` in `sw.js`.
This file is documentation only — it is not loaded or cached by the app.

```text
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
