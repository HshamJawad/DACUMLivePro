// ============================================================
// /module_curriculum.js
// "Module Curriculum CUR/CBC" tab (after Module Mapping) and the
// "Standard" toolbar export menu.
//
// Data lives in appState.moduleCurriculumData (see state.js for the
// default and the normaliser):
//
//   settings: { programmeName, hoursPerCredit, groupSize, split{…} }
//   byModule: { [moduleId]: { code, shortName, purpose, credits,
//               prerequisites[], splitOverride|null, tools[], equipment[],
//               ppe[], materials[], resources[], facilities[{item,qty}],
//               byLO: { [loId]: { context, methodology, discussion,
//                       demonstration, practice, selfDirected,
//                       assessStatements[], assessMethods[], hours } } } }
//
// Rules this file keeps:
//   • Keyed by ids, never positions. Records of a deleted module or LO
//     are not removed — they are simply not shown — so Module Mapping's
//     Undo brings the curriculum back with the module.
//   • Records are created lazily on the first edit, never on render.
//   • Hours are ALWAYS computed (credits × hours per credit, split by
//     the percentages, largest-remainder rounding so the parts add up
//     exactly to the total). There is no field to type an hour into.
//   • Modules, LOs and criteria are read, never written.
// ============================================================

import { appState, normalizeModuleCurriculumData, defaultModuleCurriculumData,
         CUR_DEFAULT_SPLIT } from './state.js';
import { showStatus } from './renderer.js';
import { getTaskCodeShort, isClusterAddedTaskId, getAddedTaskLabel } from './codes.js';
import { getTaskAnalysisRecord } from './task_analysis.js';
import { exportOccupationalStandardWord } from './exports_os_docx.js';
import { exportCurriculumDocx } from './exports_cur_docx.js';
import { getModuleCode, suggestModuleCode, isModuleCodeManual, getModuleShortName,
         suggestModuleShortName, assignModuleCode, assignModuleShortName,
         moduleRef } from './modules.js';

// ── Strings ──────────────────────────────────────────────────
// translations.js wins when it has the key (same rule as modules.js);
// these local tables keep the tab complete in all three languages.
const _S = {
  en: {
    tabModuleCurriculum: 'Module Curriculum CUR/CBC',
    curEmptyTitle: 'No modules yet',
    curEmptyBody: 'The curriculum is written per module. Build your modules in Module Mapping first — they will appear here automatically.',
    curGoMM: 'Go to Module Mapping',
    curSelModule: 'Module',
    curPrev: 'Previous module',
    curNext: 'Next module',
    curComplete: '{p}% complete',
    curExportThis: 'Export this module (Word)',
    curSettings: 'Programme settings',
    curSettingsHint: 'Saved once for the whole project and used by every module.',
    curProgName: 'Programme name',
    curHpc: 'Hours per credit',
    curGroup: 'Learners per group',
    curSplitDefault: 'Default time split (%)',
    curSplitSum: 'Total: {n}%',
    curSplitBad: 'The percentages must add up to 100% (now {n}%). Hours are shared out in proportion until you fix it.',
    sec1: '1 · Module header',
    sec2: '2 · Learning outcomes',
    sec3: '3 · Module resources',
    curFromMM: 'From Module Mapping',
    curEditInMM: 'Edit in Module Mapping',
    curTitle: 'Module title',
    curLevel: 'NQF level',
    curTrack: 'Track',
    curNotSet: 'not set',
    curCode: 'Module code',
    curCodeAuto: 'suggested',
    curCodeSuggest: 'Suggest',
    curCodeHint: 'Same code as on the module card in Module Mapping: track + level + position within the level. Edit freely.',
    curDistBtn: 'Distribute automatically',
    curDistTip: 'Share the institutional time over the outcomes in proportion to their performance criteria',
    curDistHelpTip: 'How to decide the hours of each learning outcome',
    curDistNeedCredits: 'Enter the module credits first — the institutional time is computed from them.',
    curDistConfirm: 'Some outcomes already have hours. Replace them with the automatic distribution?',
    curDistDone: '{t} h distributed: {list}',
    curHoursAuto: 'auto',
    curHoursAutoHint: 'Calculated automatically from the institutional time — type a value to change it.',
    curHoursManualHint: 'Set by you. Clear the field, or press the button, to return to the automatic value.',
    curFilePrefix: 'Prefix for exported file',
    curFileLevel: 'Level in file name',
    curFilePreview: 'File name:',
    curFileHint: 'Same prefix for every module (e.g. CUR or CBC). These characters are left out of file names: \\ / : * ? " < > |',
    curShortName: 'Short name (file name)',
    curPurposeL: 'Purpose statement',
    curPurposePh: 'Why this module exists — what the learner will be able to do at the end, in one or two sentences.',
    curCreditsL: 'Credits',
    curPrereqL: 'Pre-requisite modules',
    curPrereqNone: 'No other modules in the project.',
    curTimeL: 'Time table (computed)',
    curTimeNeedCredits: 'Enter the credits to compute the hours.',
    curTimeFormula: '{c} credits × {h} h = {t} h',
    curInst: 'Institutional',
    curInd: 'Industry',
    curTotalL: 'Total',
    curOverride: 'Use different percentages for this module',
    curOSLinkL: 'Link to the Occupational Standard',
    curOSNone: 'No performance criteria are linked to this module’s outcomes yet.',
    curCompetency: 'Competency {n}',
    curTasksL: 'tasks',
    curLOListL: 'Learning outcomes (module order)',
    curNoLOs: 'This module has no learning outcomes yet.',
    curFilled: '{x}/8 filled',
    curContextPh: 'Workshop, classroom or a real or simulated workplace.',
    curMethodPh: 'How the outcome is taught overall.',
    curDiscPh: 'What the teacher discusses with the learners (talk, questions, explanation).',
    curDemoPh: 'What the teacher shows and does in front of the learners.',
    curPracPh: 'What the learners do themselves, hands-on.',
    curSelfPh: 'What learners look up or prepare on their own.',
    curSuggestCriteria: 'Suggest from criteria',
    curSuggestCriteriaNone: 'This outcome has no linked performance criteria.',
    curSuggestCriteriaDone: '{n} statement(s) added',
    curNothingNew: 'Nothing new to add.',
    curMethodChips: 'Quick add:',
    mDirectObs: 'Direct observation',
    mOral: 'Oral questions',
    mPracTest: 'Practical test',
    mProduct: 'Product check',
    curLOHours: 'Duration (hours)',
    curLOHoursWarn: 'The outcome hours add up to {a} h, but the module’s institutional time is {b} h.',
    curAdd: 'Add',
    curRemove: 'Remove',
    curItemPh: 'Type an item',
    curSuggestTA: 'Suggest from Task Analysis',
    curTANone: 'No tools or safety items were found in the Task Analysis of the tasks linked to this module.',
    curTATitle: 'Suggest from Task Analysis',
    curTAIntro: 'Items from the Task Analysis of the tasks behind this module’s outcomes. Choose where each one goes. Items already in a list are not added again, and nothing already there is replaced.',
    curTAAlready: 'already added',
    curTAAddSel: 'Add selected',
    curTAAdded: '{n} item(s) added',
    curResPh: 'Text or a link (https://…)',
    curFacItem: 'Item',
    curFacQty: 'Qty',
    curFacAdd: 'Add facility',
    curSaved: 'Saved',
    curHelpTip: 'Guidelines: writing a module curriculum (CUR)',
    curCancel: 'Cancel',
    curClose: 'Close',
    // export menu + dialog
    mnuOS: 'Occupational Standard (Word)',
    mnuCUR: 'Module Curriculum — CUR (Word)…',
    mnuCBC: 'CBC (TESDA)',
    mnuSoon: 'Coming soon',
    dlgTitle: 'Export Module Curriculum (CUR)',
    dlgIntro: 'Each module downloads as its own Word file. Click Download next to each module you need — one at a time, so the browser never blocks a batch of downloads.',
    dlgBlank: 'Include empty fields (blank template)',
    dlgBlankHint: 'Prints the structure with empty boxes for experts to fill in by hand.',
    dlgCurrent: 'current',
    dlgDownload: 'Download',
    dlgDone: 'Downloaded',
    dlgNoModules: 'There are no modules to export yet.',
    msgCurExported: 'Module curriculum exported: {file}',
    msgCurCleared: 'Module curriculum cleared',
    lvlShort: 'L{n}',
    hUnit: 'h'
  },
  fr: {
    tabModuleCurriculum: 'Curriculum du module CUR/CBC',
    curEmptyTitle: 'Aucun module pour l’instant',
    curEmptyBody: 'Le curriculum s’écrit module par module. Construisez d’abord vos modules dans la Cartographie des modules — ils apparaîtront ici automatiquement.',
    curGoMM: 'Aller à la Cartographie des modules',
    curSelModule: 'Module',
    curPrev: 'Module précédent',
    curNext: 'Module suivant',
    curComplete: '{p} % complété',
    curExportThis: 'Exporter ce module (Word)',
    curSettings: 'Paramètres du programme',
    curSettingsHint: 'Enregistrés une fois pour tout le projet et utilisés par chaque module.',
    curProgName: 'Nom du programme',
    curHpc: 'Heures par crédit',
    curGroup: 'Apprenants par groupe',
    curSplitDefault: 'Répartition du temps par défaut (%)',
    curSplitSum: 'Total : {n} %',
    curSplitBad: 'Les pourcentages doivent totaliser 100 % (actuellement {n} %). Les heures sont réparties proportionnellement en attendant.',
    sec1: '1 · En-tête du module',
    sec2: '2 · Résultats d’apprentissage',
    sec3: '3 · Ressources du module',
    curFromMM: 'Depuis la Cartographie des modules',
    curEditInMM: 'Modifier dans la Cartographie des modules',
    curTitle: 'Titre du module',
    curLevel: 'Niveau du CNC',
    curTrack: 'Filière',
    curNotSet: 'non défini',
    curCode: 'Code du module',
    curCodeAuto: 'proposé',
    curCodeSuggest: 'Proposer',
    curCodeHint: 'Le même code que sur la carte du module (Cartographie des modules) : filière + niveau + position dans le niveau. Modifiable.',
    curDistBtn: 'Répartir automatiquement',
    curDistTip: 'Répartir le temps en établissement au prorata des critères de performance de chaque résultat',
    curDistHelpTip: 'Comment fixer les heures de chaque résultat d’apprentissage',
    curDistNeedCredits: 'Saisissez d’abord les crédits du module — le temps en établissement en découle.',
    curDistConfirm: 'Certains résultats ont déjà des heures. Les remplacer par la répartition automatique ?',
    curDistDone: '{t} h réparties : {list}',
    curHoursAuto: 'auto',
    curHoursAutoHint: 'Calculé automatiquement à partir du temps en établissement — saisissez une valeur pour le modifier.',
    curHoursManualHint: 'Valeur saisie. Videz le champ, ou cliquez sur le bouton, pour revenir à la valeur automatique.',
    curFilePrefix: 'Préfixe du fichier exporté',
    curFileLevel: 'Niveau dans le nom du fichier',
    curFilePreview: 'Nom du fichier :',
    curFileHint: 'Même préfixe pour tous les modules (p. ex. CUR ou CBC). Ces caractères sont retirés des noms de fichiers : \\ / : * ? " < > |',
    curShortName: 'Nom court (nom du fichier)',
    curPurposeL: 'Énoncé de l’objectif',
    curPurposePh: 'Pourquoi ce module existe — ce que l’apprenant saura faire à la fin, en une ou deux phrases.',
    curCreditsL: 'Crédits',
    curPrereqL: 'Modules préalables',
    curPrereqNone: 'Aucun autre module dans le projet.',
    curTimeL: 'Tableau horaire (calculé)',
    curTimeNeedCredits: 'Saisissez les crédits pour calculer les heures.',
    curTimeFormula: '{c} crédits × {h} h = {t} h',
    curInst: 'Établissement',
    curInd: 'Entreprise',
    curTotalL: 'Total',
    curOverride: 'Utiliser d’autres pourcentages pour ce module',
    curOSLinkL: 'Lien avec la norme professionnelle',
    curOSNone: 'Aucun critère de performance n’est encore lié aux résultats de ce module.',
    curCompetency: 'Compétence {n}',
    curTasksL: 'tâches',
    curLOListL: 'Résultats d’apprentissage (ordre du module)',
    curNoLOs: 'Ce module n’a pas encore de résultats d’apprentissage.',
    curFilled: '{x}/8 remplis',
    curContextPh: 'Atelier, salle de classe ou lieu de travail réel ou simulé.',
    curMethodPh: 'Comment le résultat est enseigné dans l’ensemble.',
    curDiscPh: 'Ce dont le formateur discute avec les apprenants (exposé, questions, explications).',
    curDemoPh: 'Ce que le formateur montre et fait devant les apprenants.',
    curPracPh: 'Ce que les apprenants font eux-mêmes, en pratique.',
    curSelfPh: 'Ce que les apprenants recherchent ou préparent seuls.',
    curSuggestCriteria: 'Proposer depuis les critères',
    curSuggestCriteriaNone: 'Ce résultat n’a aucun critère de performance lié.',
    curSuggestCriteriaDone: '{n} énoncé(s) ajouté(s)',
    curNothingNew: 'Rien de nouveau à ajouter.',
    curMethodChips: 'Ajout rapide :',
    mDirectObs: 'Observation directe',
    mOral: 'Questions orales',
    mPracTest: 'Épreuve pratique',
    mProduct: 'Contrôle du produit',
    curLOHours: 'Durée (heures)',
    curLOHoursWarn: 'Les heures des résultats totalisent {a} h, mais le temps en établissement du module est de {b} h.',
    curAdd: 'Ajouter',
    curRemove: 'Retirer',
    curItemPh: 'Saisissez un élément',
    curSuggestTA: 'Proposer depuis l’analyse des tâches',
    curTANone: 'Aucun outil ni élément de sécurité trouvé dans l’analyse des tâches liées à ce module.',
    curTATitle: 'Proposer depuis l’analyse des tâches',
    curTAIntro: 'Éléments de l’analyse des tâches liées aux résultats de ce module. Choisissez la liste de destination. Les éléments déjà présents ne sont pas ajoutés deux fois, et rien n’est remplacé.',
    curTAAlready: 'déjà ajouté',
    curTAAddSel: 'Ajouter la sélection',
    curTAAdded: '{n} élément(s) ajouté(s)',
    curResPh: 'Texte ou lien (https://…)',
    curFacItem: 'Élément',
    curFacQty: 'Qté',
    curFacAdd: 'Ajouter une installation',
    curSaved: 'Enregistré',
    curHelpTip: 'Recommandations : rédiger un curriculum de module (CUR)',
    curCancel: 'Annuler',
    curClose: 'Fermer',
    mnuOS: 'Norme professionnelle (Word)',
    mnuCUR: 'Curriculum du module — CUR (Word)…',
    mnuCBC: 'CBC (TESDA)',
    mnuSoon: 'Bientôt',
    dlgTitle: 'Exporter le curriculum du module (CUR)',
    dlgIntro: 'Chaque module est téléchargé dans son propre fichier Word. Cliquez sur Télécharger à côté de chaque module voulu — un à la fois, pour que le navigateur ne bloque pas une série de téléchargements.',
    dlgBlank: 'Inclure les champs vides (modèle vierge)',
    dlgBlankHint: 'Imprime la structure avec des cases vides à remplir à la main par les experts.',
    dlgCurrent: 'actuel',
    dlgDownload: 'Télécharger',
    dlgDone: 'Téléchargé',
    dlgNoModules: 'Aucun module à exporter pour l’instant.',
    msgCurExported: 'Curriculum du module exporté : {file}',
    msgCurCleared: 'Curriculum du module effacé',
    lvlShort: 'N{n}',
    hUnit: 'h'
  },
  ar: {
    tabModuleCurriculum: 'منهج الوحدة CUR/CBC',
    curEmptyTitle: 'لا توجد وحدات بعد',
    curEmptyBody: 'يُكتب المنهج لكل وحدة على حدة. ابنِ الوحدات أولاً في تبويب «مواءمة الوحدات التعلمية» وستظهر هنا تلقائياً.',
    curGoMM: 'الانتقال إلى مواءمة الوحدات',
    curSelModule: 'الوحدة',
    curPrev: 'الوحدة السابقة',
    curNext: 'الوحدة التالية',
    curComplete: 'مكتمل {p}%',
    curExportThis: 'تصدير هذه الوحدة (Word)',
    curSettings: 'إعدادات البرنامج',
    curSettingsHint: 'تُحفظ مرة واحدة للمشروع كله وتستخدمها كل الوحدات.',
    curProgName: 'اسم البرنامج',
    curHpc: 'ساعات لكل ساعة معتمدة',
    curGroup: 'عدد المتدربين في المجموعة',
    curSplitDefault: 'توزيع الوقت الافتراضي (%)',
    curSplitSum: 'المجموع: {n}%',
    curSplitBad: 'يجب أن يكون مجموع النسب 100% (حالياً {n}%). تُوزَّع الساعات بالتناسب إلى أن تُصحَّح.',
    sec1: '1 · ترويسة الوحدة',
    sec2: '2 · محصلات التعلم',
    sec3: '3 · موارد الوحدة',
    curFromMM: 'من مواءمة الوحدات',
    curEditInMM: 'التعديل في مواءمة الوحدات',
    curTitle: 'عنوان الوحدة',
    curLevel: 'مستوى الإطار الوطني',
    curTrack: 'المسار',
    curNotSet: 'غير محدد',
    curCode: 'رمز الوحدة',
    curCodeAuto: 'مقترح',
    curCodeSuggest: 'اقتراح',
    curCodeHint: 'هو الرمز نفسه في بطاقة الوحدة في مواءمة الوحدات: المسار + المستوى + ترتيب الوحدة داخل المستوى. يمكنك تعديله.',
    curDistBtn: 'توزيع تلقائي',
    curDistTip: 'توزيع الوقت المؤسسي على المحصلات بنسبة معايير الأداء المرتبطة بكل منها',
    curDistHelpTip: 'كيف تُحدَّد ساعات كل محصلة تعلم',
    curDistNeedCredits: 'أدخل الرصيد / الساعات المعتمدة للوحدة أولاً — الوقت المؤسسي يُحسب منه.',
    curDistConfirm: 'بعض المحصلات لها ساعات مسبقاً. هل تستبدلها بالتوزيع التلقائي؟',
    curDistDone: 'وُزِّعت {t} ساعة: {list}',
    curHoursAuto: 'تلقائي',
    curHoursAutoHint: 'محسوبة تلقائياً من الوقت المؤسسي — اكتب قيمة لتغييرها.',
    curHoursManualHint: 'قيمة أدخلتها أنت. امسح الحقل أو اضغط الزر للعودة إلى القيمة التلقائية.',
    curFilePrefix: 'بادئة الملف المُصدَّر',
    curFileLevel: 'المستوى في اسم الملف',
    curFilePreview: 'اسم الملف:',
    curFileHint: 'البادئة نفسها لكل الوحدات (مثل CUR أو CBC). هذه الرموز تُحذف من أسماء الملفات: \\ / : * ? " < > |',
    curShortName: 'اسم مختصر (لاسم الملف)',
    curPurposeL: 'بيان الغرض',
    curPurposePh: 'لماذا وُجدت هذه الوحدة — ما الذي سيستطيع المتدرب فعله في نهايتها، في جملة أو جملتين.',
    curCreditsL: 'الرصيد / الساعات المعتمدة',
    curPrereqL: 'الوحدات المتطلبة سابقاً',
    curPrereqNone: 'لا توجد وحدات أخرى في المشروع.',
    curTimeL: 'جدول الوقت (محسوب)',
    curTimeNeedCredits: 'أدخل الرصيد لحساب الساعات.',
    curTimeFormula: '{c} ساعة معتمدة × {h} = {t} ساعة',
    curInst: 'المؤسسة',
    curInd: 'موقع العمل',
    curTotalL: 'المجموع',
    curOverride: 'استخدام نسب مختلفة لهذه الوحدة',
    curOSLinkL: 'الربط بالمعيار المهني',
    curOSNone: 'لم تُربط بعد أي معايير أداء بمحصلات هذه الوحدة.',
    curCompetency: 'الكفاءة {n}',
    curTasksL: 'المهام',
    curLOListL: 'محصلات التعلم (بترتيب الوحدة)',
    curNoLOs: 'لا توجد محصلات تعلم في هذه الوحدة بعد.',
    curFilled: '{x}/8 مكتملة',
    curContextPh: 'ورشة أو قاعة دراسية أو موقع عمل حقيقي أو محاكى.',
    curMethodPh: 'كيف تُدرَّس المحصلة بصورة عامة.',
    curDiscPh: 'ما يناقشه المدرب مع المتدربين (شرح، أسئلة، حوار).',
    curDemoPh: 'ما يعرضه المدرب وينفّذه أمام المتدربين.',
    curPracPh: 'ما ينفّذه المتدربون بأنفسهم عملياً.',
    curSelfPh: 'ما يبحث عنه المتدربون أو يحضّرونه بأنفسهم.',
    curSuggestCriteria: 'اقتراح من معايير الأداء',
    curSuggestCriteriaNone: 'لا توجد معايير أداء مرتبطة بهذه المحصلة.',
    curSuggestCriteriaDone: 'أُضيفت {n} عبارة',
    curNothingNew: 'لا يوجد جديد لإضافته.',
    curMethodChips: 'إضافة سريعة:',
    mDirectObs: 'الملاحظة المباشرة',
    mOral: 'أسئلة شفوية',
    mPracTest: 'اختبار عملي',
    mProduct: 'فحص المنتج',
    curLOHours: 'المدة (ساعات)',
    curLOHoursWarn: 'مجموع ساعات المحصلات {a} ساعة، بينما الوقت المؤسسي للوحدة {b} ساعة.',
    curAdd: 'إضافة',
    curRemove: 'حذف',
    curItemPh: 'اكتب عنصراً',
    curSuggestTA: 'اقتراح من تحليل المهام',
    curTANone: 'لم يُعثر على عدد أو عناصر سلامة في تحليل المهام المرتبطة بهذه الوحدة.',
    curTATitle: 'اقتراح من تحليل المهام',
    curTAIntro: 'عناصر من تحليل المهام التي تقوم عليها محصلات هذه الوحدة. اختر القائمة المناسبة لكل عنصر. العناصر الموجودة مسبقاً لا تُضاف مرة ثانية، ولا يُستبدل شيء موجود.',
    curTAAlready: 'مضاف مسبقاً',
    curTAAddSel: 'إضافة المحدد',
    curTAAdded: 'أُضيف {n} عنصر',
    curResPh: 'نص أو رابط (https://…)',
    curFacItem: 'العنصر',
    curFacQty: 'العدد',
    curFacAdd: 'إضافة مرفق',
    curSaved: 'تم الحفظ',
    curHelpTip: 'إرشادات: كتابة منهج الوحدة (CUR)',
    curCancel: 'إلغاء',
    curClose: 'إغلاق',
    mnuOS: 'المعيار المهني (Word)',
    mnuCUR: 'منهج الوحدة — CUR (Word)…',
    mnuCBC: 'CBC (TESDA)',
    mnuSoon: 'قريباً',
    dlgTitle: 'تصدير منهج الوحدة (CUR)',
    dlgIntro: 'تُنزَّل كل وحدة في ملف Word مستقل. اضغط «تنزيل» بجانب كل وحدة تحتاجها — واحدة في كل مرة، كي لا يمنع المتصفح التنزيلات المتعددة.',
    dlgBlank: 'تضمين الحقول الفارغة (قالب فارغ)',
    dlgBlankHint: 'يطبع البنية بخانات فارغة ليملأها الخبراء يدوياً.',
    dlgCurrent: 'الحالية',
    dlgDownload: 'تنزيل',
    dlgDone: 'تم التنزيل',
    dlgNoModules: 'لا توجد وحدات للتصدير بعد.',
    msgCurExported: 'تم تصدير منهج الوحدة: {file}',
    msgCurCleared: 'تم مسح منهج الوحدة',
    lvlShort: 'م{n}',
    hUnit: 'ساعة'
  }
};

