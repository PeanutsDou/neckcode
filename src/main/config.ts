import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { encrypt, decrypt } from './config/secrets';
import type { PermissionMode } from '../shared/permissions';
import type { AgentConfig } from '../shared/types';

export type ModelMode = 'text' | 'multimodal';

export interface ModelConfig {
  name: string;
  contextLimit?: number;
  maxTokens?: number;
  mode?: ModelMode;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
}

export interface AppConfigData {
  providers: ProviderConfig[];
  activeProvider: string;
  activeModel: string;
  agent: {
    maxTurns: number;
    maxTokens: number;       // fallback max output tokens
    contextLimit: number;    // fallback context window
    workspaceRoot: string;
  };
  systemPrompt: string;
  permissionMode: PermissionMode;
  theme?: 'light' | 'dark';
  lightScheme?: string;
  closeBehavior?: 'ask' | 'tray' | 'quit';
  fontScale?: number;
  codeLeftWidth?: number;
  window?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  agents: AgentConfig[];
}

const CONFIG_DIR = join(homedir(), '.deepseekcode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: [
      { name: 'deepseek-v4-pro', contextLimit: 1000000, maxTokens: 32768, mode: 'text' },
      { name: 'deepseek-v4-flash', contextLimit: 1000000, maxTokens: 16384, mode: 'text' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    models: [
      { name: 'claude-sonnet-4-6', contextLimit: 200000, maxTokens: 32768, mode: 'multimodal' },
      { name: 'claude-haiku-4-5', contextLimit: 200000, maxTokens: 16384, mode: 'multimodal' },
    ],
  },
];

const defaultConfig: AppConfigData = {
  providers: DEFAULT_PROVIDERS,
  activeProvider: 'deepseek',
  activeModel: 'deepseek-v4-pro',
  agent: {
    maxTurns: 100,
    maxTokens: 32768,
    contextLimit: 0,
    workspaceRoot: homedir(),
  },
  systemPrompt: 'You are a helpful coding assistant. Use tools when needed. Be concise and factual.',
  permissionMode: 'default',
  theme: 'light',
  lightScheme: 'default',
  agents: [],
};

let config: AppConfigData = { ...defaultConfig };

function normalizePermissionMode(value: unknown): PermissionMode {
  return value === 'fullAccess' ? 'fullAccess' : 'default';
}

function normalizeAgents(raw: unknown): AgentConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a: unknown): a is AgentConfig =>
    typeof a === 'object' && a !== null &&
    typeof (a as Record<string,unknown>).id === 'string' &&
    typeof (a as Record<string,unknown>).name === 'string'
  );
}

export function inferModelMode(modelName: string): ModelMode {
  const name = modelName.toLowerCase();
  const multimodalPatterns = [
    'vision',
    'multimodal',
    'omni',
    'gpt-4o',
    'gpt-4.1',
    'gpt-5',
    'gemini',
    'qwen-vl',
    'qwen2-vl',
    'qwen2.5-vl',
    'qwen-omni',
    'vl',
    'claude-3',
    'claude-sonnet-4',
    'claude-haiku-4',
    'claude-opus-4',
  ];
  return multimodalPatterns.some(pattern => name.includes(pattern)) ? 'multimodal' : 'text';
}

function normalizeModels(raw: unknown): ModelConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: unknown): ModelConfig | null => {
      if (typeof m === 'string') return { name: m, mode: inferModelMode(m) };
      if (typeof m === 'object' && m !== null && typeof (m as Record<string, unknown>).name === 'string') {
        const o = m as Record<string, unknown>;
        const name = o.name as string;
        const rawMode = o.mode;
        return {
          name,
          contextLimit: typeof o.contextLimit === 'number' ? o.contextLimit : undefined,
          maxTokens: typeof o.maxTokens === 'number' ? o.maxTokens : undefined,
          mode: rawMode === 'text' || rawMode === 'multimodal' ? rawMode : inferModelMode(name),
        };
      }
      return null;
    })
    .filter((m): m is ModelConfig => m !== null);
}

function stripRemovedConfigKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...raw };
  delete cleaned.vision;
  return cleaned;
}

