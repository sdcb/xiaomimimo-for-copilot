import vscode from 'vscode';
import { logger } from '../../logger';
import { DEFAULT_VISION_MODEL_ID, IMAGE_DESCRIPTION_PROMPT } from './consts';
import { VisionProxyError } from './errors';
import type {
	VisionDescriptionRequest,
	VisionDescriber,
	VisionLanguageModelOption,
	VisionProxyApiType,
	VisionProxyConfig,
	VisionProxyProviderFamily,
	VisionProxySource,
} from './types';
import { VisionProxyClient } from './client';

// ─── VS Code LM Vision Source ───────────────────────────────────────────────

/** Models that should not be used as vision describers (e.g. text-only or utility models). */
const EXCLUDED_VISION_MODEL_IDS = new Set([
	'copilot-utility',
	'copilot-utility-small',
	'mimo-v2.5-pro',
]);

export function createVSCodeLanguageModelVisionDescriberGetter(): {
	get: () => Promise<VisionDescriber | undefined>;
	reset: () => void;
} {
	let describer: VisionDescriber | undefined;
	let describerPromise: Promise<VisionDescriber | undefined> | undefined;
	let generation = 0;

	return {
		async get() {
			if (describer) {
				return describer;
			}
			if (describerPromise) {
				return describerPromise;
			}

			const requestGeneration = generation;
			const currentPromise = (async () => {
				const models = await listVSCodeVisionModels();
				if (requestGeneration !== generation) {
					return undefined;
				}
				const model = pickPreferredVSCodeVisionModel(models, getConfiguredVisionModelId());
				if (model) {
					logger.info(`Vision proxy: using VS Code LM model ${model.id}`);
					describer = new VSCodeLanguageModelVisionDescriber(model);
					return describer;
				}
				logger.warn(
					`Vision proxy: no VS Code vision model found (wanted: ${getConfiguredVisionModelId() ?? DEFAULT_VISION_MODEL_ID})`,
				);
				return undefined;
			})();
			describerPromise = currentPromise;

			try {
				const result = await currentPromise;
				if (
					result === undefined &&
					requestGeneration === generation &&
					describerPromise === currentPromise
				) {
					describerPromise = undefined;
				}
				return result;
			} catch (error) {
				if (requestGeneration === generation && describerPromise === currentPromise) {
					describerPromise = undefined;
				}
				throw error;
			}
		},

		reset() {
			generation += 1;
			describer = undefined;
			describerPromise = undefined;
		},
	};
}

class VSCodeLanguageModelVisionDescriber implements VisionDescriber {
	readonly source = 'vscode-lm' as const;

	constructor(private readonly model: vscode.LanguageModelChat) {}

	get id(): string {
		return this.model.id;
	}

	async describe(request: VisionDescriptionRequest): Promise<string> {
		const visionMsg = vscode.LanguageModelChatMessage.User([
			...request.images.map(
				(image) => new vscode.LanguageModelDataPart(image.data, image.mimeType),
			),
			new vscode.LanguageModelTextPart(request.prompt),
		] as (vscode.LanguageModelDataPart | vscode.LanguageModelTextPart)[]);

		const response = await this.model.sendRequest([visionMsg], {}, request.token);
		let description = '';
		for await (const chunk of response.stream) {
			if (chunk instanceof vscode.LanguageModelTextPart) {
				description += chunk.value;
			}
		}
		return description.trim();
	}
}

export function getVisionPrompt(): string {
	const config = vscode.workspace.getConfiguration('mimo-copilot');
	return (
		config.get<string>('visionPrompt', IMAGE_DESCRIPTION_PROMPT).trim() || IMAGE_DESCRIPTION_PROMPT
	);
}

export function getConfiguredVisionModelId(): string | undefined {
	const config = vscode.workspace.getConfiguration('mimo-copilot');
	const id = config.get<string>('visionModel', '');
	return id.trim() || undefined;
}

export function getDefaultVisionModelId(): string {
	return DEFAULT_VISION_MODEL_ID;
}

export async function saveVSCodeVisionModelId(id: string): Promise<void> {
	const trimmed = id.trim();
	if (!trimmed) {
		throw new Error('Vision model ID is required.');
	}
	const config = vscode.workspace.getConfiguration('mimo-copilot');
	await config.update('visionModel', trimmed, vscode.ConfigurationTarget.Global);
}

