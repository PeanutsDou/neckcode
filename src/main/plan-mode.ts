/**
 * Plan Mode — toggles read-only planning state + exposes EnterPlanMode / ExitPlanMode tools.
 * When plan mode is active, the tool registry filters out write tools.
 * Adapted from Claude Code's EnterPlanModeTool / ExitPlanModeV2Tool.
 */

import type { ToolDefinition } from './agent/types';

let _planMode = false;

export function isPlanMode(): boolean {
  return _planMode;
}

export function enterPlanMode(): void {
  _planMode = true;
}

export function exitPlanMode(): void {
  _planMode = false;
}

// ── Tool definitions exposed to the model ──

export const PLAN_MODE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'enter_plan_mode',
      description: 'Enter plan mode — the agent will switch to read-only mode and create a detailed plan before making any changes. All write/edit/delete/run_shell tools will be disabled.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'exit_plan_mode',
      description: 'Exit plan mode — restore all write/edit/delete/run_shell tools so the agent can execute the plan.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    readOnly: true,
  },
];

// ── Tool handlers ──

export const planModeHandlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  async enter_plan_mode(_args) {
    enterPlanMode();
    return 'Plan mode enabled. All write/edit/delete/run_shell tools are now disabled. Use read-only tools to investigate and create a plan. Use exit_plan_mode when ready to execute.';
  },
  async exit_plan_mode(_args) {
    exitPlanMode();
    return 'Plan mode disabled. All tools are now available. You can now execute the plan.';
  },
};

// ── Tool filtering ──

const WRITE_TOOLS = new Set([
  'write_file', 'edit_file', 'delete_file', 'run_shell',
  'notebook_edit', 'enter_plan_mode', 'exit_plan_mode',
]);

export function filterPlanModeTools(tools: ToolDefinition[]): ToolDefinition[] {
  if (!_planMode) return tools;
  return tools.filter(t => {
    // Always allow read-only
    if (t.readOnly && !WRITE_TOOLS.has(t.function.name)) return true;
    // In plan mode, allow task management (planning)
    if (['task_create', 'task_get', 'task_list', 'task_update', 'ask_user_question', 'list_skills', 'invoke_skill', 'invoke_agent'].includes(t.function.name)) return true;
    // Block everything else
    return false;
  });
}