/* Fixed CUR labels — the wording printed in the Word document and used
   as field labels on screen, so the two can never disagree. Order and
   wording follow the expert template, with its inconsistencies fixed
   on purpose ("Self-directed learning" everywhere, "learning units"). */
const _L = {
  en: {
    curModule: 'Module', curPurpose: 'Purpose statements', curNqfLevel: 'NQF Level', curCredits: 'Credits',
    curPrereq: 'Pre-requisites modules', curInstTime: 'Indicative Institutional Time',
    curIndTime: 'Indicative Industry Attachment', curTotal100: 'Total 100%', curTheory: 'Theory',
    curPractical: 'Practical', curFormative: 'Formative Assess', curPractice: 'Practice',
    curSummative: 'Summative Assess', curHours: 'Hours', curProgram: 'The program',
    curOSLink: 'Link to the occupational standard',
    curOSLinkLead: 'Link to the following performance criteria in the Occupational Standard:',
    curOSTask: 'Occupational standard task:', curLOs: 'Learning outcomes',
    curLOsLead: 'After completing the learning units within this module, learners will be able to:',
    curLOn: 'Learning outcome {n}', curContext: 'Learning context',
    curMethodology: 'Teaching and learning methodology', curDiscussion: 'Teacher-led discussion',
    curDemonstration: 'Teacher demonstration', curPracticeL: 'Learners will practice',
    curSelfDirected: 'Self-directed learning', curAssessStatements: 'Formative Assessment Statements',
    curAssessMethods: 'Formative Assessment Method', curTools: 'Tools needed for this module',
    curEquipment: 'Equipment needed for this module', curPPE: 'Personal protective equipment (per learner)',
    curMaterials: 'Materials needed for this module', curResources: 'Recommended resources for this module',
    curLearnerGuide: 'Learner’s guide to this module',
    curFacilities: 'Physical facilities (for {n} learners) for this module', curQty: 'Quantity',
    curDefaultContext: 'Workshop, classroom or a real or simulated workplace.',
    curLevelN: 'Level {n}', curPC: 'Performance criteria', curDurationH: 'Duration (hours)'
  },
  fr: {
    curModule: 'Module', curPurpose: 'Énoncé de l’objectif', curNqfLevel: 'Niveau du CNC', curCredits: 'Crédits',
    curPrereq: 'Modules préalables', curInstTime: 'Temps indicatif en établissement',
    curIndTime: 'Stage indicatif en entreprise', curTotal100: 'Total 100 %', curTheory: 'Théorie',
    curPractical: 'Pratique', curFormative: 'Évaluation formative', curPractice: 'Pratique en entreprise',
    curSummative: 'Évaluation sommative', curHours: 'heures', curProgram: 'Le programme',
    curOSLink: 'Lien avec la norme professionnelle',
    curOSLinkLead: 'Lien avec les critères de performance suivants de la norme professionnelle :',
    curOSTask: 'Tâches de la norme professionnelle :', curLOs: 'Résultats d’apprentissage',
    curLOsLead: 'À l’issue des unités d’apprentissage de ce module, les apprenants seront capables de :',
    curLOn: 'Résultat d’apprentissage {n}', curContext: 'Contexte d’apprentissage',
    curMethodology: 'Méthodologie d’enseignement et d’apprentissage', curDiscussion: 'Discussion dirigée par le formateur',
    curDemonstration: 'Démonstration par le formateur', curPracticeL: 'Les apprenants s’exerceront',
    curSelfDirected: 'Apprentissage autonome', curAssessStatements: 'Énoncés d’évaluation formative',
    curAssessMethods: 'Méthode d’évaluation formative', curTools: 'Outils nécessaires pour ce module',
    curEquipment: 'Équipements nécessaires pour ce module', curPPE: 'Équipements de protection individuelle (par apprenant)',
    curMaterials: 'Matériaux nécessaires pour ce module', curResources: 'Ressources recommandées pour ce module',
    curLearnerGuide: 'Guide de l’apprenant pour ce module',
    curFacilities: 'Installations physiques (pour {n} apprenants) pour ce module', curQty: 'Quantité',
    curDefaultContext: 'Atelier, salle de classe ou lieu de travail réel ou simulé.',
    curLevelN: 'Niveau {n}', curPC: 'Critères de performance', curDurationH: 'Durée (heures)'
  },
  ar: {
    curModule: 'الوحدة', curPurpose: 'بيان الغرض', curNqfLevel: 'مستوى الإطار الوطني للمؤهلات',
    curCredits: 'الرصيد / الساعات المعتمدة', curPrereq: 'الوحدات المتطلبة سابقاً',
    curInstTime: 'الوقت المؤسسي التقديري', curIndTime: 'التدريب التقديري في موقع العمل',
    curTotal100: 'المجموع 100%', curTheory: 'نظري', curPractical: 'عملي', curFormative: 'تقييم تكويني',
    curPractice: 'تطبيق في موقع العمل', curSummative: 'تقييم ختامي', curHours: 'ساعة', curProgram: 'البرنامج',
    curOSLink: 'الربط بالمعيار المهني',
    curOSLinkLead: 'ترتبط هذه الوحدة بمعايير الأداء الآتية في المعيار المهني:',
    curOSTask: 'مهام المعيار المهني:', curLOs: 'محصلات التعلم',
    curLOsLead: 'بعد إكمال وحدات التعلم ضمن هذه الوحدة، سيكون المتدربون قادرين على:',
    curLOn: 'محصلة التعلم {n}', curContext: 'سياق التعلم',
    curMethodology: 'منهجية التعليم والتعلم', curDiscussion: 'نقاش يقوده المدرب',
    curDemonstration: 'عرض توضيحي من المدرب', curPracticeL: 'ممارسة المتدربين',
    curSelfDirected: 'التعلم الذاتي', curAssessStatements: 'عبارات التقييم التكويني',
    curAssessMethods: 'طريقة التقييم التكويني', curTools: 'الأدوات اللازمة لهذه الوحدة',
    curEquipment: 'الأجهزة والمعدات اللازمة لهذه الوحدة', curPPE: 'معدات الوقاية الشخصية (لكل متدرب)',
    curMaterials: 'المواد اللازمة لهذه الوحدة', curResources: 'المصادر الموصى بها لهذه الوحدة',
    curLearnerGuide: 'دليل المتدرب لهذه الوحدة',
    curFacilities: 'المرافق المادية (لـ {n} متدرباً) لهذه الوحدة', curQty: 'العدد',
    curDefaultContext: 'ورشة أو قاعة دراسية أو موقع عمل حقيقي أو محاكى.',
    curLevelN: 'المستوى {n}', curPC: 'معايير الأداء', curDurationH: 'المدة (ساعات)'
  }
};

