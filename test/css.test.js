/* the poster's own CSS variables must not share a name with the studio UI's theme (studio-ui-v3.css :root):
   a poster colour left unset falls back to its default only if no page-level variable of that name exists
   (--panel once picked up the UI's dark grey, so plain posters came out dark) */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('poster CSS variables with a fallback are not defined by the studio UI theme', () => {
  const ui = fs.readFileSync(new URL('../studio/studio-ui-v3.css', import.meta.url), 'utf8');
  const canvas = fs.readFileSync(new URL('../studio/studio-canvas-v3.css', import.meta.url), 'utf8');
  const defined = new Set([...ui.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  const withFallback = new Set([...canvas.matchAll(/var\((--[\w-]+),/g)].map(m => m[1]));
  const clash = [...withFallback].filter(v => defined.has(v));
  assert.deepEqual(clash, []);
});
