import * as vscode from 'vscode';
import { SettingsProvider } from './views/settingsView';

type Toggle = 'on' | 'off';

function cfg() {
	return vscode.workspace.getConfiguration('commithub');
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

export function activate(context: vscode.ExtensionContext) {
	console.log('[CommitHub] extension active');

	const settingsProvider = new SettingsProvider();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('commithub.settingsView', settingsProvider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from CommitHub!');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.generateCommit', async () => {
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
			vscode.window.showInformationMessage(`CommitHub: Provider set to ${pick.label}`);
			settingsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setModel', async () => {
			const current = cfg().get('model', 'gpt-4o');
			const model = await vscode.window.showInputBox({
				title: 'CommitHub Model',
				prompt: 'Enter AI model name (see provider docs for available models)',
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
			const current = cfg().get('baseUrl', '');
			const url = await vscode.window.showInputBox({
				title: 'CommitHub Base URL',
				prompt: 'Custom API endpoint (leave empty for default)',
				value: current,
				ignoreFocusOut: true,
				placeHolder: 'https://api.openai.com/v1',
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
			await setToggle('CommitHub Scope Detection', 'scopeDetection', settingsProvider);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setBreakingChanges', async () => {
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