function _lang() {
  const I = window.i18n;
  const l = (I && I.getLang) ? I.getLang() : 'en';
  return _S[l] ? l : 'en';
}
function _tx(key) {
  const I = window.i18n;
  if (I && I.has && I.has(key)) return I.t(key);
  const l = _lang();
  return (_S[l] && _S[l][key]) || (_L[l] && _L[l][key]) || _S.en[key] || _L.en[key] || key;
}
function _txf(key, vars) {
  let s = _tx(key);
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}
/** Fixed CUR label in the current UI language (also used by the exporter). */
export function curLabel(key, vars) {
  const l = _lang();
  let s = (_L[l] && _L[l][key]) || _L.en[key] || key;
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}
const _isRTL = () => !!(window.i18n && window.i18n.isRTL && window.i18n.isRTL());
function _esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ── Constants ────────────────────────────────────────────────
const SPLIT_KEYS = ['theory', 'practical', 'formative', 'practice', 'summative'];
const SPLIT_LABEL = { theory: 'curTheory', practical: 'curPractical', formative: 'curFormative',
                      practice: 'curPractice', summative: 'curSummative' };
// The eight per-LO fields, in the fixed export order.
const LO_TEXT_FIELDS = [
  { key: 'context',       label: 'curContext',       ph: 'curContextPh' },
  { key: 'methodology',   label: 'curMethodology',   ph: 'curMethodPh' },
  { key: 'discussion',    label: 'curDiscussion',    ph: 'curDiscPh' },
  { key: 'demonstration', label: 'curDemonstration', ph: 'curDemoPh' },
  { key: 'practice',      label: 'curPracticeL',     ph: 'curPracPh' },
  { key: 'selfDirected',  label: 'curSelfDirected',  ph: 'curSelfPh' },
];
const RESOURCE_LISTS = [
  { key: 'tools',     label: 'curTools' },
  { key: 'equipment', label: 'curEquipment' },
  { key: 'ppe',       label: 'curPPE' },
  { key: 'materials', label: 'curMaterials' },
];
const TAB_ID = 'module-curriculum-tab';

// ── Data access ──────────────────────────────────────────────
function _data() {
  const d = appState.moduleCurriculumData;
  if (!d || typeof d !== 'object' || !d.settings || !d.byModule) {
    appState.moduleCurriculumData = normalizeModuleCurriculumData(d);
  }
  return appState.moduleCurriculumData;
}
function _settings() { return _data().settings; }
function _modules() { return (appState.moduleMappingData && appState.moduleMappingData.modules) || []; }
function _modRec(id, create) {
  const bm = _data().byModule;
  if (!bm[id] && create) bm[id] = {};
  return bm[id] || null;
}
function _loRec(modId, loId, create) {
  const m = _modRec(modId, create);
  if (!m) return null;
  if (!m.byLO || typeof m.byLO !== 'object') { if (!create) return null; m.byLO = {}; }
  if (!m.byLO[loId] && create) m.byLO[loId] = {};
  return m.byLO[loId] || null;
}
const _arr = v => Array.isArray(v) ? v : [];
const _clean = v => _arr(v).map(x => String(x == null ? '' : x).trim()).filter(Boolean);
const _str = v => String(v == null ? '' : v);

function _moduleLevel(m) {
  const n = parseInt(m && m.level, 10);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}
function _liveLOs(module) {
  const live = new Map(((appState.learningOutcomesData || {}).outcomes || []).map(o => [o.id, o]));
  return _arr(module && module.learningOutcomes).map(o => (o && live.get(o.id)) || o).filter(Boolean);
}
function _moduleLabel(m, i) {
  const l = _moduleLevel(m);
  const ref = moduleRef(m) || `M${i + 1}`;
  const showTrack = m.track && ref.indexOf(m.track) === -1;
  const tags = [l ? _txf('lvlShort', { n: l }) : '', showTrack ? m.track : ''].filter(Boolean).join(' · ');
  return `${ref} — ${m.title || ''}${tags ? ` (${tags})` : ''}`;
}
function _effSplit(rec) {
  const o = rec && rec.splitOverride;
  return (o && typeof o === 'object') ? o : _settings().split;
}

/** Largest-remainder split: whole hours that always add up to the total.
 *  Ties go to the smaller share first (so 7.5 / 67.5 → 8 / 67), which
 *  reproduces the expert template’s own rounding. */
export function computeHours(credits, hoursPerCredit, split) {
  const c = Number(credits), h = Number(hoursPerCredit);
  if (!(c > 0) || !(h > 0)) return null;
  const sp = split || CUR_DEFAULT_SPLIT;
  const pct = SPLIT_KEYS.map(k => Math.max(0, Number(sp[k]) || 0));
  const sum = pct.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  const total = Math.round(c * h);
  const raw = pct.map(p => total * p / sum);
  const out = raw.map(r => Math.floor(r + 1e-9));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = SPLIT_KEYS.map((_, i) => i).sort((a, b) => {
    const ra = Math.round((raw[a] - out[a]) * 1e6), rb = Math.round((raw[b] - out[b]) * 1e6);
    return (rb - ra) || (pct[a] - pct[b]) || (a - b);
  });
  for (let i = 0; rem > 0; i++, rem--) out[order[i % order.length]]++;
  const parts = {};
  SPLIT_KEYS.forEach((k, i) => { parts[k] = out[i]; });
  return {
    total, parts, pctSum: sum,
    pct: Object.fromEntries(SPLIT_KEYS.map((k, i) => [k, pct[i]])),
    institutional: parts.theory + parts.practical + parts.formative,
    industry: parts.practice + parts.summative,
  };
}
function _moduleHours(module) {
  const rec = _modRec(module.id) || {};
  return computeHours(rec.credits, _settings().hoursPerCredit, _effSplit(rec));
}

// ── Code / names ─────────────────────────────────────────────
// Since 3.34.0 the code and short name belong to the module itself
// (Module Mapping card); see the identity block in modules.js.
const _moduleCode = m => getModuleCode(m);
const _moduleShortName = m => getModuleShortName(m);
function _domVal(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function _programmeName() {
  const s = (_settings().programmeName || '').trim();
  return s || _domVal('occupationTitle') || _domVal('jobTitle');
}

// ── Occupational Standard link ───────────────────────────────
function _clusterById(id) {
  const cs = (appState.clusteringData && appState.clusteringData.clusters) || [];
  const i = cs.findIndex(c => c && c.id === id);
  return i < 0 ? null : { cluster: cs[i], number: i + 1 };
}
function _taskCode(id) {
  if (isClusterAddedTaskId(id)) return getAddedTaskLabel();
  return getTaskCodeShort(id) || '';
}
/** Per competency: PC ids and the task codes behind them, from the
 *  module's learning outcomes (in module order). */
function _osLink(module) {
  const groups = new Map();
  _liveLOs(module).forEach(o => _arr(o.linkedCriteria).forEach(pc => {
    if (!pc || pc.stale) return;
    const cl = _clusterById(pc.clusterId);
    const num = cl ? cl.number : (pc.clusterNumber || '?');
    const key = cl ? cl.cluster.id : `n${num}`;
    if (!groups.has(key)) groups.set(key, { number: num, name: cl ? cl.cluster.name : '', pcs: [], taskIds: [] });
    const g = groups.get(key);
    if (pc.id && !g.pcs.includes(pc.id)) g.pcs.push(pc.id);
    const tids = pc.taskId ? [pc.taskId] : (cl ? _arr(cl.cluster.tasks).map(t => t && t.id).filter(Boolean) : []);
    tids.forEach(t => { if (!g.taskIds.includes(t)) g.taskIds.push(t); });
  }));
  return [...groups.values()].sort((a, b) => a.number - b.number).map(g => ({
    ...g, tasks: g.taskIds.map(_taskCode).filter(Boolean)
  }));
}
function _osLinkLines(module) {
  return _osLink(module).map(g =>
    `${_txf('curCompetency', { n: g.number })}${g.name ? ` — ${g.name}` : ''}: ${curLabel('curPC')} ${g.pcs.join('; ')}` +
    (g.tasks.length ? ` · ${_tx('curTasksL')}: ${g.tasks.join(', ')}` : ''));
}
function _moduleTaskIds(module) {
  const ids = [];
  _osLink(module).forEach(g => g.taskIds.forEach(t => { if (!ids.includes(t)) ids.push(t); }));
  return ids;
}

// ── Completeness ─────────────────────────────────────────────
function _loFilledCount(modId, loId) {
  const r = _loRec(modId, loId) || {};
  let n = 0;
  LO_TEXT_FIELDS.forEach(f => {
    if (f.key === 'context' && r.context === undefined) { n++; return; }   // default text counts
    if (_str(r[f.key]).trim()) n++;
  });
  if (_clean(r.assessStatements).length) n++;
  if (_clean(r.assessMethods).length) n++;
  return n;
}
export function moduleCompleteness(module) {
  const rec = _modRec(module.id) || {};
  const los = _liveLOs(module);
  let filled = 0, total = 2 + 8 * los.length + RESOURCE_LISTS.length;
  if (_str(rec.purpose).trim()) filled++;
  if (Number(rec.credits) > 0) filled++;
  los.forEach(o => { filled += _loFilledCount(module.id, o.id); });
  RESOURCE_LISTS.forEach(l => { if (_clean(rec[l.key]).length) filled++; });
  return total ? Math.round(filled / total * 100) : 0;
}

// ── Persistence ──────────────────────────────────────────────
let _saveTimer = null;
function _persistNow() {
  clearTimeout(_saveTimer); _saveTimer = null;
  import('./dacum_projects.js')
    .then(m => { try { m.saveCurrentProject(); } catch (e) { console.warn('[curriculum] save failed:', e); } })
    .catch(() => {});
}
function _schedulePersist() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_persistNow, 700);
}

// ── Selection / UI state (not persisted) ─────────────────────
let _selId = null;
const _openLOs = new Set();
let _openSettings = false;
let _loSeeded = null;

function _selectedModule() {
  const mods = _modules();
  if (!mods.length) return null;
  let m = mods.find(x => x.id === _selId);
  if (!m) { m = mods[0]; _selId = m.id; }
  return m;
}

// ── Rendering ────────────────────────────────────────────────
function _root() { return document.getElementById('curRoot'); }

export function renderModuleCurriculum() {
  const root = _root();
  if (!root) return;
  _wire();
  _ensureHelpButton();
  const mods = _modules();
  if (!mods.length) {
    root.innerHTML = `
      <div class="cur-empty">
        <div class="cur-empty-icon" aria-hidden="true">📘</div>
        <h3>${_esc(_tx('curEmptyTitle'))}</h3>
        <p>${_esc(_tx('curEmptyBody'))}</p>
        <button type="button" class="btn-next-step" data-cur-action="goto-mm">📦 ${_esc(_tx('curGoMM'))}</button>
      </div>`;
    return;
  }
  const module = _selectedModule();
  const idx = mods.indexOf(module);
  if (_loSeeded !== module.id) {          // first LO open on first view of a module
    _loSeeded = module.id;
    const first = _liveLOs(module)[0];
    if (first) _openLOs.add(module.id + '|' + first.id);
  }
  const keepScroll = window.scrollY;
  root.innerHTML = `
    ${_renderTopBar(mods, module, idx)}
    ${_renderSettings()}
    ${_renderHeader(module, idx)}
    ${_renderLOs(module)}
    ${_renderResources(module)}`;
  root.querySelectorAll('textarea.cur-auto').forEach(_autoGrow);
  window.scrollTo(0, keepScroll);
}

function _renderTopBar(mods, module, idx) {
  const opts = mods.map((m, i) => {
    const p = moduleCompleteness(m);
    return `<option value="${_esc(m.id)}" ${m.id === module.id ? 'selected' : ''}>${_esc(_moduleLabel(m, i))}  ${p >= 100 ? '✓' : p + '%'}</option>`;
  }).join('');
  const p = moduleCompleteness(module);
  return `
    <div class="cur-topbar">
      <label class="cur-sel-wrap">
        <span class="cur-sel-label">${_esc(_tx('curSelModule'))}</span>
        <select class="cur-module-select" dir="auto" data-cur-action="select-module" aria-label="${_esc(_tx('curSelModule'))}">${opts}</select>
      </label>
      <div class="cur-topbar-actions">
        <button type="button" class="cur-icon-btn" data-cur-action="prev-module" ${idx <= 0 ? 'disabled' : ''}
          title="${_esc(_tx('curPrev'))}" aria-label="${_esc(_tx('curPrev'))}"><span class="rtl-flip">‹</span></button>
        <button type="button" class="cur-icon-btn" data-cur-action="next-module" ${idx >= mods.length - 1 ? 'disabled' : ''}
          title="${_esc(_tx('curNext'))}" aria-label="${_esc(_tx('curNext'))}"><span class="rtl-flip">›</span></button>
        <span class="cur-progress ${p >= 100 ? 'is-done' : ''}" id="curProgress">${p >= 100 ? '✓ ' : ''}${_esc(_txf('curComplete', { p }))}</span>
        <button type="button" class="cur-export-btn" data-cur-action="export-this">⬇ ${_esc(_tx('curExportThis'))}</button>
      </div>
    </div>`;
}

function _num(v) { const n = Number(v); return Number.isFinite(n) ? n : ''; }

function _splitInputs(scope, split) {
  return `<div class="cur-split-grid">${SPLIT_KEYS.map(k => `
      <label class="cur-split-cell"><span>${_esc(curLabel(SPLIT_LABEL[k]))}</span>
        <input type="number" min="0" max="100" step="1" inputmode="numeric" class="cur-num"
          data-cs="${scope}" data-ck="split.${k}" value="${_esc(_num(split[k]))}"></label>`).join('')}
    </div>`;
}
function _splitSumNote(split) {
  const sum = SPLIT_KEYS.reduce((a, k) => a + (Number(split[k]) || 0), 0);
  return sum === 100
    ? `<span class="cur-sum-ok">${_esc(_txf('curSplitSum', { n: sum }))}</span>`
    : `<span class="cur-warn">⚠ ${_esc(_txf('curSplitBad', { n: sum }))}</span>`;
}

