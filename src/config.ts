import vscode from 'vscode';
import { CONFIG_SECTION } from './consts';

/**
 * Get MiMo API base URL from settings.
 * Falls back to the official endpoint when not configured.
 * When the user picks "Custom Endpoint", reads `customBaseUrl` and throws
 * if it is empty.
 */
export function getBaseUrl(): string {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

	type BaseUrl =
		| (string & {})
		| 'use_the_custom_endpoint_keep_this_enum_value_long_to_avoid_showing_subtitle_in_dropdown';

	const base = config.get<BaseUrl>('baseUrl');

	if (
		base ===
		'use_the_custom_endpoint_keep_this_enum_value_long_to_avoid_showing_subtitle_in_dropdown'
	) {
		const custom = config.get<string>('customBaseUrl')?.trim();
		if (!custom) {
			throw new Error(
				'Custom endpoint selected but `mimo-copilot.customBaseUrl` is empty. Please set it in Settings.',
			);
		}
		return custom;
	}

	return base || 'https://api.xiaomimimo.com/v1';
}

/**
 * Resolve the API model ID to send to the endpoint.
 *
 * Users can override model IDs via the `modelIdOverrides` setting object
 * (e.g. for third-party API proxies). Falls back to the VS Code model ID
 * when no override is configured.
 */
export function getApiModelId(vscodeModelId: string): string {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const overrides = config.get<Record<string, string>>('modelIdOverrides');
	const override = overrides?.[vscodeModelId]?.trim();
	return override || vscodeModelId;
}

/**
 * Get the configured max output tokens limit.
 * Returns `undefined` when set to 0 (API default — no limit).
 */
export function getMaxTokens(): number | undefined {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const value = config.get<number>('maxTokens', 0);
	return value > 0 ? value : undefined;
}
