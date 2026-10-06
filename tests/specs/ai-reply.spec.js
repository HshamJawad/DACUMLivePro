// Unit tests for the one AI call path (ai_client.js, 3.74.0): how a
// reply is read. Run inside the page, where the module really lives.
const { test, expect } = require('@playwright/test');
const { openApp } = require('../helpers');

async function run(page, cases) {
  return page.evaluate(async (cases) => {
    const { parseAIReply, classifyAIError } = await import('./ai_client.js');
    return cases.map(data => {
      try { return { ok: parseAIReply(data) }; }
      catch (e) { return { kind: classifyAIError(e), msg: e.message }; }
    });
  }, cases);
}
const blk = (...t) => ({ content: t.map(text => ({ type: 'text', text })) });

test('plain, fenced, prose-wrapped and split replies are read', async ({ page }) => {
  await openApp(page);
  const r = await run(page, [
    blk('{"a":1}'),
    blk('```json\n{"a":1}\n```'),
    blk('Here is the JSON:\n{"a":1}\nDone.'),
    blk('{"a":', '1}'),
    { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: '{"a":1}' }] },
  ]);
  r.forEach(x => expect(x).toEqual({ ok: { a: 1 } }));
});

test('empty, garbage and cut-off replies fail as "incomplete"', async ({ page }) => {
  await openApp(page);
  const r = await run(page, [blk(''), {}, blk('sorry, cannot'),
    { ...blk('{"duties":[{"title":"A"'), stop_reason: 'max_tokens' }]);
  r.forEach(x => expect(x.kind).toBe('incomplete'));
  expect(r[3].msg).toMatch(/cut off/);
});
