# CommitHub — AGENTS.md

## Project

VS Code extension that generates conventional commit messages from git diffs using AI. Single entry point: `src/extension.ts` → `dist/extension.js` (webpack, CommonJS2).

## Commands

- `npm run compile` — webpack → `dist/extension.js`
- `npm run lint` — `eslint src` (flat config: `eslint.config.mjs`)
- `npm run compile-tests` — `tsc -p . --outDir out` (test files only)
- `npm test` — runs `pretest` (compile-tests + compile + lint) then `vscode-test`
- `npm run package` — production webpack build (used by `vscode:prepublish`)

**No bare `tsc` build for the extension** — always use webpack. `tsc` is only for compiling tests.

## Testing

- Tests: `src/test/*.test.ts` → compiled by `tsc` to `out/test/`.
- Runner config: `.vscode-test.mjs` (matches `out/test/**/*.test.js`).
- Tests run inside a VS Code Extension Host window — the `vscode` module is only available there.
- Two compilers: webpack for extension (`dist/`), tsc for tests (`out/`). Same `tsconfig.json`, different output dirs.

## Architecture

```
src/
├── extension.ts          # Entry — registers 22 commands, settings sidebar, status bar
├── state.ts              # Connection status + persistent statistics (context.globalState)
├── services/
│   ├── git.ts            # git diff HEAD + untracked files, per-file diff parser with hunks
│   └── ai.ts             # buildPrompt() + 3-tier hybrid diff (full / file-level / summary)
└── views/
    └── settingsView.ts   # TreeDataProvider (3 groups, ~25 settings)
```

## Key Constraints

- API keys in VS Code `SecretStorage` — never `settings.json`.
- All HTTP calls use Node.js `https`/`http` (not extension host `fetch` — avoids proxy issues). Cancellable via `AbortController` + VS Code `CancellationToken`.
- Streaming (`streamCommitMessage`): OpenAI-compatible providers only. Anthropic & Gemini fall back to non-streaming.
- Git diff: `git diff HEAD` (all working-tree changes) + untracked file contents.
- **Hybrid prompt builder** (`ai.ts`): 3 tiers based on diff size relative to `maxDiffSize`:
  - Tier 1 (≤ limit): full unified diff
  - Tier 2 (over limit): complete diffs for files that fit budget, file-path summaries for rest
  - Tier 3 (≥2× limit or >20 files): pure summary — file list with stats + function names from `@@` hunk headers
- Auto-exclude defaults always applied: `*.lock`, `package-lock.json`, `dist/`, `build/`, image files, minified bundles.
- `activationEvents: ["onStartupFinished"]` — activates after startup.