export async function listVSCodeVisionModelOptions(): Promise<VisionLanguageModelOption[]> {
	const models = await listVSCodeVisionModels();
	return models.map((model) => ({
		id: model.id,
		vendor: model.vendor,
		name: model.name,
		family: model.family,
		version: model.version,
		label: `${model.name && model.name !== model.id ? `${model.name} (${model.id})` : model.id} - ${model.vendor}`,
		description: `${model.vendor}${model.family ? ` / ${model.family}` : ''}`,
	}));
}

export function pickPreferredVSCodeVisionModelId(
	options: readonly VisionLanguageModelOption[],
	configuredId: string | undefined,
): string | undefined {
	if (configuredId && options.some((model) => model.id === configuredId)) {
		return configuredId;
	}
	if (options.some((model) => model.id === DEFAULT_VISION_MODEL_ID)) {
		return DEFAULT_VISION_MODEL_ID;
	}
	return options[0]?.id;
}

async function listVSCodeVisionModels(): Promise<vscode.LanguageModelChat[]> {
	const allModels = await vscode.lm.selectChatModels();
	return allModels.filter(isVSCodeVisionModel);
}

function pickPreferredVSCodeVisionModel(
	models: readonly vscode.LanguageModelChat[],
	configuredId: string | undefined,
): vscode.LanguageModelChat | undefined {
	if (configuredId) {
		const configured = models.find((model) => model.id === configuredId);
		if (configured) {
			return configured;
		}
	}
	const preferred = models.find((model) => model.id === DEFAULT_VISION_MODEL_ID);
	if (preferred) {
		return preferred;
	}
	return models[0];
}

function isVSCodeVisionModel(model: vscode.LanguageModelChat): boolean {
	if (EXCLUDED_VISION_MODEL_IDS.has(model.id)) {
		return false;
	}
	// Check standard supportsImageToText capability
	if (getSupportsImageToText(model)) {
		return true;
	}
	// Fallback: some providers expose imageInput in their capabilities
	const capabilities = (model as vscode.LanguageModelChat & { capabilities?: Record<string, unknown> }).capabilities;
	if (capabilities && capabilities.imageInput === true) {
		return true;
	}
	return false;
}

function getSupportsImageToText(model: vscode.LanguageModelChat): boolean {
	const capabilities = (
		model as vscode.LanguageModelChat & { capabilities?: { supportsImageToText?: boolean } }
	).capabilities;
	return capabilities?.supportsImageToText === true;
}

// ─── API Endpoint Vision Source ──────────────────────────────────────────────

export const VISION_PROXY_CONFIG_KEY = 'mimo-copilot.visionProxy.config';
export const VISION_PROXY_SOURCE_KEY = 'mimo-copilot.visionProxy.source';
export const VISION_PROXY_API_KEY_SECRET = 'mimo-copilot.visionProxy.apiKey';

const PROTECTED_EXTRA_BODY_KEYS = new Set(['model', 'messages', 'input', 'stream']);

export class VisionProxyConfigStore {
	constructor(private readonly context: vscode.ExtensionContext) {}

	getConfig(): VisionProxyConfig | undefined {
		const rawConfig = this.context.globalState.get<unknown>(VISION_PROXY_CONFIG_KEY);
		if (rawConfig === undefined) {
			return undefined;
		}
		return normalizeVisionProxyConfig(rawConfig);
	}

	saveConfig(config: VisionProxyConfig): Thenable<void> {
		return this.context.globalState.update(
			VISION_PROXY_CONFIG_KEY,
			normalizeVisionProxyConfig(config),
		);
	}

	getSource(): VisionProxySource | undefined {
		const value = this.context.globalState.get<unknown>(VISION_PROXY_SOURCE_KEY);
		if (value === 'api-endpoint' || value === 'vscode-lm') {
			return value;
		}
		return undefined;
	}

	saveSource(source: VisionProxySource): Thenable<void> {
		return this.context.globalState.update(VISION_PROXY_SOURCE_KEY, source);
	}

	getApiKey(): Thenable<string | undefined> {
		return this.context.secrets.get(VISION_PROXY_API_KEY_SECRET);
	}

	setApiKey(apiKey: string): Thenable<void> {
		return this.context.secrets.store(VISION_PROXY_API_KEY_SECRET, apiKey.trim());
	}

	deleteApiKey(): Thenable<void> {
		return this.context.secrets.delete(VISION_PROXY_API_KEY_SECRET);
	}

