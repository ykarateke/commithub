# CommitHub — AGENTS.md

## Project

VS Code extension that generates conventional commit messages from git diffs using AI. Currently a boilerplate scaffold — real logic lives in `src/extension.ts`.

## VS Code Commands

| Command ID | Title | SCM Button? | Sidebar? |
|---|---|---|---|
| `commithub.helloWorld` | Hello World | — | — |
| `commithub.generateCommit` | CommitHub: Generate Commit Message | ✅ `scm/title` | — |

The SCM title button uses VS Code's built-in `sparkle` codicon (via `SourceControl.actionButton` with `ThemeIcon`) and appears in the Source Control view title bar.
The activity bar icon uses `images/commithub-sparkle.svg` — click it to open the CommitHub sidebar with settings (API key, provider, model, language).

## Commands

| Command | What it does |
|---|---|
| `npm run compile` | webpack → `dist/extension.js` |
| `npm run watch` | webpack --watch (used by F5 dev launch) |
| `npm run package` | webpack --mode production for publishing |
| `npm run compile-tests` | `tsc -p . --outDir out` → `out/test/` |
| `npm run lint` | `eslint src` (flat config in `eslint.config.mjs`) |
| `npm run pretest` | `compile-tests && compile && lint` — runs **before** test |
| `npm test` | `vscode-test` — runs inside a VS Code window |

## Testing

- Tests are `.test.ts` files in `src/test/`.
- Compiled by `tsc` (not webpack) to `out/test/`.
- Runner config: `.vscode-test.mjs` — matches `out/test/**/*.test.js`.
- Use the **Extension Test Runner** extension (`ms-vscode.extension-test-runner`) or `npm test`.
- `npm run pretest` must succeed first (compile tests, compile extension, lint).

## Build quirks

- **Two separate compilers**: webpack builds the extension, `tsc` builds tests. They use same `tsconfig.json` but different output dirs.
- `vscode` module is **externalized** in webpack — never import it in test helpers that run outside the VS Code host.
- `activationEvents: []` in `package.json` — extension activates lazily on first command execution. Not `"*"` or `onStartupFinished`.
- Entry: `src/extension.ts` → `dist/extension.js` (CommonJS2 target).
- `src/` is excluded from published `.vsix` via `.vscodeignore`.
- `strict: true` in tsconfig.

## Debug / Run

- `F5` in VS Code launches an Extension Development Host window.
- Pre-launch task is `npm: watch` (webpack watch).
- Extension output appears in the debug console.

## Future direction (from `docs/PRD.md`)

- AI providers: OpenAI, Anthropic, local Ollama.
- API keys stored in `vscode.SecretStorage`.
- Per-project config via `.commithub.json`.
- `git diff --cached` via `child_process`.
- Conventional Commits prefix detection.
- Turkish / English language detection from project config.
