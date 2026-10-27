// ============================================================
// /escape.js
// The ONE place that turns text into HTML-safe text.
//
// Until 3.140.1 about twenty files each carried their own copy, and two
// of them (ai_client.js, workshop.js) did not escape quotes — safe in
// element text, not in an attribute. Every copy now comes from here.
//
//   esc(v)           null/undefined → '' ; everything else is made a string
//                    and & < > " ' are escaped. 0 and false become "0" and
//                    "false". The default choice.
//   escFalsyEmpty(v) the same, but every falsy value (0, false, '', null,
//                    undefined, NaN) gives ''. This is the behaviour of
//                    renderer.js escapeHtml() and a few older helpers; it
//                    is kept so those files render exactly as before.
//
// Use esc() in new code. In an attribute (title="…", value="…") the text
// must always go through one of these two.
// ============================================================

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => MAP[c]);
}

export function escFalsyEmpty(v) {
  return v ? esc(v) : '';
}
