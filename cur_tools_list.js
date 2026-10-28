// ============================================================
// /cur_tools_list.js — 3.142.0
// The single "tools, equipment and materials" list of the CUR sub-tab
// (Module Curriculum), written the way Module Builder's «Tools &
// Resources» tab keeps it, so a list sent there reads back unchanged:
//
//   • ONE text per module, a line per item
//   • «Numbering» lays every line out as «1- item», «Bullets» as «▪ item»;
//     pressed again, the layout is taken off
//   • a marker at the start of a line is never part of the item
//     (never «2-inch pipe»: a marker must be followed by a space)
//
// Pure functions — no DOM, no state.
// ============================================================

const MARK = /^\s*(?:[•·▪●○◦■□➢➤►✓✔*]|[-–—](?=\s)|\(?\d{1,3}\s*[.)\-–](?=\s)|\(?[A-Za-z]\s*[.)](?=\s)|[٠-٩۰-۹]{1,3}\s*[.)\-](?=\s)|\(?[أ-ي]\s*[.)\-](?=\s))\s*/;

/** Lines of text → items: invisible characters removed, the bullet or
 *  number at the start of a line removed, empty lines dropped. */
export function parseToolsText(raw) {
  return String(raw == null ? '' : raw)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .replace(/ـ+/g, '')
    .replace(/[\u00A0\u2007\u202F\t\f\v]/g, ' ')
    .replace(/[\u2028\u2029]/g, '\n')
    .split('\n')
    .map(l => l.replace(MARK, '').replace(/ {2,}/g, ' ').trim())
    .filter(Boolean);
}

/** How the text is laid out now: 'num', 'bul' or 'none'. */
export function toolsStyleOf(text) {
  const ls = String(text || '').split('\n').filter(l => l.trim());
  if (!ls.length) return 'none';
  if (ls.every(l => /^\s*\d{1,3}-\s/.test(l))) return 'num';
  if (ls.every(l => /^\s*▪\s/.test(l))) return 'bul';
  return 'none';
}

/** Items → text in a layout ('num', 'bul' or 'none'). */
export function formatToolsItems(items, style) {
  return items.map((t, i) => style === 'num' ? `${i + 1}- ${t}` : style === 'bul' ? `▪ ${t}` : t).join('\n');
}

const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

/** Toggles a layout: laid out that way already → taken off. */
export function applyToolsStyle(text, style) {
  const items = parseToolsText(text);
  if (!items.length) return String(text || '');
  return formatToolsItems(items, toolsStyleOf(text) === style ? 'none' : style);
}

/** Adds items that are not on the list yet, keeping its layout. */
export function addToolsItems(text, items) {
  const cur = parseToolsText(text);
  const have = new Set(cur.map(norm));
  let added = 0, skipped = 0;
  (items || []).forEach(t => {
    const k = norm(t);
    if (!k) return;
    if (have.has(k)) { skipped++; return; }
    have.add(k); cur.push(String(t).trim()); added++;
  });
  return { text: formatToolsItems(cur, toolsStyleOf(text)), added, skipped };
}
