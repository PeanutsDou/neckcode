import { useEffect } from 'react';
import { useChatStore } from '../stores/chat-store';

export function useIpcListeners() {
  const store = useChatStore;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(api.onDelta((sid, text) => {
      store.getState().appendDeltaTo(sid, text);
    }));
    unsubs.push(api.onThinkingDelta((sid, text) => {
      store.getState().appendThinkingDeltaTo(sid, text);
    }));
    unsubs.push(api.onRunStatus((sid, status: any) => {
      store.getState().setRunStatusTo(sid, status);
    }));
    unsubs.push(api.onToolStart((sid, data: any) => {
      store.getState().addEntryTo(sid, {
        id: data.id || `tool_${Date.now()}`,
        role: 'tool',
        content: '',
        toolCallId: data.id,
        toolName: data.name,
        toolArgs: data.argumentsText,
        timestamp: Date.now(),
      });
    }));
    unsubs.push(api.onToolResult((sid, data: any) => {
      const state = store.getState();
      const ses = state.sessions[sid];
      if (ses) {
        const entries = [...ses.entries];
        for (let i = entries.length - 1; i >= 0; i--) {
          const idMatches = data.toolCallId && entries[i].toolCallId === data.toolCallId;
          const fallbackMatches = !data.toolCallId && entries[i].toolName === data.name && !entries[i].toolResult;
          if (entries[i].role === 'tool' && (idMatches || fallbackMatches)) {
            entries[i] = { ...entries[i], content: data.result, toolResult: data.result };
            break;
          }
        }
        store.setState({ sessions: { ...state.sessions, [sid]: { ...ses, entries } } });
      }
    }));
    unsubs.push(api.onTurnDone((sid, data: any) => {
      store.getState().finishStreamTo(sid, data.text);
    }));
    unsubs.push(api.onError((sid, err) => {
      store.getState().setErrorTo(sid, err as any);
    }));

    return () => { unsubs.forEach(fn => fn()); };
  }, []);
}
