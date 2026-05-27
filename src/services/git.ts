import { exec } from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';

export interface GitDiffResult {
	diff: string;
	hasChanges: boolean;
	files: string[];
	stats: string;
}

function execCmd(cmd: string, cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(cmd, { cwd, maxBuffer: 1024 * 1024 }, (err, stdout) => {
			if (err) { reject(err); return; }
			resolve(stdout);
		});
	});
}

function getRepo(): { root: string; repo: any } | undefined {
	try {
		const gitExt = vscode.extensions.getExtension('vscode.git');
		if (!gitExt?.exports) return undefined;
		const gitApi = typeof gitExt.exports.getAPI === 'function' ? gitExt.exports.getAPI(1) : gitExt.exports;
		const repo = gitApi?.repositories?.[0];
		if (!repo) return undefined;
		return { root: repo.rootUri.fsPath, repo };
	} catch { return undefined; }
}

export async function getGitDiff(_cwd: string, excludePatterns: string[] = []): Promise<GitDiffResult> {
	const repoInfo = getRepo();
	if (!repoInfo) {
		throw new Error('Not a git repository — open a git project to use CommitHub');
	}

	const root = repoInfo.root;
	const excludeArgs = excludePatterns.length
		? ' -- ' + excludePatterns.map(p => `':(exclude)${p}'`).join(' ')
		: '';

	const [trackedDiff, untrackedRaw] = await Promise.all([
		execCmd(`git diff HEAD${excludeArgs}`, root).catch(() => ''),
		execCmd(`git ls-files --others --exclude-standard${excludeArgs}`, root),
	]);

	const untrackedFiles = untrackedRaw.split('\n').filter(Boolean);
	const untrackedDiffs: string[] = [];
	for (const f of untrackedFiles) {
		const fullPath = `${root}/${f}`;
		try {
			const content = fs.readFileSync(fullPath, 'utf-8');
			untrackedDiffs.push(`diff --git a/${f} b/${f}\nnew file mode 100644\nindex 0000000..0000000\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1,${content.split('\n').length} @@\n${content}`);
		} catch { /* skip unreadable */ }
	}

	const allDiffs = [trackedDiff, ...untrackedDiffs].filter(Boolean).join('\n');
	const allFiles = [
		...trackedDiff.split('\n').filter(l => l.startsWith('diff --git')).map(l => l.replace('diff --git a/', '').replace(' b/', ' — ').split(' — ')[1] || ''),
		...untrackedFiles,
	];
	const trackedStat = trackedDiff ? `tracked: ${trackedDiff.split('\n').filter(l => l.startsWith('diff --git')).length} file(s)` : '';

	const hasChanges = allDiffs.trim().length > 0;

	return {
		diff: allDiffs,
		hasChanges,
		files: allFiles,
		stats: [trackedStat, ...(untrackedFiles.length ? [`new: ${untrackedFiles.join(', ')}`] : [])].filter(Boolean).join('\n'),
	};
}
