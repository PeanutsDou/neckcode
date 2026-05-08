import { ipcMain, BrowserWindow } from 'electron';
import { AgentRuntime, type Provider } from './agent/runtime';
import type { ToolRegistry } from './agent/runtime';
import { IPC } from '../shared/ipc-channels';

let agent: AgentRuntime | null = null;
let provider: Provider | null = null;
let currentAbortController: AbortController | null = null;

export function setupIpcHandlers(
  getProvider: () => Provider,
  getTools: () => ToolRegistry,
  getMaxTurns: () => number,
  getSystemPrompt: () => string,
) {
  function getWindow() {
    return BrowserWindow.getAllWindows()[0];
  }

  ipcMain.handle(IPC.AGENT_SEND_MESSAGE, async (_event, message: string) => {
    const p = getProvider();
    if (!p) throw new Error('No provider configured');

    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    // Create fresh agent for each turn (or could reuse)
    const tools = getTools();
    const newAgent = new AgentRuntime(
      p,
      tools,
      getMaxTurns(),
      getSystemPrompt(),
    );
    agent = newAgent;

    try {
      const result = await newAgent.runUserTurn(
        message,
        {
          onDelta(text) {
            getWindow()?.webContents.send(IPC.AGENT_DELTA, text);
          },
          onToolStart(toolCall) {
            getWindow()?.webContents.send(IPC.AGENT_TOOL_START, toolCall);
          },
          onToolResult(toolCall, result) {
            getWindow()?.webContents.send(IPC.AGENT_TOOL_RESULT, {
              name: toolCall.name,
              argumentsText: toolCall.argumentsText,
              result,
            });
          },
          onComplete(step) {
            getWindow()?.webContents.send(IPC.AGENT_TURN_DONE, step);
          },
          onError(error) {
            getWindow()?.webContents.send(IPC.AGENT_ERROR, error.message);
          },
        },
        currentAbortController.signal,
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'Aborted') {
        getWindow()?.webContents.send(IPC.AGENT_ERROR, msg);
      }
      return null;
    }
  });

  ipcMain.handle(IPC.AGENT_ABORT, () => {
    currentAbortController?.abort();
    currentAbortController = null;
  });

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return {
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
      workspaceRoot: process.cwd(),
    };
  });
}
