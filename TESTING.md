# GSheetJira — Local Testing Guide

This guide describes the existing local Node.js and Playwright workflow for the `implement_mvp` branch. Run tests from a normal VS Code PowerShell terminal, not through Codex, to minimize Codex usage.

## Setup (Windows PowerShell)

```powershell
git switch implement_mvp
npm.cmd install
npm.cmd run build
npx.cmd playwright install
```

## Run the local app

In terminal 1:

```powershell
npm.cmd start
```

Open http://127.0.0.1:4173 in your browser. The local build uses browser storage; it does not sync with Google Sheets.

## Run tests

In terminal 2:

```powershell
npm.cmd test                  # Node.js unit/integration tests
npm.cmd run check             # Build + Node.js tests
npm.cmd run test:browser      # Existing Playwright suite
npx.cmd playwright test e2e/sheet-reparenting.spec.mjs  # Targeted tests
```

The existing browser suite was reported as 52 passing tests (1.6 minutes) on Edge on October 28, 2026. This is a previously reported baseline, not a verification of future changes.

## Reports and diagnostics

If an HTML report is not configured, generate one explicitly:

```powershell
npx.cmd playwright test --reporter=html
npx.cmd playwright show-report
```

For a concise failure log:

```powershell
npx.cmd playwright test --reporter=line *> playwright-failures.txt
```

A nonzero exit code means tests failed. Do not assume an HTML report exists after a default run; it depends on Playwright reporter configuration. Configure `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, and `video: 'off'` in the existing Playwright config when approved, preserving all existing projects and settings. These are recommended settings, not claims that they are already applied.

## Minimal-Codex-usage workflow

1. Codex inspects the relevant code and writes a small implementation plus appropriate tests.
2. Run targeted tests manually in PowerShell.
3. If they fail, provide Codex only the failing test names, concise errors, and relevant code context.
4. Codex diagnoses and fixes; do not let it repeatedly run browser automation by default.
5. Rerun targeted tests manually; run the complete browser suite before a merge/release.
6. Request interactive browser investigation only for failures that cannot be diagnosed from concise reports.

Avoid feeding complete successful logs, entire traces, screenshots of passing tests, or large HTML reports into Codex. Keep reports and traces locally; share selected artifacts only as needed.

## Safety

Use isolated test fixtures and local browser storage. Never point automated tests at a production Google Sheet or run Apps Script deployment commands without explicit approval. A passing local browser suite does not verify the Apps Script-backed mode.
