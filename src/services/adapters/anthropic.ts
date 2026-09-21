import { AdapterOptions, AdapterRequest, AdapterResponse, ProviderAdapter } from './types';

export const anthropicAdapter: ProviderAdapter = {
	protocol: 'anthropic',
	createRequest(options: AdapterOptions): AdapterRequest {
		return {
			url: `${options.baseUrl.replace(/\/+$/, '')}/messages`,
			body: {
				model: options.model,
				max_tokens: options.maxTokens,
				temperature: options.temperature,
				system: options.prompt,
				messages: [{ role: 'user', content: 'Generate the commit message now.' }],
				...(options.stream ? { stream: true } : {}),
			},
			headers: {
				'x-api-key': options.apiKey || '',
				'anthropic-version': '2023-06-01',
			},
		};
	},
	parseResponse(data: any): AdapterResponse {
		return {
			text: data?.content?.filter((part: any) => part?.type === 'text').map((part: any) => part.text).join('') || '',
			finishReason: data?.stop_reason || data?.stop_sequence || '',
			inputTokens: data?.usage?.input_tokens ?? 0,
			outputTokens: data?.usage?.output_tokens ?? 0,
		};
	},
	parseStreamEvent(data: any) {
		return {
			text: data?.type === 'content_block_delta' ? data?.delta?.text || undefined : undefined,
			inputTokens: data?.message?.usage?.input_tokens ?? data?.usage?.input_tokens,
			outputTokens: data?.usage?.output_tokens,
			finishReason: data?.delta?.stop_reason || undefined,
		};
	},
};
