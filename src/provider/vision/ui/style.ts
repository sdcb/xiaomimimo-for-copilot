export function getVisionProxyPanelStyle(): string {
	return `
		:root {
			color-scheme: light dark;
		}
		body {
			margin: 0;
			padding: 24px;
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}
		main {
			max-width: 760px;
		}
		h1 {
			margin: 0 0 12px;
			font-size: 20px;
			font-weight: 600;
		}
		.intro {
			margin: 0 0 16px;
			max-width: 680px;
			color: var(--vscode-descriptionForeground);
			line-height: 1.5;
		}
		.summary {
			display: flex;
			align-items: flex-start;
			gap: 8px;
			margin: 0 0 20px;
			padding: 8px 10px;
			border: 1px solid var(--vscode-panel-border, var(--vscode-input-border, transparent));
			border-radius: 2px;
			background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
		}
		.summary-dot {
			flex: 0 0 auto;
			width: 8px;
			height: 8px;
			margin-top: 5px;
			border-radius: 50%;
			background: var(--vscode-descriptionForeground);
		}
		.summary-title {
			font-weight: 600;
		}
		.summary-detail {
			margin-top: 2px;
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
			line-height: 1.45;
		}
		.summary.success .summary-dot {
			background: var(--vscode-testing-iconPassed, #73c991);
		}
		.summary.warning .summary-dot {
			background: var(--vscode-testing-iconQueued, #cca700);
		}
		.summary.error .summary-dot {
			background: var(--vscode-testing-iconFailed, var(--vscode-errorForeground));
		}
		form {
			display: grid;
			gap: 16px;
		}
		fieldset {
			margin: 0;
			padding: 0;
			border: 0;
			display: grid;
			gap: 12px;
		}
		.field {
			display: grid;
			gap: 6px;
		}
		.section {
			display: grid;
			gap: 12px;
		}
		[hidden] {
			display: none !important;
		}
		label {
			font-weight: 600;
		}
		.field-label {
			font-weight: 600;
		}
		input,
		select,
		textarea {
			box-sizing: border-box;
			width: 100%;
			color: var(--vscode-input-foreground);
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: 2px;
			padding: 6px 8px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}
		.source-options {
			display: flex;
			align-items: stretch;
			flex-wrap: wrap;
		}
		.source-option {
			position: relative;
			flex: 0 0 auto;
			font-weight: 400;
		}
		.source-option input {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: 0;
			padding: 0;
			border: 0;
			opacity: 0;
			background: transparent;
			pointer-events: none;
		}
		.source-option span {
			position: relative;
			display: flex;
			align-items: center;
			min-height: 26px;
			box-sizing: border-box;
			padding: 4px 10px;
			color: var(--vscode-radio-inactiveForeground, var(--vscode-foreground));
			background: var(--vscode-radio-inactiveBackground, var(--vscode-button-secondaryBackground));
			border: 1px solid var(--vscode-radio-inactiveBorder, var(--vscode-button-border, transparent));
			cursor: pointer;
			white-space: nowrap;
			user-select: none;
		}
		.source-option:first-child span {
			border-top-left-radius: 3px;
			border-bottom-left-radius: 3px;
		}
		.source-option:last-child span {
			border-top-right-radius: 3px;
			border-bottom-right-radius: 3px;
		}
		.source-option + .source-option span {
			margin-left: -1px;
		}
		.source-option input:checked + span {
			z-index: 1;
			color: var(--vscode-radio-activeForeground, var(--vscode-button-foreground));
			background: var(--vscode-radio-activeBackground, var(--vscode-button-background));
			border-color: var(--vscode-radio-activeBorder, var(--vscode-focusBorder));
		}
		.source-option input:focus + span {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: 1px;
		}
		.source-option input:not(:checked) + span:hover {
			background: var(--vscode-radio-inactiveHoverBackground, var(--vscode-toolbar-hoverBackground));
		}
		textarea {
			min-height: 120px;
			font-family: var(--vscode-editor-font-family, monospace);
			resize: vertical;
		}
		input:focus,
		select:focus,
		textarea:focus,
		button:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: 1px;
		}
		.hint {
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
			line-height: 1.45;
		}
		.hint-link {
			display: inline;
			margin: 0;
			padding: 0;
			border: 0;
			color: var(--vscode-textLink-foreground);
			background: transparent;
			font: inherit;
			text-decoration: underline;
			cursor: pointer;
		}
		.hint-link:hover {
			color: var(--vscode-textLink-activeForeground);
			background: transparent;
		}
		.actions {
			display: flex;
			gap: 8px;
			margin-top: 4px;
		}
		button {
			padding: 4px 14px;
			border: 1px solid var(--vscode-button-border, transparent);
			border-radius: 2px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			cursor: pointer;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		button.secondary {
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
		}
		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.status {
			margin-top: 8px;
			font-size: 13px;
			color: var(--vscode-descriptionForeground);
			line-height: 1.45;
		}
		.status.error {
			color: var(--vscode-errorForeground);
		}
		.status.success {
			color: var(--vscode-testing-iconPassed, #73c991);
		}
		.status-link {
			display: inline;
			margin: 0;
			padding: 0;
			border: 0;
			color: var(--vscode-textLink-foreground);
			background: transparent;
			font: inherit;
			text-decoration: underline;
			cursor: pointer;
		}
		.status-link:hover {
			color: var(--vscode-textLink-activeForeground);
		}
		.test-result {
			margin-top: 12px;
			border: 1px solid var(--vscode-panel-border, var(--vscode-input-border, transparent));
			border-radius: 2px;
			overflow: hidden;
		}
		.test-result-grid {
			display: grid;
			grid-template-columns: 200px 1fr;
			gap: 0;
		}
		.test-result-pane {
			padding: 10px;
		}
		.test-result-pane + .test-result-pane {
			border-left: 1px solid var(--vscode-panel-border, var(--vscode-input-border, transparent));
		}
		.test-result-label {
			font-weight: 600;
			margin-bottom: 6px;
			font-size: 12px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground);
		}
		.test-image {
			max-width: 100%;
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: 2px;
		}
		.test-response {
			margin: 0;
			white-space: pre-wrap;
			word-break: break-word;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 12px;
			line-height: 1.5;
			color: var(--vscode-foreground);
		}
	`;
}
