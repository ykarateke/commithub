# CommitHub — AGENTS.md

## Project

VS Code extension that generates conventional commit messages from git diffs using AI. Single-entry at `src/extension.ts` → `dist/extension.js` (webpack, CommonJS2).

## VS Code Commands

| Command ID | Title | SCM Button? | Sidebar? |
|---|---|---|---|
| `commithub.generateCommit` | Generate Commit Message | ✅ `scm/title` (when `scmProvider == git`) | — |

The SCM title button uses `images/commithub-sparkle.svg`. Activity bar icon uses same SVG — opens the CommitHub sidebar with settings.

## Scripts

| Command | What it does |
|---|---|
| `npm run compile` | webpack → `dist/extension.js` |
| `npm run watch` | webpack --watch (used by F5 dev launch) |
| `npm run package` | webpack --mode production --devtool hidden-source-map |
| `npm run compile-tests` | `tsc -p . --outDir out` → `out/test/` |
| `npm run watch-tests` | same but in watch mode |
| `npm run lint` | `eslint src` (flat config in `eslint.config.mjs`) |
| `npm run pretest` | `compile-tests && compile && lint` — runs **before** test |
| `npm test` | `vscode-test` — runs inside a VS Code window |

## Testing

- Tests in `src/test/*.test.ts`, compiled by `tsc` to `out/test/`.
- Runner config: `.vscode-test.mjs` — matches `out/test/**/*.test.js`.
- Use Extension Test Runner extension (`ms-vscode.extension-test-runner`) or `npm test`.
- Two separate compilers: webpack builds the extension, `tsc` builds tests (same `tsconfig.json`, different output dirs).
- `vscode` module is externalized in webpack — never import it in test helpers that run outside the VS Code host.

## Build / Debug Quirks

- `activationEvents: ["onStartupFinished"]` — activates after startup, status bar ready immediately.
- Entry: `src/extension.ts` → `dist/extension.js` (CommonJS2, target `node`).
- `src/` excluded from `.vsix` via `.vscodeignore`.
- F5 launches Extension Development Host; pre-launch task is `npm: watch` (webpack watch).
- Extension output appears in debug console + dedicated `CommitHub` Output Channel (`log.info`, `log.error`).

## Architecture

```
src/
├── extension.ts          # Entry — registers all 22 commands, settings sidebar, status bar
├── state.ts              # Connection status + persistent statistics (context.globalState)
├── services/
│   ├── git.ts            # git diff --cached + untracked files, per-file diff parser with hunks
│   └── ai.ts             # buildPrompt() + 3-tier hybrid diff (full / file-level / summary-only)
└── views/
    └── settingsView.ts   # TreeDataProvider (3 groups, 25 settings)
```

- API keys stored in VS Code `SecretStorage` (never `settings.json`).
- Statistics persisted in `context.globalState` across sessions.
- All API calls use Node.js `https`/`http` module (not extension host `fetch` — avoids proxy issues).
- HTTP requests are cancellable via `AbortController` wired to VS Code `CancellationToken`.
- **Streaming** (`streamCommitMessage`): only for OpenAI-compatible providers. Anthropic & Gemini fall back to non-streaming `generateCommitMessage`.
- Git diff: includes **staged changes** (`git diff --cached`) + untracked files. Optional `includeUnstaged` setting adds unstaged changes too.
- **Hybrid prompt builder** (`ai.ts`): decides how to send diff to AI based on size:
  - **Tier 1** (total ≤ `maxDiffSize`): full unified diff for all files
  - **Tier 2** (total > `maxDiffSize`): include complete diffs for files that fit budget, summarize rest with file paths + ±stats + function names
  - **Tier 3** (excess ≥2× or >20 files): pure summary mode — no raw diffs, only file list with stats and extracted function names
- **Diff parser** (`git.ts`): splits raw `git diff` into per-file `FileDiff[]` with per-hunk `HunkInfo[]`. Extracts function names from `@@` hunk headers for summary mode.
- **Untracked files**: per-file line limit (`untrackedFileMaxLines`, default 100) — content beyond limit is dropped with a `[truncated]` flag.
- **Auto-exclude defaults**: `*.lock`, `package-lock.json`, `dist/`, `build/`, image files, minified bundles — always applied on top of user patterns.

## Settings Sidebar (`commithub.settingsView`)

Hierarchical tree view with three groups. Each setting opens an InputBox or QuickPick.

| Group | Settings |
|---|---|
| **Provider** | Provider (11 options), Connection, API Key, Model, Base URL, Temperature, Max Tokens |
| **Message** | Language (32 locales), Max Length, Conventional Commit, Conventional Types, Tone (auto/formal/casual/technical/**conventional**), Include Body, Include Footer, Emoji |
| **Analysis** | Scope Detection, Breaking Changes, Max Diff Size, Exclude Files, Include Unstaged, Statistics |

All stored in VS Code `ConfigurationTarget.Global` (or `SecretStorage` for API key).
