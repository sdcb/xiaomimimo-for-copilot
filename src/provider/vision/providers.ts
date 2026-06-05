import type { VisionDescriptionRequest, VisionProxyConfig } from './types';
import { VisionProxyError } from './errors';
import { toBase64, isRecord } from './utils';

// ─── Provider Adapter Interface ─────────────────────────────────────────────

export interface VisionProviderAdapter {
	createBody(config: VisionProxyConfig, request: VisionDescriptionRequest): object;
	parseResponse(value: unknown): string;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function getVisionProviderAdapter(config: VisionProxyConfig): VisionProviderAdapter {
	if (config.providerFamily === 'anthropic-compatible') {
		return anthropicMessagesAdapter;
	}
	return config.apiType === 'responses' ? openAIResponsesAdapter : openAIChatAdapter;
}

// ─── OpenAI Chat Completions ────────────────────────────────────────────────

const openAIChatAdapter: VisionProviderAdapter = {
	createBody(config, request) {
		return {
			...config.extraBody,
			model: config.modelId,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: request.prompt },
						...request.images.map((image) => ({
							type: 'image_url',
							image_url: {
								url: `data:${image.mimeType};base64,${toBase64(image)}`,
							},
						})),
					],
				},
			],
		};
	},
	parseResponse(value) {
		if (!isRecord(value) || !Array.isArray(value.choices)) {
			throw new VisionProxyError(
				'unsupported-response',
				'Unexpected OpenAI response format.',
			);
		}
		const choice = value.choices[0];
		const message = isRecord(choice) ? choice.message : undefined;
		const content = isRecord(message) ? message.content : undefined;
		const text = parseOpenAIContent(content).trim();
		if (!text) {
			throw new VisionProxyError('empty-response', 'Vision proxy returned an empty response.');
		}
		return text;
	},
};

// ─── OpenAI Responses ───────────────────────────────────────────────────────

const openAIResponsesAdapter: VisionProviderAdapter = {
	createBody(config, request) {
		return {
			...config.extraBody,
			model: config.modelId,
			input: [
				{
					role: 'user',
					content: [
						{ type: 'input_text', text: request.prompt },
						...request.images.map((image) => ({
							type: 'input_image',
							detail: 'auto',
							image_url: `data:${image.mimeType};base64,${toBase64(image)}`,
						})),
					],
				},
			],
		};
	},
	parseResponse(value) {
		if (!isRecord(value)) {
			throw new VisionProxyError(
				'unsupported-response',
				'Unexpected OpenAI Responses format.',
			);
		}
		if (typeof value.output_text === 'string' && value.output_text.trim()) {
			return value.output_text.trim();
		}
		const text = parseOutputArray(value.output).trim();
		if (!text) {
			throw new VisionProxyError('empty-response', 'Vision proxy returned an empty response.');
		}
		return text;
	},
};

// ─── Anthropic Messages ─────────────────────────────────────────────────────

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

const anthropicMessagesAdapter: VisionProviderAdapter = {
	createBody(config, request) {
		return {
			max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
			...config.extraBody,
			model: config.modelId,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: request.prompt },
						...request.images.map((image) => ({
							type: 'image',
							source: {
								type: 'base64',
								media_type: image.mimeType,
								data: toBase64(image),
							},
						})),
					],
				},
			],
		};
	},
	parseResponse(value) {
		if (!isRecord(value) || !Array.isArray(value.content)) {
			throw new VisionProxyError(
				'unsupported-response',
				'Unexpected Anthropic response format.',
			);
		}
		const text = value.content
			.map((block: unknown) => (isRecord(block) && block.type === 'text' ? block.text : undefined))
			.filter((item: unknown): item is string => typeof item === 'string')
			.join('')
			.trim();
		if (!text) {
			throw new VisionProxyError('empty-response', 'Vision proxy returned an empty response.');
		}
		return text;
	},
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseOpenAIContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (!Array.isArray(content)) {
		throw new VisionProxyError(
			'unsupported-response',
			'Unexpected OpenAI content format.',
		);
	}
	return content
		.map((block: unknown) => {
			if (!isRecord(block)) return undefined;
			if (typeof block.text === 'string') return block.text;
			if (typeof block.content === 'string') return block.content;
			return undefined;
		})
		.filter((item: unknown): item is string => typeof item === 'string')
		.join('');
}

function parseOutputArray(output: unknown): string {
	if (!Array.isArray(output)) {
		throw new VisionProxyError(
			'unsupported-response',
			'Unexpected OpenAI Responses output format.',
		);
	}
	return output
		.map((item: unknown) => {
			if (!isRecord(item)) return undefined;
			if (typeof item.text === 'string') return item.text;
			if (typeof item.content === 'string') return item.content;
			if (Array.isArray(item.content)) {
				return item.content
					.map((block: unknown) => {
						if (!isRecord(block)) return undefined;
						if (typeof block.text === 'string') return block.text;
						return undefined;
					})
					.filter((x: unknown): x is string => typeof x === 'string')
					.join('');
			}
			return undefined;
		})
		.filter((item: unknown): item is string => typeof item === 'string')
		.join('');
}