function _renderSettings() {
  const s = _settings();
  return `
    <details class="cur-card cur-settings" data-cur-details="settings" ${_openSettings ? 'open' : ''}>
      <summary class="cur-card-sum">⚙️ ${_esc(_tx('curSettings'))}
        <span class="cur-sum-meta">${_esc(_programmeName() || '')} · ${_esc(_tx('curHpc'))}: ${_esc(s.hoursPerCredit)}</span></summary>
      <div class="cur-card-body">
        <p class="cur-hint">${_esc(_tx('curSettingsHint'))}</p>
        <div class="cur-grid-3">
          <label class="cur-field cur-span-3"><span>${_esc(_tx('curProgName'))}</span>
            <input type="text" data-cs="set" data-ck="programmeName" value="${_esc(s.programmeName || '')}"
              placeholder="${_esc(_domVal('occupationTitle') || _domVal('jobTitle'))}"></label>
          <label class="cur-field"><span>${_esc(_tx('curHpc'))}</span>
            <input type="number" min="1" step="1" inputmode="numeric" class="cur-num" data-cs="set" data-ck="hoursPerCredit" value="${_esc(s.hoursPerCredit)}"></label>
          <label class="cur-field"><span>${_esc(_tx('curGroup'))}</span>
            <input type="number" min="1" step="1" inputmode="numeric" class="cur-num" data-cs="set" data-ck="groupSize" value="${_esc(s.groupSize)}"></label>

        </div>
        <div class="cur-subhead">${_esc(_tx('curSplitDefault'))}</div>
        ${_splitInputs('set', s.split)}
        <div class="cur-split-note" data-cur-sumnote="set">${_splitSumNote(s.split)}</div>
      </div>
    </details>`;
}

function _hoursBox(module) {
  const rec = _modRec(module.id) || {};
  const hrs = _moduleHours(module);
  if (!hrs) return `<div class="cur-hours-empty">${_esc(_tx('curTimeNeedCredits'))}</div>`;
  const cell = k => `<div class="cur-h-cell"><span class="cur-h-lbl">${_esc(curLabel(SPLIT_LABEL[k]))} ${_esc(hrs.pct[k])}%</span><strong>${hrs.parts[k]}</strong></div>`;
  return `
    <div class="cur-hours-formula">${_esc(_txf('curTimeFormula', { c: rec.credits, h: _settings().hoursPerCredit, t: hrs.total }))}</div>
    <div class="cur-hours">
      <div class="cur-h-group cur-h-inst">
        <div class="cur-h-head">${_esc(_tx('curInst'))} <strong><bdi>${hrs.institutional} ${_esc(_tx('hUnit'))}</bdi></strong></div>
        <div class="cur-h-row">${cell('theory')}${cell('practical')}${cell('formative')}</div>
      </div>
      <div class="cur-h-group cur-h-ind">
        <div class="cur-h-head">${_esc(_tx('curInd'))} <strong><bdi>${hrs.industry} ${_esc(_tx('hUnit'))}</bdi></strong></div>
        <div class="cur-h-row">${cell('practice')}${cell('summative')}</div>
      </div>
      <div class="cur-h-total"><span>${_esc(_tx('curTotalL'))}</span><strong><bdi>${hrs.total} ${_esc(_tx('hUnit'))}</bdi></strong></div>
    </div>`;
}

function _renderHeader(module, idx) {
  const rec = _modRec(module.id) || {};
  const lvl = _moduleLevel(module);
  const storedCode = isModuleCodeManual(module);
  const mods = _modules();
  const prereq = _arr(rec.prerequisites);
  const others = mods.map((m, i) => ({ m, i })).filter(x => x.m.id !== module.id);
  const override = !!(rec.splitOverride && typeof rec.splitOverride === 'object');
  const los = _liveLOs(module);
  const links = _osLink(module);
  return `
    <section class="cur-card">
      <h3 class="cur-sec-title">${_esc(_tx('sec1'))}</h3>
      <div class="cur-fromMM">
        <div class="cur-fromMM-head"><span>🔒 ${_esc(_tx('curFromMM'))}</span>
          <button type="button" class="cur-link-btn" data-cur-action="goto-mm">✏️ ${_esc(_tx('curEditInMM'))}</button></div>
        <dl class="cur-ro">
          <div><dt>${_esc(_tx('curTitle'))}</dt><dd>${_esc(moduleRef(module) || `M${idx + 1}`)} — ${_esc(module.title || '')}</dd></div>
          <div><dt>${_esc(_tx('curLevel'))}</dt><dd>${lvl ? _esc(curLabel('curLevelN', { n: lvl })) : `<em>${_esc(_tx('curNotSet'))}</em>`}</dd></div>
          <div><dt>${_esc(_tx('curTrack'))}</dt><dd>${module.track ? `<bdi>${_esc(module.track)}</bdi>` : `<em>${_esc(_tx('curNotSet'))}</em>`}</dd></div>
        </dl>
      </div>
      <div class="cur-grid-2">
        <label class="cur-field"><span>${_esc(_tx('curCode'))} <em class="cur-chip" ${storedCode ? 'hidden' : ''}>${_esc(_tx('curCodeAuto'))}</em></span>
          <div class="cur-inline">
            <input type="text" dir="ltr" data-cs="mod" data-ck="code" value="${_esc(getModuleCode(module))}" maxlength="40">
            <button type="button" class="cur-mini-btn" data-cur-action="suggest-code">↺ ${_esc(_tx('curCodeSuggest'))}</button>
          </div>
          <small class="cur-hint">${_esc(_tx('curCodeHint'))}</small></label>
        <label class="cur-field"><span>${_esc(_tx('curShortName'))}</span>
          <input type="text" data-cs="mod" data-ck="shortName" value="${_esc(module.shortName || '')}" placeholder="${_esc(suggestModuleShortName(module))}" maxlength="30"></label>
      </div>
      <div class="cur-filename">
        <div class="cur-grid-2">
          <label class="cur-field"><span>${_esc(_tx('curFilePrefix'))}</span>
            <input type="text" dir="ltr" data-cs="set" data-ck="filePrefix" value="${_esc(_settings().filePrefix || '')}" placeholder="CUR" maxlength="16"></label>
          <label class="cur-field"><span>${_esc(_tx('curFileLevel'))}</span>
            <select data-cs="set" data-ck="levelStyle">
              <option value="short" ${_settings().levelStyle !== 'long' ? 'selected' : ''}>L1</option>
              <option value="long" ${_settings().levelStyle === 'long' ? 'selected' : ''}>${_esc(curLabel('curLevelN', { n: 1 }))}</option>
            </select></label>
        </div>
        <div class="cur-file-preview"><span>${_esc(_tx('curFilePreview'))}</span> <bdi id="curFilePreview" dir="ltr">${_esc(curFileName(module))}</bdi></div>
        <small class="cur-hint">${_esc(_tx('curFileHint'))}</small>
      </div>
      <label class="cur-field"><span>${_esc(_tx('curPurposeL'))}</span>
        <textarea class="cur-auto" rows="2" data-cs="mod" data-ck="purpose" placeholder="${_esc(_tx('curPurposePh'))}">${_esc(rec.purpose || '')}</textarea></label>
      <div class="cur-grid-2">
        <label class="cur-field"><span>${_esc(_tx('curCreditsL'))}</span>
          <input type="number" min="0" step="0.5" inputmode="decimal" class="cur-num" data-cs="mod" data-ck="credits" value="${_esc(_num(rec.credits))}"></label>
        <div class="cur-field"><span>${_esc(_tx('curPrereqL'))}</span>
          ${others.length ? `<div class="cur-checklist" role="group" aria-label="${_esc(_tx('curPrereqL'))}">${others.map(({ m, i }) => `
            <label class="cur-check"><input type="checkbox" data-cur-prereq="${_esc(m.id)}" ${prereq.includes(m.id) ? 'checked' : ''}>
              <span><bdi>${_esc(_moduleCode(m))}</bdi> — ${_esc(m.title || '')}</span></label>`).join('')}</div>`
            : `<div class="cur-hint">${_esc(_tx('curPrereqNone'))}</div>`}
        </div>
      </div>
      <div class="cur-subhead">${_esc(_tx('curTimeL'))}</div>
      <div id="curHoursBox">${_hoursBox(module)}</div>
      <label class="cur-check cur-override"><input type="checkbox" data-cur-action="toggle-override" ${override ? 'checked' : ''}>
        <span>${_esc(_tx('curOverride'))}</span></label>
      ${override ? `${_splitInputs('mod', rec.splitOverride)}<div class="cur-split-note" data-cur-sumnote="mod">${_splitSumNote(rec.splitOverride)}</div>` : ''}
      <div class="cur-subhead">${_esc(_tx('curOSLinkL'))}</div>
      ${links.length ? `<ul class="cur-oslink">${links.map(g => `
        <li><strong>${_esc(_txf('curCompetency', { n: g.number }))}</strong>${g.name ? ` — ${_esc(g.name)}` : ''}
          <div class="cur-oslink-ids">${_esc(curLabel('curPC'))}: ${g.pcs.map(p => `<bdi class="cur-pc">${_esc(p)}</bdi>`).join(' ')}
          ${g.tasks.length ? ` · ${_esc(_tx('curTasksL'))}: ${g.tasks.map(t => `<bdi class="cur-task">${_esc(t)}</bdi>`).join(' ')}` : ''}</div></li>`).join('')}</ul>`
        : `<div class="cur-hint">${_esc(_tx('curOSNone'))}</div>`}
      <div class="cur-subhead">${_esc(_tx('curLOListL'))}</div>
      ${los.length ? `<ol class="cur-lolist">${los.map(o => `<li><bdi class="cur-lonum">${_esc(o.number || '')}</bdi> ${_esc(o.statement || '')}</li>`).join('')}</ol>`
        : `<div class="cur-hint">${_esc(_tx('curNoLOs'))}</div>`}
    </section>`;
}

function _listEditor(scope, key, items, opts = {}) {
  const rows = _arr(items);
  const show = rows.length ? rows : [''];
  return `
    <div class="cur-list" data-cs="${scope}" data-ck="${key}" ${opts.lo ? `data-lo="${_esc(opts.lo)}"` : ''} ${opts.prefix ? `data-prefix="${_esc(opts.prefix)}"` : ''}>
      ${show.map((v, i) => `
        <div class="cur-li">
          <span class="cur-li-num">${opts.prefix ? `${_esc(opts.prefix)}-${i + 1}` : '•'}</span>
          <textarea class="cur-li-input cur-auto" rows="1" data-idx="${i}" placeholder="${_esc(opts.ph || _tx('curItemPh'))}" aria-label="${_esc(opts.label || '')} ${i + 1}">${_esc(v)}</textarea>
          <button type="button" class="cur-li-del" data-cur-action="li-del" data-idx="${i}" title="${_esc(_tx('curRemove'))}" aria-label="${_esc(_tx('curRemove'))}">✕</button>
        </div>`).join('')}
      <button type="button" class="cur-li-add" data-cur-action="li-add">＋ ${_esc(_tx('curAdd'))}</button>
    </div>`;
}

/* LO hours (3.35.1): an outcome either has hours the user typed
   (manual), or shows an AUTOMATIC value — the institutional time left
   after the manual ones, shared over the automatic outcomes in
   proportion to their performance criteria. So the field is filled by
   default as soon as the credits are known, and a typed value simply
   takes over for that outcome. Clearing a field returns it to auto. */
function _isManualHours(r) {
  return !!r && r.hours !== '' && r.hours != null && Number.isFinite(Number(r.hours));
}
function _effectiveLOHours(module) {
  const hrs = _moduleHours(module);
  const los = _liveLOs(module);
  const out = new Map();
  let manualSum = 0;
  const autos = [];
  los.forEach(o => {
    const r = _loRec(module.id, o.id);
    if (_isManualHours(r)) { out.set(o.id, { h: Number(r.hours), auto: false }); manualSum += Number(r.hours); }
    else autos.push(o);
  });
  if (autos.length) {
    if (!hrs) autos.forEach(o => out.set(o.id, { h: null, auto: true }));
    else {
      const parts = distributeHours(Math.max(0, hrs.institutional - manualSum), autos.map(_loWeight));
      autos.forEach((o, i) => out.set(o.id, { h: parts[i], auto: true }));
    }
  }
  return out;
}

function _loHoursWarn(module) {
  const hrs = _moduleHours(module);
  if (!hrs) return '';
  let sum = 0;
  _effectiveLOHours(module).forEach(v => { sum += v.h || 0; });
  if (Math.abs(sum - hrs.institutional) < 1e-9) return '';
  return `<div class="cur-warn cur-block">⚠ ${_esc(_txf('curLOHoursWarn', { a: Math.round(sum * 100) / 100, b: hrs.institutional }))}</div>`;
}

function _renderLOs(module) {
  const los = _liveLOs(module);
  return `
    <section class="cur-card">
      <h3 class="cur-sec-title">${_esc(_tx('sec2'))}</h3>
      <div id="curLOHoursWarn">${_loHoursWarn(module)}</div>
      ${los.length ? los.map((o, i) => _renderLOCard(module, o, i + 1)).join('') : `<div class="cur-hint">${_esc(_tx('curNoLOs'))}</div>`}
    </section>`;
}

function _hoursField(module, lo) {
  const eff = _effectiveLOHours(module).get(lo) || { h: null, auto: true };
  const auto = eff.auto;
  return `
        <div class="cur-field cur-hours-field">
          <span class="cur-field-label">${_esc(_tx('curLOHours'))}
            <em class="cur-chip" data-cur-hchip="${_esc(lo)}" ${auto && eff.h != null ? '' : 'hidden'}>${_esc(_tx('curHoursAuto'))}</em></span>
          <div class="cur-hours-row">
            <input type="number" min="0" step="0.5" inputmode="decimal" class="cur-num ${auto ? 'is-auto' : ''}" data-cs="lo" data-lo="${_esc(lo)}" data-ck="hours"
              value="${_esc(eff.h == null ? '' : eff.h)}" aria-label="${_esc(_tx('curLOHours'))}">
            <span class="cur-hours-tools">
              <button type="button" class="cur-mini-btn" data-cur-action="distribute-hours"
                title="${_esc(_tx('curDistTip'))}">⚖️ ${_esc(_tx('curDistBtn'))}</button>
              <button type="button" class="tab-help-btn" data-cur-action="dist-help" aria-haspopup="dialog"
                title="${_esc(_tx('curDistHelpTip'))}" aria-label="${_esc(_tx('curDistHelpTip'))}">?</button>
            </span>
          </div>
          <small class="cur-hint" data-cur-hnote="${_esc(lo)}">${_esc(eff.h == null ? _tx('curDistNeedCredits') : (auto ? _tx('curHoursAutoHint') : _tx('curHoursManualHint')))}</small>
        </div>`;
}

