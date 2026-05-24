# CommitHub

**AI-powered Git commit message generator for VS Code**

Generate conventional commit messages from your staged changes with a single click. Supports 11+ AI providers, full Conventional Commits spec, emoji, 32 languages, and more.

## Features

- **One-click commit** — SCM title bar button generates a commit message from your git diff
- **Writes to SCM input box** — the generated message appears directly in Source Control's input field; review, edit, then commit manually
- **11+ AI providers** — OpenAI, Anthropic, Google Gemini, Zhipu GLM, xAI Grok, DeepSeek, Mistral, Ollama, OpenRouter, Groq, Together AI
- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `chore:` and more with a fully customizable type list
- **Emoji support** — relevant emoji prefix on commit messages
- **32 languages** — generate messages in Turkish, English, German, French, Japanese, Chinese, and more
- **Scope Detection** — auto-detects scope from changed file paths (`feat(api):`, `fix(auth):`)
- **Tone selection** — `formal`, `casual`, or `technical`
- **Breaking Changes** — auto-detects breaking API changes and adds `BREAKING CHANGE:` footer
- **Prerequisite system** — warns when required settings are missing and guides you to the right place
- **Connection status** — status bar shows `✓ CommitHub` with live connection state
- **Persistent statistics** — token usage, API call counts survive across sessions
- **Debug channel** — dedicated Output Channel logs all API requests and responses
- **Model discovery** — fetch available models directly from your provider's API
- **Custom Base URL** — supports any OpenAI-compatible endpoint
- **Cancellable** — progress notification with Cancel button for long-running requests
- **Untracked files** — new (untracked) files are included in the diff sent to the AI
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
| API Key | API key (stored in SecretStorage) | — |
| Model | Model name | gpt-4o |
| Base URL | Custom API endpoint | (auto) |
| Temperature | Creativity (0=deterministic, 2=creative) | 0.7 |
| Max Tokens | Max response tokens | 2000 |

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
| DeepSeek | deepseek-v4-flash | https://api.deepseek.com |
| Mistral | mistral-large-latest | https://api.mistral.ai/v1 |
| Ollama | llama3 | http://localhost:11434/v1 |
| OpenRouter | gpt-4o | https://openrouter.ai/api/v1 |
| Groq | llama-4-scout-17b | https://api.groq.com/openai/v1 |
| Together AI | Llama-4-Scout-17B-16E-Instruct | https://api.together.xyz/v1 |

### Notes

- **Zhipu Coding Plan**: Set Base URL to `https://open.bigmodel.cn/api/coding/paas/v4`
- **Ollama**: No API key required — runs locally

## Commands

| Command | Access |
|---|---|
| `CommitHub: Generate Commit Message` | SCM title bar 💀 button |
| `CommitHub: Set API Key` | Settings → API Key |
| `CommitHub: Set AI Provider` | Settings → Provider |
| `CommitHub: Set Model` | Settings → Model (or Fetch from API) |
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
│   ├── git.ts            # Git diff reader (staged/unstaged, exclude patterns)
│   └── ai.ts             # AI prompt builder + provider API calls
└── views/
    └── settingsView.ts   # Tree Data Provider (3 groups, 22 settings)
```

- **Dual compiler**: Extension built with webpack, tests with `tsc`
- `vscode`, `https`, `http`, `child_process`, `fs` are externalized in webpack config
- API keys stored in `SecretStorage` (never written to settings.json)
- Statistics persisted in `context.globalState` across sessions
- All API calls use Node.js `https` module (bypasses extension host `fetch` proxy issues)
- HTTP requests are cancellable via `AbortController` wired to VS Code `CancellationToken`

## License

MIT
