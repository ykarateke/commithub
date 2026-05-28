import * as vscode from 'vscode';
import { SettingsProvider } from './views/settingsView';
import * as https from 'https';
import * as http from 'http';
import { setConnectionStatus, recordCall, stats, initState } from './state';
import { getGitDiff } from './services/git';
import { generateCommitMessage, streamCommitMessage, CommitUsage } from './services/ai';

function cfg() {
	return vscode.workspace.getConfiguration('commithub');
}

const log = vscode.window.createOutputChannel('CommitHub', { log: true });

/** Make an HTTPS/HTTP GET request and return parsed JSON. */
function httpGetJson(url: string, headers: Record<string, string>): Promise<any> {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith('https') ? https : http;
		const req = mod.get(url, { headers }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				const body = Buffer.concat(chunks).toString();
				if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
					reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
					return;
				}
				try {
					resolve(JSON.parse(body));
				} catch (e) {
					reject(new Error(`Invalid JSON: ${body.slice(0, 200)}`));
				}
			});
		});
		req.on('error', reject);
		req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
	});
}

function setInputBoxValue(value: string): void {
	try {
		const gitExt = vscode.extensions.getExtension('vscode.git');
		if (!gitExt?.exports) return;
		const gitApi = typeof gitExt.exports.getAPI === 'function' ? gitExt.exports.getAPI(1) : gitExt.exports;
		const repo = gitApi?.repositories?.[0];
		if (repo?.inputBox) repo.inputBox.value = value;
	} catch { /* ignore */ }
}

const providerBaseUrls: Record<string, string> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	google_gemini: 'https://generativelanguage.googleapis.com/v1beta',
	zhipu_glm: 'https://open.bigmodel.cn/api/paas/v4',
	zhipu_glm_coding: 'https://open.bigmodel.cn/api/coding/paas/v4',
	xai_grok: 'https://api.x.ai/v1',
	deepseek: 'https://api.deepseek.com',
	mistral: 'https://api.mistral.ai/v1',
	ollama: 'http://localhost:11434/v1',
	openrouter: 'https://openrouter.ai/api/v1',
	groq: 'https://api.groq.com/openai/v1',
	together: 'https://api.together.xyz/v1',
};