function _renderLOCard(module, o, n) {
  const r = _loRec(module.id, o.id) || {};
  const open = _openLOs.has(module.id + '|' + o.id);
  const filled = _loFilledCount(module.id, o.id);
  const lo = o.id;
  const textField = f => {
    const val = f.key === 'context' && r.context === undefined ? curLabel('curDefaultContext') : _str(r[f.key]);
    return `<label class="cur-field"><span>${_esc(curLabel(f.label))}</span>
      <textarea class="cur-auto" rows="${f.key === 'context' ? 1 : 2}" data-cs="lo" data-lo="${_esc(lo)}" data-ck="${f.key}"
        placeholder="${_esc(_tx(f.ph))}">${_esc(val)}</textarea></label>`;
  };
  return `
    <details class="cur-lo" data-cur-details="lo" data-lo="${_esc(lo)}" ${open ? 'open' : ''}>
      <summary class="cur-lo-sum">
        <span class="cur-lo-title"><bdi class="cur-lonum">${_esc(curLabel('curLOn', { n }))}</bdi> <span class="cur-lo-st">${_esc(o.statement || '')}</span></span>
        <span class="cur-lo-badge ${filled >= 8 ? 'is-done' : ''}" data-cur-badge="${_esc(lo)}">${_esc(_txf('curFilled', { x: filled }))}</span>
      </summary>
      <div class="cur-lo-body">
        ${LO_TEXT_FIELDS.map(textField).join('')}
        <div class="cur-field">
          <div class="cur-field-head"><span>${_esc(curLabel('curAssessStatements'))}</span>
            <button type="button" class="cur-mini-btn" data-cur-action="suggest-criteria" data-lo="${_esc(lo)}">✨ ${_esc(_tx('curSuggestCriteria'))}</button></div>
          ${_listEditor('lo', 'assessStatements', r.assessStatements, { lo, prefix: String(n), label: curLabel('curAssessStatements') })}
        </div>
        <div class="cur-field">
          <div class="cur-field-head"><span>${_esc(curLabel('curAssessMethods'))}</span></div>
          <div class="cur-chips"><span>${_esc(_tx('curMethodChips'))}</span>
            ${['mDirectObs', 'mOral', 'mPracTest', 'mProduct'].map(k =>
              `<button type="button" class="cur-chip-btn" data-cur-action="add-method" data-lo="${_esc(lo)}" data-val="${_esc(_tx(k))}">＋ ${_esc(_tx(k))}</button>`).join('')}</div>
          ${_listEditor('lo', 'assessMethods', r.assessMethods, { lo, label: curLabel('curAssessMethods') })}
        </div>
        ${_hoursField(module, lo)}
      </div>
    </details>`;
}

function _renderResources(module) {
  const rec = _modRec(module.id) || {};
  const fac = _arr(rec.facilities);
  const facRows = fac.length ? fac : [{ item: '', qty: '' }];
  return `
    <section class="cur-card">
      <div class="cur-sec-head"><h3 class="cur-sec-title">${_esc(_tx('sec3'))}</h3>
        <button type="button" class="cur-mini-btn" data-cur-action="suggest-ta">🔬 ${_esc(_tx('curSuggestTA'))}</button></div>
      <div class="cur-res-grid">
        ${RESOURCE_LISTS.map(l => `
          <div class="cur-field"><span class="cur-field-label">${_esc(curLabel(l.label))}</span>
            ${_listEditor('mod', l.key, rec[l.key], { label: curLabel(l.label) })}</div>`).join('')}
      </div>
      <div class="cur-field"><span class="cur-field-label">${_esc(curLabel('curResources'))} — ${_esc(curLabel('curLearnerGuide'))}</span>
        ${_listEditor('mod', 'resources', rec.resources, { ph: _tx('curResPh'), label: curLabel('curResources') })}</div>
      <div class="cur-field"><span class="cur-field-label" data-cur-fachead>${_esc(curLabel('curFacilities', { n: _settings().groupSize }))}</span>
        <div class="cur-fac" role="table">
          <div class="cur-fac-row cur-fac-head" role="row"><span role="columnheader">${_esc(_tx('curFacItem'))}</span><span role="columnheader">${_esc(_tx('curFacQty'))}</span><span></span></div>
          ${facRows.map((f, i) => `
            <div class="cur-fac-row" role="row">
              <textarea class="cur-auto cur-fac-item" rows="1" data-fac-idx="${i}" data-fac-key="item" aria-label="${_esc(_tx('curFacItem'))} ${i + 1}">${_esc(f.item || '')}</textarea>
              <input type="text" class="cur-fac-qty" data-fac-idx="${i}" data-fac-key="qty" value="${_esc(f.qty == null ? '' : f.qty)}" aria-label="${_esc(_tx('curFacQty'))} ${i + 1}">
              <button type="button" class="cur-li-del" data-cur-action="fac-del" data-idx="${i}" title="${_esc(_tx('curRemove'))}" aria-label="${_esc(_tx('curRemove'))}">✕</button>
            </div>`).join('')}
          <button type="button" class="cur-li-add" data-cur-action="fac-add">＋ ${_esc(_tx('curFacAdd'))}</button>
        </div>
      </div>
    </section>`;
}

function _autoGrow(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight + 2, 36) + 'px';
}

/* Updates everything derived from the data (hours, badges, progress,
   option labels, warnings) WITHOUT rebuilding the inputs, so typing
   never loses focus. */
function _refreshDerived() {
  const root = _root();
  const module = _selectedModule();
  if (!root || !module) return;
  const box = root.querySelector('#curHoursBox');
  if (box) box.innerHTML = _hoursBox(module);
  const w = root.querySelector('#curLOHoursWarn');
  if (w) w.innerHTML = _loHoursWarn(module);
  _liveLOs(module).forEach(o => {
    const b = root.querySelector(`[data-cur-badge="${CSS.escape(o.id)}"]`);
    if (!b) return;
    const n = _loFilledCount(module.id, o.id);
    b.textContent = _txf('curFilled', { x: n });
    b.classList.toggle('is-done', n >= 8);
  });
  const p = moduleCompleteness(module);
  const pr = root.querySelector('#curProgress');
  if (pr) { pr.textContent = (p >= 100 ? '✓ ' : '') + _txf('curComplete', { p }); pr.classList.toggle('is-done', p >= 100); }
  const sel = root.querySelector('.cur-module-select');
  if (sel) {
    const mods = _modules();
    Array.from(sel.options).forEach(opt => {
      const i = mods.findIndex(m => m.id === opt.value);
      if (i < 0) return;
      const q = moduleCompleteness(mods[i]);
      opt.textContent = `${_moduleLabel(mods[i], i)}  ${q >= 100 ? '✓' : q + '%'}`;
    });
  }
  ['set', 'mod'].forEach(sc => {
    const el = root.querySelector(`[data-cur-sumnote="${sc}"]`);
    if (!el) return;
    const split = sc === 'set' ? _settings().split : (_modRec(module.id) || {}).splitOverride;
    if (split) el.innerHTML = _splitSumNote(split);
  });
  // LO hours: refresh automatic values (never the field being typed in).
  const eff = _effectiveLOHours(module);
  eff.forEach((v, loId) => {
    const sel = CSS.escape(loId);
    const inp = root.querySelector(`input[data-ck="hours"][data-lo="${sel}"]`);
    if (inp && document.activeElement !== inp) inp.value = v.h == null ? '' : v.h;
    if (inp) inp.classList.toggle('is-auto', v.auto);
    const chip = root.querySelector(`[data-cur-hchip="${sel}"]`);
    if (chip) chip.hidden = !(v.auto && v.h != null);
    const note = root.querySelector(`[data-cur-hnote="${sel}"]`);
    if (note) note.textContent = v.h == null ? _tx('curDistNeedCredits') : (v.auto ? _tx('curHoursAutoHint') : _tx('curHoursManualHint'));
  });
  const fp = root.querySelector('#curFilePreview');
  if (fp) fp.textContent = curFileName(module);
  const fh = root.querySelector('[data-cur-fachead]');
  if (fh) fh.textContent = curLabel('curFacilities', { n: _settings().groupSize });
}

// ── Editing ──────────────────────────────────────────────────
function _setField(scope, key, raw, loId) {
  const module = _selectedModule();
  if (scope === 'set') {
    const s = _settings();
    if (key.startsWith('split.')) {
      const k = key.slice(6);
      s.split[k] = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
    } else if (key === 'hoursPerCredit' || key === 'groupSize') {
      const n = Number(raw);
      if (n > 0) s[key] = n;
    } else {
      s[key] = raw;
    }
    return;
  }
  if (!module) return;
  if (scope === 'mod') {
    // Identity lives on the module (3.34.0): code is applied on change,
    // the short name as it is typed.
    if (key === 'code') return;
    if (key === 'shortName') { assignModuleShortName(module, raw); return; }
    const rec = _modRec(module.id, true);
    if (key.startsWith('split.')) {
      if (!rec.splitOverride) rec.splitOverride = { ..._settings().split };
      rec.splitOverride[key.slice(6)] = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
    } else if (key === 'credits') {
      rec.credits = raw === '' ? '' : Math.max(0, Number(raw) || 0);
    } else {
      rec[key] = raw;
    }
    return;
  }
  if (scope === 'lo' && loId) {
    const r = _loRec(module.id, loId, true);
    if (key === 'hours') { if (raw === '') delete r.hours; else r.hours = Math.max(0, Number(raw) || 0); }
    else r[key] = raw;
  }
}

function _listTarget(listEl, create) {
  const module = _selectedModule();
  if (!module || !listEl) return null;
  const scope = listEl.getAttribute('data-cs');
  const key = listEl.getAttribute('data-ck');
  const holder = scope === 'lo' ? _loRec(module.id, listEl.getAttribute('data-lo'), create) : _modRec(module.id, create);
  if (!holder) return null;
  if (!Array.isArray(holder[key])) { if (!create) return null; holder[key] = []; }
  return { arr: holder[key], holder, key };
}

function _rerenderKeepFocus(selector) {
  renderModuleCurriculum();
  if (selector) {
    const el = document.querySelector(selector);
    if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} }
  }
}

function _listSelector(listEl, idx) {
  const scope = listEl.getAttribute('data-cs'), key = listEl.getAttribute('data-ck'), lo = listEl.getAttribute('data-lo');
  return `#curRoot .cur-list[data-cs="${scope}"][data-ck="${key}"]${lo ? `[data-lo="${CSS.escape(lo)}"]` : ''} .cur-li-input[data-idx="${idx}"]`;
}

function _addToList(holder, key, values) {
  if (!Array.isArray(holder[key])) holder[key] = [];
  const have = new Set(_clean(holder[key]).map(v => v.toLowerCase()));
  holder[key] = holder[key].filter(v => _str(v).trim());     // drop blank placeholder rows
  let added = 0;
  values.forEach(v => {
    const t = _str(v).trim();
    if (!t || have.has(t.toLowerCase())) return;
    have.add(t.toLowerCase()); holder[key].push(t); added++;
  });
  return added;
}

function _suggestFromCriteria(loId) {
  const module = _selectedModule();
  const o = module && _liveLOs(module).find(x => x.id === loId);
  if (!o) return;
  const pcs = _arr(o.linkedCriteria).filter(pc => pc && !pc.stale).map(pc => pc.text);
  if (!pcs.length) { showStatus(_tx('curSuggestCriteriaNone'), 'error'); return; }
  const r = _loRec(module.id, loId, true);
  const n = _addToList(r, 'assessStatements', pcs);
  _openLOs.add(module.id + '|' + loId);
  renderModuleCurriculum();
  _schedulePersist();
  showStatus(n ? _txf('curSuggestCriteriaDone', { n }) : _tx('curNothingNew'), n ? 'success' : 'info');
}

// ── Suggest from Task Analysis (picker) ──────────────────────
function _openTAPicker() {
  const module = _selectedModule();
  if (!module) return;
  const rec = _modRec(module.id) || {};
  const present = new Set();
  RESOURCE_LISTS.forEach(l => _clean(rec[l.key]).forEach(v => present.add(v.toLowerCase())));
  const seen = new Set();
  const items = [];
  const strip = s => _str(s).replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[\.\)]\s*/, '').trim();
  _moduleTaskIds(module).forEach(tid => {
    const r = getTaskAnalysisRecord(tid);
    if (!r) return;
    [['toolsEquipmentMaterials', 'tools'], ['safetyOSH', 'ppe']].forEach(([src, target]) => {
      _arr(r[src]).map(strip).filter(Boolean).forEach(text => {
        const k = text.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        items.push({ text, target, already: present.has(k) });
      });
    });
  });
  if (!items.length) { showStatus(_tx('curTANone'), 'error'); return; }

  const listOpts = t => RESOURCE_LISTS.map(l => `<option value="${l.key}" ${l.key === t ? 'selected' : ''}>${_esc(curLabel(l.label))}</option>`).join('');
  const ov = _modal('curTAModal', _tx('curTATitle'), '🔬', `
      <p class="cur-modal-intro">${_esc(_tx('curTAIntro'))}</p>
      <div class="cur-ta-list">${items.map((it, i) => `
        <div class="cur-ta-row ${it.already ? 'is-done' : ''}">
          <label class="cur-check"><input type="checkbox" data-ta-i="${i}" ${it.already ? 'checked disabled' : 'checked'}>
            <span>${_esc(it.text)}${it.already ? ` <em>(${_esc(_tx('curTAAlready'))})</em>` : ''}</span></label>
          <select data-ta-target="${i}" ${it.already ? 'disabled' : ''} aria-label="${_esc(it.text)}">${listOpts(it.target)}</select>
        </div>`).join('')}</div>`,
    [{ label: _tx('curCancel'), cls: 'cur-btn-ghost', close: true },
     { label: _tx('curTAAddSel'), cls: 'cur-btn-primary', onClick: () => {
       const r = _modRec(module.id, true);
       let n = 0;
       ov.querySelectorAll('input[data-ta-i]:checked:not(:disabled)').forEach(cb => {
         const i = parseInt(cb.getAttribute('data-ta-i'), 10);
         const target = ov.querySelector(`select[data-ta-target="${i}"]`).value;
         n += _addToList(r, target, [items[i].text]);
       });
       _closeModal(ov);
       renderModuleCurriculum();
       _schedulePersist();
       showStatus(n ? _txf('curTAAdded', { n }) : _tx('curNothingNew'), n ? 'success' : 'info');
     } }]);
}

