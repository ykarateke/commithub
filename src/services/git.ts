import { exec } from 'child_process';
import * as vscode from 'vscode';

export interface HunkInfo {
  header: string;
  content: string;
  funcName: string;
  addedLines: number;
  removedLines: number;
}

export interface FileDiff {
  filePath: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  addedLines: number;
  removedLines: number;
  hunks: HunkInfo[];
  rawDiff: string;
  isTruncated: boolean;
}

export interface GitDiffResult {
  files: FileDiff[];
  hasChanges: boolean;
  totalAdded: number;
  totalRemoved: number;
  summaryStats: string;
  allFilePaths: string[];
}

const AUTO_EXCLUDE_DEFAULTS = [
  '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.svg', '*.ico', '*.webp',
  '*.vsix', '*.zip', '*.tar', '*.gz',
  'dist/', 'build/', '.next/', '.nuxt/',
  '*.min.js', '*.min.css', '*.bundle.js',
];

let diffCache: { key: string; result: GitDiffResult } | undefined;

let _cachedRoot: string = '';

function execCmd(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) { reject(err); return; }
      resolve(stdout);
    });
  });
}

function getRepo(): { root: string } | undefined {
  try {
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt?.exports) return undefined;
    const gitApi = typeof gitExt.exports.getAPI === 'function' ? gitExt.exports.getAPI(1) : gitExt.exports;
    const repo = gitApi?.repositories?.[0];
    if (!repo) return undefined;
    return { root: repo.rootUri.fsPath };
  } catch { return undefined; }
}

function parseDiffOutput(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const fileBlocks = raw.split(/\n(?=diff --git )/).filter(Boolean);

  for (const block of fileBlocks) {
    const pathMatch = block.match(/^diff --git a\/(.*?) b\/(.*?)$/m);
    if (!pathMatch) continue;
    const filePath = pathMatch[2];

    let status: FileDiff['status'] = 'modified';
    if (/^new file mode/m.test(block)) status = 'added';
    else if (/^deleted file mode/m.test(block)) status = 'deleted';
    else if (/^rename from /m.test(block)) status = 'renamed';

    const hunks: HunkInfo[] = [];
    const hunkBlocks = block.split(/\n(?=@@ )/).filter(h => h.startsWith('@@ '));

    for (const hunkBlock of hunkBlocks) {
      const headerMatch = hunkBlock.match(/^(@@ .+ @@)(.*)$/m);
      if (!headerMatch) continue;
      const header = headerMatch[1];
      const funcName = (headerMatch[2] || '').trim();
      const content = hunkBlock;

      let added = 0, removed = 0;
      const lines = hunkBlock.split('\n');
      for (const line of lines) {
        if (line.startsWith('+')) added++;
        else if (line.startsWith('-')) removed++;
      }

      hunks.push({ header, content, funcName, addedLines: added, removedLines: removed });
    }

    let addedLines = 0, removedLines = 0;
    for (const h of hunks) {
      addedLines += h.addedLines;
      removedLines += h.removedLines;
    }

    files.push({
      filePath,
      status,
      addedLines,
      removedLines,
      hunks,
      rawDiff: block,
      isTruncated: false,
    });
  }

  return files;
}

function buildExcludeArgs(
  userPatterns: string[],
  includeDefaults: boolean,
): string {
  const patterns = includeDefaults
    ? [...new Set([...AUTO_EXCLUDE_DEFAULTS, ...userPatterns])]
    : userPatterns;

  if (!patterns.length) return '';
  return ' -- ' + patterns.map(p => `':(exclude)${p}'`).join(' ');
}

function buildCacheKey(root: string): Promise<string> {
  return execCmd('git status --porcelain -u', root).then(out => out.trim()).catch(() => '');
}

export async function getGitDiff(
  _cwd: string,
  userExcludePatterns: string[] = [],
  untrackedMaxLines = 100,
  includeAutoExcludes = true,
): Promise<GitDiffResult> {
  const repoInfo = getRepo();
  if (!repoInfo) {
    throw new Error('Not a git repository — open a git project to use CommitHub');
  }

  const root = repoInfo.root;
  const excludeArgs = buildExcludeArgs(userExcludePatterns, includeAutoExcludes);

  const cacheKey = await buildCacheKey(root);
  if (diffCache && diffCache.key === cacheKey && _cachedRoot === root) {
    return diffCache.result;
  }

  const diffArgs = '-U2';

  const [trackedDiff, untrackedRaw] = await Promise.all([
    execCmd(`git diff HEAD ${diffArgs}${excludeArgs}`, root).catch(() => ''),
    execCmd(`git ls-files --others --exclude-standard${excludeArgs}`, root),
  ]);

  const trackedFiles = parseDiffOutput(trackedDiff);

  const untrackedFileList = untrackedRaw.split('\n').filter(Boolean);

  const untrackedFileData = await Promise.all(
    untrackedFileList.map(async (f) => {
      const lineCount = await execCmd(`wc -l < "${f}"`, root)
        .then(c => parseInt(c.trim(), 10) || 0)
        .catch(() => 0);

      const head = await execCmd(`head -n ${untrackedMaxLines} "${f}"`, root)
        .then(c => c.trim())
        .catch(() => '');

      const truncated = lineCount > untrackedMaxLines;
      const lines = head.split('\n').length;
      const rawDiff = [
        `diff --git a/${f} b/${f}`,
        'new file mode 100644',
        `--- /dev/null`,
        `+++ b/${f}`,
        `@@ -0,0 +1,${lines} @@`,
        ...head.split('\n').map((l: string) => `+${l}`),
        truncated ? `\n[truncated — ${lineCount} total lines, showing first ${untrackedMaxLines}]` : '',
      ].join('\n');

      return {
        fileDiff: {
          filePath: f,
          status: 'added' as const,
          addedLines: lines,
          removedLines: 0,
          hunks: [{
            header: `@@ -0,0 +1,${lines} @@`,
            content: rawDiff,
            funcName: '',
            addedLines: lines,
            removedLines: 0,
          }],
          rawDiff,
          isTruncated: truncated,
        },
        lineCount,
        truncated,
      };
    })
  );

  const untrackedFiles = untrackedFileData.map(d => d.fileDiff);

  const allFiles = [...trackedFiles, ...untrackedFiles];

  const totalAdded = allFiles.reduce((s, f) => s + f.addedLines, 0);
  const totalRemoved = allFiles.reduce((s, f) => s + f.removedLines, 0);

  const untrackedPaths = untrackedFileData.map(d => {
    const lines = Math.min(d.lineCount, untrackedMaxLines);
    return `${d.fileDiff.filePath} (${lines} line${lines > 1 ? 's' : ''}${d.truncated ? ', truncated' : ''})`;
  });

  const summaryStats = [
    trackedFiles.length ? `modified: ${trackedFiles.length} file(s), +${trackedFiles.reduce((s, f) => s + f.addedLines, 0)}/-${trackedFiles.reduce((s, f) => s + f.removedLines, 0)}` : '',
    untrackedPaths.length ? `new: ${untrackedPaths.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const result: GitDiffResult = {
    files: allFiles,
    hasChanges: allFiles.length > 0,
    totalAdded,
    totalRemoved,
    summaryStats,
    allFilePaths: allFiles.map(f => f.filePath),
  };

  if (cacheKey) {
    diffCache = { key: cacheKey, result };
    _cachedRoot = root;
  }

  return result;
}
