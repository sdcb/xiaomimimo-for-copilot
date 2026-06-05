import type { CancellationToken } from 'vscode';
import { logger } from '../../logger';
import type { VisionDescriptionRequest, VisionProxyConfig } from './types';
import {
	createHttpVisionProxyError,
	isVisionProxyError,
	VisionProxyError,
	formatVisionProxyError,
} from './errors';
import { getVisionProviderAdapter } from './providers';
import { isRecord } from './utils';

const DEFAULT_TIMEOUT_MS = 30_000;

export class VisionProxyClient {
	async describe(
		config: VisionProxyConfig,
		apiKey: string | undefined,
		request: VisionDescriptionRequest,
	): Promise<string> {
		if (request.token.isCancellationRequested) {
			throw new VisionProxyError('cancelled', 'Vision proxy request was cancelled.');
		}

		const endpoint = new URL(config.url);
		const adapter = getVisionProviderAdapter(config);
		const body = adapter.createBody(config, request);
		const headers = createProviderHeaders(config, apiKey?.trim() || undefined);

		const responseValue = await postJson(endpoint, {
			headers,
			body,
			timeoutMs: DEFAULT_TIMEOUT_MS,
			token: request.token,
			modelId: config.modelId,
		});

		try {
			return adapter.parseResponse(responseValue);
		} catch (error) {
			if (isVisionProxyError(error)) {
				throw error;
			}
			throw new VisionProxyError(
				'unsupported-response',
				'Failed to parse vision proxy response.',
				undefined,
				error,
			);
		}
	}
}

async function postJson(
	endpoint: URL,
	options: {
		headers: Record<string, string>;
		body: object;
		timeoutMs: number;
		token: CancellationToken;
		modelId: string;
	},
): Promise<unknown> {
	const controller = new AbortController();
	let timeoutReached = false;
	const timeout = setTimeout(() => {
		timeoutReached = true;
		controller.abort();
	}, options.timeoutMs);
	const cancelListener = options.token.onCancellationRequested(() => {
		controller.abort();
	});

	try {
		const bodyText = JSON.stringify(options.body);
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: options.headers,
			body: bodyText,
			signal: controller.signal,
		});

		if (!response.ok) {
			throw await createHttpVisionProxyError(response, {
				modelId: options.modelId,
				endpoint,
			});
		}

		const responseText = await response.text();
		try {
			return JSON.parse(responseText) as unknown;
		} catch (error) {
			throw new VisionProxyError(
				'unsupported-response',
				'Vision proxy returned non-JSON response.',
				undefined,
				error,
			);
		}
	} catch (error) {
		if (options.token.isCancellationRequested) {
			throw new VisionProxyError('cancelled', 'Vision proxy request was cancelled.');
		}
		if (timeoutReached) {
			throw new VisionProxyError('timeout', 'Vision proxy request timed out (30s).');
		}
		if (isVisionProxyError(error)) {
			throw error;
		}
		logger.warn('Vision proxy network error:', formatVisionProxyError(error));
		throw new VisionProxyError(
			'network',
			`Vision proxy network error: ${error instanceof Error ? error.message : String(error)}`,
			undefined,
			error,
		);
	} finally {
		clearTimeout(timeout);
		cancelListener.dispose();
	}
}

function createProviderHeaders(
	config: VisionProxyConfig,
	apiKey: string | undefined,
): Record<string, string> {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
	};

	if (config.providerFamily === 'anthropic-compatible') {
		headers['anthropic-version'] = '2023-06-01';
		if (apiKey) {
			headers['x-api-key'] = apiKey;
		}
	} else if (apiKey) {
		headers.authorization = `Bearer ${apiKey}`;
	}

	for (const [name, value] of Object.entries(config.headers ?? {})) {
		headers[name] = value;
	}

	return headers;
}
