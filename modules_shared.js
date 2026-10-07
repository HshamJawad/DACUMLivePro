// ============================================================
// /modules_shared.js  (3.76.0 — split out of modules.js, code unchanged)
// Shared helpers of the curriculum tabs: translation and escaping
// helpers, the cluster-task source helpers, the clustering/outcome store
// writer, criteria lookups, and Undo / Redo for Learning Outcomes and
// Module Mapping.
//
// Other files import these through modules.js, which re-exports
// every curriculum file; nothing outside needs to know the split.
// ============================================================

import { appState } from './state.js';
import { showStatus, escapeHtml } from './renderer.js';
import { getTaskCode, getTaskCodeShort, isClusterAddedTaskId, getAddedTaskLabel } from './codes.js';
import { getTaskPerformanceCriteria } from './task_analysis.js';
import { registerHistoryScope, refreshHistoryButtons } from './history.js';
import { _criterionTaskIds, moduleRef, renderModuleLoList } from './module_mapping.js';
import { renumberLearningOutcomes } from './clusters.js';
import { renderLearningOutcomes, renderModules, renderPCSourceList } from './learning_outcomes.js';

/* i18n access — resolved lazily; see duties.js for why. */
export function _t(k) { return window.i18n ? window.i18n.t(k) : k; }   // hoisted: safe across the split files
export function _tf(k, v) { return window.i18n ? window.i18n.tf(k, v) : k; }


// switchTab is exposed on window by app.js to avoid circular deps
export function switchTab(tabId) { window.switchTab(tabId); }

// ── Helpers (getTaskCode now sourced from codes.js) ─────────
// The old local implementation parsed the immutable task ID
// (e.g. "duty_3_2" → "Task C2") which was *wrong* after a drag
// reorder.  The imported version reads the live position from
// appState.dutiesData and always returns the correct letter.

// Canonical short task reference used in every downstream display —
// "TASK B4" regardless of whatever casing/format getTaskCode() itself
// returns (some call sites previously built ids like "C1-TTask B3-PC1"
// by string-concatenating an already-prefixed code; this is the fix).
export function _taskLabel(taskId) {
  // A task added during Competency Clustering has no DACUM code — it is
  // labelled as an added task instead (see codes.js getTaskCode).
  if (isClusterAddedTaskId(taskId)) return getAddedTaskLabel().toUpperCase();
  /* 3.45.0: getTaskCode() is translated ("Tâche A1", "المهمة أ1"), so
     stripping an English "task" prefix and adding "TASK" produced
     "TASK Tâche A1" / "TASK المهمة أ1" in French and Arabic — on screen
     and in what Module Builder receives. English keeps "TASK A1"; the
     other languages use their own translated label. */
  const short = getTaskCodeShort(taskId);
  if (!short) return (getTaskCode(taskId) || '').trim();
  const lang = (window.i18n && window.i18n.getLang) ? window.i18n.getLang() : 'en';
  return lang === 'en' ? `TASK ${short}` : (getTaskCode(taskId) || `TASK ${short}`).trim();
}

/**
 * Modules whose learning outcomes trace back to this task (3.45.0) —
 * shown in the Task Analysis tab, so the analyst knows where an analysis
 * will go. Same tracing as the Module Builder handoff: a Task Analysis
 * criterion to its own task, a competency criterion to every task of its
 * competency.
 * @returns {{id:string, ref:string, title:string}[]}
 */
export function getModulesUsingTask(taskId) {
  const mm = appState.moduleMappingData || {};
  return (mm.modules || []).filter(m =>
    (m.learningOutcomes || []).some(o =>
      (o.linkedCriteria || []).some(pc => _criterionTaskIds(pc).includes(taskId))))
    .map(m => ({ id: m.id, ref: moduleRef(m), title: m.title || '' }));
}

// ── Task Analysis traceability for clusters ─────────────────────
// Performance Criteria entered in Task Analysis for a cluster's
// assigned tasks are surfaced here automatically — never copied INTO
// cluster.performanceCriteria, which remains exactly what it always
// was: free-text criteria the facilitator writes specifically for the
// CLUSTER as a whole, not for one task. This function recomputes the
// combined list fresh on every call, straight from cluster.tasks +
// appState.taskAnalysisData, so:
//   • removing a task from the cluster drops its criteria from this
//     list on the very next render, with no separate cleanup step;
//   • nothing here is ever written back into Task Analysis;
//   • an already-created Learning Outcome is unaffected, because
//     linkedCriteria stores a text snapshot at selection time (see
//     createLearningOutcome/reassignPCToLO below), not a live link.
// IDs are the simple "{clusterNumber}-{position}" scheme used
// throughout the UI (1-1, 1-2, …) — ONE flat sequence per cluster
// covering both Task-Analysis-sourced and manually-typed criteria, in
// that order, so the visible numbering always matches what the merged
// input card in renderClusters() shows. This replaces the old
// fragmented "C1-PC1" / "C1-Ttaskcode-PC1" schemes; see the note in
// renderPCSourceList() about what that means for pre-existing projects.
//
// Each item also carries a `key` that does NOT depend on position:
//   ta|<taskId>|<text>      — criterion from a task's Task Analysis
//   pc|<clusterId>|<text>   — criterion typed for the cluster itself
// The positional id renumbers whenever tasks are added, moved or
// removed; the key does not. Learning Outcomes store the key, which is
// how their links follow a criterion to its new number (see
// _reconcileLearningOutcomes below).
export function _getClusterEffectiveCriteria(cluster, clusterNumber) {
  const items = [];
  cluster.tasks.forEach(task => {
    const taskId = task.id;
    getTaskPerformanceCriteria(taskId).forEach(text => {
      items.push({ text, taskId, source: 'ta', clusterId: cluster.id, key: `ta|${taskId}|${text}` });
    });
  });
  (cluster.performanceCriteria || []).forEach(text => {
    items.push({ text, taskId: null, source: 'manual', clusterId: cluster.id, key: `pc|${cluster.id}|${text}` });
  });
  return items.map((item, i) => ({
    ...item,
    id: `${clusterNumber}-${i + 1}`,
    clusterNumber
  }));
}

// Looks a single effective criterion up by its id across every
// cluster — used wherever a PC checkbox/dropdown only has the id to
// go on (createLearningOutcome, reassignPCToLO).
export function _findEffectiveCriterionById(pcId) {
  const cd = appState.clusteringData;
  for (let i = 0; i < cd.clusters.length; i++) {
    const found = _getClusterEffectiveCriteria(cd.clusters[i], i + 1).find(c => c.id === pcId);
    if (found) return found;
  }
  return null;
}

