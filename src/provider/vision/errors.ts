import type { VisionProxyApiType, VisionProxyProviderFamily } from './types';

export type VisionProxyErrorCode =
	| 'missing-configuration'
	| 'invalid-custom-headers'
	| 'invalid-url'
	| 'http-auth'
	| 'http-not-found'
	| 'http-payload-too-large'
	| 'http-rate-limited'
	| 'http-provider'
	| 'timeout'
	| 'cancelled'
	| 'empty-response'
	| 'unsupported-response'
	| 'network';

export class VisionProxyError extends Error {
	constructor(
		readonly code: VisionProxyErrorCode,
		message: string,
		readonly status?: number,
		readonly cause?: unknown,
	) {
		super(message);
		this.name = 'VisionProxyError';
	}
}

export function isVisionProxyError(error: unknown): error is VisionProxyError {
	return error instanceof VisionProxyError;
}

export async function createHttpVisionProxyError(
	response: Response,
	context: { modelId: string; endpoint?: URL },
): Promise<VisionProxyError> {
	const responseText = await response.text();
	const serverMessage = extractServerMessage(responseText);
	const target = context.endpoint
		? `${context.endpoint.host}${context.endpoint.pathname}`
		: 'unknown';
	const status = response.status;

	if (status === 401 || status === 403) {
		return new VisionProxyError(
			'http-auth',
			`Authentication failed (${status}). Check your API key.`,
			status,
		);
	}
	if (status === 404) {
		return new VisionProxyError(
			'http-not-found',
			`Endpoint not found: ${target}`,
			status,
		);
	}
	if (status === 413) {
		return new VisionProxyError(
			'http-payload-too-large',
			`Request payload too large (${status}).`,
			status,
		);
	}
	if (status === 429) {
		return new VisionProxyError(
			'http-rate-limited',
			`Rate limited (${status}). Try again later.`,
			status,
		);
	}
	if (status >= 500) {
		return new VisionProxyError(
			'http-provider',
			`Vision provider unavailable (${status}). ${serverMessage}`,
			status,
		);
	}
	return new VisionProxyError(
		'http-provider',
		`Vision proxy request failed (${status}). ${serverMessage}`,
		status,
	);
}

export function formatVisionProxyError(error: unknown): string {
	if (error instanceof VisionProxyError) {
		const parts = [
			error.status !== undefined ? `status=${error.status}` : `code=${error.code}`,
			error.message,
		];
		if (error.cause instanceof Error) {
			parts.push(`cause=${error.cause.message}`);
		}
		return parts.join(' | ');
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export function getVisionProxyErrorDisplayCode(error: unknown): string {
	if (error instanceof VisionProxyError) {
		if (error.status !== undefined) {
			return String(error.status);
		}
		return error.code;
	}
	return 'UNKNOWN';
}

export function formatVisionProxyDisplayMessage(errorCode: string, errorMessage: string): string {
	return `[${errorCode}] ${errorMessage}`;
}

function extractServerMessage(responseText: string): string {
	try {
		const parsed = JSON.parse(responseText) as Record<string, unknown>;
		if (typeof parsed.error === 'string') {
			return parsed.error;
		}
		if (typeof parsed.error === 'object' && parsed.error !== null) {
			const errorObj = parsed.error as Record<string, unknown>;
			if (typeof errorObj.message === 'string') {
				return errorObj.message;
			}
		}
		if (typeof parsed.message === 'string') {
			return parsed.message;
		}
	} catch {
		// Not JSON
	}
	return '';
}
