# DACUM Live Pro — behaviour tests

These tests open the app in a real browser (Chromium, via Playwright),
replace the AI backend with a stand-in, and check what users depend on.
They run on GitHub after every push (**Actions → Tests**) and are not
part of the app: nothing in this folder is loaded or cached by it.

| File | What it guards |
|---|---|
| `specs/smoke.spec.js` | The app starts in EN / FR / AR with no script error; every tab renders. |
| `specs/ai-reply.spec.js` | How an AI reply is read (prose, fences, split, cut off). |
| `specs/full-draft.spec.js` | All seven stages complete; with the AI down, a filled project asks first, saves a snapshot, stops at stage 1 and changes nothing. |
| `specs/job-title.spec.js` | Job Title required; a job from another occupation is questioned; the prompt analyses the job. |
| `specs/ai-cards.spec.js` | Task Analysis, cluster and Additional Info cards: only ticked parts change, restore works, marks are saved. |
| `specs/curriculum.spec.js` | Outcome Undo, coverage filter, Module Builder handoff, chart Word and PDF exports (EN/AR), Module Curriculum tab and its Word export. |
| `specs/content-languages.spec.js` | Settings → Languages: translate, switch without AI, back to an identical original (both ways back), copies and criterion links follow, ids/ratings untouched, edits and added items, only changed texts re-sent, exports and AI follow the shown content, JSON round trip. |
| `specs/cluster-undo.spec.js` | Competency Clusters Undo / Redo on the toolbar and Ctrl+Z; Range edit as one step; other tabs keep their own history; Create Cluster takes the ticked tasks when left-out tasks are listed last. |
| `specs/nqf-credits.spec.js` | TVQF/NQF option: off by default, fields and chip, Level unchanged, handoff and JSON round trip, off again sends nothing; Suggest credits: both bases add up to the total in half credits, Cancel writes nothing, Apply sets the credits. |
| `specs/verified-chart.spec.js` | Verified DACUM chart: priority band and rank, left-out tasks greyed with reason, filter, read-only; Duties & Tasks button pending until complete yet never locked; Word and PDF sections. |
| `specs/task-selection.spec.js` | Task Selection tab (Select Tasks for Training / Analysis): optional (all selected by default), both suggestion rules, reasons, Task Analysis follows the selection, JSON round trip, Clear This Tab, Arabic; drafted ratings reach the verification table; clusters, AI clustering, trace map and the Word export follow the selection; one-click move out of competencies; "Selected for training" column in the verification report; the Module Builder handoff carries the tasks left out. |
| `specs/task-selection-perf.spec.js` | "Is the task performed?": off by default; few performers set aside, New tasks kept and brought back at once; threshold, figures and JSON round trip; toolbar Undo / Redo of the selection on the Task Selection tab only; Arabic at 360 px. |
| `specs/wording-notes.spec.js` | Wording notes: the rules (verb first, -ing, "The learner will…", cognitive verbs, purpose, is/are, length, repeats), grammar checks off for French content; notes under criteria, competency names and outcomes — nothing blocked; Arabic at 360 px. |
| `specs/worker-behaviours.spec.js` | Task Analysis "Worker Behaviours": after Required Skills, picked from Additional Info (an older record takes its first pick), in EN / FR / AR; saved in the JSON, in the Word export and in the Module Builder handoff. |
| `specs/ai-card-toggle.spec.js` | "✨ AI" button: AI cards open while a tab is empty, folded once it has content; the user's choice per tab survives a reload and a project load; the Helper opens a folded card before highlighting; Arabic, touch, 360 px. |
| `specs/ui-prefs.spec.js` | Settings → Misc: Helper button and AI cards in each mode (Automatic, always shown / open / folded, hidden); fixed-mode clicks last for the session only; the Helper still opens a card when the button is hidden; Reset to automatic (also from Hidden); Arabic at 360 px. |
| `specs/mb-handoff.spec.js` | The Module Builder handoff carries the Task Analysis basic skills and decisions table, the module category, entry skills and resource lists, and the programme requirements and course information; the language of its texts, the decisions table and added sections translated, missing translations named before sending. |
| `specs/help-guides.spec.js` | Help from the DACUM / SCID sources in EN / FR / AR at 360 px: the DACUM team, the occupational standard, task characteristics, competence qualities, criteria and range, learning outcomes, task verification, the one-task competency; the AI clustering prompt carries the same rules and the verified ratings. |
| `specs/export-project-language.spec.js` | A document follows the project's language, not the interface's: an Arabic project exported to PDF from an English interface embeds the Arabic font (and the old output returns without the rule); an English project in an Arabic interface stays English; the screen keeps its own direction. |
| `specs/module-ai-streams.spec.js` | Before the AI builds modules it asks about levels and streams: asked once, Skip keeps things as they are, closing cancels; streams, common code and split levels reach the AI and its stream codes are kept to the programme's own; the Full Draft asks before the run starts. |
| `specs/handoff-tools.spec.js` | The tools listed in Additional Info go with the Module Builder handoff, one item per line without bullets; absent when empty. |
| `specs/status-toast.spec.js` | The status message floats over the page (fixed, inside the viewport at 360 px), a newer message is not cut short by an older timer, and a click dismisses it. |
| `specs/module-tracks.spec.js` | Tracks (specialisations): a track typed on a module brings the programme-view bar; "Alternative to" links one module per track in the same place (one code number, programme per track = common + own); named tracks; unlinking; problems reported; kept in a saved project; slot and track in the Module Builder handoff; both tracks in one Word, PDF and JSON export; Arabic at 360 px. |
| `specs/imported-custom-section.spec.js` | A project file with markup in a custom section's heading or text opens as plain text: nothing runs, no element is created, the text is shown as written. |
| `specs/module-size-note.spec.js` | Module size: no note at 3 or 6 outcomes, a calm note from 7 (count, merge, split) that blocks nothing and goes away when the count falls; the note and the Module Mapping guide section in EN / FR / AR; the note inside its card at 360 px. |

`fixtures/sample-project.json` is a synthetic project (made with the
app's own Full Draft against the stand-in), not real workshop data.

## Running them on a computer (optional)

Needs Node.js 18+ and Python 3:

```
cd tests
npm ci
npx playwright install chromium
npx playwright test
```

## When a test fails on GitHub

Open **Actions → Tests → the failed run**. The log names the test and
the line; the `test-report` download has screenshots and a trace.
A failing test means a change broke something a user would notice —
fix the change, not the test, unless the behaviour was meant to change.
