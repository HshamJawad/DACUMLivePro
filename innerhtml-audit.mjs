#!/usr/bin/env node
/* ============================================================
   innerhtml-audit.mjs
   ------------------------------------------------------------
   Looks at every place the app writes HTML from a template
   (.innerHTML = / += , .outerHTML = , insertAdjacentHTML) and
   reports a ${...} that puts TEXT A PERSON TYPED — task.text,
   duty.title, item.name … — into the page without passing it
   through esc() / escapeHtml() / a translation function.

   It is a safety net, not a proof: it recognises property names
   (.text, .title, .name, .label …), so a value that was escaped
   earlier into a variable is not examined, and a text field with
   an unusual name is not seen. It exists to catch the commonest
   slip — a new  ${task.text}  with no escape around it.

       node innerhtml-audit.mjs .            fail on any NEW finding
       node innerhtml-audit.mjs . --list     print every finding
       node innerhtml-audit.mjs . --update   accept the current findings

   Findings already reviewed are kept in innerhtml-audit.baseline.json
   (file + expression, not line numbers, so edits elsewhere do not
   disturb it). Add to it only after checking that the value is
   escaped, a number, or an internal constant.
   ============================================================ */

import fs from 'fs';
import path from 'path';

const args   = process.argv.slice(2);
const root   = args.find(a => !a.startsWith('--')) || '.';
const LIST   = args.includes('--list');
const UPDATE = args.includes('--update');
const BASELINE = path.join(root, 'innerhtml-audit.baseline.json');

// Calls whose result is already safe to put in HTML.
const SAFE_CALLS = ['esc', '_esc', 'escFalsyEmpty', 'escapeHtml', 'lwEscapeHtml', 'encodeURIComponent',
  '_t', '_tf', '_tx', '_txf', '_tp', '_tc', 't', 'tf', 'tp', 'tc', 'pt', 'i18n.t', 'i18n.tf', 'i18n.tc', 'window.i18n.t', 'window.i18n.tf', 'window.i18n.tc'];
// Property names that hold text a person typed (or an AI wrote for them).
const TEXTY = /\.(text|title|name|label|desc|description|statement|criterion|criteria|note|notes|jobTitle|occupation|comment|message|msg|original|translation|content|value|heading|caption|reason|rationale|summary|hint|term)\b(?!\s*\()/;

const SKIP_DIRS = new Set(['vendor', 'tests', 'node_modules', '.git', '.github']);
const SKIP_FILES = new Set(['translations.js', 'qrcode.min.js']);

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...listFiles(path.join(dir, e.name))); }
    else if (e.name.endsWith('.js') && !SKIP_FILES.has(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

// ── A small scanner: strings, template literals with nested ${ }, brackets ──
function scanRegex(s, i) {                    // s[i] === '/' opening a regex literal; returns index after it
  i++; let cls = false;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '[') cls = true; else if (c === ']') cls = false;
    else if (c === '/' && !cls) { i++; while (/[a-z]/i.test(s[i] || '')) i++; return i; }
    else if (c === '\n') return i;
    i++;
  }
  return i;
}
// A "/" starts a regex when the last significant character before it cannot end an operand.
const startsRegex = (s, i) => { let j = i - 1; while (j >= 0 && /\s/.test(s[j])) j--; return j < 0 || '(,=:[!&|?{};+-*%<>~^'.includes(s[j]) || /\b(return|typeof|case)$/.test(s.slice(Math.max(0, j - 6), j + 1)); };
function scanString(s, i) { const q = s[i]; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } return i + 1; }
function scanTemplate(s, i, exprs) {          // s[i] === '`'; returns index after the closing backtick
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && s[i + 1] === '{') {
      const start = i + 2; const end = scanExpr(s, start, exprs);
      exprs.push(s.slice(start, end)); i = end + 1; continue;
    }
    i++;
  }
  return i;
}
function scanExpr(s, i, exprs) {              // after "${": returns index of the matching "}"
  let depth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") { i = scanString(s, i); continue; }
    if (c === '`') { i = scanTemplate(s, i, exprs); continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2) + 2 || s.length; continue; }
    if (c === '/' && startsRegex(s, i)) { i = scanRegex(s, i); continue; }
    if (c === '{') depth++;
    if (c === '}') { if (depth === 0) return i; depth--; }
    i++;
  }
  return i;
}
function statementInterpolations(s, from) {   // from the sink to the end of its statement
  const exprs = []; let i = from, depth = 0;
  const limit = Math.min(s.length, from + 40000);
  while (i < limit) {
    const c = s[i];
    if (c === '"' || c === "'") { i = scanString(s, i); continue; }
    if (c === '`') { i = scanTemplate(s, i, exprs); continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < limit && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2) + 2 || limit; continue; }
    if (c === '/' && startsRegex(s, i)) { i = scanRegex(s, i); continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    if (c === ';' && depth === 0) break;
    i++;
  }
  return exprs;
}

