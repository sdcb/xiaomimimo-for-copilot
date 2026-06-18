import vscode from 'vscode';
import { logger } from '../../logger';
import { VISION_PROXY_API_KEY_SECRET, VisionProxyConfigStore, createEndpointVisionDescriber, createVSCodeLanguageModelVisionDescriberGetter } from './sources';
import { openVisionProxyPanel } from './ui/panel';
import type { VisionDescriber, VisionProxyConfig } from './types';
import { isVisionProxyError, VisionProxyError } from './errors';

interface ApiEndpointConfigResult {
	config?: VisionProxyConfig;
	error?: unknown;
}

export function createVisionService(context: vscode.ExtensionContext): {
	get: () => Promise<VisionDescriber | undefined>;
	reset: () => void;
	openConfiguration: () => Promise<void>;
} {
	const store = new VisionProxyConfigStore(context);
	const vscodeLm = createVSCodeLanguageModelVisionDescriberGetter();

	const reset = (): void => {
		vscodeLm.reset();
	};

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('mimo-copilot.visionModel')) {
				reset();
			}
		}),
		context.secrets.onDidChange((event) => {
			if (event.key === VISION_PROXY_API_KEY_SECRET) {
				reset();
			}
		}),
	);

	return {
		async get() {
			const source = store.getSource();
			if (source === 'vscode-lm') {
				return vscodeLm.get();
			}

			if (source === 'api-endpoint') {
				const result = getApiEndpointConfig(store, true);
				if (!result.config) {
					if (!result.error) {
						return undefined;
					}
					return createInvalidApiEndpointDescriber(result.error);
				}
				const apiKey = await store.getApiKey();
				const describer = createEndpointVisionDescriber(result.config, apiKey);
				logger.info(`Vision proxy: ${describer.id} source=api-endpoint`);
				return describer;
			}

			// No explicit source configured: try API endpoint first, then VS Code LM fallback
			const result = getApiEndpointConfig(store, false);
			if (result.config) {
				const apiKey = await store.getApiKey();
				const describer = createEndpointVisionDescriber(result.config, apiKey);
				logger.info(`Vision proxy: ${describer.id} source=api-endpoint`);
				return describer;
			}
			return vscodeLm.get();
		},

		reset,

		async openConfiguration() {
			openVisionProxyPanel(context, { onDidChange: reset });
		},
	};
}

function getApiEndpointConfig(
	store: VisionProxyConfigStore,
	explicitApiEndpointSource: boolean,
): ApiEndpointConfigResult {
	try {
		return { config: store.getConfig() };
	} catch (error) {
		logger.warn(
			`Invalid vision proxy API endpoint configuration; source=${store.getSource() ?? 'unset'} fallback=${explicitApiEndpointSource ? 'none' : 'vscode-lm'}`,
			error,
		);
		return { error };
	}
}

function createInvalidApiEndpointDescriber(error: unknown): VisionDescriber {
	return {
		id: 'api-endpoint:invalid-configuration',
		source: 'api-endpoint',
		async describe(): Promise<string> {
			if (isVisionProxyError(error)) {
				throw error;
			}
			throw new VisionProxyError(
				'missing-configuration',
				'Vision proxy API endpoint configuration is invalid.',
				undefined,
				error,
			);
		},
	};
}
