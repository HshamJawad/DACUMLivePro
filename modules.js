// ============================================================
// /modules.js
// Competency Clustering, Learning Outcomes, and Module Mapping
//
// 3.76.0: this file used to hold all three (4,544 lines). The code now
// lives in four files, moved unchanged:
//
//   modules_shared.js     translation / escaping helpers, criteria
//                         lookups, the store writer, Undo / Redo for
//                         Learning Outcomes and Module Mapping
//   clusters.js           Competency Clusters
//   learning_outcomes.js  Learning Outcomes
//   module_mapping.js     Module Mapping, levels, coverage, module
//                         identity, exports, Module Builder handoff
//
// Every other file still imports from './modules.js', which re-exports
// all four — so nothing outside had to change. New code may import the
// specific file directly.
//
// The four import each other (as the sections of one file always
// referred to each other). That is safe because no top-level value is
// computed from another file at load time — only functions use them,
// after every file has loaded. Keep it that way: a top-level `const`
// built from another of these files would break on startup.
// ============================================================

export * from './modules_shared.js';
export * from './clusters.js';
export * from './learning_outcomes.js';
export * from './module_mapping.js';
