import { randomBytes } from 'crypto';
import vscode from 'vscode';
import type { VisionLanguageModelOption, VisionProxyConfig, VisionProxySource } from '../types';
import { getVisionProxyPanelScript } from './script';
import { getVisionProxyPanelStyle } from './style';

export interface VisionProxyPanelState {
	source: VisionProxySource;
	config?: VisionProxyConfig;
	hasApiKey: boolean;
	lmModels: VisionLanguageModelOption[];
	selectedLmModelId?: string;
}

export function getVisionProxyPanelHtml(
	webview: vscode.Webview,
	state: VisionProxyPanelState,
): string {
	const nonce = createNonce();
	const htmlLang = vscode.env.language.toLowerCase() === 'zh-cn' ? 'zh-CN' : 'en';
	const strings = getVisionProxyPanelStrings();
	const initialState = escapeScriptJson(state);
	const initialStrings = escapeScriptJson(strings);
	const csp = [
		"default-src 'none'",
		`style-src 'nonce-${nonce}'`,
		`script-src 'nonce-${nonce}'`,
		`img-src ${webview.cspSource} data:`,
	].join('; ');

	return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(strings.title)}</title>
	<style nonce="${nonce}">${getVisionProxyPanelStyle()}</style>
</head>
<body>
	<main>
		<h1>${escapeHtml(strings.title)}</h1>
		<p class="intro">${escapeHtml(strings.description)}</p>
		<div id="summary" class="summary">
			<div class="summary-dot"></div>
			<div>
				<div id="summaryTitle" class="summary-title"></div>
				<div id="summaryDetail" class="summary-detail"></div>
			</div>
		</div>
		<form id="form">
			<fieldset>
				<div id="sourceField" class="field">
					<div id="sourceLabel" class="field-label">${escapeHtml(strings.fieldSource)}</div>
					<div class="source-options" role="radiogroup" aria-labelledby="sourceLabel">
						<label class="source-option">
							<input id="sourceVscodeLm" type="radio" name="source" value="vscode-lm">
							<span>${escapeHtml(strings.sourceVscodeLm)}</span>
						</label>
						<label class="source-option">
							<input id="sourceApiEndpoint" type="radio" name="source" value="api-endpoint">
							<span>${escapeHtml(strings.sourceApiEndpoint)}</span>
						</label>
					</div>
				</div>
				<div id="lmSection" class="section">
					<div class="field">
						<label for="lmModelId">${escapeHtml(strings.fieldVisionModel)}</label>
						<select id="lmModelId"></select>
					</div>
				</div>
				<div id="endpointSection" class="section">
					<div class="field">
						<label for="url">${escapeHtml(strings.fieldEndpointUrl)}</label>
						<input id="url" type="url" placeholder="${escapeHtml(strings.placeholderOpenAIEndpoint)}">
					</div>
					<div class="field">
						<label for="endpointType">${escapeHtml(strings.fieldEndpointType)}</label>
						<select id="endpointType">
							<option value="">${escapeHtml(strings.placeholderEndpointType)}</option>
							<option value="openai-chat-completions">${escapeHtml(strings.endpointTypeOpenAIChatCompletions)}</option>
							<option value="openai-responses">${escapeHtml(strings.endpointTypeOpenAIResponses)}</option>
							<option value="anthropic-messages">${escapeHtml(strings.endpointTypeAnthropicMessages)}</option>
						</select>
						<div id="endpointTypeHint" class="hint"></div>
					</div>
					<div class="field">
						<label for="apiKey">${escapeHtml(strings.fieldApiKey)}</label>
						<input id="apiKey" type="password" autocomplete="off">
						<div id="apiKeyHint" class="hint"></div>
					</div>
					<div class="field">
						<label for="modelId">${escapeHtml(strings.fieldModelId)}</label>
						<input id="modelId" placeholder="gpt-4o-mini">
					</div>
					<div class="field">
						<label for="headers">${escapeHtml(strings.fieldCustomHeaders)}</label>
						<textarea id="headers" spellcheck="false" placeholder="{
  &quot;X-Custom-Header&quot;: &quot;value&quot;
}"></textarea>
						<div class="hint">${escapeHtml(strings.hintCustomHeaders)}</div>
					</div>
					<div class="field">
						<label for="extraBody">${escapeHtml(strings.fieldExtraBody)}</label>
						<textarea id="extraBody" spellcheck="false" placeholder="{
  &quot;temperature&quot;: 0,
  &quot;max_tokens&quot;: 1024
}"></textarea>
						<div class="hint">${escapeHtml(strings.hintExtraBody)}</div>
					</div>
				</div>
			</fieldset>
			<div class="actions">
				<button id="save" type="submit">${escapeHtml(strings.actionSave)}</button>
				<button id="test" class="secondary" type="button">${escapeHtml(strings.actionTest)}</button>
			</div>
			<div id="status" class="status" aria-live="polite"></div>
			<div id="testResult" class="test-result" hidden>
				<div class="test-result-grid">
					<div class="test-result-pane">
						<div class="test-result-label">${escapeHtml(strings.testImage)}</div>
						<img id="testImage" class="test-image" alt="${escapeHtml(strings.testImage)}">
					</div>
					<div class="test-result-pane">
						<div class="test-result-label">${escapeHtml(strings.testResponse)}</div>
						<pre id="testResponse" class="test-response"></pre>
					</div>
				</div>
			</div>
		</form>
	</main>
	<script nonce="${nonce}">${getVisionProxyPanelScript(initialState, initialStrings)}</script>
