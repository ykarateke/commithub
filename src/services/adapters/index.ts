import { getProvider } from '../providers';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { openAiAdapter } from './openai';
import { deepSeekAdapter } from './deepseek';
import { ProviderAdapter } from './types';

export * from './types';

export function getProviderAdapter(providerId: string): ProviderAdapter {
	if (providerId === 'deepseek') {return deepSeekAdapter;}
	const protocol = getProvider(providerId)?.protocol || 'openai';
	if (protocol === 'anthropic') {return anthropicAdapter;}
	if (protocol === 'gemini') {return geminiAdapter;}
	return openAiAdapter;
}
