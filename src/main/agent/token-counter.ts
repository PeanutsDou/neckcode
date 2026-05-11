import { encode } from 'gpt-tokenizer';
import type { Message } from './types';

const IMAGE_TOKEN_BUDGET = 1024;
const MESSAGE_OVERHEAD_TOKENS = 4;

function fallbackEstimate(text: string): number {
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x3000 && code <= 0x303F) ||
      (code >= 0xFF00 && code <= 0xFFEF) ||
      (code >= 0xAC00 && code <= 0xD7AF) ||
      code > 127
    ) {
      cjk++;
    } else {
      ascii++;
    }
  }
  return Math.ceil(cjk * 1.1 + ascii * 0.5);
}

export function countTextTokens(text: string): number {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch {
    return fallbackEstimate(text);
  }
}

function serializedMessagePayload(message: Message): string {
  const payload: Record<string, unknown> = {
    role: message.role,
    content: message.content || '',
  };

  if (message.reasoningContent) {
    payload.reasoning_content = message.reasoningContent;
  }

  if (message.toolCallId) {
    payload.tool_call_id = message.toolCallId;
  }

  if (message.toolCalls?.length) {
    payload.tool_calls = message.toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments: tc.argumentsText,
      },
    }));
  }

  return JSON.stringify(payload);
}

export function estimateMessageTokens(messages: Message[]): number {
  let total = 0;
  for (const message of messages) {
    total += MESSAGE_OVERHEAD_TOKENS;
    total += countTextTokens(serializedMessagePayload(message));
    if (message.attachments?.length) {
      total += message.attachments.length * IMAGE_TOKEN_BUDGET;
    }
  }
  return total;
}
