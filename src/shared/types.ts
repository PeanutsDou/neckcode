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
