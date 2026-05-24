import * as vscode from 'vscode';
import { SettingsProvider } from './views/settingsView';

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

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setApiKey', async () => {
			const key = await vscode.window.showInputBox({
				title: 'CommitHub API Key',
				prompt: 'Enter your AI provider API key',
				password: true,
				ignoreFocusOut: true,
				placeHolder: 'sk-...',
			});
			if (key) {
				await context.secrets.store('commithub.apiKey', key);
				vscode.window.showInformationMessage('CommitHub: API key saved');
				settingsProvider.refresh();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setProvider', async () => {
			const provider = await vscode.window.showQuickPick(
				['OpenAI', 'Anthropic', 'Ollama'],
				{
					title: 'CommitHub AI Provider',
					placeHolder: 'Select AI provider',
				}
			);
			if (provider) {
				const config = vscode.workspace.getConfiguration('commithub');
				await config.update('provider', provider.toLowerCase(), vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage(`CommitHub: Provider set to ${provider}`);
				settingsProvider.refresh();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setModel', async () => {
			const model = await vscode.window.showInputBox({
				title: 'CommitHub Model',
				prompt: 'Enter AI model name',
				ignoreFocusOut: true,
				placeHolder: 'gpt-4o',
			});
			if (model) {
				const config = vscode.workspace.getConfiguration('commithub');
				await config.update('model', model, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage(`CommitHub: Model set to ${model}`);
				settingsProvider.refresh();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('commithub.setLanguage', async () => {
			const language = await vscode.window.showQuickPick(
				['Auto', 'Turkish', 'English'],
				{
					title: 'CommitHub Language',
					placeHolder: 'Select commit message language',
				}
			);
			if (language) {
				const config = vscode.workspace.getConfiguration('commithub');
				const value = language === 'Auto' ? 'auto' : language === 'Turkish' ? 'tr' : 'en';
				await config.update('language', value, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage(`CommitHub: Language set to ${language}`);
				settingsProvider.refresh();
			}
		})
	);
}

export function deactivate() {}