/** Returns a list of { label, description } models fetched from the current provider's API. */
async function fetchModels(apiKey: string | undefined): Promise<{ label: string; description: string }[] | undefined> {
	const provider = cfg().get<string>('provider', '');
	const customBaseUrl = cfg().get<string>('baseUrl', '');

	const knownEndpoints: Record<string, string> = {
		openai: 'https://api.openai.com/v1/models',
		anthropic: 'https://api.anthropic.com/v1/models',
		google_gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
		zhipu_glm: 'https://open.bigmodel.cn/api/paas/v4/models',
		xai_grok: 'https://api.x.ai/v1/models',
		deepseek: 'https://api.deepseek.com/models',
		mistral: 'https://api.mistral.ai/v1/models',
		openrouter: 'https://openrouter.ai/api/v1/models',
		groq: 'https://api.groq.com/openai/v1/models',
		together: 'https://api.together.xyz/v1/models',
	};

	let url: string | undefined;

	if (customBaseUrl) {
		url = customBaseUrl.replace(/\/+$/, '') + '/models';
	} else {
		url = knownEndpoints[provider];
	}

	if (!url) {
		vscode.window.showInformationMessage(`CommitHub: Model listing not supported for ${provider}. Type model name manually.`);
		return undefined;
	}

	log.info(`[fetchModels] GET ${url}`);

	try {
		const headers: Record<string, string> = {};
		if (apiKey) {
			if (provider === 'anthropic') {
				headers['x-api-key'] = apiKey;
				headers['anthropic-version'] = '2023-06-01';
			} else {
				headers['Authorization'] = `Bearer ${apiKey}`;
			}
		}
		const data: any = await httpGetJson(url, headers);

		let models: { id: string; name?: string; display_name?: string; owned_by?: string; created?: number }[] = [];
		if (data.data) {models = data.data;}
		else if (Array.isArray(data)) {models = data;}
		else if (data.models) {models = data.models;}

		const isGemini = provider === 'google_gemini';

		if (!models || !models.length) {
			log.warn('[fetchModels] no models returned');
			vscode.window.showInformationMessage('CommitHub: No models returned by API. Type model name manually.');
			return undefined;
		}

		log.info(`[fetchModels] OK — ${models.length} models`);
		return models.map(m => ({
			label: m.id || (m as any).name?.replace(/^models\//, '') || '',
			description: m.display_name || (m as any).displayName || m.name?.replace(/^models\//, '') || m.owned_by || '',
		})).filter(m => m.label);
	} catch (e: any) {
		log.error(`[fetchModels] FAILED — ${e.message}`);
		vscode.window.showErrorMessage(`CommitHub: Model fetch failed — ${e.message}`);
		return undefined;
	}
}

async function setToggle(title: string, key: string, provider: SettingsProvider): Promise<void> {
	const current = cfg().get(key, true);
	const pick = await vscode.window.showQuickPick(
		[current ? 'off' : 'on'],
		{ title, placeHolder: `Current: ${current ? 'on' : 'off'}` }
	);
	if (!pick) {return;}
	await cfg().update(key, pick === 'on', vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(`CommitHub: ${key} set to ${pick}`);
	provider.refresh();
}

async function setNumber(title: string, key: string, defaultVal: number, provider: SettingsProvider): Promise<void> {
	const current = cfg().get(key, defaultVal);
	const val = await vscode.window.showInputBox({
		title,
		value: String(current),
		validateInput: v => isNaN(Number(v)) ? 'Enter a valid number' : undefined,
		ignoreFocusOut: true,
	});
	if (!val) {return;}
	await cfg().update(key, Number(val), vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(`CommitHub: ${key} set to ${val}`);
	provider.refresh();
}

/**
 * Warn the user when a prerequisite is not met.
 * Returns true if OK, false if blocked.
 */
async function requireSetup(
	condition: boolean,
	title: string,
	message: string,
	setupCommand: string,
): Promise<boolean> {
	if (condition) {return true;}
	const action = 'Go to setting';
	const result = await vscode.window.showWarningMessage(message, action);
	if (result === action) {
		vscode.commands.executeCommand(setupCommand);
	}
	return false;
}

export function activate(context: vscode.ExtensionContext) {
	console.log('[CommitHub] extension active');

	initState(context);

	const settingsProvider = new SettingsProvider();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('commithub.settingsView', settingsProvider)
	);

	const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusItem.command = 'commithub.testConnection';
	statusItem.text = '$(plug) CommitHub';
	statusItem.tooltip = 'Click to test connection';
	statusItem.show();
	context.subscriptions.push(statusItem);

	const initialProvider = cfg().get<string>('provider', '');
	if (initialProvider) {
		setConnectionStatus('connected');
		statusItem.text = '$(check) CommitHub';
		statusItem.tooltip = `Connected to ${initialProvider} — click to retest`;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.generateCommit', async () => {
			const provider = cfg().get<string>('provider', '');
			if (!provider) {
				vscode.window.showWarningMessage('CommitHub: Select a Provider first', 'Open Settings')
					.then(a => { if (a) { vscode.commands.executeCommand('commithub.setProvider'); }});
				return;
			}
			const key = provider === 'ollama' ? '' : (await context.secrets.get('commithub.apiKey'));
			if (provider !== 'ollama' && !key) {
				vscode.window.showWarningMessage('CommitHub: Set your API Key first', 'Set API Key')
					.then(a => { if (a) { vscode.commands.executeCommand('commithub.setApiKey'); }});
				return;
			}

			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspaceRoot) {
				vscode.window.showErrorMessage('CommitHub: No workspace folder open');
				return;
			}

			const excludePatterns = cfg().get<string>('excludeFiles', '')
				.split(',')
				.map(s => s.trim())
				.filter(Boolean);

			const untrackedMaxLines = cfg().get('untrackedFileMaxLines', 100);
			const maxDiffSize = cfg().get('maxDiffSize', 8000);

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'CommitHub: Generating commit message...',
				cancellable: true,
			}, async (progress, token) => {
				try {
					const git = await getGitDiff(workspaceRoot, excludePatterns, untrackedMaxLines, true);
					if (!git.hasChanges) {
						vscode.window.showInformationMessage('CommitHub: No changes detected to commit');
						statusItem.text = '$(plug) CommitHub';
						statusItem.tooltip = 'Click to test connection';
						return;
					}

					const model = cfg().get<string>('model', 'gpt-4o');
					const baseUrl = cfg().get<string>('baseUrl', '') || providerBaseUrls[provider] || 'https://api.openai.com/v1';

					log.info(`[generateCommit] provider=${provider} model=${model} baseUrl=${baseUrl} files=${git.files.length} totalDiff=+${git.totalAdded}/-${git.totalRemoved}`);
					const rawTypes = cfg().get<string>('conventionalTypes', '');
					const abort = new AbortController();
					token.onCancellationRequested(() => abort.abort());

					const settings = {
						files: git.files,
						totalAdded: git.totalAdded,
						totalRemoved: git.totalRemoved,
						summaryStats: git.summaryStats,
						maxDiffSize,
						language: cfg().get<string>('language', 'auto'),
						maxLength: cfg().get('maxLength', 72),
						conventionalCommit: cfg().get('conventionalCommit', true),
						includeBody: cfg().get('includeBody', true),
						includeFooter: cfg().get('includeFooter', false),
						emoji: cfg().get('emoji', false),
						tone: cfg().get<string>('tone', 'auto'),
						scopeDetection: cfg().get('scopeDetection', true),
						breakingChanges: cfg().get('breakingChanges', true),
						temperature: cfg().get('temperature', 0.7),
						maxTokens: cfg().get('maxTokens', 500),
						conventionalTypes: rawTypes ? rawTypes.split(',').map(s => s.trim()).filter(Boolean) : [],
					};

					const t0 = Date.now();
					const iterator = streamCommitMessage(provider, baseUrl, model, key || undefined, settings, (msg) => log.info(msg), abort.signal);
					let fullText = '';
					let hasFirstChunk = false;
					let lastUiUpdate = 0;
					const UI_THROTTLE_MS = 100;
					let iterResult = await iterator.next();

					while (!iterResult.done) {
						const chunk: string = iterResult.value as any;
						if (chunk === '__REASONING__') {
							progress.report({ message: '🧠 Model is thinking...' });
							iterResult = await iterator.next();
							continue;
						}
						fullText += chunk;
						const now = Date.now();
						if (!hasFirstChunk) {
							hasFirstChunk = true;
							log.info(`[generateCommit] TTFT (first chunk in SCM) = ${now - t0}ms`);
							progress.report({ message: '✍️ Writing commit message...' });
							setInputBoxValue(fullText);
							lastUiUpdate = now;
						} else if (now - lastUiUpdate >= UI_THROTTLE_MS) {
							setInputBoxValue(fullText);
							lastUiUpdate = now;
						}
						iterResult = await iterator.next();
					}

					const totalMs = Date.now() - t0;
					const returnVal = iterResult.value as { text: string; usage: CommitUsage; finishReason: string } | undefined;
					const finalText = returnVal?.text || fullText.trim();

					if (!hasFirstChunk && !finalText) {
						vscode.window.showErrorMessage('CommitHub: AI returned an empty response');
						return;
					}

					setInputBoxValue(finalText);

					log.info(`[generateCommit] COMPLETE — totalE2E=${totalMs}ms responseLen=${finalText.length} chars inputTokens=${returnVal?.usage.inputTokens ?? '-'} outputTokens=${returnVal?.usage.outputTokens ?? '-'}`);

					if (returnVal) {
						recordCall({
							provider,
							model,
							inputTokens: returnVal.usage.inputTokens,
							outputTokens: returnVal.usage.outputTokens,
							durationMs: Date.now() - t0,
						});
					}

					vscode.commands.executeCommand('workbench.view.scm');

					statusItem.text = '$(check) CommitHub';
					statusItem.tooltip = 'Connected — click to test';
				} catch (e: any) {
					if (token.isCancellationRequested) { return; }
					log.error(`[generateCommit] FAILED — ${e.message}`);
					vscode.window.showErrorMessage(`CommitHub: ${e.message}`);
					statusItem.text = '$(error) CommitHub';
					statusItem.tooltip = `Error: ${e.message}`;
				}
			});
		})
	);

	// ── Provider ──────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setApiKey', async () => {
			const existing = await context.secrets.get('commithub.apiKey');
			const key = await vscode.window.showInputBox({
				title: 'CommitHub API Key',
				prompt: 'Enter your AI provider API key',
				password: true,
				ignoreFocusOut: true,
				placeHolder: existing ? 'sk-... (leave empty to clear)' : 'sk-...',
			});
			if (key === undefined) {return;}
			if (key === '') {
				await context.secrets.delete('commithub.apiKey');
				vscode.window.showInformationMessage('CommitHub: API key cleared');
			} else {
				await context.secrets.store('commithub.apiKey', key);
				vscode.window.showInformationMessage('CommitHub: API key saved');
				vscode.commands.executeCommand('commithub.testConnection');
			}
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setProvider', async () => {
			const providers = [
				{ label: 'OpenAI', description: 'GPT-4o, GPT-4o-mini, o3, o4-mini — $2.50/MTok input', id: 'openai' },
				{ label: 'Anthropic', description: 'Claude Sonnet 4.6, Haiku 4.5, Opus 4.6 — $3/MTok input', id: 'anthropic' },
				{ label: 'Google Gemini', description: 'Gemini 2.5 Pro, 2.5 Flash — $1.25/MTok input', id: 'google_gemini' },
				{ label: 'Zhipu GLM', description: 'All models: GLM-4.7-Flash (free), GLM-4.5-Air, GLM-5-Turbo, GLM-5.1', id: 'zhipu_glm' },
				{ label: 'Zhipu GLM (Coding)', description: 'Coding plan: GLM-4.5-Air, GLM-5-Turbo — optimized for code', id: 'zhipu_glm_coding' },
				{ label: 'xAI Grok', description: 'Grok 4.1 Fast, Grok 4 — $0.20/MTok input (cheapest!)', id: 'xai_grok' },
				{ label: 'DeepSeek', description: 'DeepSeek-V4, DeepSeek-R1 — $0.30/MTok input', id: 'deepseek' },
				{ label: 'Mistral', description: 'Mistral Large, Mistral Small — $2/MTok input', id: 'mistral' },
				{ label: 'Ollama', description: 'Local LLMs: Llama 3, DeepSeek, Qwen — free & private', id: 'ollama' },
				{ label: 'OpenRouter', description: 'Multi-provider gateway — 100+ models', id: 'openrouter' },
				{ label: 'Groq', description: 'Fast inference: Llama 4, Mixtral — ~500 tok/s', id: 'groq' },
				{ label: 'Together AI', description: 'Open-source models hosted — $0.10-0.80/MTok', id: 'together' },
			];
			const pick = await vscode.window.showQuickPick(providers, {
				title: 'CommitHub AI Provider',
				placeHolder: 'Select AI provider',
			});
			if (!pick) {return;}
			const id = pick.id;
			await cfg().update('provider', id, vscode.ConfigurationTarget.Global);
			const defaultUrl = providerBaseUrls[id] || '';
			await cfg().update('baseUrl', defaultUrl, vscode.ConfigurationTarget.Global);
			settingsProvider.refresh();
			vscode.window.showInformationMessage(`CommitHub: Provider set to ${pick.label}`);

			const apiKey = id === 'ollama' ? '' : (await context.secrets.get('commithub.apiKey'));
			if (apiKey || id === 'ollama') {
				const models = await fetchModels(apiKey);
				if (models?.length) {
					const modelPick = await vscode.window.showQuickPick(models, {
						title: `CommitHub — Select Model (${pick.label})`,
						placeHolder: `${models.length} models fetched`,
						matchOnDescription: true,
					});
					if (modelPick) {
						await cfg().update('model', modelPick.label, vscode.ConfigurationTarget.Global);
						vscode.window.showInformationMessage(`CommitHub: Model set to ${modelPick.label}`);
					}
				} else {
					const manual = await vscode.window.showInputBox({
						title: 'CommitHub Model',
						prompt: 'Could not fetch models — enter model name manually',
						ignoreFocusOut: true,
					});
					if (manual) {
						await cfg().update('model', manual, vscode.ConfigurationTarget.Global);
					}
				}
			} else {
				vscode.window.showWarningMessage('CommitHub: Set your API Key first, then use Fetch Models to pick a model.', 'Set API Key')
					.then(a => { if (a) { vscode.commands.executeCommand('commithub.setApiKey'); }});
			}
			settingsProvider.refresh();
			vscode.commands.executeCommand('commithub.testConnection');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.testConnection', async () => {
			const provider = cfg().get<string>('provider', '');
			if (!provider) {
				setConnectionStatus('no provider');
				statusItem.text = '$(plug) no provider';
				statusItem.tooltip = 'Set a provider first';
				settingsProvider.refresh();
				vscode.window.showWarningMessage('CommitHub: Set a Provider first', 'Set Provider')
					.then(a => { if (a) { vscode.commands.executeCommand('commithub.setProvider'); }});
				return;
			}
			setConnectionStatus('testing...');
			statusItem.text = '$(sync~spin) testing...';
			statusItem.tooltip = 'Testing API connection';
			settingsProvider.refresh();

			const apiKey = await context.secrets.get('commithub.apiKey');
			const baseUrl = cfg().get<string>('baseUrl', '');
			let testUrl: string | undefined;

			if (baseUrl) {
				testUrl = baseUrl.replace(/\/+$/, '') + '/models';
			} else {
				const known: Record<string, string> = {
					openai: 'https://api.openai.com/v1/models',
					anthropic: 'https://api.anthropic.com/v1/models',
					openrouter: 'https://openrouter.ai/api/v1/models',
					groq: 'https://api.groq.com/openai/v1/models',
					together: 'https://api.together.xyz/v1/models',
					deepseek: 'https://api.deepseek.com/models',
		zhipu_glm: 'https://open.bigmodel.cn/api/paas/v4/models',
		zhipu_glm_coding: 'https://open.bigmodel.cn/api/coding/paas/v4/models',
				};
				testUrl = known[provider];
			}

			if (!testUrl) {
				setConnectionStatus('no listing endpoint');
				statusItem.text = '$(warning) no endpoint';
				statusItem.tooltip = 'Auto-test not supported for this provider';
				settingsProvider.refresh();
				vscode.window.showInformationMessage(`CommitHub: Auto-test not supported for ${provider}.`);
				return;
			}

			try {
				const headers: Record<string, string> = {};
				if (apiKey) {
					if (provider === 'anthropic') {
						headers['x-api-key'] = apiKey;
						headers['anthropic-version'] = '2023-06-01';
					} else {
						headers['Authorization'] = `Bearer ${apiKey}`;
					}
				}
				log.info(`[testConnection] GET ${testUrl}`);
				const mod = testUrl.startsWith('https') ? https : http;
				await new Promise<void>((resolve, reject) => {
					const req = mod.get(testUrl!, { headers, timeout: 10000 }, (res) => {
						let body = '';
						res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
						res.on('end', () => {
							if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
								resolve();
							} else {
								const err = `HTTP ${res.statusCode}: ${body.slice(0, 200)}`;
								log.error(`[testConnection] ${err}`);
								reject(new Error(err));
							}
						});
					});
					req.on('error', (e) => { log.error(`[testConnection] ${e.message}`); reject(e); });
					req.on('timeout', () => { req.destroy(); log.warn('[testConnection] timed out'); reject(new Error('timed out')); });
				});
				log.info('[testConnection] OK');
				setConnectionStatus('connected');
				statusItem.text = '$(check) CommitHub';
				statusItem.tooltip = `Connected to ${provider} — click to retest`;
				vscode.window.showInformationMessage(`CommitHub: Connected to ${provider}`);
			} catch (e: any) {
				log.error(`[testConnection] FAILED — ${e.message}`);
				setConnectionStatus('failed');
				statusItem.text = '$(error) CommitHub';
				statusItem.tooltip = `Disconnected — ${e.message}`;
				vscode.window.showErrorMessage(`CommitHub: ${provider} connection failed — ${e.message}`);
			}
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.fetchModels', async () => {
			const ok = await requireSetup(
				!!cfg().get('provider', ''),
				'CommitHub Models',
				'CommitHub: Set a Provider first',
				'commithub.setProvider',
			);
			if (!ok) {return;}
			const apiKey = await context.secrets.get('commithub.apiKey');
			const models = await fetchModels(apiKey);
			if (!models) {return;}
			const pick = await vscode.window.showQuickPick(models, {
				title: 'CommitHub — Select Model',
				placeHolder: `Fetched ${models.length} models from ${cfg().get('provider', '')}`,
				matchOnDescription: true,
			});
			if (!pick) {return;}
			await cfg().update('model', pick.label, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`CommitHub: Model set to ${pick.label}`);
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setModel', async () => {
			const ok = await requireSetup(
				!!cfg().get('provider', ''),
				'CommitHub Model',
				'CommitHub: Set a Provider before choosing a Model',
				'commithub.setProvider',
			);
			if (!ok) {return;}

			const current = cfg().get('model', 'gpt-4o');

			const provider = cfg().get<string>('provider', '');
			const apiKey = provider === 'ollama' ? '' : (await context.secrets.get('commithub.apiKey'));

			let pick: { label: string; description?: string } | undefined;
			if (provider !== 'ollama' && apiKey) {
				const models = await fetchModels(apiKey);
				if (models?.length) {
					const selected = await vscode.window.showQuickPick(models, {
						title: 'CommitHub Model',
						placeHolder: `Current: ${current}`,
					});
					pick = selected;
				}
			}

			const modelName = pick?.label ?? await vscode.window.showInputBox({
				title: 'CommitHub Model',
				prompt: 'Enter AI model name',
				value: current,
				ignoreFocusOut: true,
				placeHolder: 'gpt-4o',
			});
			if (!modelName) {return;}
			await cfg().update('model', modelName, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`CommitHub: Model set to ${modelName}`);
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setBaseUrl', async () => {
			const ok = await requireSetup(
				!!cfg().get('provider', ''),
				'CommitHub Base URL',
				'CommitHub: Set a Provider before configuring a custom Base URL',
				'commithub.setProvider',
			);
			if (!ok) {return;}
			const provider = cfg().get('provider', '');
			const defaultUrl = providerBaseUrls[provider] || 'https://api.openai.com/v1';
			const current = cfg().get('baseUrl', '');
			const url = await vscode.window.showInputBox({
				title: 'CommitHub Base URL',
				prompt: `Default for ${provider}: ${defaultUrl}. Enter custom or leave empty.`,
				value: current || '',
				ignoreFocusOut: true,
				placeHolder: defaultUrl,
			});
			if (url === undefined) {return;}
			await cfg().update('baseUrl', url, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(url ? `CommitHub: Base URL set` : 'CommitHub: Using default API URL');
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setTemperature', async () => {
			await setNumber('CommitHub Temperature (0.0–2.0)', 'temperature', 0.7, settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setMaxTokens', async () => {
			await setNumber('CommitHub Max Tokens', 'maxTokens', 500, settingsProvider);
		})
	);

	// ── Message ───────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setLanguage', async () => {
			const current = cfg().get('language', 'auto');
			const langs = [
				{ id: 'auto', label: 'Auto', desc: 'Let AI decide based on codebase' },
				{ id: 'en', label: 'English' },
				{ id: 'tr', label: 'Türkçe (Turkish)' },
				{ id: 'de', label: 'Deutsch (German)' },
				{ id: 'fr', label: 'Français (French)' },
				{ id: 'es', label: 'Español (Spanish)' },
				{ id: 'pt', label: 'Português (Portuguese)' },
				{ id: 'it', label: 'Italiano (Italian)' },
				{ id: 'nl', label: 'Nederlands (Dutch)' },
				{ id: 'pl', label: 'Polski (Polish)' },
				{ id: 'ru', label: 'Русский (Russian)' },
				{ id: 'ja', label: '日本語 (Japanese)' },
				{ id: 'ko', label: '한국어 (Korean)' },
				{ id: 'zh-CN', label: '简体中文 (Chinese Simplified)' },
				{ id: 'zh-TW', label: '繁體中文 (Chinese Traditional)' },
				{ id: 'ar', label: 'العربية (Arabic)' },
				{ id: 'hi', label: 'हिन्दी (Hindi)' },
				{ id: 'sv', label: 'Svenska (Swedish)' },
				{ id: 'da', label: 'Dansk (Danish)' },
				{ id: 'fi', label: 'Suomi (Finnish)' },
				{ id: 'nb', label: 'Norsk (Norwegian)' },
				{ id: 'cs', label: 'Čeština (Czech)' },
				{ id: 'hu', label: 'Magyar (Hungarian)' },
				{ id: 'ro', label: 'Română (Romanian)' },
				{ id: 'uk', label: 'Українська (Ukrainian)' },
				{ id: 'el', label: 'Ελληνικά (Greek)' },
				{ id: 'th', label: 'ไทย (Thai)' },
				{ id: 'vi', label: 'Tiếng Việt (Vietnamese)' },
				{ id: 'bg', label: 'Български (Bulgarian)' },
				{ id: 'hr', label: 'Hrvatski (Croatian)' },
				{ id: 'sk', label: 'Slovenčina (Slovak)' },
				{ id: 'sl', label: 'Slovenščina (Slovenian)' },
			];
			const items = langs.map(l => ({
				label: l.label,
				description: l.id === 'auto' ? l.desc : l.id,
			}));
			const pick = await vscode.window.showQuickPick(items, {
				title: 'CommitHub Language',
				placeHolder: `Current: ${langs.find(l => l.id === current)?.label || current}`,
			});
			if (!pick) {return;}
			const found = langs.find(l => l.label === pick.label);
			await cfg().update('language', found?.id || 'auto', vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`CommitHub: Language set to ${pick.label}`);
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setMaxLength', async () => {
			await setNumber('CommitHub Max Line Length', 'maxLength', 72, settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setConventionalCommit', async () => {
			await setToggle('CommitHub Conventional Commits', 'conventionalCommit', settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setIncludeBody', async () => {
			await setToggle('CommitHub Include Body', 'includeBody', settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setIncludeFooter', async () => {
			await setToggle('CommitHub Include Footer', 'includeFooter', settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setEmoji', async () => {
			await setToggle('CommitHub Emoji', 'emoji', settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setTone', async () => {
			const current = cfg().get('tone', 'auto');
			const tones = [
				{ label: 'auto', description: 'Let AI decide the tone' },
				{ label: 'formal', description: 'Professional, structured messages' },
				{ label: 'casual', description: 'Light, conversational style' },
				{ label: 'technical', description: 'Precise, code-focused language' },
				{ label: 'conventional', description: 'Strict Conventional Commits format' },
			];
			const pick = await vscode.window.showQuickPick(tones.filter(t => t.label !== current), {
				title: 'CommitHub Message Tone',
				placeHolder: `Current: ${current}`,
			});
			if (!pick) {return;}
			await cfg().update('tone', pick.label, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`CommitHub: Tone set to ${pick.label}`);
			settingsProvider.refresh();
		})
	);

	// ── Analysis ──────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setScopeDetection', async () => {
			const ok = await requireSetup(
				cfg().get('conventionalCommit', true),
				'CommitHub Scope Detection',
				'CommitHub: Enable Conventional Commit first to use Scope Detection',
				'commithub.setConventionalCommit',
			);
			if (!ok) {return;}
			await setToggle('CommitHub Scope Detection', 'scopeDetection', settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setBreakingChanges', async () => {
			const ok = await requireSetup(
				cfg().get('conventionalCommit', true),
				'CommitHub Breaking Changes',
				'CommitHub: Enable Conventional Commit first to use Breaking Change Detection',
				'commithub.setConventionalCommit',
			);
			if (!ok) {return;}
			await setToggle('CommitHub Breaking Changes Detection', 'breakingChanges', settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setMaxDiffSize', async () => {
			await setNumber('CommitHub Max Diff Size (chars)', 'maxDiffSize', 8000, settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setExcludeFiles', async () => {
			const current = cfg().get('excludeFiles', '');
			const patterns = await vscode.window.showInputBox({
				title: 'CommitHub Exclude Files',
				prompt: 'Glob patterns to exclude (comma-separated)',
				value: current,
				ignoreFocusOut: true,
				placeHolder: 'package-lock.json, *.lock, dist/',
			});
			if (patterns === undefined) {return;}
			await cfg().update('excludeFiles', patterns, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(patterns ? 'CommitHub: Exclude patterns saved' : 'CommitHub: Exclude patterns cleared');
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setConventionalTypes', async () => {
			const ok = await requireSetup(
				cfg().get('conventionalCommit', true),
				'CommitHub Conventional Types',
				'CommitHub: Enable Conventional Commit first to customize types',
				'commithub.setConventionalCommit',
			);
			if (!ok) {return;}
			const current = cfg().get('conventionalTypes', '');
			const types = await vscode.window.showInputBox({
				title: 'CommitHub Conventional Types',
				prompt: 'Comma-separated list of allowed conventional commit types',
				value: current,
				ignoreFocusOut: true,
				placeHolder: 'feat, fix, chore, docs, style, refactor, perf, test, ci, build, revert',
			});
			if (types === undefined) {return;}
			await cfg().update('conventionalTypes', types, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(types ? 'CommitHub: Conventional types saved' : 'CommitHub: Using default types');
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.showStats', () => {
			const s = stats;
			if (!s.totalCalls) {
				vscode.window.showInformationMessage('CommitHub: No API calls made yet. Generate a commit first.');
				return;
			}
			const lines = [
				`Total API calls:  ${s.totalCalls}`,
				`Total input tokens:  ${s.totalInputTokens.toLocaleString()}`,
				`Total output tokens: ${s.totalOutputTokens.toLocaleString()}`,
				`Total tokens:        ${(s.totalInputTokens + s.totalOutputTokens).toLocaleString()}`,
				`──────────────────────────`,
				`Last call:`,
				`  Provider:  ${s.lastProvider}`,
				`  Model:     ${s.lastModel}`,
				`  Input:     ${s.lastInputTokens.toLocaleString()} tokens`,
				`  Output:    ${s.lastOutputTokens.toLocaleString()} tokens`,
				`  Duration:  ${s.lastDurationMs}ms`,
			];
			vscode.window.showInformationMessage('CommitHub Statistics', { modal: true, detail: lines.join('\n') });
		})
	);
}

export function deactivate() {}
