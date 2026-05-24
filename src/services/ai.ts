import * as https from 'https';
import * as http from 'http';

interface CommitSettings {
	diff: string;
	stats: string;
	files: string[];
	language: string;
	maxLength: number;
	conventionalCommit: boolean;
	includeBody: boolean;
	includeFooter: boolean;
	emoji: boolean;
	tone: string;
	scopeDetection: boolean;
	breakingChanges: boolean;
}

const langNames: Record<string, string> = {
	en: 'English', tr: 'Turkish', de: 'German', fr: 'French', es: 'Spanish',
	pt: 'Portuguese', it: 'Italian', nl: 'Dutch', pl: 'Polish', ru: 'Russian',
	ja: 'Japanese', ko: 'Korean', 'zh-CN': 'Chinese Simplified', 'zh-TW': 'Chinese Traditional',
	ar: 'Arabic', hi: 'Hindi', sv: 'Swedish', da: 'Danish', fi: 'Finnish',
	nb: 'Norwegian', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian', uk: 'Ukrainian',
	el: 'Greek', th: 'Thai', vi: 'Vietnamese', bg: 'Bulgarian', hr: 'Croatian',
	sk: 'Slovak', sl: 'Slovenian',
};

function buildPrompt(s: CommitSettings): string {
	const lang = s.language === 'auto' ? 'same as the codebase' : (langNames[s.language] || 'English');

	const lines: string[] = [
		`You are a commit message generator. Generate a ${lang} git commit message for the following diff.`,
		'',
		'## Changed files',
		s.stats,
		'',
		'## Diff',
		s.diff,
		'',
		'## Rules',
	];

	if (s.conventionalCommit) {
		lines.push('- Use Conventional Commits format: `type(scope): subject`');
		lines.push('  Types: feat, fix, chore, docs, style, refactor, perf, test, ci, build, revert');
		if (s.scopeDetection) {
			lines.push('- Auto-detect scope from file paths (e.g., feat(api):, fix(auth):)');
		}
		if (s.breakingChanges) {
			lines.push('- Detect breaking changes and add `BREAKING CHANGE:` in footer');
		}
		if (s.includeFooter) {
			lines.push('- Include relevant issue references or breaking change notes in footer');
		}
	} else {
		lines.push('- Write a clear, concise subject line');
	}

	lines.push(`- Subject line max ${s.maxLength} characters`);

	if (s.includeBody) {
		lines.push('- Include a detailed body explaining what and why (not how)');
		lines.push('- Wrap body at 72 characters per line');
	}

	if (s.emoji) {
		lines.push('- Add an appropriate emoji at the start of the subject line');
	}

	if (s.tone !== 'auto') {
		lines.push(`- Tone: ${s.tone}`);
	}

	lines.push('');
	lines.push('Return ONLY the commit message, no extra text or markdown.');

	return lines.join('\n');
}

function postJson(url: string, body: any, headers: Record<string, string>, timeout = 30000): Promise<any> {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith('https') ? https : http;
		const data = JSON.stringify(body);
		const urlObj = new URL(url);
		const options = {
			hostname: urlObj.hostname,
			port: urlObj.port,
			path: urlObj.pathname,
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
			timeout,
		};
		const req = mod.request(options, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				const bodyText = Buffer.concat(chunks).toString();
				if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
					reject(new Error(`HTTP ${res.statusCode}: ${bodyText.slice(0, 200)}`));
					return;
				}
				try { resolve(JSON.parse(bodyText)); }
				catch { reject(new Error(`Invalid JSON: ${bodyText.slice(0, 200)}`)); }
			});
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
		req.write(data);
		req.end();
	});
}

export interface CommitUsage {
	inputTokens: number;
	outputTokens: number;
}

export async function generateCommitMessage(
	provider: string,
	baseUrl: string,
	model: string,
	apiKey: string | undefined,
	settings: CommitSettings,
): Promise<{ text: string; usage: CommitUsage }> {
	const prompt = buildPrompt(settings);
	const messages = [
		{ role: 'system', content: prompt },
	];

	const providerConfig = provider === 'anthropic' ? 'anthropic' : provider === 'google_gemini' ? 'gemini' : 'openai';

	try {
		let commitMsg: string;
		let usage: CommitUsage = { inputTokens: 0, outputTokens: 0 };

		if (providerConfig === 'anthropic') {
			const url = `${baseUrl.replace(/\/+$/, '')}/messages`;
			const body = {
				model,
				max_tokens: 2000,
				system: prompt,
				messages: [{ role: 'user', content: 'Generate a commit message for the above diff.' }],
			};
			const headers: Record<string, string> = {
				'x-api-key': apiKey || '',
				'anthropic-version': '2023-06-01',
			};
			const data = await postJson(url, body, headers, 30000);
			commitMsg = data?.content?.[0]?.text || '';
			usage = {
				inputTokens: data?.usage?.input_tokens ?? 0,
				outputTokens: data?.usage?.output_tokens ?? 0,
			};
		} else if (providerConfig === 'gemini') {
			const url = `${baseUrl.replace(/\/+$/, '')}/models/${model}:generateContent`;
			const body = {
				contents: [{ role: 'user', parts: [{ text: prompt + '\n\nGenerate the commit message now.' }] }],
			};
			const headers: Record<string, string> = { 'x-goog-api-key': apiKey || '' };
			const data = await postJson(url, body, headers, 30000);
			commitMsg = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
			usage = {
				inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
				outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
			};
		} else {
			const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
			const body = {
				model,
				messages,
				temperature: 0.4,
				max_tokens: 2000,
			};
			const headers: Record<string, string> = { 'Authorization': `Bearer ${apiKey || ''}` };
			const data = await postJson(url, body, headers, 30000);
			commitMsg = data?.choices?.[0]?.message?.content || '';
			usage = {
				inputTokens: data?.usage?.prompt_tokens ?? 0,
				outputTokens: data?.usage?.completion_tokens ?? 0,
			};
		}

		return { text: commitMsg.trim(), usage };
	} catch (e: any) {
		throw new Error(`AI request failed: ${e.message}`);
	}
}
