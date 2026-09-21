import { AdapterOptions, AdapterRequest, AdapterResponse, ProviderAdapter } from './types';

export const openAiAdapter: ProviderAdapter = {
	protocol: 'openai',
	createRequest(options: AdapterOptions): AdapterRequest {
		const body: Record<string, unknown> = {
			model: options.model,
			messages: [
				{ role: 'system', content: options.prompt },
				{ role: 'user', content: 'Generate the commit message now.' },
			],
			temperature: options.temperature,
			max_tokens: options.maxTokens,
		};
		if (options.stream) {
			body.stream = true;
			if (options.provider === 'openai') {body.stream_options = { include_usage: true };}
		}
		return {
			url: `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`,
			body,
			headers: { 'Authorization': `Bearer ${options.apiKey || ''}` },
		};
	},
	parseResponse(data: any): AdapterResponse {
		return {
			text: data?.choices?.[0]?.message?.content || '',
			finishReason: data?.choices?.[0]?.finish_reason || '',
			inputTokens: data?.usage?.prompt_tokens ?? 0,
			outputTokens: data?.usage?.completion_tokens ?? 0,
		};
	},
	parseStreamEvent(data: any) {
		const delta = data?.choices?.[0]?.delta;
		return {
			text: delta?.content || data?.choices?.[0]?.text || undefined,
			reasoning: Boolean(delta?.reasoning_content),
			inputTokens: data?.usage?.prompt_tokens,
			outputTokens: data?.usage?.completion_tokens,
			finishReason: data?.choices?.[0]?.finish_reason || undefined,
		};
	},
};
