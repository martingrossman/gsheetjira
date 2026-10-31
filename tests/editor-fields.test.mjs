import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import C from '../Core.js';

test('the detailed editor retains one named control for every editable issue field', async () => {
  const html = await readFile(new URL('../Index.html', import.meta.url), 'utf8');
  const form = html.match(/<form id="issue-form">([\s\S]*?)<\/form>/)[1];
  const names = Array.from(form.matchAll(/\bname="([^"]+)"/g), match => match[1]);
  const generated = new Set(['id', 'createdAt', 'updatedAt', 'completedDate', 'rank']);
  const expected = C.fields.filter(field => !generated.has(field.key)).map(field => field.key).concat('taskTypeId');
  assert.equal(names.length, new Set(names).size, 'duplicate controls can corrupt FormData');
  assert.deepEqual(names.slice().sort(), expected.sort());
});
