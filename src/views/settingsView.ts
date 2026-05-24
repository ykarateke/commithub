import * as vscode from 'vscode';

type SettingLeaf = {
	key: string;
	label: string;
	icon: string;
	command: string;
	description: () => string;
};

type SettingGroup = {
	label: string;
	icon: string;
	children: SettingLeaf[];
};

const cfg = () => vscode.workspace.getConfiguration('commithub');

const groups: SettingGroup[] = [
	{
		label: 'Provider',
		icon: 'cloud',
		children: [
			{ key: 'apiKey', label: 'API Key', icon: 'key', command: 'commithub.setApiKey', description: () => '' },
			{ key: 'provider', label: 'Provider', icon: 'server', command: 'commithub.setProvider', description: () => cfg().get('provider', 'openai') },
			{ key: 'model', label: 'Model', icon: 'symbol-parameter', command: 'commithub.setModel', description: () => cfg().get('model', 'gpt-4o') },
			{ key: 'baseUrl', label: 'Base URL', icon: 'link', command: 'commithub.setBaseUrl', description: () => cfg().get('baseUrl', '') || 'default' },
			{ key: 'temperature', label: 'Temperature', icon: 'grabber', command: 'commithub.setTemperature', description: () => String(cfg().get('temperature', 0.7)) },
			{ key: 'maxTokens', label: 'Max Tokens', icon: 'symbol-number', command: 'commithub.setMaxTokens', description: () => String(cfg().get('maxTokens', 500)) },
		],
	},
	{
		label: 'Message',
		icon: 'symbol-text',
		children: [
			{ key: 'language', label: 'Language', icon: 'globe', command: 'commithub.setLanguage', description: () => cfg().get('language', 'auto') },
			{ key: 'maxLength', label: 'Max Length', icon: 'symbol-number', command: 'commithub.setMaxLength', description: () => String(cfg().get('maxLength', 72)) },
			{ key: 'conventionalCommit', label: 'Conventional', icon: 'check', command: 'commithub.setConventionalCommit', description: () => cfg().get('conventionalCommit', true) ? 'on' : 'off' },
			{ key: 'includeBody', label: 'Include Body', icon: 'list-tree', command: 'commithub.setIncludeBody', description: () => cfg().get('includeBody', true) ? 'on' : 'off' },
			{ key: 'includeFooter', label: 'Include Footer', icon: 'list-flat', command: 'commithub.setIncludeFooter', description: () => cfg().get('includeFooter', false) ? 'on' : 'off' },
			{ key: 'emoji', label: 'Emoji', icon: 'symbol-misc', command: 'commithub.setEmoji', description: () => cfg().get('emoji', false) ? 'on' : 'off' },
			{ key: 'tone', label: 'Tone', icon: 'symbol-ruler', command: 'commithub.setTone', description: () => cfg().get('tone', 'auto') },
		],
	},
	{
		label: 'Analysis',
		icon: 'symbol-method',
		children: [
			{ key: 'scopeDetection', label: 'Scope Detect', icon: 'search', command: 'commithub.setScopeDetection', description: () => cfg().get('scopeDetection', true) ? 'on' : 'off' },
			{ key: 'breakingChanges', label: 'Breaking Changes', icon: 'warning', command: 'commithub.setBreakingChanges', description: () => cfg().get('breakingChanges', true) ? 'on' : 'off' },
			{ key: 'maxDiffSize', label: 'Max Diff Size', icon: 'symbol-number', command: 'commithub.setMaxDiffSize', description: () => String(cfg().get('maxDiffSize', 8000)) },
			{ key: 'excludeFiles', label: 'Exclude Files', icon: 'exclude', command: 'commithub.setExcludeFiles', description: () => cfg().get('excludeFiles', '') || '—' },
		],
	},
];

export class SettingsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
		if (!element) {
			return groups.map(g => new SettingsGroupItem(g));
		}
		if (element instanceof SettingsGroupItem) {
			return element.group.children.map(c => new SettingsLeafItem(c));
		}
		return [];
	}
}

class SettingsGroupItem extends vscode.TreeItem {
	constructor(readonly group: SettingGroup) {
		super(group.label, vscode.TreeItemCollapsibleState.Collapsed);
		this.iconPath = new vscode.ThemeIcon(group.icon);
		this.contextValue = 'group';
	}
}

class SettingsLeafItem extends vscode.TreeItem {
	constructor(readonly leaf: SettingLeaf) {
		super(leaf.label, vscode.TreeItemCollapsibleState.None);
		this.description = leaf.description();
		this.iconPath = new vscode.ThemeIcon(leaf.icon);
		this.command = {
			command: leaf.command,
			title: leaf.label,
		};
		this.contextValue = 'setting';
	}
}
