# Change Log

All notable changes to the "commithub" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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