/* Shared with learning_outcomes_ai.js so the AI generator works on
   exactly the list the user sees: same ids ("5-2"), same task-analysis
   criteria, same "already used" rule. Before this the generator built
   its own "C5-PC2" ids, which matched nothing in the current list. */
export function getLearningOutcomeCriteria() {
  const cd = appState.clusteringData || {};
  const all = [];
  (cd.clusters || []).forEach((cluster, i) => {
    _getClusterEffectiveCriteria(cluster, i + 1).forEach(c => {
      if (!c.text || !String(c.text).trim()) return;
      all.push({ ...c, text: String(c.text).trim(), clusterName: cluster.name || `#${i + 1}` });
    });
  });
  const usedIds = new Set(), usedKeys = new Set();
  ((appState.learningOutcomesData || {}).outcomes || []).forEach(o =>
    (o.linkedCriteria || []).forEach(pc => {
      if (pc.stale) return;
      usedIds.add(pc.id);
      if (pc.key) usedKeys.add(pc.key);
    }));
  return { all, usedIds, usedKeys };
}

/* Persist after an external module (the AI generator) changed outcomes. */
export function persistLearningOutcomes() {
  renumberLearningOutcomes();
  _persistClusters();
}

/* Local-string access for sibling modules (falls back like _tx/_txf). */
export function loText(key, vars) { return vars ? _txf(key, vars) : _tx(key); }

// ══════════════════════════════════════════════════════════════
// TASK CONTROLS INSIDE A COMPETENCY CARD
// ──────────────────────────────────────────────────────────────
// Move Up / Move Down / Delete on each related task, and "+ Add Task"
// at the bottom of the card. An expert refinement layer ONLY:
//
//   • Moving a task reorders cluster.tasks — the array that already
//     holds this competency's tasks and is already saved with the
//     project. Nothing else is touched: task IDs, the DACUM codes
//     (computed live from appState.dutiesData by codes.js), the
//     Occupational Profile, Task Verification and Task Analysis all
//     stay exactly as they were.
//
//   • An added task lives ONLY inside this cluster's task list. It is
//     never written into appState.dutiesData, so the Occupational
//     Profile is never modified. It carries:
//         id      'cctask_…'   — can never collide with a profile ID
//         source  'competency-clustering'
//         sourceLabel 'Added during Competency Clustering'
//     Original tasks carry no source field; absence means "from the
//     Occupational Profile", which keeps every existing project valid
//     without a migration. getClusterTaskSource() reads it either way.
//
//   • The order of cluster.tasks IS the final task order within the
//     competency. Together with the source flag, that is everything
//     Module Builder will need later; no Module Builder code changes.
//
// Event wiring for these controls is self-contained below (same
// pattern as the language-change listener at the end of this file),
// so events.js did not need to change. The one control shared with
// events.js is Delete, which keeps its existing data-action and is
// still dispatched there to removeTaskFromCluster().
// ══════════════════════════════════════════════════════════════

export const CLUSTER_TASK_SOURCE_PROFILE = 'occupational-profile';
export const CLUSTER_TASK_SOURCE_ADDED   = 'competency-clustering';

export function isClusterAddedTask(task) {
  return !!task && (task.source === CLUSTER_TASK_SOURCE_ADDED || isClusterAddedTaskId(task.id));
}

/** 'occupational-profile' | 'competency-clustering' — for Module Builder. */
export function getClusterTaskSource(task) {
  return isClusterAddedTask(task) ? CLUSTER_TASK_SOURCE_ADDED : CLUSTER_TASK_SOURCE_PROFILE;
}

/* New interface strings. Read from translations.js when a key exists
   there; until then these built-in fallbacks are used, so the feature
   works in all three languages without editing the dictionary file. */