// Remove f(...) calls of the safe functions, and string literals, from an expression.
function neutralise(expr) {
  let e = expr;
  for (const name of SAFE_CALLS) {
    const re = new RegExp('(?<![\\w$.])' + name.replace(/\./g, '\\.') + '\\s*\\(', 'g');
    let m;
    while ((m = re.exec(e))) {
      let i = m.index + m[0].length, d = 1;
      while (i < e.length && d) { if (e[i] === '(') d++; else if (e[i] === ')') d--; i++; }
      e = e.slice(0, m.index) + ' ' + e.slice(i); re.lastIndex = m.index;
    }
  }
  return e.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''");
}

const SINK = /\.(?:innerHTML|outerHTML)\s*\+?=(?!=)|\.insertAdjacentHTML\s*\(\s*['"][a-z]+['"]\s*,/g;
const findings = [];
for (const file of listFiles(root).sort()) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).split(path.sep).join('/');
  let m;
  while ((m = SINK.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    for (const expr of statementInterpolations(src, m.index + m[0].length)) {
      const rest = neutralise(expr);
      if (TEXTY.test(rest)) findings.push({ key: rel + ' | ' + expr.replace(/\s+/g, ' ').trim().slice(0, 140), rel, line });
    }
  }
}

const known = new Set(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).reviewed : []);
const keys = [...new Set(findings.map(f => f.key))].sort();

if (UPDATE) {
  fs.writeFileSync(BASELINE, JSON.stringify({ note: 'Reviewed ${...} in innerHTML templates: each is escaped, a number or an internal constant. See innerhtml-audit.mjs.', reviewed: keys }, null, 2) + '\n');
  console.log('Baseline written: ' + keys.length + ' reviewed expression(s).');
  process.exit(0);
}

const fresh = findings.filter(f => !known.has(f.key));
if (LIST) findings.forEach(f => console.log((known.has(f.key) ? 'reviewed  ' : 'NEW       ') + f.rel + ':' + f.line + '  ' + f.key.split(' | ')[1]));
const stale = [...known].filter(k => !keys.includes(k));

console.log('innerHTML audit: ' + findings.length + ' text-like interpolation(s) found, ' + known.size + ' in the reviewed baseline' +
  (stale.length ? ' (' + stale.length + ' baseline entr' + (stale.length === 1 ? 'y' : 'ies') + ' no longer present)' : '') + '.');
if (fresh.length) {
  console.log('\nNEW — put each through esc() (or confirm it is safe and run with --update):');
  const seen = new Set();
  fresh.forEach(f => { if (!seen.has(f.key)) { seen.add(f.key); console.log('  ' + f.rel + ':' + f.line + '   ${' + f.key.split(' | ')[1] + '}'); } });
  console.log('\nINNERHTML AUDIT FAILED');
  process.exit(1);
}
console.log('INNERHTML AUDIT PASSED');
