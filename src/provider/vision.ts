import vscode from 'vscode';
import { logger } from '../logger';
import type { ModelDefinition } from '../types';

/**
 * Strip image parts from messages when the model doesn't support vision.
 * Logs a warning for each dropped image.
 */
export function stripImagesIfNeeded(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	modelDef: ModelDefinition | undefined,
): readonly vscode.LanguageModelChatRequestMessage[] {
	if (modelDef?.capabilities.imageInput) {
		return messages;
	}

	const hasImages = messages.some((m) =>
		m.content.some(
			(p) => p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/'),
		),
	);

	if (!hasImages) {
		return messages;
	}

	logger.warn(
		`Model "${modelDef?.id}" does not support vision. Image attachments will be dropped.`,
	);

	return messages.map((m) => {
		const filtered = m.content.filter(
			(p) => !(p instanceof vscode.LanguageModelDataPart && p.mimeType.startsWith('image/')),
		);
		return {
			role: m.role,
			content: filtered,
		} as unknown as vscode.LanguageModelChatRequestMessage;
	});
}