const _LOCAL_STRINGS = {
  en: {
    ttMoveTaskUp:             'Move Up',
    ttMoveTaskDown:           'Move Down',
    ttDeleteClusterTask:      'Delete Task',
    btnAddClusterTask:        'Add Task',
    phNewClusterTask:         'Enter the task statement — e.g. Calibrate a digital multimeter to manufacturer specifications',
    lblAddedDuringClustering: 'Added during Competency Clustering',
    msgEnterTaskStatement:    'Enter the task statement first.',
    msgClusterTaskAdded:      'Task added to this competency.',
    confirmDeleteAddedTask:   'Delete this task?\n\nIt was added during Competency Clustering and is not part of the Occupational Profile, so it will be removed permanently.',
    syncTitle:                'Duties & Tasks changed — clustering has been updated',
    syncAdded:                'New tasks added to Available Tasks: {n}',
    syncUpdated:              'Task statements updated to match Duties & Tasks: {n}',
    syncDropped:              'Deleted tasks removed from Available Tasks: {n}',
    syncOrphans:              'Tasks in competencies that no longer exist in Duties & Tasks: {n} — marked ⚠ below for your review',
    lblNewTask:               'New',
    ttNewTask:                'Added in Duties & Tasks after clustering began',
    lblRemovedFromProfile:    'Removed from Occupational Profile',
    ttDismissNotice:          'Dismiss',
    loSyncTitle:              'Competency Clusters changed — Learning Outcomes updated',
    loSyncRenumbered:         'Criteria renumbered to follow the new task order: {n}',
    loSyncRemoved:            'Criteria removed because their task is no longer in any competency: {n}',
    loSyncStale:              'Criteria reworded or deleted in Competency Clusters / Task Analysis: {n} — marked ⚠ for your review',
    lblStaleCriterion:        'Reworded or deleted at the source — review, then keep or remove (✕)',
    critHintWithTA:           'The criteria above come from Task Analysis and are counted automatically. Add here only criteria that describe the integrated performance of the competency — do not repeat them.',
    critHintNoTA:             'Write the criteria here, or per task in Task Analysis — criteria written there appear above this box automatically.',
    critDupNote:              '{n} repeats a Task Analysis criterion ({src}), so it is counted twice. Remove one of them.',
    critRenumberNote:         'The Task Analysis criteria of this competency changed from {from} to {to}, so the criteria typed below are now numbered {first} to {last}. Learning outcomes follow the new numbers automatically.',
    critRenumberDismiss:      'Got it',
    lblModuleLevel:           'Level',
    lblNqfEnable: "Use a qualifications framework (TVQF/NQF)",
    phNqfFramework: "Framework name (optional), e.g. National TVQF",
    lblNqfLevel: "TVQF/NQF level",
    phNqfLevel: "e.g. Level 3",
    lblNqfDescriptor: "TVQF/NQF level descriptor",
    phNqfDescriptor: "Knowledge, skills, responsibility and autonomy as the framework describes this level (optional)",
    hintNqf: "Optional — for countries with a TVQF/NQF. Separate from Level, which is the level inside the programme and builds the module code.",
    lblNqfChip: "TVQF/NQF",
    lblModuleTrack:           'Track / code prefix',
    phModuleTrack:            'Common to all',
    lblModuleCode:            'Code',
    lblModuleShort:           'Short name',
    lblCodeAuto:              'auto',
    ttCodeReset:              'Back to the automatic code',
    msgCodeDuplicate:         'Another module has the same code',
    lblLabelMode:             'Show modules as',
    optLabelCode:             'Code (CMT 1-1)',
    optLabelNumber:           'Number (M1)',
    optLabelBoth:             'Both (M1 · CMT 1-1)',
    optNoLevel:               '— not set —',
    lblLevelN:                'Level {n}',
    lblLevelShort:            'L{n}',
    lblNoLevelGroup:          'Level not set',
    lblLevelSummary:          '{m} module(s) · {lo} learning outcome(s)',
    lblLevelCount:            'Number of levels in the programme',
    covTitle:                 'Performance Criteria Coverage by Level',
    covHint:                  'Every performance criterion from the Competency Clusters, and the module and level where it is taught. A criterion with ✗ is not taught anywhere in the programme.',
    covGapsOnly:              'Show gaps only',
    covTotal:                 '{n} criteria',
    covCoveredN:              'Taught: {n} ({p}%)',
    covGapN:                  'Not taught: {n}',
    covLoOnlyN:               'In an outcome but no module: {n}',
    covMultiN:                'Taught in more than one module: {n}',
    covGap:                   'Not taught',
    covLoOnly:                'Only in {lo} — not in a module',
    covMulti:                 'In {n} modules',
    covColCriterion:          'Performance criterion',
    covColNoLevel:            'No level',
    covColStatus:             'Status',
    covNoGaps:                'No gaps — every criterion is taught in a module.',
    covEmpty:                 'No performance criteria yet — add them in the Competency Clusters tab.',
    covTaught:                'Taught',
    covCommon:                'Common',
    expLevelsTitle:           'Programme Structure by Level',
    expColModule:             'Module',
    expColLOs:                'Learning outcomes',
    expColCriteria:           'Performance criteria',
    expCovHint:               'Every performance criterion from the Competency Clusters, and the module and level where it is taught. A criterion marked “Not taught” appears in no module of the programme.',
    pcSelCount:               '{n} criteria selected',
    pcSelCreateOne:           'Create LO',
    pcSelCreateMerge:         'Create 1 LO from {n} criteria',
    pcSelClear:               'Clear',
    pcHideUsed:               'Hide used criteria',
    pcUnusedCount:            '{u} of {t} not yet used',
    pcLoCreated:              '{n} created',
    loNeedStatement:          'Statement needed',
    loSummaryMissing:         '{n} of {t} learning outcomes still need a statement',
    loSummaryDone:            'All {t} learning outcomes have a statement',
    loNextEmpty:              'Next empty',
    loUsePC:                  'Use criterion text',
    loInlinePh:               'Type the learning outcome statement here — saved automatically',
    loInlineHint:             'Type directly in each card. Changes save automatically; Enter moves to the next outcome.',
    loKeyNext:                'next outcome',
    loKeyNewLine:             'new line',
    loKeyHintFine:            'Press Enter: next outcome · Press Shift+Enter: new line',
    loKeyHintCoarse:          'Press Enter: next outcome',
    loKeySaved:               'saved automatically',
    loAiSkipped:              '{n} criteria left unlinked — still available in the list',
    loAiNot1to1:              'the one-to-one mapping was not exact — review the linked criteria',
    loAiNoIntegration:        'no criteria were integrated — this result is effectively Pattern A',
    loAiAllIntegrated:        'every outcome integrates several criteria — closer to Pattern B',
    loAiCrossComp:            '{n} outcome(s) combine criteria from different competencies — please review',
    mmOptKeep:                'Keep existing modules — only group outcomes not yet in a module',
    mmOptLevels:              'Suggest a level for each module — levels in the programme:',
    mmOptSingle:              '(single-level programme — no level to suggest)',
    covShow:                  'Show',
    covHide:                  'Hide',
    undoBtn:                  'Undo',
    redoBtn:                  'Redo',
    undoLast:                 'Last: {a}',
    undoDone:                 'Undone: {a}',
    redoDone:                 'Redone: {a}',
    undoDeleteModule:         'Deleted module {m} “{name}”',
    undoDeleteLO:             'Deleted {lo}',
    undoRemoveLO:             'Removed {lo} from {m}',
    undoUnlinkPC:             'Unlinked {pc} from {lo}',
    undoLaterChanges:         'Other changes were made after this step. Undoing it will also reverse those later changes. Continue?',
    mmHintNew:                '⚡ Instant and offline — one module per outcome. 🤖 Groups related outcomes, names and orders the modules, and can suggest a level for each. With “Keep existing modules” ticked, only outcomes not yet in a module are used; otherwise existing modules are replaced. Your Learning Outcomes are never changed.',
    mmNothingNew:             'Every learning outcome is already in a module.',
    mmAiOrphans:              '{n} outcome(s) placed in a review module',
    mmAiTrimmed:              '{n} oversized module(s) trimmed',
    mmAiLevelsNote:           'levels and specialisations are suggestions — review them on each module',
    mmAiReviewTitle:          'Additional Outcomes',
    mmAiReviewWhy:            'Outcomes not placed by the grouping — review and reassign as needed.'
  },
  fr: {
    ttMoveTaskUp:             'Monter',
    ttMoveTaskDown:           'Descendre',
    ttDeleteClusterTask:      'Supprimer la tâche',
    btnAddClusterTask:        'Ajouter une tâche',
    phNewClusterTask:         'Saisissez l’énoncé de la tâche — ex. Étalonner un multimètre numérique selon les spécifications du fabricant',
    lblAddedDuringClustering: 'Ajoutée lors du regroupement des compétences',
    msgEnterTaskStatement:    'Saisissez d’abord l’énoncé de la tâche.',
    msgClusterTaskAdded:      'Tâche ajoutée à cette compétence.',
    confirmDeleteAddedTask:   'Supprimer cette tâche ?\n\nElle a été ajoutée lors du regroupement des compétences et ne fait pas partie du profil professionnel : elle sera supprimée définitivement.',
    syncTitle:                'Les tâches et activités ont changé — le regroupement a été mis à jour',
    syncAdded:                'Nouvelles tâches ajoutées aux tâches disponibles : {n}',
    syncUpdated:              'Énoncés de tâches mis à jour selon les tâches et activités : {n}',
    syncDropped:              'Tâches supprimées retirées des tâches disponibles : {n}',
    syncOrphans:              'Tâches des compétences qui n’existent plus dans les tâches et activités : {n} — signalées ⚠ ci-dessous pour vérification',
    lblNewTask:               'Nouveau',
    ttNewTask:                'Ajoutée dans les tâches et activités après le début du regroupement',
    lblRemovedFromProfile:    'Retirée du profil professionnel',
    ttDismissNotice:          'Fermer',
    loSyncTitle:              'Les groupes de compétences ont changé — résultats d’apprentissage mis à jour',
    loSyncRenumbered:         'Critères renumérotés selon le nouvel ordre des tâches : {n}',
    loSyncRemoved:            'Critères retirés car leur tâche n’est plus dans aucune compétence : {n}',
    loSyncStale:              'Critères reformulés ou supprimés dans les groupes / l’analyse des tâches : {n} — signalés ⚠ pour vérification',
    lblStaleCriterion:        'Reformulé ou supprimé à la source — vérifiez, puis conservez ou retirez (✕)',
    critHintWithTA:           'Les critères ci-dessus viennent de l’analyse des tâches et sont pris en compte automatiquement. N’ajoutez ici que des critères décrivant la performance intégrée de la compétence — sans les répéter.',
    critHintNoTA:             'Rédigez les critères ici, ou par tâche dans l’analyse des tâches — les critères rédigés là-bas apparaissent automatiquement au-dessus de cette zone.',
    critDupNote:              '{n} reprend un critère de l’analyse des tâches ({src}) : il est compté deux fois. Supprimez l’un des deux.',
    critRenumberNote:         'Les critères de l’analyse des tâches de cette compétence sont passés de {from} à {to} : les critères saisis ci-dessous sont désormais numérotés de {first} à {last}. Les résultats d’apprentissage suivent automatiquement la nouvelle numérotation.',
    critRenumberDismiss:      'Compris',
    lblModuleLevel:           'Niveau',
    lblNqfEnable: "Utiliser un cadre de certification (TVQF/NQF)",
    phNqfFramework: "Nom du cadre (facultatif), ex. CNC national",
    lblNqfLevel: "Niveau TVQF/NQF",
    phNqfLevel: "ex. Niveau 3",
    lblNqfDescriptor: "Descripteurs du niveau TVQF/NQF",
    phNqfDescriptor: "Savoirs, aptitudes, responsabilité et autonomie tels que le cadre décrit ce niveau (facultatif)",
    hintNqf: "Facultatif — pour les pays dotés d’un TVQF/NQF. Distinct du Niveau, qui est le niveau dans le programme et forme le code du module.",
    lblNqfChip: "TVQF/NQF",
    lblModuleTrack:           'Filière / préfixe du code',
    phModuleTrack:            'Commun à tous',
    lblModuleCode:            'Code',
    lblModuleShort:           'Nom court',
    lblCodeAuto:              'auto',
    ttCodeReset:              'Revenir au code automatique',
    msgCodeDuplicate:         'Un autre module a le même code',
    lblLabelMode:             'Afficher les modules par',
    optLabelCode:             'Code (CMT 1-1)',
    optLabelNumber:           'Numéro (M1)',
    optLabelBoth:             'Les deux (M1 · CMT 1-1)',
    optNoLevel:               '— non défini —',
    lblLevelN:                'Niveau {n}',
    lblLevelShort:            'N{n}',
    lblNoLevelGroup:          'Niveau non défini',
    lblLevelSummary:          '{m} module(s) · {lo} résultat(s) d’apprentissage',
    lblLevelCount:            'Nombre de niveaux du programme',
    covTitle:                 'Couverture des critères de performance par niveau',
    covHint:                  'Chaque critère de performance des groupes de compétences, avec le module et le niveau où il est enseigné. Un critère marqué ✗ n’est enseigné nulle part dans le programme.',
    covGapsOnly:              'Afficher uniquement les lacunes',
    covTotal:                 '{n} critères',
    covCoveredN:              'Enseignés : {n} ({p} %)',
    covGapN:                  'Non enseignés : {n}',
    covLoOnlyN:               'Dans un résultat mais sans module : {n}',
    covMultiN:                'Enseignés dans plusieurs modules : {n}',
    covGap:                   'Non enseigné',
    covLoOnly:                'Seulement dans {lo} — sans module',
    covMulti:                 'Dans {n} modules',
    covColCriterion:          'Critère de performance',
    covColNoLevel:            'Sans niveau',
    covColStatus:             'État',
    covNoGaps:                'Aucune lacune — chaque critère est enseigné dans un module.',
    covEmpty:                 'Aucun critère de performance — ajoutez-les dans l’onglet Groupes de compétences.',
    covTaught:                'Enseigné',
    covCommon:                'Commun',
    expLevelsTitle:           'Structure du programme par niveau',
    expColModule:             'Module',
    expColLOs:                'Résultats d’apprentissage',
    expColCriteria:           'Critères de performance',
    expCovHint:               'Chaque critère de performance des groupes de compétences, avec le module et le niveau où il est enseigné. Un critère « Non enseigné » ne figure dans aucun module du programme.',
    pcSelCount:               '{n} critère(s) sélectionné(s)',
    pcSelCreateOne:           'Créer un RA',
    pcSelCreateMerge:         'Créer 1 RA à partir de {n} critères',
    pcSelClear:               'Effacer',
    pcHideUsed:               'Masquer les critères utilisés',
    pcUnusedCount:            '{u} sur {t} pas encore utilisés',
    pcLoCreated:              '{n} créé',
    loNeedStatement:          'Énoncé à saisir',
    loSummaryMissing:         '{n} sur {t} résultats d’apprentissage sans énoncé',
    loSummaryDone:            'Les {t} résultats d’apprentissage ont un énoncé',
    loNextEmpty:              'Suivant vide',
    loUsePC:                  'Reprendre le texte du critère',
    loInlinePh:               'Saisissez l’énoncé du résultat d’apprentissage ici — enregistré automatiquement',
    loInlineHint:             'Saisissez directement dans chaque carte. L’enregistrement est automatique ; Entrée passe au résultat suivant.',
    loKeyNext:                'résultat suivant',
    loKeyNewLine:             'nouvelle ligne',
    loKeyHintFine:            'Appuyez sur Entrée : résultat suivant · Appuyez sur Maj+Entrée : nouvelle ligne',
    loKeyHintCoarse:          'Appuyez sur Entrée : résultat suivant',
    loKeySaved:               'enregistrement automatique',
    loAiSkipped:              '{n} critère(s) non lié(s) — toujours disponibles dans la liste',
    loAiNot1to1:              'la correspondance un-à-un n’est pas exacte — vérifiez les critères liés',
    loAiNoIntegration:        'aucun critère intégré — ce résultat équivaut au modèle A',
    loAiAllIntegrated:        'chaque résultat intègre plusieurs critères — plus proche du modèle B',
    loAiCrossComp:            '{n} résultat(s) combinent des critères de compétences différentes — à vérifier',
    mmOptKeep:                'Conserver les modules existants — regrouper seulement les résultats sans module',
    mmOptLevels:              'Proposer un niveau pour chaque module — niveaux du programme :',
    mmOptSingle:              '(programme à un seul niveau — aucun niveau à proposer)',
    covShow:                  'Afficher',
    covHide:                  'Masquer',
    undoBtn:                  'Annuler',
    redoBtn:                  'Rétablir',
    undoLast:                 'Dernier : {a}',
    undoDone:                 'Annulé : {a}',
    redoDone:                 'Rétabli : {a}',
    undoDeleteModule:         'Module {m} « {name} » supprimé',
    undoDeleteLO:             '{lo} supprimé',
    undoRemoveLO:             '{lo} retiré de {m}',
    undoUnlinkPC:             '{pc} délié de {lo}',
    undoLaterChanges:         'D’autres modifications ont été faites après cette étape. L’annuler annulera aussi ces modifications. Continuer ?',
    mmHintNew:                '⚡ Instantané et hors ligne — un module par résultat. 🤖 Regroupe les résultats liés, nomme et ordonne les modules, et peut proposer un niveau pour chacun. Avec « Conserver les modules existants » coché, seuls les résultats sans module sont utilisés ; sinon les modules existants sont remplacés. Vos résultats d’apprentissage ne sont jamais modifiés.',
    mmNothingNew:             'Tous les résultats d’apprentissage sont déjà dans un module.',
    mmAiOrphans:              '{n} résultat(s) placé(s) dans un module à revoir',
    mmAiTrimmed:              '{n} module(s) trop volumineux réduit(s)',
    mmAiLevelsNote:           'les niveaux et spécialisations sont des propositions — vérifiez-les sur chaque module',
    mmAiReviewTitle:          'Résultats supplémentaires',
    mmAiReviewWhy:            'Résultats non placés par le regroupement — à vérifier et réaffecter.'
  },
  ar: {
    ttMoveTaskUp:             'نقل لأعلى',
    ttMoveTaskDown:           'نقل لأسفل',
    ttDeleteClusterTask:      'حذف المهمة',
    btnAddClusterTask:        'إضافة مهمة',
    phNewClusterTask:         'اكتب عبارة المهمة — مثال: معايرة مقياس متعدد رقمي وفق مواصفات الصانع',
    lblAddedDuringClustering: 'أُضيفت أثناء تجميع الكفاءات',
    msgEnterTaskStatement:    'اكتب عبارة المهمة أولاً.',
    msgClusterTaskAdded:      'تمت إضافة المهمة إلى هذه الكفاءة.',
    confirmDeleteAddedTask:   'حذف هذه المهمة؟\n\nأُضيفت أثناء تجميع الكفاءات وليست جزءاً من الملف المهني، لذا ستُحذف نهائياً.',
    syncTitle:                'تغيّرت الواجبات والمهام — جرى تحديث تجميع الكفاءات',
    syncAdded:                'مهام جديدة أُضيفت إلى المهام المتاحة: {n}',
    syncUpdated:              'عبارات مهام حُدّثت لتطابق الواجبات والمهام: {n}',
    syncDropped:              'مهام محذوفة أُزيلت من المهام المتاحة: {n}',
    syncOrphans:              'مهام داخل الكفاءات لم تعد موجودة في الواجبات والمهام: {n} — موسومة بـ ⚠ أدناه لمراجعتها',
    lblNewTask:               'جديدة',
    ttNewTask:                'أُضيفت في الواجبات والمهام بعد بدء التجميع',
    lblRemovedFromProfile:    'حُذفت من الملف المهني',
    ttDismissNotice:          'إغلاق',
    loSyncTitle:              'تغيّرت تجمعات الكفاءات — جرى تحديث محصلات التعلم',
    loSyncRenumbered:         'معايير أُعيد ترقيمها وفق الترتيب الجديد للمهام: {n}',
    loSyncRemoved:            'معايير أُزيلت لأن مهمتها لم تعد في أي كفاءة: {n}',
    loSyncStale:              'معايير عُدّلت صياغتها أو حُذفت في تجمعات الكفاءات / تحليل المهمة: {n} — موسومة بـ ⚠ لمراجعتها',
    lblStaleCriterion:        'عُدّلت أو حُذفت في المصدر — راجعها ثم أبقِها أو أزلها (✕)',
    critHintWithTA:           'المعايير أعلاه من تحليل المهمة وتُحتسب تلقائياً. أضف هنا فقط المعايير التي تصف الأداء المتكامل للكفاءة، ولا تكررها.',
    critHintNoTA:             'اكتب المعايير هنا، أو اكتبها لكل مهمة في تحليل المهام؛ والمعايير المكتوبة هناك تظهر تلقائياً فوق هذا المربع.',
    critDupNote:              'المعيار {n} يكرر معياراً من تحليل المهمة ({src})، فيُحتسب مرتين. احذف أحدهما.',
    critRenumberNote:         'تغيّر عدد معايير تحليل المهمة لهذه الكفاءة من {from} إلى {to}، فأصبح ترقيم المعايير المكتوبة أدناه من {first} إلى {last}. والمحصلات تتبع الترقيم الجديد تلقائياً.',
    critRenumberDismiss:      'حسناً',
    lblModuleLevel:           'المستوى',
    lblNqfEnable: "استخدام إطار للمؤهلات (TVQF/NQF)",
    phNqfFramework: "اسم الإطار (اختياري)، مثل: الإطار الوطني TVQF",
    lblNqfLevel: "مستوى TVQF/NQF",
    phNqfLevel: "مثل: المستوى 3",
    lblNqfDescriptor: "واصفات مستوى TVQF/NQF",
    phNqfDescriptor: "المعارف والمهارات والمسؤولية والاستقلالية كما يصفها الإطار لهذا المستوى (اختياري)",
    hintNqf: "اختياري — للدول التي لديها إطار TVQF/NQF. منفصل عن «المستوى» الذي يمثل المستوى داخل البرنامج ويُبنى منه رمز الوحدة.",
    lblNqfChip: "TVQF/NQF",
    lblModuleTrack:           'المسار / بادئة الرمز',
    phModuleTrack:            'مشتركة للجميع',
    lblModuleCode:            'الرمز',
    lblModuleShort:           'اسم مختصر',
    lblCodeAuto:              'تلقائي',
    ttCodeReset:              'العودة إلى الرمز التلقائي',
    msgCodeDuplicate:         'يوجد وحدة أخرى بالرمز نفسه',
    lblLabelMode:             'عرض الوحدات بـ',
    optLabelCode:             'الرمز (CMT 1-1)',
    optLabelNumber:           'الرقم (M1)',
    optLabelBoth:             'كلاهما (M1 · CMT 1-1)',
    optNoLevel:               '— غير محدد —',
    lblLevelN:                'المستوى {n}',
    lblLevelShort:            'م{n}',
    lblNoLevelGroup:          'مستوى غير محدد',
    lblLevelSummary:          '{m} وحدة · {lo} محصلة تعلم',
    lblLevelCount:            'عدد مستويات البرنامج',
    covTitle:                 'تغطية معايير الأداء حسب المستوى',
    covHint:                  'كل معيار أداء من تجمعات الكفاءات، والوحدة والمستوى اللذان يُدرَّس فيهما. المعيار الموسوم بـ ✗ لا يُدرَّس في أي مكان من البرنامج.',
    covGapsOnly:              'عرض الفجوات فقط',
    covTotal:                 '{n} معياراً',
    covCoveredN:              'مُدرَّسة: {n} ({p}%)',
    covGapN:                  'غير مُدرَّسة: {n}',
    covLoOnlyN:               'في محصلة تعلم دون وحدة: {n}',
    covMultiN:                'مُدرَّسة في أكثر من وحدة: {n}',
    covGap:                   'غير مُدرَّس',
    covLoOnly:                'في {lo} فقط — دون وحدة',
    covMulti:                 'في {n} وحدات',
    covColCriterion:          'معيار الأداء',
    covColNoLevel:            'دون مستوى',
    covColStatus:             'الحالة',
    covNoGaps:                'لا توجد فجوات — كل معيار مُدرَّس في وحدة.',
    covEmpty:                 'لا توجد معايير أداء بعد — أضفها في تبويب تجمعات الكفاءات.',
    covTaught:                'مُدرَّس',
    covCommon:                'مشتركة',
    expLevelsTitle:           'هيكل البرنامج حسب المستوى',
    expColModule:             'الوحدة',
    expColLOs:                'محصلات التعلم',
    expColCriteria:           'معايير الأداء',
    expCovHint:               'كل معيار أداء من تجمعات الكفاءات، والوحدة والمستوى اللذان يُدرَّس فيهما. المعيار الموسوم «غير مُدرَّس» لا يرد في أي وحدة من البرنامج.',
    pcSelCount:               'تم اختيار {n} من المعايير',
    pcSelCreateOne:           'إنشاء محصلة تعلم',
    pcSelCreateMerge:         'إنشاء محصلة واحدة من {n} معايير',
    pcSelClear:               'إلغاء الاختيار',
    pcHideUsed:               'إخفاء المعايير المستخدمة',
    pcUnusedCount:            '{u} من {t} غير مستخدمة بعد',
    pcLoCreated:              'تم إنشاء {n}',
    loNeedStatement:          'يحتاج إلى نص',
    loSummaryMissing:         '{n} من {t} محصلات تعلم ما زالت بلا نص',
    loSummaryDone:            'كل محصلات التعلم ({t}) لها نص',
    loNextEmpty:              'التالية الفارغة',
    loUsePC:                  'استخدام نص المعيار',
    loInlinePh:               'اكتب نص محصلة التعلم هنا — يُحفظ تلقائياً',
    loInlineHint:             'اكتب مباشرة في كل بطاقة. الحفظ تلقائي، وزر Enter ينقلك إلى المحصلة التالية.',
    loKeyNext:                'المحصلة التالية',
    loKeyNewLine:             'سطر جديد',
    loKeyHintFine:            'اضغط Enter: المحصلة التالية · اضغط Shift+Enter: سطر جديد',
    loKeyHintCoarse:          'اضغط Enter: المحصلة التالية',
    loKeySaved:               'حفظ تلقائي',
    loAiSkipped:              '{n} من المعايير بقيت دون ربط — ما زالت متاحة في القائمة',
    loAiNot1to1:              'التطابق واحد لواحد لم يكن تاماً — راجع المعايير المرتبطة',
    loAiNoIntegration:        'لم يُدمج أي معيار — النتيجة فعلياً هي النمط A',
    loAiAllIntegrated:        'كل المحصلات دمجت عدة معايير — النتيجة أقرب إلى النمط B',
    loAiCrossComp:            '{n} محصلة دمجت معايير من كفاءات مختلفة — يرجى مراجعتها',
    mmOptKeep:                'الإبقاء على الوحدات الحالية — تجميع المحصلات غير المُسندة فقط',
    mmOptLevels:              'اقتراح مستوى لكل وحدة — عدد مستويات البرنامج:',
    mmOptSingle:              '(برنامج بمستوى واحد — لا يوجد مستوى لاقتراحه)',
    covShow:                  'إظهار',
    covHide:                  'إخفاء',
    undoBtn:                  'تراجع',
    redoBtn:                  'إعادة',
    undoLast:                 'آخر إجراء: {a}',
    undoDone:                 'تم التراجع: {a}',
    redoDone:                 'تمت الإعادة: {a}',
    undoDeleteModule:         'حُذفت الوحدة {m} «{name}»',
    undoDeleteLO:             'حُذفت {lo}',
    undoRemoveLO:             'أُزيلت {lo} من {m}',
    undoUnlinkPC:             'فُصل المعيار {pc} عن {lo}',
    undoLaterChanges:         'أُجريت تغييرات أخرى بعد هذه الخطوة، والتراجع عنها سيلغي تلك التغييرات أيضاً. هل تريد المتابعة؟',
    mmHintNew:                '⚡ فوري وبلا إنترنت — وحدة لكل محصلة. 🤖 يجمع المحصلات المترابطة ويسمّي الوحدات ويرتّبها، ويمكنه اقتراح مستوى لكل وحدة. عند تفعيل «الإبقاء على الوحدات الحالية» تُستخدم المحصلات غير المُسندة فقط، وإلا تُستبدل الوحدات الحالية. محصلات التعلم نفسها لا تتغير أبداً.',
    mmNothingNew:             'كل محصلات التعلم موجودة في وحدات.',
    mmAiOrphans:              '{n} محصلة وُضعت في وحدة للمراجعة',
    mmAiTrimmed:              'تم تقليص {n} وحدة كبيرة الحجم',
    mmAiLevelsNote:           'المستويات والتخصصات مقترحة — راجعها في كل وحدة',
    mmAiReviewTitle:          'محصلات إضافية',
    mmAiReviewWhy:            'محصلات لم يضعها التجميع في وحدة — راجعها وأعد إسنادها.'
  }
};

