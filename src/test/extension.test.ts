import * as assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getGitDiffForRoot } from '../services/git';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('Git diff reader', () => {
	async function createRepo(): Promise<string> {
		const root = await mkdtemp(path.join(os.tmpdir(), 'commithub-test-'));
		execFileSync('git', ['init', '--quiet'], { cwd: root });
		return root;
	}

	test('reads untracked files safely and applies default excludes', async () => {
		const root = await createRepo();
		try {
			await writeFile(path.join(root, 'app.ts'), 'const value = 1;\n');
			await writeFile(path.join(root, 'odd & name.ts'), 'export {};\n');
			await writeFile(path.join(root, 'ignored.lock'), 'lock data\n');

			const result = await getGitDiffForRoot(root);

			assert.deepStrictEqual(result.allFilePaths.sort(), ['app.ts', 'odd & name.ts']);
			assert.ok(result.files.find(file => file.filePath === 'app.ts')?.rawDiff.includes('+const value = 1;'));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test('reads staged files before the first commit', async () => {
		const root = await createRepo();
		try {
			await writeFile(path.join(root, 'first.ts'), 'export const first = true;\n');
			execFileSync('git', ['add', '--', 'first.ts'], { cwd: root });

			const result = await getGitDiffForRoot(root);

			assert.deepStrictEqual(result.allFilePaths, ['first.ts']);
			assert.strictEqual(result.files[0].status, 'added');
			assert.ok(result.files[0].rawDiff.includes('+export const first = true;'));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
