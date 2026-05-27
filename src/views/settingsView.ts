import * as vscode from 'vscode';
import { connectionStatus, stats, getStatsSummary } from '../state';

type PrereqCheck = () => { ok: boolean; hint: string };

type SettingLeaf = {
	key: string;
	label: string;
	icon: string;
	command: string;
	description: () => string;
	prereq: PrereqCheck;
};

type SettingGroup = {
	label: string;
	icon: string;
	children: SettingLeaf[];
};

const cfg = () => vscode.workspace.getConfiguration('commithub');

const hasProvider: PrereqCheck = () => {
	const p = cfg().get('provider', '');
	return p ? { ok: true, hint: '' } : { ok: false, hint: 'Set Provider first' };
};

const hasConventionalOn: PrereqCheck = () => {
	const on = cfg().get('conventionalCommit', true);
	return on ? { ok: true, hint: '' } : { ok: false, hint: 'Enable Conventional Commit first' };
};

const groups: SettingGroup[] = [
	{
		label: 'Provider',
		icon: 'cloud',
		children: [
			{ key: 'provider', label: 'Provider', icon: 'server', command: 'commithub.setProvider',
				description: () => cfg().get('provider', 'openai'), prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'connection', label: 'Connection', icon: 'plug', command: 'commithub.testConnection',
				description: () => connectionStatus, prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'apiKey', label: 'API Key', icon: 'key', command: 'commithub.setApiKey',
				description: () => '', prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'model', label: 'Model', icon: 'symbol-parameter', command: 'commithub.setModel',
				description: () => cfg().get('model', 'gpt-4o'), prereq: hasProvider },
			{ key: 'baseUrl', label: 'Base URL', icon: 'link', command: 'commithub.setBaseUrl',
				description: () => {
					const v = cfg().get('baseUrl', '');
					return v || '(auto)';
				}, prereq: hasProvider },
			{ key: 'temperature', label: 'Temperature', icon: 'grabber', command: 'commithub.setTemperature',
				description: () => String(cfg().get('temperature', 0.7)), prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'maxTokens', label: 'Max Tokens', icon: 'symbol-number', command: 'commithub.setMaxTokens',
				description: () => String(cfg().get('maxTokens', 2000)), prereq: () => ({ ok: true, hint: '' }) },
		],
	},
	{
		label: 'Message',
		icon: 'symbol-text',
		children: [
			{ key: 'language', label: 'Language', icon: 'globe', command: 'commithub.setLanguage',
				description: () => {
					const m: Record<string, string> = {
						auto: 'Auto', en: 'English', tr: 'Türkçe', de: 'Deutsch', fr: 'Français',
						es: 'Español', pt: 'Português', it: 'Italiano', nl: 'Nederlands', pl: 'Polski',
						ru: 'Русский', ja: '日本語', ko: '한국어', 'zh-CN': '简体中文', 'zh-TW': '繁體中文',
						ar: 'العربية', hi: 'हिन्दी', sv: 'Svenska', da: 'Dansk', fi: 'Suomi',
						nb: 'Norsk', cs: 'Čeština', hu: 'Magyar', ro: 'Română', uk: 'Українська',
						el: 'Ελληνικά', th: 'ไทย', vi: 'Tiếng Việt', bg: 'Български', hr: 'Hrvatski',
						sk: 'Slovenčina', sl: 'Slovenščina',
					};
					const v = cfg().get('language', 'auto');
					return m[v] || v;
				}, prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'maxLength', label: 'Max Length', icon: 'symbol-number', command: 'commithub.setMaxLength',
				description: () => String(cfg().get('maxLength', 72)), prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'conventionalCommit', label: 'Conventional Commit', icon: 'check', command: 'commithub.setConventionalCommit',
				description: () => cfg().get('conventionalCommit', true) ? 'on' : 'off', prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'conventionalTypes', label: 'Conventional Types', icon: 'symbol-key', command: 'commithub.setConventionalTypes',
				description: () => {
					const v = cfg().get<string>('conventionalTypes', '');
					return v ? v.split(',').length + ' types' : 'default (11)';
				}, prereq: hasConventionalOn },
			{ key: 'tone', label: 'Tone', icon: 'symbol-ruler', command: 'commithub.setTone',
				description: () => cfg().get('tone', 'auto'), prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'includeBody', label: 'Include Body', icon: 'list-tree', command: 'commithub.setIncludeBody',
				description: () => cfg().get('includeBody', true) ? 'on' : 'off', prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'includeFooter', label: 'Include Footer', icon: 'list-flat', command: 'commithub.setIncludeFooter',
				description: () => cfg().get('includeFooter', false) ? 'on' : 'off', prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'emoji', label: 'Emoji', icon: 'symbol-misc', command: 'commithub.setEmoji',
				description: () => cfg().get('emoji', false) ? 'on' : 'off', prereq: () => ({ ok: true, hint: '' }) },
		],
	},
	{
		label: 'Analysis',
		icon: 'symbol-method',
		children: [
			{ key: 'scopeDetection', label: 'Scope Detection', icon: 'search', command: 'commithub.setScopeDetection',
				description: () => cfg().get('scopeDetection', true) ? 'on' : 'off', prereq: hasConventionalOn },
			{ key: 'breakingChanges', label: 'Breaking Changes', icon: 'warning', command: 'commithub.setBreakingChanges',
				description: () => cfg().get('breakingChanges', true) ? 'on' : 'off', prereq: hasConventionalOn },
			{ key: 'maxDiffSize', label: 'Max Diff Size', icon: 'symbol-number', command: 'commithub.setMaxDiffSize',
				description: () => String(cfg().get('maxDiffSize', 8000)), prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'excludeFiles', label: 'Exclude Files', icon: 'exclude', command: 'commithub.setExcludeFiles',
				description: () => cfg().get('excludeFiles', '') || '—', prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'includeUnstaged', label: 'Include Unstaged', icon: 'versions', command: 'commithub.setIncludeUnstaged',
				description: () => cfg().get('includeUnstaged', false) ? 'on (staged+unstaged)' : 'off (staged only)', prereq: () => ({ ok: true, hint: '' }) },
			{ key: 'statistics', label: 'Statistics', icon: 'graph', command: 'commithub.showStats',
				description: () => getStatsSummary(), prereq: () => ({ ok: true, hint: '' }) },
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
		super(group.label, vscode.TreeItemCollapsibleState.Expanded);
		this.iconPath = new vscode.ThemeIcon(group.icon);
		this.contextValue = 'group';
	}
}

class SettingsLeafItem extends vscode.TreeItem {
	constructor(readonly leaf: SettingLeaf) {
		super(leaf.label, vscode.TreeItemCollapsibleState.None);
		this.iconPath = new vscode.ThemeIcon(leaf.icon);
		this.command = { command: leaf.command, title: '', arguments: [] };
		this.contextValue = 'setting';

		const check = leaf.prereq();
		if (check.ok) {
			this.description = leaf.description();
			this.tooltip = leaf.command;
		} else {
			this.description = `⚠ ${check.hint}`;
			this.tooltip = check.hint;
		}
	}
}
