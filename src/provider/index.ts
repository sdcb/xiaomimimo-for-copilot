import vscode from 'vscode';
import { AuthManager } from '../auth';
import { MiMoClient } from '../client';
import { getApiModelId, getBaseUrl, getMaxTokens } from '../config';
import { API_KEY_REQUIRED_DETAIL, MODELS } from '../consts';
import { logger } from '../logger';
import type { MiMoToolCall, ModelDefinition } from '../types';
import { type ReasoningEntry, pruneReasoningCache } from './cache';
import { convertMessages, convertTools, countMessageChars } from './convert';
import { stripImagesIfNeeded } from './vision';

/**
 * NOTE: Non-public API surface.
 *
 * The fields below (`modelConfiguration` on response options, plus
 * `isUserSelectable` / `statusIcon`) are not part of the stable
 * `vscode.LanguageModelChat*` typings yet. They are the same shape
 * currently consumed by GitHub Copilot Chat to render the model picker.
 *
 * If/when VS Code stabilizes these as proposed API, switch to the official
 * types and drop the casts below.
 */

/**
 * Non-public: extra fields on `LanguageModelChatInformation` consumed by the
 * Copilot Chat model picker — `isUserSelectable` controls picker visibility,
 * `statusIcon` renders a leading icon (e.g. warning when key missing).
 */
type ModelPickerChatInformation = vscode.LanguageModelChatInformation & {
	readonly isUserSelectable: boolean;
	readonly statusIcon?: vscode.ThemeIcon;
};

/**
 * MiMo Chat Provider — implements vscode.LanguageModelChatProvider so
 * MiMo models appear directly in the Copilot Chat model picker.
 */
export class MiMoChatProvider implements vscode.LanguageModelChatProvider {
	private readonly authManager: AuthManager;
	private readonly onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter<void>();
	private isActive = true;

	readonly onDidChangeLanguageModelChatInformation =
		this.onDidChangeLanguageModelChatInformationEmitter.event;

	/** reasoning text → tool_call IDs cache. */
	private readonly reasoningCache = new Map<string, ReasoningEntry>();

	/**
	 * Adaptive chars-per-token ratio, calibrated from actual usage data.
	 * Updated via exponential moving average each time the API reports real token counts.
	 */
	private charsPerToken = 4.0;

