import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Kanban quick creation inherits the current epic for tasks and stories', async () => {
  const client = await readFile(new URL('../Client.html', import.meta.url), 'utf8');
  assert.match(client, /kind === 'Epic' \? '' : \(input\.dataset\.quickParentId \|\| ''\)/);
  assert.match(client, /priority: 'Medium', parentId/);
  assert.match(client, /target\.closest\('\.swimlane'\)\?\.dataset\.epicLane/);
});
