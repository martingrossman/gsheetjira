import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../QuickAdd.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const projectUrl = 'https://example.invalid/test-spreadsheet';
const epic = { id: 'TEST-1', type: 'Epic', summary: 'Test Epic', rank: 1 };
function service() {
  return { requests: [], receipts: new Map(), nextOperation: 0 };
}
function boot({ storage = new Map(), backend = service(), url = projectUrl, issues = [epic], storageFailure = false, loadFailure = false } = {}) {
  const elements = new Map();
  function Option(text, value) { this.text = text; this.value = value; }
  for (const id of ['quick-form', 'title', 'kind', 'parent', 'parent-fields', 'add', 'message']) {
    const handlers = new Map();
    const select = ['kind', 'parent'].includes(id);
    const element = {
      options: id === 'kind' ? ['Task', 'Story', 'Epic'].map(value => new Option(value, value)) : [new Option('No parent', '')],
      currentValue: id === 'kind' ? 'Task' : '', disabled: false, textContent: '',
      get value() { return this.currentValue; },
      set value(value) { this.currentValue = select && !this.options.some(option => option.value === value) ? '' : value; },
      focus() {}, classList: { toggle() {} },
      add(option) { this.options.push(option); },
      replaceChildren(...options) { this.options = options; this.currentValue = options[0]?.value || ''; },
      addEventListener(type, handler) { handlers.set(type, handler); },
      fire(type) { handlers.get(type)?.({ preventDefault() {} }); }
    };
    elements.set(id, element);
  }
  const run = { get() { return {
    withSuccessHandler(handler) { this.success = handler; return this; },
    withFailureHandler(handler) { this.failure = handler; return this; },
    getProject() { if (loadFailure) this.failure(new Error('Load failed')); else this.success({ spreadsheetUrl: url, issues }); },
    quickCreateIssue(title, type, parentId, operationId) { backend.requests.push({ title, type, parentId, operationId, success: this.success, failure: this.failure }); }
  }; } };
  const context = {
    document: { getElementById: id => elements.get(id) }, Option,
    crypto: { randomUUID: () => `operation-${++backend.nextOperation}` },
    sessionStorage: {
      getItem: key => { if (storageFailure) throw Error('Storage blocked'); return storage.get(key) || null; },
      setItem: (key, value) => { if (storageFailure) throw Error('Storage blocked'); storage.set(key, value); },
      removeItem: key => storage.delete(key)
    },
    google: { script: Object.defineProperty({}, 'run', run) }
  };
  vm.runInNewContext(script, context, { filename: 'QuickAdd.html' });
  const get = id => elements.get(id);
  return {
    get, backend, storage,
    edit(id, value) { get(id).value = value; get(id).fire(id === 'title' ? 'input' : 'change'); },
    submit() { get('quick-form').fire('submit'); },
    commit(index, loseResponse = false) {
      const request = backend.requests[index];
      let issue = backend.receipts.get(request.operationId);
      if (!issue) {
        issue = { id: `TEST-${backend.receipts.size + 2}`, summary: request.title, type: request.type, parentId: request.parentId };
        backend.receipts.set(request.operationId, issue);
      }
      if (loseResponse) request.failure(new Error('Response lost'));
      else request.success(issue);
      return issue;
    }
  };
}

test('sidebar retry replays a committed create after a lost acknowledgement', () => {
  const app = boot();
  app.edit('title', 'First item'); app.edit('parent', epic.id); app.submit();
  const created = app.commit(0, true);
  assert.equal(app.get('title').value, 'First item');
  assert.equal(app.get('parent').value, epic.id);
  assert.equal(app.get('add').textContent, 'Retry add');
  app.submit();
  assert.equal(app.backend.requests[0].operationId, app.backend.requests[1].operationId);
  assert.deepEqual(app.commit(1), created);
  assert.equal(app.backend.receipts.size, 1);
  assert.equal(app.get('title').value, '');
  assert.match(app.get('message').textContent, /TEST-2 added/);
  assert.equal(app.storage.size, 0);
});

test('pending double-submit sends once and prevents edits until acknowledgement', () => {
  const app = boot(); app.edit('title', 'Held request'); app.submit(); app.submit();
  assert.equal(app.backend.requests.length, 1);
  for (const id of ['title', 'kind', 'parent', 'add']) assert.equal(app.get(id).disabled, true);
  app.commit(0);
  for (const id of ['title', 'kind', 'parent', 'add']) assert.equal(app.get(id).disabled, false);
});

for (const [field, value] of [['title', 'Different item'], ['kind', 'Story'], ['parent', epic.id]]) {
  test(`changing ${field} after an unconfirmed create uses a new identity`, () => {
    const app = boot(); app.edit('title', 'First item'); app.submit(); app.commit(0, true);
    app.edit(field, value);
    assert.match(app.get('message').textContent, /Previous submission may already have saved/);
    app.submit(); app.commit(1);
    assert.notEqual(app.backend.requests[0].operationId, app.backend.requests[1].operationId);
    assert.equal(app.backend.receipts.size, 2);
    assert.equal(app.backend.requests[1][field === 'title' ? 'title' : field === 'kind' ? 'type' : 'parentId'], value);
  });
}

test('pending and failed submissions recover across reload without automatic resend', () => {
  for (const outcome of ['pending', 'failed']) {
    const app = boot(); app.edit('title', '  Keep exact draft  '); app.edit('kind', 'Story'); app.edit('parent', epic.id); app.submit();
    if (outcome === 'failed') app.commit(0, true);
    const restored = boot({ storage: app.storage, backend: app.backend, issues: [] });
    assert.equal(app.backend.requests.length, 1);
    assert.equal(restored.get('title').value, '  Keep exact draft  ');
    assert.equal(restored.get('kind').value, 'Story');
    assert.equal(restored.get('parent').value, epic.id);
    assert.match(restored.get('message').textContent, /Submission unconfirmed/);
    restored.submit();
    assert.equal(app.backend.requests[1].operationId, app.backend.requests[0].operationId);
    assert.equal(app.backend.requests[1].parentId, epic.id);
    app.commit(0); restored.commit(1);
    assert.equal(app.backend.receipts.size, 1);
  }
});

test('unsent drafts recover in the same tab and remain scoped to their spreadsheet', () => {
  const app = boot(); app.edit('title', 'Unsent'); app.edit('kind', 'Epic');
  const restored = boot({ storage: app.storage });
  assert.equal(restored.get('title').value, 'Unsent');
  assert.equal(restored.get('kind').value, 'Epic');
  assert.equal(restored.get('parent-fields').hidden, true);
  assert.equal(restored.backend.requests.length, 0);
  assert.equal(boot({ storage: app.storage, url: `${projectUrl}-other` }).get('title').value, '');
});

test('unavailable storage, project load failures and missing project identity block writes', () => {
  for (const options of [{ storageFailure: true }, { loadFailure: true }, { url: '' }]) {
    const app = boot(options); app.edit('title', 'Do not send'); app.submit();
    assert.equal(app.backend.requests.length, 0);
    assert.equal(app.get('add').disabled, true);
  }
});

test('storage failure at submit leaves the draft and sends no request', () => {
  const app = boot(); app.edit('title', 'Keep me');
  app.storage.set = () => { throw new Error('Storage full'); };
  app.submit();
  assert.equal(app.backend.requests.length, 0);
  assert.equal(app.get('title').value, 'Keep me');
  assert.match(app.get('message').textContent, /Cannot retain this draft/);
});
