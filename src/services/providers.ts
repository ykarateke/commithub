export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini';

export interface ProviderDefinition {
	id: string;
	label: string;
	description: string;
	protocol: ProviderProtocol;
	defaultBaseUrl: string;
	defaultModel: string;
	requiresApiKey: boolean;
	supportsModelDiscovery: boolean;
}

export const providers: readonly ProviderDefinition[] = [
	{ id: 'openai', label: 'OpenAI', description: 'GPT models', protocol: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'anthropic', label: 'Anthropic', description: 'Claude models', protocol: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-20250514', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'google_gemini', label: 'Google Gemini', description: 'Gemini models', protocol: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-flash', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'zhipu_glm', label: 'Zhipu GLM', description: 'General GLM models', protocol: 'openai', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4.7', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'zhipu_glm_coding', label: 'Zhipu GLM (Coding)', description: 'GLM coding-plan models', protocol: 'openai', defaultBaseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', defaultModel: 'glm-4.5-air', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'xai_grok', label: 'xAI Grok', description: 'Grok models', protocol: 'openai', defaultBaseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4-1-fast', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'deepseek', label: 'DeepSeek', description: 'DeepSeek chat and reasoning models', protocol: 'openai', defaultBaseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'mistral', label: 'Mistral', description: 'Mistral hosted models', protocol: 'openai', defaultBaseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'ollama', label: 'Ollama', description: 'Local, private models', protocol: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.2', requiresApiKey: false, supportsModelDiscovery: true },
	{ id: 'openrouter', label: 'OpenRouter', description: 'Multi-provider model gateway', protocol: 'openai', defaultBaseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'groq', label: 'Groq', description: 'Fast hosted inference', protocol: 'openai', defaultBaseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', requiresApiKey: true, supportsModelDiscovery: true },
	{ id: 'together', label: 'Together AI', description: 'Hosted open-source models', protocol: 'openai', defaultBaseUrl: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', requiresApiKey: true, supportsModelDiscovery: true },
];

const providerById = new Map(providers.map(provider => [provider.id, provider]));

export function getProvider(id: string): ProviderDefinition | undefined {
	return providerById.get(id);
}

export function resolveBaseUrl(providerId: string, customBaseUrl: string): string {
	return customBaseUrl.trim() || getProvider(providerId)?.defaultBaseUrl || 'https://api.openai.com/v1';
}

export function apiKeySecretName(providerId: string): string {
	return `commithub.apiKey.${providerId}`;
}
