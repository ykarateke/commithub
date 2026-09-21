# CommitHub

**AI-powered Git commit message generator for VS Code**

Generate conventional commit messages from all working-tree changes with a single click. Supports 12 AI provider configurations, automatic model selection, Conventional Commits, emoji, and 32 languages.

## Features

- **One-click commit** — SCM title bar button generates a commit message from your git diff
- **Writes to SCM input box** — the generated message appears directly in Source Control's input field; review, edit, then commit manually
- **12 provider configurations** — OpenAI, Anthropic, Gemini, Zhipu GLM, xAI, DeepSeek, Mistral, Ollama, OpenRouter, Groq, Together AI, and Zhipu Coding Plan
- **Model profiles** — `Fast`, `Balanced`, and `Quality` automatically select an appropriate discovered model; `Manual` preserves an explicit choice
- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `chore:` and more with a fully customizable type list
- **Emoji support** — relevant emoji prefix on commit messages
- **32 languages** — generate messages in Turkish, English, German, French, Japanese, Chinese, and more
- **Scope Detection** — auto-detects scope from changed file paths (`feat(api):`, `fix(auth):`)
- **Tone selection** — `formal`, `casual`, or `technical`
- **Breaking Changes** — auto-detects breaking API changes and adds `BREAKING CHANGE:` footer
- **Prerequisite system** — warns when required settings are missing and guides you to the right place
- **Connection status** — status bar shows `✓ CommitHub` with live connection state
- **Persistent statistics** — token usage, API call counts survive across sessions
- **Debug channel** — dedicated Output Channel records request diagnostics, timing, and token metadata
- **Model discovery** — fetches, filters, ranks, and temporarily caches models from the provider API
- **Custom Base URL** — supports any OpenAI-compatible endpoint
- **Cancellable** — progress notification with Cancel button for long-running requests
- **Complete Git changes** — staged, unstaged, deleted, renamed, and untracked files are included
- **Repository-aware** — multi-root and nested workspaces write the result to the matching SCM input
- **Auto-start** — activates on VS Code startup, status bar ready immediately

## Getting Started

1. **Install** from VS Code Marketplace
2. Open the **CommitHub** panel in the Activity Bar
3. Set your **API Key** (Settings → API Key)
4. Choose your **Provider** (Settings → Provider)
5. Click the **Generate** button (💀) in the Source Control title bar
6. Review the message in the SCM input box, then `Ctrl+Enter` to commit

## Configuration

All settings are accessible from the CommitHub panel in the Activity Bar, organized into three groups:

### Provider

| Setting | Description | Default |
|---|---|---|
| Provider | AI provider | openai |
| Connection | Test connection to the API | — |
| API Key | Provider-specific API key stored in SecretStorage | — |
| Model | Model name | gpt-4o |
| Model Profile | Automatic selection strategy (`fast`, `balanced`, `quality`, `manual`) | balanced |
| Base URL | Custom API endpoint | (auto) |
| Temperature | Creativity (0=deterministic, 2=creative) | 0.7 |
| Max Tokens | Max response tokens | 500 |

### Message

| Setting | Description | Default |
|---|---|---|
| Language | Commit language (32 locales) | auto |
| Max Length | Subject line max characters | 72 |
| Conventional Commit | Use Conventional Commits format | on |
| Conventional Types | Allowed types (comma-separated) | feat, fix, chore, docs, style, refactor, perf, test, ci, build, revert |
| Tone | Message tone | auto |
| Include Body | Include detailed body | on |
| Include Footer | Include footer section | off |
| Emoji | Emoji prefix | off |

### Analysis

| Setting | Description | Default |
|---|---|---|
| Scope Detection | Auto-detect scope from file paths | on |
| Breaking Changes | Detect breaking API changes | on |
| Max Diff Size | Max diff characters sent to AI | 8000 |
| Exclude Files | Glob patterns to exclude from diff (comma-separated) | — |
| Statistics | Token & usage analytics | — |

## Supported Providers

