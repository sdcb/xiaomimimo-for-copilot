import type vscode from 'vscode';

export type VisionProxySource = 'api-endpoint' | 'vscode-lm';

export type VisionProxyProviderFamily = 'anthropic-compatible' | 'openai-compatible';

export type VisionProxyApiType = 'messages' | 'chat-completions' | 'responses';

export interface VisionLanguageModelOption {
	id: string;
	vendor: string;
	name: string;
	family: string;
	version: string;
	label: string;
	description: string;
}

export interface VisionProxyConfig {
	providerFamily: VisionProxyProviderFamily;
	apiType: VisionProxyApiType;
	url: string;
	modelId: string;
	headers?: Record<string, string>;
	extraBody?: Record<string, unknown>;
	updatedAt: number;
}

export interface VisionImagePart {
	mimeType: string;
	data: Uint8Array;
}

export interface VisionDescriptionRequest {
	prompt: string;
	images: readonly VisionImagePart[];
	token: vscode.CancellationToken;
}

export interface VisionDescriber {
	readonly id: string;
	readonly source: VisionProxySource;
	describe(request: VisionDescriptionRequest): Promise<string>;
}

export interface VisionResolutionStats {
	inputImageParts: number;
	inputImageMessages: number;
	currentImageMessages: number;
	generatedImageMessages: number;
	omittedImageMessages: number;
	unavailableImageMessages: number;
	failedImageMessages: number;
	droppedImageParts: number;
}

export interface VisionResolutionResult {
	messages: readonly vscode.LanguageModelChatRequestMessage[];
	stats: VisionResolutionStats;
	visionModelId?: string;
	visionProxySource?: VisionProxySource;
	initialResponseNotice?: string;
}
