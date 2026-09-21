# Change Log

All notable changes to the "commithub" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.4.0] - 2026-09-21

### Added
- Automatic `Fast`, `Balanced`, `Quality`, and `Manual` model profiles
- Provider-specific API keys in VS Code SecretStorage
- Central provider registry, model discovery cache, and protocol adapters
- Dedicated DeepSeek adapter with profile-controlled thinking mode
- HTTP/SSE transport, adapter, timeout, cancellation, and Git regression tests

### Changed
- Model discovery now filters non-text models and ranks suitable chat models
- Streaming now records usage metadata and finish reasons across providers
- Git analysis selects the repository for the active file in multi-root and nested workspaces
- Git paths use NUL-delimited metadata for Unicode and rename safety
- Large tracked diffs fall back to summaries; untracked reads are capped at 100 lines and 256 KB

### Fixed
- Stale Git diff results caused by status-only caching
- First-commit repositories missing edits made after staging
- Commit messages being written to the wrong repository's SCM input
- Gemini model-list authentication and generation limits
- Anthropic stop-reason parsing and multi-part text responses
- Binary and symlink targets being included in untracked-file prompts

## [1.3.1] - 2026-07-06

### Fixed
- Fixed exclude patterns failing on Windows because shell quotes were passed to Git literally
- Replaced platform-specific `wc` and `head` commands when reading untracked files
- Included staged files when generating the first commit in a repository without `HEAD`
- Safely handled untracked file names containing spaces and shell metacharacters

## [1.2.0] - 2026-05-27

### Performance
- Untracked files: no longer read file contents — uses `wc -l` for line counts (async, parallel)
- Git diff: reduced context lines (`-U2`) for smaller diffs
- Prompt template: shortened instructions (~40% fewer tokens)
- In-memory diff cache: repeated generations on unchanged state use cached result
- `maxBuffer` increased to 10MB for large diffs
- Removed `fs` dependency from git service (untracked files are stat-only)

## [1.1.1] - 2026-05-27

### Fixed
- Reverted to `git diff HEAD` (working-tree changes) so unstaged changes are always detected without requiring staging

## [1.1.0] - 2026-05-27

### Added
- Smart diff optimization with 3-tier hybrid prompt builder
- Per-file diff parser with hunk-level detail and function name extraction
- Auto-exclude defaults for lock files, images, build artifacts, minified bundles
- Untracked file line limit (`untrackedFileMaxLines`, default 100)
- `Include Unstaged` toggle in Analysis settings (staged-only by default)
- File summary mode for large diffs (shows paths, ±stats, function names)
- Settings: `includeUnstaged`, `untrackedFileMaxLines`, `summaryModeThreshold`

### Changed
- Git diff default: `git diff --cached` (staged-only) instead of `git diff HEAD`
- `maxDiffSize` default fixed to 8000 (was reading 3000 inconsistently)
- Prompt builder now adapts output format based on diff size
- Git service returns structured `FileDiff[]` instead of raw diff string

### Fixed
- `maxDiffSize` default inconsistency between package.json and extension.ts
