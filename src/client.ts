import type { CancellationToken } from 'vscode';
import { logger } from './logger';
import type { MiMoRequest, MiMoStreamChunk, MiMoToolCall, StreamCallbacks } from './types';

const STANDARD_API_BASE_URL = 'https://api.xiaomimimo.com/v1';

function isTokenPlanBaseUrl(baseUrl: string): boolean {
	return /https:\/\/token-plan-(cn|sgp|ams)\.xiaomimimo\.com\/v1/i.test(baseUrl);
}

function formatMiMoError(status: number, rawMessage: string, baseUrl: string): string {
	const details = rawMessage.trim();

	switch (status) {
		case 400:
			return [
				'Invalid request format.',
				'Check the JSON body, required parameters, model name, multimodal input constraints, and for thinking-mode tool loops make sure prior reasoning_content is passed back.',
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		case 401:
			return [
				'Authentication failed.',
				'MiMo documents this as a missing or invalid API key, an incorrect auth header format, or mixing Token Plan and pay-as-you-go credentials.',
				isTokenPlanBaseUrl(baseUrl)
					? `This extension is using the Token Plan endpoint ${baseUrl}. If your key is for the standard no-plan API, switch mimo-copilot.baseUrl to ${STANDARD_API_BASE_URL}.`
					: `This extension is using the standard endpoint ${baseUrl}. If your key belongs to a Token Plan, switch mimo-copilot.baseUrl to the matching Token Plan endpoint for that subscription.`,
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		case 402:
			return [
				'Insufficient balance.',
				'Check the MiMo account balance and recharge or use a key with available quota.',
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		case 403:
			return [
				'Forbidden access.',
				'MiMo documents this as the service being unavailable in the current region or the API key being restricted by risk control.',
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		case 404:
			return [
				'Requested endpoint or model not found.',
				'Check that the selected endpoint and model support the requested capability, especially image input.',
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		case 421:
			return [
				'Request blocked by content moderation.',
				'Avoid unsafe or sensitive input and try again.',
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		case 429:
			return [
				'Too many requests.',
				'MiMo documents this as rate limiting or exhausted Token Plan quota. Retry with backoff, reduce request frequency, or switch plan/API as needed.',
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		case 500:
			return [
				'MiMo server error.',
				'Try again later or contact MiMo support if the issue persists.',
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		case 503:
			return [
				'MiMo server overloaded.',
				'Try again later when traffic is lower.',
				details && `MiMo API said: ${details}`,
			]
				.filter(Boolean)
				.join(' ');

		default:
			return details || `HTTP ${status}`;
	}
}

/**
 * Lightweight SSE-streaming MiMo API client.
 * No external dependencies — uses Node's built-in fetch.
 */
export class MiMoClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
	) {}

	/**
	 * Stream a chat completion from the MiMo API.
	 * Parses SSE chunks and dispatches callbacks for content, thinking, and tool calls.
	 */
	async streamChatCompletion(
		request: MiMoRequest,
		callbacks: StreamCallbacks,
		cancellationToken?: CancellationToken,
	): Promise<void> {
		const controller = new AbortController();

		const cancelListener = cancellationToken?.onCancellationRequested(() => {
			controller.abort();
		});

		try {
			// Request usage stats in streaming responses so we can calibrate token counting.
			const requestBody = {
				...request,
				stream_options: { include_usage: true },
			};

			const url = `${this.baseUrl}/chat/completions`;

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				let errorMessage: string;
				try {
					const errorJson = JSON.parse(errorText);
					errorMessage = errorJson.error?.message || errorJson.message || errorText;
				} catch {
					errorMessage = errorText;
				}
				throw new Error(
					`MiMo API error (${response.status}): ${formatMiMoError(response.status, errorMessage, this.baseUrl)}`,
				);
			}

			if (!response.body) {
				throw new Error('No response body received');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			// Accumulate tool call deltas by index, then emit on finish_reason=stop/tool_calls
			const pendingToolCalls = new Map<number, MiMoToolCall>();

			while (true) {
				if (cancellationToken?.isCancellationRequested) {
					controller.abort();
					break;
				}

				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					const trimmed = line.trim();

					if (!trimmed || trimmed.startsWith(':')) {
						continue;
					}

					if (trimmed === 'data: [DONE]') {
						// Flush any remaining tool calls
						for (const tc of pendingToolCalls.values()) {
							callbacks.onToolCall(tc);
						}
						pendingToolCalls.clear();
						callbacks.onDone();
						return;
					}

					if (!trimmed.startsWith('data: ')) {
						continue;
					}

					const jsonStr = trimmed.slice(6);
					try {
						const chunk: MiMoStreamChunk = JSON.parse(jsonStr);
						const choice = chunk.choices?.[0];

						// Capture usage stats from the API for token-count calibration.
						if (chunk.usage && callbacks.onUsage) {
							callbacks.onUsage(chunk.usage);
						}

						if (!choice) {
							continue;
						}

						// Thinking content → report with correct field name so VS Code renders collapsible blocks
						const reasoning = choice.delta.reasoning_content;
						if (reasoning) {
							callbacks.onThinking(reasoning);
						}

						// Regular content
						if (choice.delta.content) {
							callbacks.onContent(choice.delta.content);
						}

						// Tool calls — accumulate deltas by index
						if (choice.delta.tool_calls) {
							for (const tc of choice.delta.tool_calls) {
								let pending = pendingToolCalls.get(tc.index);
								if (!pending && tc.id) {
									pending = {
										id: tc.id,
										type: 'function',
										function: { name: '', arguments: '' },
									};
									pendingToolCalls.set(tc.index, pending);
								}
								if (pending) {
									if (tc.function?.name) {
										pending.function.name += tc.function.name;
									}
									if (tc.function?.arguments) {
										pending.function.arguments += tc.function.arguments;
									}
								}
							}
						}

						// Flush pending tool calls on finish
						if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
							for (const tc of pendingToolCalls.values()) {
								callbacks.onToolCall(tc);
							}
							pendingToolCalls.clear();
						}
					} catch (e) {
						logger.error('Failed to parse SSE chunk:', jsonStr.slice(0, 200), e);
					}
				}
			}

			callbacks.onDone();
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				callbacks.onDone();
				return;
			}
			callbacks.onError(error instanceof Error ? error : new Error(String(error)));
		} finally {
			cancelListener?.dispose();
		}
	}
}
