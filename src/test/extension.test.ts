import * as assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getGitDiffForRoot } from '../services/git';
import { filterAndSortModels, recommendModel } from '../services/modelDiscovery';
import { getProviderAdapter } from '../services/adapters';
import { generateCommitMessage, streamCommitMessage } from '../services/ai';
import { requestJson } from '../services/httpClient';
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
		prompt: 'prompt', temperature: 0.2, maxTokens: 321, stream: false, modelProfile: 'balanced' as const,
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

	test('configures DeepSeek thinking mode from model profile', () => {
		const adapter = getProviderAdapter('deepseek');
		const fast = adapter.createRequest({ ...options, provider: 'deepseek', model: 'deepseek-flash', modelProfile: 'fast' });
		assert.deepStrictEqual(fast.body.thinking, { type: 'disabled' });
		assert.strictEqual(fast.body.temperature, 0.2);

		const quality = adapter.createRequest({ ...options, provider: 'deepseek', model: 'deepseek-v4-pro', modelProfile: 'quality' });
		assert.deepStrictEqual(quality.body.thinking, { type: 'enabled' });
		assert.strictEqual(quality.body.reasoning_effort, 'high');
		assert.strictEqual(quality.body.temperature, undefined);

		assert.deepStrictEqual(adapter.parseStreamEvent({
			choices: [{ delta: { reasoning_content: 'analysis' }, finish_reason: null }],
			usage: { prompt_tokens: 12, completion_tokens: 6 },
		}), { text: undefined, reasoning: true, inputTokens: 12, outputTokens: 6, finishReason: undefined });
	});
});

suite('AI HTTP transport', () => {
	let server: Server;
	let baseUrl: string;
	let responseMode: 'json' | 'stream' | 'error' | 'hang' = 'json';
	const settings = {
		files: [], totalAdded: 1, totalRemoved: 0, summaryStats: 'app.ts | 1 +', language: 'en',
		maxLength: 72, conventionalCommit: true, includeBody: false, includeFooter: false,
		emoji: false, tone: 'technical', scopeDetection: true, breakingChanges: true,
		temperature: 0.2, maxTokens: 100, maxDiffSize: 1000, conventionalTypes: ['fix'], modelProfile: 'balanced' as const,
	};

	suiteSetup(async () => {
		server = createServer((req, res) => {
			let requestBody = '';
			req.on('data', chunk => {requestBody += chunk.toString();});
			req.on('end', () => {
				assert.strictEqual(req.url, '/v1/chat/completions');
				assert.strictEqual(req.headers.authorization, 'Bearer test-key');
				assert.strictEqual(JSON.parse(requestBody).model, 'test-model');
				if (responseMode === 'hang') {return;}

				if (responseMode === 'error') {
					res.writeHead(429, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: { message: 'rate limited' } }));
					return;
				}
				if (responseMode === 'stream') {
					res.writeHead(200, { 'Content-Type': 'text/event-stream' });
					res.write('data: {"choices":[{"delta":{"content":"fix"}}]}\n\n');
					res.write('data: {"choices":[{"delta":{"content":": test"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n');
					res.end('data: [DONE]\n\n');
					return;
				}
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					choices: [{ message: { content: 'fix: test' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 5, completion_tokens: 2 },
				}));
			});
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address() as AddressInfo;
		baseUrl = `http://127.0.0.1:${address.port}/v1`;
	});

	suiteTeardown(async () => {
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	});

	test('sends a JSON request and parses response metadata', async () => {
		responseMode = 'json';
		const result = await generateCommitMessage('openai', baseUrl, 'test-model', 'test-key', settings);
		assert.deepStrictEqual(result, {
			text: 'fix: test', usage: { inputTokens: 5, outputTokens: 2 }, finishReason: 'stop',
		});
	});

	test('streams SSE text and returns final metadata', async () => {
		responseMode = 'stream';
		const iterator = streamCommitMessage('openai', baseUrl, 'test-model', 'test-key', settings, () => undefined);
		const chunks: string[] = [];
		let current = await iterator.next();
		while (!current.done) {
			chunks.push(current.value);
			current = await iterator.next();
		}
		assert.deepStrictEqual(chunks, ['fix', ': test']);
		assert.deepStrictEqual(current.value, {
			text: 'fix: test', usage: { inputTokens: 5, outputTokens: 2 }, finishReason: 'stop',
		});
	});

	test('surfaces provider HTTP errors', async () => {
		responseMode = 'error';
		await assert.rejects(
			generateCommitMessage('openai', baseUrl, 'test-model', 'test-key', settings),
			/AI request failed: HTTP 429.*rate limited/,
		);
	});

	test('times out stalled requests', async () => {
		responseMode = 'hang';
		await assert.rejects(
			requestJson(`${baseUrl}/chat/completions`, { model: 'test-model' }, { Authorization: 'Bearer test-key' }, 25),
			/Request timed out/,
		);
	});

	test('cancels stalled requests with a stable error', async () => {
		responseMode = 'hang';
		const controller = new AbortController();
		const pending = requestJson(
			`${baseUrl}/chat/completions`, { model: 'test-model' }, { Authorization: 'Bearer test-key' }, 1000, controller.signal,
		);
		controller.abort();
		await assert.rejects(pending, /^Error: Canceled$/);
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

	test('reads latest working-tree content before the first commit', async () => {
		const root = await createRepo();
		try {
			await writeFile(path.join(root, 'first.ts'), 'export const state = "staged";\n');
			execFileSync('git', ['add', '--', 'first.ts'], { cwd: root });
			await writeFile(path.join(root, 'first.ts'), 'export const state = "working";\n');

			const result = await getGitDiffForRoot(root);

			assert.strictEqual(result.files[0].status, 'added');
			assert.ok(result.files[0].rawDiff.includes('+export const state = "working";'));
			assert.ok(!result.files[0].rawDiff.includes('+export const state = "staged";'));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test('returns fresh diff content when a modified file changes again', async () => {
		const root = await createRepo();
		try {
			execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
			execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
			await writeFile(path.join(root, 'app.ts'), 'const value = 1;\n');
			execFileSync('git', ['add', '--', 'app.ts'], { cwd: root });
			execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: root });

			await writeFile(path.join(root, 'app.ts'), 'const value = 2;\n');
			const first = await getGitDiffForRoot(root);
			await writeFile(path.join(root, 'app.ts'), 'const value = 3;\n');
			const second = await getGitDiffForRoot(root);

			assert.ok(first.files[0].rawDiff.includes('+const value = 2;'));
			assert.ok(second.files[0].rawDiff.includes('+const value = 3;'));
			assert.ok(!second.files[0].rawDiff.includes('+const value = 2;'));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
