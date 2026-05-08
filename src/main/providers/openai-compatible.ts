import { randomUUID } from 'crypto';
import type { Provider } from '../agent/runtime';
import type { Message, ToolCall } from '../agent/types';

export interface OpenAIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

function toApiMessages(messages: Message[]): unknown[] {
  return messages.map(msg => {
    if (msg.role === 'assistant') {
      const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
      const entry: Record<string, unknown> = {
        role: 'assistant',
        content: msg.content || '',
      };
      // DeepSeek thinking models require reasoning_content to be passed back
      if (msg.reasoningContent) {
        entry.reasoning_content = msg.reasoningContent;
      }
      if (hasToolCalls) {
        entry.tool_calls = msg.toolCalls!.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.argumentsText },
        }));
      }
      return entry;
    }

    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: msg.content,
      };
    }

    return { role: msg.role, content: msg.content };
  });
}

export function createOpenAIProvider(config: OpenAIConfig): Provider {
  // Detect if current model supports vision
  const VISION_PATTERNS = ['gpt-4', 'vision', 'vl', 'gemini', 'qwen'];
  const supportsVision = VISION_PATTERNS.some(k => (config.model || '').toLowerCase().includes(k));

  return {
    async runStep({ messages, tools, model, onDelta, signal }) {
      const actualModel = model === 'default' ? config.model : model;

      // Handle images for messages
      const processed = messages.map(msg => {
        if (msg.role === 'user' && msg.attachments?.length) {
          if (supportsVision) {
            const content: Record<string, unknown>[] = [
              { type: 'text', text: msg.content },
            ];
            for (const att of msg.attachments) {
              if (att.type === 'image') {
                content.push({
                  type: 'image_url',
                  image_url: { url: att.data, detail: 'auto' },
                });
              }
            }
            return { role: 'user', content };
          }
          // Non-vision model: describe images in text
          const note = msg.attachments
            .filter(a => a.type === 'image')
            .map((_, i) => `[Image ${i + 1} attached — current model does not support vision]`)
            .join('\n');
          return { role: 'user', content: msg.content ? `${msg.content}\n${note}` : note };
        }
        return msg;
      });

      const apiMessages = toApiMessages(processed as Message[]);

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: actualModel,
          messages: apiMessages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          stream: config.stream !== false,
          temperature: config.temperature ?? 0,
          max_tokens: config.maxTokens ?? 4096,
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API error ${response.status}: ${errText}`);
      }

      const toolCallsByIndex = new Map<number, ToolCall>();
      let text = '';
      let reasoningContent = '';

      if (!response.body) {
        const json = (await response.json()) as Record<string, unknown>;
        const message = (json?.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown> ?? {};
        text = typeof message.content === 'string' ? message.content : '';
        reasoningContent = typeof message.reasoning_content === 'string' ? message.reasoning_content : '';
        if (text) onDelta?.(text);

        if (Array.isArray(message.tool_calls)) {
          for (const tc of message.tool_calls as Array<Record<string, unknown>>) {
            toolCallsByIndex.set(toolCallsByIndex.size, {
              id: (tc.id as string) || randomUUID(),
              name: ((tc.function as Record<string, unknown>)?.name as string) || '',
              argumentsText: ((tc.function as Record<string, unknown>)?.arguments as string) || '{}',
            });
          }
        }

        return {
          text,
          reasoningContent: reasoningContent || undefined,
          toolCalls: [...toolCallsByIndex.values()].filter(tc => tc.name),
        };
      }

      // Streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') break;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          const delta = (parsed?.choices as Array<Record<string, unknown>>)?.[0]?.delta as Record<string, unknown>;
          if (!delta) continue;

          const chunk = typeof delta.content === 'string' ? delta.content : '';
          if (chunk) {
            text += chunk;
            onDelta?.(chunk);
          }

          // Capture reasoning_content for DeepSeek thinking models
          const rc = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
          if (rc) {
            reasoningContent += rc;
          }

          const toolCallsDelta = delta.tool_calls as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(toolCallsDelta)) {
            for (const tcd of toolCallsDelta) {
              const index = typeof tcd.index === 'number' ? tcd.index : 0;
              const current = toolCallsByIndex.get(index) || { id: '', name: '', argumentsText: '' };

              if (typeof tcd.id === 'string') current.id = tcd.id;
              if (typeof (tcd.function as Record<string, unknown>)?.name === 'string') {
                current.name = (tcd.function as Record<string, unknown>).name as string;
              }
              if (typeof (tcd.function as Record<string, unknown>)?.arguments === 'string') {
                current.argumentsText += (tcd.function as Record<string, unknown>).arguments as string;
              }

              toolCallsByIndex.set(index, current);
            }
          }
        }
      }

      const toolCalls = [...toolCallsByIndex.values()]
        .map(tc => ({ id: tc.id || randomUUID(), name: tc.name, argumentsText: tc.argumentsText || '{}' }))
        .filter(tc => tc.name);

      return { text, reasoningContent: reasoningContent || undefined, toolCalls };
    },
  };
}
