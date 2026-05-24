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
		exec(`git diff --cached --stat${excludeArgs}`, { cwd, maxBuffer: 1024 * 1024 }, (err, stdout) => {
			if (err) {
				reject(new Error(`Not a git repository or no staged changes: ${err.message}`));
				return;
			}
			const hasStaged = stdout.trim().length > 0;
			const cmd = hasStaged
				? `git diff --cached${excludeArgs}`
				: `git diff HEAD${excludeArgs}`;
			exec(cmd, { cwd, maxBuffer: 1024 * 1024 }, (err2, diffOut) => {
				if (err2) {
					reject(new Error(`Failed to read diff: ${err2.message}`));
					return;
				}
				const diff = diffOut || '';
				const files = diff
					.split('\n')
					.filter(l => l.startsWith('diff --git'))
					.map(l => l.replace('diff --git a/', '').replace(' b/', ' — ').split(' — ')[1] || '');
				resolve({ diff, hasStaged, files, stats: stdout });
			});
		});
	});
}