| Provider | Default Model | Base URL |
|---|---|---|
| OpenAI | gpt-4o | https://api.openai.com/v1 |
| Anthropic | claude-sonnet-4-20250514 | https://api.anthropic.com/v1 |
| Google Gemini | gemini-2.5-flash | https://generativelanguage.googleapis.com/v1beta |
| Zhipu GLM | glm-4.7 | https://open.bigmodel.cn/api/paas/v4 |
| xAI Grok | grok-4.1-fast | https://api.x.ai/v1 |
| Zhipu GLM (Coding) | glm-4.5-air | https://open.bigmodel.cn/api/coding/paas/v4 |
| DeepSeek | deepseek-flash | https://api.deepseek.com |
| Mistral | mistral-small-latest | https://api.mistral.ai/v1 |
| Ollama | llama3.2 | http://localhost:11434/v1 |
| OpenRouter | openai/gpt-4o-mini | https://openrouter.ai/api/v1 |
| Groq | llama-3.3-70b-versatile | https://api.groq.com/openai/v1 |
| Together AI | meta-llama/Llama-3.3-70B-Instruct-Turbo | https://api.together.xyz/v1 |

### Notes

- **Ollama**: No API key required — runs locally
- **DeepSeek**: `Quality` enables thinking with high reasoning effort; `Fast` and `Balanced` disable thinking for lower latency
- API keys are retained independently when switching providers

## Commands

| Command | Access |
|---|---|
| `CommitHub: Generate Commit Message` | SCM title bar 💀 button |
| `CommitHub: Set API Key` | Settings → API Key |
| `CommitHub: Set AI Provider` | Settings → Provider |
| `CommitHub: Set Model` | Settings → Model (or Fetch from API) |
| `CommitHub: Set Model Profile` | Settings → Model Profile |
| `CommitHub: Set Base URL` | Settings → Base URL |
| `CommitHub: Set Temperature` | Settings → Temperature |
| `CommitHub: Set Max Tokens` | Settings → Max Tokens |
| `CommitHub: Set Language` | Settings → Language |
| `CommitHub: Set Max Length` | Settings → Max Length |
| `CommitHub: Toggle Conventional Commits` | Settings → Conventional Commit |
| `CommitHub: Set Conventional Types` | Settings → Conventional Types |
| `CommitHub: Toggle Include Body` | Settings → Include Body |
| `CommitHub: Toggle Include Footer` | Settings → Include Footer |
| `CommitHub: Toggle Emoji` | Settings → Emoji |
| `CommitHub: Set Message Tone` | Settings → Tone |
| `CommitHub: Toggle Scope Detection` | Settings → Scope Detection |
| `CommitHub: Toggle Breaking Changes Detection` | Settings → Breaking Changes |
| `CommitHub: Set Max Diff Size` | Settings → Max Diff Size |
| `CommitHub: Set Exclude Files` | Settings → Exclude Files |
| `CommitHub: Show Statistics` | Settings → Statistics |
| `CommitHub: Test Connection` | Status bar `✓ CommitHub` |
| `CommitHub: Fetch Models from API` | Settings → Model → Fetch |

## Development

```bash
# Install dependencies
npm install

# Build (webpack → dist/extension.js)
npm run compile

# Watch mode
npm run watch

# Launch Extension Development Host (F5 in VS Code)

# Test
npm test

# Lint
npm run lint

# Package for publishing
npm run package
```

### Architecture

```
src/
├── extension.ts          # Entry point, all command registrations
├── state.ts              # Global state (connection, stats, persistence)
├── services/
│   ├── git.ts            # Repository-aware, bounded Git diff reader
│   ├── ai.ts             # Prompt and streaming orchestration
│   ├── httpClient.ts     # Cancellable Node HTTP transport
│   ├── modelDiscovery.ts # Model discovery, ranking, profiles, cache
│   ├── providers.ts      # Provider registry and defaults
│   └── adapters/         # OpenAI, Anthropic, Gemini, DeepSeek protocols
└── views/
	└── settingsView.ts   # Tree Data Provider
```

- **Dual compiler**: Extension built with webpack, tests with `tsc`
- `vscode`, `https`, `http`, `child_process`, `fs` are externalized in webpack config
- API keys stored per provider in `SecretStorage` (never written to settings.json)
- Statistics persisted in `context.globalState` across sessions
- API calls use Node.js `https`/`http` modules (including local Ollama endpoints)
- HTTP requests are cancellable via `AbortController` wired to VS Code `CancellationToken`

### Git diff safety

- Uses `git diff HEAD` so staged and unstaged changes are analyzed together.
- Uses Git's empty tree before the first commit, including post-stage working-tree edits.
- Reads Unicode and renamed paths from NUL-delimited Git metadata.
- Always excludes lockfiles, build output, images, archives, and minified bundles.
- Caps each untracked file at 100 lines and 256 KB; binary and symlink targets are omitted.
- Falls back to a file summary when the tracked patch exceeds the 10 MB collection limit.

## License

MIT
