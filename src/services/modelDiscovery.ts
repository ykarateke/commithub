import * as https from 'https';
import * as http from 'http';
import { getProvider, resolveBaseUrl } from './providers';

export interface DiscoveredModel {
	label: string;
	description: string;
}

export type ModelProfile = 'fast' | 'balanced' | 'quality' | 'manual';

type ApiModel = {
	id?: string;
	name?: string;
	display_name?: string;
	displayName?: string;
	description?: string;
	owned_by?: string;
	supportedGenerationMethods?: string[];
};

type CacheEntry = {
	expiresAt: number;
	models: DiscoveredModel[];
};

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const modelCache = new Map<string, CacheEntry>();

const unsupportedModelPatterns = [
	/embedding/i,
	/embed-/i,
	/rerank/i,
	/moderat/i,
	/whisper/i,
	/transcri/i,
	/text-to-speech/i,
	/(^|[-_/])tts($|[-_/])/i,
	/(^|[-_/])(image|imagen|veo|dall-e|audio|realtime)([-_/]|$)/i,
];

const preferredModelPatterns = [
	/chat/i,
	/instruct/i,
	/flash/i,
	/mini/i,
	/small/i,
	/haiku/i,
	/fast/i,
	/sonnet/i,
];

function getJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith('https') ? https : http;
		const req = mod.get(url, { headers, timeout: timeoutMs }, (res) => {
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
				} catch {
					reject(new Error(`Invalid JSON: ${body.slice(0, 200)}`));
				}
			});
		});
		req.on('error', reject);
		req.on('timeout', () => req.destroy(new Error('Request timed out')));
	});
}

export function createAuthHeaders(providerId: string, apiKey?: string): Record<string, string> {
	if (!apiKey) {return {};}
	const protocol = getProvider(providerId)?.protocol;
	if (protocol === 'anthropic') {
		return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
	}
	if (protocol === 'gemini') {
		return { 'x-goog-api-key': apiKey };
	}
	return { 'Authorization': `Bearer ${apiKey}` };
}

export function getModelsUrl(providerId: string, customBaseUrl: string): string {
	return `${resolveBaseUrl(providerId, customBaseUrl).replace(/\/+$/, '')}/models`;
}

function extractModels(data: unknown): ApiModel[] {
	if (Array.isArray(data)) {return data as ApiModel[];}
	if (!data || typeof data !== 'object') {return [];}
	const result = data as { data?: ApiModel[]; models?: ApiModel[] };
	return result.data || result.models || [];
}

function modelScore(model: DiscoveredModel, defaultModel: string): number {
	if (model.label === defaultModel) {return 1000;}
	let score = preferredModelPatterns.reduce((total, pattern) => total + (pattern.test(model.label) ? 10 : 0), 0);
	if (/preview|experimental|exp-|legacy/i.test(model.label)) {score -= 20;}
	return score;
}

function profileScore(model: DiscoveredModel, profile: Exclude<ModelProfile, 'manual'>, defaultModel: string): number {
	const name = model.label.toLowerCase();
	if (profile === 'balanced') {return modelScore(model, defaultModel);}
	if (profile === 'fast') {
		let score = /mini|flash|haiku|small|fast|lite|8b/.test(name) ? 100 : 0;
		if (/pro|opus|large|reason|70b|405b/.test(name)) {score -= 50;}
		return score + modelScore(model, defaultModel) / 100;
	}
	let score = /opus|pro|large|reason|r1|70b|405b|sonnet/.test(name) ? 100 : 0;
	if (/mini|haiku|small|lite|8b/.test(name)) {score -= 50;}
	return score + modelScore(model, defaultModel) / 100;
}

export function recommendModel(
	models: DiscoveredModel[],
	profile: Exclude<ModelProfile, 'manual'>,
	defaultModel: string,
): DiscoveredModel | undefined {
	return [...models].sort((a, b) =>
		profileScore(b, profile, defaultModel) - profileScore(a, profile, defaultModel)
		|| a.label.localeCompare(b.label)
	)[0];
}

export function filterAndSortModels(
	models: ApiModel[],
	defaultModel: string,
): DiscoveredModel[] {
	const seen = new Set<string>();
	return models
		.filter(model => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes('generateContent'))
		.map(model => ({
			label: model.id || model.name?.replace(/^models\//, '') || '',
			description: model.display_name || model.displayName || model.description || model.owned_by || '',
		}))
		.filter(model => model.label && !unsupportedModelPatterns.some(pattern => pattern.test(model.label)))
		.filter(model => {
			if (seen.has(model.label)) {return false;}
			seen.add(model.label);
			return true;
		})
		.map(model => ({ ...model, description: model.description.slice(0, 120) }))
		.sort((a, b) => modelScore(b, defaultModel) - modelScore(a, defaultModel) || a.label.localeCompare(b.label));
}

export function clearModelCache(providerId?: string): void {
	if (!providerId) {
		modelCache.clear();
		return;
	}
	for (const key of modelCache.keys()) {
		if (key.startsWith(`${providerId}|`)) {modelCache.delete(key);}
	}
}

export async function discoverModels(
	providerId: string,
	customBaseUrl: string,
	apiKey?: string,
): Promise<DiscoveredModel[]> {
	const provider = getProvider(providerId);
	if (!provider?.supportsModelDiscovery) {
		throw new Error(`Model listing is not supported for ${providerId}`);
	}
	const cacheKey = `${providerId}|${resolveBaseUrl(providerId, customBaseUrl)}`;
	const cached = modelCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {return cached.models;}

	const data = await getJson(getModelsUrl(providerId, customBaseUrl), createAuthHeaders(providerId, apiKey), 15000);
	const models = filterAndSortModels(extractModels(data), provider.defaultModel);
	modelCache.set(cacheKey, { expiresAt: Date.now() + MODEL_CACHE_TTL_MS, models });
	return models;
}

export async function testProviderConnection(
	providerId: string,
	customBaseUrl: string,
	apiKey?: string,
): Promise<void> {
	await getJson(getModelsUrl(providerId, customBaseUrl), createAuthHeaders(providerId, apiKey), 10000);
}
