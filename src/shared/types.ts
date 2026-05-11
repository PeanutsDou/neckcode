// --- Messages ---

export interface ToolCall {
  id: string;
  name: string;
  argumentsText: string;
}

export interface AssistantStep {
  text: string;
  toolCalls: ToolCall[];
}

export interface Attachment {
  type: 'image';
  mimeType: string;
  data: string; // base64
  filename?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  seq: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  attachments?: Attachment[];
  createdAt: number;
}

// --- Sessions ---

export interface Session {
  id: string;
  title: string;
  projectPath: string;
  providerId: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
}

// --- Providers ---

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  models: string[];
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

// --- Runtime Observability ---

export type RunPhase =
  | 'idle'
  | 'starting'
  | 'requesting_model'
  | 'thinking'
  | 'streaming'
  | 'tool_running'
  | 'waiting_user'
  | 'finishing'
  | 'aborted'
  | 'error';

export interface RunState {
  phase: RunPhase;
  startedAt: number | null;
  lastEventAt: number | null;
  currentTool?: string | null;
  lastTool?: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedTokens: number;
  contextLimit: number;
  compacted?: boolean;
  errorCode?: AgentErrorCode | null;
}

export type AgentErrorCode =
  | 'auth_error'
  | 'network_error'
  | 'rate_limited'
  | 'model_not_found'
  | 'context_limit'
  | 'tool_error'
  | 'permission_denied'
  | 'aborted'
  | 'unknown';

export interface AgentError {
  code: AgentErrorCode;
  message: string;
  suggestion: string;
  retryable: boolean;
  providerId?: string;
  model?: string;
  raw?: string;
}

export interface RunStatusEvent extends Partial<RunState> {
  phase: RunPhase;
}

// --- Permission / Confirmation ---

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ConfirmRequest {
  toolName: string;
  riskLevel: RiskLevel;
  summary: string;
  cwd?: string;
  command?: string;
  paths?: string[];
  warnings?: string[];
  rawArgs?: Record<string, unknown>;
}

// --- Provider Diagnostics ---

export interface ProviderTestConfig {
  providerId?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
}

export type ProviderTestStatus = 'pass' | 'warn' | 'fail';

export interface ProviderTestCheck {
  id: string;
  label: string;
  status: ProviderTestStatus;
  message: string;
}

export interface ProviderTestResult {
  status: ProviderTestStatus;
  summary: string;
  checks: ProviderTestCheck[];
  suggestion?: string;
  balance?: {
    total: string;
    toppedUp?: string;
    granted?: string;
    currency: string;
  };
}
