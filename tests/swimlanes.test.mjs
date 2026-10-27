import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('Kanban exposes a persisted swimlane toggle', async () => {
  const [index, client] = await Promise.all([read('Index.html'), read('Client.html')]);

  assert.match(index, /id="swimlanes-toggle"/);
  assert.match(index, /type="checkbox" checked/);
  assert.match(client, /swimlanes: true/);
  assert.match(client, /state\.swimlanes = ui\.swimlanes !== false/);
  assert.match(client, /setSwimlanes\(event\.target\.checked\); render\(\)/);
});

test('Kanban has a flat rendering path and preserves epic relationships', async () => {
  const client = await read('Client.html');

  assert.match(client, /if \(!state\.swimlanes\) \{[\s\S]*?renderColumns\(issues\)/);
  assert.match(client, /!state\.swimlanes \? issue\.parentId/);
  assert.match(client, /!state\.swimlanes \|\| \(laneId \?/);
});

test('grouped lanes represent epics once and keep epic details and schedule accessible', async () => {
  const client = await read('Client.html');

  assert.ok(client.includes('items: issues.filter(issue => issue.id !== epic.id && inEpicWithin(issue, epic.id))'));
  assert.ok(client.includes('class="swimlane-edit" data-open="${escape(epic.id)}"'));
  assert.ok(client.includes('const epicSchedule = epic ? C.epicScheduleRange(epic.id, state.issues) : null;'));
  assert.ok(client.includes('renderTrack(epic, topOffset + 22, epicSchedule, true)'));
});