</body>
</html>`;
}

function createNonce(): string {
	return randomBytes(16).toString('base64');
}

function escapeScriptJson(value: unknown): string {
	return JSON.stringify(value)
		.replaceAll('<', '\\u003c')
		.replaceAll('\u2028', '\\u2028')
		.replaceAll('\u2029', '\\u2029');
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function getVisionProxyPanelStrings() {
	return {
		title: 'MiMo Vision Proxy',
		description:
			'Configure how image attachments are described for text-only MiMo models. ' +
			'Images are sent to a vision-capable model, and the description replaces the image in the chat prompt.',
		sourceVscodeLm: 'VS Code Language Model',
		sourceApiEndpoint: 'Custom API Endpoint',
		fieldSource: 'Vision Source',
		fieldVisionModel: 'Vision Model',
		fieldEndpointType: 'Endpoint Type',
		fieldEndpointUrl: 'Endpoint URL',
		fieldApiKey: 'API Key',
		fieldModelId: 'Model ID',
		fieldCustomHeaders: 'Custom Headers (JSON)',
		fieldExtraBody: 'Extra Body (JSON)',
		hintCustomHeaders: 'Optional JSON object of additional HTTP headers.',
		hintExtraBody: 'Optional JSON object merged into the request body.',
		placeholderOpenAIEndpoint: 'https://api.openai.com/v1/chat/completions',
		placeholderOpenAIResponsesEndpoint: 'https://api.openai.com/v1/responses',
		placeholderAnthropicEndpoint: 'https://api.anthropic.com/v1/messages',
		placeholderEndpointType: 'Select endpoint type…',
		placeholderEnterApiKey: 'Enter API key…',
		endpointTypeOpenAIChatCompletions: 'OpenAI Chat Completions',
		endpointTypeOpenAIResponses: 'OpenAI Responses',
		endpointTypeAnthropicMessages: 'Anthropic Messages',
		hintEndpointTypeEmpty: 'Enter a URL to auto-detect the endpoint type.',
		hintEndpointTypeInferred: 'Auto-detected from URL: {0}',
		hintEndpointTypeManual: 'Select the endpoint type manually.',
		hintEndpointTypeSelected: 'Using: {0}',
		hintApiKeySet: 'API key is stored securely.',
		hintApiKeyUnset: 'No API key set. Some endpoints require one.',
		statusVscodeLmSelected: 'Using VS Code language model for vision.',
		statusApiKeySet: 'API key configured.',
		statusApiKeyNotSet: 'No API key set.',
		statusTesting: 'Testing connection…',
		statusApiKeyCleared: 'API key cleared.',
		summaryNoVSCodeVisionTitle: 'No VS Code Vision Models',
		summaryNoVSCodeVisionDetail:
			'No vision-capable VS Code language models were found. Install a vision-capable extension or use a custom API endpoint.',
		summaryVscodeLmTitle: 'VS Code Language Model',
		summaryVscodeLmDetail: 'Using {0} by {1} for image descriptions.',
		summaryApiNotConfiguredTitle: 'API Endpoint Not Configured',
		summaryApiNotConfiguredDetail: 'Configure an endpoint URL and model ID to use a custom vision API.',
		summaryApiEndpointTitle: 'Custom API Endpoint',
		summaryApiEndpointDetail: 'Using {0} ({1}) at {2}. API key: {3}.',
		summaryApiKeySet: 'set',
		summaryApiKeyNotSet: 'not set',
		actionSave: 'Save',
		actionTest: 'Test Connection',
		actionViewDetails: 'View Details',
		actionClearApiKey: 'Clear stored key',
		testImage: 'Test Image',
		testResponse: 'Response',
		errorRequired: '{0} is required.',
		errorInvalidJson: '{0}: invalid JSON.',
	};
}
