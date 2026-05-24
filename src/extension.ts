import * as vscode from 'vscode';
import { SettingsProvider } from './views/settingsView';
import * as https from 'https';
import * as http from 'http';
import { setConnectionStatus } from './state';

function cfg() {
	return vscode.workspace.getConfiguration('commithub');
}

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

const providerBaseUrls: Record<string, string> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	google_gemini: 'https://generativelanguage.googleapis.com/v1beta',
	zhipu_glm: 'https://open.bigmodel.cn/api/paas/v4',
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
		openrouter: 'https://openrouter.ai/api/v1/models',
		groq: 'https://api.groq.com/openai/v1/models',
		together: 'https://api.together.xyz/v1/models',
		deepseek: 'https://api.deepseek.com/models',
		zhipu_glm: 'https://open.bigmodel.cn/api/paas/v4/models',
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

	vscode.window.showInformationMessage(`CommitHub: Fetching models from ${provider}...`);

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

		if (!models || !models.length) {
			vscode.window.showInformationMessage('CommitHub: No models returned by API. Type model name manually.');
			return undefined;
		}

		return models.map(m => ({
			label: m.id,
			description: m.display_name || m.name || m.owned_by || '',
		}));
	} catch (e: any) {
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

	if (cfg().get<string>('provider', '')) {
		vscode.commands.executeCommand('commithub.testConnection');
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from CommitHub!');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.generateCommit', async () => {
			const provider = cfg().get('provider', '');
			if (!provider) {
				vscode.window.showWarningMessage('CommitHub: Select a Provider first', 'Open Settings')
					.then(a => { if (a) { vscode.commands.executeCommand('commithub.setProvider'); }});
				return;
			}
			if (provider !== 'ollama') {
				const key = await context.secrets.get('commithub.apiKey');
				if (!key) {
					vscode.window.showWarningMessage('CommitHub: Set your API Key first', 'Set API Key')
						.then(a => { if (a) { vscode.commands.executeCommand('commithub.setApiKey'); }});
					return;
				}
			}
			vscode.window.showInformationMessage('CommitHub: Generating commit message...');
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
				{ label: 'OpenAI', description: 'GPT-4o, GPT-4o-mini, o3, o4-mini — $2.50/MTok input' },
				{ label: 'Anthropic', description: 'Claude Sonnet 4.6, Haiku 4.5, Opus 4.6 — $3/MTok input' },
				{ label: 'Google Gemini', description: 'Gemini 2.5 Pro, 2.5 Flash — $1.25/MTok input' },
				{ label: 'Zhipu GLM', description: 'GLM-4, GLM-4V, GLM-4-Plus — Chinese LLM leader' },
				{ label: 'xAI Grok', description: 'Grok 4.1 Fast, Grok 4 — $0.20/MTok input (cheapest!)' },
				{ label: 'DeepSeek', description: 'DeepSeek-V4, DeepSeek-R1 — $0.30/MTok input' },
				{ label: 'Mistral', description: 'Mistral Large, Mistral Small — $2/MTok input' },
				{ label: 'Ollama', description: 'Local LLMs: Llama 3, DeepSeek, Qwen — free & private' },
				{ label: 'OpenRouter', description: 'Multi-provider gateway — 100+ models' },
				{ label: 'Groq', description: 'Fast inference: Llama 4, Mixtral — ~500 tok/s' },
				{ label: 'Together AI', description: 'Open-source models hosted — $0.10-0.80/MTok' },
			];
			const pick = await vscode.window.showQuickPick(providers, {
				title: 'CommitHub AI Provider',
				placeHolder: 'Select AI provider',
			});
			if (!pick) {return;}
			const id = pick.label.toLowerCase().replace(/\s+/g, '_');
			await cfg().update('provider', id, vscode.ConfigurationTarget.Global);
			const defaultUrl = providerBaseUrls[id] || '';
			const currentUrl = cfg().get('baseUrl', '');
			if (!currentUrl || currentUrl === 'custom') {
				await cfg().update('baseUrl', defaultUrl, vscode.ConfigurationTarget.Global);
			}
			vscode.window.showInformationMessage(`CommitHub: Provider set to ${pick.label}${defaultUrl ? ` — Base URL: ${defaultUrl}` : ''}`);
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
				const mod = testUrl.startsWith('https') ? https : http;
				await new Promise<void>((resolve, reject) => {
					const req = mod.get(testUrl!, { headers, timeout: 10000 }, (res) => {
						let body = '';
						res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
						res.on('end', () => {
							if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
								resolve();
							} else {
								reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 100)}`));
							}
						});
					});
					req.on('error', reject);
					req.on('timeout', () => { req.destroy(); reject(new Error('timed out')); });
				});
				setConnectionStatus('connected');
				statusItem.text = '$(check) CommitHub';
				statusItem.tooltip = `Connected to ${provider} — click to retest`;
				vscode.window.showInformationMessage(`CommitHub: Connected to ${provider}`);
			} catch (e: any) {
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
			const action = await vscode.window.showQuickPick(
				[
					{ label: 'Type model name', description: 'Enter manually' },
					{ label: 'Fetch models from API', description: 'Auto-detect available models' },
				],
				{ title: 'CommitHub Model', placeHolder: `Current: ${current}` },
			);
			if (!action) {return;}

			if (action.label === 'Fetch models from API') {
				vscode.commands.executeCommand('commithub.fetchModels');
				return;
			}

			const model = await vscode.window.showInputBox({
				title: 'CommitHub Model',
				prompt: 'Enter AI model name',
				value: current,
				ignoreFocusOut: true,
				placeHolder: 'gpt-4o',
			});
			if (!model) {return;}
			await cfg().update('model', model, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`CommitHub: Model set to ${model}`);
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
			const map = new Map([['auto', 'Auto'], ['tr', 'Turkish'], ['en', 'English']]);
			const pick = await vscode.window.showQuickPick(
				['Auto', 'Turkish', 'English'].filter(l => l !== map.get(current)),
				{ title: 'CommitHub Language', placeHolder: `Current: ${map.get(current)}` }
			);
			if (!pick) {return;}
			const val = pick === 'Auto' ? 'auto' : pick === 'Turkish' ? 'tr' : 'en';
			await cfg().update('language', val, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`CommitHub: Language set to ${pick}`);
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
}

export function deactivate() {}
