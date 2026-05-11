import { useEffect } from 'react';
import { useChatStore, type ChatEntry } from '../stores/chat-store';
import { estimateCurrentRunTokens, fmtTokens, fmtTime } from '../utils/tokens';
import type { RunState, RunPhase } from '../../shared/types';

const phaseLabels: Record<RunPhase, string> = {
  idle: '',
  starting: '正在启动',
  requesting_model: '正在请求模型',
  analyzing_image: '正在解析图片',
  thinking: '正在思考',
  streaming: '正在输出',
  tool_running: '正在执行工具',
  waiting_user: '等待确认',
  finishing: '正在收尾',
  aborted: '已中断',
  error: '出错',
};

export function useStreamMetric(
  entries: ChatEntry[],
  streamingText: string,
  thinkingText: string,
  isStreaming: boolean,
  runState: RunState,
  elapsed: number,
) {
  const tokens = isStreaming
    ? estimateCurrentRunTokens(entries, streamingText, thinkingText)
    : { input: runState.inputTokens, output: runState.outputTokens };

  useEffect(() => {
    if (!isStreaming) return;
    const id = useChatStore.getState().activeId;
    if (id) useChatStore.getState().setRunTokensTo(id, tokens.input, tokens.output);
  }, [isStreaming, tokens.input, tokens.output]);

  const toolLabel = runState.currentTool ? ` ${runState.currentTool}` : '';
  const phaseLabel = runState.compacting ? '正在压缩上下文' : phaseLabels[runState.phase] || '';
  return `${fmtTime(elapsed)} · ↑ ${fmtTokens(tokens.input)} ↓ ${fmtTokens(tokens.output)} tokens${phaseLabel ? ` · ${phaseLabel}${toolLabel}` : ''}`;
}
