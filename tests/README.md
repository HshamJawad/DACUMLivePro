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
| `specs/task-selection.spec.js` | Select Tasks for Training / Analysis: optional (all selected by default), both suggestion rules, reasons, Task Analysis follows the selection, JSON round trip, Clear This Tab, Arabic; drafted ratings reach the verification table; clusters, AI clustering, trace map and the Word export follow the selection; one-click move out of competencies; "Selected for training" column in the verification report; the Module Builder handoff carries the tasks left out. |

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