	async hasApiKey(): Promise<boolean> {
		const apiKey = await this.getApiKey();
		return Boolean(apiKey?.trim());
	}
}

export function normalizeVisionProxyConfig(value: unknown): VisionProxyConfig {
	if (!isRecord(value)) {
		throw new VisionProxyError('missing-configuration', 'Invalid vision proxy configuration.');
	}

	const providerFamily = normalizeProviderFamily(value.providerFamily);
	const url = normalizeRequiredString(value.url, 'Endpoint URL');
	validateUrl(url);
	const apiType = normalizeApiType(providerFamily, value.apiType);
	const modelId = normalizeRequiredString(value.modelId, 'Model ID');
	const headers = normalizeCustomHeaders(value.headers);
	const extraBody = normalizeExtraBody(value.extraBody);

	return {
		providerFamily,
		apiType,
		url,
		modelId,
		headers,
		extraBody,
		updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
	};
}

function validateUrl(value: string): void {
	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			throw new VisionProxyError('invalid-url', 'URL must use http: or https: protocol.');
		}
	} catch (error) {
		if (error instanceof VisionProxyError) {
			throw error;
		}
		throw new VisionProxyError('invalid-url', `Invalid URL: ${value}`, undefined, error);
	}
}

function normalizeProviderFamily(value: unknown): VisionProxyProviderFamily {
	if (value === 'anthropic-compatible' || value === 'openai-compatible') {
		return value;
	}
	throw new VisionProxyError(
		'missing-configuration',
		'Invalid provider family. Must be "anthropic-compatible" or "openai-compatible".',
	);
}

function normalizeApiType(
	providerFamily: VisionProxyProviderFamily,
	value: unknown,
): VisionProxyApiType {
	if (providerFamily === 'anthropic-compatible') {
		return 'messages';
	}
	if (value === 'chat-completions' || value === 'responses') {
		return value;
	}
	throw new VisionProxyError(
		'missing-configuration',
		'Invalid API type. Must be "chat-completions" or "responses".',
	);
}

function normalizeRequiredString(value: unknown, label: string): string {
	const text = typeof value === 'string' ? value.trim() : '';
	if (!text) {
		throw new VisionProxyError('missing-configuration', `${label} is required.`);
	}
	return text;
}

function normalizeCustomHeaders(headers: unknown): Record<string, string> | undefined {
	if (headers === undefined || headers === null) {
		return undefined;
	}
	if (typeof headers !== 'object' || Array.isArray(headers)) {
		throw new VisionProxyError('invalid-custom-headers', 'Custom headers must be an object.');
	}

	const normalized: Record<string, string> = {};
	for (const [name, rawValue] of Object.entries(headers)) {
		const trimmedName = name.trim();
		if (!trimmedName) {
			throw new VisionProxyError('invalid-custom-headers', 'Header name cannot be empty.');
		}
		if (typeof rawValue !== 'string') {
			throw new VisionProxyError('invalid-custom-headers', `Header value for "${trimmedName}" must be a string.`);
		}
		const trimmedValue = rawValue.trim();
		if (!trimmedValue) {
			continue;
		}
		normalized[trimmedName] = trimmedValue;
	}

	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeExtraBody(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (!isRecord(value)) {
		throw new VisionProxyError('missing-configuration', 'Extra body must be an object.');
	}

	const normalized: Record<string, unknown> = {};
	for (const [key, entryValue] of Object.entries(value)) {
		if (PROTECTED_EXTRA_BODY_KEYS.has(key)) {
			throw new VisionProxyError(
				'missing-configuration',
				`Extra body cannot override protected key "${key}".`,
			);
		}
		normalized[key] = entryValue;
	}

	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Endpoint Vision Describer ──────────────────────────────────────────────

export function createEndpointVisionDescriber(
	config: VisionProxyConfig,
	apiKey: string | undefined,
): VisionDescriber {
	return new EndpointVisionDescriber(config, apiKey);
}

class EndpointVisionDescriber implements VisionDescriber {
	readonly source = 'api-endpoint' as const;
	private readonly client = new VisionProxyClient();

	constructor(
		private readonly config: VisionProxyConfig,
		private readonly apiKey: string | undefined,
	) {}

	get id(): string {
		return `${this.config.providerFamily}:${this.config.modelId}`;
	}

	describe(request: VisionDescriptionRequest): Promise<string> {
		return this.client.describe(this.config, this.apiKey, request);
	}
}