export function _tx(key) {
  const I = window.i18n;
  if (I && I.has && I.has(key)) return I.t(key);
  const lang = (I && I.getLang) ? I.getLang() : 'en';
  return (_LOCAL_STRINGS[lang] && _LOCAL_STRINGS[lang][key]) || _LOCAL_STRINGS.en[key] || key;
}

export function _esc(s) {
  return typeof escapeHtml === 'function'
    ? escapeHtml(String(s == null ? '' : s))
    : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Saves through the existing project mechanism (saveCurrentProject →
// _captureState, which already serialises appState.clusteringData).
// Imported lazily: dacum_projects.js depends on this module's render
// functions, so a static import here would create a cycle.
export function _persistClusters() {
  import('./dacum_projects.js')
    .then(m => { try { m.saveCurrentProject(); } catch (e) { console.warn('[clusters] save failed:', e); } })
    .catch(() => { /* project system unavailable — the exit handler will still save */ });
}

export function _txf(key, vars) {
  let s = _tx(key);
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}

/* ── Undo / Redo for Learning Outcomes and Module Mapping ───────────
   The toolbar Undo/Redo belongs to the Duties & Tasks history
   (history.js) and does not cover these two tabs. This is a separate,
   self-contained history for the destructive actions here: delete a
   module, delete a learning outcome, remove an outcome from a module,
   unlink a criterion from an outcome. Each step stores the two data
   blocks before and after (JSON), so an undone module returns to its
   place with its level, track and outcomes.

   Safety rules:
   • The history is dropped when the project changes, or when the data
     is replaced from elsewhere (project load, Clear This Tab, import),
     so an undo can never write one project's data into another.
   • If something else changed after the step (e.g. AI generation or
     typing a statement), undo asks first, because going back also
     reverses those later changes. */
const _UNDO_MAX = 30;
const _hist = { undo: [], redo: [], project: null, loRef: null, mmRef: null };

function _activeProjectId() {
  try { return localStorage.getItem('dacum_active_project'); } catch (_) { return null; }
}
export function _undoSnap() {
  return JSON.stringify({ lo: appState.learningOutcomesData, mm: appState.moduleMappingData });
}
function _undoValid() {
  if (_hist.project !== _activeProjectId() ||
      _hist.loRef !== appState.learningOutcomesData ||
      _hist.mmRef !== appState.moduleMappingData) {
    _hist.undo = []; _hist.redo = [];
    _hist.project = _activeProjectId();
    _hist.loRef = appState.learningOutcomesData;
    _hist.mmRef = appState.moduleMappingData;
    return false;
  }
  return true;
}
/* Called by the Full Draft run after it rebuilds outcomes or modules.
   The data is replaced in place (same objects), so the reference check
   in _undoValid() would not notice — and undoing a pre-draft step would
   silently rewind the whole draft. Same rule as a project load. */
export function dropLearningHistory() {
  _hist.undo = []; _hist.redo = [];
  _hist.project = _activeProjectId();
  _hist.loRef = appState.learningOutcomesData;
  _hist.mmRef = appState.moduleMappingData;
  try { _hideUndoToast(); } catch (_) {}
  try { _renderUndoBars(); } catch (_) {}
}

export function _undoRecord(label, before) {
  _undoValid();
  _hist.undo.push({ label, before, after: _undoSnap() });
  if (_hist.undo.length > _UNDO_MAX) _hist.undo.shift();
  _hist.redo = [];
  _renderUndoBars();
  _showUndoToast(label);
}
function _undoApply(json) {
  const d = JSON.parse(json);
  appState.learningOutcomesData = d.lo;
  appState.moduleMappingData = d.mm;
  _hist.loRef = appState.learningOutcomesData;
  _hist.mmRef = appState.moduleMappingData;
  _persistClusters();
  renderPCSourceList(); renderLearningOutcomes();
  renderModuleLoList(); renderModules();
}
export function undoLearningStep() {
  if (!_undoValid() || !_hist.undo.length) { _renderUndoBars(); return false; }
  const step = _hist.undo[_hist.undo.length - 1];
  if (_undoSnap() !== step.after && !confirm(_tx('undoLaterChanges'))) return false;
  _hist.undo.pop();
  _hist.redo.push({ ...step, after: _undoSnap() });
  _undoApply(step.before);
  _hideUndoToast();
  _renderUndoBars();
  showStatus('↶ ' + _txf('undoDone', { a: step.label }), 'success');
  return true;
}
export function redoLearningStep() {
  if (!_undoValid() || !_hist.redo.length) { _renderUndoBars(); return false; }
  const step = _hist.redo.pop();
  _hist.undo.push({ label: step.label, before: _undoSnap(), after: step.after });
  _undoApply(step.after);
  _renderUndoBars();
  showStatus('↷ ' + _txf('redoDone', { a: step.label }), 'success');
  return true;
}

function _injectUndoStyles() {
  if (document.getElementById('lommUndoStyles')) return;
  const st = document.createElement('style');
  st.id = 'lommUndoStyles';
  st.textContent = `
    .lomm-undo-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 14px; }
    .lomm-undo-bar button {
      display: inline-flex; align-items: center; gap: 6px; min-height: 34px;
      padding: 6px 14px !important; border-radius: 8px; font-size: .88em; font-weight: 600;
      background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; cursor: pointer;
    }
    .lomm-undo-bar button:hover:not(:disabled) { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }
    .lomm-undo-bar button:disabled { opacity: .45; cursor: not-allowed; }
    .lomm-undo-bar .lomm-undo-last { font-size: .82em; color: #64748b; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    #lommUndoToast {
      position: fixed; z-index: 100001; left: 50%; bottom: 20px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 14px; max-width: calc(100vw - 32px);
      background: #1e293b; color: #fff; padding: 10px 12px 10px 16px; border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.3); font-size: .92em;
      padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    }
    #lommUndoToast[hidden] { display: none; }
    #lommUndoToast .lomm-toast-msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #lommUndoToast button {
      flex-shrink: 0; background: #fbbf24 !important; color: #1e293b !important; border: none;
      border-radius: 7px; padding: 6px 14px !important; font-weight: 800; cursor: pointer; min-height: 0;
    }
  `;
  document.head.appendChild(st);
}

/* The toolbar Undo / Redo buttons are lent to this history while the
   Learning Outcomes or Module Mapping tab is on screen (history.js
   registerHistoryScope). Registered lazily, on first render, so module
   load order can never matter. */
let _scopeRegistered = false;
function _lommTabActive() {
  return ['learning-outcomes-tab', 'module-mapping-tab']
    .some(id => document.getElementById(id)?.classList.contains('active'));
}
export function _renderUndoBars() {
  _injectUndoStyles();
  if (!_scopeRegistered) {
    _scopeRegistered = true;
    try {
      registerHistoryScope({
        isActive:  _lommTabActive,
        canUndo:   () => { _undoValid(); return _hist.undo.length > 0; },
        canRedo:   () => { _undoValid(); return _hist.redo.length > 0; },
        undoLabel: () => (_hist.undo[_hist.undo.length - 1] || {}).label || '',
        redoLabel: () => (_hist.redo[_hist.redo.length - 1] || {}).label || '',
        undo:      () => undoLearningStep(),
        redo:      () => redoLearningStep(),
      });
    } catch (e) { console.warn('[modules] undo scope not registered:', e); }
  }
  // Older builds drew an Undo/Redo bar inside the two tabs; the toolbar
  // buttons do that job now.
  document.querySelectorAll('.lomm-undo-bar').forEach(b => b.remove());
  try { refreshHistoryButtons(); } catch (_) {}
}

let _toastTimer = null;
function _showUndoToast(label) {
  _injectUndoStyles();
  let t = document.getElementById('lommUndoToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'lommUndoToast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    t.addEventListener('click', e => { if (e.target.closest('button')) undoLearningStep(); });
  }
  t.innerHTML = `<span class="lomm-toast-msg">${_esc(label)}</span><button type="button">↶ ${_esc(_tx('undoBtn'))}</button>`;
  t.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(_hideUndoToast, 7000);
}
function _hideUndoToast() {
  clearTimeout(_toastTimer);
  const t = document.getElementById('lommUndoToast');
  if (t) t.hidden = true;
}

/* Module cards — lighter violet look (scoped to the modules list). */
export function _injectModuleCardStyles() {
  if (document.getElementById('moduleCardStyles')) return;
  const st = document.createElement('style');
  st.id = 'moduleCardStyles';
  st.textContent = `
    #modulesContainer .module-item {
      background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
      border: 2px solid #c4b5fd; border-radius: 14px; padding: 18px;
      box-shadow: 0 2px 10px rgba(124,58,237,.06);
    }
    #modulesContainer .module-header {
      border-bottom: none; padding-bottom: 0; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;
    }
    #modulesContainer .module-title { color: #6d28d9; font-weight: 700; font-size: 1.15em; }
    #modulesContainer .module-actions { flex-wrap: wrap; gap: 8px; }
    #modulesContainer .btn-rename-module { background: #8b5cf6; padding: 7px 14px; font-size: .88em; }
    #modulesContainer .btn-delete-module { background: #ef4444; padding: 7px 14px; font-size: .88em; }
    #modulesContainer .module-lo-assigned {
      background: #fff; border: 1px solid #ede9fe; border-radius: 8px; align-items: center; gap: 10px;
    }
    #modulesContainer .module-lo-assigned-number { color: #6d28d9; }
    #modulesContainer .btn-remove-lo {
      background: #fee2e2; color: #991b1b; border-radius: 8px; padding: 6px 12px; flex-shrink: 0;
    }
    #modulesContainer .btn-remove-lo:hover { background: #fecaca; }
    #modulesContainer .mod-level-select, #modulesContainer .mod-track-input { border-color: #ddd6fe; }
    /* Label and field on ONE line. The app's base style gives every text
       input width:100%, which pushed "Specialisation" above its field. */
    #modulesContainer .mod-meta-field { flex-wrap: nowrap; }
    #modulesContainer .mod-meta-field > span { white-space: nowrap; flex-shrink: 0; }
    #modulesContainer .mod-meta-field .mod-track-input {
      width: 110px !important; max-width: 100%; min-width: 0; flex: 0 1 110px;
      display: inline-block !important; margin: 0 !important;
    }
    #modulesContainer .mod-meta-field .mod-code-input, #modulesContainer .mod-meta-field .mod-short-input {
      width: 110px !important; max-width: 100%; min-width: 0; flex: 0 1 110px;
      display: inline-block !important; margin: 0 !important; border-color: #ddd6fe;
    }
    /* 3.34.1: level, track, code and short name on ONE line on desktop. */
    #modulesContainer .mod-meta-row { gap: 8px 14px; }
    #modulesContainer .mod-meta-field { gap: 6px; }
    #modulesContainer .mod-meta-field input, #modulesContainer .mod-meta-field select { padding: 6px 8px; }
    #modulesContainer .mod-level-select { width: auto !important; max-width: 120px; }
    #modulesContainer .mod-code-input { font-weight: 700; color: #4338ca; }
    #modulesContainer .mod-auto-chip { font-style: normal; font-size: .78em; font-weight: 700; padding: 1px 7px;
      border-radius: 999px; background: #e0e7ff; color: #3730a3; margin-inline-start: 4px; }
    #modulesContainer .mod-code-reset {
      box-sizing: border-box; flex: 0 0 auto; width: 30px; height: 30px; min-width: 30px; max-width: 30px;
      min-height: 30px; max-height: 30px; padding: 0 !important; margin: 0; border-radius: 8px;
      border: 1px solid #ddd6fe; background: #fff; color: #6d28d9; cursor: pointer; font-size: 15px; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center;
    }
    #modulesContainer .mod-ref { color: #4338ca; }
    #modulesContainer .mod-code-dup { margin: -6px 0 10px; font-size: .85em; font-weight: 600; color: #b45309; }
    @media (max-width: 600px) {
      #modulesContainer .mod-meta-field .mod-track-input,
      #modulesContainer .mod-meta-field .mod-code-input,
      #modulesContainer .mod-meta-field .mod-short-input { width: auto !important; flex: 1 1 auto; }
    }
  `;
  document.head.appendChild(st);
}
