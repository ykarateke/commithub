# Change Log

All notable changes to the "commithub" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
