import * as vscode from 'vscode';

type SettingItem = {
	label: string;
	description: string;
	icon: string;
	command: string;
};

const items: SettingItem[] = [
	{ label: 'API Key', description: '', icon: 'key', command: 'commithub.setApiKey' },
	{ label: 'Provider', description: 'OpenAI', icon: 'cloud', command: 'commithub.setProvider' },
	{ label: 'Model', description: 'gpt-4o', icon: 'symbol-parameter', command: 'commithub.setModel' },
	{ label: 'Language', description: 'Auto', icon: 'globe', command: 'commithub.setLanguage' },
];

export class SettingsProvider implements vscode.TreeDataProvider<SettingsTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<SettingsTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: SettingsTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): SettingsTreeItem[] {
		return items.map(i => new SettingsTreeItem(i));
	}
}

class SettingsTreeItem extends vscode.TreeItem {
	constructor(item: SettingItem) {
		super(item.label, vscode.TreeItemCollapsibleState.None);
		this.description = item.description;
		this.iconPath = new vscode.ThemeIcon(item.icon);
		this.command = {
			command: item.command,
			title: item.label,
		};
		this.tooltip = `${item.label}: ${item.description}`;
	}
}
