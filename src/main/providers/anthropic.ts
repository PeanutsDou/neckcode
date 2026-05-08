import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { Provider } from '../agent/runtime';
import type { Message, ToolCall } from '../agent/types';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue; // System handled separately

    if (msg.role === 'assistant') {
      const content: Record<string, unknown>[] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.argumentsText); } catch { /* use empty */ }
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: args });
        }
      }
      result.push({ role: 'assistant', content: content as unknown as Anthropic.ContentBlock[] });
    } else if (msg.role === 'tool') {
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.toolCallId || '',
          content: msg.content,
        }] as unknown as Anthropic.ContentBlock[],
      });
    } else if (msg.role === 'user') {
      result.push({
        role: 'user',
        content: msg.content,
      });
    }
  }

  return result;
}

function toAnthropicTools(tools: { type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: {
      type: 'object',
      properties: (t.function.parameters.properties || {}) as Record<string, unknown>,
      required: (t.function.parameters.required as string[]) || [],
    },
  }));
}

export function createAnthropicProvider(config: AnthropicConfig): Provider {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    async runStep({ messages, tools, model, onDelta, signal }) {
      const actualModel = model === 'default' ? config.model : model;

      // Extract system prompt
      const systemMsg = messages.find(m => m.role === 'system');
      const systemPrompt = systemMsg?.content;

      const apiMessages = toAnthropicMessages(messages);
      const apiTools = tools.length > 0 ? toAnthropicTools(tools) : undefined;

      const stream = client.messages.stream({
        model: actualModel,
        max_tokens: config.maxTokens || 4096,
        system: systemPrompt || undefined,
        messages: apiMessages,
        tools: apiTools,
      }, { signal });

      const toolCallsByIndex = new Map<number, ToolCall>();
      let text = '';
      let reasoningContent = '';

      stream.on('text', (chunk) => {
        text += chunk;
        onDelta?.(chunk);
      });

      // Collect tool use blocks
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') {
          const idx = toolCallsByIndex.size;
          toolCallsByIndex.set(idx, {
            id: block.id || randomUUID(),
            name: block.name,
            argumentsText: JSON.stringify(block.input),
          });
        }
      });

      // Handle thinking/reasoning
      stream.on('thinking', (chunk) => {
        reasoningContent += chunk;
      });

      try {
        const result = await stream.finalMessage();
        // Process any content blocks for tool calls
        for (const block of result.content) {
          if (block.type === 'tool_use') {
            const exists = [...toolCallsByIndex.values()].some(tc => tc.id === block.id);
            if (!exists) {
              toolCallsByIndex.set(toolCallsByIndex.size, {
                id: block.id,
                name: block.name,
                argumentsText: JSON.stringify(block.input),
              });
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Anthropic API error: ${msg}`);
      }

      const toolCalls = [...toolCallsByIndex.values()].filter(tc => tc.name);

      return { text, reasoningContent: reasoningContent || undefined, toolCalls };
    },
  };
}