// ── Generic modal ────────────────────────────────────────────
let _lastFocus = null;
function _modal(id, title, icon, bodyHtml, buttons, opts = {}) {
  document.getElementById(id)?.remove();
  _lastFocus = document.activeElement;
  const ov = document.createElement('div');
  ov.id = id;
  ov.className = 'cur-modal-ov';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', title);
  ov.setAttribute('dir', _isRTL() ? 'rtl' : 'ltr');
  ov.innerHTML = `
    <div class="cur-modal ${opts.wide ? 'is-wide' : ''}">
      <div class="cur-modal-head"><span class="cur-modal-icon" aria-hidden="true">${icon}</span><p>${_esc(title)}</p>
        <button type="button" class="cur-modal-x" data-cur-close aria-label="${_esc(_tx('curClose'))}">✕</button></div>
      <div class="cur-modal-body">${bodyHtml}</div>
      ${buttons && buttons.length ? `<div class="cur-modal-foot">${buttons.map((b, i) =>
        `<button type="button" class="${b.cls || ''}" data-cur-btn="${i}">${_esc(b.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  document.body.appendChild(ov);
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); _closeModal(ov); } };
  ov.__onKey = onKey;
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-cur-close]')) { _closeModal(ov); return; }
    const b = e.target.closest('[data-cur-btn]');
    if (!b) return;
    const spec = buttons[parseInt(b.getAttribute('data-cur-btn'), 10)];
    if (spec.close) _closeModal(ov); else if (spec.onClick) spec.onClick();
  });
  const first = ov.querySelector('.cur-modal-foot button:last-child') || ov.querySelector('[data-cur-close]');
  if (first) first.focus({ preventScroll: true });
  return ov;
}
function _closeModal(ov) {
  if (!ov) return;
  if (ov.__onKey) document.removeEventListener('keydown', ov.__onKey, true);
  ov.remove();
  if (_lastFocus && document.contains(_lastFocus)) { try { _lastFocus.focus({ preventScroll: true }); } catch (_) {} }
}

// ── Guidelines (same look as the Learning Outcomes / Module Mapping guides)
const _GUIDE = {
  en: {
    title: 'Writing a module curriculum (CUR)',
    intro: 'A CUR turns one module into a teaching plan: what it is for, how long it takes, how each learning outcome is taught and checked, and what the workshop needs. The examples below use a general computer maintenance module, “Assemble and maintain computer hardware”.',
    sections: [
      { h: '🏷️ Header', items: [
        '<strong>Module code</strong> — track + level + position of the module in that level. Example: <em><bdi>CMT 1-1</bdi></em> (first module of level 1).',
        '<strong>Purpose statement</strong> — why the module exists and what learners will be able to do at the end, in one or two sentences. Example: <em>To enable learners to use hand tools, assemble computer components and install peripherals according to manufacturer’s specifications.</em>',
        '<strong>Credits</strong> — the weight of the module. You enter only the credits; the hours are calculated for you: credits × hours per credit (set in Programme settings), then shared out by the time-split percentages, in whole hours that always add up to the total. Example with 50 hours per credit: 3 credits = 150 h → Theory 15, Practical 67, Formative assessment 8 (Institutional 90 h) · Industry practice 52, Summative assessment 8 (Industry 60 h).',
        '<strong>Pre-requisite modules</strong> — tick the modules a learner must complete before this one. Example: <em>a workplace safety module</em> before a module that uses power tools.' ] },
      { h: '🎯 For each learning outcome', items: [
        '<strong>Learning context</strong> — where the learning takes place. Example: <em>Workshop, classroom or a real or simulated workplace.</em>',
        '<strong>Teaching and learning methodology</strong> — the overall approach. Example: <em>The teacher introduces the hand tools used to open and fasten computer parts (screwdrivers, cutters, pliers).</em>',
        '<strong>Teacher-led discussion</strong> — what the teacher talks through and asks. Example: <em>The teacher leads a discussion on each tool, when it is used and the safety risks.</em>',
        '<strong>Teacher demonstration</strong> — what the teacher shows and does in front of the learners. Example: <em>The teacher demonstrates how to use each tool correctly and safely.</em>',
        '<strong>Learners will practice</strong> — what the learners do with their own hands. Example: <em>Learners open and close a computer case using the correct tools.</em>',
        '<strong>Self-directed learning</strong> — what learners look up or prepare on their own. Example: <em>Searching for other types of tools and how they are used.</em>',
        '<strong>Formative assessment statements</strong> — short, observable checks, numbered n-1, n-2… (n = the outcome’s number). “Suggest from criteria” copies the outcome’s performance criteria as a starting point. Example: <em>1-1 Uses screwdrivers and hand tools correctly and safely.</em>',
        '<strong>Formative assessment method</strong> — how each check is carried out. Example: <em>Direct observation; oral questions.</em>',
        '<strong>Duration (hours)</strong> — optional. When filled, the outcome hours should add up to the module’s institutional time; a warning shows if they do not.' ] },
      { h: '💡 Discussion and demonstration are different', items: [
        'Discussion = the teacher talks, explains and asks questions. Demonstration = the teacher shows and does the task. Write each in its own field so the teaching plan stays clear.' ] },
      { h: '🧰 Resources', items: [
        '<strong>Tools</strong> — items held in the hand: <em>screwdrivers, tweezers, multimeter</em>.',
        '<strong>Equipment</strong> — devices and machines: <em>laptop, printer, soldering station, UPS</em>.',
        '<strong>Personal protective equipment (per learner)</strong> — <em>safety goggles, gloves, dust mask</em>.',
        '<strong>Materials</strong> — consumables: <em>A4 paper, printer cartridge, blank discs</em>.',
        '<strong>Recommended resources</strong> — the learner’s guide, books and links.',
        '<strong>Physical facilities</strong> — rooms and furniture with quantities for one group: <em>Classroom 8 m × 7 m — 1; Desks — 15</em>.',
        '“Suggest from Task Analysis” brings in tools and safety items from the tasks behind the outcomes; you choose which list each one goes to.' ] }
    ]
  },
  fr: {
    title: 'Rédiger un curriculum de module (CUR)',
    intro: 'Un CUR transforme un module en plan d’enseignement : à quoi il sert, combien de temps il dure, comment chaque résultat est enseigné et vérifié, et ce dont l’atelier a besoin. Les exemples ci-dessous portent sur un module général de maintenance informatique, « Assembler et entretenir le matériel informatique ».',
    sections: [
      { h: '🏷️ En-tête', items: [
        '<strong>Code du module</strong> — filière + niveau + position du module dans ce niveau. Exemple : <em><bdi>CMT 1-1</bdi></em> (premier module du niveau 1).',
        '<strong>Énoncé de l’objectif</strong> — pourquoi le module existe et ce que l’apprenant saura faire à la fin, en une ou deux phrases. Exemple : <em>Permettre aux apprenants d’utiliser les outils à main, d’assembler les composants d’un ordinateur et d’installer les périphériques selon les spécifications du fabricant.</em>',
        '<strong>Crédits</strong> — le poids du module. Vous saisissez seulement les crédits ; les heures sont calculées : crédits × heures par crédit (Paramètres du programme), puis réparties selon les pourcentages, en heures entières dont la somme égale toujours le total. Exemple avec 50 h par crédit : 3 crédits = 150 h → Théorie 15, Pratique 67, Évaluation formative 8 (Établissement 90 h) · Pratique en entreprise 52, Évaluation sommative 8 (Entreprise 60 h).',
        '<strong>Modules préalables</strong> — cochez les modules à terminer avant celui-ci. Exemple : <em>un module de sécurité au travail</em> avant un module qui utilise des outils électriques.' ] },
      { h: '🎯 Pour chaque résultat d’apprentissage', items: [
        '<strong>Contexte d’apprentissage</strong> — où l’apprentissage a lieu. Exemple : <em>Atelier, salle de classe ou lieu de travail réel ou simulé.</em>',
        '<strong>Méthodologie</strong> — l’approche générale. Exemple : <em>Le formateur présente les outils à main servant à ouvrir et fixer les pièces (tournevis, pinces coupantes, pinces).</em>',
        '<strong>Discussion dirigée</strong> — ce que le formateur explique et demande. Exemple : <em>Il anime une discussion sur chaque outil, son usage et les risques.</em>',
        '<strong>Démonstration</strong> — ce que le formateur montre et fait devant les apprenants. Exemple : <em>Il montre comment utiliser chaque outil correctement et en sécurité.</em>',
        '<strong>Les apprenants s’exerceront</strong> — ce que les apprenants font eux-mêmes. Exemple : <em>Ouvrir et refermer un boîtier avec les bons outils.</em>',
        '<strong>Apprentissage autonome</strong> — ce qu’ils recherchent ou préparent seuls. Exemple : <em>Rechercher d’autres types d’outils et leur utilisation.</em>',
        '<strong>Énoncés d’évaluation formative</strong> — vérifications courtes et observables, numérotées n-1, n-2… (n = numéro du résultat). « Proposer depuis les critères » copie les critères de performance pour démarrer. Exemple : <em>1-1 Utilise correctement et en sécurité les tournevis et outils à main.</em>',
        '<strong>Méthode d’évaluation formative</strong> — comment chaque vérification se fait. Exemple : <em>Observation directe ; questions orales.</em>',
        '<strong>Durée (heures)</strong> — facultative. Si elle est remplie, la somme des heures des résultats doit égaler le temps en établissement ; un avertissement s’affiche sinon.' ] },
      { h: '💡 Discussion et démonstration sont différentes', items: [
        'Discussion = le formateur parle, explique et pose des questions. Démonstration = le formateur montre et réalise la tâche. Écrivez chacune dans son champ pour un plan clair.' ] },
      { h: '🧰 Ressources', items: [
        '<strong>Outils</strong> — objets tenus en main : <em>tournevis, pincettes, multimètre</em>.',
        '<strong>Équipements</strong> — appareils et machines : <em>ordinateur portable, imprimante, station de soudage, onduleur</em>.',
        '<strong>EPI (par apprenant)</strong> — <em>lunettes, gants, masque anti-poussière</em>.',
        '<strong>Matériaux</strong> — consommables : <em>papier A4, cartouche, disques vierges</em>.',
        '<strong>Ressources recommandées</strong> — guide de l’apprenant, livres et liens.',
        '<strong>Installations physiques</strong> — salles et mobilier avec quantités pour un groupe : <em>Salle 8 m × 7 m — 1 ; Bureaux — 15</em>.',
        '« Proposer depuis l’analyse des tâches » reprend outils et éléments de sécurité des tâches liées ; vous choisissez la liste de chacun.' ] }
    ]
  },
  ar: {
    title: 'كتابة منهج الوحدة (CUR)',
    intro: 'يحوّل منهج الوحدة (CUR) الوحدة إلى خطة تدريس: الغرض منها، ومدتها، وكيف تُدرَّس كل محصلة تعلم وتُقيَّم، وما تحتاجه الورشة. الأمثلة أدناه من وحدة عامة في صيانة الحاسوب بعنوان «تجميع عتاد الحاسوب وصيانته».',
    sections: [
      { h: '🏷️ الترويسة', items: [
        '<strong>رمز الوحدة</strong> — المسار + المستوى + ترتيب الوحدة داخل ذلك المستوى. مثال: <em><bdi>CMT 1-1</bdi></em> (الوحدة الأولى في المستوى 1).',
        '<strong>بيان الغرض</strong> — لماذا وُجدت الوحدة وما الذي سيستطيع المتدرب فعله في نهايتها، في جملة أو جملتين. مثال: <em>تمكين المتدربين من استخدام العدد اليدوية وتجميع مكونات الحاسوب وتنصيب الأجهزة الطرفية وفق مواصفات الصانع.</em>',
        '<strong>الرصيد / الساعات المعتمدة</strong> — وزن الوحدة. تُدخل الرصيد فقط، والساعات تُحسب تلقائياً: الرصيد × الساعات لكل ساعة معتمدة (من إعدادات البرنامج)، ثم تُوزَّع حسب نسب توزيع الوقت بساعات صحيحة مجموعها يساوي الإجمالي دائماً. مثال بـ 50 ساعة لكل ساعة معتمدة: 3 = 150 ساعة ← نظري 15، عملي 67، تقييم تكويني 8 (المؤسسة 90 ساعة) · تطبيق في موقع العمل 52، تقييم ختامي 8 (موقع العمل 60 ساعة).',
        '<strong>الوحدات المتطلبة سابقاً</strong> — ضع علامة على الوحدات التي يجب أن يُكملها المتدرب قبل هذه الوحدة. مثال: <em>وحدة السلامة في مكان العمل</em> قبل وحدة تستخدم العدد الكهربائية.' ] },
      { h: '🎯 لكل محصلة تعلم', items: [
        '<strong>سياق التعلم</strong> — أين يحدث التعلم. مثال: <em>ورشة أو قاعة دراسية أو موقع عمل حقيقي أو محاكى.</em>',
        '<strong>منهجية التعليم والتعلم</strong> — الأسلوب العام. مثال: <em>يعرّف المدرب المتدربين بالعدد اليدوية المستخدمة في فتح أجزاء الحاسوب وتثبيتها (المفكات، القطّاعات، الزرادية).</em>',
        '<strong>نقاش يقوده المدرب</strong> — ما يشرحه المدرب ويسأل عنه. مثال: <em>يدير المدرب نقاشاً حول كل عدة ومتى تُستخدم ومخاطرها.</em>',
        '<strong>عرض توضيحي من المدرب</strong> — ما يُريه المدرب وينفّذه أمام المتدربين. مثال: <em>يعرض المدرب طريقة استخدام كل عدة بشكل صحيح وآمن.</em>',
        '<strong>ممارسة المتدربين</strong> — ما ينفّذه المتدربون بأيديهم. مثال: <em>يفتح المتدربون صندوق الحاسوب ويغلقونه بالعدد الصحيحة.</em>',
        '<strong>التعلم الذاتي</strong> — ما يبحث عنه المتدربون أو يحضّرونه بأنفسهم. مثال: <em>البحث عن أنواع أخرى من العدد وطريقة استخدامها.</em>',
        '<strong>عبارات التقييم التكويني</strong> — تحققات قصيرة قابلة للملاحظة، مرقّمة n-1، n-2… (n = رقم المحصلة). زر «اقتراح من معايير الأداء» ينسخ معايير المحصلة كبداية. مثال: <em>1-1 يستخدم المفكات والعدد اليدوية بشكل صحيح وآمن.</em>',
        '<strong>طريقة التقييم التكويني</strong> — كيف يتم كل تحقق. مثال: <em>الملاحظة المباشرة؛ أسئلة شفوية.</em>',
        '<strong>المدة (ساعات)</strong> — اختيارية. عند تعبئتها ينبغي أن يساوي مجموع ساعات المحصلات الوقتَ المؤسسي للوحدة، ويظهر تنبيه إن لم يتساويا.' ] },
      { h: '💡 النقاش يختلف عن العرض التوضيحي', items: [
        'النقاش = المدرب يتحدث ويشرح ويطرح الأسئلة. العرض التوضيحي = المدرب يُري المهمة وينفّذها. اكتب كلاً منهما في خانته لتبقى خطة التدريس واضحة.' ] },
      { h: '🧰 الموارد', items: [
        '<strong>الأدوات</strong> — ما يُمسك باليد: <em>مفكات، ملقط، مقياس متعدد</em>.',
        '<strong>الأجهزة والمعدات</strong> — أجهزة وآلات: <em>حاسوب محمول، طابعة، محطة لحام، جهاز UPS</em>.',
        '<strong>معدات الوقاية الشخصية (لكل متدرب)</strong> — <em>نظارات واقية، قفازات، كمامة</em>.',
        '<strong>المواد</strong> — مستهلكات: <em>ورق A4، حبر طابعة، أقراص فارغة</em>.',
        '<strong>المصادر الموصى بها</strong> — دليل المتدرب والكتب والروابط.',
        '<strong>المرافق المادية</strong> — القاعات والأثاث مع العدد لمجموعة واحدة: <em>قاعة 8م × 7م — 1؛ مكاتب — 15</em>.',
        'زر «اقتراح من تحليل المهام» يجلب العدد وعناصر السلامة من المهام التي تقوم عليها المحصلات، وأنت تختار قائمة كل عنصر.' ] }
    ]
  }
};

// ── Distribute institutional hours over the learning outcomes (3.35.0)
// Weight = number of live performance criteria linked to each outcome
// (at least 1). Whole hours, largest remainder; a tie goes to the
// earlier outcome, so 90 h over 1 / 1 / 2 criteria → 23 / 22 / 45. A
// starting point only: the expert adjusts any value afterwards.
export function distributeHours(total, weights) {
  const T = Math.round(Number(total) || 0);
  const w = weights.map(x => Math.max(1, Number(x) || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!(T > 0) || !sum) return w.map(() => 0);
  const raw = w.map(x => T * x / sum);
  const out = raw.map(r => Math.floor(r + 1e-9));
  let rem = T - out.reduce((a, b) => a + b, 0);
  const order = w.map((_, i) => i).sort((a, b) =>
    (Math.round((raw[b] - out[b]) * 1e6) - Math.round((raw[a] - out[a]) * 1e6)) || (a - b));
  for (let i = 0; rem > 0; i++, rem--) out[order[i % order.length]]++;
  return out;
}
function _loWeight(o) {
  return Math.max(1, _arr(o && o.linkedCriteria).filter(pc => pc && !pc.stale).length);
}
function _distributeLOHours() {
  const module = _selectedModule();
  if (!module) return;
  const los = _liveLOs(module);
  if (!los.length) { showStatus(_tx('curNoLOs'), 'error'); return; }
  const hrs = _moduleHours(module);
  if (!hrs) { showStatus(_tx('curDistNeedCredits'), 'error'); return; }
  const hasAny = los.some(o => _isManualHours(_loRec(module.id, o.id)));
  if (hasAny && !confirm(_tx('curDistConfirm'))) return;
  los.forEach(o => { const r = _loRec(module.id, o.id); if (r) delete r.hours; });
  const parts = distributeHours(hrs.institutional, los.map(_loWeight));
  renderModuleCurriculum();
  _schedulePersist();
  showStatus('✓ ' + _txf('curDistDone', { t: hrs.institutional, list: parts.join(' + ') }), 'success');
}

const _DIST_GUIDE = {
  en: {
    title: 'Learning outcome hours — how to decide',
    intro: 'The hours of the learning outcomes share out the module’s institutional time (theory + practical + formative assessment). Industry practice and summative assessment belong to the whole module and are not split over the outcomes. The field is optional; when it is filled, the outcome hours should add up exactly to the institutional time.',
    sections: [
      { h: '⚖️ Automatic hours and “Distribute automatically”', items: [
        'As soon as the module credits are entered, every outcome shows an automatic value (marked “auto”). Typing a number makes it yours; the other automatic outcomes then share what is left. Clearing the field returns it to auto.',
        '“Distribute automatically” returns every outcome of the module to the automatic value.',
        'Shares the institutional time in proportion to the number of performance criteria linked to each outcome (an outcome with none counts as 1).',
        'Whole hours only, and they always add up exactly to the total. Example: 90 h over outcomes with 1, 1 and 2 criteria → 23 + 22 + 45.',
        'It is a documented starting point, not a decision: adjust any value afterwards.' ] },
      { h: '🧭 What to consider when you adjust', items: [
        '<strong>Size of the outcome</strong> — more performance criteria and assessment statements usually need more time.',
        '<strong>Complexity</strong> — an outcome that involves diagnosis, decisions or several steps needs more time than a routine procedure.',
        '<strong>Practical intensity</strong> — outcomes that need repeated hands-on practice on tools or equipment need more time than mostly theoretical ones.',
        '<strong>Learners’ starting point</strong> — new content takes longer than content that builds on an earlier module.',
        '<strong>Resources</strong> — when learners must take turns on limited equipment, allow extra time.' ] },
      { h: '✅ Check', items: [
        'The warning above the outcome cards disappears when the outcome hours add up to the institutional time.',
        'Have the review panel confirm the final distribution.' ] }
    ]
  },
  fr: {
    title: 'Heures des résultats d’apprentissage — comment décider',
    intro: 'Les heures des résultats répartissent le temps en établissement du module (théorie + pratique + évaluation formative). La pratique en entreprise et l’évaluation sommative concernent tout le module et ne sont pas réparties. Le champ est facultatif ; s’il est rempli, la somme doit égaler exactement le temps en établissement.',
    sections: [
      { h: '⚖️ Heures automatiques et « Répartir automatiquement »', items: [
        'Dès que les crédits du module sont saisis, chaque résultat affiche une valeur automatique (marquée « auto »). Saisir un nombre le fixe ; les autres résultats automatiques se partagent le reste. Vider le champ le remet en automatique.',
        '« Répartir automatiquement » remet tous les résultats du module en valeur automatique.',
        'Répartit le temps en établissement au prorata du nombre de critères de performance liés à chaque résultat (un résultat sans critère compte pour 1).',
        'Heures entières uniquement, dont la somme égale toujours le total. Exemple : 90 h pour des résultats à 1, 1 et 2 critères → 23 + 22 + 45.',
        'C’est un point de départ documenté, pas une décision : ajustez ensuite.' ] },
      { h: '🧭 À prendre en compte pour ajuster', items: [
        '<strong>Taille du résultat</strong> — plus de critères et d’énoncés d’évaluation demandent généralement plus de temps.',
        '<strong>Complexité</strong> — diagnostic, prise de décision ou étapes multiples demandent plus de temps qu’une procédure routinière.',
        '<strong>Intensité pratique</strong> — la pratique répétée sur outils ou équipements demande plus de temps que la théorie.',
        '<strong>Acquis des apprenants</strong> — un contenu nouveau prend plus de temps qu’un contenu qui prolonge un module précédent.',
        '<strong>Ressources</strong> — si les apprenants se relaient sur un équipement limité, prévoyez du temps en plus.' ] },
      { h: '✅ Vérifier', items: [
        'L’avertissement au-dessus des cartes disparaît quand la somme égale le temps en établissement.',
        'Faites valider la répartition finale par le comité de validation.' ] }
    ]
  },
  ar: {
    title: 'ساعات محصلات التعلم — كيف تُحدَّد',
    intro: 'ساعات المحصلات توزّع الوقت المؤسسي للوحدة (نظري + عملي + تقييم تكويني). أما التطبيق في موقع العمل والتقييم الختامي فيخصّان الوحدة كلها ولا يُوزَّعان على المحصلات. الحقل اختياري، وعند تعبئته يجب أن يساوي مجموع ساعات المحصلات الوقت المؤسسي بالضبط.',
    sections: [
      { h: '⚖️ الساعات التلقائية وزر «توزيع تلقائي»', items: [
        'بمجرد إدخال رصيد الوحدة تظهر لكل محصلة قيمة تلقائية (عليها شارة «تلقائي»). إذا كتبت رقماً يصبح قيمتك أنت، وتتقاسم المحصلات التلقائية الأخرى ما تبقّى. مسح الحقل يعيده إلى التلقائي.',
        'زر «توزيع تلقائي» يعيد كل محصلات الوحدة إلى القيم التلقائية.',
        'يقسم الوقت المؤسسي بنسبة عدد معايير الأداء المرتبطة بكل محصلة (المحصلة التي لا معايير لها تُحسب 1).',
        'بساعات صحيحة فقط، ومجموعها يساوي الإجمالي دائماً. مثال: 90 ساعة على محصلات فيها 1 و1 و2 من المعايير ← 23 + 22 + 45.',
        'هو نقطة بداية موثقة وليس قراراً نهائياً؛ عدّل أي قيمة بعده.' ] },
      { h: '🧭 ما تراعيه عند التعديل', items: [
        '<strong>حجم المحصلة</strong> — كثرة معايير الأداء وعبارات التقييم تحتاج عادةً وقتاً أطول.',
        '<strong>التعقيد</strong> — المحصلة التي فيها تشخيص أو اتخاذ قرار أو خطوات متعددة تحتاج وقتاً أكثر من إجراء روتيني.',
        '<strong>الكثافة العملية</strong> — المحصلة التي تتطلب تمريناً متكرراً على العدد والأجهزة تحتاج وقتاً أكثر من المحصلة النظرية غالباً.',
        '<strong>خلفية المتدربين</strong> — المحتوى الجديد يأخذ وقتاً أطول من محتوى يبني على وحدة سابقة.',
        '<strong>الموارد</strong> — إذا تناوب المتدربون على أجهزة محدودة فأضف وقتاً لذلك.' ] },
      { h: '✅ التحقق', items: [
        'يختفي التنبيه أعلى بطاقات المحصلات عندما يساوي مجموع ساعاتها الوقت المؤسسي.',
        'اعرض التوزيع النهائي على لجنة المراجعة للمصادقة.' ] }
    ]
  }
};
function _showDistGuide() {
  const G = _DIST_GUIDE[_lang()] || _DIST_GUIDE.en;
  const body = `
    <p class="cur-modal-intro">${_esc(G.intro)}</p>
    ${G.sections.map(s => `<div class="cur-guide-sec"><p class="cur-guide-h">${s.h}</p>
      <ul>${s.items.map(it => `<li>${it}</li>`).join('')}</ul></div>`).join('')}`;
  _modal('curDistGuideModal', G.title, '⏱️', body, [{ label: _tx('curClose'), cls: 'cur-btn-primary', close: true }], { wide: true });
}

function _showGuide() {
  const G = _GUIDE[_lang()] || _GUIDE.en;
  const body = `
    <p class="cur-modal-intro">${_esc(G.intro)}</p>
    ${G.sections.map(s => `<div class="cur-guide-sec"><p class="cur-guide-h">${s.h}</p>
      <ul>${s.items.map(it => `<li>${it}</li>`).join('')}</ul></div>`).join('')}`;
  _modal('curGuideModal', G.title, '📘', body, [{ label: _tx('curClose'), cls: 'cur-btn-primary', close: true }], { wide: true });
}

function _ensureHelpButton() {
  const btn = document.getElementById('curHelpBtn');
  if (!btn) return;
  const tip = _tx('curHelpTip');
  btn.title = tip;
  btn.setAttribute('aria-label', tip);
}

// ── Clear ────────────────────────────────────────────────────
export function isModuleCurriculumEmpty() {
  const d = appState.moduleCurriculumData;
  if (!d) return true;
  const s = d.settings || {};
  const def = defaultModuleCurriculumData().settings;
  const settingsDefault = !(s.programmeName || '').trim() && !(s.filePrefix || '').trim() && s.levelStyle !== 'long' && Number(s.hoursPerCredit) === def.hoursPerCredit &&
    Number(s.groupSize) === def.groupSize && SPLIT_KEYS.every(k => Number((s.split || {})[k]) === def.split[k]);
  return settingsDefault && !Object.keys(d.byModule || {}).length;
}
/** Clear This Tab: curriculum data only — modules and LOs are untouched. */
export function clearModuleCurriculum() {
  appState.moduleCurriculumData = defaultModuleCurriculumData();
  _openLOs.clear(); _loSeeded = null;
  renderModuleCurriculum();
  _persistNow();
}

// ── Exported file name ───────────────────────────────────────
// "<prefix>_<code> <short name> <L1 | Level 1> <En|Fr|Ar>.docx", e.g.
// "CUR_CMCN 1-1 Hardware L1 En.docx". The prefix is one project-level
// setting typed by the user; code and short name come from the module
// card (Module Mapping). Only characters a file system rejects are
// removed; spaces are kept.
const _fsSafe = v => String(v || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim();
function _filePrefix() { return _fsSafe(_settings().filePrefix) || 'CUR'; }
function _fileStem(module) {
  const lvl = _moduleLevel(module);
  const lvlPart = !lvl ? '' : (_settings().levelStyle === 'long' ? curLabel('curLevelN', { n: lvl }) : `L${lvl}`);
  return [_fsSafe(_moduleCode(module)), _fsSafe(_moduleShortName(module)), _fsSafe(lvlPart)].filter(Boolean).join(' ');
}
export function curFileName(module) {
  const lang = { en: 'En', fr: 'Fr', ar: 'Ar' }[_lang()] || 'En';
  return `${_filePrefix()}_${_fileStem(module)} ${lang}.docx`;
}

// ── Export: model for the Word builder ───────────────────────
export function getCurriculumModel(moduleId, opts = {}) {
  const mods = _modules();
  const module = mods.find(m => m.id === moduleId);
  if (!module) return null;
  const blank = !!opts.blank;
  const rec = _modRec(module.id) || {};
  const s = _settings();
  const lvl = _moduleLevel(module);
  const hrs = _moduleHours(module);
  const split = _effSplit(rec);
  const prog = _programmeName();
  const effH = _effectiveLOHours(module);
  const los = _liveLOs(module).map((o, i) => {
    const r = _loRec(module.id, o.id) || {};
    const n = i + 1;
    const txt = k => blank ? '' : _str(r[k]).trim();
    return {
      n, statement: _str(o.statement).trim(),
      context: blank ? '' : (r.context === undefined ? curLabel('curDefaultContext') : _str(r.context).trim()),
      methodology: txt('methodology'), discussion: txt('discussion'), demonstration: txt('demonstration'),
      practice: txt('practice'), selfDirected: txt('selfDirected'),
      assessStatements: blank ? [] : _clean(r.assessStatements).map((t, k) => `${n}-${k + 1} ${t}`),
      assessMethods: blank ? [] : _clean(r.assessMethods),
      hours: blank ? '' : ((effH.get(o.id) || {}).h ?? ''),
    };
  });
  const code = _moduleCode(module);
  const lang = { en: 'En', fr: 'Fr', ar: 'Ar' }[_lang()] || 'En';
  const prefix = _filePrefix();
  const fileName = curFileName(module);
  return {
    blank, rtl: _isRTL(), lang,
    code, title: _str(module.title).trim(), shortName: _moduleShortName(module),
    level: lvl, levelLabel: lvl ? String(lvl) : '',
    credits: blank ? '' : (Number(rec.credits) > 0 ? rec.credits : ''),
    purpose: blank ? '' : _str(rec.purpose).trim(),
    prerequisites: blank ? [] : _arr(rec.prerequisites)
      .map(id => mods.find(m => m.id === id)).filter(Boolean)
      .map(m => `${_moduleCode(m)} ${m.title || ''}`.trim()),
    hours: blank ? null : hrs,
    pct: Object.fromEntries(SPLIT_KEYS.map(k => [k, Number(split[k]) || 0])),
    programme: prog ? `${prog}${lvl ? ` — ${curLabel('curLevelN', { n: lvl })}` : ''}` : '',
    osLink: _osLinkLines(module),
    los,
    tools: blank ? [] : _clean(rec.tools), equipment: blank ? [] : _clean(rec.equipment),
    ppe: blank ? [] : _clean(rec.ppe), materials: blank ? [] : _clean(rec.materials),
    resources: blank ? [] : _clean(rec.resources),
    facilities: blank ? [] : _arr(rec.facilities)
      .map(f => ({ item: _str(f && f.item).trim(), qty: _str(f && f.qty).trim() })).filter(f => f.item || f.qty),
    groupSize: s.groupSize,
    fileName, filePrefix: prefix, docLabel: _fileStem(module),
    L: curLabel,
  };
}

export async function exportModuleCurriculumWord(moduleId, opts = {}) {
  const model = getCurriculumModel(moduleId || (_selectedModule() || {}).id, opts);
  if (!model) { showStatus(_tx('dlgNoModules'), 'error'); return false; }
  const ok = await exportCurriculumDocx(model);
  if (ok) showStatus('✓ ' + _txf('msgCurExported', { file: model.fileName }), 'success');
  return ok;
}

// ── Export dialog (one module per click — no batch) ─────────
let _blankPref = false;
export function openCurExportDialog() {
  const mods = _modules();
  const cur = _selectedModule();
  if (!mods.length) {
    _modal('curExportModal', _tx('dlgTitle'), '📘', `<p class="cur-modal-intro">${_esc(_tx('dlgNoModules'))}</p>`,
      [{ label: _tx('curClose'), cls: 'cur-btn-primary', close: true }]);
    return;
  }
  const ordered = cur ? [cur, ...mods.filter(m => m !== cur)] : mods;
  const ov = _modal('curExportModal', _tx('dlgTitle'), '📘', `
    <p class="cur-modal-intro">${_esc(_tx('dlgIntro'))}</p>
    <label class="cur-check cur-blank-opt"><input type="checkbox" id="curBlankOpt" ${_blankPref ? 'checked' : ''}>
      <span><strong>${_esc(_tx('dlgBlank'))}</strong><br><small>${_esc(_tx('dlgBlankHint'))}</small></span></label>
    <div class="cur-exp-list">${ordered.map(m => {
      const i = mods.indexOf(m), p = moduleCompleteness(m);
      return `<div class="cur-exp-row ${m === cur ? 'is-current' : ''}">
        <div class="cur-exp-name"><span>${_esc(_moduleLabel(m, i))}</span>
          <small><bdi>${_esc(_moduleCode(m))}</bdi> · ${p >= 100 ? '✓' : p + '%'}${m === cur ? ` · ${_esc(_tx('dlgCurrent'))}` : ''}</small></div>
        <button type="button" class="cur-btn-primary cur-exp-dl" data-cur-dl="${_esc(m.id)}">⬇ ${_esc(_tx('dlgDownload'))}</button>
      </div>`; }).join('')}</div>`,
    [{ label: _tx('curClose'), cls: 'cur-btn-ghost', close: true }], { wide: true });
  ov.querySelector('#curBlankOpt').addEventListener('change', e => { _blankPref = e.target.checked; });
  ov.addEventListener('click', async e => {
    const b = e.target.closest('[data-cur-dl]');
    if (!b || b.disabled) return;
    b.disabled = true;
    const ok = await exportModuleCurriculumWord(b.getAttribute('data-cur-dl'), { blank: _blankPref });
    b.disabled = false;
    if (ok) { b.classList.add('is-done'); b.textContent = '✓ ' + _tx('dlgDone'); }
  });
}

// ── "Standard" toolbar menu ──────────────────────────────────
function _closeMenu(returnFocus) {
  const m = document.getElementById('curStdMenu');
  const btn = document.getElementById('btnExportOS');
  if (m) m.remove();
  if (btn) btn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', _menuOutside, true);
  window.removeEventListener('resize', _menuResize);
  if (returnFocus && btn) btn.focus();
}
function _menuOutside(e) {
  if (e.target.closest('#curStdMenu') || e.target.closest('#btnExportOS')) return;
  _closeMenu(false);
}
function _menuResize() { _closeMenu(false); }

export function toggleStandardMenu(anchor, viaKeyboard) {
  if (document.getElementById('curStdMenu')) { _closeMenu(true); return; }
  const btn = anchor || document.getElementById('btnExportOS');
  if (!btn) return;
  const menu = document.createElement('div');
  menu.id = 'curStdMenu';
  menu.className = 'cur-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', btn.getAttribute('title') || '');
  menu.setAttribute('dir', _isRTL() ? 'rtl' : 'ltr');
  menu.innerHTML = `
    <button type="button" role="menuitem" class="cur-menu-item" data-mnu="os"><span class="cur-menu-ic cur-ic-os">OS</span>${_esc(_tx('mnuOS'))}</button>
    <button type="button" role="menuitem" class="cur-menu-item" data-mnu="cur"><span class="cur-menu-ic cur-ic-cur">CUR</span>${_esc(_tx('mnuCUR'))}</button>
    <button type="button" role="menuitem" class="cur-menu-item" aria-disabled="true" disabled data-mnu="cbc"><span class="cur-menu-ic cur-ic-cbc">CBC</span>${_esc(_tx('mnuCBC'))}<span class="cur-soon">${_esc(_tx('mnuSoon'))}</span></button>`;
  document.body.appendChild(menu);
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'true');

  // Position under the button; mirror for RTL; clamp to the viewport so
  // it never runs off a phone screen.
  const r = btn.getBoundingClientRect();
  const mw = Math.min(menu.offsetWidth || 280, window.innerWidth - 16);
  menu.style.width = mw + 'px';
  let left = _isRTL() ? r.right - mw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  menu.style.left = left + 'px';
  menu.style.top = Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + 'px';

  const items = () => Array.from(menu.querySelectorAll('.cur-menu-item:not([disabled])'));
  menu.addEventListener('keydown', e => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); _closeMenu(true); }
    else if (e.key === 'Tab') { _closeMenu(false); }
  });
  menu.addEventListener('click', e => {
    const it = e.target.closest('.cur-menu-item');
    if (!it || it.disabled) return;
    const what = it.getAttribute('data-mnu');
    _closeMenu(false);
    if (what === 'os') exportOccupationalStandardWord();
    else if (what === 'cur') openCurExportDialog();
  });
  setTimeout(() => document.addEventListener('pointerdown', _menuOutside, true), 0);
  window.addEventListener('resize', _menuResize);
  if (viaKeyboard) items()[0].focus(); else menu.querySelector('.cur-menu-item').focus({ preventScroll: true });
}

/** Wires the toolbar button (called once from events.js). */
export function setupStandardExportMenu() {
  const btn = document.getElementById('btnExportOS');
  if (!btn || btn.__curMenu) return;
  btn.__curMenu = true;
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', e => { toggleStandardMenu(btn, e.detail === 0); });
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!document.getElementById('curStdMenu')) toggleStandardMenu(btn, true); }
    if (e.key === 'Escape') _closeMenu(true);
  });
}

// ── Event wiring (delegated, once) ───────────────────────────
let _wired = false;
function _wire() {
  if (_wired) return;
  const tab = document.getElementById(TAB_ID);
  if (!tab) return;
  _wired = true;

  tab.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('textarea.cur-auto')) _autoGrow(t);
    // plain fields
    if (t.hasAttribute('data-cs') && t.hasAttribute('data-ck')) {
      _setField(t.getAttribute('data-cs'), t.getAttribute('data-ck'), t.value, t.getAttribute('data-lo'));
      _refreshDerived(); _schedulePersist(); return;
    }
    // list items
    if (t.matches('.cur-li-input')) {
      const tgt = _listTarget(t.closest('.cur-list'), true);
      if (!tgt) return;
      const i = parseInt(t.getAttribute('data-idx'), 10);
      while (tgt.arr.length <= i) tgt.arr.push('');
      tgt.arr[i] = t.value;
      _refreshDerived(); _schedulePersist(); return;
    }
    // facilities
    if (t.hasAttribute('data-fac-idx')) {
      const module = _selectedModule();
      const rec = _modRec(module.id, true);
      if (!Array.isArray(rec.facilities)) rec.facilities = [];
      const i = parseInt(t.getAttribute('data-fac-idx'), 10);
      while (rec.facilities.length <= i) rec.facilities.push({ item: '', qty: '' });
      rec.facilities[i][t.getAttribute('data-fac-key')] = t.value;
      _schedulePersist();
    }
  });

  tab.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('.cur-module-select')) {
      _selId = t.value; renderModuleCurriculum(); return;
    }
    if (t.hasAttribute('data-cur-prereq')) {
      const module = _selectedModule();
      const rec = _modRec(module.id, true);
      const set = new Set(_arr(rec.prerequisites));
      const id = t.getAttribute('data-cur-prereq');
      if (t.checked) set.add(id); else set.delete(id);
      // keep Module Mapping order
      rec.prerequisites = _modules().map(m => m.id).filter(x => set.has(x));
      _schedulePersist(); return;
    }
    if (t.matches('[data-cur-action="toggle-override"]')) {
      const module = _selectedModule();
      const rec = _modRec(module.id, true);
      rec.splitOverride = t.checked ? { ..._settings().split } : null;
      renderModuleCurriculum(); _schedulePersist(); return;
    }
    if (t.hasAttribute('data-cs') && (t.getAttribute('data-ck') === 'hoursPerCredit' || t.getAttribute('data-ck') === 'groupSize')) {
      // an invalid value was ignored on input — show the stored one again
      t.value = _settings()[t.getAttribute('data-ck')];
    }
    if (t.hasAttribute('data-cs') && t.getAttribute('data-ck') === 'code') {
      const module = _selectedModule();
      assignModuleCode(module, t.value);
      t.value = getModuleCode(module);
      const chip = t.closest('.cur-field') && t.closest('.cur-field').querySelector('.cur-chip');
      if (chip) chip.hidden = isModuleCodeManual(module);
      _refreshDerived();
      _schedulePersist();
    }
  });

  tab.addEventListener('focusout', e => {
    if (e.target.closest && e.target.closest('#curRoot')) { if (_saveTimer) _persistNow(); }
  });

  tab.addEventListener('toggle', e => {
    const d = e.target;
    if (!d.matches || !d.matches('details[data-cur-details]')) return;
    const module = _selectedModule();
    if (d.getAttribute('data-cur-details') === 'settings') _openSettings = d.open;
    else if (module) {
      const k = module.id + '|' + d.getAttribute('data-lo');
      if (d.open) _openLOs.add(k); else _openLOs.delete(k);
    }
  }, true);

  tab.addEventListener('keydown', e => {
    const t = e.target;
    if (t.matches && t.matches('.cur-li-input') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const listEl = t.closest('.cur-list');
      const tgt = _listTarget(listEl, true);
      const i = parseInt(t.getAttribute('data-idx'), 10);
      while (tgt.arr.length <= i) tgt.arr.push('');
      tgt.arr.splice(i + 1, 0, '');
      _rerenderKeepFocus(_listSelector(listEl, i + 1));
      _schedulePersist();
    }
  });

  tab.addEventListener('click', e => {
    if (e.target.closest('#curHelpBtn')) { _showGuide(); return; }
    const b = e.target.closest('[data-cur-action]');
    if (!b || b.tagName === 'SELECT' || b.type === 'checkbox') return;
    const a = b.getAttribute('data-cur-action');
    const module = _selectedModule();
    const mods = _modules();
    if (a === 'goto-mm') { if (window.switchTab) window.switchTab('module-mapping-tab'); return; }
    if (!module) return;
    if (a === 'prev-module' || a === 'next-module') {
      const i = mods.indexOf(module) + (a === 'next-module' ? 1 : -1);
      if (mods[i]) { _selId = mods[i].id; renderModuleCurriculum(); document.querySelector('#curRoot .cur-module-select')?.focus(); }
    } else if (a === 'export-this') {
      exportModuleCurriculumWord(module.id, { blank: false });
    } else if (a === 'suggest-code') {
      assignModuleCode(module, '');
      renderModuleCurriculum(); _schedulePersist();
    } else if (a === 'suggest-criteria') {
      _suggestFromCriteria(b.getAttribute('data-lo'));
    } else if (a === 'add-method') {
      const lo = b.getAttribute('data-lo');
      const r = _loRec(module.id, lo, true);
      const n = _addToList(r, 'assessMethods', [b.getAttribute('data-val')]);
      if (n) { renderModuleCurriculum(); _schedulePersist(); } else showStatus(_tx('curNothingNew'), 'info');
    } else if (a === 'distribute-hours') {
      _distributeLOHours();
    } else if (a === 'dist-help') {
      _showDistGuide();
    } else if (a === 'suggest-ta') {
      _openTAPicker();
    } else if (a === 'li-add' || a === 'li-del') {
      const listEl = b.closest('.cur-list');
      const tgt = _listTarget(listEl, true);
      if (!tgt) return;
      if (a === 'li-add') {
        const n = Math.max(tgt.arr.length, 1);
        if (!tgt.arr.length) tgt.arr.push('');
        tgt.arr.push('');
        _rerenderKeepFocus(_listSelector(listEl, n));
      } else {
        tgt.arr.splice(parseInt(b.getAttribute('data-idx'), 10), 1);
        renderModuleCurriculum();
      }
      _schedulePersist();
    } else if (a === 'fac-add' || a === 'fac-del') {
      const rec = _modRec(module.id, true);
      if (!Array.isArray(rec.facilities)) rec.facilities = [];
      if (a === 'fac-add') {
        if (!rec.facilities.length) rec.facilities.push({ item: '', qty: '' });
        rec.facilities.push({ item: '', qty: '' });
        _rerenderKeepFocus(`#curRoot .cur-fac-item[data-fac-idx="${rec.facilities.length - 1}"]`);
      } else {
        rec.facilities.splice(parseInt(b.getAttribute('data-idx'), 10), 1);
        renderModuleCurriculum();
      }
      _schedulePersist();
    }
  });
}

// ── Global listeners ─────────────────────────────────────────
window.addEventListener('dacum:langchange', () => {
  if (_root()) renderModuleCurriculum();
  _closeMenu(false);
  const sb = document.querySelector('.dps-nav-item[data-target-tab="' + TAB_ID + '"]');
  if (sb) {
    const label = _tx('tabModuleCurriculum');
    const txt = sb.querySelector('.dps-nav-text');
    if (txt) txt.textContent = label;
    sb.setAttribute('data-tooltip', label);
  }
});
document.addEventListener('dacum:module-labels-changed', () => { if (_root()) renderModuleCurriculum(); });
document.addEventListener('dacum:project-loaded', () => {
  _selId = null; _openLOs.clear(); _loSeeded = null;
  if (_root()) renderModuleCurriculum();
});
