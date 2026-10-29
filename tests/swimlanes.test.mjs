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
  const helpers = ['inEpicWithin', 'boardEpicId', 'boardMoveParent'].map(name => client.match(new RegExp(`  function ${name}\\([^]*?\\n  }`))?.[0]).join('\n');
  const records = [
    { id: 'e1', type: 'Epic' }, { id: 'e2', type: 'Epic' },
    { id: 's1', type: 'Story', parentId: 'e1' },
    { id: 't1', type: 'Task', parentId: 's1' },
    { id: 't2', type: 'Task', parentId: 'e1' },
    { id: 't3', type: 'Task', parentId: 't1' },
    { id: 't4', type: 'Task', parentId: '' }
  ];
  const moveParent = new Function('state', 'issueById', `${helpers}; return boardMoveParent;`)({ issues: records }, id => records.find(issue => issue.id === id));
  assert.equal(moveParent(records[3], 'e1'), 's1');
  assert.equal(moveParent(records[5], 'e1'), 't1');
  assert.throws(() => moveParent(records[3], 'e2'), /parent has been preserved/);
  assert.throws(() => moveParent(records[5], ''), /parent has been preserved/);
  assert.equal(moveParent(records[2], 'e2'), 'e2');
  assert.equal(moveParent(records[4], ''), '');
  assert.equal(moveParent(records[6], 'e2'), 'e2');
  assert.throws(() => moveParent(records[4], 'missing'), /existing Epic/);
  assert.match(client, /!state\.swimlanes \|\| \(laneId \?/);
});

test('grouped lanes represent epics once and keep epic details and schedule accessible', async () => {
  const client = await read('Client.html');

  assert.ok(client.includes('items: issues.filter(issue => issue.id !== epic.id && inEpicWithin(issue, epic.id))'));
  assert.ok(client.includes('class="swimlane-edit" data-open="${escape(epic.id)}"'));
  assert.ok(client.includes('const epicSchedule = epic ? C.epicScheduleRange(epic.id, state.issues) : null;'));
  assert.ok(client.includes('renderTrack(epic, topOffset + 22, epicSchedule, true)'));
});

test('Epic dates are derived from child schedules throughout the UI', async () => {
  const [index, client] = await Promise.all([read('Index.html'), read('Client.html')]);

  assert.match(client, /function effectiveDates\(issue\)[\s\S]*?C\.epicScheduleRange/);
  assert.match(client, /const overdue = issues\.filter\(i => \{ const dueDate = effectiveDates\(i\)\.dueDate/);
  assert.match(client, /issue\.type === 'Epic' && \['startDate', 'dueDate'\]\.includes\(key\)/);
  assert.match(client, /input\.disabled = isEpic/);
  assert.match(client, /const exportIssues = filtered\(\)\.map\(issue => issue\.type === 'Epic'/);
  assert.match(index, /class="derived-date-note" hidden/);
});
