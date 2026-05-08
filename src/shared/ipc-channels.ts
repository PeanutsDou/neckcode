export const IPC = {
  // Agent -> UI (main to renderer)
  AGENT_DELTA: 'agent:delta',
  AGENT_TOOL_START: 'agent:tool-start',
  AGENT_TOOL_RESULT: 'agent:tool-result',
  AGENT_TURN_DONE: 'agent:turn-done',
  AGENT_ERROR: 'agent:error',

  // UI -> Agent (renderer to main, invoke)
  AGENT_SEND_MESSAGE: 'agent:send-message',
  AGENT_ABORT: 'agent:abort',

  // Session
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_DELETE: 'session:delete',
  SESSION_LOAD: 'session:load',

  // Provider/Config
  CONFIG_GET: 'config:get',
  PROVIDER_LIST: 'provider:list',
} as const;
