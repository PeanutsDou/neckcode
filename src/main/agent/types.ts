export interface ToolCall {
  id: string;
  name: string;
  argumentsText: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface RunStepResult {
  text: string;
  reasoningContent?: string;
  toolCalls: ToolCall[];
}

export interface AgentCallbacks {
  onDelta?: (text: string) => void;
  onToolStart?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCall: ToolCall, result: string) => void;
  onComplete?: (result: RunStepResult) => void;
  onError?: (error: Error) => void;
}
