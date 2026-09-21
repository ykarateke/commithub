import * as https from 'https';
import * as http from 'http';
import { getProvider, resolveBaseUrl } from './providers';

export interface DiscoveredModel {
	label: string;
	description: string;
}

type ApiModel = {
	id?: string;
	name?: string;
	display_name?: string;
	displayName?: string;
	description?: string;
	owned_by?: string;
};

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

export async function discoverModels(
	providerId: string,
	customBaseUrl: string,
	apiKey?: string,
): Promise<DiscoveredModel[]> {
	const provider = getProvider(providerId);
	if (!provider?.supportsModelDiscovery) {
		throw new Error(`Model listing is not supported for ${providerId}`);
	}
	const data = await getJson(getModelsUrl(providerId, customBaseUrl), createAuthHeaders(providerId, apiKey), 15000);
	return extractModels(data).map(model => ({
		label: model.id || model.name?.replace(/^models\//, '') || '',
		description: model.display_name || model.displayName || model.description || model.owned_by || '',
	})).filter(model => model.label);
}

export async function testProviderConnection(
	providerId: string,
	customBaseUrl: string,
	apiKey?: string,
): Promise<void> {
	await getJson(getModelsUrl(providerId, customBaseUrl), createAuthHeaders(providerId, apiKey), 10000);
}
