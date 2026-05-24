import { exec } from 'child_process';

export interface GitDiffResult {
	diff: string;
	hasStaged: boolean;
	files: string[];
	stats: string;
}

export function getGitDiff(cwd: string, excludePatterns: string[] = []): Promise<GitDiffResult> {
	const excludeArgs = excludePatterns.length
		? ' -- ' + excludePatterns.map(p => `':(exclude)${p}'`).join(' ')
		: '';

	return new Promise((resolve, reject) => {
		exec(`git diff HEAD --stat${excludeArgs}`, { cwd, maxBuffer: 1024 * 1024 }, (err, statOut) => {
			if (err) {
				reject(new Error(`Failed to read git status: ${err.message}`));
				return;
			}
			const hasStaged = statOut.trim().length > 0;
			if (!hasStaged) {
				resolve({ diff: '', hasStaged: false, files: [], stats: statOut });
				return;
			}
			exec(`git diff HEAD${excludeArgs}`, { cwd, maxBuffer: 1024 * 1024 }, (err2, diffOut) => {
				if (err2) {
					reject(new Error(`Failed to read diff: ${err2.message}`));
					return;
				}
				const diff = diffOut || '';
				const files = diff
					.split('\n')
					.filter(l => l.startsWith('diff --git'))
					.map(l => l.replace('diff --git a/', '').replace(' b/', ' — ').split(' — ')[1] || '');
				resolve({ diff, hasStaged, files, stats: statOut });
			});
		});
	});
}
