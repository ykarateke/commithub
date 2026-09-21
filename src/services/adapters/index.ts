import { getProvider } from '../providers';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { openAiAdapter } from './openai';
import { ProviderAdapter } from './types';

export * from './types';

export function getProviderAdapter(providerId: string): ProviderAdapter {
	const protocol = getProvider(providerId)?.protocol || 'openai';
	if (protocol === 'anthropic') {return anthropicAdapter;}
	if (protocol === 'gemini') {return geminiAdapter;}
	return openAiAdapter;
}
