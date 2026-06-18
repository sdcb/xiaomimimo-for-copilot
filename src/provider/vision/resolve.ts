import vscode from 'vscode';
import { logger } from '../../logger';
import { IMAGE_DESCRIPTION_PREFIX, IMAGE_DESCRIPTION_SUFFIX, IMAGE_DESCRIPTION_UNAVAILABLE } from './consts';
import type {
	VisionDescriber,
	VisionImagePart,
	VisionResolutionResult,
	VisionResolutionStats,
} from './types';
import { getVisionPrompt } from './sources';
import { isVisionProxyError, formatVisionProxyError, getVisionProxyErrorDisplayCode, formatVisionProxyDisplayMessage } from './errors';

/**
 * Resolve image parts in messages by sending them to a vision model for
 * description. The vision model's text output replaces image data parts
 * so that text-only MiMo models can understand image content.
 */
export async function resolveImageMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	token: vscode.CancellationToken,
	getDescriber: () => Promise<VisionDescriber | undefined>,
): Promise<VisionResolutionResult> {
	const stats = createVisionResolutionStats();
	collectInputImageStats(messages, stats);
	if (stats.inputImageParts === 0) {
		return { messages, stats };
	}

	const currentImageMessageIndex = findCurrentImageMessageIndex(messages);
	const result: vscode.LanguageModelChatRequestMessage[] = [];
	let visionDescriber: VisionDescriber | undefined;
	let visionDescriberRequested = false;
	let missingVisionProxy = false;
	let visionFailureNotice: string | undefined;

	for (const [messageIndex, message] of messages.entries()) {
		const imageParts = getImageParts(message);
		if (imageParts.length === 0) {
			result.push(message as vscode.LanguageModelChatRequestMessage);
			continue;
		}

		const nonImageParts = getNonImageParts(message);

		// Only describe images in the current (latest) user message.
		// Historical images are omitted to avoid re-describing old images.
		if (messageIndex === currentImageMessageIndex) {
			stats.currentImageMessages += 1;
			if (!visionDescriberRequested) {
				visionDescriberRequested = true;
				visionDescriber = await getDescriber();
			}

			const resolution = await resolveCurrentVisionText(
				imageParts,
				nonImageParts,
				visionDescriber,
				stats,
				token,
			);

			if (!visionDescriber && !token.isCancellationRequested) {
				missingVisionProxy = true;
			}

			visionFailureNotice ??= resolution.failureNotice;

			stats.droppedImageParts += imageParts.length;
			result.push(
				createResolvedMessage(message, [
					...nonImageParts,
					new vscode.LanguageModelTextPart(resolution.text),
				]),
			);
			continue;
		}

		// Historical image messages: drop images, keep text only
		stats.omittedImageMessages += 1;
		stats.droppedImageParts += imageParts.length;
		result.push(createResolvedMessage(message, nonImageParts));
	}

	return {
		messages: result,
		stats,
		visionModelId: visionDescriber?.id,
		visionProxySource: visionDescriber?.source,
		initialResponseNotice: missingVisionProxy
			? createVisionProxyMissingNotice()
			: visionFailureNotice,
	};
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function createVisionResolutionStats(): VisionResolutionStats {
	return {
		inputImageParts: 0,
		inputImageMessages: 0,
		currentImageMessages: 0,
		generatedImageMessages: 0,
		omittedImageMessages: 0,
		unavailableImageMessages: 0,
		failedImageMessages: 0,
		droppedImageParts: 0,
	};
}

function collectInputImageStats(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	stats: VisionResolutionStats,
): void {
	for (const message of messages) {
		const imageParts = getImageParts(message).length;
		if (imageParts === 0) {
			continue;
		}
		stats.inputImageMessages += 1;
		stats.inputImageParts += imageParts;
	}
}

function findCurrentImageMessageIndex(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
): number | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
			return undefined;
		}
		if (message.role !== vscode.LanguageModelChatMessageRole.User) {
			continue;
		}
		if (getImageParts(message).length > 0) {
			return index;
		}
	}
	return undefined;
}

interface VisionResolution {
	text: string;
	failureNotice?: string;
}

async function resolveCurrentVisionText(
	imageParts: readonly vscode.LanguageModelDataPart[],
	nonImageParts: readonly vscode.LanguageModelInputPart[],
	visionDescriber: VisionDescriber | undefined,
	stats: VisionResolutionStats,
	token: vscode.CancellationToken,
): Promise<VisionResolution> {
	if (!visionDescriber || token.isCancellationRequested) {
		if (!visionDescriber) {
			logger.warn('Vision proxy unavailable. Images will be described as unavailable.');
		}
		stats.unavailableImageMessages += 1;
		return { text: IMAGE_DESCRIPTION_UNAVAILABLE };
	}

	try {
		const description = await visionDescriber.describe({
			prompt: getVisionPrompt(),
			images: imageParts.map((part) => ({
				mimeType: part.mimeType,
				data: part.data,
			})),
			token,
		});

		if (description.length === 0) {
			stats.failedImageMessages += 1;
			logger.warn('Vision proxy returned empty response.');
			return {
				text: IMAGE_DESCRIPTION_UNAVAILABLE,
				failureNotice: '[empty-response] Vision proxy returned an empty response.',
			};
		}

		stats.generatedImageMessages += 1;
		return { text: createImageDescriptionText(description) };
	} catch (error) {
		logger.error('Vision proxy error:', formatVisionProxyError(error));
		stats.failedImageMessages += 1;

		let failureNotice: string | undefined;
		if (isVisionProxyError(error)) {
			failureNotice = formatVisionProxyDisplayMessage(
				getVisionProxyErrorDisplayCode(error),
				error.message,
			);
		}

		return { text: IMAGE_DESCRIPTION_UNAVAILABLE, failureNotice };
	}
}

function createImageDescriptionText(description: string): string {
	return `${IMAGE_DESCRIPTION_PREFIX}${description}${IMAGE_DESCRIPTION_SUFFIX}`;
}

function getImageParts(
	message: vscode.LanguageModelChatRequestMessage,
): vscode.LanguageModelDataPart[] {
	return message.content.filter(
		(part): part is vscode.LanguageModelDataPart =>
			part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/'),
	);
}

function getNonImageParts(
	message: vscode.LanguageModelChatRequestMessage,
): vscode.LanguageModelInputPart[] {
	return message.content.filter(
		(part) => !(part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/')),
	) as vscode.LanguageModelInputPart[];
}

function createResolvedMessage(
	original: vscode.LanguageModelChatRequestMessage,
	content: vscode.LanguageModelInputPart[],
): vscode.LanguageModelChatRequestMessage {
	return {
		role: original.role,
		content,
	} as unknown as vscode.LanguageModelChatRequestMessage;
}

function createVisionProxyMissingNotice(): string {
	return (
		'\n\n> **⚠️ Vision Proxy Not Configured**\n' +
		'> Image attachments were detected but no vision model is available to describe them.\n' +
		'> Run **MiMo: Configure Vision Proxy** to set up a vision model.\n'
	);
}
