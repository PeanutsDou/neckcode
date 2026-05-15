import { AgentRuntime } from '../agent/runtime';
import { createToolRegistry } from './registry';
import { getConfig } from '../config';
import { getLoadedSkills, renderSkillForInvocation } from '../skills/loader';
import type { Provider, ToolRegistry } from '../agent/runtime';
import type { Attachment } from '../agent/types';
import type { AgentConfig } from '../../shared/types';

/**
 * Build system prompt for a sub-agent by injecting skill contents.
 */
function buildSubAgentPrompt(agent: AgentConfig): string {
  const parts = [agent.memory];

  if (agent.skills.length > 0) {
    parts.push('\n## 可用技能');
    parts.push('');
    for (const skillName of agent.skills) {
      const skill = getLoadedSkills().find(s => s.name === skillName);
      if (skill) {
        parts.push(renderSkillForInvocation(skill));
        parts.push('');
      }
    }
  }

  parts.push('\n---');
  parts.push('你是主 Agent 调度的子 Agent。完成分配的任务后直接返回结果文本。');
  parts.push('不需要向用户询问问题，不需要等待确认。所有操作直接执行。');

  return parts.join('\n');
}

/**
 * Execute a sub-agent for a given task and return the final text result
 * with debug log of all tool calls.
 */
async function runSubAgent(
  agent: AgentConfig,
  task: string,
  attachments: Attachment[],
  createProvider: (modelId?: string) => Provider,
  signal?: AbortSignal,
): Promise<string> {
  const cfg = getConfig();
  const systemPrompt = buildSubAgentPrompt(agent);

  // Create provider for the sub-agent's model
  const provider = createProvider(agent.model);

  // Create tool registry for sub-agent: full access, no confirm dialogs, no ask
  const tools = createToolRegistry(
    cfg.agent.workspaceRoot,
    async () => true, // Auto-approve all confirms
    async () => { throw new Error('Sub-agent cannot ask questions'); },
    () => 'fullAccess',
  );

  // Tool call log
  const toolLog: Array<{ name: string; args: string; result: string }> = [];

  const runtime = new AgentRuntime(
    provider,
    tools,
    50, // maxTurns for sub-agent
    systemPrompt,
    {
      contextLimit: cfg.agent.contextLimit || 128_000,
      maxTokens: cfg.agent.maxTokens || 16_384,
    },
  );

  const result = await runtime.runUserTurn(
    task,
    attachments,
    {
      onToolStart(tc) {
        toolLog.push({ name: tc.name, args: tc.argumentsText, result: '' });
      },
      onToolResult(tc, toolResult) {
        const entry = toolLog.find(e => e.name === tc.name && e.args === tc.argumentsText && !e.result);
        if (entry) {
          entry.result = toolResult.length > 2000
            ? toolResult.slice(0, 2000) + `\n...[truncated ${toolResult.length - 2000} chars]`
            : toolResult;
        }
      },
      onError(error) {
        toolLog.push({ name: 'ERROR', args: '', result: error instanceof Error ? error.message : String(error) });
      },
    },
    signal,
  );

  // Format debug log
  const logParts: string[] = [];
  logParts.push(`## 🛠️ 子 Agent「${agent.name}」执行日志`);
  logParts.push('');
  logParts.push(`**模型**: ${agent.model} | **工具调用**: ${toolLog.length} 次`);
  logParts.push('');

  if (toolLog.length > 0) {
    logParts.push('| # | 工具 | 参数 | 结果摘要 |');
    logParts.push('|---|------|------|----------|');
    toolLog.forEach((entry, i) => {
      const shortArgs = entry.args.length > 60 ? entry.args.slice(0, 60) + '...' : entry.args;
      const shortResult = entry.result.length > 80
        ? entry.result.replace(/\n/g, ' ').slice(0, 80) + '...'
        : entry.result.replace(/\n/g, ' ');
      logParts.push(`| ${i + 1} | \`${entry.name}\` | ${shortArgs} | ${shortResult} |`);
    });
    logParts.push('');
  }

  logParts.push('### 📤 执行结果');
  logParts.push('');
  logParts.push(result.text);

  return logParts.join('\n');
}

/**
 * Factory for the invoke_agent tool handler.
 */
export function createInvokeAgentHandler(
  getAgents: () => AgentConfig[],
  createProvider: (modelId?: string) => Provider,
) {
  return async (
    args: Record<string, unknown>,
    context?: { userMessage?: string; attachments?: Attachment[] } | null,
  ): Promise<string> => {
    const agentNameOrId = String(args.agent || '').trim();
    const task = String(args.task || '').trim();

    if (!agentNameOrId) return 'ERROR: "agent" parameter is required.';
    if (!task) return 'ERROR: "task" parameter is required.';

    const agents = getAgents();
    const agent = agents.find(a => a.id === agentNameOrId || a.name === agentNameOrId);
    if (!agent) {
      const available = agents.map(a => `${a.name} (${a.id})`).join(', ');
      return `ERROR: Agent "${agentNameOrId}" not found. Available agents: ${available || '(none configured)'}`;
    }

    if (!agent.model) {
      return `ERROR: Agent "${agent.name}" has no model configured.`;
    }

    try {
      const attachments = Array.isArray(context?.attachments)
        ? context.attachments.filter(att => att?.type === 'image' && typeof att.data === 'string' && typeof att.mimeType === 'string')
        : [];
      const parentUserMessage = typeof context?.userMessage === 'string' ? context.userMessage.trim() : '';
      const effectiveTask = parentUserMessage && parentUserMessage !== task
        ? `${task}\n\n[Parent user message for context]\n${parentUserMessage}`
        : task;
      const result = await runSubAgent(agent, effectiveTask, attachments, createProvider);
      return result;
    } catch (err) {
      return `ERROR: Sub-agent "${agent.name}" failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
}
