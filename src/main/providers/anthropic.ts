import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { Provider } from '../agent/runtime';
import type { Message, ProviderUsage, ToolCall } from '../agent/types';

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
      if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        const blocks = msg.content
          ? [{ type: 'text', text: msg.content }]
          : [];
        for (const att of msg.attachments) {
          if (att.type === 'image') {
            // Extract base64 data and media type from data URI
            const match = att.data.match(/^data:([^;]+);base64,(.+)$/);
            const mediaType = match ? match[1] : 'image/png';
            const base64data = match ? match[2] : att.data;
            (blocks as Record<string, unknown>[]).push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64data,
              },
            });
          }
        }
        result.push({ role: 'user', content: blocks as unknown as Anthropic.ContentBlock[] });
      } else {
        result.push({ role: 'user', content: msg.content });
      }
    }
  }

  return result;
}

export function buildAnthropicSystemPrompt(messages: Message[]): string | undefined {
  const parts = messages
    .filter(msg => msg.role === 'system' && msg.content.trim().length > 0)
    .map(msg => msg.content.trim());
  return parts.length > 0 ? parts.join('\n\n') : undefined;
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

function parseUsage(usage: unknown): ProviderUsage | undefined {
  const u = usage as Record<string, unknown> | undefined;
  if (!u || typeof u.input_tokens !== 'number') return undefined;
  return {
    inputTokens: u.input_tokens as number,
    outputTokens: (u.output_tokens as number | undefined) ?? 0,
    cacheCreationInputTokens: u.cache_creation_input_tokens as number | undefined,
    cacheReadInputTokens: u.cache_read_input_tokens as number | undefined,
  };
}

export function createAnthropicProvider(config: AnthropicConfig): Provider {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    async runStep({ messages, tools, model, onDelta, onReasoning, signal }) {
      const actualModel = model === 'default' ? config.model : model;

      // Anthropic has a single top-level system field, so preserve both the
      // base prompt and any compacted context summaries by joining all system
      // messages instead of dropping everything after the first one.
      const systemPrompt = buildAnthropicSystemPrompt(messages);

      const apiMessages = toAnthropicMessages(messages);
      const apiTools = tools.length > 0 ? toAnthropicTools(tools) : undefined;

      const stream = client.messages.stream({
        model: actualModel,
        max_tokens: config.maxTokens || 16384,
        system: systemPrompt || undefined,
        messages: apiMessages,
        tools: apiTools,
      }, { signal });

      const toolCallsByIndex = new Map<number, ToolCall>();
      let text = '';
      let reasoningContent = '';
      let usage: ProviderUsage | undefined;

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
        onReasoning?.(chunk);
      });

      try {
        const result = await stream.finalMessage();
        usage = parseUsage(result.usage);
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

      return { text, reasoningContent: reasoningContent || undefined, toolCalls, usage };
    },
  };
}
