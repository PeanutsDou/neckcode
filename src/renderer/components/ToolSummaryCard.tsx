import React, { useState } from 'react';

interface ToolSummaryItem {
  name: string;
  argumentsText: string;
  resultPreview: string;
}

interface Props {
  summary: string;
  tools: ToolSummaryItem[];
}

const TOOL_LABELS: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  list_dir: 'List',
  delete_file: 'Delete',
  run_shell: 'Shell',
  glob: 'Glob',
  grep: 'Grep',
  web_fetch: 'Fetch',
  web_search: 'Search',
  everything_search: 'Everything',
  task_create: 'Task +',
  task_get: 'Task',
  task_list: 'Tasks',
  task_update: 'Task',
  notebook_edit: 'Notebook',
  list_skills: 'Skills',
  invoke_skill: 'Skill',
  invoke_agent: 'Agent',
  enter_plan_mode: 'Plan',
  exit_plan_mode: 'Plan',
  lsp: 'LSP',
  lsp_diagnostics: 'Diagnostics',
  lsp_definition: 'Def',
  lsp_references: 'Refs',
  ask_user_question: 'Ask',
  mcp__: 'MCP',
};

function labelFor(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  if (name.startsWith('mcp__')) return 'MCP';
  return name;
}

function shortArgs(args: string, maxLen = 60): string {
  if (!args) return '';
  try {
    const obj = JSON.parse(args);
    const parts = Object.entries(obj)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v)}`)
      .join('  ');
    return parts.slice(0, maxLen);
  } catch {
    return args.slice(0, maxLen);
  }
}

function SubToolRow({ tool }: { tool: ToolSummaryItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="tsub-row">
      <div className="tsub-head" onClick={() => setOpen(!open)}>
        <span className="tsub-arrow">{open ? '▾' : '▸'}</span>
        <span className="tsub-label">{labelFor(tool.name)}</span>
        <span className="tsub-args">{shortArgs(tool.argumentsText)}</span>
      </div>
      {open && tool.resultPreview && (
        <pre className="tsub-result">{tool.resultPreview}</pre>
      )}
    </div>
  );
}

export function ToolSummaryCard({ summary, tools }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!tools || tools.length === 0) {
    return <div className="tsum-text">{summary}</div>;
  }

  const names = new Map<string, number>();
  for (const t of tools) names.set(t.name, (names.get(t.name) || 0) + 1);
  const summaryLine = Array.from(names.entries())
    .map(([n, c]) => (c > 1 ? `${labelFor(n)} x${c}` : labelFor(n)))
    .join('  ');

  return (
    <div className="tsum-group">
      <div className="tsum-header" onClick={() => setExpanded(!expanded)}>
        <span className="tsum-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="tsum-summary">{summaryLine}</span>
        <span className="tsum-count">{tools.length} tools</span>
      </div>
      {expanded && (
        <div className="tsum-list">
          {tools.map((tool, i) => (
            <SubToolRow key={i} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
