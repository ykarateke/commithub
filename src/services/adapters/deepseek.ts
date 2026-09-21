import { openAiAdapter } from './openai';
import { AdapterOptions, AdapterRequest, ProviderAdapter } from './types';

function thinkingMode(options: AdapterOptions): 'enabled' | 'disabled' | undefined {
	if (options.modelProfile === 'quality' || /reasoner/i.test(options.model)) {return 'enabled';}
	if (options.modelProfile === 'fast' || options.modelProfile === 'balanced' || /chat/i.test(options.model)) {return 'disabled';}
	return undefined;
}

export const deepSeekAdapter: ProviderAdapter = {
	...openAiAdapter,
	createRequest(options: AdapterOptions): AdapterRequest {
		const request = openAiAdapter.createRequest(options);
		const mode = thinkingMode(options);
		if (mode) {request.body.thinking = { type: mode };}
		if (mode === 'enabled') {
			request.body.reasoning_effort = 'high';
			delete request.body.temperature;
		}
		return request;
	},
};
