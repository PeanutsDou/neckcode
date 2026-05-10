import type { ChatEntry } from '../stores/chat-store';

export function estimateTokens(text: string): number {
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
  return Math.round(cjk * 0.7 + ascii * 0.25);
}

export function estimateCurrentRunTokens(
  entries: ChatEntry[],
  streamingText: string,
  thinkingText: string,
): { input: number; output: number } {
  let start = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].role === 'user') {
      start = i;
      break;
    }
  }
  const inputEntries = start >= 0 ? entries.slice(start, start + 1) : [];
  const outputEntries = start >= 0 ? entries.slice(start + 1) : [];
  let inputText = '';
  let outputText = '';
  for (const entry of inputEntries) {
    inputText += entry.content;
    inputText += entry.toolArgs || '';
    inputText += entry.toolResult || '';
  }
  for (const entry of outputEntries) {
    if (entry.role === 'assistant') outputText += entry.content;
    if (entry.role === 'tool') {
      outputText += entry.toolArgs || '';
      outputText += entry.toolResult || entry.content || '';
    }
  }
  outputText += streamingText;
  outputText += thinkingText;
  return { input: estimateTokens(inputText), output: estimateTokens(outputText) };
}

export function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function fmtTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
