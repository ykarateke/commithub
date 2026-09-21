import * as assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getGitDiffForRoot } from '../services/git';
import { filterAndSortModels, recommendModel } from '../services/modelDiscovery';
import { getProviderAdapter } from '../services/adapters';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('Model discovery', () => {
	test('filters non-text models and prioritizes the provider default', () => {
		const models = filterAndSortModels([
			{ id: 'text-embedding-3-small' },
			{ id: 'gpt-image-1' },
			{ id: 'chat-fast' },
			{ id: 'preferred-chat' },
		], 'preferred-chat');

		assert.deepStrictEqual(models.map(model => model.label), ['preferred-chat', 'chat-fast']);
	});

	test('uses Gemini generation capabilities and removes duplicate model names', () => {
		const models = filterAndSortModels([
			{ name: 'models/gemini-flash', supportedGenerationMethods: ['generateContent'] },
			{ name: 'models/gemini-flash', supportedGenerationMethods: ['generateContent'] },
			{ name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] },
		], 'gemini-flash');

		assert.deepStrictEqual(models.map(model => model.label), ['gemini-flash']);
	});

	test('recommends models based on the selected profile', () => {
		const models = [
			{ label: 'provider-mini', description: '' },
			{ label: 'provider-standard', description: '' },
			{ label: 'provider-pro', description: '' },
		];
		assert.strictEqual(recommendModel(models, 'fast', 'provider-standard')?.label, 'provider-mini');
		assert.strictEqual(recommendModel(models, 'balanced', 'provider-standard')?.label, 'provider-standard');
		assert.strictEqual(recommendModel(models, 'quality', 'provider-standard')?.label, 'provider-pro');
	});
});

suite('AI provider adapters', () => {
	const options = {
		provider: 'openai', baseUrl: 'https://example.test/v1/', model: 'test-model', apiKey: 'secret',
		prompt: 'prompt', temperature: 0.2, maxTokens: 321, stream: false,
	};

	test('builds OpenAI-compatible requests', () => {
		const adapter = getProviderAdapter('openai');
		const request = adapter.createRequest({ ...options, stream: true });
		assert.strictEqual(request.url, 'https://example.test/v1/chat/completions');
		assert.strictEqual(request.headers.Authorization, 'Bearer secret');
		assert.strictEqual(request.body.stream, true);
		assert.deepStrictEqual(request.body.stream_options, { include_usage: true });
		assert.deepStrictEqual(adapter.parseStreamEvent({
			choices: [{ delta: { reasoning_content: 'thinking' }, finish_reason: null }],
			usage: { prompt_tokens: 8, completion_tokens: 3 },
		}), { text: undefined, reasoning: true, inputTokens: 8, outputTokens: 3, finishReason: undefined });
	});

	test('builds Gemini generation config and parses all text parts', () => {
		const adapter = getProviderAdapter('google_gemini');
		const request = adapter.createRequest({ ...options, provider: 'google_gemini' });
		assert.strictEqual(request.url, 'https://example.test/v1/models/test-model:generateContent');
		assert.deepStrictEqual(request.body.generationConfig, { temperature: 0.2, maxOutputTokens: 321 });
		const response = adapter.parseResponse({ candidates: [{ content: { parts: [{ text: 'one' }, { text: ' two' }] } }] });
		assert.strictEqual(response.text, 'one two');
		assert.deepStrictEqual(adapter.parseStreamEvent({
			candidates: [{ content: { parts: [{ text: 'chunk' }] }, finishReason: 'STOP' }],
			usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 },
		}), { text: 'chunk', inputTokens: 7, outputTokens: 2, finishReason: 'STOP' });
	});

	test('parses Anthropic stop reason and usage from response root', () => {
		const adapter = getProviderAdapter('anthropic');
		const response = adapter.parseResponse({
			content: [{ type: 'text', text: 'result' }], stop_reason: 'end_turn',
			usage: { input_tokens: 10, output_tokens: 4 },
		});
		assert.deepStrictEqual(response, {
			text: 'result', finishReason: 'end_turn', inputTokens: 10, outputTokens: 4,
		});
		assert.deepStrictEqual(adapter.parseStreamEvent({
			type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 },
		}), { text: undefined, inputTokens: undefined, outputTokens: 4, finishReason: 'end_turn' });
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
