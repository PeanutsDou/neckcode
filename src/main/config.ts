import { promises as fs } from 'fs';
import { join } from 'path';
import { encrypt, decrypt } from './config/secrets';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}

export interface AppConfigData {
  providers: ProviderConfig[];
  activeProvider: string;
  activeModel: string;
  agent: {
    maxTurns: number;
    maxTokens: number;
    contextLimit: number;
    workspaceRoot: string;
  };
  systemPrompt: string;
  window?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

const CONFIG_DIR = join(process.cwd(), '.deepseekcode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
  },
];

const defaultConfig: AppConfigData = {
  providers: DEFAULT_PROVIDERS,
  activeProvider: 'deepseek',
  activeModel: 'deepseek-v4-pro',
  agent: {
    maxTurns: 8,
    maxTokens: 32768,
    contextLimit: 0,
    workspaceRoot: process.cwd(),
  },
  systemPrompt: 'You are a helpful coding assistant. Use tools when needed. Be concise and factual.',
};

let config: AppConfigData = { ...defaultConfig };

export function getConfig(): AppConfigData {
  return config;
}

export function setConfig(partial: Partial<AppConfigData>): void {
  config = { ...config, ...partial };
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

function migrateLegacy(raw: Record<string, unknown>): AppConfigData {
  // Already migrated
  if (Array.isArray(raw.providers)) {
    return {
      ...defaultConfig,
      ...raw,
      providers: (raw.providers as ProviderConfig[]).map(p => ({ ...p })),
      agent: { ...defaultConfig.agent, ...(raw.agent as Record<string, unknown> || {}) },
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
    if (Array.isArray(ds.models)) p.models = ds.models as string[];
  }
  if (ant) {
    const p = providers.find(x => x.id === 'anthropic')!;
    if (typeof ant.apiKey === 'string') p.apiKey = ant.apiKey;
    if (Array.isArray(ant.models)) p.models = ant.models as string[];
  }

  return {
    ...defaultConfig,
    ...raw,
    providers,
    activeModel: (raw.activeModel as string) || defaultConfig.activeModel,
    agent: { ...defaultConfig.agent, ...(raw.agent as Record<string, unknown> || {}) },
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
    // Decrypt API keys
    for (const p of config.providers) {
      if (p.apiKey) p.apiKey = await decrypt(p.apiKey);
    }
  } catch {
    config = { ...defaultConfig };
    await saveConfig();
  }
  return config;
}

export async function saveConfig(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    // Encrypt API keys before saving
    const toSave = { ...config, providers: await Promise.all(config.providers.map(async p => ({
      ...p,
      apiKey: p.apiKey ? await encrypt(p.apiKey) : '',
    }))) };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

export function getActiveProvider(): ProviderConfig {
  return config.providers.find(p => p.id === config.activeProvider) || config.providers[0];
}
