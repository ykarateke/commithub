import * as vscode from 'vscode';

export let connectionStatus = 'untested';
export function setConnectionStatus(v: string) { connectionStatus = v; }

export const stats = {
	totalCalls: 0,
	totalInputTokens: 0,
	totalOutputTokens: 0,
	lastProvider: '',
	lastModel: '',
	lastInputTokens: 0,
	lastOutputTokens: 0,
	lastDurationMs: 0,
};

let _globalState: vscode.Memento | undefined;

export function initState(context: vscode.ExtensionContext) {
	_globalState = context.globalState;
	const saved = _globalState.get<typeof stats>('commithub.stats');
	if (saved) {
		Object.assign(stats, saved);
	}
}

function persist() {
	_globalState?.update('commithub.stats', { ...stats });
}

export function recordCall(opts: {
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
}) {
	stats.totalCalls++;
	stats.totalInputTokens += opts.inputTokens;
	stats.totalOutputTokens += opts.outputTokens;
	stats.lastProvider = opts.provider;
	stats.lastModel = opts.model;
	stats.lastInputTokens = opts.inputTokens;
	stats.lastOutputTokens = opts.outputTokens;
	stats.lastDurationMs = opts.durationMs;
	persist();
}

export function getStatsSummary(): string {
	const t = stats;
	if (!t.totalCalls) { return 'No calls yet'; }
	return `${t.totalCalls} call(s) · ${t.totalInputTokens} in / ${t.totalOutputTokens} out · last: ${t.lastModel}`;
}