export function getConfig(): AppConfigData {
  return config;
}

export function setConfig(partial: Partial<AppConfigData>): void {
  config = { ...config, ...partial };
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

/** All model names across all providers (flat list for dropdown). */
export function getAllModelNames(): string[] {
  return config.providers.flatMap(p => p.models.map(m => m.name));
}

/** Look up per-model config. Falls back to agent-level defaults. */
export function getModelConfig(modelName: string): ModelConfig | undefined {
  for (const p of config.providers) {
    const found = p.models.find(m => m.name === modelName);
    if (found) return found;
  }
  return undefined;
}

export function getActiveProvider(): ProviderConfig {
  return config.providers.find(p => p.id === config.activeProvider) || config.providers[0];
}

export function getAgents(): AgentConfig[] {
  return config.agents;
}

export function saveAgent(agent: AgentConfig): void {
  const idx = config.agents.findIndex(a => a.id === agent.id);
  if (idx >= 0) {
    config.agents[idx] = agent;
  } else {
    config.agents.push(agent);
  }
}

export function deleteAgent(agentId: string): void {
  config.agents = config.agents.filter(a => a.id !== agentId);
}

function migrateLegacy(raw: Record<string, unknown>): AppConfigData {
  const cleanedRaw = stripRemovedConfigKeys(raw);
  if (Array.isArray(raw.providers)) {
    const providers = (raw.providers as Array<Record<string, unknown>>).map(p => ({
      id: p.id as string,
      name: p.name as string,
      baseUrl: p.baseUrl as string,
      apiKey: p.apiKey as string,
      models: normalizeModels(p.models),
    }));
    return {
      ...defaultConfig,
      ...cleanedRaw,
      providers,
      agent: { ...defaultConfig.agent, ...(cleanedRaw.agent as Record<string, unknown> || {}) },
    } as AppConfigData;
  }

  // Migrate from old deepseek/anthropic format
  const providers: ProviderConfig[] = [...DEFAULT_PROVIDERS];
  const ds = raw.deepseek as Record<string, unknown> | undefined;
  const ant = raw.anthropic as Record<string, unknown> | undefined;

  if (ds) {
    const p = providers.find(x => x.id === 'deepseek')!;
    if (typeof ds.baseUrl === 'string') p.baseUrl = ds.baseUrl;
    if (typeof ds.apiKey === 'string') p.apiKey = ds.apiKey;
    if (Array.isArray(ds.models)) p.models = normalizeModels(ds.models);
  }
  if (ant) {
    const p = providers.find(x => x.id === 'anthropic')!;
    if (typeof ant.apiKey === 'string') p.apiKey = ant.apiKey;
    if (Array.isArray(ant.models)) p.models = normalizeModels(ant.models);
  }

  return {
    ...defaultConfig,
    ...cleanedRaw,
    providers,
    activeModel: (cleanedRaw.activeModel as string) || defaultConfig.activeModel,
    agent: { ...defaultConfig.agent, ...(cleanedRaw.agent as Record<string, unknown> || {}) },
    deepseek: undefined,
    anthropic: undefined,
  } as unknown as AppConfigData;
}

export async function loadConfig(): Promise<AppConfigData> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const raw = JSON.parse(data) as Record<string, unknown>;
    config = migrateLegacy(raw);
    config.permissionMode = normalizePermissionMode(config.permissionMode);
    config.agents = normalizeAgents(config.agents);
    for (const p of config.providers) {
      if (p.apiKey) p.apiKey = await decrypt(p.apiKey);
    }
  } catch (err) {
    config = { ...defaultConfig };
    const error = err as NodeJS.ErrnoException | undefined;
    if (error?.code === 'ENOENT') {
      await saveConfig();
    } else {
      console.error('Failed to load config, using in-memory defaults without overwriting disk config:', err);
    }
  }
  return config;
}

export async function saveConfig(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const toSave = { ...config, providers: await Promise.all(config.providers.map(async p => ({
      ...p,
      apiKey: p.apiKey ? await encrypt(p.apiKey) : '',
    }))) };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}
