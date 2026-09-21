import { AdapterOptions, AdapterRequest, AdapterResponse, ProviderAdapter } from './types';

export const geminiAdapter: ProviderAdapter = {
	protocol: 'gemini',
	createRequest(options: AdapterOptions): AdapterRequest {
		const method = options.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
		return {
			url: `${options.baseUrl.replace(/\/+$/, '')}/models/${options.model}:${method}`,
			body: {
				contents: [{ role: 'user', parts: [{ text: `${options.prompt}\n\nGenerate the commit message now.` }] }],
				generationConfig: {
					temperature: options.temperature,
					maxOutputTokens: options.maxTokens,
				},
			},
			headers: { 'x-goog-api-key': options.apiKey || '' },
		};
	},
	parseResponse(data: any): AdapterResponse {
		const parts = data?.candidates?.[0]?.content?.parts || [];
		return {
			text: parts.map((part: any) => part?.text || '').join(''),
			finishReason: data?.candidates?.[0]?.finishReason || '',
			inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
		};
	},
};
