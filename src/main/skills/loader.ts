import { promises as fs } from 'fs';
import { join, resolve, basename } from 'path';
import { homedir } from 'os';
import { app } from 'electron';
import type { Skill } from './types';

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const normalized = raw.replace(/^﻿/, '');
  if (!normalized.startsWith('---')) {
    return { frontmatter: {}, content: normalized };
  }
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: {}, content: normalized };
  }
  const header = normalized.slice(3, end).trim();
  const content = normalized.slice(end + '\n---'.length).replace(/^\r?\n/, '');
  return { frontmatter: parseYamlish(header), content };
}

function parseYamlish(header: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of header.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sepIdx = trimmed.indexOf(':');
    if (sepIdx === -1) continue;
    const key = trimmed.slice(0, sepIdx).trim();
    const rawValue = trimmed.slice(sepIdx + 1).trim();
    result[key] = parseScalar(rawValue);
  }
  return result;
}

function parseScalar(value: string): unknown {
  const unquoted = value.replace(/^["']|["']$/g, '');
  if (/^(true|false)$/i.test(unquoted)) return /^true$/i.test(unquoted);
  if (unquoted.startsWith('[') && unquoted.endsWith(']')) {
    return unquoted.slice(1, -1).split(',').map(i => i.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return unquoted;
}

function parseStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function extractDescription(content: string): string {
  const paragraph = content.split(/\r?\n\r?\n/).map(p => p.trim()).find(Boolean);
  if (!paragraph) return '';
  return paragraph.replace(/^#+\s*/, '').slice(0, 240);
}

async function loadSingleSkill(skillRoot: string, sourceDir: string): Promise<Skill | null> {
  const skillFile = join(skillRoot, 'SKILL.md');
  if (!(await exists(skillFile))) return null;

  const raw = await fs.readFile(skillFile, 'utf8');
  const { frontmatter, content } = parseFrontmatter(raw);

  const fallbackName = basename(skillRoot);
  const name = (asString(frontmatter.name) || fallbackName).replace(/^\//, '');
  if (!name) return null;

  return {
    name,
    displayName: asString(frontmatter.name),
    description: asString(frontmatter.description) || extractDescription(content) || `Skill loaded from ${skillRoot}`,
    whenToUse: asString(frontmatter.when_to_use ?? frontmatter.whenToUse),
    content: content.trim(),
    rootDir: resolve(skillRoot),
    sourceDir: resolve(sourceDir),
    allowedTools: parseStringList(frontmatter['allowed-tools'] ?? frontmatter.allowedTools),
    argumentHint: asString(frontmatter['argument-hint'] ?? frontmatter.argumentHint),
    argumentNames: parseStringList(frontmatter.arguments),
    model: asString(frontmatter.model),
    context: frontmatter.context === 'fork' ? 'fork' : 'inline',
    agent: asString(frontmatter.agent),
    effort: asString(frontmatter.effort),
    version: asString(frontmatter.version),
    userInvocable: !(frontmatter['user-invocable'] === false || frontmatter.userInvocable === false),
    disableModelInvocation: !!(frontmatter['disable-model-invocation'] === true || frontmatter.disableModelInvocation === true),
  };
}

async function loadSkillsFromPath(sourcePath: string): Promise<Skill[]> {
  const resolvedSource = resolve(sourcePath);
  if (!(await exists(resolvedSource))) return [];

  const stats = await fs.stat(resolvedSource);
  if (!stats.isDirectory()) return [];

  const directSkillFile = join(resolvedSource, 'SKILL.md');
  if (await exists(directSkillFile)) {
    const skill = await loadSingleSkill(resolvedSource, resolvedSource);
    return skill ? [skill] : [];
  }

  const entries = await fs.readdir(resolvedSource, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter(e => e.isDirectory())
      .map(e => loadSingleSkill(join(resolvedSource, e.name), resolvedSource)),
  );
  return results.filter((s): s is Skill => s !== null);
}

let cachedSkills: Skill[] = [];
let skillsLoaded = false;

export function getLoadedSkills(): Skill[] {
  return cachedSkills;
}

export function getSkill(name: string): Skill | undefined {
  const normalized = name.replace(/^\//, '');
  return cachedSkills.find(s => s.name === normalized);
}

function getBuiltInSkillsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'skills');
  }
  // __dirname = dist/main/skills, need ../../.. for project-root/skills
  return join(__dirname, '../../../skills');
}

export async function loadSkills(workspaceRoot?: string): Promise<Skill[]> {
  const dirs: string[] = [];

  // Built-in skills (shipped with the app) — loaded first, project skills override
  dirs.push(getBuiltInSkillsDir());

  // Project skills
  if (workspaceRoot) {
    dirs.push(join(workspaceRoot, '.deepseekcode', 'skills'));
    dirs.push(join(workspaceRoot, 'skills'));
  }

  // User global skills
  dirs.push(join(homedir(), '.deepseekcode', 'skills'));

  const results = await Promise.all(dirs.map(d => loadSkillsFromPath(d)));
  const byName = new Map<string, Skill>();
  for (const skill of results.flat()) {
    byName.set(skill.name, skill);
  }

  cachedSkills = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  skillsLoaded = true;
  return cachedSkills;
}

export function renderSkillForInvocation(skill: Skill, args?: string): string {
  const normalizedRoot = process.platform === 'win32'
    ? skill.rootDir.replace(/\\/g, '/')
    : skill.rootDir;
  const argumentText = (args ?? '').trim();

  let content = skill.content
    .replace(/\$\{CLAUDE_SKILL_DIR\}/g, normalizedRoot)
    .replace(/\$\{CCAGENT_SKILL_DIR\}/g, normalizedRoot)
    .replace(/\$ARGUMENTS/g, argumentText);

  for (const argName of skill.argumentNames ?? []) {
    content = content.replace(new RegExp(`\\$\\{${escapeRegExp(argName)}\\}`, 'g'), argumentText);
  }

  return [
    `Skill: ${skill.name}`,
    `Base directory for this skill: ${skill.rootDir}`,
    skill.argumentHint ? `Argument hint: ${skill.argumentHint}` : '',
    argumentText ? `Arguments: ${argumentText}` : '',
    '',
    content,
  ].filter(line => line !== '').join('\n');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