	constructor(context: vscode.ExtensionContext) {
		this.authManager = new AuthManager(context);

		context.subscriptions.push(
			this.onDidChangeLanguageModelChatInformationEmitter,
			// Settings-based fallback API key changes.
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('mimo-copilot.apiKey')) {
					this.onDidChangeLanguageModelChatInformationEmitter.fire();
				}
			}),
			// Multi-window: SecretStorage changes don't fire onDidChangeConfiguration.
			// When another window sets/clears the API key, refresh this window's
			// model picker so the warning state stays in sync.
			context.secrets.onDidChange((e) => {
				if (e.key === 'mimo-copilot.apiKey') {
					this.onDidChangeLanguageModelChatInformationEmitter.fire();
				}
			}),
		);
	}

	// ---- Public commands ----

	async configureApiKey(): Promise<void> {
		const saved = await this.authManager.promptForApiKey();
		if (saved) {
			this.onDidChangeLanguageModelChatInformationEmitter.fire();
		}
	}

	async clearApiKey(): Promise<void> {
		await this.authManager.deleteApiKey();
		this.onDidChangeLanguageModelChatInformationEmitter.fire();
		vscode.window.showInformationMessage('MiMo API key removed.');
	}

	async hasApiKey(): Promise<boolean> {
		return this.authManager.hasApiKey();
	}

	async prepareForDeactivate(): Promise<void> {
		this.isActive = false;
		this.onDidChangeLanguageModelChatInformationEmitter.fire();

		// Force the host to re-pull `provideLanguageModelChatInformation` synchronously
		// before the extension unloads. With `isActive = false` we now return [],
		// which makes Copilot Chat drop MiMo models from the picker immediately
		// instead of leaving stale entries behind after deactivate.
		try {
			await vscode.lm.selectChatModels({ vendor: 'mimo' });
		} catch (error) {
			logger.warn('Failed to refresh MiMo models during deactivate', error);
		}
	}

	// ---- LanguageModelChatProvider ----

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		if (!this.isActive) {
			return [];
		}

		const hasKey = await this.authManager.hasApiKey();
		return MODELS.map((model) => toChatInfo(model, hasKey));
	}

	async provideLanguageModelChatResponse(
		modelInfo: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const apiKey = await this.authManager.getApiKey();
		if (!apiKey) {
			throw new Error(
				'MiMo API key not configured. Run "MiMo: Set API Key" from the Command Palette.',
			);
		}

		const baseUrl = getBaseUrl();
		const client = new MiMoClient(baseUrl, apiKey);

		const modelDef = MODELS.find((m) => m.id === modelInfo.id);
		const isThinkingModel = modelDef?.capabilities.thinking ?? false;
		const maxTokens = getMaxTokens();

		// Heuristic: detect conversation start to clear stale cache.
		if (messages.length <= 2) {
			pruneReasoningCache(this.reasoningCache, true);
		}

		// Strip images for models that don't support vision
		const resolvedMessages = stripImagesIfNeeded(messages, modelDef);
		const mimoMessages = convertMessages(resolvedMessages, isThinkingModel, this.reasoningCache);
		const tools = modelDef?.capabilities.toolCalling ? convertTools(options.tools) : undefined;

		const totalRequestChars = countMessageChars(mimoMessages);

		let accumulatedReasoning = '';
		const pendingToolCallIds: string[] = [];
		let responseMessageId: string | undefined;

		return new Promise<void>((resolve, reject) => {
			client.streamChatCompletion(
				{
					model: getApiModelId(modelInfo.id),
					messages: mimoMessages,
					stream: true,
					tools,
					tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
					max_tokens: maxTokens,
				},
				{
					onContent: (content: string) => {
						progress.report(new vscode.LanguageModelTextPart(content));
					},

					onThinking: (text: string) => {
						accumulatedReasoning += text;

						// LanguageModelThinkingPart is a proposed API — the class
						// exists at runtime in both stable and Insiders, but the
						// stable vscode.d.ts doesn't include it. The .d.ts
						// augmentation in the project root provides type safety.
						progress.report(
							new vscode.LanguageModelThinkingPart(
								text,
							) as unknown as vscode.LanguageModelResponsePart,
						);
					},

					onToolCall: (toolCall: MiMoToolCall) => {
						pendingToolCallIds.push(toolCall.id);

						// Cache reasoning keyed by tool_call ID
						if (isThinkingModel && accumulatedReasoning) {
							this.reasoningCache.set(toolCall.id, {
								text: accumulatedReasoning,
								timestamp: Date.now(),
							});
						}

						try {
							const args = JSON.parse(toolCall.function.arguments);
							progress.report(
								new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.function.name, args),
							);
						} catch {
							progress.report(
								new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.function.name, {}),
							);
						}
					},

					onError: (error: Error) => {
						reject(error);
					},

					onDone: () => {
						// Cache reasoning for the final response (non-tool-call case).
						if (isThinkingModel && accumulatedReasoning && pendingToolCallIds.length === 0) {
							responseMessageId = `resp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
							this.reasoningCache.set(responseMessageId, {
								text: accumulatedReasoning,
								timestamp: Date.now(),
							});
						}

						pruneReasoningCache(this.reasoningCache, false);
						resolve();
					},

					onUsage: (usage) => {
						// Calibrate chars-per-token ratio from real API usage data.
						if (totalRequestChars > 0 && usage.prompt_tokens > 0) {
							const observedRatio = totalRequestChars / usage.prompt_tokens;
							this.charsPerToken = this.charsPerToken * 0.7 + observedRatio * 0.3;
						}

						// Log cache hit stats and reasoning tokens for observability.
						const cacheHit = usage.prompt_tokens_details?.cached_tokens ?? 0;
						const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
						const hitRate =
							usage.prompt_tokens > 0 ? ((cacheHit / usage.prompt_tokens) * 100).toFixed(0) : 'n/a';
						logger.info(
							`tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}` +
								` | cache: hit=${cacheHit} rate=${hitRate}%` +
								` | reasoning=${reasoningTokens}` +
								` | chars/tok=${this.charsPerToken.toFixed(2)}`,
						);

					// Report token usage to VS Code so the context window widget can render.
					// Uses the same LanguageModelDataPart + 'usage' mime convention as
					// Copilot's own BYOK providers (Anthropic, Gemini).
					progress.report(
						vscode.LanguageModelDataPart.json(usage, 'usage'),
					);
				},
				},
				token,
			);
		});
	}

	async provideTokenCount(
		_modelInfo: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		if (typeof text === 'string') {
			return Math.max(1, Math.ceil(text.length / this.charsPerToken));
		}

		if (!text?.content || !Array.isArray(text.content)) {
			return 1;
		}

		let total = 0;
		for (const part of text.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				total += part.value.length;
			}
		}
		return Math.max(1, Math.ceil(total / this.charsPerToken));
	}
}

// ---- Helpers ----

function toChatInfo(m: ModelDefinition, hasApiKey: boolean): ModelPickerChatInformation {
	return {
		id: m.id,
		name: m.name,
		family: m.family,
		version: m.version,
		detail: hasApiKey ? m.detail : API_KEY_REQUIRED_DETAIL,
		tooltip: hasApiKey ? undefined : API_KEY_REQUIRED_DETAIL,
		statusIcon: hasApiKey ? undefined : new vscode.ThemeIcon('warning'),
		maxInputTokens: m.maxInputTokens,
		maxOutputTokens: m.maxOutputTokens,
		isUserSelectable: true,
		capabilities: {
			toolCalling: m.capabilities.toolCalling,
			imageInput: m.capabilities.imageInput,
		},
	};
}
