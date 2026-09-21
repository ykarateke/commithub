export interface AdapterOptions {
	provider: string;
	baseUrl: string;
	model: string;
	apiKey?: string;
	prompt: string;
	temperature: number;
	maxTokens: number;
	stream: boolean;
}

export interface AdapterRequest {
	url: string;
	body: Record<string, unknown>;
	headers: Record<string, string>;
}

export interface AdapterResponse {
	text: string;
	inputTokens: number;
	outputTokens: number;
	finishReason: string;
}

export interface AdapterStreamEvent {
	text?: string;
	reasoning?: boolean;
	inputTokens?: number;
	outputTokens?: number;
	finishReason?: string;
}

export interface ProviderAdapter {
	readonly protocol: 'openai' | 'anthropic' | 'gemini';
	createRequest(options: AdapterOptions): AdapterRequest;
	parseResponse(data: any): AdapterResponse;
	parseStreamEvent(data: any): AdapterStreamEvent;
}
