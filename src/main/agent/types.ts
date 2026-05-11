export interface ToolCall {
  id: string;
  name: string;
  argumentsText: string;
}

export interface Attachment {
  type: 'image';
  data: string;    // base64 data URI
  mimeType: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  attachments?: Attachment[];
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
  readOnly?: boolean;
}

export interface RunStepResult {
  text: string;
  reasoningContent?: string;
  toolCalls: ToolCall[];
  usage?: ProviderUsage;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface ContextStatus {
  currentTokens: number;
  estimatedTokens: number;
  contextLimit: number;
  effectiveWindow: number;
  reservedOutputTokens: number;
  autoCompactThreshold: number;
  autoCompactBufferTokens: number;
  blockingThreshold: number;
  freeTokens: number;
  percentUsed: number;
  willAutoCompact: boolean;
  source: 'usage' | 'estimate';
  compacting: boolean;
  compacted?: boolean;
  lastCompactAt?: number | null;
  compactCount?: number;
  compactError?: string | null;
  consecutiveCompactFailures?: number;
}

export interface AgentCallbacks {
  onModelRequest?: () => void;
  onContextUpdate?: (status: ContextStatus) => void;
  onDelta?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolStart?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCall: ToolCall, result: string) => void;
  onComplete?: (result: RunStepResult) => void;
  onError?: (error: Error) => void;
}
