/**
 * Shared types for the MiMo Copilot extension.
 */

// ---- API request/response types ----

export type MiMoContentPart =
	| { type: 'text'; text: string }
	| {
			type: 'image_url';
			image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
	  };

export interface MiMoMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | MiMoContentPart[];
	tool_call_id?: string;
	tool_calls?: MiMoToolCall[];
	reasoning_content?: string;
}

export interface MiMoToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface MiMoTool {
	type: 'function';
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	};
}

export interface MiMoRequest {
	model: string;
	messages: MiMoMessage[];
	stream: boolean;
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	tools?: MiMoTool[];
	tool_choice?: 'none' | 'auto' | 'required';
	stream_options?: {
		include_usage: boolean;
	};
}

export interface MiMoStreamChunk {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		delta: {
			role?: string;
			content?: string;
			reasoning_content?: string;
			tool_calls?: Array<{
				index: number;
				id?: string;
				type?: string;
				function?: {
					name?: string;
					arguments?: string;
				};
			}>;
		};
		finish_reason: string | null;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		completion_tokens_details?: {
			reasoning_tokens: number;
		};
		prompt_tokens_details?: {
			cached_tokens: number;
		};
	};
}

// ---- Stream callbacks ----

export interface StreamCallbacks {
	onContent: (content: string) => void;
	onThinking: (text: string) => void;
	onToolCall: (toolCall: MiMoToolCall) => void;
	onError: (error: Error) => void;
	onDone: () => void;
	onUsage?: (usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		completion_tokens_details?: {
			reasoning_tokens: number;
		};
		prompt_tokens_details?: {
			cached_tokens: number;
		};
	}) => void;
}

// ---- Model definitions ----

export interface ModelDefinition {
	id: string;
	name: string;
	family: string;
	version: string;
	detail: string;
	maxInputTokens: number;
	maxOutputTokens: number;
	capabilities: {
		toolCalling: boolean;
		imageInput: boolean;
		thinking: boolean;
	};
	requiresThinkingParam: boolean;
}
