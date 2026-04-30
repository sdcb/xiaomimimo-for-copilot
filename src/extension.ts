import vscode from 'vscode';
import { WALKTHROUGH_ID, WELCOME_SHOWN_KEY } from './consts';
import { logger } from './logger';
import { MiMoChatProvider } from './provider';

let activeProvider: MiMoChatProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
	logger.info('Activating extension');

	context.subscriptions.push(
		vscode.commands.registerCommand('mimo-copilot.showLogs', () => logger.show()),
		vscode.commands.registerCommand('mimo-copilot.getApiKey', () =>
			vscode.env.openExternal(vscode.Uri.parse('https://platform.xiaomimimo.com/console/api-keys')),
		),
		vscode.commands.registerCommand('mimo-copilot.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', 'mimo-copilot'),
		),
	);

	try {
		const provider = new MiMoChatProvider(context);
		activeProvider = provider;

		context.subscriptions.push(
			vscode.commands.registerCommand('mimo-copilot.setApiKey', () => provider.configureApiKey()),
			vscode.commands.registerCommand('mimo-copilot.clearApiKey', () => provider.clearApiKey()),
			vscode.lm.registerLanguageModelChatProvider('mimo', provider),
		);

		void showWelcomeIfNeeded(context, provider).catch((error) => {
			logger.warn('Failed to show MiMo welcome prompt', error);
		});

		logger.info('Extension activated');
	} catch (error) {
		activeProvider = undefined;
		logger.error('Failed to activate MiMo extension', error);
		void vscode.window.showErrorMessage(
			'MiMo failed to activate. Run "MiMo: Show Logs" for details.',
		);
		throw error;
	}
}

async function showWelcomeIfNeeded(
	context: vscode.ExtensionContext,
	provider: MiMoChatProvider,
): Promise<void> {
	if (context.globalState.get<boolean>(WELCOME_SHOWN_KEY)) {
		return;
	}
	if (await provider.hasApiKey()) {
		await context.globalState.update(WELCOME_SHOWN_KEY, true);
		return;
	}

	await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false);
	await context.globalState.update(WELCOME_SHOWN_KEY, true);
}

export async function deactivate() {
	try {
		await activeProvider?.prepareForDeactivate();
	} catch (error) {
		logger.warn('Failed to prepare MiMo provider for deactivate', error);
	} finally {
		activeProvider = undefined;
		logger.info('Extension deactivated');
		logger.dispose();
	}
}
